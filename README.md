# Kavach backend — starter scaffold

Backend skeleton for the NetJEPA world-model pipeline (SIH 2026, problem statement 26153).
Matches the architecture from the technical approach slide: ingestion -> feature extraction ->
graph state -> NetJEPA world model -> scoring/stage mapping -> explainability -> API/streaming.

## What's implemented vs. stubbed

**Implemented (runs as-is):**
- `src/models/losses.py` — VICReg loss (invariance + variance + covariance terms), used to
  prevent representation collapse in the encoder.
- `src/models/netjepa.py` — context encoder / EMA target encoder / predictor skeleton, using
  plain MLPs so it runs without a GPU or PyG install. Swap `ContextEncoder` for an HGT-based
  encoder once the graph pipeline is ready (see TODOs inline).
- `src/api/main.py` — FastAPI app with a REST upload endpoint and a WebSocket that streams
  pipeline stage events, matching the event schema from the architecture doc.
- `src/orchestrator/pipeline.py` — async generator that runs the stages in order and yields
  events. Currently runs on placeholder data so you can see the event stream end-to-end before
  any model is trained.

**Stubbed (dataset/model work goes here next):**
- `src/ingestion/flow_parser.py` — CIC-IDS-2018 / CTU-13 CSV loading.
- `src/ingestion/packet_parser.py` — PCAP parsing via Scapy/PyShark.
- `src/features/extract.py` — windowed flow+packet feature matrix construction.
- `src/graph/state_builder.py` — builds G_t = (V_t, E_t) from a feature window.
- `src/scoring/infiltration.py`, `src/scoring/attack_stage.py` — rollout scoring, MITRE mapping.
- `src/explainability/shap_explainer.py` — SHAP/Captum-based attribution.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run the API (event stream works today, on placeholder data)

```bash
uvicorn src.api.main:app --reload
```

Then connect a WebSocket client to `ws://localhost:8000/ws/pipeline` and POST a file to
`/ingest/upload` to see stage events stream in.

## Suggested build order

1. `src/ingestion/flow_parser.py` — get one CIC-IDS-2018 CSV loading and normalized.
2. `src/features/extract.py` — windowed feature matrix from that CSV.
3. `src/graph/state_builder.py` — turn a window into a `(V_t, E_t)` graph snapshot.
4. Wire real data into `NetJEPA.forward` in place of the placeholder tensors, verify the
   VICReg loss decreases over a few epochs without collapsing (check embedding std stays > 0).
5. `src/scoring/`, `src/explainability/` — downstream heads on top of trained embeddings.
6. Replace the placeholder pipeline in `src/orchestrator/pipeline.py` with real stage calls —
   the event schema and API layer don't need to change.
