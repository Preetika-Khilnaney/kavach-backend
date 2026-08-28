"""Feature-window tests, run against small synthetic flow/packet records."""

import pandas as pd

from src.features import extract


def _flow_df():
    return pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                ["2017-07-03 09:00:00", "2017-07-03 09:00:02", "2017-07-03 09:00:07"]
            ),
            "dst_port": [80, 443, 80],
            "tcp_flags": [0x02, 0x02 | 0x10, 0x01],
            "bytes": [100, 200, 50],
            "packets": [2, 4, 1],
            "duration": [1.0, 2.0, 0.5],
            "iat_mean": [0.1, 0.2, 0.3],
            "iat_var": [0.01, 0.02, 0.03],
            "iat_max": [0.5, 0.6, 0.7],
            "label": ["BENIGN", "PortScan", "BENIGN"],
        }
    )


def _packet_records():
    return [
        {"timestamp": 1000.0, "src_ip": "10.0.0.1", "dst_ip": "10.0.0.2", "ttl": 64, "tcp_window_size": 1024,
         "fragment_flag": False, "payload_size": 100, "is_retransmission": False, "port_scan_signature": False},
        {"timestamp": 1001.0, "src_ip": "10.0.0.1", "dst_ip": "10.0.0.3", "ttl": 60, "tcp_window_size": 2048,
         "fragment_flag": True, "payload_size": 200, "is_retransmission": True, "port_scan_signature": False},
        {"timestamp": 1006.0, "src_ip": "10.0.0.4", "dst_ip": "10.0.0.2", "ttl": 55, "tcp_window_size": 512,
         "fragment_flag": False, "payload_size": 50, "is_retransmission": False, "port_scan_signature": True},
    ]


def test_window_flow_only_buckets_by_window_seconds():
    matrix = extract.build_feature_windows(flow_df=_flow_df(), window_seconds=5, normalize=False)

    # rows 0,1 (t=0,2) fall in window [0,5); row 2 (t=7) falls in [5,10)
    assert len(matrix) == 2
    assert matrix["flow_count"].tolist() == [2, 1]
    assert matrix.loc[0, "flow_bytes_sum"] == 300
    assert matrix.loc[0, "flow_packets_sum"] == 6
    assert matrix.loc[0, "flow_tcp_flags_union"] == (0x02 | 0x10)
    assert matrix.loc[0, "flow_attack_ratio"] == 0.5
    assert matrix.loc[1, "flow_attack_ratio"] == 0.0
    # src_ip/dst_ip are all-NaN in this dataset -> columns must be omitted, not fabricated
    assert "flow_src_ip_nunique" not in matrix.columns


def test_window_packet_only_buckets_and_aggregates():
    matrix = extract.build_feature_windows(packet_records=_packet_records(), window_seconds=5, normalize=False)

    assert len(matrix) == 2  # t=1000,1001 -> window 1000; t=1006 -> window 1005
    assert matrix.loc[0, "packet_count"] == 2
    assert matrix.loc[0, "packet_retransmit_count"] == 1
    assert matrix.loc[0, "packet_fragment_rate"] == 0.5
    assert matrix.loc[0, "packet_src_ip_nunique"] == 1
    assert matrix.loc[0, "packet_dst_ip_nunique"] == 2
    assert matrix.loc[1, "packet_port_scan_flagged"] == True  # noqa: E712


def test_window_packet_records_capture_real_edges():
    matrix = extract.build_feature_windows(packet_records=_packet_records(), window_seconds=5, normalize=False)
    first_window_edges = set(matrix.loc[0, "packet_edges"])
    assert first_window_edges == {("10.0.0.1", "10.0.0.2"), ("10.0.0.1", "10.0.0.3")}
    second_window_edges = set(matrix.loc[1, "packet_edges"])
    assert second_window_edges == {("10.0.0.4", "10.0.0.2")}


def test_build_feature_windows_accepts_dataframe_packet_records():
    df = pd.DataFrame(_packet_records())
    matrix = extract.build_feature_windows(packet_records=df, window_seconds=5, normalize=False)
    assert len(matrix) == 2


def test_normalize_zero_means_unit_std_per_column():
    matrix = extract.build_feature_windows(flow_df=_flow_df(), window_seconds=5, normalize=True)
    skip = {"window_id", "window_start", "window_end", "flow_count"}
    numeric_cols = [c for c in matrix.columns if c not in skip and pd.api.types.is_numeric_dtype(matrix[c])]
    assert numeric_cols  # sanity: the exclusion above shouldn't accidentally empty this out
    for col in numeric_cols:
        assert abs(matrix[col].mean()) < 1e-9


def test_rows_per_window_ignores_synthetic_timestamp_spread():
    # 10 rows, each 5 rows apart in real time, but the "timestamp" column
    # is deliberately wild (mimicking flow_parser's synthetic-timeline
    # inflation) -- row-count windowing must ignore it entirely.
    df = _flow_df()
    wide_timestamps = pd.to_datetime(["2017-07-03 09:00:00", "2017-07-03 09:00:02", "2017-07-10 03:00:00"])
    df["timestamp"] = wide_timestamps

    matrix = extract.build_feature_windows(flow_df=df, rows_per_window=2, normalize=False)

    assert len(matrix) == 2  # 3 rows / 2 per window -> windows of size 2, 1
    assert matrix["flow_count"].tolist() == [2, 1]


def test_empty_inputs_return_empty_dataframe():
    assert extract.build_feature_windows().empty
    assert extract.build_feature_windows(flow_df=pd.DataFrame()).empty


def test_iter_feature_windows_yields_dicts_in_order():
    windows = list(extract.iter_feature_windows(flow_df=_flow_df(), window_seconds=5, normalize=False))
    assert len(windows) == 2
    assert windows[0]["window_start"] < windows[1]["window_start"]
    assert isinstance(windows[0], dict)


def test_merge_flow_and_packet_windows_on_window_start():
    flow_df = pd.DataFrame({
        "timestamp": pd.to_datetime(["1970-01-01 00:16:40"]),  # epoch 1000
        "bytes": [500],
    })
    matrix = extract.build_feature_windows(flow_df=flow_df, packet_records=_packet_records(), window_seconds=5, normalize=False)

    assert len(matrix) == 2
    row0 = matrix.loc[matrix["window_start"] == 1000].iloc[0]
    assert row0["flow_count"] == 1
    assert row0["packet_count"] == 2
