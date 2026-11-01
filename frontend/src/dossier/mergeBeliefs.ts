import { FREE, RUBBLE, UNKNOWN, WALL } from '../simulation/world/GridMap';
import type { RobotState } from '../simulation/robots/RobotState';
import type { MergedCell, MergedCellKind, MergedGrid } from './types';

/**
 * Honest conservative union of all robots' private belief maps.
 *
 * NOTE ON TEMPORAL ORDERING:
 * The simulation's GridMap implementation does not track per-cell modification timestamps.
 * Therefore, we do NOT claim "newest wins". Instead, we implement a strictly conservative
 * safety union:
 *
 *   WALL / RUBBLE > FREE > UNKNOWN
 *
 * Field Rationale:
 * In a collapsed, unstable disaster environment, human rescuer safety is paramount.
 * If ANY robot observed a collapsed wall or rubble pile at a given coordinate, human
 * teams must treat that coordinate as hazardous/blocked, even if another robot observed
 * it as clear from a different angle or earlier in the mission.
 *
 * An optional `lastUpdatedTick` field is included on `MergedCell` as an extensible hook
 * for future timestamped map protocols, but remains unused here.
 */
export function mergeBeliefs(
  robots: readonly RobotState[],
  width?: number,
  height?: number,
): MergedGrid {
  const w = width ?? (robots[0]?.belief.width ?? 0);
  const h = height ?? (robots[0]?.belief.height ?? 0);
  const total = w * h;
  const cells: MergedCell[] = new Array(total);

  for (let idx = 0; idx < total; idx++) {
    const x = idx % w;
    const y = Math.floor(idx / w);

    let wallCount = 0;
    let rubbleCount = 0;
    let freeCount = 0;
    let unknownCount = 0;

    for (const r of robots) {
      if (!r.belief.inBounds(x, y)) continue;
      const v = r.belief.get(x, y);
      if (v === WALL) wallCount++;
      else if (v === RUBBLE) rubbleCount++;
      else if (v === FREE) freeCount++;
      else unknownCount++;
    }

    const observers = wallCount + rubbleCount + freeCount;

    let kind: MergedCellKind;
    let raw: number;
    let confidence = 0;

    // Conservative safety hierarchy:
    // 1. WALL: Any observation of a solid obstacle blocks passage.
    // 2. RUBBLE: Observed rubble/debris is hazardous and heavily penalized.
    // 3. FREE: Only treated as free if at least one robot observed it free and NO robot observed it obstructed.
    // 4. UNKNOWN: If no robot observed the cell, it is treated as an uncharted void.
    if (wallCount > 0) {
      kind = 'wall';
      raw = WALL;
      confidence = wallCount / observers;
    } else if (rubbleCount > 0) {
      kind = 'rubble';
      raw = RUBBLE;
      confidence = rubbleCount / observers;
    } else if (freeCount > 0) {
      kind = 'free';
      raw = FREE;
      confidence = freeCount / observers;
    } else {
      kind = 'unknown';
      raw = UNKNOWN;
      confidence = 0;
    }

    cells[idx] = {
      kind,
      raw,
      confidence,
      observers,
      lastUpdatedTick: undefined,
    };
  }

  return {
    width: w,
    height: h,
    cells,
    inBounds(x: number, y: number): boolean {
      return x >= 0 && y >= 0 && x < w && y < h;
    },
    get(x: number, y: number): MergedCell {
      if (!this.inBounds(x, y)) {
        return { kind: 'wall', raw: WALL, confidence: 1, observers: 0, lastUpdatedTick: undefined };
      }
      return cells[y * w + x];
    },
    isKnownFree(x: number, y: number): boolean {
      if (!this.inBounds(x, y)) return false;
      return cells[y * w + x].kind === 'free';
    },
    isTraversable(x: number, y: number, allowRubble = true): boolean {
      if (!this.inBounds(x, y)) return false;
      const k = cells[y * w + x].kind;
      return k === 'free' || (allowRubble && k === 'rubble');
    },
  };
}
