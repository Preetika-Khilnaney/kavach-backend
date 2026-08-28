"""One-off script: window every MachineLearningCVE CSV and cache the
result to data/processed/windows/<stem>.pkl, so training doesn't re-parse
multi-hundred-MB CSVs on every run. This is the lightweight version of the
architecture doc's "feature store" -- windowed feature matrices, keyed by
capture, reused for training.

Run: python -m src.training.build_windows_cache
"""

from __future__ import annotations

import pickle
import time
from pathlib import Path

from src.config import load_config
from src.features import extract
from src.ingestion import flow_parser

CSV_DIR = Path("data/raw/CSV/MachineLearningCVE")
PCAP_DIR = Path("data/raw/PCAP")
OUT_DIR = Path("data/processed/windows")

# Row-count windowing, not time windowing (see extract.py's docstring on
# `rows_per_window`): flow_parser's synthesized timestamp inflates wildly
# on the 3 weekdays with no real PCAP anchor (one 530k-row day produced
# 109k 5-second time windows -- ~5 rows each, too sparse to train on).
ROWS_PER_WINDOW = 100


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for csv_path in sorted(CSV_DIR.glob("*.csv")):
        out_path = OUT_DIR / f"{csv_path.stem}.pkl"
        if out_path.exists():
            print(f"skip {csv_path.name} (cached)")
            continue

        pcap_path = flow_parser._guess_pcap_path(str(csv_path), str(PCAP_DIR))
        t0 = time.time()
        flow_df = flow_parser.load_flow_csv(str(csv_path), pcap_path=str(pcap_path) if pcap_path else None)
        windows = list(extract.iter_feature_windows(flow_df=flow_df, rows_per_window=ROWS_PER_WINDOW))
        with out_path.open("wb") as f:
            pickle.dump(windows, f)
        print(f"{csv_path.name}: {len(flow_df)} rows -> {len(windows)} windows "
              f"(pcap_anchor={pcap_path.name if pcap_path else None}) [{time.time()-t0:.1f}s]")


if __name__ == "__main__":
    main()
