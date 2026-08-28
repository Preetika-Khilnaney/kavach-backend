import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal, Box, Layers, Radio } from 'lucide-react';
import { usePipelineStream, deriveStagesFromEvents } from '../api/websocket';
import { KillChainStepper } from '../components/KillChainStepper';
import { MonoLogLine } from '../components/MonoLogLine';
import { PipelineTunnel } from '../three/PipelineTunnel';
import { DataStateWrapper } from '../components/DataStateWrapper';
import { InternalsSubNav } from '../components/InternalsSubNav';
import clsx from 'clsx';

export function InternalsPipeline() {
  const [searchParams] = useSearchParams();
  const flowId = searchParams.get('flowId');
  const capturePath = searchParams.get('capturePath');

  // Real: streams stage:* events off the backend WebSocket as it actually
  // processes `capturePath` (or the placeholder demo stream if none was
  // passed) -- see src/api/websocket.ts. Not mocked.
  const { events, connected, closed, error: wsError } = usePipelineStream(capturePath);
  const stages = useMemo(() => deriveStagesFromEvents(events), [events]);
  const loading = events.length === 0 && !closed && !wsError;
  const error = wsError;
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');
  const [selectedStageIdx, setSelectedStageIdx] = useState<number>(4); // K-step forecast active stage by default

  const stepperStages = (stages || []).map((s, idx) => ({
    name: s.name,
    isActive: idx === selectedStageIdx,
    isComplete: s.status === 'complete',
    isPredicted: false,
    description: s.description,
    status: s.status,
  }));

  const activeStage = stages?.[selectedStageIdx] || stages?.[4];

  return (
    <div className="space-y-6">
      {/* Header with 2D / 3D Mode Toggle & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-bold text-text-primary tracking-tight">
              Model Internals — Pipeline Architecture
            </h1>
            {flowId && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-accent-indigo-subtle text-accent-indigo font-medium">
                Inspecting Flow: {flowId.slice(0, 8)}
              </span>
            )}
            <span
              className={clsx(
                'flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full border',
                connected ? 'text-risk-green border-risk-green/40 bg-risk-green-subtle' : 'text-text-tertiary border-border-default bg-canvas'
              )}
            >
              <Radio size={10} className={connected ? 'animate-pulse' : ''} />
              {connected ? 'LIVE STREAM' : closed ? 'STREAM CLOSED' : 'CONNECTING…'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {capturePath
              ? <>Live event stream for <code className="font-mono">{capturePath.split('/').pop()}</code> — every stage below is the backend genuinely processing this capture, not an animation.</>
              : '7-stage self-supervised pipeline — placeholder demo stream (no capture selected; upload a file on the Ingestion page and click "Inspect Pipeline 3D Internals" to watch it for real).'}
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-surface border border-border-default rounded-lg p-1">
          <button
            type="button"
            onClick={() => setViewMode('2d')}
            data-interactive
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === '2d'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Layers size={14} />
            <span>2D Stepper</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('3d')}
            data-interactive
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === '3d'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Box size={14} />
            <span>3D Spatial Tunnel</span>
          </button>
        </div>
      </div>

      <InternalsSubNav active="pipeline" />

      {/* Main View: 2D Stepper or 3D Tunnel */}
      <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'}>
        <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-6">
          {viewMode === '3d' ? (
            <Suspense fallback={<div className="h-[450px] bg-canvas rounded-xl animate-pulse" />}>
              <PipelineTunnel
                stages={stages || []}
                activeStageIndex={selectedStageIdx}
              />
            </Suspense>
          ) : (
            <div className="py-6 px-2">
              <KillChainStepper
                stages={stepperStages}
                variant="7-stage"
                orientation="horizontal"
                showProbability={false}
                onStageClick={(idx) => setSelectedStageIdx(idx)}
              />
            </div>
          )}

          {/* Active Stage Deep-Dive Card */}
          {activeStage && (
            <div className="bg-canvas border border-border-default rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-accent-indigo uppercase px-2 py-0.5 rounded bg-surface border border-border-default">
                    Stage 0{selectedStageIdx + 1}
                  </span>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    {activeStage.name}
                  </h3>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed max-w-2xl font-body">
                  {activeStage.description}
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  disabled={selectedStageIdx === 0}
                  onClick={() => setSelectedStageIdx(prev => Math.max(0, prev - 1))}
                  data-interactive
                  className="px-2.5 py-1 text-xs rounded border border-border-default bg-surface hover:bg-canvas disabled:opacity-40"
                >
                  Prev Stage
                </button>
                <button
                  type="button"
                  disabled={selectedStageIdx >= (stages?.length || 7) - 1}
                  onClick={() => setSelectedStageIdx(prev => Math.min((stages?.length || 7) - 1, prev + 1))}
                  data-interactive
                  className="px-2.5 py-1 text-xs rounded border border-border-default bg-surface hover:bg-canvas disabled:opacity-40"
                >
                  Next Stage
                </button>
              </div>
            </div>
          )}
        </div>
      </DataStateWrapper>

      {/* Bottom Process Narration Log (Explainability Principle: No Black Box) */}
      <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border-default">
          <Terminal size={16} className="text-accent-teal" aria-hidden="true" />
          <h3 className="font-heading font-semibold text-sm text-text-primary">
            Plain-Language Process Narration Log
          </h3>
        </div>

        <div 
          className="space-y-2.5 font-mono text-xs max-h-60 overflow-y-auto pr-1"
          role="log"
          aria-live="polite"
          aria-label="Pipeline process narration"
        >
          {stages?.map((stage, idx) => (
            <MonoLogLine
              key={idx}
              timestamp={stage.startedAt || new Date().toISOString()}
              severity={stage.status === 'error' ? 'critical' : stage.status === 'active' ? 'warning' : 'info'}
              message={`[0${idx + 1} ${stage.name}]: ${stage.description}`}
              onClick={() => setSelectedStageIdx(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
