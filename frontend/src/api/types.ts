// ── Risk & Status ────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Severity = 'info' | 'warning' | 'critical';
export type Trend = 'up' | 'down' | 'stable';
export type AnalystVerdict = 'confirmed' | 'false-positive' | null;

// ── Network Flow ─────────────────────────────────────────────────────────────

export interface FlowFeature {
  name: string;
  value: number;
  /** normalised 0-1 contribution magnitude (for heatmap) */
  contribution: number;
}

export interface Flow {
  id: string;
  srcIP: string;
  dstIP: string;
  srcPort: number;
  dstPort: number;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'DNS' | 'HTTP' | 'TLS';
  flags: string;
  bytes: number;
  duration: number; // seconds
  iatMean: number;  // inter-arrival time mean (ms)
  iatStd: number;   // inter-arrival time std dev (ms)
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  timestamp: string; // ISO 8601
  features: FlowFeature[];
  analystVerdict?: AnalystVerdict;
  verdictNote?: string;
  verdictAt?: string;
}

export interface FlowFilter {
  protocol?: string;
  riskLevel?: RiskLevel[];
  ipSearch?: string;
  timeRange?: { start: string; end: string };
  sortBy?: keyof Flow;
  sortDir?: 'asc' | 'desc';
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
  flowId: string;
  killChainStage: string;
  topFeatures?: FeatureAttribution[];
  analystVerdict?: AnalystVerdict;
  verdictNote?: string;
  verdictAt?: string;
}

// ── Kill Chain ───────────────────────────────────────────────────────────────

export interface KillChainStage {
  name: string;
  probability: number; // 0-1
  isActive: boolean;
  isPredicted: boolean;
  isComplete: boolean;
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelinePoint {
  timestamp: string;
  riskScore: number;
  confidence: {
    low: number;
    high: number;
  };
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export type PipelineStatus = 'idle' | 'active' | 'complete' | 'error';

export interface PipelineStage {
  name: string;
  status: PipelineStatus;
  description: string;
  startedAt?: string;
  completedAt?: string;
}

// ── Network Graph ────────────────────────────────────────────────────────────

export type NodeType = 'host' | 'server' | 'gateway';

export interface NetworkNode {
  id: string;
  ip: string;
  hostname: string;
  riskContribution: number; // 0-1
  type: NodeType;
  x?: number;
  y?: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  flowCount: number;
  riskScore: number;
  protocol: string;
}

// ── Forecast ─────────────────────────────────────────────────────────────────

export interface ForecastNode {
  id: string;
  step: number;
  riskScore: number;
  probability: number; // 0-1
  label?: string;
  children: ForecastNode[];
}

// ── Benchmarks ───────────────────────────────────────────────────────────────

export interface BenchmarkMetric {
  model: string;
  f1: number;
  precision: number;
  recall: number;
  fpr: number; // false positive rate
}

// ── Explainability ───────────────────────────────────────────────────────────

export interface FeatureAttribution {
  featureName: string;
  value: number;
  contribution: number; // signed: positive = pushes risk up
  direction: 'positive' | 'negative';
}

// ── Decision Audit Trail ─────────────────────────────────────────────────────

export type AuditStageName =
  | 'Raw Flow'
  | 'Feature Extraction'
  | 'Graph State'
  | 'Forecast'
  | 'Attack Stage Mapping'
  | 'Alert';

export interface AuditStep {
  stepIndex: number;
  stageName: AuditStageName;
  summary: string; // plain-language one-liner
  detail: Record<string, unknown>; // stage-specific raw data
  timestamp: string;
}

export interface AuditTrail {
  flowId: string;
  alertId?: string;
  steps: AuditStep[];
}

// ── Analyst Feedback ─────────────────────────────────────────────────────────

export interface FeedbackSubmission {
  targetType: 'alert' | 'flow';
  targetId: string;
  verdict: 'confirmed' | 'false-positive';
  note?: string;
}

// ── Model Provenance ─────────────────────────────────────────────────────────

export interface ModelProvenance {
  datasets: { name: string; description: string; size: string; year: number }[];
  limitations: string[];
  version: string;
  lastTrained: string;
}

// ── Risk Score Response ──────────────────────────────────────────────────────

export interface RiskScoreResponse {
  score: number;
  trend: Trend;
  delta: number;
  activeStage: string;
  explanation: string;
}

// ── Job Progress (ingestion) ─────────────────────────────────────────────────

export interface JobProgress {
  stage: string;
  percent: number;
  complete: boolean;
}
