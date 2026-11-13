// ============================================================
// 3D-TERRAIN-MESH aus den bestehenden Generator-Daten
// heightmap + landcover -> beleuchtetes Three.js-Mesh mit Vertex-Farben.
// Landcover: 0 Schnee 1 Nadelwald 2 Wasser 3 Fels 4 Asphalt
//            5 Mischwald 6 Winterwald 7 Wiese 8 Gletscher
// ============================================================
import * as THREE from 'three';
import { waterBedColor } from './Water3D.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

/**
 * Waldbild je Level: Baumartenmix und Grundton des Bestands.
 * Wird auch vom Umland-Wald (buildApronForest) genutzt, damit Karte und
 * Kulisse denselben Farbcharakter haben.
 */
export const FOREST_MIX_TABLE = {
        mittelgebirge: { spruce: 0.30, fir: 0.18, broad: 0.52, hue: [0.34, 0.58, 0.29] }, // Schwarzwald: helles Laubgrün
        alpen:         { spruce: 0.62, fir: 0.28, broad: 0.10, hue: [0.21, 0.46, 0.30] }, // sattes Alpengrün
        schweiz:       { spruce: 0.70, fir: 0.25, broad: 0.05, hue: [0.17, 0.41, 0.31] }, // kühles Tannengrün
        frankreich:    { spruce: 0.55, fir: 0.30, broad: 0.15, hue: [0.26, 0.51, 0.29] }, // frisches Mittelgrün
        italien:       { spruce: 0.40, fir: 0.22, broad: 0.38, hue: [0.44, 0.57, 0.26] }, // Dolomiten: Lärchen, gelbgrün
        norwegen:      { spruce: 0.80, fir: 0.16, broad: 0.04, hue: [0.15, 0.36, 0.32] }, // dunkles Blaugrün
        rockies:       { spruce: 0.55, fir: 0.40, broad: 0.05, hue: [0.27, 0.43, 0.25] }, // olivgrüne Kiefern
        kanada:        { spruce: 0.72, fir: 0.26, broad: 0.02, hue: [0.19, 0.44, 0.35] }, // tiefes Küstengrün
        anden:         { spruce: 0.28, fir: 0.16, broad: 0.56, hue: [0.48, 0.55, 0.28] }, // Südbuchen, ockergrün
        japan:         { spruce: 0.35, fir: 0.18, broad: 0.47, hue: [0.37, 0.56, 0.34] }  // Birken/Ahorn, hell
    };

/**
 * SCHNEELAGE — EINE Formel für Spielfeld UND Umland.
 * h = Höhe in Heightmap-Einheiten, limit = Schneegrenze (dito), gx/gy =
 * Rasterlage für das fleckige Rauschen. Liefert:
 *   nat  0..1  Anteil Naturschnee (0 = aper, 1 = geschlossen)
 *   gf   0..1  wie satt das Grün darunter wäre (tiefer = satter)
 * Beide Seiten rufen genau diese Funktion — damit taut alles identisch.
 */
export function snowLayer(h, limit, gx, gy) {
    const band = Math.max(1, limit * 0.30);
    const fadeSpan = Math.max(1, limit * 0.60);
    const patch = Math.sin(gx * 0.55 + Math.cos(gy * 0.31) * 2.3) * 0.5
                + Math.sin(gy * 0.47 - Math.sin(gx * 0.23) * 1.9) * 0.34
                + Math.sin((gx + gy) * 1.21) * 0.16;
    const jitter = patch * band * 0.55;
    const x = (h - (limit - band) + jitter) / band;
    const t = x < 0 ? 0 : x > 1 ? 1 : x;
    const nat = t * t * (3 - 2 * t);
    const gf = Math.max(0, Math.min(1, (limit - h) / fadeSpan)) * 0.85;
    return { nat, gf };
}
/** Bodenfarbe aus Grundfarbe + Schneelage — ebenfalls geteilt. */
export function snowShade(base, h, limit, gx, gy) {
    const { nat, gf } = snowLayer(h, limit, gx, gy);
    const gr = base[0] + (0.30 - base[0]) * gf;
    const gg = base[1] + (0.42 - base[1]) * gf;
    const gb = base[2] + (0.22 - base[2]) * gf;
    return [gr + (base[0] - gr) * nat, gg + (base[1] - gg) * nat, gb + (base[2] - gb) * nat, nat];
}
/** Grundfarbe von offenem Boden wie das Spielfeld (colorFor Typ 0). */
export function openGroundColor(alt, snowWarmth = 0) {
    const c = [0.92 + snowWarmth * 0.03, 0.94, 0.98 - snowWarmth * 0.04];
    const k = Math.max(0, Math.min(1, alt)) * 0.35;
    return [c[0] + (0.80 - c[0]) * k, c[1] + (0.86 - c[1]) * k, c[2] + (0.96 - c[2]) * k];
}

export function buildTerrainMesh(world, gridSize, theme = {}, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;

    const grassLight = (theme.grassLight || [140,176,96]).map(c => c/255);
    const grassDark  = (theme.grassDark  || [96,132,70]).map(c => c/255);
    const snowWarmth = theme.snowWarmth || 0;

    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
        const h = heightmap[i];
        if (h < minZ) minZ = h;
        if (h > maxZ) maxZ = h;
    }
    const range = (maxZ - minZ) || 1;

    const geo = new THREE.PlaneGeometry((gridSize-1)*tile, (gridSize-1)*tile, gridSize-1, gridSize-1);
    geo.rotateX(-Math.PI/2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const colorFor = (type, alt) => {
        if (type === 2) return [0.12,0.32,0.55];
        // Gletscher: klarer, kühler Eiston. Unten kompaktes Blaueis, nach oben
        // hin heller — die Facettierung kommt weiter unten als Rauschen dazu.
        // GLETSCHER: kompaktes Blaueis. Unten dichtes Türkisblau (alte, stark
        // verpresste Eisschichten), nach oben hin heller in Richtung Firn —
        // aber immer mit deutlichem Blauanteil, nie grau.
        if (type === 8) return mix([0.42,0.68,0.86],[0.76,0.90,0.99], clamp01(alt));
        // FELS: leicht warmer Grauton mit bräunlichem Einschlag statt
        // neutralem Beton — wirkt deutlich natürlicher.
        if (type === 3) return mix([0.40,0.37,0.35],[0.56,0.54,0.53], clamp01(alt));
        if (type === 4) return [0.22,0.24,0.28];
        if (type === 1 || type === 6) return [0.05,0.28,0.18];
        if (type === 5) return [0.20,0.40,0.16];
        if (type === 7) return mix(grassDark, grassLight, 0.5);
        let c = [0.92 + snowWarmth*0.03, 0.94, 0.98 - snowWarmth*0.04];
        return mix(c, [0.80,0.86,0.96], clamp01(alt)*0.35);
    };

    const rockCol = opts.rockCol || [0.42, 0.44, 0.48];
    for (let i = 0; i < pos.count; i++) {
        const gx = i % gridSize, gy = Math.floor(i / gridSize);
        const idx = gy * gridSize + gx;
        const z = heightmap[idx] || 0;
        pos.setY(i, z * hScale);
        const alt = (z - minZ) / range;
        // Unter Wasser liegt das Bett (hell am Ufer, dunkel in der Tiefe) – das Blau kommt von der Wasserfläche
        let c = (landcover[idx] === 2 && world.waterDepth) ? waterBedColor(world.waterDepth[idx]) : colorFor(landcover[idx], alt);

        // Hang-Gradient -> Felswand (wie im 2D-Renderer): steile Flächen
        // werden grau, unabhängig vom Landcover.
        const hl = gx > 0 ? heightmap[idx-1] : z, hr = gx < gridSize-1 ? heightmap[idx+1] : z;
        const hu = gy > 0 ? heightmap[idx-gridSize] : z, hd = gy < gridSize-1 ? heightmap[idx+gridSize] : z;
        const slope = Math.max(Math.abs(z-hl), Math.abs(z-hr), Math.abs(z-hu), Math.abs(z-hd));
        // Wasser wird nie zu Fels. Gletscher liegen fast immer steil — ohne
        // Ausnahme würde der Fels-Gradient den Eiston komplett grau übermalen,
        // deshalb greift er dort nur stark abgeschwächt und erst später.
        const isIce = landcover[idx] === 8;
        const t = landcover[idx] === 2 ? 0
            : isIce ? clamp01((slope - 9) / 9) * 0.35
            : clamp01((slope - 4) / 5);        // ab slope 4 Fels, ab 9 volle Felswand
        if (t > 0) {
            // Gebänderte Felswand: die Schichtdicke folgt der Höhe, dadurch
            // entstehen sichtbare Gesteinsbänke statt einer glatten Fläche.
            const band = Math.sin(z * 0.55 + gx * 0.05) * 0.5 + 0.5;
            const rc = mix(rockCol, [rockCol[0] * 1.22, rockCol[1] * 1.18, rockCol[2] * 1.12], band * 0.55);
            c = mix(c, rc, t);
        }

        const grain = (((idx * 374761393) >>> 24 & 15) - 7.5) / 255;
        let fr = 0, fg = 0, fb = 0;
        if (landcover[idx] === 8) {
            // FEINGRANULARE EISSTRUKTUR: zwei überlagerte Rauschebenen.
            // Grob = einzelne Eisplatten, fein = Körnung darauf. Das Rauschen
            // wirkt STÄRKER auf Rot als auf Blau, wodurch die hellen Stellen
            // firnweiß und die dunklen tiefblau werden — genau das Wechselspiel,
            // das einen Gletscher ausmacht.
            const bx = gx >> 1, by = gy >> 1;
            const coarse = ((((bx * 73856093) ^ (by * 19349663)) >>> 22) & 31) / 31 - 0.5;
            const fine = ((((gx * 374761393) ^ (gy * 668265263)) >>> 24) & 15) / 15 - 0.5;
            const n = coarse * 0.72 + fine * 0.28;
            fr = n * 0.135; fg = n * 0.085; fb = n * 0.030;
            // Spaltenzonen: schmale, dunkelblaue Bänder wie Gletscherspalten
            const crev = Math.sin(gx * 0.42 + gy * 0.17) * Math.sin(gy * 0.31 - gx * 0.09);
            if (crev > 0.82) { fr -= 0.14; fg -= 0.07; fb += 0.02; }
        }
        colors[i*3]   = clamp01(c[0] + grain + fr);
        colors[i*3+1] = clamp01(c[1] + grain + fg);
        colors[i*3+2] = clamp01(c[2] + grain + fb);
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData = { minZ, maxZ, hScale, gridSize, tile };
    return mesh;
}

export function buildForest(world, gridSize, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const half = ((gridSize-1)*tile)/2;

    const spots = [];
    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            const idx = gy*gridSize+gx;
            const t = landcover[idx];
            if (t !== 1 && t !== 5 && t !== 6) continue;
            if (((gx*73856093) ^ (gy*19349663)) & 1) continue;
            spots.push({ gx, gy, idx, winter: t === 6 });
        }
    }
    if (spots.length === 0) return null;

    // ===== Waldbild je Level =====
    // `mix` steuert die Anteile: schlanke Fichte / breite Tanne / Laubbaum.
    // Übersee-Level bekommen dadurch eine deutlich andere Waldzusammensetzung.
    // `hue` ist der Grundton des Bestands. Die Werte sind bewusst HELL und je
    // Level klar auseinandergezogen — vorher lagen alle bei fast demselben
    // dunklen Grün und die Level waren nicht auseinanderzuhalten.
    const FOREST_MIX = FOREST_MIX_TABLE;
    const mix = FOREST_MIX[opts.levelId] || FOREST_MIX.alpen;

    // ===== BAUMGEOMETRIEN =====
    // Statt eines Einzelkegels pro Baum werden mehrere Grundkörper zu EINER
    // Geometrie verschmolzen — die Instanzierung bleibt erhalten, aber die
    // Silhouette bekommt gestaffelte Astkränze, Stamm und Wipfel.
    const mergeGeos = (geos) => {
        const parts = geos.map(g2 => g2.toNonIndexed());
        let vCount = 0;
        for (const g2 of parts) vCount += g2.attributes.position.count;
        const pos2 = new Float32Array(vCount * 3);
        const norm2 = new Float32Array(vCount * 3);
        let o = 0;
        for (const g2 of parts) {
            pos2.set(g2.attributes.position.array, o * 3);
            norm2.set(g2.attributes.normal.array, o * 3);
            o += g2.attributes.position.count;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(norm2, 3));
        return out;
    };
    const cone = (r, h, y, seg = 6) => { const c = new THREE.ConeGeometry(r, h, seg); c.translate(0, y, 0); return c; };
    const stem = (r1, r2, h, y) => { const c = new THREE.CylinderGeometry(r1, r2, h, 5); c.translate(0, y, 0); return c; };
    // Fichte: drei gestaffelte Kränze + Spitze + kurzer Stammansatz
    const spruceGeo = mergeGeos([
        stem(0.07, 0.1, 0.5, 0.25),
        cone(0.62, 1.0, 0.85, 7),
        cone(0.5, 0.95, 1.45, 7),
        cone(0.36, 0.85, 2.0, 6),
        cone(0.18, 0.55, 2.55, 5)
    ]);
    // Tanne: breiter, zwei Etagen + Stammansatz
    const firGeo = mergeGeos([
        stem(0.08, 0.12, 0.45, 0.22),
        cone(0.95, 1.1, 0.85, 8),
        cone(0.66, 0.95, 1.5, 7)
    ]);
    // Laubbaum: unregelmäßige Krone aus drei versetzten Kugeln
    const blob = (r, x, y, z) => { const b = new THREE.SphereGeometry(r, 7, 6); b.scale(1, 0.85, 1); b.translate(x, y, z); return b; };
    const broadGeo = mergeGeos([
        blob(0.62, 0, 1.15, 0),
        blob(0.42, 0.34, 1.42, 0.12),
        blob(0.38, -0.3, 1.35, -0.14)
    ]);
    const trunkGeo  = new THREE.CylinderGeometry(0.08, 0.11, 0.7, 5); trunkGeo.translate(0, 0.35, 0);

    // Damit die Bäume in Schatten und Dämmerung nicht ins Schwarze absaufen,
    // bekommen sie ein schwaches Eigenleuchten. WICHTIG: das muss ein GRÜNTON
    // sein — `emissive` wird additiv aufgeschlagen und nicht mit der
    // Vertexfarbe multipliziert. Mit Weiß werden alle Bäume grau gewaschen.
    // KEIN `vertexColors`: die Farbe je Baum kommt als Instanzfarbe (setColorAt) und
    // wirkt auch ohne diesen Schalter. Mit `vertexColors: true` erwartet der Shader
    // zusätzlich ein Farbattribut an der Geometrie – das gibt es hier nicht, es zählt
    // dann als Schwarz. Genau deshalb standen alle Bäume als fast schwarze Kegel im
    // Schnee, egal wie hell die Farbtöne oben in der Tabelle gewählt wurden.
    const mat = new THREE.MeshStandardMaterial({
        roughness: 0.86,
        emissive: 0x1c2a22, emissiveIntensity: 0.75
    });
    const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x6b4a30, roughness: 0.95, emissive: 0x2a1c12, emissiveIntensity: 0.7
    });

    // Bäume auf die Typen verteilen
    const pick = (idx) => {
        const r = ((idx * 2246822519) >>> 8) / 16777216;   // 0..1, deterministisch
        if (r < mix.spruce) return 0;
        if (r < mix.spruce + mix.fir) return 1;
        return 2;
    };
    const groups = [[], [], []];
    // Vereinzelt kahle Bäume (nur unter den Laubbäumen) — sie werden schmaler
    // skaliert und graubraun eingefärbt, was den Wald aufbricht.
    spots.forEach((s, i) => {
        s.type = s.winter ? 0 : pick(s.idx);
        s.bare = s.type === 2 && (((s.idx * 668265263) >>> 24) & 15) < 2;   // ~12% der Laubbäume
        groups[s.type].push(s);
    });

    const inst = new THREE.InstancedMesh(spruceGeo, mat, Math.max(1, groups[0].length));
    inst.castShadow = true;
    const instFir = new THREE.InstancedMesh(firGeo, mat, Math.max(1, groups[1].length));
    instFir.castShadow = true;
    const instBroad = new THREE.InstancedMesh(broadGeo, mat, Math.max(1, groups[2].length));
    instBroad.castShadow = true;
    const instTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, groups[2].length));

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const place = (list, target, trunkTarget) => {
        list.forEach((s, i) => {
            const wx = s.gx * tile - half, wz = s.gy * tile - half;
            const wy = (heightmap[s.idx] || 0) * hScale;
            const scl = 0.65 + ((s.idx * 2654435761 >>> 28) & 7) / 9;
            dummy.position.set(wx, wy, wz);
            // Kahle Bäume: schmale Krone, dafür etwas höher — wirkt wie Geäst
            const wsc = s.bare ? scl * 0.42 : scl;
            dummy.scale.set(wsc, scl * (0.85 + ((s.idx >> 3) & 7) / 18) * (s.bare ? 1.15 : 1), wsc);
            dummy.rotation.y = (s.idx % 12) * 0.52;
            dummy.updateMatrix();
            target.setMatrixAt(i, dummy.matrix);
            if (trunkTarget) trunkTarget.setMatrixAt(i, dummy.matrix);
            // Farbe: Grundton aus dem Level + leichte Variation je Baum
            // ===== FARBSPIEL IM WALD =====
            // Statt eines Einheitsgrüns bekommt jeder Baum eine eigene Nuance:
            // Helligkeit, ein Zug ins Gelbliche und ein leichter Sättigungs-
            // versatz. Dadurch wirkt der Bestand lebendig statt wie Tapete.
            const v = ((s.idx % 7) - 3) * 0.024;                     // heller/dunkler
            const warm = (((s.idx * 2246822519) >>> 12) & 15) / 15;  // 0..1 Gelbanteil
            const dry = (((s.idx * 374761393) >>> 20) & 31) / 31;    // 0..1 Herbstton
            if (s.winter) {
                col.setRGB(0.55 + v, 0.62 + v, 0.68 + v * 0.6);
            } else if (s.bare) {
                // Kahler Baum: graubraunes Geäst ohne Nadeln
                col.setRGB(0.34 + v * 1.4, 0.28 + v, 0.22 + v * 0.7);
            } else if (s.type === 2) {
                // Laubbaum: heller und wärmer als der Bestand, gelegentlich herbstlich
                col.setRGB(mix.hue[0] + 0.10 + v + warm * 0.14 + dry * 0.14,
                           mix.hue[1] + 0.08 + v + warm * 0.09,
                           mix.hue[2] + v * 0.4);
            } else {
                // Nadelbaum: satter, mit leichtem Gelbstich in den Wipfeln
                col.setRGB(mix.hue[0] + v + warm * 0.08,
                           mix.hue[1] + 0.04 + v + warm * 0.10,
                           mix.hue[2] + v * 0.5);
            }
            target.setColorAt(i, col);
        });
        target.instanceMatrix.needsUpdate = true;
        if (target.instanceColor) target.instanceColor.needsUpdate = true;
        if (trunkTarget) trunkTarget.instanceMatrix.needsUpdate = true;
    };
    // ===== SCHNEEHAUBEN ALS ECHTE GEOMETRIE =====
    // Je Baumform eine PASSENDE Haube — vorher lag auf allen Bäumen die
    // Fichten-Haube, und über Tannen und Laubbäumen schwebten die oberen
    // Kegel frei in der Luft.
    const capCone = (r, h, y, seg = 7) => { const c2 = new THREE.ConeGeometry(r, h, seg); c2.translate(0, y, 0); return c2; };
    const capGeoSpruce = mergeGeos([
        capCone(0.66, 0.34, 1.02),
        capCone(0.52, 0.3, 1.62),
        capCone(0.36, 0.28, 2.16, 6),
        (() => { const c2 = new THREE.SphereGeometry(0.16, 6, 5); c2.translate(0, 2.62, 0); return c2; })()
    ]);
    const capGeoFir = mergeGeos([
        capCone(0.98, 0.34, 1.42, 8),
        capCone(0.68, 0.3, 1.98)
    ]);
    // Laubbaum: kleinere Haube nur auf dem Scheitel – darunter bleibt ein grüner Rand
    // (vorher saß sie wie ein Helm über der ganzen Krone).
    const capGeoBroad = (() => {
        const c2 = new THREE.SphereGeometry(0.5, 7, 5);
        c2.scale(1, 0.4, 1); c2.translate(0, 1.66, 0); return c2;
    })();
    // Weiche Hauben: kaum Eigenleuchten. Mit 0.35 lagen sie in der Sonne weit über
    // Weiß und strahlten in der Nahansicht als helle Höfe aus (Glühen der Bildaufbereitung).
    const snowCapMat = new THREE.MeshStandardMaterial({
        color: 0xeef3fa, roughness: 0.9,
        emissive: 0xdde6f0, emissiveIntensity: 0.08,
        transparent: true, opacity: 0
    });
    // Ein Hauben-Mesh je Baumgruppe, gleiche Reihenfolge wie groups[0..2]
    const snowInsts = [capGeoSpruce, capGeoFir, capGeoBroad].map((g2, mi) =>
        new THREE.InstancedMesh(g2, snowCapMat, Math.max(1, groups[mi].length)));
    for (const si of snowInsts) si.visible = false;
    place(groups[0], inst);
    place(groups[1], instFir);
    place(groups[2], instBroad, instTrunk);
    // Hauben exakt auf die Baum-Transformationen setzen (gleiche Formel wie
    // in place() — kahle Bäume bekommen keine Haube, sie haben keine Nadeln).
    groups.forEach((list, mi) => {
        const si = snowInsts[mi];
        list.forEach((s3, li) => {
            s3.snowMesh = mi; s3.snowIdx = li;
            const wx = s3.gx * tile - half, wz = s3.gy * tile - half;
            const wy = (heightmap[s3.idx] || 0) * hScale;
            const scl = 0.65 + ((s3.idx * 2654435761 >>> 28) & 7) / 9;
            dummy.position.set(wx, wy, wz);
            const hidden = s3.bare;
            const cs = hidden ? 0.001 : scl * 0.98;
            dummy.scale.set(cs, (hidden ? 0.001 : scl * (0.85 + ((s3.idx >> 3) & 7) / 18)) * 0.98, cs);
            dummy.rotation.y = (s3.idx % 12) * 0.52;
            dummy.updateMatrix();
            si.setMatrixAt(li, dummy.matrix);
        });
        si.instanceMatrix.needsUpdate = true;
    });

    /**
     * BÄUME NACHSETZEN.
     *
     * Wird das Gelände nachträglich verändert (Gebäude einebnen, Piste
     * anlegen), behalten die bereits gesetzten Baum-Instanzen ihre alte Höhe
     * und schweben oder versinken. Diese Funktion setzt alle Bäume in einem
     * Umkreis auf die AKTUELLE Geländehöhe zurück — inklusive Stämmen und
     * Schneehauben.
     */
    inst.userData.reseat = (cgx, cgy, radius) => {
        const r2 = radius * radius;
        const meshes = [inst, instFir, instBroad];
        let touched = false;
        for (const sp of spotList) {
            if (sp.cut) continue;
            const dx = sp.gx - cgx, dy = sp.gy - cgy;
            if (dx * dx + dy * dy > r2) continue;
            const idx = sp.gy * gridSize + sp.gx;
            const wx = sp.gx * tile - half, wz = sp.gy * tile - half;
            const wy = (heightmap[idx] || 0) * hScale;
            const scl = 0.65 + ((idx * 2654435761 >>> 28) & 7) / 9;
            const wsc = sp.bare ? scl * 0.42 : scl;
            dummy.position.set(wx, wy, wz);
            dummy.scale.set(wsc, scl * (0.85 + ((idx >> 3) & 7) / 18) * (sp.bare ? 1.15 : 1), wsc);
            dummy.rotation.set(0, (idx % 12) * 0.52, 0);
            dummy.updateMatrix();
            const m = meshes[sp.meshIdx];
            if (m) m.setMatrixAt(sp.index, dummy.matrix);
            if (sp.meshIdx === 2 && instTrunk) instTrunk.setMatrixAt(sp.index, dummy.matrix);
            // Schneehaube folgt exakt derselben Transformation
            const si = snowInsts[sp.snowMesh ?? sp.meshIdx];
            if (si && sp.snowIdx != null) {
                const hidden = sp.bare;
                const cs = hidden ? 0.001 : scl * 0.98;
                dummy.scale.set(cs, (hidden ? 0.001 : scl * (0.85 + ((idx >> 3) & 7) / 18)) * 0.98, cs);
                dummy.updateMatrix();
                si.setMatrixAt(sp.snowIdx, dummy.matrix);
            }
            touched = true;
        }
        if (touched) {
            for (const m of meshes) if (m) m.instanceMatrix.needsUpdate = true;
            if (instTrunk) instTrunk.instanceMatrix.needsUpdate = true;
            for (const si of snowInsts) si.instanceMatrix.needsUpdate = true;
        }
    };

    // Zusatz-Meshes am Hauptobjekt mitführen (Szene hängt sie mit ein)
    inst.userData.extraMeshes = [instFir, instBroad, instTrunk, ...snowInsts];
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    // Positionen der Bäume merken — für die spätere Rodung entlang der Pisten.
    // `meshIdx` sagt, in welcher Instanz-Gruppe der Baum steckt, `index` wo darin.
    const meshes = [inst, instFir, instBroad];
    const spotList = [];
    groups.forEach((list, mi) => list.forEach((sp, li) => {
        spotList.push({ gx: sp.gx, gy: sp.gy, index: li, meshIdx: mi, bare: !!sp.bare,
                        snowMesh: sp.snowMesh, snowIdx: sp.snowIdx });
    }));
    // ===== SCHNEELAST AUF DEN ZWEIGEN =====
    // Bei Schneefall legt sich Weiß auf die Kronen. Dafür merken wir uns die
    // Grundfarben und mischen sie je nach Last Richtung Schnee — pro Baum
    // leicht unterschiedlich stark, damit der Wald nicht uniform weiß wird.
    const baseCols = meshes.map(m => (m.instanceColor ? m.instanceColor.array.slice() : null));
    let lastLoad = -1;
    inst.userData.setSnowLoad = (load) => {
        load = Math.max(0, Math.min(1, load));
        // Die Hauben sind der HAUPTEFFEKT: ab leichter Last sichtbar, im
        // Schneesturm voll deckend.
        for (const si of snowInsts) si.visible = load > 0.05;
        snowCapMat.opacity = Math.min(0.86, load * 1.15);
        // Nur bei deutlicher Änderung neu schreiben — das Umfärben tausender
        // Instanzen samt GPU-Upload ist zu teuer für jeden Tick.
        if (Math.abs(load - lastLoad) < 0.08) return;
        lastLoad = load;
        meshes.forEach((m, mi) => {
            const base = baseCols[mi];
            if (!base || !m.instanceColor) return;
            const arr = m.instanceColor.array;
            for (let i = 0; i < arr.length; i += 3) {
                const jitter = 0.6 + (((i * 2654435761) >>> 26) & 15) / 18;   // 0.6 .. 1.43
                // Kräftig genug, dass man den Schnee wirklich SIEHT, aber mit
                // Obergrenze 0.85, damit das Grün nie ganz verschwindet.
                // etwas zurückhaltender als zuvor — der Schnee soll die
                // Kronen anzuckern, nicht auslöschen.
                // (Der frühere Faktor 0.74 war abgestimmt, als die Baumfarbe gar nicht
                //  ankam; jetzt, wo sie wirkt, bleichte er den ganzen Wald grauweiß aus.
                //  Das Weiß tragen die Hauben, darunter bleibt das Grün sichtbar.)
                const f = Math.min(1, load * jitter) * 0.30;
                arr[i]     = base[i]     + (0.88 - base[i])     * f;
                arr[i + 1] = base[i + 1] + (0.90 - base[i + 1]) * f;
                arr[i + 2] = base[i + 2] + (0.94 - base[i + 2]) * f;
            }
            m.instanceColor.needsUpdate = true;
        });
    };
    inst.userData.spots = spotList;
    inst.userData.meshes = meshes;
    inst.userData.trunks = instTrunk;
    inst.userData.snowInsts = snowInsts; // Schneehauben je Baumtyp — beim Roden mit entfernen
    inst.userData.dummy = dummy;
    return inst;
}

// ============================================================
// FELS-BLÖCKE auf Fels-Kacheln (instanziert, ein Draw-Call)
// ============================================================
export function buildRocks(world, gridSize, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const half = ((gridSize - 1) * tile) / 2;

    // Höhenbereich für "hoch gelegen"
    let mnZ = Infinity, mxZ = -Infinity;
    for (let i = 0; i < heightmap.length; i++) { const h = heightmap[i]; if (h<mnZ)mnZ=h; if(h>mxZ)mxZ=h; }
    const range = (mxZ - mnZ) || 1;

    // Felsen sammeln sich rund um die Gipfel und auf sehr steilen Graten,
    // nicht mehr flächendeckend. Gelegentlich ein hoher Felszacken (Zapfen).
    const peaks = opts.peaks || [];
    const peakR = gridSize * 0.11;      // Einzugsradius um jeden Gipfel
    const nearPeak = (x, y) => peaks.some(p => Math.hypot(p.x - x, p.y - y) < peakR);
    const boulders = [], spikes = [];
    // ===== FELS WÄCHST AUS DEM BERG =====
    // Vorher entschied ein Hash je Kachel — das ergab ein regelmäßiges Raster
    // gleichmäßig verteilter Brocken. Jetzt steuert ein Rauschfeld, WO
    // überhaupt Fels durchkommt: es entstehen zusammenhängende Bänder und
    // Aufschlüsse, die dem Hang folgen, dazwischen bleibt der Berg frei.
    const noise2 = (x, y, f) =>
        Math.sin(x * f + Math.cos(y * f * 0.7) * 2.1) *
        Math.cos(y * f * 1.13 - Math.sin(x * f * 0.9) * 1.7);
    for (let gy = 1; gy < gridSize-1; gy++) {
        for (let gx = 1; gx < gridSize-1; gx++) {
            const idx = gy * gridSize + gx;
            if (landcover[idx] === 2) continue; // kein Fels im Wasser
            const z = heightmap[idx];
            const hl=heightmap[idx-1], hr=heightmap[idx+1], hu=heightmap[idx-gridSize], hd=heightmap[idx+gridSize];
            const slope = Math.max(Math.abs(z-hl),Math.abs(z-hr),Math.abs(z-hu),Math.abs(z-hd));
            const alt = (z - mnZ) / range;
            if (slope < 5.5 || alt < 0.20) continue;
            // Aufschluss-Feld: mehrere Frequenzen, dadurch unregelmäßige
            // Zonen statt gleichmäßiger Streuung.
            const outcrop = noise2(gx, gy, 0.055) * 0.55
                          + noise2(gx, gy, 0.14) * 0.30
                          + noise2(gx, gy, 0.31) * 0.15;
            // Steilheit und Höhe erhöhen die Chance, dass Fels durchbricht
            const bias = (slope - 5) / 14 + (alt - 0.18) * 0.9;
            // Schwelle deutlich höher: Fels ist die Ausnahme, nicht die Regel.
            const strength = outcrop + bias - 1.20;
            if (strength < 0) continue;                       // hier bleibt der Hang frei
            const hsh = (((gx * 40503) ^ (gy * 12289) ^ (gx * gy * 7919)) >>> 0);
            const verySteep = slope >= 11;
            // In starken Aufschlüssen dicht, an den Rändern ausdünnend
            const dens = Math.min(0.30, strength * 0.75);
            if ((hsh % 100) / 100 > dens) {
                // Auch außerhalb der Felszonen liegt hin und wieder ein
                // einzelner großer Block — sonst wirkt die Fläche zu sauber.
                if (strength > -0.80 && hsh % 331 === 0) {
                    boulders.push({ gx, gy, idx, hsh, giant: true });
                    landcover[idx] = 3;
                }
                continue;
            }
            // KEINE Felswand-Blöcke mehr: die wirkten als dunkle, kantige
            // Klötze zwischen den runden Brocken. Steile Stellen bekommen
            // stattdessen ebenfalls normale Blöcke.
            if (hsh % 29 === 0) spikes.push({ gx, gy, idx, hsh });
            // ERRATIKER: sehr selten, dafür deutlich größer als alles andere.
            // Sie stehen einzeln im Gelände wie eiszeitliche Findlinge.
            else if (hsh % 37 === 0) boulders.push({ gx, gy, idx, hsh, giant: true });
            else boulders.push({ gx, gy, idx, hsh });
            landcover[idx] = 3;   // Kachel als Fels markieren
        }
    }
    if (boulders.length === 0 && spikes.length === 0) return null;

    const rock = opts.rock || { base: [0.42, 0.44, 0.48], v: 0.04, shape: 'dodeca', size: 1.0, rough: 1.0 };
    const [br, bg, bb] = rock.base, vv = rock.v ?? 0.04, sizeF = rock.size ?? 1.0, roughF = rock.rough ?? 1.0;
    const sizeV = rock.sizeV ?? 0.5;   // wie stark die Größen je Level streuen
    // ab welcher relativen Höhe die Felsen Schnee tragen (0..1)
    const snowStart = opts.snowStart ?? 0.45;
    const group = new THREE.Group();
    const col = new THREE.Color();
    const dummy = new THREE.Object3D();
    /**
     * EINHEITLICHE GESTEINSFARBE.
     *
     * Alle Felsarten — Brocken, Zacken und Wandblöcke — laufen über DIESE
     * Funktion. Vorher hatten die Wandblöcke eine eigene, unnormierte Formel
     * mit ungleichen Kanalfaktoren; dadurch waren sie fast schwarz, während
     * die Brocken hell blieben. Genau der Unterschied im Bild.
     */
    const lum0 = (br + bg + bb) / 3;
    // Praktisch EINE Farbe: nur ±4 % Helligkeit, damit die Blöcke nicht wie
    // gestempelt wirken, aber niemand einen Farbunterschied bemerkt.
    const loL = Math.max(0.16, lum0 * 0.96);
    const hiL = Math.min(0.90, lum0 * 1.04);
    const clC = (v) => v < 0.05 ? 0.05 : v > 0.94 ? 0.94 : v;
    const rockColorFor = (hsh, out) => {
        const t01 = ((hsh >>> 7) & 255) / 255;
        const k = (loL + (hiL - loL) * t01) / (lum0 || 1);
        out.setRGB(clC(br * k), clC(bg * k), clC(bb * k));
        return out;
    };
    const setInstance = (inst, s, i, tall, variant = 0) => {
        const wx = s.gx * tile - half, wz = s.gy * tile - half;
        const wy = (heightmap[s.idx] || 0) * hScale;
        // Größe: Grundmaß des Levels, darum eine level-eigene Streuung.
        // sizeV klein = gleichmäßige Steine, groß = von Kiesel bis Felsblock.
        const rnd01 = ((s.hsh >>> 3) & 255) / 255;
        // Etwas kompakter als zuvor — die Brocken sollen das Gelände
        // texturieren, nicht dominieren.
        let scl = sizeF * 0.78 * (1 - sizeV * 0.42 + rnd01 * sizeV * 1.05);
        // Findlinge: ein Vielfaches der normalen Größe, selbst untereinander
        // noch einmal deutlich unterschiedlich.
        if (s.giant) scl *= 1.9 + ((s.hsh >>> 11) & 15) / 11;
        // Brocken sitzen teilweise IM Hang, nicht obenauf — sie wirken dadurch
        // wie herausgewitterter Fels statt wie hingelegte Kugeln.
        const sink = tall ? 0.7 : (0.02 + ((s.hsh >>> 19) & 7) / 60);
        dummy.position.set(wx, wy + scl * sink, wz);
        if (tall) dummy.scale.set(scl * 0.7, scl * (1.8 + (s.hsh % 4) * 0.35), scl * 0.7);
        else {
            // je Formvariante eigene Proportionen: Findling gedrungen,
            // Trümmer schlanker, Platte flach und breit
            // Proportionen bewusst moderater: kein Stein ist mehr extrem
            // gestaucht oder gestreckt, das wirkte klobig.
            const prop = variant === 2 ? [1.12, 0.62, 1.02]      // flach gelagert
                       : variant === 3 ? [0.98, 1.06, 0.96]      // rundlich hoch
                       : variant === 4 ? [0.86, 1.14, 0.88]      // leicht aufragend
                       : variant === 1 ? [0.94, 0.92, 0.96]      // gedrungen
                       : [1.0, 0.82 + (s.hsh % 4) * 0.06, 1.0];  // Findling
            // zusätzlich je Stein UNGLEICH stauchen — nichts bleibt rund
            const sx = 0.86 + ((s.hsh >>> 5) & 15) / 42;
            const sy = 0.84 + ((s.hsh >>> 9) & 15) / 38;
            const sz = 0.86 + ((s.hsh >>> 13) & 15) / 42;
            dummy.scale.set(scl * prop[0] * sx, scl * prop[1] * sy, scl * prop[2] * sz);
        }
        // Drehung: um die Hochachse frei, seitlich aber MEIST nur leicht
        // gekippt — ein Fels liegt normalerweise stabil. Nur jeder elfte
        // Block liegt stark verkantet und ragt dadurch über.
        const tilty = ((s.hsh >>> 20) % 11) === 0;
        const tmax = tall ? 0.06 : (tilty ? 0.85 : 0.22);
        dummy.rotation.set(
            (((s.hsh >>> 2) & 63) / 63 - 0.5) * 2 * tmax,
            ((s.hsh >>> 8) & 63) / 63 * Math.PI * 2,
            (((s.hsh >>> 14) & 63) / 63 - 0.5) * 2 * tmax);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        // Farbe: einheitlicher Levelton, nur die Helligkeit streut.
        // Schnee auf Felsen ist VERGÄNGLICH und kommt über setSnow() aus dem
        // Wetter — hier wird deshalb kein Höhenschnee mehr eingerechnet.
        rockColorFor(s.hsh, col);
        inst.setColorAt(i, col);
    };
    /** Verzerrt eine Zacken-Geometrie leicht, damit sie nicht wie ein
     *  perfekter Kegel aussieht. */
    const jitterGeoSpike = (g2) => {
        const a2 = g2.attributes.position.array;
        let sd = 0x8c31;
        const rr = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 - 0.5; };
        const seen2 = new Map();
        for (let i = 0; i < a2.length; i += 3) {
            const k = a2[i].toFixed(3)+'|'+a2[i+1].toFixed(3)+'|'+a2[i+2].toFixed(3);
            let d = seen2.get(k);
            if (!d) d = [rr()*0.16, rr()*0.10, rr()*0.16], seen2.set(k, d);
            a2[i]+=d[0]; a2[i+1]+=d[1]; a2[i+2]+=d[2];
        }
        g2.computeVertexNormals();
        return g2;
    };
    // ===== FELSBROCKEN IN DREI AUSPRÄGUNGEN =====
    // Vorher teilten sich alle Steine EINE Geometrie und einen fast schwarzen
    // Farbton — dadurch lagen überall identische dunkle Klumpen herum. Jetzt
    // gibt es rundliche Findlinge, kantige Trümmer und flache Platten, alle
    // deutlich heller und mit kräftiger Farbstreuung.
    if (boulders.length) {
        // Drei Grundformen, je nach Hash auf die Brocken verteilt
        // Grundkörper sind zu regelmäßig — jede Form wird deshalb an ihren
        // Eckpunkten VERZERRT. Dadurch bekommt jeder Stein eine eigene,
        // unregelmäßige Silhouette statt einer sauberen Platonik.
        // Verzerrung auf ZWEI Größenordnungen: eine grobe Welle formt die
        // Gesamtgestalt (Beulen, Einbuchtungen), eine feine Körnung darüber
        // bricht die Flächen auf. Dadurch wirken die Steine in sich
        // detailliert statt wie klobige Kristalle.
        const jitterGeo = (geo, amt, seedv) => {
            const pos = geo.attributes.position, arr = pos.array;
            let sd = seedv >>> 0;
            const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 - 0.5; };
            const seenV = new Map();
            for (let i = 0; i < arr.length; i += 3) {
                const x = arr[i], y = arr[i+1], z = arr[i+2];
                const key = x.toFixed(3) + '|' + y.toFixed(3) + '|' + z.toFixed(3);
                let d = seenV.get(key);
                if (!d) {
                    // grobe Form: richtungsabhängige Welle (nicht rein zufällig,
                    // sonst wird der Stein nur rau statt geformt)
                    const lump = Math.sin(x * 2.7 + y * 1.9) * Math.cos(z * 2.3 - x * 1.4);
                    const gx2 = lump * amt * 0.55;
                    // feine Körnung obendrauf
                    d = [gx2 + rnd() * amt * 0.5,
                         gx2 * 0.7 + rnd() * amt * 0.42,
                         gx2 * 0.85 + rnd() * amt * 0.5];
                    seenV.set(key, d);
                }
                arr[i] += d[0]; arr[i+1] += d[1]; arr[i+2] += d[2];
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            // ===== MASERUNG =====
            // InstancedMesh multipliziert die Geometrie-Vertexfarbe mit der
            // Instanzfarbe. Eine Struktur direkt in der Geometrie gibt jedem
            // Stein deshalb eine Bänderung und Fleckigkeit — sonst ist jeder
            // Brocken in sich einfarbig und der Bestand wirkt monoton.
            const p2 = pos.array;
            const vcol = new Float32Array(p2.length);
            for (let i = 0; i < p2.length; i += 3) {
                const x = p2[i], y = p2[i+1], z = p2[i+2];
                // Schichtbänder quer durch den Stein
                const band = Math.sin(y * 6.2 + x * 1.7) * 0.5 + 0.5;
                // unregelmäßige Flecken (Flechten, Verwitterung)
                const blot = Math.sin(x * 9.1 + z * 7.3) * Math.cos(y * 8.4 - x * 5.2);
                // feines Korn
                const gr = ((((i * 2654435761) >>> 22) & 31) / 31 - 0.5);
                // Sehr dezent: die Maserung modelliert die Oberfläche, darf
                // den Stein aber nicht heller oder dunkler erscheinen lassen.
                const f = 1 + (band - 0.5) * 0.055 + blot * 0.035 + gr * 0.025;
                // Maserung NUR als Helligkeit — jeder Farbstich würde die
                // Steine wieder unterschiedlich einfärben. Der Levelton bleibt
                // dadurch über den gesamten Bestand identisch.
                vcol[i] = f; vcol[i + 1] = f; vcol[i + 2] = f;
            }
            geo.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
            return geo;
        };
        // FÜNF Grundformen statt drei — weniger Steine, dafür deutlich
        // unterschiedlichere: Findling, Trümmer, Platte, Keil und Splitter.
        // Detailstufe 1–2 statt 0: die Grundkörper haben dadurch ein
        // Vielfaches an Flächen. Zusammen mit der Verzerrung entsteht eine
        // verwitterte, kleinteilige Oberfläche statt scharfer Kristallkanten.
        const geos = [
            jitterGeo(new THREE.DodecahedronGeometry(0.72, 1).toNonIndexed(), 0.30, 0x51f3),
            jitterGeo(new THREE.IcosahedronGeometry(0.68, 2).toNonIndexed(), 0.26, 0x9a27),
            jitterGeo(new THREE.SphereGeometry(0.70, 9, 7).toNonIndexed(),   0.34, 0xc4b1),
            jitterGeo(new THREE.IcosahedronGeometry(0.74, 1).toNonIndexed(), 0.36, 0x7e55),
            jitterGeo(new THREE.OctahedronGeometry(0.80, 2).toNonIndexed(),  0.28, 0x2d9c)
        ];
        const NV = geos.length;
        const buckets = Array.from({ length: NV }, () => []);
        for (const b of boulders) buckets[(b.hsh >>> 7) % NV].push(b);
        for (let bi = 0; bi < NV; bi++) {
            const list = buckets[bi];
            if (!list.length) continue;
            const mat = new THREE.MeshStandardMaterial({
                vertexColors: true, roughness: roughF, metalness: 0.04,
                // KEIN flatShading mehr: mit den fein unterteilten Körpern
                // ergäbe das lauter harte Kanten. Weich schattiert wirken die
                // Steine verwittert und plastisch.
                flatShading: false,
                // Ein Hauch Eigenleuchten, damit die Schattenseiten nicht ins
                // Schwarze absaufen — aber deutlich weniger als zuvor, sonst
                // glühen die Steine von selbst.
                emissive: 0x2e2a26, emissiveIntensity: 0.55
            });
            const inst = new THREE.InstancedMesh(geos[bi], mat, list.length);
            inst.castShadow = true; inst.receiveShadow = true;
            list.forEach((sp, i) => { sp._mesh = inst; sp._i = i; setInstance(inst, sp, i, false, bi); });
            inst.instanceMatrix.needsUpdate = true;
            if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
            group.add(inst);
        }
    }
    // (keine Felswand-Blöcke mehr — siehe Kommentar bei der Platzierung)

    // Felszacken/Zapfen (spitze Nadeln)
    if (spikes.length) {
        const geo = jitterGeoSpike(new THREE.ConeGeometry(0.5, 2.2, 9, 3).toNonIndexed());
        // IDENTISCHE Materialwerte wie Brocken und Wände — vorher fehlte
        // hier das Eigenleuchten, wodurch die Zacken deutlich dunkler
        // wirkten als der übrige Fels.
        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: roughF, metalness: 0.04, flatShading: false,
            emissive: 0x2e2a26, emissiveIntensity: 0.55
        });
        const inst = new THREE.InstancedMesh(geo, mat, spikes.length);
        inst.castShadow = true; inst.receiveShadow = true;
        spikes.forEach((s, i) => { s._mesh = inst; s._i = i; setInstance(inst, s, i, true); });
        inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        group.add(inst);
    }

    /**
     * FELSEN ENTLANG EINER TRASSE ENTFERNEN.
     *
     * Ohne das verschwinden Liftstützen und Stationen zwischen den Blöcken —
     * gerade die großen Findlinge verdecken eine ganze Stütze. Die Steine im
     * Korridor werden deshalb auf Größe null gesetzt und die Kachel wieder
     * freigegeben, damit dort auch gebaut werden darf.
     */
    const allStones = [...boulders, ...spikes];
    const zeroM = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    group.userData.clearAlong = (pts, radius = 4) => {
        let touched = false;
        for (const sp of allStones) {
            if (sp._cleared || !sp._mesh) continue;
            let near = false;
            for (let k = 0; k < pts.length - 1 && !near; k++) {
                const a = pts[k], b = pts[k + 1];
                const dx = b.gx - a.gx, dy = b.gy - a.gy;
                const L2 = dx * dx + dy * dy || 1;
                let t = ((sp.gx - a.gx) * dx + (sp.gy - a.gy) * dy) / L2;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const px = a.gx + dx * t - sp.gx, py = a.gy + dy * t - sp.gy;
                if (px * px + py * py <= radius * radius) near = true;
            }
            if (!near) continue;
            for (let n = 0; n < (sp._n || 1); n++) sp._mesh.setMatrixAt(sp._i + n, zeroM);
            sp._mesh.instanceMatrix.needsUpdate = true;
            sp._cleared = true;
            landcover[sp.idx] = 0;         // Kachel wieder bebaubar
            touched = true;
        }
        return touched;
    };

    // ===== SCHNEE AUF DEN FELSEN =====
    // Bei Schneefall legt sich auch auf das Gestein etwas Weiß — aber nur
    // leicht, damit der Fels erkennbar bleibt. Umgesetzt über `emissive`,
    // weil das gleichmäßig auf alle Instanzfarben wirkt, ohne die
    // Vertexfarben neu schreiben zu müssen.
    const rockMats = [];
    group.traverse(o => { if (o.material && o.material.vertexColors) rockMats.push(o.material); });
    // ===== VERGÄNGLICHER SCHNEE AUF DEM FELS =====
    // Bei Schneefall werden die Blöcke sichtbar überzuckert und verlieren
    // ihren Gesteinston Richtung Weiß; bei Föhn taut alles wieder ab und der
    // Levelton kommt zurück. Umgesetzt über `color` (multiplikativ) plus
    // `emissive` — beides greift auf alle Instanzen zugleich.
    group.userData.setSnow = (load) => {
        const f = Math.max(0, Math.min(1, load));
        for (const m of rockMats) {
            // Grundton aufhellen: aus dunklem Gestein wird angeschneiter Fels
            const w = 1 + f * 0.55;
            m.color.setRGB(Math.min(1, w), Math.min(1, w * 1.01), Math.min(1, w * 1.04));
            // Schattenseiten mitheben, sonst bleibt die Rückseite schwarz
            m.emissive.setRGB(0.180 + f * 0.30, 0.165 + f * 0.33, 0.149 + f * 0.38);
            m.emissiveIntensity = 0.55 + f * 0.55;
        }
    };
    group.userData.setSnow(0);   // Ausgangszustand: aper
    return group;
}

// (Wasser – Seen und Bäche – wird in Water3D.js gebaut.)

// ============================================================
// GLETSCHER-MESH: eisige, glänzende Fläche über den Gletscherkacheln
// (landcover 8), schmiegt sich ans Gelände, mit Gletscherspalten.
// ============================================================
export function buildGlacier(glacierTiles, heightmap, gridSize, opts = {}) {
    if (!glacierTiles || glacierTiles.length < 8) return null;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const half = ((gridSize - 1) * tile) / 2;
    const tileSet = new Set(glacierTiles);
    const has = (gx, gy) => tileSet.has(gy * gridSize + gx);

    // ===== EISKÖRPER =====
    // Ein Gletscher ist kein weißes Schneefeld. Er besteht aus verpresstem
    // Blaueis, das an der Oberfläche von Firn überzogen ist, von Spalten
    // durchzogen wird und an Steilstufen in Séracs zerbricht. Genau diese
    // drei Elemente werden hier gebaut.

    // ===== RANDABSTANDSFELD =====
    // Vorher wurde je Kachel EIN ganzzahliger Abstand 0..4 ermittelt und die
    // ganze Kachel damit eingefärbt. Das ergab fünf harte Stufen und einen
    // Übergang, der exakt der Kachelkante folgte — genau das sah verpixelt
    // aus. Jetzt liefert eine Wellenfront einen FEINEN Abstand mit vielen
    // Ringen, der anschließend zwischen den Kacheln interpoliert wird.
    const DMAX = 7;
    const dist = new Float32Array(gridSize * gridSize).fill(-1);
    {
        // Startfront: alle Gletscherkacheln, die an Nicht-Gletscher grenzen
        let front = [];
        for (const idx of glacierTiles) {
            const gx = idx % gridSize, gy = (idx / gridSize) | 0;
            let edge = false;
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!has(gx + ox, gy + oy)) { edge = true; break; }
            }
            if (edge) { dist[idx] = 0; front.push(idx); }
        }
        for (let ring = 1; ring <= DMAX && front.length; ring++) {
            const next = [];
            for (const idx of front) {
                const gx = idx % gridSize, gy = (idx / gridSize) | 0;
                for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = gx + ox, ny = gy + oy;
                    if (!has(nx, ny)) continue;
                    const ni = ny * gridSize + nx;
                    if (dist[ni] < 0) { dist[ni] = ring; next.push(ni); }
                }
            }
            front = next;
        }
        for (const idx of glacierTiles) if (dist[idx] < 0) dist[idx] = DMAX;
    }
    /** Abstand an einer BELIEBIGEN Stelle, bilinear zwischen den Kacheln. */
    const distAt = (fx, fy) => {
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const g = (gx, gy) => {
            if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) return -1.2;
            const d = dist[gy * gridSize + gx];
            return d < 0 ? -1.2 : d;                 // ausserhalb: negativ = kein Eis
        };
        const a = g(x0, y0), b = g(x0 + 1, y0), c2 = g(x0, y0 + 1), d2 = g(x0 + 1, y0 + 1);
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d2 * tx) * ty;
    };
    /** Feines Rauschen, das die Eiskante ausfranst statt sie gerade zu lassen. */
    const edgeNoise = (fx, fy) =>
        Math.sin(fx * 1.9 + Math.cos(fy * 1.3) * 2.1) * 0.42 +
        Math.sin(fy * 2.7 - Math.sin(fx * 1.1) * 1.7) * 0.30 +
        Math.sin((fx + fy) * 4.3) * 0.16;

    let mnZ = Infinity, mxZ = -Infinity;
    for (const idx of glacierTiles) { const h = heightmap[idx]; if (h < mnZ) mnZ = h; if (h > mxZ) mxZ = h; }
    const zr = (mxZ - mnZ) || 1;

    const positions = [], colors = [], indices = []; let v = 0;
    const vgrid = [];
    // Die Eisoberfläche liegt nur MINIMAL über dem Fels.
    // WICHTIG: Figuren und Fahrzeuge beziehen ihre Höhe aus der Heightmap.
    // Würde sich das Eis spürbar darüber aufwölben, versänken alle im
    // Gletscher. Die Wölbung ist deshalb nur angedeutet (max. ~7 cm) —
    // die Tiefenwirkung kommt aus der Farbe, nicht aus der Geometrie.
    const hAt = (fx, fy) => {
        const x0 = Math.max(0, Math.min(gridSize - 1, Math.floor(fx)));
        const y0 = Math.max(0, Math.min(gridSize - 1, Math.floor(fy)));
        const x1 = Math.min(gridSize - 1, x0 + 1), y1 = Math.min(gridSize - 1, y0 + 1);
        const tx = fx - x0, ty = fy - y0;
        const h00 = heightmap[y0 * gridSize + x0] || 0, h10 = heightmap[y0 * gridSize + x1] || 0;
        const h01 = heightmap[y1 * gridSize + x0] || 0, h11 = heightmap[y1 * gridSize + x1] || 0;
        return ((h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty) * hScale;
    };
    const surfY = (fx, fy) => {
        const d = Math.max(0, distAt(fx, fy));
        return hAt(fx, fy) + 0.03 + Math.min(4, d) * 0.01;
    };

    /**
     * Farbe UND Deckkraft an einer beliebigen Stelle.
     * Alles hängt an kontinuierlichen Feldern, nicht mehr an der Kachel —
     * dadurch verläuft der Übergang stufenlos.
     */
    const iceAt = (fx, fy) => {
        // Kantenabstand, vom Rauschen ausgefranst
        const dRaw = distAt(fx, fy) + edgeNoise(fx * 0.55, fy * 0.55) * 0.85;
        const thick = clamp01(dRaw / DMAX);                     // 0 Rand .. 1 Kern
        const hh = hAt(fx, fy) / hScale;
        const alt = clamp01((hh - mnZ) / zr);                   // 0 Zunge .. 1 Nährgebiet
        const deep = [0.74, 0.84, 0.92];
        const mid  = [0.86, 0.92, 0.97];
        const firn = [0.95, 0.97, 0.99];
        let c = mix(deep, mid, clamp01(alt * 1.15));
        c = mix(c, firn, clamp01(alt * 0.85 + (1 - thick) * 0.55));
        c = mix(c, deep, thick * 0.22 * (1 - alt * 0.6));
        // Schneeauflage diffus einstreuen
        const drift = Math.sin(fx * 0.13 + Math.cos(fy * 0.09) * 2.0) * 0.5
                    + Math.sin(fy * 0.17 - Math.sin(fx * 0.07) * 1.6) * 0.5;
        c = mix(c, [0.97, 0.98, 1.00], clamp01(drift * 0.5 + 0.5) * 0.55);
        // Spalten
        const flow = Math.sin(fx * 0.26 + Math.sin(fy * 0.11) * 2.4);
        const cross = Math.sin(fy * 0.34 + Math.cos(fx * 0.09) * 1.8);
        const cf = Math.abs(flow * 0.65 + cross * 0.35);
        if (cf > 0.86) {
            const cd = Math.min(1, (cf - 0.86) / 0.14);
            // Spalten laufen zum Rand hin aus — dort ist das Eis zu dünn
            c = mix(c, [0.52, 0.68, 0.84], cd * (0.30 + thick * 0.18) * clamp01(thick * 2.2));
        }
        // feine Körnung
        const grain = Math.sin(fx * 12.9898 + fy * 78.233) * 43758.5453;
        const gr = (grain - Math.floor(grain)) - 0.5;
        // ===== WEICHE KANTE =====
        // Über gut zwei Kacheln blendet das Eis auf den darunterliegenden
        // Schnee aus, statt an der Kachelgrenze abzureissen.
        const aRaw = clamp01((dRaw + 0.9) / 2.6);
        const alpha = aRaw * aRaw * (3 - 2 * aRaw);
        return [clamp01(c[0] + gr * 0.030), clamp01(c[1] + gr * 0.020),
                clamp01(c[2] + gr * 0.008), alpha];
    };

    // ===== FEINERES NETZ =====
    // Jede Gletscherkachel wird in SUB x SUB Felder unterteilt. Die Farbe
    // wird an den Eckpunkten ausgewertet und dazwischen interpoliert — so
    // entstehen weiche Verläufe statt einfarbiger Quadrate.
    const SUB = 3, STEP = 1 / SUB;
    for (const idx of glacierTiles) {
        const gx = idx % gridSize, gy = (idx / gridSize) | 0;
        for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
            const fx0 = gx + sx * STEP, fy0 = gy + sy * STEP;
            const fx1 = fx0 + STEP, fy1 = fy0 + STEP;
            const corners = [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]];
            let vis = false;
            const cols = [];
            for (const [cx, cy] of corners) {
                const col = iceAt(cx, cy);
                if (col[3] > 0.02) vis = true;
                cols.push(col);
            }
            if (!vis) continue;                    // vollständig ausgeblendet
            for (let k = 0; k < 4; k++) {
                const [cx, cy] = corners[k];
                positions.push(cx * tile - half, surfY(cx, cy), cy * tile - half);
                colors.push(cols[k][0], cols[k][1], cols[k][2], cols[k][3]);
                vgrid.push(cx, cy);                 // Rasterlage je Vertex (für reseat)
            }
            indices.push(v, v + 2, v + 1, v, v + 3, v + 2); v += 4;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // RGBA statt RGB: das vierte Kanal trägt die weiche Randabblendung.
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geo.setIndex(indices); geo.computeVertexNormals();
    // Eis ist glatt und leicht spiegelnd — deutlich glatter als Schnee.
    // `transparent` + kein Tiefenschreiben: das Eis liegt als weiche Schicht
    // auf dem Schnee und franst zum Rand hin aus, statt ihn hart zu
    // überdecken. polygonOffset drückt es minimal nach vorn, damit es nicht
    // mit dem Terrain um dieselben Pixel streitet (Z-Fighting).
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.46, metalness: 0.01,
        transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        emissive: 0x223a52, emissiveIntensity: 0.07   // nur ein Hauch Tiefe
    });
    const mesh = new THREE.Mesh(geo, mat);
    // ===== NACHSETZEN =====
    // Das Eis ist ein EIGENES Mesh über dem Gelände. Wird das Gelände später
    // verändert (Halfpipe-Mulde, Schanzen, Gebäudeplatten), muss das Eis
    // mitgehen — sonst liegt es als alte, flache Schneedecke über der Form.
    // `heightmap` ist dasselbe Array, das die Szene in-place verändert.
    mesh.userData.reseat = (cgx, cgy, rad) => {
        const pa = geo.attributes.position;
        let touched = false;
        for (let i = 0, gi = 0; i < pa.count; i++, gi += 2) {
            const fx = vgrid[gi], fy = vgrid[gi + 1];
            if (Math.abs(fx - cgx) > rad || Math.abs(fy - cgy) > rad) continue;
            pa.setY(i, surfY(fx, fy));
            touched = true;
        }
        if (touched) { pa.needsUpdate = true; geo.computeVertexNormals(); }
        return touched;
    };
    mesh.receiveShadow = true; mesh.castShadow = false;

    const group = new THREE.Group();
    group.add(mesh);
    group.userData.reseat = mesh.userData.reseat;      // nach außen durchreichen

    // (keine Séracs — die Eisfläche bleibt ruhig und flächig)

    return group;
}


/**
 * GELÄNDESCHÜRZE rings um die Karte.
 *
 * Ohne sie endet das Spielfeld an einer harten Kante und die Fernkulisse
 * schwebt losgelöst dahinter. Die Schürze setzt das Gelände nach außen fort:
 * sie übernimmt am Kartenrand exakt Höhe und Farbe des Terrains, läuft dann
 * in sanfte Vorberge aus und blendet zum Rand hin in den Horizontdunst.
 * Dadurch geht die Karte fließend in die Umgebung über.
 */
/**
 * HÖHENFORMEL DER GELÄNDESCHÜRZE.
 *
 * Bewusst als eigene Funktion: die Schürze und der Wald darauf müssen exakt
 * dieselbe Höhe rechnen. Vorher war die Formel zweimal getippt, und beim
 * Ändern der einen standen die Bäume prompt in der Luft.
 *
 * @param edgeY  Geländehöhe am Kartenrand unter diesem Punkt
 * @param a      Winkel um die Karte
 * @param v      0 = Kartenrand, 1 = äußerster Rand der Schürze
 */
/** Höhe des Talbodens im Umland (Weltmeter). Das Spielfeld liegt darüber am Hang. */
export const APRON_FLOOR = -24;
const sm01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/**
 * UMLAND-RELIEF: Das Spielfeld sitzt auf einer Hangschulter. Hinter der
 * Kante fällt das Gelände über Sporne, Runsen und Felsstufen in ein Tal
 * (APRON_FLOOR), dessen Boden sanft wellig ist und zu den Fernketten hin
 * wieder leicht ansteigt. So wirkt das Gebiet wie ein Skigebiet AM BERG,
 * nicht wie eine Platte in der Ebene.
 */
export function apronHeight(edgeY, a, v) {
    // Schulter: die ersten ~3 % bleiben auf Kartenhöhe (weicher Anschluss)
    const s = sm01((v - 0.03) / 0.36);                     // 0 Kante .. 1 Talboden (steil)
    // Sporne und Runsen quer zur Kante gliedern den Hang
    const spur = Math.sin(a * 7.3 + 0.8) * 0.5 + Math.sin(a * 13.1 - 1.9) * 0.3 + Math.sin(a * 23.7) * 0.2;
    const relief = Math.max(0, edgeY - APRON_FLOOR);
    // Der Hang fällt zum Talboden; Sporne halten die Höhe länger, Runsen fallen schneller
    const drop = relief * s * (1 - spur * 0.16 * (1 - s));
    // Felsstufen/Terrassen im Steilbereich
    const steps = Math.sin(v * 46 + a * 3.1) * 0.5 + Math.sin(v * 97 + a * 7.7) * 0.25;
    const stepAmp = relief * 0.035 * 4 * s * (1 - s);
    // Talboden: sanft wellig, mit Schuttkegeln am Hangfuß
    const floorRoll = Math.sin(a * 4.1 + v * 9) * 0.9 + Math.sin(a * 11 + v * 21) * 0.35;
    let y = edgeY - drop + steps * stepAmp + floorRoll * s;
    // dahinter (ab 72 %) wieder leicht ansteigen — Vorberge der Fernketten
    const rise = Math.max(0, (v - 0.72) / 0.28);
    y += rise * rise * 14 + Math.sin(a * 6.3 + 2.2) * rise * 3;
    return { y, ridge: spur };
}

export function buildTerrainApron(world, gridSize, theme = {}, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const span = (gridSize - 1) * tile;
    const half = span / 2;
    // ===== REICHWEITE =====
    // Die Schürze endete bei 0.95 Spannen und war ab 0.5 schon halb
    // durchsichtig — die erste Fernkette beginnt aber erst bei 1.30. Genau
    // dazwischen klaffte die Lücke, die den Übergang unschön machte. Jetzt
    // reicht sie bis 1.7 Spannen, also deutlich HINTER den Fuß der ersten
    // Kette, und wird erst ganz aussen durchsichtig.
    const REACH = opts.reach ?? span * 1.70;   // wie weit die Schürze hinausreicht
    const PER = opts.perimeter ?? 300;         // Auflösung entlang des Randes
    const RINGS = opts.rings ?? 26;            // Auflösung nach außen

    const haze = new THREE.Color(opts.hazeColor ?? 0xcddff0);
    const hazeArr = [haze.r, haze.g, haze.b];

    // --- Höhe und Farbe am Kartenrand abgreifen ---
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
        const h = heightmap[i];
        if (h < minZ) minZ = h;
        if (h > maxZ) maxZ = h;
    }
    const range = (maxZ - minZ) || 1;
    const grassLight = (theme.grassLight || [140, 176, 96]).map(c => c / 255);
    const grassDark = (theme.grassDark || [96, 132, 70]).map(c => c / 255);

    const sampleEdge = (wx, wz) => {
        const gx = Math.max(0, Math.min(gridSize - 1, Math.round((wx + half) / tile)));
        const gy = Math.max(0, Math.min(gridSize - 1, Math.round((wz + half) / tile)));
        const idx = gy * gridSize + gx;
        const z = heightmap[idx] || 0;
        const alt = (z - minZ) / range;
        const t = landcover[idx];
        let c;
        if (t === 2) c = [0.12, 0.32, 0.55];
        else if (t === 8) c = mix([0.68, 0.82, 0.94], [0.86, 0.93, 1.00], clamp01(alt));
        else if (t === 3) c = [0.42, 0.44, 0.48];
        else if (t === 1 || t === 6) c = [0.10, 0.30, 0.20];
        else if (t === 5) c = [0.20, 0.40, 0.16];
        else if (t === 7) c = mix(grassDark, grassLight, 0.5);
        else c = [0.90, 0.93, 0.97];
        return { y: z * hScale, col: c, alt };
    };

    // --- Gitter aufbauen: entlang des Randes (u) und nach außen (v) ---
    const pos = [], col = [], meta = [];
    const ptAt = (u, v) => {
        // u: 0..1 einmal um das Quadrat, v: 0..1 nach außen
        const s = u * 4;                     // welche Seite
        const side = Math.floor(s) % 4, f = s - Math.floor(s);
        let ex, ez;
        if (side === 0)      { ex = -half + f * span; ez = -half; }
        else if (side === 1) { ex = half;             ez = -half + f * span; }
        else if (side === 2) { ex = half - f * span;  ez = half; }
        else                 { ex = -half;            ez = half - f * span; }

        const e = sampleEdge(ex, ez);
        // Radial nach außen — an den Ecken diagonal, dadurch bleibt der Ring
        // geschlossen und es entstehen keine Löcher.
        const len = Math.hypot(ex, ez) || 1;
        const dx = ex / len, dz = ez / len;
        const d = v * REACH;
        const x = ex + dx * d, z2 = ez + dz * d;

        // ===== RELIEF NACH AUSSEN =====
        // Vorher hing die Form NUR vom Winkel ab: dieselben drei Sinus-Terme
        // über die ganze Tiefe. Dadurch zogen sich die Rücken als gerader
        // Fächer vom Kartenrand nach draußen — der typische Sternmuster-Look.
        // Jetzt kommt ein echtes zweidimensionales Feld zum Einsatz, das
        // sowohl mit dem Winkel als auch mit der Entfernung variiert. So
        // entstehen quer verlaufende Rücken, Sättel und Täler.
        const a = Math.atan2(ez, ex);
        const y = apronHeight(e.y, a, v).y;

        // Deckkraft: erst ganz außen ausblenden. Bis dahin muss die Schürze
        // decken, sonst sieht man wieder durch sie hindurch ins Leere.
        const alpha = 1 - clamp01((v - 0.86) / 0.14);
        // Die eigentliche Farbe kommt aus der HÖHE (siehe setSnowLine) — hier
        // wird nur die Randfarbe als Ausgangspunkt und die Weltposition der
        // Höhe mitgegeben, damit sich alles später neu einfärben lässt.
        // `ei` = Rasterpunkt des Spielfelds, an dem dieser Strahl die Kante verlässt:
        // dort holt sich die Schürze später die aktuelle Farbe des Spielfelds ab.
        const egx = Math.max(0, Math.min(gridSize - 1, Math.round((ex + half) / tile)));
        const egy = Math.max(0, Math.min(gridSize - 1, Math.round((ez + half) / tile)));
        return { x, y, z: z2, c: e.col, alpha, v, ei: egy * gridSize + egx };
    };

    for (let i = 0; i < PER; i++) {
        const u0 = i / PER, u1 = (i + 1) / PER;
        for (let k = 0; k < RINGS; k++) {
            const v0 = Math.pow(k / RINGS, 1.35);          // innen fein, außen grob
            const v1 = Math.pow((k + 1) / RINGS, 1.35);
            const A = ptAt(u0, v0), B = ptAt(u1, v0);
            const C = ptAt(u1, v1), D = ptAt(u0, v1);
            for (const [p, q, r] of [[A, B, C], [A, C, D]]) {
                for (const t of [p, q, r]) {
                    pos.push(t.x, t.y, t.z);
                    col.push(t.c[0], t.c[1], t.c[2], t.alpha);
                    meta.push(t.y, t.v, t.x, t.z, t.ei);   // Höhe, Randabstand, Lage, Kantenpunkt merken
                }
            }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.computeVertexNormals();
    // Materialwerte EXAKT wie das Spielfeld (roughness 0.92 / metalness 0.02),
    // keine Materialtönung: vorher färbte setHaze die ganze Schürze mit dem
    // Horizontton ein — an der Kante war das als Farbsprung zu sehen. Der
    // Dunst steckt jetzt allein in den Vertexfarben (nach außen zunehmend).
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, transparent: true, roughness: 0.92, metalness: 0.02,
        depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = -800;
    mesh.userData.setHaze = (c) => { hazeArr[0] = c.r * 0.45 + 0.55; hazeArr[1] = c.g * 0.45 + 0.55; hazeArr[2] = c.b * 0.45 + 0.55; };
    /**
     * Punkt AUF der vernetzten Schürze zu den Parametern u (0..1 einmal um die Karte)
     * und v (0..1 nach außen) – also dort, wo die Fläche wirklich gezeichnet wird, nicht
     * dort, wo die Höhenformel sie zwischen den Stützpunkten hätte. Für alles, was auf
     * der Schürze stehen soll (Bäume).
     */
    mesh.userData.pointAt = (u, v) => {
        u = ((u % 1) + 1) % 1; v = clamp01(v);
        const fi = u * PER, i = Math.min(PER - 1, Math.floor(fi)), s = fi - i;
        const k = Math.min(RINGS - 1, Math.floor(Math.pow(v, 1 / 1.35) * RINGS));   // Umkehrung von v = (k/RINGS)^1.35
        const v0 = Math.pow(k / RINGS, 1.35), v1 = Math.pow((k + 1) / RINGS, 1.35);
        const t = clamp01((v - v0) / Math.max(1e-9, v1 - v0));
        const u0 = i / PER, u1 = (i + 1) / PER;
        const A = ptAt(u0, v0), B = ptAt(u1, v0), C = ptAt(u1, v1), D = ptAt(u0, v1);
        // dieselbe Aufteilung des Vierecks wie beim Vernetzen: [A,B,C] und [A,C,D]
        return s >= t
            ? { x: A.x + s * (B.x - A.x) + t * (C.x - B.x), y: A.y + s * (B.y - A.y) + t * (C.y - B.y), z: A.z + s * (B.z - A.z) + t * (C.z - B.z) }
            : { x: A.x + t * (D.x - A.x) + s * (C.x - D.x), y: A.y + t * (D.y - A.y) + s * (C.y - D.y), z: A.z + t * (D.z - A.z) + s * (C.z - D.z) };
    };

    /**
     * Färbt die Schürze nach HÖHENPROFIL und Schneelage neu ein — genau wie
     * das Spielfeld: unter der Schneegrenze Wiese/Wald, darüber Schnee, dazwischen
     * ein weicher Übergang. `snowLineY` ist die Schneegrenze in Weltkoordinaten.
     */
    const rockC = [0.44, 0.45, 0.48];
    const snowC = [0.92, 0.94, 0.98];
    const grassC = [0.30, 0.42, 0.22];              // exakt das Wiesengrün von repaintSnowCover
    const forestC = [0.14, 0.29, 0.19];
    const worldMaxY = maxZ * hScale;
    // bandWorld = Übergangsband in Weltmetern — vom Spielfeld übernommen, damit
    // die Schneegrenze auf Karte und Schürze exakt gleich verläuft.
    // snowLineWorldY = Schneegrenze in Weltmetern; intern wird in
    // Heightmap-Einheiten gerechnet — exakt wie repaintSnowCover.
    const snowWarmth = theme.snowWarmth || 0;
    /**
     * Farbe des Spielfelds an einem Kantenpunkt: Mittel über ein paar Kacheln längs
     * der Kante und ein Stück ins Feld hinein (einzelne Ausreißer fallen so nicht auf).
     * `tc` sind die aktuellen Eckfarben des Spielfelds (3 Werte je Rasterpunkt).
     */
    const edgeColorAt = (ei, tc) => {
        const gx = ei % gridSize, gy = (ei - gx) / gridSize;
        let ix = 0, iy = 0;                                  // Richtung ins Feld hinein
        if (gy === 0) iy = 1; else if (gy === gridSize - 1) iy = -1;
        else if (gx === 0) ix = 1; else ix = -1;
        const ax = iy !== 0 ? 1 : 0, ay = ix !== 0 ? 1 : 0;    // Richtung längs der Kante
        let r = 0, g = 0, b = 0, n = 0, wood = 0;
        // längs der Kante breiter mitteln als ein Schürzenstreifen breit ist – sonst wechseln
        // benachbarte Streifen hart die Farbe (Kamm-Muster hinter bewaldeten Kanten)
        for (let k = 0; k <= 2; k++) for (let j = -7; j <= 7; j++) {
            const x = Math.max(0, Math.min(gridSize - 1, gx + ix * k + ax * j));
            const y = Math.max(0, Math.min(gridSize - 1, gy + iy * k + ay * j));
            const o = (y * gridSize + x) * 3;
            r += tc[o]; g += tc[o + 1]; b += tc[o + 2]; n++;
            const lt = landcover[y * gridSize + x];
            if (lt === 1 || lt === 5 || lt === 6) wood++;
        }
        // vierter Wert: Waldanteil an dieser Stelle der Kante (0..1)
        return [r / n, g / n, b / n, wood / n];
    };
    /**
     * `edgeCols` (optional): die aktuellen Eckfarben des Spielfelds. Damit schließt die
     * Schürze an der Kante FARBGLEICH an – egal ob dort Wiese, Waldboden, Schnee oder
     * Wasser liegt – und geht erst ein Stück weiter draußen in ihre eigene Färbung über.
     * Ohne diese Angabe sah man die Karte als Quadrat: innen grüne Wiese, direkt dahinter Weiß.
     */
    mesh.userData.setSnowLine = (snowLineWorldY, edgeCols = null) => {
        const limit = snowLineWorldY / hScale;
        const ca = geo.attributes.color, arr = ca.array;
        const nor = geo.attributes.normal ? geo.attributes.normal.array : null;
        const edgeCache = edgeCols ? new Map() : null;
        for (let i = 0, m2 = 0; i < arr.length; i += 4, m2 += 5) {
            const y = meta[m2], v = meta[m2 + 1], px = meta[m2 + 2], pz = meta[m2 + 3];
            const h = y / hScale;
            const gx = (px + half) / tile, gy = (pz + half) / tile;   // Rasterlage (auch außerhalb)
            const alt = (h - minZ) / range;
            // 1) exakt die Spielfeldformel: Grundfarbe -> Grün -> Naturschnee
            //    Der Hang der Schürze fällt überall gleich ab – die Schneegrenze lief deshalb
            //    als schnurgerader heller Streifen parallel zur Kartenkante durchs Tal. Ein
            //    weiträumiges Wellenfeld hebt und senkt die wirksame Höhe: der Schnee greift
            //    in Mulden zungenförmig hinab, auf Rücken weicht er zurück. Direkt an der
            //    Kante bleibt es bei der echten Höhe (dort übernimmt ohnehin die Randfarbe).
            const lobe = Math.sin(px * 0.021 + 0.6) * Math.sin(pz * 0.017 - 1.3) * 0.6
                       + Math.sin((px + pz) * 0.011 + 2.1) * 0.25 + Math.sin(px * 0.047 - pz * 0.039) * 0.15;
            const out01 = sm01(v / 0.05);
            const hSnow = h + lobe * (7.5 / hScale) * out01;
            const ground = openGroundColor(alt, snowWarmth);
            let shade = snowShade(ground, hSnow, limit, gx, gy);
            if (out01 > 0) {
                // Die Schürze ist weit draußen grob vernetzt. Ein scharfer Schneerand würde dort
                // als Treppenkante sichtbar – deshalb über einen Höhenbereich gemittelt (weicher Saum).
                const spread = (4.5 / hScale) * out01;
                const lo = snowShade(ground, hSnow - spread, limit, gx, gy), hi = snowShade(ground, hSnow + spread, limit, gx, gy);
                shade = [(shade[0] + lo[0] + hi[0]) / 3, (shade[1] + lo[1] + hi[1]) / 3, (shade[2] + lo[2] + hi[2]) / 3, (shade[3] + lo[3] + hi[3]) / 3];
            }
            const nat = shade[3];
            let c = [shade[0], shade[1], shade[2]];
            // 2) weiter draußen: Wald-/Wiesen-Flickenteppich, Latschen, Fels —
            //    nur auf dem aperen Anteil, der Schnee bleibt die Spielfeldfarbe
            const far = sm01((v - 0.02) / 0.14);
            if (far > 0 && nat < 1) {
                const patch = Math.sin(px * 0.055 + 0.7) * Math.sin(pz * 0.047 - 1.1)
                            + Math.sin((px + pz) * 0.031) * 0.6 + Math.sin(px * 0.13 - pz * 0.09) * 0.25;
                const meadow = clamp01((patch - 0.25) / 0.9);
                const altS = clamp01((h - limit) / Math.max(1, limit * 0.6) + 0.5);
                let g2 = mix(forestC, grassC, meadow * (1 - clamp01(altS * 1.3)));
                g2 = mix(g2, [0.24, 0.36, 0.25], clamp01((altS - 0.3) * 1.6) * 0.6);
                const green = mix(c, g2, far * (1 - nat));
                c = green;
            }
            // 3) Steilflanken: Fels, an dem auch Schnee schlecht hält
            const ny = nor ? nor[(i / 4) * 3 + 1] : 1;
            const steep = clamp01((0.86 - ny) / 0.22) * far;
            c = mix(c, rockC, steep * 0.85);
            // 3b) an der Kante die Farbe des Spielfelds übernehmen und nach außen auslaufen
            //     lassen – unregelmäßig weit, damit kein gerader Saum parallel zur Kante entsteht
            if (edgeCache && v < 0.13) {
                const ei = meta[m2 + 4];
                let ec = edgeCache.get(ei);
                if (!ec) { ec = edgeColorAt(ei, edgeCols); edgeCache.set(ei, ec); }
                const wob = Math.sin(px * 0.071 + 1.9) * Math.sin(pz * 0.063 - 0.4) + Math.sin((px - pz) * 0.037) * 0.5;
                // Wiese und Schnee dürfen weit hinauslaufen. Waldboden nur kurz: ein Waldstück
                // endet bald hinter der Kante – sonst zöge es sich als dunkler Streifen ins Umland.
                const reach = (0.070 + wob * 0.028) * (1 - ec[3]) + (0.020 + wob * 0.007) * ec[3];
                const keep = 1 - sm01((v - 0.004) / reach);
                if (keep > 0) c = mix(c, ec, keep);
            }
            // 4) nach außen in den Dunst ausbleichen (erst im ferneren Teil)
            c = mix(c, hazeArr, clamp01(Math.pow(clamp01((v - 0.18) / 0.82), 1.25)) * 0.88);
            arr[i] = c[0]; arr[i + 1] = c[1]; arr[i + 2] = c[2];
        }
        ca.needsUpdate = true;
    };
    return mesh;
}

/**
 * KANTENSCHATTEN: ein weicher, dunkler Saum entlang der Spielfeldgrenze —
 * innen wie außen ausblendend. Er verdeckt den Farbversatz zwischen
 * Spielfeld und Schürze so, wie es eine Geländekante mit Eigenschatten
 * täte, und wirkt dabei unauffälliger als jede noch so gute Farbangleichung.
 */
export function buildEdgeShade(world, gridSize, opts = {}) {
    const { heightmap } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const span = (gridSize - 1) * tile;
    const half = span / 2;
    const REACH = opts.reach ?? span * 1.70;
    // Nur noch ein Hauch: seit die Schürze an der Kante die Farbe des Spielfelds übernimmt,
    // gibt es keinen Farbversatz mehr zu verdecken – der frühere kräftige Saum (0.34)
    // zeichnete die Karte von oben als dunkel umrandetes Quadrat nach.
    const IN = opts.inner ?? 3.2, OUT = opts.outer ?? 2.4, A0 = opts.alpha ?? 0.08;
    const hAt = (wx, wz) => {
        const fx = Math.max(0, Math.min(gridSize - 1.001, (wx + half) / tile));
        const fy = Math.max(0, Math.min(gridSize - 1.001, (wz + half) / tile));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const h = (x, y) => (heightmap[y * gridSize + x] || 0) * hScale;
        return (h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx) * (1 - ty) + (h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx) * ty;
    };
    const PER = 360;
    const pos = [], col = [];
    const seam = (u) => {
        const s4 = u * 4, side = Math.floor(s4) % 4, f = s4 - Math.floor(s4);
        if (side === 0) return { x: -half + f * span, z: -half, nx: 0, nz: -1 };
        if (side === 1) return { x: half, z: -half + f * span, nx: 1, nz: 0 };
        if (side === 2) return { x: half - f * span, z: half, nx: 0, nz: 1 };
        return { x: -half, z: half - f * span, nx: -1, nz: 0 };
    };
    const dark = [0.06, 0.08, 0.11];
    const P = (u, k) => {                      // k: -1 innen .. 0 Kante .. +1 außen
        const e = seam(u);
        const d = k < 0 ? -k * IN : k * OUT;
        const x = e.x + e.nx * (k < 0 ? -d : d), z = e.z + e.nz * (k < 0 ? -d : d);
        let y;
        if (k <= 0) y = hAt(x, z);
        else {
            const len = Math.hypot(e.x, e.z) || 1;
            const v = d / REACH;
            const a = Math.atan2(e.z, e.x);
            // gleiche Höhenformel wie die Schürze (radial nach außen)
            const ex = e.x, ez = e.z;
            const yE = hAt(ex, ez);
            y = apronHeight(yE, a, v).y;
            // Position der Schürze ist radial, unsere ist senkrecht — Höhe
            // ist nur eine Näherung, deshalb leicht anheben.
            void len;
        }
        const alpha = A0 * (1 - Math.abs(k)) * (1 - Math.abs(k));
        return { x, y: y + 0.08, z, a: alpha };
    };
    const KS = [-1, -0.5, 0, 0.5, 1];
    for (let i = 0; i < PER; i++) {
        const u0 = i / PER, u1 = (i + 1) / PER;
        for (let j = 0; j + 1 < KS.length; j++) {
            const A = P(u0, KS[j]), B = P(u1, KS[j]), C = P(u1, KS[j + 1]), D = P(u0, KS[j + 1]);
            for (const t of [A, B, C, A, C, D]) { pos.push(t.x, t.y, t.z); col.push(dark[0], dark[1], dark[2], t.a); }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
                                             polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -700;
    return mesh;
}

/**
 * WALD AUF DER GELÄNDESCHÜRZE.
 *
 * Die Schürze allein wirkt wie eine glatte Rampe; erst Bewaldung lässt sie
 * wie echtes Umland aussehen. Die Bäume stehen dichter am Kartenrand und
 * lichten sich nach außen auf, damit der Übergang in den Dunst weich bleibt.
 * Alles instanziert — auch mehrere tausend Bäume kosten praktisch nichts.
 */
export function buildApronForest(world, gridSize, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const span = (gridSize - 1) * tile;
    const half = span / 2;
    // MUSS zur Schürze passen — sonst stehen die Bäume in der Luft.
    const REACH = opts.reach ?? span * 1.70;
    const SCATTER = opts.count ?? 16000;           // locker verteilte Bäume im ganzen Umland
    // WALDGÜRTEL: Wo auf dem Spielfeld Wald bis an die Kante reicht, läuft er dahinter
    // dicht weiter und lichtet sich erst nach ein paar Dutzend Metern. Vorher brach
    // jeder Wald an der Kartengrenze wie abgeschnitten ab.
    const BELT_DEPTH = opts.beltDepth ?? 24;       // so weit reicht der dichte Gürtel (Weltmeter)
    const BELT_MAX = opts.belt ?? 9000;            // Obergrenze; die echte Zahl folgt aus der bewaldeten Kantenlänge
    const hue = opts.hue || [0.17, 0.45, 0.27];

    // Höhenformel EXAKT wie in buildTerrainApron, damit die Bäume nicht
    // schweben oder im Boden stecken.
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
        const h = heightmap[i];
        if (h < minZ) minZ = h;
        if (h > maxZ) maxZ = h;
    }
    const edgeY = (ex, ez) => {
        const gx = Math.max(0, Math.min(gridSize - 1, Math.round((ex + half) / tile)));
        const gy = Math.max(0, Math.min(gridSize - 1, Math.round((ez + half) / tile)));
        return (heightmap[gy * gridSize + gx] || 0) * hScale;
    };
    // Baumgrenze: etwa auf 58 % der Kartenhöhe (Level-Themen können sie verschieben)
    const treeLine = opts.treeLine ?? (minZ + (maxZ - minZ) * (opts.treeLineFrac ?? 0.62)) * hScale;
    const treeY = [];                                   // Höhe je Baum (für die Schneelage)

    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.8, 5); trunkGeo.translate(0, 0.4, 0);
    const crownGeo = (() => {
        const parts = [
            new THREE.ConeGeometry(0.62, 1.1, 6),
            new THREE.ConeGeometry(0.46, 0.95, 6),
            new THREE.ConeGeometry(0.28, 0.75, 5)
        ];
        parts[0].translate(0, 0.95, 0); parts[1].translate(0, 1.55, 0); parts[2].translate(0, 2.1, 0);
        const nonIdx = parts.map(p => p.toNonIndexed());
        let n = 0; for (const p of nonIdx) n += p.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        let o = 0;
        for (const p of nonIdx) {
            pos.set(p.attributes.position.array, o * 3);
            nor.set(p.attributes.normal.array, o * 3);
            o += p.attributes.position.count;
        }
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        gg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        return gg;
    })();

    const crownMat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.88,
        emissive: 0x1c2a22, emissiveIntensity: 0.75,
        transparent: true, opacity: 1
    });
    const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x5a4130, roughness: 0.95, emissive: 0x2a1c12, emissiveIntensity: 0.7,
        transparent: true, opacity: 1
    });

    /** Steht an diesem Kantenpunkt (ein paar Kacheln ins Feld hinein) Wald? */
    const forestAtEdge = (ex, ez) => {
        const gx = Math.round((ex + half) / tile), gy = Math.round((ez + half) / tile);
        // Richtung ins Feld: weg von der Seite, auf der der Punkt liegt
        const ix = gx <= 0 ? 1 : gx >= gridSize - 1 ? -1 : 0, iy = gy <= 0 ? 1 : gy >= gridSize - 1 ? -1 : 0;
        let hit = 0;
        for (let k = 1; k <= 4; k++) {
            const x = Math.max(0, Math.min(gridSize - 1, gx + ix * k)), y = Math.max(0, Math.min(gridSize - 1, gy + iy * k));
            const t = landcover ? landcover[y * gridSize + x] : 0;
            if (t === 1 || t === 5 || t === 6) hit++;
        }
        return hit >= 2;
    };
    // Wie viel der Kartenkante ist bewaldet? Daraus folgt die Baumzahl des Gürtels: an der
    // Kante so dicht wie im Feld (ein Baum auf zwei Kacheln), nach außen linear auslaufend.
    let woodedEdge = 0;
    for (let q = 0; q < 4 * (gridSize - 1); q++) {
        const sd = Math.floor(q / (gridSize - 1)), f = (q % (gridSize - 1)) / (gridSize - 1);
        const ex = sd === 0 ? -half + f * span : sd === 1 ? half : sd === 2 ? half - f * span : -half;
        const ez = sd === 0 ? -half : sd === 1 ? -half + f * span : sd === 2 ? half : half - f * span;
        if (forestAtEdge(ex, ez)) woodedEdge += tile;
    }
    const BELT = Math.min(BELT_MAX, Math.round(woodedEdge * BELT_DEPTH * 0.5 * 0.5));
    const COUNT = SCATTER + BELT;

    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, COUNT);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
    // Schneehauben für den Gürtel – dieselbe Optik wie die Hauben der Bäume auf dem Spielfeld
    const capGeo = (() => {
        const parts = [
            new THREE.ConeGeometry(0.66, 0.34, 7),
            new THREE.ConeGeometry(0.49, 0.30, 7),
            new THREE.ConeGeometry(0.30, 0.28, 6)
        ];
        parts[0].translate(0, 1.12, 0); parts[1].translate(0, 1.72, 0); parts[2].translate(0, 2.26, 0);
        const nonIdx = parts.map(q => q.toNonIndexed());
        let n = 0; for (const q of nonIdx) n += q.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        let o = 0;
        for (const q of nonIdx) {
            pos.set(q.attributes.position.array, o * 3);
            nor.set(q.attributes.normal.array, o * 3);
            o += q.attributes.position.count;
        }
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        gg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        return gg;
    })();
    const capMat = new THREE.MeshStandardMaterial({
        color: 0xeef3fa, roughness: 0.9, emissive: 0xdde6f0, emissiveIntensity: 0.08,
        transparent: true, opacity: 0
    });
    const caps = new THREE.InstancedMesh(capGeo, capMat, Math.max(1, BELT));
    caps.visible = false; caps.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const colArr = new Float32Array(COUNT * 3);

    let placed = 0, guard = 0, beltPlaced = 0;
    while (placed < COUNT && guard < COUNT * 8) {
        guard++;
        const u = Math.random(), s4 = u * 4;
        const side = Math.floor(s4) % 4, f = s4 - Math.floor(s4);
        let ex, ez;
        if (side === 0)      { ex = -half + f * span; ez = -half; }
        else if (side === 1) { ex = half;             ez = -half + f * span; }
        else if (side === 2) { ex = half - f * span;  ez = half; }
        else                 { ex = -half;            ez = half - f * span; }

        // Erst der Waldgürtel an bewaldeten Kanten (dicht, nach außen auslaufend),
        // danach die lockere Verteilung über das ganze Umland.
        const belt = beltPlaced < BELT && guard < COUNT * 4;
        let v;
        if (belt) {
            if (!forestAtEdge(ex, ez)) continue;
            // Dichte fällt linear nach außen ab: an der Kante wie im Feld, am Gürtelrand null
            v = (0.9 + (BELT_DEPTH - 0.9) * (1 - Math.sqrt(Math.random()))) / REACH;
        } else {
            // Dichte fällt nach außen ab — quadratisch verteilt statt gleichmäßig
            v = Math.pow(Math.random(), 1.35) * 0.78;
            if (v < 0.012) continue;                // direkt an der Kante frei lassen
        }
        const len = Math.hypot(ex, ez) || 1;
        const d = v * REACH;
        let x = ex + (ex / len) * d, z = ez + (ez / len) * d;

        // GENAU dieselbe Höhenformel wie die Schürze — gemeinsame Funktion,
        // damit die Bäume nicht schweben, wenn das Relief geändert wird.
        const a = Math.atan2(ez, ex);
        const yFormula = apronHeight(edgeY(ex, ez), a, v).y;
        let y = yFormula;
        // Die Schürze ist grob vernetzt: zwischen ihren Stützpunkten weicht die Fläche von
        // der Formel ab. Kennt man die vernetzte Fläche, steht der Baum genau darauf –
        // wichtig vor allem im Waldgürtel direkt an der Kante, wo man es sonst sähe.
        if (opts.surfacePoint) { const sp = opts.surfacePoint(u, v); x = sp.x; y = sp.y; z = sp.z; }
        // ===== BAUMGRENZE & WALDINSELN =====
        // Oberhalb der Baumgrenze wächst nichts; darunter stehen die Bäume
        // nicht gleichmäßig, sondern in Waldstücken mit Lichtungen dazwischen,
        // und an Steilflanken (Fels) dünnt der Bestand aus.
        if (!belt) {
            if (placed - beltPlaced >= SCATTER) break;                  // lockere Verteilung ist vollständig
            if (y > treeLine) continue;
            const cl = Math.sin(x * 0.085 + 1.3) * Math.sin(z * 0.071 - 0.7) + Math.sin((x - z) * 0.047) * 0.6;
            if (cl < -0.35 && Math.random() > 0.10) continue;          // Lichtung
            const sl = apronHeight(edgeY(ex + 0.6, ez), a, v).y - yFormula;   // grobe Steilheit
            if (Math.abs(sl) > 1.1 && Math.random() > 0.3) continue;   // Felsflanke
        } else beltPlaced++;
        // Krüppelzone unter der Baumgrenze (der Gürtel setzt nur fort, was im Feld ohnehin steht)
        const nearTop = belt ? 0 : clamp01((y - (treeLine - 2.5)) / 2.5);

        const sc = (0.75 + Math.random() * 0.6) * (1 - nearTop * 0.45);
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.set(sc, sc * (0.85 + Math.random() * 0.35), sc);
        dummy.updateMatrix();
        crowns.setMatrixAt(placed, dummy.matrix);
        trunks.setMatrixAt(placed, dummy.matrix);
        if (belt) caps.setMatrixAt(placed, dummy.matrix);   // Gürtelbäume belegen die ersten Plätze

        // Farbe: nach außen in den Dunst ausbleichen
        const fade = clamp01(Math.pow(v / 0.72, 0.9)) * 0.8;
        const jit = (Math.random() - 0.5) * 0.06;
        const c = mix([hue[0] + jit, hue[1] + jit, hue[2] + jit], [0.80, 0.87, 0.94], fade);
        colArr[placed * 3] = c[0]; colArr[placed * 3 + 1] = c[1]; colArr[placed * 3 + 2] = c[2];
        treeY.push(y);
        placed++;
    }
    crowns.count = placed; trunks.count = placed;
    crowns.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
    caps.count = beltPlaced; caps.instanceMatrix.needsUpdate = true;
    crownGeo.setAttribute('color', new THREE.InstancedBufferAttribute(colArr, 3));

    const group = new THREE.Group();
    group.add(crowns); group.add(trunks); group.add(caps);
    group.renderOrder = -790;
    crowns.frustumCulled = false; trunks.frustumCulled = false;
    // Schnee auf den Kronen – aus zwei Quellen, es zählt die stärkere:
    //   Schneelage: Kronen oberhalb der Schneegrenze sind weiß überzuckert (wie Schürze und Spielfeld)
    //   Schneefall: frische Last auf allen Kronen. Die Bäume auf dem Spielfeld tragen dann
    //               Hauben; hier draußen gibt es keine, also hellt die Krone selbst auf –
    //               sonst stünde hinter der Kante ein dunkler Wald neben einem verschneiten.
    const baseCol = Float32Array.from(colArr);
    let lineY = Infinity, lineBand = 2.0, snowLoad = 0;
    const recolor = () => {
        const ca = crownGeo.getAttribute('color'), arr = ca.array;
        const byLoad = Math.min(1, snowLoad) * 0.56;
        for (let i = 0; i < placed; i++) {
            const byLine = clamp01((treeY[i] - (lineY - lineBand)) / (lineBand * 2)) * 0.62;
            // Gürtel direkt an der Kante: genau wie die Bäume auf dem Spielfeld – das Weiß
            // tragen die Hauben, die Krone selbst hellt nur leicht auf.
            const cov = i < beltPlaced ? Math.min(1, snowLoad) * 0.30 : Math.max(byLine, byLoad);
            arr[i * 3]     = baseCol[i * 3]     + (0.90 - baseCol[i * 3])     * cov;
            arr[i * 3 + 1] = baseCol[i * 3 + 1] + (0.93 - baseCol[i * 3 + 1]) * cov;
            arr[i * 3 + 2] = baseCol[i * 3 + 2] + (0.97 - baseCol[i * 3 + 2]) * cov;
        }
        ca.needsUpdate = true;
    };
    group.userData.setSnow = (load) => {
        load = Math.max(0, Math.min(1, load));
        caps.visible = beltPlaced > 0 && load > 0.05;
        capMat.opacity = Math.min(0.86, load * 1.15);       // wie die Hauben auf dem Spielfeld
        if (Math.abs(load - snowLoad) < 0.08) return;      // nur bei deutlicher Änderung neu einfärben
        snowLoad = load;
        recolor();
    };
    group.userData.setSnowLine = (snowLineWorldY, band = 2.0) => {
        lineY = snowLineWorldY; lineBand = band;
        recolor();
    };
    return group;
}

/**
 * ORTSLICHTER IM UMLAND: nachts glimmen in den Tälern der Schürze ein paar
 * Dörfer und Höfe — warme Lichtpunkte in kleinen Haufen. Tagsüber unsichtbar.
 */
export function buildApronLights(world, gridSize, opts = {}) {
    const { heightmap } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const span = (gridSize - 1) * tile;
    const half = span / 2;
    const REACH = opts.reach ?? span * 1.70;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < heightmap.length; i++) { const h = heightmap[i]; if (h < minZ) minZ = h; if (h > maxZ) maxZ = h; }
    const edgeY = (ex, ez) => {
        const gx = Math.max(0, Math.min(gridSize - 1, Math.round((ex + half) / tile)));
        const gy = Math.max(0, Math.min(gridSize - 1, Math.round((ez + half) / tile)));
        return (heightmap[gy * gridSize + gx] || 0) * hScale;
    };
    const lowLimit = APRON_FLOOR + 9;                            // nur unten im Tal
    const pos = [], col = [];
    const villages = 4 + Math.floor(Math.random() * 3);
    for (let v = 0; v < villages; v++) {
        // Dorfmitte irgendwo im mittleren Schürzenbereich
        const u = Math.random(), s4 = u * 4, side = Math.floor(s4) % 4, f = s4 - Math.floor(s4);
        let ex, ez;
        if (side === 0)      { ex = -half + f * span; ez = -half; }
        else if (side === 1) { ex = half;             ez = -half + f * span; }
        else if (side === 2) { ex = half - f * span;  ez = half; }
        else                 { ex = -half;            ez = half - f * span; }
        const vv = 0.12 + Math.random() * 0.4;
        const len = Math.hypot(ex, ez) || 1, d = vv * REACH;
        const cx = ex + (ex / len) * d, cz = ez + (ez / len) * d;
        const a = Math.atan2(ez, ex);
        const cy = apronHeight(edgeY(ex, ez), a, vv).y;
        if (cy > lowLimit) { continue; }
        const n = 10 + Math.floor(Math.random() * 26);
        for (let k = 0; k < n; k++) {
            const r = Math.pow(Math.random(), 0.6) * (3 + n * 0.22), ang = Math.random() * Math.PI * 2;
            const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
            const y = apronHeight(edgeY(ex, ez), a, vv + (r / REACH) * (Math.random() - 0.5)).y + 0.6;
            pos.push(x, y, z);
            const warm = Math.random();
            col.push(1.0, 0.72 + warm * 0.2, 0.42 + warm * 0.3);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0,
                                          depthWrite: false, sizeAttenuation: true, fog: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -780;
    pts.userData.setNight = (n) => { mat.opacity = Math.max(0, Math.min(1, (n - 0.15) / 0.5)) * 0.95; pts.visible = mat.opacity > 0.01; };
    pts.userData.count = pos.length / 3;
    return pts;
}

/**
 * TALNEBEL: ein flacher, weicher Dunstring in den Senken des Umlands. Wo die
 * Schürze höher liegt, verschwindet er dahinter — es bleibt der Eindruck
 * von Nebelfeldern in den Tälern und Luftperspektive zur Fernkette hin.
 */
export function buildValleyHaze(world, gridSize, opts = {}) {
    const { heightmap } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const span = (gridSize - 1) * tile;
    const REACH = opts.reach ?? span * 1.70;
    let minZ = Infinity;
    for (let i = 0; i < heightmap.length; i++) if (heightmap[i] < minZ) minZ = heightmap[i];
    const baseY = APRON_FLOOR + (opts.lift ?? 1.4);
    const SEG = 160, RINGS = 14;
    const rIn = span * 0.52, rOut = span * 0.5 + REACH * 0.98;
    const pos = [], col = [];
    const haze = new THREE.Color(opts.hazeColor ?? 0xdde9f5);
    for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        for (let k = 0; k < RINGS; k++) {
            const v0 = k / RINGS, v1 = (k + 1) / RINGS;
            const P = (a, v) => {
                const r = rIn + (rOut - rIn) * v;
                // sanft wellig, damit die Nebelkante nicht wie ein Kreis wirkt
                const y = baseY + Math.sin(a * 5 + v * 9) * 0.35 + v * 1.2;
                const alpha = Math.sin(Math.min(1, v * 1.6) * Math.PI * 0.5) * (0.42 - v * 0.18);
                return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, al: Math.max(0, alpha) };
            };
            const A = P(a0, v0), B = P(a1, v0), C = P(a1, v1), D = P(a0, v1);
            for (const t of [A, B, C, A, C, D]) { pos.push(t.x, t.y, t.z); col.push(haze.r, haze.g, haze.b, t.al); }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -785;
    mesh.userData.setHaze = (c) => { mat.color.copy(c).lerp(new THREE.Color(0xffffff), 0.7); };
    return mesh;
}
