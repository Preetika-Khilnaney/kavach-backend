"""Scoring head tests: verify shapes/ranges with random initialization.
No trained weights exist in this project yet -- these don't test that
predictions are meaningful, only that the heads are wired correctly."""

import torch

from src.scoring.attack_stage import ATTACKStageClassifier, STAGE_NAMES, map_attack_stage
from src.scoring.infiltration import InfiltrationHead, score_infiltration

EMBEDDING_DIM = 16


def test_infiltration_head_single_vector_in_unit_range():
    head = InfiltrationHead(embedding_dim=EMBEDDING_DIM)
    z = torch.randn(EMBEDDING_DIM)

    prob = head(z)

    assert prob.shape == (1, 1)
    assert 0.0 <= prob.item() <= 1.0


def test_infiltration_head_batch():
    head = InfiltrationHead(embedding_dim=EMBEDDING_DIM)
    z = torch.randn(4, EMBEDDING_DIM)
    probs = head(z)
    assert probs.shape == (4, 1)


def test_score_infiltration_curve_length_matches_rollout():
    rollout = [torch.randn(EMBEDDING_DIM) for _ in range(5)]
    curve = score_infiltration(rollout)
    assert len(curve) == 5
    assert all(0.0 <= p <= 1.0 for p in curve)


def test_score_infiltration_empty_rollout():
    assert score_infiltration([]) == []


def test_attack_stage_classifier_output_shape():
    clf = ATTACKStageClassifier(embedding_dim=EMBEDDING_DIM)
    logits = clf(torch.randn(3, EMBEDDING_DIM))
    assert logits.shape == (3, len(STAGE_NAMES))


def test_attack_stage_predict_returns_valid_distribution():
    clf = ATTACKStageClassifier(embedding_dim=EMBEDDING_DIM)
    result = clf.predict(torch.randn(EMBEDDING_DIM))

    assert result["stage"] in STAGE_NAMES
    assert 0.0 <= result["confidence"] <= 1.0
    assert len(result["distribution"]) == len(STAGE_NAMES)
    assert abs(sum(result["distribution"]) - 1.0) < 1e-5


def test_map_attack_stage_convenience_function():
    result = map_attack_stage(torch.randn(EMBEDDING_DIM))
    assert "stage" in result and "tactic" in result and "technique" in result
