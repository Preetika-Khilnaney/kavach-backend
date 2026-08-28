"""Ingestion pipeline tests, run against small synthetic fixtures rather
than the real (multi-GB / hundreds-of-MB) datasets in data/raw/."""

import pandas as pd
from scapy.all import IP, TCP, Ether, wrpcap

from src.ingestion import flow_parser, packet_parser

CSV_COLUMNS = (
    " Destination Port, Flow Duration, Total Fwd Packets, Total Backward Packets,"
    "Total Length of Fwd Packets, Total Length of Bwd Packets, Flow IAT Mean, "
    "Flow IAT Std, Flow IAT Max, Flow IAT Min,FIN Flag Count, SYN Flag Count, "
    "RST Flag Count, PSH Flag Count, ACK Flag Count, URG Flag Count, "
    "CWE Flag Count, ECE Flag Count, Label"
)
CSV_ROWS = [
    "80,1000000,3,2,120,80,250000,0,250000,250000,0,1,0,0,1,0,0,0,BENIGN",
    "445,2000000,10,10,900,900,200000,0,200000,200000,1,1,0,1,1,0,0,0,PortScan",
]


def test_load_flow_csv_normalizes_schema(tmp_path):
    csv_path = tmp_path / "Monday-WorkingHours.pcap_ISCX.csv"
    csv_path.write_text(CSV_COLUMNS + "\n" + "\n".join(CSV_ROWS) + "\n")

    df = flow_parser.load_flow_csv(str(csv_path))

    assert len(df) == 2
    assert list(df["dst_port"]) == [80, 445]
    assert df["src_ip"].isna().all()  # not present in this dataset
    assert df["label"].tolist() == ["BENIGN", "PortScan"]
    assert (df["bytes"] == df["fwd_bytes"] + df["bwd_bytes"]).all()
    # SYN(0x02) + ACK(0x10) for row 0; FIN+SYN+PSH+ACK for row 1.
    assert df["tcp_flags"].iloc[0] == 0x02 | 0x10
    assert df["tcp_flags"].iloc[1] == 0x01 | 0x02 | 0x08 | 0x10
    # timestamps must be monotonically non-decreasing within a file.
    assert pd.Series(df["timestamp"]).is_monotonic_increasing


def test_iter_flow_csv_batches_sum_to_full_file(tmp_path):
    csv_path = tmp_path / "Tuesday-WorkingHours.pcap_ISCX.csv"
    csv_path.write_text(CSV_COLUMNS + "\n" + "\n".join(CSV_ROWS) + "\n")

    total = sum(len(chunk) for chunk in flow_parser.iter_flow_csv(str(csv_path), chunksize=1))
    assert total == 2


def _write_tcp_packet(seq, sport=51000, dport=80, src="10.0.0.1", dst="10.0.0.2", ttl=55, window=1024, flags="S"):
    return Ether() / IP(src=src, dst=dst, ttl=ttl) / TCP(sport=sport, dport=dport, seq=seq, window=window, flags=flags) / b"payload"


def test_parse_pcap_extracts_features_and_retransmission(tmp_path):
    pcap_path = tmp_path / "sample.pcap"
    packets = [
        _write_tcp_packet(seq=100),
        _write_tcp_packet(seq=100),  # same seq + payload -> retransmission
        _write_tcp_packet(seq=200, flags="A"),
    ]
    for i, pkt in enumerate(packets):
        pkt.time = 1000.0 + i
    wrpcap(str(pcap_path), packets)

    records = packet_parser.parse_pcap(str(pcap_path))

    assert len(records) == 3
    assert records[0]["ttl"] == 55
    assert records[0]["tcp_window_size"] == 1024
    assert records[0]["protocol"] == "TCP"
    assert records[0]["is_retransmission"] is False
    assert records[1]["is_retransmission"] is True
    assert records[2]["is_retransmission"] is False


def test_parse_pcap_flags_port_scan(tmp_path):
    pcap_path = tmp_path / "scan.pcap"
    packets = []
    for port in range(25):
        pkt = _write_tcp_packet(seq=port, dport=port + 1, flags="S")
        pkt.time = 1000.0 + port * 0.01
        packets.append(pkt)
    wrpcap(str(pcap_path), packets)

    records = packet_parser.parse_pcap(str(pcap_path))

    assert not any(r["port_scan_signature"] for r in records[:19])
    assert any(r["port_scan_signature"] for r in records[19:])


def test_iter_packets_batches(tmp_path):
    pcap_path = tmp_path / "batches.pcap"
    packets = [_write_tcp_packet(seq=i, dport=80) for i in range(5)]
    for i, pkt in enumerate(packets):
        pkt.time = 1000.0 + i
    wrpcap(str(pcap_path), packets)

    batches = list(packet_parser.iter_packets(str(pcap_path), batch_size=2))
    assert [len(b) for b in batches] == [2, 2, 1]
