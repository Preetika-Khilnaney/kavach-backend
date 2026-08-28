"""
Explainability: compute feature attributions for a given prediction.

Uses simple gradient-based saliency (works with no extra install).
Falls back to Captum IntegratedGradients if available.
"""

import torch
import numpy as np


def explain_prediction(
    model,
    batch,
    target_class: int = 1,
    feature_names: list[str] | None = None,
    n_features: int = 10,
) -> list[dict]:
    """
    Compute per-feature attribution scores for a single window.

    Parameters
    ----------
    model        : NetJEPA (or any model with .encode_context())
    batch        : PyG Batch or HeteroData for a single window
    target_class : class index to explain (1 = attack)
    feature_names: list of column names matching the feature dimension
    n_features   : how many top features to return

    Returns
    -------
    list of dicts: [{"feature": str, "attribution": float}, ...]
    sorted descending by absolute attribution.
    """
    model.eval()

    # We attribute on the "network" node's feature vector
    # (the mean-aggregated window vector)
    x = batch["network"].x.clone().detach().requires_grad_(True)

    # Forward pass: intercept the network node
    try:
        # Try Captum IntegratedGradients
        from captum.attr import IntegratedGradients

        def forward_fn(network_x):
            # Temporarily replace network node features
            batch["network"].x = network_x
            logits, _, _ = model(batch)
            return logits

        ig = IntegratedGradients(forward_fn)
        attrs, _ = ig.attribute(x, target=target_class,
                                return_convergence_delta=True)
        attrs = attrs.squeeze().detach().cpu().numpy()

    except Exception:
        # Fallback: gradient × input (simpler saliency)
        batch["network"].x = x
        logits, _, _ = model(batch)
        score = logits[0, target_class] if logits.dim() > 1 else logits[target_class]
        score.backward()
        if x.grad is not None:
            attrs = (x.grad * x).squeeze().detach().cpu().numpy()
        else:
            attrs = np.ones(x.shape[-1])

    # Build ranked feature list
    n_feats = len(attrs)
    if feature_names is None:
        feature_names = [f"feature_{i}" for i in range(n_feats)]

    ranked = sorted(
        [
            {"feature": feature_names[i] if i < len(feature_names) else f"f{i}",
             "attribution": float(attrs[i])}
            for i in range(n_feats)
        ],
        key=lambda d: abs(d["attribution"]),
        reverse=True,
    )
    return ranked[:n_features]
