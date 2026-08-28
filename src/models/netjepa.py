"""NetJEPA world model skeleton.

Context encoder + EMA target encoder + predictor, following the I-JEPA/V-JEPA
pattern applied to network state windows. Uses plain MLPs for now so this
runs without a GPU or PyTorch Geometric installed.

TODO (see build order step 4/5): once src/graph/state_builder.py produces
real G_t = (V_t, E_t) graph snapshots, swap ContextEncoder/TargetEncoder for
a PyG-based Heterogeneous Graph Transformer (HGT) encoder, per the
technical approach slide. The training loop and VICReg loss don't need to
change — only what produces `z`.
"""

import copy
import torch
import torch.nn as nn


class ContextEncoder(nn.Module):
    """Maps a feature-window vector to a latent embedding.

    Placeholder MLP. Replace with an HGT encoder over the (V_t, E_t) graph
    snapshot once the graph pipeline is ready — input becomes a graph batch
    instead of a flat vector, output stays a fixed-size embedding.
    """

    def __init__(self, input_dim: int, embedding_dim: int = 128, hidden_dim: int = 256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, embedding_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class Predictor(nn.Module):
    """Predicts the target encoder's embedding of a future window from the
    context encoder's embedding of the current window(s).

    This is where K-step latent rollout comes from at inference time: feed
    the predictor's own output back in as the next context embedding.
    """

    def __init__(self, embedding_dim: int = 128, hidden_dim: int = 256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, embedding_dim),
        )

    def forward(self, z_context: torch.Tensor) -> torch.Tensor:
        return self.net(z_context)

    @torch.no_grad()
    def rollout(self, z_context: torch.Tensor, steps: int) -> list[torch.Tensor]:
        """Roll the predictor forward `steps` times in latent space,
        feeding each prediction back in as the next context. Returns the
        list of predicted embeddings, one per step."""
        z = z_context
        predictions = []
        for _ in range(steps):
            z = self.forward(z)
            predictions.append(z)
        return predictions


class NetJEPA(nn.Module):
    """Wraps the context encoder, EMA target encoder, and predictor."""

    def __init__(self, input_dim: int, embedding_dim: int = 128, hidden_dim: int = 256):
        super().__init__()
        self.context_encoder = ContextEncoder(input_dim, embedding_dim, hidden_dim)
        self.target_encoder = copy.deepcopy(self.context_encoder)
        for p in self.target_encoder.parameters():
            p.requires_grad = False
        self.predictor = Predictor(embedding_dim, hidden_dim)

    def forward(self, x_context: torch.Tensor, x_target: torch.Tensor):
        z_context = self.context_encoder(x_context)
        with torch.no_grad():
            z_target = self.target_encoder(x_target)
        z_pred = self.predictor(z_context)
        return z_pred, z_target, z_context

    @torch.no_grad()
    def update_target_encoder(self, momentum: float = 0.996) -> None:
        """EMA update of the target encoder from the context encoder,
        per the I-JEPA/V-JEPA pattern. Call this after each optimizer step."""
        for p_ctx, p_tgt in zip(self.context_encoder.parameters(), self.target_encoder.parameters()):
            p_tgt.data.mul_(momentum).add_(p_ctx.data, alpha=1 - momentum)
