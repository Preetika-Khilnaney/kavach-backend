"""FastAPI app: REST upload endpoint + WebSocket pipeline event stream.

Run with: uvicorn src.api.main:app --reload
"""

import asyncio
import shutil
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect

from src.orchestrator.pipeline import run_pipeline

app = FastAPI(title="Kavach backend")

UPLOAD_DIR = Path("data/raw/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ingest/upload")
async def upload_capture(file: UploadFile = File(...)):
    """Accepts a PCAP or CSV file and saves it for pipeline processing."""
    dest = UPLOAD_DIR / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": file.filename, "path": str(dest)}


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
