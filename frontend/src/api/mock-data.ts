/**
 * Mock data generators for Kavach.
 *
 * All functions are pure — they return deterministic data seeded from
 * constants so the UI is predictable during demos and screenshots.
 * When the real backend arrives, delete this file; nothing else imports
 * it except `./index.ts`.
 */

import type {
  Flow,
  FlowFeature,
  Alert,
  KillChainStage,
  TimelinePoint,
  PipelineStage,
  NetworkNode,
  NetworkEdge,
  ForecastNode,
  BenchmarkMetric,
  FeatureAttribution,
  ModelProvenance,
  AuditTrail,
  AuditStep,
  RiskLevel,
  Severity,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Seeded PRNG (xoshiro128**) so mock data is reproducible */
function splitmix32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x9e3779b9) | 0;
    let t = seed ^ (seed >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

const rand = splitmix32(42);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((rand() * (max - min) + min).toFixed(decimals));
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (rand() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isoDate(minutesAgo: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutesAgo);
  return d.toISOString();
}

function riskLevel(score: number): RiskLevel {
  if (score < 25) return 'low';
  if (score < 50) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

function severity(score: number): Severity {
  if (score < 40) return 'info';
  if (score < 70) return 'warning';
  return 'critical';
}

// ── Static pools ─────────────────────────────────────────────────────────────

const INTERNAL_IPS = [
  '10.0.1.12', '10.0.1.34', '10.0.1.56', '10.0.1.78',
  '10.0.2.11', '10.0.2.22', '10.0.2.33', '10.0.2.44',
  '192.168.1.100', '192.168.1.101', '192.168.1.200',
];
const EXTERNAL_IPS = [
  '203.0.113.5', '198.51.100.17', '185.220.101.42',
  '91.219.236.222', '45.33.32.156', '104.16.100.29',
];
const PROTOCOLS: Flow['protocol'][] = ['TCP', 'UDP', 'DNS', 'HTTP', 'TLS', 'ICMP'];
const FLAG_SETS = ['SYN', 'SYN ACK', 'ACK', 'FIN', 'RST', 'PSH ACK', 'SYN FIN', 'URG PSH'];
const HOSTNAMES = [
  'workstation-a', 'workstation-b', 'db-primary', 'db-replica',
  'web-frontend', 'api-gateway', 'mail-server', 'dns-resolver',
  'file-server', 'vpn-gateway', 'jump-host', 'build-server',
  'monitoring', 'log-aggregator', 'proxy-01',
];
const KILL_CHAIN_STAGES = [
  'Reconnaissance', 'Initial Access', 'Lateral Movement',
  'Command & Control', 'Exfiltration',
];
const PIPELINE_STAGE_NAMES = [
  'Ingestion', 'Feature Extraction', 'State Representation',
  'Sequence Model Forward Pass', 'K-Step Forecast Rollout',
  'Attack Stage Mapping', 'Explainability',
];
const FEATURE_NAMES = [
  'fwd_pkt_len_mean', 'bwd_pkt_len_mean', 'flow_duration',
  'fwd_iat_mean', 'bwd_iat_mean', 'fwd_pkt_count', 'bwd_pkt_count',
  'total_bytes', 'syn_flag_count', 'rst_flag_count', 'psh_flag_count',
  'ack_flag_count', 'urg_flag_count', 'payload_entropy',
  'dst_port_diversity', 'src_port_reuse_ratio', 'conn_rate_1m',
  'dns_query_rate', 'tls_version_mismatch', 'cipher_suite_anomaly',
  'cert_validity_days', 'geo_hop_count', 'time_since_last_flow',
  'byte_ratio_in_out',
];

// ── Mock Flows ───────────────────────────────────────────────────────────────

function makeFeatures(): FlowFeature[] {
  return FEATURE_NAMES.map(name => ({
    name,
    value: randFloat(-2, 5, 3),
    contribution: randFloat(0, 1, 3),
  }));
}

export function generateMockFlows(count = 50): Flow[] {
  return Array.from({ length: count }, (_, i) => {
    const score = randInt(0, 100);
    return {
      id: uuid(),
      srcIP: pick(INTERNAL_IPS),
      dstIP: rand() > 0.5 ? pick(EXTERNAL_IPS) : pick(INTERNAL_IPS),
      srcPort: randInt(1024, 65535),
      dstPort: pick([22, 53, 80, 443, 445, 3389, 8080, 8443]),
      protocol: pick(PROTOCOLS),
      flags: pick(FLAG_SETS),
      bytes: randInt(64, 1_500_000),
      duration: randFloat(0.01, 300, 2),
      iatMean: randFloat(0.1, 500, 2),
      iatStd: randFloat(0.01, 200, 2),
      riskScore: score,
      riskLevel: riskLevel(score),
      timestamp: isoDate(i * 1.2),
      features: makeFeatures(),
    };
  });
}

// ── Mock Alerts ──────────────────────────────────────────────────────────────

const ALERT_TITLES = [
  'Unusual outbound DNS volume',
  'Port scan detected from internal host',
  'Potential credential spray attempt',
  'Encrypted C2 beacon pattern',
  'Large data exfiltration candidate',
  'SMB lateral movement detected',
  'TLS certificate anomaly',
  'Anomalous inter-arrival time distribution',
  'Geo-hopping traffic pattern',
  'Privilege escalation indicator',
  'Reverse shell signature match',
  'Abnormal byte-ratio in encrypted session',
  'DNS tunneling candidate',
  'RDP brute-force from jump host',
  'Unusual ICMP payload size',
];

export function generateMockAlerts(flows: Flow[], count = 30): Alert[] {
  return Array.from({ length: count }, (_, i) => {
    const flow = flows[i % flows.length];
    const score = flow.riskScore;
    const topFeatures: FeatureAttribution[] = flow.features
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map(f => ({
        featureName: f.name,
        value: f.value,
        contribution: f.contribution,
        direction: f.contribution > 0.5 ? 'positive' as const : 'negative' as const,
      }));

    return {
      id: uuid(),
      severity: severity(score),
      title: pick(ALERT_TITLES),
      description: `Flow ${flow.srcIP}:${flow.srcPort} → ${flow.dstIP}:${flow.dstPort} flagged with risk score ${score}.`,
      timestamp: isoDate(i * 2),
      flowId: flow.id,
      killChainStage: pick(KILL_CHAIN_STAGES),
      topFeatures,
    };
  });
}

// ── Mock Timeline ────────────────────────────────────────────────────────────

export function generateMockTimeline(count = 100): TimelinePoint[] {
  let base = 30;
  return Array.from({ length: count }, (_, i) => {
    // Random walk with slight upward drift to make it interesting
    base += randFloat(-5, 6, 1);
    base = Math.max(5, Math.min(95, base));
    const spread = randFloat(5, 15, 1);
    return {
      timestamp: isoDate(count - i),
      riskScore: parseFloat(base.toFixed(1)),
      confidence: {
        low: parseFloat(Math.max(0, base - spread).toFixed(1)),
        high: parseFloat(Math.min(100, base + spread).toFixed(1)),
      },
    };
  });
}

// ── Mock Kill Chain ──────────────────────────────────────────────────────────

export function generateMockKillChain(): KillChainStage[] {
  const activeIdx = 2; // Lateral Movement is currently active
  return KILL_CHAIN_STAGES.map((name, i) => ({
    name,
    probability: parseFloat((0.9 - i * 0.12 + randFloat(-0.05, 0.05)).toFixed(2)),
    isActive: i === activeIdx,
    isPredicted: i > activeIdx,
    isComplete: i < activeIdx,
  }));
}

// ── Mock Pipeline ────────────────────────────────────────────────────────────

export function generateMockPipeline(): PipelineStage[] {
  const activeIdx = 4; // K-Step Forecast is currently running
  const descriptions = [
    'Reading 2,847 packets from uploaded PCAP file',
    'Computing 78 flow-level features (byte counts, IAT statistics, flag distributions)',
    'Building graph state: 15 nodes, 23 edges from current flow window',
    'Running NetJEPA sequence model forward pass on 120-step context window',
    'Rolling out 4 future steps — highest-probability path leads to Lateral Movement (73%)',
    'Mapping predicted states to MITRE ATT&CK kill chain stages',
    'Computing SHAP values for top contributing features',
  ];

  return PIPELINE_STAGE_NAMES.map((name, i) => ({
    name,
    status: i < activeIdx ? 'complete' : i === activeIdx ? 'active' : 'idle',
    description: descriptions[i],
    startedAt: i <= activeIdx ? isoDate(10 - i) : undefined,
    completedAt: i < activeIdx ? isoDate(9 - i) : undefined,
  }));
}

// ── Mock Network ─────────────────────────────────────────────────────────────

export function generateMockNetwork(): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  const allIPs = [...INTERNAL_IPS, ...EXTERNAL_IPS.slice(0, 4)];
  const nodes: NetworkNode[] = allIPs.map((ip, i) => ({
    id: `node-${i}`,
    ip,
    hostname: i < HOSTNAMES.length ? HOSTNAMES[i] : `host-${i}`,
    riskContribution: randFloat(0, 1),
    type: i < 2 ? 'gateway' : i < 6 ? 'server' : 'host',
  }));

  const edges: NetworkEdge[] = [];
  for (let i = 0; i < 25; i++) {
    const src = randInt(0, nodes.length - 1);
    let tgt = randInt(0, nodes.length - 1);
    if (tgt === src) tgt = (tgt + 1) % nodes.length;
    edges.push({
      source: nodes[src].id,
      target: nodes[tgt].id,
      flowCount: randInt(1, 50),
      riskScore: randInt(0, 100),
      protocol: pick(PROTOCOLS),
    });
  }

  return { nodes, edges };
}

// ── Mock Forecast ────────────────────────────────────────────────────────────

function buildForecastTree(step: number, maxSteps: number, parentProb: number): ForecastNode {
  const score = randInt(20, 90);
  const prob = parseFloat((parentProb * randFloat(0.3, 0.8)).toFixed(3));
  const node: ForecastNode = {
    id: uuid(),
    step,
    riskScore: score,
    probability: step === 0 ? 1 : prob,
    label: step === 0 ? 'Current' : `t+${step}`,
    children: [],
  };

  if (step < maxSteps) {
    const branches = step === 0 ? 3 : randInt(1, 3);
    for (let i = 0; i < branches; i++) {
      node.children.push(buildForecastTree(step + 1, maxSteps, prob || 0.8));
    }
  }

  return node;
}

export function generateMockForecast(): ForecastNode {
  return buildForecastTree(0, 4, 1);
}

// ── Mock Benchmarks ──────────────────────────────────────────────────────────

export function generateMockBenchmarks(): BenchmarkMetric[] {
  return [
    { model: 'NetJEPA', f1: 0.94, precision: 0.92, recall: 0.96, fpr: 0.03 },
    { model: 'Logistic Regression', f1: 0.78, precision: 0.81, recall: 0.75, fpr: 0.12 },
    { model: 'Random Forest', f1: 0.85, precision: 0.87, recall: 0.83, fpr: 0.08 },
    { model: 'LSTM Autoencoder', f1: 0.88, precision: 0.86, recall: 0.90, fpr: 0.06 },
  ];
}

// ── Mock Provenance ──────────────────────────────────────────────────────────

export function generateMockProvenance(): ModelProvenance {
  return {
    datasets: [
      {
        name: 'CIC-IDS-2018',
        description:
          'Comprehensive intrusion detection dataset from the Canadian Institute for Cybersecurity. Contains benign and seven common attack scenarios generated in a controlled lab network.',
        size: '~50 GB (raw PCAP)',
        year: 2018,
      },
      {
        name: 'CTU-13',
        description:
          '13 captures of different real botnet traffic mixed with normal and background traffic from the Czech Technical University.',
        size: '~90 GB (raw PCAP)',
        year: 2011,
      },
    ],
    limitations: [
      'Training data is lab-generated and may not fully reflect real enterprise traffic patterns, protocol distributions, or network topologies.',
      'CIC-IDS-2018 is from 2018 — newer attack techniques (e.g., living-off-the-land, supply-chain) are under-represented.',
      'CTU-13 botnet captures date to 2011; modern C2 channels (DNS-over-HTTPS, Tor-based) are not covered.',
      'Model has not been validated against encrypted east–west traffic or IPv6-heavy environments.',
      'False positive rate of 3% was measured on held-out test data — operational false positive rate may differ.',
      'The model assumes a flat network; segmented or zero-trust architectures may reduce prediction accuracy.',
    ],
    version: '0.4.2-alpha',
    lastTrained: '2026-08-15T09:30:00Z',
  };
}

// ── Mock Audit Trail ─────────────────────────────────────────────────────────

export function generateMockAuditTrail(flow: Flow, alert?: Alert): AuditTrail {
  const topFeatures = flow.features
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  const steps: AuditStep[] = [
    {
      stepIndex: 0,
      stageName: 'Raw Flow',
      summary: `Captured ${flow.protocol} flow from ${flow.srcIP}:${flow.srcPort} → ${flow.dstIP}:${flow.dstPort}, ${flow.bytes.toLocaleString()} bytes over ${flow.duration}s.`,
      detail: {
        srcIP: flow.srcIP,
        dstIP: flow.dstIP,
        srcPort: flow.srcPort,
        dstPort: flow.dstPort,
        protocol: flow.protocol,
        flags: flow.flags,
        bytes: flow.bytes,
        duration: flow.duration,
      },
      timestamp: flow.timestamp,
    },
    {
      stepIndex: 1,
      stageName: 'Feature Extraction',
      summary: `Extracted ${flow.features.length} flow-level features. Top contributor: ${topFeatures[0]?.name} (z-score ${topFeatures[0]?.value.toFixed(2)}).`,
      detail: {
        featureCount: flow.features.length,
        topFeatures: topFeatures.map(f => ({ name: f.name, value: f.value, contribution: f.contribution })),
        unusualFeatures: topFeatures.filter(f => Math.abs(f.value) > 2).map(f => f.name),
      },
      timestamp: flow.timestamp,
    },
    {
      stepIndex: 2,
      stageName: 'Graph State',
      summary: `Node ${flow.srcIP} has 7 active connections; destination ${flow.dstIP} is a known external host contacted by 3 internal nodes.`,
      detail: {
        srcNodeDegree: 7,
        dstNodeDegree: 3,
        clusterCoefficient: 0.42,
        isExternalDst: EXTERNAL_IPS.includes(flow.dstIP),
        neighborIPs: INTERNAL_IPS.slice(0, 3),
      },
      timestamp: flow.timestamp,
    },
    {
      stepIndex: 3,
      stageName: 'Forecast',
      summary: `K=4 step forecast: risk projected to increase from ${flow.riskScore} to ${Math.min(100, flow.riskScore + randInt(5, 25))} with 73% probability.`,
      detail: {
        kSteps: 4,
        currentRisk: flow.riskScore,
        projectedRisk: Math.min(100, flow.riskScore + randInt(5, 25)),
        highestProbPath: 'Lateral Movement',
        pathProbability: 0.73,
      },
      timestamp: flow.timestamp,
    },
    {
      stepIndex: 4,
      stageName: 'Attack Stage Mapping',
      summary: `Forecast maps to "${alert?.killChainStage || 'Lateral Movement'}" on the MITRE ATT&CK kill chain — driven by elevated lateral connection rates and port scan indicators.`,
      detail: {
        mappedStage: alert?.killChainStage || 'Lateral Movement',
        confidence: 0.73,
        contributingFactors: ['conn_rate_1m', 'dst_port_diversity', 'syn_flag_count'],
      },
      timestamp: flow.timestamp,
    },
    {
      stepIndex: 5,
      stageName: 'Alert',
      summary: alert
        ? `Generated ${alert.severity} alert: "${alert.title}".`
        : `Generated warning alert for flow with risk score ${flow.riskScore}.`,
      detail: alert
        ? { alertId: alert.id, severity: alert.severity, title: alert.title }
        : { severity: severity(flow.riskScore), riskScore: flow.riskScore },
      timestamp: flow.timestamp,
    },
  ];

  return {
    flowId: flow.id,
    alertId: alert?.id,
    steps,
  };
}

// ── Prebuilt instances (for consistency across hooks) ─────────────────────────

export const MOCK_FLOWS = generateMockFlows(50);
export const MOCK_ALERTS = generateMockAlerts(MOCK_FLOWS, 30);
export const MOCK_TIMELINE = generateMockTimeline(100);
export const MOCK_KILL_CHAIN = generateMockKillChain();
export const MOCK_PIPELINE = generateMockPipeline();
export const MOCK_NETWORK = generateMockNetwork();
export const MOCK_FORECAST = generateMockForecast();
export const MOCK_BENCHMARKS = generateMockBenchmarks();
export const MOCK_PROVENANCE = generateMockProvenance();
