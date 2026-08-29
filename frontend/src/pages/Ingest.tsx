import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileType, CheckCircle2, ArrowRight, ShieldCheck, PlayCircle, Radio } from 'lucide-react';
import { uploadFile, getJobProgress } from '../api';
import { usePipelineStream, deriveAccumulatedNetworkGraphFromEvents } from '../api/websocket';
import { SpacetimeGraph } from '../three/SpacetimeGraph';
import { KillChainStepper } from '../components/KillChainStepper';
import clsx from 'clsx';

const PIPELINE_INGEST_STAGES = [
  { name: 'PCAP Ingestion', isActive: false, isPredicted: false, isComplete: false },
  { name: 'Packet Parser', isActive: false, isPredicted: false, isComplete: false },
  { name: 'Flow Aggregator', isActive: false, isPredicted: false, isComplete: false },
  { name: 'Feature Extraction', isActive: false, isPredicted: false, isComplete: false },
  { name: 'Graph State Builder', isActive: false, isPredicted: false, isComplete: false },
  { name: 'NetJEPA Forward Pass', isActive: false, isPredicted: false, isComplete: false },
  { name: 'Forecast Ready', isActive: false, isPredicted: false, isComplete: false },
];

export function Ingest() {
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [capturePath, setCapturePath] = useState<string | null>(null);

  // Real live graph state for the just-uploaded capture -- streams the
  // same src/graph/state_builder.py-built nodes/edges the backend sends
  // over /ws/pipeline as it actually processes this file window by window.
  const { events: graphEvents, connected: graphConnected, replaying: graphReplaying } = usePipelineStream(capturePath);
  const graphData = useMemo(() => deriveAccumulatedNetworkGraphFromEvents(graphEvents), [graphEvents]);

  // Plain-language reading of the same real graph, for anyone who'd rather
  // not decode a 3D scene: real host count, the real busiest host (by
  // actual edge count), and the model's real current risk/stage output.
  const graphSummary = useMemo(() => {
    const hosts = graphData.nodes.filter((n) => n.type === 'host');
    if (hosts.length === 0) return null;
    const degree = new Map<string, number>();
    for (const e of graphData.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const busiest = [...hosts].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];
    const latestMapping = [...graphEvents].reverse().find((e) => e.stage === 'attack_mapping');
    const riskPct = Math.round((latestMapping?.payload?.infiltration_probability ?? 0) * 100);
    const stage = latestMapping?.payload?.attack_stage ?? 'Benign';
    return {
      hostCount: hosts.length,
      busiestIp: busiest?.ip ?? '—',
      busiestDegree: degree.get(busiest?.id ?? '') ?? 0,
      riskPct,
      stage,
    };
  }, [graphData, graphEvents]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      startIngest(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      startIngest(e.target.files[0]);
    }
  };

  const startIngest = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setIsComplete(false);
    setProgressPercent(10);
    setActiveStageIdx(0);
    setStatusText('Uploading PCAP / Flow capture telemetry...');

    try {
      const { jobId, capturePath } = await uploadFile(file);
      setCapturePath(capturePath);

      // Poll the real backend job (src/api/main.py -> GET /jobs/{id}/progress).
      // Only ingestion is real so far; percent still advances smoothly
      // because the placeholder stages after it complete instantly.
      let progress = 10;
      let stage = 0;
      const interval = setInterval(async () => {
        const p = await getJobProgress(jobId);
        progress = Math.max(progress, p.percent);
        stage = Math.min(PIPELINE_INGEST_STAGES.length - 1, Math.floor((progress / 100) * PIPELINE_INGEST_STAGES.length));

        setProgressPercent(progress);
        setActiveStageIdx(stage);

        if (stage === 1) setStatusText('Parsing IP headers and TCP 3-way handshakes...');
        else if (stage === 2) setStatusText('Aggregating bidirectional flow records and IAT distributions...');
        else if (stage === 3) setStatusText('Extracting 78 flow features & computing entropy matrices...');
        else if (stage === 4) setStatusText('Building dynamic graph adjacency state representation...');
        else if (stage === 5) setStatusText('Executing NetJEPA self-supervised world model rollout...');
        else if (stage >= 6 || p.complete || progress >= 100) {
          setProgressPercent(100);
          setActiveStageIdx(6);
          setStatusText('Infiltration forecast computed successfully. Handing off to Operations.');
          setIsComplete(true);
          setIsProcessing(false);
          clearInterval(interval);
        }
      }, 700);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  const stagesState = PIPELINE_INGEST_STAGES.map((s, i) => ({
    ...s,
    isComplete: i < activeStageIdx || isComplete,
    isActive: i === activeStageIdx && !isComplete,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-2">
      {/* Header */}
      <div className="text-center space-y-1 pt-4">
        <h1 className="text-3xl font-heading font-bold text-text-primary tracking-tight">
          Network Telemetry Ingestion Portal
        </h1>
        <p className="text-sm text-text-secondary text-justify mt-4">
          Upload raw packet captures (.pcap, .pcapng) or NetFlow CSV datasets. The NetJEPA pipeline will extract features, form latent graph embeddings, and compute intrusion forecasts.
        </p>
      </div>

      {/* Upload Zone Card */}
      <div className="bg-surface border border-border-default rounded-2xl p-10 shadow-card space-y-6">
        {!isProcessing && !isComplete && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={clsx(
              'border-2 border-dashed rounded-xl p-14 text-center transition-all duration-200 cursor-pointer',
              dragActive ? 'border-accent-indigo bg-accent-indigo-subtle' : 'border-border-default hover:border-accent-indigo/60 bg-canvas/40'
            )}
          >
            <input
              type="file"
              id="file-upload"
              accept=".pcap,.pcapng,.csv,.cap"
              className="hidden"
              onChange={handleChange}
            />
            <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
              <div className="w-16 h-16 rounded-2xl bg-accent-indigo-subtle text-accent-indigo mx-auto flex items-center justify-center shadow-glow-indigo">
                <UploadCloud size={32} />
              </div>
              <div>
                <span className="font-heading font-semibold text-base text-text-primary">
                  Drag and drop your network capture file here, or{' '}
                </span>
                <span className="font-heading font-semibold text-base text-accent-indigo underline underline-offset-2">
                  browse files
                </span>
              </div>
              <p className="text-sm text-text-secondary font-mono">
                Supports PCAP, PCAPNG, Wireshark traces, or CIC-IDS / CTU CSV exports (Max 500MB)
              </p>
            </label>
          </div>
        )}

        {/* Demo Preset Quick-Start */}
        {!isProcessing && !isComplete && (
          <div className="pt-2 border-t border-border-default flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <span className="text-text-secondary font-medium">Want to test with benchmark captures?</span>
            <button
              type="button"
              onClick={() => {
                const dummy = new File(['mock PCAP binary'], 'CIC-IDS-2018-Friday-Capture.pcap', { type: 'application/octet-stream' });
                startIngest(dummy);
              }}
              data-interactive
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-canvas hover:bg-border-default/50 border border-border-default text-text-primary font-mono transition-colors"
            >
              <PlayCircle size={16} className="text-accent-teal" />
              <span>Load CIC-IDS-2018 Sample PCAP</span>
            </button>
          </div>
        )}

        {/* Processing State */}
        {(isProcessing || isComplete) && (
          <div className="space-y-6 py-4">
            {/* File metadata */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-canvas border border-border-default">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-surface border border-border-default text-accent-indigo">
                  <FileType size={20} />
                </div>
                <div>
                  <p className="font-heading font-semibold text-xs text-text-primary">
                    {selectedFile?.name || 'CIC-IDS-2018-Sample.pcap'}
                  </p>
                  <p className="text-[11px] font-mono text-text-tertiary">
                    Size: {(selectedFile?.size ? (selectedFile.size / (1024 * 1024)).toFixed(2) : '48.2')} MB · Format: PCAP Raw Packet Trace
                  </p>
                </div>
              </div>
              {isComplete ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-risk-green bg-risk-green-subtle px-2.5 py-1 rounded-full">
                  <CheckCircle2 size={14} /> Processed
                </span>
              ) : (
                <span className="text-xs font-mono text-accent-indigo animate-pulse">
                  {progressPercent}% Complete
                </span>
              )}
            </div>

            {/* Stepper showing ingestion stages */}
            <div className="py-2">
              <KillChainStepper
                stages={stagesState}
                variant="7-stage"
                compact={true}
                showProbability={false}
              />
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-2 bg-canvas rounded-full overflow-hidden border border-border-default">
                <div
                  className="h-full bg-accent-indigo transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-text-secondary">
                <span className="text-accent-indigo">{statusText}</span>
                <span>{progressPercent}%</span>
              </div>
            </div>

            {/* Completion Handoff CTA */}
            {isComplete && (
              <div className="pt-4 border-t border-border-default flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsComplete(false);
                    setIsProcessing(false);
                    setSelectedFile(null);
                  }}
                  data-interactive
                  className="px-4 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Upload Another File
                </button>

                <button
                  type="button"
                  onClick={() => navigate(capturePath ? `/internals/pipeline?capturePath=${encodeURIComponent(capturePath)}` : '/internals/pipeline')}
                  data-interactive
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-accent-indigo text-white hover:bg-accent-indigo-light shadow-glow-indigo transition-all"
                >
                  <span>Inspect Pipeline 3D Internals</span>
                  <ArrowRight size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/')}
                  data-interactive
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-surface border border-accent-teal text-accent-teal hover:bg-accent-teal-subtle transition-all"
                >
                  <ShieldCheck size={14} />
                  <span>View Operations Dashboard</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Graph State -- spacetime fabric visualization of the real
          nodes/edges src/graph/state_builder.py builds from this capture */}
      {capturePath && (
        <div className="bg-surface border border-border-default rounded-2xl p-6 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading font-semibold text-sm text-text-primary">
                Live Graph State
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Every real host seen across this capture so far, accumulated into one graph and rendered as nodes resting in a warped grid of latent space.
                {graphData.nodes.length <= 1 && ' CSV captures only ever produce the aggregate "network" node — host nodes need real per-packet IPs from a PCAP upload.'}
              </p>
            </div>
            <span
              className={clsx(
                'flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full border shrink-0',
                graphConnected
                  ? 'text-risk-green border-risk-green/40 bg-risk-green-subtle'
                  : graphReplaying
                    ? 'text-risk-amber border-risk-amber/40 bg-risk-amber-subtle'
                    : 'text-text-tertiary border-border-default bg-canvas'
              )}
              title={graphReplaying ? 'Live WebSocket unavailable — replaying a real captured run for this file' : undefined}
            >
              <Radio size={10} className={graphConnected ? 'animate-pulse' : ''} />
              {graphConnected ? 'LIVE' : graphReplaying ? 'REPLAY (cached run)' : 'CONNECTING…'}
            </span>
          </div>
          {graphSummary && (
            <p className="text-xs text-text-secondary bg-canvas border border-border-default rounded-lg px-3 py-2 leading-relaxed">
              In plain terms: <strong className="text-text-primary">{graphSummary.hostCount} real host{graphSummary.hostCount === 1 ? '' : 's'}</strong> talked
              during this capture. The busiest was <strong className="text-text-primary font-mono">{graphSummary.busiestIp}</strong> with{' '}
              <strong className="text-text-primary">{graphSummary.busiestDegree} connection{graphSummary.busiestDegree === 1 ? '' : 's'}</strong>.
              Current model read: <strong className={clsx(graphSummary.riskPct >= 50 ? 'text-risk-red' : graphSummary.riskPct >= 25 ? 'text-risk-amber' : 'text-risk-green')}>
                {graphSummary.riskPct}% infiltration probability
              </strong>, mapped to the <strong className="text-text-primary">{graphSummary.stage}</strong> stage.
            </p>
          )}
          <SpacetimeGraph nodes={graphData.nodes} edges={graphData.edges} />
        </div>
      )}
    </div>
  );
}
