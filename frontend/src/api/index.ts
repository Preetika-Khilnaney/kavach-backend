/**
 * Data access layer for Kavach.
 *
 * Every function returns a Promise so the call-site is already
 * structured for real fetch() calls. Switch from mocks by:
 *   1. Setting BASE_URL
 *   2. Replacing the body of each function with a fetch()
 *   3. Deleting the mock-data import
 *
 * Real now: uploadFile, getJobProgress, getBenchmarks, getRiskScore,
 * getFlows, getFlow, getKillChainState, getAlerts — all backed by
 * src/storage/results_store.py, which src/orchestrator/pipeline.py writes
 * to as it processes each window. Empty/zeroed responses are honest until
 * a capture's been processed on the Ingestion page, not a bug.
 *
 * Still mocked: getInfiltrationTimeline, getPipelineState, getNetworkGraph
 * (Operations-level, not the Internals live graph), getForecastTree,
 * getProvenance, getAuditTrail, submitFeedback — these need either the
 * live WebSocket stream wired in (Model Internals pages) or don't have a
 * backend concept to map to yet (audit trail, feedback persistence).
 */

const BASE_URL = 'http://localhost:8000';

import type {
  Flow,
  FlowFilter,
  Alert,
  KillChainStage,
  TimelinePoint,
  PipelineStage,
  NetworkNode,
  NetworkEdge,
  ForecastNode,
  BenchmarkMetric,
  ModelProvenance,
  AuditTrail,
  FeedbackSubmission,
  RiskScoreResponse,
  JobProgress,
} from './types';

import {
  MOCK_FLOWS,
  MOCK_ALERTS,
  MOCK_TIMELINE,
  MOCK_PIPELINE,
  MOCK_NETWORK,
  MOCK_FORECAST,
  MOCK_PROVENANCE,
  generateMockAuditTrail,
} from './mock-data';

// ── Simulated latency ────────────────────────────────────────────────────────

function delay(ms?: number): Promise<void> {
  const t = ms ?? 300 + Math.random() * 500;
  return new Promise(r => setTimeout(r, t));
}

// ── In-memory feedback store (persists within session) ───────────────────────

const feedbackStore = new Map<string, { verdict: 'confirmed' | 'false-positive'; note?: string; at: string }>();

function applyFeedback<T extends { id: string; analystVerdict?: string | null; verdictNote?: string; verdictAt?: string }>(
  items: T[],
): T[] {
  return items.map(item => {
    const fb = feedbackStore.get(item.id);
    if (fb) {
      return {
        ...item,
        analystVerdict: fb.verdict,
        verdictNote: fb.note,
        verdictAt: fb.at,
      };
    }
    return item;
  });
}

// ── API Functions ────────────────────────────────────────────────────────────

export async function getRiskScore(): Promise<RiskScoreResponse> {
  // Real: derived from the most recent prediction in src/storage/results_store.py.
  // Zeroed out (score 0, activeStage "none") until at least one capture has
  // been processed via the Ingestion page.
  const res = await fetch(`${BASE_URL}/risk-score`);
  if (!res.ok) throw new Error(`Risk score fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getInfiltrationTimeline(): Promise<TimelinePoint[]> {
  await delay();
  return [...MOCK_TIMELINE];
}

export async function getFlows(filters?: FlowFilter): Promise<Flow[]> {
  // Real: one row per processed feature window (src/storage/results_store.py),
  // not one row per literal network flow -- see src/api/adapters.py's
  // docstring for which fields are real vs. honest placeholders (this
  // dataset has no per-window src/dst port or protocol). Filtering below
  // stays client-side; the backend doesn't take filter params yet.
  const res = await fetch(`${BASE_URL}/flows?limit=200`);
  if (!res.ok) throw new Error(`Flows fetch failed: ${res.status} ${res.statusText}`);
  const data: Flow[] = await res.json();
  let flows = applyFeedback(data);

  if (filters) {
    if (filters.protocol) {
      flows = flows.filter(f => f.protocol === filters.protocol);
    }
    if (filters.riskLevel?.length) {
      flows = flows.filter(f => filters.riskLevel!.includes(f.riskLevel));
    }
    if (filters.ipSearch) {
      const q = filters.ipSearch.toLowerCase();
      flows = flows.filter(
        f => f.srcIP.includes(q) || f.dstIP.includes(q),
      );
    }
    if (filters.sortBy) {
      const dir = filters.sortDir === 'desc' ? -1 : 1;
      flows.sort((a, b) => {
        const av = a[filters.sortBy!];
        const bv = b[filters.sortBy!];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
  }

  return flows;
}

export async function getFlow(id: string): Promise<Flow> {
  const res = await fetch(`${BASE_URL}/flows/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Flow ${id} not found`);
  const flow = await res.json();
  const fb = feedbackStore.get(id);
  if (fb) {
    return { ...flow, analystVerdict: fb.verdict, verdictNote: fb.note, verdictAt: fb.at };
  }
  return flow;
}

export async function getKillChainState(): Promise<KillChainStage[]> {
  // Real: per-MITRE-stage counts across every stored prediction, active =
  // the most recent one's stage (src/api/adapters.py::kill_chain_state).
  const res = await fetch(`${BASE_URL}/kill-chain`);
  if (!res.ok) throw new Error(`Kill chain fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getAlerts(): Promise<Alert[]> {
  // Real: predictions above an infiltration-probability threshold
  // (src/storage/results_store.py::alerts, default min_probability=0.5).
  const res = await fetch(`${BASE_URL}/alerts`);
  if (!res.ok) throw new Error(`Alerts fetch failed: ${res.status} ${res.statusText}`);
  const data: Alert[] = await res.json();
  return applyFeedback(data);
}

export async function getPipelineState(): Promise<PipelineStage[]> {
  await delay();
  return [...MOCK_PIPELINE];
}

export async function getNetworkGraph(): Promise<{ nodes: NetworkNode[]; edges: NetworkEdge[] }> {
  await delay();
  return {
    nodes: [...MOCK_NETWORK.nodes],
    edges: [...MOCK_NETWORK.edges],
  };
}

export async function getForecastTree(): Promise<ForecastNode> {
  await delay();
  return { ...MOCK_FORECAST };
}

export async function getBenchmarks(): Promise<BenchmarkMetric[]> {
  // Logistic-regression baseline vs. NetJEPA's infiltration head, both
  // evaluated on the same held-out validation windows (src/benchmark/evaluate.py).
  // Can take tens of seconds on a cold cache -- no artificial delay() needed.
  const res = await fetch(`${BASE_URL}/benchmark`);
  if (!res.ok) throw new Error(`Benchmark fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // NetJEPA's entry is {model, f1: null, ...} with a "note" until a
  // trained checkpoint exists -- filter it out rather than render nulls.
  return data.results.filter((r: any) => r.f1 !== null);
}

export async function getProvenance(): Promise<ModelProvenance> {
  await delay(100);
  return { ...MOCK_PROVENANCE };
}

export async function getAuditTrail(flowId: string): Promise<AuditTrail> {
  await delay();
  const flow = MOCK_FLOWS.find(f => f.id === flowId);
  if (!flow) throw new Error(`Flow ${flowId} not found`);
  const alert = MOCK_ALERTS.find(a => a.flowId === flowId);
  return generateMockAuditTrail(flow, alert);
}

export async function submitFeedback(fb: FeedbackSubmission): Promise<{ ok: boolean }> {
  await delay(200);
  feedbackStore.set(fb.targetId, {
    verdict: fb.verdict,
    note: fb.note,
    at: new Date().toISOString(),
  });
  return { ok: true };
}

export async function uploadFile(file: File): Promise<{ jobId: string; capturePath: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/ingest/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // capturePath is the server-side path (e.g. data/raw/uploads/foo.csv) --
  // pass it to /ws/pipeline?capture_path=... to watch THIS file live on
  // the Model Internals pages, not the placeholder demo stream.
  return { jobId: data.job_id, capturePath: data.path };
}

export async function getJobProgress(jobId: string): Promise<JobProgress> {
  const res = await fetch(`${BASE_URL}/jobs/${jobId}/progress`);
  if (!res.ok) throw new Error(`Job progress fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}
