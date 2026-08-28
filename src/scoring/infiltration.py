"""
Infiltration probability scoring from NetJEPA rollout output.

Produces a continuous probability curve from the K-step latent rollout,
matching the architecture spec's "Infiltration Probability Engine."
"""

import torch
import torch.nn as nn


class InfiltrationHead(nn.Module):
    """
    Scores each predicted latent state z_hat_{t+k} to produce
    a scalar infiltration probability p_infil(t+k) in [0, 1].

    Trained with binary cross-entropy against ground-truth attack labels.
    Produces the "rising probability curve" shown in the frontend timeline.
    """
    def __init__(self, embedding_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        z : (batch, embedding_dim)  OR  (embedding_dim,)  for a single vector

        Returns
        -------
        prob : (batch, 1)  OR  scalar
        """
        if z.dim() == 1:
            z = z.unsqueeze(0)
        return self.net(z)   # (batch, 1)

    def score_curve(self, rollout: list[torch.Tensor]) -> list[float]:
        """
        Given a K-step rollout (list of z_hat tensors),
        return a list of K float probabilities — the infiltration curve.
        """
        self.eval()
        with torch.no_grad():
            return [self.forward(z).squeeze().item() for z in rollout]


def score_infiltration(
    rollout_embeddings: list[torch.Tensor],
    head: InfiltrationHead | None = None,
) -> list[float]:
    """
    Convenience function. Returns a list of infiltration probabilities,
    one per rollout step.

    Parameters
    ----------
    rollout_embeddings : list of tensors, each shape (embedding_dim,)
    head               : optional pre-loaded InfiltrationHead

    Returns
    -------
    list[float] — length == len(rollout_embeddings)
    """
    if not rollout_embeddings:
        return []
    dim = rollout_embeddings[0].shape[-1]
    if head is None:
        head = InfiltrationHead(embedding_dim=dim)
    return head.score_curve(rollout_embeddings)
