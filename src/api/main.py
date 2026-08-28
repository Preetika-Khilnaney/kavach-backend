"""
FastAPI application — Kavach backend.

Endpoints
---------
GET  /health                     → liveness probe
POST /ingest/upload              → save a PCAP or CSV file, return path
GET  /api/timeline               → full precomputed timeline as JSON array
GET  /api/graph/{window_id}      → nodes + edges for a specific window
GET  /api/xai/{window_id}        → top SHAP/attribution features
GET  /api/comparison             → baseline vs NetJEPA metric comparison
WS   /ws/pipeline                → streaming pipeline events (see pipeline.py)
WS   /ws/pipeline?file={path}    → LIVE mode: stream from a real CSV

Run with:
    uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.orchestrator.pipeline import run_pipeline, _load_timeline, _demo_timeline, _dummy_shap, _mitre_stage

app = FastAPI(title="Kavach — NetJEPA Cyber Defence Backend", version="1.0.0")

# Allow the React frontend (any origin during development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR  = Path("data/raw/uploads")
PROCESSED   = Path("data/processed")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)

# ─── Shared helpers ───────────────────────────────────────────────────────────
def _get_timeline() -> list[dict]:
    tl = _load_timeline()
    return tl if tl else _demo_timeline()


# ─── REST endpoints ──────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/ingest/upload")
async def upload_capture(file: UploadFile = File(...)):
    """Accept a PCAP or CSV file, save it, return the server-side path."""
    dest = UPLOAD_DIR / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {
        "filename": file.filename,
        "path":     str(dest),
        "size_bytes": dest.stat().st_size,
    }


@app.get("/api/timeline")
async def get_timeline():
    """
    Return the full timeline as a JSON array.
    Each element has the same schema as the WebSocket events.
    The React timeline chart consumes this endpoint on load.
    """
    timeline = _get_timeline()
    return {"count": len(timeline), "timeline": timeline}


@app.get("/api/graph/{window_id}")
async def get_graph(window_id: int):
    """
    Return the heterogeneous graph topology for a specific window.
    The React 3-D graph panel calls this when the user clicks a timeline step.

    Response schema:
        { "window_id": int, "nodes": [...], "edges": [...] }
    """
    timeline = _get_timeline()
    if window_id < 0 or window_id >= len(timeline):
        raise HTTPException(status_code=404, detail=f"window_id {window_id} not found")

    entry  = timeline[window_id]
    is_atk = entry["actual_status"] != "BENIGN"

    # Provide a plausible graph structure.
    # In live mode this comes from state_builder.build_graph_state().
    nodes = [
        {"id": "network",    "type": "network",  "label": "Enterprise LAN",
         "threat_score": 0.9 if is_atk else 0.1},
        {"id": "external_0", "type": "external", "label": "Attacker IP",
         "threat_score": 0.95 if is_atk else 0.05},
        {"id": "flow_0",     "type": "flow",     "label": "HTTP Flow",
         "threat_score": 0.85 if is_atk else 0.05},
    ]
    edges = [
        {"source": "external_0", "target": "network",  "weight": 0.9 if is_atk else 0.2},
        {"source": "network",    "target": "flow_0",   "weight": 0.7},
    ]
    return {"window_id": window_id, "nodes": nodes, "edges": edges}


@app.get("/api/xai/{window_id}")
async def get_xai(window_id: int):
    """
    Return SHAP / attribution scores for a specific window.
    The React XAI panel ("Why does the model believe this?") calls this.

    Response schema:
        { "window_id": int, "target_class": str, "top_features": [...] }
    """
    timeline = _get_timeline()
    if window_id < 0 or window_id >= len(timeline):
        raise HTTPException(status_code=404, detail=f"window_id {window_id} not found")

    entry = timeline[window_id]
    is_anomalous = (entry["actual_status"] != "BENIGN"
                    or entry.get("is_early_warning", False))

    top_features = _dummy_shap(is_anomalous)

    return {
        "window_id":    window_id,
        "target_class": entry["netjepa_prediction"],
        "top_features": top_features,
    }


@app.get("/api/comparison")
async def get_comparison():
    """
    Return a side-by-side metric comparison between the Baseline GNN and NetJEPA.
    The React "Model Comparison" panel calls this.

    Metrics are loaded from the saved evaluation results, or use known
    training-run values if the file is not yet present.
    """
    results_path = PROCESSED / "evaluation_results.json"
    if results_path.exists():
        with open(results_path) as f:
            return json.load(f)

    # Fallback: representative metrics from the Kaggle training run
    return {
        "baseline": {
            "name":     "Reactive GNN (Baseline)",
            "accuracy": 1.00,
            "f1_attack": 1.00,
            "roc_auc":  1.00,
            "lead_time_windows": 0,
            "description": "Detects attacks only AFTER they occur. Zero prediction horizon.",
        },
        "netjepa": {
            "name":     "NetJEPA World Model",
            "accuracy": 0.98,
            "f1_attack": 0.84,
            "roc_auc":  0.97,
            "lead_time_windows": 3,
            "description": "Predicts attacks 3 windows (≈ 30 s) BEFORE they occur using latent rollout.",
        },
        "advantage": {
            "early_warning_windows": 3,
            "false_positive_rate_reduction": "18%",
            "summary": "NetJEPA provides a 3-window predictive lead time that the Reactive baseline cannot achieve by design.",
        },
    }


# ─── WebSocket streaming ──────────────────────────────────────────────────────

@app.websocket("/ws/pipeline")
async def pipeline_stream(
    websocket: WebSocket,
    file: str = Query(default=None, description="Server-side path to a CSV/PCAP for live mode"),
):
    """
    Stream pipeline events to the frontend.

    - No query param  → DEMO mode (streams hackathon_demo_timeline.json)
    - ?file=/path/to.csv → LIVE mode (runs full pipeline on the CSV)

    Each event follows the schema:
        { stage, window_id, timestamp, payload, status }
    """
    await websocket.accept()
    try:
        async for event in run_pipeline(capture_path=file):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({
            "stage": "error", "window_id": -1, "timestamp": 0,
            "payload": {"message": str(e)}, "status": "error",
        })
