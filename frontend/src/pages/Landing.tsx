import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Shield, Zap, Eye, HardDrive, Users, CheckCircle, TrendingUp, Clock, Target } from 'lucide-react';
import { KillChainStepper } from '../components/KillChainStepper';
import { ProvenanceDrawer } from '../components/ProvenanceDrawer';
import { useProvenance } from '../api/hooks';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

// Simplified 3D visual teaser - represents network traffic flow and prediction
function HeroVisual() {
  return (
    <div className="w-full h-[300px] md:h-[400px] rounded-2xl overflow-hidden bg-gradient-to-br from-accent-indigo/10 via-accent-teal/5 to-accent-violet/10 border border-border-default">
      <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} color="#4F46E5" intensity={0.6} />
        
        {/* Network nodes - representing different network endpoints */}
        {/* Center node - represents the monitored network */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.4, 32, 32]} />
          <meshStandardMaterial
            color="#0EA5A0"
            emissive="#0EA5A0"
            emissiveIntensity={0.5}
          />
        </mesh>
        
        {/* Surrounding nodes at different distances - normal and threat nodes */}
        {[
          { pos: [-2, 1, 0], color: '#4F46E5', threat: false },
          { pos: [2, 1, 0], color: '#4F46E5', threat: false },
          { pos: [-2, -1, 0], color: '#4F46E5', threat: false },
          { pos: [2, -1, 0], color: '#DC2626', threat: true }, // Threat node in red
          { pos: [0, 2, -1], color: '#4F46E5', threat: false },
          { pos: [0, -2, -1], color: '#D97706', threat: true }, // Warning node in amber
        ].map((node, idx) => (
          <group key={idx}>
            <mesh position={node.pos as [number, number, number]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial
                color={node.color}
                emissive={node.color}
                emissiveIntensity={node.threat ? 0.8 : 0.3}
              />
            </mesh>
            {/* Connecting lines to center - representing network traffic */}
            <mesh position={[node.pos[0] / 2, node.pos[1] / 2, node.pos[2] / 2]}>
              <cylinderGeometry args={[0.02, 0.02, Math.sqrt(node.pos[0]**2 + node.pos[1]**2 + node.pos[2]**2), 8]} />
              <meshStandardMaterial 
                color={node.threat ? node.color : '#5B6472'} 
                emissive={node.threat ? node.color : '#5B6472'}
                emissiveIntensity={node.threat ? 0.4 : 0.1}
                opacity={node.threat ? 0.8 : 0.3}
                transparent
              />
            </mesh>
          </group>
        ))}
        
        {/* Forecast prediction rings - representing time horizons */}
        {[0, 1, 2].map((idx) => {
          const radius = 1.5 + idx * 0.7;
          const opacity = 0.15 - idx * 0.04;
          
          return (
            <mesh key={`ring-${idx}`} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -idx * 0.3]}>
              <torusGeometry args={[radius, 0.03, 16, 64]} />
              <meshStandardMaterial
                color="#4F46E5"
                transparent
                opacity={opacity}
                emissive="#4F46E5"
                emissiveIntensity={0.2}
              />
            </mesh>
          );
        })}
        
        {/* Pulsing threat indicator */}
        <mesh position={[2, -1, 0.3]}>
          <sphereGeometry args={[0.35, 32, 32]} />
          <meshStandardMaterial
            color="#DC2626"
            transparent
            opacity={0.2}
            emissive="#DC2626"
            emissiveIntensity={0.6}
          />
        </mesh>
        
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          autoRotate={true}
          autoRotateSpeed={1.5}
        />
      </Canvas>
    </div>
  );
}

export function Landing() {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
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
      <section className="pt-12 md:pt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text Content */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-indigo-subtle border border-accent-indigo/20">
              <Shield size={14} className="text-accent-indigo" aria-hidden="true" />
              <span className="text-xs font-medium text-accent-indigo">NetJEPA World Model Architecture</span>
            </div>
            
            <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-text-primary leading-tight">
              Forecasting network intrusions{' '}
              <span className="text-accent-indigo">before they complete</span> — not after
            </h1>
            
            <p className="text-lg text-text-secondary leading-relaxed max-w-xl">
              Kavach uses a joint-embedding predictive architecture to forecast attacker behavior across the cyber kill chain, providing security analysts with foresight instead of hindsight.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 pt-4">
              <Link
                to="/dashboard"
                data-interactive
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-indigo text-white font-medium hover:bg-accent-indigo-light transition-colors shadow-sm"
              >
                View Live Dashboard
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              
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

          {/* Right: 3D Visual Teaser */}
          <div className="order-first lg:order-last">
            <HeroVisual />
          </div>
        </div>
      </section>

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
            to="/dashboard"
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
