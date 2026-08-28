import { GitBranch, Sparkles } from 'lucide-react';
import { useForecast } from '../api/hooks';
import { DataStateWrapper } from '../components/DataStateWrapper';

export function InternalsForecast() {
  const { data: forecastRoot, loading, error } = useForecast();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading font-bold text-text-primary tracking-tight">
            Model Internals — K-Step Forecast Rollout Tree
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Self-supervised forward state simulation across K=4 time horizons predicting intrusion escalation.
          </p>
        </div>
      </div>

      {/* Sub-nav tabs for Model Internals */}
      <div className="flex items-center gap-2 border-b border-border-default pb-2 text-xs font-heading">
        <a
          href="#/internals/pipeline"
          className="px-3 py-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-canvas transition-colors"
        >
          Pipeline Stages
        </a>
        <a
          href="#/internals/network"
          className="px-3 py-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-canvas transition-colors"
        >
          Live Network Graph
        </a>
        <a
          href="#/internals/forecast"
          className="px-3 py-1.5 rounded-md bg-accent-indigo-subtle text-accent-indigo font-semibold"
        >
          Forecast Rollout Tree
        </a>
        <span className="px-2 py-0.5 rounded bg-canvas border border-border-default text-text-tertiary text-[10px] ml-2">
          Attention Heatmap (Coming Next)
        </span>
      </div>

      {/* Main Rollout Canvas */}
      <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'}>
        <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-accent-indigo" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Predictive Branching Trajectory (Horizon: t+1 to t+4)
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-text-tertiary">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-indigo" /> High Probability Path
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-border-default" /> Alternative Branches
              </span>
            </div>
          </div>

          {/* Forecast Tree Diagram (Interactive SVG) */}
          <div className="w-full overflow-x-auto py-4">
            <div className="min-w-[700px] h-[340px] flex items-center justify-between relative px-8">
              {/* Step columns: t0 (Current), t+1, t+2, t+3, t+4 */}
              {['t0 (Current)', 't+1 (15m)', 't+2 (30m)', 't+3 (45m)', 't+4 (60m)'].map((col, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 z-10">
                  <span className="font-mono text-xs font-semibold text-text-secondary bg-canvas px-2.5 py-1 rounded-full border border-border-default">
                    {col}
                  </span>
                </div>
              ))}

              {/* Visual Tree Rendering */}
              {forecastRoot && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {/* Branching curves from t0 to t4 */}
                  <path
                    d="M 120 170 C 220 170, 240 100, 310 100 C 380 100, 420 80, 480 80 C 540 80, 580 90, 640 90"
                    fill="none"
                    stroke="#4F46E5"
                    strokeWidth="3"
                    strokeDasharray="none"
                  />
                  <path
                    d="M 120 170 C 220 170, 240 170, 310 170 C 380 170, 420 160, 480 160 C 540 160, 580 170, 640 170"
                    fill="none"
                    stroke="#E4E9EF"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M 120 170 C 220 170, 240 240, 310 240 C 380 240, 420 250, 480 250 C 540 250, 580 260, 640 260"
                    fill="none"
                    stroke="#E4E9EF"
                    strokeWidth="1.5"
                  />
                </svg>
              )}

              {/* Node Placements across steps */}
              {/* Root */}
              <div
                className="absolute left-[70px] top-[140px] z-20 bg-surface border-2 border-accent-indigo rounded-xl p-3 shadow-card cursor-pointer hover:scale-105 transition-all w-28"
              >
                <span className="font-mono text-[10px] text-text-tertiary block">Observed</span>
                <span className="font-heading font-bold text-sm text-text-primary">Risk 42</span>
                <span className="font-mono text-[10px] text-risk-green block">Prob 100%</span>
              </div>

              {/* Step 1 Branches */}
              <div
                className="absolute left-[260px] top-[75px] z-20 bg-surface border-2 border-accent-indigo rounded-xl p-2.5 shadow-card cursor-pointer hover:scale-105 transition-all w-28"
              >
                <span className="font-mono text-[10px] text-accent-indigo font-bold block">Most Likely</span>
                <span className="font-heading font-bold text-xs text-text-primary">Risk 54</span>
                <span className="font-mono text-[10px] text-accent-indigo block">Prob 73%</span>
              </div>
              <div
                className="absolute left-[260px] top-[215px] z-20 bg-surface border border-border-default rounded-xl p-2.5 shadow-xs cursor-pointer hover:scale-105 transition-all w-28 opacity-80"
              >
                <span className="font-mono text-[10px] text-text-tertiary block">Alt Branch</span>
                <span className="font-heading font-bold text-xs text-text-primary">Risk 38</span>
                <span className="font-mono text-[10px] text-text-tertiary block">Prob 27%</span>
              </div>

              {/* Step 2 Branches */}
              <div
                className="absolute left-[430px] top-[55px] z-20 bg-surface border-2 border-accent-indigo rounded-xl p-2.5 shadow-card cursor-pointer hover:scale-105 transition-all w-28"
              >
                <span className="font-mono text-[10px] text-accent-indigo font-bold block">Lateral Move</span>
                <span className="font-heading font-bold text-xs text-risk-amber">Risk 61</span>
                <span className="font-mono text-[10px] text-accent-indigo block">Prob 68%</span>
              </div>

              {/* Step 4 Projected Terminus */}
              <div
                className="absolute left-[590px] top-[65px] z-20 bg-surface border-2 border-risk-red rounded-xl p-2.5 shadow-card cursor-pointer hover:scale-105 transition-all w-32"
              >
                <span className="font-mono text-[10px] text-risk-red font-bold block">Critical Terminus</span>
                <span className="font-heading font-bold text-xs text-risk-red">Risk 78 (C2)</span>
                <span className="font-mono text-[10px] text-text-secondary block">Cumulative: 62%</span>
              </div>
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
                The model’s most likely forecast projects intrusion risk to escalate from <strong className="text-text-primary">42 to 78</strong> over the next 4 time steps (60 minutes). This trajectory is primarily driven by expanding lateral port-sweep behaviors and abnormal inter-arrival time distributions between internal workstations and database clusters.
              </p>
            </div>
          </div>
        </div>
      </DataStateWrapper>
    </div>
  );
}
