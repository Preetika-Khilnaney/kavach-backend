"""Infiltration probability scoring from NetJEPA rollout output.

Rewritten from a teammate's branch (pulled in from an unrelated git
history) — this module was already decoupled from the graph/feature-window
shape debate (see src/graph/state_builder.py, src/models/netjepa.py): it
only ever consumes the fixed-size embedding vectors NetJEPA's predictor
produces, so it needed no real rewrite, just integration with this
project's config (embedding_dim from configs/config.yaml) and a lighter
docstring pass.

No trained weights exist yet — this head's output means nothing until it's
actually trained on labelled rollouts. It's here so the shapes are right
and stage:attack_mapping has something real to call once training happens.
"""

from __future__ import annotations

import torch
import torch.nn as nn

from src.config import load_config


class InfiltrationHead(nn.Module):
    """Scores each predicted latent state z_hat_{t+k} to produce a scalar
    infiltration probability in [0, 1]. Meant to be trained with binary
    cross-entropy against ground-truth attack labels; produces the "rising
    probability curve" the architecture doc's frontend timeline expects."""

    def __init__(self, embedding_dim: int | None = None):
        super().__init__()
        embedding_dim = embedding_dim or load_config().get("model", {}).get("embedding_dim", 128)
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        """z: (embedding_dim,) or (batch, embedding_dim). Returns (batch, 1)."""
        if z.dim() == 1:
            z = z.unsqueeze(0)
        return self.net(z)

    def score_curve(self, rollout: list[torch.Tensor]) -> list[float]:
        """Given a K-step rollout (list of z_hat tensors), return one
        probability per step — the infiltration curve."""
        self.eval()
        with torch.no_grad():
            return [self.forward(z).squeeze().item() for z in rollout]


def score_infiltration(
    rollout_embeddings: list[torch.Tensor],
    head: InfiltrationHead | None = None,
) -> list[float]:
    """Convenience wrapper: score a K-step rollout with a fresh (or given)
    head. Returns one probability per rollout step."""
    if not rollout_embeddings:
        return []
    head = head or InfiltrationHead(embedding_dim=rollout_embeddings[0].shape[-1])
    return head.score_curve(rollout_embeddings)
