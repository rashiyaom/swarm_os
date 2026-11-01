import type { SimulationEngine } from '../simulation/core/SimulationEngine';
import type { Point } from '../simulation/core/types';
import { evidencePosition, maxThermal } from '../simulation/sensing/SensorModel';
import { FREE, RUBBLE, WALL } from '../simulation/world/GridMap';
import { DOSSIER_CONFIG } from './config';
import { mergeBeliefs } from './mergeBeliefs';
import { computeSafeRoutes } from './safeRoute';
import type {
  Dossier,
  DossierAudit,
  DossierCoverage,
  DossierMeta,
  DossierNetworkSummary,
  DossierRobotSummary,
  HazardZone,
  SurvivorRecord,
} from './types';

// One engine tick is one mission second; rendering speed does not change mission time.

export interface BuildDossierOptions {
  entryPoint?: Point;
  hazards?: HazardZone[];
}

/**
 * Builds a deterministic FEMA-style Rescue Dossier object purely from the swarm's
 * merged belief maps, noisy sensor evidence, and telemetry.
 *
 * STRICT SAFETY CONTRACT:
 * 1. NO GROUND TRUTH LEAKAGE:
 *    - Unconfirmed victims in `engine.world.victims` are NEVER inspected or revealed.
 *    - Confirmed survivors are taken ONLY from `engine.discoveredSurvivors()` (where `found === true`).
 *    - Suspected survivors are generated ONLY from robots' noisy `evidencePosition(r)`.
 * 2. DETERMINISM:
 *    - All timestamps are measured in simulation ticks. No `Date.now()` or system clocks.
 * 3. NO MUTATION:
 *    - Reads simulation state in a read-only manner. Does not alter determinism, movement, or beliefs.
 */
export function buildDossier(engine: SimulationEngine, options?: BuildDossierOptions): Dossier {
  const robots = engine.robots;
  const mergedGrid = mergeBeliefs(robots, engine.scenario.width, engine.scenario.height);

  // 1. Meta compilation
  let contributingCount = 0;
  let depletedCount = 0;
  let roversCount = 0;
  let dronesCount = 0;
  let aliveCount = 0;

  for (const r of robots) {
    if (r.type === 'rover') roversCount++;
    else dronesCount++;

    if (r.alive) aliveCount++;
    else depletedCount++;

    // A robot contributes if its private map contains at least one explored cell
    let contributed = false;
    for (let i = 0; i < r.belief.cells.length; i++) {
      if (r.belief.cells[i] >= 0) {
        contributed = true;
        break;
      }
    }
    if (contributed) contributingCount++;
  }

  const meta: DossierMeta = {
    missionId: engine.scenario.name,
    seed: engine.options.seed,
    generatedAtTick: engine.step,
    missionDurationSeconds: engine.step,
    swarmComposition: {
      rovers: roversCount,
      drones: dronesCount,
      total: robots.length,
    },
    robotsAlive: aliveCount,
    robotsLost: robots.length - aliveCount,
    dataSources: {
      contributing: contributingCount,
      total: robots.length,
      depleted: depletedCount,
    },
  };

  // 2. Coverage compilation from merged belief
  let freeCount = 0;
  let wallCount = 0;
  let rubbleCount = 0;
  let unknownCount = 0;

  for (const cell of mergedGrid.cells) {
    if (cell.raw === FREE) freeCount++;
    else if (cell.raw === WALL) wallCount++;
    else if (cell.raw === RUBBLE) rubbleCount++;
    else unknownCount++;
  }

  const totalCells = mergedGrid.width * mergedGrid.height;
  const exploredCells = freeCount + wallCount + rubbleCount;
  const coverage: DossierCoverage = {
    totalCells,
    exploredCells,
    freeCells: freeCount,
    wallCells: wallCount,
    rubbleCells: rubbleCount,
    unknownCells: unknownCount,
    exploredPercent: totalCells > 0 ? Math.round((exploredCells / totalCells) * 1000) / 10 : 0,
    unexploredPercent: totalCells > 0 ? Math.round((unknownCount / totalCells) * 1000) / 10 : 0,
    knownFreePercent: totalCells > 0 ? Math.round((freeCount / totalCells) * 1000) / 10 : 0,
    knownBlockedPercent: totalCells > 0 ? Math.round(((wallCount + rubbleCount) / totalCells) * 1000) / 10 : 0,
    unknownPercent: totalCells > 0 ? Math.round((unknownCount / totalCells) * 1000) / 10 : 0,
  };

  // 3. Survivor records (Confirmed from discovered list + Suspected from noisy evidence)
  const survivors: SurvivorRecord[] = [];
  const confirmedVictims = engine.discoveredSurvivors();

  for (const v of confirmedVictims) {
    survivors.push({
      id: `confirmed_${v.id}`,
      estimatedCell: { x: v.x, y: v.y },
      status: 'CONFIRMED',
      label: 'confirmed on site',
      confidence: 1.0,
      evidence: {
        thermal: 1.0,
        acoustic: 1.0,
      },
      confirmedBy: v.foundBy ?? undefined,
      confirmedAtTick: v.foundStep ?? undefined,
    });
  }

  // Detect suspected survivors ONLY from robots' sensor cues and odometry (no world.victims access)
  for (const r of robots) {
    if (!r.alive) continue;
    const therm = maxThermal(r.thermal);
    const acoust = r.acoustic;

    if (therm >= DOSSIER_CONFIG.suspectedThermalThreshold || acoust >= DOSSIER_CONFIG.suspectedAcousticThreshold) {
      const pos = evidencePosition(r);
      if (!pos) continue;

      // Check if this cue belongs to an already confirmed victim location
      const alreadyConfirmed = confirmedVictims.some(
        (cv) => Math.hypot(cv.x - pos.x, cv.y - pos.y) <= 1.5,
      );
      if (alreadyConfirmed) continue;

      // Deduplicate against already recorded suspected cues
      const duplicateSuspected = survivors.some(
        (s) => s.status === 'SUSPECTED' && Math.hypot(s.estimatedCell.x - pos.x, s.estimatedCell.y - pos.y) <= 1.5,
      );
      if (duplicateSuspected) continue;

      const conf = Math.min(0.9, Math.max(0.3, Math.round((therm * 0.65 + acoust * 0.35) * 100) / 100));
      survivors.push({
        id: `suspected_${r.name}`,
        estimatedCell: { ...pos },
        status: 'SUSPECTED',
        label: 'suspected survivor (thermal/acoustic cue)',
        confidence: conf,
        evidence: {
          thermal: Math.round(therm * 1000) / 1000,
          acoustic: Math.round(acoust * 1000) / 1000,
        },
        detectedBy: r.name,
      });
    }
  }

  // Sort survivors deterministically by id
  survivors.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  // 4. Safe route planning
  const entryPoint = options?.entryPoint ?? engine.scenario.spawnCenter;
  const hazards = options?.hazards ?? [];
  const { routes, visitingOrder } = computeSafeRoutes(mergedGrid, entryPoint, survivors, hazards);

  // Attach route summaries to survivor records
  for (const s of survivors) {
    const route = routes.find((rt) => rt.survivorId === s.id);
    if (route) {
      s.routeSummary = {
        reachable: route.reachable,
        routeLength: route.length,
        riskScore: route.riskScore,
        estimatedTravelTimeSeconds: route.estimatedTravelTimeSeconds,
        reason: route.reason,
      };
    }
  }

  // 5. Robot summary (Uses odometry positions odomX/odomY; NEVER true coordinates)
  const robotSummaries: DossierRobotSummary[] = robots.map((r) => {
    let visitedCount = 0;
    for (let i = 0; i < r.visited.length; i++) if (r.visited[i] > 0) visitedCount++;

    return {
      id: r.name,
      label: r.label,
      type: r.type,
      battery: Math.round(r.battery * 10) / 10,
      maxBattery: Math.round(r.maxBattery * 10) / 10,
      batteryFraction: Math.round((r.battery / r.maxBattery) * 100) / 100,
      alive: r.alive,
      status: !r.alive ? 'depleted' : r.manual ? 'manual' : 'active',
      cellsExplored: visitedCount,
      odomPosition: { x: Math.round(r.odomX * 10) / 10, y: Math.round(r.odomY * 10) / 10 },
      odomUncertainty: Math.round(r.odomUncertainty * 100) / 100,
    };
  });

  // 6. Network summary
  const linkInfos = [...engine.network.links.values()].filter((l) => l.step === engine.step);
  let healthyCount = 0;
  let weakCount = 0;
  let downCount = 0;

  for (const l of linkInfos) {
    if (l.health === 'healthy') healthyCount++;
    else if (l.health === 'weak') weakCount++;
    else downCount++;
  }

  const totalLinks = healthyCount + weakCount + downCount;
  let averageLinkHealth: 'healthy' | 'weak' | 'down' | 'no-links' = 'no-links';
  if (totalLinks > 0) {
    if (healthyCount >= weakCount && healthyCount >= downCount) averageLinkHealth = 'healthy';
    else if (weakCount >= downCount) averageLinkHealth = 'weak';
    else averageLinkHealth = 'down';
  }

  const isolated = Array.from(engine.network.isolatedAgents(engine.step)).sort();
  const netSummary: DossierNetworkSummary = {
    averageLinkHealth,
    healthyLinks: healthyCount,
    weakLinks: weakCount,
    downLinks: downCount,
    totalLinks,
    partitionsObserved: isolated,
    configuredPacketLoss: engine.options.packetLoss,
    measuredPacketLoss: engine.measuredLoss(),
  };

  // 7. Audit & Limitations
  const collisionsReport: number | 'not tracked' =
    typeof (engine as unknown as { collisions?: unknown }).collisions === 'number'
      ? (engine as unknown as { collisions: number }).collisions
      : 'not tracked';

  const audit: DossierAudit = {
    collisions: collisionsReport,
    limitations: [
      'Beliefs are pooled from all robots including depleted ones.',
      'Positions and routes are belief-based from noisy odometry; actual structure may differ.',
      'Unexplored areas are not guaranteed safe; unknown cells are treated as impassable voids.',
      'Route is advisory and not a substitute for structural engineering assessment.',
    ],
  };

  return {
    meta,
    coverage,
    survivors,
    routes,
    visitingOrder,
    robots: robotSummaries,
    network: netSummary,
    hazards,
    audit,
  };
}
