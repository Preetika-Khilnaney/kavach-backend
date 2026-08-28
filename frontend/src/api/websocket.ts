/**
 * Live pipeline event stream — connects to the backend's WebSocket
 * (src/api/main.py::pipeline_stream / src/orchestrator/pipeline.py), which
 * streams one event per {stage, window} as a capture is actually
 * processed. This is what makes the Model Internals pages real instead of
 * mocked: every event here is the backend genuinely narrating its own
 * execution, not a canned animation.
 *
 * Pass a capturePath (the `path` from POST /ingest/upload) to watch that
 * file being processed; omit it for the backend's placeholder demo
 * stream (see pipeline.py — a single, fake, instant pass through all 7
 * stages).
 */

import { useEffect, useRef, useState } from 'react';
import type { PipelineStage, NetworkNode, NetworkEdge } from './types';

export interface PipelineEvent {
  stage: string;
  window_id: string;
  timestamp: number;
  payload: Record<string, any>;
  status: 'in_progress' | 'complete';
}

const WS_BASE_URL = 'ws://localhost:8000';

export function usePipelineStream(capturePath?: string | null) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setEvents([]);
    setClosed(false);
    setError(null);
    setConnected(false);

    const url = capturePath
      ? `${WS_BASE_URL}/ws/pipeline?capture_path=${encodeURIComponent(capturePath)}`
      : `${WS_BASE_URL}/ws/pipeline`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      try {
        const event: PipelineEvent = JSON.parse(e.data);
        setEvents(prev => [...prev, event]);
      } catch {
        // ignore malformed frames rather than crash the stream
      }
    };
    ws.onerror = () => setError(new Error('WebSocket connection error — is the backend running on :8000?'));
    ws.onclose = () => {
      setConnected(false);
      setClosed(true);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturePath]);

  return { events, connected, closed, error };
}

// ── Deriving frontend shapes from the raw event stream ──────────────────────

const STAGE_ORDER = [
  'ingestion', 'feature_extraction', 'state_representation',
  'forward_pass', 'rollout', 'attack_mapping', 'explainability',
] as const;

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  ingestion: 'Ingestion',
  feature_extraction: 'Feature Extraction',
  state_representation: 'State Representation',
  forward_pass: 'Sequence Model Forward Pass',
  rollout: 'K-Step Forecast Rollout',
  attack_mapping: 'Attack Stage Mapping',
  explainability: 'Explainability',
};

function describeEvent(stage: string, payload: any): string {
  switch (stage) {
    case 'ingestion':
      if (payload.source === 'placeholder') return 'Placeholder demo stream (no capture_path given)';
      return payload.records_total != null
        ? `Ingested ${payload.records_total} records so far from ${payload.source ?? 'capture'}`
        : 'Waiting for ingestion…';
    case 'feature_extraction': {
      const fv = payload.feature_vector;
      if (!fv || (Array.isArray(fv) && fv.length === 0)) return 'No feature window built yet';
      const count = payload.window_count ?? 1;
      const idx = (payload.window_index ?? 0) + 1;
      const flows = fv.flow_count ?? fv.packet_count ?? '?';
      return `Window ${idx}/${count}: ${flows} records aggregated into this window`;
    }
    case 'state_representation':
      return payload.nodes
        ? `Graph state: ${payload.nodes.length} node(s), ${payload.edges?.length ?? 0} edge(s)`
        : 'Building graph state…';
    case 'forward_pass':
      return payload.embedding_dim
        ? `NetJEPA forward pass → ${payload.embedding_dim}-dim embedding${payload.trained ? '' : ' (untrained model — number is architecture-verified noise)'}`
        : 'Running forward pass…';
    case 'rollout':
      return payload.k_steps
        ? `Rolled out ${payload.k_steps} future step(s)${payload.trained ? '' : ' (untrained model)'}`
        : 'Rolling out forecast…';
    case 'attack_mapping':
      return payload.attack_stage
        ? `${Math.round((payload.infiltration_probability ?? 0) * 100)}% infiltration probability → '${payload.attack_stage}'${payload.trained ? '' : ' (untrained model)'}`
        : 'Mapping to MITRE ATT&CK stage…';
    case 'explainability':
      if (!payload.top_features?.length) return payload.trained ? 'Below the explain threshold — not flagged as interesting' : 'Skipped (no trained model yet)';
      return `Top feature: ${payload.top_features[0].feature} (attribution ${payload.top_features[0].attribution.toFixed(3)})`;
    default:
      return '';
  }
}

/** Latest event per stage, mapped into the same PipelineStage[] shape the
 * (now-retired) mock usePipeline() hook produced, so InternalsPipeline.tsx's
 * existing rendering keeps working unchanged. */
export function deriveStagesFromEvents(events: PipelineEvent[]): PipelineStage[] {
  const latestByStage = new Map<string, PipelineEvent>();
  for (const e of events) latestByStage.set(e.stage, e);

  return STAGE_ORDER.map((key) => {
    const e = latestByStage.get(key);
    const iso = e ? new Date(e.timestamp * 1000).toISOString() : undefined;
    return {
      name: STAGE_DISPLAY_NAMES[key],
      status: !e ? 'idle' : e.status === 'complete' ? 'complete' : 'active',
      description: e ? describeEvent(key, e.payload) : 'Waiting for this stage…',
      startedAt: iso,
      completedAt: e?.status === 'complete' ? iso : undefined,
    };
  });
}

/** Most recent state_representation event's graph, adapted into the
 * frontend's NetworkNode/NetworkEdge shape (see src/graph/state_builder.py
 * for what a node/edge actually is — "network" = the window itself,
 * "host" nodes only exist for PCAP-derived windows with real IPs). */
export function deriveNetworkGraphFromEvents(events: PipelineEvent[]) {
  const latest = [...events].reverse().find((e) => e.stage === 'state_representation');
  const rawNodes: any[] = latest?.payload?.nodes ?? [];
  const rawEdges: any[] = latest?.payload?.edges ?? [];

  // Most recent attack_mapping gives a risk proxy -- there's no per-node
  // risk in this project's data (see the module this mirrors on the
  // backend), so every node shares the window's overall risk.
  const latestMapping = [...events].reverse().find((e) => e.stage === 'attack_mapping');
  const riskContribution = latestMapping?.payload?.infiltration_probability ?? 0;

  const nodes: NetworkNode[] = rawNodes.map((n) => ({
    id: n.id,
    ip: n.type === 'host' ? n.label : 'N/A',
    hostname: n.type === 'network' ? 'Window (aggregate)' : n.label,
    riskContribution: n.type === 'network' ? 0 : riskContribution,
    type: n.type === 'network' ? 'gateway' : 'host',
  }));

  const edges: NetworkEdge[] = rawEdges.map((e) => ({
    source: e.source,
    target: e.target,
    flowCount: 1,
    riskScore: Math.round(riskContribution * 100),
    protocol: 'TCP', // not available per-edge in this project's data
  }));

  return { nodes, edges };
}
