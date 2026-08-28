import React from 'react';
import type { NetworkNode } from '../api/types';

interface GraphNodeProps {
  node: NetworkNode;
  isSelected?: boolean;
  onClick?: (node: NetworkNode) => void;
}

function getNodeColor(risk: number): string {
  if (risk < 0.25) return '#16A34A';
  if (risk < 0.50) return '#D97706';
  return '#DC2626';
}

function getRiskCategory(risk: number): 'low' | 'medium' | 'high' {
  if (risk < 0.25) return 'low';
  if (risk < 0.50) return 'medium';
  return 'high';
}

export const GraphNode: React.FC<GraphNodeProps> = ({ node, isSelected, onClick }) => {
  const radius = Math.max(12, Math.min(26, 12 + node.riskContribution * 14));
  const color = getNodeColor(node.riskContribution);
  const riskCategory = getRiskCategory(node.riskContribution);

  return (
    <g
      transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
      onClick={() => onClick?.(node)}
      data-interactive
      data-risk={riskCategory}
      className="cursor-pointer group"
    >
      {/* Outer halo if selected or high risk */}
      {(isSelected || node.riskContribution > 0.5) && (
        <circle
          r={radius + 5}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={isSelected ? 'none' : '3 3'}
          className={node.riskContribution > 0.5 ? 'animate-pulse' : ''}
          opacity={0.6}
        />
      )}

      {/* Main circle */}
      <circle
        r={radius}
        fill={color}
        stroke="#FFFFFF"
        strokeWidth={2}
        className="transition-transform duration-200 group-hover:scale-110"
      />

      {/* Label */}
      <text
        y={radius + 12}
        textAnchor="middle"
        fontSize={10}
        fontFamily="JetBrains Mono"
        fill="#12151C"
        className="font-medium pointer-events-none"
      >
        {node.hostname}
      </text>

      <text
        y={radius + 22}
        textAnchor="middle"
        fontSize={8}
        fontFamily="JetBrains Mono"
        fill="#5B6472"
        className="pointer-events-none"
      >
        {node.ip}
      </text>
    </g>
  );
};
