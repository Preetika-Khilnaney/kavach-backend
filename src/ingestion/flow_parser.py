"""Load flow-level records from the CIC-IDS-2017 "MachineLearningCVE" CSVs
(data/raw/CSV/MachineLearningCVE/*.csv) and normalize them into the schema
declared in configs/config.yaml under features.flow_level.

Dataset caveat (read before touching timestamps/IPs downstream):
The MachineLearningCVE release of CIC-IDS-2017 is the ML-ready export of
CICFlowMeter's output — it drops Flow ID, Source IP, Source Port,
Destination IP, Protocol and Timestamp, keeping only aggregated per-flow
statistics and a Label. That means:
  - `src_ip`, `dst_ip`, `src_port` are NOT recoverable from this file and are
    always NaN in the returned DataFrame. Only `dst_port` survives.
  - There is no `protocol` column either; it's simply absent from the
    returned DataFrame (don't index it).
  - There is no per-flow timestamp. Rows are written in capture order per
    file, so we synthesize a monotonically increasing `timestamp` by
    anchoring each file to its capture day (per the CIC-IDS-2017 paper, the
    five days run Monday-Friday, 2017-07-03 through 2017-07-07, 09:00 local)
    and walking forward by each row's own Flow Duration. This is good enough
    for time-windowed aggregation but is NOT wall-clock-accurate — use the
    matching raw PCAP (src/ingestion/packet_parser.py) wherever real IPs or
    real timestamps matter (e.g. building the live host graph).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterator

import pandas as pd

# Capture week per the CIC-IDS-2017 dataset documentation.
_DAY_START = {
    "monday": datetime(2017, 7, 3, 9, 0, 0),
    "tuesday": datetime(2017, 7, 4, 9, 0, 0),
    "wednesday": datetime(2017, 7, 5, 9, 0, 0),
    "thursday": datetime(2017, 7, 6, 9, 0, 0),
    "friday": datetime(2017, 7, 7, 9, 0, 0),
}

# raw CSV column -> normalized flow_level field (see configs/config.yaml).
# Columns not listed here (e.g. the many CICFlowMeter stats not in the
# config's feature list) are kept, just snake_cased, so nothing is dropped.
_COLUMN_ALIASES = {
    "destination_port": "dst_port",
    "protocol": "protocol",
    "flow_duration": "duration_us",
    "flow_iat_mean": "iat_mean",
    "flow_iat_std": "iat_var",
    "flow_iat_max": "iat_max",
    "total_fwd_packets": "fwd_packets",
    "total_backward_packets": "bwd_packets",
    "total_length_of_fwd_packets": "fwd_bytes",
    "total_length_of_bwd_packets": "bwd_bytes",
    "label": "label",
}

# TCP flag *count* columns in this dataset (how many packets in the flow set
# that flag), not a single bitmask. We fold "flag appeared at least once"
# into a synthetic per-flow bitmask so it's comparable to packet_parser's
# single-packet tcp_flags field. Bit positions match a raw TCP flags byte.
_FLAG_COLUMN_BITS = {
    "fin_flag_count": 0x01,
    "syn_flag_count": 0x02,
    "rst_flag_count": 0x04,
    "psh_flag_count": 0x08,
    "ack_flag_count": 0x10,
    "urg_flag_count": 0x20,
    "cwe_flag_count": 0x80,
    "ece_flag_count": 0x40,
}


def _snake_case(col: str) -> str:
    col = col.strip()
    col = re.sub(r"[^\w]+", "_", col)
    col = re.sub(r"_+", "_", col).strip("_")
    return col.lower()


def _day_start_for(path: str) -> tuple[str, datetime]:
    name = Path(path).stem.lower()
    for day, start in _DAY_START.items():
        if name.startswith(day):
            return day, start
    return "unknown", datetime(2017, 7, 3, 9, 0, 0)


def _normalize_chunk(chunk: pd.DataFrame, source_day: str, day_start: datetime, source_file: str) -> pd.DataFrame:
    chunk = chunk.rename(columns={c: _snake_case(c) for c in chunk.columns})
    chunk = chunk.rename(columns=_COLUMN_ALIASES)

    flag_cols = [c for c in _FLAG_COLUMN_BITS if c in chunk.columns]
    if flag_cols:
        bitmask = pd.Series(0, index=chunk.index, dtype="int64")
        for col in flag_cols:
            bitmask |= (chunk[col].fillna(0).astype("int64") > 0) * _FLAG_COLUMN_BITS[col]
        chunk["tcp_flags"] = bitmask

    if "duration_us" in chunk.columns:
        duration_s = chunk["duration_us"].fillna(0).clip(lower=0) / 1_000_000.0
        chunk["duration"] = duration_s
        # Synthetic timestamp: walk forward through the file in row order,
        # each flow starting where the previous one's duration left off.
        # See the module docstring for why this can't be a real timestamp.
        elapsed = duration_s.cumsum().shift(fill_value=0.0)
        chunk["timestamp"] = [day_start + timedelta(seconds=float(s)) for s in elapsed]

    if {"fwd_bytes", "bwd_bytes"} <= set(chunk.columns):
        chunk["bytes"] = chunk["fwd_bytes"].fillna(0) + chunk["bwd_bytes"].fillna(0)
    if {"fwd_packets", "bwd_packets"} <= set(chunk.columns):
        chunk["packets"] = chunk["fwd_packets"].fillna(0) + chunk["bwd_packets"].fillna(0)

    if "label" in chunk.columns:
        chunk["label"] = chunk["label"].astype(str).str.strip()

    for missing in ("src_ip", "dst_ip", "src_port"):
        chunk[missing] = pd.NA

    chunk["source_day"] = source_day
    chunk["source_file"] = source_file
    return chunk


def iter_flow_csv(path: str, chunksize: int = 50_000) -> Iterator[pd.DataFrame]:
    """Stream-normalize a MachineLearningCVE CSV in chunks.

    Yields one normalized DataFrame per `chunksize` rows so a caller (the
    orchestrator) can emit a stage:ingestion progress event per batch
    instead of blocking until the whole file is loaded.
    """
    source_day, day_start = _day_start_for(path)
    source_file = Path(path).name
    for raw_chunk in pd.read_csv(path, chunksize=chunksize, low_memory=False):
        yield _normalize_chunk(raw_chunk, source_day, day_start, source_file)


def load_flow_csv(path: str) -> pd.DataFrame:
    """Load and normalize a full MachineLearningCVE CSV into one DataFrame."""
    chunks = list(iter_flow_csv(path, chunksize=200_000))
    if not chunks:
        return pd.DataFrame()
    return pd.concat(chunks, ignore_index=True)


def load_flow_dir(dir_path: str) -> pd.DataFrame:
    """Load every *.csv in a MachineLearningCVE-style directory and concat them."""
    frames = [load_flow_csv(str(p)) for p in sorted(Path(dir_path).glob("*.csv"))]
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)
