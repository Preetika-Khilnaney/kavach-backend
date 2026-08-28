import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { SkeletonRect } from './Skeleton';

export type DataState = 'loading' | 'empty' | 'live' | 'replay' | 'error';

interface DataStateWrapperProps {
  state: DataState;
  children: ReactNode;
  /** Message shown in empty state */
  emptyMessage?: string;
  /** Message shown in error state */
  errorMessage?: string;
  /** Timestamp of last successful data load */
  lastUpdated?: string;
  /** Called when user clicks retry in error state */
  onRetry?: () => void;
  /** Skeleton component to show during loading */
  skeleton?: ReactNode;
  /** Number of skeleton items if no custom skeleton provided */
  skeletonCount?: number;
  /** Time range shown in replay mode */
  replayRange?: { start: string; end: string };
  className?: string;
}

export function DataStateWrapper({
  state,
  children,
  emptyMessage = 'No data available',
  errorMessage = 'Backend unreachable',
  lastUpdated,
  onRetry,
  skeleton,
  skeletonCount = 3,
  replayRange,
  className,
}: DataStateWrapperProps) {
  return (
    <div className={clsx('relative', className)}>
      {/* Live / Replay badge */}
      <AnimatePresence>
        {state === 'live' && (
          <motion.div
            className="absolute top-3 right-3 z-10"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="badge-live">Live</span>
          </motion.div>
        )}
        {state === 'replay' && (
          <motion.div
            className="absolute top-3 right-3 z-10"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="badge-replay">
              Replay
              {replayRange && (
                <span className="font-mono ml-1 text-[10px] opacity-70">
                  {new Date(replayRange.start).toLocaleTimeString()} – {new Date(replayRange.end).toLocaleTimeString()}
                </span>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* States */}
      <AnimatePresence mode="wait">
        {state === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {skeleton || (
              <div className="space-y-3 p-4">
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <SkeletonRect key={i} className="h-12" />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {state === 'empty' && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 px-4"
          >
            <Inbox className="w-10 h-10 text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary text-center">{emptyMessage}</p>
          </motion.div>
        )}

        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 px-4 border border-risk-red/20 rounded-lg bg-risk-red-subtle"
          >
            <AlertCircle className="w-8 h-8 text-risk-red mb-2" />
            <p className="text-sm font-medium text-risk-red">{errorMessage}</p>
            {lastUpdated && (
              <p className="text-xs text-text-tertiary mt-1 font-mono">
                Last updated: {new Date(lastUpdated).toLocaleString()}
              </p>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                data-interactive
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface border border-border-default text-text-primary hover:border-accent-indigo transition-colors"
              >
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </motion.div>
        )}

        {(state === 'live' || state === 'replay') && (
          <motion.div
            key="data"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className={clsx(state === 'replay' && 'opacity-90')}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
