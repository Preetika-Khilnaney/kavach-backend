import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Network, Cpu, Activity, ShieldAlert, FileText, CheckCircle2, CornerDownRight } from 'lucide-react';
import type { AuditTrail, AuditStep, AuditStageName } from '../api/types';
import { FeatureHeatmapCell } from './FeatureHeatmapCell';
import clsx from 'clsx';

interface DecisionAuditTrailProps {
  trail: AuditTrail;
  className?: string;
}

const STAGE_ICONS: Record<AuditStageName, React.ComponentType<{ className?: string }>> = {
  'Raw Flow': FileText,
  'Feature Extraction': Cpu,
  'Graph State': Network,
  'Forecast': Activity,
  'Attack Stage Mapping': ShieldAlert,
  'Alert': CheckCircle2,
};

export function DecisionAuditTrail({ trail, className }: DecisionAuditTrailProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(0); // First step expanded by default

  const toggleStep = (index: number) => {
    setExpandedStep(prev => (prev === index ? null : index));
  };

  return (
    <div className={clsx('bg-surface border border-border-default rounded-xl p-5 shadow-card', className)}>
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-default">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-indigo animate-pulse" />
            <h3 className="font-heading font-semibold text-sm text-text-primary">
              Decision Audit Trail
            </h3>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Full end-to-end trace from raw packet ingestion to generated alert
          </p>
        </div>
        <span className="font-mono text-xs px-2.5 py-1 bg-canvas rounded border border-border-default text-text-secondary">
          Flow ID: {trail.flowId.slice(0, 8)}
        </span>
      </div>

      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-border-default">
        {trail.steps.map((step, idx) => {
          const Icon = STAGE_ICONS[step.stageName] || Activity;
          const isExpanded = expandedStep === idx;

          return (
            <div key={idx} className="relative group">
              {/* Timeline Indicator */}
              <div
                className={clsx(
                  'absolute -left-6 top-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200',
                  isExpanded
                    ? 'bg-accent-indigo border-accent-indigo text-white shadow-glow-indigo'
                    : 'bg-surface border-border-default text-text-tertiary group-hover:border-accent-indigo group-hover:text-accent-indigo'
                )}
              >
                <Icon className="w-3 h-3" />
              </div>

              {/* Step Header */}
              <div
                onClick={() => toggleStep(idx)}
                data-interactive
                className="cursor-pointer bg-canvas/60 hover:bg-canvas rounded-lg p-3 border border-border-default/80 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-xs font-semibold text-text-primary">
                      Step {step.stepIndex + 1}: {step.stageName}
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                    aria-label="Toggle details"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed font-body">
                  {step.summary}
                </p>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-border-default">
                        {renderStepDetail(step)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderStepDetail(step: AuditStep) {
  switch (step.stageName) {
    case 'Raw Flow':
      return (
        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-surface p-2.5 rounded border border-border-default">
          <div><span className="text-text-tertiary">Source:</span> {String(step.detail.srcIP)}:{String(step.detail.srcPort)}</div>
          <div><span className="text-text-tertiary">Destination:</span> {String(step.detail.dstIP)}:{String(step.detail.dstPort)}</div>
          <div><span className="text-text-tertiary">Protocol:</span> {String(step.detail.protocol)}</div>
          <div><span className="text-text-tertiary">Flags:</span> {String(step.detail.flags)}</div>
          <div><span className="text-text-tertiary">Bytes:</span> {Number(step.detail.bytes).toLocaleString()}</div>
          <div><span className="text-text-tertiary">Duration:</span> {String(step.detail.duration)}s</div>
        </div>
      );

    case 'Feature Extraction': {
      const topFeatures = (step.detail.topFeatures as Array<{ name: string; value: number; contribution: number }>) || [];
      return (
        <div className="space-y-2">
          <p className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">Top Computed Features</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {topFeatures.map((f, i) => (
              <FeatureHeatmapCell key={i} name={f.name} value={f.value} contribution={f.contribution} />
            ))}
          </div>
        </div>
      );
    }

    case 'Graph State':
      return (
        <div className="bg-surface p-2.5 rounded border border-border-default text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-text-secondary">Source Degree (active links):</span>
            <span className="font-mono font-semibold">{String(step.detail.srcNodeDegree)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Destination Degree:</span>
            <span className="font-mono font-semibold">{String(step.detail.dstNodeDegree)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Cluster Coefficient:</span>
            <span className="font-mono font-semibold">{String(step.detail.clusterCoefficient)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">External Destination:</span>
            <span className="font-mono font-semibold text-accent-indigo">{step.detail.isExternalDst ? 'Yes' : 'No'}</span>
          </div>
        </div>
      );

    case 'Forecast':
      return (
        <div className="bg-surface p-3 rounded border border-border-default text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Trajectory Horizon:</span>
            <span className="font-mono font-semibold">K={String(step.detail.kSteps)} steps</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Risk Projection:</span>
            <div className="flex items-center gap-1 font-mono">
              <span className="text-text-primary">{String(step.detail.currentRisk)}</span>
              <CornerDownRight className="w-3 h-3 text-risk-red inline" />
              <span className="text-risk-red font-bold">{String(step.detail.projectedRisk)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Branch Confidence:</span>
            <span className="font-mono font-semibold text-accent-indigo">
              {(Number(step.detail.pathProbability) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      );

    case 'Attack Stage Mapping':
      return (
        <div className="bg-surface p-2.5 rounded border border-border-default text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">MITRE ATT&CK Tactic:</span>
            <span className="font-heading font-semibold text-risk-red">{String(step.detail.mappedStage)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Mapping Confidence:</span>
            <span className="font-mono font-semibold">{(Number(step.detail.confidence) * 100).toFixed(0)}%</span>
          </div>
        </div>
      );

    case 'Alert':
      return (
        <div className="bg-surface p-2.5 rounded border border-border-default text-xs space-y-1">
          <div className="text-text-secondary font-medium">Alert Dispatched:</div>
          <div className="font-mono text-text-primary font-semibold">{String(step.detail.title || 'Security Anomaly Alert')}</div>
        </div>
      );

    default:
      return (
        <pre className="text-[10px] font-mono bg-surface p-2 rounded border border-border-default overflow-x-auto text-text-secondary">
          {JSON.stringify(step.detail, null, 2)}
        </pre>
      );
  }
}
