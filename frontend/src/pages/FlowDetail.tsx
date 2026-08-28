import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Flow, FeatureAttribution } from '../api/types';
import { RiskBadge } from '../components/RiskBadge';
import { FeatureHeatmapCell } from '../components/FeatureHeatmapCell';
import { ExplainabilityPanel } from '../components/ExplainabilityPanel';
import { DecisionAuditTrail } from '../components/DecisionAuditTrail';
import { FeedbackControls } from '../components/FeedbackControls';
import { useAuditTrail } from '../api/hooks';

interface FlowDetailProps {
  flow: Flow | null;
  onClose: () => void;
  onVerdictChange?: (verdict: 'confirmed' | 'false-positive', note?: string) => void;
}

export function FlowDetail({ flow, onClose, onVerdictChange }: FlowDetailProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'features' | 'audit'>('overview');
  const { data: auditTrail } = useAuditTrail(flow?.id || '');

  if (!flow) return null;

  // Prepare top features attribution
  const attributions: FeatureAttribution[] = flow.features.map(f => ({
    featureName: f.name,
    value: f.value,
    contribution: f.contribution,
    direction: f.contribution > 0.4 ? 'positive' : 'negative',
  }));

  const topAttributions = [...attributions]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  // Generate mini historical risk sparkline
  const riskHistory = [
    { time: 't-4', risk: Math.max(0, flow.riskScore - 25) },
    { time: 't-3', risk: Math.max(0, flow.riskScore - 18) },
    { time: 't-2', risk: Math.max(0, flow.riskScore - 10) },
    { time: 't-1', risk: Math.max(0, flow.riskScore - 4) },
    { time: 't0', risk: flow.riskScore },
  ];

  return (
    <div className="fixed inset-y-0 right-0 max-w-2xl w-full bg-surface border-l border-border-default shadow-panel z-50 flex flex-col">
      {/* Header with Title, Risk Badge, Analyst Feedback, and Close Button */}
      <div className="px-6 py-4 border-b border-border-default flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <RiskBadge level={flow.riskLevel} score={flow.riskScore} />
          <div>
            <h2 className="font-heading font-semibold text-text-primary text-base">
              Flow Detail Record
            </h2>
            <p className="text-xs font-mono text-text-secondary">
              ID: {flow.id.slice(0, 16)}...
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Analyst human-in-the-loop feedback controls */}
          <FeedbackControls
            targetType="flow"
            targetId={flow.id}
            currentVerdict={flow.analystVerdict}
            onVerdictChange={onVerdictChange}
          />

          <button
            type="button"
            onClick={onClose}
            data-interactive
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-canvas transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-6 border-b border-border-default bg-canvas/60">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          data-interactive
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-accent-indigo text-accent-indigo font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Explainability & Metadata
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('features')}
          data-interactive
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'features'
              ? 'border-accent-indigo text-accent-indigo font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          All 78 Flow Features ({flow.features.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          data-interactive
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-accent-indigo text-accent-indigo font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Decision Audit Trail
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <>
            {/* Quick Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-canvas p-3 rounded-lg border border-border-default">
                <span className="text-[10px] text-text-tertiary font-mono uppercase block">Source Socket</span>
                <span className="font-mono text-xs font-semibold text-text-primary">{flow.srcIP}:{flow.srcPort}</span>
              </div>
              <div className="bg-canvas p-3 rounded-lg border border-border-default">
                <span className="text-[10px] text-text-tertiary font-mono uppercase block">Dest Socket</span>
                <span className="font-mono text-xs font-semibold text-text-primary">{flow.dstIP}:{flow.dstPort}</span>
              </div>
              <div className="bg-canvas p-3 rounded-lg border border-border-default">
                <span className="text-[10px] text-text-tertiary font-mono uppercase block">Protocol / Flags</span>
                <span className="font-mono text-xs font-semibold text-text-primary">{flow.protocol} · {flow.flags}</span>
              </div>
              <div className="bg-canvas p-3 rounded-lg border border-border-default">
                <span className="text-[10px] text-text-tertiary font-mono uppercase block">Bytes / Duration</span>
                <span className="font-mono text-xs font-semibold text-text-primary">{flow.bytes.toLocaleString()}B · {flow.duration}s</span>
              </div>
            </div>

            {/* Explainability Panel */}
            <ExplainabilityPanel
              topFeatures={topAttributions}
              allFeatures={attributions}
              summary={`NetJEPA flagged this flow because byte ratio asymmetry (${flow.bytes.toLocaleString()} bytes) and IAT variance (${flow.iatStd.toFixed(1)}ms) closely match known C2 beaconing signatures.`}
            />

            {/* Risk History Mini Sparkline */}
            <div className="bg-surface border border-border-default rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-heading font-semibold text-text-primary">
                  <Activity size={14} className="text-accent-indigo" />
                  <span>Flow Risk Evolution (5-Step Horizon)</span>
                </div>
                <span className="font-mono text-[11px] text-text-tertiary">Progression Δ: +{flow.riskScore - riskHistory[0].risk}</span>
              </div>

              <div className="h-28 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={riskHistory}>
                    <XAxis dataKey="time" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        fontFamily: 'JetBrains Mono',
                        borderRadius: 6,
                        border: '1px solid #E4E9EF',
                      }}
                    />
                    <Line type="monotone" dataKey="risk" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3, fill: '#4F46E5' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deep-link Action Button to Model Internals */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/internals/pipeline?flowId=${flow.id}`);
                }}
                data-interactive
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-accent-indigo text-white font-heading font-semibold text-xs hover:bg-accent-indigo-light shadow-glow-indigo transition-all"
              >
                <span>Inspect in Model Internals (3D Pipeline & Graph)</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </>
        )}

        {activeTab === 'features' && (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              Full normalized feature vector generated from packet headers, timing distributions, and directional ratios:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {flow.features.map(f => (
                <FeatureHeatmapCell
                  key={f.name}
                  name={f.name}
                  value={f.value}
                  contribution={f.contribution}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div>
            {auditTrail ? (
              <DecisionAuditTrail trail={auditTrail} />
            ) : (
              <div className="p-8 text-center text-xs text-text-tertiary">
                Generating causal audit trail for flow...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
