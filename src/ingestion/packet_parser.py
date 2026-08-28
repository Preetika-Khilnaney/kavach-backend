"""
Packet-level feature extraction from raw PCAP files using Scapy.

Produces a DataFrame with the 10 packet-level features per session (5-tuple)
that match the architecture spec:
    TTL mean/variance, TCP window mean/variance, IP fragment ratio,
    payload entropy mean, payload size mean/std,
    port access entropy, retransmission ratio.
"""

import math
import numpy as np
import pandas as pd

try:
    from scapy.all import PcapReader, IP, TCP, UDP
    HAS_SCAPY = True
except ImportError:
    HAS_SCAPY = False


def _shannon_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    freq = {}
    for b in data:
        freq[b] = freq.get(b, 0) + 1
    n = len(data)
    return -sum((c / n) * math.log2(c / n) for c in freq.values())


def parse_pcap(path: str) -> pd.DataFrame:
    """
    Parse a PCAP file and return a DataFrame of per-session packet-level features.

    Columns
    -------
    src_ip, dst_ip, src_port, dst_port, protocol,
    ttl_mean, ttl_var, tcp_win_mean, tcp_win_var,
    ip_frag_ratio, payload_entropy_mean,
    payload_size_mean, payload_size_std,
    port_entropy, retransmission_ratio, timestamp
    """
    if not HAS_SCAPY:
        raise ImportError(
            "scapy is required for PCAP parsing. "
            "Install it with: pip install scapy"
        )

    # sessions[5-tuple] = list of packet records
    sessions: dict[tuple, list[dict]] = {}

    with PcapReader(path) as reader:
        for pkt in reader:
            if not pkt.haslayer(IP):
                continue

            ip   = pkt[IP]
            src_ip, dst_ip = ip.src, ip.dst
            proto = ip.proto
            src_port = dst_port = 0
            tcp_win = 0
            is_retrans = False
            seq = None

            if pkt.haslayer(TCP):
                t = pkt[TCP]
                src_port, dst_port = t.sport, t.dport
                tcp_win = t.window
                seq = t.seq

            elif pkt.haslayer(UDP):
                u = pkt[UDP]
                src_port, dst_port = u.sport, u.dport

            key = (src_ip, dst_ip, src_port, dst_port, proto)

            # Raw payload (bytes after transport header)
            raw_payload = bytes(ip.payload.payload) if ip.payload else b""

            frag_flag = int(bool(ip.flags.MF or ip.frag > 0))

            record = {
                "ttl":         ip.ttl,
                "tcp_win":     tcp_win,
                "frag":        frag_flag,
                "payload_len": len(raw_payload),
                "entropy":     _shannon_entropy(raw_payload),
                "seq":         seq,
                "timestamp":   float(pkt.time),
            }

            if key not in sessions:
                sessions[key] = []
            sessions[key].append(record)

    rows = []
    for (src_ip, dst_ip, src_port, dst_port, proto), pkts in sessions.items():
        ttls  = [p["ttl"] for p in pkts]
        wins  = [p["tcp_win"] for p in pkts]
        frags = [p["frag"] for p in pkts]
        lens  = [p["payload_len"] for p in pkts]
        ents  = [p["entropy"] for p in pkts]
        seqs  = [p["seq"] for p in pkts if p["seq"] is not None]

        # Retransmission detection: repeated SEQ numbers
        retrans = (len(seqs) - len(set(seqs))) / max(len(seqs), 1)

        # Port access entropy: unique dst_ports reached by same src_ip
        # (approximated at session level; full calculation needs all sessions)
        port_entropy = 0.0   # filled post-aggregation below

        rows.append({
            "src_ip":               src_ip,
            "dst_ip":               dst_ip,
            "src_port":             src_port,
            "dst_port":             dst_port,
            "protocol":             proto,
            "timestamp":            pkts[0]["timestamp"],
            "ttl_mean":             float(np.mean(ttls)),
            "ttl_var":              float(np.var(ttls)),
            "tcp_win_mean":         float(np.mean(wins)),
            "tcp_win_var":          float(np.var(wins)),
            "ip_frag_ratio":        float(np.mean(frags)),
            "payload_entropy_mean": float(np.mean(ents)),
            "payload_size_mean":    float(np.mean(lens)),
            "payload_size_std":     float(np.std(lens)),
            "retransmission_ratio": float(retrans),
            "port_entropy":         port_entropy,
        })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)

    # Compute port access entropy per source IP
    def _port_entropy(grp):
        ports = grp["dst_port"].value_counts(normalize=True)
        h = -(ports * np.log2(ports + 1e-12)).sum()
        return h

    port_ent = df.groupby("src_ip").apply(_port_entropy).rename("port_entropy_src")
    df = df.merge(port_ent, left_on="src_ip", right_index=True, how="left")
    df["port_entropy"] = df["port_entropy_src"].fillna(0.0)
    df.drop(columns=["port_entropy_src"], inplace=True)

    return df
