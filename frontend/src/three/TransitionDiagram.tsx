import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { TransitionStep } from '../api/websocket';

interface TransitionDiagramProps {
  steps: TransitionStep[];
}

const STEP_SPACING = 6.5;
const PATCH_SIZE = 5;
const PATCH_SEGMENTS = 22;

function riskColor(risk: number): string {
  return risk < 0.25 ? '#16A34A' : risk < 0.5 ? '#D97706' : '#DC2626';
}

/** One step's local fabric patch -- a small warped grid dipping under
 * that step's own real risk reading, independent of its neighbors. */
function StepPatch({ centerX, risk }: { centerX: number; risk: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, PATCH_SEGMENTS, PATCH_SEGMENTS);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, []);
  const basePositions = useMemo(() => Float32Array.from(geometry.attributes.position.array), [geometry]);
  const flatColor = useMemo(() => new THREE.Color('#4F46E5'), []);
  const dipColor = useMemo(() => new THREE.Color(riskColor(risk)), [risk]);
  const clock = useRef(Math.random() * 10);

  useFrame((_, delta) => {
    clock.current += delta;
    const pos = geometry.attributes.position;
    const col = geometry.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = basePositions[i * 3];
      const y = basePositions[i * 3 + 1];
      const distSq = x * x + y * y;
      let z = -(0.6 + risk * 1.6) / (1 + distSq * 0.5);
      z += Math.sin(x * 0.6 + clock.current * 0.5) * 0.025 + Math.cos(y * 0.6 + clock.current * 0.4) * 0.025;
      pos.setZ(i, z);
      const depth = Math.min(1, Math.max(0, -z / 1.8));
      const c = flatColor.clone().lerp(dipColor, depth);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <group position={[centerX, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial vertexColors wireframe transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function FlowConnector({ from, to, color }: { from: THREE.Vector3; to: THREE.Vector3; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);
  const curve = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.2, 0));
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [from, to]);
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const l = new THREE.Line(geom, new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.5, dashSize: 0.25, gapSize: 0.15 }));
    l.computeLineDistances();
    return l;
  }, [curve, color]);

  useFrame((_, delta) => {
    tRef.current = (tRef.current + delta * 0.25) % 1;
    ref.current?.position.copy(curve.getPoint(tRef.current));
  });

  return (
    <>
      <primitive object={line} />
      <mesh ref={ref}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </>
  );
}

function StepCluster({ step, centerX, opacity }: { step: TransitionStep; centerX: number; opacity: number }) {
  const color = riskColor(step.risk);
  const flagged = step.risk >= 0.5;
  const centerRadius = 0.42;

  const hostPositions = useMemo(() => {
    return step.hostIps.map((_, i) => {
      const angle = (i / Math.max(step.hostIps.length, 1)) * Math.PI * 2;
      return new THREE.Vector3(centerX + Math.cos(angle) * 1.4, 0.3, Math.sin(angle) * 1.4);
    });
  }, [step.hostIps, centerX]);

  return (
    <group>
      {/* center "state" node -- this step's aggregate reading */}
      <group position={[centerX, 0.3, 0]}>
        <mesh scale={flagged ? 2.1 : 1.5}>
          <sphereGeometry args={[centerRadius, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={flagged ? 0.32 * opacity : 0.18 * opacity} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[centerRadius, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={flagged ? 0.6 : 0.3}
            roughness={0.25}
            metalness={0.55}
            transparent
            opacity={opacity}
          />
        </mesh>
        <Html position={[0, centerRadius + 0.5, 0]} center distanceFactor={9} style={{ pointerEvents: 'none', opacity }}>
          <div
            className="whitespace-nowrap rounded-lg border bg-white/95 px-2.5 py-1 text-center shadow-md"
            style={{ borderColor: color }}
          >
            <div className="font-mono text-[10px] font-semibold text-text-primary">{step.label}</div>
            <div className="font-mono text-[10px]" style={{ color }}>{Math.round(step.risk * 100)}% risk</div>
          </div>
        </Html>
      </group>

      {/* real hosts from t0's topology, reused (see websocket.ts docstring
          on deriveTransitionFromEvents for why no new hosts appear) */}
      {step.hostIps.map((ip, i) => {
        const pos = hostPositions[i];
        return (
          <group key={ip} position={pos}>
            <mesh scale={flagged ? 1.8 : 1.3}>
              <sphereGeometry args={[0.16, 12, 12]} />
              <meshBasicMaterial color={color} transparent opacity={flagged ? 0.3 * opacity : 0.15 * opacity} depthWrite={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.16, 20, 20]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={flagged ? 0.55 : 0.25} roughness={0.3} metalness={0.5} transparent opacity={opacity} />
            </mesh>
            <primitive
              object={
                new THREE.Line(
                  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(centerX - pos.x, 0, -pos.z)]),
                  new THREE.LineBasicMaterial({ color: '#8B95A5', transparent: true, opacity: 0.2 * opacity }),
                )
              }
            />
          </group>
        );
      })}

      <StepPatch centerX={centerX} risk={step.risk} />
    </group>
  );
}

function Scene({ steps }: { steps: TransitionStep[] }) {
  const totalLength = STEP_SPACING * Math.max(steps.length - 1, 0);

  return (
    <>
      <ambientLight intensity={0.95} />
      <pointLight position={[totalLength / 2 + 6, 10, 8]} intensity={1} />
      <pointLight position={[totalLength / 2 - 6, 6, -8]} color="#0EA5A0" intensity={0.5} />

      {steps.map((step, i) => {
        const centerX = i * STEP_SPACING;
        const opacity = Math.max(0.22, 1 - i / Math.max(steps.length - 1, 1));
        return <StepCluster key={step.key} step={step} centerX={centerX} opacity={opacity} />;
      })}

      {steps.slice(1).map((step, i) => (
        <FlowConnector
          key={`flow-${step.key}`}
          from={new THREE.Vector3(i * STEP_SPACING, 0.3, 0)}
          to={new THREE.Vector3((i + 1) * STEP_SPACING, 0.3, 0)}
          color={riskColor(step.risk)}
        />
      ))}

      <OrbitControls
        enableZoom
        enablePan
        target={[totalLength / 2, 0, 0]}
        maxDistance={totalLength + 20}
        minDistance={4}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  );
}

export function TransitionDiagram({ steps }: TransitionDiagramProps) {
  const totalLength = STEP_SPACING * Math.max(steps.length - 1, 0);
  const cameraDistance = Math.max(10, totalLength * 0.85);

  return (
    <div className="w-full h-[420px] bg-canvas rounded-xl overflow-hidden border border-border-default relative">
      <div className="absolute top-3 left-3 z-10 bg-surface/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-border-default text-xs font-mono text-text-secondary">
        Current State → {steps.length - 1} Predicted Step{steps.length - 1 === 1 ? '' : 's'}
      </div>
      <div className="absolute bottom-3 left-3 z-10 bg-surface/90 backdrop-blur-xs px-3 py-2.5 rounded-lg border border-border-default text-[10px] font-mono text-text-secondary space-y-1.5 max-w-[240px]">
        <div className="font-heading font-semibold text-text-primary text-[11px]">Reading this diagram</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-risk-red shrink-0" /> Flagged — elevated/high projected risk</div>
        <div className="pt-1 border-t border-border-default text-text-tertiary leading-snug">
          Fading = further into the future, less certain. Same real hosts reused at every step — NetJEPA predicts risk, not future topology.
        </div>
      </div>

      <Canvas
        camera={{ position: [totalLength / 2, cameraDistance * 0.45, cameraDistance], fov: 48 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene steps={steps} />
      </Canvas>
    </div>
  );
}
