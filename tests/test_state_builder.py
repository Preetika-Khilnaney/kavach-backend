"""Graph state-builder tests, run against small synthetic feature windows
(the same shape src.features.extract actually produces)."""

from src.graph import state_builder

N = len(state_builder.CANONICAL_FEATURE_NAMES)


def test_network_only_window_has_no_host_nodes():
    window = {"window_id": "0", "window_start": 0, "window_end": 5, "flow_count": 3, "flow_bytes_sum": 120.0}

    graph = state_builder.build_graph_state(window)

    assert graph["nodes"] == [{"id": "network", "label": "window", "type": "network"}]
    assert graph["edges"] == []
    # fixed-width, canonical order -- not "whatever this window happened to have"
    assert graph["feature_names"] == list(state_builder.CANONICAL_FEATURE_NAMES)
    assert len(graph["feature_vector"]) == N
    assert graph["feature_vector"][graph["feature_names"].index("flow_count")] == 3.0
    assert graph["feature_vector"][graph["feature_names"].index("flow_bytes_sum")] == 120.0
    # everything this window didn't have is 0.0, not dropped
    assert graph["feature_vector"][graph["feature_names"].index("packet_count")] == 0.0


def test_packet_edges_become_host_nodes_and_flow_edges():
    window = {
        "window_id": "0",
        "window_start": 0,
        "packet_count": 3,
        "packet_edges": [("10.0.0.1", "10.0.0.2"), ("10.0.0.1", "10.0.0.3")],
    }

    graph = state_builder.build_graph_state(window)

    node_ids = {n["id"] for n in graph["nodes"]}
    assert node_ids == {"network", "host_0", "host_1", "host_2"}
    host_labels = {n["label"] for n in graph["nodes"] if n["type"] == "host"}
    assert host_labels == {"10.0.0.1", "10.0.0.2", "10.0.0.3"}

    has_edges = [e for e in graph["edges"] if e["type"] == "has"]
    flow_edges = [e for e in graph["edges"] if e["type"] == "flow"]
    assert len(has_edges) == 3  # network -> each host
    assert len(flow_edges) == 2  # the two real observed pairs


def test_hetero_data_shapes_match_hosts_and_canonical_feature_dim():
    window = {
        "window_id": "0",
        "flow_bytes_sum": 100.0,
        "flow_count": 2,
        "packet_edges": [("10.0.0.1", "10.0.0.2")],
    }

    graph = state_builder.build_graph_state(window)
    assert "graph" in graph  # torch + torch-geometric are installed in this env
    data = graph["graph"]

    assert data["network"].x.shape == (1, N)
    assert data["host"].x.shape == (2, N)  # 2 hosts, each gets the network's feature vector
    assert data["network", "has", "host"].edge_index.shape == (2, 2)
    assert data["host", "flow", "host"].edge_index.shape == (2, 1)


def test_hetero_data_falls_back_gracefully_with_no_hosts():
    window = {"window_id": "0", "flow_bytes_sum": 5.0}
    graph = state_builder.build_graph_state(window)
    data = graph["graph"]

    assert data["host"].x.shape == (1, N)  # zero-host fallback: one dummy zero row, still canonical width
    assert data["host", "flow", "host"].edge_index.shape == (2, 0)


def test_two_different_window_shapes_still_produce_same_width_vector():
    """A flow-only window and a packet-only window must be interchangeable
    inputs to the model -- this is the whole reason the vector is fixed
    width instead of "whatever this window has"."""
    flow_only = {"flow_count": 5, "flow_bytes_sum": 10.0}
    packet_only = {"packet_count": 7, "packet_ttl_mean": 64.0}

    v1 = state_builder.build_graph_state(flow_only)["feature_vector"]
    v2 = state_builder.build_graph_state(packet_only)["feature_vector"]

    assert len(v1) == len(v2) == N
