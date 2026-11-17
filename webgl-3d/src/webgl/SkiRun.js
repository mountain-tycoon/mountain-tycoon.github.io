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
import { makePlayerSkier, PLAYER_SCALE } from './SkiFigure.js';
import { selectionKey } from './SkiOutfits.js';
import { createSkiSound } from './SkiSound.js';

const G = 8.4;              // Hangabtrieb
const FALL = 15;            // Fallbeschleunigung im Sprung
const V_MAX = 26;
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
 *   runAt(wx, wz)       Anlage an dieser Stelle (Kicker, Funpark, Halfpipe, Rennstrecke) oder null
 *   huts()              Einkehrmöglichkeiten: [{ x, z, name }]
 *   touch()             Bedienung mit dem Finger? (für die Hinweistexte)
 *   onState(info)       Meldung ans HUD (mehrmals je Sekunde), null = beendet
 */
export function createSkiRun(deps) {
    const { scene, camera, dom, surfaceAt, solidAt, half, tile, lcAt, hasSnowAt, isBuilt, routes } = deps;
    let onState = deps.onState || null;

    let on = false;
    let mesh = null, meshOutfit = '';
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
    let edgeSide = 0, hop = 0;  // Kantenwechsel: kurzes Entlasten zwischen zwei Schwüngen
    let airT = 0, squat = 0;    // Flugzeit und Abfedern bei der Landung
    let fov0 = camera.fov, camRoll = 0;
    // Schleppbügel: Querholz hinter der Hüfte und das Zugseil hinauf zur Klemme am Förderseil.
    // (Der Bügel des Anlagenmodells liegt auf Schneehöhe und ist aus der Nähe nicht zu erkennen.)
    const tow = new THREE.Group();
    const towMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.3 });
    const towBar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }));
    const towRope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6), towMat);
    // Tellerlift: statt des Querholzes eine Stange mit Teller, die man zwischen die Beine nimmt
    const towDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 14), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7 }));
    tow.add(towBar); tow.add(towDisc); tow.add(towRope); tow.visible = false;
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    const placeTow = (c, platter) => {
        const dx = Math.sin(th), dz = Math.cos(th);
        c.mesh.getWorldPosition(_b);
        towBar.visible = !platter; towDisc.visible = !!platter;
        if (platter) {
            // Teller hinter dem Gesäß (Fläche in Fahrtrichtung), die Stange läuft zwischen den Beinen nach vorn oben
            _a.set(pos.x - dx * 0.17, pos.y + 0.44 * PLAYER_SCALE, pos.z - dz * 0.17);
            towDisc.position.copy(_a); towDisc.rotation.set(Math.PI / 2 - 0.25, th, 0, 'YXZ');
            _a.x += dx * 0.05; _a.z += dz * 0.05;
        } else {
            // Bügel quer hinter dem Gesäß, Seil von dort schräg nach vorn oben
            _a.set(pos.x - dx * 0.13, pos.y + 0.5 * PLAYER_SCALE, pos.z - dz * 0.13);
            towBar.position.copy(_a); towBar.rotation.set(0, th, 0);
        }
        towRope.position.copy(_a).add(_b).multiplyScalar(0.5);
        towRope.scale.set(platter ? 1.6 : 1, Math.max(0.1, _a.distanceTo(_b)), platter ? 1.6 : 1);   // Stange etwas kräftiger als das Seil
        towRope.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize());
        tow.visible = true;
    };

    // ===== KABINE VON INNEN =====
    // Die Kabinen sind massive Körper ohne Innenleben. Für die eigene Fahrt bekommt die Kabine
    // eine helle Decke mit Lichtband und einen Rahmen über dem Fensterband.
    const cabinIn = new THREE.Group();
    const linerMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, emissive: 0x6a665e, roughness: 0.9, side: THREE.DoubleSide });   // leuchtet leicht: von unten fällt kaum Licht darauf
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe2a8, emissiveIntensity: 0.9, roughness: 0.6 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, side: THREE.DoubleSide });
    const fitCabin = (car) => {
        cabinIn.clear();
        const body = car.mesh.children.find(o => o.isMesh && o.geometry);
        if (!body) return;
        if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
        const bb = body.geometry.boundingBox, w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z, h = bb.max.y - bb.min.y;
        const yC = bb.max.y - h * 0.2 - 0.004;                  // Unterkante der Dachhaube
        const ceil = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.012, d * 0.95), linerMat);
        ceil.position.y = yC; cabinIn.add(ceil);
        for (const sx of [-1, 1]) {
            const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.06, 0.006, d * 0.6), lampMat);
            lamp.position.set(sx * w * 0.2, yC - 0.009, 0); cabinIn.add(lamp);
        }
        // Rahmen unter der Decke und Brüstung an der Fensterunterkante, ringsum
        for (const [yy, hh] of [[yC - h * 0.03, h * 0.06], [bb.min.y + h * 0.4 + 0.012, 0.024]]) {
            for (const sx of [-1, 1]) {
                const a = new THREE.Mesh(new THREE.BoxGeometry(0.012, hh, d * 0.93), frameMat); a.position.set(sx * w * 0.468, yy, 0); cabinIn.add(a);
                const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.93, hh, 0.012), frameMat); b.position.set(0, yy, sx * d * 0.468); cabinIn.add(b);
            }
        }
        car.mesh.add(cabinIn);
    };

    // ===== SKISPUREN =====
    // Zwei schmale Bänder hinter den Skiern, die letzten gut hundert Meter weit.
    const TR_N = 240, TR_STEP = 0.4;
    const trPos = new Float32Array(TR_N * 4 * 3).fill(-1e5);
    const trGeo = new THREE.BufferGeometry();
    trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
    {
        const idx = [];
        for (let i = 0; i < TR_N - 1; i++) for (const o of [0, 2]) {
            const a = i * 4 + o, b = a + 1, c = a + 4, d = a + 5;
            idx.push(a, c, b, b, c, d);
        }
        trGeo.setIndex(idx);
    }
    const trail = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.3, depthWrite: false,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    trail.frustumCulled = false;
    let trLast = null, trGap = true;
    const clearTrail = () => { trPos.fill(-1e5); trGeo.attributes.position.needsUpdate = true; trLast = null; trGap = true; };
    /** Spur fortschreiben; `draw` = die Ski liegen gerade im Schnee. */
    const stepTrail = (draw) => {
        if (trLast && Math.hypot(pos.x - trLast.x, pos.z - trLast.z) < TR_STEP) return;
        trLast = { x: pos.x, z: pos.z };
        trPos.copyWithin(0, 12);                                   // ältesten Abschnitt fallen lassen
        const o = (TR_N - 1) * 12, rx = Math.cos(th), rz = -Math.sin(th);
        const half = draw ? 0.04 : 0;                              // Breite 0 = Lücke (Sprung, zu Fuß)
        if (!draw || trGap) {
            // nach einer Lücke: vorletzte Reihe an dieselbe Stelle legen, damit kein Band quer durchs Bild läuft
            for (let k = 0; k < 4; k++) { trPos[o - 12 + k * 3] = pos.x; trPos[o - 12 + k * 3 + 1] = pos.y; trPos[o - 12 + k * 3 + 2] = pos.z; }
        }
        let k = 0;
        for (const side of [-1, 1]) for (const e of [-1, 1]) {
            const off = side * 0.095 * PLAYER_SCALE + e * half;
            const x = pos.x + rx * off, z = pos.z + rz * off;
            trPos[o + k * 3] = x; trPos[o + k * 3 + 1] = surfaceAt(x, z) + 0.05; trPos[o + k * 3 + 2] = z;
            k++;
        }
        trGap = !draw;
        trGeo.attributes.position.needsUpdate = true;
    };

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
    /** Schneewolke auf einen Schlag (Landung nach einem Sprung). */
    const burstDust = (n) => {
        for (let j = 0; j < n; j++) {
            const i = dustNext; dustNext = (dustNext + 1) % DUST_N;
            const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.6;
            dustPos[i * 3] = pos.x; dustPos[i * 3 + 1] = pos.y + 0.08; dustPos[i * 3 + 2] = pos.z;
            dustVel[i * 3] = Math.cos(a) * sp + Math.sin(th) * v * 0.3; dustVel[i * 3 + 1] = 0.8 + Math.random() * 1.8; dustVel[i * 3 + 2] = Math.sin(a) * sp + Math.cos(th) * v * 0.3;
            dustLife[i] = 0.5 + Math.random() * 0.6;
        }
    };
    const clearDust = () => { dustLife.fill(0); dustPos.fill(-1e5); dustGeo.attributes.position.needsUpdate = true; };
    let offer = null;           // Lift, in den man gerade einsteigen könnte
    let hutOffer = null;        // Hütte in Reichweite
    let rest = null;            // Einkehr: { name, a } – die Kamera kreist um die Terrasse
    let jump = null;            // laufender Sprung: Drehung und Salto (vom Spieler gesteuert), Halfpipe-Hilfe
    let curRun = null;          // Anlage, auf der man gerade ist
    let crashT = 0;             // gestürzt: so lange liegt die Figur im Schnee
    let score = 0, trickTips = 0;
    const SPIN_RATE = 8.6, FLIP_RATE = 7.6;      // Bogenmaß je Sekunde: eine Drehung in gut 0,7 s, ein Salto in gut 0,8 s
    let hCos = 1;               // Anteil des Tempos, der waagerecht wirkt (am Steilhang weniger)
    let race = null;            // Zeitnahme auf der Rennstrecke
    const bestTimes = new Map();
    const sound = createSkiSound();
    const runAt = deps.runAt || (() => null);
    const fmtS = (t) => t.toFixed(1).replace('.', ',') + ' s';
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
        // Kicker, Funpark, Halfpipe und Rennstrecke belegen zwar Bauplatz, sind aber zum Durchfahren da
        if (isBuilt(Math.round(gx), Math.round(gy)) && !deps.runAt?.(x, z)) return 'building';
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
    /** Steigung in Fahrtrichtung. */
    const slopeAhead = () => {
        const dx = Math.sin(th), dz = Math.cos(th), e = 0.6;
        return (surfaceAt(pos.x + dx * e, pos.z + dz * e) - surfaceAt(pos.x - dx * e, pos.z - dz * e)) / (2 * e);
    };
    /** Richtung des steilsten Gefälles. */
    const fallLine = (x, z) => {
        const e = 1.5;
        const dx = surfaceAt(x - e, z) - surfaceAt(x + e, z), dz = surfaceAt(x, z - e) - surfaceAt(x, z + e);
        return Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : th;
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
    const liftLabel = (r) => r.name || 'Lift';

    const say = (text, secs = 2.6) => { hint = text; hintT = secs; emitT = 0; };
    /**
     * Absprung. In der Luft bestimmt der Spieler den Trick: links/rechts dreht, „vorwärts" ist der Salto
     * vorwärts, Bremsen der Salto rückwärts – auch gemischt. An der Kante der Halfpipe geht es senkrecht hoch,
     * die Fahrtrichtung wird an der Pipe-Achse gespiegelt, und die Figur treibt in der Luft zurück in die Wand
     * und ein Stück die Rinne hinunter.
     */
    const takeOff = () => {
        const q = runAt(pos.x, pos.z);
        // Tricks nur bei echten Sprüngen: auf einer Anlage oder mit kräftigem Absprung – nicht bei jedem Hüpfer in der Kurve
        jump = { t: 0, spin: 0, flip: 0, pipe: null, tricks: (!!q && q.type !== 'racecourse') || vy > 3 };
        if (q && q.type === 'halfpipe' && Math.abs(q.across) > 3) {
            const sgn = Math.sign(q.across), ax = Math.sin(q.axis), az = Math.cos(q.axis);
            jump.pipe = { ix: -sgn * q.px, iz: -sgn * q.pz, ax, az };
            th = 2 * q.axis - th;
        }
        if (q && q.type !== 'racecourse' && vy > 2 && trickTips < 3) {
            trickTips++;
            say(deps.touch?.() ? 'In der Luft: Seitentasten drehen · beide = Salto rückwärts · Bild halten = Salto vorwärts'
                : 'In der Luft: A / D drehen · W Salto vorwärts · S Salto rückwärts', 3.2);
        }
    };
    const land = (ground, gvy) => {
        const hard = airT > 0.25;
        if (hard) { burstDust(Math.min(70, 20 + airT * 60)); squat = Math.min(1, airT * 1.6); sound.thump(Math.min(1, airT)); }
        if (jump) {
            const spinDeg = Math.abs(jump.spin) * 180 / Math.PI, flips = Math.abs(jump.flip) / (Math.PI * 2);
            const spinR = Math.round(spinDeg / 180) * 180, flipR = Math.round(flips);
            if (spinDeg > 100 || flips > 0.3) {             // darunter war es kein Trick, nur ein unruhiger Sprung
                // Sauber ist die Landung, wenn Drehung und Salto (fast) zu Ende gedreht sind
                if (Math.abs(spinDeg - spinR) > 80 || (flips > 0.3 && Math.abs(flips - flipR) * 360 > 90)) {
                    crashT = 1.3; v *= 0.3; burstDust(70); sound.thump(1);
                    say('Gestürzt – nicht zu Ende gedreht', 2.4);
                } else if (spinR || flipR) {
                    const name = [flipR ? (flipR > 1 ? 'Doppelter ' : '') + (jump.flip > 0 ? 'Frontflip' : 'Backflip') : '', spinR ? spinR + '°' : ''].filter(Boolean).join(' ');
                    const pts = Math.round((spinR / 180 * 100 + flipR * 300 + airT * 80) * (jump.pipe ? 1.5 : 1) / 10) * 10;
                    score += pts;
                    say(`${name} · +${pts} Punkte`, 3);
                }
            }
            if (jump.pipe) th = Math.atan2(jump.pipe.ix * 0.8 + jump.pipe.ax * 0.6, jump.pipe.iz * 0.8 + jump.pipe.az * 0.6);   // die Wand hinunter, schräg talwärts
        }
        pos.y = ground; air = false; vy = gvy; jump = null;
    };
    const emit = () => {
        if (!onState) return;
        onState(on ? {
            kmh: Math.round(v * KMH),
            riding: ride ? liftLabel(ride.route) : null,
            cabin: !!(ride && ride.inside),
            look: !!(ride && ride.car),
            waiting: !!(ride && ride.car === null && ride.model),
            lift: !ride && !rest && offer ? liftLabel(offer) : null,
            hut: !ride && !rest && hutOffer ? hutOffer.name : null,
            resting: rest ? rest.name : null,
            timer: race ? fmtS(race.t) : null,
            score,
            sound: sound.wanted(),
            hint: hintT > 0 ? hint : ''
        } : null);
    };

    const resetPose = () => {
        mesh.userData.setCarry(false); mesh.userData.setPose({});
        mesh.scale.setScalar(PLAYER_SCALE); mesh.visible = true;
    };
    const place = (x, z, heading) => {
        pos.set(x, surfaceAt(x, z), z); lastGround = pos.y;
        th = heading; camTh = heading; v = 0; vy = 0; air = false; steerS = 0; walking = false;
        trLast = null; trGap = true;
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
    const endRideView = () => {
        resetPose(); tow.visible = false; cabinIn.removeFromParent();
        camera.near = NEAR0; camera.updateProjectionMatrix();
    };
    /**
     * Oben aussteigen: neben der Bergstation stehen bleiben. Von dort entscheidet der Spieler
     * selbst, wohin er geht oder fährt.
     */
    const arrive = () => {
        const r = ride.route, tx = toW(r.top.gx), tz = toW(r.top.gy), dir = th;
        endRideView();
        ride = null;
        let spot = null;
        for (let rad = 4; rad <= 16 && !spot; rad += 2) {
            for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
                const a = dir + off, q = { x: tx + Math.sin(a) * rad, z: tz + Math.cos(a) * rad, th: a };
                if (clearSpot(q)) { spot = q; break; }
            }
        }
        if (spot) place(spot.x, spot.z, spot.th); else place(tx, tz, dir);
        say(deps.touch?.() ? 'Oben – Bild gedrückt halten zum Losgehen' : 'Oben – mit W gehst oder fährst du los');
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
                // Nur in eine fahrende Anlage steigen: im Bau stehen die Fahrzeuge still (und unsichtbar)
                let sum = 0;
                for (const k of ride.model.carriers) sum += k.along || 0;
                if (ride.sum !== undefined && sum !== ride.sum) ride.moving = true;
                ride.sum = sum;
                if (!ride.moving) { if (ride.wait > 2.5) ride.model = null; return; }
                const c = boardable(ride.model, ride.wait > 12);
                if (!c) { if (ride.wait > 20) { ride.model = null; } return; }
                ride.car = c; ride.last = c.along; ride.still = 0;
                ride.seat = Math.max(0, (c.info?.seats || 1) - 1);
                // Kabine: Blick vom eigenen Platz. Sessel und Bügel: Kamera dicht an der Figur.
                ride.inside = !ride.ground && !ride.chair;
                if (ride.inside) {
                    fitCabin(c);
                    // Platz mittig in der vorderen Reihe, Blick durch die Frontscheibe – an den Seiten
                    // stehen Ecksäulen und der Skiköcher im Bild
                    const inf = c.info || {}, rows = inf.rows || 1, perRow = Math.ceil((inf.seats || 1) / rows);
                    ride.seat = Math.min((inf.seats || 1) - 1, perRow * (rows - 1) + Math.floor((perRow - 1) / 2));
                    mesh.visible = false; lookYaw = 0.3; lookPitch = -0.1;
                    camera.near = 0.05; camera.updateProjectionMatrix();
                } else { lookYaw = ride.chair ? 0.55 : 0.35; lookPitch = ride.chair ? -0.16 : -0.05; }   // schräg von hinten oben
                emitT = 0;
            }
            const c = ride.car;
            ride.still = c.along === ride.last ? ride.still + dt : 0; ride.last = c.along;
            if (ride.still > 3) {                       // Anlage steht (noch im Bau): Ersatzfahrt am Hang entlang
                endRideView();
                ride.model = null; ride.car = null; ride.inside = false; ride.t = 0;
                return;
            }
            if (!c.up || c.along >= 0.985) { arrive(); return; }
            // Lage des Fahrzeugs in DIESEM Bild (die Szene hat es eben erst weiterbewegt)
            c.mesh.updateWorldMatrix(true, false);
            ride.model.seatPos(c, ride.seat, _seat);
            if (ride.chair) {
                // auf der Sitzfläche Platz nehmen: Hüfte auf Sitzhöhe, Rücken an der Lehne
                c.mesh.worldToLocal(_seat);
                _seat.y = -0.64 - mesh.userData.hipY * PLAYER_SCALE; _seat.z = -0.05;
                c.mesh.localToWorld(_seat);
            } else if (ride.ground) {
                _seat.y = surfaceAt(_seat.x, _seat.z);   // am Bügel: die Ski bleiben im Schnee
            }
            pos.copy(_seat);
            if (ride.ground) placeTow(c, ride.route.liftKind === 'platter');
            mesh.scale.setScalar(ride.inside ? PLAYER_SCALE * (c.info?.scale || 1) : PLAYER_SCALE);
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
        if (crashT > 0) {                                   // gestürzt: ausrutschen, dann wieder aufstehen
            crashT -= dt; v *= Math.exp(-2.5 * dt);
            inp = { left: false, right: false, brake: false, tuck: false };
        }
        if (air && jump && jump.tricks) {                   // in der Luft: Eingaben drehen die Figur, nicht die Fahrt
            jump.spin -= ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * SPIN_RATE * dt;
            jump.flip += ((inp.tuck ? 1 : 0) - (inp.brake ? 1 : 0)) * FLIP_RATE * dt;
        }
        const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        steerS += (steer - steerS) * ease(5, dt);
        // Kantenwechsel: beim Umsteigen von einer Kurve in die nächste kurz entlasten (hoch), dann tief in den Schwung
        if (Math.sign(steerS) !== edgeSide && Math.abs(steerS) > 0.12) { edgeSide = Math.sign(steerS); if (v > 3) hop = 1; }
        hop = Math.max(0, hop - dt * 3.2);
        tuckS += ((inp.tuck ? 1 : 0) - tuckS) * ease(6, dt);
        brakeS += ((inp.brake ? 1 : 0) - brakeS) * ease(8, dt);
        // Lenken: im Stand auf der Stelle, mit dem Tempo weitere Bögen
        th -= steerS * (1.75 / (1 + v * 0.05)) * (air ? (jump && jump.tricks ? 0 : 0.25) : 1) * dt;
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
                const drag = (0.0135 - 0.007 * tuckS) * v * v + Math.abs(steerS) * v * 0.09 + brakeS * (6 + v * 0.5);
                if (v > 0.01) a -= mu * G + drag;
                else if (!inp.tuck || a < mu * G) a = 0;         // wer steht, bleibt stehen (Kanten quer) – los geht es erst mit „vorwärts"
                if (inp.tuck && v < 3.4) a += 3.2;               // bergab anschieben mit den Stöcken
                if (curRun && curRun.type === 'halfpipe' && v > 1) a += 1.7 * (1 - brakeS);   // Schwung holen in der Rinne: so trägt es bis über die Kante
                v = clamp(v + a * dt, 0, V_MAX);
            }
            // Schneestaub: mit dem Tempo mehr, in der Kurve und beim Bremsen eine Fahne
            const spray = snow && !walking && !striding && v > 1.5 ? v * 8 + (Math.abs(steerS) * 14 + brakeS * 18) * v : 0;
            stepDust(dt, Math.min(260, spray), steerS * Math.min(1, v / 6));
        } else stepDust(dt, 0, 0);
        bumpT -= dt;
        if (mesh.userData.carrying !== walking) mesh.userData.setCarry(walking);
        // Weiterfahren, sofern nichts im Weg steht
        // v ist das Tempo entlang der Schneeoberfläche: am Steilhang (Halfpipe-Wand) geht davon wenig in die Waagerechte
        if (!air) hCos = 1 / Math.sqrt(1 + s * s);
        let nx = pos.x + dx * v * hCos * dt, nz = pos.z + dz * v * hCos * dt;
        if (air && jump && jump.pipe) {                     // über der Pipe-Kante: zurück in die Wand und ein Stück die Rinne hinunter
            nx += (jump.pipe.ix * 2.5 + jump.pipe.ax * 2.6) * dt; nz += (jump.pipe.iz * 2.5 + jump.pipe.az * 2.6) * dt;
        }
        const why = v > 0 ? blockedAt(nx, nz) : null;
        if (why && !blockedAt(pos.x, pos.z)) {
            if (v > 2) say(why === 'water' ? 'Wasser – hier geht es nicht weiter'
                : why === 'edge' ? 'Ende des Skigebiets'
                : why === 'rock' ? 'Fels im Weg' : 'Gebäude im Weg');
            v = 0;
        } else { pos.x = nx; pos.z = nz; }
        // Höhe: am Boden kleben – außer das Gelände fällt schneller weg, als man fällt (Kuppe, Schanze)
        const ground = surfaceAt(pos.x, pos.z);
        // so schnell steigt oder fällt der Boden unter den Skiern – steigen kann man höchstens mit dem eigenen Tempo
        // (an einer Stufe, etwa der Kante der Halfpipe, spränge der Wert sonst ins Uferlose)
        const gvy = Math.min(v, (ground - lastGround) / Math.max(dt, 1e-3));
        lastGround = ground;
        if (air) {
            vy -= FALL * dt; pos.y += vy * dt;
            if (pos.y <= ground) { land(ground, gvy); }
            else { airT += dt; if (jump) jump.t += dt; }
        } else if (v > 4 && gvy < vy - FALL * dt - 0.6) {
            airT = 0; takeOff();
            air = true; vy -= FALL * dt; pos.y += vy * dt;
            if (pos.y <= ground) { pos.y = ground; air = false; vy = gvy; }
        } else { pos.y = ground; vy = gvy; }
        squat = Math.max(0, squat - dt * 2.2);
        // Rennstrecke: Zeit läuft vom ersten bis zum letzten Tor
        const q = runAt(pos.x, pos.z);
        curRun = q;
        if (q && q.type === 'racecourse') {
            if (!race && q.along < -q.hl + 3 && v > 2) { race = { key: q.key, t: 0 }; say('Riesentorlauf – die Zeit läuft'); }
            else if (race && q.along > q.hl - 1.5) {
                const best = bestTimes.get(race.key);
                if (best === undefined || race.t < best) bestTimes.set(race.key, race.t);
                say(`Im Ziel: ${fmtS(race.t)}` + (best === undefined ? '' : race.t < best ? ' – neue Bestzeit!' : ` · Bestzeit ${fmtS(best)}`), 4.5);
                race = null;
            }
        } else if (race) race = null;                    // Strecke verlassen
        if (race) { race.t += dt; emitT = Math.min(emitT, 0.05); }
        // Einkehr möglich? Langsam und nah an einer Hütte
        hutOffer = null;
        if (v < 3 && deps.huts) {
            let bd = 8;
            for (const h of deps.huts()) { const d = Math.hypot(h.x - pos.x, h.z - pos.z); if (d < bd) { bd = d; hutOffer = h; } }
        }
        stepTrail(!air && !walking && hasSnowAt(toG(pos.x), toG(pos.z)));
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
        mesh.rotation.order = 'YXZ';
        if (ride && ride.car) {
            // im Fahrzeug: mit Kabine, Sessel oder Bügel ausgerichtet
            mesh.position.copy(pos);
            if (ride.ground) {
                mesh.rotation.set(-Math.atan(slopeAhead()) * 0.45, th, 0);   // leicht in den Hang gelehnt, nicht senkrecht zur Piste
                ud.setPose({ bendL: 0.22, bendR: 0.22, lean: 0.08, armX: -0.35, elbow: -0.5, pole: 1.0 });
            } else {
                ride.car.mesh.getWorldQuaternion(_q); mesh.quaternion.copy(_q);
                if (ride.chair) ud.setPose({ sit: true, lean: -0.06, armX: -0.55, elbow: -0.9, armOut: 0.05, pole: 1.35 });
                else ud.setPose({ armX: 0.05, elbow: -0.15, pole: 0.1 });
            }
            return;
        }
        mesh.position.set(pos.x, pos.y + 0.02, pos.z);
        const lean = steerS * Math.min(0.68, 0.12 + v * 0.05);
        const pitch = ride || walking || striding ? 0 : -Math.atan(s) * (air ? 0.4 : 1);
        if (crashT > 0) {
            // liegt im Schnee und rappelt sich auf
            const k = Math.min(1, crashT / 0.5);
            mesh.rotation.set(1.35 * k, th, 0.5 * k);
            ud.setPose({ bendL: 0.5, bendR: 0.2, lean: 0.1, armX: -1.4 * k, elbow: -0.3, armOut: 0.6 });
            return;
        }
        const trick = air && jump && (jump.spin || jump.flip);
        mesh.rotation.set(trick ? pitch * 0.3 + jump.flip : pitch, th + (trick ? jump.spin : 0), trick ? 0 : lean);
        if (trick) {
            // um die Körpermitte drehen, nicht um die Füße
            const hgt = 0.5 * PLAYER_SCALE;
            _a.set(0, hgt, 0).applyEuler(mesh.rotation);
            mesh.position.set(pos.x - _a.x, pos.y + hgt - _a.y, pos.z - _a.z);
            const tucked = Math.min(1, Math.abs(jump.flip) * 2);
            ud.setPose({ bendL: 0.55 + tucked * 0.45, bendR: 0.75 + tucked * 0.3, lean: 0.35 + tucked * 0.5,
                armX: -0.3 - tucked * 0.6, armXR: 0.55, elbow: -0.5, armOut: 0.3, pole: 1.3 });       // rechte Hand greift zum Ski
            return;
        }
        if (rest) { ud.setPose({ lean: 0.03, armX: 0.05, elbow: -0.2 }); return; }
        if (ride) { ud.setPose({ bendL: 0.15, bendR: 0.15, lean: 0.1, armX: -0.3, elbow: -0.4, pole: 0.7 }); return; }
        if (walking || striding) {
            // Schritt für Schritt: zu Fuß mit geschulterten Ski, auf Ski im Grätenschritt mit Stockeinsatz
            stride += dt * (4 + v * 2);
            const k = Math.min(1, v / 2), sw = Math.sin(stride) * k;
            if (walking) ud.setPose({ bendL: Math.max(0, -sw) * 0.5, bendR: Math.max(0, sw) * 0.5, swingL: -sw * 0.5, swingR: sw * 0.5,
                lean: 0.06, armX: sw * 0.5, armXR: -0.9, elbow: -0.5 });
            else ud.setPose({ bendL: 0.22 + Math.max(0, -sw) * 0.3, bendR: 0.22 + Math.max(0, sw) * 0.3, swingL: -sw * 0.22, swingR: sw * 0.22,
                lean: 0.2, armX: -0.3 + sw * 0.4, armXR: -0.3 - sw * 0.4, elbow: -0.5, pole: 0.55 });
            return;
        }
        // Fahren: Knie gebeugt, in der Kurve das Innenbein stärker; Schuss = tiefe Hocke, Stöcke unter den Armen
        // tief im Schwung, hoch beim Kantenwechsel, abfedern nach der Landung
        const bend = 0.34 + tuckS * 0.55 + Math.min(0.14, v * 0.01) + (air ? 0.35 : 0) + Math.abs(lean) * 0.5 - hop * 0.22 + squat * 0.5;
        const edge = lean * 0.75;
        ud.setPose({
            bendL: bend - edge, bendR: bend + edge, plough: brakeS,
            lean: 0.3 + tuckS * 0.75 + Math.min(0.12, v * 0.008),
            armX: -0.5 - tuckS * 0.75 + (air ? 0.35 : 0), elbow: -0.75 - tuckS * 0.5,
            armOut: 0.2 + brakeS * 0.25 + (air ? 0.35 : 0) - tuckS * 0.12, armOutL: -lean * 0.5, armOutR: lean * 0.5,
            pole: 0.75 + tuckS * 0.75 - hop * 0.35,
            // Hüftknick: die Beine liegen in der Kurve, der Oberkörper bleibt aufrechter und schaut ins Tal
            roll: -lean * 0.55, twist: lean * 0.35
        });
    };

    const stepCamera = (dt) => {
        if (ride && ride.car) {
            if (ride.inside) {
                // Platz in der Kabine: Augenhöhe der (verkleinerten) Figur, Blick frei drehbar
                const sc = ride.car.info?.scale || 1;
                camera.position.set(pos.x, pos.y + 0.86 * sc, pos.z);
                _e.set(lookPitch, th + Math.PI + lookYaw, 0);
                camera.quaternion.setFromEuler(_e);
            } else {
                // Sessel und Bügel: knapp hinter und über der Figur, durch Ziehen rundherum schwenkbar
                const a = th + lookYaw, el = clamp(0.28 - lookPitch, -0.2, 1.2), dist = ride.chair ? 2.7 : 3.6;
                const cx = pos.x - Math.sin(a) * Math.cos(el) * dist, cz = pos.z - Math.cos(a) * Math.cos(el) * dist;
                camera.position.set(cx, Math.max(pos.y + 0.75 + Math.sin(el) * dist, solidAt(cx, cz) + 0.5), cz);
                camLook.set(pos.x, pos.y + 0.7, pos.z);
                camera.lookAt(camLook);
            }
            camPos.copy(camera.position); camTh = th;
            return;
        }
        if (rest) {
            // Einkehr: die Kamera kreist langsam um die Terrasse – Zeit für die Aussicht
            rest.a += dt * 0.11;
            const a = rest.a + lookYaw, el = clamp(0.3 - lookPitch, 0.05, 1.1), dist = 6.5;
            const cx = pos.x - Math.sin(a) * Math.cos(el) * dist, cz = pos.z - Math.cos(a) * Math.cos(el) * dist;
            camPos.set(cx, Math.max(pos.y + 1 + Math.sin(el) * dist, solidAt(cx, cz) + 0.8), cz);
            camera.position.lerp(camPos, ease(3, dt));
            camLook.lerp(_a.set(pos.x, pos.y + 0.9, pos.z), ease(3, dt));
            camera.lookAt(camLook);
            if (Math.abs(fov0 - camera.fov) > 0.05) { camera.fov += (fov0 - camera.fov) * ease(3, dt); camera.updateProjectionMatrix(); }
            return;
        }
        // Die Kamera dreht verzögert mit – so sieht man den eigenen Schwung
        let d = th - camTh;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        camTh += d * ease(ride ? 2 : 2.5, dt);
        const cx = Math.sin(camTh), cz = Math.cos(camTh);
        const back = 4.0 + v * 0.07 + (ride ? 3 : 0), up = 1.85 - Math.min(0.5, v * 0.03) + (ride ? 1.5 : 0);
        let wx = pos.x - cx * back, wz = pos.z - cz * back;
        let wy = Math.max(pos.y + up, solidAt(wx, wz) + 1.3);
        // Halfpipe: die Kamera steht über der Rinne und schaut sie hinunter – so sieht man beide Wände
        // und die Sprünge, und nichts schneidet durch Wand oder Deck
        const pipe = !ride && curRun && curRun.type === 'halfpipe' && Math.abs(curRun.along) < curRun.hl * 0.95 ? curRun : null;
        if (pipe) {
            const ax = Math.sin(pipe.axis), az = Math.cos(pipe.axis);
            const mx = pos.x - pipe.px * pipe.across, mz = pos.z - pipe.pz * pipe.across;      // Mitte der Rinne auf Höhe der Figur
            // hinter der Figur, aber nie weiter oben als der Beginn der Schale – dort steht das Startbanner im Bild
            const backP = Math.min(7, Math.max(0.5, pipe.along + pipe.hl * 0.7));
            wx = mx + pipe.px * pipe.across * 0.3 - ax * backP; wz = mz + pipe.pz * pipe.across * 0.3 - az * backP;
            wy = Math.max(pos.y + 1.5, surfaceAt(mx, mz) + 6.2 + (7 - backP) * 0.5);
            camTh = pipe.axis;
        }
        const k = ease(7, dt);
        camPos.x += (wx - camPos.x) * k; camPos.z += (wz - camPos.z) * k;
        camPos.y += (wy - camPos.y) * ease(4, dt);
        const floor = solidAt(camPos.x, camPos.z) + 0.9;
        if (camPos.y < floor) camPos.y = floor;
        const ahead = 5 + v * 0.3;
        let lx = pos.x + cx * ahead, lz = pos.z + cz * ahead;
        let ly = ride ? pos.y + 0.6 : Math.min(pos.y + 0.9, Math.max(surfaceAt(lx, lz) + 0.9, pos.y - ahead * 0.6));
        if (pipe) { lx = pos.x; lz = pos.z; ly = pos.y + 0.6; }
        camLook.x += (lx - camLook.x) * k; camLook.z += (lz - camLook.z) * k;
        camLook.y += (ly - camLook.y) * ease(5, dt);
        camera.position.copy(camPos);
        // Tempo spüren: bei hoher Fahrt leichtes Rütteln, weiterer Bildwinkel, die Kamera legt sich mit in die Kurve
        const fast = clamp((v - 9) / 12, 0, 1);
        if (fast > 0 && !air) { camera.position.x += (Math.random() - 0.5) * 0.035 * fast; camera.position.y += (Math.random() - 0.5) * 0.035 * fast; }
        camera.lookAt(camLook);
        camRoll += (-steerS * Math.min(0.16, v * 0.012) - camRoll) * ease(4, dt);
        camera.rotateZ(camRoll);
        const fov = fov0 + clamp(v / 20, 0, 1) * 15 + tuckS * 3;
        if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * ease(3, dt); camera.updateProjectionMatrix(); }
    };

    return {
        active: () => on,
        /** Kabine, in der der Spieler gerade sitzt (die Szene blendet darin die Mitfahrer aus). */
        cabinCar: () => (on && ride && ride.inside && ride.car && ride.car.along < 0.97 ? ride.car : null),   // kurz vor dem Ausstieg sind alle wieder zu sehen
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
            // Figur im gewählten Outfit (Garderobe im Hauptmenü)
            if (!mesh || meshOutfit !== selectionKey()) { meshOutfit = selectionKey(); mesh = makePlayerSkier(); }
            resetPose();
            place(x, z, 0); th = camTh = fallLine(x, z);
            const dx = Math.sin(th), dz = Math.cos(th);
            camPos.set(x - dx * 5, pos.y + 2.4, z - dz * 5); camLook.set(x + dx * 5, pos.y + 0.8, z + dz * 5);
            pos.y += 4.5; air = true; vy = 0;             // fallen lassen
            scene.add(mesh); scene.add(dust); scene.add(tow); scene.add(trail); tow.visible = false; clearDust(); clearTrail(); fov0 = camera.fov; camRoll = 0;
            on = true; ride = null; offer = null; hutOffer = null; rest = null; jump = null; race = null; curRun = null; crashT = 0; score = 0; hintT = 0; bumpT = 0; emitT = 0;
            sound.start();
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
                if (e.pointerType !== 'mouse' && !ride && !rest) input.tuck = true;
            }, sig);
            window.addEventListener('pointermove', (e) => {
                const h = held.get(e.pointerId);
                if (!h) return;
                if ((ride && ride.car) || rest) {
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
            on = false; ride = null; offer = null; rest = null; race = null;
            sound.stop();
            ac?.abort(); ac = null; keys.clear();
            resetPose();
            camera.near = NEAR0; camera.fov = fov0; camera.updateProjectionMatrix(); cabinIn.removeFromParent();
            scene.remove(mesh); scene.remove(trail); scene.remove(dust); scene.remove(tow);
            emit();
            return { x: pos.x, z: pos.z };
        },
        /** Eingaben der Knöpfe im HUD (Finger). */
        setInput(part) { Object.assign(input, part); },
        /** Einkehren an der Hütte in Reichweite bzw. von dort weiterfahren. */
        toggleHut() {
            if (!on || ride) return false;
            if (rest) { rest = null; mesh.userData.setCarry(false); lookYaw = 0; lookPitch = 0; emitT = 0; return true; }
            if (!hutOffer) return false;
            rest = { name: hutOffer.name, a: th + Math.PI };       // zuerst der Blick von vorn auf die Figur – und ins Tal dahinter
            v = 0; lookYaw = 0; lookPitch = 0; race = null;
            mesh.userData.setCarry(true);
            emitT = 0;
            return true;
        },
        setSound(v2) { sound.setWanted(v2); emitT = 0; },
        /** In den angebotenen Lift steigen und nach oben fahren. */
        takeLift() {
            if (!on || ride || rest || !offer) return false;
            const r = offer;
            const ax = toW(r.bottom.gx), az = toW(r.bottom.gy), bx = toW(r.top.gx), bz = toW(r.top.gy);
            const ground = GROUND_LIFTS.includes(r.liftKind);
            const m = r.model && r.model.seatPos && r.model.carriers && r.model.carriers.length ? r.model : null;
            ride = { route: r, model: m, car: null, wait: 0, ground, inside: false, chair: String(r.liftKind || '').startsWith('chair'),
                t: 0, ax, az, bx, bz, h: ground ? 0 : 3.4, dur: clamp(Math.hypot(bx - ax, bz - az) / 9, 4, 16) };
            offer = null; walking = false; striding = false; mesh.userData.setCarry(false);
            th = Math.atan2(bx - ax, bz - az);
            clearDust(); hintT = 0; trGap = true; curRun = null; crashT = 0;
            emitT = 0;
            return true;
        },
        step(dt, t) {
            if (!on) return;
            let s = 0;
            if (rest) { v = 0; stepDust(dt, 0, 0); }
            else if (ride) stepRide(dt); else s = stepSki(dt, readInput());
            sound.update({ v, carve: Math.abs(steerS) + brakeS, air, snow: !walking, ride: !!ride, cabin: !!(ride && ride.inside) });
            poseSkier(t, s, dt);
            mesh.userData.setWind(ride || rest ? 0 : v / 16, t);       // Kleidung flattert im Fahrtwind
            stepCamera(dt);
            hintT -= dt; emitT -= dt;
            if (emitT <= 0) { emitT = 0.15; emit(); }
        },
        /** Nur für Prüfungen beim Entwickeln. */
        __state: () => ({ x: pos.x, y: pos.y, z: pos.z, th, v, air, score, crash: crashT > 0, trick: !!jump, ride: !!ride, offer: !!offer, hint: hintT > 0 ? hint : '', ahead: blockedAt(pos.x + Math.sin(th), pos.z + Math.cos(th)), forest: isForest(pos.x, pos.z) }),
        /** Abstand Kamera–Figur (für den Dunst). */
        viewDist: () => 8,
        dispose() { sound.dispose(); dustTex.dispose(); ac?.abort(); if (mesh) scene.remove(mesh); scene.remove(dust); scene.remove(tow); camera.near = NEAR0; on = false; }
    };
}
