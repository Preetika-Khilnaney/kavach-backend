import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import type { Trend } from '../api/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

interface RiskGaugeProps {
  score: number;
  trend: Trend;
  delta: number;
  activeStage?: string;
  explanation?: string;
  className?: string;
}

function getRiskColor(score: number): string {
  if (score < 25) return '#16A34A';
  if (score < 50) return '#D97706';
  if (score < 75) return '#DC2626';
  return '#DC2626';
}

function getRiskLevel(score: number): string {
  if (score < 25) return 'low';
  if (score < 50) return 'medium';
  if (score < 75) return 'high';
  return 'critical';
}

const TrendIcon = ({ trend, className }: { trend: Trend; className?: string }) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className={clsx('text-risk-red', className)} />;
    case 'down':
      return <TrendingDown className={clsx('text-risk-green', className)} />;
    default:
      return <Minus className={clsx('text-text-tertiary', className)} />;
  }
};

export function RiskGauge({ score, trend, delta, activeStage, explanation, className }: RiskGaugeProps) {
  const SIZE = 200;
  const STROKE = 12;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = Math.PI * RADIUS; // semicircle
  const CENTER = SIZE / 2;

  const springScore = useSpring(0, { stiffness: 60, damping: 20 });
  const animatedOffset = useTransform(springScore, [0, 100], [CIRCUMFERENCE, 0]);

  useEffect(() => {
    springScore.set(score);
  }, [score, springScore]);

  const riskColor = getRiskColor(score);
  const riskLevel = getRiskLevel(score);
  
  // Generate accessible label for the gauge
  const trendText = trend === 'up' ? 'increasing' : trend === 'down' ? 'decreasing' : 'stable';
  const ariaLabel = `Infiltration risk score: ${score} out of 100, ${riskLevel} risk level, trend ${trendText} by ${delta} points`;

  return (
    <div 
      className={clsx('flex flex-col items-center', className)} 
      data-risk={riskLevel}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE / 2 + 30 }}>
        <svg width={SIZE} height={SIZE / 2 + 20} viewBox={`0 0 ${SIZE} ${SIZE / 2 + 20}`} aria-hidden="true">
          {/* Background arc */}
          <path
            d={`M ${STROKE / 2} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${SIZE - STROKE / 2} ${CENTER}`}
            fill="none"
            stroke="#E4E9EF"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* Colored arc */}
          <motion.path
            d={`M ${STROKE / 2} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${SIZE - STROKE / 2} ${CENTER}`}
            fill="none"
            stroke={riskColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{ strokeDashoffset: animatedOffset }}
          />
        </svg>

        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
          <motion.span
            className="font-heading font-bold text-text-primary"
            style={{ fontSize: 48, lineHeight: 1 }}
            key={score}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
          >
            {score}
          </motion.span>
          <div className="flex items-center gap-1.5 mt-1">
            <TrendIcon trend={trend} className="w-4 h-4" />
            <span className={clsx(
              'text-sm font-medium font-mono',
              trend === 'up' ? 'text-risk-red' : trend === 'down' ? 'text-risk-green' : 'text-text-tertiary',
            )} aria-hidden="true">
              {trend === 'up' ? '+' : trend === 'down' ? '-' : ''}{delta}
            </span>
          </div>
        </div>
      </div>

      {/* Explanation */}
      {explanation && (
        <p className="text-xs text-text-secondary text-center max-w-xs mt-2 leading-relaxed">
          {explanation}
        </p>
      )}
      {!explanation && activeStage && (
        <p className="text-xs text-text-secondary text-center max-w-xs mt-2 leading-relaxed">
          The model estimates a <span className="font-semibold text-text-primary">{score}%</span> chance
          of an active intrusion progressing past{' '}
          <span className="font-semibold text-accent-indigo">{activeStage}</span>.
        </p>
      )}
    </div>
  );
}
