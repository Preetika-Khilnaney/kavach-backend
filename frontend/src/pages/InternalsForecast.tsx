import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitBranch, Sparkles, Radio } from 'lucide-react';
import { usePipelineStream } from '../api/websocket';
import { DataStateWrapper } from '../components/DataStateWrapper';
import { InternalsSubNav } from '../components/InternalsSubNav';
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
  const { events, connected, closed, error: wsError } = usePipelineStream(capturePath);
  const loading = events.length === 0 && !closed && !wsError;
  const error = wsError;

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
                connected ? 'text-risk-green border-risk-green/40 bg-risk-green-subtle' : 'text-text-tertiary border-border-default bg-canvas'
              )}
            >
              <Radio size={10} className={connected ? 'animate-pulse' : ''} />
              {connected ? 'LIVE STREAM' : closed ? 'STREAM CLOSED' : 'CONNECTING…'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            NetJEPA's actual autoregressive rollout — each step is the predictor's own prior output fed
            back in as the next input, one real trajectory, not a branching search.
          </p>
        </div>
      </div>

      <InternalsSubNav active="forecast" />

      {/* Main Rollout Canvas */}
      <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'}>
        <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-accent-indigo" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Infiltration Probability Rollout {points.length > 1 ? `(t0 → t+${points.length - 1})` : ''}
              </h3>
            </div>
            {!trained && points.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-risk-amber-subtle text-risk-amber border border-risk-amber/40">
                UNTRAINED MODEL — numbers are architecture-verified noise
              </span>
            )}
          </div>

          {/* Rollout Trajectory (Interactive SVG, built from real points) */}
          <div className="w-full overflow-x-auto py-4">
            <div className="min-w-[700px] h-[340px] flex items-center justify-center relative">
              {points.length === 0 ? (
                <p className="text-xs text-text-secondary">
                  No rollout yet — waiting on the first window's attack_mapping event.
                </p>
              ) : (
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-full">
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

          {/* Plain-Language Forecast Summary Banner */}
          <div className="bg-canvas border border-border-default rounded-xl p-4 flex items-start gap-3">
            <Sparkles size={18} className="text-accent-indigo mt-0.5 shrink-0" />
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
