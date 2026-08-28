"""Adapts src.storage.results_store rows into the shapes the frontend's
TypeScript types expect (frontend/src/api/types.ts) -- Flow, Alert,
KillChainStage, RiskScoreResponse.

Read before trusting every field: a stored row is one WINDOW (an
aggregate over ~100 rows or a time slice — see src/features/extract.py),
not a literal single network flow, and MachineLearningCVE CSV windows
carry no real src/dst IP, port, or protocol (see flow_parser's module
docstring — this is a property of the dataset, not something we chose not
to build). Fields we have real data for (risk score, attack stage,
top features, timestamp, host IPs when a PCAP-derived window has them)
are real. Fields we don't (ports, protocol, a specific byte count) get an
honest placeholder (0, "TCP" as a default given the dataset is
TCP-dominated) rather than a fabricated realistic-looking number.
"""

from __future__ import annotations

from datetime import datetime, timezone

from src.scoring.attack_stage import STAGE_META, STAGE_NAMES

_STAGE_TACTIC = {m["stage"]: m["tactic"] for m in STAGE_META}


def _risk_level(score: int) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 30:
        return "medium"
    return "low"


def _severity(score: int) -> str:
    if score >= 70:
        return "critical"
    if score >= 40:
        return "warning"
    return "info"


def _iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat()


def row_to_flow(row: dict) -> dict:
    window = row.get("window") or {}
    host_nodes = [n for n in row.get("nodes", []) if n.get("type") == "host"]
    src_ip = host_nodes[0]["label"] if host_nodes else "N/A"
    dst_ip = host_nodes[1]["label"] if len(host_nodes) > 1 else src_ip

    risk_score = round(row["infiltration_probability"] * 100)
    return {
        "id": row["window_id"],
        "srcIP": src_ip,
        "dstIP": dst_ip,
        "srcPort": 0,  # not available -- see module docstring
        "dstPort": 0,
        "protocol": "TCP",  # default; this dataset is TCP-dominated, no real per-window protocol available
        "flags": "",
        # window's numeric fields are z-score normalized (that's what the
        # model was trained on -- can't switch this to raw values without
        # breaking inference, since train/serve normalization must match).
        # A normalized value labelled "bytes"/"seconds" in the UI would
        # read as a real (nonsensical, sometimes negative) measurement, so
        # these stay 0 rather than display something misleading.
        "bytes": 0,
        "duration": 0,
        "iatMean": 0,
        "iatStd": 0,
        "riskScore": risk_score,
        "riskLevel": _risk_level(risk_score),
        "timestamp": _iso(row["created_at"]),
        "features": [
            {"name": f["feature"], "value": f["attribution"], "contribution": abs(f["attribution"])}
            for f in row.get("top_features", [])
        ],
    }


def row_to_alert(row: dict) -> dict:
    risk_score = round(row["infiltration_probability"] * 100)
    stage = row["attack_stage"]
    return {
        "id": f"alert-{row['window_id']}",
        "severity": _severity(risk_score),
        "title": f"{stage} activity detected" if stage != "Benign" else "Elevated infiltration probability",
        "description": (
            f"Window {row['window_id']} from {row.get('source_file') or 'unknown source'} scored "
            f"{row['infiltration_probability']:.0%} infiltration probability, mapped to MITRE stage "
            f"'{stage}' ({_STAGE_TACTIC.get(stage, 'n/a')}) at {row['confidence']:.0%} confidence."
        ),
        "timestamp": _iso(row["created_at"]),
        "flowId": row["window_id"],
        "killChainStage": stage,
        "topFeatures": [
            {"featureName": f["feature"], "value": f["attribution"], "contribution": f["attribution"], "direction": "positive" if f["attribution"] >= 0 else "negative"}
            for f in row.get("top_features", [])
        ],
    }


def kill_chain_state(stats: dict) -> list[dict]:
    """One entry per MITRE stage (architecture doc's kill-chain tracker),
    active = the most recent prediction's stage."""
    latest_stage = stats["latest"]["attack_stage"] if stats.get("latest") else None
    stage_counts = stats.get("stage_counts", {})
    total = sum(stage_counts.values()) or 1
    order = list(STAGE_NAMES)  # Benign first, then the kill chain in order
    seen_any_past = False
    result = []
    for name in order:
        count = stage_counts.get(name, 0)
        is_active = name == latest_stage
        result.append({
            "name": name,
            "probability": round(count / total, 3),
            "isActive": is_active,
            "isPredicted": False,
            "isComplete": seen_any_past and not is_active and count > 0,
        })
        if is_active:
            seen_any_past = True
    return result


def risk_score_response(stats: dict) -> dict:
    latest = stats.get("latest")
    if latest is None:
        return {"score": 0, "trend": "stable", "delta": 0, "activeStage": "none", "explanation": "No predictions recorded yet -- upload a capture on the Ingestion page."}

    score = round(latest["infiltration_probability"] * 100)
    return {
        "score": score,
        "trend": "stable",  # would need a second-most-recent comparison point to say up/down honestly
        "delta": 0,
        "activeStage": latest["attack_stage"],
        "explanation": (
            f"Most recent window ({latest['window_id']}) scored {latest['infiltration_probability']:.0%} "
            f"infiltration probability, mapped to '{latest['attack_stage']}' at {latest['confidence']:.0%} confidence."
            + ("" if latest["trained"] else " Model is untrained -- this number is not meaningful yet.")
        ),
    }
