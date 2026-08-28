import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network, Box, Layers, Radio } from 'lucide-react';
import { usePipelineStream, deriveNetworkGraphFromEvents } from '../api/websocket';
import { NetworkScene } from '../three/NetworkScene';
import { GraphNode } from '../components/GraphNode';
import { GraphEdge } from '../components/GraphEdge';
import { DataStateWrapper } from '../components/DataStateWrapper';
import { InternalsSubNav } from '../components/InternalsSubNav';
import clsx from 'clsx';

export function InternalsNetwork() {
  const [searchParams] = useSearchParams();
  const capturePath = searchParams.get('capturePath');

  // Real: the most recent stage:state_representation event's graph (see
  // src/api/websocket.ts) -- a genuine G_t = (V_t, E_t) snapshot the
  // backend built for whatever window it's currently on, not mocked.
  // "host" nodes only appear for PCAP-derived windows with real IPs (see
  // src/graph/state_builder.py's docstring) -- a CSV-derived capture will
  // show only the single aggregate "network" node until/unless a
  // PCAP-sourced window comes through.
  const { events, connected, closed, error: wsError } = usePipelineStream(capturePath);
  const graphData = useMemo(() => deriveNetworkGraphFromEvents(events), [events]);
  const loading = events.length === 0 && !closed && !wsError;
  const error = wsError;
  const [viewMode, setViewMode] = useState<'3d' | '2d' | 'table'>('3d');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Compute 2D node positions using a circle layout for deterministic 2D rendering
  const nodes2D = useMemo(() => {
    if (!graphData) return [];
    const count = graphData.nodes.length;
    const centerX = 360;
    const centerY = 240;
    const radius = 170;

    return graphData.nodes.map((node, i) => {
      const angle = (i / count) * 2 * Math.PI;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
  }, [graphData]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    return graphData.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData]);

  // Edges linked to selected node
  const linkedEdges = useMemo(() => {
    if (!selectedNodeId || !graphData) return [];
    return graphData.edges.filter(
      e => e.source === selectedNodeId || e.target === selectedNodeId
    );
  }, [selectedNodeId, graphData]);

  return (
    <div className="space-y-6">
      {/* Header with 2D / 3D Mode Toggle & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-bold text-text-primary tracking-tight">
              Model Internals — Live Latent Graph State
            </h1>
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
            Dynamic host-flow topology consumed by the NetJEPA world model, straight off the
            live event stream. CSV-derived captures show only the aggregate "network" node —
            real per-host graphs need a PCAP-derived window (see the backend README).
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-surface border border-border-default rounded-lg p-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            data-interactive
            aria-label="View as accessible table"
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'table'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Layers size={14} aria-hidden="true" />
            <span>Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('2d')}
            data-interactive
            aria-label="View as 2D graph"
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === '2d'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Network size={14} aria-hidden="true" />
            <span>2D</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('3d')}
            data-interactive
            aria-label="View as 3D spatial scene"
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === '3d'
                ? 'bg-accent-indigo text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Box size={14} aria-hidden="true" />
            <span>3D</span>
          </button>
        </div>
      </div>

      <InternalsSubNav active="network" />

      {/* Main Grid: Graph (Left) + Selected Node Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-surface border border-border-default rounded-2xl p-4 shadow-card">
          <DataStateWrapper state={loading ? 'loading' : error ? 'error' : 'live'}>
            {viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <caption className="sr-only">Network nodes with risk contributions and connections</caption>
                  <thead>
                    <tr className="border-b border-border-default">
                      <th scope="col" className="text-left p-3 font-heading font-semibold text-text-primary">Hostname</th>
                      <th scope="col" className="text-left p-3 font-heading font-semibold text-text-primary">IP Address</th>
                      <th scope="col" className="text-left p-3 font-heading font-semibold text-text-primary">Type</th>
                      <th scope="col" className="text-right p-3 font-heading font-semibold text-text-primary">Risk Contribution</th>
                      <th scope="col" className="text-right p-3 font-heading font-semibold text-text-primary">Connections</th>
                      <th scope="col" className="text-center p-3 font-heading font-semibold text-text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {graphData?.nodes.map((node) => {
                      const connections = graphData.edges.filter(
                        e => e.source === node.id || e.target === node.id
                      ).length;
                      const isSelected = selectedNodeId === node.id;
                      
                      return (
                        <tr 
                          key={node.id} 
                          className={clsx(
                            'border-b border-border-default hover:bg-canvas transition-colors',
                            isSelected && 'bg-accent-indigo-subtle'
                          )}
                        >
                          <td className="p-3 font-medium text-text-primary">{node.hostname}</td>
                          <td className="p-3 font-mono text-text-secondary">{node.ip}</td>
                          <td className="p-3">
                            <span className="inline-block px-2 py-0.5 rounded bg-canvas border border-border-default text-text-secondary font-mono text-[10px]">
                              {node.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <span className={clsx(
                              'font-mono font-bold',
                              node.riskContribution > 0.5 ? 'text-risk-red' : 
                              node.riskContribution > 0.3 ? 'text-risk-amber' : 'text-risk-green'
                            )}>
                              {(node.riskContribution * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-text-secondary">{connections}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              data-interactive
                              aria-label={`Inspect ${node.hostname}`}
                              className="px-2 py-1 text-[10px] rounded border border-border-default bg-surface hover:bg-canvas text-accent-indigo font-medium transition-colors"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {graphData?.nodes.length === 0 && (
                  <div className="text-center py-12 text-text-secondary text-sm">
                    No network nodes available
                  </div>
                )}
              </div>
            ) : viewMode === '3d' ? (
              <Suspense fallback={<div className="h-[520px] bg-canvas rounded-xl animate-pulse" />}>
                <NetworkScene
                  nodes={graphData?.nodes || []}
                  edges={graphData?.edges || []}
                  selectedNodeId={selectedNodeId || undefined}
                  onSelectNode={(id) => setSelectedNodeId(id)}
                />
              </Suspense>
            ) : (
              <div className="w-full h-[520px] bg-canvas rounded-xl overflow-hidden border border-border-default flex items-center justify-center p-4">
                <svg viewBox="0 0 720 480" className="w-full h-full" aria-label="Network graph visualization">
                  {/* Edges */}
                  {graphData?.edges.map((edge, idx) => {
                    const src = nodes2D.find(n => n.id === edge.source);
                    const tgt = nodes2D.find(n => n.id === edge.target);
                    if (!src || !tgt) return null;
                    return (
                      <GraphEdge
                        key={idx}
                        edge={edge}
                        sourceNode={src}
                        targetNode={tgt}
                        isHighlighted={selectedNodeId === edge.source || selectedNodeId === edge.target}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes2D.map(node => (
                    <GraphNode
                      key={node.id}
                      node={node}
                      isSelected={selectedNodeId === node.id}
                      onClick={(n) => setSelectedNodeId(n.id)}
                    />
                  ))}
                </svg>
              </div>
            )}
          </DataStateWrapper>
        </div>

        {/* Selected Node Details & Neighbor Context */}
        <div className="lg:col-span-4 bg-surface border border-border-default rounded-2xl p-6 shadow-card flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-border-default">
              <Network size={16} className="text-accent-indigo" />
              <h3 className="font-heading font-semibold text-sm text-text-primary">
                Graph Node Inspector
              </h3>
            </div>

            {selectedNode ? (
              <div className="space-y-4 mt-4">
                <div className="p-3.5 bg-canvas rounded-xl border border-border-default space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-sm text-text-primary">
                      {selectedNode.hostname}
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-surface border border-border-default text-text-secondary">
                      {selectedNode.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-text-secondary">
                    IP: {selectedNode.ip}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-text-secondary">Risk Contribution:</span>
                    <span className={clsx(
                      'font-mono font-bold',
                      selectedNode.riskContribution > 0.5 ? 'text-risk-red' : 'text-risk-green'
                    )}>
                      {(selectedNode.riskContribution * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Active link connections */}
                <div>
                  <h4 className="text-xs font-heading font-semibold text-text-primary mb-2">
                    Active Flow Connections ({linkedEdges.length})
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {linkedEdges.map((edge, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-canvas/60 rounded-lg border border-border-default text-xs font-mono flex items-center justify-between"
                      >
                        <div>
                          <span className="text-text-tertiary">Link #{idx + 1}</span>
                          <p className="text-text-primary text-[11px]">
                            {edge.source === selectedNode.id ? `→ ${edge.target}` : `← ${edge.source}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-text-tertiary block">{edge.protocol}</span>
                          <span className={clsx('font-bold', edge.riskScore > 60 ? 'text-risk-red' : 'text-risk-green')}>
                            Risk {edge.riskScore}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-text-secondary space-y-2">
                <Network className="w-8 h-8 text-text-tertiary mx-auto opacity-50" />
                <p>Click any node in the 2D or 3D graph to inspect its latent state embeddings and flow connections.</p>
              </div>
            )}
          </div>

          <div className="p-3 bg-canvas rounded-lg border border-border-default text-[11px] text-text-secondary">
            <strong>Explainability Note:</strong> Node sizes and glow intensity scale proportionally with forecasted risk contribution.
          </div>
        </div>
      </div>
    </div>
  );
}
