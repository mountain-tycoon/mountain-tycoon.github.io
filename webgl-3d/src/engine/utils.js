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
    // Küstenlevel: Anteil der Kartenbreite, den das Meer einnimmt (0 = keins)
    const oceanFrac = cfg.ocean ?? 0;
    // ===== KARTENSTRECKUNG =====
    // `stretch` > 1 zieht die Landschaft in eine Richtung: die Gipfel rücken
    // quer zusammen und längs auseinander, es entstehen langgezogene Täler
    // statt einer gleichmäßig runden Karte. `stretchAxis` wählt die Richtung.
    const stretch = cfg.stretch ?? 1;
    const stretchX = (cfg.stretchAxis || 'x') === 'x';

    let params = {
        valleyDepth: cfg.valleyDepth ?? 10,
        smoothness: Math.max(0.7, 0.98 - ruggedness * 0.22),
        treeLine: treeLineCfg,
        parkingX: 10,
        parkingY: 10,
        parkingSize: 8,
        flatZoneSize: 9,
        parkingTransitionSize: 40
    };

    const heightmap = new Float32Array(size * size);
    const landcover = new Uint8Array(size * size);
    const decorations = new Uint8Array(size * size);
    const variety = new Uint8Array(size * size);

    // ===== RAUSCHEN =====
    // Vorher: sin(x)·cos(y)-Produkte. Die ergeben zwangsläufig ein
    // Eierkarton-Muster — überall dieselben kleinen Noppen, in jedem Level.
    // Jetzt: seed-basiertes Wertrauschen mit mehreren Oktaven (fBm) und
    // Domain-Warping. Kein Punkt wiederholt sich, große Formen bleiben
    // glatt, Details kommen nur dort, wo Oktaven sie liefern.
    const hash2 = (ix, iy) => {
        let n = (ix * 374761393 + iy * 668265263 + (seed | 0) * 1013904223) | 0;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const vnoise = (x, y) => {
        const ix = Math.floor(x), iy = Math.floor(y);
        let fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
        return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;      // 0..1
    };
    const fbm = (x, y, oct) => {
        let v = 0, a = 0.5, f = 1, norm = 0;
        for (let k = 0; k < oct; k++) {
            // je Oktave gedreht, damit sich keine Achsen abzeichnen
            const rx = x * f * 0.87 - y * f * 0.49 + k * 17.3, ry = x * f * 0.49 + y * f * 0.87 - k * 9.1;
            v += (vnoise(rx, ry) - 0.5) * a; norm += a; a *= 0.5; f *= 2.05;
        }
        return v / norm;                                                     // ~ -0.5..0.5
    };
    const getNoise = (x, y, freq, amp, oct = null, ridgeAmt = 0.45) => {
        const fx = stretchX ? freq / stretch : freq;
        const fy = stretchX ? freq : freq / stretch;
        // Domain-Warping mit Rauschen (nicht mit Sinus): geschwungene Grate
        const wx = x + (fbm(x * fx * 0.5 + 3.1, y * fy * 0.5, 2)) * (1.6 / freq) * 0.12;
        const wy = y + (fbm(x * fx * 0.5, y * fy * 0.5 + 7.7, 2)) * (1.6 / freq) * 0.12;
        // Grobe Frequenzen bekommen zwei Oktaven und einen Grat-Anteil
        // (scharfe Kämme), feine Frequenzen nur EINE Oktave und keine Grate —
        // sonst liegt überall feine Welligkeit auf den Hängen.
        const fine = freq >= 0.06;
        const base = fbm(wx * fx * 1.4, wy * fy * 1.4, oct ?? (fine ? 1 : 2)) * 2.2 * amp;
        if (fine || ridgeAmt <= 0) return base;
        const r = 1 - Math.abs(fbm(wx * fx * 0.9 + 11.3, wy * fy * 0.9 - 5.2, 1) * 2);
        return base + (r - 0.5) * amp * ridgeAmt;
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
        // RADIAL: mit max(dx,dy) entstand eine viereckige Plattform, die als
        // Kasten aus der Landschaft ragte. Kreis + weiche Übergangszone.
        const dist = Math.sqrt(dx * dx + dy * dy);

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

    // ===== GIPFELGERÜST =====
    // Liegt für das Level eine MASSIV-VORLAGE vor (nach einem echten
    // Skigebiet modelliert), wird deren Gipfelanordnung verwendet: reale
    // Lage zueinander, Höhenverhältnisse, Gratrichtungen. Sonst greift die
    // bisherige Zufallsverteilung.
    const massif = cfg.massif || null;
    if (massif && massif.length) {
        for (let i = 0; i < massif.length; i++) {
            const m = massif[i];
            // kleine Streuung, damit dasselbe Gebiet nicht exakt identisch
            // aussieht, die Grundform aber erhalten bleibt
            const jx = (seededRandom(seed + i * 911) - 0.5) * size * 0.025;
            const jy = (seededRandom(seed + i * 977) - 0.5) * size * 0.025;
            hills.push({
                x: m.x * size + jx,
                y: m.y * size + jy,
                height: peakHeight * m.h,
                radius: size * (m.r ?? 0.55),
                sharpness: m.sharp ?? 3.0,
                stretchAngle: ((m.angle ?? 0) * Math.PI) / 180,
                stretchFactor: m.stretch ?? 1.3,
                noiseScale: 0.018 + ruggedness * 0.028
            });
        }
    } else {
        for (let i = 0; i < numCentralPeaks; i++) {
            const centerX = size * 0.58 + (seededRandom(seed + i * 5100) - 0.5) * size * peakSpread * 2;
            const centerY = size * 0.58 + (seededRandom(seed + i * 5200) - 0.5) * size * peakSpread * 2;

            hills.push({
                x: centerX,
                y: centerY,
                height: peakHeight * (0.55 + seededRandom(seed + i * 5300) * 0.45),
                radius: size * (0.6 + seededRandom(seed + i * 5400) * 0.1),
                sharpness: 2.5 + seededRandom(seed + i * 5500) * 0.5 + ruggedness * 0.5,
                stretchAngle: seededRandom(seed + i * 5600) * Math.PI * 2,
                stretchFactor: 1.0 + seededRandom(seed + i * 5700) * (0.5 + ruggedness * 0.4),
                noiseScale: 0.02 + seededRandom(seed + i * 5800) * (0.03 + ruggedness * 0.03)
            });
        }
    }

    // ===== ZUSÄTZLICHE HÜGELSTAFFELUNG =====
    // Zwischen die Hauptgipfel kommen Vorberge, Kuppen und Rücken in stark
    // unterschiedlicher Größe. Ohne sie sieht das Gelände zwischen den
    // Massiven gleichförmig aus.
    {
        // Weniger als früher (7–11): zu viele kleine Kuppen verschmolzen zu
        // einem gleichförmigen Hügelmeer. Jetzt 3–5, bevorzugt größere Rücken.
        const extra = 3 + Math.floor(seededRandom(seed + 8800) * 3);
        for (let i = 0; i < extra; i++) {
            const r1 = seededRandom(seed + 8900 + i * 37);
            const r2 = seededRandom(seed + 9100 + i * 53);
            const r3 = seededRandom(seed + 9300 + i * 71);
            const r4 = seededRandom(seed + 9500 + i * 89);
            // Größenklassen: viele kleine Kuppen, wenige große Rücken
            const cls = r3 < 0.30 ? 0 : r3 < 0.65 ? 1 : 2;
            const hFac = [0.16, 0.30, 0.48][cls] * (0.6 + r4 * 0.8);
            const rad  = [0.16, 0.26, 0.40][cls] * (0.7 + r1 * 0.7);
            hills.push({
                x: size * (0.12 + r1 * 0.76),
                y: size * (0.12 + r2 * 0.76),
                height: peakHeight * hFac,
                radius: size * rad,
                // Schärfe streut breit: von flacher Kuppe bis markantem Kopf
                sharpness: 1.8 + r4 * 2.4,
                stretchAngle: r2 * Math.PI * 2,
                // manche Rücken stark langgezogen, andere fast rund
                stretchFactor: 1.0 + r3 * 1.6,
                noiseScale: 0.02 + r1 * 0.05
            });
        }
    }

    // ===== GIPFELAUFSÄTZE =====
    // Jeder Hauptgipfel bekommt einen schmalen, spitzen Aufsatz: so hebt
    // sich der Gipfel als EINZELNER Kopf aus dem breiten Massiv, statt dass
    // alles in runden Buckeln ineinander verläuft.
    {
        const mains = hills.slice();
        for (let i = 0; i < mains.length; i++) {
            const h = mains[i];
            const r = seededRandom(seed + 12000 + i * 131);
            hills.push({
                x: h.x + (seededRandom(seed + 12100 + i * 17) - 0.5) * size * 0.02,
                y: h.y + (seededRandom(seed + 12200 + i * 19) - 0.5) * size * 0.02,
                height: h.height * (0.26 + r * 0.14),
                radius: size * (0.09 + r * 0.05),
                sharpness: 2.0 + ruggedness * 1.2,
                stretchAngle: h.stretchAngle,
                stretchFactor: 1 + (h.stretchFactor - 1) * 0.5,
                noiseScale: 0.05 + ruggedness * 0.04
            });
        }
    }
    // ===== FELSNADELN / KLEINE SCHROFFE GIPFEL =====
    // Level-Config `spires`: zusätzliche kleine, sehr steile Türme an den
    // Flanken der Massive (Patagonien!). Durch ihre Steilheit werden sie
    // automatisch zu Fels.
    {
        const spires = cfg.spires ?? (peakHeight > 700 ? 2 : 0);
        const anchors = hills.slice(0, Math.max(1, peakCountCfg));
        for (let i = 0; i < spires; i++) {
            const a = anchors[i % anchors.length];
            const r1 = seededRandom(seed + 13000 + i * 41), r2 = seededRandom(seed + 13100 + i * 43), r3 = seededRandom(seed + 13200 + i * 47);
            const ang = r1 * Math.PI * 2, dist = size * (0.10 + r2 * 0.12);
            hills.push({
                x: Math.max(size * 0.15, Math.min(size * 0.85, a.x + Math.cos(ang) * dist)),
                y: Math.max(size * 0.15, Math.min(size * 0.85, a.y + Math.sin(ang) * dist)),
                height: peakHeight * (0.38 + r3 * 0.22) * (cfg.spireHeight ?? 1),
                radius: size * (0.05 + r2 * 0.03),
                sharpness: 1.4,
                stretchAngle: r3 * Math.PI * 2,
                stretchFactor: 1.1 + r1 * 0.4,
                noiseScale: 0.09
            });
        }
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
    // ===== MASSIV ZUERST, DANN NORMIEREN =====
    // Die Gipfelkörper (Hügel + Grate) werden separat berechnet und SO
    // skaliert, dass ihr höchster Punkt die Gipfelhöhe trifft. Erst danach
    // kommen Rauschen, Vorberge und Talzug dazu. Vorher wurde alles
    // gemeinsam normiert: entweder wurden Vorberge plattgedrückt (tote
    // Ebenen) oder — ohne Normierung — überlagerten sich die breiten
    // Massivkörper zu einem einzigen Klops in der Kartenmitte.
    const massifRaw = new Float32Array(size * size);
    let massifMax = 0;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const idx = y * size + x;

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
                // Formrauschen der Hügel: LANGWELLIG und ohne Grate — kurzwellige
                // Radiuswobbel erzeugten lauter kleine Buckel an den Hangfüßen.
                const shapeNoise = getNoise(x, y, h.noiseScale * 0.4, 1.0, 1, 0);
                const noisyRadius = h.radius * (1 + shapeNoise * 0.22);

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

            massifRaw[idx] = hillHeight + ridgeHeight;
            if (massifRaw[idx] > massifMax) massifMax = massifRaw[idx];
        }
    }
    // Massiv auf Gipfelhöhe normieren (Reserve 8 % für Rauschen obendrauf)
    const massifScale = massifMax > 0 ? (peakHeight * 0.92 - params.valleyDepth) / massifMax : 1;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const idx = y * size + x;
            const massif = massifRaw[idx] * massifScale;
            const hillHeight = massif, ridgeHeight = 0;
            // Enhanced multi-layer noise for natural variation
            let baseNoise = getNoise(x, y, 0.02, 1.0); // Large features
            baseNoise += getNoise(x, y, 0.007, 1.3, 1, 0.2);   // Sehr große Wellen: kein Talboden liegt tot eben
            baseNoise += getNoise(x, y, 0.05, 0.20, 1, 0);   // Medium features (glatt, ohne Grate)
            baseNoise += getNoise(x, y, 0.1, 0.04);    // Small features (sehr schwach: glatte Hänge)
            // ===== KÄMME UND KARE IM MASSIV =====
            // Gratrauschen, das nur IM Massiv wirkt: gliedert den Bergkörper in
            // Rücken, Kare und Seitentäler statt ihn als glatte Kuppel zu lassen.
            const inMassif = Math.min(1, massif / (peakHeight * 0.30));
            const carve = getNoise(x, y, 0.016, 1.0, 2, 1.1) * peakHeight * 0.14 * inMassif * (cfg.carve ?? 1);
            // ===== TAL INS MASSIV =====
            // Ein seichter Talzug vom Basisbereich in Richtung Massiv: breite
            // Mulde, nach innen flacher auslaufend. Gliedert das Gelände und
            // lässt das Skigebiet AN einem Berg liegen statt auf einer Kuppel.
            let valleyCut = 0;
            {
                const reach = cfg.valleyReach ?? 0.55;                  // Anteil der Strecke Basis→Massiv
                const vx0 = params.parkingX + 20, vy0 = params.parkingY + 20;
                const vx1 = size * 0.58, vy1 = size * 0.58;
                const ddx = vx1 - vx0, ddy = vy1 - vy0, ll = ddx * ddx + ddy * ddy || 1;
                let tA = ((x - vx0) * ddx + (y - vy0) * ddy) / ll;      // 0 Basis .. 1 Massivmitte
                const px = vx0 + ddx * tA, py = vy0 + ddy * tA;
                const wig = Math.sin(tA * 9 + seed * 0.3) * size * 0.03;   // leicht geschwungen
                const dPerp = Math.hypot(x - px, y - py) - wig;
                const width = size * (0.11 - tA * 0.05);
                const along = tA < 0 ? 0 : tA > reach ? Math.max(0, 1 - (tA - reach) / 0.18) : 1;
                const depthT = tA < 0.15 ? 1 : Math.max(0, 1 - (tA - 0.15) / (reach - 0.15 + 0.2));
                valleyCut = Math.exp(-(dPerp * dPerp) / (width * width)) * along * depthT * peakHeight * (cfg.valleyCutDepth ?? 0);
            }
            // ===== VORBERGE =====
            // Wo die Massive nicht mehr wirken (Kartenränder, Talzonen), lag
            // das Gelände tot eben. Dort rollen jetzt Vorberge und Rücken —
            // je weniger Massiv-Einfluss, desto stärker.
            const infl = Math.min(1, (hillHeight + ridgeHeight) / (peakHeight * 0.30));
            // (eine Oktave, kaum Grate: rund und glatt — keine feine Welligkeit)
            // Sockel: Vorbergland liegt ÜBER dem Talboden, sonst frisst der
            // weiche Talboden die Wellen wieder auf (= tote Ebenen).
            const foothill = ((getNoise(x, y, 0.022, 1.0, 1, 0.15) * (26 + ruggedness * 30)
                            + getNoise(x, y, 0.012, 1.0, 1, 0.2) * 38) + peakHeight * 0.075) * (1 - infl) * (cfg.foothills ?? 1);
            // Height calculation with parking lot blending
            let height;
            const parkingBlend = getParkingBlend(x, y);

            if (parkingBlend >= 1.0) {
                // Fully flat parking area
                height = params.valleyDepth;
            } else if (parkingBlend > 0.0) {
                // Transition zone - blend between flat and terrain
                const terrainHeight = params.valleyDepth + hillHeight + ridgeHeight + (baseNoise * (20 + ruggedness * 35)) + foothill + carve;
                height = params.valleyDepth * parkingBlend + terrainHeight * (1 - parkingBlend);
            } else {
                // Normal terrain
                height = params.valleyDepth;
                height += hillHeight;
                height += ridgeHeight;
                height += (baseNoise * (20 + ruggedness * 35));
                height += foothill + carve;
                height -= valleyCut;
                // Weicher Talboden: unter valleyDepth wird das Relief nur
                // gedämpft, nicht abgeschnitten — harte Klammern erzeugten
                // die großen, toten Ebenen.
                if (height < params.valleyDepth) height = params.valleyDepth - (params.valleyDepth - height) * 0.22;
            }

            rawHeights[idx] = height;
        }
    }

    // PASS 2: Heavy smoothing for gentle slopes
    const smoothPasses = 5;
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
            // NUR den oberen Bereich stauchen. Eine globale Skalierung drückte
            // auch Vorberge und Talrelief zusammen — genau das ließ die
            // Randzonen als tote Ebenen zurück.
            const knee = targetMax * 0.8;
            const factor = (targetMax - knee) / (maxRaw - knee);
            for (let k = 0; k < rawHeights.length; k++) {
                const h = rawHeights[k];
                if (h > knee) rawHeights[k] = knee + (h - knee) * factor;
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

    // (PASS 3.5, der alte rechteckige Asphalt-Ankunftsplatz auf fester Höhe,
    //  ist entfallen: Straßen, Parkplätze und Haltestellen entstehen im
    //  3D-Teil aus der Zufahrtsplanung — der Kasten ragte nur noch als
    //  viereckige Erhebung aus dem Gelände.)

    // PASS 3a: GEMÄSSIGTE HÄNGE IN MITTLERER HÖHE
    //
    // Wichtig: KEINE harte Neigungsgrenze. Ein Grenzwert, ab dem Material
    // umgelagert wird, erzeugt lauter gleich steile Facetten mit Absätzen
    // dazwischen — im Bild sieht das aus wie Höhenlinien. Stattdessen eine
    // gewichtete Diffusion: jeder Punkt gleicht sich anteilig seiner
    // Umgebung an, umso stärker je steiler er liegt. Das ergibt fließende,
    // sanft abfallende Flanken ganz ohne Stufen.
    {
        const lo = peakHeight * 0.15, hi = peakHeight * 0.82;
        const ITER = 10;
        const tmp = new Float32Array(heightmap.length);
        for (let it = 0; it < ITER; it++) {
            tmp.set(heightmap);
            for (let y = 1; y < size - 1; y++) {
                for (let x = 1; x < size - 1; x++) {
                    const idx = y * size + x;
                    const h = heightmap[idx];
                    if (h < lo || h > hi) continue;
                    // 8er-Nachbarschaft: gleichmäßiger als nur 4 Richtungen
                    const a = heightmap[idx-1], b = heightmap[idx+1];
                    const c2 = heightmap[idx-size], d = heightmap[idx+size];
                    const e = heightmap[idx-size-1], f = heightmap[idx-size+1];
                    const g = heightmap[idx+size-1], i2 = heightmap[idx+size+1];
                    const avg = (a + b + c2 + d) * 0.175 + (e + f + g + i2) * 0.075;
                    // Steilheit bestimmt die Stärke — weich, ohne Schwelle
                    const sl = Math.max(Math.abs(h-a), Math.abs(h-b), Math.abs(h-c2), Math.abs(h-d));
                    const soft = getNoise(x, y, 0.008, 1.0) * 0.5 + 0.5;   // Zonen
                    const k = Math.min(0.55, (sl / (peakHeight * 0.02)) * 0.18) * (0.5 + soft * 0.9);
                    tmp[idx] = h + (avg - h) * k;
                }
            }
            heightmap.set(tmp);
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
    for (let attempt = 0; attempt < 700 && placedLakes < lakeCount; attempt++) {
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
        // Deutlich strenger als vorher: ein Bergsee braucht ein flaches
        // Becken, sonst wirkt der (waagerechte) Spiegel wie hineingeschnitten.
        if (minH < 0 || maxH - minH > 9) continue;

        const waterLevel = minH - 2;
        // Uferwall glätten: die Ringzone wird auf ein leicht ansteigendes
        // Niveau gezogen, damit der See in einem echten Becken liegt.
        for (let dy = -radius - 4; dy <= radius + 4; dy++) {
            for (let dx = -radius - 4; dx <= radius + 4; dx++) {
                const tx = lx + dx, ty = ly + dy;
                if (tx < 1 || ty < 1 || tx >= size - 1 || ty >= size - 1) continue;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d <= radius || d > radius + 4) continue;
                const f = (d - radius) / 4;                 // 0 am Ufer .. 1 außen
                const tIdx2 = ty * size + tx;
                const target = waterLevel + 2 + f * 6;
                heightmap[tIdx2] = heightmap[tIdx2] * f * 0.55 + target * (1 - f * 0.55);
            }
        }
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

    // PASS 6: OZEAN — an einer Kartenkante läuft das Land ins Meer aus.
    // Für Küstenlevel (Fjordland, Hokkaidō): das Gelände senkt sich zur Küste
    // hin ab, unterhalb des Meeresspiegels wird geflutet. Die Küstenlinie ist
    // durch Rauschen ausgefranst, damit keine gerade Kante entsteht.
    if (oceanFrac > 0) {
        const depth = Math.round(size * oceanFrac);       // Tiefe des Meeresstreifens
        const seaLevel = 6;                               // Höhe des Wasserspiegels
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                // Abstand zur Küstenkante (obere Kante der Karte)
                const wobble = getNoise(x, y, 0.035, 1.0) * depth * 0.42;
                const dist = y - (depth * 0.55 + wobble);
                if (dist > depth * 0.5) continue;         // klar im Landesinneren
                // 1 an der Kante, 0 am Ende des Küstenbereichs
                const f = Math.max(0, Math.min(1, 1 - (dist + depth * 0.5) / depth));
                const ease = f * f * (3 - 2 * f);
                heightmap[idx] = heightmap[idx] * (1 - ease) + seaLevel * 0.4 * ease;
                if (heightmap[idx] <= seaLevel) {
                    heightmap[idx] = seaLevel;
                    landcover[idx] = 2;                   // WATER
                } else if (heightmap[idx] < seaLevel + 12 && landcover[idx] !== 2) {
                    landcover[idx] = 7;                   // Küstenwiese statt Wald
                }
            }
        }
    }

    // PASS 7: BASIS-HANG (ganz am Ende, nach Flüssen/Seen/Meer)
    // Das Startdorf liegt an der tiefsten Randkachel; die Demo-Bahn führt von
    // dort zum Hauptgipfel. Dazwischen darf KEIN Tal liegen: hinter dem Dorf
    // soll es gleichmäßig und anfangs sanft bergauf gehen — bebaubarer,
    // schiebbarer Hang statt "Dorf, Steilwand, dann runter ins Tal".
    // Entlang der Linie Randkachel→Gipfel wird ein Korridor auf eine
    // monoton steigende Rampe ANGEHOBEN (nie abgesenkt: Grate bleiben).
    {
        const M = 4;
        let sx = size * 0.58, sy = size * 0.58, hMax = -Infinity;
        for (let y = M; y < size - M; y++) for (let x = M; x < size - M; x++) {
            const h = heightmap[y * size + x]; if (h > hMax) { hMax = h; sx = x; sy = y; }
        }
        // tiefste, nicht zu steile Randkachel — dieselbe Wahl trifft später Scene3D
        const slopeAtR = (x, y) => { const i = y * size + x, z = heightmap[i];
            return Math.max(Math.abs(z - heightmap[i - 1]), Math.abs(z - heightmap[i + 1]), Math.abs(z - heightmap[i - size]), Math.abs(z - heightmap[i + size])); };
        let bx = M, by = M, hMin = Infinity;
        const consider = (x, y) => { if (landcover[y * size + x] === 2 || slopeAtR(x, y) > 8) return; const h = heightmap[y * size + x]; if (h < hMin) { hMin = h; bx = x; by = y; } };
        for (let x = M; x < size - M; x++) { consider(x, M); consider(x, size - 1 - M); }
        for (let y = M; y < size - M; y++) { consider(M, y); consider(size - 1 - M, y); }
        const ddx = sx - bx, ddy = sy - by, len2 = ddx * ddx + ddy * ddy || 1, len = Math.sqrt(len2);
        const W = size * (cfg.baseSlopeWidth ?? 0.17);
        const ease = cfg.baseSlopeEase ?? 1.45;               // >1: unten flach, oben steiler
        for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
            const i = y * size + x;
            if (landcover[i] === 2) continue;                 // Flussbett/See bleibt
            const t = ((x - bx) * ddx + (y - by) * ddy) / len2;
            if (t < -0.05 || t > 1) continue;
            const px = bx + ddx * t, py = by + ddy * t;
            const d = Math.hypot(x - px, y - py);
            if (d > W) continue;
            const tc = Math.max(0, Math.min(1, t));
            const ramp = hMin + (hMax - hMin) * Math.pow(tc, ease);
            // Korridor: innen voll, zum Rand hin weich auslaufend
            const wgt = (() => { const u = 1 - d / W; return u * u * (3 - 2 * u); })();
            const h = heightmap[i];
            if (ramp > h) heightmap[i] = h + (ramp - h) * wgt;
        }
        void len;
    }

    return { heightmap, landcover, decorations, variety, buildings: [], lifts: [], theme: cfg.theme || null };
}

// ============================================================
// SPIELFLÄCHE VERGRÖSSERN: die generierte Welt wird um den Faktor f je
// Seite hochgerechnet (4x Fläche bei f = 2). Die Höhen werden bilinear
// interpoliert, mit feinem Relief angereichert und um f skaliert, damit
// die Hangneigung je Kachel — und damit Pistencharakter, Felsgrenzen
// und Bebaubarkeit — erhalten bleibt. Landbedeckung: nächster Nachbar,
// Waldränder werden mit Rauschen aufgebrochen, damit keine 2x2-Blöcke
// entstehen.
// ============================================================
export function upsampleWorld(world, size, f = 2, opts = {}) {
    const S = size * f;
    const sd = (opts.seed ?? 7) | 0;
    const h2 = (ix, iy) => { let n = (ix * 374761393 + iy * 668265263 + sd * 1013904223) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    // bilinear geglättetes Wertrauschen an (fx, fy) mit Zellindex (ix, iy)
    const uHash = (ix, iy, fx, fy) => { let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty; };
    const { heightmap: H, landcover: L, decorations: D, variety: V } = world;
    const heightmap = new Float32Array(S * S);
    const landcover = new Uint8Array(S * S);
    const decorations = new Uint8Array(S * S);
    const variety = new Uint8Array(S * S);
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < H.length; i++) { if (H[i] < minZ) minZ = H[i]; if (H[i] > maxZ) maxZ = H[i]; }
    const range = (maxZ - minZ) || 1;
    const seed = opts.seed ?? 7;
    const detail = opts.detail ?? 1;
    const hAt = (x, y) => H[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    for (let y = 0; y < S; y++) {
        const fy = y / f, y0 = Math.floor(fy), ty = fy - y0;
        for (let x = 0; x < S; x++) {
            const fx = x / f, x0 = Math.floor(fx), tx = fx - x0;
            const h = (hAt(x0, y0) * (1 - tx) + hAt(x0 + 1, y0) * tx) * (1 - ty)
                    + (hAt(x0, y0 + 1) * (1 - tx) + hAt(x0 + 1, y0 + 1) * tx) * ty;
            // Nächster Nachbar für die Landbedeckung
            const nx = Math.min(size - 1, Math.round(fx)), ny = Math.min(size - 1, Math.round(fy));
            const src = ny * size + nx;
            let lc = L[src];
            // Waldränder aufbrechen: an Grenzen zwischen Wald und Nicht-Wald
            // entscheidet Rauschen, damit die Kante organisch wird.
            const isForest = (c) => c === 1 || c === 5 || c === 6;
            const alt = ((tx > 0.5 ? Math.min(size - 1, x0 + 1) : x0)) + size * ((ty > 0.5 ? Math.min(size - 1, y0 + 1) : y0));
            const lc2 = L[alt];
            if (isForest(lc) !== isForest(lc2)) {
                const n = Math.sin(x * 0.9 + seed) * Math.cos(y * 0.7 - seed * 0.3) + Math.sin((x - y) * 0.45 + seed);
                if (n > 0.15) lc = lc2;
            }
            // Feines Relief nur auf Land (nicht in Wasser/Gletscher), klein
            // genug, um Bebaubarkeit und Pistenlogik nicht zu ändern.
            let d = 0;
            if (lc !== 2 && lc !== 8 && detail > 0) {
                // nur GROSSE, weiche Wellen (kein Noppenmuster): zwei Oktaven
                // Hash-Rauschen mit Wellenlängen um 60 und 30 Kacheln
                const h1 = uHash(Math.floor(x / 60), Math.floor(y / 60), x / 60, y / 60);
                const h2 = uHash(Math.floor(x / 28), Math.floor(y / 28), x / 28, y / 28);
                d = ((h1 - 0.5) * 1.0 + (h2 - 0.5) * 0.35) * range * 0.006 * detail;
            }
            heightmap[y * S + x] = (h + d) * f;
            landcover[y * S + x] = lc;
            decorations[y * S + x] = D ? D[src] : 0;
            variety[y * S + x] = V ? V[src] : 0;
        }
    }
    // Seen: der Spiegel muss eben bleiben — Wasserkacheln bekommen die Höhe
    // ihrer Quellkachel (skaliert), ohne Relief.
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (landcover[y * S + x] !== 2) continue;
        const nx = Math.min(size - 1, Math.round(x / f)), ny = Math.min(size - 1, Math.round(y / f));
        heightmap[y * S + x] = H[ny * size + nx] * f;
    }
    return { ...world, heightmap, landcover, decorations, variety, gridSize: S, upsampled: f };
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
