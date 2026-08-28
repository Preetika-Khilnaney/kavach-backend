"""Parse packet-level features from raw PCAP files.

TODO (build order step 3): implement using Scapy or PyShark.
- Iterate packets, extract TTL, TCP window size, fragment flags, payload
  size, and detect retransmissions / port-scan signatures.
- Return records at the same granularity/timestamp alignment as
  flow_parser.py's output so both can be joined during windowing.
"""


def parse_pcap(path: str):
    raise NotImplementedError(
        "Iterate packets with Scapy/PyShark and extract the packet_level "
        "features listed in configs/config.yaml."
    )
