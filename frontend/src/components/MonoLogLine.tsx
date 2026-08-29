import type { Severity } from '../api/types';
import clsx from 'clsx';
import { motion } from 'framer-motion';

interface MonoLogLineProps {
  timestamp: string;
  severity: Severity;
  message: string;
  flowId?: string;
  className?: string;
  animate?: boolean;
  /** Entrance delay in seconds, so a list can reveal items one after another instead of all at once. */
  delay?: number;
  /** Entrance animation duration in seconds. */
  duration?: number;
  onClick?: () => void;
  children?: React.ReactNode;
}

const SEVERITY_STYLES: Record<Severity, { dot: string; border: string }> = {
  info: { dot: 'bg-accent-teal', border: 'border-l-accent-teal' },
  warning: { dot: 'bg-risk-amber', border: 'border-l-risk-amber' },
  critical: { dot: 'bg-risk-red', border: 'border-l-risk-red' },
};

export function MonoLogLine({
  timestamp,
  severity,
  message,
  flowId,
  className,
  animate = false,
  delay = 0,
  duration = 0.3,
  onClick,
  children,
}: MonoLogLineProps) {
  const styles = SEVERITY_STYLES[severity];
  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  
  // Generate accessible label
  const ariaLabel = `${severity} alert at ${timeStr}: ${message}${flowId ? `, flow ID ${flowId.slice(0, 8)}` : ''}`;

  const content = (
    <div
      className={clsx(
        'flex items-start gap-3 px-3 py-2 border-l-2 rounded-r-md',
        'bg-surface hover:bg-canvas transition-colors duration-200',
        styles.border,
        onClick && 'cursor-pointer',
        className,
      )}
      data-interactive={onClick ? true : undefined}
      data-risk={severity === 'critical' ? 'high' : severity === 'warning' ? 'medium' : undefined}
      onClick={onClick}
      role={onClick ? 'button' : 'article'}
      aria-label={onClick ? ariaLabel : undefined}
    >
      <span 
        className={clsx('mt-1.5 w-1.5 h-1.5 rounded-full shrink-0', styles.dot)} 
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <time dateTime={timestamp} className="font-mono text-text-tertiary">{timeStr}</time>
          {flowId && (
            <span className="font-mono text-text-tertiary truncate text-[10px] opacity-60">
              {flowId.slice(0, 8)}
            </span>
          )}
        </div>
        <p className="text-sm text-text-primary mt-0.5 leading-snug">{message}</p>
        {children}
      </div>
    </div>
  );

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -16, height: 0 }}
        animate={{ opacity: 1, x: 0, height: 'auto' }}
        transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
}
