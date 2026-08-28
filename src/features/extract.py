"""
Feature extraction: slide a fixed-size window over the flow DataFrame and
produce one normalised feature vector + graph metadata per window.
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler


def _numeric_cols(df: pd.DataFrame) -> list[str]:
    """Return all numeric columns except label columns."""
    skip = {"label_enc", "label", "flow_id", "src_ip", "dst_ip"}
    return [
        c for c in df.columns
        if df[c].dtype in (np.float64, np.int64, np.float32, np.int32)
        and c not in skip
    ]


def build_feature_windows(
    flow_df: pd.DataFrame,
    window_size: int = 100,
    packet_records=None,          # kept for API compatibility, unused for now
    window_seconds: int = 5,      # unused when window_size (row-count) is set
) -> list[dict]:
    """
    Slide a fixed-size row window over *flow_df* and return a list of dicts:

        {
            "window_id":      int,
            "features":       np.ndarray  shape (window_size, n_features),
            "feature_names":  list[str],
            "label":          int,          # majority label in window
            "label_name":     str,
            "src_ips":        list[str],    # unique source IPs  (graph nodes)
            "dst_ips":        list[str],    # unique dest IPs    (graph nodes)
        }

    The returned list is consumed by src/graph/state_builder.py and
    src/orchestrator/pipeline.py.
    """
    num_cols = _numeric_cols(flow_df)
    label_classes = flow_df.attrs.get("label_classes", ["BENIGN"])

    # Fit a scaler on the whole dataframe so windows are comparable
    scaler = StandardScaler()
    scaled = scaler.fit_transform(flow_df[num_cols].values)
    scaled_df = pd.DataFrame(scaled, columns=num_cols, index=flow_df.index)

    windows = []
    for start in range(0, len(flow_df) - window_size, window_size):
        win_raw   = flow_df.iloc[start: start + window_size]
        win_scaled = scaled_df.iloc[start: start + window_size]

        label_int  = int(win_raw["label_enc"].mode().iloc[0])
        label_name = label_classes[label_int] if label_int < len(label_classes) else "UNKNOWN"

        # IP-level topology for graph construction
        src_ips = list(win_raw["src_ip"].unique()) if "src_ip" in win_raw else []
        dst_ips = list(win_raw["dst_ip"].unique()) if "dst_ip" in win_raw else []

        windows.append({
            "window_id":     len(windows),
            "features":      win_scaled.values.astype(np.float32),
            "feature_names": num_cols,
            "label":         label_int,
            "label_name":    label_name,
            "src_ips":       src_ips,
            "dst_ips":       dst_ips,
        })

    return windows
