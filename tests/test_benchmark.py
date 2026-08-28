"""Benchmark module tests, against small synthetic windows (not the real
28k-window cache, so these stay fast and self-contained)."""

import torch

from src.benchmark import evaluate
from src.orchestrator import model_registry


def _make_window(i: int, is_attack: bool) -> dict:
    # flow_bytes_sum is a clearly separable signal so LogisticRegression
    # has something real to learn, not just chance.
    return {
        "window_id": str(i),
        "flow_count": 10,
        "flow_bytes_sum": 1000.0 if is_attack else 10.0,
        "flow_attack_ratio": 1.0 if is_attack else 0.0,
        "flow_dominant_label": "PortScan" if is_attack else "BENIGN",
    }


def _synthetic_windows(n: int = 60) -> dict:
    windows = [_make_window(i, is_attack=(i % 3 == 0)) for i in range(n)]
    return {"fake_file": windows}


def test_evaluate_baseline_learns_a_separable_signal(monkeypatch):
    monkeypatch.setattr(evaluate, "load_all_windows", lambda: _synthetic_windows())
    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", model_registry.CHECKPOINT_PATH.parent / "definitely_does_not_exist.pt")
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)

    result = evaluate.run_benchmark(val_fraction=0.2)

    assert result["val_size"] > 0
    baseline = next(r for r in result["results"] if "Logistic" in r["model"])
    # separable-by-construction data -> baseline should do meaningfully
    # better than random guessing, not just "didn't crash"
    assert baseline["f1"] > 0.5


def test_run_benchmark_reports_untrained_netjepa_when_no_checkpoint(monkeypatch):
    monkeypatch.setattr(evaluate, "load_all_windows", lambda: _synthetic_windows())
    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", model_registry.CHECKPOINT_PATH.parent / "definitely_does_not_exist.pt")
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)

    result = evaluate.run_benchmark(val_fraction=0.2)

    netjepa = next(r for r in result["results"] if r["model"] == "NetJEPA")
    assert netjepa["f1"] is None
    assert "note" in netjepa


def test_run_benchmark_evaluates_netjepa_when_checkpoint_present(tmp_path, monkeypatch):
    from src.graph.state_builder import CANONICAL_FEATURE_NAMES
    from src.models.netjepa import NetJEPA
    from src.scoring.attack_stage import ATTACKStageClassifier
    from src.scoring.infiltration import InfiltrationHead

    checkpoint_path = tmp_path / "netjepa_weights.pt"
    feature_dim = len(CANONICAL_FEATURE_NAMES)
    model = NetJEPA(feature_dim=feature_dim, embedding_dim=8, predictor_hidden_dim=16)
    infil_head = InfiltrationHead(embedding_dim=8)
    stage_clf = ATTACKStageClassifier(embedding_dim=8)
    torch.save({
        "model": model.state_dict(), "infil_head": infil_head.state_dict(), "stage_clf": stage_clf.state_dict(),
        "embedding_dim": 8, "predictor_hidden_dim": 16,
    }, checkpoint_path)

    monkeypatch.setattr(evaluate, "load_all_windows", lambda: _synthetic_windows())
    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", checkpoint_path)
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)

    result = evaluate.run_benchmark(val_fraction=0.2)

    netjepa = next(r for r in result["results"] if r["model"] == "NetJEPA")
    assert netjepa["f1"] is not None
    assert 0.0 <= netjepa["precision"] <= 1.0
    assert 0.0 <= netjepa["fpr"] <= 1.0


def test_run_benchmark_caches_until_checkpoint_changes(monkeypatch):
    monkeypatch.setattr(evaluate, "load_all_windows", lambda: _synthetic_windows())
    monkeypatch.setattr(model_registry, "CHECKPOINT_PATH", model_registry.CHECKPOINT_PATH.parent / "definitely_does_not_exist.pt")
    model_registry._cache.update(mtime=None, model=None, infil_head=None, stage_clf=None, trained=False)
    evaluate._cache.update(mtime="sentinel", result=None)  # force a mismatch the first call must overwrite

    calls = {"n": 0}
    real_load = evaluate.load_all_windows

    def counting_load():
        calls["n"] += 1
        return real_load()

    monkeypatch.setattr(evaluate, "load_all_windows", counting_load)

    evaluate.run_benchmark()
    evaluate.run_benchmark()

    assert calls["n"] == 1  # second call hit the cache, didn't recompute
