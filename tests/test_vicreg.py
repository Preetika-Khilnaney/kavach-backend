"""Sanity checks for the VICReg loss: shape correctness and that it
penalizes collapse (a constant embedding should score worse on the
variance term than a spread-out one)."""

import torch

from src.models.losses import vicreg_loss


def test_vicreg_loss_runs():
    z_a = torch.randn(32, 128)
    z_b = torch.randn(32, 128)
    result = vicreg_loss(z_a, z_b)
    assert result["loss"].dim() == 0
    for key in ["invariance", "variance", "covariance"]:
        assert key in result


def test_vicreg_penalizes_collapse():
    collapsed = torch.ones(32, 128)  # every embedding identical -> zero variance
    spread = torch.randn(32, 128)
    collapsed_result = vicreg_loss(collapsed, collapsed)
    spread_result = vicreg_loss(spread, spread)
    assert collapsed_result["variance"] > spread_result["variance"]
