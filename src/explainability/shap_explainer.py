"""Explainability: per-feature attribution for a NetJEPA-derived
prediction (an infiltration score or an attack-stage class), tied back to
the window's own named feature vector
(src.graph.state_builder.CANONICAL_FEATURE_NAMES) — this is what the
architecture doc's "why flagged" panel and attention heatmap need: real
feature names, not "feature_0, feature_1, ...".

Rewritten from a teammate's branch (pulled in from an unrelated git
history): the original attributed against `batch["network"].x` inside a
model with a built-in classification head. This project's NetJEPA
(src/models/netjepa.py) deliberately doesn't bake a classification head in
— scoring is a separate downstream stage (src/scoring/), per the
architecture doc's stage separation — so this explains
encoder -> predictor -> scoring_head as one differentiable chain, with
whatever scoring head (InfiltrationHead, ATTACKStageClassifier) the caller
passes in.

Uses Captum's IntegratedGradients when available, falling back to
gradient x input saliency (no extra install) otherwise — same fallback
shape as before.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn

from src.graph.state_builder import CANONICAL_FEATURE_NAMES


def explain_prediction(
    model,
    scoring_head: nn.Module,
    feature_vector,
    feature_names: list[str] | None = None,
    target_index: int = 0,
    n_features: int = 10,
) -> list[dict]:
    """Compute per-feature attribution scores for one window's prediction.

    Parameters
    ----------
    model         : NetJEPA (src.models.netjepa.NetJEPA)
    scoring_head  : a downstream head — InfiltrationHead or
                    ATTACKStageClassifier (src.scoring) — mapping the
                    model's context embedding to a score/logits vector.
    feature_vector: the window's numeric feature vector (list[float] or
                    1-D tensor), e.g. state_builder.build_graph_state(window)["feature_vector"].
    feature_names : names matching feature_vector, in order. Defaults to
                    CANONICAL_FEATURE_NAMES when the length matches.
    target_index  : which output element to explain (the class index for
                    ATTACKStageClassifier; 0 for InfiltrationHead's single
                    score).
    n_features    : how many top features to return.

    Returns
    -------
    list of {"feature": str, "attribution": float}, sorted by |attribution|
    descending, longest n_features.
    """
    model.eval()
    scoring_head.eval()

    x = torch.as_tensor(feature_vector, dtype=torch.float32).clone().detach().requires_grad_(True)

    if feature_names is None:
        feature_names = list(CANONICAL_FEATURE_NAMES) if len(x) == len(CANONICAL_FEATURE_NAMES) else [f"feature_{i}" for i in range(len(x))]

    def forward_fn(x_input: torch.Tensor) -> torch.Tensor:
        # one "network"-only window per row in x_input's batch. Goes
        # through model(...) (not model.context_encoder(...) directly) so
        # it includes context_norm -- model.eval() above means that's
        # running-stats BatchNorm, safe regardless of this batch's size
        # (Captum may call this with more than one interpolated row).
        context_batches = [[{"network": row.unsqueeze(0)}] for row in x_input]
        _, _, z_context = model(context_batches)
        return scoring_head(z_context)

    try:
        from captum.attr import IntegratedGradients

        ig = IntegratedGradients(forward_fn)
        attrs = ig.attribute(x.unsqueeze(0), target=target_index)
        attrs = attrs.squeeze(0).detach().cpu().numpy()
    except Exception:
        out = forward_fn(x.unsqueeze(0)).flatten()
        score = out[target_index]
        score.backward()
        attrs = (x.grad * x).detach().cpu().numpy() if x.grad is not None else np.zeros(len(feature_names))

    ranked = sorted(
        (
            {"feature": feature_names[i] if i < len(feature_names) else f"feature_{i}", "attribution": float(attrs[i])}
            for i in range(len(attrs))
        ),
        key=lambda d: abs(d["attribution"]),
        reverse=True,
    )
    return ranked[:n_features]
