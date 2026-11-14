// ============================================================
// 3D-TERRAIN-MESH aus den bestehenden Generator-Daten
// heightmap + landcover -> beleuchtetes Three.js-Mesh mit Vertex-Farben.
// Landcover: 0 Schnee 1 Nadelwald 2 Wasser 3 Fels 4 Asphalt
//            5 Mischwald 6 Winterwald 7 Wiese 8 Gletscher
// ============================================================
import * as THREE from 'three';
import { waterBedColor } from './Water3D.js';
import { makeSnowMaterial, groundColor, groundNoise, groundPalette } from './SnowSurface.js';

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
 * Geländenetz des Spielfelds. Die Eckfarbe ist der UNTERGRUND (Wiese, Waldboden, Fels …); ob
 * und wie Schnee darauf liegt, entscheidet das Schnee-Material je Bildpunkt (SnowSurface.js).
 *   aSnow  liegender Neu-/Kunstschnee je Eckpunkt (die Szene schreibt ihn laufend fort)
 *   aMark  x: Anlagen-Einfärbung · y: Kronendach (1 = Wald)
 */
export function buildTerrainMesh(world, gridSize, theme = {}, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const half = ((gridSize - 1) * tile) / 2;

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
    const aSnow = new Float32Array(pos.count);
    const aMark = new Float32Array(pos.count * 2);
    const pal = groundPalette(theme, opts.rockCol || [0.42, 0.44, 0.48]);
    /** Untergrundfarbe eines Rasterpunkts (auch zum Nachfärben, z. B. nach dem Roden). */
    const groundAt = (idx, type = landcover[idx]) => {
        const gx = idx % gridSize, gy = (idx - gx) / gridSize;
        if (type === 2 && world.waterDepth) return waterBedColor(world.waterDepth[idx]);   // Bett: das Blau kommt von der Wasserfläche
        const alt = ((heightmap[idx] || 0) - minZ) / range;
        return groundColor(type, alt, groundNoise(gx * tile - half, gy * tile - half), pal);
    };
    for (let i = 0; i < pos.count; i++) {
        pos.setY(i, (heightmap[i] || 0) * hScale);
        const t = landcover[i];
        const c = groundAt(i, t);
        colors[i*3] = c[0]; colors[i*3+1] = c[1]; colors[i*3+2] = c[2];
        aMark[i*2+1] = (t === 1 || t === 5 || t === 6) ? 1 : 0;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSnow', new THREE.BufferAttribute(aSnow, 1));
    geo.setAttribute('aMark', new THREE.BufferAttribute(aMark, 2));
    geo.computeVertexNormals();

    const mat = opts.snowUniforms
        ? makeSnowMaterial(opts.snowUniforms)
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData = { minZ, maxZ, hScale, gridSize, tile, groundAt };
    return mesh;
}

/**
 * Steht in dieser Waldzelle ein Baum? Etwa jede zweite – gewürfelt. (Früher entschied die
 * Parität von gx und gy: ein Schachbrett, das als schnurgerade Baumreihen zu sehen war.)
 */
export function treeCell(gx, gy) {
    let n = (Math.imul(gx, 374761393) + Math.imul(gy, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) & 1) === 0;
}
/** Versatz eines Baums innerhalb seiner Zelle (−0.42..0.42), damit kein Raster entsteht. */
export function treeJitter(gx, gy, out) {
    let n = (Math.imul(gx, 2246822519) + Math.imul(gy, 3266489917) + 374761393) | 0;
    n = Math.imul(n ^ (n >>> 15), 2246822519);
    n ^= n >>> 13;
    out[0] = ((n & 1023) / 1023 - 0.5) * 0.84;
    out[1] = (((n >>> 10) & 1023) / 1023 - 0.5) * 0.84;
    return out;
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
            if (!treeCell(gx, gy)) continue;
            // opts.filter: nur ein Teil des Rasters bekommt Bäume (Waldgürtel hinter dem Kartenrand)
            if (opts.filter && !opts.filter(gx, gy)) continue;
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
        const parts = geos.map(g2 => (g2.index ? g2.toNonIndexed() : g2));
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
    // SPARSAME GEOMETRIE: Auf einer Karte stehen Zehntausende Bäume – jedes Dreieck zählt
    // zigtausendfach. Stämme sind oben und unten offen (die Enden sieht man nie), die Kränze
    // haben eine Kante weniger, die Laubkronen kommen mit gröberen Kugeln aus. Zusammen mit den
    // Hauben sind das rund 70 statt 200 Dreiecke je Fichte, ohne dass man es dem Wald ansieht.
    /**
     * Kegel aus genau den Dreiecken, die man sieht: Mantel = `seg` Dreiecke, dazu wahlweise der
     * Boden. (Die three.js-Fassung legt je Mantelfeld ein zweites, zur Spitze hin entartetes
     * Dreieck an – bei Zehntausenden Bäumen ein Drittel verschenkte Eckpunkte.)
     */
    const coneGeo = (r, h, seg, base = true) => {
        const pos = [], nor = [];
        const len = Math.hypot(r, h), ny = r / len, nr = h / len;
        for (let i = 0; i < seg; i++) {
            const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
            const x0 = Math.sin(a0) * r, z0 = Math.cos(a0) * r, x1 = Math.sin(a1) * r, z1 = Math.cos(a1) * r;
            pos.push(0, h / 2, 0, x0, -h / 2, z0, x1, -h / 2, z1);
            nor.push(Math.sin(am) * nr, ny, Math.cos(am) * nr, Math.sin(a0) * nr, ny, Math.cos(a0) * nr, Math.sin(a1) * nr, ny, Math.cos(a1) * nr);
            if (base) { pos.push(0, -h / 2, 0, x1, -h / 2, z1, x0, -h / 2, z0); nor.push(0, -1, 0, 0, -1, 0, 0, -1, 0); }
        }
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g2.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        return g2;
    };
    const cone = (r, h, y, seg = 6) => { const c = coneGeo(r, h, seg); c.translate(0, y, 0); return c; };
    const stem = (r1, r2, h, y) => { const c = new THREE.CylinderGeometry(r1, r2, h, 4, 1, true); c.translate(0, y, 0); return c; };
    // Fichte: drei gestaffelte Kränze + Spitze + kurzer Stammansatz
    const spruceGeo = mergeGeos([
        stem(0.07, 0.1, 0.5, 0.25),
        cone(0.62, 1.0, 0.85, 6),
        cone(0.5, 0.95, 1.45, 6),
        cone(0.36, 0.85, 2.0, 5),
        cone(0.18, 0.55, 2.55, 4)
    ]);
    // Tanne: breiter, zwei Etagen + Stammansatz
    const firGeo = mergeGeos([
        stem(0.08, 0.12, 0.45, 0.22),
        cone(0.95, 1.1, 0.85, 7),
        cone(0.66, 0.95, 1.5, 6)
    ]);
    // Laubbaum: unregelmäßige Krone aus drei versetzten Kugeln
    const blob = (r, x, y, z, ws = 6, hs = 4) => { const b = new THREE.SphereGeometry(r, ws, hs); b.scale(1, 0.85, 1); b.translate(x, y, z); return b; };
    const broadGeo = mergeGeos([
        blob(0.62, 0, 1.15, 0),
        blob(0.42, 0.34, 1.42, 0.12, 5, 3),
        blob(0.38, -0.3, 1.35, -0.14, 5, 3)
    ]);
    const trunkGeo  = new THREE.CylinderGeometry(0.08, 0.11, 0.7, 4, 1, true); trunkGeo.translate(0, 0.35, 0);

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
    /** Standort eines Baums: in seiner Zelle versetzt, auf der dort gezeichneten Geländehöhe. */
    const _j = [0, 0], _p = [0, 0, 0];
    const treePos = (gx, gy) => {
        treeJitter(gx, gy, _j);
        const fx = Math.max(0, Math.min(gridSize - 1.001, gx + _j[0])), fy = Math.max(0, Math.min(gridSize - 1.001, gy + _j[1]));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = y0 * gridSize + x0;
        const h = (heightmap[i] * (1 - tx) + heightmap[i + 1] * tx) * (1 - ty) + (heightmap[i + gridSize] * (1 - tx) + heightmap[i + gridSize + 1] * tx) * ty;
        _p[0] = fx * tile - half; _p[1] = (h || 0) * hScale; _p[2] = fy * tile - half;
        return _p;
    };
    const place = (list, target, trunkTarget) => {
        list.forEach((s, i) => {
            const tp = treePos(s.gx, s.gy), wx = tp[0], wy = tp[1], wz = tp[2];
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
    // Die Hauben sind dünne Schalen ÜBER den Kränzen – ihre Unterseite steckt im Baum und
    // braucht keine Fläche (offene Kegel); das Kügelchen auf der Spitze ist ein kleiner Kegel.
    const capCone = (r, h, y, seg = 6) => { const c2 = coneGeo(r, h, seg, false); c2.translate(0, y, 0); return c2; };
    const capGeoSpruce = mergeGeos([
        capCone(0.66, 0.34, 1.02),
        capCone(0.52, 0.3, 1.62),
        capCone(0.36, 0.28, 2.16, 5),
        capCone(0.17, 0.3, 2.66, 4)
    ]);
    const capGeoFir = mergeGeos([
        capCone(0.98, 0.34, 1.42, 7),
        capCone(0.68, 0.3, 1.98)
    ]);
    // Laubbaum: kleinere Haube nur auf dem Scheitel – darunter bleibt ein grüner Rand
    // (vorher saß sie wie ein Helm über der ganzen Krone).
    const capGeoBroad = (() => {
        const c2 = new THREE.SphereGeometry(0.5, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.55);   // nur die obere Kappe
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
            const tp = treePos(s3.gx, s3.gy), wx = tp[0], wy = tp[1], wz = tp[2];
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
            const tp = treePos(sp.gx, sp.gy), wx = tp[0], wy = tp[1], wz = tp[2];
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
    const SUB = 2, STEP = 1 / SUB;
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

// (Das Umland – Gelände, Wald und Dunst hinter dem Kartenrand – baut Surround3D.js.)
