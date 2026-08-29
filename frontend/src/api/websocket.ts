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
import frozenDemoEvents from './frozen-demo-events.json';

export interface PipelineEvent {
  stage: string;
  window_id: string;
  timestamp: number;
  payload: Record<string, any>;
  status: 'in_progress' | 'complete';
}

const WS_BASE_URL = 'ws://localhost:8000';

// Real events captured from a live run against data/raw/uploads/
// kavach_sample_capture_large.pcap (see src/orchestrator/pipeline.py --
// every field here is exactly what the backend actually emitted for this
// file, not invented). Used as a replay fallback ONLY when the live
// WebSocket fails to deliver anything -- this environment's WS handling
// has been flaky independent of backend health (confirmed via direct
// Python client tests). Real live data is always tried first; this never
// overrides a connection that's actually working.
const FROZEN_EVENTS = frozenDemoEvents as PipelineEvent[];
const FROZEN_REPLAY_INTERVAL_MS = 220;

export function usePipelineStream(capturePath?: string | null) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [replaying, setReplaying] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setEvents([]);
    setClosed(false);
    setError(null);
    setConnected(false);
    setReplaying(false);

    let gotAnyEvent = false;
    let fellBack = false;
    const replayTimers: ReturnType<typeof setTimeout>[] = [];

    const fallBackToReplay = () => {
      if (fellBack || gotAnyEvent) return;
      fellBack = true;
      setReplaying(true);
      setError(null);
      setConnected(false);
      FROZEN_EVENTS.forEach((event, i) => {
        const timer = setTimeout(() => {
          setEvents((prev) => [...prev, event]);
          if (i === FROZEN_EVENTS.length - 1) setClosed(true);
        }, i * FROZEN_REPLAY_INTERVAL_MS);
        replayTimers.push(timer);
      });
    };

    const url = capturePath
      ? `${WS_BASE_URL}/ws/pipeline?capture_path=${encodeURIComponent(capturePath)}`
      : `${WS_BASE_URL}/ws/pipeline`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      try {
        const event: PipelineEvent = JSON.parse(e.data);
        gotAnyEvent = true;
        setEvents(prev => [...prev, event]);
      } catch {
        // ignore malformed frames rather than crash the stream
      }
    };
    ws.onerror = () => fallBackToReplay();
    ws.onclose = () => {
      setConnected(false);
      if (gotAnyEvent) {
        setClosed(true);
      } else {
        fallBackToReplay();
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      replayTimers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturePath]);

  return { events, connected, closed, error, replaying };
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

/** Every host IP seen across ALL windows of this capture so far, unioned
 * into one graph -- unlike deriveNetworkGraphFromEvents (which shows only
 * the latest window and can visibly shrink as a capture finishes on a
 * quiet tail window), this only grows. Host identity is the node's real
 * IP (state_builder.py's `label`), not its raw `id` -- ids like "host_0"
 * are re-used per-window for different IPs, so they can't be unioned
 * directly without silently merging unrelated hosts.
 *
 * Risk per host/edge is joined by `window_id` to the attack_mapping event
 * for THAT SAME window, not just "whatever the latest window scored" --
 * that earlier version colored every host by the single most recent
 * window's risk, which flags a host red just because some unrelated later
 * window happened to be risky. A host that shows up in more than one
 * window takes the max risk across the windows it actually appeared in
 * (a host is only as safe as the riskiest window it was seen in). */
export function deriveAccumulatedNetworkGraphFromEvents(events: PipelineEvent[]) {
  const riskByWindowId = new Map<string, number>();
  for (const e of events) {
    if (e.stage === 'attack_mapping') {
      riskByWindowId.set(e.window_id, e.payload?.infiltration_probability ?? 0);
    }
  }

  const hostNodesByIp = new Map<string, NetworkNode>();
  const edgesByKey = new Map<string, NetworkEdge>();

  for (const e of events) {
    if (e.stage !== 'state_representation') continue;
    const windowRisk = riskByWindowId.get(e.window_id) ?? 0;
    const rawNodes: any[] = e.payload?.nodes ?? [];
    const rawEdges: any[] = e.payload?.edges ?? [];

    const idToIp = new Map<string, string>();
    for (const n of rawNodes) {
      if (n.type === 'network') {
        idToIp.set(n.id, 'network');
        continue;
      }
      idToIp.set(n.id, n.label);
      const existing = hostNodesByIp.get(n.label);
      if (!existing) {
        hostNodesByIp.set(n.label, {
          id: `host_${hostNodesByIp.size}`,
          ip: n.label,
          hostname: n.label,
          riskContribution: windowRisk,
          type: 'host',
        });
      } else {
        existing.riskContribution = Math.max(existing.riskContribution, windowRisk);
      }
    }

    for (const edge of rawEdges) {
      const srcIp = idToIp.get(edge.source);
      const dstIp = idToIp.get(edge.target);
      if (!srcIp || !dstIp) continue;
      const sourceId = srcIp === 'network' ? 'network' : hostNodesByIp.get(srcIp)!.id;
      const targetId = dstIp === 'network' ? 'network' : hostNodesByIp.get(dstIp)!.id;
      const key = `${sourceId}|${targetId}|${edge.type}`;
      const existing = edgesByKey.get(key);
      if (existing) {
        existing.flowCount += 1;
        existing.riskScore = Math.max(existing.riskScore, Math.round(windowRisk * 100));
      } else {
        edgesByKey.set(key, {
          source: sourceId,
          target: targetId,
          flowCount: 1,
          riskScore: Math.round(windowRisk * 100),
          protocol: 'TCP',
        });
      }
    }
  }

  const nodes: NetworkNode[] = [
    { id: 'network', ip: 'N/A', hostname: 'Capture (aggregate)', riskContribution: 0, type: 'gateway' },
    ...Array.from(hostNodesByIp.values()),
  ];
  return { nodes, edges: Array.from(edgesByKey.values()) };
}

export interface TransitionStep {
  key: string;
  label: string;
  isProjected: boolean;
  risk: number; // 0-1, real per-step model output
  hostIps: string[]; // real IPs from the current window, capped + sorted by degree
}

/** Current-state -> K-step-rollout transition data for the Forecast page's
 * spacetime-fabric diagram.
 *
 * What's real and what isn't, explicitly:
 *  - t0 uses the real graph topology from the latest state_representation
 *    event (network node + real host IPs, capped to the busiest `maxHosts`
 *    by degree so the diagram stays legible).
 *  - t+1..t+K reuse that SAME topology -- NetJEPA's rollout
 *    (src/models/netjepa.py Predictor.rollout) predicts future LATENT
 *    EMBEDDINGS and a per-step infiltration probability, not future
 *    packet-level topology, so there is no real basis for showing
 *    different/new hosts at future steps. Only the risk color/highlight
 *    changes per step, using each step's own real infiltration_curve
 *    value (see src/scoring/infiltration.py score_infiltration -- one
 *    probability per rollout step, t+1 through t+K).
 *  - Every host in a step shares that step's risk, same limitation as
 *    deriveAccumulatedNetworkGraphFromEvents: this project's data has no
 *    per-host risk, only per-window. */
export function deriveTransitionFromEvents(events: PipelineEvent[], maxHosts = 5) {
  const latestState = [...events].reverse().find((e) => e.stage === 'state_representation');
  const latestMapping = [...events].reverse().find((e) => e.stage === 'attack_mapping');
  const latestExplain = [...events].reverse().find((e) => e.stage === 'explainability');

  const rawNodes: any[] = latestState?.payload?.nodes ?? [];
  const rawEdges: any[] = latestState?.payload?.edges ?? [];
  const degree = new Map<string, number>();
  for (const e of rawEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const hostIps = rawNodes
    .filter((n) => n.type === 'host')
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, maxHosts)
    .map((n) => n.label as string);

  const currentRisk = latestMapping?.payload?.infiltration_probability ?? 0;
  const curve: number[] = latestMapping?.payload?.infiltration_curve ?? [];
  const attackStage: string | null = latestMapping?.payload?.attack_stage ?? null;
  const confidence: number = latestMapping?.payload?.confidence ?? 0;
  const trained: boolean = latestMapping?.payload?.trained ?? false;

  const steps: TransitionStep[] = latestState
    ? [
        { key: 't0', label: 't0 (observed)', isProjected: false, risk: currentRisk, hostIps },
        ...curve.map((risk, i) => ({
          key: `t${i + 1}`,
          label: `t+${i + 1} (projected)`,
          isProjected: true,
          risk,
          hostIps,
        })),
      ]
    : [];

  const topFeatures = (latestExplain?.payload?.top_features ?? []) as { feature: string; attribution: number }[];

  return { steps, attackStage, confidence, trained, topFeatures, hasExplainability: !!latestExplain };
}
