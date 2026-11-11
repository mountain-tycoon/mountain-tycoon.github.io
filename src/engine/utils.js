// ============================================================
// PROZEDURALER LANDSCHAFTS-GENERATOR
// Config-gesteuert: jedes Kampagnen-Level (und der Sandbox-Modus)
// übergibt eigene Parameter — Berge, Wälder, Flüsse, Seen, Gletscher.
// Landcover-Codes: 0 Schnee, 1 Nadelwald, 2 Wasser, 3 Fels,
//                  4 Asphalt, 5 Mischwald, 6 Winterwald, 7 Wiese, 8 Gletscher
// ============================================================
export function generateWorldData(size, config) {
    const cfg = config || {};
    let seed = cfg.seed !== undefined ? cfg.seed : 12345;

    // Seeded random number generator
    const seededRandom = (s) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };

    const peakHeight = cfg.peakHeight ?? 450;        // max. Gipfelhöhe
    const peakCountCfg = cfg.peakCount ?? (3 + Math.floor(seededRandom(seed + 5000) * 3));
    const outerHillsCfg = cfg.outerHills ?? (2 + Math.floor(seededRandom(seed) * 2));
    const ridgeCountCfg = cfg.ridges ?? 3;
    const ruggedness = cfg.ruggedness ?? 0.35;       // 0 sanft .. 1 schroff
    const treeLineCfg = cfg.treeLine ?? 250;
    const snowLineCfg = cfg.snowLine ?? 0;           // darunter: Wiese statt Schnee
    const glacierLine = cfg.glacierLine ?? null;     // darüber: Gletschereis
    const forestDensity = cfg.forestDensity ?? 0.7;
    const forestMix = cfg.forestMix || 'conifer';
    const riverCount = cfg.riverCount ?? 0;
    const riverWidth = cfg.riverWidth ?? 2.0;
    const lakeCount = cfg.lakeCount ?? 0;
    const isVolcano = !!cfg.volcano;

    let params = {
        valleyDepth: cfg.valleyDepth ?? 10,
        smoothness: Math.max(0.7, 0.98 - ruggedness * 0.22),
        treeLine: treeLineCfg,
        parkingX: 10,
        parkingY: 10,
        parkingSize: 8,
        flatZoneSize: 30,
        parkingTransitionSize: 150
    };

    const heightmap = new Float32Array(size * size);
    const landcover = new Uint8Array(size * size);
    const decorations = new Uint8Array(size * size);
    const variety = new Uint8Array(size * size);

    // Multi-octave noise
    const getNoise = (x, y, freq, amp) => {
        let value = 0;
        value += Math.sin(x * freq + seed * 0.1) * Math.cos(y * freq + seed * 0.2) * amp;
        value += Math.sin(x * freq * 2.3 + seed * 0.3) * Math.cos(y * freq * 1.7 + seed * 0.4) * (amp * 0.5);
        return value;
    };

    // Check if point is in parking area or transition zone
    const isInParkingLot = (x, y) => {
        const dx = Math.abs(x - params.parkingX);
        const dy = Math.abs(y - params.parkingY);
        return dx <= params.parkingSize && dy <= params.parkingSize;
    };

    const getParkingBlend = (x, y) => {
        const dx = Math.abs(x - params.parkingX);
        const dy = Math.abs(y - params.parkingY);
        const dist = Math.max(dx, dy);

        if (dist <= params.flatZoneSize) return 1.0;  // Fully flat infrastructure zone
        if (dist >= params.parkingTransitionSize) return 0.0;  // Full terrain

        // Smooth transition
        const t = (dist - params.flatZoneSize) / (params.parkingTransitionSize - params.flatZoneSize);
        return 1 - (t * t);  // Quadratic easing
    };

    // First: central peaks (Anzahl & Höhe aus Level-Config)
    const hills = [];
    const numCentralPeaks = peakCountCfg;

    // peakSpread: 0.25 = kompakt, 0.5+ = weitläufig über die Karte verteilt
    const peakSpread = cfg.peakSpread ?? 0.25;

    for (let i = 0; i < numCentralPeaks; i++) {
        const centerX = size * 0.58 + (seededRandom(seed + i * 5100) - 0.5) * size * peakSpread * 2;
        const centerY = size * 0.58 + (seededRandom(seed + i * 5200) - 0.5) * size * peakSpread * 2;

        hills.push({
            x: centerX,
            y: centerY,
            height: peakHeight * (0.55 + seededRandom(seed + i * 5300) * 0.45),
            radius: size * (0.6 + seededRandom(seed + i * 5400) * 0.1),  // HUGE radius for gradual rise
            sharpness: 2.5 + seededRandom(seed + i * 5500) * 0.5 + ruggedness * 0.5,
            stretchAngle: seededRandom(seed + i * 5600) * Math.PI * 2,
            stretchFactor: 1.0 + seededRandom(seed + i * 5700) * (0.5 + ruggedness * 0.4),
            noiseScale: 0.02 + seededRandom(seed + i * 5800) * (0.03 + ruggedness * 0.03)
        });
    }

    // VULKAN-MODUS (Japan): ein dominanter, symmetrischer Kegel
    if (isVolcano) {
        hills.push({
            x: size * 0.62,
            y: size * 0.62,
            height: peakHeight,
            radius: size * 0.55,
            sharpness: 3.2,          // gleichmäßiger Kegel
            stretchAngle: 0,
            stretchFactor: 1.0,      // perfekt symmetrisch
            noiseScale: 0.015
        });
    }

    // Then: Add gentler outer hills
    const numHills = outerHillsCfg;

    for (let i = 0; i < numHills; i++) {
        // Keep hills away from parking area
        let hx, hy;
        let attempts = 0;
        do {
            // Use attempts in seed to ensure different result each time
            hx = 30 + seededRandom(seed + i * 400 + attempts * 1.1) * (size - 60);
            hy = 30 + seededRandom(seed + i * 500 + attempts * 1.7) * (size - 60);
            attempts++;
        } while (Math.sqrt((hx - params.parkingX) ** 2 + (hy - params.parkingY) ** 2) < 80 && attempts < 100);

        hills.push({
            x: hx,
            y: hy,
            height: (60 + seededRandom(seed + i * 600) * 80) * Math.max(0.5, peakHeight / 450),
            radius: size * (0.4 + seededRandom(seed + i * 700) * 0.2),  // MASSIVE radius
            sharpness: 1.8 + seededRandom(seed + i * 800) * 0.4,  // 1.8-2.2 = very smooth gentle
            // Asymmetry parameters for natural-looking hills
            stretchAngle: seededRandom(seed + i * 850) * Math.PI * 2,
            stretchFactor: 1.0 + seededRandom(seed + i * 860) * 0.15,  // 1.0-1.15 = minimal asymmetry
            noiseScale: 0.02 + seededRandom(seed + i * 870) * 0.03  // 0.02-0.05 = very smooth
        });
    }

    // Multiple gentle ridges radiating from center toward edges
    const ridges = [];
    const numRidges = ridgeCountCfg;

    for (let i = 0; i < numRidges; i++) {
        // Ridges start from center and radiate outward
        const angle = (i / numRidges) * Math.PI * 2 + seededRandom(seed + i * 900) * 0.5;

        ridges.push({
            x: size * 0.5,  // Start from CENTER
            y: size * 0.5,
            direction: angle,  // Radiate outward
            length: size * (0.4 + seededRandom(seed + i * 1100) * 0.3), // LONGER ridges
            width: size * (0.12 + seededRandom(seed + i * 1200) * 0.15), // Even wider = gentler
            height: (60 + seededRandom(seed + i * 1300) * 60) * Math.max(0.5, peakHeight / 450)
        });
    }

    // PASS 1: Generate raw heights
    const rawHeights = new Float32Array(size * size);

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const idx = y * size + x;

            // Enhanced multi-layer noise for natural variation
            let baseNoise = getNoise(x, y, 0.02, 1.0); // Large features
            baseNoise += getNoise(x, y, 0.05, 0.5);    // Medium features
            baseNoise += getNoise(x, y, 0.1, 0.25);    // Small features

            // Hills contribution with ASYMMETRY
            let hillHeight = 0;
            for (let h of hills) {
                const dx = x - h.x;
                const dy = y - h.y;

                // Transform coordinates to create elongated/asymmetric shape
                const angle = Math.atan2(dy, dx);
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Apply directional stretching
                const relativeAngle = angle - h.stretchAngle;
                const stretchedDist = dist * (1 + (h.stretchFactor - 1) * Math.abs(Math.cos(relativeAngle)));

                // Add noise-based irregularity to the shape
                const shapeNoise = getNoise(x, y, h.noiseScale, 1.0);
                const noisyRadius = h.radius * (1 + shapeNoise * 0.3); // ±30% variation

                const influence = Math.max(0, 1 - (stretchedDist * stretchedDist) / (noisyRadius * noisyRadius));
                hillHeight += Math.pow(influence, h.sharpness) * h.height;
            }

            // Ridge contribution
            let ridgeHeight = 0;
            for (let r of ridges) {
                const dx = x - r.x;
                const dy = y - r.y;

                // Distance along ridge direction
                const alongRidge = dx * Math.cos(r.direction) + dy * Math.sin(r.direction);
                const acrossRidge = -dx * Math.sin(r.direction) + dy * Math.cos(r.direction);

                // Only contribute if within ridge length
                if (Math.abs(alongRidge) < r.length / 2) {
                    const widthInfluence = Math.max(0, 1 - (acrossRidge * acrossRidge) / (r.width * r.width));
                    const lengthInfluence = Math.max(0, 1 - (alongRidge * alongRidge) / ((r.length / 2) * (r.length / 2)));
                    ridgeHeight += Math.pow(widthInfluence, 1.5) * lengthInfluence * r.height;
                }
            }

            // Height calculation with parking lot blending
            let height;
            const parkingBlend = getParkingBlend(x, y);

            if (parkingBlend >= 1.0) {
                // Fully flat parking area
                height = params.valleyDepth;
            } else if (parkingBlend > 0.0) {
                // Transition zone - blend between flat and terrain
                const terrainHeight = params.valleyDepth + hillHeight + ridgeHeight + (baseNoise * (20 + ruggedness * 35));
                height = params.valleyDepth * parkingBlend + terrainHeight * (1 - parkingBlend);
            } else {
                // Normal terrain
                height = params.valleyDepth;
                height += hillHeight;
                height += ridgeHeight;
                height += (baseNoise * (20 + ruggedness * 35));
            }

            rawHeights[idx] = height;
        }
    }

    // PASS 2: Heavy smoothing for gentle slopes
    const smoothPasses = 4;
    for (let pass = 0; pass < smoothPasses; pass++) {
        const tempHeights = new Float32Array(size * size);

        for (let x = 1; x < size - 1; x++) {
            for (let y = 1; y < size - 1; y++) {
                const idx = y * size + x;

                let sum = rawHeights[idx] * 4;
                sum += rawHeights[idx - 1];
                sum += rawHeights[idx + 1];
                sum += rawHeights[idx - size];
                sum += rawHeights[idx + size];

                tempHeights[idx] = sum / 8;
            }
        }

        for (let x = 1; x < size - 1; x++) {
            for (let y = 1; y < size - 1; y++) {
                const idx = y * size + x;
                rawHeights[idx] = rawHeights[idx] * (1 - params.smoothness) + tempHeights[idx] * params.smoothness;
            }
        }
    }

    // PASS 2.5: HÖHEN-NORMALISIERUNG — überlagerte Gipfel können sich
    // aufsummieren; wir skalieren so, dass der höchste Punkt der
    // konfigurierten Gipfelhöhe entspricht (Schnee-/Baum-/Gletschergrenzen
    // bleiben dadurch aussagekräftig).
    {
        let maxRaw = -Infinity;
        for (let k = 0; k < rawHeights.length; k++) {
            if (rawHeights[k] > maxRaw) maxRaw = rawHeights[k];
        }
        const targetMax = peakHeight;
        if (maxRaw > targetMax * 1.05) {
            const factor = (targetMax - params.valleyDepth) / (maxRaw - params.valleyDepth);
            for (let k = 0; k < rawHeights.length; k++) {
                rawHeights[k] = params.valleyDepth + (rawHeights[k] - params.valleyDepth) * factor;
            }
        }
    }

    // PASS 3: Apply landcover (Wiese, Wald, Gletscher, Fels)
    const rockLine = peakHeight * 1.35; // nur extreme Steilstücke werden Fels
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const idx = y * size + x;
            const val = rawHeights[idx];
            heightmap[idx] = val;

            landcover[idx] = 0; // Default: SNOW (white)

            // Wiese NUR am äußersten Kartenrand in Tallagen —
            // das Skigebiet selbst liegt komplett im Schnee.
            if (snowLineCfg > 0) {
                const edgeDist = Math.min(x, y, size - 1 - x, size - 1 - y);
                const edgeZone = size * 0.06; // ~6% Randstreifen
                const borderNoise = getNoise(x, y, 0.09, 1.0) * 3;
                if (edgeDist < edgeZone + borderNoise && val < snowLineCfg) {
                    landcover[idx] = 7; // GRASS
                }
            }

            // Wald (unterhalb der Baumgrenze, Dichte aus Config)
            if (val < params.treeLine && val > 25) {
                const fNoise = getNoise(x, y, 0.15, 1.0);
                if (fNoise > (0.55 - forestDensity * 0.5)) {
                    // Waldtyp je nach Level-Mix
                    const hash = Math.abs(x * 12345 + y * 67890 + seed);
                    let fType = 1; // Nadelwald
                    if (forestMix === 'mixed') {
                        fType = (hash % 10) < 3 ? 5 : 1;      // 30% Mischwald
                    } else if (forestMix === 'winter') {
                        fType = (hash % 10) < 4 ? 6 : 1;      // 40% kahler Winterwald
                    }
                    landcover[idx] = fType;
                    variety[idx] = hash % 5;
                }
            }

            // Gletscher: oberhalb der Gletschergrenze auf sanften Flächen
            if (glacierLine !== null && val > glacierLine) {
                const left = x > 0 ? rawHeights[idx - 1] : val;
                const right = x < size - 1 ? rawHeights[idx + 1] : val;
                const up = y > 0 ? rawHeights[idx - size] : val;
                const down = y < size - 1 ? rawHeights[idx + size] : val;
                const maxSlope = Math.max(Math.abs(val - left), Math.abs(val - right), Math.abs(val - up), Math.abs(val - down));
                const gNoise = getNoise(x, y, 0.07, 1.0) * 25;
                // Steilheits-Toleranz wächst mit der Gipfelhöhe, damit auch
                // hohe Berge großflächige Gletscherfelder tragen.
                const glacierSlopeMax = 12 + peakHeight / 45;
                if (maxSlope < glacierSlopeMax && val > glacierLine + gNoise) {
                    landcover[idx] = 8; // GLACIER
                }
            }

            // Fels für extreme Steilstücke in großer Höhe
            if (val > rockLine * 0.75) {
                const left = x > 0 ? rawHeights[idx - 1] : val;
                const right = x < size - 1 ? rawHeights[idx + 1] : val;
                const up = y > 0 ? rawHeights[idx - size] : val;
                const down = y < size - 1 ? rawHeights[idx + size] : val;
                const maxSlope = Math.max(Math.abs(val - left), Math.abs(val - right), Math.abs(val - up), Math.abs(val - down));
                if (maxSlope > 200 - ruggedness * 60) {
                    landcover[idx] = 3;
                }
            }
        }
    }

    // PASS 3.5: ANKUNFTSPLATZ — asphaltierte, ebene Fläche am Karteneingang,
    // direkt an die Zufahrtsstraße (y=10, x=0..15) angebunden. Hier kommen
    // die Autos & Busse an; der freie Start-Parkplatz wird darauf platziert.
    {
        const plazaX1 = 15, plazaX2 = 34; // Platz für Parkplatz + Busparkplatz
        const plazaY1 = 7, plazaY2 = 20;
        for (let py = plazaY1; py <= plazaY2; py++) {
            for (let px = plazaX1; px <= plazaX2; px++) {
                if (px < 0 || py < 0 || px >= size || py >= size) continue;
                const pIdx = py * size + px;
                heightmap[pIdx] = params.valleyDepth;
                landcover[pIdx] = 4; // ASPHALT
            }
        }
        // Zufahrtsstraßen-Streifen ebenfalls asphaltieren & ebnen
        for (let px = 0; px < plazaX1; px++) {
            for (let py = 9; py <= 11; py++) {
                const pIdx = py * size + px;
                heightmap[pIdx] = params.valleyDepth;
                landcover[pIdx] = 4;
            }
        }
    }

    // PASS 4: FLÜSSE — folgen dem steilsten Abstieg von hoch nach tief
    const distToStart = (x, y) => Math.sqrt((x - params.parkingX) ** 2 + (y - params.parkingY) ** 2);
    for (let r = 0; r < riverCount; r++) {
        // Startpunkt: hoch gelegen, weit weg vom Startbereich
        let bestX = -1, bestY = -1, bestScore = -Infinity;
        for (let attempt = 0; attempt < 60; attempt++) {
            const tx = Math.floor(seededRandom(seed + r * 900 + attempt * 13) * size);
            const ty = Math.floor(seededRandom(seed + r * 950 + attempt * 17) * size);
            if (distToStart(tx, ty) < 55) continue;
            const h = rawHeights[ty * size + tx];
            const score = h + seededRandom(seed + attempt) * 40;
            if (score > bestScore && h > peakHeight * 0.35) {
                bestScore = score; bestX = tx; bestY = ty;
            }
        }
        if (bestX < 0) continue;

        let cx = bestX, cy = bestY;
        let waterZ = rawHeights[cy * size + cx];
        const maxSteps = size * 3;
        for (let step = 0; step < maxSteps; step++) {
            // Fluss-Tiles im Radius setzen (monoton fallender Wasserspiegel)
            const rad = Math.max(1, Math.round(riverWidth * (0.7 + step / maxSteps * 0.6)));
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                    const tx = cx + dx, ty = cy + dy;
                    if (tx < 1 || ty < 1 || tx >= size - 1 || ty >= size - 1) continue;
                    if (dx * dx + dy * dy > rad * rad) continue;
                    if (distToStart(tx, ty) < params.flatZoneSize + 6) continue; // Startzone schützen
                    const tIdx = ty * size + tx;
                    heightmap[tIdx] = Math.min(heightmap[tIdx], waterZ - 1.5);
                    landcover[tIdx] = 2; // WATER
                }
            }

            // Nächster Schritt: tiefster Nachbar mit leichtem Mäander
            let nx = cx, ny = cy, lowest = Infinity;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const tx = cx + dx, ty = cy + dy;
                    if (tx < 1 || ty < 1 || tx >= size - 1 || ty >= size - 1) { continue; }
                    const h = rawHeights[ty * size + tx] + seededRandom(seed + step * 31 + dx * 7 + dy * 3) * 6; // Mäander
                    if (h < lowest) { lowest = h; nx = tx; ny = ty; }
                }
            }
            if (nx === cx && ny === cy) break;               // Senke erreicht
            cx = nx; cy = ny;
            waterZ = Math.min(waterZ, rawHeights[cy * size + cx]);
            if (cx <= 1 || cy <= 1 || cx >= size - 2 || cy >= size - 2) break; // Kartenrand
        }
    }

    // PASS 5: SEEN — flache Senken in tiefen Lagen fluten
    let placedLakes = 0;
    for (let attempt = 0; attempt < 200 && placedLakes < lakeCount; attempt++) {
        const lx = Math.floor(8 + seededRandom(seed + 7000 + attempt * 19) * (size - 16));
        const ly = Math.floor(8 + seededRandom(seed + 7500 + attempt * 23) * (size - 16));
        if (distToStart(lx, ly) < params.flatZoneSize + 14) continue;
        const lIdx = ly * size + lx;
        if (landcover[lIdx] === 2) continue;
        const h = heightmap[lIdx];
        if (h > peakHeight * 0.35) continue; // nur tiefe Lagen

        const radius = 3 + Math.floor(seededRandom(seed + 7900 + attempt) * 4); // 3-6
        // Flachheit prüfen
        let minH = Infinity, maxH = -Infinity;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tx = lx + dx, ty = ly + dy;
                if (tx < 1 || ty < 1 || tx >= size - 1 || ty >= size - 1) { minH = -1; break; }
                if (dx * dx + dy * dy > radius * radius) continue;
                const th = heightmap[ty * size + tx];
                if (th < minH) minH = th;
                if (th > maxH) maxH = th;
            }
        }
        if (minH < 0 || maxH - minH > 26) continue; // zu steil

        const waterLevel = minH - 2;
        for (let dy = -radius - 2; dy <= radius + 2; dy++) {
            for (let dx = -radius - 2; dx <= radius + 2; dx++) {
                const tx = lx + dx, ty = ly + dy;
                if (tx < 1 || ty < 1 || tx >= size - 1 || ty >= size - 1) continue;
                const dsq = dx * dx + dy * dy;
                const tIdx = ty * size + tx;
                if (dsq <= radius * radius) {
                    heightmap[tIdx] = waterLevel;
                    landcover[tIdx] = 2; // WATER
                } else if (dsq <= (radius + 2) * (radius + 2) && landcover[tIdx] !== 2) {
                    // Ufer sanft abflachen
                    const t = (Math.sqrt(dsq) - radius) / 2;
                    heightmap[tIdx] = heightmap[tIdx] * t + (waterLevel + 1.5) * (1 - t);
                }
            }
        }
        placedLakes++;
    }

    return { heightmap, landcover, decorations, variety, buildings: [], lifts: [], theme: cfg.theme || null };
}

// ============================================================
// MAUS → KACHEL (höhen- & rotationsbewusst)
// RAYCAST statt Iteration: Wir laufen den Sichtstrahl von hinten
// nach vorne durch alle Kacheln und nehmen die VORDERSTE Fläche,
// die den Bildschirmpunkt schneidet. Konvergiert immer — auch auf
// steilen Hängen und in gedrehten Ansichten (90/180/270).
// ============================================================
export function screenToIso(screenX, screenY, scale, offsetX, offsetY, rotation = 0, gridSize = 256, heightmap = null) {
    const TILE_SIZE = 32;
    const dx = screenX - offsetX;
    const dy = screenY - offsetY;

    const tileHalfW = (TILE_SIZE / 2) * scale;
    const tileHalfH = (TILE_SIZE / 4) * scale;

    // Visuelle (i,j) → Daten-Koordinaten (identisch zur Render-Abbildung)
    const toData = (vi, vj) => {
        if (rotation === 90) return { x: gridSize - 1 - vj, y: vi };
        if (rotation === 180) return { x: gridSize - 1 - vi, y: gridSize - 1 - vj };
        if (rotation === 270) return { x: vj, y: gridSize - 1 - vi };
        return { x: vi, y: vj };
    };

    // Screen-x legt (i - j) fest; entlang des Strahls variiert s = i + j.
    const diff = dx / tileHalfW; // = i - j

    if (!heightmap) {
        const s = dy / tileHalfH;
        const vi = (s + diff) / 2;
        const vj = (s - diff) / 2;
        // WICHTIG: erst kontinuierlich spiegeln, DANN floorn —
        // sonst Off-by-one auf gespiegelten Achsen.
        const d = toData(vi, vj);
        return {
            x: Math.max(0, Math.min(gridSize - 1, Math.floor(d.x))),
            y: Math.max(0, Math.min(gridSize - 1, Math.floor(d.y))),
            z: 0
        };
    }

    const zScale = scale;
    // Eckhöhe wie im Renderer: Ecke (i,j) nutzt die Daten-Kachel toData(i,j)
    const cornerZ = (ci, cj) => {
        const ti = Math.max(0, Math.min(gridSize - 1, ci));
        const tj = Math.max(0, Math.min(gridSize - 1, cj));
        const d = toData(ti, tj);
        return heightmap[d.y * gridSize + d.x] || 0;
    };
    // Bilineare Interpolation über die vier Ecken — entspricht exakt der
    // gezeichneten Terrain-Oberfläche (keine Treppenstufen-Fehler mehr).
    const zAt = (vi, vj) => {
        const fi = Math.floor(vi), fj = Math.floor(vj);
        const tx = vi - fi, ty = vj - fj;
        const z00 = cornerZ(fi, fj), z10 = cornerZ(fi + 1, fj);
        const z01 = cornerZ(fi, fj + 1), z11 = cornerZ(fi + 1, fj + 1);
        return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
    };

    // f(s) = projizierte Bildschirm-y der Oberfläche bei Tiefe s, minus Ziel-y.
    // Nulldurchgänge = der Strahl trifft die Oberfläche. Der LETZTE (größte s)
    // ist die vorderste, sichtbare Fläche (Painter's Algorithm).
    const fAt = (s) => {
        const vi = (s + diff) / 2;
        const vj = (s - diff) / 2;
        return s * tileHalfH - zAt(vi, vj) * zScale - dy;
    };

    const sMax = 2 * gridSize;
    const step = 0.5; // halbe Kachel Auflösung, danach Verfeinerung
    let bestS = null;
    let prevS = 0;
    let prevF = fAt(0);

    for (let s = step; s <= sMax; s += step) {
        const f = fAt(s);
        if (prevF <= 0 && f >= 0) {
            // Aufwärts-Durchgang: Strahl trifft die Oberfläche von oben
            const t = Math.abs(prevF) + Math.abs(f) > 1e-6
                ? Math.abs(prevF) / (Math.abs(prevF) + Math.abs(f))
                : 0.5;
            bestS = prevS + t * step; // letzter Treffer gewinnt (vorderste Fläche)
        } else if (prevF >= 0 && f <= 0) {
            // Abwärts-Durchgang: aufsteigende Geländewand — sichtbar ist die
            // HÖHERE Kachel dahinter (Vorderseite der Wand)
            bestS = s;
        }
        prevS = s;
        prevF = f;
    }

    // Fallback: kein Schnitt (z. B. Klick in den Himmel) → flache Schätzung
    if (bestS === null) {
        bestS = dy / tileHalfH;
    }

    const vi = (bestS + diff) / 2;
    const vj = (bestS - diff) / 2;
    // WICHTIG: erst kontinuierlich spiegeln, DANN floorn —
    // sonst Off-by-one auf gespiegelten Achsen (90/180/270).
    const d = toData(vi, vj);
    const dataX = Math.max(0, Math.min(gridSize - 1, Math.floor(d.x)));
    const dataY = Math.max(0, Math.min(gridSize - 1, Math.floor(d.y)));
    const finalZ = heightmap[dataY * gridSize + dataX] || 0;

    return { x: dataX, y: dataY, z: finalZ };
}

export function isCliff(x, y, heightmap, gridSize) {
    if (!heightmap) return false;

    const idx = y * gridSize + x;
    const z = heightmap[idx];

    // Ensure we are within bounds
    if (x < 1 || y < 1 || x >= gridSize - 1 || y >= gridSize - 1) return false;

    // Get neighbor heights
    const zRight = heightmap[y * gridSize + (x + 1)];
    const zDown = (y + 1) * gridSize + x < heightmap.length ? heightmap[(y + 1) * gridSize + x] : z;
    const zLeft = heightmap[y * gridSize + (x - 1)];
    const zUp = (y - 1) * gridSize + x >= 0 ? heightmap[(y - 1) * gridSize + x] : z;

    // Calculate gradient magnitude (Central Differences)
    const gradX = (zRight - zLeft) / 2;
    const gradY = (zDown - zUp) / 2;
    const gradMagnitude = Math.sqrt(gradX * gradX + gradY * gradY);

    // Threshold matching WorldCanvas visual
    return gradMagnitude > 16.9;
}
