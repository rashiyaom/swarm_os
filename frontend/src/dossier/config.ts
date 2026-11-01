/**
 * Tunable parameters for Dossier generation, belief merging, hazard assessment,
 * and safe route computation for human search-and-rescue teams.
 *
 * All values are centralized here with explicit rationales for field safety.
 */
export const DOSSIER_CONFIG = {
  /** Base traversal cost for a clean, known-free cell (1.0 = nominal 1-cell orthogonal step). */
  baseCellCost: 1.0,

  /**
   * Additional cost penalty added when traversing rubble cells.
   * Rationale: Rubble is unstable, physically exhausting, and slows human rescuers significantly.
   * A heavy penalty ensures A* strongly prefers detour paths on solid floor when available,
   * but will still traverse rubble if it is the only way to reach a trapped survivor.
   */
  rubbleCostMultiplier: 8.0,

  /**
   * Cost penalty for cells directly adjacent (orthogonally or diagonally) to known walls.
   * Rationale: In post-collapse/earthquake structures, walls, columns, and doorways carry
   * high risk of loose masonry, aftershock spalling, and compromised load-bearing elements.
   * Rescuers prefer center-of-corridor clearance.
   */
  wallClearancePenalty: 2.5,

  /**
   * Cost penalty for cells directly adjacent to rubble piles.
   * Rationale: Rubble edges are prone to secondary sliding or shifting under human footfalls.
   */
  rubbleClearancePenalty: 1.5,

  /**
   * Cost penalty for cells adjacent to unmapped / unknown frontier voids.
   * Rationale: Exploring along the perimeter of unknown terrain risks blind corners,
   * unmapped drop-offs, floor voids, and unexpected structural collapse zones.
   */
  frontierProximityPenalty: 3.0,

  /**
   * Cost penalty applied when cell classification confidence is low (< 0.5).
   * Rationale: If only a single robot caught a fleeting glance of a cell,
   * prefer paths confirmed by multiple corroborated robot observations.
   */
  lowConfidencePenalty: 1.0,

  /**
   * Extra cost added per unit of hazard severity if a cell falls inside a designated HazardZone.
   * Rationale: Human teams must detour around active hazard zones unless no alternative exists.
   */
  hazardZoneCostMultiplier: 10.0,

  /**
   * Average human rescuer transit speed in cells per second over clean indoor terrain.
   * At 1m/cell grid resolution, 1.2 cells/s ≈ 4.3 km/h brisk search walk.
   */
  humanWalkSpeedCellsPerSec: 1.2,

  /**
   * Minimum thermal signal intensity required on a robot to generate a SUSPECTED survivor entry.
   * Matches the decentralized controller's peer-evidence threshold.
   */
  suspectedThermalThreshold: 0.3,

  /**
   * Minimum acoustic signal intensity required on a robot to generate a SUSPECTED survivor entry.
   */
  suspectedAcousticThreshold: 0.25,

  /**
   * Risk score weights (normalized into 0-100 index).
   */
  riskScoreWeights: {
    lengthFactor: 0.2, // Longer paths have slightly higher cumulative exposure
    rubbleWeight: 12.0, // Heavy risk per rubble cell traversed
    clearanceWeight: 2.0, // Risk per cell adjacent to walls/rubble
    frontierWeight: 3.5, // Risk per cell exposed to unknown void
    hazardZoneWeight: 15.0, // High risk for entering hazard zones
  },

  /**
   * Allow diagonal movement in A* route planning.
   * Note: Corner-cutting past wall/unknown cells is strictly forbidden when true.
   */
  allowDiagonalMovement: true,

  /**
   * Diagonal step distance factor (sqrt(2) ≈ 1.414).
   */
  diagonalDistanceFactor: Math.SQRT2,
} as const;

export type DossierConfig = typeof DOSSIER_CONFIG;
