"""
Build G_t = (V_t, E_t) heterogeneous graph snapshots from feature windows.

Node types  : network, flow, external
Edge types  : network→flow, flow→external, flow→network (reverse)
"""

import numpy as np
import torch

try:
    from torch_geometric.data import HeteroData
    HAS_PYG = True
except ImportError:
    HAS_PYG = False


def build_graph_state(window: dict) -> "HeteroData | dict":
    """
    Parameters
    ----------
    window : dict
        One element from src.features.extract.build_feature_windows().
        Required keys: 'features' (np.ndarray), 'src_ips', 'dst_ips'.

    Returns
    -------
    HeteroData (if torch-geometric is installed)
    or a plain dict with 'nodes' / 'edges' lists (JSON-serialisable fallback).
    """
    features: np.ndarray = window["features"]   # (W, F)
    W, F = features.shape

    # ---- JSON-serialisable representation (always built) ----
    src_ips = window.get("src_ips", [])
    dst_ips = window.get("dst_ips", [])

    # Nodes for the 3-D frontend graph
    nodes = []
    for i, ip in enumerate(src_ips):
        nodes.append({"id": f"host_{i}", "label": ip, "type": "host"})
    for i, ip in enumerate(dst_ips):
        nodes.append({"id": f"ext_{i}", "label": ip, "type": "external"})
    nodes.append({"id": "network", "label": "Enterprise Network", "type": "network"})

    edges = []
    for i in range(min(len(src_ips), len(dst_ips))):
        edges.append({
            "source": f"host_{i}",
            "target": f"ext_{i}",
            "weight": float(np.abs(features[:, 0]).mean()),
        })

    graph_json = {"nodes": nodes, "edges": edges}

    if not HAS_PYG:
        return graph_json

    # ---- PyG HeteroData (for model inference) ----
    data = HeteroData()

    feat_t = torch.tensor(features, dtype=torch.float32)
    data["network"].x  = torch.tensor(features.mean(axis=0),
                                       dtype=torch.float32).unsqueeze(0)   # (1, F)
    data["flow"].x     = feat_t                                            # (W, F)
    data["external"].x = torch.zeros(1, F, dtype=torch.float32)           # (1, F)

    src = torch.arange(W, dtype=torch.long)
    dst = torch.zeros(W, dtype=torch.long)

    data["flow", "connects_to", "external"].edge_index = torch.stack([src, dst])
    data["flow", "connects_to", "external"].edge_attr  = feat_t.clone()

    data["network", "has", "flow"].edge_index = torch.stack(
        [torch.zeros(W, dtype=torch.long), src])
    data["flow", "rev_has", "network"].edge_index = torch.stack(
        [src, torch.zeros(W, dtype=torch.long)])

    # Attach the JSON representation so callers can use either
    data._graph_json = graph_json
    return data
