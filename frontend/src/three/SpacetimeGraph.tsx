import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { NetworkNode, NetworkEdge } from '../api/types';

interface SpacetimeGraphProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5deg -- phyllotaxis spiral

/** Deterministic phyllotaxis-spiral layout: the "network" node (this
 * capture's aggregate) sits at the center as the gravity source; every
 * real host spirals outward around it, spaced by the golden angle so
 * nodes never stack in neat, boring rings. Also returns how big the
 * fabric grid needs to be so it actually reaches every node, instead of
 * a fixed size that leaves outer nodes floating with no mesh under them
 * once there are enough hosts to spiral past it. */
function computeLayout(nodes: NetworkNode[]) {
  const positions = new Map<string, THREE.Vector3>();
  const hosts = nodes.filter((n) => n.type !== 'gateway');
  const center = nodes.find((n) => n.type === 'gateway');
  if (center) positions.set(center.id, new THREE.Vector3(0, 0.35, 0));

  let maxRadius = 0;
  hosts.forEach((node, i) => {
    const angle = i * GOLDEN_ANGLE;
    const radius = 1.7 * Math.sqrt(i + 1) + 1.6;
    maxRadius = Math.max(maxRadius, radius);
    positions.set(node.id, new THREE.Vector3(Math.cos(angle) * radius, 0.35, Math.sin(angle) * radius));
  });

  // Plane spans ±gridSize/2, so it must be at least 2x(maxRadius+padding)
  // to actually reach the outermost spiraled-out host, not just the first
  // few rings.
  const gridSize = Math.max(20, Math.ceil(maxRadius + 3) * 2);
  // Segment density tapers off as the grid grows -- covering every node
  // matters more than keeping the mesh equally fine-grained at 65-host
  // scale, and the per-frame dip recompute is O(segments^2 * nodeCount).
  const gridSegments = Math.min(90, Math.max(48, Math.round(gridSize * 1.6)));
  return { positions, gridSize, gridSegments };
}

/** A warped grid plane -- "spacetime fabric" -- sized to actually extend
 * under every node, that dips under each real graph node's position
 * (heavier/riskier nodes pull deeper), colored by dip depth (flat =
 * indigo, deep well = warm risk glow), plus a slow ambient ripple so it
 * reads as alive rather than static. Static camera framing otherwise --
 * nothing here auto-orbits. */
function FabricPlane({
  wellPositions,
  gridSize,
  gridSegments,
}: {
  wellPositions: { pos: THREE.Vector3; strength: number }[];
  gridSize: number;
  gridSegments: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(gridSize, gridSize, gridSegments, gridSegments);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, [gridSize, gridSegments]);
  const basePositions = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);
  const flatColor = useMemo(() => new THREE.Color('#4F46E5'), []);
  const dipColor = useMemo(() => new THREE.Color('#DC2626'), []);
  const clock = useRef(0);

  useFrame((_, delta) => {
    clock.current += delta;
    const pos = geometry.attributes.position;
    const col = geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = basePositions[i * 3];
      const y = basePositions[i * 3 + 1];
      let z = 0;
      for (const well of wellPositions) {
        const dx = x - well.pos.x;
        const dz = y - well.pos.z;
        const distSq = dx * dx + dz * dz;
        z -= (0.9 + well.strength * 1.4) / (1 + distSq * 0.4);
      }
      z += Math.sin(x * 0.45 + clock.current * 0.5) * 0.04 + Math.cos(y * 0.45 + clock.current * 0.4) * 0.04;
      pos.setZ(i, z);

      const depth = Math.min(1, Math.max(0, -z / 2.4));
      const c = flatColor.clone().lerp(dipColor, depth);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial vertexColors wireframe transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/** A small glowing particle that loops along an edge's curve -- reads as
 * live traffic flowing between two real hosts. */
function EdgeFlow({ curve, color, speed }: { curve: THREE.QuadraticBezierCurve3; color: string; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const tRef = useRef(Math.random());
  useFrame((_, delta) => {
    tRef.current = (tRef.current + delta * speed) % 1;
    const p = curve.getPoint(tRef.current);
    ref.current?.position.copy(p);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

interface GraphContentsProps extends SpacetimeGraphProps {
  nodePositions: Map<string, THREE.Vector3>;
  gridSize: number;
  gridSegments: number;
}

function GraphContents({ nodes, edges, nodePositions, gridSize, gridSegments }: GraphContentsProps) {
  // Real, not fabricated: how many edges actually touch each node --
  // drives node size so hub hosts visibly stand out from quiet ones.
  const degreeById = useMemo(() => {
    const d = new Map<string, number>();
    for (const n of nodes) d.set(n.id, 0);
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [nodes, edges]);

  const wellPositions = useMemo(
    () =>
      nodes.map((n) => ({
        pos: nodePositions.get(n.id) ?? new THREE.Vector3(0, 0, 0),
        strength: n.type === 'gateway' ? 1 : n.riskContribution,
      })),
    [nodes, nodePositions],
  );

  return (
    <>
      <ambientLight intensity={0.95} />
      <pointLight position={[10, 12, 10]} intensity={1} />
      <pointLight position={[-10, 6, -10]} color="#0EA5A0" intensity={0.6} />
      <pointLight position={[0, 6, 0]} color="#818CF8" intensity={0.4} />

      <FabricPlane wellPositions={wellPositions} gridSize={gridSize} gridSegments={gridSegments} />

      <group>
        {nodes.map((node) => {
          const pos = nodePositions.get(node.id) ?? new THREE.Vector3(0, 0.35, 0);
          const isNetwork = node.type === 'gateway';
          const degree = degreeById.get(node.id) ?? 0;
          const riskColor =
            node.riskContribution < 0.25 ? '#16A34A' : node.riskContribution < 0.5 ? '#D97706' : '#DC2626';
          const color = isNetwork ? '#4F46E5' : riskColor;
          const radius = isNetwork ? 0.5 : 0.22 + Math.min(degree, 8) * 0.05;

          const tether = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -pos.y, 0),
          ]);

          return (
            <group key={node.id} position={pos}>
              {/* soft halo -- normal (not additive) blending so it reads
                  against a light background instead of washing out white */}
              <mesh scale={1.7}>
                <sphereGeometry args={[radius, 16, 16]} />
                <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
              </mesh>
              <mesh>
                <sphereGeometry args={[radius, 32, 32]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={isNetwork ? 0.5 : 0.3}
                  roughness={0.25}
                  metalness={0.55}
                />
              </mesh>
              <primitive
                object={
                  new THREE.Line(
                    tether,
                    new THREE.LineBasicMaterial({ color: '#8B95A5', transparent: true, opacity: 0.3 }),
                  )
                }
              />
              <Html position={[0, radius + 0.34, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
                <div
                  className="whitespace-nowrap rounded-full border bg-white/95 px-2 py-0.5 font-mono text-[10px] text-text-primary shadow-md"
                  style={{ borderColor: color }}
                >
                  {isNetwork ? 'Aggregate' : node.hostname}
                  {!isNetwork && <span className="text-text-tertiary"> · {degree} conn</span>}
                </div>
              </Html>
            </group>
          );
        })}

        {edges.map((edge, idx) => {
          const p1 = nodePositions.get(edge.source);
          const p2 = nodePositions.get(edge.target);
          if (!p1 || !p2) return null;
          const mid = p1
            .clone()
            .add(p2)
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(0, 0.7 + Math.min(edge.flowCount, 6) * 0.06, 0));
          const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
          const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
          const isHighRisk = edge.riskScore > 60;
          const color = isHighRisk ? '#DC2626' : '#0EA5A0';

          return (
            <group key={idx}>
              <primitive
                object={
                  new THREE.Line(
                    geom,
                    new THREE.LineBasicMaterial({ color, transparent: true, opacity: isHighRisk ? 0.75 : 0.4 }),
                  )
                }
              />
              {idx < 24 && <EdgeFlow curve={curve} color={color} speed={0.15 + (idx % 5) * 0.05} />}
            </group>
          );
        })}
      </group>

      <OrbitControls enableZoom enablePan={false} maxDistance={gridSize * 1.8} minDistance={5} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}

export function SpacetimeGraph({ nodes, edges }: SpacetimeGraphProps) {
  const { positions, gridSize, gridSegments } = useMemo(() => computeLayout(nodes), [nodes]);
  // Pull the camera back as the grid grows so a 65-node capture doesn't
  // start zoomed into the first few spiral rings.
  const cameraDistance = gridSize * 0.75;

  return (
    <div className="w-full h-[460px] bg-canvas rounded-xl overflow-hidden border border-border-default relative">
      <div className="absolute top-3 left-3 z-10 bg-surface/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-border-default text-xs font-mono text-text-secondary">
        Live Graph State — {nodes.length} node{nodes.length === 1 ? '' : 's'}, {edges.length} edge{edges.length === 1 ? '' : 's'}
      </div>

      <div className="absolute bottom-3 left-3 z-10 bg-surface/90 backdrop-blur-xs px-3 py-2.5 rounded-lg border border-border-default text-[10px] font-mono text-text-secondary space-y-1.5 max-w-[230px]">
        <div className="font-heading font-semibold text-text-primary text-[11px]">Reading this graph</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent-indigo shrink-0" /> Aggregate (this capture)</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-risk-green shrink-0" /> Low measured risk</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-risk-amber shrink-0" /> Elevated risk</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-risk-red shrink-0" /> High risk</div>
        <div className="pt-1 border-t border-border-default text-text-tertiary leading-snug">
          Dot size = real connections made. Grid dips = risk pulling on latent space, joined per-window (not one score for everyone).
        </div>
      </div>

      <Canvas camera={{ position: [0, cameraDistance * 0.55, cameraDistance], fov: 45 }} style={{ width: '100%', height: '100%' }}>
        <GraphContents nodes={nodes} edges={edges} nodePositions={positions} gridSize={gridSize} gridSegments={gridSegments} />
      </Canvas>
    </div>
  );
}
