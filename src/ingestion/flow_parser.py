"""Load flow-level records from CIC-IDS-2018 / CTU-13 CSVs.

TODO (build order step 3): implement using pandas.
- Read a CIC-IDS-2018 or CTU-13 CSV.
- Normalize column names/types into the schema defined in configs/config.yaml
  under features.flow_level.
- Return a DataFrame indexed by timestamp, ready for windowing in
  src/features/extract.py.
"""

import pandas as pd


def load_flow_csv(path: str) -> pd.DataFrame:
    raise NotImplementedError(
        "Load the CSV with pandas, normalize columns to the flow_level "
        "schema in configs/config.yaml, and parse timestamps."
    )
