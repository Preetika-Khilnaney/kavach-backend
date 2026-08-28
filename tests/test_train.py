"""Tests for src/training/train.py's pure helper functions (not the full
training loop -- that's exercised manually via `python -m src.training.train`,
see its module docstring)."""

from src.training.train import infiltration_pos_weight


def test_infiltration_pos_weight_balanced_dataset():
    examples = [(None, {"flow_attack_ratio": 1.0})] * 10 + [(None, {"flow_attack_ratio": 0.0})] * 10
    assert infiltration_pos_weight(examples) == 1.0


def test_infiltration_pos_weight_imbalanced_dataset():
    # 90 benign, 10 attack -> attack rows should count 9x as much
    examples = [(None, {"flow_attack_ratio": 0.0})] * 90 + [(None, {"flow_attack_ratio": 1.0})] * 10
    assert infiltration_pos_weight(examples) == 9.0


def test_infiltration_pos_weight_no_positives_falls_back_to_one():
    examples = [(None, {"flow_attack_ratio": 0.0})] * 20
    assert infiltration_pos_weight(examples) == 1.0
