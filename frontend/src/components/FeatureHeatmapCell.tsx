import clsx from 'clsx';

interface FeatureHeatmapCellProps {
  name: string;
  value: number;
  contribution: number; // 0-1
  className?: string;
}

/**
 * A compact cell showing a feature name + value, background-colored
 * by contribution magnitude.
 *
 * High contribution → teal background.
 * Low contribution  → neutral/transparent.
 * Negative values   → indigo tint.
 */
export function FeatureHeatmapCell({ name, value, contribution, className }: FeatureHeatmapCellProps) {
  // Compute background opacity based on contribution magnitude
  const opacity = Math.min(contribution, 1);
  const isNegative = value < 0;

  const bgColor = isNegative
    ? `rgba(79, 70, 229, ${opacity * 0.2})`   // indigo for negative
    : `rgba(14, 165, 160, ${opacity * 0.25})`;  // teal for positive

  const borderColor = isNegative
    ? `rgba(79, 70, 229, ${opacity * 0.35})`
    : `rgba(14, 165, 160, ${opacity * 0.35})`;

  return (
    <div
      className={clsx(
        'px-2 py-1.5 rounded-md border text-xs transition-all duration-200',
        'hover:shadow-sm',
        className,
      )}
      style={{
        backgroundColor: bgColor,
        borderColor: borderColor,
      }}
      title={`${name}: ${value.toFixed(3)} (contribution: ${(contribution * 100).toFixed(0)}%)`}
    >
      <div className="font-mono text-[10px] text-text-secondary truncate">{name}</div>
      <div className="font-mono font-semibold text-text-primary mt-0.5">{value.toFixed(2)}</div>
    </div>
  );
}
