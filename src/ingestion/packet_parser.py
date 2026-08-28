"""Stream packet-level features out of a raw PCAP/PCAPNG capture.

Captures in this project (data/raw/PCAP/*.pcap) are tens of GB, so this
module never loads a file into memory: `scapy.all.PcapReader` is a
generator that reads one packet at a time off disk and auto-detects both
classic pcap and pcapng framing (the CIC-IDS-2017 captures are pcapng).

Extracts exactly the packet_level features listed in configs/config.yaml
(ttl_variance is computed by the caller over a window; per-packet we emit
raw `ttl` so that aggregation can happen at any window size), plus the two
running-heuristics the architecture doc calls out: retransmission counts
and a port-scan signature.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Iterator

from scapy.all import IP, TCP, UDP, PcapReader

# Port-scan heuristic: a single source IP touching this many distinct
# (dst_ip, dst_port) pairs within PORT_SCAN_WINDOW_SECONDS looks like a scan.
PORT_SCAN_DISTINCT_TARGETS = 20
PORT_SCAN_WINDOW_SECONDS = 5.0


@dataclass
class _FlowState:
    """Per-flow bookkeeping used for retransmission detection.

    Bounded by construction: keyed on the 5-tuple, so it only grows with
    the number of concurrent flows in the batch being processed, not with
    packet count.
    """

    seen_seqs: set = field(default_factory=set)


@dataclass
class _ScanState:
    """Recent (timestamp, dst_ip, dst_port) targets per source IP, for the
    port-scan heuristic. A deque bounded by time keeps this from growing
    unbounded over a long-running capture.
    """

    recent: deque = field(default_factory=deque)
    targets: set = field(default_factory=set)


def _flow_key(ip_layer, proto_layer, proto_name: str) -> tuple:
    return (ip_layer.src, ip_layer.dst, getattr(proto_layer, "sport", None), getattr(proto_layer, "dport", None), proto_name)


def _record_from_packet(pkt, flow_states: dict, scan_states: dict) -> dict | None:
    if not pkt.haslayer(IP):
        return None
    ip = pkt[IP]
    proto_name = "OTHER"
    sport = dport = None
    tcp_flags = None
    tcp_window = None
    is_retransmission = False

    if pkt.haslayer(TCP):
        tcp = pkt[TCP]
        proto_name = "TCP"
        sport, dport = tcp.sport, tcp.dport
        tcp_flags = int(tcp.flags)
        tcp_window = int(tcp.window)

        key = _flow_key(ip, tcp, proto_name)
        state = flow_states.setdefault(key, _FlowState())
        if tcp.seq in state.seen_seqs and len(tcp.payload) > 0:
            is_retransmission = True
        state.seen_seqs.add(tcp.seq)
    elif pkt.haslayer(UDP):
        udp = pkt[UDP]
        proto_name = "UDP"
        sport, dport = udp.sport, udp.dport

    fragment_flag = bool(ip.frag > 0 or (int(ip.flags) & 0x1))  # MF bit or nonzero offset
    payload_size = len(bytes(pkt.payload.payload)) if pkt.haslayer(IP) else len(bytes(pkt))
    timestamp = float(pkt.time)

    port_scan_signature = False
    if dport is not None:
        scan_state = scan_states.setdefault(ip.src, _ScanState())
        scan_state.recent.append((timestamp, ip.dst, dport))
        scan_state.targets.add((ip.dst, dport))
        while scan_state.recent and timestamp - scan_state.recent[0][0] > PORT_SCAN_WINDOW_SECONDS:
            old_ts, old_dst, old_port = scan_state.recent.popleft()
            scan_state.targets.discard((old_dst, old_port))
        port_scan_signature = len(scan_state.targets) >= PORT_SCAN_DISTINCT_TARGETS

    return {
        "timestamp": timestamp,
        "src_ip": ip.src,
        "dst_ip": ip.dst,
        "src_port": sport,
        "dst_port": dport,
        "protocol": proto_name,
        "ttl": int(ip.ttl),
        "tcp_window_size": tcp_window,
        "tcp_flags": tcp_flags,
        "fragment_flag": fragment_flag,
        "payload_size": payload_size,
        "is_retransmission": is_retransmission,
        "port_scan_signature": port_scan_signature,
    }


def iter_packets(path: str, batch_size: int = 5_000, max_packets: int | None = None) -> Iterator[list[dict]]:
    """Stream a capture and yield lists of `batch_size` normalized packet
    records at a time, so the orchestrator can emit a stage:ingestion
    progress event per batch instead of waiting for the whole file.

    `max_packets` bounds how much of a (potentially 10+ GB) capture gets
    read — pass None to process the whole file.
    """
    flow_states: dict = defaultdict(_FlowState)
    scan_states: dict = defaultdict(_ScanState)
    batch: list[dict] = []
    n_read = 0

    with PcapReader(path) as reader:
        for pkt in reader:
            record = _record_from_packet(pkt, flow_states, scan_states)
            n_read += 1
            if record is not None:
                batch.append(record)
                if len(batch) >= batch_size:
                    yield batch
                    batch = []
            if max_packets is not None and n_read >= max_packets:
                break

    if batch:
        yield batch


def parse_pcap(path: str, max_packets: int | None = None) -> list[dict]:
    """Parse a whole capture into a flat list of packet records.

    Convenience wrapper around `iter_packets` for small captures / tests.
    For the multi-GB captures in this project, prefer `iter_packets` so you
    don't hold the whole thing in memory.
    """
    records: list[dict] = []
    for batch in iter_packets(path, batch_size=10_000, max_packets=max_packets):
        records.extend(batch)
    return records
