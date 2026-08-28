# Kavach backend — starter scaffold

Backend skeleton for the NetJEPA world-model pipeline (SIH 2026, problem statement 26153).
Matches the architecture from the technical approach slide: ingestion -> feature extraction ->
graph state -> NetJEPA world model -> scoring/stage mapping -> explainability -> API/streaming.

## What's implemented vs. stubbed

**Implemented (runs as-is):**
- `src/ingestion/flow_parser.py` — streams and normalizes the CIC-IDS-2017 "MachineLearningCVE"
  flow CSVs (see Datasets below). Read the module docstring: this dataset release has no
  src/dst IP, no protocol column, and no real per-flow timestamp, so those are synthesized/left
  NaN. For Monday and Wednesday specifically, pass `pcap_path=` (or `pcap_dir=` to
  `load_flow_dir`) to anchor the synthesized timestamp to that day's real PCAP start time
  instead of a generic 9am guess — still not a real per-flow timestamp, just a better anchor.
  Tuesday/Thursday/Friday have no matching PCAP, so they stay on the guess.
- `src/ingestion/packet_parser.py` — streams PCAP/PCAPNG captures packet-by-packet via Scapy
  (never loads a file into memory, so it's safe against the 10-13 GB captures in this project).
  Extracts TTL, TCP window size, fragment flags, payload size, a retransmission flag (same
  5-tuple + seq number seen twice), and a sliding-window port-scan signature.
- `src/features/extract.py` — windows flow_parser/packet_parser output into one aggregate
  feature vector per `windowing.window_seconds` (tumbling windows), z-score normalized. Flow
  and packet records are windowed independently and merged on `window_start` only if you pass
  both — read the module docstring before doing that with two unrelated captures.
- `src/orchestrator/pipeline.py` — every stage is wired to real code. Ingestion streams one
  `stage:ingestion` event per batch; once it finishes, each window flows through
  feature_extraction -> state_representation -> forward_pass -> rollout -> attack_mapping ->
  explainability before the next window starts (one event per stage per window). See
  `src/orchestrator/model_registry.py` on the trained/untrained fallback below — every payload
  from state_representation onward carries a `trained: bool` so a consumer can tell whether
  a prediction is real. Explainability is skipped for low-infiltration-probability windows
  (Captum is too slow to run on every window of a large capture) — see
  `_EXPLAIN_INFILTRATION_THRESHOLD`.
- `src/orchestrator/model_registry.py` — loads `data/processed/netjepa_weights.pt` if it
  exists, hot-reloading if the file changes (training finishes, or saves a newer epoch) with
  no server restart needed. Falls back to a freshly-initialized (untrained, random) model if
  no checkpoint exists yet, so the pipeline still runs end-to-end either way.
- `src/storage/results_store.py` — the architecture doc's Results Store: SQLite, one row per
  processed window (predictions, attack-stage mapping, explainability output), written by
  `pipeline.py` as it runs. Backs `GET /flows`, `/flows/{id}`, `/alerts`, `/kill-chain`, and
  `/risk-score` (`src/api/adapters.py` maps rows into the frontend's shapes — read its
  docstring on which Flow fields are real vs. honest placeholders; this dataset has no real
  per-window port/protocol, and `bytes`/`duration`/`iat*` stay 0 rather than display a
  z-score-normalized value with a misleading "seconds"/"bytes" label).
- Live-pipeline safety caps: a CSV's time-based windowing can produce 100k+ windows on one
  file (flow_parser's synthesized-timestamp inflation — see its docstring), so
  `run_pipeline`'s `max_windows` (default 500) caps how many go through the full model
  pipeline live, the same way `max_packets` already capped PCAP parsing. Pass `None` for a
  real offline/batch pass over everything.
- Frontend pages now on real data (not mock): Ingestion, Benchmark, Operations (risk score,
  kill chain, alerts), Flow Explorer, and all three Model Internals pages (Pipeline/Network/
  Forecast — `frontend/src/api/websocket.ts` wires `/ws/pipeline` in directly; the Ingest
  page's "Inspect Pipeline 3D Internals" button carries the uploaded file's path through as a
  `capturePath` query param so the Internals pages watch that exact capture, not a placeholder).
  The Forecast page shows NetJEPA's actual rollout — one real autoregressive trajectory, not a
  branching tree with fabricated alternative-probability branches like the original mock. Still
  mocked: the infiltration timeline chart, network graph (Operations-level, different from the
  Internals live graph), provenance, audit trail, and feedback persistence.
- `src/api/main.py` — FastAPI app with a REST upload endpoint and a WebSocket that streams
  pipeline stage events, plus a `POST /ingest/upload` -> background job -> `GET /jobs/{id}/progress`
  flow backing the frontend's ingestion page.
- `src/graph/state_builder.py` — builds a graph snapshot from one feature window. Every window
  gets a "network" node (its own aggregate feature vector); "host" nodes only get added when the
  window carries real observed (src_ip, dst_ip) pairs, which only happens for PCAP-derived
  windows — MachineLearningCVE CSV windows have no real IPs (see flow_parser above), so their
  graphs are always network-node-only. Read the module docstring before expecting more.
- `src/models/netjepa.py` — HGT spatial encoder -> GRU temporal encoder -> K-step predictor,
  with an EMA target path for VICReg training. Falls back to a plain MLP when torch-geometric
  isn't installed. **BatchNorm on the encoder output is load-bearing, not decorative** — an
  early real training run collapsed to a near-constant embedding within ~20 steps regardless of
  VICReg's variance/covariance loss weight (a known BYOL/SimSiam failure mode: collapse is a
  cheaper way to satisfy the unbounded invariance term than the capped variance penalty can
  counteract). BatchNorm fixes it structurally instead of just penalizing it. See the module
  docstring and `tests/test_netjepa.py::test_batchnorm_keeps_embeddings_spread_out_not_collapsed`
  before removing it.
- `src/scoring/infiltration.py`, `src/scoring/attack_stage.py` — downstream heads mapping a
  NetJEPA embedding to an infiltration probability curve / a 6-class MITRE ATT&CK stage
  (Benign + the 5 kill-chain stages the labels in data/raw/CSV/MachineLearningCVE map to).
- `src/explainability/shap_explainer.py` — Captum IntegratedGradients (falls back to gradient
  x input) attributing a scoring head's output back to the window's own named features
  (`state_builder.CANONICAL_FEATURE_NAMES`) — real feature names, not `feature_0, feature_1, ...`.
- `src/models/losses.py` — VICReg loss (invariance + variance + covariance terms), used to
  prevent representation collapse in the encoder.
- `src/training/` — the training pipeline: `build_windows_cache.py` windows every CSV to
  `data/processed/windows/*.pkl` (row-count windows, not time windows — see its docstring on why:
  flow_parser's synthesized timestamp inflates wildly on unanchored days), `labels.py` derives
  infiltration/attack-stage labels from each window's *observed* labels (not the majority vote —
  rare attacks like Infiltration, 35/2887 windows, would never win a majority once windows span
  100+ rows), `dataset.py` builds context/target training examples with a per-file temporal
  train/val split, and `train.py` runs the actual training loop. Run:
  `python -m src.training.build_windows_cache` then `python -m src.training.train`.
- `src/benchmark/evaluate.py` — the architecture doc's Benchmark/Evaluation Module: trains a
  logistic regression baseline on the same windowed features, and reports F1/precision/recall/
  false-positive-rate for it alongside NetJEPA's infiltration head, on the *same* held-out
  validation windows `src.training.train` used (apples-to-apples). Binary infiltration task only
  (BENIGN vs any-attack) — FPR specifically is a binary-classification concept, and that's what
  the doc asks for; the 6-class MITRE stage head isn't benchmarked here. Exposed via
  `GET /benchmark`; cached on the checkpoint's mtime so repeated calls don't retrain the baseline
  and re-run inference over the whole validation set for nothing. Reports `"note"` instead of
  metrics for NetJEPA if no checkpoint exists yet.

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
events for every stage off that file, window by window. Connect to `/ws/pipeline` with no query
param to get the placeholder demo stream instead. Check each event's `payload.trained` from
state_representation onward — `false` until `python -m src.training.train` has produced
`data/processed/netjepa_weights.pt`.

## Suggested build order

1. ~~`src/ingestion/flow_parser.py` + `src/ingestion/packet_parser.py`, wired into the
   orchestrator's ingestion stage.~~ Done — see `tests/test_ingestion.py`, `tests/test_pipeline.py`.
2. ~~`src/features/extract.py` — windowed feature matrix, wired into the orchestrator's
   `feature_extraction` stage.~~ Done — see `tests/test_extract.py`, `tests/test_pipeline.py`.
3. ~~`src/graph/state_builder.py` — turn a window into a `(V_t, E_t)` graph snapshot.~~ Done —
   see `tests/test_state_builder.py`.
4. ~~`src/models/netjepa.py` — HGT+GRU world model architecture.~~ Done — see
   `tests/test_netjepa.py` and the BatchNorm caveat above.
5. ~~`src/scoring/`, `src/explainability/` — downstream heads.~~ Done — see
   `tests/test_scoring.py`, `tests/test_shap_explainer.py`.
6. ~~Wire `state_representation` / `forward_pass` / `rollout` / `attack_mapping` /
   `explainability` in `src/orchestrator/pipeline.py`.~~ Done — see
   `src/orchestrator/model_registry.py` and `tests/test_pipeline.py`'s
   `test_run_pipeline_model_stages_*` tests.
7. ~~`src/training/` — training loop.~~ Done, code-wise; **run it** —
   `python -m src.training.build_windows_cache && python -m src.training.train` — and let it
   finish before trusting any `trained: true` payload's numbers. Next real step after that:
   look at `data/processed/training_metrics.jsonl` (val_vicreg, val_embed_std) and decide if
   more epochs / more data / actual hyperparameter tuning is worth it, since this training setup
   (small batch, no LR schedule, no real graph batching — see train.py's docstring) is a first
   working pass, not a tuned one.
8. ~~`src/benchmark/evaluate.py` — baseline vs. NetJEPA, `GET /benchmark`.~~ Done — see
   `tests/test_benchmark.py`. Still open: only the two `data/raw/PCAP` days get real IPs; a
   results store + replay mode (architecture doc's other spec'd mode) doesn't exist yet; and
   most of the frontend beyond the Ingest page is still mock data — see the loose-ends list from
   earlier in this conversation for the fuller picture.
