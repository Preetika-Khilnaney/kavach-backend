# Kavach backend — starter scaffold

Backend skeleton for the NetJEPA world-model pipeline (SIH 2026, problem statement 26153).
Matches the architecture from the technical approach slide: ingestion -> feature extraction ->
graph state -> NetJEPA world model -> scoring/stage mapping -> explainability -> API/streaming.

## What's implemented vs. stubbed

**Implemented (runs as-is):**
- `src/ingestion/flow_parser.py` — streams and normalizes the CIC-IDS-2017 "MachineLearningCVE"
  flow CSVs (see Datasets below). Read the module docstring: this dataset release has no
  src/dst IP, no protocol column, and no real per-flow timestamp, so those are synthesized/left
  NaN — pair with the raw PCAPs when you need real host identity or wall-clock time.
- `src/ingestion/packet_parser.py` — streams PCAP/PCAPNG captures packet-by-packet via Scapy
  (never loads a file into memory, so it's safe against the 10-13 GB captures in this project).
  Extracts TTL, TCP window size, fragment flags, payload size, a retransmission flag (same
  5-tuple + seq number seen twice), and a sliding-window port-scan signature.
- `src/orchestrator/pipeline.py` — the ingestion stage now runs the real parsers above and
  streams one `stage:ingestion` event per batch (`in_progress`) plus a final `complete` event
  with totals, matching the event schema in the architecture doc. Every stage after ingestion
  (feature extraction onward) still emits placeholder events — see TODOs inline.
- `src/api/main.py` — FastAPI app with a REST upload endpoint and a WebSocket that streams
  pipeline stage events. `/ws/pipeline?capture_path=<path from /ingest/upload>` now runs
  ingestion over the uploaded file; omit the query param to get the placeholder demo stream.
- `src/models/losses.py` — VICReg loss (invariance + variance + covariance terms), used to
  prevent representation collapse in the encoder.
- `src/models/netjepa.py` — context encoder / EMA target encoder / predictor skeleton, using
  plain MLPs so it runs without a GPU or PyG install. Swap `ContextEncoder` for an HGT-based
  encoder once the graph pipeline is ready (see TODOs inline).

**Stubbed (next up):**
- `src/features/extract.py` — windowed flow+packet feature matrix construction (join the
  normalized records from flow_parser/packet_parser into fixed time windows).
- `src/graph/state_builder.py` — builds G_t = (V_t, E_t) from a feature window.
- `src/scoring/infiltration.py`, `src/scoring/attack_stage.py` — rollout scoring, MITRE mapping.
- `src/explainability/shap_explainer.py` — SHAP/Captum-based attribution.

## Datasets

`data/raw/CSV/MachineLearningCVE/` (committed via Git LFS) has all 8 CSVs from the CIC-IDS-2017
"MachineLearningCVE" release — the full Monday-Friday capture week, pre-flowed with
CICFlowMeter. Between them they already cover the full attack taxonomy the architecture doc's
kill-chain mapping needs:

| Day | Labels |
|---|---|
| Monday | BENIGN only (baseline) |
| Tuesday | FTP-Patator, SSH-Patator (brute force / initial access) |
| Wednesday | DoS Hulk, GoldenEye, Slowloris, Slowhttptest, Heartbleed |
| Thursday | Web Attack (Brute Force/XSS/SQLi), Infiltration |
| Friday | Bot (C2), PortScan (recon), DDoS |

`data/raw/PCAP/` holds the two raw captures (Monday = benign baseline, Wednesday = DoS/DDoS-heavy)
that back the packet-level ingestion path — too large for git, linked from here via Google Drive
once uploaded:
- Monday-WorkingHours.pcap — `<drive link>`
- Wednesday-workingHours.pcap — `<drive link>`

**Do you need more datasets?** No, not for the pipeline as designed. The 8 CSVs already give you
every attack category the MITRE stage-mapper needs, and the two PCAPs are enough to exercise the
raw-packet ingestion path (Scapy parsing, host graph, TTL/window/fragmentation/retransmission
features) on both a clean day and an attack-heavy day — you don't need PCAPs for every day, since
the flow-level CSVs already cover the rest. The one thing worth adding later, not now, is a
CTU-13 capture if you want a *real* botnet C2 pcap to demo — the "Bot" label above is flow-level
only, so there's no packet capture with genuine C2 beaconing to point the packet-level path at.
That's an enhancement, not a gap in the current build.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run the API

```bash
uvicorn src.api.main:app --reload
```

POST a CSV or PCAP to `/ingest/upload`, then connect a WebSocket client to
`ws://localhost:8000/ws/pipeline?capture_path=<path from the upload response>` to stream real
`stage:ingestion` events off that file (batch-by-batch progress, then a `complete` event with
totals). Connect to `/ws/pipeline` with no query param to get the placeholder demo stream instead
— every stage after ingestion is still placeholder data until the rest of the build order below
is done.

## Suggested build order

1. ~~`src/ingestion/flow_parser.py` + `src/ingestion/packet_parser.py`, wired into the
   orchestrator's ingestion stage.~~ Done — see `tests/test_ingestion.py`, `tests/test_pipeline.py`.
2. `src/features/extract.py` — windowed feature matrix, joining flow_parser + packet_parser
   output on the `timestamp`/`window_seconds` config.
3. `src/graph/state_builder.py` — turn a window into a `(V_t, E_t)` graph snapshot.
4. Wire real data into `NetJEPA.forward` in place of the placeholder tensors, verify the
   VICReg loss decreases over a few epochs without collapsing (check embedding std stays > 0).
5. `src/scoring/`, `src/explainability/` — downstream heads on top of trained embeddings.
6. Replace the remaining placeholder stages in `src/orchestrator/pipeline.py` (everything after
   ingestion) with real stage calls — the event schema and API layer don't need to change.
