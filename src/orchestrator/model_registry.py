"""Lazily loads the trained NetJEPA + scoring-head checkpoint
(data/processed/netjepa_weights.pt), reloading automatically if the file
changes on disk (e.g. src/training/train.py finishes, or saves a newer
epoch's checkpoint) — no server restart needed to pick up fresher weights.

If no checkpoint exists yet, falls back to freshly-initialized (untrained,
random) models so the pipeline can still run end-to-end. Callers get a
`trained: bool` back alongside the models — always propagate that into
event payloads (see pipeline.py) rather than let an untrained prediction
look like a real one.
"""

from __future__ import annotations

from pathlib import Path

import torch

from src.config import load_config
from src.graph.state_builder import CANONICAL_FEATURE_NAMES
from src.models.netjepa import NetJEPA
from src.scoring.attack_stage import ATTACKStageClassifier
from src.scoring.infiltration import InfiltrationHead

CHECKPOINT_PATH = Path("data/processed/netjepa_weights.pt")
FEATURE_DIM = len(CANONICAL_FEATURE_NAMES)

_cache: dict = {"mtime": None, "model": None, "infil_head": None, "stage_clf": None, "trained": False}


def get_models():
    """Returns (model, infil_head, stage_clf, trained), all in eval()
    mode. Cheap to call repeatedly — only rebuilds/reloads when the
    checkpoint file's mtime changes."""
    mtime = CHECKPOINT_PATH.stat().st_mtime if CHECKPOINT_PATH.exists() else None
    # model is not None guards the no-checkpoint case: mtime stays None
    # forever then, which would otherwise match the cache's initial None
    # on every call and skip ever building the untrained fallback model.
    if mtime == _cache["mtime"] and _cache["model"] is not None:
        return _cache["model"], _cache["infil_head"], _cache["stage_clf"], _cache["trained"]

    cfg = load_config().get("model", {})
    embedding_dim = cfg.get("embedding_dim", 128)
    predictor_hidden_dim = cfg.get("predictor_hidden_dim", 256)
    trained = False
    checkpoint = None

    if mtime is not None:
        checkpoint = torch.load(CHECKPOINT_PATH, map_location="cpu")
        # Trust the checkpoint's own dims over config.yaml's current
        # values -- config.yaml can change after a model was trained, and
        # a mismatch here would silently produce meaningless weights
        # instead of a clean error.
        embedding_dim = checkpoint.get("embedding_dim", embedding_dim)
        predictor_hidden_dim = checkpoint.get("predictor_hidden_dim", predictor_hidden_dim)

    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=embedding_dim, predictor_hidden_dim=predictor_hidden_dim)
    infil_head = InfiltrationHead(embedding_dim=embedding_dim)
    stage_clf = ATTACKStageClassifier(embedding_dim=embedding_dim)

    if checkpoint is not None:
        model.load_state_dict(checkpoint["model"])
        infil_head.load_state_dict(checkpoint["infil_head"])
        stage_clf.load_state_dict(checkpoint["stage_clf"])
        trained = True

    model.eval()
    infil_head.eval()
    stage_clf.eval()

    _cache.update(mtime=mtime, model=model, infil_head=infil_head, stage_clf=stage_clf, trained=trained)
    return model, infil_head, stage_clf, trained
