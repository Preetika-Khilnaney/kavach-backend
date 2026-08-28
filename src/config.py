"""Loads configs/config.yaml once and caches it."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "config.yaml"


@lru_cache(maxsize=None)
def load_config(path: str | None = None) -> dict:
    with open(path or _DEFAULT_CONFIG_PATH) as f:
        return yaml.safe_load(f)
