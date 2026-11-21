// ============================================================
// EISBAHN mit Eishockeyfeld
// Eisfläche mit Linien und Bullykreisen, Bande ringsum (Eingang vorn
// in der Mitte, lokal +z), zwei Tore mit Torhütern, ein Puck,
// Flutlicht an den Ecken, Verleihhütte und Bänke.
//
// userData.rink ist das Spiel auf dem Eis:
//   hw, hd, iceY, gate   halbe Länge/Breite der Eisfläche, Eishöhe, halbe Breite des Eingangs
//   step(dt)             Puck und Torhüter weiterbewegen
//   touch(x, z, vx, vz)  ein Läufer führt den Puck (alles in Koordinaten der Bahn)
//   shoot(x, z, dx, dz, speed)  Schuss, wenn der Puck in Reichweite liegt
//   onGoal(n)            Rückruf bei einem Tor
// userData.setNight(dark) schaltet das Flutlicht.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const RINK_HW = 6.5, RINK_HD = 4.2;
const ICE_Y = 0.17, GOAL_X = 5.35, GOAL_HALF = 0.72, GATE = 1.25, PUCK_R = 0.075;

export function makeIceRink() {
    const g = new THREE.Group();
    const HW = RINK_HW, HD = RINK_HD;
    const std = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const mats = {
        board: std(0xf4f6f9), kick: std(0xf2c230, 0.6), rail: std(0x1d4ed8, 0.5), metal: std(0x596270, 0.5, { metalness: 0.5 }),
        red: std(0xd42a2a, 0.5), blue: std(0x2563eb, 0.5), crease: std(0x9fd0ee, 0.3), wood: std(0x8a6a45, 0.85),
        dark: std(0x30363f), snow: std(0xeef3fa, 0.92), net: std(0xffffff, 0.9, { transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    };
    const parts = {};
    const add = (mat, geo, x = 0, y = 0, z = 0) => { (parts[mat] ||= []).push(geo.translate(x, y, z)); };
    const boxAt = (mat, w, h, d, x, y, z) => add(mat, new THREE.BoxGeometry(w, h, d), x, y, z);
    const ring = (mat, r, x, z, tube = 0.035) => add(mat, new THREE.TorusGeometry(r, tube, 4, 28).rotateX(Math.PI / 2).scale(1, 0.25, 1), x, ICE_Y + 0.005, z);

    // Eis: glatt und leicht spiegelnd, nachts vom Flutlicht aufgehellt
    const iceMat = std(0xd9edf8, 0.06, { metalness: 0.3, emissive: 0xbfd9ee, emissiveIntensity: 0 });
    const ice = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.14, HD * 2), iceMat);
    ice.position.y = ICE_Y - 0.07; ice.receiveShadow = true; g.add(ice);
    // Linien: Mittellinie rot, zwei blaue, Torlinien, Mittelkreis, vier Bullykreise, Torräume
    const LY = ICE_Y + 0.004;
    boxAt('red', 0.1, 0.008, HD * 2 - 0.2, 0, LY, 0);
    for (const sx of [-1, 1]) {
        boxAt('blue', 0.12, 0.008, HD * 2 - 0.2, sx * 2.1, LY, 0);
        boxAt('red', 0.05, 0.008, HD * 2 - 0.6, sx * GOAL_X, LY, 0);
        add('crease', new THREE.CircleGeometry(0.95, 18, 0, Math.PI).rotateX(-Math.PI / 2).rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2), sx * GOAL_X, LY + 0.002, 0);
        for (const sz of [-1, 1]) { ring('red', 0.75, sx * 3.9, sz * 2.2); add('red', new THREE.CylinderGeometry(0.09, 0.09, 0.008, 10), sx * 3.9, LY, sz * 2.2); }
    }
    ring('blue', 1.25, 0, 0); add('blue', new THREE.CylinderGeometry(0.1, 0.1, 0.008, 10), 0, LY, 0);

    // Bande: weiß mit gelber Fußleiste und blauem Handlauf; vorn in der Mitte der Eingang
    const wall = (w, d, x, z) => {
        boxAt('board', w, 0.5, d, x, ICE_Y + 0.25, z);
        boxAt('kick', w + (d > w ? 0.02 : 0), 0.09, d + (w > d ? 0.02 : 0), x, ICE_Y + 0.045, z);
        boxAt('rail', w + (d > w ? 0.04 : 0), 0.05, d + (w > d ? 0.04 : 0), x, ICE_Y + 0.52, z);
    };
    wall(HW * 2 + 0.3, 0.15, 0, -HD - 0.075);
    for (const sx of [-1, 1]) {
        wall(0.15, HD * 2 + 0.3, sx * (HW + 0.075), 0);
        const w = HW - GATE;                                              // vordere Bande links und rechts vom Eingang
        wall(w + 0.15, 0.15, sx * (GATE + w / 2 + 0.075), HD + 0.075);
        boxAt('metal', 0.1, 0.72, 0.1, sx * GATE, ICE_Y + 0.36, HD + 0.075);    // Torpfosten des Eingangs
    }
    // Tore: roter Rahmen, helles Netz
    for (const sx of [-1, 1]) {
        const gx = sx * GOAL_X, back = sx * (GOAL_X + 0.5);
        for (const sz of [-1, 1]) {
            boxAt('red', 0.05, 0.52, 0.05, gx, ICE_Y + 0.26, sz * GOAL_HALF);
            boxAt('red', 0.5, 0.04, 0.04, (gx + back) / 2, ICE_Y + 0.02, sz * GOAL_HALF);
            boxAt('net', 0.5, 0.5, 0.01, (gx + back) / 2, ICE_Y + 0.26, sz * GOAL_HALF);
        }
        boxAt('red', 0.05, 0.05, GOAL_HALF * 2 + 0.05, gx, ICE_Y + 0.52, 0);
        boxAt('net', 0.01, 0.5, GOAL_HALF * 2, back, ICE_Y + 0.26, 0);
        boxAt('net', 0.5, 0.01, GOAL_HALF * 2, (gx + back) / 2, ICE_Y + 0.52, 0);
    }
    // Verleihhütte und Bänke vor dem Eingang
    boxAt('wood', 1.8, 1.2, 1.4, -HW + 0.4, 0.6, HD + 1.7);
    add('dark', new THREE.CylinderGeometry(0, 1.5, 0.55, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8), -HW + 0.4, 1.47, HD + 1.7);
    add('snow', new THREE.CylinderGeometry(0, 1.3, 0.48, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8), -HW + 0.4, 1.56, HD + 1.7);
    for (const bx of [-3.2, 3.2, 5.2]) {
        boxAt('wood', 1.5, 0.08, 0.4, bx, 0.44, HD + 1.2);
        for (const lx of [-0.6, 0.6]) boxAt('dark', 0.08, 0.4, 0.3, bx + lx, 0.2, HD + 1.2);
    }
    // Flutlicht: vier Masten mit Strahlerbalken, dazu weiche Lichtkegel (nur nachts)
    const lampMat = std(0xfff4d0, 0.4, { emissive: 0xffe08a, emissiveIntensity: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const lamps = [], glows = [];
    const MAST = 4.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const px = sx * (HW + 0.45), pz = sz * (HD + 0.45);
        add('metal', new THREE.CylinderGeometry(0.07, 0.11, MAST, 8), px, MAST / 2, pz);
        boxAt('metal', 0.9, 0.08, 0.08, px - sx * 0.25, MAST, pz - sz * 0.2);
        lamps.push(new THREE.BoxGeometry(0.8, 0.26, 0.3).rotateX(-sz * 0.5).translate(px - sx * 0.3, MAST - 0.16, pz - sz * 0.34));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, MAST + 0.4, 18, 1, true), glowMat);
        cone.position.set(px - sx * 2.4, MAST / 2, pz - sz * 1.9);
        cone.rotation.set(sz * 0.42, 0, -sx * 0.5);
        cone.visible = false; g.add(cone); glows.push(cone);
    }
    g.add(new THREE.Mesh(mergeGeometries(lamps.map(q => q.toNonIndexed())), lampMat));
    for (const k of Object.keys(parts)) {
        const m = new THREE.Mesh(mergeGeometries(parts[k].map(q => (q.index ? q.toNonIndexed() : q))), mats[k]);
        m.castShadow = k !== 'net' && k !== 'crease' && k !== 'red' && k !== 'blue'; m.receiveShadow = true;
        g.add(m);
    }

    // Puck und Torhüter (bewegliche Teile)
    const puckMesh = new THREE.Mesh(new THREE.CylinderGeometry(PUCK_R, PUCK_R, 0.035, 12), std(0x101216, 0.5));
    puckMesh.position.y = ICE_Y + 0.02; g.add(puckMesh);
    const keeperMat = std(0xffffff, 0.7, { vertexColors: true });
    const tint = (geo, hex) => {
        const q = geo.toNonIndexed(), c = new THREE.Color(hex), n = q.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        q.setAttribute('color', new THREE.BufferAttribute(a, 3));
        return q;
    };
    const keepers = [-1, 1].map((sx) => {
        const jersey = sx < 0 ? 0x1f6fd0 : 0xd9302c;
        const m = new THREE.Mesh(mergeGeometries([
            tint(new THREE.BoxGeometry(0.2, 0.3, 0.4).translate(0, 0.42, 0), jersey),
            tint(new THREE.BoxGeometry(0.16, 0.3, 0.2).translate(0, 0.15, -0.13), 0xf1f3f6),          // Schienen
            tint(new THREE.BoxGeometry(0.16, 0.3, 0.2).translate(0, 0.15, 0.13), 0xf1f3f6),
            tint(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.67, 0), 0xe9ecf0),                // Maske
            tint(new THREE.BoxGeometry(0.1, 0.2, 0.16).translate(-sx * 0.06, 0.4, 0.3), 0x2a2e36),    // Fanghand
            tint(new THREE.BoxGeometry(0.04, 0.5, 0.05).rotateX(0.5).translate(-sx * 0.12, 0.25, -0.34), 0x8a6a45)   // Schläger
        ]), keeperMat);
        m.position.set(sx * (GOAL_X - 0.28), ICE_Y, 0); m.castShadow = true; g.add(m);
        return { mesh: m, sx, z: 0 };
    });

    const puck = { x: 0, z: 0, vx: 0, vz: 0, wait: 0 };
    const rink = {
        hw: HW, hd: HD, iceY: ICE_Y, gate: GATE, goals: 0, onGoal: null, puck,
        step(dt) {
            if (puck.wait > 0) {                                  // nach einem Tor: kurz liegen lassen, dann Anstoß
                puck.wait -= dt;
                if (puck.wait <= 0) { puck.x = 0; puck.z = 0; puck.vx = 0; puck.vz = 0; }
            } else {
                const px0 = puck.x;
                puck.x += puck.vx * dt; puck.z += puck.vz * dt;
                const k = Math.exp(-0.42 * dt); puck.vx *= k; puck.vz *= k;
                // Tor: über die Torlinie zwischen den Pfosten, von vorn
                for (const sx of [-1, 1]) {
                    if ((px0 - sx * GOAL_X) * sx < 0 && (puck.x - sx * GOAL_X) * sx >= 0 && Math.abs(puck.z) < GOAL_HALF - PUCK_R) {
                        rink.goals++; puck.wait = 1.6; puck.vx = 0; puck.vz = 0; puck.x = sx * (GOAL_X + 0.25);
                        if (rink.onGoal) rink.onGoal(rink.goals);
                    }
                }
                // Bande
                const lx = HW - PUCK_R, lz = HD - PUCK_R;
                if (Math.abs(puck.x) > lx) { puck.x = Math.sign(puck.x) * lx; puck.vx *= -0.7; }
                if (Math.abs(puck.z) > lz) { puck.z = Math.sign(puck.z) * lz; puck.vz *= -0.7; }
            }
            // Torhüter schieben sich vor den Puck – nicht allzu flink
            for (const kp of keepers) {
                const near = (puck.x * kp.sx) > 0, want = near && puck.wait <= 0 ? Math.max(-0.5, Math.min(0.5, puck.z)) : 0;
                kp.z += Math.max(-1.5 * dt, Math.min(1.5 * dt, want - kp.z));
                kp.mesh.position.z = kp.z;
                const kx = kp.sx * (GOAL_X - 0.28);
                if (puck.wait <= 0 && Math.abs(puck.x - kx) < 0.2 && Math.abs(puck.z - kp.z) < 0.3 && puck.vx * kp.sx > 0) {
                    puck.vx *= -0.55; puck.vz += (puck.z - kp.z) * 4; puck.x = kx - kp.sx * 0.21;           // gehalten: prallt zurück
                }
            }
            puckMesh.position.x = puck.x; puckMesh.position.z = puck.z;
        },
        /** Ein Läufer berührt den Puck: er nimmt ihn mit, ein Stück vor dem Schläger. */
        touch(x, z, vx, vz) {
            if (puck.wait > 0) return false;
            const d = Math.hypot(puck.x - x, puck.z - z), sp = Math.hypot(vx, vz);
            if (d > 0.45 || sp < 0.4) return false;
            puck.vx = vx * 1.18 + vx / sp * 0.9; puck.vz = vz * 1.18 + vz / sp * 0.9;
            return true;
        },
        /** Schuss in Blickrichtung, wenn der Puck nah genug liegt. */
        shoot(x, z, dx, dz, speed) {
            if (puck.wait > 0 || Math.hypot(puck.x - x, puck.z - z) > 1.05) return false;
            puck.vx = dx * (8.5 + speed); puck.vz = dz * (8.5 + speed);
            return true;
        }
    };
    g.userData.rink = rink;
    let last = null;
    g.userData.update = (t) => { const dt = last === null ? 0 : Math.max(0, Math.min(0.05, t - last)); last = t; if (dt) rink.step(dt); };
    g.userData.setNight = (dark) => {
        const n = Math.max(0, Math.min(1, dark * 1.4 - 0.15));
        lampMat.emissiveIntensity = 0.2 + n * 2.4;
        iceMat.emissiveIntensity = n * 0.34;
        for (const c of glows) c.visible = n > 0.35;           // erst wenn es wirklich dunkel ist, und nur als Hauch
        glowMat.opacity = n * 0.07;
    };
    return g;
}
