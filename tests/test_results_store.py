"""Results store tests, against a temp SQLite file (never the real
data/processed/results.db)."""

import pytest

from src.storage import results_store


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(results_store, "DB_PATH", tmp_path / "test_results.db")


def _save(window_id="w1", infiltration_probability=0.7, attack_stage="Reconnaissance", source_file="test.csv"):
    results_store.save_prediction(
        window_id=window_id,
        source_file=source_file,
        window={"flow_count": 10, "packet_count": None, "flow_dominant_label": "PortScan"},
        state={"nodes": [{"id": "network"}], "edges": []},
        infiltration_probability=infiltration_probability,
        attack_stage=attack_stage,
        confidence=0.8,
        trained=True,
        top_features=[{"feature": "flow_bytes_sum", "attribution": 0.5}],
    )


def test_save_and_recent_predictions_roundtrip():
    _save(window_id="w1")
    _save(window_id="w2")

    rows = results_store.recent_predictions()

    assert len(rows) == 2
    assert rows[0]["window_id"] == "w2"  # most recent first
    assert rows[0]["source_file"] == "test.csv"
    assert rows[0]["label"] == "PortScan"
    assert rows[0]["trained"] is True
    assert rows[0]["top_features"] == [{"feature": "flow_bytes_sum", "attribution": 0.5}]
    assert rows[0]["nodes"] == [{"id": "network"}]


def test_recent_predictions_respects_limit():
    for i in range(5):
        _save(window_id=f"w{i}")
    assert len(results_store.recent_predictions(limit=3)) == 3


def test_get_prediction_by_window_id():
    _save(window_id="w1", attack_stage="Bot")
    _save(window_id="w2", attack_stage="Benign")

    result = results_store.get_prediction("w1")
    assert result["attack_stage"] == "Bot"
    assert results_store.get_prediction("does-not-exist") is None


def test_alerts_filters_by_probability_threshold():
    _save(window_id="low", infiltration_probability=0.1)
    _save(window_id="high", infiltration_probability=0.9)

    alerts = results_store.alerts(min_probability=0.5)

    assert len(alerts) == 1
    assert alerts[0]["window_id"] == "high"


def test_summary_stats_aggregates_correctly():
    _save(window_id="w1", attack_stage="Benign")
    _save(window_id="w2", attack_stage="Benign")
    _save(window_id="w3", attack_stage="Bot")

    stats = results_store.summary_stats()

    assert stats["total_predictions"] == 3
    assert stats["stage_counts"] == {"Benign": 2, "Bot": 1}
    assert stats["latest"]["window_id"] == "w3"


def test_summary_stats_empty_store():
    stats = results_store.summary_stats()
    assert stats["total_predictions"] == 0
    assert stats["latest"] is None
    assert stats["stage_counts"] == {}


def test_clear_removes_all_rows():
    _save(window_id="w1")
    results_store.clear()
    assert results_store.recent_predictions() == []
