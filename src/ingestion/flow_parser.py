"""
Load flow-level records from CIC-IDS-2017/2018 or CTU-13 CSVs.

Normalises column names, parses timestamps, drops Inf/NaN, and
returns a clean DataFrame ready for windowing in src/features/extract.py.
"""

import pandas as pd
import numpy as np
from pathlib import Path


# CIC-IDS column name → internal canonical name
_CICIDS_RENAME = {
    "Flow ID":               "flow_id",
    "Source IP":             "src_ip",
    "Source Port":           "src_port",
    "Destination IP":        "dst_ip",
    "Destination Port":      "dst_port",
    "Protocol":              "protocol",
    "Timestamp":             "timestamp",
    "Flow Duration":         "flow_duration",
    "Total Fwd Packets":     "fwd_packets",
    "Total Backward Packets":"bwd_packets",
    "Total Length of Fwd Packets": "fwd_bytes",
    "Total Length of Bwd Packets": "bwd_bytes",
    "Label":                 "label",
}


def load_flow_csv(path: str) -> pd.DataFrame:
    """
    Load a CIC-IDS or CTU-13 CSV file.

    Returns
    -------
    pd.DataFrame
        Cleaned DataFrame indexed by timestamp with:
        - All numeric flow columns
        - A 'label'  column (string, e.g. 'BENIGN', 'Web Attack - Brute Force')
        - A 'label_enc' column (integer, 0 = BENIGN, else = attack class index)
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")

    df = pd.read_csv(path, low_memory=False)
    df.columns = df.columns.str.strip()

    # Rename known columns where present
    rename_map = {k: v for k, v in _CICIDS_RENAME.items() if k in df.columns}
    df = df.rename(columns=rename_map)

    # Drop Inf / NaN
    df = df.replace([np.inf, -np.inf], np.nan).dropna()

    # Encode label
    if "label" in df.columns:
        from sklearn.preprocessing import LabelEncoder
        le = LabelEncoder()
        df["label_enc"] = le.fit_transform(df["label"])
        # Stash the classes on the dataframe so callers can recover them
        df.attrs["label_classes"] = list(le.classes_)
    else:
        df["label_enc"] = 0
        df.attrs["label_classes"] = ["BENIGN"]

    # Parse timestamp if present
    if "timestamp" in df.columns:
        try:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            df = df.sort_values("timestamp")
        except Exception:
            pass  # leave as-is if parsing fails

    return df
