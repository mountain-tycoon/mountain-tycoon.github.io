// ============================================================
// SELBST FAHREN: der Spieler steuert einen eigenen Skifahrer durch
// sein Skigebiet. Die Kamera hängt hinter der Figur; die Simulation
// (Gäste, Lifte, Wetter) läuft dabei weiter.
//
// Maße: eine Kachel ist eine Welt-Einheit, die Figur gut eine Einheit
// hoch. Die Gäste fahren höchstens 12 Einheiten je Sekunde – daran sind
// Tempo, Kurvenradius und Bremsweg hier ausgerichtet.
// ============================================================
import * as THREE from 'three';
import { makeSkier } from './Vehicles3D.js';

const G = 7.2;              // Hangabtrieb
const FALL = 15;            // Fallbeschleunigung im Sprung
const V_MAX = 21;
const KMH = 6;              // Anzeige: Einheiten je Sekunde -> km/h
const GROUND_LIFTS = ['tbar', 'platter', 'carpet'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * deps:
 *   scene, camera, dom  (dom = Zeichenfläche: Umsehen in der Kabine)
 *   surfaceAt(wx, wz)   Höhe der Schneedecke        solidAt(wx, wz)  dazu Felsblöcke
 *   half, tile          halbe Kartenbreite, Kachelgröße
 *   lcAt(gx, gy)        Bodenart (1/5/6 Wald, 2 Wasser, 3 Fels)
 *   hasSnowAt(gx, gy)   liegt eine fahrbare Decke?
 *   isBuilt(gx, gy)     steht hier ein Gebäude?
 *   routes()            Lifte und Pisten des Gebiets
 *   touch()             Bedienung mit dem Finger? (für die Hinweistexte)
 *   onState(info)       Meldung ans HUD (mehrmals je Sekunde), null = beendet
 */
export function createSkiRun(deps) {
    const { scene, camera, dom, surfaceAt, solidAt, half, tile, lcAt, hasSnowAt, isBuilt, routes } = deps;
    let onState = deps.onState || null;

    let on = false;
    let mesh = null;
    const pos = new THREE.Vector3();
    let th = 0;                 // Fahrtrichtung: (sin th, cos th) in der Ebene
    let v = 0;                  // Tempo entlang der Fahrtrichtung
    let vy = 0, air = false;    // Sprung
    let walking = false;        // kein Schnee: zu Fuß, Ski auf der Schulter
    let striding = false;       // geht gerade Schritt für Schritt (auch auf Ski, im Stand oder bergauf)
    let lastGround = 0;
    let steerS = 0, tuckS = 0, brakeS = 0;
    let camTh = 0;
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    let ride = null;            // laufende Liftfahrt
    let lookYaw = 0, lookPitch = 0;      // Blick aus der Kabine (ziehen = umsehen)
    const NEAR0 = camera.near;
    const _seat = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
    let stride = 0;             // Schrittphase beim Gehen

    // ===== SCHNEESTAUB =====
    // Ein kleiner Vorrat an Flocken, die hinter den Skiern aufstieben: beim Fahren ein feiner
    // Schleier, in der Kurve und beim Bremsen eine Fahne zur Außenseite.
    const DUST_N = 260;
    const dustPos = new Float32Array(DUST_N * 3).fill(-1e5), dustVel = new Float32Array(DUST_N * 3), dustLife = new Float32Array(DUST_N);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustTex = (() => {                    // weiche runde Flocke statt eines Quadrats
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
        return new THREE.CanvasTexture(c);
    })();
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd3deee, size: 0.42, sizeAttenuation: true, map: dustTex,
        transparent: true, opacity: 0.7, depthWrite: false }));
    dust.frustumCulled = false;
    let dustNext = 0, dustAcc = 0;
    const stepDust = (dt, amount, side) => {
        const dx = Math.sin(th), dz = Math.cos(th);
        dustAcc += amount * dt;
        while (dustAcc >= 1) {
            dustAcc -= 1;
            const i = dustNext; dustNext = (dustNext + 1) % DUST_N;
            const r = Math.random, sp = (r() - 0.5) * 0.5;
            dustPos[i * 3] = pos.x - dx * 0.3 - dz * sp; dustPos[i * 3 + 1] = pos.y + 0.08; dustPos[i * 3 + 2] = pos.z - dz * 0.3 + dx * sp;
            // ein Teil der Fahrt bleibt im Staub, dazu seitlich weg (Kurvenaußenseite) und nach oben
            const out = side * (1.2 + r() * 1.6) + (r() - 0.5) * 0.9, fw = v * (0.25 + r() * 0.2);
            dustVel[i * 3] = dx * fw + dz * out; dustVel[i * 3 + 1] = 0.7 + r() * 1.3 + Math.abs(side) * 0.8; dustVel[i * 3 + 2] = dz * fw - dx * out;
            dustLife[i] = 0.5 + r() * 0.6;
        }
        for (let i = 0; i < DUST_N; i++) {
            if (dustLife[i] <= 0) continue;
            dustLife[i] -= dt;
            if (dustLife[i] <= 0) { dustPos[i * 3 + 1] = -1e5; continue; }
            const k = Math.exp(-2.2 * dt);
            dustVel[i * 3] *= k; dustVel[i * 3 + 2] *= k; dustVel[i * 3 + 1] -= 3.2 * dt;
            dustPos[i * 3] += dustVel[i * 3] * dt; dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt; dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
        }
        dustGeo.attributes.position.needsUpdate = true;
    };
    const clearDust = () => { dustLife.fill(0); dustPos.fill(-1e5); dustGeo.attributes.position.needsUpdate = true; };
    let offer = null;           // Lift, in den man gerade einsteigen könnte
    let emitT = 0, bumpT = 0, hintT = 0, hint = '';
    const input = { left: false, right: false, brake: false, tuck: false };
    const keys = new Set();
    let ac = null;

    const toG = (w) => (w + half) / tile;
    const toW = (g) => g * tile - half;
    const isForest = (x, z) => { const lc = lcAt(toG(x), toG(z)); return lc === 1 || lc === 5 || lc === 6; };
    /** Hier geht es nicht weiter: Kartenrand, Wasser, Felsblock, Gebäude. */
    const blockedAt = (x, z) => {
        if (Math.abs(x) > half - 1.2 || Math.abs(z) > half - 1.2) return 'edge';
        const gx = toG(x), gy = toG(z);
        if (isBuilt(Math.round(gx), Math.round(gy))) return 'building';
        // Auf der Piste ist der Weg frei: sie überbrückt Bäche, und Felsblöcke (nur grob
        // gerastert bekannt) sind dort geräumt.
        const water = lcAt(gx, gy) === 2, rock = solidAt(x, z) > surfaceAt(x, z) + 0.7;
        if ((water || rock) && !onPisteAt(x, z)) return water ? 'water' : 'rock';
        return null;
    };
    const pistes = () => routes().filter(r => r.kind === 'piste' && r.path && r.path.length >= 2);
    const lifts = () => routes().filter(r => r.kind === 'lift' && r.top && r.bottom);
    /** Abstand zur nächsten Pistenachse (in Einheiten), grob über die Wegpunkte. */
    const onPisteAt = (x, z) => {
        const gx = toG(x), gy = toG(z);
        for (const r of pistes()) {
            const w = (r.snowW || 3) + 1;
            const p = r.path;
            for (let i = 0; i < p.length - 1; i++) {
                const ax = p[i].gx, ay = p[i].gy, bx = p[i + 1].gx - ax, by = p[i + 1].gy - ay;
                const l2 = bx * bx + by * by || 1;
                const u = clamp(((gx - ax) * bx + (gy - ay) * by) / l2, 0, 1);
                if (Math.hypot(gx - ax - bx * u, gy - ay - by * u) < w) return true;
            }
        }
        return false;
    };
    /** Richtung des steilsten Gefälles. */
    const fallLine = (x, z) => {
        const e = 1.5;
        const dx = surfaceAt(x - e, z) - surfaceAt(x + e, z), dz = surfaceAt(x, z - e) - surfaceAt(x, z + e);
        return Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : th;
    };
    /** Punkt auf einer Piste, `dist` Kacheln nach dem obersten Wegpunkt, samt Laufrichtung dort. */
    const alongPiste = (p, dist) => {
        let left = dist;
        for (let i = 0; i < p.length - 1; i++) {
            const bx = p[i + 1].gx - p[i].gx, by = p[i + 1].gy - p[i].gy, l = Math.hypot(bx, by);
            if (l < 1e-6) continue;
            if (left <= l || i === p.length - 2) {
                const u = Math.min(1, left / l);
                return { x: toW(p[i].gx + bx * u), z: toW(p[i].gy + by * u), th: Math.atan2(bx, by) };
            }
            left -= l;
        }
        return { x: toW(p[0].gx), z: toW(p[0].gy), th: 0 };
    };
    /** Rund um den Punkt steht nichts (Station, Hütte) – auch nicht dort, wo die Kamera hängt. */
    const clearSpot = (q) => {
        for (const back of [0, 3, 6]) {
            const x = q.x - Math.sin(q.th) * back, z = q.z - Math.cos(q.th) * back;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4, r = i % 2 ? 2.2 : 1.2;
                if (blockedAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
            }
        }
        return true;
    };
    /** Start einer Piste: so weit unterhalb der Bergstation, dass Figur und Kamera frei stehen. */
    const pisteStart = (r) => {
        let q = alongPiste(r.path, 4);
        for (let d = 4; d <= 22 && !clearSpot(q); d += 2) q = alongPiste(r.path, d + 2);
        return q;
    };
    const nearestStart = (x, z) => {
        let best = null, bd = Infinity;
        for (const r of pistes()) {
            const s = pisteStart(r), d = Math.hypot(s.x - x, s.z - z);
            if (d < bd) { bd = d; best = s; }
        }
        return best && { ...best, d: bd };
    };
    const liftLabel = (r) => r.name || 'Lift';

    const say = (text) => { hint = text; hintT = 2.6; emitT = 0; };
    const emit = () => {
        if (!onState) return;
        onState(on ? {
            kmh: Math.round(v * KMH),
            riding: ride ? liftLabel(ride.route) : null,
            cabin: !!(ride && ride.inside),
            waiting: !!(ride && ride.car === null && ride.model),
            lift: !ride && offer ? liftLabel(offer) : null,
            hint: hintT > 0 ? hint : ''
        } : null);
    };

    const resetPose = () => {
        const ud = mesh.userData;
        ud.setCarry?.(false); ud.setSnowboard?.(false);
        for (const part of [ud.legL, ud.legR, ud.armL, ud.armR, ud.torso]) part?.rotation.set(0, 0, 0);
    };
    const place = (x, z, heading) => {
        pos.set(x, surfaceAt(x, z), z); lastGround = pos.y;
        th = heading; camTh = heading; v = 0; vy = 0; air = false; steerS = 0; walking = false;
        const dx = Math.sin(th), dz = Math.cos(th);
        camPos.set(x - dx * 5, pos.y + 2.4, z - dz * 5);
        camLook.set(x + dx * 5, pos.y + 0.8, z + dz * 5);
    };

    const readInput = () => {
        const k = (...names) => names.some(n => keys.has(n));
        return {
            left: input.left || k('a', 'arrowleft'),
            right: input.right || k('d', 'arrowright'),
            brake: input.brake || k('s', 'arrowdown', ' '),
            tuck: input.tuck || k('w', 'arrowup')
        };
    };

    /** Oben aussteigen: an den Beginn der nächsten Abfahrt, sonst neben die Bergstation. */
    const arrive = () => {
        const r = ride.route;
        const s = nearestStart(toW(r.top.gx), toW(r.top.gy));
        if (ride.car) { mesh.scale.setScalar(ride.scale0); mesh.visible = true; }
        camera.near = NEAR0; camera.updateProjectionMatrix();
        ride = null;
        if (s && s.d < 40) place(s.x, s.z, s.th);
        else { const x = toW(r.top.gx), z = toW(r.top.gy); place(x, z, fallLine(x, z)); }
        v = 1.5;
        say('Oben angekommen – los geht’s');
    };
    /** Nächstes bergwärts fahrendes Fahrzeug, das gerade aus der Talstation kommt. */
    const boardable = (model, any) => {
        let best = null, bd = any ? Infinity : 0.05;
        for (const c of model.carriers) if (c.up && Number.isFinite(c.along) && c.along < bd) { bd = c.along; best = c; }
        return best;
    };
    const stepRide = (dt) => {
        v = 0;
        if (ride.model) {
            // ----- echte Mitfahrt: die Figur sitzt im Fahrzeug der Anlage -----
            if (!ride.car) {
                ride.wait += dt;
                const c = boardable(ride.model, ride.wait > 12);
                if (!c) { if (ride.wait > 20) { ride.model = null; } return; }
                ride.car = c; ride.last = c.along; ride.still = 0;
                ride.seat = Math.max(0, (c.info?.seats || 1) - 1);
                ride.scale0 = mesh.scale.x;
                ride.inside = !ride.ground;
                if (ride.inside) {
                    mesh.visible = false; lookYaw = 0.5; lookPitch = -0.12;
                    camera.near = 0.05; camera.updateProjectionMatrix();
                }
                emitT = 0;
            }
            const c = ride.car;
            ride.still = c.along === ride.last ? ride.still + dt : 0; ride.last = c.along;
            if (ride.still > 3) {                       // Anlage steht (noch im Bau): zu Fuß … am Seil entlang
                if (ride.inside) { mesh.visible = true; camera.near = NEAR0; camera.updateProjectionMatrix(); }
                mesh.scale.setScalar(ride.scale0);
                ride.model = null; ride.car = null; ride.inside = false; ride.t = 0;
                return;
            }
            if (!c.up || c.along >= 0.985) { arrive(); return; }
            ride.model.seatPos(c, ride.seat, _seat);
            pos.copy(_seat);
            mesh.scale.setScalar(ride.scale0 * (c.info?.scale || 1));
            return;
        }
        // ----- Ersatz ohne Fahrzeuge (Förderband, Anlage im Bau): am Hang entlang nach oben -----
        ride.t = Math.min(1, ride.t + dt / ride.dur);
        const e = ride.t * ride.t * (3 - 2 * ride.t);
        const x = ride.ax + (ride.bx - ride.ax) * e, z = ride.az + (ride.bz - ride.az) * e;
        const lift = ride.h * Math.sin(Math.PI * Math.min(1, ride.t * 6, (1 - ride.t) * 6) / 2);
        pos.set(x, surfaceAt(x, z) + lift, z);
        if (ride.t >= 1) arrive();
    };

    const stepSki = (dt, inp) => {
        const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        steerS += (steer - steerS) * ease(9, dt);
        tuckS += ((inp.tuck ? 1 : 0) - tuckS) * ease(6, dt);
        brakeS += ((inp.brake ? 1 : 0) - brakeS) * ease(8, dt);
        // Lenken: im Stand auf der Stelle, mit dem Tempo weitere Bögen
        th -= steerS * (2.7 / (1 + v * 0.035)) * (air ? 0.25 : 1) * dt;
        const dx = Math.sin(th), dz = Math.cos(th);
        const e = 0.6;
        const s = (surfaceAt(pos.x + dx * e, pos.z + dz * e) - surfaceAt(pos.x - dx * e, pos.z - dz * e)) / (2 * e);
        if (!air) {
            const gx = toG(pos.x), gy = toG(pos.z);
            const snow = hasSnowAt(gx, gy), forest = isForest(pos.x, pos.z);
            // Gehen: auf aperer Wiese immer; im Schnee, wenn man steht oder es bergauf geht und
            // „vorwärts" gedrückt ist – so kommt man überall weiter, auch den Hang hinauf.
            const stepping = inp.tuck && !inp.brake && v < 3.3 && s > -0.07 && s < 1.3;
            walking = !snow;
            if (walking || stepping) {
                const want = stepping || (walking && inp.tuck && !inp.brake) ? 2.9 / (1 + Math.max(0, s) * 1.2) : 0;
                v += (want - v) * ease(v > want ? 3.5 : 5, dt);
                striding = want > 0;
                if (walking && bumpT <= 0) { say(deps.touch?.() ? 'Kein Schnee – Bild gedrückt halten, dann geht es zu Fuß weiter' : 'Kein Schnee – mit W geht es zu Fuß weiter'); bumpT = 12; }
            } else {
                striding = false;
                let a = -G * s / Math.sqrt(1 + s * s);
                // Reibung: Piste gleitet, Tiefschnee bremst, im Wald erst recht
                const mu = forest ? 0.32 : onPisteAt(pos.x, pos.z) ? 0.035 : 0.085;
                const drag = (0.02 - 0.009 * tuckS) * v * v + Math.abs(steerS) * v * 0.2 + brakeS * (6 + v * 0.5);
                if (v > 0.01) a -= mu * G + drag;
                else if (a < mu * G) a = 0;                      // Haftung: im Flachen bleibt man stehen
                if (inp.tuck && v < 3.4) a += 3.2;               // bergab anschieben mit den Stöcken
                v = clamp(v + a * dt, 0, V_MAX);
            }
            // Schneestaub: mit dem Tempo mehr, in der Kurve und beim Bremsen eine Fahne
            const spray = snow && !walking && !striding && v > 1.5 ? v * 8 + (Math.abs(steerS) * 14 + brakeS * 18) * v : 0;
            stepDust(dt, Math.min(260, spray), steerS * Math.min(1, v / 6));
        } else stepDust(dt, 0, 0);
        bumpT -= dt;
        if (mesh.userData.carrying !== walking) mesh.userData.setCarry?.(walking);
        // Weiterfahren, sofern nichts im Weg steht
        const nx = pos.x + dx * v * dt, nz = pos.z + dz * v * dt;
        const why = v > 0 ? blockedAt(nx, nz) : null;
        if (why && !blockedAt(pos.x, pos.z)) {
            if (v > 2) say(why === 'water' ? 'Wasser – hier geht es nicht weiter'
                : why === 'edge' ? 'Ende des Skigebiets'
                : why === 'rock' ? 'Fels im Weg' : 'Gebäude im Weg');
            v = 0;
        } else { pos.x = nx; pos.z = nz; }
        // Höhe: am Boden kleben – außer das Gelände fällt schneller weg, als man fällt (Kuppe, Schanze)
        const ground = surfaceAt(pos.x, pos.z);
        const gvy = (ground - lastGround) / Math.max(dt, 1e-3);     // so schnell steigt oder fällt der Boden unter den Skiern
        lastGround = ground;
        if (air) {
            vy -= FALL * dt; pos.y += vy * dt;
            if (pos.y <= ground) { pos.y = ground; air = false; vy = gvy; }
        } else if (v > 4 && gvy < vy - FALL * dt - 0.9) {
            air = true; vy -= FALL * dt; pos.y += vy * dt;
            if (pos.y <= ground) { pos.y = ground; air = false; vy = gvy; }
        } else { pos.y = ground; vy = gvy; }
        // Einsteigen möglich? Langsam und nah an einer Talstation
        offer = null;
        if (v < 4) {
            let bd = 14;                    // großzügig: rund um die Talstation stehen Gebäude im Weg
            for (const r of lifts()) {
                const d = Math.hypot(toW(r.bottom.gx) - pos.x, toW(r.bottom.gy) - pos.z);
                if (d < bd) { bd = d; offer = r; }
            }
        }
        return s;
    };

    const poseSkier = (t, s, dt = 0) => {
        const ud = mesh.userData;
        mesh.position.set(pos.x, pos.y + 0.05, pos.z);
        mesh.rotation.order = 'YXZ';
        const lean = steerS * Math.min(0.5, 0.12 + v * 0.035);
        const pitch = ride || walking || striding ? 0 : -Math.atan(s) * (air ? 0.4 : 1);
        mesh.rotation.set(pitch, th, lean);
        if (ride && ride.car) {
            // im Fahrzeug: aufrecht, mit der Kabine ausgerichtet
            mesh.position.copy(pos);
            ride.car.mesh.getWorldQuaternion(_q); mesh.quaternion.copy(_q);
            for (const part of [ud.legL, ud.legR, ud.armL, ud.armR, ud.torso]) part?.rotation.set(0, 0, 0);
            return;
        }
        if ((walking || striding) && !ride) {
            // Schritt für Schritt: aufrecht, Beine und Arme schwingen (auf Ski kürzer – Grätenschritt)
            stride += dt * (4 + v * 2);
            const sw = Math.sin(stride) * (walking ? 0.55 : 0.3) * Math.min(1, v / 2);
            if (ud.torso) ud.torso.rotation.set(walking ? 0.06 : 0.22, 0, 0);
            if (ud.legL) { ud.legL.rotation.set(sw, 0, walking ? 0 : -0.12); ud.legR.rotation.set(-sw, 0, walking ? 0 : 0.12); }
            if (ud.armL) { ud.armL.rotation.set(-sw * 0.8, 0, 0); ud.armR.rotation.set(walking ? -0.5 : sw * 0.8, 0, 0); }
            return;
        }
        const crouch = 0.3 + tuckS * 0.55 + Math.min(0.2, v * 0.012);
        if (ud.torso) ud.torso.rotation.set(ride ? 0 : crouch, 0, 0);
        const armX = ride ? 0 : -0.45 - tuckS * 0.7 + (air ? 0.5 : 0);
        if (ud.armL) { ud.armL.rotation.set(armX, 0, -0.25 - brakeS * 0.3 - lean * 0.6); ud.armR.rotation.set(armX, 0, 0.25 + brakeS * 0.3 - lean * 0.6); }
        // Beine: Pflug beim Bremsen, sonst leicht gegen die Schräglage
        const wob = v > 1 && !air ? Math.sin(t * 9) * 0.02 : 0;
        if (ud.legL) { ud.legL.rotation.set(wob, 0, -brakeS * 0.22 - lean * 0.3); ud.legR.rotation.set(-wob, 0, brakeS * 0.22 - lean * 0.3); }
    };

    const stepCamera = (dt) => {
        if (ride && ride.inside && ride.car) {
            // Platz in der Kabine: Augenhöhe der (verkleinerten) Figur, Blick frei drehbar
            const sc = ride.car.info?.scale || 1;
            camera.position.set(pos.x, pos.y + 0.84 * sc, pos.z);
            _e.set(lookPitch, th + Math.PI + lookYaw, 0);
            camera.quaternion.setFromEuler(_e);
            camPos.copy(camera.position);
            return;
        }
        // Die Kamera dreht verzögert mit – so sieht man den eigenen Schwung
        let d = th - camTh;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        camTh += d * ease(ride ? 2 : 3.2, dt);
        const cx = Math.sin(camTh), cz = Math.cos(camTh);
        const back = 4.2 + v * 0.1 + (ride ? 3 : 0), up = 1.9 + v * 0.03 + (ride ? 1.5 : 0);
        const wx = pos.x - cx * back, wz = pos.z - cz * back;
        const wy = Math.max(pos.y + up, solidAt(wx, wz) + 1.3);
        const k = ease(7, dt);
        camPos.x += (wx - camPos.x) * k; camPos.z += (wz - camPos.z) * k;
        camPos.y += (wy - camPos.y) * ease(4, dt);
        const floor = solidAt(camPos.x, camPos.z) + 0.9;
        if (camPos.y < floor) camPos.y = floor;
        const ahead = 5 + v * 0.3;
        const lx = pos.x + cx * ahead, lz = pos.z + cz * ahead;
        const ly = ride ? pos.y + 0.6 : Math.min(pos.y + 0.9, Math.max(surfaceAt(lx, lz) + 0.9, pos.y - ahead * 0.6));
        camLook.x += (lx - camLook.x) * k; camLook.z += (lz - camLook.z) * k;
        camLook.y += (ly - camLook.y) * ease(5, dt);
        camera.position.copy(camPos);
        camera.lookAt(camLook);
    };

    return {
        active: () => on,
        setOnState(cb) { onState = cb; },
        /**
         * Die Figur an einer frei gewählten Stelle absetzen: sie fällt aus kurzer Höhe in den Schnee.
         * Liefert einen Grund (Text), wenn dort kein Platz ist – dann startet nichts.
         */
        start(wx, wz) {
            if (on) return null;
            const x = clamp(wx, -half + 3, half - 3), z = clamp(wz, -half + 3, half - 3);
            const why = blockedAt(x, z);
            if (why) return why === 'water' ? 'Im Wasser kann man nicht starten' : why === 'building' ? 'Hier steht ein Gebäude' : 'Hier ist kein Platz – such dir eine freie Stelle';
            if (!mesh) mesh = makeSkier(11);
            resetPose(); mesh.visible = true;
            place(x, z, 0); th = camTh = fallLine(x, z);
            const dx = Math.sin(th), dz = Math.cos(th);
            camPos.set(x - dx * 5, pos.y + 2.4, z - dz * 5); camLook.set(x + dx * 5, pos.y + 0.8, z + dz * 5);
            pos.y += 4.5; air = true; vy = 0;             // fallen lassen
            scene.add(mesh); scene.add(dust); clearDust();
            on = true; ride = null; offer = null; hintT = 0; bumpT = 0; emitT = 0;
            keys.clear(); Object.assign(input, { left: false, right: false, brake: false, tuck: false });
            ac = new AbortController();
            const sig = { signal: ac.signal };
            const typing = (e) => /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
            window.addEventListener('keydown', (e) => {
                if (typing(e)) return;
                const k = e.key.toLowerCase();
                if (['a', 'd', 'w', 's', ' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) { keys.add(k); e.preventDefault(); }
            }, sig);
            window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), sig);
            window.addEventListener('blur', () => { keys.clear(); held.clear(); input.tuck = false; }, sig);
            // Zeichenfläche: in der Kabine ziehen = umsehen; sonst gedrückt halten = Schuss bzw. gehen (Finger)
            const held = new Map();
            const release = (e) => { if (held.delete(e.pointerId) && !held.size) input.tuck = false; };
            dom.addEventListener('pointerdown', (e) => {
                held.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (e.pointerType !== 'mouse' && !(ride && ride.inside)) input.tuck = true;
            }, sig);
            window.addEventListener('pointermove', (e) => {
                const h = held.get(e.pointerId);
                if (!h) return;
                if (ride && ride.inside) {
                    lookYaw += (e.clientX - h.x) * 0.006;
                    lookPitch = clamp(lookPitch + (e.clientY - h.y) * 0.005, -1.1, 0.9);
                }
                h.x = e.clientX; h.y = e.clientY;
            }, sig);
            window.addEventListener('pointerup', release, sig);
            window.addEventListener('pointercancel', release, sig);
            poseSkier(0, 0); stepCamera(1);
            emit();
            return null;
        },
        /** Beenden; liefert den Ort, an dem die Fahrt endete (für die Übersichtskamera). */
        stop() {
            if (!on) return null;
            on = false; ride = null; offer = null;
            ac?.abort(); ac = null; keys.clear();
            mesh.scale.setScalar(1.3); mesh.visible = true;
            camera.near = NEAR0; camera.updateProjectionMatrix();
            scene.remove(mesh); scene.remove(dust);
            emit();
            return { x: pos.x, z: pos.z };
        },
        /** Eingaben der Knöpfe im HUD (Finger). */
        setInput(part) { Object.assign(input, part); },
        /** In den angebotenen Lift steigen und nach oben fahren. */
        takeLift() {
            if (!on || ride || !offer) return false;
            const r = offer;
            const ax = toW(r.bottom.gx), az = toW(r.bottom.gy), bx = toW(r.top.gx), bz = toW(r.top.gy);
            const ground = GROUND_LIFTS.includes(r.liftKind);
            const m = r.model && r.model.seatPos && r.model.carriers && r.model.carriers.length ? r.model : null;
            ride = { route: r, model: m, car: null, wait: 0, ground, inside: false, scale0: mesh.scale.x,
                t: 0, ax, az, bx, bz, h: ground ? 0 : 3.4, dur: clamp(Math.hypot(bx - ax, bz - az) / 9, 4, 16) };
            offer = null; walking = false; striding = false; mesh.userData.setCarry?.(false);
            th = Math.atan2(bx - ax, bz - az);
            clearDust();
            emitT = 0;
            return true;
        },
        step(dt, t) {
            if (!on) return;
            let s = 0;
            if (ride) stepRide(dt); else s = stepSki(dt, readInput());
            poseSkier(t, s, dt);
            stepCamera(dt);
            hintT -= dt; emitT -= dt;
            if (emitT <= 0) { emitT = 0.15; emit(); }
        },
        /** Nur für Prüfungen beim Entwickeln. */
        __state: () => ({ x: pos.x, y: pos.y, z: pos.z, th, v, air, ride: !!ride, offer: !!offer, hint: hintT > 0 ? hint : '', ahead: blockedAt(pos.x + Math.sin(th), pos.z + Math.cos(th)), forest: isForest(pos.x, pos.z) }),
        /** Abstand Kamera–Figur (für den Dunst). */
        viewDist: () => 8,
        dispose() { dustTex.dispose(); ac?.abort(); if (mesh) scene.remove(mesh); scene.remove(dust); camera.near = NEAR0; on = false; }
    };
}
