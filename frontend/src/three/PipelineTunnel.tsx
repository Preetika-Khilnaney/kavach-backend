import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PipelineStage } from '../api/types';

interface PipelineTunnelProps {
  stages: PipelineStage[];
  activeStageIndex: number;
}

interface TunnelSceneProps {
  stages: PipelineStage[];
  activeStageIndex: number;
  focusedStageIndex: number | null;
}

function TunnelScene({ stages, activeStageIndex, focusedStageIndex }: TunnelSceneProps) {
  const packetRefs = useRef<(THREE.Mesh | null)[]>([]);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const cameraGoal = useRef(new THREE.Vector3(0, 0.4, 7));
  const targetGoal = useRef(new THREE.Vector3(0, 0, -9));
  const isCameraAnimating = useRef(true);
  const stageCount = Math.max(stages.length, 7);
  const ringSpacing = 3;
  const tunnelLength = (stageCount - 1) * ringSpacing;
  const packetCount = 18;

  const packets = Array.from({ length: packetCount }, (_, index) => ({
    offset: (index / packetCount) * tunnelLength,
    x: ((index * 17) % 9 - 4) * 0.16,
    y: ((index * 23) % 7 - 3) * 0.15,
    suspicious: index % 6 === 0,
  }));

  useEffect(() => {
    const focusZ = focusedStageIndex === null ? 0 : -focusedStageIndex * ringSpacing;
    cameraGoal.current.set(
      focusedStageIndex === null ? 0 : 0.65,
      focusedStageIndex === null ? 0.4 : 0.35,
      focusedStageIndex === null ? 7 : focusZ + 3.25,
    );
    targetGoal.current.set(0, 0, focusedStageIndex === null ? -tunnelLength / 2 : focusZ);
    isCameraAnimating.current = true;
  }, [focusedStageIndex, tunnelLength]);

  useFrame(({ camera, clock }) => {
    const elapsed = clock.getElapsedTime();
    if (isCameraAnimating.current && controlsRef.current) {
      camera.position.lerp(cameraGoal.current, 0.075);
      controlsRef.current.target.lerp(targetGoal.current, 0.075);
      controlsRef.current.update();

      if (
        camera.position.distanceToSquared(cameraGoal.current) < 0.0025
        && controlsRef.current.target.distanceToSquared(targetGoal.current) < 0.0025
      ) {
        camera.position.copy(cameraGoal.current);
        controlsRef.current.target.copy(targetGoal.current);
        controlsRef.current.update();
        isCameraAnimating.current = false;
      }
    }
    packetRefs.current.forEach((packet, index) => {
      if (!packet) return;
      const packetData = packets[index];
      const distance = (packetData.offset + elapsed * (1.3 + (index % 4) * 0.12)) % (tunnelLength + 3);
      packet.position.set(
        packetData.x + Math.sin(elapsed * 1.4 + index) * 0.08,
        packetData.y + Math.cos(elapsed * 1.1 + index) * 0.08,
        1.5 - distance,
      );
      packet.scale.setScalar(packetData.suspicious ? 1.25 + Math.sin(elapsed * 5 + index) * 0.15 : 1);
    });
  });

  return (
    <>
      <color attach="background" args={['#f7f9fc']} />
      <fog attach="fog" args={['#f7f9fc', 8, 25]} />
      <ambientLight intensity={1.1} />
      <pointLight position={[4, 5, 4]} intensity={1.5} />
      <pointLight position={[-4, -2, 2]} color="#4F46E5" intensity={1.1} />

      {/* Receding floor and ceiling grid establish depth even before data arrives. */}
      <gridHelper args={[9, 18, '#cbd5e1', '#e8edf3']} position={[0, -1.9, -tunnelLength / 2]} rotation={[0, 0, 0]} />
      <gridHelper args={[9, 18, '#cbd5e1', '#e8edf3']} position={[0, 1.9, -tunnelLength / 2]} rotation={[0, 0, 0]} />

      {[[-2.15, 0], [2.15, 0]].map(([x], index) => (
        <mesh key={`rail-${index}`} position={[x, 0, -tunnelLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, tunnelLength + 3, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.35} />
        </mesh>
      ))}

      {/* Pipeline Rings */}
      {Array.from({ length: stageCount }, (_, idx) => {
        const stage = stages[idx] || {
          name: 'Awaiting telemetry',
          status: 'idle' as const,
          description: 'Waiting for pipeline stage telemetry.',
        };
        const z = -idx * ringSpacing;
        const isActive = idx === activeStageIndex;
        const isComplete = stage.status === 'complete';
        const ringColor = isActive ? '#4F46E5' : isComplete ? '#0EA5A0' : '#8B95A5';

        return (
          <group key={idx} position={[0, 0, z]}>
            {/* Outer Torus Ring */}
            <mesh>
              <torusGeometry args={[1.65, 0.075, 16, 64]} />
              <meshStandardMaterial
                color={ringColor}
                emissive={ringColor}
                emissiveIntensity={isActive ? 0.8 : isComplete ? 0.3 : 0.05}
                roughness={0.2}
                metalness={0.8}
              />
            </mesh>

            {/* Inner Translucent Portal Disc */}
            <mesh>
              <circleGeometry args={[1.58, 32]} />
              <meshBasicMaterial
                color={ringColor}
                transparent
                opacity={isActive ? 0.25 : 0.06}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Stage Label Text */}
            <Html position={[idx % 2 === 0 ? -1.7 : 1.7, 1.72, 0]} center distanceFactor={8}>
              <div className={`whitespace-nowrap font-mono text-[11px] font-semibold ${isActive ? 'text-accent-indigo' : 'text-text-primary'}`}>
                {`0${idx + 1}. ${stage.name}`}
              </div>
            </Html>

            <Html position={[0, -2.02, 0]} center distanceFactor={7}>
              <div className={`whitespace-nowrap font-mono text-[9px] ${stage.status === 'complete' ? 'text-risk-green' : stage.status === 'active' ? 'text-accent-indigo' : 'text-text-tertiary'}`}>
                {stage.status.toUpperCase()}
              </div>
            </Html>
          </group>
        );
      })}

      {/* Synthetic packet stream: red packets represent suspicious traffic. */}
      {packets.map((packet, index) => (
        <mesh key={`packet-${index}`} ref={(mesh) => { packetRefs.current[index] = mesh; }} position={[packet.x, packet.y, 1.5 - packet.offset]}>
          <sphereGeometry args={[packet.suspicious ? 0.11 : 0.07, 16, 16]} />
          <meshStandardMaterial
            color={packet.suspicious ? '#dc2626' : '#0ea5a0'}
            emissive={packet.suspicious ? '#dc2626' : '#0ea5a0'}
            emissiveIntensity={packet.suspicious ? 2.5 : 1.7}
            roughness={0.1}
          />
        </mesh>
      ))}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableZoom
        enablePan
        minDistance={1.2}
        maxDistance={42}
        minAzimuthAngle={-Infinity}
        maxAzimuthAngle={Infinity}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
        zoomSpeed={1.1}
        rotateSpeed={0.8}
        panSpeed={1.2}
        enableDamping
        dampingFactor={0.08}
        screenSpacePanning
        target={[0, 0, -tunnelLength / 2]}
      />
    </>
  );
}

export function PipelineTunnel({ stages, activeStageIndex }: PipelineTunnelProps) {
  const [focusedStageIndex, setFocusedStageIndex] = useState<number | null>(null);
  const stageCount = Math.max(stages.length, 7);

  return (
    <div className="w-full h-[450px] bg-canvas rounded-xl overflow-hidden border border-border-default relative">
      <div className="absolute top-3 left-3 z-10 bg-surface/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-border-default text-xs font-mono text-text-secondary">
        Interactive 3D Spatial Pipeline · Orbit / Pan / Zoom
      </div>
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-3 bg-surface/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-border-default text-[10px] font-mono text-text-secondary">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-teal" /> normal flow</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-600" /> suspicious</span>
      </div>
      <div className="absolute top-3 right-3 z-10 flex max-w-[calc(100%-250px)] items-center gap-1 overflow-x-auto bg-surface/80 backdrop-blur-xs px-2 py-1.5 rounded-lg border border-border-default">
        {Array.from({ length: stageCount }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setFocusedStageIndex(index)}
            data-interactive
            className={`shrink-0 rounded px-2 py-1 font-mono text-[10px] transition-colors ${focusedStageIndex === index ? 'bg-accent-indigo text-white' : 'text-text-secondary hover:bg-canvas hover:text-text-primary'}`}
          >
            Stage {index + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFocusedStageIndex(null)}
          data-interactive
          className="shrink-0 rounded border-l border-border-default pl-2 font-mono text-[10px] text-text-secondary hover:text-text-primary"
        >
          Reset View
        </button>
      </div>
      <Canvas
        camera={{ position: [0, 0.4, 7], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <TunnelScene
          stages={stages}
          activeStageIndex={activeStageIndex}
          focusedStageIndex={focusedStageIndex}
        />
      </Canvas>
    </div>
  );
}
