"""Results store (architecture doc): persists predictions, attack-stage
mappings, and explainability outputs so the frontend has something to
query beyond a single live event stream that fires once and disappears --
backs the Operations dashboard, Flows list, and Alerts views.

SQLite on local disk, per the architecture doc's own suggestion ("local
filesystem + SQLite/DuckDB is sufficient given the fully offline
requirement") -- stdlib only, no new dependency, persists across server
restarts (unlike the in-memory JOBS dict in src/api/main.py).

One row per feature window processed by the pipeline (src/orchestrator/pipeline.py
calls save_prediction after computing attack_mapping + explainability for
each window) -- not one row per raw flow. A "window" here is what the
frontend's Flow list ends up displaying; see the API layer for how the
field names get adapted (there's no real per-flow src/dst IP for
CSV-derived windows -- same caveat as everywhere else in this project).
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path("data/processed/results.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    window_id TEXT NOT NULL,
    source_file TEXT,
    created_at REAL NOT NULL,
    flow_count INTEGER,
    packet_count INTEGER,
    infiltration_probability REAL,
    attack_stage TEXT,
    confidence REAL,
    trained INTEGER,
    label TEXT,
    top_features_json TEXT,
    nodes_json TEXT,
    edges_json TEXT,
    window_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at);
CREATE INDEX IF NOT EXISTS idx_predictions_infiltration ON predictions(infiltration_probability);
"""


def _json_default(obj):
    """Window dicts can carry numpy scalar types (from pandas aggregation
    in src/features/extract.py) that json.dumps doesn't know how to
    serialize natively -- coerce anything with a numpy-style .item() to a
    plain Python scalar, and tuples (e.g. packet_edges) to lists."""
    if hasattr(obj, "item"):
        return obj.item()
    if isinstance(obj, (set, tuple)):
        return list(obj)
    return str(obj)


def _dumps(value) -> str:
    return json.dumps(value, default=_json_default)


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def save_prediction(
    window_id: str,
    source_file: str | None,
    window: dict,
    state: dict,
    infiltration_probability: float,
    attack_stage: str,
    confidence: float,
    trained: bool,
    top_features: list,
) -> None:
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO predictions (window_id, source_file, created_at, flow_count, packet_count, "
            "infiltration_probability, attack_stage, confidence, trained, label, top_features_json, nodes_json, edges_json, window_json) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                window_id,
                source_file,
                time.time(),
                window.get("flow_count"),
                window.get("packet_count"),
                infiltration_probability,
                attack_stage,
                confidence,
                int(trained),
                window.get("flow_dominant_label"),
                _dumps(top_features),
                _dumps(state.get("nodes", [])),
                _dumps(state.get("edges", [])),
                _dumps(window),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["top_features"] = json.loads(d.pop("top_features_json") or "[]")
    d["nodes"] = json.loads(d.pop("nodes_json") or "[]")
    d["edges"] = json.loads(d.pop("edges_json") or "[]")
    d["window"] = json.loads(d.pop("window_json") or "{}")
    d["trained"] = bool(d["trained"])
    return d


def recent_predictions(limit: int = 100) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM predictions ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_prediction(window_id: str) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM predictions WHERE window_id = ? ORDER BY created_at DESC LIMIT 1", (window_id,)).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def alerts(min_probability: float = 0.5, limit: int = 100) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM predictions WHERE infiltration_probability >= ? ORDER BY created_at DESC LIMIT ?",
            (min_probability, limit),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def summary_stats() -> dict:
    """Aggregate stats for the Operations dashboard: latest prediction
    (current risk score / active stage), per-stage counts (kill chain
    tracker), total predictions stored."""
    conn = _connect()
    try:
        total = conn.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()["n"]
        latest_row = conn.execute("SELECT * FROM predictions ORDER BY created_at DESC LIMIT 1").fetchone()
        stage_rows = conn.execute("SELECT attack_stage, COUNT(*) AS n FROM predictions GROUP BY attack_stage").fetchall()
        return {
            "total_predictions": total,
            "latest": _row_to_dict(latest_row) if latest_row else None,
            "stage_counts": {r["attack_stage"]: r["n"] for r in stage_rows},
        }
    finally:
        conn.close()


def clear() -> None:
    """Wipes all stored predictions. Mainly for tests."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM predictions")
        conn.commit()
    finally:
        conn.close()
