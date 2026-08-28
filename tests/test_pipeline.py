"""End-to-end check that the orchestrator streams real stage:ingestion
events off small synthetic CSV/PCAP fixtures, and still falls back to the
placeholder event when no capture is given."""

import asyncio

import pytest
import torch
from scapy.all import IP, TCP, Ether, wrpcap

from src.orchestrator import model_registry
from src.orchestrator.pipeline import run_pipeline
from src.storage import results_store

CSV_HEADER = " Destination Port, Flow Duration, Total Fwd Packets, Total Backward Packets,Total Length of Fwd Packets, Total Length of Bwd Packets,Label"
CSV_ROWS = ["80,1000000,3,2,120,80,BENIGN", "445,2000000,10,10,900,900,PortScan"]


@pytest.fixture(autouse=True)
def _isolated_model_registry(tmp_path, monkeypatch):
    """Every test in this file gets its own model_registry cache pointed
    at a checkpoint that doesn't exist, by default -- without this, tests
    that don't care about the model stages at all (ingestion, feature
    extraction) silently pick up whatever REAL checkpoint happens to be
    on disk, which breaks the moment that checkpoint's shape changes (as
    happened here: CANONICAL_FEATURE_NAMES dropped a field, and these
    tests started failing on an unrelated size-mismatch error). Tests
    that specifically want a real or fake checkpoint monkeypatch
    CHECKPOINT_PATH again themselves, after this fixture runs."""
    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", tmp_path / "no_such_checkpoint.pt")
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)


@pytest.fixture(autouse=True)
def _isolated_results_store(tmp_path, monkeypatch):
    """Every test gets its own results.db -- without this, every pipeline
    run in this file writes real rows into data/processed/results.db."""
    monkeypatch.setattr(results_store, "DB_PATH", tmp_path / "test_results.db")


def _drain(coro_gen):
    async def _collect():
        return [event async for event in coro_gen]

    return asyncio.run(_collect())


def test_run_pipeline_placeholder_when_no_capture():
    events = _drain(run_pipeline())
    stages = [e["stage"] for e in events]
    assert stages == [
        "ingestion",
        "feature_extraction",
        "state_representation",
        "forward_pass",
        "rollout",
        "attack_mapping",
        "explainability",
    ]
    assert events[0]["payload"]["source"] == "placeholder"


def test_run_pipeline_streams_real_csv_ingestion(tmp_path):
    csv_path = tmp_path / "Monday-WorkingHours.pcap_ISCX.csv"
    csv_path.write_text(CSV_HEADER + "\n" + "\n".join(CSV_ROWS) + "\n")

    events = _drain(run_pipeline(capture_path=str(csv_path)))
    ingestion_events = [e for e in events if e["stage"] == "ingestion"]

    assert len(ingestion_events) == 2  # one in_progress batch + one complete
    assert ingestion_events[0]["status"] == "in_progress"
    assert ingestion_events[0]["payload"]["records_ingested"] == 2
    assert ingestion_events[-1]["status"] == "complete"
    assert ingestion_events[-1]["payload"]["records_total"] == 2
    # downstream placeholder stages still run unchanged
    assert events[-1]["stage"] == "explainability"


def test_run_pipeline_caps_windows_processed_through_model_stages(tmp_path):
    # 5 rows, each 6s long -- lands in 5 distinct 5-second windows.
    # With max_windows=1, only the first should get real
    # state_representation/forward_pass/etc, even though feature_extraction
    # alone would produce more.
    csv_path = tmp_path / "Monday-WorkingHours.pcap_ISCX.csv"
    rows = "\n".join([f"{80+i},6000000,1,1,10,10,BENIGN" for i in range(5)])
    csv_path.write_text(CSV_HEADER + "\n" + rows + "\n")

    uncapped = _drain(run_pipeline(capture_path=str(csv_path), max_windows=None))
    assert len([e for e in uncapped if e["stage"] == "feature_extraction"]) == 5  # sanity: 5 distinct windows exist

    events = _drain(run_pipeline(capture_path=str(csv_path), max_windows=1))
    fe_events = [e for e in events if e["stage"] == "feature_extraction"]
    sr_events = [e for e in events if e["stage"] == "state_representation"]

    assert len(fe_events) == 1  # capped before windowing even reports more
    assert len(sr_events) == 1
    assert fe_events[-1]["status"] == "complete"


def test_run_pipeline_streams_real_feature_extraction_from_csv(tmp_path):
    csv_path = tmp_path / "Monday-WorkingHours.pcap_ISCX.csv"
    csv_path.write_text(CSV_HEADER + "\n" + "\n".join(CSV_ROWS) + "\n")

    events = _drain(run_pipeline(capture_path=str(csv_path)))
    fe_events = [e for e in events if e["stage"] == "feature_extraction"]

    assert len(fe_events) >= 1
    assert fe_events[-1]["status"] == "complete"
    vector = fe_events[0]["payload"]["feature_vector"]
    assert vector != []
    assert vector["flow_count"] == 2  # both rows land in the same 5s window
    # ingestion must fully finish before feature_extraction starts
    ingestion_idx = max(i for i, e in enumerate(events) if e["stage"] == "ingestion")
    fe_idx = min(i for i, e in enumerate(events) if e["stage"] == "feature_extraction")
    assert ingestion_idx < fe_idx


def test_run_pipeline_feature_extraction_placeholder_when_no_capture():
    events = _drain(run_pipeline())
    fe_events = [e for e in events if e["stage"] == "feature_extraction"]
    assert len(fe_events) == 1
    assert fe_events[0]["payload"] == {"feature_vector": []}
    assert fe_events[0]["status"] == "complete"


def test_run_pipeline_model_stages_run_untrained_by_default(tmp_path, monkeypatch):
    # Point the model registry at a checkpoint that doesn't exist, so this
    # test doesn't depend on whether src/training/train.py has produced
    # one yet.
    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", tmp_path / "no_such_checkpoint.pt")
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)

    csv_path = tmp_path / "Monday-WorkingHours.pcap_ISCX.csv"
    csv_path.write_text(CSV_HEADER + "\n" + "\n".join(CSV_ROWS) + "\n")

    events = _drain(run_pipeline(capture_path=str(csv_path)))
    stages_seen = {e["stage"] for e in events}
    assert stages_seen == {
        "ingestion", "feature_extraction", "state_representation",
        "forward_pass", "rollout", "attack_mapping", "explainability",
    }

    forward_pass = next(e for e in events if e["stage"] == "forward_pass")
    attack_mapping = next(e for e in events if e["stage"] == "attack_mapping")
    explainability = next(e for e in events if e["stage"] == "explainability")

    assert forward_pass["payload"]["trained"] is False
    assert attack_mapping["payload"]["attack_stage"] in {
        "Benign", "Reconnaissance", "Initial Access", "Lateral Movement", "Command and Control", "Exfiltration",
    }
    # untrained -> explainability is always skipped regardless of score (see _EXPLAIN_INFILTRATION_THRESHOLD)
    assert explainability["payload"]["top_features"] == []
    assert explainability["payload"]["trained"] is False


def test_run_pipeline_model_stages_use_checkpoint_when_present(tmp_path, monkeypatch):
    from src.graph.state_builder import CANONICAL_FEATURE_NAMES
    from src.models.netjepa import NetJEPA
    from src.scoring.attack_stage import ATTACKStageClassifier
    from src.scoring.infiltration import InfiltrationHead

    checkpoint_path = tmp_path / "netjepa_weights.pt"
    feature_dim = len(CANONICAL_FEATURE_NAMES)
    model = NetJEPA(feature_dim=feature_dim, embedding_dim=8, predictor_hidden_dim=16)
    infil_head = InfiltrationHead(embedding_dim=8)
    stage_clf = ATTACKStageClassifier(embedding_dim=8)
    torch.save({
        "model": model.state_dict(),
        "infil_head": infil_head.state_dict(),
        "stage_clf": stage_clf.state_dict(),
        "embedding_dim": 8,
        "predictor_hidden_dim": 16,
    }, checkpoint_path)

    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", checkpoint_path)
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)

    csv_path = tmp_path / "Monday-WorkingHours.pcap_ISCX.csv"
    csv_path.write_text(CSV_HEADER + "\n" + "\n".join(CSV_ROWS) + "\n")

    events = _drain(run_pipeline(capture_path=str(csv_path)))
    forward_pass = next(e for e in events if e["stage"] == "forward_pass")
    assert forward_pass["payload"]["trained"] is True
    assert forward_pass["payload"]["embedding_dim"] == 8


def test_run_pipeline_streams_real_pcap_ingestion(tmp_path):
    pcap_path = tmp_path / "sample.pcap"
    packets = [Ether() / IP(src="10.0.0.1", dst="10.0.0.2") / TCP(sport=1234, dport=80, seq=i) for i in range(3)]
    for i, pkt in enumerate(packets):
        pkt.time = 1000.0 + i
    wrpcap(str(pcap_path), packets)

    events = _drain(run_pipeline(capture_path=str(pcap_path), max_packets=None))
    ingestion_events = [e for e in events if e["stage"] == "ingestion"]

    assert ingestion_events[-1]["status"] == "complete"
    assert ingestion_events[-1]["payload"]["records_total"] == 3
    assert ingestion_events[0]["payload"]["kind"] == "pcap"
