/**
 * React hooks wrapping the API accessor functions.
 *
 * `useApiQuery`  — generic hook with loading/error/data/refetch
 * `useStreamingData` — polls at an interval, appends new data points
 * Per-endpoint convenience hooks follow.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './index';
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
  RiskScoreResponse,
  JobProgress,
} from './types';

// ── Generic Query Hook ───────────────────────────────────────────────────────

interface ApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): ApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => {
      mountedRef.current = false;
    };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ── Streaming Hook (polls + appends) ─────────────────────────────────────────

interface StreamingResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  isStreaming: boolean;
}

export function useStreamingData<T>(
  fetcher: () => Promise<T[]>,
  intervalMs: number = 5000,
  maxItems: number = 200,
): StreamingResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval>;

    const load = async () => {
      try {
        const result = await fetcher();
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
          setIsStreaming(true);
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      }
    };

    load();

    timer = setInterval(async () => {
      try {
        const result = await fetcher();
        if (mountedRef.current) {
          setData(prev => {
            // Simple append of any new items (based on array length diff)
            const newItems = result.slice(0, Math.max(0, result.length - prev.length));
            if (newItems.length > 0) {
              return [...newItems, ...prev].slice(0, maxItems);
            }
            return result.slice(0, maxItems);
          });
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, loading, error, isStreaming };
}

// ── Per-endpoint hooks ───────────────────────────────────────────────────────

export function useRiskScore() {
  return useApiQuery<RiskScoreResponse>(() => api.getRiskScore());
}

export function useTimeline() {
  return useApiQuery<TimelinePoint[]>(() => api.getInfiltrationTimeline());
}

export function useFlows(filters?: FlowFilter) {
  return useApiQuery<Flow[]>(() => api.getFlows(filters), [JSON.stringify(filters)]);
}

export function useFlow(id: string) {
  return useApiQuery<Flow>(() => api.getFlow(id), [id]);
}

export function useKillChain() {
  return useApiQuery<KillChainStage[]>(() => api.getKillChainState());
}

export function useAlerts() {
  return useApiQuery<Alert[]>(() => api.getAlerts());
}

export function usePipeline() {
  return useApiQuery<PipelineStage[]>(() => api.getPipelineState());
}

export function useNetworkGraph() {
  return useApiQuery<{ nodes: NetworkNode[]; edges: NetworkEdge[] }>(
    () => api.getNetworkGraph(),
  );
}

export function useForecast() {
  return useApiQuery<ForecastNode>(() => api.getForecastTree());
}

export function useBenchmarks() {
  return useApiQuery<BenchmarkMetric[]>(() => api.getBenchmarks());
}

export function useProvenance() {
  return useApiQuery<ModelProvenance>(() => api.getProvenance());
}

export function useAuditTrail(flowId: string) {
  return useApiQuery<AuditTrail>(() => api.getAuditTrail(flowId), [flowId]);
}

export function useJobProgress(jobId: string | null, pollMs = 1000) {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!jobId) return;

    setLoading(true);
    let timer: ReturnType<typeof setInterval>;

    timer = setInterval(async () => {
      try {
        const p = await api.getJobProgress(jobId);
        if (mountedRef.current) {
          setProgress(p);
          if (p.complete) {
            setLoading(false);
            clearInterval(timer);
          }
        }
      } catch {
        if (mountedRef.current) setLoading(false);
        clearInterval(timer);
      }
    }, pollMs);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [jobId, pollMs]);

  return { progress, loading };
}
