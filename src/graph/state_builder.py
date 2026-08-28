"""Build G_t = (V_t, E_t) graph snapshots from ONE feature window, as
produced by src.features.extract.build_feature_windows / iter_feature_windows.

What's actually available to build a graph from (read this before expecting
a rich host graph on every window):

- Every window always gets a "network" node: the window's own aggregate
  feature vector. This is what feeds the model when nothing richer is
  available (see NetJEPA's PyG-less fallback in src/models/netjepa.py,
  which reduces to exactly this).
- "host" nodes are only added when the window carries real per-record IPs
  -- that's `packet_edges` from extract.py (real observed (src_ip, dst_ip)
  pairs), which only exists for PCAP-derived windows. MachineLearningCVE
  CSV windows never carry real IPs (see flow_parser's module docstring),
  so their graphs are always network-node-only. That's a genuine limit of
  the source data, not a shortcut taken here.
- host nodes reuse the window's own aggregate vector as their feature
  vector too -- there's no per-host feature data in our aggregated
  windows, only per-window aggregates. A host node's "features" describe
  the whole window's traffic, not that host's individual behavior. Don't
  read more into per-host embeddings than that.
"""

from __future__ import annotations

import numpy as np

try:
    import torch
    from torch_geometric.data import HeteroData

    HAS_PYG = True
except ImportError:
    HAS_PYG = False

NODE_TYPES = ("network", "host")
EDGE_TYPES = (
    ("network", "has", "host"),
    ("host", "rev_has", "network"),
    ("host", "flow", "host"),
)

# Every numeric field src.features.extract can produce, in a fixed order.
# Deliberately NOT "whatever keys this window happens to have": a
# flow-only window, a packet-only window, and a merged window all have
# different columns present, and the model needs the same input width
# every time (its Linear layers are sized once, at construction). Missing
# fields are filled with 0.0 -- see _numeric_feature_vector.
CANONICAL_FEATURE_NAMES = (
    # flow-level (src.features.extract._window_flow_records)
    "flow_count",
    "flow_src_ip_nunique",
    "flow_dst_ip_nunique",
    "flow_dst_port_nunique",
    "flow_tcp_flags_union",
    "flow_bytes_sum",
    "flow_bytes_mean",
    "flow_packets_sum",
    "flow_duration_mean",
    "flow_iat_mean_mean",
    "flow_iat_var_mean",
    "flow_iat_max_max",
    # Deliberately NOT flow_attack_ratio: src.training.labels.infiltration_label
    # is computed directly from it (label = attack_ratio > 0), so including
    # it here would let a classifier "predict" the label by reading it
    # straight off an input feature instead of learning anything about
    # actual traffic behavior. Confirmed this was happening in practice —
    # see src/benchmark/evaluate.py's docstring / the benchmark run that
    # caught it (baseline logistic regression scored a suspicious 0.996 F1).
    # flow_attack_ratio still exists on the window dict itself and is still
    # exactly what labels should be derived from — it just doesn't belong
    # in the model's own input vector too.
    # packet-level (src.features.extract._window_packet_records)
    "packet_count",
    "packet_ttl_mean",
    "packet_ttl_variance",
    "packet_tcp_window_mean",
    "packet_fragment_rate",
    "packet_payload_size_mean",
    "packet_payload_size_std",
    "packet_retransmit_count",
    "packet_port_scan_flagged",
    "packet_src_ip_nunique",
    "packet_dst_ip_nunique",
)


def _numeric_feature_vector(window: dict) -> tuple[list[str], list[float]]:
    """Fixed-width numeric feature vector, in CANONICAL_FEATURE_NAMES
    order, so every window (regardless of which columns it happens to
    have) produces the same-length vector at the same tensor indices.
    Missing/NaN fields become 0.0."""
    values = []
    for key in CANONICAL_FEATURE_NAMES:
        val = window.get(key)
        if val is None:
            values.append(0.0)
        elif isinstance(val, bool):
            values.append(float(val))
        elif isinstance(val, (int, float)):
            v = float(val)
            values.append(0.0 if np.isnan(v) else v)
        else:
            values.append(0.0)
    return list(CANONICAL_FEATURE_NAMES), values


def build_graph_state(window: dict) -> dict:
    """Build one graph snapshot from a single feature-window dict.

    Returns a dict with:
      - "nodes" / "edges": always-present, JSON-serializable lists (for the
        frontend's live network graph).
      - "feature_names" / "feature_vector": the "network" node's numeric
        feature vector, in stable order.
      - "graph" (only if torch + torch-geometric are installed): a
        HeteroData object with the same content, ready for NetJEPA.
    """
    feature_names, feature_vector = _numeric_feature_vector(window)
    edges_seen = window.get("packet_edges") or []

    host_ips: list[str] = []
    host_index: dict[str, int] = {}
    for src_ip, dst_ip in edges_seen:
        for ip in (src_ip, dst_ip):
            if ip not in host_index:
                host_index[ip] = len(host_ips)
                host_ips.append(ip)

    nodes = [{"id": "network", "label": "window", "type": "network"}]
    nodes += [{"id": f"host_{i}", "label": ip, "type": "host"} for i, ip in enumerate(host_ips)]

    edges = [{"source": "network", "target": f"host_{i}", "type": "has"} for i in range(len(host_ips))]
    edges += [
        {"source": f"host_{host_index[src_ip]}", "target": f"host_{host_index[dst_ip]}", "type": "flow"}
        for src_ip, dst_ip in edges_seen
    ]

    result = {
        "nodes": nodes,
        "edges": edges,
        "feature_names": feature_names,
        "feature_vector": feature_vector,
    }

    if HAS_PYG:
        result["graph"] = _to_hetero_data(feature_vector, host_ips, edges_seen, host_index)

    return result


def _to_hetero_data(feature_vector: list[float], host_ips: list[str], edges_seen: list[tuple], host_index: dict) -> "HeteroData":
    data = HeteroData()
    feat_dim = max(len(feature_vector), 1)
    network_x = torch.tensor([feature_vector or [0.0]], dtype=torch.float32)  # (1, F)
    data["network"].x = network_x

    n_hosts = len(host_ips)
    if n_hosts:
        # Every host node reuses the window's own aggregate vector -- see
        # the module docstring for why there's nothing more host-specific
        # to give it.
        data["host"].x = network_x.repeat(n_hosts, 1)  # (n_hosts, F)
    else:
        data["host"].x = torch.zeros((1, feat_dim), dtype=torch.float32)

    has_src = torch.arange(max(n_hosts, 1), dtype=torch.long) if n_hosts else torch.zeros(0, dtype=torch.long)
    has_dst = torch.arange(n_hosts, dtype=torch.long) if n_hosts else torch.zeros(0, dtype=torch.long)
    net_idx = torch.zeros(n_hosts, dtype=torch.long)

    data["network", "has", "host"].edge_index = torch.stack([net_idx, has_dst]) if n_hosts else torch.zeros((2, 0), dtype=torch.long)
    data["host", "rev_has", "network"].edge_index = torch.stack([has_dst, net_idx]) if n_hosts else torch.zeros((2, 0), dtype=torch.long)

    if edges_seen:
        src_idx = torch.tensor([host_index[s] for s, _ in edges_seen], dtype=torch.long)
        dst_idx = torch.tensor([host_index[d] for _, d in edges_seen], dtype=torch.long)
        data["host", "flow", "host"].edge_index = torch.stack([src_idx, dst_idx])
    else:
        data["host", "flow", "host"].edge_index = torch.zeros((2, 0), dtype=torch.long)

    return data
