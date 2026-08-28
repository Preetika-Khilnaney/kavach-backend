import { X, Type, Contrast, Gauge } from 'lucide-react';
import { useAccessibility } from '../contexts/AccessibilityContext';
import type { TextSize } from '../contexts/AccessibilityContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import clsx from 'clsx';

interface AccessibilityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccessibilityPanel({ isOpen, onClose }: AccessibilityPanelProps) {
  const {
    textSize,
    highContrast,
    reduceMotion,
    setTextSize,
    toggleHighContrast,
    toggleReduceMotion,
  } = useAccessibility();
  
  const containerRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  const textSizeOptions: { value: TextSize; label: string }[] = [
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel - Fixed positioning with proper centering */}
      <div
        ref={containerRef}
        role="dialog"
        aria-labelledby="accessibility-panel-title"
        aria-modal="true"
        className="fixed inset-4 sm:top-[10%] sm:left-1/2 sm:-translate-x-1/2 sm:inset-auto z-50 bg-surface rounded-2xl border border-border-default shadow-panel w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-indigo-subtle flex items-center justify-center">
              <Contrast size={16} className="text-accent-indigo" />
            </div>
            <h2 id="accessibility-panel-title" className="font-heading font-semibold text-sm text-text-primary">
              Accessibility Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close accessibility settings"
            data-interactive
            className="p-1 rounded hover:bg-canvas text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Text Size */}
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-heading font-semibold text-text-primary mb-3">
              <Type size={16} className="text-accent-teal" />
              Text Size
            </legend>
            <div className="flex gap-2">
              {textSizeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTextSize(option.value)}
                  data-interactive
                  aria-pressed={textSize === option.value}
                  className={clsx(
                    'flex-1 px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all',
                    textSize === option.value
                      ? 'border-accent-indigo bg-accent-indigo-subtle text-accent-indigo'
                      : 'border-border-default bg-canvas text-text-secondary hover:border-text-tertiary'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-2">
              Adjusts text size across the entire interface.
            </p>
          </fieldset>

          {/* High Contrast */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="high-contrast-toggle" className="flex items-center gap-2 text-sm font-heading font-semibold text-text-primary">
                <Contrast size={16} className="text-accent-teal" />
                High Contrast Mode
              </label>
              <button
                id="high-contrast-toggle"
                type="button"
                role="switch"
                aria-checked={highContrast}
                onClick={toggleHighContrast}
                data-interactive
                className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors',
                  highContrast ? 'bg-accent-indigo' : 'bg-border-default'
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    highContrast ? 'left-[22px]' : 'left-0.5'
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              Increases contrast ratios for better visibility.
            </p>
          </div>

          {/* Reduce Motion */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="reduce-motion-toggle" className="flex items-center gap-2 text-sm font-heading font-semibold text-text-primary">
                <Gauge size={16} className="text-accent-teal" />
                Reduce Motion
              </label>
              <button
                id="reduce-motion-toggle"
                type="button"
                role="switch"
                aria-checked={reduceMotion}
                onClick={toggleReduceMotion}
                data-interactive
                className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors',
                  reduceMotion ? 'bg-accent-indigo' : 'bg-border-default'
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    reduceMotion ? 'left-[22px]' : 'left-0.5'
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              Minimizes animations and transitions throughout the interface.
            </p>
          </div>

          {/* Info Footer */}
          <div className="pt-4 border-t border-border-default">
            <p className="text-xs text-text-secondary leading-relaxed">
              These settings persist across sessions. Kavach is designed to be accessible to all analysts regardless of visual, motor, or cognitive abilities.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
