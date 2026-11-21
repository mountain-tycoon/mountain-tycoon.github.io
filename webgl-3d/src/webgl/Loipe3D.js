// ============================================================
// LANGLAUF: Loipen und die Läufer darauf.
//
// Eine Loipe ist ein schmales gewalztes Band (das Band selbst baut die
// Szene wie bei einer Piste). Hier kommen dazu: die klassischen Spuren
// an beiden Rändern, die Abfrage „liegt dieser Punkt auf einer Loipe?"
// und eine kleine Schar Langläufer im Skatingschritt. Sie laufen die
// Loipe hin und zurück (eine geschlossene Runde immer im Kreis), bergauf
// langsamer, bergab in der Hocke.
//
// Sparsam gebaut: je Läufer vier Netze mit einem gemeinsamen Material,
// höchstens MAX_SKATERS im ganzen Gebiet.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Halbe Breite der Loipe in Kacheln. */
export const LOIPE_W = 1.25;
const MAX_SKATERS = 14;
const V_FLAT = 3.3;                 // Einheiten je Sekunde in der Ebene
const SUITS = [0xd9302c, 0x1f6fd0, 0x14a37f, 0xf2b01e, 0x7a3fc4, 0xe2e6ec, 0x1c2430, 0xe0559a];
const TROUSERS = [0x1c2430, 0x22304a, 0x2a2a2e, 0x15384a];

const tinted = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
};
const box = (w, h, d, x, y, z, hex) => tinted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

/** Langläufer: Rumpf, zwei Beine mit Ski, Arme mit Stöcken – jeweils ein Netz. */
export function makeNordicSkier(seed, mat) {
    const g = new THREE.Group();
    const suit = SUITS[seed % SUITS.length], legs = TROUSERS[(seed * 7 + 3) % TROUSERS.length];
    const cap = SUITS[(seed * 5 + 2) % SUITS.length];
    // Rumpf dreht um die Hüfte (vorbeugen, zur Seite pendeln)
    const body = new THREE.Mesh(mergeGeometries([
        box(0.2, 0.27, 0.15, 0, 0.14, 0, suit),
        tinted(new THREE.SphereGeometry(0.085, 8, 6).translate(0, 0.36, 0.01), 0xe8b995),
        tinted(new THREE.SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.375, 0), cap),
        box(0.13, 0.03, 0.03, 0, 0.365, 0.075, 0x20242c)                       // Brille
    ]), mat);
    body.position.y = 0.36; body.castShadow = true; g.add(body);
    const leg = (sx) => {
        const m = new THREE.Mesh(mergeGeometries([
            box(0.085, 0.3, 0.11, 0, -0.16, 0, legs),
            box(0.09, 0.07, 0.16, 0, -0.325, 0.02, 0x14171c),
            box(0.045, 0.014, 0.98, 0, -0.367, 0.1, 0xf0f2f5)                  // schmaler Langlaufski
        ]), mat);
        m.position.set(sx * 0.055, 0.38, 0);
        m.rotation.order = 'YZX';
        g.add(m);
        return m;
    };
    const legL = leg(-1), legR = leg(1);
    // beide Arme samt Stöcken an einem Drehpunkt in Schulterhöhe (Doppelstockschub)
    const armGeo = [];
    for (const sx of [-1, 1]) {
        armGeo.push(box(0.06, 0.25, 0.07, sx * 0.135, -0.11, 0, suit));
        const pole = new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5).rotateX(-0.5).translate(sx * 0.15, -0.5, -0.17);
        armGeo.push(tinted(pole, 0x2a2e36));
    }
    const arms = new THREE.Mesh(mergeGeometries(armGeo), mat);
    arms.position.set(0, 0.6, 0.02); g.add(arms);
    /** Haltung: p = Schrittphase, glide 0…1 = Abfahrtshocke statt Skatingschritt. */
    g.userData.pose = (p, glide) => {
        const k = 1 - glide, sw = Math.sin(p);
        const pushL = Math.max(0, sw) * k, pushR = Math.max(0, -sw) * k;
        legL.rotation.set(-pushL * 0.25, -0.34 * k, -(0.06 + pushL * 0.4) * k);
        legR.rotation.set(-pushR * 0.25, 0.34 * k, (0.06 + pushR * 0.4) * k);
        body.rotation.set(0.42 + glide * 0.5, 0, -sw * 0.17 * k);
        arms.rotation.x = glide ? 0.9 * glide + (1 - glide) * 0.2 : -0.95 + (0.5 - 0.5 * Math.cos(p * 2)) * 1.5;
    };
    return g;
}

/**
 * deps:
 *   scene
 *   posAt(gx, gy)      Weltpunkt auf dem Gelände (THREE.Vector3)
 *   hasSnowAt(gx, gy)  liegt dort Schnee?
 *   onLap(rec)         ein Läufer hat das Ende erreicht bzw. eine Runde beendet
 */
export function createLoipen(deps) {
    const { scene, posAt, hasSnowAt } = deps;
    const list = [];
    const figMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x8ea2bd, transparent: true, opacity: 0.5, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    let total = 0, checkT = 0, seed = 0;

    /** Punkt und Richtung bei Lauflänge s (Kacheln). */
    const sample = (rec, s, out) => {
        const m = rec.mid, f = Math.max(0, Math.min(m.length - 1.001, s)), i = Math.floor(f), u = f - i;
        const a = m[i], b = m[i + 1];
        out.gx = a.gx + (b.gx - a.gx) * u; out.gy = a.gy + (b.gy - a.gy) * u;
        out.tx = b.gx - a.gx; out.ty = b.gy - a.gy;
        const l = Math.hypot(out.tx, out.ty) || 1; out.tx /= l; out.ty /= l;
        out.slope = (rec.h[i + 1] - rec.h[i]) / l;         // > 0 = bergauf in Laufrichtung der Punkte
        return out;
    };
    const _s = { gx: 0, gy: 0, tx: 0, ty: 1, slope: 0 };

    /** Klassische Spuren: je Rand zwei Rillen als schmale Bänder knapp über dem Loipenband. */
    const buildTracks = (rec) => {
        const pos = [], idx = [];
        const offs = [];
        for (const side of [-1, 1]) for (const d of [-0.085, 0.085]) offs.push(side * rec.snowW * 0.7 + d);
        const m = rec.mid;
        for (let i = 0; i < m.length; i++) {
            const a = m[Math.max(0, i - 1)], b = m[Math.min(m.length - 1, i + 1)];
            let tx = b.gx - a.gx, ty = b.gy - a.gy; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            const px = -ty, py = tx;
            for (const o of offs) for (const e of [-0.024, 0.024]) {
                const w = posAt(m[i].gx + px * (o + e), m[i].gy + py * (o + e));
                pos.push(w.x, w.y + 0.085, w.z);
            }
            if (i > 0) {
                const n = offs.length * 2, r0 = (i - 1) * n, r1 = i * n;
                for (let k = 0; k < offs.length; k++) { const q = k * 2; idx.push(r0 + q, r1 + q, r0 + q + 1, r0 + q + 1, r1 + q, r1 + q + 1); }
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, trackMat);
        mesh.material.side = THREE.DoubleSide; mesh.renderOrder = 2;
        scene.add(mesh);
        return mesh;
    };

    return {
        list: () => list,
        /** Neue Loipe aus geglätteten Wegpunkten {gx, gy}. */
        add(path, snowW = LOIPE_W) {
            // gleichmäßig im Abstand einer Kachel abtasten: dann ist die Lauflänge zugleich der Index
            const mid = [{ gx: path[0].gx, gy: path[0].gy }];
            let carry = 0;
            for (let k = 0; k < path.length - 1; k++) {
                const a = path[k], b = path[k + 1], l = Math.hypot(b.gx - a.gx, b.gy - a.gy);
                if (l < 1e-6) continue;
                let d = 1 - carry;
                while (d <= l) { mid.push({ gx: a.gx + (b.gx - a.gx) * d / l, gy: a.gy + (b.gy - a.gy) * d / l }); d += 1; }
                carry = l - (d - 1);
            }
            if (mid.length < 3) return null;
            const first = mid[0], last = mid[mid.length - 1];
            const rec = {
                path, mid, snowW, len: mid.length - 1,
                h: mid.map(q => posAt(q.gx, q.gy).y),
                loop: mid.length > 12 && Math.hypot(first.gx - last.gx, first.gy - last.gy) < 4,
                skaters: [], snow: true, tracks: null
            };
            rec.tracks = buildTracks(rec);
            // Läufer: je rund 16 Kacheln einer, im ganzen Gebiet begrenzt
            const want = Math.max(1, Math.min(5, Math.round(rec.len / 16), MAX_SKATERS - total));
            for (let i = 0; i < want && total < MAX_SKATERS; i++, total++) {
                const fig = makeNordicSkier(seed++, figMat);
                scene.add(fig);
                rec.skaters.push({ fig, s: (i + 0.5) / want * rec.len, dir: i % 2 ? -1 : 1, pace: 0.82 + ((seed * 37) % 30) / 100,
                    ph: seed * 1.7, glide: 0, v: V_FLAT });
            }
            list.push(rec);
            return rec;
        },
        /** Loipe an dieser Stelle (Rasterkoordinaten) oder null. */
        at(gx, gy, margin = 0.3) {
            for (const rec of list) {
                const m = rec.mid, lim = rec.snowW + margin;
                for (let i = 0; i < m.length; i += 2) {
                    if (Math.abs(m[i].gx - gx) < lim + 1 && Math.abs(m[i].gy - gy) < lim + 1
                        && Math.hypot(m[i].gx - gx, m[i].gy - gy) < lim + 0.6) return rec;
                }
            }
            return null;
        },
        /** Laufrichtung der nächsten Loipe an dieser Stelle als Winkel (atan2(x, z)) – oder null. */
        dirAt(gx, gy) {
            let best = null, bd = Infinity;
            for (const rec of list) {
                const m = rec.mid;
                for (let i = 0; i < m.length - 1; i++) {
                    const d = Math.hypot(m[i].gx - gx, m[i].gy - gy);
                    if (d < bd && d < rec.snowW + 1) { bd = d; best = Math.atan2(m[i + 1].gx - m[i].gx, m[i + 1].gy - m[i].gy); }
                }
            }
            return best;
        },
        /** Je Bild: Läufer weiterbewegen. `show` = es wird gelaufen (tagsüber). */
        update(dt, show) {
            checkT -= dt;
            const check = checkT <= 0;
            if (check) checkT = 2.5;
            for (const rec of list) {
                if (check) {
                    // liegt (noch) Schnee? Sonst verschwinden Spuren und Läufer
                    let n = 0;
                    for (const f of [0.15, 0.5, 0.85]) { const q = rec.mid[Math.floor(f * rec.len)]; if (hasSnowAt(q.gx, q.gy)) n++; }
                    rec.snow = n >= 2;
                    rec.tracks.visible = rec.snow;
                }
                const vis = show && rec.snow;
                for (const k of rec.skaters) {
                    k.fig.visible = vis;
                    if (!vis) continue;
                    sample(rec, k.s, _s);
                    const up = _s.slope * k.dir;                       // Steigung in Laufrichtung
                    const want = (up >= 0 ? V_FLAT / (1 + up * 7) : V_FLAT + Math.min(5, -up * 22)) * k.pace;
                    k.v += (want - k.v) * Math.min(1, dt * 1.5);
                    k.glide += ((up < -0.07 ? 1 : 0) - k.glide) * Math.min(1, dt * 3);
                    k.s += k.dir * k.v * dt;
                    if (k.s >= rec.len || k.s <= 0) {
                        if (rec.loop) k.s = (k.s + rec.len) % rec.len;
                        else { k.s = Math.max(0, Math.min(rec.len, k.s)); k.dir = -k.dir; }
                        if (deps.onLap) deps.onLap(rec);
                    }
                    k.ph += dt * (2.4 + k.v * 0.55);
                    const sway = Math.sin(k.ph) * 0.15 * (1 - k.glide);
                    // rechts halten: je Richtung eine eigene Seite der Loipe
                    const off = k.dir * rec.snowW * 0.3 + sway;
                    const w = posAt(_s.gx - _s.ty * off, _s.gy + _s.tx * off);
                    k.fig.position.set(w.x, w.y + 0.07, w.z);
                    k.fig.rotation.y = Math.atan2(_s.tx * k.dir, _s.ty * k.dir) + Math.cos(k.ph) * 0.1 * (1 - k.glide);
                    k.fig.userData.pose(k.ph, k.glide);
                }
            }
        },
        skaters: () => list.flatMap(r => r.skaters),
        dispose() { figMat.dispose(); trackMat.dispose(); }
    };
}
