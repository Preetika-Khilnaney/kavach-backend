"""Tests for src/api/adapters.py's results_store-row -> frontend-shape mapping."""

from src.api import adapters


def _row(**overrides):
    base = {
        "window_id": "w1",
        "source_file": "Wednesday.csv",
        "created_at": 1700000000.0,
        "infiltration_probability": 0.75,
        "attack_stage": "Lateral Movement",
        "confidence": 0.9,
        "trained": True,
        "label": "Infiltration",
        "top_features": [{"feature": "flow_bytes_sum", "attribution": 0.42}],
        "nodes": [],
        "edges": [],
        "window": {"flow_bytes_sum": 1234.0, "flow_duration_mean": 2.5, "flow_iat_mean_mean": 0.1, "flow_iat_var_mean": 0.02},
    }
    base.update(overrides)
    return base


def test_row_to_flow_maps_real_fields():
    flow = adapters.row_to_flow(_row())
    assert flow["id"] == "w1"
    assert flow["riskScore"] == 75
    assert flow["riskLevel"] == "high"
    # bytes/duration/iat stay 0, not the window's normalized values -- a
    # z-scored number labelled "bytes"/"seconds" would read as a real
    # (sometimes negative) measurement, which it isn't. See adapters.py.
    assert flow["bytes"] == 0
    assert flow["duration"] == 0
    assert flow["features"] == [{"name": "flow_bytes_sum", "value": 0.42, "contribution": 0.42}]
    assert flow["srcIP"] == "N/A"  # no host nodes in this row


def test_row_to_flow_uses_real_host_ips_when_present():
    row = _row(nodes=[
        {"id": "network", "type": "network"},
        {"id": "host_0", "label": "10.0.0.1", "type": "host"},
        {"id": "host_1", "label": "10.0.0.2", "type": "host"},
    ])
    flow = adapters.row_to_flow(row)
    assert flow["srcIP"] == "10.0.0.1"
    assert flow["dstIP"] == "10.0.0.2"


def test_risk_level_thresholds():
    assert adapters.row_to_flow(_row(infiltration_probability=0.1))["riskLevel"] == "low"
    assert adapters.row_to_flow(_row(infiltration_probability=0.4))["riskLevel"] == "medium"
    assert adapters.row_to_flow(_row(infiltration_probability=0.7))["riskLevel"] == "high"
    assert adapters.row_to_flow(_row(infiltration_probability=0.9))["riskLevel"] == "critical"


def test_row_to_alert_maps_fields():
    alert = adapters.row_to_alert(_row())
    assert alert["flowId"] == "w1"
    assert alert["killChainStage"] == "Lateral Movement"
    assert alert["severity"] == "critical"
    assert "Lateral Movement" in alert["title"]
    assert alert["topFeatures"][0]["featureName"] == "flow_bytes_sum"


def test_kill_chain_state_marks_latest_stage_active():
    stats = {
        "latest": {"attack_stage": "Command and Control"},
        "stage_counts": {"Benign": 8, "Reconnaissance": 1, "Command and Control": 1},
    }
    stages = adapters.kill_chain_state(stats)
    active = [s for s in stages if s["isActive"]]
    assert len(active) == 1
    assert active[0]["name"] == "Command and Control"
    benign = next(s for s in stages if s["name"] == "Benign")
    assert benign["probability"] == 0.8


def test_kill_chain_state_empty_store():
    stages = adapters.kill_chain_state({"latest": None, "stage_counts": {}})
    assert all(not s["isActive"] for s in stages)
    assert all(s["probability"] == 0 for s in stages)


def test_risk_score_response_with_data():
    stats = {"latest": {"window_id": "w1", "infiltration_probability": 0.62, "attack_stage": "Bot", "confidence": 0.8, "trained": True}}
    resp = adapters.risk_score_response(stats)
    assert resp["score"] == 62
    assert resp["activeStage"] == "Bot"


def test_risk_score_response_no_data():
    resp = adapters.risk_score_response({"latest": None})
    assert resp["score"] == 0
    assert resp["activeStage"] == "none"


def test_risk_score_response_flags_untrained_model():
    stats = {"latest": {"window_id": "w1", "infiltration_probability": 0.5, "attack_stage": "Benign", "confidence": 0.5, "trained": False}}
    resp = adapters.risk_score_response(stats)
    assert "not meaningful yet" in resp["explanation"]
