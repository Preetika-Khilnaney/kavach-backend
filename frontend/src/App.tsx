import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { LandingHeader } from './components/LandingHeader';
import { CustomCursor } from './components/CustomCursor';
import { SkipLink } from './components/SkipLink';
import { Landing } from './pages/Landing';
import { Operations } from './pages/Operations';
import { Ingest } from './pages/Ingest';
import { Flows } from './pages/Flows';
import { InternalsPipeline } from './pages/InternalsPipeline';
import { InternalsNetwork } from './pages/InternalsNetwork';
import { InternalsForecast } from './pages/InternalsForecast';
import { Benchmark } from './pages/Benchmark';
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { AuthProvider } from './contexts/AuthContext';

function AppShell() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <div className="min-h-screen bg-canvas text-text-primary flex flex-col font-body selection:bg-accent-indigo-subtle selection:text-accent-indigo">
      {/* Skip to main content link - visible on keyboard focus */}
      <SkipLink />

      {/* Custom interactive cursor */}
      <CustomCursor />

      {/* Global Navigation Header -- swapped for a minimal logo+login bar on the landing page */}
      {isLanding ? <LandingHeader /> : <Header />}

      {/* Main Content Viewport */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Operations />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/flows" element={<Flows />} />
          <Route path="/internals/pipeline" element={<InternalsPipeline />} />
          <Route path="/internals/network" element={<InternalsNetwork />} />
          <Route path="/internals/forecast" element={<InternalsForecast />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Persistent Footer */}
      <footer className="bg-surface border-t border-border-default py-4 text-center text-xs text-text-secondary">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-heading font-semibold text-text-primary">Kavach SIH 2026</span>
            <span aria-hidden="true">·</span>
            <span>AI World Model Intrusion Forecasting System</span>
          </div>
          <div className="font-mono text-[11px] text-text-tertiary">
            Built on NetJEPA Architecture · Explainability-First
          </div>
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AccessibilityProvider>
      <AuthProvider>
        <Router>
          <AppShell />
        </Router>
      </AuthProvider>
    </AccessibilityProvider>
  );
}

export default App;
