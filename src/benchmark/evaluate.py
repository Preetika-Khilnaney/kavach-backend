"""Benchmark/Evaluation module (architecture doc): trains a logistic
regression baseline on the same windowed features NetJEPA uses, and
reports F1/precision/recall/false-positive-rate for both the baseline and
(once one exists) NetJEPA's infiltration head — on the exact same held-out
validation windows src.training.train used, so the comparison is
apples-to-apples rather than two different test sets.

Batch/offline job, not part of the live pipeline, per the architecture
doc — exposed via GET /benchmark for the reports screen (src/api/main.py).

Scope note: this benchmarks the binary infiltration task specifically
(BENIGN vs any-attack), since F1/precision/recall/FPR are what the
architecture doc asks for and FPR in particular is a binary-classification
concept. The 6-class MITRE stage head isn't benchmarked here — that would
need a one-vs-rest FPR per class, a reasonable follow-up but not what was
asked for.
"""

from __future__ import annotations

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score

from src.graph.state_builder import build_graph_state
from src.models.netjepa import graph_batch_from_state
from src.orchestrator import model_registry
from src.training.dataset import build_examples, load_all_windows
from src.training.labels import infiltration_label

_cache: dict = {"mtime": None, "result": None}


def _feature_matrix(examples: list[tuple[list[dict], dict]]) -> tuple[np.ndarray, np.ndarray]:
    """Uses each example's TARGET window (the one being predicted on) —
    same window the infiltration head scores in the live pipeline (see
    src/orchestrator/pipeline.py's attack_mapping stage)."""
    X, y = [], []
    for _, target in examples:
        X.append(build_graph_state(target)["feature_vector"])
        y.append(infiltration_label(target))
    return np.array(X, dtype=float), np.array(y, dtype=int)


def _binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    fpr = fp / (fp + tn) if (fp + tn) else 0.0
    return {
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "fpr": float(fpr),
    }


def _evaluate_baseline(train_examples, val_examples) -> dict:
    X_train, y_train = _feature_matrix(train_examples)
    X_val, y_val = _feature_matrix(val_examples)
    # class_weight="balanced": attack windows are a small minority in this
    # dataset -- without it, "always predict BENIGN" scores deceptively
    # well on plain accuracy while missing every attack.
    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(X_train, y_train)
    return _binary_metrics(y_val, clf.predict(X_val))


def _evaluate_netjepa(val_examples) -> dict | None:
    model, infil_head, _, trained = model_registry.get_models()
    if not trained:
        return None

    y_true, y_pred = [], []
    with torch.no_grad():
        for _, target in val_examples:
            graph_batch = graph_batch_from_state(build_graph_state(target))
            _, _, z_context = model([[graph_batch]])
            prob = infil_head(z_context)[0].item()
            y_true.append(int(infiltration_label(target)))
            y_pred.append(1 if prob >= 0.5 else 0)

    return _binary_metrics(np.array(y_true), np.array(y_pred))


def _run_benchmark_uncached(val_fraction: float = 0.2) -> dict:
    windows_by_file = load_all_windows()
    # context_len=1 just for a stable, reused train/val split matching
    # training's -- context windows themselves aren't used here.
    train_examples, val_examples = build_examples(windows_by_file, context_len=1, val_fraction=val_fraction)

    baseline_metrics = _evaluate_baseline(train_examples, val_examples)
    netjepa_metrics = _evaluate_netjepa(val_examples)

    results = [{"model": "Logistic Regression (baseline)", **baseline_metrics}]
    if netjepa_metrics is not None:
        results.append({"model": "NetJEPA", **netjepa_metrics})
    else:
        results.append({
            "model": "NetJEPA",
            "f1": None, "precision": None, "recall": None, "fpr": None,
            "note": "no trained checkpoint yet (data/processed/netjepa_weights.pt) -- run python -m src.training.train",
        })

    return {"val_size": len(val_examples), "train_size": len(train_examples), "results": results}


def run_benchmark(val_fraction: float = 0.2) -> dict:
    """Cached on the model checkpoint's mtime: re-running the baseline LR
    fit + a full pass of NetJEPA inference over the validation set on
    every call would be wasteful when nothing has changed. Recomputes
    whenever the checkpoint changes (a new/continued training run) or on
    first call."""
    mtime = model_registry.CHECKPOINT_PATH.stat().st_mtime if model_registry.CHECKPOINT_PATH.exists() else None
    if mtime == _cache["mtime"] and _cache["result"] is not None:
        return _cache["result"]

    result = _run_benchmark_uncached(val_fraction=val_fraction)
    _cache.update(mtime=mtime, result=result)
    return result
