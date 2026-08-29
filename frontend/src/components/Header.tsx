import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, Activity, UploadCloud, ListFilter, Cpu, BarChart3, Info, MousePointer, Settings } from 'lucide-react';
import { ProvenanceDrawer } from './ProvenanceDrawer';
import { AccessibilityPanel } from './AccessibilityPanel';
import { LoginButton } from './LoginButton';
import { useProvenance } from '../api/hooks';
import clsx from 'clsx';

export function Header() {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [accessibilityPanelOpen, setAccessibilityPanelOpen] = useState(false);
  const { data: provenance } = useProvenance();
  const [cursorDisabled, setCursorDisabled] = useState(() => {
    return localStorage.getItem('kavach_disable_custom_cursor') === 'true';
  });

  const toggleCursor = () => {
    const next = !cursorDisabled;
    setCursorDisabled(next);
    localStorage.setItem('kavach_disable_custom_cursor', String(next));
    if (next) {
      document.body.classList.add('cursor-disabled');
    } else {
      document.body.classList.remove('cursor-disabled');
    }
  };

  const navItems = [
    { to: '/ingest', label: 'Ingestion', icon: UploadCloud },
    { to: '/internals/pipeline', label: 'Model Internals', icon: Cpu },
    { to: '/dashboard', label: 'Operations', icon: Activity, exact: false },
    { to: '/flows', label: 'Flow Explorer', icon: ListFilter },
    { to: '/benchmark', label: 'Benchmark', icon: BarChart3 },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Project Title */}
          <NavLink to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" data-interactive>
            <div className="w-9 h-9 rounded-xl bg-accent-indigo flex items-center justify-center text-white shadow-glow-indigo">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-base tracking-tight text-text-primary">
                  Kavach
                </span>
              </div>
            </div>
          </NavLink>

          {/* Nav Links */}
          <nav className="flex items-center gap-1 overflow-x-auto py-1" role="navigation" aria-label="Main navigation">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-interactive
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-accent-indigo-subtle text-accent-indigo font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-canvas'
                    )
                  }
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Actions: Live status, Accessibility, Provenance, Cursor Toggle, Login */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-canvas border border-border-default text-[11px] font-mono text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-risk-green animate-pulse" aria-hidden="true" />
              <span>LIVE RECEPTOR</span>
            </div>

            {/* Accessibility Settings Button */}
            <button
              type="button"
              onClick={() => setAccessibilityPanelOpen(true)}
              data-interactive
              title="Accessibility Settings"
              aria-label="Open accessibility settings"
              className="p-1.5 rounded-lg border border-border-default bg-surface hover:bg-canvas text-text-primary transition-colors text-xs"
            >
              <Settings size={14} />
            </button>

            {/* Provenance Drawer Button */}
            <button
              type="button"
              onClick={() => setProvenanceOpen(true)}
              data-interactive
              title="Model Provenance & Limitations (No Black Box)"
              aria-label="Open model provenance information"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-default bg-surface hover:bg-canvas text-text-primary text-xs font-medium transition-colors"
            >
              <Info size={14} className="text-accent-teal" aria-hidden="true" />
              <span className="hidden lg:inline">Provenance</span>
            </button>

            {/* Custom Cursor Toggle */}
            <button
              type="button"
              onClick={toggleCursor}
              data-interactive
              title={cursorDisabled ? 'Enable custom cursor' : 'Disable custom cursor'}
              aria-label={cursorDisabled ? 'Enable custom cursor' : 'Disable custom cursor'}
              aria-pressed={!cursorDisabled}
              className={clsx(
                'p-1.5 rounded-lg border border-border-default transition-colors text-xs',
                cursorDisabled ? 'bg-canvas text-text-tertiary' : 'bg-accent-indigo-subtle text-accent-indigo'
              )}
            >
              <MousePointer size={14} aria-hidden="true" />
            </button>

            {/* Login Button */}
            <LoginButton 
              onOpenAccessibility={() => setAccessibilityPanelOpen(true)}
              onOpenProvenance={() => setProvenanceOpen(true)}
            />
          </div>
        </div>
      </header>

      <ProvenanceDrawer
        isOpen={provenanceOpen}
        onClose={() => setProvenanceOpen(false)}
        provenance={provenance}
      />

      <AccessibilityPanel
        isOpen={accessibilityPanelOpen}
        onClose={() => setAccessibilityPanelOpen(false)}
      />
    </>
  );
}
