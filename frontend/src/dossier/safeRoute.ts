import type { Point } from '../simulation/core/types';
import { DOSSIER_CONFIG } from './config';
import type { HazardZone, MergedGrid, SafeRoute, SurvivorRecord, VisitingOrderStep } from './types';

interface SpatialCostContext {
  clearancePenalty: Float32Array;
  frontierPenalty: Float32Array;
  rubbleMap: Uint8Array;
  hazardMap: Float32Array;
  hazardNames: Map<number, string[]>;
}

const NEIGHBOURS_ORTHO = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

const NEIGHBOURS_DIAG = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const;

const NEIGHBOURS_8 = [
  ...NEIGHBOURS_ORTHO,
  ...NEIGHBOURS_DIAG,
] as const;

/**
 * Precompute clearance and frontier proximity penalties once for the entire merged grid.
 *
 * Rationale:
 * Checking 8 neighbors during every node expansion in multiple A* runs is redundant.
 * Precomputing spatial risk into flat typed arrays allows O(1) penalty lookups during pathfinding.
 */
function precomputeSpatialCosts(grid: MergedGrid, hazards?: HazardZone[]): SpatialCostContext {
  const { width, height } = grid;
  const total = width * height;
  const clearancePenalty = new Float32Array(total);
  const frontierPenalty = new Float32Array(total);
  const rubbleMap = new Uint8Array(total);
  const hazardMap = new Float32Array(total);
  const hazardNames = new Map<number, string[]>();

  // Mark direct cell types
  for (let idx = 0; idx < total; idx++) {
    if (grid.cells[idx].kind === 'rubble') {
      rubbleMap[idx] = 1;
    }
  }

  // Precompute adjacency clearance and frontier penalties
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cell = grid.cells[idx];
      if (cell.kind === 'wall' || cell.kind === 'unknown') continue;

      let nearWall = false;
      let nearRubble = false;
      let nearFrontier = false;

      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny)) {
          nearWall = true;
          continue;
        }
        const nKind = grid.get(nx, ny).kind;
        if (nKind === 'wall') nearWall = true;
        else if (nKind === 'rubble') nearRubble = true;
        else if (nKind === 'unknown') nearFrontier = true;
      }

      let penalty = 0;
      if (nearWall) penalty += DOSSIER_CONFIG.wallClearancePenalty;
      if (nearRubble) penalty += DOSSIER_CONFIG.rubbleClearancePenalty;
      clearancePenalty[idx] = penalty;

      if (nearFrontier) {
        frontierPenalty[idx] = DOSSIER_CONFIG.frontierProximityPenalty;
      }
    }
  }

  // Precompute HazardZone overlaps if any exist
  if (hazards && hazards.length > 0) {
    for (const h of hazards) {
      const r = h.radius;
      const minX = Math.max(0, Math.floor(h.center.x - r));
      const maxX = Math.min(width - 1, Math.ceil(h.center.x + r));
      const minY = Math.max(0, Math.floor(h.center.y - r));
      const maxY = Math.min(height - 1, Math.ceil(h.center.y + r));
      const sevFactor = h.severity === 'high' ? 2.5 : h.severity === 'medium' ? 1.5 : 1.0;

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dist = Math.hypot(x - h.center.x, y - h.center.y);
          if (dist <= r) {
            const idx = y * width + x;
            hazardMap[idx] += DOSSIER_CONFIG.hazardZoneCostMultiplier * sevFactor;
            const names = hazardNames.get(idx) ?? [];
            names.push(`${h.kind ?? 'HazardZone'}:${h.id} (${h.severity})`);
            hazardNames.set(idx, names);
          }
        }
      }
    }
  }

  return { clearancePenalty, frontierPenalty, rubbleMap, hazardMap, hazardNames };
}

/**
 * Fallback to the nearest known-free cell using BFS if the designated entry point
 * is blocked or unmapped in the swarm's merged belief.
 */
function resolveEntryPoint(grid: MergedGrid, preferred: Point): { point: Point; fallbackUsed: boolean } | null {
  if (grid.inBounds(preferred.x, preferred.y) && grid.isKnownFree(preferred.x, preferred.y)) {
    return { point: { ...preferred }, fallbackUsed: false };
  }

  // BFS outward to find closest known-free cell
  const { width, height } = grid;
  const visited = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const startX = Math.max(0, Math.min(width - 1, preferred.x));
  const startY = Math.max(0, Math.min(height - 1, preferred.y));
  queueX[tail] = startX;
  queueY[tail] = startY;
  tail++;
  visited[startY * width + startX] = 1;

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    if (grid.isKnownFree(cx, cy)) {
      return { point: { x: cx, y: cy }, fallbackUsed: true };
    }

    for (const [dx, dy] of NEIGHBOURS_ORTHO) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nIdx = ny * width + nx;
      if (visited[nIdx]) continue;
      visited[nIdx] = 1;
      queueX[tail] = nx;
      queueY[tail] = ny;
      tail++;
    }
  }

  return null;
}

/** Binary Min-Heap for fast A* node expansion */
class MinHeap {
  private data: Array<{ idx: number; f: number }> = [];

  get size(): number {
    return this.data.length;
  }

  push(idx: number, f: number): void {
    this.data.push({ idx, f });
    this.up(this.data.length - 1);
  }

  pop(): { idx: number; f: number } | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.down(0);
    }
    return top;
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[i].f < this.data[p].f) {
        const tmp = this.data[i];
        this.data[i] = this.data[p];
        this.data[p] = tmp;
        i = p;
      } else break;
    }
  }

  private down(i: number): void {
    const len = this.data.length;
    while (true) {
      const left = (i << 1) + 1;
      const right = left + 1;
      let smallest = i;
      if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest !== i) {
        const tmp = this.data[i];
        this.data[i] = this.data[smallest];
        this.data[smallest] = tmp;
        i = smallest;
      } else break;
    }
  }
}

interface PathResult {
  reachable: boolean;
  waypoints: Point[];
  length: number;
  cost: number;
  rubbleCount: number;
  hazardsPassed: string[];
  clearanceAccumulator: number;
  frontierAccumulator: number;
  reason?: string;
}

/**
 * Executes A* search from start to goal strictly over known-safe cells.
 *
 * Corner-cutting rule:
 * If moving diagonally from (x, y) to (x+dx, y+dy), BOTH adjacent orthogonal
 * cells (x+dx, y) and (x, y+dy) MUST be traversable. If either is a wall or
 * an unknown void, diagonal passage is strictly forbidden to prevent human rescuers
 * from squeezing through unstable cracks or corner gaps.
 */
function astarSafePath(
  grid: MergedGrid,
  spatial: SpatialCostContext,
  start: Point,
  goal: Point,
): PathResult {
  const { width, height } = grid;
  const total = width * height;

  if (!grid.inBounds(goal.x, goal.y)) {
    return {
      reachable: false,
      waypoints: [],
      length: 0,
      cost: 0,
      rubbleCount: 0,
      hazardsPassed: [],
      clearanceAccumulator: 0,
      frontierAccumulator: 0,
      reason: 'Survivor coordinate is outside belief bounds',
    };
  }

  const targetCell = grid.get(goal.x, goal.y);
  if (targetCell.kind === 'wall') {
    return {
      reachable: false,
      waypoints: [],
      length: 0,
      cost: 0,
      rubbleCount: 0,
      hazardsPassed: [],
      clearanceAccumulator: 0,
      frontierAccumulator: 0,
      reason: 'Survivor is reported inside a structural wall / impassable barrier',
    };
  }

  if (targetCell.kind === 'unknown') {
    return {
      reachable: false,
      waypoints: [],
      length: 0,
      cost: 0,
      rubbleCount: 0,
      hazardsPassed: [],
      clearanceAccumulator: 0,
      frontierAccumulator: 0,
      reason: 'Survivor location has not yet been visually mapped by the swarm',
    };
  }

  const startIdx = start.y * width + start.x;
  const goalIdx = goal.y * width + goal.x;

  if (startIdx === goalIdx) {
    return {
      reachable: true,
      waypoints: [start],
      length: 0,
      cost: 0,
      rubbleCount: spatial.rubbleMap[startIdx] ? 1 : 0,
      hazardsPassed: spatial.hazardNames.get(startIdx) ? [...spatial.hazardNames.get(startIdx)!] : [],
      clearanceAccumulator: spatial.clearancePenalty[startIdx],
      frontierAccumulator: spatial.frontierPenalty[startIdx],
    };
  }

  const gScore = new Float32Array(total).fill(Infinity);
  const parent = new Int32Array(total).fill(-1);
  const openSet = new MinHeap();

  gScore[startIdx] = 0;
  // Octile heuristic for 8-connected grid
  const heuristic = (x: number, y: number): number => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (DOSSIER_CONFIG.diagonalDistanceFactor - 1) * Math.min(dx, dy);
  };

  openSet.push(startIdx, heuristic(start.x, start.y));

  while (openSet.size > 0) {
    const current = openSet.pop()!;
    const cIdx = current.idx;
    if (cIdx === goalIdx) break;

    const cx = cIdx % width;
    const cy = Math.floor(cIdx / width);
    const currentG = gScore[cIdx];

    // Orthogonal neighbors
    for (const [dx, dy] of NEIGHBOURS_ORTHO) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const nCell = grid.get(nx, ny);
      if (nCell.kind === 'wall' || nCell.kind === 'unknown') continue;

      const nIdx = ny * width + nx;
      let moveCost = DOSSIER_CONFIG.baseCellCost;
      if (nCell.kind === 'rubble') moveCost += DOSSIER_CONFIG.rubbleCostMultiplier;
      moveCost += spatial.clearancePenalty[nIdx];
      moveCost += spatial.frontierPenalty[nIdx];
      moveCost += spatial.hazardMap[nIdx];
      if (nCell.confidence < 0.5) moveCost += DOSSIER_CONFIG.lowConfidencePenalty;

      const tentativeG = currentG + moveCost;
      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG;
        parent[nIdx] = cIdx;
        openSet.push(nIdx, tentativeG + heuristic(nx, ny));
      }
    }

    // Diagonal neighbors (with strict corner-cutting prevention)
    if (DOSSIER_CONFIG.allowDiagonalMovement) {
      for (const [dx, dy] of NEIGHBOURS_DIAG) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.inBounds(nx, ny)) continue;
        const nCell = grid.get(nx, ny);
        if (nCell.kind === 'wall' || nCell.kind === 'unknown') continue;

        // Corner-cutting check: orthogonal adjacent cells must be traversable
        const side1 = grid.get(cx + dx, cy);
        const side2 = grid.get(cx, cy + dy);
        if (side1.kind === 'wall' || side1.kind === 'unknown') continue;
        if (side2.kind === 'wall' || side2.kind === 'unknown') continue;

        const nIdx = ny * width + nx;
        let moveCost = DOSSIER_CONFIG.baseCellCost * DOSSIER_CONFIG.diagonalDistanceFactor;
        if (nCell.kind === 'rubble') moveCost += DOSSIER_CONFIG.rubbleCostMultiplier;
        moveCost += spatial.clearancePenalty[nIdx];
        moveCost += spatial.frontierPenalty[nIdx];
        moveCost += spatial.hazardMap[nIdx];
        if (nCell.confidence < 0.5) moveCost += DOSSIER_CONFIG.lowConfidencePenalty;

        const tentativeG = currentG + moveCost;
        if (tentativeG < gScore[nIdx]) {
          gScore[nIdx] = tentativeG;
          parent[nIdx] = cIdx;
          openSet.push(nIdx, tentativeG + heuristic(nx, ny));
        }
      }
    }
  }

  if (gScore[goalIdx] === Infinity) {
    return {
      reachable: false,
      waypoints: [],
      length: 0,
      cost: 0,
      rubbleCount: 0,
      hazardsPassed: [],
      clearanceAccumulator: 0,
      frontierAccumulator: 0,
      reason: 'No known safe route through explored free cells (blocked by walls, debris, or unmapped voids)',
    };
  }

  // Reconstruct path
  const waypoints: Point[] = [];
  let curr = goalIdx;
  let rubbleCount = 0;
  let clearanceAcc = 0;
  let frontierAcc = 0;
  const uniqueHazards = new Set<string>();

  while (curr !== -1) {
    const x = curr % width;
    const y = Math.floor(curr / width);
    waypoints.push({ x, y });
    if (spatial.rubbleMap[curr]) rubbleCount++;
    clearanceAcc += spatial.clearancePenalty[curr];
    frontierAcc += spatial.frontierPenalty[curr];
    const hz = spatial.hazardNames.get(curr);
    if (hz) for (const name of hz) uniqueHazards.add(name);
    curr = parent[curr];
  }

  waypoints.reverse();

  const hazardsPassed: string[] = [];
  if (rubbleCount > 0) {
    hazardsPassed.push(`Rubble (${rubbleCount} cell${rubbleCount > 1 ? 's' : ''} traversed)`);
  }
  for (const hz of uniqueHazards) hazardsPassed.push(hz);

  return {
    reachable: true,
    waypoints,
    length: Math.max(0, waypoints.length - 1),
    cost: gScore[goalIdx],
    rubbleCount,
    hazardsPassed,
    clearanceAccumulator: clearanceAcc,
    frontierAccumulator: frontierAcc,
  };
}

/**
 * Computes a standardized risk score (0-100) based on route exposure to structural hazards.
 */
function calculateRiskScore(result: PathResult): number {
  if (!result.reachable) return 100;
  const w = DOSSIER_CONFIG.riskScoreWeights;
  const rawRisk =
    result.length * w.lengthFactor +
    result.rubbleCount * w.rubbleWeight +
    result.clearanceAccumulator * w.clearanceWeight +
    result.frontierAccumulator * w.frontierWeight +
    result.hazardsPassed.length * w.hazardZoneWeight;

  return Math.min(100, Math.round(rawRisk * 10) / 10);
}

/**
 * Estimates human travel time in seconds, accounting for brisk search walk pace
 * and additional tactical delay when navigating rubble.
 */
function calculateTravelTimeSeconds(length: number, rubbleCount: number): number {
  if (length === 0) return 0;
  const cleanCells = Math.max(0, length - rubbleCount);
  const transitTime = cleanCells / DOSSIER_CONFIG.humanWalkSpeedCellsPerSec;
  // Rubble incurs an extra ~3.5 seconds per cell for careful human foot placement
  const rubbleTime = rubbleCount * (1.0 / (DOSSIER_CONFIG.humanWalkSpeedCellsPerSec * 0.3));
  return Math.round(transitTime + rubbleTime);
}

/**
 * Pure route planner for the Rescue Dossier.
 *
 * Evaluates:
 * 1. Safe routes from entry point to each confirmed / suspected survivor.
 * 2. Greedy nearest-neighbor recommended visiting sequence for multiple casualties.
 */
export function computeSafeRoutes(
  mergedGrid: MergedGrid,
  entryPoint: Point,
  survivors: readonly SurvivorRecord[],
  hazards?: HazardZone[],
): { routes: SafeRoute[]; visitingOrder: VisitingOrderStep[] } {
  const spatial = precomputeSpatialCosts(mergedGrid, hazards);
  const resolved = resolveEntryPoint(mergedGrid, entryPoint);

  if (!resolved) {
    const unreachRoutes: SafeRoute[] = survivors.map((s) => ({
      survivorId: s.id,
      targetCell: { ...s.estimatedCell },
      entryPoint: { ...entryPoint },
      fallbackEntryPointUsed: false,
      reachable: false,
      reason: 'No known-free entry point discovered in swarm belief',
      waypoints: [],
      length: 0,
      riskScore: 100,
      hazardsPassed: [],
      estimatedTravelTimeSeconds: 0,
    }));
    return { routes: unreachRoutes, visitingOrder: [] };
  }

  const { point: actualEntry, fallbackUsed } = resolved;
  const routes: SafeRoute[] = [];

  for (const s of survivors) {
    const res = astarSafePath(mergedGrid, spatial, actualEntry, s.estimatedCell);
    const riskScore = calculateRiskScore(res);
    const travelTime = res.reachable ? calculateTravelTimeSeconds(res.length, res.rubbleCount) : 0;

    routes.push({
      survivorId: s.id,
      targetCell: { ...s.estimatedCell },
      entryPoint: actualEntry,
      fallbackEntryPointUsed: fallbackUsed,
      reachable: res.reachable,
      reason: res.reason,
      waypoints: res.waypoints,
      length: res.length,
      riskScore,
      hazardsPassed: res.hazardsPassed,
      estimatedTravelTimeSeconds: travelTime,
    });
  }

  // Recommended visiting order: Greedy nearest-by-route-cost chaining
  // Rationale: In mass-casualty triage, field rescuers begin at the staging entry,
  // proceed to the most rapidly accessible victim first, stabilize, and then route
  // to the next closest casualty from their current location.
  const reachableSurvivors = survivors.filter((s) => {
    const r = routes.find((rt) => rt.survivorId === s.id);
    return r?.reachable === true;
  });

  const visitingOrder: VisitingOrderStep[] = [];
  const remaining = [...reachableSurvivors];
  let currentPos = actualEntry;
  let cumulativeTime = 0;
  let step = 1;

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestPath: PathResult | null = null;
    let minTime = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const path = astarSafePath(mergedGrid, spatial, currentPos, s.estimatedCell);
      if (!path.reachable) continue;
      const t = calculateTravelTimeSeconds(path.length, path.rubbleCount);
      if (t < minTime) {
        minTime = t;
        bestIdx = i;
        bestPath = path;
      }
    }

    if (bestIdx === -1 || !bestPath) break;

    const chosen = remaining.splice(bestIdx, 1)[0];
    cumulativeTime += minTime;

    visitingOrder.push({
      step: step++,
      survivorId: chosen.id,
      targetCell: { ...chosen.estimatedCell },
      segmentLength: bestPath.length,
      segmentTravelTimeSeconds: minTime,
      cumulativeTravelTimeSeconds: cumulativeTime,
    });

    currentPos = chosen.estimatedCell;
  }

  return { routes, visitingOrder };
}
