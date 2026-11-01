import type { Dossier, MergedGrid } from './types';
import { FREE, RUBBLE, WALL } from '../simulation/world/GridMap';
import { generateCroppedRouteMapSvg, generateTurnByTurnDirections } from './navigation';

/**
 * Generates an SVG representation of the merged belief map, entry point,
 * confirmed/suspected casualty markers, and safe evacuation routes.
 *
 * Supports optional `selectedSurvivorId` to highlight a single casualty's route.
 */
export function generateSituationMapSvg(
  dossier: Dossier,
  mergedGrid: MergedGrid,
  selectedSurvivorId?: string | number | null,
): string {
  const { width, height } = mergedGrid;
  const cellSize = 16;
  const svgWidth = width * cellSize;
  const svgHeight = height * cellSize;

  let rects = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = mergedGrid.get(x, y);
      let fill = '#110f0e'; // UNKNOWN void
      if (cell.raw === FREE) fill = '#e8dfd1'; // Clean floor
      else if (cell.raw === RUBBLE) fill = '#b0783f'; // Rubble / collapse
      else if (cell.raw === WALL) fill = '#22201d'; // Wall barrier

      rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${fill}" />`;
    }
  }

  // Draw safe route polylines
  let routesSvg = '';
  for (const r of dossier.routes) {
    if (!r.reachable || r.waypoints.length < 2) continue;
    const isSelected = selectedSurvivorId ? r.survivorId === selectedSurvivorId : true;
    const hasActiveFilter = Boolean(selectedSurvivorId);

    const pointsStr = r.waypoints
      .map((p) => `${p.x * cellSize + cellSize / 2},${p.y * cellSize + cellSize / 2}`)
      .join(' ');

    if (isSelected) {
      // Glow underlay + main route polyline
      const glowOpacity = hasActiveFilter ? '0.7' : '0.4';
      const mainWidth = hasActiveFilter ? '3.5' : '2.5';
      const strokeColor = hasActiveFilter ? '#10b981' : '#059669';

      routesSvg += `<polyline points="${pointsStr}" fill="none" stroke="#34d399" stroke-width="${hasActiveFilter ? '6' : '4'}" stroke-opacity="${glowOpacity}" stroke-linecap="round" stroke-linejoin="round" />`;
      routesSvg += `<polyline points="${pointsStr}" fill="none" stroke="${strokeColor}" stroke-width="${mainWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${hasActiveFilter ? 'none' : '4,2'}" />`;

      // Waypoint dots
      for (const wp of r.waypoints) {
        routesSvg += `<circle cx="${wp.x * cellSize + cellSize / 2}" cy="${wp.y * cellSize + cellSize / 2}" r="${hasActiveFilter ? '2' : '1.5'}" fill="#10b981" />`;
      }
    } else {
      // Dimmed background route when another survivor is selected
      routesSvg += `<polyline points="${pointsStr}" fill="none" stroke="#6ee7b7" stroke-width="1.2" stroke-opacity="0.18" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2,3" />`;
    }
  }

  // Draw Entry Point
  let entrySvg = '';
  if (dossier.routes.length > 0) {
    const entry = dossier.routes[0].entryPoint;
    const ex = entry.x * cellSize + cellSize / 2;
    const ey = entry.y * cellSize + cellSize / 2;
    entrySvg = `
      <g class="entry-marker">
        <circle cx="${ex}" cy="${ey}" r="8" fill="#2563eb" fill-opacity="0.25" />
        <circle cx="${ex}" cy="${ey}" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" />
        <text x="${ex}" y="${ey - 8}" text-anchor="middle" font-size="9" font-family="sans-serif" font-weight="bold" fill="#2563eb">ENTRY</text>
      </g>
    `;
  }

  // Draw Survivor markers
  let survivorSvg = '';
  for (const s of dossier.survivors) {
    const sx = s.estimatedCell.x * cellSize + cellSize / 2;
    const sy = s.estimatedCell.y * cellSize + cellSize / 2;
    const isConfirmed = s.status === 'CONFIRMED';
    const isSelected = selectedSurvivorId ? s.id === selectedSurvivorId : false;
    const color = isConfirmed ? '#16a34a' : '#d97706';
    const tag = isConfirmed ? 'CONFIRMED' : 'SUSPECTED';

    const selectionHighlight = isSelected
      ? `<circle cx="${sx}" cy="${sy}" r="15" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3,2" />`
      : '';

    survivorSvg += `
      <g class="survivor-marker ${isSelected ? 'selected' : ''}">
        ${selectionHighlight}
        <circle cx="${sx}" cy="${sy}" r="${isSelected ? '11' : '9'}" fill="${color}" fill-opacity="${isSelected ? '0.4' : '0.2'}" />
        <circle cx="${sx}" cy="${sy}" r="${isSelected ? '6' : '5'}" fill="${color}" stroke="#ffffff" stroke-width="${isSelected ? '2' : '1.5'}" />
        <line x1="${sx - 7}" y1="${sy}" x2="${sx + 7}" y2="${sy}" stroke="${color}" stroke-width="1" />
        <line x1="${sx}" y1="${sy - 7}" x2="${sx}" y2="${sy + 7}" stroke="${color}" stroke-width="1" />
        <text x="${sx}" y="${sy + 15}" text-anchor="middle" font-size="${isSelected ? '9' : '8'}" font-family="sans-serif" font-weight="bold" fill="${isSelected ? '#38bdf8' : color}">${s.id} [${tag}]</text>
      </g>
    `;
  }

  // Draw Robot Odometry Markers
  let robotSvg = '';
  for (const r of dossier.robots) {
    const rx = r.odomPosition.x * cellSize + cellSize / 2;
    const ry = r.odomPosition.y * cellSize + cellSize / 2;
    const color = r.alive ? '#6366f1' : '#64748b';
    robotSvg += `
      <g class="robot-marker">
        <rect x="${rx - 4}" y="${ry - 4}" width="8" height="8" rx="2" fill="${color}" stroke="#ffffff" stroke-width="1" />
        <text x="${rx}" y="${ry - 6}" text-anchor="middle" font-size="7" font-family="sans-serif" font-weight="bold" fill="${color}">${r.label}</text>
      </g>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" class="situation-map-svg" style="width: 100%; max-width: 800px; height: auto; border: 1px solid #d4c5b9; border-radius: 4px; background: #110f0e;">
      ${rects}
      ${routesSvg}
      ${entrySvg}
      ${survivorSvg}
      ${robotSvg}
    </svg>
  `;
}

/**
 * Builds a 100% self-contained, standalone single HTML field report.
 *
 * Requirements:
 * - Completely offline (zero external scripts, fonts, stylesheets, or CDNs).
 * - Embedded inline SVG situation map.
 * - Comprehensive SWARM rescue / IAP table formatting.
 * - Tactical Per-Survivor Extraction Cards with page-break styles for printing.
 * - Embedded print stylesheet (@media print) with page-break optimizations.
 */
export function generateStandaloneHtml(dossier: Dossier, mergedGrid: MergedGrid): string {
  const mapSvg = generateSituationMapSvg(dossier, mergedGrid);

  // Survivors table rows
  const survivorRows = dossier.survivors.map((s) => {
    const route = dossier.routes.find((r) => r.survivorId === s.id);
    const reachableBadge = route?.reachable
      ? `<span class="badge success">Safe Route Found (${route.length} cells, ~${route.estimatedTravelTimeSeconds}s, Risk: ${route.riskScore}/100)</span>`
      : `<span class="badge danger">NO SAFE ROUTE KNOWN (${route?.reason ?? 'Impassable'})</span>`;

    return `
      <tr>
        <td><strong>${s.id}</strong></td>
        <td><span class="badge ${s.status === 'CONFIRMED' ? 'confirmed' : 'suspected'}">${s.status}</span></td>
        <td>(${s.estimatedCell.x}, ${s.estimatedCell.y})</td>
        <td>${Math.round(s.confidence * 100)}%</td>
        <td>Thermal: ${s.evidence.thermal.toFixed(2)} | Acoustic: ${s.evidence.acoustic.toFixed(2)}</td>
        <td>${s.confirmedBy ?? s.detectedBy ?? 'Swarm Mesh'}</td>
        <td>${reachableBadge}</td>
      </tr>
    `;
  }).join('');

  // Per-survivor standalone cards (for field briefings and clean printing)
  const perSurvivorCards = dossier.survivors.map((s) => {
    const route = dossier.routes.find((r) => r.survivorId === s.id);
    const isReachable = Boolean(route?.reachable && route.waypoints.length >= 2);
    const croppedMap = isReachable && route ? generateCroppedRouteMapSvg(route, mergedGrid, s) : '';
    const directions = isReachable && route ? generateTurnByTurnDirections(route, mergedGrid, s.label) : [];

    return `
      <div class="survivor-card">
        <div class="survivor-card-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 15px; color: #0f172a;">${s.id}</strong>
            <span class="badge ${s.status === 'CONFIRMED' ? 'confirmed' : 'suspected'}">${s.status}</span>
            <span style="font-size: 11px; color: #64748b;">${s.label}</span>
          </div>
          <div style="font-size: 12px; font-weight: 600; color: ${isReachable ? '#15803d' : '#b91c1c'};">
            ${isReachable ? '✓ INGRESS ROUTE SAFE' : '✕ NO SAFE ROUTE KNOWN'}
          </div>
        </div>

        <div class="survivor-card-grid">
          <div>
            <span class="sc-label">Position:</span>
            <span class="sc-val">(${s.estimatedCell.x}, ${s.estimatedCell.y})</span>
          </div>
          <div>
            <span class="sc-label">Status:</span>
            <span class="sc-val"><span class="badge ${s.status === 'CONFIRMED' ? 'confirmed' : 'suspected'}">${s.status}</span></span>
          </div>
          <div>
            <span class="sc-label">Confidence:</span>
            <span class="sc-val">${Math.round(s.confidence * 100)}%</span>
          </div>
          <div>
            <span class="sc-label">Confirmed / Detected By:</span>
            <span class="sc-val">${s.confirmedBy ?? s.detectedBy ?? 'Swarm Mesh'}${s.confirmedAtTick ? ` (Tick ${s.confirmedAtTick})` : ''}</span>
          </div>
        </div>

        <div class="survivor-route-box ${isReachable ? 'route-box-ok' : 'route-box-fail'}">
          ${isReachable && route ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: #166534;">Recommended Safe Path</span>
              <span style="font-size: 11px; color: #166534;">Estimated Travel Time: <strong>~${route.estimatedTravelTimeSeconds}s</strong></span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 11px; color: #334155;">
              <div>Route Length: <strong>${route.length} cells</strong></div>
              <div>Risk Score: <strong>${route.riskScore} / 100</strong></div>
              <div>Hazards Passed: <strong>${route.hazardsPassed.join(', ') || 'None (clear floor)'}</strong></div>
              <div>Estimated Travel Time: <strong>~${route.estimatedTravelTimeSeconds}s</strong></div>
            </div>
          ` : `
            <div style="font-size: 12px; font-weight: 700; color: #991b1b; margin-bottom: 4px;">NO SAFE ROUTE KNOWN</div>
            <p style="font-size: 11px; color: #7f1d1d; margin: 0;"><strong>Reason:</strong> ${route?.reason ?? 'No safe path through explored free cells'}</p>
          `}
        </div>

        ${isReachable && croppedMap ? `
          <div class="cropped-map-wrapper">
            <div class="crop-header">
              <strong style="color: #0f172a; font-size: 12px;">Tactical Route Corridor Map (Ingress Sub-Grid)</strong>
              <span style="font-size: 11px; color: #64748b;">Isolated route corridor with surrounding structural context</span>
            </div>
            ${croppedMap}
          </div>
        ` : ''}

        ${isReachable && directions.length > 0 ? `
          <div class="nav-directions-box">
            <div class="nav-directions-header">
              <strong style="color: #0f172a; font-size: 12px;">Turn-by-Turn Field Rescue Navigation</strong>
              <span style="font-size: 11px; color: #64748b;">Step-by-step corridor and doorway navigation for human responders</span>
            </div>
            <ol class="nav-steps-list">
              ${directions.map(step => `
                <li class="nav-step-item">
                  <div class="nav-step-main">
                    <span class="nav-step-badge">${step.action.toUpperCase()}</span>
                    <span>${step.instruction}</span>
                  </div>
                  ${step.hazardAlert ? `<div class="nav-step-hazard">⚠️ ${step.hazardAlert}</div>` : ''}
                </li>
              `).join('')}
            </ol>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Visiting order rows
  const orderRows = dossier.visitingOrder.map((step) => {
    return `
      <tr>
        <td><strong>Step ${step.step}</strong></td>
        <td>${step.survivorId}</td>
        <td>(${step.targetCell.x}, ${step.targetCell.y})</td>
        <td>${step.segmentLength} cells</td>
        <td>~${step.segmentTravelTimeSeconds}s</td>
        <td><strong>~${step.cumulativeTravelTimeSeconds}s</strong></td>
      </tr>
    `;
  }).join('');

  // Robots telemetry rows
  const robotRows = dossier.robots.map((r) => {
    return `
      <tr>
        <td><strong>${r.label}</strong> (${r.id})</td>
        <td>${r.type.toUpperCase()}</td>
        <td>${r.battery.toFixed(1)} / ${r.maxBattery.toFixed(1)} (${Math.round(r.batteryFraction * 100)}%)</td>
        <td>(${r.odomPosition.x}, ${r.odomPosition.y}) ±${r.odomUncertainty.toFixed(1)}m</td>
        <td>${r.cellsExplored} cells</td>
        <td><span class="badge ${r.alive ? 'active' : 'depleted'}">${r.status.toUpperCase()}</span></td>
      </tr>
    `;
  }).join('');

  // Collision audit check per user requirement
  const collisionDisplay =
    dossier.audit.collisions === 'not tracked'
      ? '<span style="color: #777777; font-weight: 500;">Collision audit: not tracked in this session</span>'
      : `<span style="font-weight: 600;">Post-shield collision events: ${dossier.audit.collisions}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rescue Dossier - ${dossier.meta.missionId} (Seed ${dossier.meta.seed})</title>
  <style>
    /* CSS Reset & Clean Offline Typography */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      color: #1f2937;
      background: #f9fafb;
      padding: 24px;
    }
    .container { max-width: 1000px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }

    /* Header & Branding */
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #b45309; text-transform: uppercase; margin-bottom: 4px; }
    .header-title { font-size: 24px; font-weight: 800; color: #111827; }
    .header-sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .meta-box { font-size: 12px; text-align: right; color: #4b5563; }
    .meta-box strong { color: #111827; }

    /* Summary Stat Cards */
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
    .stat-card h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 6px; }
    .stat-card .val { font-size: 22px; font-weight: 800; color: #0f172a; }
    .stat-card .desc { font-size: 11px; color: #64748b; margin-top: 4px; }

    /* Map Section */
    .section { margin-bottom: 32px; }
    .section-title { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 12px; border-left: 3px solid #2563eb; padding-left: 10px; }
    .map-container { display: flex; flex-direction: column; align-items: center; background: #0f172a; padding: 16px; border-radius: 6px; border: 1px solid #334155; }
    .map-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; font-size: 12px; color: #e2e8f0; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-box { width: 12px; height: 12px; border-radius: 2px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; margin-bottom: 16px; }
    th { background: #f0fdf4; color: #065f46; font-weight: 700; padding: 10px 12px; border-bottom: 2px solid #86efac; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #fafbfc; }

    /* Badges */
    .badge { display: inline-block; padding: 3px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge.confirmed { background: #dcfce7; color: #15803d; }
    .badge.suspected { background: #fef3c7; color: #b45309; }
    .badge.success { background: #dcfce7; color: #15803d; }
    .badge.danger { background: #fee2e2; color: #b91c1c; }
    .badge.active { background: #e0e7ff; color: #4338ca; }
    .badge.depleted { background: #f1f5f9; color: #64748b; }

    /* Per-Survivor Standalone Cards */
    .survivor-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .survivor-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      border-bottom: 1px solid #f1f5f9;
      margin-bottom: 12px;
    }
    .survivor-card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .sc-label { display: block; font-size: 11px; color: #64748b; margin-bottom: 2px; }
    .sc-val { font-weight: 600; color: #1e293b; }
    .survivor-route-box {
      border-radius: 4px;
      padding: 10px 12px;
    }
    .route-box-ok {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
    }
    .route-box-fail {
      background: #fef2f2;
      border: 1px solid #fecaca;
    }

    /* Cropped Route Sub-Grid & Navigation Styles */
    .cropped-map-wrapper {
      margin-top: 14px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .crop-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .nav-directions-box {
      margin-top: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .nav-directions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
    }
    .nav-steps-list {
      padding-left: 20px;
      font-size: 12px;
      color: #334155;
    }
    .nav-step-item {
      margin-bottom: 8px;
    }
    .nav-step-main {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .nav-step-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      background: #e2e8f0;
      color: #334155;
    }
    .nav-step-hazard {
      font-size: 11px;
      color: #b45309;
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 2px 8px;
      margin-top: 4px;
      display: inline-block;
    }

    /* Limitations & Audit */
    .limitations-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; font-size: 12px; color: #92400e; margin-top: 24px; }
    .limitations-box h4 { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: #b45309; text-transform: uppercase; }
    .limitations-box ul { padding-left: 20px; }
    .limitations-box li { margin-bottom: 4px; }
    .audit-bar { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #fcd34d; font-size: 12px; }

    /* Print Stylesheet */
    @media print {
      body { background: #ffffff; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
      .section { page-break-inside: avoid; }
      .survivor-card { page-break-inside: avoid; break-inside: avoid; border-color: #cbd5e1; margin-bottom: 18px; }
      .cropped-map-wrapper { background: #ffffff !important; border-color: #94a3b8 !important; page-break-inside: avoid !important; break-inside: avoid !important; }
      .nav-directions-box { background: #ffffff !important; border-color: #cbd5e1 !important; page-break-inside: avoid !important; break-inside: avoid !important; }
      .map-container { background: #ffffff; border: 1px solid #cccccc; }
      .situation-map-svg { max-width: 90% !important; border-color: #999999; }
      .cropped-route-svg { max-width: 90% !important; border-color: #999999; }
      .map-legend { color: #000000; }
      th { background: #eeeeee !important; color: #000000; }
      td { color: #000000; }
      .limitations-box { border-color: #cccccc; background: #ffffff; color: #333333; }
      @page { margin: 10mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div>
        <div class="header-eyebrow">SWARM SEARCH & RESCUE · INCIDENT ACTION REPORT</div>
        <h1 class="header-title">${dossier.meta.missionId}</h1>
        <div class="header-sub">Swarm-SAR Automated Reconnaissance & Safe Evacuation Routing</div>
      </div>
      <div class="meta-box">
        <div>Mission Seed: <strong>${dossier.meta.seed}</strong></div>
        <div>Generated at Tick: <strong>${dossier.meta.generatedAtTick}</strong> (${dossier.meta.missionDurationSeconds}s elapsed)</div>
        <div>Data Sources: <strong>${dossier.meta.dataSources.contributing} / ${dossier.meta.dataSources.total}</strong> robots (${dossier.meta.dataSources.depleted} depleted)</div>
      </div>
    </header>

    <div class="stat-grid">
      <div class="stat-card">
        <h4>Casualties Located</h4>
        <div class="val">${dossier.survivors.filter(s => s.status === 'CONFIRMED').length} <small style="font-size: 13px; font-weight: normal; color: #64748b;">conf.</small> / ${dossier.survivors.filter(s => s.status === 'SUSPECTED').length} <small style="font-size: 13px; font-weight: normal; color: #64748b;">susp.</small></div>
        <div class="desc">Only confirmed & sensor cues included</div>
      </div>
      <div class="stat-card">
        <h4>Safe Route Feasibility</h4>
        <div class="val">${dossier.routes.filter(r => r.reachable).length} <small style="font-size: 13px; font-weight: normal; color: #64748b;">reachable</small> / ${dossier.routes.filter(r => !r.reachable).length} <small style="font-size: 13px; font-weight: normal; color: #64748b;">blocked</small></div>
        <div class="desc">Evaluated strictly via known-safe cells</div>
      </div>
      <div class="stat-card">
        <h4>Site Exploration</h4>
        <div class="val">${dossier.coverage.exploredPercent}%</div>
        <div class="desc">${dossier.coverage.exploredCells} of ${dossier.coverage.totalCells} cells mapped (${dossier.coverage.knownBlockedPercent}% obstacles)</div>
      </div>
      <div class="stat-card">
        <h4>Fleet Readiness</h4>
        <div class="val">${dossier.meta.robotsAlive} / ${dossier.meta.swarmComposition.total}</div>
        <div class="desc">${dossier.meta.swarmComposition.rovers} rovers, ${dossier.meta.swarmComposition.drones} drones · Network: ${dossier.network.averageLinkHealth}</div>
      </div>
    </div>

    <section class="section">
      <h2 class="section-title">Tactical Situation Map (Merged Swarm Belief)</h2>
      <div class="map-container">
        ${mapSvg}
        <div class="map-legend">
          <div class="legend-item"><span class="legend-box" style="background: #e8dfd1;"></span> Known Free Floor</div>
          <div class="legend-item"><span class="legend-box" style="background: #b0783f;"></span> Rubble / Debris</div>
          <div class="legend-item"><span class="legend-box" style="background: #22201d;"></span> Structural Wall</div>
          <div class="legend-item"><span class="legend-box" style="background: #110f0e; border: 1px solid #334155;"></span> Unknown / Void</div>
          <div class="legend-item"><span class="legend-box" style="background: #2563eb;"></span> Entry Point</div>
          <div class="legend-item"><span class="legend-box" style="background: #16a34a;"></span> Confirmed Casualty</div>
          <div class="legend-item"><span class="legend-box" style="background: #d97706;"></span> Suspected Cue</div>
          <div class="legend-item"><span style="color: #059669; font-weight: bold;">-- --</span> Safe Ingress Route</div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Casualty Assessment Table</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Est. Location</th>
            <th>Confidence</th>
            <th>Sensor Readings</th>
            <th>Observer</th>
            <th>Safe Ingress Route Status</th>
          </tr>
        </thead>
        <tbody>
          ${survivorRows || '<tr><td colspan="7" style="text-align: center; color: #64748b;">No survivors or sensor cues detected yet.</td></tr>'}
        </tbody>
      </table>
    </section>

    ${dossier.survivors.length > 0 ? `
    <section class="section">
      <h2 class="section-title">Field Extraction Action Cards (Per-Survivor Dossier)</h2>
      <p style="font-size: 12px; color: #475569; margin-bottom: 12px;">
        Detailed casualty assessment and safe path specifications formatted for search-and-rescue team leaders.
      </p>
      <div>
        ${perSurvivorCards}
      </div>
    </section>
    ` : ''}

    ${dossier.visitingOrder.length > 0 ? `
    <section class="section">
      <h2 class="section-title">Recommended Multi-Casualty Extraction Sequence</h2>
      <p style="font-size: 12px; color: #475569; margin-bottom: 10px;">
        Greedy nearest-safe-cost sequence computed from the deployment entry point.
      </p>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Target Survivor</th>
            <th>Target Cell</th>
            <th>Leg Distance</th>
            <th>Leg Transit ETA</th>
            <th>Cumulative Rescue ETA</th>
          </tr>
        </thead>
        <tbody>
          ${orderRows}
        </tbody>
      </table>
    </section>
    ` : ''}

    <section class="section">
      <h2 class="section-title">Swarm Fleet Reconnaissance & Telemetry</h2>
      <table>
        <thead>
          <tr>
            <th>Robot</th>
            <th>Type</th>
            <th>Battery</th>
            <th>Odometry Position</th>
            <th>Explored</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${robotRows}
        </tbody>
      </table>
    </section>

    <div class="limitations-box">
      <h4>Field Limitations & Structural Safety Advisory</h4>
      <ul>
        ${dossier.audit.limitations.map(l => `<li>${l}</li>`).join('')}
      </ul>
      <div class="audit-bar">
        ${collisionDisplay}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers a client-side file download in the browser.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads the Dossier as a structured JSON file.
 */
export function downloadDossierJson(dossier: Dossier): void {
  const filename = `rescue-dossier-seed${dossier.meta.seed}-tick${dossier.meta.generatedAtTick}.json`;
  const jsonContent = JSON.stringify(dossier, null, 2);
  downloadFile(filename, jsonContent, 'application/json');
}

/**
 * Downloads the Dossier as a standalone printable HTML field report.
 */
export function downloadDossierHtml(dossier: Dossier, mergedGrid: MergedGrid): void {
  const filename = `rescue-dossier-seed${dossier.meta.seed}-tick${dossier.meta.generatedAtTick}.html`;
  const htmlContent = generateStandaloneHtml(dossier, mergedGrid);
  downloadFile(filename, htmlContent, 'text/html');
}

/**
 * Triggers the browser's native print dialog to save as PDF or print.
 * Resets any modal and window scroll offsets to ensure complete pagination from page 1.
 */
export function printDossier(): void {
  const body = document.querySelector('.dossier-body');
  if (body) {
    body.scrollTop = 0;
  }
  window.scrollTo(0, 0);

  setTimeout(() => {
    window.print();
  }, 50);
}
