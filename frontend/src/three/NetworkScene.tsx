import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { NetworkNode, NetworkEdge } from '../api/types';

interface NetworkSceneProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
}

function Graph3D({ nodes, edges, selectedNodeId, onSelectNode }: NetworkSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Position nodes in a 3D spherical / cluster layout deterministically
  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    const count = nodes.length;
    nodes.forEach((node, i) => {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      const radius = 5.5 + (node.riskContribution > 0.5 ? 0.8 : 0);
      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(phi);
      map.set(node.id, new THREE.Vector3(x, y, z));
    });
    return map;
  }, [nodes]);

  // Gentle auto-rotation
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.0012;
    }
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <pointLight position={[15, 15, 15]} intensity={1.5} />
      <pointLight position={[-15, -15, -15]} color="#4F46E5" intensity={1} />

      <group ref={groupRef}>
        {/* Nodes */}
        {nodes.map(node => {
          const pos = nodePositions.get(node.id) || new THREE.Vector3(0, 0, 0);
          const isSelected = node.id === selectedNodeId;
          const isHighRisk = node.riskContribution > 0.5;
          const color = node.riskContribution < 0.25 ? '#16A34A' : node.riskContribution < 0.5 ? '#D97706' : '#DC2626';
          const radius = 0.35 + node.riskContribution * 0.35;

          return (
            <group key={node.id} position={pos}>
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode?.(node.id);
                }}
              >
                <sphereGeometry args={[radius, 32, 32]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={isSelected ? 1.2 : isHighRisk ? 0.6 : 0.15}
                  roughness={0.2}
                  metalness={0.7}
                />
              </mesh>

              {/* Selection Ring */}
              {isSelected && (
                <mesh>
                  <ringGeometry args={[radius + 0.15, radius + 0.25, 32]} />
                  <meshBasicMaterial color="#4F46E5" side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Text Label */}
              <Text
                position={[0, radius + 0.4, 0]}
                fontSize={0.25}
                color="#12151C"
                anchorX="center"
                anchorY="bottom"
              >
                {node.hostname}
              </Text>
            </group>
          );
        })}

        {/* Edges */}
        {edges.map((edge, idx) => {
          const p1 = nodePositions.get(edge.source);
          const p2 = nodePositions.get(edge.target);
          if (!p1 || !p2) return null;

          const points = [p1, p2];
          const isEdgeHighRisk = edge.riskScore > 60;
          const edgeColor = isEdgeHighRisk ? '#DC2626' : '#0EA5A0';
          const geom = new THREE.BufferGeometry().setFromPoints(points);

          return (
            <primitive
              key={idx}
              object={
                new THREE.Line(
                  geom,
                  new THREE.LineBasicMaterial({
                    color: edgeColor,
                    transparent: true,
                    opacity: isEdgeHighRisk ? 0.8 : 0.35,
                    linewidth: 1,
                  })
                )
              }
            />
          );
        })}
      </group>

      <OrbitControls enableZoom={true} enablePan={true} maxDistance={25} minDistance={4} />
    </>
  );
}

export function NetworkScene({ nodes, edges, selectedNodeId, onSelectNode }: NetworkSceneProps) {
  return (
    <div className="w-full h-[520px] bg-canvas rounded-xl overflow-hidden border border-border-default relative">
      <div className="absolute top-3 left-3 z-10 bg-surface/85 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-border-default text-xs font-mono text-text-secondary">
        3D Interactive Topology Graph · Click node to inspect details
      </div>
      <Canvas
        camera={{ position: [0, 4, 14], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Graph3D
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      </Canvas>
    </div>
  );
}
