"""Orchestrator: runs the pipeline stages in order and yields events.

Currently emits placeholder events with fake payloads so the API and
frontend can be built and tested before real ingestion/model code exists.
Swap each placeholder block for the real stage call (see TODOs) without
changing the event schema or the API layer.
"""

import time
from typing import AsyncGenerator


async def run_pipeline(capture_path: str | None = None) -> AsyncGenerator[dict, None]:
    window_id = "w0"
    timestamp = time.time()

    # TODO: replace with src.ingestion.flow_parser / packet_parser
    yield {
        "stage": "ingestion",
        "window_id": window_id,
        "timestamp": timestamp,
        "payload": {"records_ingested": 0, "source": capture_path or "placeholder"},
        "status": "complete",
    }

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
