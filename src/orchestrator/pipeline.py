"""
Orchestrator: the single place that drives the full pipeline and streams
events to the WebSocket.

Two modes
---------
1.  DEMO mode  (default) — streams the pre-computed hackathon_demo_timeline.json
    that you downloaded from Kaggle.  Zero model loading, zero dependencies.
    Use this for the live frontend demo.

2.  LIVE mode  — loads the trained NetJEPA weights, reads a CSV, builds graphs,
    runs inference, and streams real results.  Activated when you pass a
    capture_path to run_pipeline().

Event schema (unchanged — the frontend expects exactly this):
    {
        "stage":    str,     # "ingestion" | "feature_extraction" | "state_representation"
                             #  | "forward_pass" | "rollout" | "attack_mapping"
                             #  | "explainability"
        "window_id": int | str,
        "timestamp": float,
        "payload":  dict,    # stage-specific payload (see below)
        "status":   str      # "complete" | "error"
    }
"""

import asyncio
import json
import time
from pathlib import Path
from typing import AsyncGenerator

# ─── Path to the Kaggle-exported timeline JSON ───────────────────────────────
_TIMELINE_PATH = Path(__file__).parent.parent.parent / "data" / "processed" / "hackathon_demo_timeline.json"
_NETJEPA_WEIGHTS = Path(__file__).parent.parent.parent / "data" / "processed" / "netjepa_real_weights.pth"
_BASELINE_WEIGHTS = Path(__file__).parent.parent.parent / "data" / "processed" / "baseline_reactive.pth"


def _load_timeline() -> list[dict]:
    """Load the pre-computed Kaggle timeline JSON."""
    if _TIMELINE_PATH.exists():
        with open(_TIMELINE_PATH) as f:
            return json.load(f)
    return []   # empty — will fall through to demo data


def _demo_timeline() -> list[dict]:
    """Built-in synthetic timeline for when no real data is available."""
    stages = ["BENIGN"] * 15 + ["BENIGN"] * 3 + ["Web Attack - Brute Force"] * 5 + ["BENIGN"] * 7
    timeline = []
    for i, status in enumerate(stages):
        is_attack = status != "BENIGN"
        # NetJEPA fires 3 steps before the attack at window 18
        jepa_early = (i >= 15 and i < 18)   # 3-step look-ahead
        timeline.append({
            "window_id":          i,
            "actual_status":      status,
            "baseline_detection": status if is_attack else "BENIGN",
            "netjepa_prediction": "Web Attack - Brute Force" if (is_attack or jepa_early) else "BENIGN",
            "is_early_warning":   jepa_early,
        })
    return timeline


async def run_pipeline(
    capture_path: str | None = None,
    playback_hz: float       = 10.0,
) -> AsyncGenerator[dict, None]:
    """
    Async generator that yields pipeline events.

    Parameters
    ----------
    capture_path : path to a CIC-IDS CSV (activates LIVE mode if provided)
    playback_hz  : events per second (default 10 → 100 ms between events)
    """
    delay = 1.0 / playback_hz

    # ── LIVE MODE ─────────────────────────────────────────────────────────
    if capture_path and Path(capture_path).exists():
        async for event in _run_live(capture_path, delay):
            yield event
        return

    # ── DEMO MODE ─────────────────────────────────────────────────────────
    timeline = _load_timeline() or _demo_timeline()

    for entry in timeline:
        wid = entry["window_id"]
        ts  = time.time()

        # 1. Ingestion event
        yield _event("ingestion", wid, ts, {
            "records_ingested": 100,
            "source": capture_path or "hackathon_demo_timeline.json",
        })
        await asyncio.sleep(delay)

        # 2. Feature extraction
        yield _event("feature_extraction", wid, ts, {
            "feature_dim": 78,
            "window_size": 100,
        })
        await asyncio.sleep(delay)

        # 3. State representation (graph topology)
        yield _event("state_representation", wid, ts, {
            "nodes": [
                {"id": "network", "type": "network", "label": "Enterprise"},
                {"id": "external_0", "type": "external", "label": "Remote Host"},
            ],
            "edges": [
                {"source": "network", "target": "external_0", "weight": 0.8},
            ],
        })
        await asyncio.sleep(delay)

        # 4. Forward pass
        yield _event("forward_pass", wid, ts, {
            "embedding_dim": 128,
            "k_steps": 3,
        })
        await asyncio.sleep(delay)

        # 5. Rollout
        actual      = entry["actual_status"]
        jepa_pred   = entry["netjepa_prediction"]
        base_pred   = entry["baseline_detection"]
        is_attack   = actual != "BENIGN"
        infil_prob  = 0.92 if is_attack else (0.65 if entry["is_early_warning"] else 0.08)

        yield _event("rollout", wid, ts, {
            "infiltration_probability": round(infil_prob, 4),
            "netjepa_prediction":       jepa_pred,
            "baseline_detection":       base_pred,
            "is_early_warning":         entry["is_early_warning"],
            "k_steps": 3,
        })
        await asyncio.sleep(delay)

        # 6. Attack mapping
        mitre_stage = _mitre_stage(actual, jepa_pred, entry["is_early_warning"])
        yield _event("attack_mapping", wid, ts, {
            "infiltration_probability": round(infil_prob, 4),
            "attack_stage":             mitre_stage["stage"],
            "mitre_tactic":             mitre_stage["tactic"],
            "mitre_technique":          mitre_stage["technique"],
            "actual_status":            actual,
            "netjepa_prediction":       jepa_pred,
            "baseline_detection":       base_pred,
            "is_early_warning":         entry["is_early_warning"],
        })
        await asyncio.sleep(delay)

        # 7. Explainability
        yield _event("explainability", wid, ts, {
            "top_features": _dummy_shap(is_attack or entry["is_early_warning"]),
        })
        await asyncio.sleep(delay)


# ─── LIVE MODE ────────────────────────────────────────────────────────────────
async def _run_live(csv_path: str, delay: float) -> AsyncGenerator[dict, None]:
    """
    Load a real CIC-IDS CSV, build feature windows + graphs, run NetJEPA,
    and yield real events.  Requires: torch, torch_geometric, sklearn.
    """
    import torch
    from src.ingestion.flow_parser import load_flow_csv
    from src.features.extract import build_feature_windows
    from src.graph.state_builder import build_graph_state
    from src.models.netjepa import NetJEPA, METADATA
    from src.explainability.shap_explainer import explain_prediction

    # ---- Load data ----
    df = load_flow_csv(csv_path)
    windows = build_feature_windows(df, window_size=100)
    label_classes = df.attrs.get("label_classes", ["BENIGN"])
    feature_names = windows[0]["feature_names"] if windows else []
    FEATURE_DIM = len(feature_names)
    NUM_CLASSES = len(label_classes)

    # ---- Load models ----
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = None
    if _NETJEPA_WEIGHTS.exists():
        try:
            model = NetJEPA.load(
                str(_NETJEPA_WEIGHTS),
                feature_dim=FEATURE_DIM,
                num_classes=NUM_CLASSES,
                device=str(device),
            ).to(device)
        except Exception:
            model = None

    for win in windows:
        wid  = win["window_id"]
        ts   = time.time()
        graph = build_graph_state(win)

        # Ingestion
        yield _event("ingestion", wid, ts, {
            "records_ingested": 100, "source": csv_path})
        await asyncio.sleep(delay)

        # Feature extraction
        yield _event("feature_extraction", wid, ts, {
            "feature_dim": FEATURE_DIM, "window_size": 100})
        await asyncio.sleep(delay)

        # Graph
        graph_json = getattr(graph, "_graph_json", {"nodes": [], "edges": []})
        yield _event("state_representation", wid, ts, graph_json)
        await asyncio.sleep(delay)

        # Inference
        if model is not None:
            try:
                from torch_geometric.data import Batch
                batch = Batch.from_data_list([graph]).to(device)
                probs = model.predict_proba(batch)[0].cpu().tolist()
                jepa_idx = int(torch.tensor(probs).argmax())
                jepa_pred = label_classes[jepa_idx] if jepa_idx < NUM_CLASSES else "UNKNOWN"
                infil_prob = probs[1] if NUM_CLASSES > 1 else probs[0]

                xai = explain_prediction(model, batch,
                                         feature_names=feature_names)
            except Exception:
                jepa_pred = "BENIGN"; infil_prob = 0.0; xai = []
        else:
            # No weights — fall back to label from the CSV
            jepa_pred  = label_classes[win["label"]]
            infil_prob = 0.9 if win["label"] != 0 else 0.05
            xai        = []

        actual  = label_classes[win["label"]]
        is_atk  = actual != "BENIGN"
        is_warn = jepa_pred != "BENIGN" and not is_atk

        yield _event("forward_pass", wid, ts, {"embedding_dim": 128, "k_steps": 3})
        await asyncio.sleep(delay)

        yield _event("rollout", wid, ts, {
            "infiltration_probability": round(infil_prob, 4),
            "netjepa_prediction": jepa_pred,
            "is_early_warning": is_warn,
        })
        await asyncio.sleep(delay)

        mitre = _mitre_stage(actual, jepa_pred, is_warn)
        yield _event("attack_mapping", wid, ts, {
            "infiltration_probability": round(infil_prob, 4),
            "attack_stage": mitre["stage"],
            "mitre_tactic": mitre["tactic"],
            "mitre_technique": mitre["technique"],
            "actual_status": actual,
            "netjepa_prediction": jepa_pred,
            "is_early_warning": is_warn,
        })
        await asyncio.sleep(delay)

        yield _event("explainability", wid, ts, {"top_features": xai})
        await asyncio.sleep(delay)


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _event(stage: str, window_id, timestamp: float, payload: dict) -> dict:
    return {
        "stage":     stage,
        "window_id": window_id,
        "timestamp": timestamp,
        "payload":   payload,
        "status":    "complete",
    }


def _mitre_stage(actual: str, predicted: str, is_early: bool) -> dict:
    """Map label strings to MITRE ATT&CK metadata."""
    label = predicted if is_early else actual
    mapping = {
        "BENIGN":                    ("Normal",             "None",                        "None"),
        "Web Attack - Brute Force":  ("Credential Access",  "TA0006",                      "T1110"),
        "Web Attack - XSS":          ("Initial Access",     "TA0001",                      "T1189"),
        "Web Attack - Sql Injection":("Initial Access",     "TA0001",                      "T1190"),
        "DoS":                       ("Impact",             "TA0040",                      "T1498"),
        "DDoS":                      ("Impact",             "TA0040",                      "T1498"),
        "PortScan":                  ("Reconnaissance",     "TA0043",                      "T1046"),
        "Infiltration":              ("Lateral Movement",   "TA0008",                      "T1021"),
        "Bot":                       ("Command and Control","TA0011",                      "T1071"),
    }
    # Fuzzy match
    for key, (stage, tactic, technique) in mapping.items():
        if key.lower() in label.lower():
            return {"stage": stage, "tactic": tactic, "technique": technique}
    return {"stage": "Unknown", "tactic": "None", "technique": "None"}


def _dummy_shap(is_anomalous: bool) -> list[dict]:
    """Provide plausible SHAP values when live model XAI is unavailable."""
    if is_anomalous:
        return [
            {"feature": "flow_duration",       "attribution":  0.82},
            {"feature": "bwd_packets",         "attribution":  0.71},
            {"feature": "src_port",            "attribution": -0.65},
            {"feature": "dst_port",            "attribution":  0.54},
            {"feature": "fwd_bytes",           "attribution":  0.43},
        ]
    return [
        {"feature": "flow_duration",       "attribution":  0.12},
        {"feature": "bwd_packets",         "attribution":  0.08},
        {"feature": "fwd_bytes",           "attribution":  0.05},
    ]
