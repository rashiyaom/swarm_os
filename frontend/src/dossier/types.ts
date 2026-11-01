import type { Point, RobotType } from '../simulation/core/types';

export type MergedCellKind = 'unknown' | 'free' | 'wall' | 'rubble';

export interface MergedCell {
  kind: MergedCellKind;
  raw: number; // UNKNOWN = -1, FREE = 0, WALL = 1, RUBBLE = 2
  confidence: number; // 0..1 (fraction of observing robots agreeing on chosen classification)
  observers: number; // Number of robots whose belief mapped this cell
  /**
   * Optional future hook for per-cell timestamps if temporal map tagging is added.
   * Unused currently because GridMap does not store per-cell tick history.
   */
  lastUpdatedTick?: number;
}

export interface MergedGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: MergedCell[];
  get(x: number, y: number): MergedCell;
  inBounds(x: number, y: number): boolean;
  isKnownFree(x: number, y: number): boolean;
  isTraversable(x: number, y: number, allowRubble?: boolean): boolean;
}

export interface HazardZone {
  id: string;
  center: Point;
  radius: number;
  severity: 'low' | 'medium' | 'high';
  kind?: string; // e.g. "aftershock_fissure", "unstable_overhang", "gas_leak"
}

export type TriageCategory = 'red' | 'yellow' | 'green' | 'black';

export interface SurvivorRecord {
  id: string | number;
  estimatedCell: Point;
  status: 'CONFIRMED' | 'SUSPECTED';
  label: string; // e.g. "confirmed on site", "suspected survivor (thermal/acoustic cue)"
  confidence: number; // 0..1
  evidence: {
    thermal: number;
    acoustic: number;
  };
  confirmedBy?: string; // Robot id/name if confirmed
  confirmedAtTick?: number; // Simulation tick when confirmed
  detectedBy?: string; // Robot id/name if suspected
  triage?: TriageCategory; // Optional FEMA triage tag
  vitals?: Record<string, unknown>; // Optional future biometric telemetry
  routeSummary?: {
    reachable: boolean;
    routeLength?: number;
    riskScore?: number;
    estimatedTravelTimeSeconds?: number;
    reason?: string;
  };
}

export interface SafeRoute {
  survivorId: string | number;
  targetCell: Point;
  entryPoint: Point;
  fallbackEntryPointUsed: boolean;
  reachable: boolean;
  reason?: string;
  waypoints: Point[]; // Ordered sequence of cells from entry to target
  length: number; // Distance in grid cells
  riskScore: number; // 0 (safest) to 100 (extreme hazard)
  hazardsPassed: string[]; // e.g. ["Rubble (3 cells)", "HazardZone: fissure-1"]
  estimatedTravelTimeSeconds: number;
}

export interface RouteBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export type CompassHeading = 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Northwest' | 'Southeast' | 'Southwest';

export interface TurnByTurnStep {
  stepIndex: number;
  action: 'start' | 'advance' | 'turn-left' | 'turn-right' | 'arrive';
  heading: CompassHeading;
  distanceCells: number; // 1 cell = 1 meter
  distanceMeters: number;
  instruction: string;
  fromCell: Point;
  toCell: Point;
  hazardAlert?: string;
}

export interface VisitingOrderStep {
  step: number;
  survivorId: string | number;
  targetCell: Point;
  segmentLength: number;
  segmentTravelTimeSeconds: number;
  cumulativeTravelTimeSeconds: number;
}

export interface DossierRobotSummary {
  id: string;
  label: string;
  type: RobotType;
  battery: number;
  maxBattery: number;
  batteryFraction: number;
  alive: boolean;
  status: 'active' | 'depleted' | 'manual';
  cellsExplored: number;
  odomPosition: Point; // Belief-based odometry only (no ground-truth position leakage)
  odomUncertainty: number;
}

export interface DossierCoverage {
  totalCells: number;
  exploredCells: number;
  freeCells: number;
  wallCells: number;
  rubbleCells: number;
  unknownCells: number;
  exploredPercent: number;
  unexploredPercent: number;
  knownFreePercent: number;
  knownBlockedPercent: number; // Walls + rubble
  unknownPercent: number;
}

export interface DossierNetworkSummary {
  averageLinkHealth: 'healthy' | 'weak' | 'down' | 'no-links';
  healthyLinks: number;
  weakLinks: number;
  downLinks: number;
  totalLinks: number;
  partitionsObserved: string[];
  configuredPacketLoss: number;
  measuredPacketLoss: number | null;
}

export interface DossierMeta {
  missionId: string;
  seed: number;
  generatedAtTick: number; // Deterministic simulation tick counter (no Date.now())
  missionDurationSeconds: number;
  swarmComposition: {
    rovers: number;
    drones: number;
    total: number;
  };
  robotsAlive: number;
  robotsLost: number;
  dataSources: {
    contributing: number; // Robots with >0 explored or mapped cells
    total: number;
    depleted: number;
  };
}

export interface DossierAudit {
  collisions: number | 'not tracked';
  limitations: string[];
}

export interface Dossier {
  meta: DossierMeta;
  coverage: DossierCoverage;
  survivors: SurvivorRecord[];
  routes: SafeRoute[];
  visitingOrder: VisitingOrderStep[];
  robots: DossierRobotSummary[];
  network: DossierNetworkSummary;
  hazards: HazardZone[];
  audit: DossierAudit;
}
