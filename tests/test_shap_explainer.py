"""Explainability tests: verify attributions come back tied to real
feature names and are ranked/shaped correctly, using real Captum
IntegratedGradients (installed in this env) against random-init model
weights. Doesn't test that the *ranking* is meaningful -- that needs
trained weights, which don't exist in this project yet."""

from src.explainability.shap_explainer import explain_prediction
from src.graph.state_builder import CANONICAL_FEATURE_NAMES
from src.models.netjepa import NetJEPA
from src.scoring.attack_stage import ATTACKStageClassifier
from src.scoring.infiltration import InfiltrationHead

FEATURE_DIM = len(CANONICAL_FEATURE_NAMES)
EMBEDDING_DIM = 16


def _sample_vector():
    return [float(i) for i in range(FEATURE_DIM)]


def test_explain_infiltration_score_returns_real_feature_names():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    head = InfiltrationHead(embedding_dim=EMBEDDING_DIM)

    result = explain_prediction(model, head, _sample_vector(), n_features=5)

    assert len(result) == 5
    assert all(r["feature"] in CANONICAL_FEATURE_NAMES for r in result)
    # sorted by |attribution| descending
    magnitudes = [abs(r["attribution"]) for r in result]
    assert magnitudes == sorted(magnitudes, reverse=True)


def test_explain_attack_stage_for_a_specific_class():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    clf = ATTACKStageClassifier(embedding_dim=EMBEDDING_DIM)

    result = explain_prediction(model, clf, _sample_vector(), target_index=2, n_features=3)

    assert len(result) == 3
    assert all(isinstance(r["attribution"], float) for r in result)


def test_explain_prediction_respects_n_features_cap():
    model = NetJEPA(feature_dim=FEATURE_DIM, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    head = InfiltrationHead(embedding_dim=EMBEDDING_DIM)

    result = explain_prediction(model, head, _sample_vector(), n_features=1)
    assert len(result) == 1


def test_explain_prediction_with_custom_feature_names():
    model = NetJEPA(feature_dim=4, embedding_dim=EMBEDDING_DIM, predictor_hidden_dim=32)
    head = InfiltrationHead(embedding_dim=EMBEDDING_DIM)

    result = explain_prediction(
        model, head, [1.0, 2.0, 3.0, 4.0],
        feature_names=["a", "b", "c", "d"], n_features=4,
    )
    assert {r["feature"] for r in result} == {"a", "b", "c", "d"}
