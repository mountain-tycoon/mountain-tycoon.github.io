/**
 * Luftverkehr als Kulisse:
 *  - Werbeflugzeug mit Banner – fliegt von Zeit zu Zeit quer übers Gebiet, solange eine Werbekampagne läuft.
 *  - Gäste am Gleitschirm – starten ab und zu an einem gebauten Startplatz, gleiten ins Tal und landen beim Ort.
 * Alles rein optisch (die Gleitschirm-Gäste bringen eine kleine Gebühr); die Szene ruft `update(t, dt, lage)`.
 */
import * as THREE from 'three';
import { makeCanopy } from './Paraglider3D.js';
import { CANOPIES } from './SkiOutfits.js';

const bannerTexture = (text) => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, 1024, 128);
    c.fillStyle = '#c62828'; c.fillRect(0, 0, 1024, 12); c.fillRect(0, 116, 1024, 12);
    c.fillStyle = '#b71c1c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = 84;
    do { c.font = `900 ${size}px 'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif`; size -= 4; } while (c.measureText(text).width > 960 && size > 30);
    c.fillText(text, 512, 66);
    const tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4;
    return tx;
};

/** Kleines einmotoriges Flugzeug (Nase nach +z), dahinter Schleppseil und Banner. */
const makeBannerPlane = (text) => {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xd0342c, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.6, 4, 10), white); body.rotation.x = Math.PI / 2; g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.16, 2.4), red); stripe.position.y = 0.05; g.add(stripe);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.1, 1.0), red); wing.position.set(0, 0.5, 0.35); g.add(wing);
    const tailH = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), red); tailH.position.set(0, 0.12, -1.55); g.add(tailH);
    const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.7), red); tailV.position.set(0, 0.55, -1.55); g.add(tailV);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.2, metalness: 0.3 }));
    glass.scale.set(0.9, 0.7, 1.3); glass.position.set(0, 0.36, 0.5); g.add(glass);
    for (const sx of [-1, 1]) { const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), dark); wheel.position.set(sx * 0.55, -0.6, 0.5); g.add(wheel); }
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.05), dark); prop.position.set(0, 0, 1.78); g.add(prop);
    // Schleppseil und Banner (beidseitig lesbar: zwei Flächen Rücken an Rücken)
    const L = 15, H = 1.9, GAP = 7;
    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -1.9), new THREE.Vector3(0, -0.4, -1.9 - GAP)]),
        new THREE.LineBasicMaterial({ color: 0x2a2e34 }));
    g.add(rope);
    const banner = new THREE.Group(); banner.position.set(0, -0.4, -1.9 - GAP - L / 2);
    const tex = bannerTexture(text);
    for (const s of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(L, H), new THREE.MeshBasicMaterial({ map: tex }));
        m.rotation.y = s * Math.PI / 2; m.position.x = s * 0.01; banner.add(m);
    }
    g.add(banner);
    g.userData.update = (t) => { prop.rotation.z = t * 40; banner.rotation.z = Math.sin(t * 2.3) * 0.06; banner.rotation.y = Math.sin(t * 1.7) * 0.05; };
    g.userData.dispose = () => { tex.dispose(); g.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); };
    g.scale.setScalar(2);
    return g;
};

/** Schlichte Figur im Gurtzeug (Ursprung an den Schultergurten wie bei `makeCanopy`). */
const makePilot = (color) => {
    const g = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8), jacket); body.position.y = 0.36; body.rotation.x = -0.35; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), dark); head.position.set(0, 0.78, 0.1); g.add(head);
    for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 6), dark); leg.position.set(sx * 0.11, 0.02, 0.3); leg.rotation.x = -1.2; g.add(leg);
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 1.4), jacket); ski.position.set(sx * 0.11, -0.12, 0.62); g.add(ski);
    }
    return g;
};

export function createAirTraffic({ scene, half, heightAt, topY }) {
    // ---------- Werbeflugzeug ----------
    let plane = null, planeText = '', planeWait = 25 + Math.random() * 30, leg = null;
    const stepPlane = (t, dt, st) => {
        if (!st.adText) { if (plane && !leg) { scene.remove(plane); plane.userData.dispose(); plane = null; } if (!leg) return; }
        if (!leg) {
            planeWait -= dt;
            if (planeWait > 0) return;
            if (!plane || planeText !== st.adText) {
                if (plane) { scene.remove(plane); plane.userData.dispose(); }
                planeText = st.adText; plane = makeBannerPlane(planeText); scene.add(plane);
            }
            // quer übers Gebiet: von einem Rand zum gegenüberliegenden, leicht schräg
            const a = Math.random() * Math.PI * 2, R = half * 1.25, off = (Math.random() - 0.5) * half * 0.7;
            const dx = Math.sin(a), dz = Math.cos(a);
            leg = { x: -dx * R - dz * off, z: -dz * R + dx * off, dx, dz, s: 0, len: R * 2, y: topY() + 16 + Math.random() * 10 };
            plane.visible = true;
        }
        const SPEED = 30;
        leg.s += SPEED * dt;
        const x = leg.x + leg.dx * leg.s, z = leg.z + leg.dz * leg.s;
        plane.position.set(x, leg.y + Math.sin(t * 0.5) * 1.2, z);
        plane.rotation.set(0, Math.atan2(leg.dx, leg.dz), Math.sin(t * 0.8) * 0.05);
        plane.userData.update(t);
        if (leg.s >= leg.len) { leg = null; plane.visible = false; planeWait = 70 + Math.random() * 80; }
    };

    // ---------- Gäste am Gleitschirm ----------
    const gliders = [];
    let gliderWait = 30 + Math.random() * 40, flights = 0;
    const JACKETS = [0xd0342c, 0x1f6fd0, 0xf2b01e, 0x2fa64a, 0x7a3fc4, 0xe86a1c];
    const spawnGlider = (st) => {
        const from = st.launches[Math.floor(Math.random() * st.launches.length)];
        const g = new THREE.Group();
        const canopy = makeCanopy(CANOPIES[Math.floor(Math.random() * CANOPIES.length)].cols);
        canopy.position.y = 0.55; g.add(canopy);
        g.add(makePilot(JACKETS[Math.floor(Math.random() * JACKETS.length)]));
        const y0 = heightAt(from.x, from.z) + 3;
        g.position.set(from.x, y0, from.z);
        scene.add(g);
        const tx = st.land.x + (Math.random() - 0.5) * 30, tz = st.land.z + (Math.random() - 0.5) * 30;
        gliders.push({ mesh: g, canopy, y: y0, th: Math.atan2(tx - from.x, tz - from.z) + (Math.random() - 0.5) * 0.8, tx, tz, t: 0, ph: Math.random() * 6, land: 0 });
    };
    const stepGliders = (t, dt, st) => {
        if (st.launches.length && st.day && st.guests > 12 && !st.storm) {
            gliderWait -= dt;
            if (gliderWait <= 0) { gliderWait = 45 + Math.random() * 75; if (gliders.length < 3) spawnGlider(st); }
        }
        for (let i = gliders.length - 1; i >= 0; i--) {
            const q = gliders[i], m = q.mesh;
            q.t += dt;
            if (q.land > 0) {                                  // gelandet: Schirm fällt zusammen, dann verschwindet die Figur
                q.land += dt;
                q.canopy.scale.y = Math.max(0.05, 1 - q.land * 1.4); q.canopy.rotation.x = Math.min(1.3, q.land * 1.6);
                if (q.land > 3.5) { scene.remove(m); m.traverse(o => { o.geometry?.dispose?.(); }); gliders.splice(i, 1); flights++; if (st.onLanded) st.onLanded(); }
                continue;
            }
            // Kurs: in weiten Bögen zum Landeplatz
            const want = Math.atan2(q.tx - m.position.x, q.tz - m.position.z) + Math.sin(q.t * 0.35 + q.ph) * 0.7;
            let d = want - q.th; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            const turn = Math.max(-0.5, Math.min(0.5, d)) * dt;
            q.th += turn;
            const V = 7.5;
            m.position.x += Math.sin(q.th) * V * dt; m.position.z += Math.cos(q.th) * V * dt;
            const ground = heightAt(m.position.x, m.position.z), dist = Math.hypot(q.tx - m.position.x, q.tz - m.position.z);
            q.y -= 0.85 * dt;                                  // Gleitzahl knapp 9
            const floor = ground + (dist < 40 ? 0.4 : 7);      // unterwegs Abstand zum Hang halten, am Ziel aufsetzen
            if (q.y < floor) q.y = dist < 40 ? floor : Math.min(floor, Math.max(ground + 1.5, q.y + 5 * dt));
            if (dist < 40) q.y = Math.max(ground + 0.4, Math.min(q.y, ground + dist * 0.35 + 0.4));
            m.position.y = q.y;
            m.rotation.set(0, q.th, -turn / Math.max(1e-4, dt) * 0.5);
            if (q.y <= ground + 0.45 || q.t > 240) q.land = 0.01;
        }
    };

    return {
        update(t, dt, st) { if (dt <= 0) return; stepPlane(t, dt, st); stepGliders(t, dt, st); },
        state: () => ({ plane: !!leg, gliders: gliders.length, flights, planeWait, gliderWait }),
        force(what) { if (what === 'plane') planeWait = 0; else gliderWait = 0; }
    };
}
