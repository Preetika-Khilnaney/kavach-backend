"""Build windowed, normalized flow+packet feature matrices.

TODO (build order step 3):
- Group flow and packet records into fixed windows (see windowing.window_seconds
  in configs/config.yaml).
- Compute per-window aggregate stats (IAT mean/var/max, TTL variance, etc.)
  per the feature list in configs/config.yaml.
- Normalize and return one feature vector per window, timestamped.
- Test this standalone with plots before wiring it into the pipeline.
"""


def build_feature_windows(flow_df, packet_records, window_seconds: int = 5):
    raise NotImplementedError("Window and aggregate flow+packet records into feature vectors.")
