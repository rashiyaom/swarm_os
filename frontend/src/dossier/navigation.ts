import type { MergedGrid, RouteBoundingBox, SafeRoute, SurvivorRecord, TurnByTurnStep, CompassHeading } from './types';
import { FREE, RUBBLE, WALL } from '../simulation/world/GridMap';

const HEADING_ANGLES: Record<CompassHeading, number> = {
  North: 0,
  Northeast: 45,
  East: 90,
  Southeast: 135,
  South: 180,
  Southwest: 225,
  West: 270,
  Northwest: 315,
};

/**
 * Computes the minimal bounding box enclosing the route waypoints, entry point,
 * and target casualty with surrounding padding cells.
 */
export function computeRouteBoundingBox(
  route: SafeRoute,
  mapWidth: number,
  mapHeight: number,
  padding = 2,
): RouteBoundingBox {
  const pad = Math.max(1, padding);

  let minX = route.entryPoint.x;
  let maxX = route.entryPoint.x;
  let minY = route.entryPoint.y;
  let maxY = route.entryPoint.y;

  const points = [route.entryPoint, route.targetCell, ...route.waypoints];

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const clampedMinX = Math.max(0, minX - pad);
  const clampedMaxX = Math.min(mapWidth - 1, maxX + pad);
  const clampedMinY = Math.max(0, minY - pad);
  const clampedMaxY = Math.min(mapHeight - 1, maxY + pad);

  return {
    minX: clampedMinX,
    maxX: clampedMaxX,
    minY: clampedMinY,
    maxY: clampedMaxY,
    width: clampedMaxX - clampedMinX + 1,
    height: clampedMaxY - clampedMinY + 1,
  };
}

/**
 * Derives a cardinal or intercardinal compass heading from a direction vector.
 */
function getVectorHeading(dx: number, dy: number): CompassHeading {
  if (dx > 0 && dy === 0) return 'East';
  if (dx < 0 && dy === 0) return 'West';
  if (dx === 0 && dy > 0) return 'South';
  if (dx === 0 && dy < 0) return 'North';
  if (dx > 0 && dy > 0) return 'Southeast';
  if (dx < 0 && dy > 0) return 'Southwest';
  if (dx > 0 && dy < 0) return 'Northeast';
  return 'Northwest';
}

/**
 * Evaluates whether changing heading constitutes a left or right turn.
 */
function getTurnAction(prev: CompassHeading, next: CompassHeading): 'turn-left' | 'turn-right' | 'advance' {
  const diff = ((HEADING_ANGLES[next] - HEADING_ANGLES[prev] + 540) % 360) - 180;
  if (diff > 0) return 'turn-right';
  if (diff < 0) return 'turn-left';
  return 'advance';
}

/**
 * Converts a sequence of raw grid cells into human-readable, turn-by-turn walking directions.
 * Designed for human USAR responders who navigate by corridors, turns, and doorways rather than coordinate pairs.
 */
export function generateTurnByTurnDirections(
  route: SafeRoute,
  mergedGrid: MergedGrid,
  survivorLabel?: string,
): TurnByTurnStep[] {
  if (!route.reachable || route.waypoints.length < 2) {
    return [];
  }

  const { waypoints } = route;

  // 1. Group consecutive waypoints heading in the exact same direction into legs
  interface RawLeg {
    heading: CompassHeading;
    fromCell: { x: number; y: number };
    toCell: { x: number; y: number };
    distanceCells: number;
    rubbleCells: number;
  }

  const legs: RawLeg[] = [];
  let currentHeading: CompassHeading | null = null;
  let legStart = waypoints[0];
  let legDistance = 0;
  let legRubble = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const cur = waypoints[i];
    const nxt = waypoints[i + 1];
    const dx = nxt.x - cur.x;
    const dy = nxt.y - cur.y;
    const heading = getVectorHeading(dx, dy);

    const cell = mergedGrid.get(nxt.x, nxt.y);
    const isRubble = cell.raw === RUBBLE;

    if (currentHeading === null) {
      currentHeading = heading;
      legStart = cur;
      legDistance = 1;
      legRubble = isRubble ? 1 : 0;
    } else if (currentHeading === heading) {
      legDistance += 1;
      if (isRubble) legRubble += 1;
    } else {
      // Heading changed: push completed leg and begin next
      legs.push({
        heading: currentHeading,
        fromCell: legStart,
        toCell: cur,
        distanceCells: legDistance,
        rubbleCells: legRubble,
      });

      currentHeading = heading;
      legStart = cur;
      legDistance = 1;
      legRubble = isRubble ? 1 : 0;
    }
  }

  // Push final leg
  if (currentHeading !== null) {
    legs.push({
      heading: currentHeading,
      fromCell: legStart,
      toCell: waypoints[waypoints.length - 1],
      distanceCells: legDistance,
      rubbleCells: legRubble,
    });
  }

  // 2. Format into human-readable steps with turn descriptions
  const steps: TurnByTurnStep[] = [];

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const meters = leg.distanceCells; // 1 cell = 1 meter nominal USAR standard
    let action: TurnByTurnStep['action'] = 'advance';
    let instruction = '';

    if (i === 0) {
      action = 'start';
      instruction = `Depart Entry Point at (${leg.fromCell.x}, ${leg.fromCell.y}): proceed ${leg.heading} along passage for ${meters}m (${meters} cells).`;
    } else {
      const prevHeading = legs[i - 1].heading;
      const turn = getTurnAction(prevHeading, leg.heading);
      action = turn;

      if (turn === 'turn-left') {
        instruction = `Turn Left to face ${leg.heading} and proceed ${meters}m along passage.`;
      } else if (turn === 'turn-right') {
        instruction = `Turn Right to face ${leg.heading} and proceed ${meters}m along passage.`;
      } else {
        instruction = `Continue straight ${leg.heading} for ${meters}m.`;
      }
    }

    const hazardAlert =
      leg.rubbleCells > 0
        ? `Caution: Rubble & debris field present along this section (${leg.rubbleCells}m). Watch footing and maintain structural clearance.`
        : undefined;

    steps.push({
      stepIndex: i + 1,
      action,
      heading: leg.heading,
      distanceCells: leg.distanceCells,
      distanceMeters: meters,
      instruction,
      fromCell: leg.fromCell,
      toCell: leg.toCell,
      hazardAlert,
    });
  }

  // 3. Append final arrival confirmation step
  steps.push({
    stepIndex: steps.length + 1,
    action: 'arrive',
    heading: legs[legs.length - 1].heading,
    distanceCells: 0,
    distanceMeters: 0,
    instruction: `Arrive at casualty ${survivorLabel ?? route.survivorId} at grid coordinate (${route.targetCell.x}, ${route.targetCell.y}). Total egress path: ${route.length}m (~${route.estimatedTravelTimeSeconds}s).`,
    fromCell: route.targetCell,
    toCell: route.targetCell,
  });

  return steps;
}

/**
 * Generates an SVG representation cropped exclusively to the bounding box of a specific safe route.
 * Shows the surrounding walls, doorways, rubble, path line, entry beacon, and casualty marker.
 */
export function generateCroppedRouteMapSvg(
  route: SafeRoute,
  mergedGrid: MergedGrid,
  survivor: SurvivorRecord,
  padding = 2,
): string {
  const bbox = computeRouteBoundingBox(route, mergedGrid.width, mergedGrid.height, padding);
  const cellSize = 20; // Larger cell size for crisp tactical zoom
  const cropX = bbox.minX * cellSize;
  const cropY = bbox.minY * cellSize;
  const cropW = bbox.width * cellSize;
  const cropH = bbox.height * cellSize;

  // Render cells within bounding box only
  let rects = '';
  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      const cell = mergedGrid.get(x, y);
      let fill = '#110f0e'; // UNKNOWN
      if (cell.raw === FREE) fill = '#e8dfd1'; // Clean floor
      else if (cell.raw === RUBBLE) fill = '#b0783f'; // Rubble
      else if (cell.raw === WALL) fill = '#22201d'; // Structural barrier

      rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="#1e1c1a" stroke-width="0.3" />`;
    }
  }

  // Route path polyline
  let pathSvg = '';
  if (route.reachable && route.waypoints.length >= 2) {
    const pointsStr = route.waypoints
      .map((p) => `${p.x * cellSize + cellSize / 2},${p.y * cellSize + cellSize / 2}`)
      .join(' ');

    pathSvg += `
      <polyline points="${pointsStr}" fill="none" stroke="#34d399" stroke-width="6" stroke-opacity="0.65" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${pointsStr}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    `;

    for (const wp of route.waypoints) {
      pathSvg += `<circle cx="${wp.x * cellSize + cellSize / 2}" cy="${wp.y * cellSize + cellSize / 2}" r="2" fill="#10b981" />`;
    }
  }

  // Entry beacon
  const ex = route.entryPoint.x * cellSize + cellSize / 2;
  const ey = route.entryPoint.y * cellSize + cellSize / 2;
  const entrySvg = `
    <g class="crop-entry">
      <circle cx="${ex}" cy="${ey}" r="9" fill="#2563eb" fill-opacity="0.3" />
      <circle cx="${ex}" cy="${ey}" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" />
      <text x="${ex}" y="${ey - 9}" text-anchor="middle" font-size="9" font-family="sans-serif" font-weight="bold" fill="#2563eb">ENTRY</text>
    </g>
  `;

  // Survivor casualty marker
  const sx = survivor.estimatedCell.x * cellSize + cellSize / 2;
  const sy = survivor.estimatedCell.y * cellSize + cellSize / 2;
  const isConf = survivor.status === 'CONFIRMED';
  const color = isConf ? '#16a34a' : '#d97706';
  const survivorSvg = `
    <g class="crop-survivor">
      <circle cx="${sx}" cy="${sy}" r="14" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3,2" />
      <circle cx="${sx}" cy="${sy}" r="10" fill="${color}" fill-opacity="0.35" />
      <circle cx="${sx}" cy="${sy}" r="6" fill="${color}" stroke="#ffffff" stroke-width="1.8" />
      <line x1="${sx - 7}" y1="${sy}" x2="${sx + 7}" y2="${sy}" stroke="${color}" stroke-width="1" />
      <line x1="${sx}" y1="${sy - 7}" x2="${sx}" y2="${sy + 7}" stroke="${color}" stroke-width="1" />
      <text x="${sx}" y="${sy + 16}" text-anchor="middle" font-size="9" font-family="sans-serif" font-weight="bold" fill="#38bdf8">${survivor.id}</text>
    </g>
  `;

  // Compass rose indicator (Top-right corner of cropped box)
  const compassX = cropX + cropW - 24;
  const compassY = cropY + 24;
  const compassSvg = `
    <g class="crop-compass" opacity="0.85">
      <circle cx="${compassX}" cy="${compassY}" r="14" fill="#1e1c1a" stroke="#d4c5b9" stroke-width="1" />
      <polygon points="${compassX},${compassY - 11} ${compassX - 4},${compassY + 4} ${compassX},${compassY + 1} ${compassX + 4},${compassY + 4}" fill="#ef4444" />
      <polygon points="${compassX},${compassY + 11} ${compassX - 4},${compassY + 4} ${compassX},${compassY + 1} ${compassX + 4},${compassY + 4}" fill="#94a3b8" />
      <text x="${compassX}" y="${compassY - 13}" text-anchor="middle" font-size="8" font-family="sans-serif" font-weight="bold" fill="#ef4444">N</text>
    </g>
  `;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${cropX} ${cropY} ${cropW} ${cropH}" class="cropped-route-svg" style="width: 100%; height: auto; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; background: #110f0e;">
      ${rects}
      ${pathSvg}
      ${entrySvg}
      ${survivorSvg}
      ${compassSvg}
    </svg>
  `;
}
