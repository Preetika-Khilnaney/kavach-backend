import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitBranch, Sparkles, Radio, Table, Waypoints } from 'lucide-react';
import { usePipelineStream, deriveTransitionFromEvents } from '../api/websocket';
import { TransitionDiagram } from '../three/TransitionDiagram';
import { ExplainabilityPanel } from '../components/ExplainabilityPanel';
import { DataStateWrapper } from '../components/DataStateWrapper';
import { InternalsSubNav } from '../components/InternalsSubNav';
import type { FeatureAttribution } from '../api/types';
import clsx from 'clsx';

const CHART_WIDTH = 700;
const CHART_HEIGHT = 300;
const LEFT_PAD = 70;
const RIGHT_PAD = 60;
const TOP_PAD = 40;
const BOTTOM_PAD = 40;

function riskToY(risk: number): number {
  // higher risk -> higher on screen, matching the escalation-reads-upward
  // convention the original mock design used.
  const usable = CHART_HEIGHT - TOP_PAD - BOTTOM_PAD;
  return TOP_PAD + usable * (1 - risk / 100);
}

function bezierPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function InternalsForecast() {
  const [searchParams] = useSearchParams();
  const capturePath = searchParams.get('capturePath');

  // Real: this project's actual rollout is ONE autoregressive trajectory
  // (src/models/netjepa.py's Predictor.rollout feeds each prediction back
  // in as the next step) -- not a branching tree with real alternative
  // probabilities, so unlike the original mock, this shows a single real
  // path instead of fabricated alt-branches.
  const { events, connected, closed, error: wsError, replaying } = usePipelineStream(capturePath);
  const loading = events.length === 0 && !closed && !wsError;
  const error = wsError;

  // Current-state -> K-step-rollout transition diagram, driven by the
  // exact same real events -- see deriveTransitionFromEvents' docstring
  // for exactly what is and isn't real here (real topology reused across
  // steps, real per-step risk, no fabricated future hosts).
  const transition = useMemo(() => deriveTransitionFromEvents(events, 5), [events]);
  const explainFeatures: FeatureAttribution[] = useMemo(
    () =>
      transition.topFeatures.map((f) => ({
        featureName: f.feature,
        value: f.attribution,
        contribution: f.attribution,
        direction: f.attribution >= 0 ? 'positive' : 'negative',
      })),
    [transition.topFeatures],
  );
  const finalStep = transition.steps[transition.steps.length - 1];
  const explainSummary = !transition.trained
    ? 'The model has no trained weights yet, so this attribution is not meaningful.'
    : explainFeatures.length > 0
      ? `NetJEPA's rollout projects infiltration probability reaching ${Math.round((finalStep?.risk ?? 0) * 100)}% by ${finalStep?.label ?? 'the final step'}, mapped to the '${transition.attackStage ?? 'unknown'}' MITRE stage at ${Math.round((transition.confidence ?? 0) * 100)}% confidence. The strongest signals driving that read were ${explainFeatures
          .slice(0, 2)
          .map((f) => f.featureName)
          .join(' and ')}.`
      : `No feature attribution for this window — Kavach only computes it above a 30% infiltration-probability threshold, and this window hasn't crossed that.`;

  const latestMapping = useMemo(() => [...events].reverse().find((e) => e.stage === 'attack_mapping'), [events]);
  const trained = latestMapping?.payload?.trained ?? false;
  const attackStage = latestMapping?.payload?.attack_stage ?? null;

  const points = useMemo(() => {
    if (!latestMapping) return [];
    const current = (latestMapping.payload.infiltration_probability ?? 0) * 100;
    const curve: number[] = latestMapping.payload.infiltration_curve ?? [];
    const risks = [current, ...curve.slice(0, 4).map((p: number) => p * 100)];
    const usableWidth = CHART_WIDTH - LEFT_PAD - RIGHT_PAD;
    return risks.map((risk, i) => ({
      step: i,
      risk,
      x: LEFT_PAD + (risks.length > 1 ? (usableWidth * i) / (risks.length - 1) : 0),
      y: riskToY(risk),
    }));
  }, [latestMapping]);

  const pathD = useMemo(() => bezierPath(points), [points]);
  const startRisk = points[0]?.risk;
  const endRisk = points[points.length - 1]?.risk;
  const [viewMode, setViewMode] = useState<'visual' | 'table'>('visual');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-bold text-text-primary tracking-tight">
              Model Internals — K-Step Forecast Rollout
            </h1>
            <span
              className={clsx(
                'flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full border',
                connected
                  ? 'text-risk-green border-risk-green/40 bg-risk-green-subtle'
                  : replaying
                    ? 'text-risk-amber border-risk-amber/40 bg-risk-amber-subtle'
                    : 'text-text-tertiary border-border-default bg-canvas'
              )}
              title={replaying ? 'Live WebSocket unavailable — replaying a real captured run for this file' : undefined}
            >
              <Radio size={10} className={connected ? 'animate-pulse' : ''} />
              {connected ? 'LIVE STREAM' : replaying ? 'REPLAY (cached run)' : closed ? 'STREAM CLOSED' : 'CONNECTING…'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            NetJEPA's actual autoregressive rollout — each step is the predictor's own prior output fed
            back in as the next input, one real trajectory, not a branching search.
          </p>
        </div>
        
        {/* View mode toggle */}
        <div className="flex items-center bg-surface border border-border-default rounded-lg p-1">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            data-interactive
            aria-label="View as visual tree diagram"
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'visual'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <GitBranch size={14} aria-hidden="true" />
            <span>Visual Tree</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            data-interactive
            aria-label="View as accessible table"
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'table'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Table size={14} aria-hidden="true" />
            <span>Table</span>
          </button>
        </div>
      </div>

      <InternalsSubNav active="forecast" />

      {/* State Transition Diagram -- current state -> K predicted future
          states, spacetime-fabric style, fading with distance from t0 */}
      <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'}>
        <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <Waypoints size={16} className="text-accent-indigo" aria-hidden="true" />
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              State Transition — Observed to Projected
            </h3>
          </div>
          {transition.steps.length > 0 ? (
            <TransitionDiagram steps={transition.steps} />
          ) : (
            <div className="h-[420px] flex items-center justify-center bg-canvas rounded-xl border border-border-default">
              <p className="text-xs text-text-secondary">No window processed yet — waiting on the first state_representation event.</p>
            </div>
          )}

          <ExplainabilityPanel topFeatures={explainFeatures} summary={explainSummary} />
        </div>
      </DataStateWrapper>

      {/* Main Rollout Canvas */}
      <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'}>
        <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-accent-indigo" aria-hidden="true" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Infiltration Probability Rollout {points.length > 1 ? `(t0 → t+${points.length - 1})` : ''}
              </h3>
            </div>
            <div className="flex items-center gap-3">
              {!trained && points.length > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-risk-amber-subtle text-risk-amber border border-risk-amber/40">
                  UNTRAINED MODEL — numbers are architecture-verified noise
                </span>
              )}
              {/* View mode toggle */}
              <div className="flex items-center bg-canvas border border-border-default rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('visual')}
                  data-interactive
                  aria-label="View as chart"
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    viewMode === 'visual' ? 'bg-accent-indigo text-white font-semibold' : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  <GitBranch size={12} aria-hidden="true" />
                  <span>Chart</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  data-interactive
                  aria-label="View as accessible table"
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    viewMode === 'table' ? 'bg-accent-indigo text-white font-semibold' : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  <Table size={12} aria-hidden="true" />
                  <span>Table</span>
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <caption className="sr-only">Forecast rollout showing predicted infiltration probability over time, from the model's real K-step rollout</caption>
                <thead>
                  <tr className="border-b border-border-default">
                    <th scope="col" className="text-left p-3 font-heading font-semibold text-text-primary">Time Step</th>
                    <th scope="col" className="text-right p-3 font-heading font-semibold text-text-primary">Infiltration Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {points.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-3 text-text-secondary">No rollout yet — waiting on the first window's attack_mapping event.</td>
                    </tr>
                  ) : (
                    points.map((p) => (
                      <tr key={p.step} className={clsx('border-b border-border-default hover:bg-canvas', p.step === 0 && 'bg-accent-indigo-subtle/30')}>
                        <td className="p-3 font-mono font-semibold">{p.step === 0 ? 't0 (Current)' : `t+${p.step}`}</td>
                        <td className="p-3 text-right font-mono font-bold text-text-primary">{Math.round(p.risk)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="bg-canvas border border-border-default rounded-lg p-3 text-xs text-text-secondary mt-3">
                <strong className="text-text-primary">Accessibility Note:</strong> This table shows the same real rollout data as the chart view —
                {' '}NetJEPA's actual K-step autoregressive prediction, not a branching search with multiple weighted paths.
              </div>
            </div>
          ) : (
            /* Rollout Trajectory (Interactive SVG, built from real points) */
            <div className="w-full overflow-x-auto py-4" role="img" aria-label="Chart of infiltration probability over the rollout's real predicted steps">
              <div className="min-w-[700px] h-[340px] flex items-center justify-center relative">
                {points.length === 0 ? (
                  <p className="text-xs text-text-secondary">
                    No rollout yet — waiting on the first window's attack_mapping event.
                  </p>
                ) : (
                  <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-full" aria-hidden="true">
                    <path d={pathD} fill="none" stroke="#4F46E5" strokeWidth="3" />
                    {points.map((p) => (
                      <g key={p.step} transform={`translate(${p.x}, ${p.y})`}>
                        <circle r={7} className="fill-surface stroke-accent-indigo" strokeWidth={2} />
                        <text y={-16} textAnchor="middle" className="fill-text-primary font-heading text-[11px] font-bold">
                          {Math.round(p.risk)}%
                        </text>
                        <text y={26} textAnchor="middle" className="fill-text-tertiary font-mono text-[9px]">
                          {p.step === 0 ? 't0 (current)' : `t+${p.step}`}
                        </text>
                      </g>
                    ))}
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Plain-Language Forecast Summary Banner */}
          <div className="bg-canvas border border-border-default rounded-xl p-4 flex items-start gap-3">
            <Sparkles size={18} className="text-accent-indigo mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <h4 className="font-heading font-semibold text-xs text-text-primary">
                Plain-Language Forecast Synthesis
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed font-body">
                {points.length > 1 ? (
                  <>
                    The model's rollout projects infiltration probability {endRisk! >= startRisk! ? 'rising' : 'falling'} from{' '}
                    <strong className="text-text-primary">{Math.round(startRisk!)}% to {Math.round(endRisk!)}%</strong> over the next{' '}
                    {points.length - 1} step(s), currently mapped to the '{attackStage ?? 'unknown'}' MITRE stage.
                    {!trained && ' The model has no trained weights yet, so this trajectory is not meaningful — it will update once training completes.'}
                  </>
                ) : (
                  'Waiting for a window to roll out.'
                )}
              </p>
            </div>
          </div>
        </div>
      </DataStateWrapper>
    </div>
  );
}
