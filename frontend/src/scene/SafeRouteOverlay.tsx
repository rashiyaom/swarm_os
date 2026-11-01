import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SimulationEngine } from '../simulation/core/SimulationEngine';
import { useSim } from '../store/simStore';
import { buildDossier } from '../dossier/buildDossier';
import { cellToWorld, glowTexture } from './common';

/**
 * Lightweight 3D Glowing Safe Route Overlay.
 *
 * Renders the recommended safe ingress/extraction path for human rescue teams
 * computed strictly from the swarm's merged belief maps.
 *
 * Features:
 * - Glowing rescue emerald path lines elevated slightly (y = 0.08) above terrain.
 * - Pulse-illuminated entry point beacon.
 * - Minimal vertex footprint for smooth 60 FPS performance.
 */
export function SafeRouteOverlay({ engine }: { engine: SimulationEngine }) {
  const version = useSim((s) => s.version);
  const pulseRef = useRef<THREE.Mesh>(null);

  // Compute dossier and routes on state tick / version change
  const dossier = useMemo(() => buildDossier(engine), [engine, version]);

  // Construct 3D points for each reachable safe route
  const { routesPoints, entryPosition, targetPositions } = useMemo(() => {
    const allRoutes: Array<Array<[number, number, number]>> = [];
    const targets: Array<[number, number, number]> = [];
    let entryPos: [number, number, number] | null = null;

    for (const route of dossier.routes) {
      if (!route.reachable || route.waypoints.length < 2) continue;

      if (!entryPos) {
        const p = cellToWorld(engine, route.entryPoint.x, route.entryPoint.y);
        entryPos = [p.x, 0.08, p.z];
      }

      const points: Array<[number, number, number]> = route.waypoints.map((wp) => {
        const v = cellToWorld(engine, wp.x, wp.y);
        return [v.x, 0.08, v.z];
      });

      allRoutes.push(points);

      const last = route.waypoints[route.waypoints.length - 1];
      const targetPos = cellToWorld(engine, last.x, last.y);
      targets.push([targetPos.x, 0.08, targetPos.z]);
    }

    return { routesPoints: allRoutes, entryPosition: entryPos, targetPositions: targets };
  }, [engine, dossier]);

  // Subtle pulsing animation for beacon
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (pulseRef.current) {
      const scale = 1 + 0.12 * Math.sin(t * 5);
      pulseRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group name="safe-route-overlay">
      {/* Route lines */}
      {routesPoints.map((points, idx) => (
        <Line
          key={idx}
          points={points}
          color="#34d399"
          lineWidth={2.5}
          dashed
          dashSize={0.28}
          gapSize={0.16}
          transparent
          opacity={0.88}
          depthWrite={false}
        />
      ))}

      {/* Entry Point Beacon */}
      {entryPosition && (
        <group position={entryPosition}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
            <ringGeometry args={[0.3, 0.55, 24]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh ref={pulseRef} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
            <planeGeometry args={[1.6, 1.6]} />
            <meshBasicMaterial map={glowTexture()} color="#2563eb" transparent opacity={0.65} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* Casualty Waypoint Rings */}
      {targetPositions.map((target, idx) => (
        <mesh key={idx} position={target} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.35, 0.55, 24]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
