import { useEffect, useState } from 'react';

export function CustomCursor() {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isInteractive, setIsInteractive] = useState(false);
  const [riskColor, setRiskColor] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    // Check local storage or reduced-motion preference
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const storedPref = localStorage.getItem('kavach_disable_custom_cursor') === 'true';
    if (isReduced || storedPref) {
      setDisabled(true);
      document.body.classList.add('cursor-disabled');
    }

    const onMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });

      // Find if hovering interactive or risk element
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactiveEl = target.closest('[data-interactive]');
      const riskEl = target.closest('[data-risk]');

      setIsInteractive(!!interactiveEl);

      if (riskEl) {
        const level = riskEl.getAttribute('data-risk');
        setRiskColor(level);
      } else {
        setRiskColor(null);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  if (disabled) return null;

  return (
    <>
      <div
        className="cursor-dot"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      />
      <div
        className={`cursor-ring ${isInteractive ? 'interactive' : ''} ${riskColor ? `risk-${riskColor}` : ''}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      />
    </>
  );
}
