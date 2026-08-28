import { type RiskLevel } from '../api/types';
import clsx from 'clsx';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  size?: 'sm' | 'md';
  className?: string;
}

const CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; dot: string }> = {
  low: {
    label: 'Low',
    bg: 'bg-risk-green-subtle',
    text: 'text-risk-green',
    dot: 'bg-risk-green',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-risk-amber-subtle',
    text: 'text-risk-amber',
    dot: 'bg-risk-amber',
  },
  high: {
    label: 'High',
    bg: 'bg-risk-red-subtle',
    text: 'text-risk-red',
    dot: 'bg-risk-red',
  },
  critical: {
    label: 'Critical',
    bg: 'bg-risk-red-subtle',
    text: 'text-risk-red',
    dot: 'bg-risk-red',
  },
};

export function RiskBadge({ level, score, size = 'md', className }: RiskBadgeProps) {
  const cfg = CONFIG[level];

  return (
    <span
      data-interactive
      data-risk={level}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold select-none',
        cfg.bg,
        cfg.text,
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className={clsx('rounded-full', cfg.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      {cfg.label}
      {score !== undefined && (
        <span className="font-mono ml-0.5 opacity-80">{score}</span>
      )}
    </span>
  );
}
