"""Build windowed, normalized flow+packet feature matrices.

Groups the normalized records from src.ingestion.flow_parser and/or
src.ingestion.packet_parser into fixed time windows (windowing.window_seconds
in configs/config.yaml) and computes one aggregate feature vector per
window, covering the feature list in configs/config.yaml.

Caveat inherited from flow_parser: the MachineLearningCVE CSVs carry no
real src/dst IP or protocol, and a *synthesized* timestamp (see that
module's docstring) — those columns are simply absent from flow-derived
windows below rather than being guessed at. Packet-level windows, by
contrast, have real timestamps/IPs straight from the PCAP.

If you pass both `flow_df` and `packet_records`, they're only merged by
`window_start` — this is only meaningful when both genuinely share a real,
common time base (e.g. both parsed from the same live capture). Passing an
unrelated CSV + PCAP pair (like this project's day-mismatched samples)
will still run, but the merged rows won't correspond to the same real
moment; window each independently in that case (call this function once
per source instead).
"""

from __future__ import annotations

from typing import Iterator

import numpy as np
import pandas as pd


def _to_epoch_seconds(series: pd.Series) -> pd.Series:
    """Coerce a timestamp column (datetime64 or already-numeric epoch
    seconds) to float epoch seconds, for windowing.

    Deliberately not `.astype("int64") / 1e9`: datetime64 columns aren't
    always nanosecond-resolution (pandas will happily hand you 's'/'us'
    resolution depending on how the column was built), which silently
    scales that conversion wrong. Subtracting the epoch and dividing by a
    1-second Timedelta is resolution-independent.
    """
    if pd.api.types.is_datetime64_any_dtype(series):
        return (series - pd.Timestamp("1970-01-01")) / pd.Timedelta(seconds=1)
    return series.astype(float)


def _window_bounds(epoch_seconds: pd.Series, window_seconds: int) -> pd.Series:
    return (epoch_seconds // window_seconds).astype("int64") * window_seconds


def _window_flow_records(flow_df: pd.DataFrame | None, window_seconds: int, rows_per_window: int | None = None) -> pd.DataFrame:
    if flow_df is None or flow_df.empty:
        return pd.DataFrame()

    df = flow_df.copy()
    if rows_per_window is not None:
        # Row-count windows instead of time windows. Exists for training:
        # flow_parser's synthesized timestamp (see its docstring) inflates
        # wildly for the 3 weekdays with no real PCAP anchor -- e.g. one
        # 530k-row day produced 109k 5-second time windows, ~5 rows each,
        # too sparse to be a meaningful aggregate. A fixed row count per
        # window sidesteps that entirely: every window has exactly
        # `rows_per_window` rows regardless of what the synthetic
        # timestamp says, so window count and density are predictable.
        # window_start here is a block index, not a timestamp.
        df["window_start"] = np.arange(len(df)) // rows_per_window
    else:
        df["window_start"] = _window_bounds(_to_epoch_seconds(df["timestamp"]), window_seconds)
    g = df.groupby("window_start", sort=True)

    out = pd.DataFrame({"flow_count": g.size()})
    for col in ("src_ip", "dst_ip"):
        if col in df.columns and df[col].notna().any():
            out[f"flow_{col}_nunique"] = g[col].nunique()
    if "dst_port" in df.columns:
        out["flow_dst_port_nunique"] = g["dst_port"].nunique()
    if "tcp_flags" in df.columns:
        out["flow_tcp_flags_union"] = g["tcp_flags"].agg(
            lambda s: int(np.bitwise_or.reduce(s.fillna(0).astype("int64").to_numpy())) if len(s) else 0
        )
    if "bytes" in df.columns:
        out["flow_bytes_sum"] = g["bytes"].sum()
        out["flow_bytes_mean"] = g["bytes"].mean()
    if "packets" in df.columns:
        out["flow_packets_sum"] = g["packets"].sum()
    if "duration" in df.columns:
        out["flow_duration_mean"] = g["duration"].mean()
    if "iat_mean" in df.columns:
        out["flow_iat_mean_mean"] = g["iat_mean"].mean()
    if "iat_var" in df.columns:
        out["flow_iat_var_mean"] = g["iat_var"].mean()
    if "iat_max" in df.columns:
        out["flow_iat_max_max"] = g["iat_max"].max()
    if "label" in df.columns:
        out["flow_attack_ratio"] = g["label"].agg(lambda s: float((s.astype(str) != "BENIGN").mean()))
        out["flow_dominant_label"] = g["label"].agg(lambda s: s.mode().iat[0] if not s.mode().empty else None)
        # Rare attack types (e.g. Infiltration: 36 rows out of 288k) never
        # win a majority vote once windows span 100+ rows -- the mode above
        # would silently always say "BENIGN" for them. This keeps every
        # distinct label actually seen in the window, so a caller (e.g.
        # training label derivation) can still find a rare attack that's
        # present but not dominant.
        out["flow_labels_present"] = g["label"].agg(lambda s: sorted(set(s.astype(str))))

    return out.reset_index()


def _window_packet_records(packet_records, window_seconds: int) -> pd.DataFrame:
    if packet_records is None:
        return pd.DataFrame()
    df = packet_records if isinstance(packet_records, pd.DataFrame) else pd.DataFrame(list(packet_records))
    if df.empty:
        return pd.DataFrame()

    df = df.copy()
    df["window_start"] = _window_bounds(_to_epoch_seconds(df["timestamp"]), window_seconds)
    g = df.groupby("window_start", sort=True)

    out = pd.DataFrame({"packet_count": g.size()})
    if "ttl" in df.columns:
        out["packet_ttl_mean"] = g["ttl"].mean()
        out["packet_ttl_variance"] = g["ttl"].var(ddof=0).fillna(0.0)
    if "tcp_window_size" in df.columns:
        out["packet_tcp_window_mean"] = g["tcp_window_size"].mean()
    if "fragment_flag" in df.columns:
        out["packet_fragment_rate"] = g["fragment_flag"].mean()
    if "payload_size" in df.columns:
        out["packet_payload_size_mean"] = g["payload_size"].mean()
        out["packet_payload_size_std"] = g["payload_size"].std(ddof=0).fillna(0.0)
    if "is_retransmission" in df.columns:
        out["packet_retransmit_count"] = g["is_retransmission"].sum()
    if "port_scan_signature" in df.columns:
        out["packet_port_scan_flagged"] = g["port_scan_signature"].any()
    for col in ("src_ip", "dst_ip"):
        if col in df.columns:
            out[f"packet_{col}_nunique"] = g[col].nunique()
    if {"src_ip", "dst_ip"} <= set(df.columns):
        # Real observed (src, dst) pairs per window -- this is what
        # src.graph.state_builder needs to draw actual edges instead of
        # just knowing two separate host counts. Built with a plain loop
        # rather than groupby().apply() to sidestep a pandas-version
        # pitfall (see _to_epoch_seconds's docstring for a similar one).
        edges_by_window = {
            window_start: sorted(set(zip(group["src_ip"], group["dst_ip"])))
            for window_start, group in g
        }
        out["packet_edges"] = pd.Series(edges_by_window)

    return out.reset_index()


def _normalize_numeric_columns(df: pd.DataFrame, skip: set[str]) -> pd.DataFrame:
    df = df.copy()
    for col in df.columns:
        if col in skip or not pd.api.types.is_numeric_dtype(df[col]):
            continue
        std = df[col].std(ddof=0)
        if not std or np.isnan(std):
            df[col] = 0.0
        else:
            df[col] = (df[col] - df[col].mean()) / std
    return df


def build_feature_windows(
    flow_df: pd.DataFrame | None = None,
    packet_records=None,
    window_seconds: int = 5,
    normalize: bool = True,
    rows_per_window: int | None = None,
) -> pd.DataFrame:
    """Window flow and/or packet records into one aggregate row per
    `window_seconds`-wide bucket (tumbling windows — see the module
    docstring for the sliding-window / stride_seconds caveat).

    Pass either input alone to window just that source, or both to merge
    them on `window_start` (see the module docstring's caveat on when that
    merge is actually meaningful). Returns an empty DataFrame if both
    inputs are empty/None.

    `rows_per_window` switches flow_df windowing from time-based to a
    fixed row count per window (see _window_flow_records) — a training-time
    escape hatch for flow_parser's synthetic-timestamp inflation on
    unanchored days. Only affects flow_df; packet_records windowing is
    always time-based (packet timestamps are real). When set,
    `window_start`/`window_end` are row-block indices, not timestamps.
    """
    flow_windows = _window_flow_records(flow_df, window_seconds, rows_per_window=rows_per_window)
    packet_windows = _window_packet_records(packet_records, window_seconds)

    if flow_windows.empty and packet_windows.empty:
        return pd.DataFrame()
    if packet_windows.empty:
        combined = flow_windows
    elif flow_windows.empty:
        combined = packet_windows
    else:
        combined = pd.merge(flow_windows, packet_windows, on="window_start", how="outer")

    combined = combined.sort_values("window_start").reset_index(drop=True)
    combined["window_end"] = combined["window_start"] + (1 if rows_per_window is not None else window_seconds)
    combined["window_id"] = combined["window_start"].astype("int64").astype(str)

    count_cols = [c for c in ("flow_count", "packet_count") if c in combined.columns]
    for c in count_cols:
        combined[c] = combined[c].fillna(0).astype("int64")

    if normalize:
        combined = _normalize_numeric_columns(combined, skip={"window_start", "window_end", "window_id", *count_cols})

    front = [c for c in ("window_id", "window_start", "window_end", *count_cols) if c in combined.columns]
    rest = [c for c in combined.columns if c not in front]
    return combined[front + rest]


def iter_feature_windows(
    flow_df: pd.DataFrame | None = None,
    packet_records=None,
    window_seconds: int = 5,
    normalize: bool = True,
    rows_per_window: int | None = None,
) -> Iterator[dict]:
    """Same as build_feature_windows, but yields one window (as a dict) at
    a time, in window order — lets a caller (the orchestrator) emit a
    stage:feature_extraction event per window instead of waiting for the
    whole matrix to build. See build_feature_windows for `rows_per_window`."""
    matrix = build_feature_windows(
        flow_df, packet_records, window_seconds=window_seconds, normalize=normalize, rows_per_window=rows_per_window
    )
    for _, row in matrix.iterrows():
        yield row.to_dict()
