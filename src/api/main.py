"""FastAPI app: REST upload + job-progress endpoints, plus a WebSocket
pipeline event stream.

Run with: uvicorn src.api.main:app --reload

Two ways the frontend can watch a pipeline run, both driven by the same
src.orchestrator.run_pipeline:
- POST /ingest/upload then poll GET /jobs/{job_id}/progress — what
  frontend/src/pages/Ingest.tsx uses (see frontend/src/api/index.ts).
- WebSocket /ws/pipeline?capture_path=... — the raw per-stage event stream
  from the architecture doc, for the future Model Internals view.
"""

import asyncio
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.orchestrator.pipeline import run_pipeline

app = FastAPI(title="Kavach backend")

# The frontend (Vite) dev server runs on a different origin than this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("data/raw/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Background ingestion jobs: backs the poll-based frontend contract
# (uploadFile -> {job_id}, then GET /jobs/{job_id}/progress -> JobProgress).
# In-memory only — fine for a single-process local demo, not for prod.
# ---------------------------------------------------------------------------

_STAGE_ORDER = [
    "ingestion",
    "feature_extraction",
    "state_representation",
    "forward_pass",
    "rollout",
    "attack_mapping",
    "explainability",
]
_STAGE_LABELS = {
    "ingestion": "Ingestion",
    "feature_extraction": "Feature Extraction",
    "state_representation": "State Building",
    "forward_pass": "Forecasting",
    "rollout": "Forecasting",
    "attack_mapping": "Attack Mapping",
    "explainability": "Explainability",
}
# Heuristic only: ingestion is the one stage with real, unpredictable-length
# work, so there's no exact total to divide by. Every stage after it is
# still a placeholder that completes instantly (see pipeline.py TODOs), so
# this cap only matters for how the progress bar moves during ingestion.
_INGESTION_BATCH_CAP = 30

JOBS: dict[str, dict] = {}
_background_tasks: set[asyncio.Task] = set()


def _stage_percent(stage: str, status: str, batches_seen: int) -> int:
    idx = _STAGE_ORDER.index(stage)
    if stage == "ingestion" and status == "in_progress":
        frac = min(0.95, batches_seen / _INGESTION_BATCH_CAP)
    elif status == "complete":
        frac = 1.0
    else:
        frac = 0.5
    return min(100, round((idx + frac) / len(_STAGE_ORDER) * 100))


async def _run_ingestion_job(job_id: str, capture_path: str) -> None:
    job = JOBS[job_id]
    batches_seen = 0
    try:
        async for event in run_pipeline(capture_path=capture_path):
            if event["stage"] == "ingestion" and event["status"] == "in_progress":
                batches_seen += 1
            job["stage"] = _STAGE_LABELS.get(event["stage"], event["stage"])
            job["percent"] = _stage_percent(event["stage"], event["status"], batches_seen)
            job["last_event"] = event
        job["complete"] = True
        job["percent"] = 100
    except Exception as exc:  # surface to the frontend instead of hanging the poll forever
        job["error"] = str(exc)
        job["complete"] = True


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ingest/upload")
async def upload_capture(file: UploadFile = File(...)):
    """Accepts a PCAP/PCAPNG or CSV file, saves it, and starts a background
    job running the real ingestion stage (plus the still-placeholder stages
    after it) over the upload. Poll GET /jobs/{job_id}/progress for status."""
    dest = UPLOAD_DIR / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"stage": "Ingestion", "percent": 0, "complete": False, "error": None, "last_event": None}
    task = asyncio.create_task(_run_ingestion_job(job_id, str(dest)))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return {"job_id": job_id, "filename": file.filename, "path": str(dest)}


@app.get("/jobs/{job_id}/progress")
async def job_progress(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job_id {job_id!r}")
    return {"stage": job["stage"], "percent": job["percent"], "complete": job["complete"]}


@app.websocket("/ws/pipeline")
async def pipeline_stream(websocket: WebSocket, capture_path: str | None = None):
    """Streams pipeline stage events as the orchestrator runs, matching the
    event schema from the backend architecture doc:
        {"stage": ..., "window_id": ..., "timestamp": ..., "payload": ..., "status": ...}

    Pass `capture_path` (the `path` returned by POST /ingest/upload) as a
    query param, e.g. `ws://localhost:8000/ws/pipeline?capture_path=data/raw/uploads/foo.csv`,
    to run ingestion over that file. Omit it to run the placeholder demo
    stream. Ingestion is real for both .csv (flow_parser) and .pcap/.pcapng
    (packet_parser); every stage after it is still placeholder data (see
    src/orchestrator/pipeline.py) so the frontend's Model Internals view can
    be built against a real event stream before the rest of the pipeline
    exists.
    """
    await websocket.accept()
    try:
        async for event in run_pipeline(capture_path=capture_path):
            await websocket.send_json(event)
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
