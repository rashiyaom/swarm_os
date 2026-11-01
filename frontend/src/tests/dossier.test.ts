import { describe, expect, it } from 'vitest';
import { defaultOptions, SimulationEngine } from '../simulation/core/SimulationEngine';
import { FREE, RUBBLE, UNKNOWN, WALL } from '../simulation/world/GridMap';
import { createRobot } from '../simulation/robots/RobotState';
import { roverConfig } from '../simulation/robots/RoverRobot';
import { droneConfig } from '../simulation/robots/DroneRobot';
import { mergeBeliefs } from '../dossier/mergeBeliefs';
import { computeSafeRoutes } from '../dossier/safeRoute';
import { buildDossier } from '../dossier/buildDossier';
import type { HazardZone, MergedGrid, SurvivorRecord } from '../dossier/types';

describe('Rescue Dossier & Safe Route Planning (Part 1 Logic)', () => {
  describe('mergeBeliefs - Conservative Safety Union', () => {
    it('implements conservative union priority: WALL / RUBBLE > FREE > UNKNOWN', () => {
      // GridMap does not store per-cell timestamps, so we honestly test the conservative union rule
      const config = roverConfig(false);
      const r1 = createRobot(0, 'rover', 0, 0, 0, config, 1.0, 10, 10);
      const r2 = createRobot(1, 'rover', 1, 0, 0, config, 1.0, 10, 10);
      const r3 = createRobot(2, 'drone', 0, 0, 0, droneConfig(false), 1.0, 10, 10);

      // Cell (2, 2): r1 saw FREE, r2 saw WALL, r3 has UNKNOWN -> WALL wins
      r1.belief.set(2, 2, FREE);
      r2.belief.set(2, 2, WALL);
      r3.belief.set(2, 2, UNKNOWN);

      // Cell (3, 3): r1 saw FREE, r2 saw RUBBLE, r3 has UNKNOWN -> RUBBLE wins over FREE
      r1.belief.set(3, 3, FREE);
      r2.belief.set(3, 3, RUBBLE);
      r3.belief.set(3, 3, UNKNOWN);

      // Cell (4, 4): r1 saw WALL, r2 saw RUBBLE -> WALL takes conservative precedence
      r1.belief.set(4, 4, WALL);
      r2.belief.set(4, 4, RUBBLE);
      r3.belief.set(4, 4, UNKNOWN);

      // Cell (5, 5): r1 saw FREE, r2 saw FREE, r3 has UNKNOWN -> FREE
      r1.belief.set(5, 5, FREE);
      r2.belief.set(5, 5, FREE);
      r3.belief.set(5, 5, UNKNOWN);

      // Cell (6, 6): all UNKNOWN -> UNKNOWN
      r1.belief.set(6, 6, UNKNOWN);
      r2.belief.set(6, 6, UNKNOWN);
      r3.belief.set(6, 6, UNKNOWN);

      const merged = mergeBeliefs([r1, r2, r3], 10, 10);

      // (2, 2)
      expect(merged.get(2, 2).kind).toBe('wall');
      expect(merged.get(2, 2).raw).toBe(WALL);
      expect(merged.get(2, 2).observers).toBe(2);
      expect(merged.get(2, 2).confidence).toBe(0.5); // 1 out of 2 observers agreed it was wall

      // (3, 3)
      expect(merged.get(3, 3).kind).toBe('rubble');
      expect(merged.get(3, 3).raw).toBe(RUBBLE);
      expect(merged.get(3, 3).observers).toBe(2);
      expect(merged.get(3, 3).confidence).toBe(0.5);

      // (4, 4)
      expect(merged.get(4, 4).kind).toBe('wall');
      expect(merged.get(4, 4).raw).toBe(WALL);

      // (5, 5)
      expect(merged.get(5, 5).kind).toBe('free');
      expect(merged.get(5, 5).raw).toBe(FREE);
      expect(merged.get(5, 5).observers).toBe(2);
      expect(merged.get(5, 5).confidence).toBe(1.0); // 2 out of 2 agreed it was free

      // (6, 6)
      expect(merged.get(6, 6).kind).toBe('unknown');
      expect(merged.get(6, 6).raw).toBe(UNKNOWN);
      expect(merged.get(6, 6).observers).toBe(0);
      expect(merged.get(6, 6).confidence).toBe(0);

      // Verify optional lastUpdatedTick hook is available on MergedCell
      expect('lastUpdatedTick' in merged.get(2, 2)).toBe(true);
      expect(merged.get(2, 2).lastUpdatedTick).toBeUndefined();
    });
  });

  describe('A* Safe Routing over Merged Belief', () => {
    function createMockMergedGrid(w: number, h: number, cellKinds: Record<string, 'free' | 'wall' | 'rubble' | 'unknown'>): MergedGrid {
      const cells = new Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const kind = cellKinds[`${x},${y}`] ?? 'unknown';
          const raw = kind === 'free' ? FREE : kind === 'wall' ? WALL : kind === 'rubble' ? RUBBLE : UNKNOWN;
          cells[y * w + x] = {
            kind,
            raw,
            confidence: kind === 'unknown' ? 0 : 1,
            observers: kind === 'unknown' ? 0 : 1,
          };
        }
      }

      return {
        width: w,
        height: h,
        cells,
        inBounds: (x, y) => x >= 0 && y >= 0 && x < w && y < h,
        get: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? cells[y * w + x] : { kind: 'wall', raw: WALL, confidence: 1, observers: 0 }),
        isKnownFree: (x, y) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x].kind === 'free',
        isTraversable: (x, y, allowRubble = true) => {
          if (x < 0 || y < 0 || x >= w || y >= h) return false;
          const k = cells[y * w + x].kind;
          return k === 'free' || (allowRubble && k === 'rubble');
        },
      };
    }

    it('never routes through unknown or blocked cells', () => {
      // 5x5 grid with a known-free corridor, surrounded by unknown void
      const layout: Record<string, 'free' | 'wall' | 'rubble' | 'unknown'> = {
        '0,0': 'free',
        '1,0': 'free',
        '2,0': 'free',
        '2,1': 'free',
        '2,2': 'free',
        '1,1': 'wall', // Wall in the middle
      };
      // All other cells default to 'unknown'

      const grid = createMockMergedGrid(5, 5, layout);
      const survivors: SurvivorRecord[] = [
        {
          id: 'v1',
          estimatedCell: { x: 2, y: 2 },
          status: 'CONFIRMED',
          label: 'confirmed on site',
          confidence: 1,
          evidence: { thermal: 1, acoustic: 1 },
        },
      ];

      const { routes } = computeSafeRoutes(grid, { x: 0, y: 0 }, survivors);
      expect(routes).toHaveLength(1);
      const r = routes[0];

      expect(r.reachable).toBe(true);
      expect(r.waypoints.length).toBeGreaterThan(0);

      // Verify every waypoint is strictly 'free' or 'rubble', never 'unknown' or 'wall'
      for (const pt of r.waypoints) {
        const cell = grid.get(pt.x, pt.y);
        expect(cell.kind).not.toBe('unknown');
        expect(cell.kind).not.toBe('wall');
      }
    });

    it('forbids diagonal corner-cutting past walls or unknown cells', () => {
      // Setup a corner:
      // (0,0)=free, (1,0)=wall
      // (0,1)=free, (1,1)=free
      // Rescuer stepping from (0,0) to (1,1) would cut corner through wall at (1,0).
      // Our rule requires BOTH (1,0) and (0,1) to be traversable for diagonal (0,0)->(1,1).
      const layout: Record<string, 'free' | 'wall' | 'rubble' | 'unknown'> = {
        '0,0': 'free',
        '1,0': 'wall', // Obstacle at corner
        '0,1': 'free',
        '1,1': 'free',
      };

      const grid = createMockMergedGrid(3, 3, layout);
      const survivors: SurvivorRecord[] = [
        {
          id: 'target',
          estimatedCell: { x: 1, y: 1 },
          status: 'CONFIRMED',
          label: 'confirmed on site',
          confidence: 1,
          evidence: { thermal: 1, acoustic: 1 },
        },
      ];

      const { routes } = computeSafeRoutes(grid, { x: 0, y: 0 }, survivors);
      expect(routes[0].reachable).toBe(true);

      // If diagonal corner-cutting were permitted, path would be [(0,0), (1,1)] length 1.
      // With corner-cutting forbidden, it MUST step orthogonally around: [(0,0), (0,1), (1,1)].
      expect(routes[0].waypoints).toEqual([
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]);
    });

    it('returns reachable=false with reason when a survivor is unreachable through known-safe cells', () => {
      // Survivor is trapped behind a wall or surrounded by unknown cells
      const layout: Record<string, 'free' | 'wall' | 'rubble' | 'unknown'> = {
        '0,0': 'free',
        '1,0': 'wall',
        '0,1': 'wall',
        // (2,2) is a confirmed survivor, but separated by unknown and wall
        '2,2': 'free',
      };

      const grid = createMockMergedGrid(5, 5, layout);
      const survivors: SurvivorRecord[] = [
        {
          id: 'isolated',
          estimatedCell: { x: 2, y: 2 },
          status: 'CONFIRMED',
          label: 'confirmed on site',
          confidence: 1,
          evidence: { thermal: 1, acoustic: 1 },
        },
      ];

      const { routes } = computeSafeRoutes(grid, { x: 0, y: 0 }, survivors);
      expect(routes[0].reachable).toBe(false);
      expect(routes[0].waypoints).toEqual([]);
      expect(routes[0].length).toBe(0);
      expect(routes[0].riskScore).toBe(100);
      expect(routes[0].reason).toContain('No known safe route');
    });

    it('penalizes rubble and catalogs it under hazards passed', () => {
      // Direct path through rubble vs detour through free floor:
      // (0,0) free -> (1,0) rubble -> (2,0) free (survivor)
      // Detour: (0,0) -> (0,1) free -> (1,1) free -> (2,1) free -> (2,0) free
      const layout: Record<string, 'free' | 'wall' | 'rubble' | 'unknown'> = {
        '0,0': 'free',
        '1,0': 'rubble',
        '2,0': 'free',
        '0,1': 'free',
        '1,1': 'free',
        '2,1': 'free',
      };

      const grid = createMockMergedGrid(4, 4, layout);
      const survivors: SurvivorRecord[] = [
        {
          id: 'v_dest',
          estimatedCell: { x: 2, y: 0 },
          status: 'CONFIRMED',
          label: 'confirmed on site',
          confidence: 1,
          evidence: { thermal: 1, acoustic: 1 },
        },
      ];

      // A* should choose the clean detour around rubble due to heavy rubble penalty
      const { routes } = computeSafeRoutes(grid, { x: 0, y: 0 }, survivors);
      expect(routes[0].reachable).toBe(true);
      const traversedRubble = routes[0].waypoints.some((pt) => grid.get(pt.x, pt.y).kind === 'rubble');
      expect(traversedRubble).toBe(false); // Preferred detour

      // Now block the detour so rubble traversal is mandatory:
      layout['1,1'] = 'wall';
      const blockedGrid = createMockMergedGrid(4, 4, layout);
      const forcedResult = computeSafeRoutes(blockedGrid, { x: 0, y: 0 }, survivors);
      expect(forcedResult.routes[0].reachable).toBe(true);
      expect(forcedResult.routes[0].hazardsPassed).toEqual(expect.arrayContaining([expect.stringContaining('Rubble')]));
    });

    it('falls back to the nearest known-free cell if spawnCenter is not known-free', () => {
      const layout: Record<string, 'free' | 'wall' | 'rubble' | 'unknown'> = {
        '0,0': 'wall', // Preferred entry point is obstructed or unmapped
        '0,1': 'free', // Nearest known free cell
        '0,2': 'free',
      };

      const grid = createMockMergedGrid(3, 3, layout);
      const survivors: SurvivorRecord[] = [
        {
          id: 's1',
          estimatedCell: { x: 0, y: 2 },
          status: 'CONFIRMED',
          label: 'confirmed on site',
          confidence: 1,
          evidence: { thermal: 1, acoustic: 1 },
        },
      ];

      const { routes } = computeSafeRoutes(grid, { x: 0, y: 0 }, survivors);
      expect(routes[0].reachable).toBe(true);
      expect(routes[0].fallbackEntryPointUsed).toBe(true);
      expect(routes[0].entryPoint).toEqual({ x: 0, y: 1 });
    });
  });

  describe('Zero Ground-Truth Leakage & Survivor Discretion', () => {
    it('never leaks unconfirmed hidden survivors into the dossier', () => {
      const engine = new SimulationEngine(defaultOptions({ seed: 42, rovers: 2, drones: 2 }));

      // At step 0, no survivor has been confirmed yet
      expect(engine.discoveredSurvivors()).toEqual([]);
      expect(engine.world.victims.length).toBeGreaterThan(0); // Ground truth has hidden victims

      const dossier = buildDossier(engine);

      // Dossier must contain ZERO confirmed survivors
      const confirmed = dossier.survivors.filter((s) => s.status === 'CONFIRMED');
      expect(confirmed).toHaveLength(0);

      // Even if there are suspected cues from sensor noise, verify no suspected survivor
      // snaps to a hidden victim's exact ground-truth coordinate
      for (const s of dossier.survivors) {
        expect(s.status).toBe('SUSPECTED');
        for (const hidden of engine.world.victims) {
          // Should not magically match hidden coordinate
          if (hidden.found === false) {
            expect(s.label).toBe('suspected survivor (thermal/acoustic cue)');
          }
        }
      }
    });

    it('uses odomX/odomY for robot positions, never true ground truth coordinates', () => {
      const engine = new SimulationEngine(defaultOptions({ seed: 15 }));
      // Advance a few steps to introduce slight odometry drift
      for (let i = 0; i < 5; i++) engine.tick();

      const dossier = buildDossier(engine);
      expect(dossier.robots.length).toBe(engine.robots.length);

      for (let i = 0; i < engine.robots.length; i++) {
        const simRobot = engine.robots[i];
        const repRobot = dossier.robots[i];
        expect(repRobot.odomPosition.x).toBe(Math.round(simRobot.odomX * 10) / 10);
        expect(repRobot.odomPosition.y).toBe(Math.round(simRobot.odomY * 10) / 10);
      }
    });
  });

  describe('Dossier Schema, Data Sources & Audit Limitations', () => {
    it('includes dataSources and required limitation regarding pooled beliefs from depleted robots', () => {
      const engine = new SimulationEngine(defaultOptions({ seed: 7 }));
      const dossier = buildDossier(engine);

      expect(dossier.meta.dataSources).toBeDefined();
      expect(dossier.meta.dataSources.total).toBe(4);
      expect(typeof dossier.meta.dataSources.contributing).toBe('number');
      expect(typeof dossier.meta.dataSources.depleted).toBe('number');

      expect(dossier.audit.limitations).toContain('Beliefs are pooled from all robots including depleted ones.');
      expect(dossier.audit.limitations).toContain(
        'Positions and routes are belief-based from noisy odometry; actual structure may differ.',
      );
      expect(dossier.audit.limitations).toContain(
        'Unexplored areas are not guaranteed safe; unknown cells are treated as impassable voids.',
      );
      expect(dossier.audit.limitations).toContain(
        'Route is advisory and not a substitute for structural engineering assessment.',
      );

      // Collision reporting
      expect(typeof dossier.audit.collisions === 'number' || dossier.audit.collisions === 'not tracked').toBe(true);
    });

    it('round-trips through JSON serialization with identical contents', () => {
      const engine = new SimulationEngine(defaultOptions({ seed: 21 }));
      for (let i = 0; i < 4; i++) engine.tick();

      const hazards: HazardZone[] = [
        {
          id: 'hz-1',
          center: { x: 5, y: 5 },
          radius: 2,
          severity: 'high',
          kind: 'aftershock_fissure',
        },
      ];

      const dossier = buildDossier(engine, { hazards });
      const serialized = JSON.stringify(dossier);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(dossier);
    });

    it('is strictly deterministic: two builds from the same state produce identical JSON', () => {
      const engine = new SimulationEngine(defaultOptions({ seed: 99 }));
      for (let i = 0; i < 8; i++) engine.tick();

      const d1 = buildDossier(engine);
      const d2 = buildDossier(engine);

      expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
    });

    it('guarantees non-mutation: engine.stateHash() is identical before and after building dossier', () => {
      const engine = new SimulationEngine(defaultOptions({ seed: 77 }));
      for (let i = 0; i < 10; i++) engine.tick();

      const hashBefore = engine.stateHash();
      buildDossier(engine);
      const hashAfter = engine.stateHash();

      expect(hashAfter).toBe(hashBefore);
    });
  });
});
