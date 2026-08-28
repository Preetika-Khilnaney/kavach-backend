import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
}

export function SkeletonLine({ className }: SkeletonProps) {
  return (
    <div className={clsx('h-3 rounded-full bg-border-default animate-skeleton', className)} />
  );
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return (
    <div className={clsx('rounded-full bg-border-default animate-skeleton', className)} style={{ aspectRatio: 1 }} />
  );
}

export function SkeletonRect({ className }: SkeletonProps) {
  return (
    <div className={clsx('rounded-md bg-border-default animate-skeleton', className)} />
  );
}

/** Renders a skeleton shaped like a chart area (wavy top edge) */
export function SkeletonChart({ className }: SkeletonProps) {
  return (
    <div className={clsx('rounded-lg bg-border-default animate-skeleton', className)} style={{ minHeight: 160 }} />
  );
}

/** Renders a skeleton shaped like a table row */
export function SkeletonTableRow({ cols = 6, className }: SkeletonProps & { cols?: number }) {
  return (
    <div className={clsx('flex items-center gap-4 px-4 py-3', className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonLine key={i} className={clsx('flex-1', i === 0 && 'max-w-24', i === cols - 1 && 'max-w-16')} />
      ))}
    </div>
  );
}
