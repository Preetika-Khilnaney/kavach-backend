"""Orchestrator: runs the pipeline stages in order and yields events.

Every stage is wired to real code now:
- ingestion: src.ingestion.flow_parser / packet_parser, one event per batch.
- feature_extraction: src.features.extract, one event per window.
- state_representation / forward_pass / rollout / attack_mapping /
  explainability: src.graph.state_builder + src.models.netjepa +
  src.scoring + src.explainability, also one event per window (see
  _run_model_stages) — each window flows through the whole pipeline
  before the next one starts, matching the architecture doc's per-window
  G_t shape.

Caveat that matters more than the wiring itself: src.orchestrator.model_registry
loads data/processed/netjepa_weights.pt if it exists, else falls back to a
freshly-initialized (untrained, random) model so the pipeline still runs.
Every payload from state_representation onward carries a `trained: bool`
field — check it before treating a prediction as real. It hot-reloads, so
once training finishes, the very next pipeline run picks up real weights
without a server restart.

Simplification worth knowing: this waits for ingestion to fully finish
before windowing/modeling, rather than doing either incrementally as
ingestion batches arrive. A fully streaming version would carry partial-
window state across ingestion batches; that's more machinery than this
stage needs yet, so it isn't done here.
"""

import time
from pathlib import Path
from typing import AsyncGenerator

import asyncio
import pandas as pd
import torch

from src.config import load_config
from src.explainability.shap_explainer import explain_prediction
from src.features import extract
from src.graph.state_builder import build_graph_state
from src.ingestion import flow_parser, packet_parser
from src.models.netjepa import graph_batch_from_state
from src.orchestrator import model_registry
from src.scoring.attack_stage import map_attack_stage
from src.scoring.infiltration import score_infiltration
from src.storage import results_store

_PCAP_SUFFIXES = {".pcap", ".pcapng", ".cap"}

# Default cap on how many packets a *live* pipeline run parses out of a raw
# capture. The captures in this project are 10-13 GB; walking one in full
# on every websocket connection isn't a live-demo shape. Pass max_packets=
# None to run_pipeline for a real offline/batch pass over the whole file.
_DEFAULT_LIVE_PACKET_CAP = 50_000

# Same idea for CSV-derived windows: a single file can produce 100k+
# windows (see _run_feature_extraction_and_model_stages), so cap how many
# go through the full model pipeline live. Pass max_windows=None for a
# real offline/batch pass over every window.
_DEFAULT_LIVE_WINDOW_CAP = 500

# Explainability (Captum IntegratedGradients) does several forward passes
# per call -- too slow to run on every single window of a large capture.
# Only bother explaining windows that actually look interesting; boring
# (low-infiltration-probability) windows get an empty explanation instead
# of paying that cost for nothing.
_EXPLAIN_INFILTRATION_THRESHOLD = 0.3


def _capture_kind(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix == ".csv":
        return "csv"
    if suffix in _PCAP_SUFFIXES:
        return "pcap"
    raise ValueError(f"Unrecognized capture file type: {path!r} (expected .csv or .pcap/.pcapng)")


def _csv_ingestion_batches(path: str):
    """Yields (chunk_df, progress_payload, status) — the chunk itself, so
    the caller can accumulate it for windowing, alongside the same
    progress payload shape as before."""
    total = 0
    for chunk in flow_parser.iter_flow_csv(path):
        n = len(chunk)
        total += n
        if n and "timestamp" in chunk.columns:
            time_range = [chunk["timestamp"].min().isoformat(), chunk["timestamp"].max().isoformat()]
        else:
            time_range = [None, None]
        payload = {"kind": "csv", "source": path, "records_ingested": n, "records_total": total, "time_range": time_range}
        yield chunk, payload, "in_progress"
    yield None, {"kind": "csv", "source": path, "records_ingested": 0, "records_total": total, "time_range": [None, None]}, "complete"


def _pcap_ingestion_batches(path: str, max_packets: int | None):
    """Yields (batch_records, progress_payload, status), mirroring
    _csv_ingestion_batches above."""
    total = 0
    for batch in packet_parser.iter_packets(path, max_packets=max_packets):
        n = len(batch)
        total += n
        timestamps = [r["timestamp"] for r in batch]
        time_range = [
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(min(timestamps))),
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(max(timestamps))),
        ] if timestamps else [None, None]
        payload = {"kind": "pcap", "source": path, "records_ingested": n, "records_total": total, "time_range": time_range}
        yield batch, payload, "in_progress"
    yield None, {"kind": "pcap", "source": path, "records_ingested": 0, "records_total": total, "time_range": [None, None]}, "complete"


async def _run_ingestion(capture_path: str | None, window_id: str, max_packets: int | None):
    """Streams stage:ingestion events and, as a second value per
    iteration, hands back whatever raw data arrived in that batch (a flow
    DataFrame chunk, a list of packet records, or None for the
    placeholder/final events) so run_pipeline can accumulate it for
    feature_extraction without re-reading the file."""
    if capture_path is None:
        yield None, {
            "stage": "ingestion",
            "window_id": window_id,
            "timestamp": time.time(),
            "payload": {"records_ingested": 0, "source": "placeholder"},
            "status": "complete",
        }
        return

    kind = _capture_kind(capture_path)
    batches = _csv_ingestion_batches(capture_path) if kind == "csv" else _pcap_ingestion_batches(capture_path, max_packets)
    for chunk_data, payload, status in batches:
        yield chunk_data, {
            "stage": "ingestion",
            "window_id": window_id,
            "timestamp": time.time(),
            "payload": payload,
            "status": status,
        }
        await asyncio.sleep(0)  # yield to the event loop between batches


def _placeholder_model_stage_events(window_id: str, status: str):
    yield {
        "stage": "state_representation",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"nodes": [], "edges": []},
        "status": status,
    }
    yield {
        "stage": "forward_pass",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"embedding_dim": 0, "trained": False},
        "status": status,
    }
    yield {
        "stage": "rollout",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"k_steps": 0, "trained": False},
        "status": status,
    }
    yield {
        "stage": "attack_mapping",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"infiltration_probability": 0.0, "attack_stage": "none", "trained": False},
        "status": status,
    }
    yield {
        "stage": "explainability",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"top_features": [], "trained": False},
        "status": status,
    }


def _run_model_stages(window: dict, window_id: str, status: str, source_file: str | None = None):
    """state_representation -> forward_pass -> rollout -> attack_mapping ->
    explainability for ONE feature window. See model_registry's docstring
    on the trained/untrained fallback; every payload here carries
    `trained` so a consumer can tell the difference."""
    model, infil_head, stage_clf, trained = model_registry.get_models()
    rollout_steps = load_config().get("model", {}).get("rollout_steps", 5)

    state = build_graph_state(window)
    yield {
        "stage": "state_representation",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"nodes": state["nodes"], "edges": state["edges"]},
        "status": status,
    }

    graph_batch = graph_batch_from_state(state)
    with torch.no_grad():
        _, _, z_context = model([[graph_batch]])
    embedding = z_context[0]
    yield {
        "stage": "forward_pass",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"embedding_dim": embedding.shape[-1], "trained": trained},
        "status": status,
    }

    rollout = model.predictor.rollout(embedding, steps=rollout_steps)
    yield {
        "stage": "rollout",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"k_steps": rollout_steps, "trained": trained},
        "status": status,
    }

    infiltration_curve = score_infiltration(rollout, infil_head)
    stage_prediction = map_attack_stage(embedding, stage_clf)
    infiltration_probability = infiltration_curve[-1] if infiltration_curve else 0.0
    yield {
        "stage": "attack_mapping",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {
            "infiltration_probability": infiltration_probability,
            "infiltration_curve": infiltration_curve,
            "attack_stage": stage_prediction["stage"],
            "confidence": stage_prediction["confidence"],
            "trained": trained,
        },
        "status": status,
    }

    # See _EXPLAIN_INFILTRATION_THRESHOLD: skip the expensive attribution
    # pass for windows that don't look interesting, or before there's a
    # trained model to make it meaningful.
    top_features = []
    if trained and infiltration_probability >= _EXPLAIN_INFILTRATION_THRESHOLD:
        top_features = explain_prediction(model, infil_head, state["feature_vector"], n_features=5)
    yield {
        "stage": "explainability",
        "window_id": window_id,
        "timestamp": time.time(),
        "payload": {"top_features": top_features, "trained": trained},
        "status": status,
    }

    results_store.save_prediction(
        window_id=window_id,
        source_file=source_file,
        window=window,
        state=state,
        infiltration_probability=infiltration_probability,
        attack_stage=stage_prediction["stage"],
        confidence=stage_prediction["confidence"],
        trained=trained,
        top_features=top_features,
    )


async def _run_feature_extraction_and_model_stages(kind: str | None, flow_chunks: list, packet_batches: list, window_id: str, source_file: str | None = None, max_windows: int | None = _DEFAULT_LIVE_WINDOW_CAP):
    window_seconds = load_config().get("windowing", {}).get("window_seconds", 5)

    if kind is None:
        yield {
            "stage": "feature_extraction",
            "window_id": window_id,
            "timestamp": time.time(),
            "payload": {"feature_vector": []},
            "status": "complete",
        }
        for event in _placeholder_model_stage_events(window_id, "complete"):
            yield event
        return

    flow_df = pd.concat(flow_chunks, ignore_index=True) if flow_chunks else None
    packet_records = packet_batches if packet_batches else None

    windows = list(extract.iter_feature_windows(flow_df=flow_df, packet_records=packet_records, window_seconds=window_seconds))
    # Same shape as _DEFAULT_LIVE_PACKET_CAP for the PCAP path: a CSV's
    # time-based windowing can produce 100k+ windows on a single file (see
    # flow_parser's synthesized-timestamp caveat -- it inflates elapsed
    # time on unanchored days), and running every one through the full
    # model pipeline (graph build + forward pass + rollout + scoring +
    # explainability + a DB write) live isn't a live-demo shape either.
    if max_windows is not None and len(windows) > max_windows:
        windows = windows[:max_windows]
    if not windows:
        yield {
            "stage": "feature_extraction",
            "window_id": window_id,
            "timestamp": time.time(),
            "payload": {"feature_vector": [], "reason": "not enough records to fill a window"},
            "status": "complete",
        }
        for event in _placeholder_model_stage_events(window_id, "complete"):
            yield event
        return

    for i, window in enumerate(windows):
        status = "in_progress" if i < len(windows) - 1 else "complete"
        w_id = str(window.get("window_id", window_id))

        yield {
            "stage": "feature_extraction",
            "window_id": w_id,
            "timestamp": time.time(),
            "payload": {"feature_vector": window, "window_index": i, "window_count": len(windows)},
            "status": status,
        }
        await asyncio.sleep(0)

        for event in _run_model_stages(window, w_id, status, source_file=source_file):
            yield event
            await asyncio.sleep(0)


async def run_pipeline(
    capture_path: str | None = None,
    max_packets: int | None = _DEFAULT_LIVE_PACKET_CAP,
    max_windows: int | None = _DEFAULT_LIVE_WINDOW_CAP,
) -> AsyncGenerator[dict, None]:
    window_id = "w0"
    source_file = Path(capture_path).name if capture_path is not None else None

    kind = _capture_kind(capture_path) if capture_path is not None else None
    flow_chunks: list = []
    packet_batches: list = []

    async for chunk_data, event in _run_ingestion(capture_path, window_id, max_packets):
        yield event
        if chunk_data is not None:
            if kind == "csv":
                flow_chunks.append(chunk_data)
            elif kind == "pcap":
                packet_batches.extend(chunk_data)

    async for event in _run_feature_extraction_and_model_stages(kind, flow_chunks, packet_batches, window_id, source_file=source_file, max_windows=max_windows):
        yield event
