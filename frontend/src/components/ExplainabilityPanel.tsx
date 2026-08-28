import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine,
} from 'recharts';
import type { FeatureAttribution } from '../api/types';
import { FeatureHeatmapCell } from './FeatureHeatmapCell';
import { ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import clsx from 'clsx';

interface ExplainabilityPanelProps {
  topFeatures: FeatureAttribution[];
  allFeatures?: FeatureAttribution[];
  summary: string;
  className?: string;
}

export function ExplainabilityPanel({
  topFeatures,
  allFeatures,
  summary,
  className,
}: ExplainabilityPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const chartData = (allFeatures || topFeatures)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 12)
    .map(f => ({
      name: f.featureName,
      value: f.contribution * (f.direction === 'negative' ? -1 : 1),
      direction: f.direction,
    }));

  return (
    <div className={clsx('bg-surface border border-border-default rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-3 pb-2">
        <Lightbulb className="w-4 h-4 text-accent-indigo mt-0.5 shrink-0" />
        <div>
          <h4 className="text-xs font-heading font-semibold text-text-primary">Why this prediction?</h4>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{summary}</p>
        </div>
      </div>

      {/* Top-3 features inline */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2">Top contributing features</p>
        <div className="grid grid-cols-3 gap-2">
          {topFeatures.slice(0, 3).map(f => (
            <FeatureHeatmapCell
              key={f.featureName}
              name={f.featureName}
              value={f.value}
              contribution={Math.abs(f.contribution)}
            />
          ))}
        </div>
      </div>

      {/* Expandable full chart */}
      {(allFeatures || topFeatures.length > 3) && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            data-interactive
            className="w-full flex items-center justify-center gap-1 py-2 text-[11px] font-medium text-accent-indigo bg-accent-indigo-subtle/50 hover:bg-accent-indigo-subtle transition-colors border-t border-border-default"
          >
            {expanded ? (
              <>Hide full attribution <ChevronUp size={12} /></>
            ) : (
              <>Show full attribution <ChevronDown size={12} /></>
            )}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 border-t border-border-default">
                  <p className="text-[10px] text-text-tertiary mb-2">
                    Bars to the right push risk <span className="text-risk-red font-semibold">higher</span>;
                    bars to the left push risk <span className="text-risk-green font-semibold">lower</span>.
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 28)}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 100 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#5B6472' }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fontFamily: 'JetBrains Mono', fill: '#5B6472' }}
                        axisLine={false}
                        tickLine={false}
                        width={96}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 11,
                          fontFamily: 'JetBrains Mono',
                          borderRadius: 8,
                          border: '1px solid #E4E9EF',
                          boxShadow: '0 4px 12px rgba(18,21,28,0.08)',
                        }}
                        formatter={(value) => [typeof value === 'number' ? value.toFixed(3) : String(value), 'Contribution']}
                      />
                      <ReferenceLine x={0} stroke="#E4E9EF" />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                        {chartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.direction === 'positive' ? '#DC2626' : '#16A34A'}
                            fillOpacity={0.8}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
