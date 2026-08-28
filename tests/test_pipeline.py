"""End-to-end check that the orchestrator streams real stage:ingestion
events off small synthetic CSV/PCAP fixtures, and still falls back to the
placeholder event when no capture is given."""

import asyncio

from scapy.all import IP, TCP, Ether, wrpcap

from src.orchestrator.pipeline import run_pipeline

CSV_HEADER = " Destination Port, Flow Duration, Total Fwd Packets, Total Backward Packets,Total Length of Fwd Packets, Total Length of Bwd Packets,Label"
CSV_ROWS = ["80,1000000,3,2,120,80,BENIGN", "445,2000000,10,10,900,900,PortScan"]


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
