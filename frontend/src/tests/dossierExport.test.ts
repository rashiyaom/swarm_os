import { describe, expect, it } from 'vitest';
import { defaultOptions, SimulationEngine } from '../simulation/core/SimulationEngine';
import { buildDossier } from '../dossier/buildDossier';
import { mergeBeliefs } from '../dossier/mergeBeliefs';
import { generateSituationMapSvg, generateStandaloneHtml } from '../dossier/exportHtml';

describe('Rescue Dossier Exports & Report Generation (Part 2)', () => {
  it('generates valid, self-contained SVG situation map with correct viewBox and elements', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 12 }));
    for (let i = 0; i < 5; i++) engine.tick();

    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const dossier = buildDossier(engine);

    const svg = generateSituationMapSvg(dossier, merged);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain(`viewBox="0 0 ${merged.width * 16} ${merged.height * 16}"`);
    expect(svg).toContain('<rect');
    expect(svg).toContain('ENTRY');
  });

  it('generates a 100% self-contained standalone HTML report with no external network URLs', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 33 }));
    for (let i = 0; i < 6; i++) engine.tick();

    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const dossier = buildDossier(engine);

    const html = generateStandaloneHtml(dossier, merged);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');

    // Strict Offline Requirement: Must not contain external http:// or https:// script or stylesheet links
    expect(html).not.toMatch(/src=["']https?:\/\//i);
    expect(html).not.toMatch(/href=["']https?:\/\//i);

    // Embedded print stylesheet
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-inside');

    // Embedded Situation Map
    expect(html).toContain('<svg');
    expect(html).toContain('</svg>');

    // Mission Metadata & Limitations
    expect(html).toContain(dossier.meta.missionId);
    expect(html).toContain(`Mission Seed: <strong>${dossier.meta.seed}</strong>`);
    expect(html).toContain('Beliefs are pooled from all robots including depleted ones.');
  });

  it('accurately displays "Collision audit: not tracked in this session" when collisions is "not tracked"', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 44 }));
    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const dossier = buildDossier(engine);

    // Force 'not tracked' state
    dossier.audit.collisions = 'not tracked';

    const html = generateStandaloneHtml(dossier, merged);
    expect(html).toContain('Collision audit: not tracked in this session');
    expect(html).toContain('#777777'); // Neutral gray styling
  });

  it('displays numeric collision count when collisions are tracked', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 44 }));
    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const dossier = buildDossier(engine);

    dossier.audit.collisions = 3;

    const html = generateStandaloneHtml(dossier, merged);
    expect(html).toContain('Post-shield collision events: 3');
    expect(html).not.toContain('Collision audit: not tracked in this session');
  });

  it('re-anchors entry point and recalculates routes when a custom entry point is specified', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 55 }));
    // Step forward so robots explore terrain
    for (let i = 0; i < 15; i++) engine.tick();

    // Default entry
    const defaultDossier = buildDossier(engine);
    const defaultEntry = defaultDossier.routes[0]?.entryPoint ?? engine.scenario.spawnCenter;

    // Pick a verified known-free cell from the merged belief
    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const freeIdx = merged.cells.findIndex((c) => c.kind === 'free');
    expect(freeIdx).toBeGreaterThanOrEqual(0);
    const customEntry = { x: freeIdx % merged.width, y: Math.floor(freeIdx / merged.width) };

    const customDossier = buildDossier(engine, { entryPoint: customEntry });
    const actualEntry = customDossier.routes[0]?.entryPoint;

    expect(actualEntry).toBeDefined();
    expect(actualEntry).toEqual(customEntry);
    expect(actualEntry).not.toEqual(defaultEntry);
  });

  it('embeds tactical per-survivor extraction cards with page breaks suitable for printing in HTML export', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 66 }));
    for (let i = 0; i < 8; i++) engine.tick();

    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const dossier = buildDossier(engine);

    // Mock two casualties: one reachable with safe route, one blocked
    dossier.survivors = [
      {
        id: 'survivor-1',
        label: 'Victim A',
        status: 'CONFIRMED',
        estimatedCell: { x: 5, y: 5 },
        confidence: 0.95,
        evidence: { thermal: 0.88, acoustic: 0.72 },
        confirmedBy: 'rover-1',
        confirmedAtTick: 20,
      },
      {
        id: 'suspected-2',
        label: 'Acoustic Cue B',
        status: 'SUSPECTED',
        estimatedCell: { x: 18, y: 12 },
        confidence: 0.55,
        evidence: { thermal: 0.12, acoustic: 0.65 },
        detectedBy: 'drone-1',
      },
    ];

    dossier.routes = [
      {
        survivorId: 'survivor-1',
        targetCell: { x: 5, y: 5 },
        entryPoint: { x: 0, y: 0 },
        fallbackEntryPointUsed: false,
        reachable: true,
        length: 10,
        estimatedTravelTimeSeconds: 12.5,
        riskScore: 22,
        hazardsPassed: ['Rubble corridor'],
        waypoints: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 5, y: 5 }],
      },
      {
        survivorId: 'suspected-2',
        targetCell: { x: 18, y: 12 },
        entryPoint: { x: 0, y: 0 },
        fallbackEntryPointUsed: false,
        reachable: false,
        reason: 'Impassable collapsed wall prevents access',
        length: 0,
        estimatedTravelTimeSeconds: 0,
        riskScore: 100,
        hazardsPassed: [],
        waypoints: [],
      },
    ];

    const html = generateStandaloneHtml(dossier, merged);

    // Verifies per-survivor cards exist
    expect(html).toContain('class="survivor-card"');
    expect(html).toContain('Field Extraction Action Cards (Per-Survivor Dossier)');

    // Reachable survivor fields
    expect(html).toContain('survivor-1');
    expect(html).toContain('(5, 5)');
    expect(html).toContain('95%');
    expect(html).toContain('Route Length: <strong>10 cells</strong>');
    expect(html).toContain('Risk Score: <strong>22 / 100</strong>');
    expect(html).toContain('Hazards Passed: <strong>Rubble corridor</strong>');
    expect(html).toContain('Estimated Travel Time: <strong>~12.5s</strong>');

    // Blocked survivor fields
    expect(html).toContain('suspected-2');
    expect(html).toContain('(18, 12)');
    expect(html).toContain('NO SAFE ROUTE KNOWN');
    expect(html).toContain('Impassable collapsed wall prevents access');

    // Page-break rules suitable for printing
    expect(html).toContain('page-break-inside: avoid');
    expect(html).toContain('break-inside: avoid');

    // Tactical Cropped Route Sub-Map
    expect(html).toContain('class="cropped-route-svg"');
    expect(html).toContain('Tactical Route Corridor Map (Ingress Sub-Grid)');

    // Human Turn-by-Turn Navigation
    expect(html).toContain('Turn-by-Turn Field Rescue Navigation');
    expect(html).toContain('Depart Entry Point at (0, 0)');
    expect(html).toContain('Arrive at casualty');
  });

  it('filters and highlights only the selected survivor route when selectedSurvivorId is provided', () => {
    const engine = new SimulationEngine(defaultOptions({ seed: 77 }));
    const merged = mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
    const dossier = buildDossier(engine);

    dossier.survivors = [
      {
        id: 'victim-1',
        label: 'Victim 1',
        status: 'CONFIRMED',
        estimatedCell: { x: 4, y: 4 },
        confidence: 0.9,
        evidence: { thermal: 0.8, acoustic: 0.5 },
      },
      {
        id: 'victim-2',
        label: 'Victim 2',
        status: 'CONFIRMED',
        estimatedCell: { x: 10, y: 10 },
        confidence: 0.9,
        evidence: { thermal: 0.8, acoustic: 0.5 },
      },
    ];

    dossier.routes = [
      {
        survivorId: 'victim-1',
        targetCell: { x: 4, y: 4 },
        entryPoint: { x: 0, y: 0 },
        fallbackEntryPointUsed: false,
        reachable: true,
        length: 5,
        estimatedTravelTimeSeconds: 6,
        riskScore: 10,
        hazardsPassed: [],
        waypoints: [{ x: 0, y: 0 }, { x: 4, y: 4 }],
      },
      {
        survivorId: 'victim-2',
        targetCell: { x: 10, y: 10 },
        entryPoint: { x: 0, y: 0 },
        fallbackEntryPointUsed: false,
        reachable: true,
        length: 14,
        estimatedTravelTimeSeconds: 18,
        riskScore: 35,
        hazardsPassed: ['Rubble'],
        waypoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      },
    ];

    // Filter to victim-1
    const svgFiltered = generateSituationMapSvg(dossier, merged, 'victim-1');

    // victim-1's route should have highlighted stroke width and color
    expect(svgFiltered).toContain('stroke="#10b981" stroke-width="3.5"');
    // victim-2's route should be dimmed
    expect(svgFiltered).toContain('stroke-opacity="0.18"');
    expect(svgFiltered).toContain('stroke-dasharray="2,3"');
    // victim-1 marker should have selection ring
    expect(svgFiltered).toContain('stroke="#38bdf8" stroke-width="2" stroke-dasharray="3,2"');
  });

  it('correctly calculates route bounding box and human turn-by-turn directions with hazard notices', async () => {
    const { computeRouteBoundingBox, generateTurnByTurnDirections } = await import('../dossier/navigation');
    const { RUBBLE } = await import('../simulation/world/GridMap');

    const route = {
      survivorId: 'survivor-x',
      targetCell: { x: 12, y: 5 },
      entryPoint: { x: 2, y: 5 },
      fallbackEntryPointUsed: false,
      reachable: true,
      length: 10,
      estimatedTravelTimeSeconds: 12,
      riskScore: 15,
      hazardsPassed: ['Rubble'],
      // Moves East from (2,5) to (8,5), then turns South to (8,8), then East to (12,8)
      waypoints: [
        { x: 2, y: 5 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 6 },
        { x: 8, y: 7 },
        { x: 8, y: 8 },
        { x: 9, y: 8 },
        { x: 10, y: 8 },
        { x: 11, y: 8 },
        { x: 12, y: 8 },
      ],
    };

    const bbox = computeRouteBoundingBox(route, 32, 32, 2);
    expect(bbox.minX).toBe(0); // 2 - 2 = 0
    expect(bbox.maxX).toBe(14); // 12 + 2 = 14
    expect(bbox.minY).toBe(3); // 5 - 2 = 3
    expect(bbox.maxY).toBe(10); // 8 + 2 = 10
    expect(bbox.width).toBe(15);
    expect(bbox.height).toBe(8);

    // Mock grid where cell (4, 5) has rubble
    const mockGrid = {
      width: 32,
      height: 32,
      cells: [],
      inBounds: () => true,
      isKnownFree: () => true,
      isTraversable: () => true,
      get: (x: number, y: number) => ({
        kind: x === 4 && y === 5 ? 'rubble' as const : 'free' as const,
        raw: x === 4 && y === 5 ? RUBBLE : 0,
        confidence: 1,
        observers: 2,
      }),
    };

    const steps = generateTurnByTurnDirections(route, mockGrid);
    expect(steps.length).toBeGreaterThan(2);

    // Step 1: Start moving East
    expect(steps[0].action).toBe('start');
    expect(steps[0].heading).toBe('East');
    expect(steps[0].instruction).toContain('Depart Entry Point');
    expect(steps[0].hazardAlert).toContain('Rubble & debris field');

    // Step 2: Turn Right heading South
    expect(steps[1].action).toBe('turn-right');
    expect(steps[1].heading).toBe('South');
    expect(steps[1].instruction).toContain('Turn Right to face South');

    // Step 3: Turn Left heading East
    expect(steps[2].action).toBe('turn-left');
    expect(steps[2].heading).toBe('East');
    expect(steps[2].instruction).toContain('Turn Left to face East');

    // Final arrival step
    const lastStep = steps[steps.length - 1];
    expect(lastStep.action).toBe('arrive');
    expect(lastStep.instruction).toContain('Arrive at casualty');
  });
});
