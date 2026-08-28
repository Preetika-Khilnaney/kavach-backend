import { useState } from 'react';
import { Check, X, MessageSquare } from 'lucide-react';
import { submitFeedback } from '../api';
import type { AnalystVerdict } from '../api/types';
import clsx from 'clsx';

interface FeedbackControlsProps {
  targetType: 'alert' | 'flow';
  targetId: string;
  currentVerdict?: AnalystVerdict;
  onVerdictChange?: (verdict: 'confirmed' | 'false-positive', note?: string) => void;
  compact?: boolean;
  className?: string;
}

export function FeedbackControls({
  targetType,
  targetId,
  currentVerdict,
  onVerdictChange,
  compact = false,
  className,
}: FeedbackControlsProps) {
  const [verdict, setVerdict] = useState<AnalystVerdict>(currentVerdict || null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [pendingVerdict, setPendingVerdict] = useState<'confirmed' | 'false-positive' | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAction = (type: 'confirmed' | 'false-positive') => {
    if (verdict === type) return; // already selected
    setPendingVerdict(type);
    setShowNoteModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingVerdict) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        targetType,
        targetId,
        verdict: pendingVerdict,
        note: note.trim() || undefined,
      });
      setVerdict(pendingVerdict);
      onVerdictChange?.(pendingVerdict, note.trim() || undefined);
      setShowNoteModal(false);
      setNote('');
    } catch (err) {
      console.error('Failed to submit feedback', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (verdict) {
    return (
      <div className={clsx('inline-flex items-center gap-1.5', className)}>
        {verdict === 'confirmed' ? (
          <span
            data-interactive
            className={clsx(
              'inline-flex items-center gap-1 font-semibold rounded-md bg-risk-green-subtle text-risk-green border border-risk-green/30',
              compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
            )}
          >
            <Check size={compact ? 11 : 13} strokeWidth={2.5} />
            Analyst Confirmed
          </span>
        ) : (
          <span
            data-interactive
            className={clsx(
              'inline-flex items-center gap-1 font-semibold rounded-md bg-risk-amber-subtle text-risk-amber border border-risk-amber/30',
              compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
            )}
          >
            <X size={compact ? 11 : 13} strokeWidth={2.5} />
            False Positive
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={clsx('relative inline-flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => handleAction('confirmed')}
        data-interactive
        title="Confirm threat as legitimate positive"
        className={clsx(
          'inline-flex items-center gap-1 font-medium rounded border transition-colors',
          'bg-surface hover:bg-risk-green-subtle text-text-secondary hover:text-risk-green border-border-default hover:border-risk-green/40',
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        )}
      >
        <Check size={compact ? 11 : 13} className="text-risk-green" />
        <span>Confirm</span>
      </button>

      <button
        type="button"
        onClick={() => handleAction('false-positive')}
        data-interactive
        title="Mark as false positive"
        className={clsx(
          'inline-flex items-center gap-1 font-medium rounded border transition-colors',
          'bg-surface hover:bg-risk-amber-subtle text-text-secondary hover:text-risk-amber border-border-default hover:border-risk-amber/40',
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        )}
      >
        <X size={compact ? 11 : 13} className="text-risk-amber" />
        <span>False Pos</span>
      </button>

      {/* Note dialog */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
          <div className="bg-surface rounded-xl border border-border-default shadow-panel max-w-sm w-full p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 font-heading font-semibold text-text-primary text-sm">
                <MessageSquare className="w-4 h-4 text-accent-indigo" />
                <span>
                  {pendingVerdict === 'confirmed' ? 'Confirm Threat Verdict' : 'Mark as False Positive'}
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Provide feedback to reinforce the self-supervised NetJEPA prediction weights.
              </p>
            </div>

            <div>
              <label className="block text-xs font-mono text-text-tertiary mb-1">
                Optional Analyst Notes
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="E.g., Authorized penetration test or known benign backup job..."
                className="w-full text-xs font-body p-2.5 border border-border-default rounded-md bg-canvas text-text-primary focus:outline-none focus:border-accent-indigo h-20 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default">
              <button
                type="button"
                onClick={() => setShowNoteModal(false)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmSubmit}
                className={clsx(
                  'px-3.5 py-1.5 rounded-md text-xs font-semibold text-white transition-opacity',
                  pendingVerdict === 'confirmed' ? 'bg-risk-green hover:bg-risk-green/90' : 'bg-risk-amber hover:bg-risk-amber/90',
                  submitting && 'opacity-60 cursor-not-allowed'
                )}
              >
                {submitting ? 'Submitting...' : 'Save Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
