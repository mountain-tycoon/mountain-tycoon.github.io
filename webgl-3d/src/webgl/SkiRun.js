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
import { selectionKey, composeOutfit } from './SkiOutfits.js';
import { createSkiSound } from './SkiSound.js';
import { makeCanopy } from './Paraglider3D.js';
import { canopyColors } from './SkiOutfits.js';

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
 *   loipeAt(wx, wz)     liegt hier eine Loipe?
 *   loipeTrack(wx, wz)  nächster Punkt der Loipenachse: { ang, x, z, end } (Skating lenkt von selbst)
 *   launches()          Gleitschirm-Startplätze: [{ x, z }]
 *   rinkAt(wx, wz)      Eisbahn an dieser Stelle: { rink, lx, lz, c, s, inside, zone, y } (siehe IceRink3D.js)
 *   ranges()            Biathlon-Schießstände: [{ x, z, obj }] (obj.userData.shoot, siehe Biathlon3D.js)
 *   touch()             Bedienung mit dem Finger? (für die Hinweistexte)
 *   onState(info)       Meldung ans HUD (mehrmals je Sekunde), null = beendet
 */
export function createSkiRun(deps) {
    const { scene, camera, dom, surfaceAt, solidAt, half, tile, lcAt, hasSnowAt, isBuilt, routes } = deps;
    let onState = deps.onState || null;

    let on = false;
    let mesh = null, meshOutfit = '';
    // Kleidung und Ausrüstung richten sich nach der Sportart: Alpin, Langlauf (Loipe, Schießstand),
    // Eishockey (Eisbahn), Gleitschirm. Gewechselt wird, sobald die Figur die Sportart wechselt.
    let sport = 'alpin', sportT = 0;
    const dress = (sp) => {
        const key = sp + ':' + selectionKey(undefined, sp);
        if (mesh && meshOutfit === key) return;
        const old = mesh;
        mesh = makePlayerSkier(composeOutfit(undefined, sp)); meshOutfit = key;
        mesh.scale.setScalar(PLAYER_SCALE);
        if (old) {
            mesh.position.copy(old.position); mesh.rotation.copy(old.rotation); mesh.visible = old.visible;
            if (old.parent) { old.parent.add(mesh); old.removeFromParent(); }
            old.traverse(o => { o.geometry?.dispose?.(); });
        }
    };
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
        const half = draw ? 0.04 + 0.05 * deepS : 0;               // Breite 0 = Lücke (Sprung, zu Fuß); im Tiefschnee eine breite Furche
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
    // Langlauf: auf der Loipe wird aus „vorwärts" der Skatingschritt. Der Puls folgt der Anstrengung
    // (Tempo, Steigung) träge – hinauf in Sekunden, hinunter deutlich langsamer.
    let skating = false, skatePh = 0, nordic = false;
    let pulse = 68, beat = 0;
    const loipeAt = deps.loipeAt || (() => false);
    /** Eigene Einsätze an die Szene melden (zählen für die Levelziele). */
    const achieve = (k, v, max = false) => { if (deps.achieve) deps.achieve(k, v, max); };
    // Skating mit Kraftregler: auf der Loipe lenkt die Figur selbst, der Spieler gibt nur vor, wie viel Kraft
    // er einsetzt (0…1). Viel Kraft = schnell, aber der Puls schießt hoch; wer zu lange im roten Bereich
    // läuft, ist erschöpft und kommt erst nach einer Erholung wieder auf Tempo.
    let autoSk = false, autoFlip = false, autoCool = 0, power = 0, spent = false, spentAcc = 0, powerTip = false;
    // Gleitschirm: Startplatz in Reichweite, laufender Flug, die Kappe über der Figur
    let launchOffer = null, glide = null, canopy = null;
    // Tiefschnee abseits der Piste (0…1 ≙ bis rund 60 cm, je nach Wetter): bremst, macht träge, staubt
    let deepS = 0;
    // Fahrzeuge selbst fahren: Pistenraupe (Garage), Skidoo (Sanitätsstation), Rettungsheli (Klinik).
    // `catOffer` = Fahrzeug in Reichweite { kind, x, z }, `drive` = laufende Fahrt.
    let catOffer = null, drive = null;
    // Walzspur der eigenen Raupe abseits der Pisten: ein breites, geripptes Band – darauf fährt es sich wie auf der Piste
    const CT_N = 420, CT_STEP = 0.8;
    const ctPos = new Float32Array(CT_N * 2 * 3).fill(-1e5), ctUv = new Float32Array(CT_N * 2 * 2);
    const ctGeo = new THREE.BufferGeometry();
    ctGeo.setAttribute('position', new THREE.BufferAttribute(ctPos, 3));
    ctGeo.setAttribute('uv', new THREE.BufferAttribute(ctUv, 2));
    { const idx = []; for (let i = 0; i < CT_N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } ctGeo.setIndex(idx); }
    const ctTex = (() => {                      // Rillen der Walze: feine Streifen längs der Fahrt
        const c = document.createElement('canvas'); c.width = 64; c.height = 8;
        const g = c.getContext('2d');
        for (let x = 0; x < 64; x++) { const k = 232 + Math.round(Math.sin(x / 64 * Math.PI * 2 * 9) * 12); g.fillStyle = `rgb(${k},${k + 3},${k + 8})`; g.fillRect(x, 0, 1, 8); }
        const t2 = new THREE.CanvasTexture(c); t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
        return t2;
    })();
    const catTrail = new THREE.Mesh(ctGeo, new THREE.MeshStandardMaterial({ map: ctTex, roughness: 0.8, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    catTrail.frustumCulled = false; catTrail.receiveShadow = true;
    const ctPts = [];                           // Mittelpunkte der Spur (für „hier ist gewalzt")
    let ctLast = null, ctGap = true, ctLen = 0;
    const stepCatTrail = (draw, width) => {
        if (ctLast && Math.hypot(pos.x - ctLast.x, pos.z - ctLast.z) < CT_STEP) return;
        ctLast = { x: pos.x, z: pos.z };
        ctPos.copyWithin(0, 6); ctUv.copyWithin(0, 4);
        const o = (CT_N - 1) * 6, ou = (CT_N - 1) * 4, rx = Math.cos(th), rz = -Math.sin(th), hw = draw ? width : 0;
        ctLen += CT_STEP;
        for (let k = 0; k < 2; k++) {
            const sgn = k ? 1 : -1, x = pos.x + rx * hw * sgn, z = pos.z + rz * hw * sgn;
            ctPos[o + k * 3] = x; ctPos[o + k * 3 + 1] = surfaceAt(x, z) + 0.07; ctPos[o + k * 3 + 2] = z;
            ctUv[ou + k * 2] = k * Math.max(1, width / 1.4); ctUv[ou + k * 2 + 1] = ctLen * 0.2;
        }
        if (!draw || ctGap) for (let k = 0; k < 6; k++) ctPos[o - 6 + k] = ctPos[o + k];      // nach einer Lücke kein Band quer durchs Bild
        ctGap = !draw;
        if (draw) { ctPts.push({ x: pos.x, z: pos.z, w: width }); if (ctPts.length > CT_N) ctPts.shift(); }
        ctGeo.attributes.position.needsUpdate = true; ctGeo.attributes.uv.needsUpdate = true;
    };
    const onCatTrack = (x, z) => { for (let i = ctPts.length - 1; i >= 0; i--) { const q = ctPts[i]; if (Math.abs(q.x - x) < q.w && Math.abs(q.z - z) < q.w) return true; } return false; };
    // Eisbahn: Schlittschuhlaufen mit kleinem Sprung und Eishockey (Puck führen, aufs Tor schießen)
    const rinkAt = deps.rinkAt || (() => null);
    let ice = false, brakeHeld = false, iceTip = false, boardT = 0;
    // Biathlon: Stand in Reichweite und laufendes Schießen
    let rangeOffer = null;
    let shoot = null;           // { sh, base, ax, ay, shots, hits, t, done, kick }
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
        // … ebenso die Eisbahn samt Vorplatz (die Bande prüft die Fahrlogik selbst)
        // Auf der Loipe ist der Weg frei: sie führt oft dicht an Häusern und durch Ortsränder, deren Bauflächen
        // (nicht die Häuser selbst) sonst im Weg stünden.
        if (isBuilt(Math.round(gx), Math.round(gy)) && !deps.runAt?.(x, z) && !rinkAt(x, z) && !loipeAt(x, z)) return 'building';
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
        if (loipeAt(x, z) || (ctPts.length && onCatTrack(x, z))) return true;
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
                    const name = jump.ice ? `Eissprung ${spinR}°` : [flipR ? (flipR > 1 ? 'Doppelter ' : '') + (jump.flip > 0 ? 'Frontflip' : 'Backflip') : '', spinR ? spinR + '°' : ''].filter(Boolean).join(' ');
                    const pts = Math.round((spinR / 180 * 100 + flipR * 300 + airT * 80) * (jump.pipe ? 1.5 : 1) / 10) * 10;
                    score += pts; achieve('aTricks', pts);
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
            pulse: Math.round(pulse),
            nordic: nordic && !ride && !rest,
            ice: ice && !ride && !rest,
            power: autoSk && !ride && !rest ? power : null,
            spent,
            launch: !ride && !rest && !shoot && !glide && !!launchOffer,
            flying: glide ? { alt: Math.max(0, Math.round(glide.alt * 3.3)),
                wind: glide.wind ? { kmh: Math.round(glide.wind.ws * KMH), gust: glide.wind.gust,
                    from: Math.abs(glide.wind.tail) > Math.abs(glide.wind.side) ? (glide.wind.tail > 0 ? 'Rückenwind' : 'Gegenwind') : (glide.wind.side > 0 ? 'Wind von links' : 'Wind von rechts') } : null } : null,
            powder: !ride && !rest && !shoot && !glide && !drive && deepS > 0.15 ? Math.round(deepS * 12) * 5 : 0,
            cat: !ride && !rest && !shoot && !glide && !drive && catOffer ? catOffer.kind : null,
            driving: drive ? drive.name : null,
            rescue: drive && drive.kind !== 'cat' ? { waiting: (drive.list || []).length, carry: !!drive.carry, saved: drive.saved, guide: drive.guide } : null,
            range: !ride && !rest && !shoot && !!rangeOffer,
            shooting: shoot ? { left: shoot.shots, hits: shoot.hits, done: shoot.done > 0, ring: shoot.ring / (camera.fov * Math.PI / 180), marks: shoot.sh.targets.map(m => !!m.userData.hit) } : null,
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
            tuck: input.tuck || k('w', 'arrowup'),
            // getrennt nach Herkunft: beim Skating sind die Seitentasten am Handy der Kraftregler
            padL: input.left, padR: input.right, keyL: k('a', 'arrowleft'), keyR: k('d', 'arrowright')
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
            jump.spin -= ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * SPIN_RATE * (jump.ice ? 1.5 : 1) * dt;
            if (!jump.ice) jump.flip += ((inp.tuck ? 1 : 0) - (inp.brake ? 1 : 0)) * FLIP_RATE * dt;   // auf dem Eis nur Drehsprünge
        }
        if (autoSk) inp = { ...inp, left: inp.keyL, right: inp.keyR };      // Skating: die Seitentasten lenken nicht
        const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        steerS += (steer - steerS) * ease(5, dt);
        // Kantenwechsel: beim Umsteigen von einer Kurve in die nächste kurz entlasten (hoch), dann tief in den Schwung
        if (Math.sign(steerS) !== edgeSide && Math.abs(steerS) > 0.12) { edgeSide = Math.sign(steerS); if (v > 3) hop = 1; }
        hop = Math.max(0, hop - dt * 3.2);
        tuckS += ((inp.tuck ? 1 : 0) - tuckS) * ease(6, dt);
        brakeS += ((inp.brake ? 1 : 0) - brakeS) * ease(8, dt);
        // Lenken: im Stand auf der Stelle, mit dem Tempo weitere Bögen
        th -= steerS * (1.75 / (1 + v * 0.05)) * (air ? (jump && jump.tricks ? 0 : 0.25) : 1 - 0.35 * deepS) * dt;      // im Tiefschnee dreht der Ski träger
        const dx = Math.sin(th), dz = Math.cos(th);
        const e = 0.6;
        const s = (surfaceAt(pos.x + dx * e, pos.z + dz * e) - surfaceAt(pos.x - dx * e, pos.z - dz * e)) / (2 * e);
        if (!air) {
            const gx = toG(pos.x), gy = toG(pos.z);
            const snow = hasSnowAt(gx, gy), forest = isForest(pos.x, pos.z);
            // Gehen: auf aperer Wiese immer; im Schnee, wenn man steht oder es bergauf geht und
            // „vorwärts" gedrückt ist – so kommt man überall weiter, auch den Hang hinauf.
            // Loipe: „vorwärts" ist der Skatingschritt – in der Ebene zügig, bergauf zäh; bergab läuft der Ski von selbst
            // Tiefschnee: nur abseits von Piste und Loipe – dort liegt, was das Wetter gebracht hat
            const onP = onPisteAt(pos.x, pos.z);
            deepS += ((snow && !onP ? clamp(deps.powder?.() ?? 0, 0, 1) : 0) - deepS) * ease(4, dt);
            nordic = snow && loipeAt(pos.x, pos.z);
            // Auf der Loipe übernimmt die Figur das Lenken, sobald man in Laufrichtung losläuft. Wer selbst
            // lenkt (A / D), steigt aus; wer steht, kann sich frei drehen.
            const trk = (nordic || (autoSk && snow)) && deps.loipeTrack ? deps.loipeTrack(pos.x, pos.z) : null;   // läuft die Selbstlenkung, darf die Figur kurz neben die Spur geraten (Wende)
            autoCool -= dt;
            if (inp.keyL || inp.keyR) { if (autoSk) autoCool = 1.5; autoSk = false; }
            if (!trk) autoSk = false;
            else if (!autoSk && autoCool <= 0 && inp.tuck && !inp.brake) {
                let d = trk.ang - th; d = Math.atan2(Math.sin(d), Math.cos(d));
                autoFlip = Math.abs(d) > Math.PI / 2;
                if (Math.abs(autoFlip ? Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI)) : d) < 1.25) {
                    autoSk = true; power = Math.max(power, 0.35);
                    if (!powerTip) {
                        powerTip = true;
                        say(deps.touch?.() ? 'Loipe: rechte Taste = mehr Kraft · linke = weniger – gelenkt wird von selbst'
                            : 'Loipe: W = mehr Kraft · S = weniger – gelenkt wird von selbst (A / D: selbst lenken)', 5);
                    }
                }
            }
            let skWant;
            if (autoSk) {
                const up = inp.tuck || inp.padR, down = inp.brake || inp.padL;
                power = clamp(power + ((up && !down ? 0.45 : 0) - (down ? 0.75 : 0)) * dt, 0, spent ? 0.22 : 1);
                // am Ende einer offenen Loipe wenden
                if ((trk.end === 1 && !autoFlip) || (trk.end === -1 && autoFlip)) autoFlip = !autoFlip;
                const ang = trk.ang + (autoFlip ? Math.PI : 0);
                let d = Math.atan2(trk.x + Math.sin(ang) * 2.5 - pos.x, trk.z + Math.cos(ang) * 2.5 - pos.z) - th;
                d = Math.atan2(Math.sin(d), Math.cos(d));
                th += clamp(d, -3.4 * dt, 3.4 * dt);
                // in der Wende und in engen Kurven Tempo herausnehmen, sonst trägt es die Figur aus der Spur
                const drive = (power > 0.02 ? 0.35 + 0.95 * power : 0) * (1 - 0.65 * clamp((Math.abs(d) - 0.35) / 0.9, 0, 1));
                skWant = s >= 0 ? 4.2 / (1 + s * 6) * drive : 4.2 * drive + Math.min(4, -s * 18);
                skating = power > 0.02 && s > -0.07;
                if (power <= 0.02 && v < 0.3) autoSk = false;           // steht: wieder frei drehen
            } else {
                skWant = !nordic ? 0 : s >= 0 ? 4.2 / (1 + s * 6) : 4.2 + Math.min(4, -s * 18);
                skating = nordic && inp.tuck && !inp.brake && s < 0.5 && v <= skWant + 0.4;
            }
            const stepping = !skating && !autoSk && inp.tuck && !inp.brake && v < 3.3 && s > -0.07 && s < 1.3;
            walking = !snow;
            // Eisbahn: laufen mit „vorwärts", ausgleiten ohne. „Bremsen" ist am Puck der Schuss, in Fahrt ein
            // kleiner Sprung (links/rechts dreht), im Stand die Bremse.
            const rk = rinkAt(pos.x, pos.z);
            ice = !!(rk && rk.inside);
            if (ice) {
                skating = false; walking = false; striding = false; nordic = false;
                if (inp.tuck && !inp.brake) v += (6.4 - v) * ease(1.0, dt);
                else v *= Math.exp(-(inp.brake && v <= 1.6 ? 6 : 0.3) * dt);
                v -= Math.abs(steerS) * v * 0.22 * dt;
                const hx = dx * rk.c - dz * rk.s, hz = dx * rk.s + dz * rk.c;       // Blickrichtung in Koordinaten der Bahn
                rk.rink.onGoal = (n) => { score += 100; achieve('aGoals', 1); say(`Tor! ${n}. Treffer · +100 Punkte`, 3); sound.thump(0.7); };
                if (inp.brake && !brakeHeld) {
                    if (rk.rink.shoot(rk.lx + hx * 0.3, rk.lz + hz * 0.3, hx, hz, v)) sound.thump(0.35);
                    else if (v > 1.6) { air = true; airT = 0; vy = 3.5; takeOff(); jump.tricks = true; jump.ice = true; }
                } else rk.rink.touch(rk.lx + hx * 0.3, rk.lz + hz * 0.3, hx * v, hz * v);
                if (!iceTip) {
                    iceTip = true;
                    say(deps.touch?.() ? 'Eisbahn: Bild halten = laufen · beide Tasten = Sprung, am Puck = Schuss aufs Tor'
                        : 'Eisbahn: W laufen · S = Sprung (A / D dreht), am Puck = Schuss aufs Tor', 5);
                }
            } else if (skating) {
                v += (skWant - v) * ease(1.4, dt);
                striding = false;
            } else if (walking || stepping) {
                const want = stepping || (walking && inp.tuck && !inp.brake) ? 2.9 / (1 + Math.max(0, s) * 1.2) / (1 + deepS * 0.8) : 0;      // durch tiefen Schnee stapft es sich mühsam
                v += (want - v) * ease(v > want ? 3.5 : 5, dt);
                striding = want > 0;
                if (walking && bumpT <= 0) { say(deps.touch?.() ? 'Kein Schnee – Bild gedrückt halten, dann geht es zu Fuß weiter' : 'Kein Schnee – mit W geht es zu Fuß weiter'); bumpT = 12; }
            } else {
                striding = false;
                let a = -G * s / Math.sqrt(1 + s * s);
                // Reibung: Piste gleitet, Tiefschnee bremst, im Wald erst recht
                const mu = forest ? 0.32 : onP ? 0.035 : 0.07 + deepS * 0.1;      // abseits: je tiefer der Neuschnee, desto mehr bremst er
                const drag = (0.0135 - 0.007 * tuckS) * v * v + Math.abs(steerS) * v * 0.09 + brakeS * (6 + v * 0.5);
                if (v > 0.01) a -= mu * G + drag;
                else if (!inp.tuck || a < mu * G) a = 0;         // wer steht, bleibt stehen (Kanten quer) – los geht es erst mit „vorwärts"
                if (inp.tuck && v < 3.4) a += 3.2;               // bergab anschieben mit den Stöcken
                if (curRun && curRun.type === 'halfpipe' && v > 1) a += 1.7 * (1 - brakeS);   // Schwung holen in der Rinne: so trägt es bis über die Kante
                v = clamp(v + a * dt, 0, V_MAX);
            }
            if (snow && !walking && !ice && v > 0.5) achieve(nordic ? 'aLoipe' : 'aSki', v * dt * 3.3);      // gefahrene Meter
            // Schneestaub: mit dem Tempo mehr, in der Kurve und beim Bremsen eine Fahne
            const spray = snow && !ice && !walking && !striding && !skating && v > 1.5 ? (v * 8 + (Math.abs(steerS) * 14 + brakeS * 18) * v) * (1 + 2.5 * deepS) : 0;
            stepDust(dt, Math.min(260, spray), steerS * Math.min(1, v / 6));
        } else { stepDust(dt, 0, 0); skating = false; autoSk = false; }
        bumpT -= dt; boardT -= dt; brakeHeld = inp.brake;
        if (mesh.userData.carrying !== walking) mesh.userData.setCarry(walking);
        if (mesh.userData.onIce !== ice) mesh.userData.setIce(ice);
        // Weiterfahren, sofern nichts im Weg steht
        // v ist das Tempo entlang der Schneeoberfläche: am Steilhang (Halfpipe-Wand) geht davon wenig in die Waagerechte
        if (!air) hCos = 1 / Math.sqrt(1 + s * s);
        let nx = pos.x + dx * v * hCos * dt, nz = pos.z + dz * v * hCos * dt;
        if (air && jump && jump.pipe) {                     // über der Pipe-Kante: zurück in die Wand und ein Stück die Rinne hinunter
            nx += (jump.pipe.ix * 2.5 + jump.pipe.ax * 2.6) * dt; nz += (jump.pipe.iz * 2.5 + jump.pipe.az * 2.6) * dt;
        }
        // Bande der Eisbahn: aufs Eis und herunter geht es nur durch den Eingang vorn in der Mitte
        let board = false;
        if (v > 0) {
            const ra = rinkAt(pos.x, pos.z), rb = rinkAt(nx, nz);
            const inA = !!(ra && ra.inside), inB = !!(rb && rb.inside);
            if (inA !== inB) {
                const q = inA ? rb || ra : ra || rb, R = q.rink;          // der Punkt außerhalb der Eisfläche
                if (!(Math.abs(q.lx) < R.gate - 0.15 && q.lz > 0)) {
                    board = true;
                    // an der Bande abprallen: Fahrtrichtung spiegeln
                    let hx = dx * q.c - dz * q.s, hz = dx * q.s + dz * q.c;
                    if (Math.abs(q.lx) >= R.hw - 0.12) hx = -hx; else hz = -hz;
                    th = Math.atan2(hx * q.c + hz * q.s, -hx * q.s + hz * q.c);
                    v *= inA ? 0.45 : 0;
                    if (boardT <= 0) { boardT = 6; say(inA ? 'Bande – hinaus geht es durch den Eingang bei den Bänken' : 'Bande – der Eingang ist vorn in der Mitte bei den Bänken', 2.6); if (inA) sound.thump(0.3); }
                }
            }
        }
        const why = board ? null : v > 0 ? blockedAt(nx, nz) : null;
        if (board) { /* bleibt stehen bzw. prallt ab */ }
        else if (why && !blockedAt(pos.x, pos.z)) {
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
        catOffer = null;
        if (v < 3) {
            let bd = 11;
            if (deps.cat) for (const r of deps.cat.garages()) { const d = Math.hypot(r.x - pos.x, r.z - pos.z); if (d < bd) { bd = d; catOffer = { kind: 'cat', x: r.x, z: r.z }; } }
            if (deps.rescue) for (const r of deps.rescue.stations()) { const d = Math.hypot(r.x - pos.x, r.z - pos.z) - (r.kind === 'heli' ? 4 : 0); if (d < bd) { bd = d; catOffer = { kind: r.kind, x: r.x, z: r.z }; } }
        }
        launchOffer = null;
        if (v < 5.5 && deps.launches) {
            let bd = 9;
            for (const r of deps.launches()) { const d = Math.hypot(r.x - pos.x, r.z - pos.z); if (d < bd) { bd = d; launchOffer = r; } }
        }
        // Schießstand in Reichweite? (Der Stand selbst ist Baufläche – man steht davor.)
        rangeOffer = null;
        if (v < 5.5 && deps.ranges) {             // auch aus dem Skatingschritt heraus: man läuft an den Stand heran
            let bd = 15;
            for (const r of deps.ranges()) { const d = Math.hypot(r.x - pos.x, r.z - pos.z); if (d < bd) { bd = d; rangeOffer = r; } }
        }
        stepTrail(!air && !walking && !ice && hasSnowAt(toG(pos.x), toG(pos.z)));
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

    /** Puls: folgt der Anstrengung – Skating bergauf treibt ihn hoch, Abfahren kaum, Stehen beruhigt. */
    const stepPulse = (dt, s) => {
        let want = 64;
        if (shoot || rest || ride) want = 62;
        else if (glide) want = 88;
        else if (ice) want = 84 + v * 6;
        else if (skating) want = autoSk ? 78 + power * 104 + Math.max(0, s) * power * 420 : 104 + v * 6 + Math.max(0, s) * 420;
        else if (striding || (walking && v > 0.3)) want = 94 + Math.max(0, s) * 160;
        else if (v > 1) want = 72 + v * 1.5 + (Math.abs(steerS) + brakeS) * v * 1.4 + (air ? 8 : 0);
        want = clamp(want, 58, 190);
        pulse += (want - pulse) * ease(want > pulse ? 0.17 : shoot ? 0.045 : 0.06, dt);
        beat += dt * pulse / 60;
        // Erschöpfung: ein paar Sekunden im roten Bereich, dann ist die Luft raus – bis der Puls wieder unten ist
        spentAcc = pulse > 168 ? spentAcc + dt / 5 : Math.max(0, spentAcc - dt / 10);
        if (!spent && spentAcc >= 1) { spent = true; say('Erschöpft – Kraft raus und den Puls herunterkommen lassen', 3.5); }
        if (spent && pulse < 128) { spent = false; spentAcc = 0; }
    };
    /** Rettung: Verletzte in der Nähe aufnehmen, an der eigenen Station abliefern. */
    const stepRescue = (dt) => {
        const d = drive, R = deps.rescue, slow = Math.abs(v) < 2.6;
        d.scan -= dt;
        if (d.scan <= 0) { d.scan = 0.4; d.list = R.waiting(); }
        let goal = null;
        if (d.carry) {
            goal = d.home;
            if (slow && Math.hypot(d.home.x - pos.x, d.home.z - pos.z) < (d.kind === 'heli' ? 10 : 8)) {
                R.deliver(d.carry); d.carry = null; d.saved++; score += 150;
                if (d.mesh.userData.patient) d.mesh.userData.patient.visible = false;
                if (d.mesh.userData.victim) { d.mesh.userData.victim.visible = false; d.mesh.userData.setWinch(0.05); }
                say('Abgeliefert – gut gemacht! +350 € · +150 Punkte', 3.5); sound.thump(0.3); d.scan = 0;
            }
        } else {
            let bd = Infinity;
            for (const q of d.list || []) { const dd = Math.hypot(q.x - pos.x, q.z - pos.z); if (dd < bd) { bd = dd; goal = q; } }
            if (goal && slow && bd < (d.kind === 'heli' ? 5.5 : 3.2) && R.pickup(goal.g)) {
                d.carry = goal.g; d.scan = 0;
                if (d.mesh.userData.patient) d.mesh.userData.patient.visible = true;
                if (d.mesh.userData.victim) { d.mesh.userData.victim.visible = true; d.mesh.userData.setWinch(Math.max(0.3, d.alt * 0.5)); }
                say('Verletzter an Bord – zurück zur Station', 3.5);
                goal = d.home;
            }
        }
        // Wegweiser fürs HUD: Entfernung und Richtung zum Ziel, relativ zur Fahrtrichtung
        if (goal) {
            let a = Math.atan2(goal.x - pos.x, goal.z - pos.z) - th; a = Math.atan2(Math.sin(a), Math.cos(a));
            d.guide = { m: Math.round(Math.hypot(goal.x - pos.x, goal.z - pos.z) * 3.3 / 10) * 10, arrow: ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] };
        } else d.guide = null;
    };
    /**
     * Raupe und Skidoo: „vorwärts" gibt Gas, „bremsen" hält an und fährt dann rückwärts, links/rechts lenkt (die
     * Raupe dreht auch im Stand). Was die Raupe überfährt, ist frisch gewalzt – abseits der Pisten bleibt eine Walzspur.
     */
    const stepCat = (dt, inp, t) => {
        const d = drive, sled = d.kind === 'sled', vmax = d.vmax * (isForest(pos.x, pos.z) ? 0.35 : 1);
        const want = inp.tuck && !inp.brake ? vmax : inp.brake ? (v > 0.3 ? 0 : -vmax * 0.45) : 0;
        v += (want - v) * ease(want === 0 || Math.sign(want) !== Math.sign(v) ? 2.6 : sled ? 1.6 : 1.1, dt);
        const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        steerS += (steer - steerS) * ease(4, dt);
        th -= steerS * (sled ? 1.5 * Math.min(1, Math.abs(v) / 1.5 + 0.25) : 0.85) * (v < -0.1 ? -1 : 1) * dt;
        const dx = Math.sin(th), dz = Math.cos(th);
        const nx = pos.x + dx * v * dt, nz = pos.z + dz * v * dt;
        const why = blockedAt(nx + dx * Math.sign(v || 1) * (sled ? 0.8 : 1.6), nz + dz * Math.sign(v || 1) * (sled ? 0.8 : 1.6));
        if (why && Math.abs(v) > 0.05) {
            if (Math.abs(v) > 1 && bumpT <= 0) { bumpT = 4; say(why === 'water' ? 'Wasser – hier geht es nicht weiter' : why === 'edge' ? 'Ende des Skigebiets' : why === 'rock' ? 'Fels im Weg' : 'Gebäude im Weg'); }
            v = 0;
        } else { pos.x = nx; pos.z = nz; }
        bumpT -= dt;
        pos.y = surfaceAt(pos.x, pos.z); lastGround = pos.y;
        d.mesh.position.set(pos.x, pos.y, pos.z);
        (sled ? deps.rescue : deps.cat).settle(d.mesh, dx, dz);
        if (d.mesh.userData.update) d.mesh.userData.update(t);
        if (d.mesh.userData.setNight) d.mesh.userData.setNight((sled ? deps.rescue : deps.cat).night());
        const snowHere = hasSnowAt(toG(pos.x), toG(pos.z));
        if (sled) stepRescue(dt);
        else {
            // walzen: hinter dem Fahrzeug, in seiner Breite – auf der Piste das Band, abseits eine eigene Spur
            d.acc += dt;
            if (d.acc > 0.12 && Math.abs(v) > 0.4) { d.acc = 0; const n = deps.cat.groom(pos.x - dx * 1.2, pos.z - dz * 1.2, d.width); d.done += n; if (n) achieve('aGroom', n * 1.65); }
            const offPiste = snowHere && Math.abs(v) > 0.3 && !loipeAt(pos.x, pos.z) && !pistes().some(r => { const p = r.path, gx = toG(pos.x), gy = toG(pos.z); for (let i = 0; i < p.length; i += 2) if (Math.hypot(p[i].gx - gx, p[i].gy - gy) < (r.snowW || 3) + 0.5) return true; return false; });
            stepCatTrail(offPiste, d.width * 0.55);
        }
        stepDust(dt, Math.abs(v) > 1 && snowHere ? (sled ? 40 : 22) : 0, 0);
    };
    /**
     * Rettungsheli: „vorwärts" hebt ab und fliegt (Flughöhe hält er selbst), links/rechts dreht, ohne Gas sinkt er
     * und landet. Über einem Verletzten langsam werden – die Winde holt ihn an Bord.
     */
    const stepHeli = (dt, inp, t) => {
        const d = drive, ud = d.mesh.userData;
        const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        steerS += (steer - steerS) * ease(3, dt);
        th -= steerS * 1.25 * dt;
        const gas = inp.tuck && !inp.brake;
        v += ((gas ? d.vmax : 0) - v) * ease(inp.brake ? 2.2 : gas ? 0.8 : 0.9, dt);
        const dx = Math.sin(th), dz = Math.cos(th);
        const nx = pos.x + dx * v * dt, nz = pos.z + dz * v * dt;
        if (Math.abs(nx) > half - 6 || Math.abs(nz) > half - 6) { v = 0; if (bumpT <= 0) { bumpT = 4; say('Ende des Skigebiets'); } } else { pos.x = nx; pos.z = nz; }
        bumpT -= dt;
        // Flughöhe: mit Gas oder in Fahrt oben, sonst sinken und aufsetzen (über Gebäuden und Wasser bleibt er in der Luft)
        const ground = Math.max(solidAt(pos.x, pos.z), surfaceAt(pos.x, pos.z));
        // landen: überall im Freien – und an der eigenen Klinik (dort ist Baufläche, aber der Landeplatz)
        const blk = blockedAt(pos.x, pos.z), canLand = !blk || (blk === 'building' && Math.hypot(d.home.x - pos.x, d.home.z - pos.z) < 13);
        d.base += (ground - d.base) * ease(2.5, dt); if (d.base < ground) d.base = ground;
        const wantAlt = gas || v > 1.4 || !canLand ? 8 : d.carry === null && d.hover > 0 ? 2.2 : 0;
        d.alt += (wantAlt - d.alt) * ease(wantAlt > d.alt ? 1.3 : 0.9, dt);
        pos.y = d.base + d.alt; lastGround = ground;
        d.mesh.position.copy(pos);
        d.mesh.rotation.order = 'YXZ';
        d.mesh.rotation.set(v / d.vmax * 0.2, th, -steerS * 0.22 * Math.min(1, v / 4));
        ud.setRotor(1);
        if (ud.update) ud.update(t, dt);
        if (ud.setNight) ud.setNight(deps.rescue.night());
        stepRescue(dt);
        // über einem Verletzten in Reichweite: tief schweben statt landen (die Winde arbeitet)
        d.hover = !d.carry && d.guide && d.guide.m < 30 ? 1 : 0;
        if (d.alt < 3 && hasSnowAt(toG(pos.x), toG(pos.z))) burstDust(2);
        stepDust(dt, 0, 0);
    };
    /** Gleitschirm: gemächlich ins Tal. Links/rechts lenkt, „vorwärts" = schneller und steiler, Bremsen = langsamer. */
    const stepGlide = (dt, inp) => {
        const q = glide; q.t += dt;
        const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        steerS += (steer - steerS) * ease(3, dt);
        // ----- Manöver -----
        // Wingover: im Takt links–rechts umlenken, der Schirm pendelt immer höher auf
        q.sinceRev += dt;
        if (steer !== 0 && steer !== q.last) {
            if (q.last !== 0) {
                q.wing = q.sinceRev > 0.45 && q.sinceRev < 2.6 ? q.wing + 1 : 1;
                if (q.wing >= 2) { const pts = 40 * q.wing; score += pts; say(`Wingover ×${q.wing} · +${pts} Punkte`, 2.2); }
            }
            q.last = steer; q.sinceRev = 0; q.holdT = 0;
        }
        if (q.sinceRev > 3.2) q.wing = 0;
        q.swing += (Math.min(1, q.wing * 0.3) - q.swing) * ease(1.5, dt);
        // Steilspirale: lange in eine Richtung ziehen – enger, schneller, steil nach unten
        q.holdT = steer !== 0 ? q.holdT + dt : Math.max(0, q.holdT - dt * 2);
        const spir = clamp((q.holdT - 1.4) / 2.2, 0, 1);
        const rate = steerS * (0.95 + spir * 1.9);
        th -= rate * dt;
        if (spir > 0.5) {
            q.turned += Math.abs(rate) * dt;
            if (q.turned >= Math.PI * 2 * (q.rounds + 1)) { q.rounds++; score += 80; say(`Steilspirale · ${q.rounds}. Umdrehung · +80 Punkte`, 2.2); }
        } else { q.turned = 0; q.rounds = 0; }
        q.roll = steerS * (0.5 + 0.45 * q.swing + 0.65 * spir);
        // Looping: mit viel Fahrt kräftig anbremsen – der Pilot schwingt einmal über die Kappe
        if (q.loop === null && inp.brake && !q.brakeHeld && v > 9) {
            if (q.alt > 7) { q.loop = 0; q.lift = 0; } else say('Zu tief für einen Looping', 2);
        }
        q.brakeHeld = inp.brake;
        if (q.loop !== null) {
            q.loop += dt / 1.7 * Math.PI * 2;
            const up = Math.pow(Math.sin(Math.min(q.loop, Math.PI * 2) / 2), 2) * 3;       // Bogen nach oben und zurück
            pos.y += up - q.lift; q.lift = up;
            if (q.loop >= Math.PI * 2) { q.loop = null; v = 6.5; score += 300; achieve('aLoops', 1); say('Looping · +300 Punkte', 3); sound.thump(0.3); }
        }
        const fast = inp.tuck && !inp.brake, slow = inp.brake && q.loop === null;
        v += (7.2 + (fast ? 3 : 0) - (slow ? 2.4 : 0) - v) * ease(1.2, dt);
        // Gleitzahl rund 10: auch über sanftem Gelände kommt man weit ins Tal
        let sink = (q.loop !== null ? 0.4 : 0.72 + (fast ? 0.9 : 0) - (slow ? 0.17 : 0) + Math.abs(steerS) * 0.5) + spir * 2.4;
        if (!q.tip && q.t > 7) { q.tip = true; say('Manöver: lange einlenken = Steilspirale · links–rechts im Takt = Wingover · schnell, dann bremsen = Looping', 6); }
        if (q.t < 4) sink -= 6 * (1 - q.t / 4);                       // beim Start hebt der Schirm die Figur erst an
        // Hangaufwind: wo das Gelände unter der Flugbahn steil abfällt, trägt die Luft – über dem Hang gewinnt
        // man Höhe für Manöver, über dem flachen Talboden geht es hinunter zur Landung
        if (q.alt < 45 && q.loop === null) {
            const fall = (surfaceAt(pos.x, pos.z) - surfaceAt(pos.x + Math.sin(th) * 8, pos.z + Math.cos(th) * 8)) / 8;
            sink -= clamp(fall * 2.0, 0, 0.8) * (1 - spir);        // (der eigentliche Hangaufwind kommt weiter unten vom Wind)
        }
        // Kartenrand: sanft zurück zur Mitte
        if (Math.abs(pos.x) > half - 10 || Math.abs(pos.z) > half - 10) {
            let d = Math.atan2(-pos.x, -pos.z) - th; d = Math.atan2(Math.sin(d), Math.cos(d));
            th += clamp(d, -1.3 * dt, 1.3 * dt);
        }
        // WIND: der Schirm fliegt in der bewegten Luft. Der Wind versetzt ihn über Grund (Rückenwind trägt weit,
        // gegen starken Wind kommt man kaum voran), eine Bö schüttelt ihn, und wo der Wind einen Hang hinaufweht,
        // trägt er – im Lee dahinter geht es abwärts.
        const wd = deps.wind?.();
        if (wd) {
            const ws = wd.strength * 2.3;                                        // Windtempo in Einheiten je Sekunde
            pos.x += wd.x * ws * dt; pos.z += wd.z * ws * dt;
            const e = 5, up = ((surfaceAt(pos.x + wd.x * e, pos.z + wd.z * e) - surfaceAt(pos.x - wd.x * e, pos.z - wd.z * e)) / (2 * e));
            if (q.alt < 60 && q.loop === null) sink -= clamp(up * wd.strength * 3.4, -0.7, 1.3) * (1 - spir);
            const gf = wd.gustF || 0;
            if (gf > 0.05) { q.roll += Math.sin(q.t * 7.3) * 0.22 * gf; sink += Math.sin(q.t * 4.1) * 0.9 * gf; th += Math.sin(q.t * 2.9) * 0.25 * gf * dt; }
            q.wind = { ws, tail: wd.x * Math.sin(th) + wd.z * Math.cos(th), side: wd.x * Math.cos(th) - wd.z * Math.sin(th), gust: gf > 0.3 };
        }
        pos.x += Math.sin(th) * v * dt; pos.z += Math.cos(th) * v * dt; pos.y -= sink * dt;
        const ground = surfaceAt(pos.x, pos.z);
        q.alt = pos.y - ground;
        stepDust(dt, 0, 0);
        if (q.alt <= 0.02 && q.t > 1) {
            // Landung: Schirm fällt zusammen, weiter auf Ski
            pos.y = ground; lastGround = ground; glide = null; air = false; vy = 0; v = Math.min(v, 6); jump = null;
            canopy.visible = false; mesh.userData.setPoles(true);
            squat = 0.6; burstDust(30); sound.thump(0.4); trGap = true; camTh = th;
            if (q.t > 8) achieve('aFlights', 1);
            say('Gelandet – weiter geht es auf Ski', 3);
            emitT = 0;
        }
    };
    const endShoot = () => {
        if (!shoot) return;
        shoot = null; mesh.visible = true;
        camera.near = NEAR0; camera.updateProjectionMatrix();
        const dx = Math.sin(th), dz = Math.cos(th);
        camPos.set(pos.x - dx * 5, pos.y + 2.4, pos.z - dz * 5); camLook.set(pos.x + dx * 5, pos.y + 0.8, pos.z + dz * 5); camTh = th;
        emitT = 0;
    };
    /** Schuss: trifft die Scheibe, auf die das Visier in diesem Augenblick zeigt (samt Wackeln). */
    const fire = () => {
        const q = shoot;
        if (!q || q.done > 0 || q.shots <= 0 || q.cool > 0) return false;
        camera.getWorldDirection(_a);
        let best = -1, bd = Infinity;
        q.pts.forEach((pt, i) => {
            if (q.sh.targets[i].userData.hit) return;
            _b.copy(pt).sub(q.eye);
            const ang = _a.angleTo(_b);
            if (ang < Math.atan(q.sh.radius * 1.08 / _b.length()) && ang < bd) { bd = ang; best = i; }
        });
        q.shots--; q.cool = 0.5; q.kick = 0.022;
        sound.shot(best >= 0);
        if (best >= 0) { q.sh.hit(best); q.hits++; }
        if (q.shots === 0) {
            const miss = 5 - q.hits;
            score += q.hits * 40 + (miss ? 0 : 100); achieve('aBiath', q.hits, true);
            q.done = 3.4;
            say(miss === 0 ? 'Fünf Treffer – fehlerfrei!' : `${q.hits} von 5 Treffern · ${miss} ${miss === 1 ? 'Strafrunde' : 'Strafrunden'}`, 3.4);
        }
        emitT = 0;
        return true;
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
        if (drive) return;                                  // sitzt im Fahrzeug
        if (glide) {
            // am Schirm: Beine leicht angezogen, Hände oben an den Steuerleinen, in der Kurve geneigt
            mesh.position.copy(pos);
            const loopA = glide.loop === null ? 0 : glide.loop;
            mesh.rotation.set(0.1 - loopA, th, glide.roll);
            ud.setPose({ bendL: 0.5, bendR: 0.4, lean: -0.08, armX: -2.5 + steerS * 0.35, armXR: -2.5 - steerS * 0.35, elbow: -0.45, armOut: 0.3 });
            canopy.position.copy(pos); canopy.rotation.order = 'YXZ';
            canopy.rotation.set(Math.sin(t * 0.9) * 0.03 - loopA, th, glide.roll * 1.15);
            return;
        }
        // im Tiefschnee sinkt die Figur ein – mit Tempo schwimmt sie auf
        mesh.position.set(pos.x, pos.y + 0.02 - (air ? 0 : deepS * 0.17 * (1 - 0.55 * Math.min(1, v / 9))), pos.z);
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
        if (rest || shoot) { ud.setPose({ lean: 0.03, armX: 0.05, elbow: -0.2 }); return; }
        if (ice && !air) {
            // Schlittschuhschritt: tief in den Knien, seitlich abstoßen, der Schläger führt vorn am Eis
            skatePh += dt * (v > 0.5 ? 2.4 + v * 0.5 : 0);
            const k = clamp(v / 3, 0, 1) * (readInput().tuck ? 1 : 0.25), sw = Math.sin(skatePh) * k, pl = Math.max(0, sw), pr = Math.max(0, -sw);
            ud.setPose({ bendL: 0.36 + pr * 0.22, bendR: 0.36 + pl * 0.22, swingL: -pl * 0.22, swingR: -pr * 0.22, outL: 0.05 + pl * 0.34, outR: 0.05 + pr * 0.34, splay: 0.5 * k,
                lean: 0.4 + k * 0.1, armX: -0.55, armXR: -0.7, elbow: -0.55, armOut: 0.1, roll: -sw * 0.1 });
            mesh.rotation.z = lean * 0.8;
            return;
        }
        if (skating) {
            // Skatingschritt: abwechselnd seitlich abstoßen, Ski im V, dazu der Doppelstockschub
            skatePh += dt * (2.6 + v * 0.55);
            const sw = Math.sin(skatePh), pl = Math.max(0, sw), pr = Math.max(0, -sw);
            const pol = 0.5 - 0.5 * Math.cos(skatePh * 2);
            ud.setPose({ bendL: 0.3 + pr * 0.25, bendR: 0.3 + pl * 0.25, swingL: -pl * 0.2, swingR: -pr * 0.2, outL: 0.13 + pl * 0.36, outR: 0.13 + pr * 0.36, splay: 0.9,     // Grundstand breit, sonst kreuzen sich die Skienden
                lean: 0.42 + pol * 0.2, armX: -1.0 + pol * 1.5, elbow: -0.55 + pol * 0.35, armOut: 0.16, pole: 0.5 + pol * 0.7, roll: -sw * 0.12 });
            // der Körper pendelt über das jeweilige Gleitbein
            const sway = -sw * 0.11;
            mesh.position.x += Math.cos(th) * sway; mesh.position.z -= Math.sin(th) * sway;
            mesh.rotation.y = th + Math.cos(skatePh) * 0.07;
            return;
        }
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
        if (drive) {
            // Fahrzeug: Kamera dahinter – bei der Raupe hoch (man sieht die gewalzte Bahn), beim Skidoo dicht, beim Heli weit
            let d = th - camTh; d = Math.atan2(Math.sin(d), Math.cos(d));
            camTh += d * ease(2, dt);
            const kind = drive.kind, cx = Math.sin(camTh), cz = Math.cos(camTh), k = ease(5, dt);
            const back = kind === 'heli' ? 13 : kind === 'sled' ? 6 : 8.5 + drive.width, up = kind === 'heli' ? 4.5 : kind === 'sled' ? 2.6 : 4.4;
            const wx = pos.x - cx * back, wz = pos.z - cz * back;
            camPos.x += (wx - camPos.x) * k; camPos.z += (wz - camPos.z) * k;
            camPos.y += (Math.max(pos.y + up, solidAt(wx, wz) + 1.6) - camPos.y) * k;
            camLook.lerp(_a.set(pos.x + cx * 3, pos.y + (kind === 'heli' ? 0.4 : 1.0), pos.z + cz * 3), k);
            camera.position.copy(camPos); camera.lookAt(camLook);
            if (Math.abs(fov0 - camera.fov) > 0.05) { camera.fov += (fov0 - camera.fov) * ease(3, dt); camera.updateProjectionMatrix(); }
            return;
        }
        if (glide) {
            // Flug: die Kamera hängt weiter hinten und höher, damit die Kappe im Bild ist
            let d = th - camTh; d = Math.atan2(Math.sin(d), Math.cos(d));
            camTh += d * ease(1.8, dt);
            const cx = Math.sin(camTh), cz = Math.cos(camTh), k = ease(4, dt);
            const wx = pos.x - cx * 9, wz = pos.z - cz * 9;
            camPos.x += (wx - camPos.x) * k; camPos.z += (wz - camPos.z) * k;
            camPos.y += (Math.max(pos.y + 3.4, solidAt(wx, wz) + 1.5) - camPos.y) * k;
            camLook.lerp(_a.set(pos.x + cx * 4, pos.y + 1.2, pos.z + cz * 4), k);
            camera.position.copy(camPos); camera.lookAt(camLook);
            camRoll += (-steerS * 0.1 - camRoll) * ease(3, dt); camera.rotateZ(camRoll);
            const fov = fov0 + 6;
            if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * ease(3, dt); camera.updateProjectionMatrix(); }
            return;
        }
        if (shoot) {
            // Schießstand: Blick durchs Visier. Das ganze Bild schwankt – mit hohem Puls stärker,
            // dazu der Herzschlag als kurzer Ruck und der Atem als langsames Heben.
            const q = shoot, T = q.t;
            const amp = 0.0022 + 0.03 * Math.pow(clamp((pulse - 66) / 110, 0, 1), 1.4);
            const thump = Math.exp(-7 * (beat % 1));
            const wx = amp * (0.62 * Math.sin(T * 1.9 + 1) + 0.38 * Math.sin(T * 3.3)) + thump * amp * 0.35 * Math.sin(beat * 2.4);
            const wy = amp * (0.6 * Math.sin(T * 1.35) + 0.4 * Math.sin(T * 2.9 + 2)) + 0.004 * Math.sin(T * 1.6) + thump * amp * 0.6 + q.kick;
            q.kick *= Math.exp(-9 * dt);
            camera.position.copy(q.eye);
            _e.set(q.pitch + q.ay + wy, q.yaw + Math.PI + q.ax + wx, 0);
            camera.quaternion.setFromEuler(_e);
            // im Hochformat weiter, damit alle fünf Scheiben ins Bild passen
            const fov = clamp(16 / Math.min(1, camera.aspect * 0.8), 16, 32);
            if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * ease(6, dt); camera.updateProjectionMatrix(); }
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
            sport = deps.loipeAt?.(x, z) ? 'nordic' : 'alpin'; sportT = 0;
            dress(sport);
            resetPose();
            place(x, z, 0); th = camTh = deps.loipeDir?.(x, z) ?? fallLine(x, z);       // auf der Loipe gleich in Laufrichtung
            const dx = Math.sin(th), dz = Math.cos(th);
            camPos.set(x - dx * 5, pos.y + 2.4, z - dz * 5); camLook.set(x + dx * 5, pos.y + 0.8, z + dz * 5);
            pos.y += 4.5; air = true; vy = 0;             // fallen lassen
            scene.add(mesh); scene.add(dust); scene.add(tow); scene.add(trail); tow.visible = false; clearDust(); clearTrail(); fov0 = camera.fov; camRoll = 0;
            on = true; ride = null; offer = null; hutOffer = null; rest = null; shoot = null; rangeOffer = null; pulse = 68; skating = false; nordic = false; ice = false; iceTip = false; brakeHeld = false; autoSk = false; power = 0; spent = false; spentAcc = 0; powerTip = false; glide = null; launchOffer = null; jump = null; race = null; curRun = null; crashT = 0; score = 0; hintT = 0; bumpT = 0; emitT = 0;
            sound.start();
            keys.clear(); Object.assign(input, { left: false, right: false, brake: false, tuck: false });
            ac = new AbortController();
            const sig = { signal: ac.signal };
            const typing = (e) => /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
            window.addEventListener('keydown', (e) => {
                if (typing(e)) return;
                const k = e.key.toLowerCase();
                if (shoot && (k === ' ' || k === 'enter')) { if (!e.repeat) fire(); e.preventDefault(); return; }
                if (['a', 'd', 'w', 's', ' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) { keys.add(k); e.preventDefault(); }
            }, sig);
            window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), sig);
            window.addEventListener('blur', () => { keys.clear(); held.clear(); input.tuck = false; }, sig);
            // Zeichenfläche: in der Kabine ziehen = umsehen; sonst gedrückt halten = Schuss bzw. gehen (Finger)
            const held = new Map();
            const release = (e) => { if (held.delete(e.pointerId) && !held.size) input.tuck = false; };
            dom.addEventListener('pointerdown', (e) => {
                held.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (e.pointerType !== 'mouse' && !ride && !rest && !shoot) input.tuck = true;
            }, sig);
            window.addEventListener('pointermove', (e) => {
                const h = held.get(e.pointerId);
                if (!h) return;
                if ((ride && ride.car) || rest) {
                    lookYaw += (e.clientX - h.x) * 0.006;
                    lookPitch = clamp(lookPitch + (e.clientY - h.y) * 0.005, -1.1, 0.9);
                }
                if (shoot && !shoot.done) {
                    // Zielen: das Visier folgt der Bewegung, etwas untersetzt für feine Korrekturen
                    const k = camera.fov * Math.PI / 180 / Math.max(200, dom.clientHeight) * 0.8;
                    shoot.ax = clamp(shoot.ax - (e.clientX - h.x) * k, -0.3, 0.3);
                    shoot.ay = clamp(shoot.ay - (e.clientY - h.y) * k, -0.15, 0.15);
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
            endShoot();
            if (drive) {
                if (drive.carry) deps.rescue.drop(drive.carry);
                if (drive.kind !== 'cat') deps.rescue.active(false);
                scene.remove(drive.mesh); drive = null;
            }
            scene.remove(catTrail); ctPts.length = 0; ctPos.fill(-1e5); ctLast = null; ctGap = true;
            if (canopy) scene.remove(canopy);
            glide = null; mesh.userData.setPoles(true);
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
        /** Am Schießstand in Reichweite anlegen bzw. das Schießen beenden. */
        toggleShoot() {
            if (!on || ride || rest) return false;
            if (shoot) { endShoot(); return true; }
            if (!rangeOffer) return false;
            const obj = rangeOffer.obj, sh = obj.userData.shoot;
            sh.reset();
            obj.updateWorldMatrix(true, true);
            const eye = sh.fire.clone(); eye.y += 0.95; obj.localToWorld(eye);
            const pts = sh.targets.map(m => m.getWorldPosition(new THREE.Vector3()));
            const d = pts[2].clone().sub(eye);
            // das Visier steht anfangs neben den Scheiben: erst einrichten, dann schießen
            shoot = { sh, eye, pts, yaw: Math.atan2(d.x, d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)),
                ring: 2 * Math.atan(sh.radius / d.length()) * 1.3,       // Diopterring: etwas größer als die Scheibe
                ax: (Math.random() - 0.5) * 0.05, ay: 0.035, shots: 5, hits: 0, t: Math.random() * 10, done: 0, cool: 0.4, kick: 0 };
            v = 0; race = null; input.tuck = false; mesh.visible = false; skating = false; striding = false;
            camera.near = 0.05; camera.updateProjectionMatrix();
            say(deps.touch?.() ? 'Bild ziehen = zielen · „Schuss" löst aus · ruhiger Puls, ruhiges Visier'
                : 'Mit gedrückter Maus zielen · Leertaste = Schuss · ruhiger Puls, ruhiges Visier', 5);
            emitT = 0;
            return true;
        },
        fire,
        /** In das Fahrzeug in Reichweite steigen (Raupe, Skidoo, Heli) bzw. wieder aussteigen. */
        toggleCat() {
            if (!on || ride || rest || shoot || glide) return false;
            if (drive) {
                if (drive.kind === 'heli' && drive.alt > 0.6) { say('Erst landen: Gas loslassen und aufsetzen lassen', 2.6); return false; }
                // aussteigen: neben das Fahrzeug stellen (es fährt von selbst zurück an seinen Platz)
                const rx = Math.cos(th), rz = -Math.sin(th);
                let spot = null;
                for (const sd of [1, -1]) { const q = { x: pos.x + rx * sd * 2.6, z: pos.z + rz * sd * 2.6 }; if (!blockedAt(q.x, q.z)) { spot = q; break; } }
                const d = drive;
                if (d.carry) { deps.rescue.drop(d.carry); }
                if (d.kind !== 'cat') deps.rescue.active(false);
                scene.remove(d.mesh); drive = null;
                mesh.visible = true;
                if (spot) { pos.x = spot.x; pos.z = spot.z; }
                pos.y = surfaceAt(pos.x, pos.z); lastGround = pos.y; v = 0; steerS = 0; camTh = th;
                say(d.kind === 'cat' ? (d.done > 0 ? 'Ausgestiegen – die Piste ist frisch gewalzt' : 'Ausgestiegen')
                    : d.saved > 0 ? `Ausgestiegen – ${d.saved} ${d.saved === 1 ? 'Verletzter' : 'Verletzte'} versorgt` : 'Ausgestiegen', 2.8);
                emitT = 0;
                return true;
            }
            if (!catOffer) return false;
            const kind = catOffer.kind, src = kind === 'cat' ? deps.cat : deps.rescue;
            const m = kind === 'cat' ? src.make() : src.make(kind), model = m.userData.model || '300';
            scene.add(m); scene.add(catTrail);
            drive = kind === 'cat'
                ? { kind, mesh: m, name: `PistenBully ${model}`, vmax: model === '600' ? 3.6 : model === '500' ? 4.0 : 4.4,
                    width: model === '600' ? 3.4 : model === '500' ? 2.8 : 2.0, acc: 0, done: 0 }
                : { kind, mesh: m, name: kind === 'heli' ? 'Rettungsheli' : 'Skidoo', vmax: kind === 'heli' ? 12 : 7.5, width: 1, acc: 0, done: 0,
                    home: { x: catOffer.x, z: catOffer.z }, carry: null, saved: 0, scan: 0, list: [], guide: null, alt: 0, base: pos.y, hover: 0 };
            if (kind !== 'cat') deps.rescue.active(true);
            v = 0; vy = 0; air = false; jump = null; race = null; crashT = 0; steerS = 0; deepS = 0;
            walking = false; striding = false; skating = false; autoSk = false; ice = false;
            mesh.visible = false; catOffer = null;
            m.visible = true; m.position.copy(pos);
            if (kind !== 'heli') src.settle(m, Math.sin(th), Math.cos(th));
            const T = deps.touch?.();
            say(kind === 'cat' ? (T ? 'Pistenraupe: Bild halten = Gas · Seitentasten lenken · beide = bremsen, dann rückwärts' : 'Pistenraupe: W Gas · A / D lenken · S bremsen, dann rückwärts – was du überfährst, ist frisch gewalzt')
                : kind === 'sled' ? (T ? 'Skidoo: Bild halten = Gas · Seitentasten lenken. Zum Verletzten fahren, langsam werden – dann zurück zur Station' : 'Skidoo: W Gas · A / D lenken · S bremsen. Zum Verletzten fahren, langsam werden – dann zurück zur Station')
                : (T ? 'Heli: Bild halten = abheben und fliegen · Seitentasten drehen. Über dem Verletzten langsam werden – ohne Gas landet er' : 'Heli: W abheben und fliegen · A / D drehen · S bremsen. Über dem Verletzten langsam werden – ohne Gas landet er'), 7);
            emitT = 0;
            return true;
        },
        /** Am Startplatz in Reichweite den Schirm aufziehen und abheben. */
        launchGlider() {
            if (!on || ride || rest || shoot || glide || !launchOffer) return false;
            const L = launchOffer, dir = fallLine(L.x, L.z);
            sport = 'glider'; sportT = 0; dress(sport);
            pos.x = L.x + Math.sin(dir) * 2.4; pos.z = L.z + Math.cos(dir) * 2.4; pos.y = surfaceAt(pos.x, pos.z) + 0.9;
            th = camTh = dir; v = 5.5; vy = 0; air = false; jump = null; race = null; crashT = 0; steerS = 0;
            walking = false; striding = false; skating = false; autoSk = false; ice = false;
            mesh.userData.setCarry(false); mesh.userData.setIce(false); mesh.userData.setPoles(false);
            // Schirm in den gewählten Farben (Garderobe)
            const cols = canopyColors();
            if (!canopy || canopy.userData.key !== cols.join()) { if (canopy) scene.remove(canopy); canopy = makeCanopy(cols); canopy.userData.key = cols.join(); }
            scene.add(canopy); canopy.visible = true;
            glide = { t: 0, alt: 0.9, roll: 0, last: 0, sinceRev: 9, wing: 0, swing: 0, holdT: 0, turned: 0, rounds: 0, loop: null, lift: 0, brakeHeld: false, tip: false };
            camPos.set(pos.x - Math.sin(dir) * 9, pos.y + 3.4, pos.z - Math.cos(dir) * 9); camLook.set(pos.x, pos.y + 1.2, pos.z);
            trGap = true; launchOffer = null;
            say(deps.touch?.() ? 'Gleitschirm: Seitentasten lenken · Bild halten = schneller · beide Tasten = bremsen'
                : 'Gleitschirm: A / D lenken · W schneller und steiler · S bremsen', 5);
            emitT = 0;
            return true;
        },
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
            else if (shoot) {
                v = 0; stepDust(dt, 0, 0);
                shoot.t += dt; shoot.cool -= dt;
                if (shoot.done > 0) { shoot.done -= dt; if (shoot.done <= 0) endShoot(); }
            }
            else if (drive) (drive.kind === 'heli' ? stepHeli : stepCat)(dt, readInput(), t);
            else if (glide) stepGlide(dt, readInput());
            else if (ride) stepRide(dt); else s = stepSki(dt, readInput());
            sound.update({ v, carve: glide ? 0 : Math.abs(steerS) + brakeS, air: air || !!glide, snow: !walking && !drive, ride: !!ride || !!drive, cabin: !!(ride && ride.inside) });
            stepPulse(dt, s);
            // Ausrüstung der Sportart anlegen (kurze Verzögerung, damit sie am Loipenrand nicht hin- und herspringt)
            const wantSport = glide ? 'glider' : ride || drive ? 'alpin' : ice ? 'hockey'
                : (nordic || autoSk || shoot || (sport === 'nordic' && rangeOffer)) ? 'nordic' : 'alpin';
            if (wantSport === sport) sportT = 0;
            else if ((sportT += dt) > (wantSport === 'alpin' ? 2.5 : 0.25)) { sport = wantSport; sportT = 0; dress(sport); }
            poseSkier(t, s, dt);
            mesh.userData.setWind(ride || rest || shoot ? 0 : v / 16, t);       // Kleidung flattert im Fahrtwind
            stepCamera(dt);
            hintT -= dt; emitT -= dt;
            if (emitT <= 0) { emitT = 0.15; emit(); }
        },
        /** Ort der Figur (die Szene richtet den Schatten darauf aus). */
        where: () => pos,
        /** Nur für Prüfungen beim Entwickeln. */
        __state: () => ({ deep: deepS, drive: drive && { groomed: drive.done, name: drive.name, kind: drive.kind, carry: !!drive.carry, saved: drive.saved, alt: drive.alt, guide: drive.guide, waiting: (drive.list || []).length }, catOffer: catOffer && catOffer.kind, track: ctPts.length, wind: glide && glide.wind, sport, power, spent, autoSk, glide: glide && { alt: glide.alt }, launch: !!launchOffer, ice, pulse, skating, nordic, shoot: shoot && { ax: shoot.ax, ay: shoot.ay, shots: shoot.shots, hits: shoot.hits }, range: !!rangeOffer, x: pos.x, y: pos.y, z: pos.z, th, v, air, score, crash: crashT > 0, trick: !!jump, ride: !!ride, offer: !!offer, hint: hintT > 0 ? hint : '', ahead: blockedAt(pos.x + Math.sin(th), pos.z + Math.cos(th)), forest: isForest(pos.x, pos.z) }),
        /** Abstand Kamera–Figur (für den Dunst). */
        viewDist: () => 8,
        dispose() { sound.dispose(); dustTex.dispose(); ac?.abort(); if (mesh) scene.remove(mesh); scene.remove(dust); scene.remove(tow); camera.near = NEAR0; on = false; }
    };
}
