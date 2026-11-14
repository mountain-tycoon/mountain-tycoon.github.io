// Das Umland: alles hinter dem Kartenrand.
//
// Früher saß das Spielfeld auf einem Sockel: eine „Schürze" fiel rundum gleich steil in ein Tal
// ab, ihre Form hing nur vom Winkel ab (Sternmuster), dahinter standen Bergketten als
// konzentrische Ringe. Die Karte war von überall als Quadrat auf einem Podest zu erkennen.
//
// Jetzt ist das Umland dieselbe Landschaft wie das Spielfeld, nur weitergerechnet:
//   - nahe am Rand das mit erzeugte Gebiet (world.outer) – dieselben Hänge, Täler, Wälder, Seen
//   - dahinter dieselbe Landschaft als Formel (world.far) bis zum Horizont
// Ein einziges Netz spannt sich von der Spielfeldkante nach außen: an der Kante Punkt für Punkt
// deckungsgleich mit dem Spielfeld (gleiche Höhe, Farbe, Normale – kein Saum), nach außen immer
// gröber. Es trägt dasselbe Schnee-Material wie das Spielfeld; ganz außen geht es in den
// Horizontdunst über. Der Wald läuft über den Rand weiter und lichtet sich in die Ferne.
import * as THREE from 'three';
import { makeSnowMaterial, groundColor, groundNoise, groundPalette, SOFT_FOG } from './SnowSurface.js';
import { waterBedColor } from './Water3D.js';
import { treeCell } from './TerrainMesh.js';

const sm01 = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const isForest = (c) => c === 1 || c === 5 || c === 6;

/**
 * @param world     Welt des Levels (mit world.outer und world.far, siehe engine/terrainGen.js)
 * @param gridSize  Kantenlänge des Spielfelds in Rasterpunkten
 * @param opts      { hScale, tileSize, theme, rockCol, snowUniforms, terrain (Spielfeldnetz),
 *                    waterDepth (für das äußere Gebiet), forest: {spruce, fir, broad, hue}, treeBudget }
 * @returns THREE.Group mit userData:
 *            heightAt(wx, wz)   Höhe des Umlands an einer Weltlage (genau auf dem gezeichneten Netz)
 *            edgeNormal(i, out) Normale eines Spielfeld-Randpunkts aus beiden Seiten gerechnet
 *            setSnowLoad(load)  Schneelast auf den Bäumen
 *            reach              so weit reicht das Netz (Abstand von der Kartenmitte)
 */
export function buildSurround(world, gridSize, opts = {}) {
    const hScale = opts.hScale ?? 0.09;
    const tile = opts.tileSize ?? 1;
    const G = gridSize, L = G - 1;
    const span = L * tile, half = span / 2;
    const outer = world.outer, far = world.far || null;
    const OG = outer.gridSize, OFF = outer.offset;
    const OH = outer.heightmap, OL = outer.landcover;
    const F = world.upsampled || 1;                       // Basiskachel -> Rasterpunkt
    const waterDepth = opts.waterDepth || null;
    const REACH = opts.reach ?? span * 2.1;               // so weit reicht das Netz hinter die Kante
    const terrain = opts.terrain;
    const minZ = terrain.userData.minZ, range = (terrain.userData.maxZ - minZ) || 1;
    const pal = groundPalette(opts.theme || {}, opts.rockCol || [0.42, 0.44, 0.48]);
    const group = new THREE.Group();

    // ---- Höhe an beliebiger Stelle (in Höheneinheiten der heightmap) ----
    const outerH = (ox, oy) => {
        const x = ox < 0 ? 0 : ox > OG - 1.001 ? OG - 1.001 : ox, y = oy < 0 ? 0 : oy > OG - 1.001 ? OG - 1.001 : oy;
        const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, i = y0 * OG + x0;
        return (OH[i] * (1 - tx) + OH[i + 1] * tx) * (1 - ty) + (OH[i + OG] * (1 - tx) + OH[i + OG + 1] * tx) * ty;
    };
    const seaH = far && far.ocean ? far.seaLevel * F : -Infinity;
    const farH = (wx, wz) => {
        const px = (wx + half) / (tile * F), py = (wz + half) / (tile * F);
        let h = far.rawAt(px, py) * F;
        // Meeresboden unter den Spiegel legen (die Wasserfläche liegt genau auf Meereshöhe)
        if (h <= seaH + 0.05) h = seaH - 14;
        return h;
    };
    const BLEND = 44;                                     // Übergang vom erzeugten Gebiet zur Formel (Rasterpunkte)
    /** rad: halbe Maschenweite an dieser Stelle – grobe Maschen tauchen an Gewässern unter den Spiegel. */
    const heightUnits = (wx, wz, rad = 0) => {
        const ox = (wx + half) / tile + OFF, oy = (wz + half) / tile + OFF;
        const dIn = Math.min(ox, oy, OG - 1 - ox, OG - 1 - oy);       // > 0: im erzeugten Gebiet
        if (dIn <= 0 || !Number.isFinite(dIn)) return far ? farH(wx, wz) : outerH(ox, oy);
        let h = outerH(ox, oy);
        if (rad > 1.4) {
            // Ein grobes Netz würde schmale Bäche und Ufer überspannen und das Wasser verdecken:
            // liegt Wasser in Reichweite, zählt der tiefste Punkt der Umgebung.
            let wet = false, lo = h;
            for (let k = 0; k < 8; k++) {
                const a = k * 0.7854, sx = ox + Math.cos(a) * rad, sy = oy + Math.sin(a) * rad;
                const cx = Math.round(sx), cy = Math.round(sy);
                if (cx < 0 || cy < 0 || cx >= OG || cy >= OG) continue;
                if (OL[cy * OG + cx] === 2) { wet = true; const hh = OH[cy * OG + cx]; if (hh < lo) lo = hh; }
            }
            if (wet) h = Math.min(h, lo);
        }
        if (dIn >= BLEND || !far) return h;
        const fh = farH(wx, wz);
        return fh + (h - fh) * sm01(dIn / BLEND);
    };

    // ---- Bodenbedeckung an beliebiger Stelle: Anteil Wald / Wasser und die Untergrundfarbe ----
    const _cov = { canopy: 0, r: 0, g: 0, b: 0 };
    const coverAt = (wx, wz, hUnits, rad) => {
        const ox = (wx + half) / tile + OFF, oy = (wz + half) / tile + OFF;
        const alt = (hUnits - minZ) / range;
        const n = groundNoise(wx, wz);
        let wood = 0, wet = 0, ice = 0, cnt = 0, depth = 0, mixed = 0;
        const inside = ox >= 0 && oy >= 0 && ox <= OG - 1 && oy <= OG - 1;
        if (inside) {
            const taps = rad > 1.4 ? 5 : 1;
            for (let k = 0; k < taps; k++) {
                const sx = k === 0 ? ox : ox + (k === 1 ? rad : k === 2 ? -rad : 0) * 0.6;
                const sy = k === 0 ? oy : oy + (k === 3 ? rad : k === 4 ? -rad : 0) * 0.6;
                const cx = Math.max(0, Math.min(OG - 1, Math.round(sx))), cy = Math.max(0, Math.min(OG - 1, Math.round(sy)));
                const c = OL[cy * OG + cx];
                cnt++;
                if (isForest(c)) { wood++; if (c === 5) mixed++; }
                else if (c === 2) { wet++; depth += waterDepth ? waterDepth[cy * OG + cx] : 0.6; }
                else if (c === 8) ice++;
            }
        } else if (far) {
            const px = (wx + half) / (tile * F), py = (wz + half) / (tile * F);
            cnt = 1;
            if (hUnits < seaH) { wet = 1; depth = 1.2; }
            else { const t = far.forestAt(px, py, hUnits / F); if (t) { wood = 1; if (t === 5) mixed = 1; } else if (far.glacierLine != null && hUnits / F > far.glacierLine * 1.1) ice = 1; }
        } else cnt = 1;
        const canopy = wood / cnt;
        let c = ice / cnt > 0.5 ? groundColor(8, alt, n, pal) : groundColor(0, alt, n, pal);
        if (canopy > 0) { const fc = groundColor(mixed * 2 > wood ? 5 : 1, alt, n, pal); c = [c[0] + (fc[0] - c[0]) * canopy, c[1] + (fc[1] - c[1]) * canopy, c[2] + (fc[2] - c[2]) * canopy]; }
        if (wet > 0) { const wc = waterBedColor(depth / wet), k = wet / cnt; c = [c[0] + (wc[0] - c[0]) * k, c[1] + (wc[1] - c[1]) * k, c[2] + (wc[2] - c[2]) * k]; }
        _cov.canopy = canopy; _cov.r = c[0]; _cov.g = c[1]; _cov.b = c[2];
        return _cov;
    };

    // ============================================================
    // NETZ: Ringe um das Spielfeld. Jeder Punkt liegt auf einem Strahl von der Kartenmitte durch
    // einen Punkt der Kante. Ring 0 ist die Kante selbst (jeder Rasterpunkt); nach außen wachsen
    // die Ringabstände, und entlang des Umfangs wird jeder zweite Punkt weggelassen, sobald die
    // Maschen sonst zu schmal würden. Zwischen zwei Ringen unterschiedlicher Dichte schließt ein
    // Fächer die Lücke – nirgends bleibt ein Riss.
    // ============================================================
    const dist = [0];
    while (dist[dist.length - 1] < REACH) { const d = dist[dist.length - 1]; dist.push(d + Math.max(1.5 * tile, (1.2 + d * 0.055))); }
    const R = dist.length;
    const step = new Array(R);
    for (let k = 0; k < R; k++) {
        const r = (k + 1 < R ? dist[k + 1] - dist[k] : dist[k] - dist[k - 1]) / tile;
        let s = 1;
        while (s < 16 && s * 2 * (1 + dist[k] / half) <= r * 1.15) s *= 2;
        step[k] = k > 0 ? Math.min(Math.max(s, step[k - 1]), step[k - 1] * 2) : 1;
    }
    const perSide = step.map(s => Math.ceil(L / s));
    const ringStart = new Array(R);
    let vCount = 0;
    for (let k = 0; k < R; k++) { ringStart[k] = vCount; vCount += perSide[k] * 4; }
    /** Eckpunkt-Nummer zu Ring k und Umfangslage u (0..4L, in Rasterschritten; muss auf dem Ring liegen). */
    const vIdx = (k, u) => {
        if (u >= 4 * L) u -= 4 * L;
        const side = Math.floor(u / L), j = (u - side * L) / step[k];
        return ringStart[k] + side * perSide[k] + j;
    };
    const edgeX = (u) => { const side = Math.floor(u / L) % 4, k = u - Math.floor(u / L) * L; return side === 0 ? -half + k * tile : side === 1 ? half : side === 2 ? half - k * tile : -half; };
    const edgeZ = (u) => { const side = Math.floor(u / L) % 4, k = u - Math.floor(u / L) * L; return side === 0 ? -half : side === 1 ? -half + k * tile : side === 2 ? half : half - k * tile; };

    const P = new Float32Array(vCount * 3);
    const C = new Float32Array(vCount * 3);
    const MK = new Float32Array(vCount * 2);
    const tcol = terrain.geometry.attributes.color.array, tmark = terrain.geometry.attributes.aMark.array;
    const tpos = terrain.geometry.attributes.position.array;
    /** Rasterpunkt des Spielfelds unter der Umfangslage u (nur für ganze u). */
    const playIdx = (u) => {
        if (u >= 4 * L) u -= 4 * L;
        const side = Math.floor(u / L), k = u - side * L;
        const gx = side === 0 ? k : side === 1 ? L : side === 2 ? L - k : 0;
        const gy = side === 0 ? 0 : side === 1 ? k : side === 2 ? L : L - k;
        return gy * G + gx;
    };
    for (let k = 0; k < R; k++) {
        const s = step[k], d = dist[k];
        const radial = (k + 1 < R ? dist[k + 1] - dist[k] : dist[k] - dist[k - 1]);
        for (let side = 0; side < 4; side++) for (let j = 0; j < perSide[k]; j++) {
            const u = side * L + j * s, vi = ringStart[k] + side * perSide[k] + j;
            const ex = edgeX(u), ez = edgeZ(u);
            if (k === 0) {
                // die Kante: Punkt für Punkt das Spielfeld
                const pi = playIdx(u);
                P[vi * 3] = ex; P[vi * 3 + 1] = tpos[pi * 3 + 1]; P[vi * 3 + 2] = ez;
                C[vi * 3] = tcol[pi * 3]; C[vi * 3 + 1] = tcol[pi * 3 + 1]; C[vi * 3 + 2] = tcol[pi * 3 + 2];
                MK[vi * 2 + 1] = tmark[pi * 2 + 1];
                continue;
            }
            const len = Math.hypot(ex, ez) || 1;
            const x = ex + (ex / len) * d, z = ez + (ez / len) * d;
            const mesh = Math.max(s * tile * (1 + d / len), radial) * 0.5;      // halbe Maschenweite
            const hu = heightUnits(x, z, mesh / tile);
            P[vi * 3] = x; P[vi * 3 + 1] = hu * hScale; P[vi * 3 + 2] = z;
            const cv = coverAt(x, z, hu, mesh / tile);
            C[vi * 3] = cv.r; C[vi * 3 + 1] = cv.g; C[vi * 3 + 2] = cv.b;
            // Kronendach 0..1; darüber hinaus (bis 2) „Wald aus der Ferne": hinter dem Waldgürtel
            // stehen nur noch einzelne Bäume, dort zeichnet das Material die Kronen in den Boden.
            MK[vi * 2 + 1] = cv.canopy * (1 + sm01((d - (opts.beltEnd ?? 30) * tile) / (50 * tile)));
        }
    }
    /**
     * Dreiecke der Masche zwischen Ring k und k+1, die auf dem äußeren Ring bei u0 beginnt.
     * Dieselbe Aufteilung benutzt die Höhenabfrage unten – so stehen Bäume und Kamera genau auf
     * der gezeichneten Fläche.
     */
    const cellTris = (k, u0, out) => {
        const b = step[k + 1], a = step[k];
        const side = Math.floor(u0 / L), sideEnd = (side + 1) * L;
        const u1 = Math.min(u0 + b, sideEnd);
        const q0 = vIdx(k + 1, u0), q1 = vIdx(k + 1, u1);
        const p0 = vIdx(k, u0), p2 = vIdx(k, u1);
        const um = u0 + a;
        let n = 0;
        if (a < b && um < u1) {
            const p1 = vIdx(k, um);
            out[n++] = p0; out[n++] = q0; out[n++] = p1;
            out[n++] = p1; out[n++] = q0; out[n++] = q1;
            out[n++] = p1; out[n++] = q1; out[n++] = p2;
        } else {
            out[n++] = p0; out[n++] = q0; out[n++] = q1;
            out[n++] = p0; out[n++] = q1; out[n++] = p2;
        }
        return n;
    };
    const index = [];
    const _t = new Array(9);
    for (let k = 0; k < R - 1; k++) {
        const b = step[k + 1];
        for (let side = 0; side < 4; side++) for (let j = 0; j < perSide[k + 1]; j++) {
            const n = cellTris(k, side * L + j * b, _t);
            for (let i = 0; i < n; i++) index.push(_t[i]);
        }
    }
    // Drehsinn prüfen: die Flächen sollen nach oben zeigen
    {
        const a = index[0] * 3, b = index[1] * 3, c = index[2] * 3;
        const ny = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]);
        if (ny < 0) for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('aSnow', new THREE.BufferAttribute(new Float32Array(vCount), 1));
    geo.setAttribute('aMark', new THREE.BufferAttribute(MK, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();

    // ---- Naht: an der Kante dieselbe Normale für beide Netze ----
    // Jedes Netz kennt nur seine eigenen Dreiecke; die Randnormalen wichen deshalb voneinander ab
    // und die Kante zeichnete sich als feine Lichtlinie ab. Die Normale eines Randpunkts wird
    // darum aus dem Gelände beiderseits der Kante gerechnet und beiden Netzen gegeben.
    const edgeNormal = (playVertex, out) => {
        const gx = playVertex % G, gy = (playVertex - gx) / G;
        const ox = gx + OFF, oy = gy + OFF;
        const xl = Math.max(0, ox - 1), xr = Math.min(OG - 1, ox + 1), yu = Math.max(0, oy - 1), yd = Math.min(OG - 1, oy + 1);
        const dx = (OH[oy * OG + xr] - OH[oy * OG + xl]) * hScale / ((xr - xl) * tile || 1);
        const dz = (OH[yd * OG + ox] - OH[yu * OG + ox]) * hScale / ((yd - yu) * tile || 1);
        const l = Math.hypot(dx, 1, dz);
        out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l;
        return out;
    };
    {
        const nrm = geo.attributes.normal.array, tmp = [0, 1, 0];
        for (let side = 0; side < 4; side++) for (let j = 0; j < perSide[0]; j++) {
            const u = side * L + j, vi = ringStart[0] + side * perSide[0] + j;
            edgeNormal(playIdx(u), tmp);
            nrm[vi * 3] = tmp[0]; nrm[vi * 3 + 1] = tmp[1]; nrm[vi * 3 + 2] = tmp[2];
        }
    }

    const mat = makeSnowMaterial(opts.snowUniforms, { bins: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;                 // Schatten laufen über die Kante weiter
    mesh.frustumCulled = false;
    group.add(mesh);

    // ---- Höhe auf dem gezeichneten Netz ----
    const lastD = dist[R - 1];
    const heightAt = (wx, wz) => {
        const ax = Math.abs(wx), az = Math.abs(wz), m = Math.max(ax, az);
        if (m <= half) return null;                                   // im Spielfeld
        const sc = half / m, ex = wx * sc, ez = wz * sc;
        let side, kpos;
        if (ax >= az) { if (wx > 0) { side = 1; kpos = (ez + half) / tile; } else { side = 3; kpos = (half - ez) / tile; } }
        else if (wz < 0) { side = 0; kpos = (ex + half) / tile; }
        else { side = 2; kpos = (half - ex) / tile; }
        kpos = Math.max(0, Math.min(L - 1e-6, kpos));
        const d = Math.min(lastD - 1e-3, Math.hypot(wx, wz) - Math.hypot(ex, ez));
        let lo = 0, hi = R - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (dist[mid] <= d) lo = mid; else hi = mid; }
        const k = lo, b = step[k + 1];
        const u0 = side * L + Math.floor(kpos / b) * b;
        const n = cellTris(k, u0, _t);
        let best = 0, bestMin = -Infinity, by = 0;
        for (let i = 0; i < n; i += 3) {
            const a = _t[i] * 3, bb = _t[i + 1] * 3, c = _t[i + 2] * 3;
            const x1 = P[a], z1 = P[a + 2], x2 = P[bb], z2 = P[bb + 2], x3 = P[c], z3 = P[c + 2];
            const det = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
            if (Math.abs(det) < 1e-9) continue;
            const l1 = ((z2 - z3) * (wx - x3) + (x3 - x2) * (wz - z3)) / det;
            const l2 = ((z3 - z1) * (wx - x3) + (x1 - x3) * (wz - z3)) / det;
            const l3 = 1 - l1 - l2;
            const mn = Math.min(l1, l2, l3);
            if (mn > bestMin) { bestMin = mn; best = i; by = l1 * P[a + 1] + l2 * P[bb + 1] + l3 * P[c + 1]; }
            if (mn >= -1e-4) break;
        }
        void best;
        return by;
    };

    // ============================================================
    // WALD IM UMLAND
    // Der Bestand des erzeugten Gebiets läuft hinter der Kante dicht weiter (dieselben Waldstücke,
    // dieselbe Dichte) und lichtet sich nach außen; die Bäume werden dabei größer, damit der Wald
    // aus der Ferne geschlossen wirkt. Ganz draußen stehen nur noch einzelne Gruppen.
    // ============================================================
    const fmix = opts.forest || { spruce: 0.6, fir: 0.3, broad: 0.1, hue: [0.21, 0.46, 0.30] };
    const BUDGET = opts.treeBudget ?? 30000;
    const trees = [];      // { x, y, z, sc, kind (0 Nadel, 1 Laub), tone 0..1, fade 0..1 }
    const h01 = (a, b, salt) => { let n = (a * 374761393 + b * 668265263 + salt * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    {
        // 1) im erzeugten Gebiet: jede zweite Waldzelle wie im Spielfeld, nach außen ausgedünnt
        const cand = [];
        for (let oy = 1; oy < OG - 1; oy++) for (let ox = 1; ox < OG - 1; ox++) {
            const gx = ox - OFF, gy = oy - OFF;
            if (gx >= 0 && gy >= 0 && gx <= L && gy <= L) continue;        // Spielfeld: dort stehen die „echten" Bäume
            const c = OL[oy * OG + ox];
            if (!isForest(c)) continue;
            if (!treeCell(ox, oy)) continue;
            const dEdge = Math.max(-gx, -gy, gx - L, gy - L);              // Abstand zur Kante in Rasterpunkten
            // Direkt hinter der Kante stehen die Bäume des Spielfelds weiter (opts.inBelt, gebaut
            // von der Szene) – hier beginnen die einfacheren Bäume genau dort, wo jene aufhören.
            if (opts.inBelt && opts.inBelt(ox, oy, dEdge)) continue;
            const keep = dEdge < 30 ? 1 : Math.pow(30 / dEdge, 1.5);
            if (h01(ox, oy, 7) > keep) continue;
            cand.push(ox, oy, dEdge, c);
        }
        const thin = Math.min(1, (BUDGET * 0.86) / Math.max(1, cand.length / 4));
        for (let i = 0; i < cand.length; i += 4) {
            const ox = cand[i], oy = cand[i + 1], dEdge = cand[i + 2], c = cand[i + 3];
            // erst die fernen ausdünnen – direkt an der Kante bleibt der Bestand vollständig
            if (dEdge >= 30 && h01(ox, oy, 13) > thin) continue;
            const jx = (h01(ox, oy, 1) - 0.5) * 0.7, jz = (h01(ox, oy, 2) - 0.5) * 0.7;
            const wx = (ox - OFF + jx) * tile - half, wz = (oy - OFF + jz) * tile - half;
            const y = heightAt(wx, wz);
            if (y == null) continue;
            const r = h01(ox, oy, 3);
            // Laubkronen nur in Kantennähe: stark vergrößert wirken die runden Kronen wie Bälle
            const kind = c === 6 || dEdge > 90 ? 0 : (r < fmix.spruce + fmix.fir ? 0 : 1);
            trees.push({ x: wx, y, z: wz, sc: (0.72 + h01(ox, oy, 4) * 0.7) * (1 + Math.min(1.5, Math.max(0, dEdge - 30) / 140)), kind,
                         tone: h01(ox, oy, 5), winter: c === 6, fade: Math.min(1, dEdge / (OFF + 60)) * 0.35 });
        }
        // 2) dahinter: lockere Gruppen, wo die Landschaftsformel Wald vorsieht
        if (far) {
            let sd = 0x9e3779b1;
            const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
            const want = Math.round(BUDGET * 0.14);
            const rMin = OFF * tile, rMax = Math.min(REACH * 0.62, span * 1.15);
            for (let tries = 0, n = 0; tries < want * 6 && n < want; tries++) {
                const u = rnd() * 4 * L, dd = rMin + Math.pow(rnd(), 1.4) * (rMax - rMin);
                const ex = edgeX(u), ez = edgeZ(u), len = Math.hypot(ex, ez) || 1;
                const wx = ex + (ex / len) * dd, wz = ez + (ez / len) * dd;
                const ox = (wx + half) / tile + OFF, oy = (wz + half) / tile + OFF;
                if (ox > 2 && oy > 2 && ox < OG - 3 && oy < OG - 3) continue;  // dort steht schon Bestand aus 1)
                const y = heightAt(wx, wz);
                if (y == null) continue;
                const t = far.forestAt((wx + half) / (tile * F), (wz + half) / (tile * F), (y / hScale) / F);
                if (!t) continue;
                trees.push({ x: wx, y, z: wz, sc: (1.6 + rnd() * 1.0) * (1 + 0.5 * dd / span), kind: 0,
                             tone: rnd(), winter: t === 6, fade: 0.35 + 0.4 * (dd - rMin) / Math.max(1, rMax - rMin) });
                n++;
            }
        }
    }
    const treeUniforms = { uTreeSnow: { value: 0 } };
    let treeMeshes = [];
    if (trees.length) {
        // Nadelbaum: drei gestaffelte Kränze. aTop markiert die Oberseite jedes Kranzes – dort liegt der Schnee.
        const conifer = (() => {
            const parts = [[0.64, 1.05, 0.9, 6], [0.48, 0.95, 1.55, 6], [0.30, 0.9, 2.2, 5]];
            const pos = [], nor = [], top = [];
            for (const [r, h, y, seg] of parts) {
                const len = Math.hypot(r, h), ny = r / len, nr = h / len;
                for (let i = 0; i < seg; i++) {
                    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
                    pos.push(0, y + h / 2, 0, Math.sin(a0) * r, y - h / 2, Math.cos(a0) * r, Math.sin(a1) * r, y - h / 2, Math.cos(a1) * r);
                    nor.push(Math.sin(am) * nr, ny, Math.cos(am) * nr, Math.sin(a0) * nr, ny, Math.cos(a0) * nr, Math.sin(a1) * nr, ny, Math.cos(a1) * nr);
                    top.push(1, 0, 0);
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
            g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
            return g;
        })();
        // Laubbaum: runde Krone, Schnee nur auf dem Scheitel
        const broad = (() => {
            const s = new THREE.SphereGeometry(0.66, 5, 3).toNonIndexed();
            s.scale(1, 0.85, 1); s.translate(0, 1.2, 0);
            const p = s.attributes.position.array, top = [];
            for (let i = 0; i < p.length; i += 3) top.push(Math.max(0, Math.min(1, (p[i + 1] - 0.9) / 0.85)));
            s.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
            return s;
        })();
        const makeMat = () => {
            const m = new THREE.MeshStandardMaterial({ roughness: 0.86, emissive: 0x1c2a22, emissiveIntensity: 0.75 });
            m.onBeforeCompile = (sh) => {
                Object.assign(sh.uniforms, treeUniforms);
                sh.vertexShader = sh.vertexShader
                    .replace('#include <common>', '#include <common>\nattribute float aTop;\nvarying float vTop;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTop = aTop;');
                sh.fragmentShader = sh.fragmentShader
                    .replace('#include <common>', '#include <common>\nuniform float uTreeSnow;\nvarying float vTop;')
                    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), uTreeSnow * (0.24 + 0.76 * smoothstep(0.16, 0.52, vTop)));')
                    // derselbe weiche Dunst wie das Gelände darunter – sonst verschwänden die Bäume früher als ihr Boden
                    .replace('#include <fog_fragment>', SOFT_FOG);
            };
            m.customProgramCacheKey = () => 'surround-tree';
            return m;
        };
        const lists = [trees.filter(t => t.kind === 0), trees.filter(t => t.kind === 1)];
        const geos = [conifer, broad];
        const dummy = new THREE.Object3D(), col = new THREE.Color();
        const hue = fmix.hue;
        lists.forEach((list, gi) => {
            if (!list.length) return;
            const im = new THREE.InstancedMesh(geos[gi], makeMat(), list.length);
            list.forEach((t, i) => {
                dummy.position.set(t.x, t.y - 0.12 * t.sc, t.z);
                dummy.rotation.set(0, t.tone * 6.283, 0);
                dummy.scale.set(t.sc, t.sc * (0.88 + t.tone * 0.3), t.sc);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
                const v = (t.tone - 0.5) * 0.14, warm = (t.tone * 7.3) % 1;
                if (t.winter) col.setRGB(0.55 + v, 0.62 + v, 0.68 + v * 0.6);
                else if (gi === 1) col.setRGB(hue[0] + 0.10 + v + warm * 0.14, hue[1] + 0.08 + v + warm * 0.09, hue[2] + v * 0.4);
                else col.setRGB(hue[0] + v + warm * 0.08, hue[1] + 0.04 + v + warm * 0.10, hue[2] + v * 0.5);
                // in die Ferne etwas blasser (Luft dazwischen)
                col.lerp(new THREE.Color(0.62, 0.70, 0.76), t.fade * 0.5);
                im.setColorAt(i, col);
            });
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
            im.frustumCulled = false;
            group.add(im);
            treeMeshes.push(im);
        });
    }

    group.userData = {
        mesh, heightAt, edgeNormal,
        reach: half + REACH,
        treeCount: trees.length,
        triangles: index.length / 3,
        setSnowLoad: (load) => { treeUniforms.uTreeSnow.value = Math.min(0.9, Math.max(0, load) * 1.25); },
        dispose: () => { geo.dispose(); mat.dispose(); for (const m of treeMeshes) { m.geometry.dispose(); m.material.dispose(); } treeMeshes = []; }
    };
    return group;
}
