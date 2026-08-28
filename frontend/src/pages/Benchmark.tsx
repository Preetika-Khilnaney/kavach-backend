import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Award, BarChart3, ShieldCheck } from 'lucide-react';
import { useBenchmarks } from '../api/hooks';
import { DataStateWrapper } from '../components/DataStateWrapper';
import { SkeletonChart } from '../components/Skeleton';

export function Benchmark() {
  const { data: benchmarks, loading, error } = useBenchmarks();

  const netjepa = benchmarks?.find(b => b.model === 'NetJEPA');
  const baseline = benchmarks?.find(b => b.model !== 'NetJEPA');
  const f1Delta = netjepa && baseline ? (((netjepa.f1 - baseline.f1) / baseline.f1) * 100) : null;

  const chartData = (benchmarks || []).map(b => ({
    model: b.model,
    F1: Number((b.f1 * 100).toFixed(1)),
    Precision: Number((b.precision * 100).toFixed(1)),
    Recall: Number((b.recall * 100).toFixed(1)),
    FPR: Number((b.fpr * 100).toFixed(1)),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading font-bold text-text-primary tracking-tight">
            Intrusion Forecasting Model Benchmark
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            NetJEPA's infiltration head vs. a logistic regression baseline, evaluated on the same held-out
            CIC-IDS-2017 validation windows.
          </p>
        </div>
      </div>

      {/* Summary Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border-default rounded-xl p-4 shadow-card">
          <span className="text-[11px] font-mono text-text-tertiary uppercase block">NetJEPA F1 Score</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-heading font-bold text-2xl text-accent-indigo">{netjepa ? netjepa.f1.toFixed(2) : '—'}</span>
            {f1Delta !== null && (
              <span className={`text-xs font-mono font-semibold ${f1Delta >= 0 ? 'text-risk-green' : 'text-risk-amber'}`}>
                {f1Delta >= 0 ? '+' : ''}{f1Delta.toFixed(1)}% vs baseline
              </span>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border-default rounded-xl p-4 shadow-card">
          <span className="text-[11px] font-mono text-text-tertiary uppercase block">Recall (Early Detection)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-heading font-bold text-2xl text-accent-teal">{netjepa ? netjepa.recall.toFixed(2) : '—'}</span>
            {netjepa && <span className="text-xs font-mono text-risk-green font-semibold">{(netjepa.recall * 100).toFixed(0)}% of attacks caught</span>}
          </div>
        </div>

        <div className="bg-surface border border-border-default rounded-xl p-4 shadow-card">
          <span className="text-[11px] font-mono text-text-tertiary uppercase block">False Positive Rate</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-heading font-bold text-2xl text-risk-green">{netjepa ? netjepa.fpr.toFixed(2) : '—'}</span>
            {netjepa && <span className="text-xs font-mono text-text-secondary">{(netjepa.fpr * 100).toFixed(0)}% alarm noise</span>}
          </div>
        </div>

        <div className="bg-surface border border-border-default rounded-xl p-4 shadow-card">
          <span className="text-[11px] font-mono text-text-tertiary uppercase block">Supervision Regime</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-heading font-bold text-base text-text-primary">Self-Supervised</span>
            <span className="text-[10px] font-mono text-text-tertiary">Zero Manual Labels</span>
          </div>
        </div>
      </div>

      {!loading && !error && !netjepa && (
        <div className="p-3.5 bg-canvas rounded-xl border border-border-default text-xs text-text-secondary">
          NetJEPA has no trained checkpoint yet — showing the logistic regression baseline only.
          Run <code className="font-mono text-accent-indigo">python -m src.training.train</code> on the backend, then reload.
        </div>
      )}

      {/* Benchmark Chart & Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Grouped Bar Chart */}
        <div className="lg:col-span-7 bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-accent-indigo" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Comparative Metrics by Architecture (%)
              </h3>
            </div>
          </div>

          <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'} skeleton={<SkeletonChart />}>
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <XAxis
                    dataKey="model"
                    tick={{ fontSize: 10, fontFamily: 'Space Grotesk', fill: '#12151C' }}
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
                    contentStyle={{
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono',
                      borderRadius: 8,
                      border: '1px solid #E4E9EF',
                    }}
                    formatter={(val) => [`${val}%`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Plus Jakarta Sans', paddingTop: 8 }} />
                  <Bar dataKey="F1" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Precision" fill="#0EA5A0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Recall" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="FPR" fill="#D97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DataStateWrapper>

          <p className="text-xs text-text-secondary pt-2 border-t border-border-default leading-relaxed">
            <strong>Key takeaway:</strong>{' '}
            {netjepa && baseline ? (
              f1Delta !== null && f1Delta >= 0
                ? `NetJEPA outperforms the logistic regression baseline by ${f1Delta.toFixed(1)}% F1 (${(netjepa.recall * 100).toFixed(0)}% recall, ${(netjepa.fpr * 100).toFixed(0)}% false-positive rate) on the same held-out validation windows.`
                : `NetJEPA currently trails the logistic regression baseline by ${Math.abs(f1Delta ?? 0).toFixed(1)}% F1 on held-out validation windows — this checkpoint needs more training before it beats a simple baseline.`
            ) : (
              'Waiting on a trained NetJEPA checkpoint to compare against the baseline — see the note above.'
            )}
          </p>
        </div>

        {/* Comparison Table & Disclosures */}
        <div className="lg:col-span-5 bg-surface border border-border-default rounded-2xl p-6 shadow-card flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-border-default">
              <Award size={16} className="text-accent-teal" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Detailed Test Benchmark Scores
              </h3>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-border-default text-text-secondary text-[11px]">
                    <th className="py-2.5 px-2">Model</th>
                    <th className="py-2.5 px-2">F1</th>
                    <th className="py-2.5 px-2">Prec</th>
                    <th className="py-2.5 px-2">Rec</th>
                    <th className="py-2.5 px-2">FPR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default/60">
                  {benchmarks?.map(b => (
                    <tr
                      key={b.model}
                      className={b.model === 'NetJEPA' ? 'bg-accent-indigo-subtle font-semibold text-accent-indigo' : 'text-text-primary'}
                    >
                      <td className="py-2.5 px-2">{b.model}</td>
                      <td className="py-2.5 px-2">{b.f1.toFixed(2)}</td>
                      <td className="py-2.5 px-2">{b.precision.toFixed(2)}</td>
                      <td className="py-2.5 px-2">{b.recall.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-risk-amber">{b.fpr.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3.5 bg-canvas rounded-xl border border-border-default text-xs text-text-secondary space-y-1.5 font-body">
            <div className="font-heading font-semibold text-text-primary flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-accent-teal" />
              <span>Scientific Evaluation Transparency</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Evaluated on a held-out slice (never seen during training) of CIC-IDS-2017 flow windows — same
              validation set for both models. For dataset composition and caveats, open the Model Provenance drawer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
