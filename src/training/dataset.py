"""Turn the cached per-file windows (data/processed/windows/*.pkl, built
by build_windows_cache.py) into (context_windows, target_window)
training examples.

Split is temporal and per-file: the last `val_fraction` of each file's
windows become validation, the rest training. Per-file (not by whole day)
because some attack labels only ever appear in one file (e.g. PortScan
only in Friday-Afternoon-PortScan) -- holding out entire files would mean
the model never sees some classes during training at all.
"""

from __future__ import annotations

import pickle
from pathlib import Path

WINDOWS_DIR = Path("data/processed/windows")


def load_all_windows(windows_dir: Path = WINDOWS_DIR) -> dict[str, list[dict]]:
    """file_stem -> list of window dicts, in original (file) order."""
    result = {}
    for f in sorted(windows_dir.glob("*.pkl")):
        with f.open("rb") as fh:
            result[f.stem] = pickle.load(fh)
    return result


def build_examples(
    windows_by_file: dict[str, list[dict]],
    context_len: int = 3,
    val_fraction: float = 0.2,
) -> tuple[list[tuple[list[dict], dict]], list[tuple[list[dict], dict]]]:
    """Sliding-window (context, target) examples per file: context is
    `context_len` consecutive windows, target is the very next one.
    Returns (train_examples, val_examples)."""
    train, val = [], []
    for windows in windows_by_file.values():
        n = len(windows)
        if n <= context_len:
            continue
        split_idx = int(n * (1 - val_fraction))
        for i in range(n - context_len):
            example = (windows[i : i + context_len], windows[i + context_len])
            (train if i + context_len < split_idx else val).append(example)
    return train, val
