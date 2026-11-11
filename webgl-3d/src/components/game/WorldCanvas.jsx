import React, { useRef, useEffect } from 'react';
import { screenToIso } from '../../engine/utils';
import { useGameLoop } from '../../hooks/useGameLoop';
import { TILE_SIZE } from '../../constants/game';
import { PISTE_DIFFICULTIES } from '../../constants/pistes';
import { isCliff } from '../../engine/utils';

import {
    drawPlacedBuilding,
    drawBuildingPreview,
    drawGridOverlay,
    drawSnowCoverageOverlay,
    drawPistenbully,
    drawSkiDoo,
    drawSkiDooVehicle,
    drawSkiDooSled,
    drawLiftStation,
    drawLiftPylon,
    drawLiftCarrier,
    drawHelicopter,
    drawTrafficVehicle,
    drawTrafficBubble,
    drawGuest
} from './DrawingUtils';
import { useSpriteLoader } from '../../hooks/useSpriteLoader';

const WorldCanvas = ({
    gridSize = 256,
    onSelectTile,
    onDoubleClick,
    rotation = 0,
    worldData,
    scale,
    setScale,
    offset,
    setOffset,
    placementMode,
    liftStartPoint,
    liftPreviewValidation,
    placedLifts = [],
    selectedLiftType,
    pistePlacementMode,
    currentPiste,
    resort,
    hoveredTile,
    setHoveredTile,
    selectedBuilding,
    buildingRotation,
    buildingValidation,
    onSelectPiste,
    onBuildingClick,
    onGuestClick,
    onLiftClick,
    onWeatherUpdate
}) => {
    const canvasRef = useRef(null);
    const { heightmap, landcover } = worldData;
    const { sprites } = useSpriteLoader();
    const rawMousePos = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // NEW: Weather System State
    const weatherState = useRef({
        currentPhase: 'INIT',
        phaseStartTime: 0,
        phaseDuration: 0,
        hasRunFirstPhase: false,
        lastSnowTime: 0,
        isSnowing: false,
        snowDuration: 30000,
        particles: [],
        lastFogTime: 0,
        fogDuration: 25000,
        isFoggy: false,
        fogParticles: [],
        lastSunTime: Date.now(),
        sunDuration: 22000,
        isSunPhase: false,
        nextPhase: 'CLEAR',
        lastNotifyTime: 0
    });

    // Cached terrain altitude range (heightmap is static after generation,
    // so we only rescan when the source array identity changes).
    const terrainStatsRef = useRef({ source: null, min: 0, max: 1 });

    // Reused per-frame piste-overlay buffers (avoids ~0.85 MB/frame of GC churn).
    const pisteBuffersRef = useRef({ size: 0, coverage: null, strength: null, condition: null });

    // ROTATION HELPERS
    const toData = (vi, vj) => {
        let dx = vi, dy = vj;
        if (rotation === 90) { dx = gridSize - 1 - vj; dy = vi; }
        else if (rotation === 180) { dx = gridSize - 1 - vi; dy = gridSize - 1 - vj; }
        else if (rotation === 270) { dx = vj; dy = gridSize - 1 - vi; }
        return { x: dx, y: dy };
    };

    const toVisual = (dx, dy) => {
        let vi = dx, vj = dy;
        if (rotation === 90) { vi = dy; vj = gridSize - 1 - dx; }
        else if (rotation === 180) { vi = gridSize - 1 - dx; vj = gridSize - 1 - dy; }
        else if (rotation === 270) { vi = gridSize - 1 - dy; vj = dx; }
        return { i: vi, j: vj };
    };

    // WICHTIG: nimmt VISUELLE Koordinaten und liefert den DATEN-Index.
    // Ohne diese Transformation drehte sich das Terrain nicht mit,
    // während Gebäude/Lifte/Pisten rotierten (Rotations-Bug).
    const getDataIdx = (vi, vj) => {
        if (vi < 0 || vi >= gridSize || vj < 0 || vj >= gridSize) return -1;
        const { x, y } = toData(vi, vj);
        return y * gridSize + x;
    };

    const isoX = (i, j) => ((i - j) * (TILE_SIZE / 2) * scale + offset.x);
    const isoY = (i, j, z) => ((i + j) * (TILE_SIZE / 4) * scale - z * scale + offset.y);

    // ROTATIONS-BEWUSSTE Projektion für Entities mit DATEN-Koordinaten
    // (Gäste, Verkehr, Sprechblasen). Kontinuierliche Variante von toVisual —
    // ohne sie stehen Objekte nach dem Drehen an der falschen Stelle.
    const toVisualF = (dx, dy) => {
        if (rotation === 90) return { i: dy, j: gridSize - 1 - dx };
        if (rotation === 180) return { i: gridSize - 1 - dx, j: gridSize - 1 - dy };
        if (rotation === 270) return { i: gridSize - 1 - dy, j: dx };
        return { i: dx, j: dy };
    };
    const isoXW = (dx, dy, z) => { const v = toVisualF(dx, dy); return isoX(v.i, v.j, z); };
    const isoYW = (dx, dy, z) => { const v = toVisualF(dx, dy); return isoY(v.i, v.j, z); };

    const distToSegment = (px, py, x1, y1, x2, y2) => {
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2);
    };

    // ROBUST WINDOW-BASED DRAGGING
    useEffect(() => {
        const handleWindowMouseMove = (e) => {
            if (!isDragging.current) return;
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        };

        const handleWindowMouseUp = () => {
            isDragging.current = false;
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [setOffset]);

    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) {
                // PERFORMANCE: DPR auf 1.5 deckeln — volle Retina-Auflösung (2x)
                // vervierfacht die Pixelmenge und kostet massiv FPS.
                const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
                canvasRef.current.style.width = `${window.innerWidth}px`;
                canvasRef.current.style.height = `${window.innerHeight}px`;
                canvasRef.current.width = window.innerWidth * dpr;
                canvasRef.current.height = window.innerHeight * dpr;
                const ctx = canvasRef.current.getContext('2d');
                ctx.resetTransform();
                ctx.scale(dpr, dpr);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const sampleWeatherPhase = (avoidClear = false) => {
        let roll = Math.random();
        if (avoidClear && roll < 0.25) roll = 0.25 + Math.random() * 0.75;
        if (roll < 0.25) return 'CLEAR';
        if (roll < 0.62) return 'SNOW';
        if (roll < 0.84) return 'FOG';
        return 'SUN';
    };

    const draw = (ctx, dt) => {
        const weather = weatherState.current;
        const now = Date.now();

        // Weather phase scheduler
        if (!weather.hasRunFirstPhase || now - weather.phaseStartTime > weather.phaseDuration) {
            const previousPhase = weather.currentPhase;
            weather.phaseStartTime = now;
            let roll = Math.random();

            // Force immediate visible weather when loading (instead of long clear-only start).
            if (!weather.hasRunFirstPhase) {
                weather.hasRunFirstPhase = true;
                roll = 0.25 + Math.random() * 0.75;
            } else if (previousPhase === 'CLEAR' && roll < 0.25) {
                // Avoid back-to-back clear phases so weather stays active.
                roll = 0.25 + Math.random() * 0.75;
            }

            // Reset active effects before selecting next phase
            weather.isSnowing = false;
            weather.particles = [];
            weather.isFoggy = false;
            weather.fogParticles = [];
            weather.isSunPhase = false;

            if (roll < 0.25) {
                weather.currentPhase = 'CLEAR';
                weather.phaseDuration = 12000 + Math.random() * 10000;
            } else if (roll < 0.62) {
                weather.currentPhase = 'SNOW';
                weather.isSnowing = true;
                weather.lastSnowTime = now;
                weather.snowDuration = 24000 + Math.random() * 26000;
                weather.phaseDuration = weather.snowDuration;
                const count = 140 + Math.floor(Math.random() * 120);
                weather.particles = Array.from({ length: count }, () => ({
                    x: Math.random() * window.innerWidth,
                    y: Math.random() * window.innerHeight,
                    speed: 0.7 + Math.random() * 2.4,
                    drift: -0.6 + Math.random() * 1.2,
                    size: 0.8 + Math.random() * 2.2,
                    alpha: 0.35 + Math.random() * 0.5
                }));
            } else if (roll < 0.84) {
                weather.currentPhase = 'FOG';
                weather.isFoggy = true;
                weather.lastFogTime = now;
                weather.fogDuration = 22000 + Math.random() * 22000;
                weather.phaseDuration = weather.fogDuration;
                const count = 65 + Math.floor(Math.random() * 55);
                weather.fogParticles = Array.from({ length: count }, () => ({
                    wx: Math.random() * gridSize,
                    wy: Math.random() * gridSize,
                    wz: 10 + Math.random() * 60,
                    radius: 0.5 + Math.random() * 1.3,
                    opacity: 0.08 + Math.random() * 0.2,
                    speedX: (Math.random() - 0.5) * 0.003,
                    speedY: (Math.random() - 0.5) * 0.003
                }));
            } else {
                weather.currentPhase = 'SUN';
                weather.isSunPhase = true;
                weather.lastSunTime = now;
                weather.sunDuration = 18000 + Math.random() * 18000;
                weather.phaseDuration = weather.sunDuration;
            }

            weather.nextPhase = sampleWeatherPhase(weather.currentPhase === 'CLEAR');
        }

        if (onWeatherUpdate && now - (weather.lastNotifyTime || 0) > 900) {
            weather.lastNotifyTime = now;
            const remainingSec = Math.max(0, ((weather.phaseStartTime + weather.phaseDuration) - now) / 1000);
            onWeatherUpdate({
                current: weather.currentPhase,
                next: weather.nextPhase || sampleWeatherPhase(weather.currentPhase === 'CLEAR'),
                remainingSec
            });
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Dynamic Background Color & Shadow Strength (Level-Theme-aware)
        const theme = worldData.theme || null;
        const skyBase = theme?.skyTop || [110, 180, 240];
        const skyLow = theme?.skyBottom || [178, 214, 244];
        let r = skyBase[0], g = skyBase[1], b = skyBase[2];
        let shadowMultiplier = 1.0;    // Default: Normal Shadows

        const sunElapsed = now - weather.lastSunTime;

        if (weather.isSnowing) {
            const elapsed = now - weather.lastSnowTime;
            let intensity = 0;
            if (elapsed < 3000) intensity = elapsed / 3000;
            else if (elapsed > weather.snowDuration - 3000) intensity = (weather.snowDuration - elapsed) / 3000;
            else intensity = 1;

            // Interpolate towards Lighter Grey-Blue for snow
            // Target: 180, 190, 210 (Light Steel Blue-ish)
            r = r + (180 - r) * intensity;
            g = g + (190 - g) * intensity;
            b = b + (210 - b) * intensity;
        } else if (weather.isSunPhase) {
            // Sun Phase: Sky is Blue, but Shadows get stronger
            if (sunElapsed < 3000) shadowMultiplier = 1.0 + (sunElapsed / 3000) * 0.4; // Ramp up to 1.4x
            else if (sunElapsed > weather.sunDuration - 3000) shadowMultiplier = 1.0 + ((weather.sunDuration - sunElapsed) / 3000) * 0.4;
            else shadowMultiplier = 1.4;
        }

        // Vertikaler Himmels-Verlauf (oben satter, unten heller — mehr Tiefe)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, canvasRef.current.height);
        skyGrad.addColorStop(0, `rgb(${r | 0}, ${g | 0}, ${b | 0})`);
        skyGrad.addColorStop(1, `rgb(${Math.min(255, (r + skyLow[0]) / 2 + 30) | 0}, ${Math.min(255, (g + skyLow[1]) / 2 + 24) | 0}, ${Math.min(255, (b + skyLow[2]) / 2 + 14) | 0})`);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        ctx.restore();

        // Theme-Werte für Terrain-Färbung
        const snowWarmth = theme?.snowWarmth || 0;
        const grassLight = theme?.grassLight || [130, 165, 95];
        const grassDark = theme?.grassDark || [90, 125, 68];

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const threshold = 250 * scale;
        const time = now;

        // 1. DATA PRE-PROCESSING for unified pass
        const buildingsByTile = new Map();
        // REMOVED: suppressedTerrain logic - standard rendering is better with new Z-order fix

        if (resort && resort.buildings) {
            resort.buildings.forEach(b => {
                // UNIFIED Z-SORTING FIX (DYNAMIC):
                // Register building at the "Visual Front-Most" tile based on rotation.
                // This ensures it is drawn AFTER all other terrain tiles in its footprint have been drawn.

                const bRot = b.rotation || 0;
                const isRotated = bRot === 90 || bRot === 270;
                const w = isRotated ? b.type.size.height : b.type.size.width;
                const h = isRotated ? b.type.size.width : b.type.size.height;

                let sortX = b.x;
                let sortY = b.y;

                // Determine "Front" corner based on View Rotation (Standard Z-Buffering)
                // All buildings (FLAT or TALL) must be Front-Anchored to cover terrain.
                if (rotation === 0) {
                    // Front is Max X, Max Y
                    sortX = b.x + w - 1;
                    sortY = b.y + h - 1;
                } else if (rotation === 90) {
                    // Front is Min X, Max Y
                    sortX = b.x;
                    sortY = b.y + h - 1;
                } else if (rotation === 180) {
                    // Front is Min X, Min Y
                    sortX = b.x;
                    sortY = b.y;
                } else if (rotation === 270) {
                    // Front is Max X, Min Y
                    sortX = b.x + w - 1;
                    sortY = b.y;
                }

                // Bounds safety
                if (sortX < 0) sortX = 0; if (sortX >= gridSize) sortX = gridSize - 1;
                if (sortY < 0) sortY = 0; if (sortY >= gridSize) sortY = gridSize - 1;

                const tileKey = sortY * gridSize + sortX;

                // If multiple buildings share the same sort key (rare, overlapping?), Last one wins.
                // Or we could have a list. But map.set overwrites.
                // For now, accept overwrite (unlikely to have 100% overlap of front corner).
                buildingsByTile.set(tileKey, b);
            });
        }

        // Pistenbullies Pre-sorting
        const vehiclesByTile = new Map();
        if (resort && resort.pistenbullies) {
            resort.pistenbullies.forEach(v => {
                // Pistenbullies Pre-sorting: Use visual "front-most" tile to ensure correct occlusion
                let sortX = v.x;
                let sortY = v.y;
                const fM = 1.2; // Increased from 0.8 to ensure vehicle draws after foreground tiles

                if (rotation === 0) {
                    sortX += fM; sortY += fM;
                } else if (rotation === 90) {
                    sortX -= fM; sortY += fM;
                } else if (rotation === 180) {
                    sortX -= fM; sortY -= fM;
                } else if (rotation === 270) {
                    sortX += fM; sortY -= fM;
                }

                const vIdx = Math.floor(Math.max(0, Math.min(gridSize - 1, sortY))) * gridSize +
                    Math.floor(Math.max(0, Math.min(gridSize - 1, sortX)));

                if (!vehiclesByTile.has(vIdx)) vehiclesByTile.set(vIdx, []);
                vehiclesByTile.get(vIdx).push(v);
            });
        }

        // Ski-Doos Pre-sorting (Separated Parts for Painter's Algorithm)
        const skidoosByTile = new Map();
        if (resort && resort.skidoos) {
            resort.skidoos.forEach(v => {
                // 1. Register Vehicle Body
                let sortX = v.x;
                let sortY = v.y;
                if (rotation === 0) { sortX += 1.0; sortY += 1.0; }
                else if (rotation === 90) { sortX -= 1.0; sortY += 1.0; }
                else if (rotation === 180) { sortX -= 1.0; sortY -= 1.0; }
                else if (rotation === 270) { sortX += 1.0; sortY -= 1.0; }

                const vIdx = Math.floor(Math.max(0, Math.min(gridSize - 1, sortY))) * gridSize + Math.floor(Math.max(0, Math.min(gridSize - 1, sortX)));
                if (!skidoosByTile.has(vIdx)) skidoosByTile.set(vIdx, []);
                skidoosByTile.get(vIdx).push({ type: 'vehicle', v });

                // 2. Register Sled Body (Independent Sort)
                // Use Sled's actual visual position
                let sSortX = v.sledX || v.x;
                let sSortY = v.sledY || v.y;
                if (rotation === 0) { sSortX += 1.0; sSortY += 1.0; }
                else if (rotation === 90) { sSortX -= 1.0; sSortY += 1.0; }
                else if (rotation === 180) { sSortX -= 1.0; sSortY -= 1.0; }
                else if (rotation === 270) { sSortX += 1.0; sSortY -= 1.0; }

                const sIdx = Math.floor(Math.max(0, Math.min(gridSize - 1, sSortY))) * gridSize + Math.floor(Math.max(0, Math.min(gridSize - 1, sSortX)));
                if (!skidoosByTile.has(sIdx)) skidoosByTile.set(sIdx, []);
                skidoosByTile.get(sIdx).push({ type: 'sled', v });
            });
        }

        // TRAFFIC PRE-SORTING
        const trafficByTile = new Map();

        if (resort && resort.traffic) {
            resort.traffic.forEach(v => {
                let sortX = v.x;
                let sortY = v.y;
                const fM = 0.5;

                // Logic: If Car is on a FLAT LOT, we must defer its drawing until AFTER the Lot is drawn.
                // A Lot is drawn at its "Front Anchor" tile (e.g., Max X, Max Y).
                // So we must assign the Car to that same Anchor Tile (or one later).

                const parkingLot = v.parkingLot; // Assuming this reference exists
                const isFlatLot = parkingLot && (parkingLot.type.id === 'parking_lot' || parkingLot.type.id === 'bus_stop');

                if (isFlatLot) {
                    // Get Anchor of the Lot
                    const b = parkingLot;
                    const bRot = b.rotation || 0;
                    const isRotated = bRot === 90 || bRot === 270;
                    const w = isRotated ? b.type.size.height : b.type.size.width;
                    const h = isRotated ? b.type.size.width : b.type.size.height;

                    if (rotation === 0) { sortX = b.x + w - 1; sortY = b.y + h - 1; }
                    else if (rotation === 90) { sortX = b.x; sortY = b.y + h - 1; }
                    else if (rotation === 180) { sortX = b.x; sortY = b.y; }
                    else if (rotation === 270) { sortX = b.x + w - 1; sortY = b.y; }
                } else {
                    // Normal Road / Garage Logic
                    // Garage is drawn "Late" (Front Anchor). Car is drawn "Early" (Car Pos).
                    // So Garage covers Car. Correct.
                    if (rotation === 0) { sortX += fM; sortY += fM; }
                    else if (rotation === 90) { sortX -= fM; sortY += fM; }
                    else if (rotation === 180) { sortX -= fM; sortY -= fM; }
                    else if (rotation === 270) { sortX += fM; sortY -= fM; }
                }

                const vIdx = Math.floor(Math.max(0, Math.min(gridSize - 1, sortY))) * gridSize +
                    Math.floor(Math.max(0, Math.min(gridSize - 1, sortX)));

                if (!trafficByTile.has(vIdx)) trafficByTile.set(vIdx, []);
                trafficByTile.get(vIdx).push(v);
            });
        }

        const markersByTile = new Map();
        // Reuse piste-overlay buffers across frames (cleared, not reallocated).
        const need = gridSize * gridSize;
        let pb = pisteBuffersRef.current;
        if (pb.size !== need) {
            pb = pisteBuffersRef.current = {
                size: need,
                coverage: new Uint8Array(need),   // 1: blue, 2: red, 3: black, 4: invalid
                strength: new Float32Array(need),  // 0..1 for alpha edges
                condition: new Float32Array(need)
            };
        }
        const pCoverage = pb.coverage; pCoverage.fill(0);
        const pStrength = pb.strength; pStrength.fill(0);
        const pCondition = pb.condition; pCondition.fill(1.0);

        let invalidReason = null;
        const allPistes = resort && resort.pistes ? [...resort.pistes] : [];
        if (currentPiste && currentPiste.segments.length > 0) {
            const last = currentPiste.segments[currentPiste.segments.length - 1];
            const previewPiste = {
                ...currentPiste,
                segments: [...currentPiste.segments]
            };
            if (hoveredTile) {
                const hz = heightmap[hoveredTile.y * gridSize + hoveredTile.x] || 0;
                const distance = Math.sqrt((hoveredTile.x - last.x) ** 2 + (hoveredTile.y - last.y) ** 2);
                if (distance > 0) {
                    const hDiff = last.z - hz;
                    const grad = ((hDiff / distance) * 10) / 1.5; // Convert to percentage-like gradient
                    if (grad < -5) invalidReason = 'UPHILL'; // Uphill > 5%
                }

                // NEW: Check for Cliff (End point)
                if (isCliff(hoveredTile.x, hoveredTile.y, heightmap, gridSize)) {
                    invalidReason = 'CLIFF';
                }

                // NEW: Check path for tunneling (Intermediate points)
                const dx = hoveredTile.x - last.x;
                const dy = hoveredTile.y - last.y;
                // Check every 0.25 tiles for safety
                const steps = Math.ceil(distance * 4);
                for (let i = 1; i < steps; i++) {
                    const t = i / steps;
                    const tx = Math.floor(last.x + dx * t);
                    const ty = Math.floor(last.y + dy * t);

                    // Skip if endpoint or startpoint (endpoint checked above)
                    if ((tx === hoveredTile.x && ty === hoveredTile.y) ||
                        (tx === Math.floor(last.x) && ty === Math.floor(last.y))) continue;

                    if (isCliff(tx, ty, heightmap, gridSize)) {
                        invalidReason = 'CLIFF';
                        break;
                    }
                }

                previewPiste.segments.push({ x: hoveredTile.x, y: hoveredTile.y, z: hz, difficulty: currentPiste.avgDifficulty || 'BLUE', isPreview: true });
            }
            allPistes.push(previewPiste);
        }

        allPistes.forEach(p => {
            const isPlanning = p === allPistes[allPistes.length - 1] && currentPiste;
            const diffKey = p.avgDifficulty || p.segments[p.segments.length - 1]?.difficulty || 'BLUE';
            let diffVal = diffKey === 'BLUE' ? 1 : (diffKey === 'RED' ? 2 : 3);
            const pWidth = (p.width?.width || 40);
            const radius = pWidth / 40; // Convert to tile-radius (20m per tile -> 1.0 tiles for 40m width)
            const markerRadius = pWidth / 40;

            let cumulDist = 0;
            const markerStep = 5; // every 5 tiles (100m)
            p.segments.forEach((seg, idx) => {
                if (idx === 0) return;
                const prev = p.segments[idx - 1];
                const d = Math.sqrt((seg.x - prev.x) ** 2 + (seg.y - prev.y) ** 2);

                // For planning preview, if the segment is the one to the mouse and invalid, use type 4
                let segDiffVal = diffVal;
                if (isPlanning && idx === p.segments.length - 1 && invalidReason) {
                    segDiffVal = 4; // Blocked/Invalid
                }

                // Markers along segment (only for non-invalid segments)
                if (segDiffVal !== 4) {
                    let remainingDist = markerStep - cumulDist;
                    if (d >= remainingDist) {
                        let t = remainingDist / d;
                        while (t <= 1) {
                            const mx = prev.x + (seg.x - prev.x) * t;
                            const my = prev.y + (seg.y - prev.y) * t;
                            const mz = prev.z + (seg.z - prev.z) * t;
                            // Use segment-center marker placement (we'll offset later in rendering)
                            const tIdx = getDataIdx(...Object.values(toVisual(mx, my)));
                            if (tIdx !== -1) {
                                if (!markersByTile.has(tIdx)) markersByTile.set(tIdx, []);
                                markersByTile.get(tIdx).push({ seg: { x: mx, y: my, z: mz }, p, color: PISTE_DIFFICULTIES[diffKey].color, dx: seg.x - prev.x, dy: seg.y - prev.y, markerRadius });
                            }

                            cumulDist = 0;
                            remainingDist = markerStep;
                            t += markerStep / d;
                        }
                        cumulDist = d - (t - markerStep / d) * d;
                    } else {
                        cumulDist += d;
                    }
                }

                // Paint Coverage
                const xMin = Math.floor(Math.min(seg.x, prev.x) - radius);
                const xMax = Math.ceil(Math.max(seg.x, prev.x) + radius);
                const yMin = Math.floor(Math.min(seg.y, prev.y) - radius);
                const yMax = Math.ceil(Math.max(seg.y, prev.y) + radius);

                for (let ty = Math.max(0, yMin); ty <= Math.min(gridSize - 1, yMax); ty++) {
                    for (let tx = Math.max(0, xMin); tx <= Math.min(gridSize - 1, xMax); tx++) {
                        const dist = distToSegment(tx, ty, prev.x, prev.y, seg.x, seg.y);
                        if (dist <= radius) {
                            const tileIdx = ty * gridSize + tx;
                            // Only overwrite if not already marked as invalid or if this is an invalid segment
                            if (pCoverage[tileIdx] !== 4 || segDiffVal === 4) pCoverage[tileIdx] = segDiffVal;
                            // Strength for anti-aliasing edges
                            const strength = Math.min(1, (radius - dist + 0.5));
                            if (strength > pStrength[tileIdx]) {
                                pStrength[tileIdx] = strength;
                                // Use segment-level condition for progressive grooming effect
                                if (p.segmentConditions && p.segmentConditions[idx] !== undefined) {
                                    pCondition[tileIdx] = p.segmentConditions[idx];
                                } else {
                                    pCondition[tileIdx] = p.condition !== undefined ? p.condition : 1.0;
                                }
                            }
                        }
                    }
                }
            });
        });

        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(0,0,0,0)';
        ctx.lineWidth = 1;

        // 2. UNIFIED RENDERING PASS (Painter's Algorithm: back-to-front)
        // We iterate VISUAL coordinates (i, j) from 0 to GridSize.
        // Since isoY ~ (i + j), this guarantees we draw from Top-Screen (Background) to Bottom-Screen (Foreground).
        // The rotation is handled by getDataIdx mapping (visual -> data).

        // Altitude range for height-based tint + aerial perspective (cached).
        const tStats = terrainStatsRef.current;
        if (tStats.source !== heightmap) {
            let mn = Infinity, mx = -Infinity;
            for (let k = 0; k < heightmap.length; k++) {
                const h = heightmap[k];
                if (h < mn) mn = h;
                if (h > mx) mx = h;
            }
            tStats.source = heightmap;
            tStats.min = mn;
            tStats.max = mx;
        }
        const terrainMinZ = tStats.min;
        const terrainRange = (tStats.max - tStats.min) || 1;

        // ===== SICHTBARKEITS-CULLING (Performance) =====
        // Statt die GANZE Karte zu iterieren (bis 147k Kacheln/Frame bei 384²),
        // berechnen wir den sichtbaren Bereich in Diagonal-Koordinaten:
        //   d = i - j  (aus Bildschirm-x),  s = i + j  (aus Bildschirm-y).
        // Hohe Objekte (Gebäude, Masten) bekommen großzügige Sicherheitsränder.
        const hwC = (TILE_SIZE / 2) * scale;
        const hhC = (TILE_SIZE / 4) * scale;
        const marginC = 140 * scale + 60;
        const dMinC = Math.floor((-marginC - offset.x) / hwC) - 2;
        const dMaxC = Math.ceil((screenW + marginC - offset.x) / hwC) + 2;
        const zSlack = ((terrainStatsRef.current.max || 0) * scale) / hhC;
        const tallSlack = (170 * scale) / hhC; // Gebäude/Masten ragen nach oben
        const sMinC = Math.floor((-marginC - offset.y) / hhC) - 2;
        const sMaxC = Math.ceil((screenH + marginC - offset.y) / hhC + zSlack + tallSlack) + 2;
        const iStartC = Math.max(0, Math.floor((sMinC + dMinC) / 2));
        const iEndC = Math.min(gridSize - 1, Math.ceil((sMaxC + dMaxC) / 2));

        for (let i = iStartC; i <= iEndC; i++) {
            const jStartC = Math.max(0, i - dMaxC, sMinC - i);
            const jEndC = Math.min(gridSize - 1, i - dMinC, sMaxC - i);
            for (let j = jStartC; j <= jEndC; j++) {
                const idx = getDataIdx(i, j);
                if (idx === -1) continue;

                const z = heightmap[idx];
                const type = landcover[idx];
                const x1 = isoX(i, j, z); const y1 = isoY(i, j, z);

                // Early culling
                if (x1 < -threshold || x1 > screenW + threshold || y1 < -threshold || y1 > screenH + threshold) continue;

                // --- A. TERRAIN TILE ---

                const idxRight = getDataIdx(i + 1, j);
                const idxDown = getDataIdx(i, j + 1);
                const idxDiag = getDataIdx(i + 1, j + 1);
                const zRight = idxRight !== -1 ? heightmap[idxRight] : z;
                const zDown = idxDown !== -1 ? heightmap[idxDown] : z;
                const zDiag = idxDiag !== -1 ? heightmap[idxDiag] : z;

                const x2 = isoX(i + 1, j, zRight); const y2 = isoY(i + 1, j, zRight);
                const x3 = isoX(i + 1, j + 1, zDiag); const y3 = isoY(i + 1, j + 1, zDiag);
                const x4 = isoX(i, j + 1, zDown); const y4 = isoY(i, j + 1, zDown);

                const slopeShading = (z - zRight + z - zDown) * 3.0;

                // Calculate gradient same way as cursor does
                const idxLeft = getDataIdx(i - 1, j);
                const idxUp = getDataIdx(i, j - 1);
                const heightLeft = idxLeft !== -1 ? heightmap[idxLeft] : z;
                const heightUp = idxUp !== -1 ? heightmap[idxUp] : z;

                const gradX = (zRight - heightLeft) / 2;
                const gradY = (zDown - heightUp) / 2;
                const gradMagnitude = Math.sqrt(gradX * gradX + gradY * gradY);
                const isCliff = gradMagnitude > 16.9; // 1690% gradient

                const isRock = (type === 3);

                if (isCliff) {
                    // Render as detailed rocky cliff face with TYPES
                    // Deterministic seeds
                    const seed1 = ((idx * 9301 + i * 49 + j * 17) % 100) / 100;
                    const seed2 = ((idx * 1523 + j * 791) % 100) / 100;

                    // Determine Rock Type (0: Granite, 1: Slate, 2: Banded, 3: Icy)
                    const rockType = Math.floor(seed1 * 4);

                    // Base brightness influenced by slope shading. Alpine rock in
                    // winter reads bright & cool grey (snow-dusted), not dark brown.
                    let rockBrightness = 112 + slopeShading * 2 + (seed2 * 20 - 10);
                    rockBrightness = Math.max(58, Math.min(186, rockBrightness)) | 0;

                    let r, g, b;
                    let crackColor = 'rgba(40, 48, 60, 0.45)';

                    // --- ROCK COLORS & TEXTURE (cool alpine granite family) ---
                    if (rockType === 0) {
                        // 🪨 GRANITE (neutral cool grey)
                        r = rockBrightness - 4;
                        g = rockBrightness;
                        b = rockBrightness + 7;
                        crackColor = 'rgba(38, 44, 54, 0.5)';
                    } else if (rockType === 1) {
                        // 🌑 SLATE (dark blue-grey)
                        r = rockBrightness - 12;
                        g = rockBrightness - 6;
                        b = rockBrightness + 12;
                        crackColor = 'rgba(14, 20, 32, 0.55)';
                    } else if (rockType === 2) {
                        // ⛰️ WEATHERED (barely-warm stone grey)
                        r = rockBrightness + 8;
                        g = rockBrightness + 3;
                        b = rockBrightness - 2;
                        crackColor = 'rgba(46, 38, 30, 0.45)';
                    } else {
                        // ❄️ ICY ROCK (pale blue-grey)
                        r = rockBrightness + 16;
                        g = rockBrightness + 22;
                        b = rockBrightness + 34;
                        crackColor = 'rgba(70, 82, 96, 0.4)';
                    }

                    // Draw Rock Face
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();

                    // --- SNOW PATCHES ON FACE ---
                    // Snow clinging to ledges — generous so steep faces read snowy.
                    if (seed2 > 0.2) {
                        ctx.fillStyle = `rgba(242, 247, 255, ${0.5 + seed2 * 0.45})`; // Semi-transparent snow
                        ctx.beginPath();
                        // Random irregular patch
                        const patchX = x1 + (x2 - x1) * 0.2 + (seed1 * 0.5) * (x2 - x1);
                        const patchY = y1 + (y4 - y1) * 0.3 + (seed2 * 0.4) * (y4 - y1);
                        const pSize = 6 * scale * seed1;

                        ctx.moveTo(patchX, patchY);
                        ctx.lineTo(patchX + pSize, patchY + pSize * 0.5);
                        ctx.lineTo(patchX + pSize * 0.2, patchY + pSize * 1.2);
                        ctx.lineTo(patchX - pSize * 0.5, patchY + pSize * 0.8);
                        ctx.closePath();
                        ctx.fill();
                    }

                    // --- CRACKS ---
                    if (seed1 > 0.3) {
                        ctx.strokeStyle = crackColor;
                        ctx.lineWidth = 1 + seed2 * 1.5;
                        ctx.beginPath();
                        if (rockType === 1) { // Slate -> Horizontal cracks
                            ctx.moveTo(x1, y1 + (y4 - y1) * seed2);
                            ctx.lineTo(x3, y3 + (y4 - y1) * seed2);
                        } else if (seed1 > 0.7) { // Vertical
                            ctx.moveTo((x1 + x2) / 2, (y1 + y2) / 2);
                            ctx.lineTo((x3 + x4) / 2, (y3 + y4) / 2);
                        } else { // Diagonal
                            ctx.moveTo(x1, y1);
                            ctx.lineTo(x3, y3);
                        }
                        ctx.stroke();
                    }

                    // Edge Highlight
                    ctx.strokeStyle = `rgba(${r + 30}, ${g + 30}, ${b + 30}, 0.3)`;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // --- ICICLES (BIG ASYMMETRIC) --- sparse, only when zoomed in
                    const icicleSeed = ((idx * 54321) % 100) / 100;
                    if (scale > 0.35 && (icicleSeed > 0.82 || rockType === 3)) {
                        // Deterministic random
                        const r1 = ((idx * 12.9898 + i * 78.233) % 1);
                        const r2 = ((idx * 31.3321 + j * 91.432) % 1);
                        const clusterSize = 1 + Math.floor(r1 * 3);

                        ctx.fillStyle = 'rgba(230, 245, 255, 0.85)';

                        for (let k = 0; k < clusterSize; k++) {
                            const kr1 = ((r1 * (k + 1) * 17.51) % 1);
                            const kr2 = ((r2 * (k + 1) * 43.12) % 1);

                            let t = icicleSeed + (k * 0.15) + (kr1 * 0.1); t = t % 1.0;
                            let ix, iy;
                            if (icicleSeed > 0.5) { ix = x1 + (x2 - x1) * t; iy = y1 + (y2 - y1) * t; }
                            else { ix = x1 + (x4 - x1) * t; iy = y1 + (y4 - y1) * t; }

                            const iLength = (8 * scale) + (kr2 * 18 * scale); // Up to 26 units long!
                            const iWidth = (2 * scale) + (kr1 * 3 * scale);
                            const offsetX = (kr2 - 0.5) * 3 * scale;

                            ctx.beginPath();
                            ctx.moveTo(ix + offsetX, iy);
                            ctx.lineTo(ix + offsetX + iWidth / 2, iy);
                            const midY = iy + (iLength * (0.3 + kr1 * 0.2));
                            const tipX = ix + offsetX + (kr1 - 0.5) * 3 * scale;
                            const bulgeRight = (kr1 * 2 * scale);
                            const bulgeLeft = (kr2 * 2 * scale);

                            ctx.lineTo(tipX + iWidth / 4 + bulgeRight, midY);
                            ctx.lineTo(tipX, iy + iLength);
                            ctx.lineTo(tipX - iWidth / 4 - bulgeLeft, midY);
                            ctx.lineTo(ix + offsetX - iWidth / 2, iy);
                            ctx.closePath();
                            ctx.fill();
                        }
                    }

                } else if (isRock) {
                    let r = Math.max(60, Math.min(160, 90 + slopeShading)) | 0;
                    ctx.fillStyle = `rgb(${r}, ${r}, ${r + 10})`;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();
                } else if (type === 4) {
                    ctx.fillStyle = '#334155';
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();
                } else if (type === 7) {
                    // ===== WIESE / MEADOW (unterhalb der Schneegrenze) =====
                    const lightIntensity = (gradX + gradY) * 1.6 * shadowMultiplier;
                    const sunFactor = Math.max(-1, Math.min(1, lightIntensity / 3.4));
                    const grain = (((idx * 374761393) >>> 24) & 15) - 7.5;
                    const t = (sunFactor + 1) / 2; // 0 Schatten .. 1 Sonne
                    let gr = grassDark[0] + (grassLight[0] - grassDark[0]) * t + grain;
                    let gg = grassDark[1] + (grassLight[1] - grassDark[1]) * t + grain;
                    let gb = grassDark[2] + (grassLight[2] - grassDark[2]) * t + grain * 0.5;
                    ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, gr)) | 0}, ${Math.max(0, Math.min(255, gg)) | 0}, ${Math.max(0, Math.min(255, gb)) | 0})`;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();

                    // Vereinzelte Grasbüschel bei hohem Zoom
                    if (scale > 0.5 && (((idx * 2654435761) >>> 0) & 511) > 495) {
                        ctx.strokeStyle = `rgba(${grassDark[0] - 20}, ${grassDark[1] - 10}, ${grassDark[2] - 15}, 0.7)`;
                        ctx.lineWidth = 1;
                        const cxm = (x1 + x3) * 0.5, cym = (y1 + y3) * 0.5;
                        ctx.beginPath();
                        ctx.moveTo(cxm, cym); ctx.lineTo(cxm - 1.5 * scale, cym - 3 * scale);
                        ctx.moveTo(cxm, cym); ctx.lineTo(cxm + 1 * scale, cym - 3.5 * scale);
                        ctx.stroke();
                    }
                } else if (type === 8) {
                    // ===== GLETSCHER (blasses Blau-Türkis mit Spalten) =====
                    const lightIntensity = (gradX + gradY) * 1.7 * shadowMultiplier;
                    const sunFactor = Math.max(-1, Math.min(1, lightIntensity / 3.4));
                    const grain = (((idx * 374761393) >>> 24) & 7) - 3.5;
                    let ir, ig, ib;
                    if (sunFactor >= 0) {
                        ir = 205 + sunFactor * 26; ig = 228 + sunFactor * 18; ib = 246 + sunFactor * 9;
                    } else {
                        const t2 = -sunFactor;
                        ir = 205 - t2 * 60; ig = 228 - t2 * 40; ib = 246 - t2 * 16;
                    }
                    ir += grain; ig += grain; ib += grain;
                    ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, ir)) | 0}, ${Math.max(0, Math.min(255, ig)) | 0}, ${Math.max(0, Math.min(255, ib)) | 0})`;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();

                    // Gletscherspalten (deterministisch, sparsam)
                    if (scale > 0.28 && (((idx * 96911) >>> 0) & 127) > 121) {
                        ctx.strokeStyle = 'rgba(64, 120, 168, 0.55)';
                        ctx.lineWidth = 1.2 * scale;
                        ctx.beginPath();
                        const cvx = (x1 + x3) * 0.5, cvy = (y1 + y3) * 0.5;
                        const seedv = (idx % 7) - 3;
                        ctx.moveTo(cvx - 8 * scale, cvy + seedv * scale);
                        ctx.quadraticCurveTo(cvx, cvy - 2 * scale + seedv * scale, cvx + 9 * scale, cvy + seedv * 0.5 * scale);
                        ctx.stroke();
                    }
                    // Blau schimmernde Eiskante
                    if (scale > 0.4 && (((idx * 48271) >>> 0) & 255) > 250) {
                        ctx.fillStyle = 'rgba(140, 200, 255, 0.5)';
                        ctx.fillRect((x1 + x3) * 0.5 - 2 * scale, (y1 + y3) * 0.5, 4 * scale, 1.2 * scale);
                    }
                } else if (type === 2) {
                    // WATER RENDER (Animated)
                    let c = Math.max(40, Math.min(100, 50 + slopeShading)) | 0;
                    ctx.fillStyle = `rgb(30, ${c}, ${c + 80})`;

                    // Base Water
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();

                    // Sparkle / Glint Effect
                    const time = performance.now() * 0.0015;
                    // Pseudo-random deterministic noise based on position & time
                    const noise = Math.sin(idx * 99.1 + time) * Math.sin(idx * 13.7 + time * 0.5) * Math.sin(time * 0.2);

                    if (noise > 0.45) {
                        ctx.strokeStyle = `rgba(220, 240, 255, ${(noise - 0.45) * 1.8})`; // Light Blue-White Shimmer
                        ctx.lineWidth = 1.5 * scale;
                        ctx.beginPath();

                        // Ripple Line Logic: 
                        // Draw a short segment along the "horizontal" diagonal (x4 -> x2)
                        // Position based on noise
                        const centerX = x1 + (x3 - x1) * ((Math.sin(idx * 0.5) + 1) / 2);
                        const centerY = y1 + (y3 - y1) * ((Math.cos(idx * 0.5) + 1) / 2);

                        // Interpolate slightly left and right along the x4-x2 diagonal axis
                        // But since x4-x2 is diagonal, we can just approximate "screen horizontal" for simple ripples
                        // OR use the actual iso axis. Let's use screen horizontal for a true "glint" look
                        const rippleLen = (3 + Math.sin(time + idx) * 2) * scale;

                        ctx.moveTo(centerX - rippleLen, centerY);
                        ctx.lineTo(centerX + rippleLen, centerY);
                        ctx.stroke();
                    }
                } else {
                    // ===== SNOW RENDER (Volumetric Alpine Shading) =====
                    // Layers: directional sunlight + surface curvature (ambient
                    // occlusion / ridge highlight) + altitude tint + aerial haze.
                    // The terrain is heavily smoothed, so slopes are gentle -> we
                    // use a sensitive light response so the topography actually reads.

                    // 1. Directional sunlight (top-left). gradX+gradY ~ slope toward light.
                    const lightIntensity = (gradX + gradY) * 1.7 * shadowMultiplier;
                    const sunFactor = Math.max(-1, Math.min(1, lightIntensity / 3.4));

                    // 2. Surface curvature -> cheap ambient occlusion.
                    //    Concave hollows darken, convex ridges catch the light.
                    const neighborAvg = (zRight + zDown + heightLeft + heightUp) * 0.25;
                    const curvature = Math.max(-2.4, Math.min(2.4, z - neighborAvg));

                    // 3. Altitude 0 (valley) .. 1 (summit) for tint + aerial perspective.
                    const alt = Math.max(0, Math.min(1, (z - terrainMinZ) / terrainRange));

                    // 4. Fine snow grain (deterministic, low banding).
                    const grain = (((idx * 374761393) >>> 24) & 7) - 3.5;

                    let r, g, b;
                    if (sunFactor >= 0) {
                        // Sunlit slope: creamy warm white (Level-Theme: warm/kalt).
                        const t = sunFactor;
                        r = 233 + t * 22 + snowWarmth * 8;
                        g = 236 + t * 19 + snowWarmth * 3;
                        b = 241 + t * 11 - snowWarmth * 9;
                    } else {
                        // Shaded slope: cool blue snow (kept fairly light so big
                        // camera-facing slopes don't go heavy/muddy).
                        const t = -sunFactor;
                        r = 233 - t * 62;
                        g = 239 - t * 52;
                        b = 248 - t * 28; // keep blue high -> cold shadow
                    }

                    // Ambient occlusion / ridge highlight from curvature.
                    r += curvature * 11; g += curvature * 12; b += curvature * 11;

                    // Altitude tint: summits cooler & bright, valleys a touch warmer.
                    r += (0.5 - alt) * 11;
                    b += (alt - 0.5) * 13;
                    g += (alt - 0.5) * 4;

                    // Aerial perspective: high terrain hazes slightly toward the sky.
                    const haze = alt * 0.12;
                    r = r * (1 - haze) + 200 * haze;
                    g = g * (1 - haze) + 216 * haze;
                    b = b * (1 - haze) + 236 * haze;

                    r += grain; g += grain; b += grain;

                    r = r < 0 ? 0 : r > 255 ? 255 : r;
                    g = g < 0 ? 0 : g > 255 ? 255 : g;
                    b = b < 0 ? 0 : b > 255 ? 255 : b;

                    ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();

                    // Sparkle: Glitzern auf sonnigem Schnee — bei Sonnenphase
                    // deutlich dichter & mit Funkel-Animation (perf-neutral).
                    const sunny = shadowMultiplier > 1.15;
                    const sparkleGate = sunny ? 1004 : 1016;
                    if (sunFactor > (sunny ? 0.25 : 0.5) && (((idx * 2654435761) >>> 0) & 1023) > sparkleGate) {
                        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.004 + (idx % 97)));
                        ctx.fillStyle = `rgba(255,255,255,${0.75 * twinkle})`;
                        ctx.fillRect((x1 + x3) * 0.5 - scale, (y1 + y3) * 0.5 - scale, 2.2 * scale, 1.4 * scale);
                    }
                }

                // --- B. PISTE COVERAGE (TILE TINT) ---
                const pType = pCoverage[idx];
                if (pType > 0) {
                    const strength = pStrength[idx];
                    const condition = pCondition[idx];

                    if (pType === 4) {
                        // Orange blinking warning (roughly 2Hz)
                        const blink = (Math.sin(Date.now() * 0.012) + 1) / 2; // 0..1
                        ctx.fillStyle = `rgba(249, 115, 22, ${(0.2 + blink * 0.5) * strength})`; // Orange: #f97316
                    } else {
                        const diffKey = pType === 1 ? 'BLUE' : (pType === 2 ? 'RED' : 'BLACK');
                        const c = PISTE_DIFFICULTIES[diffKey].color;
                        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.alpha * strength * 0.8})`;
                    }
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.fill();

                    // --- B2. PISTE CONDITION PATCHES (Grey/Brown spots when condition is low) ---
                    // Only render at higher zoom for performance
                    if (scale > 0.3 && condition < 0.5 && pType !== 4) {
                        const patchSeed = ((idx * 23.47) % 1 + 1) % 1;
                        const threshold = (0.5 - condition) * 2.0; // Sparser patches

                        if (patchSeed < threshold) {
                            // Brown patches below 30%, otherwise grey
                            const isDirty = condition < 0.3 && (patchSeed < threshold * 0.4);
                            const patchAlpha = Math.min(0.45, (0.5 - condition) * 0.6 * strength);

                            ctx.fillStyle = isDirty
                                ? `rgba(139, 94, 60, ${patchAlpha})`  // Earthy Brown
                                : `rgba(190, 190, 190, ${patchAlpha})`; // Muddy Grey

                            const bX = (x1 + x2 + x3 + x4) / 4 + (patchSeed - 0.5) * 30 * scale;
                            const bY = (y1 + y2 + y3 + y4) / 4 + ((patchSeed * 17) % 1 - 0.5) * 15 * scale;
                            const bR = (7 + (patchSeed * 10)) * scale;

                            ctx.beginPath();
                            ctx.arc(bX, bY, bR, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }



                // --- C. BUILDING ON THIS TILE ---
                const b = buildingsByTile.get(idx);
                if (b) {
                    drawPlacedBuilding(ctx, b, rotation, gridSize, heightmap, isoX, isoY, scale, resort, sprites, time);
                }

                // --- D. TREES ON THIS TILE ---
                if (type === 1 || type === 5 || type === 6) {
                    if (scale > 0.18) {
                        // High detail: snow-dusted conifers with a lit/shadow split.
                        const noiseVal = (Math.sin(idx * 12.9898 + idx * 78.233) * 43758.5453) % 1;
                        const numTrees = Math.floor(Math.abs(noiseVal) * 2.4) + 1; // 1..3 (sparser -> less mush)
                        const snowCaps = scale > 0.32;
                        for (let t = 0; t < numTrees; t++) {
                            const tSeed = Math.abs((noiseVal * (t + 1) * 93.123) % 1);
                            const jx = tSeed * 0.8 - 0.4;
                            const jy = ((tSeed * 13.5) % 1) * 0.8 - 0.4;
                            const tx = isoX(i + 0.5 + jx, j + 0.5 + jy, z);
                            const ty = isoY(i + 0.5 + jx, j + 0.5 + jy, z);
                            const sVar = ((tSeed * 100) % 1) * 0.5 + 0.75;
                            const H = 17 * scale * sVar;     // foliage height
                            const W = 4.6 * scale * sVar;    // foliage half-width

                            // Palette: dark (shadow half) + light (sun half).
                            let dark, light;
                            if (type === 6) {            // Winter / bare
                                dark = '#64748b'; light = '#cbd5e1';
                            } else if (type === 5) {     // Mixed / autumn
                                const rand = (tSeed * 100) % 1;
                                if (rand < 0.33) { dark = '#b45309'; light = '#f59e0b'; }
                                else if (rand < 0.66) { dark = '#4d7c0f'; light = '#84cc16'; }
                                else { dark = '#15803d'; light = '#22c55e'; }
                            } else {                     // Conifer (standard) — slight hue variation
                                const v = (tSeed * 53.3) % 1;
                                dark = v < 0.5 ? '#0b3a2e' : '#0d4435';
                                light = v < 0.5 ? '#15803d' : '#1c8a47';
                            }

                            const baseY = ty;
                            const apexY = ty - H;

                            // Trunk (mostly hidden by foliage, peeks out at the base).
                            ctx.fillStyle = '#5b3a25';
                            ctx.fillRect(tx - 0.7 * scale, baseY - 1.5 * scale, 1.4 * scale, 3.5 * scale * sVar);

                            // Shadow (right) half.
                            ctx.fillStyle = dark;
                            ctx.beginPath();
                            ctx.moveTo(tx, apexY); ctx.lineTo(tx + W, baseY); ctx.lineTo(tx, baseY);
                            ctx.closePath(); ctx.fill();
                            // Lit (left) half.
                            ctx.fillStyle = light;
                            ctx.beginPath();
                            ctx.moveTo(tx, apexY); ctx.lineTo(tx, baseY); ctx.lineTo(tx - W, baseY);
                            ctx.closePath(); ctx.fill();

                            // Snow dusting near the crown (sun side).
                            if (snowCaps && type !== 5 && tSeed > 0.25) {
                                ctx.fillStyle = 'rgba(238,244,255,0.92)';
                                ctx.beginPath();
                                ctx.moveTo(tx, apexY);
                                ctx.lineTo(tx - W * 0.55, apexY + H * 0.28);
                                ctx.lineTo(tx, apexY + H * 0.20);
                                ctx.closePath(); ctx.fill();
                            }
                        }
                    } else {
                        // Low detail: simple forest dot.
                        if (x1 > -10 && x1 < screenW + 10 && y1 > -10 && y1 < screenH + 10) {
                            if (type === 6) ctx.fillStyle = '#94a3b8';
                            else if (type === 5) ctx.fillStyle = '#b45309';
                            else ctx.fillStyle = '#0f5132';
                            ctx.beginPath();
                            ctx.arc(x1, y1 - 2 * scale, 4 * scale, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }

                // --- C2. VEHICLES ON THIS TILE (Drawn LAST for this tile to avoid occlusion by trees/terrain) ---
                const vs = vehiclesByTile.get(idx);
                if (vs) {
                    vs.forEach(v => drawPistenbully(ctx, v, scale, rotation, gridSize, isoX, isoY, time));
                }
                const skidooParts = skidoosByTile.get(idx);
                if (skidooParts) {
                    // Sort parts? Maybe Sled before Vehicle if on same tile? 
                    // Usually order within same tile matters less if they don't overlap much.
                    // But if they are on same tile, Sled usually behind Vehicle.
                    skidooParts.forEach(part => {
                        if (part.type === 'vehicle') {
                            drawSkiDooVehicle(ctx, part.v, scale, rotation, gridSize, isoX, isoY, time);
                        } else {
                            drawSkiDooSled(ctx, part.v, scale, rotation, gridSize, isoX, isoY);
                        }
                    });
                }

                // --- C3. TRAFFIC ON THIS TILE (Z-Sorted) ---
                const traffic = trafficByTile.get(idx);
                if (traffic) {
                    traffic.forEach(v => drawTrafficVehicle(ctx, v, scale, gridSize, isoXW, isoYW, dt));
                }
            }
        }

        // BUBBLE PASS (After all tiles/vehicles drawn to ensure foreground)
        if (resort && resort.traffic) {
            resort.traffic.forEach(v => {
                if (v.bubble) drawTrafficBubble(ctx, v, scale, isoXW, isoYW, dt);
            });
        }

        // GUEST PASS (Render all guests)
        if (resort && resort.guests && resort.guests.length > 0) {
            const isGuestOccluded = (g) => {
                if (!resort.buildings || resort.buildings.length === 0) return false;
                const gx = Math.floor(g.x);
                const gy = Math.floor(g.y);
                for (const b of resort.buildings) {
                    if (b.type.isRoad) continue;
                    if (['parking_lot', 'parking_garage', 'bus_stop'].includes(b.type.id)) continue;
                    // Ticket office plaza should keep guests fully visible.
                    if (b.type.id === 'ticket_office') continue;
                    // Only hide inside "roofed" buildings; allow outdoor areas
                    const hasOutdoor = b.type.hasOutdoorTerrace || b.type.hasOutdoorBar || b.type.hasOutdoorPool || b.type.id === 'ticket_office';
                    const bRot = b.rotation || 0;
                    const isRotated = bRot === 90 || bRot === 270;
                    const w = isRotated ? b.type.size.height : b.type.size.width;
                    const h = isRotated ? b.type.size.width : b.type.size.height;
                    if (gx >= b.x && gx < b.x + w && gy >= b.y && gy < b.y + h) {
                        if (!hasOutdoor) return true;
                        // Occlude only the roofed core (center block)
                        const coreScale = 0.6;
                        const coreW = Math.max(1, Math.floor(w * coreScale));
                        const coreH = Math.max(1, Math.floor(h * coreScale));
                        const coreX = Math.floor(b.x + (w - coreW) / 2);
                        const coreY = Math.floor(b.y + (h - coreH) / 2);
                        if (gx >= coreX && gx < coreX + coreW && gy >= coreY && gy < coreY + coreH) {
                            return true;
                        }
                    }
                }
                return false;
            };

            resort.guests.forEach(guest => {
                if (guest.state === 'RIDING_LIFT') return;
                // OFFSCREEN-CULLING: unsichtbare Gäste kosten sonst Canvas-Zeit
                const gsx = isoXW(guest.x, guest.y, guest.z || 0);
                if (gsx < -40 || gsx > screenW + 40) return;
                const gsy = isoYW(guest.x, guest.y, guest.z || 0);
                if (gsy < -60 || gsy > screenH + 40) return;
                if (!isGuestOccluded(guest)) {
                    drawGuest(ctx, guest, scale, isoXW, isoYW);
                }
            });
        }

        // ===== POI-PASS: Gipfelkreuz, Talkreuz, Bergsee-Panorama =====
        if (resort && resort.pois && resort.pois.length > 0) {
            for (const poi of resort.pois) {
                const px = isoXW(poi.x + 0.5, poi.y + 0.5, poi.z);
                const py = isoYW(poi.x + 0.5, poi.y + 0.5, poi.z);
                if (px < -80 || px > screenW + 80 || py < -120 || py > screenH + 80) continue;

                // Dezenter Radius-Ring (gestrichelt, pulsierend)
                const ringPulse = 0.85 + Math.sin(time / 600) * 0.15;
                ctx.strokeStyle = `rgba(250, 204, 21, ${0.18 * ringPulse})`;
                ctx.lineWidth = 1.2 * scale;
                ctx.setLineDash([6 * scale, 5 * scale]);
                ctx.beginPath();
                ctx.ellipse(px, py, poi.radius * (TILE_SIZE / 2) * scale, poi.radius * (TILE_SIZE / 4) * scale, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);

                if (poi.id === 'lake') {
                    // PANORAMA-BANK mit Schild
                    ctx.fillStyle = '#5b3a25';
                    ctx.fillRect(px - 5 * scale, py - 3.2 * scale, 10 * scale, 1.6 * scale); // Sitz
                    ctx.fillRect(px - 4.4 * scale, py - 3.2 * scale, 1.2 * scale, 3.2 * scale);
                    ctx.fillRect(px + 3.2 * scale, py - 3.2 * scale, 1.2 * scale, 3.2 * scale);
                    // Schild
                    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.4 * scale;
                    ctx.beginPath(); ctx.moveTo(px + 7 * scale, py); ctx.lineTo(px + 7 * scale, py - 10 * scale); ctx.stroke();
                    ctx.fillStyle = '#0ea5e9';
                    ctx.fillRect(px + 4.5 * scale, py - 14 * scale, 5 * scale, 4 * scale);
                    ctx.fillStyle = '#e0f2fe';
                    ctx.font = `bold ${Math.max(6, 2.6 * scale)}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.fillText('◉', px + 7 * scale, py - 11 * scale);
                } else {
                    // HOLZKREUZ (Gipfel/Tal) mit Schneeauflage
                    const H = poi.id === 'summit' ? 18 : 14;
                    ctx.strokeStyle = '#4a2f1d';
                    ctx.lineWidth = 2.2 * scale;
                    ctx.beginPath();
                    ctx.moveTo(px, py); ctx.lineTo(px, py - H * scale);            // Stamm
                    ctx.moveTo(px - 5 * scale, py - H * 0.72 * scale);
                    ctx.lineTo(px + 5 * scale, py - H * 0.72 * scale);             // Querbalken
                    ctx.stroke();
                    // Schnee auf dem Querbalken + Kreuzspitze
                    ctx.strokeStyle = 'rgba(240, 248, 255, 0.9)';
                    ctx.lineWidth = 1 * scale;
                    ctx.beginPath();
                    ctx.moveTo(px - 5 * scale, py - (H * 0.72 + 1.2) * scale);
                    ctx.lineTo(px + 5 * scale, py - (H * 0.72 + 1.2) * scale);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(240, 248, 255, 0.9)';
                    ctx.beginPath();
                    ctx.arc(px, py - H * scale, 1.2 * scale, 0, Math.PI * 2);
                    ctx.fill();
                    // Fels-Sockel
                    ctx.fillStyle = '#6b7280';
                    ctx.beginPath();
                    ctx.ellipse(px, py + 0.6 * scale, 3.4 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

            }
        }

        // 3. SECOND PASS: MARKERS, UIF, LIFTS (Top Layers)
        // GRID OVERLAY (during building or terrain tool placement)
        if (placementMode === 'building_placing' || placementMode === 'lift_placing' || placementMode === 'terrain_tool') {
            drawGridOverlay(ctx, gridSize, scale, isoX, isoY, heightmap, rotation);

            // BUILDING PREVIEW
            if (placementMode === 'building_placing' && hoveredTile && selectedBuilding) {
                // Determine coloring based on validation
                const isValid = buildingValidation && buildingValidation.isValid;

                // Construct validation object expected by drawBuildingPreview
                const validationObj = {
                    valid: isValid,
                    reason: buildingValidation?.reason
                };

                drawBuildingPreview(ctx, selectedBuilding, hoveredTile, buildingRotation, rotation, gridSize, heightmap, scale, isoX, isoY, sprites, validationObj);
            }
        }
        if (resort && resort.buildings) drawSnowCoverageOverlay(ctx, resort.buildings, gridSize, heightmap, isoX, isoY, scale, rotation);

        // --- Pass 3: Piste Markers (Drawn after all tiles to avoid occlusion) ---
        if (scale > 0.22) {
            markersByTile.forEach((markers) => {
                markers.forEach(m => {
                    const len = Math.sqrt(m.dx * m.dx + m.dy * m.dy);
                    if (len === 0) return;
                    const wpx = -m.dy / len; const wpy = m.dx / len;
                    let pi = wpx, pj = wpy;
                    if (rotation === 90) { pi = wpy; pj = -wpx; }
                    else if (rotation === 180) { pi = -wpx; pj = -wpy; }
                    else if (rotation === 270) { pi = -wpy; pj = wpx; }
                    const markerOffset = m.markerRadius + 0.25;
                    const { i: vCi, j: vCj } = toVisual(m.seg.x, m.seg.y);
                    [1, -1].forEach(side => {
                        const vi = vCi + 0.5 + pi * markerOffset * side;
                        const vj = vCj + 0.5 + pj * markerOffset * side;
                        const sx = isoX(vi, vj, m.seg.z + 0.8);
                        const sy = isoY(vi, vj, m.seg.z + 0.8);
                        // Pole (smaller + less dominant)
                        ctx.strokeStyle = 'rgba(51,65,85,0.7)'; ctx.lineWidth = 1.2 * scale;
                        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 14 * scale); ctx.stroke();
                        // Flag (smaller + softer)
                        ctx.fillStyle = (m.p.avgDifficulty === 'BLACK')
                            ? 'rgba(15,23,42,0.75)'
                            : (m.p.avgDifficulty === 'RED')
                                ? 'rgba(239,68,68,0.72)'
                                : 'rgba(59,130,246,0.7)';
                        ctx.beginPath();
                        ctx.moveTo(sx, sy - 14 * scale);
                        ctx.lineTo(sx + side * 9 * scale, sy - 11.5 * scale);
                        ctx.lineTo(sx, sy - 9 * scale);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.8 * scale; ctx.stroke();
                    });
                });
            });
        }


        // Piste Markers & Numbers (After occlusion pass so they stay clean)
        if (resort && resort.pistes) {
            resort.pistes.forEach(p => {
                const mid = p.segments[Math.floor(p.segments.length / 2)];
                if (mid) {
                    const { i: mI, j: mJ } = toVisual(mid.x, mid.y);
                    const mx = isoX(mI + 0.5, mJ + 0.5, mid.z + 0.5); const my = isoY(mI + 0.5, mJ + 0.5, mid.z + 0.5);
                    ctx.fillStyle = (p.avgDifficulty === 'BLACK') ? '#333' : (p.avgDifficulty === 'RED') ? '#ff6464' : '#6495ED';
                    ctx.beginPath(); ctx.arc(mx, my, 18 * scale, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * scale; ctx.stroke();
                    ctx.fillStyle = '#fff'; ctx.font = `bold ${22 * scale}px Arial`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.number || '?', mx, my);
                }
            });
        }



        // Planning Preview - Handled by coverage map now
        /*
        if (currentPiste && currentPiste.segments.length > 0) {
            // ... (removed old line rendering)
        }
        */

        // Lifts & Previews
        placedLifts.forEach(lift => {
            const { start, end } = lift;

            // Lift type checks (used throughout rendering)
            const isCogRailway = lift.type.name.includes('Cog');
            const isDragLift = lift.type.name.includes('T-Bar') || lift.type.name.includes('Platter') || lift.type.name.includes('Carpet');
            const isChairlift = lift.type.name.includes('Chairlift');
            const isGondolaOrCableCar = lift.type.name.includes('Gondola') || lift.type.name.includes('Aerial Tramway');
            const showOpenLiftRiders = isChairlift || isDragLift;
            const carrierSeats = isChairlift
                ? Math.max(1, Math.min(8, Math.round(lift.type.capacity || 1)))
                : isDragLift
                    ? Math.max(1, Math.min(2, Math.round(lift.type.capacity || 1)))
                    : 1;
            const activeRiders = showOpenLiftRiders && resort?.guests
                ? resort.guests.filter(g => g.state === 'RIDING_LIFT' && g.rideLiftId === lift.id && !g.shouldRemove)
                : [];
            const usedRiderIds = new Set();

            // Apply rotation transform to lift coordinates
            const vS = toVisual(start.x, start.y);
            const vE = toVisual(end.x, end.y);

            const sx = isoX(vS.i + 0.5, vS.j + 0.5, start.z);
            const sy = isoY(vS.i + 0.5, vS.j + 0.5, start.z);
            const ex = isoX(vE.i + 0.5, vE.j + 0.5, end.z);
            const ey = isoY(vE.i + 0.5, vE.j + 0.5, end.z);

            // Build cable path points (stations + pylon tops)
            const cablePoints = [];

            // Start station (tracks end at platform/station center)
            // For cog railways, tracks should end at the PLATFORM (gray surface), not station center
            let trackStartX, trackStartY;
            if (isCogRailway) {
                // Calculate platform position (same as drawn later)
                const platformDist = 50 * scale;
                const platformD = 15 * scale;
                const platformCenterY = sy + platformDist;
                // Top edge of platform diamond
                trackStartX = sx;
                trackStartY = platformCenterY - platformD;
            } else {
                trackStartX = sx;
                trackStartY = sy;
            }

            cablePoints.push({
                x: trackStartX,
                y: trackStartY,
                worldX: start.x,
                worldY: start.y,
                worldZ: start.z // Ground level
            });

            // Support pylons for aerial lifts
            const isGroundBased = lift.type.name.includes('Cog') || lift.type.name.includes('Magic Carpet');
            const cableLength = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);

            if (!isGroundBased) {
                const numPylons = Math.max(2, Math.floor(cableLength / (150 * scale)));

                // Determine pylon height based on lift type and capacity
                let basePylonHeight = 30; // Default for small chairlifts
                if (isGondolaOrCableCar) {
                    basePylonHeight = lift.type.capacity >= 80 ? 60 : 50;
                } else if (isChairlift) {
                    basePylonHeight = lift.type.capacity >= 6 ? 40 : 30;
                } else if (isDragLift) {
                    basePylonHeight = 20;
                }

                for (let p = 1; p < numPylons; p++) {
                    const pylonProgress = p / numPylons;

                    // Calculate world coordinates for this pylon
                    const worldX = start.x + (end.x - start.x) * pylonProgress;
                    const worldY = start.y + (end.y - start.y) * pylonProgress;
                    const worldZ = start.z + (end.z - start.z) * pylonProgress;

                    // Get actual terrain height at this position
                    const tileX = Math.floor(worldX);
                    const tileY = Math.floor(worldY);
                    let terrainZ = worldZ;

                    if (tileX >= 0 && tileX < gridSize && tileY >= 0 && tileY < gridSize) {
                        const terrainIdx = tileY * gridSize + tileX;
                        terrainZ = heightmap[terrainIdx];
                    }

                    // Convert to visual coordinates
                    const vPylon = toVisual(worldX, worldY);

                    // Ground position (at terrain height)
                    const groundX = isoX(vPylon.i, vPylon.j, terrainZ);
                    const groundY = isoY(vPylon.i, vPylon.j, terrainZ);

                    // Pylon top is at ground + pylon height
                    // The cable should maintain minimum clearance above terrain
                    const minClearance = basePylonHeight;
                    const cableHeightAtPylon = terrainZ + minClearance;

                    const cableX = isoX(vPylon.i, vPylon.j, cableHeightAtPylon);
                    const cableY = isoY(vPylon.i, vPylon.j, cableHeightAtPylon);

                    // Calculate actual pylon height from ground to cable
                    const actualPylonHeight = groundY - cableY;

                    // Pylon width based on lift type
                    const pylonWidth = isGondolaOrCableCar ? 8 * scale : 4 * scale;

                    // Draw pylon from ground up
                    // Base shadow
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    ctx.beginPath();
                    ctx.ellipse(groundX, groundY, pylonWidth * 1.5, pylonWidth * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Pylon structure (tapered for realism)
                    const gradient = ctx.createLinearGradient(groundX, groundY, groundX, cableY);
                    gradient.addColorStop(0, '#555');
                    gradient.addColorStop(0.5, '#777');
                    gradient.addColorStop(1, '#999');
                    ctx.fillStyle = gradient;

                    // Draw as trapezoid (wider at bottom)
                    ctx.beginPath();
                    ctx.moveTo(groundX - pylonWidth, groundY);
                    ctx.lineTo(groundX + pylonWidth, groundY);
                    ctx.lineTo(groundX + pylonWidth * 0.6, cableY);
                    ctx.lineTo(groundX - pylonWidth * 0.6, cableY);
                    ctx.closePath();
                    ctx.fill();

                    // Add edge highlight for 3D effect
                    ctx.strokeStyle = '#888';
                    ctx.lineWidth = 1 * scale;
                    ctx.stroke();

                    // Cross-arm (support for cables) at top
                    const crossWidth = isGondolaOrCableCar ? 16 * scale : 12 * scale;
                    ctx.fillStyle = '#444';
                    ctx.fillRect(cableX - crossWidth, cableY - 2 * scale, crossWidth * 2, 4 * scale);

                    // Cable rollers/pulleys
                    ctx.fillStyle = '#333';
                    const rollerSize = isGondolaOrCableCar ? 4 * scale : 3 * scale;
                    ctx.fillRect(cableX - crossWidth - rollerSize, cableY - 3 * scale, rollerSize, 6 * scale);
                    ctx.fillRect(cableX + crossWidth, cableY - 3 * scale, rollerSize, 6 * scale);

                    // Add this pylon top to cable path
                    cablePoints.push({
                        x: cableX,
                        y: cableY,
                        worldX: worldX,
                        worldY: worldY,
                        worldZ: cableHeightAtPylon
                    });
                }
            }


            // End station - also connect to platform for cog railways
            let trackEndX, trackEndY;
            if (isCogRailway) {
                // Calculate platform position (same as drawn later)
                const platformDist = 50 * scale;
                const platformD = 15 * scale;
                const platformCenterY = ey + platformDist;
                // Top edge of platform diamond
                trackEndX = ex;
                trackEndY = platformCenterY - platformD;
            } else {
                trackEndX = ex;
                trackEndY = ey;
            }

            cablePoints.push({
                x: trackEndX,
                y: trackEndY,
                worldX: end.x,
                worldY: end.y,
                worldZ: end.z // Ground level
            });

            // Draw cable segments or railway tracks following the pylon path
            if (isCogRailway) {
                // Draw railway tracks instead of cables for cog railway
                ctx.strokeStyle = '#4a4a4a';
                ctx.lineWidth = 2.5 * scale;

                // Draw continuous track with rail ties, following terrain
                for (let i = 0; i < cablePoints.length - 1; i++) {
                    const p1 = cablePoints[i];
                    const p2 = cablePoints[i + 1];

                    // Calculate direction for parallel rails
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const nx = -dy / length; // Perpendicular
                    const ny = dx / length;

                    const railOffset = 3 * scale; // Distance between rails

                    // For terrain following: interpolate intermediate points along the segment
                    // Use fewer steps for smoother, less curved tracks
                    const numSteps = Math.max(3, Math.floor(length / (40 * scale))); // Reduced from 20 for gentler curves
                    const interpolatedPoints = [];

                    for (let step = 0; step <= numSteps; step++) {
                        const t = step / numSteps;

                        let screenX, screenY, terrainZ, worldX, worldY;

                        // At exact start/end of segment, use the precise cablePoint coordinates
                        if (step === 0) {
                            // Use exact start point from cablePoints
                            screenX = p1.x;
                            screenY = p1.y;
                            terrainZ = p1.worldZ;
                            worldX = p1.worldX;
                            worldY = p1.worldY;
                        } else if (step === numSteps) {
                            // Use exact end point from cablePoints
                            screenX = p2.x;
                            screenY = p2.y;
                            terrainZ = p2.worldZ;
                            worldX = p2.worldX;
                            worldY = p2.worldY;
                        } else {
                            // For intermediate points, blend with terrain
                            worldX = p1.worldX + (p2.worldX - p1.worldX) * t;
                            worldY = p1.worldY + (p2.worldY - p1.worldY) * t;

                            // Get terrain height at this position
                            const tileX = Math.floor(worldX);
                            const tileY = Math.floor(worldY);
                            terrainZ = p1.worldZ + (p2.worldZ - p1.worldZ) * t; // Default: linear interpolation

                            if (tileX >= 0 && tileX < gridSize && tileY >= 0 && tileY < gridSize) {
                                const terrainIdx = tileY * gridSize + tileX;
                                const actualTerrainZ = heightmap[terrainIdx];

                                // Blend between linear path and terrain height for smoother tracks
                                // 70% terrain, 30% linear interpolation = gentler adaptation
                                terrainZ = terrainZ * 0.3 + actualTerrainZ * 0.7;
                            }

                            // Convert to visual coordinates
                            const vPos = toVisual(worldX, worldY);
                            screenX = isoX(vPos.i, vPos.j, terrainZ);
                            screenY = isoY(vPos.i, vPos.j, terrainZ);
                        }

                        interpolatedPoints.push({ x: screenX, y: screenY, worldZ: terrainZ, worldX: worldX, worldY: worldY });
                    }

                    // Draw left rail following terrain
                    ctx.beginPath();
                    ctx.strokeStyle = '#555';
                    ctx.lineWidth = 2 * scale;
                    for (let j = 0; j < interpolatedPoints.length; j++) {
                        const pt = interpolatedPoints[j];
                        // Calculate perpendicular offset at this point
                        let perpX = nx, perpY = ny;
                        if (j > 0) {
                            const prevPt = interpolatedPoints[j - 1];
                            const segDx = pt.x - prevPt.x;
                            const segDy = pt.y - prevPt.y;
                            const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
                            if (segLen > 0) {
                                perpX = -segDy / segLen;
                                perpY = segDx / segLen;
                            }
                        }

                        if (j === 0) {
                            ctx.moveTo(pt.x + perpX * railOffset, pt.y + perpY * railOffset);
                        } else {
                            ctx.lineTo(pt.x + perpX * railOffset, pt.y + perpY * railOffset);
                        }
                    }
                    ctx.stroke();

                    // Draw right rail following terrain
                    ctx.beginPath();
                    for (let j = 0; j < interpolatedPoints.length; j++) {
                        const pt = interpolatedPoints[j];
                        let perpX = nx, perpY = ny;
                        if (j > 0) {
                            const prevPt = interpolatedPoints[j - 1];
                            const segDx = pt.x - prevPt.x;
                            const segDy = pt.y - prevPt.y;
                            const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
                            if (segLen > 0) {
                                perpX = -segDy / segLen;
                                perpY = segDx / segLen;
                            }
                        }

                        if (j === 0) {
                            ctx.moveTo(pt.x - perpX * railOffset, pt.y - perpY * railOffset);
                        } else {
                            ctx.lineTo(pt.x - perpX * railOffset, pt.y - perpY * railOffset);
                        }
                    }
                    ctx.stroke();

                    // Draw rack rail (gear track in middle) following terrain
                    ctx.beginPath();
                    ctx.strokeStyle = '#666';
                    ctx.lineWidth = 1.5 * scale;
                    ctx.setLineDash([3 * scale, 2 * scale]);
                    for (let j = 0; j < interpolatedPoints.length; j++) {
                        const pt = interpolatedPoints[j];
                        if (j === 0) {
                            ctx.moveTo(pt.x, pt.y);
                        } else {
                            ctx.lineTo(pt.x, pt.y);
                        }
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Draw rail ties/sleepers at terrain-aware positions
                    for (let j = 0; j < interpolatedPoints.length; j++) {
                        const pt = interpolatedPoints[j];

                        // Calculate perpendicular direction at this tie
                        let perpX = nx, perpY = ny;
                        if (j > 0) {
                            const prevPt = interpolatedPoints[j - 1];
                            const segDx = pt.x - prevPt.x;
                            const segDy = pt.y - prevPt.y;
                            const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
                            if (segLen > 0) {
                                perpX = -segDy / segLen;
                                perpY = segDx / segLen;
                            }
                        }

                        // Draw wooden tie
                        ctx.strokeStyle = '#3d2817';
                        ctx.lineWidth = 3 * scale;
                        ctx.beginPath();
                        ctx.moveTo(pt.x + perpX * railOffset * 1.5, pt.y + perpY * railOffset * 1.5);
                        ctx.lineTo(pt.x - perpX * railOffset * 1.5, pt.y - perpY * railOffset * 1.5);
                        ctx.stroke();
                    }
                }
            } else {
                // Draw cable segments for other lift types
                ctx.strokeStyle = isGondolaOrCableCar ? '#555' : '#666';
                ctx.lineWidth = isGondolaOrCableCar ? 4 * scale : 3 * scale;
                ctx.setLineDash([]);

                for (let i = 0; i < cablePoints.length - 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(cablePoints[i].x, cablePoints[i].y);
                    ctx.lineTo(cablePoints[i + 1].x, cablePoints[i + 1].y);
                    ctx.stroke();
                }
            }

            // Stations - Different types based on lift
            // Bottom Station
            if (isDragLift) {
                drawLiftStation(ctx, sx, sy, 20, 15, 18, scale, 'rgb(139, 69, 19)', lift.type);
            } else if (isChairlift) {
                drawLiftStation(ctx, sx, sy, 25, 20, 20, scale, 'rgb(139, 69, 19)', lift.type);
            } else if (isGondolaOrCableCar) {
                drawLiftStation(ctx, sx, sy, 45, 45, 30, scale, 'rgb(120, 90, 60)', lift.type);
            } else if (isCogRailway) {
                // Realistic station building (4x3 tiles = 80x60 px)
                drawLiftStation(ctx, sx, sy, 80, 60, 25, scale, 'rgb(139, 69, 19)', lift.type);

                // Isometric platform in front of station
                const platformDist = 50 * scale; // Distance from station center
                const platformW = 40 * scale; // Half-width
                const platformD = 15 * scale; // Half-depth

                // Platform is a diamond shape (isometric rectangle)
                // Center point below station
                const pCenterX = sx;
                const pCenterY = sy + platformDist;

                // Four corners of platform diamond
                const pTop = { x: pCenterX, y: pCenterY - platformD };
                const pRight = { x: pCenterX + platformW, y: pCenterY };
                const pBottom = { x: pCenterX, y: pCenterY + platformD };
                const pLeft = { x: pCenterX - platformW, y: pCenterY };

                // Draw platform surface
                ctx.fillStyle = '#9ca3af';
                ctx.beginPath();
                ctx.moveTo(pTop.x, pTop.y);
                ctx.lineTo(pRight.x, pRight.y);
                ctx.lineTo(pBottom.x, pBottom.y);
                ctx.lineTo(pLeft.x, pLeft.y);
                ctx.closePath();
                ctx.fill();

                // Platform edge highlight
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1 * scale;
                ctx.stroke();

                // Yellow safety line at front edge
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2 * scale;
                ctx.beginPath();
                ctx.moveTo(pLeft.x, pLeft.y);
                ctx.lineTo(pBottom.x, pBottom.y);
                ctx.lineTo(pRight.x, pRight.y);
                ctx.stroke();
            }

            // Top Station (all lift types get end station)
            if (isChairlift) {
                drawLiftStation(ctx, ex, ey, 25, 20, 20, scale, 'rgb(139, 69, 19)', lift.type);
            } else if (isGondolaOrCableCar) {
                drawLiftStation(ctx, ex, ey, 45, 45, 30, scale, 'rgb(120, 90, 60)', lift.type);
            } else if (isCogRailway) {
                // Realistic station building (4x3 tiles = 80x60 px)
                drawLiftStation(ctx, ex, ey, 80, 60, 25, scale, 'rgb(139, 69, 19)', lift.type);

                // Isometric platform in front of station
                const platformDist = 50 * scale; // Distance from station center
                const platformW = 40 * scale; // Half-width
                const platformD = 15 * scale; // Half-depth

                // Platform is a diamond shape (isometric rectangle)
                // Center point below station
                const pCenterX = ex;
                const pCenterY = ey + platformDist;

                // Four corners of platform diamond
                const pTop = { x: pCenterX, y: pCenterY - platformD };
                const pRight = { x: pCenterX + platformW, y: pCenterY };
                const pBottom = { x: pCenterX, y: pCenterY + platformD };
                const pLeft = { x: pCenterX - platformW, y: pCenterY };

                // Draw platform surface
                ctx.fillStyle = '#9ca3af';
                ctx.beginPath();
                ctx.moveTo(pTop.x, pTop.y);
                ctx.lineTo(pRight.x, pRight.y);
                ctx.lineTo(pBottom.x, pBottom.y);
                ctx.lineTo(pLeft.x, pLeft.y);
                ctx.closePath();
                ctx.fill();

                // Platform edge highlight
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1 * scale;
                ctx.stroke();

                // Yellow safety line at front edge
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2 * scale;
                ctx.beginPath();
                ctx.moveTo(pLeft.x, pLeft.y);
                ctx.lineTo(pBottom.x, pBottom.y);
                ctx.lineTo(pRight.x, pRight.y);
                ctx.stroke();
            } else if (isDragLift) {
                drawLiftStation(ctx, ex, ey, 15, 12, 15, scale, 'rgb(100, 60, 30)', lift.type);
            }

            // Animated vehicles following the cable path
            const speed = lift.type.speed || 3;
            const isLargeLift = lift.type.capacity >= 50;

            // For bidirectional movement, we need vehicles going both ways
            // Keep the same total number but split them between up and down
            const baseNumVehicles = (isLargeLift || isCogRailway) ? 1 : (isDragLift ? 8 : Math.max(3, Math.floor(cableLength / (80 * scale))));

            // For continuous movement: we render each vehicle twice - once going up, once going down
            const vehiclesPerDirection = (isLargeLift || isCogRailway) ? 1 : baseNumVehicles;

            for (let c = 0; c < vehiclesPerDirection; c++) {
                // Render vehicles in BOTH directions at the same time
                for (let direction = 0; direction < ((isLargeLift || isCogRailway) ? 1 : 2); direction++) {
                    const isGoingUp = direction === 0;

                    // Calculate progress based on direction
                    let progress;
                    if (isLargeLift || isCogRailway) {
                        // Large lifts: single vehicle going back and forth
                        const cycleTime = time / (250000 / speed);
                        const cycle = cycleTime % 2;
                        progress = cycle < 1 ? cycle : (2 - cycle);

                        // Add station stops: pause at start (0-0.08) and end (0.92-1.0)
                        const stopDuration = 0.08; // 8% of journey time at each station
                        if (progress < stopDuration) {
                            progress = 0; // Hold at start station
                        } else if (progress > (1 - stopDuration)) {
                            progress = 1; // Hold at end station
                        } else {
                            // Adjust progress to account for stop time
                            progress = (progress - stopDuration) / (1 - 2 * stopDuration);
                        }
                    } else {
                        // Multiple vehicles: continuous circulation
                        const vehicleOffset = c / vehiclesPerDirection;
                        const timeProgress = (time / (250000 / speed)) % 1;

                        if (isGoingUp) {
                            // Going up: normal progress
                            progress = (timeProgress + vehicleOffset) % 1;
                        } else {
                            // Going down: reverse progress, offset by 0.5 to stagger from up-going
                            progress = 1 - ((timeProgress + vehicleOffset) % 1);
                        }
                    }

                    // Find position along cable path
                    // Calculate total path length
                    let totalPathLength = 0;
                    const segmentLengths = [];
                    for (let i = 0; i < cablePoints.length - 1; i++) {
                        const segLen = Math.sqrt(
                            (cablePoints[i + 1].x - cablePoints[i].x) ** 2 +
                            (cablePoints[i + 1].y - cablePoints[i].y) ** 2
                        );
                        segmentLengths.push(segLen);
                        totalPathLength += segLen;
                    }

                    // Find which segment the vehicle is on
                    const targetDistance = progress * totalPathLength;
                    let accumulatedDistance = 0;
                    let cx = sx, cy = sy, prevCx = sx, prevCy = sy; // Store previous position for rotation
                    let trackDirX = 1, trackDirY = 0; // Direction vector of current track segment
                    let vehicleWorldZ = start.z; // For terrain-aware positioning

                    for (let i = 0; i < segmentLengths.length; i++) {
                        if (accumulatedDistance + segmentLengths[i] >= targetDistance) {
                            const segmentProgress = (targetDistance - accumulatedDistance) / segmentLengths[i];

                            // Calculate world position for terrain-aware height
                            const worldX = cablePoints[i].worldX + (cablePoints[i + 1].worldX - cablePoints[i].worldX) * segmentProgress;
                            const worldY = cablePoints[i].worldY + (cablePoints[i + 1].worldY - cablePoints[i].worldY) * segmentProgress;
                            vehicleWorldZ = cablePoints[i].worldZ + (cablePoints[i + 1].worldZ - cablePoints[i].worldZ) * segmentProgress;

                            // Convert to visual coordinates
                            const vPos = toVisual(worldX, worldY);
                            const cx = isoX(vPos.i, vPos.j, vehicleWorldZ);
                            const cy = isoY(vPos.i, vPos.j, vehicleWorldZ);

                            // Draw Vehicle
                            if (drawLiftCarrier) {
                                let riders = null;
                                if (showOpenLiftRiders && isGoingUp && activeRiders.length > 0) {
                                    const slotRiders = activeRiders
                                        .filter(r => {
                                            if (usedRiderIds.has(r.id)) return false;
                                            const slot = (r.rideCarrierSlot ?? (r.id % vehiclesPerDirection));
                                            return ((slot % vehiclesPerDirection) + vehiclesPerDirection) % vehiclesPerDirection === c;
                                        })
                                        .sort((a, b) => (a.id || 0) - (b.id || 0));
                                    if (slotRiders.length > 0) {
                                        riders = slotRiders.slice(0, carrierSeats);
                                        riders.forEach(r => usedRiderIds.add(r.id));
                                    }
                                }
                                drawLiftCarrier(ctx, lift, cx, cy, scale, isGoingUp, isCogRailway, time, riders);
                            }
                            break;
                        }
                        accumulatedDistance += segmentLengths[i];
                    }
                }
            }
        });

        // Lift placement preview (null-safe)
        if (placementMode === 'lift_placing' && selectedLiftType && hoveredTile) {
            const start = liftStartPoint || null;
            const end = {
                x: hoveredTile.x,
                y: hoveredTile.y,
                z: hoveredTile.z ?? (heightmap[hoveredTile.y * gridSize + hoveredTile.x] || 0)
            };

            const vEnd = toVisual(end.x, end.y);
            const ex = isoX(vEnd.i + 0.5, vEnd.j + 0.5, end.z);
            const ey = isoY(vEnd.i + 0.5, vEnd.j + 0.5, end.z);

            // Hover marker for first click
            if (!start) {
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
                ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
                ctx.lineWidth = 2 * scale;
                ctx.beginPath();
                ctx.arc(ex, ey, 10 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else {
                const vStart = toVisual(start.x, start.y);
                const sx = isoX(vStart.i + 0.5, vStart.j + 0.5, start.z);
                const sy = isoY(vStart.i + 0.5, vStart.j + 0.5, start.z);

                const valid = liftPreviewValidation?.valid !== false;
                const lineColor = valid ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)';
                const haloColor = valid ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';

                ctx.strokeStyle = lineColor;
                ctx.lineWidth = Math.max(2, 4 * scale);
                ctx.setLineDash([8 * scale, 6 * scale]);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = haloColor;
                ctx.beginPath();
                ctx.arc(sx, sy, 10 * scale, 0, Math.PI * 2);
                ctx.arc(ex, ey, 10 * scale, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 2 * scale;
                ctx.beginPath();
                ctx.arc(sx, sy, 10 * scale, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(ex, ey, 10 * scale, 0, Math.PI * 2);
                ctx.stroke();

                if (liftPreviewValidation?.reason) {
                    ctx.font = `${12 * scale}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.strokeText(liftPreviewValidation.reason, ex, ey - 14 * scale);
                    ctx.fillStyle = '#f8fafc';
                    ctx.fillText(liftPreviewValidation.reason, ex, ey - 14 * scale);
                }
            }
        }

        // Snow particles overlay
        if (weather.isSnowing) {
            const elapsed = now - weather.lastSnowTime;
            if (elapsed > weather.snowDuration) {
                weather.isSnowing = false;
                weather.particles = [];
            } else {
                const tScale = Math.max(0.4, Math.min(2.2, dt / 16.6667));
                let snowAlpha = 1;
                if (elapsed < 3000) snowAlpha = elapsed / 3000;
                else if (elapsed > weather.snowDuration - 3000) snowAlpha = (weather.snowDuration - elapsed) / 3000;
                ctx.fillStyle = '#f1f5f9';
                weather.particles.forEach(p => {
                    p.x += p.drift * tScale;
                    p.y += p.speed * tScale;
                    if (p.y > screenH + 12) {
                        p.y = -10 - Math.random() * 30;
                        p.x = Math.random() * screenW;
                    }
                    if (p.x < -20) p.x = screenW + 10;
                    if (p.x > screenW + 20) p.x = -10;

                    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * snowAlpha));
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * Math.max(0.7, scale * 1.2), 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
            }
        }

        // 2. Render Fog if active
        if (weather.isFoggy) {
            const fogElapsed = now - weather.lastFogTime;
            if (fogElapsed > weather.fogDuration) {
                weather.isFoggy = false;
                weather.fogParticles = [];
            } else {
                // Master Fade for Fog
                let masterAlpha = 1.0;
                if (fogElapsed < 5000) masterAlpha = fogElapsed / 5000;
                else if (fogElapsed > weather.fogDuration - 5000) masterAlpha = (weather.fogDuration - fogElapsed) / 5000;

                // --- RENDER FOG (Global Brute Force) ---

                weather.fogParticles.forEach(p => {
                    // Updates
                    p.wx += p.speedX;
                    p.wy += p.speedY;

                    // Project to Screen
                    const screenX = isoX(p.wx, p.wy, p.wz);
                    const screenY = isoY(p.wx, p.wy, p.wz);
                    const screenRadius = p.radius * scale * 30; // Scale radius

                    // Render Soft Bloom
                    // Skip if way off screen
                    if (screenX < -screenRadius || screenX > screenW + screenRadius ||
                        screenY < -screenRadius || screenY > screenH + screenRadius) return;

                    const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, screenRadius);
                    gradient.addColorStop(0, `rgba(230, 240, 255, ${p.opacity * masterAlpha})`);
                    gradient.addColorStop(1, 'rgba(230, 240, 255, 0)');

                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        }

        // 3. Sun Phase (Post-Weather Sunshine)
        if (weather.isSunPhase) {
            const sunElapsed = now - weather.lastSunTime;
            if (sunElapsed > weather.sunDuration) {
                weather.isSunPhase = false;
            } else {
                // Fade in/out logic
                let sunAlpha = 0;
                if (sunElapsed < 3000) sunAlpha = sunElapsed / 3000;
                else if (sunElapsed > weather.sunDuration - 3000) sunAlpha = (weather.sunDuration - sunElapsed) / 3000;
                else sunAlpha = 1;

                // 1. Sun Bloom / God Ray Effect (Top Left)
                // Large radial gradient to wash the screen with warm light
                const sunGradient = ctx.createRadialGradient(0, 0, 100, screenW / 2, screenH / 2, screenW);
                sunGradient.addColorStop(0, `rgba(255, 250, 220, ${0.4 * sunAlpha})`); // Bright Warm Center
                sunGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);

                ctx.fillStyle = sunGradient;
                ctx.globalCompositeOperation = 'screen'; // Additive blending for light
                ctx.fillRect(0, 0, screenW, screenH);
                ctx.globalCompositeOperation = 'source-over'; // Reset
            }
        }
    };



    useGameLoop((dt) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Update Game Logic
        if (resort) {
            // 1. Update general resort logic
            if (resort.update) {
                resort.update(dt, heightmap, gridSize, landcover);
            }

            // 2. Update Vehicles
            if (resort.updatePistenbullies) resort.updatePistenbullies(dt, heightmap, gridSize, landcover);
            if (resort.updateSkidoos) resort.updateSkidoos(dt, heightmap, gridSize, landcover);
            if (resort.updateHelicopters) resort.updateHelicopters(dt, heightmap, gridSize, landcover);
            if (resort.updateTraffic) resort.updateTraffic(dt, heightmap, gridSize);
        }

        if (canvasRef.current) {
            draw(canvasRef.current.getContext('2d'), dt);
        }
    });

    return (
        <canvas
            ref={canvasRef}
            onMouseDown={(e) => {
                if (e.button === 0) {
                    isDragging.current = true;
                    lastMousePos.current = { x: e.clientX, y: e.clientY };
                }
            }}
            onMouseMove={(e) => {
                const rect = canvasRef.current.getBoundingClientRect();
                const mX = e.clientX - rect.left;
                const mY = e.clientY - rect.top;
                if (!isDragging.current) {
                    const newTile = screenToIso(mX, mY, scale, offset.x, offset.y, rotation, gridSize, heightmap);
                    // Only update if tile actually changed (prevents excessive re-renders)
                    if (newTile && (!hoveredTile || newTile.x !== hoveredTile.x || newTile.y !== hoveredTile.y)) {
                        setHoveredTile(newTile);
                    } else if (!newTile && hoveredTile) {
                        setHoveredTile(null);
                    }
                }
            }}
            onMouseLeave={() => setHoveredTile(null)}
            onWheel={(e) => {
                // Zoom zum Mauszeiger: der Punkt unter dem Cursor bleibt fixiert
                const factor = Math.exp(-e.deltaY * 0.0012);
                const next = Math.max(0.08, Math.min(4, scale * factor));
                const ratio = next / scale;
                if (ratio !== 1) {
                    setOffset(o => ({
                        x: e.clientX - (e.clientX - o.x) * ratio,
                        y: e.clientY - (e.clientY - o.y) * ratio
                    }));
                    setScale(next);
                }
            }}
            onClick={(e) => {
                // Check if we clicked on a guest first
                if (!placementMode && !pistePlacementMode && resort && resort.guests && resort.guests.length > 0 && onGuestClick) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mX = e.clientX - rect.left;
                    const mY = e.clientY - rect.top;

                    let closest = null;
                    let closestDist = Infinity;
                    const hitRadius = 12 * scale;

                    for (const guest of resort.guests) {
                        const gx = isoXW(guest.x, guest.y, guest.z || 0);
                        const gy = isoYW(guest.x, guest.y, guest.z || 0);
                        const dist = Math.sqrt((mX - gx) ** 2 + (mY - gy) ** 2);
                        if (dist < hitRadius && dist < closestDist) {
                            closest = guest;
                            closestDist = dist;
                        }
                    }

                    if (closest) {
                        onGuestClick(closest);
                        return;
                    }
                }

                // Check if we clicked on a Piste Number Marker first
                if (resort && resort.pistes) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mX = e.clientX - rect.left;
                    const mY = e.clientY - rect.top;

                    for (const p of resort.pistes) {
                        const mid = p.segments[Math.floor(p.segments.length / 2)];
                        if (mid) {
                            const { i: mI, j: mJ } = toVisual(mid.x, mid.y);
                            const mx = isoX(mI + 0.5, mJ + 0.5, mid.z);
                            const my = isoY(mI + 0.5, mJ + 0.5, mid.z);

                            const dist = Math.sqrt((mX - mx) ** 2 + (mY - my) ** 2);
                            if (dist < 20 * scale) {
                                if (onSelectPiste) onSelectPiste(p);
                                return; // Stop here, we found our piste
                            }
                        }
                    }
                }

                // Check if we clicked on a lift
                if (!placementMode && !pistePlacementMode && placedLifts && placedLifts.length > 0 && onLiftClick) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mX = e.clientX - rect.left;
                    const mY = e.clientY - rect.top;
                    let closestLift = null;
                    let closestScore = Infinity;

                    for (const lift of placedLifts) {
                        if (!lift?.start || !lift?.end) continue;
                        const vStart = toVisual(lift.start.x, lift.start.y);
                        const vEnd = toVisual(lift.end.x, lift.end.y);
                        const sx = isoX(vStart.i + 0.5, vStart.j + 0.5, lift.start.z || 0);
                        const sy = isoY(vStart.i + 0.5, vStart.j + 0.5, lift.start.z || 0);
                        const ex = isoX(vEnd.i + 0.5, vEnd.j + 0.5, lift.end.z || 0);
                        const ey = isoY(vEnd.i + 0.5, vEnd.j + 0.5, lift.end.z || 0);

                        const dLine = distToSegment(mX, mY, sx, sy, ex, ey);
                        const dStart = Math.sqrt((mX - sx) ** 2 + (mY - sy) ** 2);
                        const dEnd = Math.sqrt((mX - ex) ** 2 + (mY - ey) ** 2);
                        const score = Math.min(dLine, dStart * 0.85, dEnd * 0.85);
                        const hitRadius = Math.max(16, 26 * scale);

                        if (score < hitRadius && score < closestScore) {
                            closestScore = score;
                            closestLift = lift;
                        }
                    }

                    if (closestLift) {
                        onLiftClick(closestLift);
                        return;
                    }
                }

                // Check if we clicked on a building
                if (resort && resort.buildings) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mX = e.clientX - rect.left;
                    const mY = e.clientY - rect.top;

                    // Reverse search for buildings (back to front) to get the one on top
                    for (let i = resort.buildings.length - 1; i >= 0; i--) {
                        const b = resort.buildings[i];
                        const bRot = b.rotation || 0;
                        const isRotated = bRot === 90 || bRot === 270;
                        const w = isRotated ? b.type.size.height : b.type.size.width;
                        const h = isRotated ? b.type.size.width : b.type.size.height;

                        // Check if click is within building footprint
                        const clickedTile = screenToIso(mX, mY, scale, offset.x, offset.y, rotation, gridSize, heightmap);
                        if (clickedTile &&
                            clickedTile.x >= b.x && clickedTile.x < b.x + w &&
                            clickedTile.y >= b.y && clickedTile.y < b.y + h) {
                            if (onBuildingClick) onBuildingClick(b);
                            return;
                        }
                    }
                }

                // Default tile selection
                if (hoveredTile) onSelectTile(hoveredTile.x, hoveredTile.y, { rotation: buildingRotation });
            }}
            onDoubleClick={() => {
                if (hoveredTile && onDoubleClick) onDoubleClick(hoveredTile.x, hoveredTile.y);
            }}
            style={{ display: 'block', background: '#87CEEB' }}
        />
    );
};

export default WorldCanvas;
