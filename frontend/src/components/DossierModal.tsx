import { useEffect, useMemo, useRef, useState } from 'react';
import { useSim } from '../store/simStore';
import { buildDossier } from '../dossier/buildDossier';
import { mergeBeliefs } from '../dossier/mergeBeliefs';
import { downloadDossierHtml, downloadDossierJson, printDossier } from '../dossier/exportHtml';
import {
  computeRouteBoundingBox,
  generateCroppedRouteMapSvg,
  generateTurnByTurnDirections,
} from '../dossier/navigation';
import type { Point } from '../simulation/core/types';
import { FREE, RUBBLE, WALL } from '../simulation/world/GridMap';
import { Icon } from './Icon';
import { Brand } from './Brand';

/**
 * Full-Screen Incident Action Plan & Rescue Dossier Modal.
 *
 * Designed as a simulation field report for Urban Search & Rescue teams.
 * Allows interactive entry point repositioning, live A* route recomputation, and instant
 * single-click offline HTML, JSON, or PDF export.
 */
export function DossierModal() {
  const dialog = useRef<HTMLDivElement>(null);
  const engine = useSim((s) => s.engine);
  const version = useSim((s) => s.version);
  const closeDossier = useSim((s) => s.closeDossier);

  const [customEntryPoint, setCustomEntryPoint] = useState<Point | null>(null);
  const [selectedSurvivorId, setSelectedSurvivorId] = useState<string | number | null>(null);
  const [focusRoute, setFocusRoute] = useState<boolean>(true);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-focus corridor when a survivor is selected
  useEffect(() => {
    if (selectedSurvivorId !== null) {
      setFocusRoute(true);
    }
  }, [selectedSurvivorId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]') ?? []).filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') closeDossier();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDossier]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Derive merged belief and dossier
  const mergedGrid = useMemo(() => {
    return mergeBeliefs(engine.robots, engine.scenario.width, engine.scenario.height);
  }, [engine, version]);

  const dossier = useMemo(() => {
    return buildDossier(engine, { entryPoint: customEntryPoint ?? undefined });
  }, [engine, version, customEntryPoint]);

  const selectedSurvivor = useMemo(() => {
    if (selectedSurvivorId === null) return null;
    return dossier.survivors.find((s) => s.id === selectedSurvivorId) ?? null;
  }, [dossier.survivors, selectedSurvivorId]);

  const selectedRoute = useMemo(() => {
    if (selectedSurvivorId === null) return null;
    return dossier.routes.find((r) => r.survivorId === selectedSurvivorId) ?? null;
  }, [dossier.routes, selectedSurvivorId]);

  // Route bounding box for focused corridor view
  const routeBbox = useMemo(() => {
    if (!selectedRoute || !selectedRoute.reachable || selectedRoute.waypoints.length < 2) {
      return null;
    }
    return computeRouteBoundingBox(selectedRoute, mergedGrid.width, mergedGrid.height, 2);
  }, [selectedRoute, mergedGrid.width, mergedGrid.height]);

  const isCorridorFocused = Boolean(selectedSurvivorId && focusRoute && routeBbox);

  const turnSteps = useMemo(() => {
    if (!selectedRoute || !selectedRoute.reachable || selectedRoute.waypoints.length < 2) return [];
    return generateTurnByTurnDirections(selectedRoute, mergedGrid, selectedSurvivor?.label);
  }, [selectedRoute, mergedGrid, selectedSurvivor]);

  // SVG dimensions
  const cellSize = 16;
  const svgWidth = mergedGrid.width * cellSize;
  const svgHeight = mergedGrid.height * cellSize;

  const currentEntry = dossier.routes[0]?.entryPoint ?? engine.scenario.spawnCenter;

  const handleCellClick = (x: number, y: number) => {
    if (!mergedGrid.inBounds(x, y)) return;
    const cell = mergedGrid.get(x, y);

    if (cell.kind === 'free') {
      setCustomEntryPoint({ x, y });
      setToast(`Entry point relocated to (${x}, ${y}). Safe ingress routes updated.`);
    } else {
      setToast(
        `Cannot place entry point at (${x}, ${y}): tile is classified as ${cell.kind}. Rescuers require a known-free explored path.`,
      );
    }
  };

  return (
    <div ref={dialog} className="dossier-overlay" role="dialog" aria-modal="true" aria-labelledby="dossier-heading">
      <div className="dossier-backdrop" onClick={closeDossier} />

      <div className="dossier-modal">
        {/* Modal Header & Actions Bar */}
        <div className="dossier-header no-print">
          <div>
            <Brand />
            <div className="dossier-eyebrow">
              <span className="tiny-square" />
              SWARM SEARCH & RESCUE <span>/</span> RESCUE DOSSIER
            </div>
            <h1 id="dossier-heading">{dossier.meta.missionId}</h1>
            <p className="dossier-subtitle">
              Mission Seed: <strong>{dossier.meta.seed}</strong> · Tick: <strong>{dossier.meta.generatedAtTick}</strong> ({dossier.meta.missionDurationSeconds}s elapsed) ·{' '}
              {dossier.meta.dataSources.contributing} / {dossier.meta.dataSources.total} swarm robots contributing
            </p>
          </div>

          <div className="dossier-actions">
            <button className="btn action-btn print-btn" onClick={printDossier} title="Print or Save as PDF via browser print dialog">
              <Icon name="overview" size={16} />
              <span>Print / PDF</span>
            </button>
            <button className="btn action-btn html-btn" onClick={() => downloadDossierHtml(dossier, mergedGrid)} title="Download standalone offline single HTML report">
              <Icon name="map" size={16} />
              <span>Download HTML</span>
            </button>
            <button className="btn action-btn json-btn" onClick={() => downloadDossierJson(dossier)} title="Download raw structured JSON">
              <Icon name="check" size={16} />
              <span>Export JSON</span>
            </button>
            <button className="btn close-btn" onClick={closeDossier} aria-label="Close dossier modal" title="Close (Esc)">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Printable Paper Header */}
        <div className="print-only-header">
          <h2>SWARM SEARCH & RESCUE · RESCUE DOSSIER</h2>
          <h3>{dossier.meta.missionId} (Mission Seed {dossier.meta.seed})</h3>
          <p>Generated at simulation tick {dossier.meta.generatedAtTick} ({dossier.meta.missionDurationSeconds}s elapsed) · Swarm SAR</p>
        </div>

        {/* Toast alert */}
        {toast && (
          <div className="dossier-toast" role="status">
            <span>{toast}</span>
            <button onClick={() => setToast(null)}><Icon name="close" size={12} /></button>
          </div>
        )}

        <div className="dossier-body">
          {/* Executive Stat Cards */}
          <div className="dossier-stats-grid">
            <div className="dossier-card">
              <span className="card-label">Casualties Located</span>
              <div className="card-val">
                {dossier.survivors.filter((s) => s.status === 'CONFIRMED').length} <small>confirmed</small>
                {dossier.survivors.some((s) => s.status === 'SUSPECTED') && (
                  <span className="suspected-pill">
                    +{dossier.survivors.filter((s) => s.status === 'SUSPECTED').length} suspected
                  </span>
                )}
              </div>
              <span className="card-sub">Derived solely from confirmed hits & noisy sensor cues</span>
            </div>

            <div className="dossier-card">
              <span className="card-label">Safe Ingress Routes</span>
              <div className="card-val">
                {dossier.routes.filter((r) => r.reachable).length} <small>safe</small>
                {dossier.routes.some((r) => !r.reachable) && (
                  <span className="blocked-pill">
                    {dossier.routes.filter((r) => !r.reachable).length} blocked
                  </span>
                )}
              </div>
              <span className="card-sub">A* clearance routes through explored free cells</span>
            </div>

            <div className="dossier-card">
              <span className="card-label">Area Explored</span>
              <div className="card-val">{dossier.coverage.exploredPercent}%</div>
              <span className="card-sub">
                {dossier.coverage.exploredCells} / {dossier.coverage.totalCells} cells ({dossier.coverage.knownBlockedPercent}% obstacles)
              </span>
            </div>

            <div className="dossier-card">
              <span className="card-label">Swarm Fleet Readiness</span>
              <div className="card-val">
                {dossier.meta.robotsAlive} <small>/ {dossier.meta.swarmComposition.total} active</small>
              </div>
              <span className="card-sub">
                {dossier.meta.swarmComposition.rovers} rovers, {dossier.meta.swarmComposition.drones} drones · Mesh: {dossier.network.averageLinkHealth}
              </span>
            </div>
          </div>

          {/* Interactive Situation Map */}
          <div className="dossier-section map-section">
            <div className="section-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="section-title">
                  <Icon name="map" size={18} /> Tactical Situation Map (Merged Swarm Belief)
                </h2>
                {isCorridorFocused && routeBbox && (
                  <span className="corridor-zoom-pill no-print">
                    ROUTE CORRIDOR ({routeBbox.width}×{routeBbox.height}m)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedSurvivorId && routeBbox && (
                  <button
                    className={`btn focus-toggle-btn no-print ${focusRoute ? 'active' : ''}`}
                    onClick={() => setFocusRoute((f) => !f)}
                    title="Toggle between zoomed route corridor and full facility overview"
                  >
                    <Icon name={focusRoute ? 'overview' : 'focus'} size={14} />
                    <span>{focusRoute ? 'Show Full Building' : 'Focus Route Corridor'}</span>
                  </button>
                )}
                {customEntryPoint && (
                  <button className="btn reset-entry-btn no-print" onClick={() => { setCustomEntryPoint(null); setToast('Reset entry point to default staging square.'); }}>
                    <Icon name="reset" size={14} /> Reset Entry Point
                  </button>
                )}
              </div>
            </div>
            <p className="section-hint no-print">
              Click any <strong>known-free tile</strong> on the map below to re-anchor the deployment entry point. Safe routes and visiting order will recompute in real-time.
            </p>

            <div className="situation-map-wrapper">
              <svg
                viewBox={
                  isCorridorFocused && routeBbox
                    ? `${routeBbox.minX * cellSize} ${routeBbox.minY * cellSize} ${routeBbox.width * cellSize} ${routeBbox.height * cellSize}`
                    : `0 0 ${svgWidth} ${svgHeight}`
                }
                className="situation-svg"
              >
                {/* Cells */}
                {Array.from({ length: mergedGrid.height }).map((_, y) =>
                  Array.from({ length: mergedGrid.width }).map((__, x) => {
                    const cell = mergedGrid.get(x, y);
                    let fill = '#110f0e'; // UNKNOWN
                    if (cell.raw === FREE) fill = '#e8dfd1';
                    else if (cell.raw === RUBBLE) fill = '#b0783f';
                    else if (cell.raw === WALL) fill = '#262422';

                    return (
                      <rect
                        key={`${x},${y}`}
                        x={x * cellSize}
                        y={y * cellSize}
                        width={cellSize}
                        height={cellSize}
                        fill={fill}
                        stroke="#1a1816"
                        strokeWidth={0.2}
                        className={`map-cell cell-${cell.kind}`}
                        onClick={() => handleCellClick(x, y)}
                      />
                    );
                  }),
                )}

                {/* Safe Route Polylines */}
                {dossier.routes.map((r) => {
                  if (!r.reachable || r.waypoints.length < 2) return null;
                  const isSelected = selectedSurvivorId ? r.survivorId === selectedSurvivorId : true;
                  const hasFilter = Boolean(selectedSurvivorId);
                  const pts = r.waypoints
                    .map((p) => `${p.x * cellSize + cellSize / 2},${p.y * cellSize + cellSize / 2}`)
                    .join(' ');

                  if (isSelected) {
                    return (
                      <g key={`route-${r.survivorId}`} className="svg-route-selected">
                        <polyline
                          points={pts}
                          fill="none"
                          stroke="#34d399"
                          strokeWidth={hasFilter ? '6' : '4'}
                          strokeOpacity={hasFilter ? '0.75' : '0.4'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points={pts}
                          fill="none"
                          stroke={hasFilter ? '#10b981' : '#059669'}
                          strokeWidth={hasFilter ? '3.5' : '2.5'}
                          strokeDasharray={hasFilter ? 'none' : '4,2'}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {r.waypoints.map((wp, i) => (
                          <circle
                            key={i}
                            cx={wp.x * cellSize + cellSize / 2}
                            cy={wp.y * cellSize + cellSize / 2}
                            r={hasFilter ? '2.5' : '1.5'}
                            fill="#10b981"
                          />
                        ))}
                      </g>
                    );
                  } else {
                    return (
                      <g key={`route-${r.survivorId}`} className="svg-route-dimmed">
                        <polyline
                          points={pts}
                          fill="none"
                          stroke="#6ee7b7"
                          strokeWidth="1.2"
                          strokeOpacity="0.18"
                          strokeDasharray="2,3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  }
                })}

                {/* Entry Point Beacon */}
                <g className="svg-entry">
                  <circle cx={currentEntry.x * cellSize + cellSize / 2} cy={currentEntry.y * cellSize + cellSize / 2} r="8" fill="#2563eb" fillOpacity="0.25" />
                  <circle cx={currentEntry.x * cellSize + cellSize / 2} cy={currentEntry.y * cellSize + cellSize / 2} r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                  <text x={currentEntry.x * cellSize + cellSize / 2} y={currentEntry.y * cellSize - 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#3b82f6">
                    ENTRY {customEntryPoint ? '(CUSTOM)' : ''}
                  </text>
                </g>

                {/* Casualties */}
                {dossier.survivors.map((s) => {
                  const sx = s.estimatedCell.x * cellSize + cellSize / 2;
                  const sy = s.estimatedCell.y * cellSize + cellSize / 2;
                  const isConf = s.status === 'CONFIRMED';
                  const isSelected = selectedSurvivorId === s.id;
                  const color = isConf ? '#16a34a' : '#d97706';

                  return (
                    <g
                      key={s.id}
                      className={`svg-survivor ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSurvivorId((prev) => (prev === s.id ? null : s.id));
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {isSelected && (
                        <circle
                          cx={sx}
                          cy={sy}
                          r="15"
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2"
                          strokeDasharray="3,2"
                        />
                      )}
                      <circle cx={sx} cy={sy} r={isSelected ? '11' : '9'} fill={color} fillOpacity={isSelected ? '0.45' : '0.25'} />
                      <circle cx={sx} cy={sy} r={isSelected ? '6' : '5'} fill={color} stroke="#ffffff" strokeWidth={isSelected ? '2' : '1.5'} />
                      <line x1={sx - 7} y1={sy} x2={sx + 7} y2={sy} stroke={color} strokeWidth="1" />
                      <line x1={sx} y1={sy - 7} x2={sx} y2={sy + 7} stroke={color} strokeWidth="1" />
                      <text x={sx} y={sy + 15} textAnchor="middle" fontSize={isSelected ? '9' : '8'} fontWeight="bold" fill={isSelected ? '#38bdf8' : color}>
                        {s.id}
                      </text>
                    </g>
                  );
                })}

                {/* Robot odometry locations */}
                {dossier.robots.map((r) => {
                  const rx = r.odomPosition.x * cellSize + cellSize / 2;
                  const ry = r.odomPosition.y * cellSize + cellSize / 2;
                  const col = r.alive ? '#6366f1' : '#64748b';
                  return (
                    <g key={r.id} className="svg-robot">
                      <rect x={rx - 4} y={ry - 4} width="8" height="8" rx="2" fill={col} stroke="#ffffff" strokeWidth="1" />
                      <text x={rx} y={ry - 6} textAnchor="middle" fontSize="7" fontWeight="bold" fill={col}>
                        {r.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="map-legend">
                <span className="legend-item"><span className="legend-box" style={{ background: '#e8dfd1' }} /> Known Free Floor</span>
                <span className="legend-item"><span className="legend-box" style={{ background: '#b0783f' }} /> Rubble / Debris</span>
                <span className="legend-item"><span className="legend-box" style={{ background: '#262422' }} /> Structural Wall</span>
                <span className="legend-item"><span className="legend-box" style={{ background: '#110f0e', border: '1px solid #334155' }} /> Unknown / Unmapped Void</span>
                <span className="legend-item"><span className="legend-box" style={{ background: '#2563eb' }} /> Entry Point</span>
                <span className="legend-item"><span className="legend-box" style={{ background: '#16a34a' }} /> Confirmed Casualty</span>
                <span className="legend-item"><span className="legend-box" style={{ background: '#d97706' }} /> Suspected Cue</span>
                <span className="legend-item"><span style={{ color: '#10b981', fontWeight: 'bold' }}>-- --</span> Safe Rescue Route</span>
              </div>
            </div>
          </div>

          {/* Table 1: Casualty Assessment & Route Status */}
          <div className="dossier-section">
            <div className="section-header-row">
              <h2 className="section-title">
                <Icon name="person" size={18} /> Casualty Assessment & Safe Ingress Route Feasibility
              </h2>
              {selectedSurvivorId && (
                <button
                  className="btn reset-entry-btn no-print"
                  onClick={() => setSelectedSurvivorId(null)}
                  title="Show all routes on map"
                >
                  <Icon name="close" size={12} /> Show All Routes
                </button>
              )}
            </div>
            <p className="section-hint no-print">
              Click any row below to isolate its safe route on the situation map and display its tactical field extraction card.
            </p>
            <div className="table-responsive">
              <table className="dossier-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Est. Location</th>
                    <th>Confidence</th>
                    <th>Sensor Readings</th>
                    <th>Confirmed / Detected By</th>
                    <th>Safe Ingress Route Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.survivors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-cell">No confirmed survivors or suspected cues recorded yet.</td>
                    </tr>
                  ) : (
                    dossier.survivors.map((s) => {
                      const route = dossier.routes.find((r) => r.survivorId === s.id);
                      const isSelected = selectedSurvivorId === s.id;
                      return (
                        <tr
                          key={s.id}
                          tabIndex={0}
                          aria-label={`Inspect ${s.label} route`}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedSurvivorId(prev => prev === s.id ? null : s.id); } }}
                          onClick={() => setSelectedSurvivorId((prev) => (prev === s.id ? null : s.id))}
                          className={`survivor-table-row ${isSelected ? 'row-selected' : ''}`}
                          title={`Click to ${isSelected ? 'deselect' : 'highlight'} route and view extraction card for ${s.id}`}
                        >
                          <td>
                            <div className="survivor-id-cell">
                              {isSelected && <span className="selection-indicator">▶</span>}
                              <strong>{s.id}</strong>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge ${s.status === 'CONFIRMED' ? 'badge-confirmed' : 'badge-suspected'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td>({s.estimatedCell.x}, {s.estimatedCell.y})</td>
                          <td>{Math.round(s.confidence * 100)}%</td>
                          <td>Thermal: {s.evidence.thermal.toFixed(2)} | Acoustic: {s.evidence.acoustic.toFixed(2)}</td>
                          <td>{s.confirmedBy ?? s.detectedBy ?? 'Swarm Mesh'}</td>
                          <td>
                            {route?.reachable ? (
                              <div className="route-ok">
                                <span className="status-badge badge-success">
                                  Safe Route Found ({route.length} cells, ~{route.estimatedTravelTimeSeconds}s)
                                </span>
                                <div className="route-details">
                                  <span>Risk Score: {route.riskScore}/100</span>
                                  {route.hazardsPassed.length > 0 && <span>Hazards: {route.hazardsPassed.join(', ')}</span>}
                                </div>
                              </div>
                            ) : (
                              <div className="route-fail">
                                <span className="status-badge badge-danger">NO SAFE ROUTE KNOWN</span>
                                <span className="route-reason">{route?.reason ?? 'Impassable terrain'}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Interactive Per-Survivor Card */}
            {selectedSurvivor && (
              <div className="compact-survivor-card no-print">
                <div className="survivor-card-header">
                  <div className="card-header-left">
                    <span className="card-pill">SELECTED CASUALTY</span>
                    <strong className="card-id">{selectedSurvivor.id}</strong>
                    <span className={`status-badge ${selectedSurvivor.status === 'CONFIRMED' ? 'badge-confirmed' : 'badge-suspected'}`}>
                      {selectedSurvivor.status}
                    </span>
                    <span className="card-label-sub">{selectedSurvivor.label}</span>
                  </div>
                  <div className="card-header-right">
                    {selectedRoute?.reachable ? (
                      <span className="route-badge-safe">✓ SAFE INGRESS ROUTE FOUND</span>
                    ) : (
                      <span className="route-badge-fail">✕ NO SAFE ROUTE KNOWN</span>
                    )}
                    <button
                      className="btn-clear-selection"
                      onClick={() => setSelectedSurvivorId(null)}
                      title="Clear selection and display all safe routes"
                    >
                      <Icon name="close" size={12} /> Clear Filter
                    </button>
                  </div>
                </div>

                <div className="survivor-card-grid">
                  <div className="card-field">
                    <span className="card-field-label">Position:</span>
                    <span className="card-field-val">({selectedSurvivor.estimatedCell.x}, {selectedSurvivor.estimatedCell.y})</span>
                  </div>
                  <div className="card-field">
                    <span className="card-field-label">Status:</span>
                    <span className="card-field-val">
                      <span className={`status-badge ${selectedSurvivor.status === 'CONFIRMED' ? 'badge-confirmed' : 'badge-suspected'}`}>
                        {selectedSurvivor.status}
                      </span>
                    </span>
                  </div>
                  <div className="card-field">
                    <span className="card-field-label">Confidence:</span>
                    <span className="card-field-val">{Math.round(selectedSurvivor.confidence * 100)}%</span>
                  </div>
                  <div className="card-field">
                    <span className="card-field-label">Confirmed / Detected By:</span>
                    <span className="card-field-val">
                      {selectedSurvivor.confirmedBy ?? selectedSurvivor.detectedBy ?? 'Swarm Mesh'}
                      {selectedSurvivor.confirmedAtTick ? ` (Tick ${selectedSurvivor.confirmedAtTick})` : ''}
                    </span>
                  </div>
                </div>

                <div className={`route-summary-panel ${selectedRoute?.reachable ? 'panel-safe' : 'panel-hazard'}`}>
                  {selectedRoute?.reachable ? (
                    <div className="route-safe-details">
                      <div className="route-metric">
                        <span className="metric-label">Route Length</span>
                        <span className="metric-val">{selectedRoute.length} cells</span>
                      </div>
                      <div className="route-metric">
                        <span className="metric-label">Risk Score</span>
                        <span className="metric-val">{selectedRoute.riskScore} / 100</span>
                      </div>
                      <div className="route-metric">
                        <span className="metric-label">Hazards Passed</span>
                        <span className="metric-val">{selectedRoute.hazardsPassed.join(', ') || 'None (clear floor)'}</span>
                      </div>
                      <div className="route-metric">
                        <span className="metric-label">Estimated Travel Time</span>
                        <span className="metric-val highlight">~{selectedRoute.estimatedTravelTimeSeconds}s</span>
                      </div>
                    </div>
                  ) : (
                    <div className="route-hazard-details">
                      <div className="hazard-title">
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>NO SAFE ROUTE KNOWN</span>
                      </div>
                      <div className="hazard-reason">
                        <strong>Reason:</strong> {selectedRoute?.reason ?? 'No safe path through explored free cells'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dedicated Cropped Route Sub-Map */}
                {selectedRoute?.reachable && selectedRoute.waypoints.length >= 2 && (
                  <div className="card-cropped-map-box">
                    <div className="crop-map-header">
                      <div className="crop-map-title">
                        <Icon name="map" size={14} /> Tactical Route Corridor Map (Ingress Sub-Grid)
                      </div>
                      <span className="crop-map-sub">Focused on route corridor from entry to casualty with surrounding walls & doorways</span>
                    </div>
                    <div
                      className="cropped-map-svg-container"
                      dangerouslySetInnerHTML={{
                        __html: generateCroppedRouteMapSvg(selectedRoute, mergedGrid, selectedSurvivor),
                      }}
                    />
                  </div>
                )}

                {/* Turn-by-Turn Field Rescue Navigation */}
                {turnSteps.length > 0 && (
                  <div className="card-nav-box">
                    <div className="card-nav-header">
                      <div className="card-nav-title">
                        <Icon name="activity" size={14} /> Turn-by-Turn Field Rescue Navigation
                      </div>
                      <span className="card-nav-sub">Step-by-step corridor and doorway navigation for human rescue squad</span>
                    </div>
                    <div className="turn-steps-container">
                      {turnSteps.map((step) => (
                        <div key={step.stepIndex} className={`nav-step-row action-${step.action}`}>
                          <div className="step-circle">{step.stepIndex}</div>
                          <div className="step-body">
                            <div className="step-line">
                              <span className={`step-badge badge-${step.action}`}>
                                {step.action.toUpperCase()}
                              </span>
                              <span className="step-heading">{step.heading}</span>
                              <span className="step-instr">{step.instruction}</span>
                            </div>
                            {step.hazardAlert && (
                              <div className="step-alert">
                                ⚠️ {step.hazardAlert}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!selectedSurvivor && dossier.survivors.length > 0 && (
              <div className="table-selection-hint no-print">
                <Icon name="person" size={14} />
                <span>Click any survivor row above to isolate its ingress route on the situation map and display its tactical extraction card.</span>
              </div>
            )}

          </div>

          {/* Table 2: Recommended Visiting Sequence */}
          {dossier.visitingOrder.length > 0 && (
            <div className="dossier-section">
              <h2 className="section-title">
                <Icon name="overview" size={18} /> Recommended Multi-Casualty Extraction Sequence
              </h2>
              <p className="section-hint">
                Greedy nearest-safe-cost sequencing starting from the entry point, minimizing cumulative exposure time for human rescue squads.
              </p>
              <div className="table-responsive">
                <table className="dossier-table">
                  <thead>
                    <tr>
                      <th>Sequence</th>
                      <th>Target Casualty</th>
                      <th>Target Coordinate</th>
                      <th>Leg Distance</th>
                      <th>Leg Travel Time</th>
                      <th>Cumulative Rescue ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.visitingOrder.map((step) => (
                      <tr key={step.step}>
                        <td><strong>Step {step.step}</strong></td>
                        <td>{step.survivorId}</td>
                        <td>({step.targetCell.x}, {step.targetCell.y})</td>
                        <td>{step.segmentLength} cells</td>
                        <td>~{step.segmentTravelTimeSeconds}s</td>
                        <td><strong>~{step.cumulativeTravelTimeSeconds}s</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Table 3: Swarm Fleet Telemetry */}
          <div className="dossier-section">
            <h2 className="section-title">
              <Icon name="fleet" size={18} /> Swarm Fleet Reconnaissance & Telemetry
            </h2>
            <div className="table-responsive">
              <table className="dossier-table">
                <thead>
                  <tr>
                    <th>Robot</th>
                    <th>Type</th>
                    <th>Battery</th>
                    <th>Belief Odometry Position</th>
                    <th>Cells Explored</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.robots.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.label}</strong> ({r.id})</td>
                      <td>{r.type.toUpperCase()}</td>
                      <td>{r.battery.toFixed(1)} / {r.maxBattery.toFixed(1)} ({Math.round(r.batteryFraction * 100)}%)</td>
                      <td>({r.odomPosition.x}, {r.odomPosition.y}) ±{r.odomUncertainty.toFixed(1)}m</td>
                      <td>{r.cellsExplored} cells</td>
                      <td>
                        <span className={`status-badge ${r.alive ? 'badge-active' : 'badge-depleted'}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit & Limitations Section */}
          <div className="dossier-limitations-box">
            <h3>Field Limitations & Structural Safety Advisory</h3>
            <ul className="limitations-list">
              {dossier.audit.limitations.map((limitation, i) => (
                <li key={i}>{limitation}</li>
              ))}
            </ul>

            <div className="collision-audit-row">
              {dossier.audit.collisions === 'not tracked' ? (
                <span className="not-tracked-text">Collision audit: not tracked in this session</span>
              ) : (
                <span className="tracked-text">Post-shield collision events: <strong>{dossier.audit.collisions}</strong></span>
              )}
            </div>
          </div>

          {/* Print-Only Dedicated Field Extraction Action Cards */}
          {dossier.survivors.length > 0 && (
            <div className="print-only-survivor-cards">
              <h3 className="print-cards-heading">Field Extraction Action Cards (Per-Survivor Dossier)</h3>
              {dossier.survivors.map((s) => {
                const r = dossier.routes.find((rt) => rt.survivorId === s.id);
                const isReachable = r?.reachable;
                return (
                  <div key={`print-card-${s.id}`} className="print-survivor-card">
                    <div className="survivor-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>{s.id}</strong>
                        <span className={`status-badge ${s.status === 'CONFIRMED' ? 'badge-confirmed' : 'badge-suspected'}`}>{s.status}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{s.label}</span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: isReachable ? '#15803d' : '#b91c1c' }}>
                        {isReachable ? '✓ INGRESS ROUTE SAFE' : '✕ NO SAFE ROUTE KNOWN'}
                      </div>
                    </div>
                    <div className="survivor-card-grid">
                      <div>
                        <span className="card-field-label">Position:</span>
                        <span className="card-field-val">({s.estimatedCell.x}, {s.estimatedCell.y})</span>
                      </div>
                      <div>
                        <span className="card-field-label">Status:</span>
                        <span className="card-field-val">{s.status}</span>
                      </div>
                      <div>
                        <span className="card-field-label">Confidence:</span>
                        <span className="card-field-val">{Math.round(s.confidence * 100)}%</span>
                      </div>
                      <div>
                        <span className="card-field-label">Confirmed / Detected By:</span>
                        <span className="card-field-val">{s.confirmedBy ?? s.detectedBy ?? 'Swarm Mesh'}</span>
                      </div>
                    </div>
                    <div className={`route-summary-panel ${isReachable ? 'panel-safe' : 'panel-hazard'}`}>
                      {isReachable ? (
                        <div className="route-safe-details">
                          <div>Route Length: <strong>{r?.length ?? 0} cells</strong></div>
                          <div>Risk Score: <strong>{r?.riskScore ?? 0} / 100</strong></div>
                          <div>Hazards Passed: <strong>{r?.hazardsPassed.join(', ') || 'None (clear floor)'}</strong></div>
                          <div>Estimated Travel Time: <strong>~{r?.estimatedTravelTimeSeconds ?? 0}s</strong></div>
                        </div>
                      ) : (
                        <div>
                          <strong>NO SAFE ROUTE KNOWN:</strong> {r?.reason ?? 'No safe path through explored free cells'}
                        </div>
                      )}
                    </div>

                    {isReachable && r && (
                      <div
                        className="print-cropped-map-wrapper"
                        style={{ marginTop: '10px' }}
                        dangerouslySetInnerHTML={{
                          __html: generateCroppedRouteMapSvg(r, mergedGrid, s),
                        }}
                      />
                    )}
                    {isReachable && r && (
                      <div className="print-nav-box" style={{ marginTop: '10px' }}>
                        <strong style={{ fontSize: '11px', color: '#1e293b' }}>Turn-by-Turn Human Rescue Navigation:</strong>
                        <ol style={{ paddingLeft: '18px', marginTop: '6px', fontSize: '11px', color: '#334155' }}>
                          {generateTurnByTurnDirections(r, mergedGrid, s.label).map((st) => (
                            <li key={st.stepIndex} style={{ marginBottom: '4px' }}>
                              <strong>[{st.action.toUpperCase()}]</strong> {st.instruction}
                              {st.hazardAlert && <span style={{ color: '#b45309', display: 'block' }}>⚠️ {st.hazardAlert}</span>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
