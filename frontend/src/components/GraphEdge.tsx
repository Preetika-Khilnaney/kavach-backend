import React from 'react';
import type { NetworkEdge, NetworkNode } from '../api/types';

interface GraphEdgeProps {
  edge: NetworkEdge;
  sourceNode: NetworkNode;
  targetNode: NetworkNode;
  isHighlighted?: boolean;
}

export const GraphEdge: React.FC<GraphEdgeProps> = ({
  edge,
  sourceNode,
  targetNode,
  isHighlighted,
}) => {
  const sx = sourceNode.x ?? 0;
  const sy = sourceNode.y ?? 0;
  const tx = targetNode.x ?? 0;
  const ty = targetNode.y ?? 0;

  const strokeWidth = Math.max(1, Math.min(4, 1 + edge.flowCount / 15));
  const strokeColor = edge.riskScore > 60 ? '#DC2626' : isHighlighted ? '#4F46E5' : '#E4E9EF';

  return (
    <g>
      <line
        x1={sx}
        y1={sy}
        x2={tx}
        y2={ty}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={isHighlighted ? 0.9 : 0.6}
        className="transition-colors duration-200"
      />
    </g>
  );
};
