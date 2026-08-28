import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float } from '@react-three/drei';
import * as THREE from 'three';
import type { PipelineStage } from '../api/types';

interface PipelineTunnelProps {
  stages: PipelineStage[];
  activeStageIndex: number;
}

function TunnelScene({ stages, activeStageIndex }: { stages: PipelineStage[]; activeStageIndex: number }) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const ringSpacing = 3.2;

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const t = (clock.getElapsedTime() * 1.5) % (stages.length * ringSpacing);
      pulseRef.current.position.z = -t + 2;
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[10, 10, 10]} intensity={1.2} />
      <pointLight position={[-10, -10, -10]} color="#4F46E5" intensity={0.8} />

      {/* Pipeline Rings */}
      {stages.map((stage, idx) => {
        const z = -idx * ringSpacing;
        const isActive = idx === activeStageIndex;
        const isComplete = stage.status === 'complete';
        const ringColor = isActive ? '#4F46E5' : isComplete ? '#0EA5A0' : '#8B95A5';

        return (
          <group key={idx} position={[0, 0, z]}>
            {/* Outer Torus Ring */}
            <mesh>
              <torusGeometry args={[1.8, 0.08, 16, 64]} />
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
              <circleGeometry args={[1.72, 32]} />
              <meshBasicMaterial
                color={ringColor}
                transparent
                opacity={isActive ? 0.25 : 0.06}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Stage Label Text */}
            <Text
              position={[0, 2.3, 0]}
              fontSize={0.22}
              color={isActive ? '#4F46E5' : '#12151C'}
              anchorX="center"
              anchorY="middle"
              font="https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-g.woff"
            >
              {`0${idx + 1}. ${stage.name}`}
            </Text>

            <Text
              position={[0, -2.2, 0]}
              fontSize={0.16}
              color={stage.status === 'complete' ? '#16A34A' : stage.status === 'active' ? '#4F46E5' : '#8B95A5'}
              anchorX="center"
              anchorY="middle"
            >
              {stage.status.toUpperCase()}
            </Text>
          </group>
        );
      })}

      {/* Traveling Data Pulse Photon */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={pulseRef} position={[0, 0, 0]}>
          <sphereGeometry args={[0.24, 32, 32]} />
          <meshStandardMaterial
            color="#7C3AED"
            emissive="#7C3AED"
            emissiveIntensity={2.5}
            roughness={0.1}
          />
          <pointLight color="#7C3AED" intensity={3} distance={5} />
        </mesh>
      </Float>

      {/* Connecting Tunnel Rails */}
      <mesh position={[1.8, 0, -((stages.length - 1) * ringSpacing) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, (stages.length - 1) * ringSpacing, 8]} />
        <meshStandardMaterial color="#E4E9EF" metalness={0.5} />
      </mesh>
      <mesh position={[-1.8, 0, -((stages.length - 1) * ringSpacing) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, (stages.length - 1) * ringSpacing, 8]} />
        <meshStandardMaterial color="#E4E9EF" metalness={0.5} />
      </mesh>

      <OrbitControls
        enableZoom={true}
        enablePan={true}
        maxDistance={35}
        minDistance={3}
        maxPolarAngle={Math.PI / 2 + 0.2}
      />
    </>
  );
}

export function PipelineTunnel({ stages, activeStageIndex }: PipelineTunnelProps) {
  return (
    <div className="w-full h-[450px] bg-canvas rounded-xl overflow-hidden border border-border-default relative">
      <div className="absolute top-3 left-3 z-10 bg-surface/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-border-default text-xs font-mono text-text-secondary">
        Interactive 3D Spatial Pipeline · Orbit / Pan / Zoom
      </div>
      <Canvas
        camera={{ position: [3.5, 2.5, 6], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <TunnelScene stages={stages} activeStageIndex={activeStageIndex} />
      </Canvas>
    </div>
  );
}
