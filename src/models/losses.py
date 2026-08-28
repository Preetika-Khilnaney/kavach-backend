"""VICReg loss: Variance-Invariance-Covariance Regularization.

Used to train the NetJEPA context/target encoders without collapsing to a
trivial constant embedding, which is the standard failure mode of
self-supervised latent-prediction objectives (the risk flagged on the
feasibility/viability slide).

Reference: Bardes, Ponce, LeCun. "VICReg: Variance-Invariance-Covariance
Regularization for Self-Supervised Learning." ICLR 2022.
"""

import torch
import torch.nn.functional as F


def variance_loss(z: torch.Tensor, gamma: float = 1.0, eps: float = 1e-4) -> torch.Tensor:
    """Pushes the standard deviation of each embedding dimension (across the
    batch) toward at least `gamma`. This is what stops every embedding from
    collapsing to the same point."""
    std = torch.sqrt(z.var(dim=0) + eps)
    return torch.mean(torch.relu(gamma - std))


def covariance_loss(z: torch.Tensor) -> torch.Tensor:
    """Decorrelates the embedding dimensions from each other, so the model
    can't cheat by encoding the same signal redundantly across dimensions."""
    n, d = z.shape
    z = z - z.mean(dim=0)
    cov = (z.T @ z) / (n - 1)
    off_diag = cov.flatten()[1:].view(d - 1, d + 1)[:, :-1].flatten()
    return off_diag.pow(2).sum() / d


def vicreg_loss(
    z_a: torch.Tensor,
    z_b: torch.Tensor,
    sim_coeff: float = 25.0,
    std_coeff: float = 25.0,
    cov_coeff: float = 1.0,
) -> dict:
    """Full VICReg loss between two embeddings (e.g. predicted vs. target
    encoder output for the same/adjacent window).

    Returns a dict with the total loss and each component, so training code
    can log them separately and catch collapse early (watch `var_loss` — if
    it stays near its max, embeddings are likely collapsing).
    """
    inv_loss = F.mse_loss(z_a, z_b)
    var_loss = variance_loss(z_a) + variance_loss(z_b)
    cov_loss = covariance_loss(z_a) + covariance_loss(z_b)

    total = sim_coeff * inv_loss + std_coeff * var_loss + cov_coeff * cov_loss
    return {
        "loss": total,
        "invariance": inv_loss.detach(),
        "variance": var_loss.detach(),
        "covariance": cov_loss.detach(),
    }
