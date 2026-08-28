"""Build G_t = (V_t, E_t) graph snapshots from a feature window.

TODO (build order step 4):
- Nodes (V_t): distinct hosts/IPs active in the window.
- Edges (E_t): flows between hosts, with the window's feature vector (or a
  per-flow slice of it) as edge attributes.
- Rebuilt fresh every window, per the technical approach slide.
- Sanity-check with a networkx plot before feeding into the encoder.
"""


def build_graph_state(feature_window):
    raise NotImplementedError("Construct nodes/edges for this window's graph snapshot.")
