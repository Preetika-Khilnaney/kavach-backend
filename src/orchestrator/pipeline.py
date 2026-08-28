"""Orchestrator: runs the pipeline stages in order and yields events.

The ingestion stage is wired to the real parsers (src.ingestion.flow_parser
for MachineLearningCVE CSVs, src.ingestion.packet_parser for PCAP/PCAPNG)
and streams a stage:ingestion event per batch, per the architecture doc.
Every stage after ingestion still emits placeholder events with fake
payloads so the API and frontend can be built/tested before the rest of
the pipeline (feature extraction -> world model -> scoring -> explain) is
implemented. Swap each remaining placeholder block for its real stage call
(see TODOs) without changing the event schema or the API layer.
"""

import time
from pathlib import Path
from typing import AsyncGenerator

import asyncio

from src.ingestion import flow_parser, packet_parser

_PCAP_SUFFIXES = {".pcap", ".pcapng", ".cap"}

# Default cap on how many packets a *live* pipeline run parses out of a raw
# capture. The captures in this project are 10-13 GB; walking one in full
# on every websocket connection isn't a live-demo shape. Pass max_packets=
# None to run_pipeline for a real offline/batch pass over the whole file.
_DEFAULT_LIVE_PACKET_CAP = 50_000


def _capture_kind(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix == ".csv":
        return "csv"
    if suffix in _PCAP_SUFFIXES:
        return "pcap"
    raise ValueError(f"Unrecognized capture file type: {path!r} (expected .csv or .pcap/.pcapng)")


def _csv_ingestion_batches(path: str):
    total = 0
    for chunk in flow_parser.iter_flow_csv(path):
        n = len(chunk)
        total += n
        if n and "timestamp" in chunk.columns:
            time_range = [chunk["timestamp"].min().isoformat(), chunk["timestamp"].max().isoformat()]
        else:
            time_range = [None, None]
        yield {
            "kind": "csv",
            "source": path,
            "records_ingested": n,
            "records_total": total,
            "time_range": time_range,
        }, "in_progress"
    yield {"kind": "csv", "source": path, "records_ingested": 0, "records_total": total, "time_range": [None, None]}, "complete"


def _pcap_ingestion_batches(path: str, max_packets: int | None):
    total = 0
    for batch in packet_parser.iter_packets(path, max_packets=max_packets):
        n = len(batch)
        total += n
        timestamps = [r["timestamp"] for r in batch]
        time_range = [
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(min(timestamps))),
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(max(timestamps))),
        ] if timestamps else [None, None]
        yield {
            "kind": "pcap",
            "source": path,
            "records_ingested": n,
            "records_total": total,
            "time_range": time_range,
        }, "in_progress"
    yield {"kind": "pcap", "source": path, "records_ingested": 0, "records_total": total, "time_range": [None, None]}, "complete"


async def _run_ingestion(capture_path: str | None, window_id: str, max_packets: int | None):
    if capture_path is None:
        yield {
            "stage": "ingestion",
            "window_id": window_id,
            "timestamp": time.time(),
            "payload": {"records_ingested": 0, "source": "placeholder"},
            "status": "complete",
        }
        return

    kind = _capture_kind(capture_path)
    batches = _csv_ingestion_batches(capture_path) if kind == "csv" else _pcap_ingestion_batches(capture_path, max_packets)
    for payload, status in batches:
        yield {
            "stage": "ingestion",
            "window_id": window_id,
            "timestamp": time.time(),
            "payload": payload,
            "status": status,
        }
        await asyncio.sleep(0)  # yield to the event loop between batches


async def run_pipeline(
    capture_path: str | None = None,
    max_packets: int | None = _DEFAULT_LIVE_PACKET_CAP,
) -> AsyncGenerator[dict, None]:
    window_id = "w0"
    timestamp = time.time()

    async for event in _run_ingestion(capture_path, window_id, max_packets):
        yield event

    # TODO: replace with src.features.extract
    yield {
        "stage": "feature_extraction",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"feature_vector": []},
        "status": "complete",
    }

    # TODO: replace with src.graph.state_builder
    yield {
        "stage": "state_representation",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"nodes": [], "edges": []},
        "status": "complete",
    }

    # TODO: replace with NetJEPA forward pass (src.models.netjepa)
    yield {
        "stage": "forward_pass",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"embedding_dim": 128},
        "status": "complete",
    }

    # TODO: replace with predictor.rollout(...)
    yield {
        "stage": "rollout",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"k_steps": 5},
        "status": "complete",
    }

    # TODO: replace with src.scoring.infiltration / attack_stage
    yield {
        "stage": "attack_mapping",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"infiltration_probability": 0.0, "attack_stage": "none"},
        "status": "complete",
    }

    # TODO: replace with src.explainability.shap_explainer
    yield {
        "stage": "explainability",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"top_features": []},
        "status": "complete",
    }
