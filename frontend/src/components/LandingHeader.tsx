import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { ProvenanceDrawer } from './ProvenanceDrawer';
import { AccessibilityPanel } from './AccessibilityPanel';
import { LoginButton } from './LoginButton';
import { useProvenance } from '../api/hooks';

// Minimal top bar for the landing page: just the logo (left) and login
// button (right) -- the full Header's nav links/status badges/toolbar are
// intentionally left out here, see App.tsx.
export function LandingHeader() {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [accessibilityPanelOpen, setAccessibilityPanelOpen] = useState(false);
  const { data: provenance } = useProvenance();

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

          {/* Login Button */}
          <LoginButton
            onOpenAccessibility={() => setAccessibilityPanelOpen(true)}
            onOpenProvenance={() => setProvenanceOpen(true)}
            size="lg"
          />
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
