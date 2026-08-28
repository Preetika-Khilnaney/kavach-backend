import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Check } from 'lucide-react';

export interface StepperStage {
  name: string;
  probability?: number;
  isActive: boolean;
  isPredicted: boolean;
  isComplete: boolean;
  description?: string;
  status?: 'idle' | 'active' | 'complete' | 'error';
}

interface KillChainStepperProps {
  stages: StepperStage[];
  variant?: '5-stage' | '7-stage';
  orientation?: 'horizontal' | 'vertical';
  showProbability?: boolean;
  showDescription?: boolean;
  compact?: boolean;
  className?: string;
  onStageClick?: (index: number) => void;
}

export function KillChainStepper({
  stages,
  orientation = 'horizontal',
  showProbability = true,
  showDescription = false,
  compact = false,
  className,
  onStageClick,
}: KillChainStepperProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={clsx(
        'flex',
        isHorizontal ? 'flex-row items-start' : 'flex-col',
        className,
      )}
    >
      {stages.map((stage, i) => (
        <div
          key={stage.name}
          className={clsx(
            'flex',
            isHorizontal ? 'flex-col items-center flex-1' : 'flex-row items-start gap-3',
            onStageClick && 'cursor-pointer',
          )}
          data-interactive={onStageClick ? true : undefined}
          onClick={() => onStageClick?.(i)}
        >
          {/* Connector + Node row */}
          <div
            className={clsx(
              'flex items-center',
              isHorizontal ? 'w-full' : 'flex-col',
            )}
          >
            {/* Leading connector */}
            {i > 0 && (
              <div
                className={clsx(
                  'transition-colors duration-300',
                  isHorizontal ? 'flex-1 h-0.5' : 'w-0.5 h-6',
                  stage.isComplete || stage.isActive
                    ? 'bg-accent-indigo'
                    : 'bg-border-default',
                )}
              />
            )}
            {i === 0 && isHorizontal && <div className="flex-1" />}

            {/* Stage node */}
            <motion.div
              className={clsx(
                'relative flex items-center justify-center rounded-full border-2 transition-colors shrink-0',
                compact ? 'w-7 h-7' : 'w-9 h-9',
                stage.isComplete && 'bg-accent-indigo border-accent-indigo text-white',
                stage.isActive && 'border-accent-indigo bg-accent-indigo-subtle text-accent-indigo',
                stage.status === 'error' && 'border-risk-red bg-risk-red-subtle text-risk-red',
                !stage.isComplete && !stage.isActive && stage.status !== 'error' && 'border-border-default bg-surface text-text-tertiary',
                stage.isPredicted && !stage.isActive && 'border-dashed',
              )}
              animate={
                stage.isActive
                  ? {
                      boxShadow: [
                        '0 0 0 0 rgba(79, 70, 229, 0)',
                        '0 0 0 6px rgba(79, 70, 229, 0.15)',
                        '0 0 0 0 rgba(79, 70, 229, 0)',
                      ],
                    }
                  : {}
              }
              transition={
                stage.isActive
                  ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                  : {}
              }
            >
              {stage.isComplete ? (
                <Check size={compact ? 12 : 14} strokeWidth={3} />
              ) : (
                <span className={clsx('font-heading font-semibold', compact ? 'text-[10px]' : 'text-xs')}>
                  {i + 1}
                </span>
              )}
            </motion.div>

            {/* Trailing connector */}
            {i < stages.length - 1 && (
              <div
                className={clsx(
                  'transition-colors duration-300',
                  isHorizontal ? 'flex-1 h-0.5' : 'w-0.5 h-6',
                  stages[i + 1].isComplete || stages[i + 1].isActive
                    ? 'bg-accent-indigo'
                    : 'bg-border-default',
                )}
              />
            )}
            {i === stages.length - 1 && isHorizontal && <div className="flex-1" />}
          </div>

          {/* Label area */}
          <div
            className={clsx(
              isHorizontal ? 'text-center mt-2 px-1' : 'flex-1 pt-0.5',
              'min-w-0',
            )}
          >
            <p
              className={clsx(
                'font-heading font-medium leading-tight',
                compact ? 'text-[10px]' : 'text-xs',
                stage.isActive ? 'text-accent-indigo' : stage.isComplete ? 'text-text-primary' : 'text-text-secondary',
              )}
            >
              {stage.name}
            </p>
            {showProbability && stage.probability !== undefined && (
              <p className={clsx('font-mono mt-0.5', compact ? 'text-[9px]' : 'text-[10px]', 'text-text-tertiary')}>
                {(stage.probability * 100).toFixed(0)}%
              </p>
            )}
            {showDescription && stage.description && (
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                {stage.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
