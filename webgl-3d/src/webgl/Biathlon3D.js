// ============================================================
// BIATHLON-SCHIESSSTAND
// Schießbahn mit drei Ständen: vorn (lokal +z) die überdachte
// Schützenlinie mit Matten, hinten (−z) die Scheibenkästen vor einem
// Kugelfang. Geschossen wird auf dem mittleren Stand: seine fünf
// Scheiben sind einzelne Netze und klappen bei einem Treffer auf Weiß.
//
// userData.shoot = { fire, targets, radius, reset(), hit(i) }
//   fire     Standpunkt des Schützen (lokal)
//   targets  die fünf Scheiben des mittleren Stands
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Radius, den der Stand im Gelände belegt. */
export const BIATHLON_R = 8;
const DISC_R = 0.17, DISC_GAP = 0.44, LANE_GAP = 2.7, FIRE_Z = 4.6, TARGET_Z = -5.6;

export function makeBiathlonRange() {
    const g = new THREE.Group();
    const mats = {
        wood: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x30363f, roughness: 0.7 }),
        white: new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.8 }),
        earth: new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 }),
        snow: new THREE.MeshStandardMaterial({ color: 0xeef3fa, roughness: 0.92 }),
        red: new THREE.MeshStandardMaterial({ color: 0xc8322c, roughness: 0.7 }),
        blue: new THREE.MeshStandardMaterial({ color: 0x2b62b8, roughness: 0.7 })
    };
    // nachts strahlt das Flutlicht Scheibenkästen und Matten an: sie bekommen dann Eigenlicht
    mats.white.emissive = new THREE.Color(0xfff2d8); mats.white.emissiveIntensity = 0;
    mats.snow.emissive = new THREE.Color(0x8fa3c4); mats.snow.emissiveIntensity = 0;
    const discOff = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.6 });
    const discHit = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x555555 });
    const parts = {};
    const add = (mat, geo, x, y, z) => { (parts[mat] ||= []).push(geo.translate(x, y, z)); };
    const boxAt = (mat, w, h, d, x, y, z) => add(mat, new THREE.BoxGeometry(w, h, d), x, y, z);

    // Kugelfang: Erdwall mit Schneekappe, davor eine Holzwand
    boxAt('earth', 9.6, 1.5, 1.2, 0, 0.75, TARGET_Z - 1.5);
    boxAt('snow', 9.9, 0.22, 1.5, 0, 1.6, TARGET_Z - 1.5);
    boxAt('wood', 9.2, 1.25, 0.1, 0, 0.72, TARGET_Z - 0.8);
    // Seitliche Zäune entlang der Bahn
    for (const sx of [-1, 1]) {
        boxAt('wood', 0.07, 0.06, FIRE_Z - TARGET_Z, sx * 4.5, 0.55, (FIRE_Z + TARGET_Z) / 2);
        for (let z = TARGET_Z; z <= FIRE_Z; z += 2.04) boxAt('wood', 0.09, 0.62, 0.09, sx * 4.5, 0.31, z);
    }
    const targets = [];
    for (let lane = -1; lane <= 1; lane++) {
        const lx = lane * LANE_GAP;
        // Scheibenkasten auf zwei Pfosten
        boxAt('white', 2.3, 0.62, 0.08, lx, 1.02, TARGET_Z);
        boxAt('dark', 2.4, 0.07, 0.14, lx, 1.36, TARGET_Z);
        for (const sx of [-1, 1]) boxAt('dark', 0.08, 0.72, 0.08, lx + sx * 0.95, 0.36, TARGET_Z);
        boxAt(lane === 0 ? 'red' : 'blue', 0.34, 0.26, 0.05, lx, 1.56, TARGET_Z);          // Standnummer
        for (let i = 0; i < 5; i++) {
            const dx = lx + (i - 2) * DISC_GAP;
            if (lane === 0) {
                const m = new THREE.Mesh(new THREE.CircleGeometry(DISC_R, 20), discOff);
                m.position.set(dx, 1.02, TARGET_Z + 0.05);
                g.add(m); targets.push(m);
            } else add('dark', new THREE.CircleGeometry(DISC_R, 14), dx, 1.02, TARGET_Z + 0.05);
        }
        // Schießmatte und Standmarke an der Schützenlinie
        boxAt(lane === 0 ? 'red' : 'blue', 1.1, 0.04, 1.9, lx, 0.12, FIRE_Z);
        boxAt('white', 1.7, 0.03, 0.08, lx, 0.115, FIRE_Z - 1.05);
    }
    // Wetterdach über der Schützenlinie
    for (const sx of [-1, 1]) for (const z of [FIRE_Z - 1.0, FIRE_Z + 1.3]) boxAt('wood', 0.12, 1.9, 0.12, sx * 4.2, 0.95, z);
    {
        const roof = new THREE.BoxGeometry(9.0, 0.1, 3.0).rotateX(0.1);
        add('dark', roof, 0, 1.98, FIRE_Z + 0.15);
        add('snow', new THREE.BoxGeometry(8.8, 0.09, 2.8).rotateX(0.1), 0, 2.07, FIRE_Z + 0.15);
    }
    // Windfähnchen neben der Bahn
    for (const z of [-2.5, 1.2]) {
        boxAt('dark', 0.03, 1.1, 0.03, 3.9, 0.55, z);
        boxAt('red', 0.3, 0.12, 0.02, 4.06, 1.03, z);
    }
    // Flutlicht: zwei Masten neben der Schützenlinie strahlen die Bahn hinunter, zwei kleine neben den Scheiben
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffe08a, emissiveIntensity: 0.2, roughness: 0.4 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const lamps = [], glows = [];
    for (const [sx, z, h, aim] of [[-1, FIRE_Z - 1.6, 5.2, -1], [1, FIRE_Z - 1.6, 5.2, -1], [-1, TARGET_Z + 1.4, 3.2, -1], [1, TARGET_Z + 1.4, 3.2, -1]]) {
        const px = sx * 4.9;
        add('dark', new THREE.CylinderGeometry(0.07, 0.11, h, 8), px, h / 2, z);
        boxAt('dark', 0.08, 0.08, 0.9, px - sx * 0.2, h, z + aim * 0.3);
        lamps.push(new THREE.BoxGeometry(0.7, 0.24, 0.3).rotateX(0.5).translate(px - sx * 0.3, h - 0.14, z + aim * 0.6).toNonIndexed());
        const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.5, h + 0.4, 18, 1, true), glowMat);
        cone.position.set(px - sx * 2.0, h / 2, z + aim * 1.6);
        cone.rotation.set(-0.5, 0, -sx * 0.42);
        cone.visible = false; g.add(cone); glows.push(cone);
    }
    g.add(new THREE.Mesh(mergeGeometries(lamps), lampMat));
    // Lichtfleck auf den Scheiben: ein heller Schein vor dem Kugelfang
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 2.2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    spot.position.set(0, 1.05, TARGET_Z - 0.72); spot.visible = false; g.add(spot);
    g.userData.setNight = (dark) => {
        const n = Math.max(0, Math.min(1, dark * 1.4 - 0.15));
        lampMat.emissiveIntensity = 0.2 + n * 2.4;
        mats.white.emissiveIntensity = n * 0.62; mats.snow.emissiveIntensity = n * 0.3;
        discHit.emissiveIntensity = 1 + n * 0.8;
        for (const c of glows) c.visible = n > 0.35;           // erst wenn es wirklich dunkel ist, und nur als Hauch
        glowMat.opacity = n * 0.07;
        spot.visible = n > 0.1; spot.material.opacity = n * 0.16;
    };
    for (const k of Object.keys(parts)) {
        const m = new THREE.Mesh(mergeGeometries(parts[k].map(q => (q.index ? q.toNonIndexed() : q))), mats[k]);
        m.castShadow = k !== 'snow'; m.receiveShadow = true;
        g.add(m);
    }
    g.userData.shoot = {
        fire: new THREE.Vector3(0, 0.12, FIRE_Z),
        targets, radius: DISC_R,
        reset() { for (const t of targets) { t.material = discOff; t.userData.hit = false; } },
        hit(i) { targets[i].material = discHit; targets[i].userData.hit = true; }
    };
    return g;
}
