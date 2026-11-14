// ============================================================
// PROZEDURALER LANDSCHAFTS-GENERATOR
// Config-gesteuert: jedes Kampagnen-Level (und der Sandbox-Modus) übergibt eigene
// Parameter – Berge, Wälder, Flüsse, Seen, Gletscher.
// Landcover-Codes: 0 Schnee/offen, 1 Nadelwald, 2 Wasser, 3 Fels, 4 Asphalt,
//                  5 Mischwald, 6 Winterwald, 7 Wiese (Küste), 8 Gletscher
//
// AUFBAU DER LANDSCHAFT
// Früher wurden breite Kuppeln aufaddiert – jedes Level war am Ende EIN runder Klumpen
// in der Kartenmitte, der nach allen Seiten gleich abfiel. Jetzt entsteht das Gebirge
// aus einem GRATNETZ: Gipfel, die über Kämme mit Sätteln verbunden sind, Seitengrate,
// ein Haupttal, das von außen ins Gebiet führt, und Nachbarberge rings um das Spielfeld.
// Die Formen werden weich VEREINIGT statt addiert (Täler bleiben Täler), alles ist
// durch ein Rauschfeld verzogen (keine geraden Achsen, keine Spiegelsymmetrie), und
// jeder Gipfel hat eine steile und eine flache Flanke.
//
// UMLAND
// Mit `margin` wird die Landschaft über das Spielfeld hinaus erzeugt (dieselbe
// Funktion, dieselben Glättungen). Das Spielfeld ist dann ein Ausschnitt aus einem
// größeren Gebirge – am Kartenrand hört nichts auf. Für die ferne Kulisse liefert
// `world.far` dieselbe Landschaft als Formel an beliebigen Stellen.
// ============================================================

/** Version der Geländeerzeugung. Spielstände hängen an ihr (gleiche Version = gleiches Gelände). */
export const TERRAIN_GEN = 2;
/** Das Spielfeld ist die erzeugte Karte, je Seite um diesen Faktor hochgerechnet. */
export const AREA_F = 1.75;
/** Umland in Basiskacheln je Seite (Vielfaches von 4, damit es hochgerechnet ganzzahlig bleibt). */
export const OUTER_MARGIN = 128;

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function generateWorldData(size, config) {
    const cfg = config || {};
    const seed = cfg.seed !== undefined ? cfg.seed : 12345;
    const M = Math.max(0, cfg.margin | 0);          // Umland je Seite (Kacheln)
    const E = size + 2 * M;                         // erzeugte Kantenlänge

    // Seeded random number generator
    const seededRandom = (s) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    // fortlaufende Zufallsfolge (Reihenfolge der Aufrufe ist fest, also wiederholbar)
    let rs = 0;
    const rr = () => seededRandom(seed * 1.618 + 1000.5 + (rs += 1) * 7.31);

    const peakHeight = cfg.peakHeight ?? 450;        // max. Gipfelhöhe
    const peakCountCfg = cfg.peakCount ?? (3 + Math.floor(seededRandom(seed + 5000) * 3));
    const ruggedness = cfg.ruggedness ?? 0.35;       // 0 sanft .. 1 schroff
    const treeLineCfg = cfg.treeLine ?? 250;
    const glacierLine = cfg.glacierLine ?? null;     // darüber: Gletschereis
    const forestDensity = cfg.forestDensity ?? 0.7;
    const forestMix = cfg.forestMix || 'conifer';
    const riverCount = cfg.riverCount ?? 0;
    const riverWidth = cfg.riverWidth ?? 2.0;
    const lakeCount = cfg.lakeCount ?? 0;
    const isVolcano = !!cfg.volcano;
    // Küstenlevel: Anteil der Kartenbreite, den das Meer einnimmt (0 = keins)
    const oceanFrac = cfg.ocean ?? 0;
    const seaLevel = 6;
    // `stretch` > 1 zieht das Feinrelief in eine Richtung (langgezogene Formen)
    const stretch = cfg.stretch ?? 1;
    const stretchX = (cfg.stretchAxis || 'x') === 'x';
    const peakSpread = cfg.peakSpread ?? 0.25;
    const valleyDepth = cfg.valleyDepth ?? 10;
    const smoothness = Math.max(0.7, 0.98 - ruggedness * 0.22);

    const heightmap = new Float32Array(E * E);
    const landcover = new Uint8Array(E * E);
    const decorations = new Uint8Array(E * E);
    const variety = new Uint8Array(E * E);

    // ===== RAUSCHEN =====
    // Seed-basiertes Wertrauschen mit mehreren Oktaven (fBm) und Domain-Warping. Kein
    // Punkt wiederholt sich, große Formen bleiben glatt. Alle Lagen sind in
    // SPIELFELD-Koordinaten gerechnet (0..size) – das Raster ist nur um M versetzt.
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
        const wx = x + (fbm(x * fx * 0.5 + 3.1, y * fy * 0.5, 2)) * (1.6 / freq) * 0.12;
        const wy = y + (fbm(x * fx * 0.5, y * fy * 0.5 + 7.7, 2)) * (1.6 / freq) * 0.12;
        // Grobe Frequenzen bekommen zwei Oktaven und einen Grat-Anteil (scharfe Kämme),
        // feine nur EINE Oktave und keine Grate – sonst liegt überall Welligkeit auf den Hängen.
        const fine = freq >= 0.06;
        const base = fbm(wx * fx * 1.4, wy * fy * 1.4, oct ?? (fine ? 1 : 2)) * 2.2 * amp;
        if (fine || ridgeAmt <= 0) return base;
        const r = 1 - Math.abs(fbm(wx * fx * 0.9 + 11.3, wy * fy * 0.9 - 5.2, 1) * 2);
        return base + (r - 0.5) * amp * ridgeAmt;
    };

    // ============================================================
    // GIPFELGERÜST
    // ============================================================
    const peaks = [];       // Kuppen und Hörner
    const ridges = [];      // Kämme zwischen zwei Punkten
    const spires = [];      // Felsnadeln (werden aufgesetzt, nicht vereinigt)
    const addPeak = (x, y, h, r, o = {}) => {
        const ang = o.ang ?? 0, sk = o.skew ?? 0, ska = o.skewAng ?? 0;
        const str = Math.max(1, o.str ?? 1.2);
        const p = { x, y, h, r, sharp: o.sharp ?? 3, ca: Math.cos(ang), sa: Math.sin(ang), str,
                    skx: Math.cos(ska) * sk, sky: Math.sin(ska) * sk, cusp: o.cusp ?? 0, cone: !!o.cone,
                    reach: r * (1 + sk) + 1, kind: o.kind || 'main' };
        peaks.push(p);
        return p;
    };
    const addRidge = (ax, ay, ha, bx, by, hb, o = {}) => {
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
        if (len < 2) return null;
        const w = o.w ?? size * (0.10 + rr() * 0.045);
        const asym = o.asym ?? (rr() - 0.5) * 0.8;
        // lange Kämme sacken tiefer ein: dort entsteht ein Pass, kein Riegel quer durchs Gebiet
        const sag = o.sag ?? Math.min(0.72, 0.2 + rr() * 0.14 + 0.5 * Math.min(1, len / (size * 0.55)));
        const r = { ax, ay, bx, by, ha, hb, ex: dx / len, ey: dy / len, len, w, asym, sag, reach: 2.4 * w * (1 + Math.abs(asym)) };
        r.x0 = Math.min(ax, bx) - r.reach; r.x1 = Math.max(ax, bx) + r.reach;
        r.y0 = Math.min(ay, by) - r.reach; r.y1 = Math.max(ay, by) + r.reach;
        ridges.push(r);
        return r;
    };

    // ----- Hauptgipfel: nach Vorlage (echtes Vorbild) oder als zufällige Kette -----
    const BODY = cfg.bodyScale ?? 0.88;              // Grundfläche der Gipfelkörper (schlanker als früher)
    const mains = [];
    const massif = cfg.massif || null;
    if (massif && massif.length) {
        for (let i = 0; i < massif.length; i++) {
            const m = massif[i];
            // kleine Streuung, damit dasselbe Gebiet nicht exakt identisch aussieht
            const jx = (seededRandom(seed + i * 911) - 0.5) * size * 0.025;
            const jy = (seededRandom(seed + i * 977) - 0.5) * size * 0.025;
            mains.push({ x: m.x * size + jx, y: m.y * size + jy, h: peakHeight * m.h, r: size * (m.r ?? 0.55) * BODY,
                         sharp: m.sharp ?? 3.0, ang: ((m.angle ?? 0) * Math.PI) / 180, str: m.stretch ?? 1.3 });
        }
    } else {
        // Zufallskette: die Gipfel reihen sich an einem Kamm auf, der schräg durchs Gebiet läuft
        const n = Math.max(1, peakCountCfg);
        const axis = rr() * Math.PI, ax = Math.cos(axis), ay = Math.sin(axis);
        const cx = size * (0.5 + (rr() - 0.5) * 0.22), cy = size * (0.5 + (rr() - 0.5) * 0.22);
        const span = size * (0.22 + peakSpread * 0.95);
        const top = Math.floor(rr() * n);
        for (let i = 0; i < n; i++) {
            const t = n > 1 ? i / (n - 1) - 0.5 : 0;
            const along = t * span + (rr() - 0.5) * span * 0.2;
            const side = (rr() - 0.5) * size * (0.14 + peakSpread * 0.4);
            mains.push({
                x: Math.max(size * 0.17, Math.min(size * 0.83, cx + ax * along - ay * side)),
                y: Math.max(size * 0.17, Math.min(size * 0.83, cy + ay * along + ax * side)),
                h: peakHeight * (i === top ? 1 : 0.6 + rr() * 0.34),
                r: size * (0.46 + rr() * 0.18) * BODY,
                sharp: 2.4 + rr() * 0.7 + ruggedness * 0.9,
                ang: axis + (rr() - 0.5) * 0.9,
                str: 1.1 + rr() * (0.5 + ruggedness * 0.4)
            });
        }
    }
    // Vulkan: der höchste Gipfel steht als freier Kegel, ohne Kämme zu den Nachbarn
    let coneIdx = -1;
    if (isVolcano) {
        if (!mains.length) mains.push({ x: size * 0.62, y: size * 0.62, h: peakHeight, r: size * 0.5, sharp: 3.2, ang: 0, str: 1 });
        coneIdx = 0; for (let i = 1; i < mains.length; i++) if (mains[i].h > mains[coneIdx].h) coneIdx = i;
        mains[coneIdx].r = Math.max(mains[coneIdx].r, size * 0.42); mains[coneIdx].str = 1.02;
    }
    for (let i = 0; i < mains.length; i++) {
        const m = mains[i], cone = i === coneIdx;
        m.p = addPeak(m.x, m.y, m.h, m.r, {
            ang: m.ang, str: m.str, sharp: m.sharp, cone,
            skew: cone ? 0.05 : 0.12 + rr() * 0.2, skewAng: rr() * TAU,
            cusp: cone ? 0 : clamp01(ruggedness * 0.55 + (m.sharp - 3) * 0.12) * 0.35
        });
    }
    // Schwerpunkt und Streichrichtung des Massivs
    let cX = 0, cY = 0, cW = 0;
    for (const m of mains) { cX += m.x * m.h; cY += m.y * m.h; cW += m.h; }
    cX /= cW || 1; cY /= cW || 1;
    let sxx = 0, syy = 0, sxy = 0;
    for (const m of mains) { const dx = m.x - cX, dy = m.y - cY; sxx += dx * dx * m.h; syy += dy * dy * m.h; sxy += dx * dy * m.h; }
    const axisAng = mains.length > 1 ? 0.5 * Math.atan2(2 * sxy, sxx - syy) : rr() * Math.PI;
    const axX = Math.cos(axisAng), axY = Math.sin(axisAng);

    // ----- Haupttal: führt von außen ins Gebiet, dorthin wo am wenigsten Berg steht -----
    const valley = (() => {
        let best = null;
        const CAND = 44;
        for (let i = 0; i < CAND; i++) {
            const u = (i / CAND) * 4, side = Math.floor(u) % 4, f = 0.15 + (u - Math.floor(u)) * 0.70;   // nicht in die Ecken
            if (oceanFrac > 0 && side === 0) continue;               // die Meerseite bleibt Küste
            const x = side === 0 ? f * size : side === 1 ? size : side === 2 ? (1 - f) * size : 0;
            const y = side === 0 ? 0 : side === 1 ? f * size : side === 2 ? size : (1 - f) * size;
            let sc = 0;
            for (const m of mains) { const d2 = (m.x - x) ** 2 + (m.y - y) ** 2; sc += (m.h / peakHeight) * Math.exp(-d2 / ((0.42 * size) ** 2)); }
            sc += seededRandom(seed + 21100 + i * 7) * 0.08;
            if (!best || sc < best.sc) best = { x, y, sc };
        }
        const mx = best.x, my = best.y;
        // Das Tal zielt auf den höchsten Gipfel (leicht daneben): Startdorf und Talstation liegen
        // am Taleingang, die Bahn zum Gipfel folgt dann unten dem flachen Talboden.
        let top = mains[0];
        for (const m of mains) if (m.h > top.h) top = m;
        const tX = top.x * 0.75 + cX * 0.25, tY = top.y * 0.75 + cY * 0.25;
        const dist = Math.hypot(tX - mx, tY - my) || 1;
        const turn = (seededRandom(seed + 21500) - 0.5) * 0.3;
        const bx = (tX - mx) / dist, by = (tY - my) / dist;
        const dx = bx * Math.cos(turn) - by * Math.sin(turn), dy = bx * Math.sin(turn) + by * Math.cos(turn);
        const L = dist * (cfg.valleyReach ?? 0.55);
        const ph = seed * 0.3;
        return { mx, my, dx, dy, L, dist, ph };
    })();
    /** Talmaske V (0..1) und Lage sN längs der Talachse (0 Taleingang, wächst ins Gebiet hinein). */
    const valleyAt = (px, py, out) => {
        const rx = px - valley.mx, ry = py - valley.my;
        const s = rx * valley.dx + ry * valley.dy;                   // > 0: im Gebiet
        const wig = Math.sin(s / size * 9 + valley.ph) * size * 0.034 + Math.sin(s / size * 3.7 - valley.ph * 1.7) * size * 0.05;
        const dPerp = (rx * valley.dy - ry * valley.dx) - wig;
        let w, along;
        if (s >= 0) {
            w = size * (0.125 - 0.06 * Math.min(1, s / valley.L));
            along = s < valley.L * 0.72 ? 1 : Math.max(0, 1 - (s - valley.L * 0.72) / (valley.L * 0.5));
        } else {
            w = size * (0.125 + 0.15 * Math.min(1, -s / (size * 0.7)));   // draußen weitet sich das Tal
            along = 1;
        }
        out.V = Math.exp(-(dPerp * dPerp) / (w * w)) * along;
        out.sN = s / size;
        return out;
    };
    const _v = { V: 0, sN: 0 };
    const VS = cfg.valleyStrength ?? 0.9;
    /** Zur Talseite hin werden die Berge niedriger – dort öffnet sich das Land. */
    const lowSide = (px, py) => 0.55 + 0.45 * smooth(-0.35, 0.5, valleyAt(px, py, _v).sN);

    // ----- Kämme zwischen den Hauptgipfeln (kürzestes Netz, das alle verbindet) -----
    {
        const nodes = mains.map((m, i) => i).filter(i => i !== coneIdx);
        if (nodes.length > 1) {
            const inTree = new Set([nodes.reduce((a, b) => (mains[b].h > mains[a].h ? b : a))]);
            while (inTree.size < nodes.length) {
                let bi = -1, bj = -1, bd = Infinity;
                for (const i of inTree) for (const j of nodes) {
                    if (inTree.has(j)) continue;
                    const d = Math.hypot(mains[i].x - mains[j].x, mains[i].y - mains[j].y);
                    if (d < bd) { bd = d; bi = i; bj = j; }
                }
                if (bj < 0) break;
                inTree.add(bj);
                const a = mains[bi], b = mains[bj];
                addRidge(a.x, a.y, a.h * 0.8, b.x, b.y, b.h * 0.8);
            }
        }
    }
    // ----- Seitengrate: von jedem Gipfel laufen zwei, drei Rippen talwärts -----
    for (let i = 0; i < mains.length; i++) {
        if (i === coneIdx) continue;
        const m = mains[i];
        const away = Math.atan2(m.y - cY, m.x - cX);
        const n = 2 + (rr() > 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
            const a = away + (rr() - 0.5) * 2.6 + (k - (n - 1) / 2) * 0.9;
            const len = size * (0.15 + rr() * 0.17);
            addRidge(m.x, m.y, m.h * 0.72, m.x + Math.cos(a) * len, m.y + Math.sin(a) * len, m.h * (0.2 + rr() * 0.2),
                     { sag: 0.04 + rr() * 0.08, w: size * (0.06 + rr() * 0.035) });
        }
    }
    // ----- Vorgipfel: Schultern und Köpfe am Massiv, über einen Grat angebunden -----
    {
        const extra = 3 + Math.floor(rr() * 3);
        for (let i = 0; i < extra; i++) {
            const r1 = rr(), r2 = rr(), r3 = rr(), r4 = rr();
            const x = size * (0.12 + r1 * 0.76), y = size * (0.12 + r2 * 0.76);
            if (valleyAt(x, y, _v).V > 0.35) continue;
            const cls = r3 < 0.30 ? 0 : r3 < 0.65 ? 1 : 2;
            const h = peakHeight * [0.2, 0.32, 0.46][cls] * (0.7 + r4 * 0.7);
            addPeak(x, y, h, size * [0.14, 0.2, 0.28][cls] * (0.8 + r1 * 0.5), {
                sharp: 1.9 + r4 * 2.2, ang: r2 * TAU, str: 1.0 + r3 * 1.3, skew: 0.1 + rr() * 0.25, skewAng: rr() * TAU, kind: 'sub'
            });
            let nb = null, nd = Infinity;
            for (let k = 0; k < mains.length; k++) { if (k === coneIdx) continue; const d = Math.hypot(mains[k].x - x, mains[k].y - y); if (d < nd) { nd = d; nb = mains[k]; } }
            if (nb && nd < size * 0.42 && nb.h > h) addRidge(nb.x, nb.y, nb.h * 0.6, x, y, h * 0.85, { sag: 0.1 + rr() * 0.15, w: size * (0.05 + rr() * 0.03) });
        }
    }
    // ----- Felsnadeln (Patagonien!): kleine, sehr steile Türme an den Flanken -----
    {
        const count = cfg.spires ?? 0;
        for (let i = 0; i < count; i++) {
            const a = mains[i % mains.length];
            const r1 = rr(), r2 = rr(), r3 = rr();
            const ang = r1 * TAU, dist = size * (0.07 + r2 * 0.1);
            const rot = rr() * TAU;
            spires.push({
                x: Math.max(size * 0.15, Math.min(size * 0.85, a.x + Math.cos(ang) * dist)),
                y: Math.max(size * 0.15, Math.min(size * 0.85, a.y + Math.sin(ang) * dist)),
                h: peakHeight * (0.16 + r3 * 0.12) * (cfg.spireHeight ?? 1), r: size * (0.04 + r2 * 0.03),
                ca: Math.cos(rot), sa: Math.sin(rot), str: 1.2 + rr() * 0.9, skx: Math.cos(rot * 1.7) * 0.25, sky: Math.sin(rot * 1.7) * 0.25
            });
        }
    }
    // ----- Die Kette läuft weiter: an beiden Enden des Massivs führt ein Kamm aus dem Gebiet -----
    if (mains.length > 1 || coneIdx < 0) {
        let lo = null, hi = null, loT = Infinity, hiT = -Infinity;
        for (let i = 0; i < mains.length; i++) {
            if (i === coneIdx) continue;
            const t = (mains[i].x - cX) * axX + (mains[i].y - cY) * axY;
            if (t < loT) { loT = t; lo = mains[i]; }
            if (t > hiT) { hiT = t; hi = mains[i]; }
        }
        for (const [from, sign] of [[lo, -1], [hi, 1]]) {
            if (!from) continue;
            let px = from.x, py = from.y, ph = from.h, ang = Math.atan2(axY * sign, axX * sign);
            for (let step = 0; step < 3; step++) {
                let nx = 0, ny = 0, ok = false;
                for (let tries = 0; tries < 4 && !ok; tries++) {
                    const a = ang + (rr() - 0.5) * (0.9 + tries * 0.5);
                    const d = size * (0.48 + rr() * 0.26);
                    nx = px + Math.cos(a) * d; ny = py + Math.sin(a) * d;
                    ok = valleyAt(nx, ny, _v).V < 0.25;
                    if (ok) ang = a;
                }
                if (!ok) break;
                const h = peakHeight * (0.52 + rr() * 0.3) * lowSide(nx, ny);
                addPeak(nx, ny, h, size * (0.34 + rr() * 0.16), { sharp: 2.3 + rr() * 0.9 + ruggedness * 0.8, ang: ang + Math.PI / 2, str: 1.2 + rr() * 0.6,
                        skew: 0.1 + rr() * 0.22, skewAng: rr() * TAU, cusp: ruggedness * 0.4, kind: 'outer' });
                addRidge(px, py, ph * 0.8, nx, ny, h * 0.8);
                px = nx; py = ny; ph = h;
            }
        }
    }
    // ----- Nachbarberge rings um das Spielfeld und die ferne Kulisse -----
    {
        const RINGS = [[0.68, 1.05, 7], [1.05, 1.5, 10], [1.5, 2.05, 12], [2.05, 2.7, 13], [2.7, 3.5, 15]];
        for (let ring = 0; ring < RINGS.length; ring++) {
            const [r0, r1, count] = RINGS[ring];
            let placed = 0;
            for (let k = 0; k < count * 4 && placed < count; k++) {
                const th = rr() * TAU, rad = size * (r0 + rr() * (r1 - r0));
                const x = size * 0.5 + Math.cos(th) * rad, y = size * 0.5 + Math.sin(th) * rad;
                const hR = rr(), rR = rr(), sR = rr(), aR = rr(), kR = rr(), kA = rr();
                if (valleyAt(x, y, _v).V > 0.3) continue;
                if (ring === 0 && x > size * 0.1 && x < size * 0.9 && y > size * 0.1 && y < size * 0.9) continue;   // nicht mitten ins Gebiet
                const dmin = size * (0.3 + ring * 0.05);
                let near = null, nd = Infinity, close = false;
                for (const p of peaks) {
                    const d = Math.hypot(p.x - x, p.y - y);
                    if (d < dmin) { close = true; break; }
                    if (p.kind !== 'sub' && d < nd) { nd = d; near = p; }
                }
                if (close) continue;
                const h = peakHeight * (ring === 0 ? 0.36 + hR * 0.36 : 0.42 + hR * 0.42) * (1 + ring * 0.13) * lowSide(x, y);
                const p = addPeak(x, y, h, size * (0.34 + rR * 0.22) * (1 + ring * 0.12), {
                    sharp: 2.2 + sR * 1.0 + ruggedness * 0.9, ang: aR * TAU, str: 1.1 + sR * 0.7,
                    skew: 0.1 + kR * 0.22, skewAng: kA * TAU, cusp: ruggedness * 0.4, kind: ring === 0 ? 'near' : 'far'
                });
                // Ketten statt Einzelberge: Kamm zum nächsten Nachbarn (nicht quer durchs Tal)
                if (near && !near.cone && nd < size * (0.75 + ring * 0.1)) {
                    const mxp = (near.x + x) / 2, myp = (near.y + y) / 2;
                    if (valleyAt(mxp, myp, _v).V < 0.2) addRidge(near.x, near.y, near.h * 0.78, x, y, h * 0.78, { w: size * (0.09 + rR * 0.05) * (1 + ring * 0.1) });
                }
                placed++;
                void p;
            }
        }
    }

    // ----- Verzug: ein Rauschfeld verschiebt jeden Punkt, bevor das Gerüst ausgewertet wird -----
    const WA = size * (cfg.warp ?? 0.085), WF = 1 / (size * 0.42);
    const WA2 = size * 0.022, WF2 = 1 / (size * 0.13);
    const warpX = (px, py) => px + fbm(px * WF + 3.1, py * WF + 1.7, 3) * 2 * WA + fbm(px * WF2 - 5.2, py * WF2 + 8.8, 2) * 2 * WA2;
    const warpY = (px, py) => py + fbm(px * WF - 7.4, py * WF + 4.9, 3) * 2 * WA + fbm(px * WF2 + 2.6, py * WF2 - 6.1, 2) * 2 * WA2;

    /** Höhe des Gerüsts an einer Stelle (unskaliert): weiche Vereinigung aller Gipfel und Kämme. */
    const skeletonAt = (px, py) => {
        const wx = warpX(px, py), wy = warpY(px, py);
        let acc = 0;
        for (let i = 0; i < peaks.length; i++) {
            const p = peaks[i];
            // der Vulkankegel bleibt regelmäßig: nur leicht verzogen
            const qx = p.cone ? px + (wx - px) * 0.3 : wx, qy = p.cone ? py + (wy - py) * 0.3 : wy;
            const dx = qx - p.x, dy = qy - p.y;
            if (dx > p.reach || dx < -p.reach || dy > p.reach || dy < -p.reach) continue;
            const u = dx * p.ca + dy * p.sa, v = -dx * p.sa + dy * p.ca;
            let d = Math.sqrt(u * u * p.str * p.str + v * v);
            // Schiefe: zur einen Seite steil, zur anderen lang auslaufend
            const dr = Math.sqrt(dx * dx + dy * dy);
            if (dr > 1e-6) d *= 1 + (dx * p.skx + dy * p.sky) / dr;
            const s = d / p.r;
            if (s >= 1) continue;
            const q = 1 - s * s;
            let val;
            if (p.cone) {
                // Schichtvulkan: oben steil, nach unten lang und flach auslaufend, kleiner Krater
                val = (0.72 * Math.exp(-4.0 * s) + 0.28 * q * q) * q;
                if (s < 0.045) val -= 0.035 * (1 - s / 0.045);
            } else {
                val = Math.pow(q, p.sharp);
                if (p.cusp > 0) val = val * (1 - p.cusp) + p.cusp * Math.exp(-5.5 * s) * q;
            }
            val *= p.h;
            const v2 = val * val; acc += v2 * v2;
        }
        for (let i = 0; i < ridges.length; i++) {
            const r = ridges[i];
            if (wx < r.x0 || wx > r.x1 || wy < r.y0 || wy > r.y1) continue;
            const rx = wx - r.ax, ry = wy - r.ay;
            const t = rx * r.ex + ry * r.ey;
            let d, side = 1, tc;
            if (t <= 0) { d = Math.sqrt(rx * rx + ry * ry); tc = 0; }
            else if (t >= r.len) { const bx = wx - r.bx, by = wy - r.by; d = Math.sqrt(bx * bx + by * by); tc = 1; }
            else { const c = rx * r.ey - ry * r.ex; d = c < 0 ? -c : c; side = c < 0 ? -1 : 1; tc = t / r.len; }
            const w = r.w * (1 + r.asym * side);
            const s = d / (2.4 * w);
            if (s >= 1) continue;
            const q = 1 - s * s;
            const ts = tc * tc * (3 - 2 * tc);
            const crest = (r.ha + (r.hb - r.ha) * ts) * (1 - r.sag * Math.sin(Math.PI * tc));
            const val = crest * q * q * Math.sqrt(q);
            const v2 = val * val; acc += v2 * v2;
        }
        return Math.sqrt(Math.sqrt(acc));
    };
    /** Felsnadeln: schmale, schiefe Türme – auf das Gelände aufgesetzt und mit ihm verzogen. */
    const spiresAt = (px, py) => {
        const wx = warpX(px, py), wy = warpY(px, py);
        let s = 0;
        for (const sp of spires) {
            const dx = wx - sp.x, dy = wy - sp.y;
            if (dx > sp.r * 2 || dx < -sp.r * 2 || dy > sp.r * 2 || dy < -sp.r * 2) continue;
            const u = dx * sp.ca + dy * sp.sa, v = -dx * sp.sa + dy * sp.ca;
            let d = Math.sqrt(u * u * sp.str * sp.str + v * v);
            const dr = Math.sqrt(dx * dx + dy * dy);
            if (dr > 1e-6) d *= 1 + (dx * sp.skx + dy * sp.sky) / dr;
            const t = d / sp.r;
            if (t >= 1) continue;
            const q = 1 - t * t;
            s += (0.3 * Math.pow(q, 1.6) + 0.7 * Math.exp(-4.2 * t) * q) * sp.h;
        }
        return s;
    };

    // ----- langwelliges Relief (als Formel, wird unten auf grobem Raster ausgewertet) -----
    const NA = 20 + ruggedness * 35;
    const lowAt = (px, py) => getNoise(px, py, 0.02, 1.0) + getNoise(px, py, 0.007, 1.3, 1, 0.2);
    const footAt = (px, py) => getNoise(px, py, 0.022, 1.0, 1, 0.15) * (26 + ruggedness * 30) + getNoise(px, py, 0.012, 1.0, 1, 0.2) * 38;
    const carveAt = (px, py) => getNoise(px, py, 0.016, 1.0, 2, 1.1);
    const liftAt = (px, py) => fbm(px / (size * 0.6) + 21.7, py / (size * 0.6) - 13.3, 3);
    const fineAt = (px, py) => getNoise(px, py, 0.05, 0.20, 1, 0) + getNoise(px, py, 0.1, 0.04);
    let massifScale = 1;
    /** Alles zusammensetzen: Massiv, Talzug, Hochland hinter dem Massiv, Vorberge, Feinrelief. */
    const compose = (mRaw, low, foot, carveN, liftN, V, sN, fine, spire) => {
        const mS = mRaw * massifScale;
        const inM = Math.min(1, mS / (peakHeight * 0.30));
        // Das Land steigt vom Taleingang zur Rückseite des Gebiets an: vorn offen, hinten Hochland
        const lift = Math.max(0, peakHeight * (0.05 + 0.15 * smooth(0.05, 0.95, sN)) + liftN * peakHeight * 0.07);
        let h = valleyDepth
              + mS * (1 - VS * V)
              + lift * (1 - 0.9 * V)
              + foot * (1 - inM) * (cfg.foothills ?? 1) * (1 - 0.75 * V)
              + (low + fine) * NA * (1 - 0.6 * V)
              + carveN * peakHeight * 0.11 * inM * (cfg.carve ?? 1) * (1 - V)
              + spire * (1 - V);
        // Weicher Talboden: unter valleyDepth wird das Relief nur gedämpft, nicht abgeschnitten
        if (h < valleyDepth) h = valleyDepth - (valleyDepth - h) * 0.22;
        return h;
    };
    /** Küste: zur Meerseite (oberer Kartenrand und alles dahinter) senkt sich das Land ins Meer. */
    const oceanDepth = Math.round(size * oceanFrac);
    const oceanEase = (px, py) => {
        if (oceanFrac <= 0) return 0;
        if (py > oceanDepth * 1.6) return 0;                         // klar im Landesinneren
        const wobble = getNoise(px, py, 0.035, 1.0) * oceanDepth * 0.42;
        const dist = py - (oceanDepth * 0.55 + wobble);
        if (dist > oceanDepth * 0.5) return 0;
        const f = clamp01(1 - (dist + oceanDepth * 0.5) / oceanDepth);
        return f * f * (3 - 2 * f);
    };

    // ============================================================
    // PASS 1: Rohhöhen. Das Gerüst wird auf halber, das langwellige Rauschen auf
    // viertel Auflösung gerechnet und bikubisch hochgezogen – die Glättung danach
    // ist ohnehin gröber, und die Erzeugung bleibt trotz Umland schnell.
    // ============================================================
    const coarse = (step, fn) => {
        const n = Math.floor((E - 1) / step) + 4;                    // 1 Randknoten davor, 2 dahinter
        const g = new Float32Array(n * n);
        for (let cy = 0; cy < n; cy++) { const py = (cy - 1) * step - M; for (let cx = 0; cx < n; cx++) g[cy * n + cx] = fn((cx - 1) * step - M, py); }
        const wts = (t) => [((-t + 2) * t - 1) * t / 2, ((3 * t - 5) * t * t + 2) / 2, ((-3 * t + 4) * t + 1) * t / 2, (t - 1) * t * t / 2];
        const tmp = new Float32Array(n * E);
        for (let ix = 0; ix < E; ix++) {
            const fx = ix / step + 1, x1 = Math.floor(fx), w = wts(fx - x1);
            for (let cy = 0; cy < n; cy++) { const o = cy * n + x1; tmp[cy * E + ix] = g[o - 1] * w[0] + g[o] * w[1] + g[o + 1] * w[2] + g[o + 2] * w[3]; }
        }
        const out = new Float32Array(E * E);
        for (let iy = 0; iy < E; iy++) {
            const fy = iy / step + 1, y1 = Math.floor(fy), w = wts(fy - y1);
            const a = (y1 - 1) * E, b = y1 * E, c = (y1 + 1) * E, d = (y1 + 2) * E, o = iy * E;
            for (let ix = 0; ix < E; ix++) out[o + ix] = tmp[a + ix] * w[0] + tmp[b + ix] * w[1] + tmp[c + ix] * w[2] + tmp[d + ix] * w[3];
        }
        return out;
    };
    const fMassif = coarse(2, skeletonAt);
    // Massiv so skalieren, dass der höchste Punkt IM SPIELFELD die Gipfelhöhe trifft
    // (das Hochland dahinter legt noch etwas drauf, daher 0.86 statt 1)
    {
        let mx = 0;
        for (let y = M; y < M + size; y++) for (let x = M; x < M + size; x++) { const v = fMassif[y * E + x]; if (v > mx) mx = v; }
        massifScale = mx > 0 ? (peakHeight * 0.86 - valleyDepth) / mx : 1;
    }
    // (Felder mit Grat-Anteil haben scharfe Knicke – auf viertel Auflösung zeichneten sie sich als
    //  gepunktete Linien ab, deshalb halbe Auflösung; das weiche Hochland-Feld verträgt die viertel.)
    const fLow = coarse(2, lowAt), fFoot = coarse(2, footAt), fCarve = coarse(2, carveAt), fLift = coarse(4, liftAt);
    const fSpire = spires.length ? coarse(2, spiresAt) : null;
    const rawHeights = new Float32Array(E * E);
    for (let iy = 0; iy < E; iy++) {
        const py = iy - M;
        for (let ix = 0; ix < E; ix++) {
            const px = ix - M, idx = iy * E + ix;
            valleyAt(px, py, _v);
            rawHeights[idx] = compose(fMassif[idx], fLow[idx], fFoot[idx], fCarve[idx], fLift[idx], _v.V, _v.sN,
                                      fineAt(px, py), fSpire ? fSpire[idx] : 0);
        }
    }
    /**
     * Dieselbe Landschaft als Formel an einer beliebigen Stelle (Spielfeld-Koordinaten,
     * auch weit außerhalb) – ohne die Glättungsdurchgänge und ohne Feinrelief. Für die
     * ferne Kulisse hinter dem erzeugten Umland.
     */
    const rawAt = (px, py) => {
        const v = valleyAt(px, py, { V: 0, sN: 0 });
        let h = compose(skeletonAt(px, py), lowAt(px, py), footAt(px, py), carveAt(px, py), liftAt(px, py), v.V, v.sN, 0, 0);
        const e = oceanEase(px, py);
        if (e > 0) h = Math.max(seaLevel, h * (1 - e) + seaLevel * 0.4 * e);
        return h;
    };

    // PASS 2: Glätten – sanfte Hänge
    {
        const temp = new Float32Array(E * E);
        for (let pass = 0; pass < 5; pass++) {
            for (let y = 1; y < E - 1; y++) for (let x = 1; x < E - 1; x++) {
                const idx = y * E + x;
                temp[idx] = (rawHeights[idx] * 4 + rawHeights[idx - 1] + rawHeights[idx + 1] + rawHeights[idx - E] + rawHeights[idx + E]) / 8;
            }
            for (let y = 1; y < E - 1; y++) for (let x = 1; x < E - 1; x++) {
                const idx = y * E + x;
                rawHeights[idx] = rawHeights[idx] * (1 - smoothness) + temp[idx] * smoothness;
            }
        }
    }
    // PASS 2.5: Höhen begrenzen. Überlagerte Formen können über die Gipfelhöhe hinauslaufen;
    // nur der obere Bereich wird gestaucht (eine globale Skalierung drückte auch Vorberge platt).
    // Im Umland bleibt alles knapp unter dem Hauptgipfel – der höchste Punkt gehört ins Spielfeld.
    {
        let maxIn = -Infinity;
        for (let y = M; y < M + size; y++) for (let x = M; x < M + size; x++) { const h = rawHeights[y * E + x]; if (h > maxIn) maxIn = h; }
        if (maxIn > peakHeight * 1.05) {
            const knee = peakHeight * 0.8, factor = (peakHeight - knee) / (maxIn - knee);
            for (let k = 0; k < rawHeights.length; k++) { const h = rawHeights[k]; if (h > knee) rawHeights[k] = knee + (h - knee) * factor; }
            maxIn = peakHeight;
        }
        if (M > 0) {
            const cap = maxIn * 0.94, knee = cap * 0.82;
            for (let y = 0; y < E; y++) for (let x = 0; x < E; x++) {
                if (x >= M && x < M + size && y >= M && y < M + size) continue;
                const k = y * E + x, h = rawHeights[k];
                if (h > knee) rawHeights[k] = knee + (cap - knee) * (1 - Math.exp(-(h - knee) / (cap - knee)));
            }
        }
    }

    // ============================================================
    // PASS 3: Landbedeckung (Wald, Gletscher)
    // Wald wächst in ZUSAMMENHÄNGENDEN Beständen: unten dicht, zur Baumgrenze hin
    // ausdünnend und ausgefranst, mit Lichtungen; Talboden und Steilhänge bleiben frei.
    // (Früher entschied ein einziges feines Rauschen – ein gleichmäßiges Wurmmuster über
    // die ganze Karte.)
    // ============================================================
    const forestLargeAt = (px, py) => fbm(px * 0.012 + 40.2, py * 0.012 - 11.5, 3);
    const forestMidAt = (px, py) => fbm(px * 0.036 + 31.4, py * 0.036 - 17.9, 2);
    const forestKindAt = (px, py) => fbm(px * 0.02 - 9.3, py * 0.02 + 27.1, 2);
    const fForL = coarse(4, forestLargeAt), fForM = coarse(4, forestMidAt), fForK = coarse(4, forestKindAt);
    const forestNoise = (fl, fm, fineN) => fl * 0.85 + fm * 0.8 + fineN * 0.24;
    // Rangtabelle des Waldrauschens: aus einem Rauschwert wird sein Rang 0..1. „Wald, wo der Rang
    // über 1 − p liegt" ergibt dann genau den Anteil p – unabhängig davon, wie das Rauschen streut.
    const RANKS = 256;
    const rankTable = (() => {
        const sample = [];
        for (let iy = 1; iy < E; iy += 3) for (let ix = 1; ix < E; ix += 3) {
            const idx = iy * E + ix;
            sample.push(forestNoise(fForL[idx], fForM[idx], vnoise((ix - M) * 0.23 + 5.5, (iy - M) * 0.23 - 3.2) - 0.5));
        }
        sample.sort((a, b) => a - b);
        const t = new Float32Array(RANKS + 1);
        for (let k = 0; k <= RANKS; k++) t[k] = sample[Math.min(sample.length - 1, Math.floor(k / RANKS * (sample.length - 1)))];
        return t;
    })();
    const rankOf = (n) => {
        let lo = 0, hi = RANKS;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (rankTable[mid] < n) lo = mid + 1; else hi = mid; }
        return lo / RANKS;
    };
    const FOREST_P0 = 0.12 + forestDensity * 0.55;                   // Waldanteil in den tiefen Lagen
    const forestRule = (val, slope, fl, fm, fineN, V) => {
        if (val <= valleyDepth + 7) return false;
        const tl = treeLineCfg * (1 + fm * 0.3);                     // ausgefranste Baumgrenze
        if (val >= tl) return false;
        const altF = 1 - smooth(tl * 0.55, tl, val);                 // 1 unten .. 0 an der Baumgrenze
        const steep = clamp01((slope - 5.5) / 3.5);                  // Fels trägt keinen Wald
        const p = FOREST_P0 * Math.pow(altF, 0.8) * (1 - 0.5 * V) * (1 - steep);
        return rankOf(forestNoise(fl, fm, fineN)) > 1 - p;
    };
    for (let iy = 0; iy < E; iy++) {
        const py = iy - M;
        for (let ix = 0; ix < E; ix++) {
            const px = ix - M, idx = iy * E + ix;
            const val = rawHeights[idx];
            heightmap[idx] = val;
            landcover[idx] = 0;                                      // offen: Schnee bzw. Wiese, je nach Schneelage

            const left = ix > 0 ? rawHeights[idx - 1] : val, right = ix < E - 1 ? rawHeights[idx + 1] : val;
            const up = iy > 0 ? rawHeights[idx - E] : val, down = iy < E - 1 ? rawHeights[idx + E] : val;
            const maxSlope = Math.max(Math.abs(val - left), Math.abs(val - right), Math.abs(val - up), Math.abs(val - down));

            if (val < treeLineCfg * 1.4) {
                valleyAt(px, py, _v);
                const fineN = vnoise(px * 0.23 + 5.5, py * 0.23 - 3.2) - 0.5;
                if (forestRule(val, maxSlope, fForL[idx], fForM[idx], fineN, _v.V)) {
                    const hash = Math.abs(ix * 12345 + iy * 67890 + seed) | 0;
                    let fType = 1;                                   // Nadelwald
                    // Laub- bzw. Winterwald steht in eigenen Beständen, bevorzugt in tieferen Lagen
                    const low = 1 - clamp01(val / (treeLineCfg * 0.75));
                    if (forestMix === 'mixed') fType = fForK[idx] + low * 0.16 > 0.05 ? 5 : 1;
                    else if (forestMix === 'winter') fType = fForK[idx] > 0.02 ? 6 : 1;
                    landcover[idx] = fType;
                    variety[idx] = hash % 5;
                }
            }
            // Gletscher: oberhalb der Gletschergrenze auf sanfteren Flächen
            if (glacierLine !== null && val > glacierLine * 1.02) {
                const gNoise = getNoise(px, py, 0.07, 1.0) * 25;
                const glacierSlopeMax = 12 + peakHeight / 45;
                if (maxSlope < glacierSlopeMax && val > glacierLine * 1.07 + gNoise) landcover[idx] = 8;
            }
        }
    }
    /** Waldart an einer beliebigen Stelle (0 = kein Wald) – dieselbe Regel, für die ferne Kulisse. */
    const forestAt = (px, py, val, slope = 0) => {
        if (val >= treeLineCfg * 1.4) return 0;
        const v = valleyAt(px, py, { V: 0, sN: 0 });
        if (!forestRule(val, slope, forestLargeAt(px, py), forestMidAt(px, py), 0, v.V)) return 0;
        if (forestMix === 'mixed') return forestKindAt(px, py) > 0.05 ? 5 : 1;
        if (forestMix === 'winter') return forestKindAt(px, py) > 0.02 ? 6 : 1;
        return 1;
    };

    // PASS 3a: GEMÄSSIGTE HÄNGE IN MITTLERER HÖHE
    // Keine harte Neigungsgrenze (die erzeugt gleich steile Facetten mit Absätzen), sondern
    // eine gewichtete Diffusion: jeder Punkt gleicht sich anteilig seiner Umgebung an, umso
    // stärker je steiler er liegt. Das ergibt fließende Flanken ohne Stufen.
    {
        const lo = peakHeight * 0.15, hi = peakHeight * 0.82;
        const fSoft = coarse(4, (px, py) => getNoise(px, py, 0.008, 1.0) * 0.5 + 0.5);     // Zonen
        const tmp = new Float32Array(heightmap.length);
        for (let it = 0; it < 13; it++) {
            tmp.set(heightmap);
            for (let y = 1; y < E - 1; y++) {
                for (let x = 1; x < E - 1; x++) {
                    const idx = y * E + x;
                    const h = heightmap[idx];
                    if (h < lo || h > hi) continue;
                    const a = heightmap[idx - 1], b = heightmap[idx + 1];
                    const c2 = heightmap[idx - E], d = heightmap[idx + E];
                    const e = heightmap[idx - E - 1], f = heightmap[idx - E + 1];
                    const g = heightmap[idx + E - 1], i2 = heightmap[idx + E + 1];
                    const avg = (a + b + c2 + d) * 0.175 + (e + f + g + i2) * 0.075;
                    const sl = Math.max(Math.abs(h - a), Math.abs(h - b), Math.abs(h - c2), Math.abs(h - d));
                    const k = Math.min(0.55, (sl / (peakHeight * 0.02)) * 0.18) * (0.5 + fSoft[idx] * 0.9);
                    tmp[idx] = h + (avg - h) * k;
                }
            }
            heightmap.set(tmp);
        }
    }

    // PASS 4: OZEAN – zur Meerseite läuft das Land ins Meer aus (auch im Umland dahinter).
    // Vor Flüssen und Seen: so münden die Bäche ins Meer, und die Startlinie steht schon fest.
    if (oceanFrac > 0) {
        for (let iy = 0; iy < E; iy++) {
            const py = iy - M;
            if (py > oceanDepth * 1.6) break;
            for (let ix = 0; ix < E; ix++) {
                const idx = iy * E + ix;
                const ease = oceanEase(ix - M, py);
                if (ease <= 0) continue;
                heightmap[idx] = heightmap[idx] * (1 - ease) + seaLevel * 0.4 * ease;
                if (heightmap[idx] <= seaLevel) { heightmap[idx] = seaLevel; landcover[idx] = 2; }
                else if (heightmap[idx] < seaLevel + 12 && landcover[idx] !== 2) landcover[idx] = 7;   // Küstenwiese statt Wald
            }
        }
    }

    // ===== STARTLINIE BESTIMMEN =====
    // Das Startdorf liegt an der tiefsten, nicht zu steilen Randkachel des Spielfelds (dieselbe
    // Wahl trifft später Scene3D), Demo-Bahn und Startabfahrt führen von dort in gerader Linie
    // zum höchsten Punkt. Bäche und Seen halten Abstand zu dieser Linie – sonst liefe die erste
    // Abfahrt durchs Wasser.
    const findStartLine = () => {
        const B = 4;
        let hMax = -Infinity, sx = M + size * 0.58, sy = M + size * 0.58;
        for (let y = M + B; y < M + size - B; y++) for (let x = M + B; x < M + size - B; x++) {
            const h = heightmap[y * E + x]; if (h > hMax) { hMax = h; sx = x; sy = y; }
        }
        const slopeAtR = (x, y) => { const i = y * E + x, z = heightmap[i];
            return Math.max(Math.abs(z - heightmap[i - 1]), Math.abs(z - heightmap[i + 1]), Math.abs(z - heightmap[i - E]), Math.abs(z - heightmap[i + E])); };
        let hMin = Infinity, bx = M + B, by = M + B;
        const consider = (x, y) => { if (landcover[y * E + x] === 2 || slopeAtR(x, y) > 8) return; const h = heightmap[y * E + x]; if (h < hMin) { hMin = h; bx = x; by = y; } };
        for (let x = M + B; x < M + size - B; x++) { consider(x, M + B); consider(x, M + size - 1 - B); }
        for (let y = M + B; y < M + size - B; y++) { consider(M + B, y); consider(M + size - 1 - B, y); }
        return { bx, by, sx, sy, hMin, hMax };
    };
    let start = findStartLine();
    /** Abstand eines Rasterpunkts zur Startlinie (Strecke Dorf–Gipfel) in Kacheln. */
    const startDist = (x, y) => {
        const dx = start.sx - start.bx, dy = start.sy - start.by, l2 = dx * dx + dy * dy || 1;
        let t = ((x - start.bx) * dx + (y - start.by) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        return Math.hypot(x - (start.bx + dx * t), y - (start.by + dy * t));
    };

    // PASS 5: FLÜSSE – folgen dem Gefälle von hoch nach tief, bis sie das erzeugte Gebiet verlassen
    for (let r = 0; r < riverCount; r++) {
        // Quellen: hoch gelegen, im Spielfeld – die besten zuerst
        const sources = [];
        for (let attempt = 0; attempt < 60; attempt++) {
            const tx = M + Math.floor(seededRandom(seed + r * 900 + attempt * 13) * size);
            const ty = M + Math.floor(seededRandom(seed + r * 950 + attempt * 17) * size);
            const h = rawHeights[ty * E + tx];
            if (h > peakHeight * 0.3 && h < peakHeight * 0.75 && startDist(tx, ty) > 14) sources.push({ tx, ty, score: h + seededRandom(seed + attempt) * 40 });
        }
        sources.sort((p, q) => q.score - p.score);
        const maxSteps = E * 3;
        for (let si = 0; si < Math.min(10, sources.length); si++) {
            // Lauf verfolgen: immer zum tiefsten noch nicht besuchten Nachbarn, mit leichtem Mäander.
            // (Ohne das Merken pendelte der Lauf in jeder Senke hin und her und kam nie an.)
            let cx = sources[si].tx, cy = sources[si].ty;
            let waterZ = rawHeights[cy * E + cx];
            const seen = new Set(), course = [];
            let crosses = false, pond = false;
            for (let step = 0; step < maxSteps; step++) {
                seen.add(cy * E + cx);
                course.push(cx, cy, waterZ);
                if (startDist(cx, cy) < riverWidth + 5) { crosses = true; break; }
                let nx = -1, ny = -1, lowest = Infinity;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const tx = cx + dx, ty = cy + dy;
                        if (tx < 1 || ty < 1 || tx >= E - 1 || ty >= E - 1) continue;
                        if (seen.has(ty * E + tx)) continue;
                        const h = rawHeights[ty * E + tx] + seededRandom(seed + step * 31 + dx * 7 + dy * 3) * 6;
                        if (h < lowest) { lowest = h; nx = tx; ny = ty; }
                    }
                }
                // SENKE: geht es ringsum nur noch bergauf, endet der Bach hier in einem Weiher.
                // (Früher lief er im Kreis weiter und füllte die Senke als Spirale.)
                if (nx < 0 || rawHeights[ny * E + nx] > rawHeights[cy * E + cx] + 1.5) { pond = true; break; }
                cx = nx; cy = ny;
                waterZ = Math.min(waterZ, rawHeights[cy * E + cx]);
                if (cx <= 1 || cy <= 1 || cx >= E - 2 || cy >= E - 2) { course.push(cx, cy, waterZ); break; }   // Rand des erzeugten Gebiets
                if (landcover[cy * E + cx] === 2) { course.push(cx, cy, waterZ); break; }                       // ins Meer gemündet
            }
            if (crosses) continue;                               // dieser Lauf kreuzte die Startabfahrt – nächste Quelle
            // Bett eingraben (monoton fallender Wasserspiegel), zur Mündung hin breiter
            for (let k = 0, step = 0; k < course.length; k += 3, step++) {
                const px = course[k], py = course[k + 1], wz = course[k + 2];
                const last = pond && k + 3 >= course.length;       // Weiher am Ende des Laufs
                const rad = last ? Math.round(riverWidth * 1.6 + 2.5) : Math.max(1, Math.round(riverWidth * (0.7 + Math.min(1, step / (size * 1.5)) * 0.6)));
                for (let dy = -rad; dy <= rad; dy++) {
                    for (let dx = -rad; dx <= rad; dx++) {
                        const tx = px + dx, ty = py + dy;
                        if (tx < 1 || ty < 1 || tx >= E - 1 || ty >= E - 1) continue;
                        if (dx * dx + dy * dy > rad * rad + (last ? Math.sin(Math.atan2(dy, dx) * 3 + px) * rad * 1.2 : 0)) continue;
                        const tIdx = ty * E + tx;
                        heightmap[tIdx] = Math.min(heightmap[tIdx], wz - 1.5);
                        landcover[tIdx] = 2;
                    }
                }
            }
            break;
        }
    }

    // PASS 6: SEEN – flache Stellen in tiefen Lagen, mit unregelmäßigem Ufer
    {
        const outside = M > 0 ? Math.round(lakeCount * 0.9) : 0;         // ein paar Seen auch im Umland
        let placedIn = 0, placedOut = 0;
        for (let attempt = 0; attempt < 1400 && (placedIn < lakeCount || placedOut < outside); attempt++) {
            const wantIn = placedIn < lakeCount && (placedOut >= outside || attempt % 2 === 0);
            const ra = seededRandom(seed + 7000 + attempt * 19), rb = seededRandom(seed + 7500 + attempt * 23);
            const rc = seededRandom(seed + 7900 + attempt), rd = seededRandom(seed + 8300 + attempt * 5), re = seededRandom(seed + 8700 + attempt * 3);
            const lx = wantIn ? M + Math.floor(8 + ra * (size - 16)) : Math.floor(10 + ra * (E - 20));
            const ly = wantIn ? M + Math.floor(8 + rb * (size - 16)) : Math.floor(10 + rb * (E - 20));
            if (!wantIn && (lx > M - 12 && lx < M + size + 12 && ly > M - 12 && ly < M + size + 12)) continue;
            const lIdx = ly * E + lx;
            if (landcover[lIdx] === 2) continue;
            if (heightmap[lIdx] > peakHeight * 0.35) continue;           // nur tiefe Lagen
            if (startDist(lx, ly) < 16) continue;                        // nicht auf der Startabfahrt
            // Umriss: gestreckte, gedrehte Ellipse mit Buchten
            const radius = 3 + Math.floor(rc * 4);                       // 3-6
            const rx = radius * (0.85 + rd * 0.7), ry = radius * (0.85 + (1 - rd) * 0.5);
            const rot = re * Math.PI, cr = Math.cos(rot), sr = Math.sin(rot);
            const p1 = ra * TAU, p2 = rb * TAU, p3 = rc * TAU;
            const R = Math.ceil(Math.max(rx, ry) * 1.5) + 6;
            const shape = (dx, dy) => {                                  // <= 1: im See
                const u = dx * cr + dy * sr, v = -dx * sr + dy * cr;
                const th = Math.atan2(v, u);
                const wob = 1 + 0.22 * Math.sin(2 * th + p1) + 0.14 * Math.sin(3 * th + p2) + 0.08 * Math.sin(5 * th + p3);
                return Math.sqrt((u * u) / (rx * rx) + (v * v) / (ry * ry)) / wob;
            };
            let minH = Infinity, maxH = -Infinity, edge = false;
            for (let dy = -R; dy <= R && !edge; dy++) for (let dx = -R; dx <= R; dx++) {
                const tx = lx + dx, ty = ly + dy;
                if (tx < 1 || ty < 1 || tx >= E - 1 || ty >= E - 1) { edge = true; break; }
                if (shape(dx, dy) > 1) continue;
                const th = heightmap[ty * E + tx];
                if (th < minH) minH = th;
                if (th > maxH) maxH = th;
            }
            // Ein Bergsee braucht ein flaches Becken, sonst wirkt der Spiegel wie hineingeschnitten
            if (edge || maxH - minH > 9) continue;
            const waterLevel = minH - 2;
            const rim = 1 + 5 / Math.min(rx, ry);                        // Uferzone (in Umriss-Einheiten)
            for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                const tx = lx + dx, ty = ly + dy;
                if (tx < 1 || ty < 1 || tx >= E - 1 || ty >= E - 1) continue;
                const e = shape(dx, dy), tIdx = ty * E + tx;
                if (e <= 1) { heightmap[tIdx] = waterLevel; landcover[tIdx] = 2; continue; }
                if (e > rim || landcover[tIdx] === 2) continue;
                const f = (e - 1) / (rim - 1);                           // 0 am Ufer .. 1 außen
                const target = waterLevel + 1.4 + f * f * 5;
                const h = heightmap[tIdx];
                // talseitig ein flacher Wall (hält das Wasser), bergseitig weich angeschnitten
                heightmap[tIdx] = h < target ? h + (target - h) * (1 - f) * 0.9 : h * Math.pow(f, 0.7) + target * (1 - Math.pow(f, 0.7));
                if (f < 0.35 && landcover[tIdx] !== 0) landcover[tIdx] = 0;   // Ufersaum bleibt frei
            }
            if (wantIn) placedIn++; else placedOut++;
        }
    }

    // PASS 7: STARTLINIE (ganz am Ende, nach Flüssen/Seen/Meer)
    // Das Startdorf liegt an der tiefsten Randkachel des Spielfelds; Demo-Bahn und Startabfahrt
    // führen von dort in gerader Linie zum Hauptgipfel. Auf dieser Linie darf es bergab nie wieder
    // bergauf gehen. Früher wurde dafür ein breiter Korridor auf eine feste Rampe angehoben – das
    // schüttete einen Damm quer durchs Gelände und endete am Gipfel als gerade Bruchkante. Jetzt
    // werden nur noch die GEGENHÄNGE aufgefüllt: jede Senke auf der Linie bis zur Höhe des Rückens
    // davor, seitlich so breit auslaufend, dass kein Wall entsteht. Wo die Linie ohnehin stetig
    // steigt, bleibt das Gelände unberührt.
    start = findStartLine();                                  // nach Bächen und Seen neu bestimmen
    const baseX = start.bx, baseY = start.by, summitX = start.sx, summitY = start.sy;
    {
        const ddx = summitX - baseX, ddy = summitY - baseY, len = Math.hypot(ddx, ddy) || 1;
        const N = Math.max(2, Math.ceil(len));
        // Höhenprofil der Linie (leicht geglättet) und die Hüllkurve „nie wieder bergab"
        const prof = new Float32Array(N + 1), env = new Float32Array(N + 1);
        const hAt = (fx, fy) => {
            const x0 = Math.max(0, Math.min(E - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(E - 2, Math.floor(fy)));
            const tx = fx - x0, ty = fy - y0, i = y0 * E + x0;
            return (heightmap[i] * (1 - tx) + heightmap[i + 1] * tx) * (1 - ty) + (heightmap[i + E] * (1 - tx) + heightmap[i + E + 1] * tx) * ty;
        };
        for (let k = 0; k <= N; k++) prof[k] = hAt(baseX + ddx * k / N, baseY + ddy * k / N);
        env[0] = prof[0];
        for (let k = 1; k <= N; k++) env[k] = Math.max(prof[k], env[k - 1] + 0.05);
        const W0 = size * (cfg.baseSlopeWidth ?? 0.17);
        for (let y = 1; y < E - 1; y++) for (let x = 1; x < E - 1; x++) {
            const i = y * E + x;
            if (landcover[i] === 2) continue;                 // Flussbett/See bleibt
            const t = ((x - baseX) * ddx + (y - baseY) * ddy) / (len * len);
            if (t < 0 || t > 1) continue;
            const fk = t * N, k0 = Math.min(N - 1, Math.floor(fk)), tk = fk - k0;
            const need = env[k0] + (env[k0 + 1] - env[k0]) * tk;                 // so hoch muss die Linie hier liegen
            const fill = need - (prof[k0] + (prof[k0 + 1] - prof[k0]) * tk);     // so viel fehlt auf der Linie
            if (fill < 0.2) continue;
            // je mehr aufgefüllt wird, desto breiter läuft es seitlich aus (flache Böschung statt Damm)
            const W = Math.max(6, Math.min(W0, fill * 1.6));
            const d = Math.abs((x - baseX) * ddy - (y - baseY) * ddx) / len;
            if (d > W) continue;
            const u = 1 - d / W;
            const wgt = u * u * (3 - 2 * u) * smooth(0.2, 2.5, fill);
            const h = heightmap[i];
            if (need > h) heightmap[i] = h + (need - h) * wgt;
        }
    }

    return {
        heightmap, landcover, decorations, variety, buildings: [], lifts: [], theme: cfg.theme || null,
        size: E, margin: M, playSize: size, gen: TERRAIN_GEN,
        // Für Umland und Kulisse: dieselbe Landschaft als Formel, Lage in Spielfeld-Kacheln
        far: {
            rawAt, forestAt, seaLevel, ocean: oceanFrac > 0, oceanEase, oceanDepth,
            peakHeight, treeLine: treeLineCfg, glacierLine, valleyDepth,
            valley: { x: valley.mx, y: valley.my, dx: valley.dx, dy: valley.dy },
            base: { x: baseX - M, y: baseY - M }, summit: { x: summitX - M, y: summitY - M }
        }
    };
}

// ============================================================
// SPIELFLÄCHE VERGRÖSSERN: die erzeugte Welt wird um den Faktor f je Seite
// hochgerechnet. Die Höhen werden bilinear interpoliert, mit feinem Relief
// angereichert und um f skaliert, damit die Hangneigung je Kachel – und damit
// Pistencharakter, Felsgrenzen und Bebaubarkeit – erhalten bleibt. Landbedeckung:
// nächster Nachbar, Waldränder werden mit Rauschen aufgebrochen.
// ============================================================
export function upsampleWorld(world, size, f = 2, opts = {}) {
    const S = Math.round(size * f);
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
    const detail = opts.detail ?? 1;
    // Das Feinrelief hängt an der Lage im SPIELFELD (nicht im erzeugten Raster): mit und
    // ohne Umland entsteht dasselbe Spielfeld.
    const off = Math.round((opts.offset ?? 0) * f);
    const hAt = (x, y) => H[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    const isForest = (c) => c === 1 || c === 5 || c === 6;
    for (let y = 0; y < S; y++) {
        const fy = y / f, y0 = Math.floor(fy), ty = fy - y0, wy = y - off;
        for (let x = 0; x < S; x++) {
            const fx = x / f, x0 = Math.floor(fx), tx = fx - x0, wx = x - off;
            const h = (hAt(x0, y0) * (1 - tx) + hAt(x0 + 1, y0) * tx) * (1 - ty)
                    + (hAt(x0, y0 + 1) * (1 - tx) + hAt(x0 + 1, y0 + 1) * tx) * ty;
            // Nächster Nachbar für die Landbedeckung
            const nx = Math.min(size - 1, Math.round(fx)), ny = Math.min(size - 1, Math.round(fy));
            const src = ny * size + nx;
            let lc = L[src];
            // Waldränder aufbrechen: an Grenzen zwischen Wald und Nicht-Wald entscheidet
            // Rauschen, damit die Kante organisch wird (kein Sinusmuster: das wiederholte sich).
            const alt = ((tx > 0.5 ? Math.min(size - 1, x0 + 1) : x0)) + size * ((ty > 0.5 ? Math.min(size - 1, y0 + 1) : y0));
            const lc2 = L[alt];
            if (isForest(lc) !== isForest(lc2) && lc !== 2 && lc2 !== 2) {
                const n = uHash(Math.floor(wx / 3.1), Math.floor(wy / 3.1), wx / 3.1, wy / 3.1);
                if (n > 0.55) lc = lc2;
            }
            // Feines Relief nur auf Land (nicht in Wasser/Gletscher), klein genug, um
            // Bebaubarkeit und Pistenlogik nicht zu ändern.
            let d = 0;
            if (lc !== 2 && lc !== 8 && detail > 0) {
                const h1 = uHash(Math.floor(wx / 60), Math.floor(wy / 60), wx / 60, wy / 60);
                const h2b = uHash(Math.floor(wx / 28), Math.floor(wy / 28), wx / 28, wy / 28);
                d = ((h1 - 0.5) * 1.0 + (h2b - 0.5) * 0.35) * range * 0.006 * detail;
            }
            heightmap[y * S + x] = (h + d) * f;
            landcover[y * S + x] = lc;
            decorations[y * S + x] = D ? D[src] : 0;
            variety[y * S + x] = V ? V[src] : 0;
        }
    }
    // Seen: der Spiegel muss eben bleiben – Wasserkacheln bekommen die Höhe ihrer
    // Quellkachel (skaliert), ohne Relief.
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (landcover[y * S + x] !== 2) continue;
        const nx = Math.min(size - 1, Math.round(x / f)), ny = Math.min(size - 1, Math.round(y / f));
        heightmap[y * S + x] = H[ny * size + nx] * f;
    }
    return { ...world, heightmap, landcover, decorations, variety, gridSize: S, upsampled: f };
}

/**
 * Die Welt eines Levels für den 3D-Modus: Spielfeld samt Umland.
 *
 * Erzeugt wird ein größeres Stück Gebirge; das Spielfeld ist dessen Mitte. Zurück kommt
 * die Spielfeld-Welt wie bisher (heightmap, landcover … in Spielfeldgröße), dazu
 *   world.outer   das ganze erzeugte Gebiet { heightmap, landcover, variety, gridSize, offset }
 *                 – das Spielfeld liegt darin bei [offset, offset + gridSize)
 *   world.far     die Landschaft als Formel für die ferne Kulisse (Lage in Basiskacheln)
 *   world.gen     Version der Geländeerzeugung
 */
export function buildLevelWorld(level, massif, opts = {}) {
    const baseSize = Math.max(64, Math.round((level?.gridSize || 192) / 4) * 4);
    const margin = Math.max(0, Math.round((opts.margin ?? OUTER_MARGIN) / 4) * 4);
    const seed = level?.terrain?.seed || 7;
    const ext = generateWorldData(baseSize, { ...(level?.terrain || {}), theme: level?.theme, massif, margin });
    const E = baseSize + 2 * margin;
    const up = upsampleWorld(ext, E, AREA_F, { seed, offset: margin });
    const G = Math.round(baseSize * AREA_F), S = up.gridSize, O = Math.round(margin * AREA_F);
    const crop = (src, Ctor) => {
        const out = new Ctor(G * G);
        for (let y = 0; y < G; y++) out.set(src.subarray((y + O) * S + O, (y + O) * S + O + G), y * G);
        return out;
    };
    return {
        heightmap: crop(up.heightmap, Float32Array), landcover: crop(up.landcover, Uint8Array),
        decorations: crop(up.decorations, Uint8Array), variety: crop(up.variety, Uint8Array),
        buildings: [], lifts: [], theme: level?.theme || null,
        gridSize: G, baseSize, upsampled: AREA_F, gen: TERRAIN_GEN,
        outer: { heightmap: up.heightmap, landcover: up.landcover, variety: up.variety, gridSize: S, offset: O },
        far: ext.far
    };
}
