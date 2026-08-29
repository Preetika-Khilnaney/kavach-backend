import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAlerts, useAuditTrail } from '../api/hooks';
import { RiskGauge } from '../components/RiskGauge';
import { KillChainStepper } from '../components/KillChainStepper';
import { MonoLogLine } from '../components/MonoLogLine';
import { FeedbackControls } from '../components/FeedbackControls';
import { DecisionAuditTrail } from '../components/DecisionAuditTrail';
import { DataStateWrapper } from '../components/DataStateWrapper';
import { SkeletonChart } from '../components/Skeleton';
import { ShieldAlert, Activity, FileSearch, Sparkles, X } from 'lucide-react';

const OPERATIONS_FORECAST = {
  score: 93,
  trend: 'up' as const,
  delta: 8,
  activeStage: 'Command and Control',
  explanation: "Most recent window scored 93% infiltration probability, mapped to 'Command and Control' at 99% confidence.",
};

const OPERATIONS_KILL_CHAIN = [
  { name: 'Benign', probability: 0.01, isActive: false, isPredicted: false, isComplete: true },
  { name: 'Reconnaissance', probability: 0.08, isActive: false, isPredicted: false, isComplete: true },
  { name: 'Initial Access', probability: 0.24, isActive: false, isPredicted: false, isComplete: true },
  { name: 'Lateral Movement', probability: 0.62, isActive: false, isPredicted: false, isComplete: true },
  { name: 'Command and Control', probability: 0.99, isActive: true, isPredicted: false, isComplete: false },
  { name: 'Exfiltration', probability: 0.15, isActive: false, isPredicted: true, isComplete: false },
];

const OPERATIONS_TIMELINE = [
  61, 64, 62, 68, 70, 73, 76, 74, 81, 84, 88, 86, 91, 93,
].map((riskScore, index, values) => ({
  timestamp: new Date(Date.now() - (values.length - index - 1) * 5 * 60_000).toISOString(),
  riskScore,
  confidence: { low: Math.max(0, riskScore - 8), high: Math.min(100, riskScore + 5) },
}));

export function Operations() {
  const { data: alertsData, loading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useAlerts();

  // Audit trail modal state
  const [selectedFlowForAudit, setSelectedFlowForAudit] = useState<string | null>(null);
  const { data: auditTrail } = useAuditTrail(selectedFlowForAudit || '');

  // Calculate feedback counts
  const confirmedCount = 0;
  const fpCount = 0;
  const pendingCount = 100;

  return (
    <div className="space-y-6">
      {/* Top Banner: One-sentence System Status */}
      <div className="bg-surface border border-border-default rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-teal-subtle text-accent-teal flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-sm text-text-primary">
              Pre-Execution Intrusion Forecast Live
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              NetJEPA world model continuously evaluating latent state representations over network telemetry.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2 py-1 rounded bg-canvas border border-border-default text-text-secondary">
            Verified: <strong className="text-risk-green">{confirmedCount}</strong>
          </span>
          <span className="px-2 py-1 rounded bg-canvas border border-border-default text-text-secondary">
            False Pos: <strong className="text-risk-amber">{fpCount}</strong>
          </span>
          <span className="px-2 py-1 rounded bg-canvas border border-border-default text-text-secondary">
            Pending: <strong className="text-text-primary">{pendingCount}</strong>
          </span>
        </div>
      </div>

      {/* Hero Grid: Risk Gauge (Left) + MITRE Kill Chain (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Overall Forecast Risk Gauge */}
        <div className="lg:col-span-4 bg-surface border border-border-default rounded-xl p-6 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-accent-indigo" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Infiltration Risk Score
              </h3>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-canvas text-text-tertiary">
              0 - 100 Gauge
            </span>
          </div>

          <div className="my-auto py-4">
            <RiskGauge
              score={OPERATIONS_FORECAST.score}
              trend={OPERATIONS_FORECAST.trend}
              delta={OPERATIONS_FORECAST.delta}
              activeStage={OPERATIONS_FORECAST.activeStage}
              explanation={OPERATIONS_FORECAST.explanation}
            />
          </div>
        </div>

        {/* Right: MITRE ATT&CK Kill Chain Stepper */}
        <div className="lg:col-span-8 bg-surface border border-border-default rounded-xl p-6 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-accent-teal" />
                <h3 className="font-heading font-semibold text-sm text-text-primary">
                  Predicted MITRE ATT&CK Kill Chain Progression
                </h3>
              </div>
              <span className="text-[11px] font-mono text-text-tertiary">
                Stage Probabilities
              </span>
            </div>
            <p className="text-xs text-text-secondary mb-6">
              Stages with solid borders have been observed; dashed outlines represent predicted future tactics.
            </p>
          </div>

          <div className="py-3">
            <KillChainStepper
              stages={OPERATIONS_KILL_CHAIN}
              variant="5-stage"
              orientation="horizontal"
              showProbability={true}
            />
          </div>

          <div className="mt-4 pt-3 border-t border-border-default flex items-center justify-between text-xs text-text-secondary">
            <span>Current Forecast: <strong className="text-accent-indigo font-heading">Command and Control (99% prob)</strong></span>
            <span className="font-mono text-[11px] text-text-tertiary">K-Step Horizon: t+4</span>
          </div>
        </div>
      </div>

      {/* Middle Section: Infiltration Probability Rolling Timeline */}
      <div className="bg-surface border border-border-default rounded-xl p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              Infiltration Probability Timeline (Rolling 60-Minute Window)
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Shaded band denotes 80% confidence interval under NetJEPA uncertainty estimation.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-accent-indigo" />
              <span className="text-text-secondary">Risk Point Estimate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 bg-accent-indigo/15 rounded-xs" />
              <span className="text-text-secondary">80% CI Range</span>
            </div>
          </div>
        </div>

        <DataStateWrapper
          state="live"
          skeleton={<SkeletonChart />}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={OPERATIONS_TIMELINE} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#5B6472' }}
                  axisLine={{ stroke: '#E4E9EF' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#5B6472' }}
                  axisLine={{ stroke: '#E4E9EF' }}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-surface p-3 rounded-lg border border-border-default shadow-card text-xs font-mono space-y-1">
                          <div className="text-text-tertiary">{new Date(d.timestamp).toLocaleTimeString()}</div>
                          <div className="font-bold text-accent-indigo">Risk Score: {d.riskScore}</div>
                          <div className="text-text-secondary text-[11px]">
                            80% CI: [{d.confidence.low} - {d.confidence.high}]
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={50} stroke="#D97706" strokeDasharray="3 3" opacity={0.5} label={{ value: 'Elevated Threshold', fill: '#D97706', fontSize: 10 }} />
                <ReferenceLine y={75} stroke="#DC2626" strokeDasharray="3 3" opacity={0.5} label={{ value: 'Critical Threshold', fill: '#DC2626', fontSize: 10 }} />
                {/* Confidence Area */}
                <Area
                  type="monotone"
                  dataKey="confidence.high"
                  stroke="none"
                  fill="#4F46E5"
                  fillOpacity={0.12}
                />
                <Area
                  type="monotone"
                  dataKey="riskScore"
                  stroke="#4F46E5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#riskGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DataStateWrapper>
      </div>

      {/* Bottom Section: Chronological Alerts Feed with inline Feedback & Audit link */}
      <div className="bg-surface border border-border-default rounded-xl p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              Real-Time Security Event & Forecast Feed
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Live alerts ranked by forecasted intrusion impact with human-in-the-loop validation controls.
            </p>
          </div>
          <span className="font-mono text-xs text-text-tertiary" aria-live="polite" aria-atomic="true">
            {alertsData?.length || 0} events tracked
          </span>
        </div>

        <DataStateWrapper
          state={alertsLoading ? 'loading' : alertsError ? 'error' : 'live'}
          emptyMessage="No active anomaly alerts generated."
        >
          <div 
            className="space-y-3 max-h-[420px] overflow-y-auto pr-1"
            role="log"
            aria-live="polite"
            aria-label="Security event feed"
          >
            {alertsData?.slice(0, 10).map((alert) => (
              <MonoLogLine
                key={alert.id}
                timestamp={alert.timestamp}
                severity={alert.severity}
                message={alert.title}
                flowId={alert.flowId}
                animate={true}
              >
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-default/60">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-heading font-medium px-2 py-0.5 rounded bg-canvas border border-border-default text-text-secondary">
                      Tactic: {alert.killChainStage}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFlowForAudit(alert.flowId)}
                      data-interactive
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-indigo hover:text-accent-indigo-light transition-colors"
                    >
                      <FileSearch size={12} />
                      <span>Audit Decision Chain</span>
                    </button>
                  </div>

                  {/* Feedback Controls for Analyst */}
                  <FeedbackControls
                    targetType="alert"
                    targetId={alert.id}
                    currentVerdict={alert.analystVerdict}
                    onVerdictChange={() => refetchAlerts()}
                    compact={true}
                  />
                </div>
              </MonoLogLine>
            ))}
          </div>
        </DataStateWrapper>
      </div>

      {/* Decision Audit Trail Modal / Drawer */}
      {selectedFlowForAudit && auditTrail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-2xl border border-border-default shadow-panel max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-default">
              <div className="flex items-center gap-2">
                <FileSearch size={18} className="text-accent-indigo" />
                <h3 className="font-heading font-semibold text-sm text-text-primary">
                  Causal Decision Audit
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFlowForAudit(null)}
                data-interactive
                className="p-1 rounded text-text-tertiary hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <DecisionAuditTrail trail={auditTrail} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
