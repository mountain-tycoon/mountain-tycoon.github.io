// ============================================================
// GLEITSCHIRM MIT SKI
// makeGliderLaunch()  Startplatz: kleine Rampe mit Windsack, Schild und
//                     einem ausgelegten Schirm – von hier hebt die
//                     Spielfigur ab und gleitet ins Tal.
// makeCanopy()        der Schirm über der Figur: gewölbte Kappe aus
//                     farbigen Zellen, Leinen hinunter zum Gurtzeug
//                     (Ursprung = Gurtzeug, die Kappe hängt darüber).
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const LAUNCH_R = 2.8;
const WING = [0xe8452c, 0xf2f4f7, 0xf2b01e, 0xf2f4f7, 0xe8452c];

const tinted = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
};

/** Kappe als Bogen aus Zellen; `flat` = am Boden ausgelegt. */
const wingGeo = (span, chord, rise, flat = false) => {
    const N = 15, parts = [];
    for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N * 2 - 1;                         // −1 … 1 über die Spannweite
        const a = u * 1.05;                                      // Bogenwinkel
        const x = flat ? u * span / 2 : Math.sin(a) * span / 2 / Math.sin(1.05);
        const y = flat ? 0 : (Math.cos(a) - 1) * rise / (1 - Math.cos(1.05));
        const cell = new THREE.BoxGeometry(span / N * 1.04, flat ? 0.05 : 0.12, chord * (1 - 0.35 * u * u));
        if (!flat) cell.rotateZ(-a * 0.9);
        cell.translate(x, y, 0);
        parts.push(tinted(cell, WING[Math.min(WING.length - 1, Math.floor((u + 1) / 2 * WING.length))]));
    }
    return mergeGeometries(parts);
};

export function makeCanopy() {
    const g = new THREE.Group();
    const SPAN = 5.2, UP = 3.3;
    const wing = new THREE.Mesh(wingGeo(SPAN, 1.35, 1.0), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
    wing.position.y = UP; wing.castShadow = true; g.add(wing);
    // Leinen: von der Kappe zu den beiden Tragegurten über den Schultern
    const pos = [];
    for (const sx of [-1, 1]) for (const f of [0.25, 0.55, 0.85, 1.0]) for (const z of [-0.45, 0.45]) {
        const a = sx * f * 1.05;
        pos.push(sx * 0.2, 0.75, 0, Math.sin(a) * SPAN / 2 / Math.sin(1.05), UP + (Math.cos(a) - 1) * 1.0 / (1 - Math.cos(1.05)) - 0.06, z);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2e36, transparent: true, opacity: 0.7 })));
    return g;
}

export function makeGliderLaunch() {
    const g = new THREE.Group();
    const std = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
    const mats = { wood: std(0x8a6a45, 0.85), dark: std(0x30363f, 0.7), snow: std(0xeef3fa, 0.92), red: std(0xe8452c, 0.7), white: std(0xf2f4f7) };
    const parts = {};
    const add = (mat, geo, x, y, z) => { (parts[mat] ||= []).push(geo.translate(x, y, z)); };
    const boxAt = (mat, w, h, d, x, y, z) => add(mat, new THREE.BoxGeometry(w, h, d), x, y, z);
    // Startrampe: Holzdeck, vorn (lokal +z) leicht abfallend, mit Schneeauflage
    add('wood', new THREE.BoxGeometry(2.6, 0.16, 3.4).rotateX(0.1), 0, 0.3, 0.2);
    add('snow', new THREE.BoxGeometry(2.3, 0.06, 3.1).rotateX(0.1), 0, 0.41, 0.2);
    for (const sx of [-1, 1]) for (const z of [-1.2, 1.5]) boxAt('wood', 0.14, 0.5, 0.14, sx * 1.15, 0.2, z);
    // Schild und Windsack-Mast
    boxAt('dark', 0.07, 1.3, 0.07, -1.7, 0.65, -1.3);
    boxAt('red', 0.9, 0.42, 0.05, -1.7, 1.35, -1.3);
    boxAt('white', 0.6, 0.08, 0.06, -1.7, 1.35, -1.27);
    boxAt('dark', 0.06, 2.6, 0.06, 1.8, 1.3, -1.2);
    for (const k of Object.keys(parts)) {
        const m = new THREE.Mesh(mergeGeometries(parts[k].map(q => (q.index ? q.toNonIndexed() : q))), mats[k]);
        m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    // Windsack: rot-weiß geringelt, schwenkt gemächlich
    const sockGeo = [];
    for (let i = 0; i < 4; i++) sockGeo.push(tinted(new THREE.CylinderGeometry(0.17 - i * 0.03, 0.14 - i * 0.03, 0.26, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.13 + i * 0.26), i % 2 ? 0xf2f4f7 : 0xe8452c));
    const sock = new THREE.Mesh(mergeGeometries(sockGeo), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    sock.position.set(1.8, 2.5, -1.2); g.add(sock);
    // ein Schirm liegt startbereit hinter der Rampe
    const spare = new THREE.Mesh(wingGeo(3.4, 0.9, 0, true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    spare.position.set(0, 0.1, -2.1); g.add(spare);
    g.userData.update = (t) => { sock.rotation.y = 0.5 + Math.sin(t * 0.35) * 0.5 + Math.sin(t * 1.3) * 0.12; sock.rotation.x = -0.12 + Math.sin(t * 2.1) * 0.06; };
    return g;
}
