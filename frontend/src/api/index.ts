/**
 * Data access layer for Kavach.
 *
 * Every function returns a Promise so the call-site is already
 * structured for real fetch() calls. Switch from mocks by:
 *   1. Setting BASE_URL
 *   2. Replacing the body of each function with a fetch()
 *   3. Deleting the mock-data import
 *
 * Only the ingestion pipeline is implemented on the backend so far
 * (upload -> parse CSV/PCAP -> stream progress), so only `uploadFile` and
 * `getJobProgress` below hit the real API. Everything else (flows, kill
 * chain, network graph, forecasts, benchmarks, ...) stays mocked until
 * feature extraction / the world model / scoring are built — see
 * kavach-backend's README for the current build order.
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
  MOCK_KILL_CHAIN,
  MOCK_PIPELINE,
  MOCK_NETWORK,
  MOCK_FORECAST,
  MOCK_BENCHMARKS,
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
  await delay();
  return {
    score: 67,
    trend: 'up',
    delta: 12,
    activeStage: 'Lateral Movement',
    explanation:
      'The model estimates a 67% chance of an active intrusion progressing past the Lateral Movement stage, based on elevated internal connection rates and anomalous IAT distributions.',
  };
}

export async function getInfiltrationTimeline(): Promise<TimelinePoint[]> {
  await delay();
  return [...MOCK_TIMELINE];
}

export async function getFlows(filters?: FlowFilter): Promise<Flow[]> {
  await delay();
  let flows = applyFeedback([...MOCK_FLOWS]);

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
  await delay();
  const flow = MOCK_FLOWS.find(f => f.id === id);
  if (!flow) throw new Error(`Flow ${id} not found`);
  const fb = feedbackStore.get(id);
  if (fb) {
    return { ...flow, analystVerdict: fb.verdict, verdictNote: fb.note, verdictAt: fb.at };
  }
  return { ...flow };
}

export async function getKillChainState(): Promise<KillChainStage[]> {
  await delay();
  return [...MOCK_KILL_CHAIN];
}

export async function getAlerts(): Promise<Alert[]> {
  await delay();
  return applyFeedback([...MOCK_ALERTS]);
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
  await delay();
  return [...MOCK_BENCHMARKS];
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

export async function uploadFile(file: File): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/ingest/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return { jobId: data.job_id };
}

export async function getJobProgress(jobId: string): Promise<JobProgress> {
  const res = await fetch(`${BASE_URL}/jobs/${jobId}/progress`);
  if (!res.ok) throw new Error(`Job progress fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}
