import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Shield, Zap, Eye, HardDrive, Users, CheckCircle, TrendingUp, Clock, Target, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { KillChainStepper } from '../components/KillChainStepper';
import { ProvenanceDrawer } from '../components/ProvenanceDrawer';
import { MonoLogLine } from '../components/MonoLogLine';
import { useProvenance, useStreamingData } from '../api/hooks';
import { LoginModal } from '../components/LoginModal';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../api';
import clsx from 'clsx';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-risk-red-subtle text-risk-red border-risk-red/30',
  warning: 'bg-risk-amber-subtle text-risk-amber border-risk-amber/30',
  info: 'bg-accent-teal-subtle text-accent-teal border-accent-teal/30',
};

// Illustrative "verified benign" entries -- there's no real green/benign
// severity in the alerts feed (it only ever contains flagged windows), so
// these are hardcoded for visual variety, clearly marked "Illustrative"
// rather than passed off as real telemetry.
const DEMO_GREEN_EVENTS = [
  {
    id: 'demo-green-1',
    title: 'Access reviewed — verified benign',
    description: 'Analyst confirmed flow behavior matches the known-safe baseline. No further action required.',
    stage: 'Benign',
  },
  {
    id: 'demo-green-2',
    title: 'Session closed — no anomalies',
    description: 'Monitoring window completed with no deviation from expected baseline traffic.',
    stage: 'Benign',
  },
];

function GreenDemoLine({ title, description, stage, delay, duration }: { title: string; description: string; stage: string; delay: number; duration: number }) {
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <motion.div
      initial={{ opacity: 0, x: -16, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start gap-3 px-3 py-2 border-l-2 border-l-risk-green rounded-r-md bg-surface hover:bg-canvas transition-colors duration-200">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-risk-green" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <span className="font-mono text-xs text-text-tertiary">{timeStr}</span>
          <p className="text-sm text-text-primary mt-0.5 leading-snug">{title}</p>
          <div className="mt-1 space-y-1">
            <p className="text-[11px] text-text-secondary leading-snug line-clamp-2">{description}</p>
            <div className="flex items-center gap-1.5">
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono border bg-risk-green-subtle text-risk-green border-risk-green/30">
                {stage}
              </span>
              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono border bg-canvas text-text-tertiary border-border-default">
                Illustrative
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Real forecast alerts (src/storage/results_store.py via GET /alerts), polled
// every 4s -- replaces the earlier decorative sphere/line 3D animation with
// Kavach's actual event stream. Empty until a capture's been processed on
// the Ingestion page; that's honest, not a bug.
function LiveActivityPanel() {
  const { data: alerts, loading, error, isStreaming } = useStreamingData(() => api.getAlerts(), 4000, 6);
  const recent = (alerts || []).slice(0, 5);

  return (
    <div className="glow-frame w-full h-[480px] md:h-[560px] rounded-2xl">
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="glow-trace-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-accent-teal-light)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--color-accent-teal-light)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-accent-indigo-light)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%" rx="16" ry="16"
          fill="none" stroke="url(#glow-trace-gradient)" strokeWidth="6" strokeLinecap="round"
          pathLength="100" strokeDasharray="12 88"
          className="glow-trace glow-trace-blur"
        />
        <rect
          x="0" y="0" width="100%" height="100%" rx="16" ry="16"
          fill="none" stroke="url(#glow-trace-gradient)" strokeWidth="2" strokeLinecap="round"
          pathLength="100" strokeDasharray="12 88"
          className="glow-trace"
        />
      </svg>
      <div className="w-full h-full rounded-2xl overflow-hidden bg-surface shadow-panel flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-canvas shrink-0">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-accent-indigo" aria-hidden="true" />
          <span className="font-heading font-semibold text-xs text-text-primary">Kavach</span>
          <span
            className={clsx(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border',
              isStreaming
                ? 'bg-risk-green-subtle text-risk-green border-risk-green/30'
                : 'bg-canvas text-text-tertiary border-border-default',
            )}
          >
            <span
              className={clsx('w-1.5 h-1.5 rounded-full bg-current', isStreaming && 'animate-pulse')}
              aria-hidden="true"
            />
            LIVE
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-tertiary">
          {loading ? 'connecting…' : `${alerts?.length ?? 0} tracked`}
        </span>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1.5"
        role="log"
        aria-live="polite"
        aria-label="Recent Kavach forecast alerts"
      >
        {error ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-xs text-text-secondary">
              Backend unreachable — start the API to see live forecasts here.
            </p>
          </div>
        ) : recent.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
            <Activity size={22} className="text-text-tertiary" aria-hidden="true" />
            <p className="text-xs text-text-secondary max-w-[220px]">
              No forecasts yet.{' '}
              <Link to="/ingest" data-interactive className="text-accent-indigo hover:underline">
                Process a capture
              </Link>{' '}
              to see Kavach's real predictions appear here.
            </p>
          </div>
        ) : (
          recent.flatMap((alert, idx) => {
            const slot = idx * 2.1;
            const items = [
              <MonoLogLine
                key={alert.id}
                timestamp={alert.timestamp}
                severity={alert.severity}
                message={alert.title}
                flowId={alert.flowId}
                animate
                delay={slot}
                duration={7}
              >
                <div className="mt-1 space-y-1">
                  <p className="text-[11px] text-text-secondary leading-snug line-clamp-2">
                    {alert.description}
                  </p>
                  <span
                    className={clsx(
                      'inline-block px-1.5 py-0.5 rounded text-[9px] font-mono border',
                      SEVERITY_BADGE[alert.severity],
                    )}
                  >
                    {alert.killChainStage}
                  </span>
                </div>
              </MonoLogLine>,
            ];
            // Interleave the illustrative green entries for visual variety --
            // the real alerts feed only ever contains flagged (non-benign)
            // windows, so there's no real "verified safe" event to show here.
            const demo = DEMO_GREEN_EVENTS[idx];
            if (demo) {
              items.push(
                <GreenDemoLine
                  key={demo.id}
                  title={demo.title}
                  description={demo.description}
                  stage={demo.stage}
                  delay={slot + 1.05}
                  duration={7}
                />,
              );
            }
            return items;
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border-default bg-canvas text-[10px] font-mono text-text-tertiary shrink-0">
        <span>KAVACH · NETJEPA FORECASTING</span>
        <span>LIVE + ILLUSTRATIVE EVENTS</span>
      </div>
      </div>
    </div>
  );
}

export function Landing() {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { data: provenance } = useProvenance();

  // Scroll to how-it-works section
  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mock 7-stage pipeline data for static display
  const pipelineStages = [
    { name: 'Ingestion', isActive: false, isPredicted: false, isComplete: true, probability: 1.0 },
    { name: 'Feature Extraction', isActive: false, isPredicted: false, isComplete: true, probability: 1.0 },
    { name: 'NetJEPA Forward Pass', isActive: true, isPredicted: false, isComplete: false, probability: 0.95 },
    { name: 'Forecast Rollout', isActive: false, isPredicted: true, isComplete: false, probability: 0.73 },
    { name: 'Attack Stage Mapping', isActive: false, isPredicted: true, isComplete: false, probability: 0.68 },
    { name: 'Explainability', isActive: false, isPredicted: true, isComplete: false, probability: 0.82 },
    { name: 'Human Review', isActive: false, isPredicted: true, isComplete: false, probability: 0.60 },
  ];

  return (
    <div className="space-y-20 pb-12">
      {/* Hero Section */}
      <section className="pt-[32px] md:pt-[56px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text Content */}
          <div className="space-y-6">
            <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-text-primary leading-tight">
              Forecasting network intrusions{' '}
              <span className="text-accent-indigo">before they complete</span>,{' '}
              <span className="font-script">not after</span>
            </h1>
            
            <p className="text-lg text-text-secondary leading-relaxed max-w-xl mt-[30px]">
              Kavach uses a joint-embedding predictive architecture to forecast attacker behavior across the cyber kill chain, providing security analysts with foresight instead of hindsight.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (isAuthenticated) {
                    navigate('/ingest');
                  } else {
                    setLoginOpen(true);
                  }
                }}
                data-interactive
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-indigo text-white font-medium hover:bg-accent-indigo-light transition-colors shadow-sm"
              >
                View Live Dashboard
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              
              <button
                type="button"
                onClick={scrollToHowItWorks}
                data-interactive
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-border-default bg-surface text-text-primary font-medium hover:border-accent-indigo hover:text-accent-indigo transition-colors"
              >
                How it works
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Right: Live Activity Panel */}
          <div className="order-first lg:order-last">
            <LiveActivityPanel />
          </div>
        </div>
      </section>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* Problem Statement Section */}
      <section className="bg-surface border border-border-default rounded-2xl p-8 md:p-12 shadow-card">
        <h2 className="font-heading font-bold text-2xl md:text-3xl text-text-primary mb-8 text-center">
          The Attacker Advantage
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Stat 1 */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-xl bg-risk-red-subtle flex items-center justify-center">
              <Clock size={28} className="text-risk-red" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="font-heading font-bold text-4xl text-accent-indigo">~29 min</div>
              <p className="text-sm text-text-secondary">
                Average time for attackers to pivot laterally after initial compromise
              </p>
            </div>
          </div>

          {/* Stat 2 */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-xl bg-risk-amber-subtle flex items-center justify-center">
              <TrendingUp size={28} className="text-risk-amber" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="font-heading font-bold text-4xl text-accent-indigo">~14 days</div>
              <p className="text-sm text-text-secondary">
                Median time to detect a breach with traditional signature-based systems
              </p>
            </div>
          </div>

          {/* Stat 3 */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-xl bg-risk-green-subtle flex items-center justify-center">
              <Target size={28} className="text-risk-green" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="font-heading font-bold text-4xl text-accent-indigo">&lt;5 min</div>
              <p className="text-sm text-text-secondary">
                Kavach forecast horizon: predict the next kill chain stage before execution
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-text-secondary mt-8 max-w-3xl mx-auto leading-relaxed">
          Traditional security systems react to attacks that have already happened. Kavach closes the gap by forecasting attacker behavior in the latent space, giving defenders time to act before the next stage of compromise.
        </p>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="text-center mb-12">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-text-primary mb-4">
            How Kavach Works
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            A seven-stage pipeline that transforms raw network telemetry into actionable threat intelligence with full explainability.
          </p>
        </div>

        <div className="bg-surface border border-border-default rounded-2xl p-8 md:p-12 shadow-card">
          <KillChainStepper
            stages={pipelineStages}
            variant="7-stage"
            orientation="horizontal"
            showProbability={false}
            showDescription={false}
          />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { 
                title: 'Ingestion', 
                desc: 'Real-time capture of network flows, packet metadata, and behavioral features from distributed sensors.'
              },
              { 
                title: 'Feature Extraction', 
                desc: 'Statistical and semantic feature engineering from raw telemetry into high-dimensional representations.'
              },
              { 
                title: 'NetJEPA Forward Pass', 
                desc: 'Joint-embedding world model predicts latent representations of future network states without pixel-level reconstruction.'
              },
              { 
                title: 'Forecast Rollout', 
                desc: 'K-step autoregressive rollout maps latent predictions to probable attacker actions and tactics.'
              },
              { 
                title: 'Attack Stage Mapping', 
                desc: 'Forecasted actions mapped to MITRE ATT&CK kill chain stages with probabilistic confidence intervals.'
              },
              { 
                title: 'Explainability', 
                desc: 'Feature attribution, decision provenance, and causal traces make every forecast interpretable to human analysts.'
              },
              { 
                title: 'Human Review', 
                desc: 'Analysts validate, reject, or confirm forecasts with feedback loops that continuously improve the model.'
              },
            ].map((stage, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-xs text-accent-indigo">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    {stage.title}
                  </h3>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {stage.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why It's Different Section */}
      <section>
        <div className="text-center mb-12">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-text-primary mb-4">
            Why Kavach Is Different
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Not just another detection system. A fundamentally different approach to network security.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Predictive */}
          <div className="bg-surface border border-border-default rounded-xl p-6 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent-indigo-subtle flex items-center justify-center shrink-0">
                <Zap size={24} className="text-accent-indigo" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h3 className="font-heading font-semibold text-lg text-text-primary">
                  Predictive, Not Reactive
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Traditional systems detect attacks after they've happened. Kavach forecasts the next stage of the kill chain before it executes, giving defenders time to preempt rather than remediate.
                </p>
                <ul className="space-y-1 text-xs text-text-secondary">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Forecasts attacker behavior 4–7 steps ahead</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>No signature database — learns from telemetry patterns</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Adapts to novel, zero-day attack trajectories</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Card 2: Explainable */}
          <div className="bg-surface border border-border-default rounded-xl p-6 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent-teal-subtle flex items-center justify-center shrink-0">
                <Eye size={24} className="text-accent-teal" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h3 className="font-heading font-semibold text-lg text-text-primary">
                  Explainable, Not a Black Box
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Every forecast is traceable to the features that drove it. Decision audit trails, feature attribution heatmaps, and provenance logs ensure analysts understand and trust the system's reasoning.
                </p>
                <ul className="space-y-1 text-xs text-text-secondary">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Feature-level attribution for every prediction</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Full decision provenance and audit trails</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Human-in-the-loop validation and feedback</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Card 3: Offline */}
          <div className="bg-surface border border-border-default rounded-xl p-6 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent-violet-subtle flex items-center justify-center shrink-0">
                <HardDrive size={24} className="text-accent-violet" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h3 className="font-heading font-semibold text-lg text-text-primary">
                  Offline, Air-Gap Ready
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  No cloud dependency. All inference runs locally on-premises, making Kavach suitable for classified networks, critical infrastructure, and environments with strict data sovereignty requirements.
                </p>
                <ul className="space-y-1 text-xs text-text-secondary">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Zero external API calls or cloud telemetry</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Local model inference with GPU acceleration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Suitable for classified and air-gapped networks</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Card 4: Accessible */}
          <div className="bg-surface border border-border-default rounded-xl p-6 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-risk-green-subtle flex items-center justify-center shrink-0">
                <Users size={24} className="text-risk-green" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h3 className="font-heading font-semibold text-lg text-text-primary">
                  Accessible to Every Analyst
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Built from the ground up with accessibility as a first-class feature — not a compliance checkbox. The interface is usable by analysts with diverse visual, motor, and cognitive abilities, ensuring no one is excluded from critical security operations.
                </p>
                <ul className="space-y-1 text-xs text-text-secondary">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Full keyboard navigation and screen reader support</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>High-contrast mode, text scaling, reduced motion</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-risk-green shrink-0" aria-hidden="true" />
                    <span>Table alternatives for all visual-only data views</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-gradient-to-br from-accent-indigo via-accent-indigo-light to-accent-violet text-white rounded-2xl p-8 md:p-12 text-center shadow-panel">
        <h2 className="font-heading font-bold text-2xl md:text-3xl mb-4">
          Ready to see it in action?
        </h2>
        <p className="text-white/90 max-w-xl mx-auto mb-6">
          Explore the live dashboard, benchmark results, and model internals to see how Kavach forecasts intrusions before they complete.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            to="/ingest"
            data-interactive
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-accent-indigo font-medium hover:bg-white/90 transition-colors shadow-sm"
          >
            View Live Dashboard
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link
            to="/benchmark"
            data-interactive
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-white/30 text-white font-medium hover:bg-white/10 transition-colors"
          >
            See Benchmark Results
          </Link>
          <button
            type="button"
            onClick={() => setProvenanceOpen(true)}
            data-interactive
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-white/30 text-white font-medium hover:bg-white/10 transition-colors"
          >
            Model Provenance
          </button>
        </div>
        
        <p className="text-xs text-white/70 mt-6">
          Trained on CIC-IDS-2018 and CTU-13 datasets · Open research for reproducibility
        </p>
      </section>

      {/* Provenance Drawer */}
      <ProvenanceDrawer
        isOpen={provenanceOpen}
        onClose={() => setProvenanceOpen(false)}
        provenance={provenance}
      />
    </div>
  );
}
