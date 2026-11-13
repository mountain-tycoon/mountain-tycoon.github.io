// ============================================================
// 3D-SZENE (Three.js): freie Orbit-Kamera, Sonne + Schatten,
// echte Seen (aus Wasserkacheln), Fels, Fahrzeuge, Demo-Anlage
// mit gelände-folgender Gondelbahn, animierte Details.
// ============================================================
import * as THREE from 'three';
import { buildTerrainMesh, buildForest, buildRocks, buildGlacier, buildTerrainApron, buildApronForest, buildValleyHaze, buildApronLights, buildEdgeShade, FOREST_MIX_TABLE, snowLayer, apronHeight } from './TerrainMesh.js';
import { prepareWater, buildWater } from './Water3D.js';
import { MATS, makeChalet, makeHotel, makeRestaurant, makeTicketOffice, makeLift, makeChairlift, makeChairlift2, makeChairlift6, makePlatterLift, makeMagicCarpet, makeSurfaceLift, makeAerialTram, makeAerialTramXL, makeGondola8, makeGondola4, makeMegaGondola, makeVillage, makeParking, makeParkingGarage, makeSnowCannon, makeFunpark, makeSummitCross, makeBench, makeSignpost, makeTextSprite, makeFloodlight, findTopPeaks, makeSkiSchool, makeSkiRental, makeShop, makeImbiss, makeBusStop, makeSnowcatGarage, makeToilet, makeRunDressing, makeHalfpipeShell,
    makeHotelClass, HOTEL_BEDS, makeChaletClass, makeGastro, makeMedicalStation, makeHospital, makeWorkshop,
    makeReservoir, makeBigReservoir, makeKicker, makeHalfpipe, makeRaceCourse, makeApresSkiBar, makePartyTent, makeDisco, makeSauna, makeThermalBath, makeIceRink,
    setLevelCountry, setWindGust } from './Buildings3D.js';
import { PEAK_NAMES } from './PeakNames.js';
import { M0 as VMATS, makeCar, makeBus, makeSnowcat, makeSkier, makeSkiInstructor, makePisteMarker, makeWalker, makeAlertMark, makeSadMark, makeRescueSled, makeRescueHeli, makeCargoHeli } from './Vehicles3D.js';
import { makeClouds, makeSkyDome, makeDistantRanges, makeMoon } from './Sky3D.js';
import { planVillageAccess, findPath, smoothPath } from './AccessPlanner.js';
// ===== POSTPROCESSING =====
// Hebt die Bildqualität deutlich: weiches Glühen an hellen Kanten (Schnee,
// Sonne, Lichter), Kantenglättung und ein abschließendes Color-Grading.
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Fels-Optik je Level: Grundfarbe (RGB 0..1), Farbstreuung v, Form.
// dodeca = rundlich, ico = facettiger Granit, octa = scharfkantig/vulkanisch.
// base=Grundfarbe, v=Farbstreuung, shape=Form, size=Größenfaktor, rough=Rauheit(Textur)
const ROCK_STYLES = {
    // base   = Grundfarbe        v     = Farbstreuung (je Stein)
    // size   = Grundgröße        sizeV = Größenstreuung (0 = alle gleich, 1 = extrem)
    // shape  = bevorzugte Form   rough = Rauheit des Materials
    _default:     { base: [0.52,0.54,0.58], v: 0.05, shape: 'dodeca', size: 1.00, sizeV: 0.5, rough: 1.0 },
    // Schwarzwald: kleine, moosige Buntsandstein-Brocken, sehr einheitlich
    mittelgebirge:{ base: [0.46,0.52,0.44], v: 0.09, shape: 'dodeca', size: 0.70, sizeV: 0.35, rough: 1.0 },
    // Tirol: heller Kalk, mittelgroß, mäßig gestreut
    alpen:        { base: [0.70,0.68,0.64], v: 0.11, shape: 'ico',    size: 1.10, sizeV: 0.7, rough: 0.9 },
    // Wallis: große helle Granitblöcke, kühl, stark unterschiedliche Größen
    schweiz:      { base: [0.72,0.73,0.78], v: 0.10, shape: 'ico',    size: 1.45, sizeV: 1.0, rough: 0.85 },
    // Savoyen: dunklerer Schiefergneis, länglich
    frankreich:   { base: [0.54,0.55,0.62], v: 0.12, shape: 'ico',    size: 1.05, sizeV: 0.8, rough: 0.9 },
    // Dolomiten: bleicher, warmer Kalk — sehr große Türme und Trümmer
    italien:      { base: [0.86,0.80,0.70], v: 0.08, shape: 'octa',   size: 1.75, sizeV: 1.1, rough: 0.75 },
    // Fjordland: kühl blaugrauer, rundgeschliffener Gneis
    norwegen:     { base: [0.44,0.52,0.62], v: 0.10, shape: 'dodeca', size: 0.95, sizeV: 0.6, rough: 0.95 },
    // Rockies: kräftig roter Sandstein, kantig, groß
    rockies:      { base: [0.78,0.44,0.30], v: 0.15, shape: 'octa',   size: 1.40, sizeV: 0.9, rough: 1.0 },
    // British Columbia: dunkler Schiefer, flache Platten
    kanada:       { base: [0.40,0.44,0.52], v: 0.12, shape: 'ico',    size: 1.00, sizeV: 0.7, rough: 0.95 },
    // Patagonien: ockerbrauner Granit, riesige Findlinge
    anden:        { base: [0.80,0.58,0.36], v: 0.16, shape: 'octa',   size: 1.70, sizeV: 1.2, rough: 1.0 },
    // Hokkaidō: vulkanisches Gestein, dunkel aber warm, kleine scharfe Brocken
    japan:        { base: [0.40,0.35,0.34], v: 0.13, shape: 'octa',   size: 0.85, sizeV: 0.55, rough: 1.0 }
};

/**
 * Freie Orbit-Kamera. Der Drehpunkt liegt immer auf der Oberfläche und folgt
 * ihr weich; die Kamera selbst bleibt immer ÜBER der Schneedecke. Man kann
 * also weder in den Berg noch unter die Landschaft zoomen, schwenken oder fahren.
 *
 * opts.groundAt(wx, wz)  Höhe der Oberfläche an einem Weltpunkt (Karte + Umland)
 * opts.solidAt(wx, wz)   wie groundAt, zusätzlich mit allem Festen darüber (Felsblöcke)
 * opts.bound             der Drehpunkt bleibt innerhalb ±bound (Kartenrand)
 * opts.maxRadius         so weit darf die Kamera seitlich vom Kartenmittelpunkt weg –
 *                        sie bleibt damit VOR der Bergkulisse und fliegt nicht hindurch
 */
function attachOrbit(camera, dom, target, span = 300, opts = {}) {
    const groundAt = opts.groundAt || null;
    const solidAt = opts.solidAt || groundAt;
    const bound = opts.bound ?? Infinity;
    const maxRadius = opts.maxRadius ?? Infinity;
    let az = Math.PI * 0.25, pol = Math.PI * 0.34, dist = span * 0.8;
    // 1.25 Kartenbreiten reichen für den Überblick über das ganze Gebiet; weiter
    // draußen sähe man nur noch die Karte als Raute und die Kulisse als Ringe.
    const maxDist = span * 1.25, minDist = 12;
    let eff = dist;         // tatsächlich wirksamer Abstand (an der Kulisse gekappt)
    let dragging = false, panning = false, lx = 0, ly = 0;
    const minPol = 0.1, maxPol = Math.PI * 0.485;
    const CLEAR = 1.6;      // so hoch bleibt die Kamera mindestens über der Oberfläche
    const FEEL = 2.4;       // Umkreis, in dem die Oberfläche unter der Kamera abgetastet wird
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // Der Drehpunkt schwebt knapp über dem Boden: nah dran fast auf der Schneedecke,
    // im Überblick etwas höher (ruhigeres Bild).
    const pivotY = () => groundAt(target.x, target.z) + clamp(Math.min(dist, eff) * 0.04, 1.2, span * 0.03);
    // Höchste Stelle der Oberfläche rund um einen Punkt – die Hangseite zählt mit,
    // sonst schneidet die Nahebene am Steilhang in den Schnee.
    const floorAt = (x, z) => {
        let h = solidAt(x, z);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const g = solidAt(x + Math.cos(a) * FEEL, z + Math.sin(a) * FEEL);
            if (g > h) h = g;
        }
        return h;
    };
    const apply = () => {
        if (groundAt) {
            target.x = clamp(target.x, -bound, bound);
            target.z = clamp(target.z, -bound, bound);
        }
        const sp = Math.sin(pol), cp = Math.cos(pol);
        const ux = sp * Math.sin(az), uz = sp * Math.cos(az);      // seitliche Richtung je Abstandseinheit
        eff = dist;
        if (maxRadius < Infinity) {
            // größter Abstand e, bei dem die Kamera noch im Kreis bleibt: |Ziel + e·u| = maxRadius
            const a = ux * ux + uz * uz;
            if (a > 1e-9) {
                const b = target.x * ux + target.z * uz;
                const c = target.x * target.x + target.z * target.z - maxRadius * maxRadius;
                const e = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;
                if (e < eff) eff = Math.max(minDist, e);
            }
        }
        camera.position.set(target.x + eff * ux, target.y + eff * cp, target.z + eff * uz);
        if (groundAt) {
            // Bei der Schneedecke ist Schluss: die Kamera gleitet über die Oberfläche.
            const floor = floorAt(camera.position.x, camera.position.z) + CLEAR;
            if (camera.position.y < floor) camera.position.y = floor;
        }
        camera.lookAt(target);
    };
    if (groundAt) target.y = pivotY();
    // ===== EINGABE =====
    //   Maus   – links ziehen: drehen/kippen · rechts oder Shift: verschieben · Rad: zoomen
    //   Finger – ein Finger: Karte verschieben (sie hängt am Finger)
    //            zwei Finger: spreizen = zoomen, verdrehen = drehen,
    //                         gemeinsam hoch/runter = kippen (wie in einer Karten-App)
    // Alle Lauscher hängen an einem Signal und verschwinden mit dispose() wieder.
    const ac = new AbortController();
    const on = (el, type, fn, o = {}) => el.addEventListener(type, fn, { ...o, signal: ac.signal });
    dom.style.touchAction = 'none';                  // der Browser soll hier nicht selbst zoomen oder scrollen
    // Zoomen geht immer vom wirksamen Abstand aus – sonst müsste man an der Kulisse erst „leer" zurückdrehen.
    const zoomBy = (f) => { dist = clamp(Math.min(dist, eff) * f, minDist, maxDist); };
    // seitlich (rechts +) und in die Tiefe (zur Kamera hin +) verschieben
    const panBy = (side, back) => {
        const fx = Math.sin(az), fz = Math.cos(az);
        target.x += fz * side + fx * back;
        target.z += -fx * side + fz * back;
    };
    const fingers = new Map();                       // pointerId -> {x, y}
    let pinch = null;                                // Zustand der Zwei-Finger-Geste
    const twoFingers = () => {
        const [p, q] = [...fingers.values()];
        return { d: Math.hypot(q.x - p.x, q.y - p.y), a: Math.atan2(q.y - p.y, q.x - p.x), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
    };
    const startPinch = () => { pinch = fingers.size === 2 ? { ...twoFingers(), mode: null, accD: 0, accA: 0, accX: 0, accY: 0 } : null; };
    // ----- Die Karte hängt am Finger -----
    // Der beim Aufsetzen berührte Bodenpunkt bleibt unter dem Finger: dazu wird der
    // Sehstrahl vor und nach der Bewegung mit der waagerechten Ebene in Höhe dieses
    // Punkts geschnitten und der Drehpunkt um die Differenz verschoben. Das stimmt
    // auch bei flachem Blick, wo ein Bildpunkt vorn wenig und hinten viel Strecke ist.
    const _ray = new THREE.Vector3();
    /** Sehstrahl durch einen Bildpunkt: Ursprung o und Richtung d (Länge 1). */
    const rayThrough = (cx, cy) => {
        const r = dom.getBoundingClientRect();
        camera.updateMatrixWorld();
        _ray.set(((cx - r.left) / Math.max(1, r.width)) * 2 - 1, -((cy - r.top) / Math.max(1, r.height)) * 2 + 1, 0.5).unproject(camera);
        const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
        let dx = _ray.x - ox, dy = _ray.y - oy, dz = _ray.z - oz;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        return { ox, oy, oz, dx, dy, dz };
    };
    const groundUnder = (cx, cy, planeY) => {
        const q = rayThrough(cx, cy);
        if (q.dy > -0.06 * Math.hypot(q.dx, q.dz)) return null;    // Strahl läuft (fast) waagerecht oder in den Himmel
        const t = (planeY - q.oy) / q.dy;
        return t > 0 ? { x: q.ox + q.dx * t, z: q.oz + q.dz * t } : null;
    };
    /** Höhe des Bodens unter einem Bildpunkt: der Strahl wandert über das Gelände bis zum Auftreffen. */
    const grabHeight = (cx, cy) => {
        if (!groundAt) return target.y;
        const q = rayThrough(cx, cy);
        const over = (t) => (q.oy + q.dy * t) - groundAt(q.ox + q.dx * t, q.oz + q.dz * t);
        const far = span * 3.2;
        let ta = 0, tb = -1;
        for (let t = 0.8, s = 0.8; t < far; s = 0.8 + t * 0.012, t += s) {      // in der Ferne größere Schritte
            if (over(t) <= 0) { tb = t; break; }
            ta = t;
        }
        if (tb < 0) return target.y;                 // Himmel oder jenseits des Umlands: Höhe des Drehpunkts
        for (let i = 0; i < 10; i++) { const tm = (ta + tb) * 0.5; if (over(tm) > 0) ta = tm; else tb = tm; }
        return q.oy + q.dy * (ta + tb) * 0.5;
    };
    let grabY = 0;                                   // Höhe der Ebene, an der gerade gezogen wird
    // Ersatz, wenn der Strahl den Boden nicht trifft: Weltstrecke je Bildpunkt am Drehpunkt
    const pxWorld = () => 2 * Math.tan(camera.fov * Math.PI / 360) * Math.min(dist, eff) / Math.max(1, dom.clientHeight);
    const dragMap = (x0, y0, x1, y1) => {
        const a = groundUnder(x0, y0, grabY), b = groundUnder(x1, y1, grabY);
        if (a && b) {
            let mx = a.x - b.x, mz = a.z - b.z;
            const m = Math.hypot(mx, mz), cap = Math.min(dist, eff) * 0.4;     // kein Sprung, falls der Finger den Horizont streift
            if (m > cap) { mx *= cap / m; mz *= cap / m; }
            target.x += mx; target.z += mz;
        } else {
            const k = pxWorld();
            panBy(-(x1 - x0) * k, -(y1 - y0) * k / Math.max(0.3, Math.cos(pol)));
        }
    };
    on(dom, 'pointerdown', (e) => {
        if (e.pointerType === 'mouse') {
            if (e.button === 2 || e.shiftKey) panning = true; else dragging = true;
            lx = e.clientX; ly = e.clientY;
            return;
        }
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { dom.setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
        startPinch();
        // Bodenhöhe unter dem Finger bzw. unter der Mitte beider Finger merken
        if (fingers.size === 1) grabY = grabHeight(e.clientX, e.clientY);
        else if (pinch) grabY = grabHeight(pinch.mx, pinch.my);
    });
    on(window, 'pointermove', (e) => {
        if (e.pointerType === 'mouse') {
            const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
            if (dragging) { az -= dx * 0.006; pol = clamp(pol - dy * 0.006, minPol, maxPol); apply(); }
            else if (panning) { panBy(-dx * dist * 0.0016, dy * dist * 0.0016); apply(); }
            return;
        }
        const f = fingers.get(e.pointerId);
        if (!f) return;
        const px = f.x, py = f.y;
        f.x = e.clientX; f.y = e.clientY;
        if (fingers.size === 1) {
            dragMap(px, py, f.x, f.y);
            apply();
        } else if (fingers.size === 2 && pinch) {
            const g = twoFingers();
            let dA = g.a - pinch.a;
            if (dA > Math.PI) dA -= 2 * Math.PI; else if (dA < -Math.PI) dA += 2 * Math.PI;
            const dD = g.d - pinch.d, dX = g.mx - pinch.mx, dY = g.my - pinch.my;
            if (!pinch.mode) {
                // Erst nach ein paar Bildpunkten entscheiden, was gemeint ist – sonst kippt
                // die Kamera bei jedem Zoomen ein Stück mit.
                pinch.accD += dD; pinch.accA += dA; pinch.accX += dX; pinch.accY += dY;
                const zoomish = Math.abs(pinch.accD), turnish = Math.abs(pinch.accA) * g.d * 0.5;
                const slideish = Math.abs(pinch.accX), tiltish = Math.abs(pinch.accY);
                if (Math.max(zoomish, turnish, slideish, tiltish) > 10) {
                    // Beide Finger gemeinsam hoch/runter = kippen; alles andere zoomt, dreht und schiebt.
                    pinch.mode = (tiltish > zoomish * 1.4 && tiltish > turnish * 1.4 && tiltish > slideish * 1.4) ? 'tilt' : 'zoom';
                }
            } else if (pinch.mode === 'zoom') {
                if (g.d > 1 && pinch.d > 1) zoomBy(pinch.d / g.d);
                az += dA;
                apply();
                dragMap(pinch.mx, pinch.my, g.mx, g.my);   // die Karte wandert mit der Fingermitte
                apply();
            } else {
                pol = clamp(pol - dY * 0.006, minPol, maxPol);
                apply();
            }
            pinch.d = g.d; pinch.a = g.a; pinch.mx = g.mx; pinch.my = g.my;
        }
    });
    const release = (e) => {
        if (e.pointerType === 'mouse') { dragging = false; panning = false; return; }
        fingers.delete(e.pointerId);
        startPinch();
        // Ein Finger bleibt liegen: er zieht ab jetzt an dem Punkt weiter, den er gerade berührt
        if (fingers.size === 1) { const [f] = [...fingers.values()]; grabY = grabHeight(f.x, f.y); }
    };
    on(window, 'pointerup', release);
    on(window, 'pointercancel', release);
    on(dom, 'wheel', (e) => { e.preventDefault(); zoomBy(1 + e.deltaY * 0.0011); apply(); }, { passive: false });
    on(dom, 'contextmenu', (e) => e.preventDefault());
    // iOS-Safari kennt zusätzlich eigene Gesten-Ereignisse, die sonst die ganze Seite zoomen
    on(dom, 'gesturestart', (e) => e.preventDefault());
    on(dom, 'gesturechange', (e) => e.preventDefault());
    // Tastatur: Q/E drehen, WASD / Pfeile verschieben (gehalten = gleitend),
    // +/− zoomen. In Eingabefeldern bleibt die Tastatur unangetastet.
    const keys = new Set();
    const inInput = (e) => /input|textarea|select/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
    on(window, 'keydown', (e) => {
        if (inInput(e)) return;
        const k = e.key.toLowerCase();
        if (k==='q'){az-=Math.PI/8;apply();} else if(k==='e'){az+=Math.PI/8;apply();}
        else if (k==='+'||k==='='){ zoomBy(0.85); apply(); }
        else if (k==='-'||k==='_'){ zoomBy(1.18); apply(); }
        else if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
    });
    on(window, 'keyup', (e) => keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => { keys.clear(); fingers.clear(); pinch = null; dragging = false; panning = false; });
    const keyStep = () => {
        if (!keys.size) return;
        const fwd=new THREE.Vector3(Math.sin(az),0,Math.cos(az));
        const right=new THREE.Vector3(fwd.z,0,-fwd.x);
        const v = dist * 0.018;
        if (keys.has('w')||keys.has('arrowup'))    target.addScaledVector(fwd, -v);
        if (keys.has('s')||keys.has('arrowdown'))  target.addScaledVector(fwd,  v);
        if (keys.has('a')||keys.has('arrowleft'))  target.addScaledVector(right,-v);
        if (keys.has('d')||keys.has('arrowright')) target.addScaledVector(right, v);
        apply();
    };
    apply();
    // Weicher Kameraflug zu einem Punkt: Ziel und Abstand werden über
    // mehrere Frames herangezogen, statt hart umzuspringen.
    let glide = null;
    const step = () => {
        keyStep();
        if (glide) {
            glide.t = Math.min(1, glide.t + 0.045);
            const e = glide.t * glide.t * (3 - 2 * glide.t);
            if (groundAt) {
                // nur seitlich fliegen – die Höhe kommt von der Oberfläche (siehe unten)
                target.x = glide.from.x + (glide.to.x - glide.from.x) * e;
                target.z = glide.from.z + (glide.to.z - glide.from.z) * e;
            } else {
                target.lerpVectors(glide.from, glide.to, e);
            }
            dist = glide.d0 + (glide.d1 - glide.d0) * e;
            apply();
            if (glide.t >= 1) glide = null;
        }
        // Drehpunkt weich auf der Oberfläche nachführen (kein Hüpfen beim Schwenken)
        if (groundAt) {
            const d = pivotY() - target.y;
            if (Math.abs(d) > 0.002) { target.y += d * 0.16; apply(); }
        }
    };
    return {
        setDist: (d)=>{ dist=d; if (groundAt) target.y = pivotY(); apply(); },
        /** Alle Lauscher entfernen (beim Verlassen des Levels). */
        dispose: () => ac.abort(),
        /** Abstand Kamera–Drehpunkt, wie er gerade wirklich gilt (für den Dunst). */
        viewDist: () => Math.min(dist, eff),
        // Zustand lesen/setzen – für Prüfungen und spätere Kamerafahrten
        getState: () => ({ az, pol, dist, eff, x: target.x, y: target.y, z: target.z }),
        setState: (s = {}) => {
            if (Number.isFinite(s.az)) az = s.az;
            if (Number.isFinite(s.pol)) pol = clamp(s.pol, minPol, maxPol);
            if (Number.isFinite(s.dist)) dist = clamp(s.dist, minDist, maxDist);
            if (Number.isFinite(s.x)) target.x = s.x;
            if (Number.isFinite(s.z)) target.z = s.z;
            if (groundAt) target.y = pivotY();
            apply();
        },
        step,
        flyTo: (pt, wantDist) => {
            glide = { from: target.clone(), to: pt.clone(), t: 0,
                      d0: dist, d1: wantDist ?? Math.min(dist, span * 0.16) };
        }
    };
}

// Flood-Fill: Seen als Kachel-Listen + mittlere Höhe
function findLakes(landcover, heightmap, gridSize) {
    const seen = new Uint8Array(gridSize*gridSize);
    const lakes = []; const stack = [];
    for (let s=0;s<landcover.length;s++){
        if (landcover[s]!==2||seen[s]) continue;
        let sumZ=0,n=0; const tiles=[]; stack.length=0; stack.push(s); seen[s]=1;
        while(stack.length){
            const idx=stack.pop(); tiles.push(idx); sumZ+=heightmap[idx]; n++;
            for(const j of [idx-1,idx+1,idx-gridSize,idx+gridSize]){
                if(j<0||j>=landcover.length||seen[j])continue;
                if(landcover[j]!==2)continue; seen[j]=1; stack.push(j);
            }
        }
        if (n>=6) lakes.push({ tiles, z: sumZ/n, n });
    }
    return lakes;
}

export function createScene3D(canvas, world, gridSize, theme = {}, level = {}) {
    // Handy oder kleines Tablet? Dort startet die Bildqualität eine Stufe tiefer (siehe „BILDQUALITÄT").
    const smallTouch = (!!window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0)
        && Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 900;
    // Die Kantenglättung des Bildpuffers bringt auf dem Handy nichts (geglättet wird in der
    // Bildaufbereitung), kostet dort aber spürbar Speicher und Zeit.
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !smallTouch });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Heller belichtet: die Grafik soll freundlich und klar wirken, nicht
    // düster. Kontrast und Tiefe kommen aus dem Grading, nicht aus Dunkelheit.
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Reflexionskarte für Verglasung; wird unten befüllt.
    let glassEnv = null;
    let applyGlassEnv = () => {};
    const scene = new THREE.Scene();
    // ===== UMGEBUNGSSPIEGELUNG =====
    // Ohne eine Umgebung bleibt jedes metallische Material schwarz — Metall
    // hat keine eigene Farbe, es spiegelt nur. Hier wird deshalb eine
    // einfache Himmels-/Bodenumgebung erzeugt (Himmelsblau oben, Schneeweiß
    // unten, Sonnenfleck) und als scene.environment gesetzt. Damit spiegeln
    // Liftstützen, Seile, Kabinen und Fahrzeuge plausibel.
    function buildEnvironment(topCol, botCol) {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 128;
        const x = cv.getContext('2d');
        const g = x.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0.00, '#' + topCol.getHexString());
        g.addColorStop(0.48, '#' + botCol.getHexString());
        g.addColorStop(0.52, '#e9eff6');      // Horizont
        g.addColorStop(1.00, '#f4f8fc');      // Schneeboden
        x.fillStyle = g; x.fillRect(0, 0, 256, 128);
        // Sonnenfleck: sorgt für ein bewegtes Glanzlicht auf Metall
        const sg = x.createRadialGradient(72, 34, 2, 72, 34, 30);
        sg.addColorStop(0, 'rgba(255,252,240,1)');
        sg.addColorStop(1, 'rgba(255,252,240,0)');
        x.fillStyle = sg; x.beginPath(); x.arc(72, 34, 30, 0, Math.PI * 2); x.fill();
        const tex = new THREE.CanvasTexture(cv);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    const topC = new THREE.Color(...(theme.skyTop||[80,136,205]).map(c=>c/255));
    const botC = new THREE.Color(...(theme.skyBottom||[178,208,238]).map(c=>c/255));
    scene.background = botC.clone().lerp(topC, 0.45);
    try {
        // WICHTIG: NICHT scene.environment setzen! Das wirkt in three r160 auf
        // JEDES MeshStandardMaterial — Gelände, Schnee, Bäume, Häuser — und
        // überstrahlt die ganze Szene. Die Reflexionskarte wird deshalb
        // GEZIELT nur den metallischen Materialien zugewiesen.
        //
        // Die Equirect-Textur wird DIREKT als envMap gesetzt. Der Umweg über
        // den PMREMGenerator ist nicht nötig und war eine Fehlerquelle: schlägt
        // er fehl, landet alles im catch und Metall bleibt stumpf.
        const envTex = buildEnvironment(topC, botC);
        // Bewusst zurückhaltend: die Spiegelung soll Metall und Glas als
        // Material kenntlich machen, nicht die Szene überstrahlen.
        const shiny = [
            [MATS.metal,      0.60],   // Liftstützen, Seile, Klemmen, Geländer
            [VMATS.metalDark, 0.40],   // Raupen, Skidoo, Helikopter
            [MATS.glass,      0.35],   // Kabinenverglasung
            [MATS.cabinR,     0.55],   // Kabinenlack rot
            [MATS.cabinB,     0.55]    // Kabinenlack blau
        ];
        let applied = 0;
        for (const [mat, inten] of shiny) {
            if (!mat) continue;
            mat.envMap = envTex;
            mat.envMapIntensity = inten;
            mat.needsUpdate = true;
            applied++;
        }
        if (!applied) console.warn('[Scene3D] Keine Metallmaterialien gefunden — keine Spiegelung.');

        // ===== SPIEGELNDE SCHEIBEN AN ALLEN ANLAGEN =====
        // Kabinen, Pendelbahn und Stationshallen erzeugen ihre Verglasung mit
        // EIGENEN Materialinstanzen — die gemeinsame MATS.glass erreicht sie
        // nicht. Jedes neu in die Szene gehängte Objekt wird deshalb einmal
        // durchsucht und alles Glasartige nachgerüstet.
        glassEnv = envTex;
        applyGlassEnv = (root) => {
            if (!glassEnv || !root) return;
            root.traverse(o => {
                const m = o.material;
                if (!m || Array.isArray(m) || m.envMap) return;
                // Glas erkennt man an Transparenz bei geringer Rauheit
                const looksGlass = m.transparent && m.roughness != null && m.roughness < 0.30;
                if (!looksGlass) return;
                m.envMap = glassEnv;
                m.envMapIntensity = 0.35;
                m.metalness = Math.max(m.metalness ?? 0, 0.18);
                m.needsUpdate = true;
            });
        };
    } catch (e) {
        // Nicht verschlucken: ohne Hinweis sucht man den fehlenden Glanz ewig.
        console.warn('[Scene3D] Umgebungsspiegelung konnte nicht aufgebaut werden:', e);
    }
    // Nebel greift erst weiter draußen und läuft sanfter aus — sonst
    // verschluckt er die neue Bergkulisse am Horizont.
    scene.fog = new THREE.Fog(scene.background.clone(), 95, 560);

    const hScale = 0.09, tile = 1;
    const worldSpan = (gridSize-1)*tile;
    const half = worldSpan/2;
    const heightmap = world.heightmap;
    // Seebecken und Bachbetten eingraben – als Erstes, bevor irgendetwas die Höhen liest
    const waterInfo = prepareWater(world, gridSize, { hScale });
    // Bodenfreiheit für alle Figuren: die Sohle liegt knapp ÜBER dem Gelände.
    // Ohne diesen Abstand versinken Gäste je nach Hangneigung im Schnee.
    const GROUND_CLEAR = 0.1;
    // ===== SCHNEE-ZUSTAND (früh deklariert!) =====
    // Diese Werte werden schon im ersten Frame von hasSnowAt() gelesen — sie
    // müssen daher VOR animate() initialisiert sein, sonst gibt es einen
    // "Cannot access before initialization"-Fehler (temporal dead zone).
    const SNOW_BASE = new Float32Array(gridSize * gridSize);   // Kunstschnee 0..1
    const cannons = [];                                        // gebaute Schneekanonen
    const CANNON_ARC = Math.PI / 1.7;                          // Öffnungswinkel des Strahls
    let _maxH = 1;                                             // höchster Punkt der Karte
    for (let i = 0; i < heightmap.length; i++) if (heightmap[i] > _maxH) _maxH = heightmap[i];
    // Normal-Schneegrenze des Levels (Anteil der Gipfelhöhe). Hochalpine Level
    // sind fast durchgehend weiß, Mittelgebirge deutlich empfindlicher.
    // `baseAltitude` steht im terrain-Block des Levels — der frühere Zugriff
    // auf level.baseAltitude lief immer ins Leere und alle Level bekamen
    // denselben Wert.
    const baseAlt = level?.terrain?.baseAltitude ?? level?.baseAltitude ?? 1200;
    // Landesflaggen aller Gebäude richten sich nach dem Level-Land.
    setLevelCountry(level?.country);
    const levelWarm = Math.max(0, Math.min(1, (1600 - baseAlt) / 900));
    // Deutlich TIEFER angesetzt als zuvor: bei normalem Winterwetter soll der
    // Schnee bis ins Tal liegen. Aper wird es erst in den warmen Phasen.
    const SNOWLINE_NORM = 0.03 + levelWarm * 0.14;
    // Wetterphasen: Gewicht (Häufigkeit), Schneefallstärke, Schneegrenze
    // als Faktor auf die Normalgrenze. 0 = alles weiß bis ins Tal.
    const WEATHER_PHASES = [
        // WENN ES SCHNEIT, LIEGT AUCH IM TAL SCHNEE. Beide Schneefall-Phasen
        // drücken die Grenze auf 0 — apere Wiesen gibt es nur in den warmen
        // Phasen, und dort taut es von unten herauf.
        { key: 'heavy', w: 5, snowfall: 1.00, line: 0.00, icon: '🌨️', name: 'Starker Schneefall' },
        { key: 'snow',  w: 6, snowfall: 0.62, line: 0.00, icon: '❄️', name: 'Schneefall' },
        { key: 'light', w: 4, snowfall: 0.30, line: 0.40, icon: '🌥️', name: 'Leichter Schneefall' },
        { key: 'clear', w: 4, snowfall: 0.05, line: 0.85, icon: '🌤️', name: 'Klar & kalt' },
        { key: 'mild',  w: 2, snowfall: 0.00, line: 1.50, icon: '☀️', name: 'Mild' },
        { key: 'warm',  w: 1, snowfall: 0.00, line: 2.30, icon: '🔥', name: 'Föhn — sehr warm' }
    ];
    const weather = {
        phase: WEATHER_PHASES[1],
        next: WEATHER_PHASES[3],        // Vorhersage: was als Nächstes kommt
        snowLine: 0,                    // Saisonstart: frisch geschneit, alles weiß
        target: 0,
        snowfall: 0.62,
        targetFall: 0.62,
        treeLoad: 0.65,                 // Startwetter ist Schneefall -> Kronen tragen schon
        timer: 55                       // Sekunden bis zum nächsten Wetterwechsel
    };
    let _snowLine = _maxH * SNOWLINE_NORM;   // Schneegrenze in Höheneinheiten
    let _lastPaintedLine = -1;               // zuletzt gemalter Stand
    // Zentrale Bebaubarkeits-Prüfung: kein Wasser(2)/Fels(3), nicht felsig-steil.
    const slopeRawAt = (gx, gy) => {
        const x = Math.max(1, Math.min(gridSize - 2, Math.round(gx))), y = Math.max(1, Math.min(gridSize - 2, Math.round(gy)));
        const i = y * gridSize + x, z = heightmap[i];
        return Math.max(Math.abs(z - heightmap[i - 1]), Math.abs(z - heightmap[i + 1]), Math.abs(z - heightmap[i - gridSize]), Math.abs(z - heightmap[i + gridSize]));
    };
    const tileBuildable = (gx, gy) => {
        const x = Math.max(0, Math.min(gridSize - 1, Math.round(gx))), y = Math.max(0, Math.min(gridSize - 1, Math.round(gy)));
        const lc = world.landcover[y * gridSize + x];
        return lc !== 2 && lc !== 3 && slopeRawAt(gx, gy) < 8;
    };
    // Nächstgelegene bebaubare Kachel (Spirale) — für Stationen/Gebäude auf Fels/Wasser.
    const snapToBuildable = (gx, gy) => {
        if (tileBuildable(gx, gy)) return { gx, gy };
        for (let r = 1; r <= 14; r++) {
            for (let a = 0; a < 12; a++) {
                const nx = gx + Math.cos(a / 12 * Math.PI * 2) * r * 1.5, ny = gy + Math.sin(a / 12 * Math.PI * 2) * r * 1.5;
                if (nx > 2 && ny > 2 && nx < gridSize - 2 && ny < gridSize - 2 && tileBuildable(nx, ny)) return { gx: nx, gy: ny };
            }
        }
        return { gx, gy };
    };
    const yAt = (gx, gy) => {
        const x=Math.max(0,Math.min(gridSize-1,Math.round(gx)));
        const y=Math.max(0,Math.min(gridSize-1,Math.round(gy)));
        return (heightmap[y*gridSize+x]||0)*hScale;
    };
    const worldPos = (gx, gy) => new THREE.Vector3(gx*tile-half, yAt(gx,gy), gy*tile-half);
    // bilineare Höhe — glatt zwischen Kacheln (kein Hoppeln)
    const yAtSmooth = (gx, gy) => {
        const x0 = Math.max(0, Math.min(gridSize-2, Math.floor(gx)));
        const y0 = Math.max(0, Math.min(gridSize-2, Math.floor(gy)));
        const tx = Math.max(0, Math.min(1, gx - x0)), ty = Math.max(0, Math.min(1, gy - y0));
        const h00 = heightmap[y0*gridSize+x0], h10 = heightmap[y0*gridSize+x0+1];
        const h01 = heightmap[(y0+1)*gridSize+x0], h11 = heightmap[(y0+1)*gridSize+x0+1];
        return (h00*(1-tx)*(1-ty) + h10*tx*(1-ty) + h01*(1-tx)*ty + h11*tx*ty) * hScale;
    };
    const worldPosSmooth = (gx, gy) => new THREE.Vector3(gx*tile-half, yAtSmooth(gx,gy), gy*tile-half);

    // ===== STRASSEN-NETZ: Autos fahren NUR auf Straßen (Kachel-Graph + Pfadsuche) =====
    const roadTiles = new Set();                       // Set von "gx,gy"
    const roadKey = (gx, gy) => Math.round(gx) + ',' + Math.round(gy);
    const isRoad = (gx, gy) => roadTiles.has(roadKey(gx, gy));
    // ROAD_GRID war das alte, gröbere Snap-Raster. Seit der Umstellung auf
    // echte Kachelparzellen ist die Einheit 1 Kachel — der Wert bleibt nur
    // für ein paar Abstandsrechnungen erhalten.
    const ROAD_GRID = 4;
    /**
     * Ausrichtung eines Bauwerks aufs Raster.
     *
     * Auf einer quadratischen Parzelle darf ein Gebäude nur in 90°-Schritten
     * stehen. Vorher bekamen die Startgebäude beliebige Winkel aus
     * `Math.atan2(...)` — ein Haus stand dann z.B. 37° schräg auf seinem
     * achsenparallelen Grundstück und ragte über die Ecken hinaus. Genau das
     * ließ die Anfangsbebauung unordentlich wirken.
     */
    const snapYaw = (rot) => Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
    // Ganze Kacheln: das gröbere 4er-Raster verschob Straßenknoten um bis zu
    // zwei Kacheln gegen die Parzelle, an die sie anschließen sollten.
    const snapRoad = (v) => Math.round(v);
    // Auto-Route über das Straßennetz (wird bei jedem Straßenbau neu berechnet)
    let carArrivalPath = null, carEntryKey = null, carParkKey = null;
    const nearestRoadTile = (gx, gy) => {              // nächste befahrbare Kachel
        let best = null, bd = 1e9;
        for (const k of roadTiles) { const [x, y] = k.split(',').map(Number); const d = Math.hypot(x - gx, y - gy); if (d < bd) { bd = d; best = k; } }
        return best;
    };
    // BFS auf dem Straßen-Kachelnetz: Pfad von Start zu Ziel (Liste {gx,gy})
    const bfsRoad = (sk, gk) => {
        if (!sk || !gk || !roadTiles.has(sk) || !roadTiles.has(gk)) return null;
        const prev = new Map(); prev.set(sk, null); const q = [sk];
        while (q.length) {
            const cur = q.shift(); if (cur === gk) break;
            const c = cur.indexOf(','); const cx = +cur.slice(0, c), cy = +cur.slice(c + 1);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nk = roadKey(cx + dx, cy + dy);
                if (roadTiles.has(nk) && !prev.has(nk)) { prev.set(nk, cur); q.push(nk); }
            }
        }
        if (!prev.has(gk)) return null;
        const path = []; let c = gk;
        while (c) { const i = c.indexOf(','); path.push({ gx: +c.slice(0, i), gy: +c.slice(i + 1) }); c = prev.get(c); }
        path.reverse();                                 // Start -> Ziel
        // ausdünnen, dann per Catmull-Rom glätten (keine eckigen Kachelpfade)
        const thin = [path[0]];
        for (let i = 3; i < path.length - 1; i += 3) thin.push(path[i]);
        thin.push(path[path.length - 1]);
        if (thin.length < 3) return thin;
        const curve = new THREE.CatmullRomCurve3(thin.map(p => new THREE.Vector3(p.gx, 0, p.gy)));
        const N = Math.max(10, thin.length * 4);
        return curve.getPoints(N).map(vv => ({ gx: vv.x, gy: vv.z }));
    };
    // Parkplätze (Ziele für Autos) + zugehörige Netz-Route
    const parkingLots = [];      // {gx,gy,padY,spots:[{x,z}],cap,occ,ticketPos,roadPath}
    // Aktuelle Auswahl im Infofeld. MUSS früh deklariert sein: animate() liest
    // sie und läuft schon während des Aufbaus — bei einem langen ersten Frame
    // (dt >= 1s) würde die Bindung sonst noch nicht existieren.
    let selectedSel = null;
    let mainTicketPos = null;
    // Anklickbare Objekte fürs Infofeld (Gebäude, Parkplätze ...)
    const selectables = [];      // {type,name,x,z,r,cost,lot?}
    let onSelect = null;
    const addSelectable = (e) => { selectables.push(e); };
    // ALLE Gebäude (initiale wie gebaute) — ein System: abreißbar, zählen in der Sim
    const placedBuildings = [];  // {mesh,cost,rec:{x,z,r},type}
    // Startgebäude, deren Untergrund noch eingeebnet werden muss (siehe place()).
    const pendingFlatten = [];
    const buildingPads = [];     // Standplatten der Gebäude — färben mit dem Boden mit
    // ===== EINFAHRTEN AM KARTENRAND =====
    // Jede Ortszufahrt meldet hier ihre Randkachel an. Ein Parkplatz wird an
    // die Einfahrt angebunden, die ihm zugeordnet ist — nicht an irgendeine.
    const roadEntries = [];         // [{ key, gx, gy }]
    /**
     * Für jeden Parkplatz die Route zur nächsten Einfahrt neu berechnen.
     *
     * Sie darf NICHT die beim Bau geplante Zufahrt überschreiben: die ist
     * bewusst um Hindernisse herumgeführt, während eine reine Kachelsuche
     * gern quer durchs Dorf abkürzt.
     */
    const recomputeCarPath = () => {
        const ziele = roadEntries.filter(e => roadTiles.has(e.key));
        if (carEntryKey && roadTiles.has(carEntryKey)) ziele.push({ key: carEntryKey });
        for (const lot of parkingLots) {
            // ===== FESTE ROUTEN NICHT ÜBERSCHREIBEN =====
            // Die Ortsparkplätze bekommen ihre Zufahrt beim Bau: eine echte,
            // um Hindernisse geführte Kurve von der eigenen Randeinfahrt. Die
            // Suche hier lief dagegen über ALLE Straßenkacheln und nahm die
            // kürzeste Verbindung zu IRGENDEINER Einfahrt — auch quer durch
            // den Ort oder zur Zufahrt des Nachbardorfs. Genau deshalb fuhren
            // die Autos durchs Dorf.
            if (lot.fixedPath) continue;
            let lk = roadKey(lot.gx, lot.gy);
            if (!roadTiles.has(lk)) lk = nearestRoadTile(lot.gx, lot.gy);
            if (!lk) { if (!lot.roadPath) lot.roadPath = null; continue; }
            // Nur die EIGENE Einfahrt, falls eine hinterlegt ist.
            const kandidaten = lot.entryKey ? ziele.filter(z => z.key === lot.entryKey) : ziele;
            let best = null;
            for (const z of (kandidaten.length ? kandidaten : ziele)) {
                const p = bfsRoad(lk, z.key);
                if (p && p.length >= 2 && (!best || p.length < best.length)) best = p;
            }
            if (best) {
                // Einfahrtsstich (Padkante -> Straße) vor die Kachelroute
                // hängen, damit rp[0] die Padkante ist.
                lot.roadPath = lot._stub ? lot._stub.concat(best.slice(1)) : best;
            }
            else if (!lot.roadPath) lot.roadPath = null;
        }
        const first = parkingLots.find(l => l.roadPath);
        if (first) carArrivalPath = first.roadPath;
    };
    // Parzellen-Raster (Bau-Hilfe): dünne Gitterlinien, im Straßen-Modus sichtbar.
    let parcelGrid = null;
    const buildParcelGrid = () => {
        // Das sichtbare Raster ist jetzt das KACHELraster — genau die
        // Einheit, in der auch belegt wird. Vorher zeigte es ein gröberes
        // Snap-Raster und stimmte damit nicht mit der echten Belegung überein.
        const P = 1;
        const cx = Math.round(RVX), cy = Math.round(RVY), R = 78;
        const x0 = Math.max(2, cx - R), x1 = Math.min(gridSize - 2, cx + R), y0 = Math.max(2, cy - R), y1 = Math.min(gridSize - 2, cy + R);
        const pts = [];
        // Kachelkanten liegen auf halben Koordinaten (die Kachel gx reicht
        // von gx-0.5 bis gx+0.5) — sonst läge das Gitter um eine halbe Kachel
        // versetzt zur tatsächlichen Belegung.
        for (let gx = x0; gx <= x1; gx += P) for (let gy = y0; gy < y1; gy += 2) {
            const a = worldPosSmooth(gx - 0.5, gy - 0.5), b = worldPosSmooth(gx - 0.5, Math.min(y1, gy + 2) - 0.5);
            pts.push(a.x, a.y + 0.14, a.z, b.x, b.y + 0.14, b.z);
        }
        for (let gy = y0; gy <= y1; gy += P) for (let gx = x0; gx < x1; gx += 2) {
            const a = worldPosSmooth(gx - 0.5, gy - 0.5), b = worldPosSmooth(Math.min(x1, gx + 2) - 0.5, gy - 0.5);
            pts.push(a.x, a.y + 0.14, a.z, b.x, b.y + 0.14, b.z);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        // gut sichtbares Bau-Raster (heller Cyan-Ton, hebt sich klar vom Schnee ab)
        parcelGrid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42, depthTest: false }));
        parcelGrid.renderOrder = 5;
        parcelGrid.frustumCulled = false; parcelGrid.visible = false; scene.add(parcelGrid);
    };
    /**
     * Markierung der Parzelle, auf der gerade gebaut würde: ein leuchtendes
     * Rechteck über genau den Kacheln, die belegt werden. Grün = frei,
     * rot = belegt oder nicht bebaubar. Erst damit sieht der Spieler, wie
     * viel Fläche ein Gebäude wirklich beansprucht.
     */
    let parcelMark = null;
    const showParcel = (par, ok) => {
        if (!parcelMark) {
            parcelMark = new THREE.Group();
            parcelMark.visible = false;
            scene.add(parcelMark);
        }
        while (parcelMark.children.length) parcelMark.remove(parcelMark.children[0]);
        if (!par) { parcelMark.visible = false; return; }
        const col = ok ? 0x4ade80 : 0xef4444;
        const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18,
            depthTest: false, side: THREE.DoubleSide });
        const lineMat = new THREE.LineBasicMaterial({ color: col, transparent: true,
            opacity: 0.95, depthTest: false });
        // Fläche kachelweise, damit sie dem Gelände folgt
        for (let y = par.oy; y < par.oy + par.n; y++) for (let x = par.ox; x < par.ox + par.n; x++) {
            const c = worldPosSmooth(x, y);
            const q = new THREE.Mesh(new THREE.PlaneGeometry(tile * 0.94, tile * 0.94), mat);
            q.rotation.x = -Math.PI / 2;
            q.position.set(c.x, c.y + 0.16, c.z);
            q.renderOrder = 6; parcelMark.add(q);
        }
        // Umriss der gesamten Parzelle
        const pts2 = [];
        const corner = (gx, gy) => { const c = worldPosSmooth(gx, gy); return [c.x, c.y + 0.2, c.z]; };
        const a0 = par.ox - 0.5, b0 = par.oy - 0.5, a1 = par.ox + par.n - 0.5, b1 = par.oy + par.n - 0.5;
        for (const [p1, p2] of [[[a0, b0], [a1, b0]], [[a1, b0], [a1, b1]],
                                [[a1, b1], [a0, b1]], [[a0, b1], [a0, b0]]]) {
            pts2.push(...corner(p1[0], p1[1]), ...corner(p2[0], p2[1]));
        }
        const lg2 = new THREE.BufferGeometry();
        lg2.setAttribute('position', new THREE.Float32BufferAttribute(pts2, 3));
        const outline = new THREE.LineSegments(lg2, lineMat);
        outline.renderOrder = 7; parcelMark.add(outline);
        parcelMark.visible = true;
    };
    const showParcelGrid = (on) => {
        if (on && !parcelGrid) buildParcelGrid();
        if (parcelGrid) parcelGrid.visible = !!on;
        if (!on) showParcel(null, false);
    };
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const roadLineMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // GERENDERTE Steigung entlang einer Strecke (das, was der Spieler sieht):
    // Δ(Welt-Höhe) / Δ(Welt-Horizontal). Ablehnen ab 15 %.
    const roadGradeOK = (ax, ay, bx, by) => {
        const dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy) || 1, steps = Math.max(2, Math.round(dist));
        let prev = worldPosSmooth(ax, ay);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps, cur = worldPosSmooth(ax + dx * t, ay + dy * t);
            const dh = Math.abs(cur.y - prev.y), run = Math.hypot(cur.x - prev.x, cur.z - prev.z) || 1;
            // Bergstraßen dürfen ordentlich steigen: 24 % statt 15 %. Damit
            // lassen sich Hänge erschließen, an denen vorher jede Trasse rot war.
            if (dh / run > 0.24) return false; // > 24 % sichtbare Steigung
            prev = cur;
        }
        return true;
    };
    // Baut das Straßenband aus einer Liste von Mittelpunkt-Samples (glatt, mit
    // pro-Sample-Tangente -> saubere Kurven) inkl. gestrichelter Mittellinie,
    // Eckfüllungen (fillt Knicke bei verketteten Segmenten) und Fahr-Kacheln.
    const roadRibbon = (samples, width, caps = true) => {
        if (samples.length < 2) return;
        const hw = width / 2;
        const pos = [], idx = [], lpos = [], lidx = []; let v = 0, lv = 0;
        // ===== ABSCHNITTE ÜBER GEBÄUDEN AUSLASSEN =====
        // `claimRoadTile` verweigert zwar die Belegung über einem Gebäude,
        // das BAND wurde aber trotzdem durchgezeichnet — die Straße lief
        // dann sichtbar über Häuser und Ortschaften. Segmente, deren Mitte
        // auf Bauland liegt, werden jetzt übersprungen; das Band bricht dort
        // sauber ab, statt darüber zu laufen.
        const blockedAt = (c) => occAt(Math.round(c.gx), Math.round(c.gy)) === OCC_BUILD;
        let lastBlocked = true;                    // erzwingt einen Neuanfang
        for (let i = 0; i < samples.length; i++) {
            const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
            let tx = b.gx - a.gx, ty = b.gy - a.gy; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const nx = -ty, ny = tx, c = samples[i];
            const blocked = blockedAt(c);
            const l = worldPosSmooth(c.gx + nx * hw, c.gy + ny * hw), r = worldPosSmooth(c.gx - nx * hw, c.gy - ny * hw);
            pos.push(l.x, l.y + 0.18, l.z, r.x, r.y + 0.18, r.z);
            // Nur verbinden, wenn WEDER dieses NOCH das vorige Segment auf
            // Bauland liegt — sonst spannt sich ein Dreieck über das Haus.
            if (i > 0 && !blocked && !lastBlocked) { const bi = v - 2; idx.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2); }
            v += 2;
            const ll = worldPosSmooth(c.gx + nx * 0.28, c.gy + ny * 0.28), lr = worldPosSmooth(c.gx - nx * 0.28, c.gy - ny * 0.28);
            lpos.push(ll.x, ll.y + 0.22, ll.z, lr.x, lr.y + 0.22, lr.z);
            if (i > 0 && (i % 3 !== 0) && !blocked && !lastBlocked) { const bi = lv - 2; lidx.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2); }
            lv += 2;
            // Belegung nur so breit wie die Fahrbahn WIRKLICH ist — und nur
            // dort, wo kein Gebäude steht.
            if (!blocked) {
                const wMax = Math.max(0, Math.round(hw - 0.5));
                for (let w = -wMax; w <= wMax; w++) {
                    const tx2 = Math.round(c.gx + nx * w), ty2 = Math.round(c.gy + ny * w);
                    if (claimRoadTile(tx2, ty2)) roadTiles.add(roadKey(tx2, ty2));
                }
            }
            // ACHTUNG: dieses Update ist zwingend. Fehlt es, bleibt
            // `lastBlocked` für immer true und die Bedingung oben ist NIE
            // erfüllt — dann wird kein einziges Dreieck erzeugt und die
            // Straße ist komplett unsichtbar. Genau das war der Grund,
            // warum die Autos scheinbar über die Wiese fuhren.
            lastBlocked = blocked;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, roadMat); mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
        lg.setIndex(lidx); lg.computeVertexNormals();
        const lm = new THREE.Mesh(lg, roadLineMat); lm.frustumCulled = false; scene.add(lm);
        // Eck-/Endfüllung nur für verkettete gerade Segmente (nicht für glatte Kurven)
        if (caps) for (const c of [samples[0], samples[samples.length - 1]]) {
            const p = worldPosSmooth(c.gx, c.gy);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.5, width * 0.5, 0.05, 16), roadMat);
            cap.position.set(p.x, p.y + 0.17, p.z); cap.frustumCulled = false; scene.add(cap);
        }
    };
    /**
     * VORSCHAU-BAND für den Straßenbau.
     *
     * Baut exakt dieselbe geländefolgende Geometrie wie die spätere Straße,
     * nur als transparentes Band — grün wenn baubar, rot wenn nicht. Die
     * dünne Linie von vorher zeigte weder Breite noch Verlauf und stand
     * oft ein Stück über dem Boden.
     */
    const previewMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true,
        opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const previewEdgeMat = new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true,
        opacity: 0.95, depthTest: false });
    const buildRoadPreview = (samples, width, ok) => {
        const g = new THREE.Group();
        if (samples.length < 2) return g;
        const hw = width / 2;
        const pos = [], idx = [], edgeL = [], edgeR = []; let v = 0;
        for (let i = 0; i < samples.length; i++) {
            const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
            let tx = b.gx - a.gx, ty = b.gy - a.gy; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const nx = -ty, ny = tx, c = samples[i];
            const l = worldPosSmooth(c.gx + nx * hw, c.gy + ny * hw), r = worldPosSmooth(c.gx - nx * hw, c.gy - ny * hw);
            pos.push(l.x, l.y + 0.22, l.z, r.x, r.y + 0.22, r.z);
            edgeL.push(l.x, l.y + 0.26, l.z); edgeR.push(r.x, r.y + 0.26, r.z);
            if (i > 0) { const bi = v - 2; idx.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2); }
            v += 2;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        const col = ok ? 0x4ade80 : 0xef4444;
        const m1 = previewMat.clone(); m1.color.setHex(col);
        const band = new THREE.Mesh(geo, m1); band.frustumCulled = false; band.renderOrder = 8;
        g.add(band);
        // Randlinien machen die Fahrbahnbreite ablesbar
        const m2 = previewEdgeMat.clone(); m2.color.setHex(col);
        for (const arr of [edgeL, edgeR]) {
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
            const ln = new THREE.Line(lg, m2); ln.frustumCulled = false; ln.renderOrder = 9;
            g.add(ln);
        }
        // Mittelstreifen als gestrichelte Punkte
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
            opacity: ok ? 0.85 : 0.4, depthTest: false });
        for (let i = 2; i < samples.length - 1; i += 3) {
            const c = samples[i], wp = worldPosSmooth(c.gx, c.gy);
            const d = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.6), dotMat);
            const a = samples[i - 1], b = samples[i + 1];
            d.position.set(wp.x, wp.y + 0.28, wp.z);
            d.rotation.y = Math.atan2(b.gx - a.gx, b.gy - a.gy);
            d.renderOrder = 9; g.add(d);
        }
        g.userData.dispose = () => {
            g.traverse(o => { if (o.geometry) o.geometry.dispose?.(); if (o.material) o.material.dispose?.(); });
        };
        return g;
    };

    // gerade Straße
    const addRoad = (ax, ay, bx, by, width = 5) => {
        const dist = Math.hypot(bx - ax, by - ay) || 1, steps = Math.max(2, Math.round(dist));
        const samples = [];
        for (let i = 0; i <= steps; i++) { const t = i / steps; samples.push({ gx: ax + (bx - ax) * t, gy: ay + (by - ay) * t }); }
        roadRibbon(samples, width); return samples;
    };
    // geschwungene Straße durch Wegpunkte (Catmull-Rom, glatte Kurven)
    const addRoadCurve = (wpts, width = 5) => {
        const curve = new THREE.CatmullRomCurve3(wpts.map(p => new THREE.Vector3(p.gx, 0, p.gy)));
        let len = 0; for (let i = 1; i < wpts.length; i++) len += Math.hypot(wpts[i].gx - wpts[i - 1].gx, wpts[i].gy - wpts[i - 1].gy);
        const N = Math.max(12, Math.round(len));
        const cp = curve.getPoints(N);
        const samples = cp.map(vv => ({ gx: vv.x, gy: vv.z }));
        roadRibbon(samples, width, false); return samples; // glatt, keine Caps
    };
    const roadAt = (path, p) => {
        const fi = Math.max(0, Math.min(path.length - 1, p * (path.length - 1)));
        const i0 = Math.floor(fi), i1 = Math.min(path.length - 1, i0 + 1), f = fi - i0;
        const a = path[i0], b = path[i1];
        return { gx: a.gx + (b.gx - a.gx) * f, gy: a.gy + (b.gy - a.gy) * f };
    };

    // =====================================================================
    //  BELEGUNGSRASTER (PARZELLEN)
    //  --------------------------------------------------------------------
    //  Früher lagen Gebäude auf freien Weltkoordinaten und wurden über
    //  Kreisradien gegen Überschneidung geprüft. Zwei Folgen davon:
    //  Bauten standen schief zwischen den Kacheln ("auf der Ecke"), und
    //  Straßen konnten mitten durch ein Grundstück laufen, weil sie in einem
    //  ganz anderen System (roadTiles) verwaltet wurden.
    //
    //  Jetzt gibt es EIN Belegungsgitter. Jede Kachel ist entweder frei,
    //  Bauland eines Gebäudes oder Straße. Ein Gebäude belegt je nach Größe
    //  ein Quadrat aus 1x1, 2x2, 3x3 ... Kacheln und sitzt exakt in dessen
    //  Mitte. Belegt ist belegt — für Gebäude wie für Straßen.
    // =====================================================================
    /**
     * ANDOCKEN AN DIE STRASSE.
     *
     * Sucht im Umkreis von `maxD` Kacheln die nächstgelegene Straßenkachel
     * und liefert sie samt Blickrichtung zurück. Parkplatz und Parkhaus
     * richten sich damit automatisch zur Fahrbahn aus und bekommen eine
     * kurze Einfahrt — vorher stand ein Parkplatz beliebig gedreht daneben
     * und war für die Autos praktisch nicht angebunden.
     */
    const findRoadDock = (gx, gy, maxD = 9) => {
        let best = null, bd = maxD * maxD + 1;
        for (let dy = -maxD; dy <= maxD; dy++) for (let dx = -maxD; dx <= maxD; dx++) {
            const x = Math.round(gx) + dx, y = Math.round(gy) + dy;
            if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) continue;
            if (occGrid[y * gridSize + x] !== OCC_ROAD) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 < bd) { bd = d2; best = { gx: x, gy: y, dx, dy }; }
        }
        if (!best) return null;
        // Ausrichtung: die Zufahrtsseite zeigt zur Straße, auf 90° gerastet
        const yaw = snapYaw(Math.atan2(best.dx, best.dy));
        return { gx: best.gx, gy: best.gy, dist: Math.sqrt(bd), yaw };
    };

    const OCC_FREE = 0, OCC_BUILD = 1, OCC_ROAD = 2, OCC_TERRAIN = 3;
    const occGrid = new Uint8Array(gridSize * gridSize);
    const occOwner = new Map();                 // "gx,gy" -> Besitzerobjekt
    const occAt = (gx, gy) => {
        if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) return OCC_TERRAIN;
        return occGrid[gy * gridSize + gx];
    };
    /**
     * Kachelbedarf eines Bauwerks aus seinem bisherigen Radius ableiten.
     * Ein Radius von 2.0 ergibt 2x2, 3.4 ergibt 4x4 usw. — immer ungerade
     * oder gerade Kantenlänge, mindestens 1.
     */
    const footprintSize = (r) => Math.max(1, Math.min(12, Math.round(r * 1.15)));
    /**
     * Linke obere Ecke der Parzelle zu einem angeklickten Kachelpunkt.
     * Bei gerader Kantenlänge liegt der Mittelpunkt auf einer Kachelgrenze,
     * bei ungerader mitten auf einer Kachel — beides wird hier korrekt
     * eingerastet, damit das Gebäude WIRKLICH mittig steht.
     */
    const parcelOrigin = (gx, gy, n) => ({
        gx: Math.round(gx - (n - 1) / 2),
        gy: Math.round(gy - (n - 1) / 2)
    });
    /** Weltmittelpunkt einer Parzelle (Ecke + halbe Kantenlänge). */
    const parcelCenter = (ox, oy, n) => ({
        gx: ox + (n - 1) / 2,
        gy: oy + (n - 1) / 2
    });
    /** Sind alle Kacheln der Parzelle frei? */
    const parcelFree = (ox, oy, n) => {
        for (let y = oy; y < oy + n; y++) for (let x = ox; x < ox + n; x++) {
            if (x < 1 || y < 1 || x >= gridSize - 1 || y >= gridSize - 1) return false;
            if (occGrid[y * gridSize + x] !== OCC_FREE) return false;
        }
        return true;
    };
    /** Parzelle belegen. */
    const parcelClaim = (ox, oy, n, kind, owner) => {
        for (let y = oy; y < oy + n; y++) for (let x = ox; x < ox + n; x++) {
            occGrid[y * gridSize + x] = kind;
            if (owner) occOwner.set(x + ',' + y, owner);
        }
    };
    /** Parzelle wieder freigeben (Abriss). */
    const parcelRelease = (ox, oy, n) => {
        for (let y = oy; y < oy + n; y++) for (let x = ox; x < ox + n; x++) {
            if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) continue;
            occGrid[y * gridSize + x] = OCC_FREE;
            occOwner.delete(x + ',' + y);
        }
    };
    /** Einzelne Kachel als Straße markieren (nur wenn sie frei ist). */
    const claimRoadTile = (gx, gy) => {
        const x = Math.round(gx), y = Math.round(gy);
        if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
        const cur = occGrid[y * gridSize + x];
        // Straße darf über Straße laufen (Kreuzung), aber NIEMALS über ein
        // Gebäude. Genau daran scheiterte es vorher: roadTiles kannte die
        // Gebäude gar nicht.
        if (cur === OCC_BUILD) return false;
        occGrid[y * gridSize + x] = OCC_ROAD;
        return true;
    };

    // ---- Kompatibilitätsschicht auf Weltkoordinaten ----
    // Viele Aufrufer arbeiten noch mit (Weltposition, Radius). Sie werden
    // hier auf das Raster umgerechnet, damit es NUR EINE Wahrheit gibt.
    const worldToTile = (wx, wz) => ({ gx: Math.round((wx + half) / tile),
                                       gy: Math.round((wz + half) / tile) });
    const isFree = (wx, wz, r) => {
        const g = worldToTile(wx, wz), n = footprintSize(r);
        const o = parcelOrigin(g.gx, g.gy, n);
        return parcelFree(o.gx, o.gy, n);
    };
    const reserve = (wx, wz, r, owner) => {
        const g = worldToTile(wx, wz), n = footprintSize(r);
        const o = parcelOrigin(g.gx, g.gy, n);
        if (!parcelFree(o.gx, o.gy, n)) return false;
        parcelClaim(o.gx, o.gy, n, OCC_BUILD, owner || true);
        return true;
    };
    /**
     * Rastet eine Bauposition auf ihre Parzelle ein und liefert
     * Gittermittelpunkt, Weltmittelpunkt und Kantenlänge zurück.
     */
    const snapToParcel = (gx, gy, r) => {
        const n = footprintSize(r);
        const o = parcelOrigin(gx, gy, n);
        const c = parcelCenter(o.gx, o.gy, n);
        return { n, ox: o.gx, oy: o.gy, gx: c.gx, gy: c.gy,
                 x: c.gx * tile - half, z: c.gy * tile - half,
                 free: parcelFree(o.gx, o.gy, n) };
    };
    const baseAltitude = (level && level.terrain && level.terrain.baseAltitude) || 0;
    const guestRoutes = []; // {top:{gx,gy}, bottom:{gx,gy}} — früh deklariert (TDZ-fix)
    // base/per = Baukosten. cap = Personen je Fahrzeug, gap = Sekunden bis das
    // nächste Fahrzeug einfahrbereit ist, speed = Fahrtdauer-Faktor.
    const LIFT_PARAMS = {
        carpet:  { base: 700,   per: 100,  cap: 1, gap: 2.5, speed: 0.9 },   // Magic Carpet (Anfänger)
        platter: { base: 1500,  per: 200,  cap: 1, gap: 4.0, speed: 1.0 },   // Tellerlift
        tbar:    { base: 4000,  per: 350,  cap: 2, gap: 5.0, speed: 1.1 },   // Schlepplift (T-Bar)
        chair2:  { base: 7700,  per: 800,  cap: 2, gap: 6.0, speed: 1.3 },   // 2er-Sessel
        chair:   { base: 8000,  per: 700,  cap: 4, gap: 6.5, speed: 1.4 },   // 4er-Sessel
        chair6:  { base: 25200, per: 1300, cap: 6, gap: 6.0, speed: 1.7 },   // 6er-Sesselbahn mit Haube
        gondola: { base: 15000, per: 1200, cap: 8, gap: 7.0, speed: 1.8 },   // Gondelbahn
        gondola4:{ base: 19000, per: 1200, cap: 4, gap: 3.0, speed: 2.0 },   // kleine 4er-Kabinenbahn
        gondola8:{ base: 34000, per: 1900, cap: 8, gap: 4.5, speed: 2.2 },   // 8er-Kabinenbahn
        // Prestige-Anlage: sehr teuer, dafür hohe Förderleistung
        mega:    { base: 96000, per: 4200, cap: 10, gap: 3.2, speed: 2.6 },  // große Einseilumlaufbahn
        tramxl:  { base: 128000, per: 5200, cap: 20, gap: 14, speed: 3.0 },  // Jumbo-Pendelbahn
        tram:    { base: 40000, per: 2600, cap: 30, gap: 22.0, speed: 2.6 }  // Pendelbahn
    };
    /**
     * Eine Liftanlage als Gäste-Route. Jede Anlage führt eine eigene
     * Warteschlange an der Talstation und fährt getaktet: alle `gap` Sekunden
     * ist ein Fahrzeug frei, das bis zu `cap` Wartende aufnimmt. Nur wer
     * eingestiegen ist, kommt oben an — es entsteht kein Gast aus dem Nichts.
     */
    function makeLiftRoute(top, bottom, kind, p) {
        // Sessel-, Gondel- und Kabinenbahnen kann man auch ABWÄRTS fahren.
        // Bei Schlepp- und Tellerliften geht das nicht — dort wird man am
        // Boden hochgezogen, eine Talfahrt gibt es schlicht nicht.
        const canDescend = !['tbar', 'platter', 'carpet'].includes(kind);
        return {
            kind: 'lift', top, bottom, liftKind: kind, canDescend,
            cap: p.cap, gap: p.gap, rideSpeed: p.speed,
            queue: [],        // wartende Gäste an der TALstation (bergauf)
            queueDown: [],    // wartende Gäste an der BERGstation (talwärts)
            timer: 0          // Sekunden bis das nächste Fahrzeug bereitsteht
        };
    }

    // ===== ÖKONOMIE-KERN (früh deklariert: wird vom Animations-Loop genutzt) =====
    let money = (level && level.startingMoney) || 2000000;
    let onMoney = null;
    let onStats = null;
    // Zähler gebauter Objekte (für Missions-HUD)
    const built = { lift: 0, chalet: 0, hotel: 0, restaurant: 0, ticket: 0, snowcannon: 0, funpark: 0, funpark_s: 0, funpark_l: 0, parking: 0, parkgarage: 0, skischool: 0, skirental: 0, shop: 0, imbiss: 0, busstop: 0, garage: 0, garage2: 0, garage4: 0, garage5_1: 0, garage5_2: 0, garage5_4: 0, toilet: 0,
        hotel_pension: 0, hotel_budget: 0, hotel_mid: 0, hotel_resort: 0, hotel_lux: 0, chalet_s: 0, chalet_l: 0, chalet_lux: 0,
        huette: 0, bergrest: 0, panorama: 0, sterne: 0, apres: 0, partyzelt: 0, disco: 0, souvenir: 0,
        medical: 0, hospital: 0, workshop: 0, reservoir: 0, reservoir_l: 0, cannon_s: 0, cannon_l: 0,
        sauna: 0, therme: 0, eisbahn: 0, kicker: 0, halfpipe: 0, racecourse: 0 };
    // Sammelwerte über alle Klassen (für Statistik & Simulation)
    // ===== BETTEN =====
    // Jede Unterkunft hat eine echte Kapazität statt der pauschalen 40 Betten
    // je "Hotel". Die Bandbreite reicht von der 25-Betten-Pension bis zum
    // Grandhotel mit 250.
    const BED_COUNT = {
        hotel_pension: HOTEL_BEDS.pension, hotel_budget: HOTEL_BEDS.budget,
        hotel:         HOTEL_BEDS.standard, hotel_mid:   HOTEL_BEDS.mid,
        hotel_resort:  HOTEL_BEDS.resort,  hotel_lux:    HOTEL_BEDS.luxury,
        chalet: 6, chalet_s: 8, chalet_l: 20, chalet_lux: 30
    };
    const bedsOf = (type) => BED_COUNT[type] || 0;
    const totalBeds = () => {
        let n = 0;
        for (const b of placedBuildings) n += bedsOf(b.type);
        return n;
    };
    // Für Attraktivität/Umsatz weiterhin ein grobes "Hotel-Äquivalent"
    const totalHotels = () => totalBeds() / 90;
    const totalGastro = () => built.restaurant + built.imbiss + built.huette + built.bergrest + built.panorama * 2 + built.sterne * 2;
    const totalNight  = () => built.apres + built.partyzelt + built.disco * 2;
    const totalWell   = () => built.sauna + built.therme * 3 + built.eisbahn * 2;
    // ===== LEVEL-FARBEN: Pistenraupen & Liftkabinen variieren dezent je Level =====
    // Schwarzwald + Alpenländer fahren knallrot; andere Level bekommen eine
    // eigene Signalfarbe (nie grün — das wäre auf Schnee schlecht sichtbar).
    // ===== LEVELSCHLÜSSEL =====
    // Die Kampagne führt Level unter einer TEXT-Id ('japan', 'alpen', …),
    // die folgenden Tabellen sind aber nach 1..10 durchnummeriert. Ein
    // direkter Zugriff mit level.id lief deshalb IMMER ins Leere und fiel auf
    // Eintrag 1 zurück — in Hokkaidō wurde Schwarzwälder Kirschtorte
    // beworben, und Gondelfarben wie Pistenraupen waren überall identisch.
    const LEVEL_ORDER = ['mittelgebirge', 'alpen', 'schweiz', 'frankreich', 'italien',
                         'norwegen', 'rockies', 'kanada', 'anden', 'japan'];
    const levelNo = (() => {
        const byId = LEVEL_ORDER.indexOf(level?.id);
        if (byId >= 0) return byId + 1;
        if (Number.isFinite(level?.index)) return Math.max(1, Math.min(10, level.index + 1));
        if (Number.isFinite(+level?.id)) return Math.max(1, Math.min(10, +level.id));
        return 1;
    })();
    const LEVEL_FLEET = {
        1: { cat: 0xdc2626, a: 0xe23b3b, b: 0x2f8fd6 },   // Schwarzwald — knallrot
        2: { cat: 0xdc2626, a: 0xe23b3b, b: 0x3b82f6 },   // Tirol — knallrot
        3: { cat: 0xdc2626, a: 0xd63b3b, b: 0x2f6fd6 },   // Wallis — knallrot
        4: { cat: 0xdc2626, a: 0xdb3b6b, b: 0x2f8fd6 },   // Savoyen — knallrot
        5: { cat: 0xdc2626, a: 0xe2563b, b: 0x3f7fd0 },   // Dolomiten — knallrot
        6: { cat: 0xf59e0b, a: 0xe8a33b, b: 0x3477c4 },   // Fjordland — bernstein
        7: { cat: 0x0ea5e9, a: 0x3aa6dd, b: 0xd6552f },   // Rockies — himmelblau
        8: { cat: 0xf97316, a: 0xe0762f, b: 0x2f7fd6 },   // BC — orange
        9: { cat: 0xa855f7, a: 0xa06ae0, b: 0x2f8fd6 },   // Patagonien — violett
        10:{ cat: 0xec4899, a: 0xdb5f96, b: 0x3f7fd0 }    // Hokkaidō — magenta
    };
    // Werbeaufschriften auf den Gondeln — je Level eine passende Marke
    const LEVEL_ADS = {
        1:  { text: 'SCHWARZWALD', bg: 0x166534 },
        2:  { text: 'TIROL',       bg: 0xdc2626 },
        3:  { text: 'MATTERHORN',  bg: 0xb91c1c },
        4:  { text: 'SAVOIE',      bg: 0x1d4ed8 },
        5:  { text: 'DOLOMITI',    bg: 0xc2410c },
        6:  { text: 'FJORD SKI',   bg: 0x0369a1 },
        7:  { text: 'ROCKIES',     bg: 0x7c2d12 },
        8:  { text: 'POWDER BC',   bg: 0x0f766e },
        9:  { text: 'PATAGONIA',   bg: 0x6d28d9 },
        10: { text: 'HOKKAIDO',    bg: 0xbe123c }
    };
    // ===== NEON-WERBUNG AN DEN GROSSEN ANLAGEN =====
    // Jede Anlage ab 10 Personen bekommt ein eigenes Banner mit einem
    // Produkt, das zum Level passt. Die Namen sind bewusst nur ANGELEHNT an
    // reale Marken und leicht abgewandelt, damit keine geschützten
    // Kennzeichen verwendet werden.
    // Acht Produkte je Level statt vier — so wiederholt sich auf einer Karte
    // praktisch nichts. Alle Namen sind bewusst nur ANGELEHNT an reale
    // Marken und abgewandelt, damit keine geschützten Kennzeichen auftauchen.
    // Die Farben sind gedämpft gewählt; grelle Vollsättigung wirkte am Hang
    // wie ein Jahrmarkt.
    const LEVEL_BRANDS = {
        // Schwarzwald
        1:  [['TANNZAPF PILS', 0xd9b43f], ['KIRSCHWASSER HOF', 0xd4728f],
             ['KUCKUCK UHREN', 0x6fb9c4], ['BOLLENHUT KAFFEE', 0xd08a4a],
             ['SCHINKEN VOM GRAT', 0xc4695e], ['TANNENHONIG', 0xc9a84e],
             ['WANDERHÜTTE MUMMEL', 0x7fae7a], ['SCHWARZWALD KIRSCHTORTE', 0xd48aa6]],
        // Tirol
        2:  [['ALMSPRUDLER', 0x8fc264], ['ROTES HORN ENERGY', 0x5b93cc],
             ['TIROLER SPECK', 0xcc6f6f], ['ZILLER BRÄU', 0xd9b43f],
             ['BERGKÄSE SENNEREI', 0xd7c07a], ['LODEN & FILZ', 0x7d9a7a],
             ['APFELSTRUDEL STUBE', 0xd0965a], ['SCHNAPS AUS DEM ZILLER', 0xb98fcb]],
        // Wallis
        3:  [['MILVA ALPENSCHOKO', 0xa88bc9], ['ALPINA TASCHENMESSER', 0xc4645e],
             ['RAGUNA NOUGAT', 0xd6b263], ['RIVENDA QUELLE', 0x6bc4b0],
             ['RACLETTE DU VALAIS', 0xd09a5c], ['UHRMACHER BRENNER', 0x8fa8c4],
             ['BERGBAHN MATT AG', 0x7fb2c9], ['WALLISER TROCKENFLEISCH', 0xb87070]],
        // Savoyen
        4:  [['RACLETTE SAVOIE', 0xd6a34e], ['CHARTREUX LIKÖR', 0x8fc264],
             ['EVIANE QUELLE', 0x6fb2d4], ['MONT BAGUETTE', 0xd09a6a],
             ['REBLOCHON FERMIER', 0xd8c489], ['TARTIFLETTE HÜTTE', 0xc47a5a],
             ['GENEPI DES ALPES', 0x9ec47a], ['CRÊPERIE DU COL', 0xd4879f]],
        // Dolomiten
        5:  [['APERONE SPRITZ', 0xd98a4a], ['LAVAZZI CAFFÈ', 0x6fa8cc],
             ['GRAPPA DOLOMITI', 0xb392cc], ['SPECK ALTO PIANO', 0xcc6f8a],
             ['STRUDEL DI MELE', 0xd6a85c], ['VINO SANTO TRENTINO', 0xa9628f],
             ['RIFUGIO PANORAMA', 0x7fbec4], ['MOZZARELLA DI MALGA', 0xd8cf9e]],
        // Fjordland
        6:  [['FJORD LAKS', 0xd4869a], ['NORDLYS AQUAVIT', 0x74c2cc],
             ['JARLSBORG KÄSE', 0xd6b95e], ['TROLL WOOL', 0x8fbb78],
             ['BRUNOST GAMMEL', 0xc4884e], ['NORDKAP STOCKFISCH', 0x8aa8c4],
             ['SKI VOSS BINDUNGEN', 0x6f9ecc], ['KANELBOLLE BAKERI', 0xd6a06f]],
        // Rockies
        7:  [['COOPERS LIGHT', 0xd6b04a], ['BIG SKY JERKY', 0xcc7a4e],
             ['ROCKY PEAK COLA', 0xcc6060], ['DENVER STEAKS', 0xd0925c],
             ['ASPEN BOOT CO.', 0x9aa8b8], ['YELLOWSTONE BOURBON', 0xc49a58],
             ['POWDER PASS DINER', 0x74b6c9], ['GRIZZLY TRAIL MIX', 0x8fae70]],
        // British Columbia
        8:  [['MAPLE GOLD SIRUP', 0xd6a54e], ['TOM HORTON COFFEE', 0xcc6a6a],
             ['MOOSEBACK ALE', 0x8fbb70], ['POUTINE BAR', 0x6fb0cc],
             ['PACIFIC SMOKED LAX', 0xd48f9a], ['CEDAR LODGE SAUNA', 0xb0865e],
             ['SEA-TO-SKY OUTFIT', 0x7fa8c4], ['ICEFIELD BOTTLED', 0x86c4c0]],
        // Patagonien
        9:  [['YERBA MATE ANDINA', 0x8fbb6a], ['MALBEC PATAGONIA', 0xa8709a],
             ['QUILMAS CERVEZA', 0x6fa8cc], ['DULCE DE LECHE', 0xd6a552],
             ['ASADO DEL VIENTO', 0xc4705e], ['LANA DE GUANACO', 0xc0a884],
             ['REFUGIO AUSTRAL', 0x74bcc4], ['ALFAJOR DEL SUR', 0xd08f7a]],
        // Hokkaidō
        10: [['SAPPARO BEER', 0xd6b45e], ['POCKI STICKS', 0xd4809e],
             ['HOKKAIDO MILK', 0x8fc4d4], ['YUKI RAMEN', 0xd08a58],
             ['MATCHA NO MORI', 0x8fbb78], ['ONSEN YUKIGUNI', 0xb894c4],
             ['NISEKO POWDER CO.', 0x7fa8cc], ['KANI KING KRABBE', 0xcc6f6f]]
    };
    let _adSeq = 0;
    /**
     * Nächstes Banner — jede große Anlage bekommt ein anderes.
     * Die Liste wird EINMAL je Spiel durchmischt, damit nicht immer dieselbe
     * Reihenfolge erscheint, danach reihum durchlaufen: so wiederholt sich
     * erst ab der neunten Anlage etwas.
     */
    let _adOrder = null;
    const nextNeonAd = () => {
        if (!_adOrder) {
            _adOrder = (LEVEL_BRANDS[levelNo] || LEVEL_BRANDS[1]).slice();
            for (let i = _adOrder.length - 1; i > 0; i--) {
                const j = (Math.random() * (i + 1)) | 0;
                [_adOrder[i], _adOrder[j]] = [_adOrder[j], _adOrder[i]];
            }
        }
        const [text, color] = _adOrder[_adSeq++ % _adOrder.length];
        // Zweitfarbe leicht versetzt aus derselben Familie — nie knallbunt.
        const c2 = ((color >> 16 & 255) * 0.75 << 16)
                 | ((color >> 8 & 255) * 0.85 << 8)
                 | ((color & 255) * 1.0 | 0);
        return { text, color, color2: c2 & 0xffffff };
    };
    const levelAd = LEVEL_ADS[levelNo] || LEVEL_ADS[1];
    const liftOpts = { adText: levelAd.text, adBg: levelAd.bg, adColor: 0xffffff };
    const fleet = LEVEL_FLEET[levelNo] || LEVEL_FLEET[1];
    const SNOWCAT_COLOR = fleet.cat;
    MATS.cabinR.color.setHex(fleet.a);
    MATS.cabinB.color.setHex(fleet.b);
    // Pistenraupen-Kapazität aus den gebauten Garagen (1er/2er/4er)
    const catCapacity = () => built.garage + built.garage2 * 2 + built.garage4 * 4
        + built.garage5_1 + built.garage5_2 * 2 + built.garage5_4 * 4;
    // Wie viele davon sind große 500er? (walzen breiter und schneller)
    const cat500Count = () => built.garage5_1 + built.garage5_2 * 2 + built.garage5_4 * 4;
    let garagePos = null;   // Standort der zuletzt gebauten Garage (Ausfahrt der Raupen)
    let garageReady = false; // Garage fertig gebaut? Vorher fährt nichts heraus
    let vehAvoid = null;    // Umfahrung für Raupe UND Skidoo (Wald/Fels/Wasser)
    let sledDrive = null;   // Fahrmodell des Skidoos (wird mit der Raupe definiert)
    let sledCanReach = null; // Erreichbarkeitsprüfung fürs Skidoo (Pfadsuche)
    let _dbgWalkers = null;  // nur für Tests: Anreise-Fußgänger
    const emitStats = () => { if (onStats) onStats(getStats()); };
    // ===== SPIELSTAND (früh deklariert: die Bildschleife zählt die Spielzeit von Anfang an) =====
    // Gespeichert wird nicht die Szene, sondern was der Spieler getan hat: jede Bauaktion
    // in ihrer Reihenfolge, dazu Kontostand und Kennzahlen (siehe getSave / loadSave unten).
    // Beim Laden werden die Aktionen auf dem frisch erzeugten Gelände noch einmal
    // ausgeführt – ohne Bauzeit und ohne Kosten. Wer eine neue Bauaktion ergänzt, muss sie
    // hier vormerken (logAction) und in loadSave nachspielen, sonst fehlt sie nach dem Laden.
    const saveLog = [];
    let replaying = false;             // gerade wird ein Spielstand nachgebaut
    let onSaveChange = null;           // meldet dem HUD: es gibt etwas zu sichern
    let playSeconds = 0;               // gespielte Zeit in diesem Gebiet
    const logAction = (a) => { if (replaying) return; saveLog.push(a); if (onSaveChange) onSaveChange(); };
    // ===== ÖKONOMIE-SIMULATION =====
    const sim = { served: 0, active: 0, revenue: 0, satisfaction: 78, timeAcc: 0, dayProfit: 0, bestDayProfit: 0, dayAcc: 0, dayRevenue: 0, dayCost: 0, carActive: 0, carGuestsToday: 0, groom: 85 };
    // ===== ÖKONOMIE (Konzept aus dem 2D-Spiel übernommen) =====
    // Globaler Skipass-Preis (Kasse), einstellbar 50%..200% der Basis
    const eco = { baseSkiPass: 85, skiPass: null, ad: { id: null, daysLeft: 0 } };  // null = Basispreis
    const skiPassPrice = () => (eco.skiPass ?? eco.baseSkiPass);
    // ===== WERBEKAMPAGNEN =====
    // An der Kasse lässt sich eine Kampagne für die nächsten zwei Monate
    // buchen. Sie kostet einmalig und hebt so lange den Zustrom. Ein
    // Spieltag entspricht 30 s (siehe sim.dayAcc), zwei Monate sind hier
    // 60 Spieltage.
    const AD_DAYS = 60;
    const AD_PACKAGES = [
        { id: 'flyer', icon: '📄', name: 'Flyer & Aushänge',
          desc: 'Plakate in den Nachbarorten. Ein paar Tagesgäste mehr.',
          cost: 12000,  boost: 0.12 },
        { id: 'radio', icon: '📻', name: 'Radio & Zeitung',
          desc: 'Regionale Spots und Anzeigen. Spürbar mehr Zulauf.',
          cost: 38000,  boost: 0.30 },
        { id: 'tv', icon: '📺', name: 'TV-Kampagne',
          desc: 'Werbespot zur besten Sendezeit. Deutlich mehr Gäste.',
          cost: 95000,  boost: 0.62 },
        { id: 'global', icon: '🌍', name: 'Internationale Kampagne',
          desc: 'Reiseportale, Influencer, Messeauftritte. Der große Ansturm.',
          cost: 220000, boost: 1.15 }
    ];
    /** Aktueller Werbefaktor auf den Gästezustrom (1 = keine Kampagne). */
    const adBoost = () => {
        if (!eco.ad || eco.ad.daysLeft <= 0) return 1;
        const pk = AD_PACKAGES.find(a => a.id === eco.ad.id);
        if (!pk) return 1;
        // Die Wirkung läuft zum Ende hin aus, statt schlagartig abzureissen.
        const fade = Math.min(1, eco.ad.daysLeft / 8);
        return 1 + pk.boost * (0.55 + 0.45 * fade);
    };
    // Attraktivität 10..100% je nach Preis (2D-Formel: Toleranz 1.1, Sensitivität 40)
    const skiPassAttract = () => {
        const r = skiPassPrice() / eco.baseSkiPass;
        return Math.min(100, Math.max(10, Math.round(100 - (r - 1.1 + 0.2) * 40)));
    };
    // Gäste-Kategorien wie im 2D (priceMultiplier = Preistoleranz)
    const GUEST_CATS = [
        { icon: '💰', name: 'Sparfüchse',   mult: 0.7, color: '#22c55e' },
        { icon: '👨‍👩‍👧‍👦', name: 'Familien',  mult: 0.9, color: '#3b82f6' },
        { icon: '🏠', name: 'Mittelklasse', mult: 1.0, color: '#f59e0b' },
        { icon: '🥈', name: 'Premium',      mult: 1.3, color: '#94a3b8' },
        { icon: '💎', name: 'Luxus',        mult: 1.5, color: '#a855f7' }
    ];
    // Gästenamen (wie 2D guestNames.js)
    // Vornamen getrennt nach Geschlecht, damit Name und Portrait zusammenpassen
    const NAMES_M = ['Max','Felix','Leon','Lukas','Jonas','Noah','Elias','Finn','Paul','Ben','Tobias','Andreas','Klaus','Werner','Stefan','Jan'];
    const NAMES_F = ['Emma','Mia','Hannah','Sophia','Anna','Lena','Lea','Marie','Laura','Sophie','Petra','Sabine','Ute','Christine','Julia','Nina'];
    const GUEST_SURNAMES = ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Hoffmann','Koch','Bauer','Richter','Klein','Wolf','Braun','Lange'];
    // Ziele, die Gäste nach der Abfahrt ansteuern können
    const VISIT_TYPES = ['restaurant', 'imbiss', 'huette', 'bergrest', 'panorama', 'sterne',
        'hotel', 'hotel_pension', 'hotel_budget', 'hotel_mid', 'hotel_resort', 'hotel_lux', 'chalet', 'chalet_s', 'chalet_l', 'chalet_lux',
        // (Funpark, Kicker, Halfpipe, Rennstrecke sind KEINE Besuchsziele mehr:
        //  sie liegen auf der Piste und werden nur in Fahrtrichtung durchfahren —
        //  niemand läuft dafür extra hin oder hoch.)
        'apres', 'partyzelt', 'disco', 'sauna', 'therme', 'eisbahn',
        // Toiletten sind ein vollwertiges Ziel — ohne sie in dieser Liste
        // wurden sie nie angesteuert und die Blase konnte nie geleert werden.
        'toilet'];
    const PARTY_TYPES = ['restaurant', 'imbiss', 'huette', 'bergrest', 'panorama', 'sterne', 'apres', 'partyzelt', 'disco', 'eisbahn'];
    // Anlagen, die in einer Richtung durchfahren werden und bei denen ein
    // Trick gezeigt wird — Funparks wie auch Kicker, Halfpipe, Rennstrecke.
    const RIDE_THROUGH = ['kicker', 'halfpipe', 'racecourse'];
    // Laenge der Durchfahrt je Anlage (in Kacheln). Diese Anlagen werden
    // von oben nach unten durchfahren und richten sich in die Falllinie.
    const DIRECTED = { funpark_s: 7, funpark: 10, funpark_l: 14, kicker: 8, halfpipe: 20, racecourse: 30 };
    const isFunType = (t) => typeof t === 'string' && (t.startsWith('funpark') || RIDE_THROUGH.includes(t));
    // Verfügbare Gäste-Avatare (Dateien public/icons/guest_<key>.png).
    // Alle gerenderten Portraits — gemischt aus Gästen und Personal.
    // Bewusst gemischt: die Mehrheit sind ganz normale Typen, Kinder und
    // Senioren; die "schicken" Portraits tauchen nur vereinzelt auf.
    // Avatare nach Geschlecht getrennt — Alltagsgesichter doppelt gelistet,
    // damit sie häufiger erscheinen als die schicken Portraits.
    const AVATARS_M = [
        'm_schnauzer', 'm_brille', 'rentner', 'opa', 'm_board', 'sparfuchs', 'vater',
        'm_schnauzer', 'm_brille', 'rentner', 'opa', 'm_board', 'sparfuchs', 'vater',
        'junge', 'teen_m', 'kind',
        'skilehrer', 'skilehrer2', 'retter', 'retter2',
        'snowboarder', 'snowboarder2', 'premium', 'premium2', 'mittel', 'luxus', 'luxus2'
    ];
    const AVATARS_F = [
        'f_normal', 'f_brille', 'f_mittel', 'f_alt', 'f_braun', 'mutter',
        'f_normal', 'f_brille', 'f_mittel', 'f_alt', 'f_braun', 'mutter',
        'maedchen', 'teen_f', 'teen_board',
        'f_lehrerin',
        'f_jung', 'f_board', 'f_locken', 'f_luxus'
    ];
    // Kinder-Avatare: dazu passen kindliche Vornamen
    const KID_AVATARS = ['kind', 'junge', 'maedchen', 'teen_m', 'teen_f', 'teen_board'];
    const KID_NAMES_M = ['Tim', 'Nico', 'Jannik', 'Luis', 'Emil'];
    const KID_NAMES_F = ['Lina', 'Mila', 'Frieda', 'Ida', 'Nele'];
    const SLEEP_TYPES = ['hotel', 'hotel_pension', 'hotel_budget', 'hotel_mid', 'hotel_resort', 'hotel_lux', 'chalet', 'chalet_s', 'chalet_l', 'chalet_lux', 'sauna', 'therme'];
    // Alle sichtbaren Personen sind anklickbar (Skifahrer, Flanierer, Auto-Gäste)
    const clickableGuests = [];
    const JACKET_HEX = ['#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#eab308'];
    const makeGuestProfile = (mesh) => {
        const cat = GUEST_CATS[(Math.random() * GUEST_CATS.length) | 0];
        const all = [['restaurant','🍽️ Restaurant'],['imbiss','🌭 Imbiss'],['hotel','🏨 Hotel'],['funpark','🏂 Funpark'],['skischool','🎿 Skischule'],['skirental','⛷️ Skiverleih'],['shop','🛍️ Sport-Shop']];
        const wishes = []; while (wishes.length < 3) { const w = all[(Math.random() * all.length) | 0]; if (!wishes.includes(w)) wishes.push(w); }
        // Erst Geschlecht + Avatar wählen, dann den passenden Vornamen dazu
        const female = Math.random() < 0.5;
        const avatar = (female ? AVATARS_F : AVATARS_M)[(Math.random() * (female ? AVATARS_F : AVATARS_M).length) | 0];
        const isKid = KID_AVATARS.includes(avatar);
        const firstPool = isKid ? (female ? KID_NAMES_F : KID_NAMES_M) : (female ? NAMES_F : NAMES_M);
        const g = {
            mesh, name: firstPool[(Math.random() * firstPool.length) | 0] + ' ' + GUEST_SURNAMES[(Math.random() * GUEST_SURNAMES.length) | 0],
            cat, mood: 55 + Math.random() * 40, spent: 0, seed: (Math.random() * 9999) | 0,
            jacketColor: JACKET_HEX[(Math.random() * JACKET_HEX.length) | 0],
            pantsColor: ['#475569','#1f2937','#334155','#0f172a'][(Math.random() * 4) | 0],
            helmetColor: ['#94a3b8','#f8fafc','#dc2626','#0ea5e9','#facc15'][(Math.random() * 5) | 0],
            hunger: Math.random() * 40, thirst: Math.random() * 40, bladder: Math.random() * 30,
            slopePref: ['blue','red','black'][(Math.random() * 3) | 0], wishes, doneWishes: [],
            trick: ['360°','Backflip','Method Grab','Big Air','Drift','Tail Grab'][(Math.random() * 6) | 0],
            passDays: 1 + ((Math.random() * 6) | 0), state: null,
            // Avatarbild passend zur Gästekategorie (Datei public/icons/guest_<key>.png)
            avatarKey: 'guest_' + avatar, female, isKid,
            // Wer auf dem Portrait ein Board trägt, fährt auch Snowboard
            isBoarder: /board/.test(avatar) || avatar === 'snowboarder' || avatar === 'snowboarder2'
        };
        // Ausrüstung passend zum Profilbild anlegen
        if (g.isBoarder && mesh.userData.setSnowboard) mesh.userData.setSnowboard(true);
        clickableGuests.push(g);
        return g;
    };
    // Appeal je Kategorie bei Preis-Verhältnis (2D-Formel)
    const catAppeal = (ratio) => GUEST_CATS.map(c => {
        const sens = 1.5 - c.mult;                                       // Sparfüchse reagieren stark
        const eff = Math.max(0.3, Math.min(1.3, 1 - (ratio - 1) * sens));
        return { icon: c.icon, name: c.name, color: c.color, pct: Math.round(Math.min(1, 0.8 * eff) * 100) };
    });
    function getStats() {
        return {
            money,
            liftCount: built.lift,
            maxLiftCapacity: built.lift > 0 ? 8 : 0,
            gastroCount: totalGastro(),
            hotelBeds: Math.round(sim.beds || totalBeds()),
            bedsUsed: Math.round(sim.bedsUsed || 0),
            hotelFull: sim.hotelFull || 0,
            reput: Math.round((sim.reput || 0) * 100),
            shopCount: 0,
            totalGuestsServed: Math.round(sim.served),
            currentGuests: Math.round(sim.active + sim.carActive),
            totalRevenue: Math.round(sim.revenue),
            // Jeder gebaute Lift erschließt Pisten (grobe Aufteilung nach Schwierigkeit)
            pisteKmTotal: +(piste.total + built.lift * 0.6).toFixed(1),
            pisteKmBlue:  +(piste.blue + built.lift * 0.3).toFixed(1),
            pisteKmRed:   +(piste.red + built.lift * 0.2).toFixed(1),
            pisteKmBlack: +(piste.black + built.lift * 0.1).toFixed(1),
            pisteCount: built.lift + Math.round(piste.total),
            satisfaction: Math.round(sim.satisfaction),
            pisteCondition: Math.round(sim.groom),
            bestDailyProfit: Math.round(sim.bestDayProfit),
            // Bediente Gäste verteilen sich auf die Aussichtspunkte (POI-Besucher)
            poiSummit: Math.floor(sim.served * 0.35),
            poiValley: Math.floor(sim.served * 0.3),
            poiLake:   Math.floor(sim.served * 0.3),
            // Beschneiung: Wasservorrat, Bedarf und aktuelles Wetter fürs HUD
            waterSupply: waterSupply(),
            waterNeed: waterNeed(),
            cannonCount: built.cannon_s + built.snowcannon + built.cannon_l,
            stranded: sim.stranded || 0,
            // Abgewiesene Autos (Parkplätze voll) — Warnung, solange es
            // in den letzten 40 s vorkam
            parkingFull: (sim.parkingRejectT != null && (sim._tNow - sim.parkingRejectT) < 40)
                ? (sim.parkingRejects || 0) : 0,
            injuredCount: sim.injuredCount || 0,
            grumpy: sim.grumpy || 0,
            mood: sim.mood != null ? sim.mood : 100,
            reservoirCount: built.reservoir + built.reservoir_l,
            // Während einer Bö übernimmt die Wetteranzeige kurz — so sieht
            // man auch im HUD, warum plötzlich alles flattert.
            weatherName: (wind.gustF > 0.25) ? 'Windböe' : weather.phase.name,
            weatherIcon: (wind.gustF > 0.25) ? '🌬️' : weather.phase.icon,
            weatherKey: (wind.gustF > 0.25) ? 'wind' : weather.phase.key,
            gust: +(wind.gustF || 0).toFixed(2),
            attractScore: sim.attract || 0,
            adId: eco.ad.daysLeft > 0 ? eco.ad.id : null,
            adDaysLeft: eco.ad.daysLeft,
            adBoostPct: Math.round((adBoost() - 1) * 100),
            forecastName: weather.next?.name || '',
            forecastIcon: weather.next?.icon || '',
            forecastIn: Math.max(0, Math.round(weather.timer)),
            snowfall: +weather.snowfall.toFixed(2)
        };
    }
    // ===== BESCHNEIUNG =====
    // Reichweite je Kanonentyp (in Kacheln) und Wasserbedarf pro Kanone.
    const CANNON_RANGE = { cannon_s: 12, snowcannon: 20, cannon_l: 32 };
    const CANNON_WATER = { cannon_s: 1, snowcannon: 2, cannon_l: 4 };
    const RESERVOIR_WATER = 8;                       // Kapazität eines Wasserspeichers
    const RESERVOIR_BIG_WATER = 40;                  // großer Stausee: fünffache Menge
    const waterNeed = () => built.cannon_s * CANNON_WATER.cannon_s
        + built.snowcannon * CANNON_WATER.snowcannon + built.cannon_l * CANNON_WATER.cannon_l;
    const waterSupply = () => built.reservoir * RESERVOIR_WATER
        + built.reservoir_l * RESERVOIR_BIG_WATER;
    // Anteil der Kanonen, die tatsächlich Wasser haben (0..1)
    const snowmakingRatio = () => {
        const need = waterNeed();
        if (need === 0) return 0;
        return Math.max(0, Math.min(1, waterSupply() / need));
    };
    // Wurfweiten-Faktor: ohne Wasser schneit die Kanone nur kurz vor sich hin,
    // mit Stausee erreicht sie ihre volle Reichweite. So bleibt die Wasserlogik
    // spürbar, ohne dass eine frisch gebaute Kanone komplett wirkungslos wirkt.
    const cannonPower = () => 0.4 + 0.6 * snowmakingRatio();
    // Infofeld-Daten für ein angeklicktes Objekt (Live-Werte)
    function infoFor(sel) {
        const t = sel.type;
        const meta = {
            ticket:     { icon: '🎫', name: 'Kasse',        desc: 'Verkauft Skipässe. Ohne Kasse kommen keine Gäste.' },
            lift:       { icon: '🚡', name: 'Lift',         desc: 'Bringt Gäste den Berg hinauf und erschließt Pisten.' },
            chairlift:  { icon: '🚡', name: 'Sessellift',   desc: 'Komfortabler Lift mit hoher Förderleistung.' },
            surfacelift:{ icon: '🎿', name: 'Schlepplift',  desc: 'Günstiger Lift für Anfängerhänge.' },
            aerialtram: { icon: '🚠', name: 'Pendelbahn',   desc: 'Große Kabinenbahn für viele Gäste.' },
            hotel:      { icon: '🏨', name: 'Alpenhotel',   desc: '90 Betten. Balkonreihen, Erker und Wintergarten.' },
            restaurant: { icon: '🍽️', name: 'Restaurant',   desc: 'Laufender Gastro-Umsatz je Gast.' },
            chalet:     { icon: '🏡', name: 'Chalet',       desc: 'Gemütliche Unterkunft am Hang.' },
            funpark:    { icon: '🏂', name: 'Funpark',      desc: 'Steigert Attraktivität und Zufriedenheit.' },
            snowcannon: { icon: '❄️', name: 'Schneekanone', desc: 'Sichert die Schneedecke ab.' },
            parking:    { icon: '🅿️', name: 'Parkplatz',    desc: 'Ankommende Gäste parken hier und lösen Tickets.' },
            parkgarage: { icon: '🏢', name: 'Parkhaus',     desc: 'Große Kapazität für ankommende Autos.' },
            skischool:  { icon: '🎿', name: 'Skischule',    desc: 'Kurse für Anfänger — beliebt bei Familien.' },
            skirental:  { icon: '⛷️', name: 'Skiverleih',   desc: 'Leihausrüstung bringt Umsatz je Gast.' },
            shop:       { icon: '🛍️', name: 'Sport-Shop',   desc: 'Ausrüstung & Souvenirs.' },
            imbiss:     { icon: '🌭', name: 'Imbiss',       desc: 'Schneller Snack an der Piste.' },
            busstop:    { icon: '🚌', name: 'Bushaltestelle', desc: 'Gäste reisen auch ohne Auto an.' },
            garage:     { icon: '🚜', name: 'Garage (1× PB 300)', desc: 'Ohne Garage keine Pistenpräparierung!' },
            garage2:    { icon: '🚜', name: 'Garage (2× PB 300)', desc: 'Zwei Pistenraupen präparieren doppelt so schnell.' },
            garage4:    { icon: '🚜', name: 'Garage (4× PB 300)', desc: 'Große Halle für vier kompakte Pistenraupen.' },
            garage5_1:  { icon: '🚜', name: 'Garage (1× PB 500)', desc: 'Halle für den großen PistenBully 500.' },
            garage5_2:  { icon: '🚜', name: 'Garage (2× PB 500)', desc: 'Zwei große Maschinen — präparieren doppelt so breit.' },
            garage5_4:  { icon: '🚜', name: 'Garage (4× PB 500)', desc: 'Flotte aus vier Flaggschiffen für große Gebiete.' },
            funpark_s:  { icon: '🏂', name: 'Funpark (klein)', desc: 'Kicker und Rail für erste Sprünge.' },
            funpark_l:  { icon: '🏂', name: 'Funpark (groß)', desc: 'Big Air, Wallride, Halfpipe — Top-Laune!' },
            toilet:     { icon: '🚻', name: 'Toilettenhäuschen', desc: 'Erfüllt ein Grundbedürfnis — hebt die Laune.' },
            hotel_budget:{ icon: '🏨', name: 'Budget-Hotel',  desc: '60 Betten. Zweckbau mit Vordach — für Sparfüchse.' },
            hotel_mid:  { icon: '🏨', name: 'Vier-Sterne-Hotel', desc: '130 Betten. Seitenflügel, Glasfoyer, Sonnenterrasse.' },
            hotel_pension:{ icon: '🏠', name: 'Pension',         desc: '25 Betten. Umgebautes Wohnhaus mit Gaststube.' },
            hotel_resort: { icon: '🏨', name: 'Resort',          desc: '180 Betten. Zwei Baukörper, Brücke, Außenpool.' },
            hotel_lux:  { icon: '🏩', name: 'Grandhotel',     desc: '250 Betten. Portal, Turm, Dachterrasse und Spa.' },
            chalet_s:   { icon: '🏡', name: 'Kleines Chalet',  desc: 'Gemütliche Unterkunft für wenige Gäste.' },
            chalet_l:   { icon: '🏡', name: 'Großes Chalet',   desc: 'Geräumiges Chalet für Gruppen.' },
            chalet_lux: { icon: '🏰', name: 'Luxus-Chalet',    desc: 'Panoramabalkon und beheizter Pool.' },
            huette:     { icon: '🛖', name: 'Berghütte',       desc: 'Rustikale Einkehr direkt an der Piste.' },
            bergrest:   { icon: '🍲', name: 'Bergrestaurant',  desc: 'Sonnenterrasse mit Schirmen.' },
            panorama:   { icon: '🌄', name: 'Panorama-Restaurant', desc: 'Glasfront mit Aussicht — sehr beliebt.' },
            sterne:     { icon: '⭐', name: 'Sterneküche',     desc: 'Gourmet auf dem Berg — Premium-Gäste lieben es.' },
            apres:      { icon: '🍻', name: 'Après-Ski-Bar',   desc: 'Feiern nach der letzten Abfahrt.' },
            partyzelt:  { icon: '⛺', name: 'Partyzelt',       desc: 'Günstige Partylocation mit Girlanden.' },
            disco:      { icon: '🪩', name: 'Diskothek',       desc: 'Nachtleben im Skigebiet.' },
            souvenir:   { icon: '🎁', name: 'Souvenir-Shop',   desc: 'Andenken für die Heimreise.' },
            medical:    { icon: '⛑️', name: 'Krankenstation',  desc: 'Erstversorgung bei Pistenunfällen.' },
            hospital:   { icon: '🏥', name: 'Krankenhaus',     desc: 'Klinik mit Helipad — maximale Sicherheit.' },
            workshop:   { icon: '🔧', name: 'Werkstatt',       desc: 'Wartung für Lifte und Pistenraupen.' },
            reservoir:  { icon: '💧', name: 'Wasserspeicher',  desc: 'Speist die Schneekanonen — ohne Wasser kein Kunstschnee.' },
            reservoir_l:{ icon: '🌊', name: 'Großer Stausee',  desc: 'Staumauer mit riesigem Vorrat — versorgt ein ganzes Kanonenfeld.' },
            kicker:     { icon: '⛷️', name: 'Kicker',          desc: 'Kleine Schanze für einen schnellen Sprung — günstiger Einstieg.' },
            halfpipe:   { icon: '🏂', name: 'Halfpipe',        desc: 'Wettkampf-Pipe mit Startturm und Flutlicht — starker Laune-Bonus.' },
            racecourse: { icon: '🏁', name: 'Rennstrecke',     desc: 'Riesentorlauf mit Start, Ziel, Tribüne und Zeitmessung.' },
            cannon_s:   { icon: '❄️', name: 'Schneekanone (klein)', desc: 'Beschneit einen kleinen Radius — braucht Wasser aus einem Stausee.' },
            cannon_l:   { icon: '🗼', name: 'Schnee-Lanze',    desc: 'Große Reichweite, hoher Wasserbedarf — Stausee nötig.' },
            sauna:      { icon: '🧖', name: 'Sauna-Anlage',    desc: 'Wellness nach dem Skitag.' },
            therme:     { icon: '♨️', name: 'Große Therme',    desc: 'Glaskuppel, Becken, Whirlpool — Top-Attraktion.' },
            eisbahn:    { icon: '⛸️', name: 'Eislaufbahn',     desc: 'Abwechslung abseits der Piste.' }
        }[t] || { icon: '📍', name: t, desc: '' };
        let liftTitle = null;   // benannte Liftanlage überschreibt die Überschrift
        // Ortschaft: rein informativ, nichts zu bauen oder abzureißen
        if (t === 'village') {
            return {
                icon: '🏘️', name: sel.villageName || 'Ortschaft',
                desc: 'Ortschaft — Ausgangspunkt für Gäste. Verbinde sie mit Liften und Pisten.',
                lines: [
                    { k: 'Typ', v: '🏘️ Ortschaft' },
                    { k: 'Gäste', v: '🚌 kommen hier an' },
                    { k: 'Hinweis', v: 'Nicht bebaubar, nicht abreißbar' }
                ],
                price: null, appeal: null, noDemolish: true
            };
        }
        // Gast-Infofeld (2D-Konzept: Name, Kategorie, Stimmung, aktuelle Tätigkeit)
        if (t === 'guest' && sel.guest) {
            const g = sel.guest;
            const act = g.state === 'queue' ? '🧍 steht am Lift an'
                : g.state === 'idle' ? '🧍 sucht einen Lift'
                : (g.state === 'walk' && g.visitType === 'ticket') ? '🎫 auf dem Weg zur Kasse'
                : (g.state === 'walk' && g.visitType === 'liftwalk') ? '🚶 geht zur Talstation'
                : g.state === 'lift' ? '🚡 fährt Lift'
                : g.state === 'piste' ? '⛷️ auf der Piste'
                : g.state === 'walk' ? '🚶 unterwegs'
                : g.state === 'visit' ? ({ hotel: '😴 schläft im Hotel', restaurant: '🍻 feiert vor der Hütte', imbiss: '🌭 isst einen Snack', chalet: '🏡 ruht sich aus', funpark: '🏂 ' + g.trick + ' im Funpark' }[g.visitType] || '🍻 feiert')
                : g.state === 'stroll' ? '🚶 schlendert übers Gelände'
                : g.state === 'arrive' ? '🎫 auf dem Weg zur Kasse'
                : '🧭 sucht ein Ziel';
            const m = Math.round(g.mood);
            const slopeName = { blue: '🔵 Blau (leicht)', red: '🔴 Rot (mittel)', black: '⚫ Schwarz (schwer)' }[g.slopePref];
            return {
                icon: '🧑', name: g.name,
                desc: g.cat.icon + ' ' + g.cat.name + ' — Preistoleranz ' + Math.round(g.cat.mult * 100) + '%',
                lines: [
                    { k: 'Gerade', v: act },
                    { k: 'Ausgegeben', v: '€' + g.spent },
                    { k: 'Liftpass', v: g.hasTicket ? ('✅ ' + g.passDays + ' Tage') : '❌ kein Skipass' },
                    ...(g.homeVillage ? [{ k: 'Angereist aus', v: '🏘️ ' + g.homeVillage }] : []),
                    { k: 'Pistenwunsch', v: slopeName },
                    // Statt des Lieblingstricks steht hier, was den Gast
                    // gerade stört — das ist die spielrelevante Information.
                    { k: 'Problem', v: g.gripe || '✅ alles bestens' }
                ],
                // Portrait: echtes Avatarbild (public/icons/guest_*.png), sonst prozedurales Gesicht
                avatarKey: g.avatarKey,
                portrait: { seed: g.seed, jacket: g.jacketColor, pants: g.pantsColor, helmet: g.helmetColor, mood: m },
                mood: m,
                needs: [
                    { k: 'Hunger', v: Math.round(g.hunger) },
                    { k: 'Durst', v: Math.round(g.thirst) },
                    { k: 'Toilette', v: Math.round(g.bladder) }
                ],
                wishes: g.wishes.map(w => ({ label: w[1], done: (g.doneWishes || []).includes(w[0]) })),
                price: null, appeal: null
            };
        }
        // Pisten-Infofeld (wie im 2D: Nummer, Schwierigkeit, Länge, Zustand)
        if (t === 'piste' && sel.piste) {
            const dNames = { blue: '🔵 Blau (leicht)', red: '🔴 Rot (mittel)', black: '⚫ Schwarz (schwer)' };
            const gm = Math.round(sim.groom);
            return {
                icon: '⛷️', name: 'Piste ' + sel.piste.no,
                iconKey: 'piste_' + sel.piste.diff,      // Schwierigkeits-Schild als Bild
                desc: 'Abfahrt Nr. ' + sel.piste.no + ' — Zustand hängt von Präparierung (Raupengarage) und Betrieb ab.',
                lines: [
                    { k: 'Schwierigkeit', v: dNames[sel.piste.diff] || sel.piste.diff },
                    { k: 'Breite', v: ({ narrow: 'schmal', medium: 'mittel', wide: 'breit', xwide: 'extrabreit (Funpark/Halfpipe/Rennstrecke möglich)' })[sel.piste.width] || 'mittel' },
                    { k: 'Länge', v: sel.piste.km + ' km' },
                    { k: 'Zustand', v: gm + '% ' + (gm > 75 ? '🟢' : gm > 45 ? '🟡' : '🔴') },
                    { k: 'Präparierung', v: built.garage > 0 ? '🚜 aktiv' : '⚠️ keine Garage' }
                ], price: null, appeal: null
            };
        }
        const lines = [];
        let price = null, appeal = null, ads = null, occupancy = null;
        lines.push({ k: 'Baukosten', v: '€' + (sel.cost || 0).toLocaleString('de-DE') });
        if (t === 'ticket') {
            // Skipass-Preis global einstellbar wie im 2D (50%..200% der Basis)
            price = { label: 'Skipass Tagespreis', value: skiPassPrice(), base: eco.baseSkiPass, min: Math.round(eco.baseSkiPass * 0.5), max: Math.round(eco.baseSkiPass * 2) };
            appeal = catAppeal(skiPassPrice() / eco.baseSkiPass);
            lines.push({ k: 'Attraktivität', v: skiPassAttract() + '%' });
            lines.push({ k: 'Gäste heute', v: Math.round(sim.carGuestsToday) });
            const akt = eco.ad.daysLeft > 0 ? AD_PACKAGES.find(a => a.id === eco.ad.id) : null;
            lines.push({ k: 'Werbung', v: akt ? akt.icon + ' ' + akt.name : '— keine' });
            if (akt) lines.push({ k: 'Läuft noch', v: eco.ad.daysLeft + ' Tage' });
            // Auswahl der Kampagnen fürs Menü
            ads = {
                activeId: eco.ad.daysLeft > 0 ? eco.ad.id : null,
                daysLeft: eco.ad.daysLeft,
                boostPct: Math.round((adBoost() - 1) * 100),
                packages: AD_PACKAGES.map(a => ({
                    id: a.id, icon: a.icon, name: a.name, desc: a.desc, cost: a.cost,
                    boostPct: Math.round(a.boost * 100),
                    affordable: money >= a.cost
                }))
            };
        }
        else if (t === 'parking' || t === 'parkgarage') {
            const lot = sel.lot;
            const cap = lot ? lot.cap : 0;
            const occ = lot ? Math.round(lot.occ || 0) : 0;
            const bp = lot ? lot.basePrice : (t === 'parkgarage' ? 20 : 10);
            price = { label: 'Tagesparkschein', value: (lot && lot.price != null) ? lot.price : bp, base: bp, min: Math.round(bp * 0.5), max: Math.round(bp * 2) };
            lines.push({ k: 'Kapazität', v: cap + ' Autos' });
            lines.push({ k: 'Belegt', v: occ + ' / ' + cap });
            lines.push({ k: 'Einnahmen', v: '€' + Math.round(lot ? (lot.income || 0) : 0).toLocaleString('de-DE') });
            lines.push({ k: 'Status', v: (lot && !lot.roadPath) ? '⚠️ keine Straße' : (occ >= cap ? '🔴 VOLL' : '🟢 frei') });
        }
        else if (t === 'lift' || t === 'chairlift' || t === 'surfacelift' || t === 'aerialtram') {
            // Echte Zahlen aus der Anlage in der Nähe des angeklickten Punktes
            let L = null, bd = Infinity;
            for (const r of guestRoutes) {
                if (r.kind !== 'lift') continue;
                for (const st of [r.bottom, r.top]) {
                    const d = Math.hypot(st.gx * tile - half - sel.x, st.gy * tile - half - sel.z);
                    if (d < bd) { bd = d; L = r; }
                }
            }
            if (L) {
                // Wartezeit: wie viele Fahrzeuge braucht es, bis der Letzte dran ist?
                const waiting = L.queue.length + L.queueDown.length;
                const trips = Math.ceil(waiting / Math.max(1, L.cap));
                const waitSec = Math.max(0, trips - 1) * L.gap + L.timer;
                const perHour = Math.round(L.cap * 3600 / L.gap);
                // Auslastung: wie viel der Förderleistung wird tatsächlich genutzt
                const riding = guestPool.filter(g => g.state === 'lift' && g.route === L).length;
                const load = Math.min(100, Math.round((riding / Math.max(1, L.cap * 4)) * 100));
                // Der beim Bau vergebene Name wird zur Überschrift des Infofelds
                if (L.name) liftTitle = L.name;
                lines.push({ k: 'Auslastung', v: load + '%' });
                lines.push({ k: 'Wartezeit', v: waitSec < 1 ? 'keine' : Math.round(waitSec) + ' s' });
                lines.push({ k: 'In der Schlange', v: waiting });
                lines.push({ k: 'Unterwegs', v: riding });
                lines.push({ k: 'Kapazität', v: L.cap + ' pro Fahrzeug' });
                lines.push({ k: 'Takt', v: 'alle ' + L.gap.toFixed(1) + ' s' });
                lines.push({ k: 'Förderleistung', v: perHour + ' Gäste/h' });
                lines.push({ k: 'Talfahrt', v: L.canDescend ? 'möglich' : 'nicht möglich' });
            }
            lines.push({ k: 'Betrieb', v: '€3 / Tick' });
        }
        else if (bedsOf(t) > 0) {
            // ===== BELEGUNG EINER UNTERKUNFT =====
            const cap2 = bedsOf(t);
            const b2 = placedBuildings.find(bb => Math.hypot(bb.rec.x - sel.x, bb.rec.z - sel.z) < 1.2);
            const used = Math.round(b2?.occ ?? 0);
            const pct = cap2 > 0 ? Math.round(used / cap2 * 100) : 0;
            lines.push({ k: 'Betten', v: cap2 });
            lines.push({ k: 'Belegt', v: used + ' / ' + cap2 + '  (' + pct + '%)' });
            lines.push({ k: 'Auslastung', v: (pct > 92 ? '🔴 ausgebucht' : pct > 65 ? '🟡 gut gebucht' : pct > 25 ? '🟢 Zimmer frei' : '⚪ viel leer') });
            const nightly = ({ hotel_pension: 55, hotel_budget: 70, hotel: 95,
                               hotel_mid: 135, hotel_resort: 165, hotel_lux: 240 })[t] || 60;
            lines.push({ k: 'Übernachtung', v: '€' + nightly });
            lines.push({ k: 'Tagesumsatz', v: '€' + Math.round(used * nightly).toLocaleString('de-DE') });
            occupancy = { used, cap: cap2, pct };
            appeal = catAppeal(skiPassPrice() / eco.baseSkiPass);
        }
        else if (t === 'restaurant') { lines.push({ k: 'Gastro-Umsatz', v: '+1,2 / Gast' }); }
        else if (t === 'funpark') { lines.push({ k: 'Attraktivität', v: '+12' }); }
        else if (t.startsWith('garage')) {
            const bays = /4/.test(t.replace('garage5_', 'x')) || t === 'garage4' ? 4
                : (t === 'garage2' || t === 'garage5_2') ? 2 : 1;
            lines.push({ k: 'Modell', v: t.startsWith('garage5') ? 'PistenBully 500' : 'PistenBully 300' });
            lines.push({ k: 'Stellplätze', v: bays });
            lines.push({ k: 'Raupen gesamt', v: catCapacity() });
            lines.push({ k: 'Pistenzustand', v: Math.round(sim.groom) + '%' });
        }
        else if (t === 'funpark_s' || t === 'funpark_l') { lines.push({ k: 'Attraktivität', v: t === 'funpark_l' ? '+22' : '+6' }); lines.push({ k: 'Laune-Bonus', v: t === 'funpark_l' ? '+16' : '+4' }); }
        else if (t === 'toilet') { lines.push({ k: 'Attraktivität', v: '+2' }); lines.push({ k: 'Laune-Bonus', v: '+3' }); }
        // Beschneiung: Reichweite und Wasserversorgung anzeigen
        else if (t === 'cannon_s' || t === 'snowcannon' || t === 'cannon_l') {
            const need = waterNeed(), sup = waterSupply();
            lines.push({ k: 'Reichweite', v: (CANNON_RANGE[t] * 20) + ' m' });
            lines.push({ k: 'Wasserbedarf', v: CANNON_WATER[t] + ' Einheiten' });
            lines.push({ k: 'Versorgung', v: sup + ' / ' + need });
            lines.push({ k: 'Status', v: sup >= need ? '🟢 versorgt' : '🔴 zu wenig Wasser' });
        }
        else if (t === 'reservoir' || t === 'reservoir_l') {
            const need = waterNeed(), sup = waterSupply();
            lines.push({ k: 'Kapazität', v: (t === 'reservoir_l' ? RESERVOIR_BIG_WATER : RESERVOIR_WATER) + ' Einheiten' });
            lines.push({ k: 'Gesamt-Wasser', v: sup });
            lines.push({ k: 'Verbrauch', v: need });
            lines.push({ k: 'Auslastung', v: sup > 0 ? Math.round(need / sup * 100) + '%' : '—' });
            lines.push({ k: 'Status', v: sup >= need ? '🟢 reicht aus' : '🔴 zu wenig Wasser' });
        }
        else if (t === 'skischool') { lines.push({ k: 'Attraktivität', v: '+5' }); lines.push({ k: 'Umsatz', v: '+0,8 / Gast' }); }
        else if (t === 'skirental') { lines.push({ k: 'Attraktivität', v: '+4' }); lines.push({ k: 'Umsatz', v: '+0,9 / Gast' }); }
        else if (t === 'shop') { lines.push({ k: 'Attraktivität', v: '+3' }); lines.push({ k: 'Umsatz', v: '+0,6 / Gast' }); }
        else if (t === 'imbiss') { lines.push({ k: 'Attraktivität', v: '+2' }); lines.push({ k: 'Umsatz', v: '+0,7 / Gast' }); }
        else if (t === 'busstop') { lines.push({ k: 'Attraktivität', v: '+2' }); }
        return { icon: meta.icon, name: liftTitle || meta.name, desc: meta.desc, iconKey: t, lines, price, appeal, ads, occupancy };
    }
    // Ein Simulations-Tick (~1 Sekunde real):
    function simTick(dt) {
        const hasCore = built.ticket > 0 && built.lift > 0;
        // Attraktivität & Kapazität
        const funparkPts = built.funpark_s * 6 + built.funpark * 12 + built.funpark_l * 22;  // größer = beliebter
        const attract = built.lift * 9 + funparkPts + built.ticket * 3
            + totalGastro() * 4 + totalHotels() * 5 + totalNight() * 6 + totalWell() * 7
            + built.skischool * 5 + built.skirental * 4 + built.shop * 3 + built.souvenir * 2
            + built.busstop * 2 + built.toilet * 2 + built.medical * 3 + built.hospital * 8
            + (built.cannon_s + built.snowcannon + built.cannon_l) * 3 * snowmakingRatio();
        // ===== ATTRAKTIVITÄT ALS KENNZAHL =====
        // 0..100, aus dem Angebot, dem Pistenzustand, der Laune und der
        // laufenden Werbung. Sie steuert direkt, wie viele Fahrzeuge
        // ankommen — und steht sichtbar im HUD.
        {
            const angebot = Math.min(100, attract * 1.15);
            const zustand = sim.groom;                          // 0..100
            const laune = sim.mood != null ? sim.mood : 70;
            const preis = skiPassAttract();
            let score = angebot * 0.45 + zustand * 0.20 + laune * 0.20 + preis * 0.15;
            score *= 0.6 + 0.4 * Math.min(1.5, adBoost());       // Werbung hebt an
            sim.attract = Math.max(0, Math.min(100, Math.round(score)));
        }
        // ===== RUF =====
        // Wer LANGE attraktiv bleibt, spricht sich herum: der Ruf wächst bei
        // Score >= 60 in etwa drei Minuten auf 100 % und fällt darunter
        // langsam wieder. Er hebt Zustrom und Kapazität spürbar an.
        {
            const a = sim.attract || 0;
            const d = a >= 60 ? dt / 180 * ((a - 50) / 50) : -dt / 150;
            sim.reput = Math.max(0, Math.min(1, (sim.reput || 0) + d));
        }
        const reputF = 1 + 0.7 * (sim.reput || 0);
        // Kapazität: Liftleistung plus die tatsächlich gebauten Betten
        const beds = totalBeds();
        const capacity = (built.lift * 22 + beds + 15) * (1 + 0.4 * (sim.reput || 0));
        // Skipass-Preis steuert den Zustrom (teuer = weniger Gäste, dafür mehr €/Ticket)
        // Werbung zieht zusätzliche Gäste an — die Kapazität bleibt aber die
        // harte Grenze: ohne Lifte und Betten nützt die beste Kampagne nichts.
        const targetActive = hasCore
            ? Math.min(capacity, attract * 3 * (skiPassAttract() / 100) * adBoost() * reputF) : 0;
        // Gäste kommen/gehen (glatt annähern)
        const prev = sim.active;
        sim.active += (targetActive - sim.active) * Math.min(1, dt * 0.25);
        if (sim.active < 0.1) sim.active = 0;
        // Neu angekommene zahlen Skipass (einmalig)
        const arrived = Math.max(0, sim.active - prev);
        if (arrived > 0.01) {
            const rev = arrived * skiPassPrice() * (1 + totalHotels() * 0.12);
            sim.revenue += rev; sim.dayRevenue += rev; money += rev; sim.served += arrived;
            if (onMoney) onMoney(money);
        }
        // laufender Gastro-/Hotel-/Shop-Umsatz je aktivem Gast (2D: dailyRevenue-Konzept)
        if (sim.active > 0) {
            const rev = sim.active * dt * (2 + totalGastro() * 1.2 + totalHotels() * 0.8 + totalNight() * 1.4 + totalWell() * 1.6 + built.souvenir * 0.5
                + built.imbiss * 0.7 + built.shop * 0.6 + built.skirental * 0.9 + built.skischool * 0.8);
            sim.revenue += rev; sim.dayRevenue += rev; money += rev;
        }
        // ===== BELEGUNG DER UNTERKÜNFTE: ECHTE BUCHUNGEN =====
        // Gäste checken ein, bleiben ihre gebuchten Tage (DAY_SEC je Tag)
        // und reisen dann wieder ab. Ein volles Haus nimmt niemanden mehr —
        // die unerfüllte Nachfrage wird gezählt und im HUD gemeldet.
        {
            const houses = placedBuildings.filter(b => bedsOf(b.type) > 0)
                .sort((x, y) => bedsOf(y.type) - bedsOf(x.type));
            let used = 0, beds2 = 0;
            for (const b of houses) {
                if (!b.bookings) b.bookings = [];
                // Abreisen
                for (let i = b.bookings.length - 1; i >= 0; i--) {
                    b.bookings[i].t -= dt;
                    if (b.bookings[i].t <= 0) b.bookings.splice(i, 1);
                }
                b.occ = b.bookings.reduce((a, k) => a + k.n, 0);
                used += b.occ; beds2 += bedsOf(b.type);
            }
            sim.beds = beds2;
            // Nachfrage: ein Teil der aktiven Gäste will übernachten
            const demand = sim.active * 0.62;
            let open = demand - used;
            sim.hotelFull = 0;
            if (open > 0.5) {
                // Anreise in Gruppen (1..4 Personen), gute Häuser zuerst
                sim.bookAcc = (sim.bookAcc || 0) + dt * Math.min(open, 6) * 0.35;
                while (sim.bookAcc >= 1 && open > 0.5) {
                    sim.bookAcc -= 1;
                    const n = 1 + Math.floor(Math.random() * 4);
                    const b = houses.find(h => bedsOf(h.type) - h.occ >= n);
                    if (!b) { sim.hotelFull = Math.round(open); break; }
                    // 1..6 Tage à 30 s Echtzeit (wie die Autos am Parkplatz)
                    const r = Math.random();
                    const days = r < 0.4 ? 1 : r < 0.7 ? 2 : r < 0.88 ? 3 : 4 + Math.floor(Math.random() * 3);
                    b.bookings.push({ n, t: days * 30 });
                    b.occ += n; used += n; open -= n;
                }
                // keine Gruppe passt mehr irgendwo hinein → voll
                if (open > 0.5 && !houses.some(h => bedsOf(h.type) - h.occ >= 1)) sim.hotelFull = Math.round(open);
            }
            sim.bedsUsed = used;
            for (const b of houses) {
                const cap2 = bedsOf(b.type);
                if (b.mesh?.userData?.setOccupancy) b.mesh.userData.setOccupancy(b.occ, cap2);
            }
        }
        // laufende Betriebskosten (Lifte/Gebäude, 2D: maintenanceCost)
        const cost = dt * (built.lift * 3 + totalGastro() * 1.5 + totalHotels() * 2 + built.snowcannon * 0.8
            + (built.funpark_s * 1 + built.funpark * 2 + built.funpark_l * 3.5)
            + built.skischool * 1 + built.skirental * 0.8 + built.shop * 0.8 + built.souvenir * 0.5 + built.busstop * 0.3
            + (built.garage * 1.2 + built.garage2 * 2 + built.garage4 * 3.6)
            + (built.garage5_1 * 2 + built.garage5_2 * 3.4 + built.garage5_4 * 6)
            + totalNight() * 1.8 + totalWell() * 2.5 + built.medical * 1.5 + built.hospital * 6
            + built.workshop * 1.2 + built.reservoir * 1 + built.reservoir_l * 4.5 + built.toilet * 0.3);
        money -= cost; sim.dayCost += cost;
        // Pistenzustand (wie 2D): Gäste fahren die Piste ab, Raupe (mit Garage) präpariert
        const wear = sim.active * dt * 0.05;                             // Abnutzung durch Betrieb
        const groomRate = (catCapacity() + cat500Count() * 0.8) * dt * 2.2;   // 500er präpariert breiter
        // Beschneiung: nur Kanonen mit Wasseranschluss (Stausee) produzieren Schnee
        const snowGuns = built.cannon_s + built.snowcannon + built.cannon_l;
        const snowRate = snowGuns * snowmakingRatio() * dt * 1.6;   // Schnee nur mit Wasser                      // je Pistenraupe mehr Präparierung
        sim.groom = Math.max(5, Math.min(100, sim.groom - wear + groomRate + snowRate));
        // Pistenzustand sichtbar machen: frisch = strahlend weiß, verspurt = gräulich
        const gq = sim.groom / 100;
        for (const m of pisteSnowMats) m.color.setRGB(0.83 + 0.12 * gq, 0.86 + 0.105 * gq, 0.86 + 0.14 * gq);
        // ===== ABSCHNITTSWEISER VERSCHLEISS =====
        // Je mehr Gäste unterwegs sind, desto schneller wird die Piste verspurt.
        // Der Wert sinkt gleichmäßig; die Raupe hebt ihn lokal wieder an.
        // Verschleiß bewusst TRÄGE: eine frisch gewalzte Piste soll lange gut
        // aussehen und erst gegen Nachmittag zerfahren wirken. Die Testwerte
        // von vorher waren rund viermal so schnell.
        const bedWear = dt * (0.0026 + Math.min(0.016, sim.active * 0.0003));
        let bedSum = 0, bedN = 0;
        for (const bed of pisteBeds) {
            if (!bed.groom) continue;
            for (let k = 0; k < bed.groom.length; k++) {
                if (bed.groom[k] > 0) bed.groom[k] = Math.max(0, bed.groom[k] - bedWear);
                bedSum += bed.groom[k]; bedN++;
            }
        }
        // Der HUD-Wert ist jetzt der Durchschnitt der echten Abschnitte
        if (bedN) sim.groom = Math.round((bedSum / bedN) * 100);
        // Zufriedenheit: Angebot hebt, Überfüllung + schlechte Piste senken
        const overcrowd = capacity > 0 ? Math.max(0, sim.active / capacity - 0.85) : 0;
        const groomPenalty = Math.max(0, (60 - sim.groom)) * 0.3;        // unter 60% wird gemeckert
        // Funpark hebt die Laune — je größer, desto stärker; Toiletten ebenfalls
        const funMood = built.funpark_s * 4 + built.funpark * 9 + built.funpark_l * 16
            + built.kicker * 3 + built.halfpipe * 20 + built.racecourse * 26;
        const target = Math.max(20, Math.min(98, 55 + totalGastro() * 5 + funMood + totalHotels() * 2 + totalNight() * 4 + totalWell() * 5 + built.toilet * 3 + built.medical * 2 + built.hospital * 4 - overcrowd * 60 - groomPenalty));
        sim.satisfaction += (target - sim.satisfaction) * Math.min(1, dt * 0.3);
        // Lift-Auslastung -> besetzte Sessel/Bügel (nur wenn wirklich Gäste da sind)
        // Sitzbelegung folgt der ECHTEN Zahl fahrender Gäste, nicht mehr einer
        // Schätzung: so viele Sessel/Kabinen sind besetzt, wie Leute drin sitzen.
        let riding = 0, queued = 0;
        for (const gg of guestPool) {
            if (gg.state === 'lift') riding++;
            else if (gg.state === 'queue') queued++;
        }
        sim.riding = riding; sim.queued = queued;
        let stranded = 0, hurtN = 0, grumpy = 0, moodSum = 0, moodN = 0;
        for (const gg of guestPool) {
            if (gg.state === 'idle' && (gg.stranded || 0) > 2 && !gg.inVillage) stranded++;
            if (gg.state === 'down') hurtN++;
            if (gg.gripe) grumpy++;
            if (gg.mood != null) { moodSum += gg.mood; moodN++; }
        }
        sim.stranded = stranded; sim.injuredCount = hurtN;
        // Verärgerte Gäste und die DURCHSCHNITTLICHE Laune fürs HUD
        sim.grumpy = grumpy;
        sim.mood = moodN ? Math.round(moodSum / moodN) : 100;
        const seats = Math.max(1, guestRoutes.reduce((n, r) => n + (r.kind === 'lift' ? (r.cap || 4) * 6 : 0), 0));
        const ridingFrac = Math.max(0, Math.min(1, riding / seats));
        for (const h of liftHandles) h.setOccupancy(ridingFrac);
        // Tages-Gewinn (alle ~30s ein "Tag")
        sim.dayAcc += dt;
        // ===== WETTER & SCHNEEDECKE =====
        // Achtung Performance: Schneefall, Tauen und Neufärbung gehen jeweils
        // über das GESAMTE Gitter (bis ~140.000 Kacheln). Sie laufen daher
        // gedrosselt und in EINEM gemeinsamen Durchgang, nicht jede Sekunde
        // dreimal getrennt — sonst bricht die Bildrate ein.
        const lineMoved = updateWeather(dt);
        sim.snowAcc = (sim.snowAcc || 0) + dt;
        if (sim.snowAcc >= 2.5) {
            const sdt = sim.snowAcc;
            sim.snowAcc = 0;
            stepSnowCover(sdt);            // Naturschnee legt sich hin, Kunstschnee taut
            applySnowmaking();             // Kanonen schneien ihren Sektor nach
            repaintSnowCover();
        } else if (lineMoved && (sim.repaintAcc = (sim.repaintAcc || 0) + dt) >= 1.5) {
            sim.repaintAcc = 0;
            repaintSnowCover();            // Schneegrenze gewandert -> nachfärben
        } else {
            // Pistenbänder häufiger auffrischen als das ganze Gelände — nur so
            // sieht man die Raupe beim Arbeiten wirklich aufbessern.
            repaintPisteBeds();
        }
        if (sim.dayAcc >= 30) {
            const profit = sim.dayRevenue - sim.dayCost;
            if (profit > sim.bestDayProfit) sim.bestDayProfit = profit;
            sim.dayAcc = 0; sim.dayRevenue = 0; sim.dayCost = 0; sim.carGuestsToday = 0;
            // Kampagne läuft tageweise ab
            if (eco.ad.daysLeft > 0) {
                eco.ad.daysLeft--;
                if (eco.ad.daysLeft <= 0) eco.ad.id = null;
                emitStats();
            }
        }
    }



    // Höhen der Grundfläche eines Gebäudes: tiefster Fußpunkt (bündig aufsetzen)
    // + Gefälle (zu steil -> nicht baubar).
    const footprintStats = (gx, gy, rGrid) => {
        let minY = Infinity, maxY = -Infinity;
        for (let a = 0; a < 8; a++) {
            for (const rr of [0, rGrid * 0.6, rGrid]) {
                const px = gx + Math.cos(a / 8 * Math.PI * 2) * rr;
                const py = gy + Math.sin(a / 8 * Math.PI * 2) * rr;
                const y = yAtSmooth(px, py);
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
        return { minY, maxY, slope: maxY - minY };
    };

    // ===== BASIS AM KARTENRAND + PISTE PLANEN (vor Terrain/Wald-Bau) =====
    // Gipfel = höchster Punkt (innen). Basis = tiefste begehbare RANDkachel
    // (Talausgang), wo Straße/Parkplatz/Gebäude/Lift ansetzen. Der Lift führt
    // von der Randbasis hinauf zum Gipfel, die Piste vom Gipfel zur Basis.
    let RSX = 0, RSY = 0, RVX = 0, RVY = 0;
    let EDGE_GX = 4, EDGE_GY = 4; // Einfahrtspunkt am Kartenrand (Talausgang)
    const routePts = [];
    {
        const G = gridSize, hm = heightmap, lc = world.landcover;
        const slopeAt = (x, y) => {
            const xi = Math.max(1, Math.min(G - 2, x)), yi = Math.max(1, Math.min(G - 2, y)), i = yi * G + xi, z = hm[i];
            return Math.max(Math.abs(z - hm[i - 1]), Math.abs(z - hm[i + 1]), Math.abs(z - hm[i - G]), Math.abs(z - hm[i + G]));
        };
        const okTile = (x, y) => { if (x < 3 || y < 3 || x >= G - 3 || y >= G - 3) return false; const i = (y | 0) * G + (x | 0); return lc[i] !== 2 && lc[i] !== 3 && slopeAt(x, y) < 8; };
        // Gipfel (höchster Punkt, innen)
        let maxZ = -1e9;
        for (let y = 8; y < G - 8; y++) for (let x = 8; x < G - 8; x++) { const h = hm[y * G + x]; if (h > maxZ) { maxZ = h; RSX = x; RSY = y; } }
        // tiefste begehbare RANDkachel (Talausgang am Spielfeldrand)
        const M = 4; let minZ = 1e18, EDGE_X = M, EDGE_Y = M;
        const consider = (x, y) => { const i = y * G + x; if (lc[i] === 2 || slopeAt(x, y) > 8) return; const h = hm[i]; if (h < minZ) { minZ = h; EDGE_X = x; EDGE_Y = y; } };
        for (let x = M; x < G - M; x++) { consider(x, M); consider(x, G - 1 - M); }
        for (let y = M; y < G - M; y++) { consider(M, y); consider(G - 1 - M, y); }
        // Basis-ZENTRUM ~14 Kacheln vom Rand in die Karte hinein (Richtung Gipfel),
        // damit Lift/Parkplatz nicht halb am Kartenrand liegen. Die Straße führt
        // vom Zentrum zurück zum Rand (Einfahrt von außerhalb).
        let ux = RSX - EDGE_X, uy = RSY - EDGE_Y; const ul0 = Math.hypot(ux, uy) || 1; ux /= ul0; uy /= ul0;
        RVX = Math.max(M + 2, Math.min(G - M - 2, Math.round(EDGE_X + ux * 17)));
        RVY = Math.max(M + 2, Math.min(G - M - 2, Math.round(EDGE_Y + uy * 17)));
        EDGE_GX = EDGE_X; EDGE_GY = EDGE_Y; // Einfahrtspunkt merken
        const BASE_GX = RVX, BASE_GY = RVY;

        // Demo-Piste: gerade Trasse vom Gipfel zur Basis (parallel zum Demo-Lift),
        // damit Lift und Piste garantiert Basis<->Gipfel verbinden.
        const rsteps = Math.max(20, Math.round(Math.hypot(RSX - BASE_GX, RSY - BASE_GY)));
        for (let i = 0; i <= rsteps; i++) { const t = i / rsteps; routePts.push({ gx: RSX + (BASE_GX - RSX) * t, gy: RSY + (BASE_GY - RSY) * t }); }

        // Wald entlang der Route zu präpariertem Schnee
        const rad = 3;
        for (const p of routePts) {
            const cx2 = Math.round(p.gx), cy2 = Math.round(p.gy);
            for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
                if (dx * dx + dy * dy > rad * rad) continue;
                const tx = cx2 + dx, ty = cy2 + dy;
                if (tx < 0 || ty < 0 || tx >= G || ty >= G) continue;
                const idx = ty * G + tx, code = lc[idx];
                if (code === 1 || code === 5 || code === 6) lc[idx] = 0;
            }
        }
        // Demo: Lift (Basis->Gipfel) + Piste (Gipfel->Basis)
        // Die Startanlage bekommt ebenfalls einen Namen — sonst zeigt das
        // Infofeld beim Anklicken der Station keine Bezeichnung an.
        const demoLift = makeLiftRoute({ gx: RSX, gy: RSY }, { gx: BASE_GX, gy: BASE_GY }, 'gondola', LIFT_PARAMS.gondola);
        demoLift.name = 'Talbahn 1';
        guestRoutes.push(demoLift);
        // Die Startabfahrt ist eine breite (nicht extrabreite) Piste.
        guestRoutes.push({ top: routePts[0], bottom: routePts[routePts.length - 1], path: routePts.slice(), kind: 'piste', width: 'wide', snowW: 3.8 });   // Startabfahrt ist BREIT, nicht extrabreit
    }

    // ===== BASIS-PLATTFORM am Kartenrand ebnen (Halbkreis in die Karte) =====
    const BASE_GX = RVX, BASE_GY = RVY;
    {
        const G = gridSize, hm = heightmap, lc = world.landcover;
        const baseH = hm[BASE_GY * G + BASE_GX];
        const inner = 15, outer = 24;
        for (let gy = Math.max(1, BASE_GY - outer); gy <= Math.min(G - 2, BASE_GY + outer); gy++) {
            for (let gx = Math.max(1, BASE_GX - outer); gx <= Math.min(G - 2, BASE_GX + outer); gx++) {
                const d = Math.hypot(gx - BASE_GX, gy - BASE_GY); if (d > outer) continue;
                const idx = gy * G + gx;
                if (lc[idx] === 2) continue;
                let f = d <= inner ? 1 : 1 - (d - inner) / (outer - inner); f = Math.max(0, Math.min(1, f));
                hm[idx] = hm[idx] * (1 - f) + baseH * f;
                if (f > 0.5) lc[idx] = 0;
            }
        }
    }

    // Terrain + Wald + Fels (Fels-Farbe der Steilflächen je Level getönt).
    // Das Gelände (auch Flussbetten) bleibt unverändert — kein Abflachen.
    const rockStyle = ROCK_STYLES[level?.id] || ROCK_STYLES._default;
    const terrain = buildTerrainMesh(world, gridSize, theme, { hScale, tile, rockCol: rockStyle.base });
    scene.add(terrain);
    const forest = buildForest(world, gridSize, { hScale, tile, levelId: level?.id });
    // Schneelast sofort anwenden — sonst stehen die Bäume die erste Sekunde
    // grün da und die Hauben ploppen sichtbar nach.
    if (forest?.userData?.setSnowLoad) forest.userData.setSnowLoad(weather.treeLoad);
    if (forest) {
        scene.add(forest);
        // weitere Baumarten (Tannen, Laubbäume, Stämme) mit einhängen
        for (const m of (forest.userData.extraMeshes || [])) scene.add(m);
    }
    // Felsen um mehrere Gipfel konzentrieren (nicht flächendeckend)
    const rockPeaks = findTopPeaks(heightmap, gridSize, 7, gridSize * 0.09);
    const rocks = buildRocks(world, gridSize, { hScale, tile, rock: rockStyle, peaks: rockPeaks });
    if (rocks) scene.add(rocks);
    // ===== FELSEN ALS HINDERNIS FÜR DIE KAMERA =====
    // Oberkante der Felsblöcke je Rasterzelle. Die Kamera bleibt auch darüber,
    // sonst steckt sie beim Heranzoomen am Gipfel mitten im Blockfeld. Das Raster
    // entsteht aus den tatsächlich vorhandenen Blöcken und wird neu aufgebaut,
    // sobald für eine Trasse Felsen entfernt wurden.
    const ROCK_CELL = 2;
    const rockGridN = Math.ceil(worldSpan / ROCK_CELL) + 1;
    let rockTops = null;
    const buildRockTops = () => {
        const tops = new Float32Array(rockGridN * rockGridN).fill(-1e9);
        if (!rocks) return tops;
        const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        const cell = (w) => Math.max(0, Math.min(rockGridN - 1, Math.floor((w + half) / ROCK_CELL)));
        rocks.traverse((o) => {
            if (!o.isInstancedMesh) return;
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            const r0 = o.geometry.boundingSphere.radius;
            for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, m); m.decompose(p, q, s);
                const reach = r0 * Math.max(s.x, s.y, s.z);
                if (reach < 0.9) continue;                    // Kiesel und entfernte Steine zählen nicht
                const top = p.y + reach;
                const x0 = cell(p.x - reach), x1 = cell(p.x + reach), z0 = cell(p.z - reach), z1 = cell(p.z + reach);
                for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
                    const k = cz * rockGridN + cx;
                    if (top > tops[k]) tops[k] = top;
                }
            }
        });
        return tops;
    };
    const rockTopAt = (wx, wz) => {
        if (!rockTops) rockTops = buildRockTops();
        const cx = Math.floor((wx + half) / ROCK_CELL), cz = Math.floor((wz + half) / ROCK_CELL);
        if (cx < 0 || cz < 0 || cx >= rockGridN || cz >= rockGridN) return -1e9;
        return rockTops[cz * rockGridN + cx];
    };
    if (rocks?.userData?.clearAlong) {
        const clearRocks = rocks.userData.clearAlong;
        rocks.userData.clearAlong = (...args) => {
            const touched = clearRocks(...args);
            if (touched) rockTops = null;                     // beim nächsten Blick neu aufbauen
            return touched;
        };
    }
    // Gletscher (eisige Flächen) in den passenden Höhenlagen
    const glacierTiles = [];
    for (let i = 0; i < world.landcover.length; i++) if (world.landcover[i] === 8) glacierTiles.push(i);
    const glacier = buildGlacier(glacierTiles, heightmap, gridSize, { hScale, tile });
    if (glacier) scene.add(glacier);

    // Wasser: Seen und Bäche als eine glatte Fläche mit Tiefe, Wellen und Strömung (Water3D.js)
    const water = buildWater(world, gridSize, waterInfo, { tileSize: tile });
    if (water) scene.add(water);
    let firstLake = null;
    for (const lk of findLakes(world.landcover, heightmap, gridSize)) {
        if (!firstLake) {
            // eine Uferkachel (Nachbar ist Land) als Bank-Standort
            for (const idx of lk.tiles) {
                const gx = idx % gridSize, gy = (idx / gridSize) | 0;
                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nx = gx+dx, ny = gy+dy;
                    if (nx<0||ny<0||nx>=gridSize||ny>=gridSize) continue;
                    if (world.landcover[ny*gridSize+nx] !== 2) {
                        firstLake = { gx: nx, gy: ny, rot: Math.atan2(gy-ny, gx-nx) };
                        break;
                    }
                }
                if (firstLake) break;
            }
        }
    }

    // Beleuchtung
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    sun.position.set(-worldSpan*0.35, worldSpan*0.8, worldSpan*0.28);
    // Schattenkarte vervierfacht und Frustum enger gefasst: das erhöht die
    // effektive Auflösung erheblich und lässt Konturen sauber statt matschig
    // erscheinen.
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.near = 1; sc.far = worldSpan * 2.0;
    sc.left = -worldSpan * 0.46; sc.right = worldSpan * 0.46;
    sc.top = worldSpan * 0.46; sc.bottom = -worldSpan * 0.46;
    sun.shadow.bias = -0.00022;
    sun.shadow.normalBias = 0.35;      // gegen Schattenakne auf Rundungen
    sun.shadow.radius = 2.2;           // weiche Schattenkante
    scene.add(sun);
    // Himmelslicht (kühl von oben, warm reflektiert vom Schnee) — sorgt für
    // Plastizität in den Schatten statt flachem Grau.
    const hemiLight = new THREE.HemisphereLight(topC.getHex(), 0xa8bcd2, 0.85);
    scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.26);
    scene.add(ambientLight);
    // Schwaches Gegenlicht: hebt Silhouetten von Bergen und Bäumen ab.
    const rim = new THREE.DirectionalLight(0xcfe2f5, 0.34);
    rim.position.set(worldSpan * 0.5, worldSpan * 0.35, -worldSpan * 0.45);
    scene.add(rim);

    // Sichtbare Sonne + weiches Strahlen-Halo (Billboard, additiv)
    // Sie steht weit HINTER der Bergkulisse. Vorher saß sie 1.4 Kartenbreiten vom
    // Mittelpunkt: beim Herauszoomen kam ihr die Kamera so nah, dass sie zum
    // riesigen weißen Fleck wurde. Größe und Halo sind mitskaliert – vom Gebiet aus
    // wirkt sie gleich groß. Der Dunst erfasst sie nicht mehr (er hatte sie abends
    // nur zufällig verschluckt); stattdessen folgt sie dem Sonnenstand und blendet
    // aus, sobald die Abendsonne (sunDisc/sunHalo weiter unten) übernimmt.
    const SUN_ORB_DIST = Math.min(worldSpan * 3.4, Math.min(4200, worldSpan * 4.2) * 0.82);
    const sunOrb = (function addSun() {
        const sunDir = sun.position.clone().normalize();
        const sunPos = sunDir.multiplyScalar(SUN_ORB_DIST);
        const k = SUN_ORB_DIST / (worldSpan * 1.4);
        // Kern
        const core = new THREE.Mesh(new THREE.SphereGeometry(worldSpan * 0.03 * k, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false, transparent: true }));
        core.position.copy(sunPos); scene.add(core);
        // radialer Glow via CanvasTexture
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const ctx = cv.getContext('2d');
        const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, 'rgba(255,244,214,0.9)');
        grd.addColorStop(0.25, 'rgba(255,236,180,0.5)');
        grd.addColorStop(1, 'rgba(255,236,180,0)');
        ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(cv);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        halo.scale.setScalar(worldSpan * 0.42 * k);
        halo.position.copy(sunPos); scene.add(halo);
        return { core, halo };
    })();

    // Wolken am Himmel
    // ===== ALPENKULISSE =====
    // Verlaufshimmel statt flacher Hintergrundfarbe, dahinter drei gestaffelte
    // Bergketten mit Luftperspektive. Beides folgt dem Tageslicht.
    const skyDome = makeSkyDome(Math.min(4200, worldSpan * 4.2));
    scene.add(skyDome);
    // Charakter der Fernkulisse je Level: Mittelgebirge weich und bewaldet,
    // Hochgebirge schroff mit Gletschern, Küstenlevel dazwischen.
    const RANGE_STYLE = {
        mittelgebirge: { rugged: 0.10, forest: 0.95, glacier: 0.00 },
        alpen:         { rugged: 0.72, forest: 0.55, glacier: 0.55 },
        schweiz:       { rugged: 0.85, forest: 0.42, glacier: 0.75 },
        frankreich:    { rugged: 0.68, forest: 0.50, glacier: 0.45 },
        italien:       { rugged: 0.90, forest: 0.34, glacier: 0.40 },  // Dolomiten: sehr schroff
        norwegen:      { rugged: 0.48, forest: 0.62, glacier: 0.60 },  // rund geschliffen
        rockies:       { rugged: 0.76, forest: 0.58, glacier: 0.35 },
        kanada:        { rugged: 0.62, forest: 0.85, glacier: 0.45 },
        anden:         { rugged: 0.88, forest: 0.28, glacier: 0.70 },
        japan:         { rugged: 0.55, forest: 0.70, glacier: 0.25 }
    };
    const ranges = makeDistantRanges(worldSpan,
        RANGE_STYLE[level?.id] || { rugged: 0.55, forest: 0.6, glacier: 0.35 });
    scene.add(ranges);
    // Geländeschürze: setzt die Karte nach außen fort und lässt sie in den
    // Horizontdunst übergehen — sonst endet das Spielfeld an einer Kante.
    const apron = buildTerrainApron(world, gridSize, theme, {
        hScale, tileSize: tile, hazeColor: 0xcddff0
    });
    // Die Schürze färbt sich nach HÖHE und Schneelage — sie wird deshalb bei
    // jedem Wetterwechsel neu eingefärbt (siehe repaintSnowCover).
    scene.add(apron);
    // Umland-Wald und Talnebel: die Schürze allein wirkt wie eine Rampe.
    const apronForest = buildApronForest(world, gridSize, {
        hScale, tileSize: tile, count: 16000,
        hue: (FOREST_MIX_TABLE[level?.id] || FOREST_MIX_TABLE.alpen || {}).hue || undefined,
        surfacePoint: apron.userData.pointAt        // Bäume stehen genau auf der vernetzten Schürze
    });
    scene.add(apronForest);
    const valleyHaze = buildValleyHaze(world, gridSize, { hScale, tileSize: tile });
    scene.add(valleyHaze);
    const apronLights = buildApronLights(world, gridSize, { hScale, tileSize: tile });
    scene.add(apronLights);
    scene.add(buildEdgeShade(world, gridSize, { hScale, tileSize: tile }));
    // ===== ORTSCHAFTEN =====
    // Rein dekorativ, aber Ausgangspunkt des Skigebiets: ab Level 2 gibt es
    // mehrere Orte (bis zu drei), die der Spieler mit Liften und Pisten
    // erschließen kann. In jedem Ort kommen Gäste an.
    const villages = [];
    const VSTYLE = {
        mittelgebirge: 'schwarzwald', alpen: 'alpin', schweiz: 'alpin',
        frankreich: 'alpin', italien: 'dolomiten', norwegen: 'nordisch',
        rockies: 'nordamerika', kanada: 'nordamerika', anden: 'anden', japan: 'japan'
    };
    const VNAMES = {
        mittelgebirge: ['Tannbach', 'Hinterzell', 'Falkenau'],
        alpen:         ['Grünwald', 'Sankt Leonhard', 'Achenkirch'],
        schweiz:       ['Zermatten', 'Grindelbach', 'Saas Fee'],
        frankreich:    ['Val Clair', 'Montfort', 'Les Deux Bois'],
        italien:       ['Val Serena', 'Colfosco', 'San Vito'],
        norwegen:      ['Fjordvik', 'Storhaugen', 'Bjørndal'],
        rockies:       ['Elk Ridge', 'Silver Creek', 'Pinehurst'],
        kanada:        ['Cedar Bay', 'Mount Hollis', 'Fraser Falls'],
        anden:         ['Punta Nevada', 'El Cóndor', 'Río Blanco'],
        japan:         ['Yukimura', 'Shirakane', 'Asahidake']
    };
    const clouds = makeClouds(worldSpan, 12, _maxH * hScale * 1.25);
    scene.add(clouds);

    // ===== BAUPHASE: neu geplante Lifte/Gebäude wachsen mit Gerüst hoch =====
    const constructions = [];
    const startConstruction = (obj, dur, onDone, anchor = null, ropeLine = null) => {
        // ===== BAUSTELLE =====
        // Bauzaun, Materialstapel, Kran mit schwenkendem Ausleger und Haken —
        // das Gebäude wächst stufenweise wie im Rohbau hoch statt gleichmäßig.
        const scaffold = new THREE.Group();
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xf5b301, emissive: 0x7c4a00, emissiveIntensity: 0.35, roughness: 0.6 });
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0xd9dee5, roughness: 0.7, metalness: 0.3 });
        // Gerüststangen an den Ecken
        for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), poleMat);
            pole.position.set(ox, 1.3, oz); scaffold.add(pole);
        }
        // Bauzaun rundum: Pfosten + Querlatten, ein Feld bleibt als Zufahrt offen
        for (let i = 0; i < 8; i++) {
            if (i === 6) continue;                        // Zufahrt
            const a = (i / 8) * Math.PI * 2;
            const fx = Math.cos(a) * 2.2, fz = Math.sin(a) * 2.2;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5), fenceMat);
            post.position.set(fx, 0.45, fz); scaffold.add(post);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.03), fenceMat);
            rail.position.set(Math.cos(a + Math.PI / 8) * 2.2, 0.72, Math.sin(a + Math.PI / 8) * 2.2);
            rail.rotation.y = -a - Math.PI / 8 + Math.PI / 2; scaffold.add(rail);
        }
        // Materialstapel: Paletten mit Brettern und ein Sandhaufen
        const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 }));
        pallet.position.set(1.6, 0.16, -1.7); scaffold.add(pallet);
        const pallet2 = pallet.clone(); pallet2.position.set(2.0, 0.14, -1.3);
        pallet2.rotation.y = 0.5; scaffold.add(pallet2);
        const sand = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.45, 10),
            new THREE.MeshStandardMaterial({ color: 0xc9b28a, roughness: 1 }));
        sand.position.set(-1.8, 0.22, 1.6); scaffold.add(sand);
        // ===== TURMDREHKRÄNE =====
        // Professionelle Gittermast-Kräne: hoher Turm aus Segmenten mit
        // Diagonalstreben, Führerkabine, langer Ausleger mit Laufkatze,
        // Gegenausleger mit Ballastblöcken und Spannseilen. Auf Gebäude-
        // baustellen stehen ZWEI davon, die versetzt schwenken.
        const ballastMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
        const craneJibs = [];
        const buildCrane = (cx, cz, height, jibLen, phase) => {
            const crane = new THREE.Group();
            crane.position.set(cx, 0, cz);
            // Gittermast: schlanke Segmente mit sichtbaren Querstreben
            const nSeg = Math.round(height / 0.9);
            for (let si = 0; si < nSeg; si++) {
                const seg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), poleMat);
                seg.position.y = si * 0.9 + 0.45; crane.add(seg);
                const brace = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), fenceMat);
                brace.position.y = si * 0.9 + 0.88; crane.add(brace);
            }
            // Führerkabine unterhalb der Drehbühne
            const cab2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42),
                new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 0.6 }));
            cab2.position.set(0.3, height - 0.5, 0); crane.add(cab2);
            // Drehteil: Ausleger + Gegenausleger + Turmspitze mit Abspannung
            const jg = new THREE.Group();
            jg.position.y = height;
            const jib = new THREE.Mesh(new THREE.BoxGeometry(jibLen, 0.14, 0.14), poleMat);
            jib.position.x = -jibLen / 2 + 0.4; jg.add(jib);
            const cJib = new THREE.Mesh(new THREE.BoxGeometry(jibLen * 0.35, 0.14, 0.14), poleMat);
            cJib.position.x = jibLen * 0.175 + 0.3; jg.add(cJib);
            for (let bi = 0; bi < 2; bi++) {
                const ballast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.4), ballastMat);
                ballast.position.set(jibLen * 0.35 + 0.1 - bi * 0.34, -0.24, 0); jg.add(ballast);
            }
            const apex = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 4), poleMat);
            apex.position.y = 0.5; jg.add(apex);
            for (const tx of [-jibLen + 0.6, jibLen * 0.35]) {   // Spannseile zur Spitze
                const span = Math.hypot(tx, 0.9);
                const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, span, 3), fenceMat);
                wire.position.set(tx / 2, 0.45, 0);
                wire.rotation.z = Math.atan2(0.9, -tx) - Math.PI / 2; jg.add(wire);
            }
            // Laufkatze mit Seil und Last
            const rope2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), fenceMat);
            rope2.position.set(-jibLen * 0.7, -0.5, 0); jg.add(rope2);
            const load2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.32),
                new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 }));
            load2.position.set(-jibLen * 0.7, -1.1, 0); jg.add(load2);
            crane.add(jg);
            scaffold.add(crane);
            craneJibs.push({ jib: jg, rope: rope2, load: load2, phase, x: -jibLen * 0.7 });
        };
        // Liftbaustellen (anchor gesetzt) bekommen einen SEHR großen Kran —
        // dort werden Stützen und Stationen in luftiger Höhe montiert.
        // Gebäudebaustellen bekommen zwei mittelgroße.
        if (anchor) {
            buildCrane(2.2, 2.2, 15.5, 8.0, 0);
            buildCrane(-2.6, -2.0, 10.5, 5.5, 2.1);
        } else {
            buildCrane(1.8, 1.8, 10.5, 6.0, 0);
            buildCrane(-2.2, -1.6, 7.6, 4.4, 2.1);
        }
        scaffold.userData.cranes = craneJibs;
        if (anchor) scaffold.position.copy(anchor);
        obj.add(scaffold);
        const grow = !anchor; // Gebäude wachsen; Lifte nicht skalieren (nur Gerüst)
        if (grow) obj.scale.y = 0.04;
        // ===== SEILFLUG MIT DEM LASTENHELIKOPTER =====
        // Beim Bau einer Seilbahn fliegt ein Schwerlasthubschrauber das
        // Zugseil über die gesamte Trasse ein — mehrere Flüge über die
        // Bauzeit verteilt.
        let cargo = null;
        if (ropeLine) {
            cargo = makeCargoHeli();
            cargo.visible = false;
            scene.add(cargo);
        }
        constructions.push({ obj, scaffold, t: 0, dur, onDone, grow, cargo, ropeLine });
    };
    const updateConstructions = (dt) => {
        for (let i = constructions.length - 1; i >= 0; i--) {
            const c = constructions[i]; c.t += dt; const p = Math.min(1, c.t / c.dur);
            if (c.grow) {
                // Stufenweise wie im Rohbau: 5 "Etagen", jede wächst weich an.
                const steps = 5;
                const st = Math.min(steps - 1, Math.floor(p * steps));
                const within = p * steps - st;
                const e = within * within * (3 - 2 * within);
                c.obj.scale.y = 0.04 + ((st + e) / steps) * 0.96;
            }
            // Kräne schwenken gemächlich und zeitversetzt, die Haken pendeln
            const ud = c.scaffold.userData;
            if (ud.cranes) {
                for (const cr of ud.cranes) {
                    cr.jib.rotation.y = Math.sin(c.t * 0.4 + cr.phase) * 1.4;
                    const lift2 = 0.7 + Math.sin(c.t * 0.7 + cr.phase) * 0.55;
                    cr.rope.scale.y = lift2; cr.rope.position.y = -lift2 / 2;
                    cr.load.position.y = -lift2 - 0.12;
                }
            }
            // Lastenheli: pendelt über der Trasse und legt das Seil aus
            if (c.cargo) {
                const LEG = c.dur / 3;                    // drei Flüge über die Bauzeit
                const f2 = (c.t % LEG) / LEG;
                const backLeg = Math.floor(c.t / LEG) % 2 === 1;
                const fr = backLeg ? 1 - f2 : f2;
                const A2 = c.ropeLine.a, B2 = c.ropeLine.b;
                const hx = A2.x + (B2.x - A2.x) * fr;
                const hz = A2.z + (B2.z - A2.z) * fr;
                const hy = A2.y + (B2.y - A2.y) * fr + 13 + Math.sin(c.t * 0.7) * 0.6;
                c.cargo.visible = p < 0.92;
                c.cargo.position.set(hx, hy, hz);
                // Nase in Flugrichtung
                const dxh = (B2.x - A2.x) * (backLeg ? -1 : 1);
                const dzh = (B2.z - A2.z) * (backLeg ? -1 : 1);
                c.cargo.rotation.y = Math.atan2(dxh, dzh);
                c.cargo.rotation.z = Math.sin(c.t * 0.9) * 0.05;   // leichte Querlage
                if (c.cargo.userData.update) c.cargo.userData.update(c.t);
            }
            if (p >= 1) {
                c.obj.remove(c.scaffold);
                if (c.cargo) scene.remove(c.cargo);
                if (c.grow) c.obj.scale.y = 1;
                if (c.onDone) c.onDone();
                constructions.splice(i, 1);
            }
        }
    };


    // ===== DEMO-ANLAGE =====
    const updaters = [];
    const liftHandles = []; // Lifte mit setOccupancy — für Sessel-Besetzung nach Auslastung
    // Anlagen mit Nachtbeleuchtung (Kabinenlicht + Mast-Blinklichter)
    const nightLit = [];
    // Fahrzeuge mit eigener Nachtbeleuchtung (Pistenraupen, Rettungsheli,
    // Skidoo). `cats` lebt in einer inneren Funktion und ist im Renderloop
    // nicht sichtbar — deshalb tragen sich die Meshes hier zentral ein.
    const nightVehicles = [];
    const floodlights = []; // Flutlichtmasten — nachts an (via applyDaylight)
    // ===== WIND: langsam drehende Richtung mit einzelnen Böen =====
    // `wind.x/z` ist die normierte Richtung, `strength` schwankt zwischen
    // leichter Brise und kräftiger Böe. Treibt Schnee, Fahnen und Baumwipfel.
    const wind = { x: 0.8, z: 0.6, strength: 0.35, dir: Math.random() * Math.PI * 2,
                   // Böen: `gust` 1 solange eine läuft, `gustF` ist ihr
                   // Verlauf 0..1, `gustPos` die Lage der Front quer zur Karte.
                   gustT: 12, gust: 0, gustAge: 0, gustPeak: 1.2, gustPos: 0, gustF: 0,
                   // Flauten: `lull` 1 solange eine läuft
                   lullT: 30, lull: 0, lullAge: 0, lullLen: 20 };
    const flags = [];        // wehende Fahnen/Wimpel (werden beim Bau gesammelt)
    const updateWind = (t, dt) => {
        // Richtung dreht sich sehr langsam, Stärke pulsiert in Böen
        wind.dir += dt * 0.05 * Math.sin(t * 0.07);
        wind.x = Math.cos(wind.dir); wind.z = Math.sin(wind.dir);
        // ===== FLAUTEN =====
        // Ohne sie lag der Grundwind nie unter 18 % und die Fahnen standen
        // permanent halb aus. Jetzt schläft der Wind zwischendurch komplett
        // ein und die Tücher hängen senkrecht am Mast.
        wind.lullT -= dt;
        if (wind.lullT <= 0 && wind.lull <= 0) {
            wind.lullT = 55 + Math.random() * 70;
            wind.lull = 1; wind.lullAge = 0;
            wind.lullLen = 16 + Math.random() * 18;
        }
        let calm = 0;
        if (wind.lull > 0) {
            wind.lullAge += dt;
            const u2 = wind.lullAge / wind.lullLen;
            if (u2 >= 1) wind.lull = 0;
            else calm = Math.sin(u2 * Math.PI);      // sanft ein und aus
        }
        const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1.7);
        // ===== EINZELNE BÖEN =====
        // Über dem gleichmäßigen Grundwind liegen seltene, kurze Böen. Sie
        // laufen als Front über das Gelände: erst schwillt der Wind an, dann
        // fegt eine Schneefahne durch, dann flaut es wieder ab.
        wind.gustT -= dt;
        if (wind.gustT <= 0 && wind.gust <= 0) {
            wind.gustT = 34 + Math.random() * 46;      // alle ~35-80 s eine Bö
            wind.gust = 1;
            wind.gustAge = 0;
            wind.gustPeak = 0.9 + Math.random() * 0.8;
            // Startpunkt am windzugewandten Kartenrand
            wind.gustPos = -worldSpan * 0.62;
        }
        let gustF = 0;
        if (wind.gust > 0) {
            wind.gustAge += dt;
            const GUST_LEN = 9;                        // Dauer einer Bö
            const u = wind.gustAge / GUST_LEN;
            if (u >= 1) { wind.gust = 0; }
            else {
                // Glockenkurve: sanft an, kurz voll, sanft ab
                gustF = Math.sin(u * Math.PI);
                gustF *= gustF;
                wind.gustPos = -worldSpan * 0.62 + u * worldSpan * 1.24;
            }
        }
        wind.gustF = gustF;
        // Eine Bö bricht jede Flaute sofort — deshalb erst dämpfen, dann Bö.
        wind.strength = Math.min(1.6, (0.18 + gust * 0.82) * (1 - calm * 0.97)
                                      + gustF * wind.gustPeak);
        // Anlagen informieren: hängende Kabinen legen sich in die Bö.
        setWindGust(gustF * wind.gustPeak, wind.dir);
        // ===== FAHNEN =====
        // Der Mast bleibt stehen, das TUCH dreht sich in die Windrichtung und
        // wird von einer wandernden Welle verformt (siehe makeFlagCloth).
        // Die Drehung enthält ein leichtes Gieren, damit nicht alle Fahnen
        // exakt parallel stehen — echte Fahnen pendeln um die Windrichtung.
        for (const f of flags) {
            const yaw2 = Math.sin(t * (0.9 + wind.strength * 1.4) + f.phase) * (0.05 + wind.strength * 0.22);
            // Das Tuch hängt oft in einer schon gedrehten Gruppe (Station,
            // Gebäude). Ohne Abzug dieser Elterndrehung zeigte es nicht in
            // die echte Windrichtung.
            f.mesh.rotation.y = -wind.dir - f.parentYaw + yaw2;
            if (f.wave) {
                f.wave(t, wind.strength);
                f.mesh.rotation.z = Math.sin(t * 1.7 + f.phase) * 0.04 * wind.strength;
            } else {
                // Fallback für einfache Brett-Fahnen ohne Tuchgeometrie
                const flutter = Math.sin(t * (5 + wind.strength * 6) + f.phase) * (0.1 + wind.strength * 0.35);
                f.mesh.rotation.z = flutter;
                if (f.mesh.scale) f.mesh.scale.x = 0.55 + wind.strength * 0.45;
            }
        }
    };
    // Fahnen registrieren, damit sie im Wind wehen
    const registerFlags = (obj) => {
        obj.traverse?.((o) => {
            if (o.isMesh && o.userData && o.userData.isFlag) {
                // Aufsummierte Y-Drehung aller Elterngruppen
                let py = 0;
                for (let q = o.parent; q; q = q.parent) py += q.rotation?.y || 0;
                flags.push({ mesh: o, phase: Math.random() * 6.28, parentYaw: py,
                             wave: o.userData.flagWave || null });
            }
        });
    };

    (function buildResort() {
        // Tal- und Bergstation auf bebaubaren Grund setzen (nie auf Fels/Wasser)
        const vSnap = snapToBuildable(RVX, RVY), sSnap = snapToBuildable(RSX, RSY);
        const sx = Math.round(sSnap.gx), sy = Math.round(sSnap.gy), vx = Math.round(vSnap.gx), vy = Math.round(vSnap.gy);
        const valley=worldPos(vx,vy), summit=worldPos(sx,sy);

        // Terrain-Profil entlang der Liftlinie (Seil folgt dem Berg)
        const samples=[];
        const S=Math.max(8,Math.floor(valley.distanceTo(summit)/4));
        for (let i=0;i<=S;i++){ const t=i/S; samples.push(yAt(vx+(sx-vx)*t, vy+(sy-vy)*t)); }

        const lift = makeLift(valley, summit, samples, { maxMast: 14, ...liftOpts });
        // Startlift: Felsen entlang seiner Trasse ebenfalls räumen
        if (rocks?.userData?.clearAlong) {
            rocks.userData.clearAlong([{ gx: RVX, gy: RVY }, { gx: RSX, gy: RSY }], 4.5);
        }
        scene.add(lift.group); applyGlassEnv(lift.group); registerFlags(lift.group); updaters.push(lift.update);
        if (lift.group.userData.setNight) nightLit.push(lift.group); if (lift.setOccupancy) liftHandles.push(lift);
        // Fahrzeuge an die Lift-Route hängen (echte Sitzplatzvergabe).
        // `demoLift` selbst liegt in einer anderen Funktion — die Route wird
        // deshalb über guestRoutes gesucht.
        {
            const lr = guestRoutes.find(r => r.kind === 'lift' && !r.model);
            if (lr) lr.model = lift;
        }
        // Der Start-Lift zählt wie ein gebauter Lift: Gäste kommen, kaufen Tickets,
        // er ist anklickbar und erscheint in Aufgaben/Statistik.
        built.lift++;
        addSelectable({ type: 'lift', cost: 15000, x: valley.x, z: valley.z, r: 3.0 });
        placedBuildings.push({ mesh: lift.group, cost: 15000, rec: { x: valley.x, z: valley.z, r: 3.0 }, type: 'lift' });
        // ===== STARTLIFT BELEGT SEIN GRUNDSTÜCK =====
        // Der Start-Lift landete zwar in `placedBuildings`, hat aber NIE
        // Kacheln im Belegungsraster beansprucht. Ortschaften, Straßen und
        // Parkplätze wussten deshalb nichts von ihm — und der Ortsparkplatz
        // landete regelmäßig genau auf der Talstation.
        for (const st0 of [{ gx: vx, gy: vy }, { gx: sx, gy: sy }]) {
            parcelClaim(st0.gx - 3, st0.gy - 3, 7, OCC_BUILD, 'lift');
        }

        const place=(obj,gx,gy,rotY=0,r=2.6,selType=null,selCost=0)=>{
            // ===== AUCH DIE STARTGEBÄUDE RASTEN EIN =====
            // Sie laufen jetzt durch dieselbe Parzellenlogik wie alles, was
            // der Spieler baut: ganze Kacheln, Gebäude mittig darauf.
            const nP = footprintSize(r);
            const tryAt = (cx, cy) => {
                const par = snapToParcel(cx, cy, r);
                if (!par.free) return null;
                for (let yy = par.oy; yy < par.oy + nP; yy++)
                    for (let xx = par.ox; xx < par.ox + nP; xx++)
                        if (!tileBuildable(xx, yy)) return null;
                return par;
            };
            let par = tryAt(gx, gy);
            if (!par) {
                // Spiralsuche in ganzen Kacheln statt auf krummen Kreisbahnen
                outer: for (let ring = 1; ring <= 12; ring++) {
                    for (let a = 0; a < ring * 8; a++) {
                        const an = (a / (ring * 8)) * Math.PI * 2;
                        const nx = Math.round(gx + Math.cos(an) * ring * 1.5);
                        const ny = Math.round(gy + Math.sin(an) * ring * 1.5);
                        if (nx < 3 || ny < 3 || nx > gridSize - 4 || ny > gridSize - 4) continue;
                        const cand = tryAt(nx, ny);
                        if (cand) { par = cand; break outer; }
                    }
                }
            }
            if (!par) par = snapToParcel(gx, gy, r);        // Notnagel: trotzdem setzen
            parcelClaim(par.ox, par.oy, par.n, OCC_BUILD, selType || 'start');
            const fx = par.gx, fy = par.gy;
            const fy2 = footprintStats(fx, fy, r * 0.8).minY;
            // ===== UNTERGRUND EINEBNEN — ABER SPÄTER =====
            // Gebaute Häuser bekommen das seit jeher, die VORGEBAUTEN nicht:
            // sie standen auf dem tiefsten Fußpunkt eines schrägen Hangs und
            // kippten optisch aus dem Gelände. Genau das ließ die
            // Anfangsbebauung schief wirken.
            // `flattenUnderBuilding` ist an dieser Stelle aber noch gar nicht
            // initialisiert (const, weiter unten). Ein `typeof`-Test hilft
            // nicht — bei einem const in der temporalen Todeszone wirft
            // schon der typeof. Die Fälle werden deshalb gesammelt und
            // nachträglich abgearbeitet.
            pendingFlatten.push({ obj, gx: fx, gy: fy, r: Math.max(1.2, par.n * 0.62), y: fy2 });
            obj.position.set(par.x, fy2, par.z); obj.rotation.y = snapYaw(rotY); scene.add(obj); registerFlags(obj); if(obj.userData.update) updaters.push(obj.userData.update);
            if (selType) {
                // Initiale Gebäude laufen durchs selbe System wie gebaute:
                // anklickbar, abreißbar, zählen in Simulation & Statistik
                addSelectable({ type: selType, cost: selCost, x: obj.position.x, z: obj.position.z, r });
                placedBuildings.push({ mesh: obj, cost: selCost, rec: { x: obj.position.x, z: obj.position.z, r },
                                       type: selType, parcel: { ox: par.ox, oy: par.oy, n: par.n } });
                if (built[selType] !== undefined) built[selType]++;
            }
            return obj;
        };
        // (Straßenbau + roadAt sind jetzt global in createScene3D verfügbar: addRoad/roadAt)

        // ===== BASISPLATZ: alles um das flache Pad-Zentrum (Talstation) anordnen =====
        // Richtung bergauf (zum Lift/Gipfel) und quer dazu
        let upx = sx - vx, upy = sy - vy; const ul = Math.hypot(upx, upy) || 1; upx /= ul; upy /= ul;
        const rgx = -upy, rgy = upx;
        const P = (u, s) => ({ gx: vx + upx * u + rgx * s, gy: vy + upy * u + rgy * s });
        // Großer Teer-Parkplatz, talwärts vom Zentrum, aufs Raster eingerastet
        const pk0r = P(-9, 0);
        const pk0 = { gx: snapRoad(pk0r.gx), gy: snapRoad(pk0r.gy) };
        // Achsen-ausgerichteter Parkplatz: nächste Kartenkante bestimmt die Ausrichtung
        const _eL = pk0.gx - 2, _eR = (gridSize - 3) - pk0.gx, _eT = pk0.gy - 2, _eB = (gridSize - 3) - pk0.gy;
        const _mE = Math.min(_eL, _eR, _eT, _eB);
        const parkEdge = (_mE === _eT) ? 'T' : (_mE === _eB) ? 'B' : (_mE === _eL) ? 'L' : 'R';
        const edgeDir = parkEdge === 'T' ? { x: 0, y: -1 } : parkEdge === 'B' ? { x: 0, y: 1 } : parkEdge === 'L' ? { x: -1, y: 0 } : { x: 1, y: 0 };
        const parkRot = (parkEdge === 'T' || parkEdge === 'B') ? 0 : Math.PI / 2;
        // Kein Parkplatz am Lift — der Startbereich hat nur Lift und Kasse.
        const pgx = pk0.gx, pgy = pk0.gy;   // Bezugspunkt des ehemaligen Parkplatzes
        const xzToPos = (x, z) => worldPosSmooth((x + half) / tile, (z + half) / tile);
        // vordere Reihe zeigt zur Straße; hintere Reihe = Deko-Autos
        // (keine Deko-Autos und keine Stellplätze mehr am Lift — der
        //  Startbereich hat keinen Parkplatz, das erledigen die Ortschaften)

        // Ticketschalter (Kasse) zwischen Parkplatz und Lift
        const tk = P(-3, 3);
        const ticket = place(makeTicketOffice(), tk.gx, tk.gy, Math.atan2(upx, upy), 2.0, 'ticket', 29200);
        const ticketPos = ticket.position.clone();  // Kasse zählt via place() wie ein gebautes Gebäude
        // Startzustand: NUR Lift + Kasse. Alles andere baut der Spieler selbst.

        // Initiale Zufahrt: GERADE, achsenparallele Straße von der VORDERKANTE des
        // Parkplatzes (NICHT über das Pad) senkrecht zur nächsten Kartenkante.
        const edgeOff = 6; // Tiles vom Pad-Zentrum zur Vorderkante (~Pad-Tiefe/2)
        const sPk = { gx: snapRoad(pgx + edgeDir.x * edgeOff), gy: snapRoad(pgy + edgeDir.y * edgeOff) };
        const border = parkEdge === 'T' ? { gx: sPk.gx, gy: 1 }
            : parkEdge === 'B' ? { gx: sPk.gx, gy: gridSize - 2 }
            : parkEdge === 'L' ? { gx: 1, gy: sPk.gy }
            : { gx: gridSize - 2, gy: sPk.gy };
        // KEIN initialer Parkplatz mehr: jede Ortschaft bringt ihre eigene
        // Zufahrt und ihren eigenen Parkplatz mit, dort kommen die Gäste an.
        // Der Startbereich besteht nur noch aus Lift und Kasse.
        const bgx = border.gx, bgy = border.gy;
        carEntryKey = roadKey(bgx, bgy);
        mainTicketPos = ticketPos;
        recomputeCarPath();

        // ===== ANKUNFTS-ZYKLUS: reinfahren -> parken -> Leute laufen Skifahren ->
        //        Auto WARTET -> Leute kommen zurück -> rausfahren =====
        // Fahrzeuge werden NACH UND NACH freigeschaltet (siehe activeVehicles unten).
        // Jedes 4. Fahrzeug ist ein Bus mit deutlich mehr Insassen.
        // Deutlich mehr Fahrzeuge als vorher (12): der Pool muss reichen,
        // damit bei hoher Attraktivität in JEDEM Ort laufend Verkehr ist.
        const nCars = 52;
        const arrCars = [], arrWalkers = [];
        _dbgWalkers = arrWalkers;
        for (let i = 0; i < nCars; i++) {
            const isBus = (i % 4) === 3;
            const veh = isBus ? makeBus() : makeCar(20 + i);
            veh.visible = false; scene.add(veh);
            const nppl = isBus ? 6 + Math.floor(Math.random() * 5)      // Bus: 6-10 Gäste
                : 1 + Math.floor(Math.random() * 4);                    // Auto: 1-4 Gäste
            // Jedes Fahrzeug gehört zu einem Ort — so kommen in ALLEN
            // Ortschaften Gäste an, nicht nur im Hauptort.
            arrCars.push({ mesh: veh, off: i / nCars, i, nppl, isBus,
                           village: villages.length ? villages[i % villages.length] : null });
            for (let k = 0; k < nppl; k++) {
                const w = makeWalker(30 + i * 11 + k); w.visible = false; scene.add(w);
                const prof = makeGuestProfile(w); prof.state = 'arrive';   // anklickbar
                arrWalkers.push({ mesh: w, carIdx: i, koff: (k - (nppl - 1) / 2) * 0.7, tphase: k * 0.01, prof });
            }
        }
        // =================================================================
        //  ANREISE MIT ECHTER STELLPLATZVERWALTUNG
        //  ----------------------------------------------------------------
        //  Vorher lief jedes Fahrzeug eine feste Zyklusanimation ab und der
        //  "Überlauf" war nur ein Index-Vergleich — ein Auto parkte also auch
        //  auf einem längst vollen Platz, und niemand fuhr je endgültig weg.
        //
        //  Jetzt hat jeder Parkplatz eine Liste echter Stellplätze. Ein Auto
        //  BELEGT einen davon für die Dauer des Skitags und gibt ihn erst am
        //  Ende wieder frei. Ist nichts frei, hält es gar nicht erst an:
        //  es fährt durch und niemand steigt aus.
        //
        //  Busse haben eine eigene Logik: sie brauchen keinen Stellplatz,
        //  halten kurz an der Bushaltestelle und fahren dann wieder ab.
        //  Ohne Haltestelle fahren sie ohne Halt durch.
        // =================================================================
        // ===== GESCHLOSSENE URLAUBSLOGIK =====
        // Wer ankommt, bucht einen Skipass für 1 bis 6 Tage (ein Spieltag =
        // 30 s, siehe sim.dayAcc). Genau so lange steht das Auto, dann
        // reisen die Gäste ab und der Stellplatz wird frei. Tagesgäste sind
        // häufig, Wochenurlauber selten — und mit Hotelbetten im Gebiet
        // bleiben die Leute länger.
        const DAY_SEC = 30;
        const bookDays = () => {
            const r = Math.random();
            const hotels = totalBeds() > 0;
            if (r < 0.45) return 1;
            if (r < 0.75) return 2;
            if (r < 0.90) return hotels ? 3 : 2;
            return hotels ? 4 + Math.floor(Math.random() * 3) : 3;
        };
        const BUS_DWELL = 7;                   // Sekunden Halt an der Haltestelle
        const activeVehicles = () => {
            if (!built.lift) return 0;                                   // ohne Lift kommt niemand
            const lots = parkingLots.filter(l => l.roadPath && l.spots.length).length;
            const busses = built.busstop > 0 ? Math.min(6, 2 + Math.floor((sim.attract || 0) / 25)) : 0;
            if (!lots && !busses) return 0;
            // ===== ZUSTROM AUS DER ATTRAKTIVITÄT =====
            // Bei 100 % Attraktivität fährt der ganze Pool, bei 0 % nur das
            // Minimum von einem Auto je Parkplatz. Werbung steckt bereits im
            // Score. So kommt bei einem guten Gebiet spürbar mehr Verkehr.
            const a = (sim.attract || 0) / 100;
            const wanted = Math.round(lots * 2 + a * a * (nCars - lots * 2));
            return Math.max(lots + busses, Math.min(nCars, wanted + busses));
        };
        const lerpXZ = (ax, az, bx, bz, f) => ({ x: ax + (bx - ax) * f, z: az + (bz - az) * f });
        const faceTo = (mesh, tx, tz) => { const dxx = tx - mesh.position.x, dzz = tz - mesh.position.z; if (Math.hypot(dxx, dzz) > 0.001) mesh.rotation.y = Math.atan2(dxx, dzz); };
        /** Freien Stellplatz auf einem Parkplatz suchen und belegen. */
        const takeSpot = (lot, car) => {
            if (!lot.taken) lot.taken = new Map();
            for (let i = 0; i < lot.spots.length; i++) {
                if (!lot.taken.has(i)) { lot.taken.set(i, car); return i; }
            }
            return -1;
        };
        const freeSpot = (lot, idx) => { if (lot.taken) lot.taken.delete(idx); };
        /** Position der nächsten Bushaltestelle (oder null). */
        /** Nächste Bushaltestelle zu einem Parkplatz — jeder Ort hat seine eigene. */
        const busStopPos = (lot) => {
            let best = null, bd = Infinity;
            for (const b of placedBuildings) {
                if (b.type !== 'busstop') continue;
                if (!lot) return b;
                const d = Math.hypot((b.rec.x + half) / tile - lot.gx, (b.rec.z + half) / tile - lot.gy);
                if (d < bd) { bd = d; best = b; }
            }
            return best;
        };
        let _lastT2 = 0, _lastBuildN = -1;
        updaters.push((t) => {
            sim._tNow = t;
            /**
             * ===== WOHIN NACH DEM AUSSTEIGEN? =====
             * Gibt es in Gehweite eine Kasse, gehen die Ankommenden dorthin
             * und kaufen einen Skipass. Gibt es KEINE, laufen sie zum
             * Ortsplatz und bleiben dort stehen — sichtbar wartend, bis der
             * Spieler eine Kasse baut. Vorher liefen sie stur zur
             * Hauptkasse, egal wie weit weg die war.
             */
            const lotDesk = (lot) => {
                if (lot._deskN === placedBuildings.length && lot._desk !== undefined) return lot._desk;
                lot._deskN = placedBuildings.length;
                let best = null, bd = 34;                 // max. Gehweite zur Kasse
                for (const b of placedBuildings) {
                    if (b.type !== 'ticket') continue;
                    const d = Math.hypot((b.rec.x + half) / tile - lot.gx, (b.rec.z + half) / tile - lot.gy);
                    if (d < bd) { bd = d; best = b; }
                }
                lot._desk = best ? { x: best.rec.x, z: best.rec.z, real: true }
                                 : { x: lot.ticketPos.x, z: lot.ticketPos.z, real: false };
                return lot._desk;
            };

            const dt2 = Math.max(0, Math.min(0.2, t - _lastT2)); _lastT2 = t;
            const conn = parkingLots.filter(l => l.roadPath && l.spots.length);
            const nActive = activeVehicles();
            for (let i = nActive; i < arrCars.length; i++) {
                const c = arrCars[i];
                if (c._lot && c._spotIdx >= 0) { freeSpot(c._lot, c._spotIdx); c._spotIdx = -1; }
                c.mesh.visible = false; c._spot = null; c.phase = null;
            }
            if (nActive === 0) {
                for (const c of arrCars) { c.mesh.visible = false; c._spot = null; c.phase = null; }
                for (const w of arrWalkers) w.mesh.visible = false;
                sim.carActive = 0;
                for (const l of parkingLots) { l.occ = 0; if (l.taken) l.taken.clear(); }
                return;
            }
            // Haltepunkt neu bestimmen, sobald sich der Gebäudebestand ändert
            if (_lastBuildN !== placedBuildings.length) {
                _lastBuildN = placedBuildings.length;
                for (const c of arrCars) c._stopP = null;
            }
            for (const c of arrCars.slice(0, nActive)) {
                // ---- Startzustand ----
                if (!c.phase) {
                    c.phase = 'wait';
                    c.timer = Math.random() * 18;
                    c._spotIdx = -1;
                }
                c.timer -= dt2;

                // ================= BUS =================
                if (c.isBus) {
                    // Ein Bus braucht KEINEN Stellplatz. Er fährt zur
                    // Haltestelle, hält kurz, lässt aussteigen, fährt weiter.
                    const lot = c._lot || conn[c.i % Math.max(1, conn.length)] || conn[0];
                    if (!lot) { c.mesh.visible = false; continue; }
                    c._lot = lot;
                    const rp = lot.roadPath;
                    const bstop = busStopPos(lot);          // Haltestelle DIESES Ortes
                    if (c.phase === 'wait') {
                        c.mesh.visible = false;
                        if (c.timer <= 0) { c.phase = 'in'; c.timer = 9; c.p = 1; }
                        continue;
                    }
                    // ===== HALTEPUNKT =====
                    // Der Bus hält an der Haltestelle, nicht an der Parkplatz-
                    // einfahrt. Dazu wird auf dem Fahrweg der Punkt gesucht,
                    // der der Haltestelle am nächsten liegt.
                    if (bstop && c._stopP == null) {
                        let bi = 0, bd = Infinity;
                        const sx5 = (bstop.rec.x + half) / tile, sy5 = (bstop.rec.z + half) / tile;
                        for (let k = 0; k < rp.length; k++) {
                            const d = Math.hypot(rp[k].gx - sx5, rp[k].gy - sy5);
                            if (d < bd) { bd = d; bi = k; }
                        }
                        // nur wenn die Haltestelle wirklich an DIESER Strasse liegt
                        c._stopP = bd < 7 ? bi / Math.max(1, rp.length - 1) : -1;
                    }
                    const stopP = (bstop && c._stopP != null && c._stopP >= 0) ? c._stopP : -1;
                    if (c.phase === 'in') {                       // Anfahrt über die Straße
                        c.p = Math.max(0, c.p - dt2 / 9);
                        const g = roadAt(rp, c.p), wp = xzToPos(g.gx * tile - half, g.gy * tile - half);
                        c.mesh.position.set(wp.x, wp.y + 0.05, wp.z); c.mesh.visible = true;
                        const ga = roadAt(rp, Math.max(0, c.p - 0.03));
                        const wa = xzToPos(ga.gx * tile - half, ga.gy * tile - half);
                        faceTo(c.mesh, wa.x, wa.z);
                        // Haltestelle erreicht -> anhalten
                        if (stopP >= 0 && c.p <= stopP) {
                            c.p = stopP; c.phase = 'stop'; c.timer = BUS_DWELL; c._dropped = false;
                        }
                        // OHNE Haltestelle an dieser Strasse: durchfahren und wenden
                        else if (c.p <= 0.001) { c.phase = 'out'; c.timer = 0; c.p = 0; c._dropped = false; }
                        continue;
                    }
                    if (c.phase === 'stop') {                     // kurzer Halt an der Haltestelle
                        const g = roadAt(rp, stopP >= 0 ? stopP : 0), wp = xzToPos(g.gx * tile - half, g.gy * tile - half);
                        c.mesh.position.set(wp.x, wp.y + 0.05, wp.z); c.mesh.visible = true;
                        if (!c._dropped) {
                            c._dropped = true;
                            const rev = c.nppl * skiPassPrice() * (1 + totalHotels() * 0.12);
                            sim.revenue += rev; sim.dayRevenue += rev; money += rev;
                            sim.served += c.nppl; sim.carActive += c.nppl; sim.carGuestsToday += c.nppl;
                            if (onMoney) onMoney(money);
                        }
                        if (c.timer <= 0) { c.phase = 'out'; c.p = stopP >= 0 ? stopP : 0; }
                        continue;
                    }
                    // 'out' — wieder hinaus und Runde neu beginnen
                    c.p = Math.min(1, (c.p || 0) + dt2 / 9);
                    {
                        const g = roadAt(rp, c.p), wp = xzToPos(g.gx * tile - half, g.gy * tile - half);
                        c.mesh.position.set(wp.x, wp.y + 0.05, wp.z); c.mesh.visible = true;
                        const ga = roadAt(rp, Math.min(1, c.p + 0.03));
                        const wa = xzToPos(ga.gx * tile - half, ga.gy * tile - half);
                        faceTo(c.mesh, wa.x, wa.z);
                    }
                    if (c.p >= 1) {
                        if (c._dropped) sim.carActive = Math.max(0, sim.carActive - c.nppl);
                        c.phase = 'wait'; c.timer = 20 + Math.random() * 30; c.mesh.visible = false;
                    }
                    continue;
                }

                // ================= AUTO =================
                // Jeder Ort bekommt seinen Anteil: Fahrzeug i fährt Parkplatz
                // i mod n an — bei 36 Fahrzeugen und 3 Orten sind das 12 je Ort.
                const lot = c._lot || conn[c.i % Math.max(1, conn.length)];
                if (!lot) { c.mesh.visible = false; continue; }
                c._lot = lot;
                const rp = lot.roadPath, lpadY = lot.padY;
                const ent = rp[0], entW = xzToPos(ent.gx * tile - half, ent.gy * tile - half);

                if (c.phase === 'wait') {
                    c.mesh.visible = false;
                    if (c.timer <= 0) {
                        // ===== VOLL IST VOLL — ABER ERST WOANDERS SUCHEN =====
                        // Ist der eigene Parkplatz belegt, probiert das Auto
                        // die anderen angebundenen Parkplätze durch — den
                        // nächstgelegenen zuerst. Erst wenn im ganzen Gebiet
                        // nichts frei ist, fährt es an, dreht ab und die
                        // Gäste bleiben aus. Das zählt als Warnung im HUD.
                        c._spotIdx = takeSpot(lot, c);
                        if (c._spotIdx < 0) {
                            const alts = conn.filter(l => l !== lot)
                                .sort((a, b) => Math.hypot(a.gx - lot.gx, a.gy - lot.gy)
                                              - Math.hypot(b.gx - lot.gx, b.gy - lot.gy));
                            for (const alt of alts) {
                                const idx = takeSpot(alt, c);
                                if (idx >= 0) { c._lot = alt; c._spotIdx = idx; c._rerouted = true; break; }
                            }
                        }
                        if (c._spotIdx >= 0) {
                            c.phase = 'in';
                        } else {
                            c.phase = 'reject';
                            // Zähler der jüngsten Abweisungen: nach 40 s Ruhe
                            // beginnt er von vorn, sonst zählt er hoch.
                            if (sim.parkingRejectT == null || t - sim.parkingRejectT > 40) sim.parkingRejects = 0;
                            sim.parkingRejects = (sim.parkingRejects || 0) + 1;
                            sim.parkingRejectT = t;
                        }
                        c.timer = 10; c.p = 1;
                    }
                    continue;
                }
                if (c.phase === 'reject') {
                    // Hinein bis zur Einfahrt, dort wenden, wieder hinaus
                    c.p -= dt2 / 12;
                    const pp = Math.max(0, Math.min(1, c.p < -0 ? 0 : c.p));
                    const g = roadAt(rp, Math.abs(pp)), wp = xzToPos(g.gx * tile - half, g.gy * tile - half);
                    c.mesh.position.set(wp.x, wp.y + 0.05, wp.z); c.mesh.visible = true;
                    const ga = roadAt(rp, Math.max(0, Math.abs(pp) + (c.p > 0 ? -0.03 : 0.03)));
                    const wa = xzToPos(ga.gx * tile - half, ga.gy * tile - half);
                    faceTo(c.mesh, wa.x, wa.z);
                    if (c.p <= -1) { c.phase = 'wait'; c.timer = 12 + Math.random() * 20; c.mesh.visible = false; }
                    else if (c.p <= 0) { c.p -= dt2 / 12; }      // Rückweg
                    continue;
                }
                const spot = lot.spots[c._spotIdx % lot.spots.length];
                c._spot = spot; c._padY = lpadY; c._tpos = lot.ticketPos || ticketPos;
                if (c.phase === 'in') {
                    c.p = Math.max(0, c.p - dt2 / 10);
                    const g = roadAt(rp, c.p), wp = xzToPos(g.gx * tile - half, g.gy * tile - half);
                    c.mesh.position.set(wp.x, wp.y + 0.05, wp.z); c.mesh.visible = true;
                    const ga = roadAt(rp, Math.max(0, c.p - 0.03));
                    const wa = xzToPos(ga.gx * tile - half, ga.gy * tile - half);
                    faceTo(c.mesh, wa.x, wa.z);
                    if (c.p <= 0.001) { c.phase = 'park'; c.timer = 1.4; }
                    continue;
                }
                if (c.phase === 'park') {                        // Einparken
                    const f = 1 - Math.max(0, c.timer) / 1.4;
                    const q = lerpXZ(entW.x, entW.z, spot.x, spot.z, f);
                    c.mesh.position.set(q.x, entW.y + (lpadY - entW.y) * f + 0.05, q.z);
                    c.mesh.visible = true;
                    // Erst zum Platz rollen, auf den letzten 30 % gerade in
                    // die Lücke drehen.
                    if (f < 0.7 || lot.rowYaw == null) faceTo(c.mesh, spot.x, spot.z);
                    else {
                        const cur = c.mesh.rotation.y, tgt = lot.rowYaw;
                        let d = tgt - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
                        c.mesh.rotation.y = cur + d * Math.min(1, (f - 0.7) / 0.3);
                    }
                    c._cyc = 0.14;
                    if (c.timer <= 0) {
                        c.phase = 'stay';
                        c.days = bookDays();
                        c.timer = c.days * DAY_SEC;
                        c._stayTotal = c.timer;
                        // Parkgebühr + Skipässe genau EINMAL je Aufenthalt
                        const fee = (lot.price != null ? lot.price : lot.basePrice) || 0;
                        money += fee; sim.revenue += fee; sim.dayRevenue += fee;
                        lot.income = (lot.income || 0) + fee;
                        // Skipässe gibt es nur, wenn im Ort eine Kasse steht.
                        // Ohne Kasse steigen die Leute aus und warten — Geld
                        // fließt dann keins.
                        if (lotDesk(lot).real) {
                            // Mehrtagespass: Tage werden bezahlt, mit leichtem
                            // Mengenrabatt ab dem zweiten Tag.
                            const tage = c.days || 1;
                            const passFaktor = 1 + (tage - 1) * 0.82;
                            const rev = c.nppl * skiPassPrice() * passFaktor * (1 + totalHotels() * 0.12);
                            sim.revenue += rev; sim.dayRevenue += rev; money += rev;
                            sim.served += c.nppl; sim.carGuestsToday += c.nppl;
                        }
                        sim.carActive += c.nppl;
                        if (onMoney) onMoney(money);
                    }
                    continue;
                }
                if (c.phase === 'stay') {                        // steht den Skitag über
                    c.mesh.position.set(spot.x, lpadY, spot.z); c.mesh.visible = true;
                    // Ordentlich eingeparkt: alle Autos einer Reihe zeigen in
                    // dieselbe Richtung (quer zur Reihe), statt in dem Winkel
                    // stehen zu bleiben, in dem sie hereingerollt sind.
                    if (lot.rowYaw != null) c.mesh.rotation.y = lot.rowYaw;
                    // ===== FORTSCHRITT FÜR DIE INSASSEN =====
                    // Die Fußgänger-Animation rechnet weiter mit einem
                    // 0..1-Zyklus. Der Aufenthalt wird deshalb auf genau das
                    // Fenster abgebildet, in dem sie unterwegs sind (0.17
                    // aussteigen bis 0.80 zurück am Auto).
                    const stayTotal = c._stayTotal || (c._stayTotal = Math.max(1, c.timer));
                    const done = 1 - Math.max(0, c.timer) / stayTotal;
                    c._cyc = 0.17 + done * 0.63;
                    if (c.timer <= 0) { c.phase = 'leave'; c.timer = 1.4; c._stayTotal = null; }
                    continue;
                }
                if (c.phase === 'leave') {                       // Ausparken
                    c._cyc = 0.84;
                    const f = 1 - Math.max(0, c.timer) / 1.4;
                    const q = lerpXZ(spot.x, spot.z, entW.x, entW.z, f);
                    c.mesh.position.set(q.x, lpadY + (entW.y - lpadY) * f + 0.05, q.z);
                    c.mesh.visible = true; faceTo(c.mesh, entW.x, entW.z);
                    if (c.timer <= 0) {
                        c.phase = 'out'; c.p = 0;
                        // Stellplatz JETZT freigeben — der Nächste darf rein.
                        freeSpot(lot, c._spotIdx); c._spotIdx = -1;
                        sim.carActive = Math.max(0, sim.carActive - c.nppl);
                    }
                    continue;
                }
                // 'out' — Heimfahrt
                c.p = Math.min(1, (c.p || 0) + dt2 / 10);
                {
                    const g = roadAt(rp, c.p), wp = xzToPos(g.gx * tile - half, g.gy * tile - half);
                    c.mesh.position.set(wp.x, wp.y + 0.05, wp.z); c.mesh.visible = true;
                    const ga = roadAt(rp, Math.min(1, c.p + 0.03));
                    const wa = xzToPos(ga.gx * tile - half, ga.gy * tile - half);
                    faceTo(c.mesh, wa.x, wa.z);
                }
                if (c.p >= 1) { c.phase = 'wait'; c.timer = 10 + Math.random() * 25; c.mesh.visible = false; }
                if (c.phase === 'in' || c.phase === 'out') c._spot = null;
            }
            // Belegung je Parkplatz für Anzeige und Simulation
            for (const l of parkingLots) l.occ = l.taken ? l.taken.size : 0;
            // Talstation als Lift-Einstieg (dort übernimmt die bestehende Lift-Warteschlange)
            const liftQ = worldPosSmooth(vx + 1.5, vy + 1);
            /**
             * Lift-Sammelpunkt JE PARKPLATZ.
             *
             * Vorher liefen ALLE Ankommenden zur Warteschlange des Startlifts —
             * auch die aus einem 300 Kacheln entfernten Ort. Weil dieser Weg in
             * 12 % des Zyklus abgefahren wird, schossen sie förmlich über die
             * Karte. Jetzt zählt nur ein Lift in echter Gehweite; gibt es
             * keinen, bleiben die Gäste im Ort und warten.
             */
            const lotLiftQ = (lot) => {
                if (lot._liftQ !== undefined && lot._liftQN === guestRoutes.length) return lot._liftQ;
                lot._liftQN = guestRoutes.length;
                let best = null, bd = 26;                 // max. Gehweite zum Lift
                for (const r of guestRoutes) {
                    if (r.kind !== 'lift') continue;
                    const b = routeBottom(r);
                    const d = Math.hypot(b.gx - lot.gx, b.gy - lot.gy);
                    if (d < bd) { bd = d; best = b; }
                }
                lot._liftQ = best ? worldPosSmooth(best.gx + 1.5, best.gy + 1) : null;
                return lot._liftQ;
            };
            for (const w of arrWalkers) {
                const c = arrCars[w.carIdx];
                if (!c._spot) { w.mesh.visible = false; continue; }
                const cyc = (c._cyc + w.tphase) % 1;
                // Wegpunkte: Auto -> Kassen-Schlange -> Lift-Schlange -> (Skifahren) -> Auto
                const S = [c._spot.x, c._spot.z];
                const desk = lotDesk(c._lot);
                const hasDesk = desk.real;
                const K = [desk.x, desk.z];
                const bl = Math.hypot(S[0] - K[0], S[1] - K[1]) || 1;            // Richtung Kasse->Auto
                const bx = (S[0] - K[0]) / bl, bz = (S[1] - K[1]) / bl;
                const qi = (w.koff + 1) * 0.55 + 0.6;                            // Position in der Schlange
                const KQ = [K[0] + bx * qi + w.koff * 0.3, K[1] + bz * qi];      // Kassen-Schlange
                // Lift-Sammelpunkt des EIGENEN Parkplatzes (null = kein Lift in Gehweite)
                const myQ = lotLiftQ(c._lot) || liftQ;
                const hasLift = !!lotLiftQ(c._lot);
                const LQ = [myQ.x + w.koff * 0.5, myQ.z + (w.koff % 2) * 0.5];
                // ===== ECHTES GEHEN STATT ZEITFENSTER =====
                // Vorher wurde die Position aus dem Zyklusanteil interpoliert:
                // ein weiter Weg (Kasse/Lift bis 34 Kacheln) musste in dasselbe
                // Zeitfenster passen wie ein kurzer — die Leute SCHOSSEN dann
                // in gerader Linie über die Karte. Jetzt läuft jeder Gast mit
                // festem Tempo (1.3 Kacheln/s) von seiner aktuellen Position
                // zum Ziel der jeweiligen Phase; dauert es länger, kommt er
                // später an — aber er fliegt nie.
                const WALK_V = 1.3;
                const dtw = Math.max(0, Math.min(0.2, t - (w._t ?? t))); w._t = t;
                let target = null, look = null, hide = false, resetTo = null;
                const canSki = hasLift && hasDesk;
                if (cyc < 0.17) { hide = true; resetTo = S; }
                else if (cyc < 0.34) { target = KQ; look = cyc < 0.27 ? KQ : K; }
                else if (cyc < 0.50) { target = canSki ? LQ : KQ; look = canSki ? [myQ.x, myQ.z] : K; }
                else if (cyc < 0.68) {
                    if (canSki) { hide = true; resetTo = LQ; }             // im Lift / auf der Piste
                    else { target = [KQ[0] + Math.sin(t * 0.7 + w.tphase * 30) * 0.15, KQ[1]]; look = K; }
                }
                else if (cyc < 0.84) { target = S; look = S; }
                else { hide = true; resetTo = S; }
                if (hide) { w.mesh.visible = false; if (resetTo) w._pos = { x: resetTo[0], z: resetTo[1] }; continue; }
                if (!w._pos) w._pos = { x: S[0], z: S[1] };
                let walking = false;
                {
                    const ddx = target[0] - w._pos.x, ddz = target[1] - w._pos.z;
                    const dist = Math.hypot(ddx, ddz);
                    const step = Math.min(dist, WALK_V * dtw);
                    if (step > 1e-4) { w._pos.x += ddx / dist * step; w._pos.z += ddz / dist * step; walking = step > 0.01; }
                }
                const pos = { x: w._pos.x, z: w._pos.z };
                const g = xzToPos(pos.x, pos.z);
                // Höhe: auf dem Teer-Pad starten, weich aufs Gelände übergehen (kein Schweben)
                const nearPad = Math.min(1, Math.hypot(pos.x - c._spot.x, pos.z - c._spot.z) / 4);
                const yb = c._padY * (1 - nearPad) + g.y * nearPad;
                const ph = t * 8 + w.tphase * 40;
                const bob = walking ? Math.abs(Math.sin(ph)) * 0.03 : 0;
                w.mesh.position.set(pos.x, yb + 0.02 + bob, pos.z);
                w.mesh.visible = true;
                if (look) faceTo(w.mesh, look[0] ?? look.x, look[1] ?? look.z);
                const sw = walking ? Math.sin(ph) * 0.5 : 0;                     // Bein-Wackeln nur beim Gehen
                if (w.mesh.userData.legL) { w.mesh.userData.legL.rotation.x = sw; w.mesh.userData.legR.rotation.x = -sw; }
            }
        });
        // (kein Deko-Bus mehr — Busse kommen als echte Anreise-Fahrzeuge)

        // (keine Deko-Schneekanonen mehr — Beschneiung baut der Spieler selbst,
        //  sonst stünden Kanonen da, die im Wasserhaushalt gar nicht auftauchen)

        // Pistenraupen: erscheinen erst, wenn eine Garage gebaut ist, und fahren
        // sichtbar AUS der Garage auf die Piste (Anzahl = Stellplätze der Garagen).
        const routeAt = (p) => { // p in 0..1 -> {gx,gy} entlang routePts
            const fi = Math.max(0, Math.min(routePts.length - 1, p * (routePts.length - 1)));
            const i0 = Math.floor(fi), i1 = Math.min(routePts.length - 1, i0 + 1), f = fi - i0;
            const a = routePts[i0], b = routePts[i1];
            return { gx: a.gx + (b.gx - a.gx) * f, gy: a.gy + (b.gy - a.gy) * f };
        };
        const cats = [];   // {mesh, off}
        /**
         * Darf eine Pistenraupe hier fahren? Wald, Wasser, Fels und die
         * Grundflächen von Gebäuden sind tabu — gefahren wird auf freien
         * Schneeflächen, Wiesen und natürlich auf den Pisten.
         */
        const catPassable = (gx, gy, maxSlope = 11) => {
            const x = Math.round(gx), y = Math.round(gy);
            if (x < 1 || y < 1 || x >= gridSize - 1 || y >= gridSize - 1) return false;
            const lc = world.landcover[y * gridSize + x];
            if (lc === 1 || lc === 5 || lc === 6) return false;     // Wald
            if (lc === 2) return false;                             // Wasser
            if (lc === 3) return false;                             // Fels
            // Steilheit erst prüfen, wenn die Hilfsfunktion bereit ist: der
            // Updater kann theoretisch im allerersten Frame laufen.
            if (maxSlope > 0 && typeof slopeAtRaw === 'function' && slopeAtRaw(gx, gy) > maxSlope) return false;
            // keine Fahrt durch Gebäude
            const wx = gx * tile - half, wz = gy * tile - half;
            for (const b of placedBuildings) {
                if (Math.hypot(b.rec.x - wx, b.rec.z - wz) < (b.rec.r || 2) + 0.6) return false;
            }
            return true;
        };
        /**
         * Sucht in der Nähe eines Zielpunkts eine befahrbare Stelle. So
         * hangelt sich die Raupe an Waldrändern und Felsen entlang, statt
         * hindurchzufahren.
         */
        const catAvoid = (gx, gy, refX, refY) => {
            if (catPassable(gx, gy)) return { gx, gy };
            // senkrecht zur Fahrtrichtung ausweichen, in wachsendem Abstand
            const dx = gx - refX, dy = gy - refY;
            const l = Math.hypot(dx, dy) || 1;
            const px = -dy / l, py = dx / l;
            for (let d = 1.5; d <= 9; d += 1.5) {
                for (const sgn of [1, -1]) {
                    const nx = gx + px * d * sgn, ny = gy + py * d * sgn;
                    if (catPassable(nx, ny)) return { gx: nx, gy: ny };
                }
            }
            return { gx: refX, gy: refY };   // nichts frei: an Ort und Stelle bleiben
        };
        // NACH der Deklaration zuweisen (sonst TDZ): auch das Rettungs-Skidoo
        // umfährt damit Wald, Fels und Wasser.
        vehAvoid = catAvoid;
        /**
         * Ein Fahrschritt der Raupe: Kurs auf den Zielpunkt nehmen (max.
         * Drehrate), dann in Blickrichtung vorfahren. Ist die Bahn vor der
         * Raupe versperrt, wird nach links/rechts ausgewichen; ist alles zu,
         * bleibt sie stehen. Bewegung entsteht NUR aus Kurs × Geschwindigkeit,
         * damit die Maschine nie quer über den Hang „driftet".
         */
        const CAT_TURN = 1.7;                                    // rad/s
        /**
         * Fahrschritt eines Kettenfahrzeugs (Raupe, Skidoo): Kurs auf den
         * Zielpunkt nehmen (max. Drehrate), in Blickrichtung vorfahren.
         * Versperrte Bahn → Ausweichen mit MERKEN der Seite (Hysterese),
         * damit die Maschine nicht jedes Bild zwischen links und rechts
         * hin und her zuckt. Bewegung entsteht NUR aus Kurs × Tempo.
         */
        const driveVehicle = (v, dt, speedTiles, turnRate, pass = catPassable) => {
            const tg = v._target; if (!tg || dt <= 0) return false;
            const cur = worldToGrid(v.mesh.position.x, v.mesh.position.z);
            const dx = tg.gx - cur.gx, dy = tg.gy - cur.gy;
            const dist = Math.hypot(dx, dy);
            if (v._hdg == null) v._hdg = dist > 1e-3 ? Math.atan2(dx, dy) : 0;
            const setDir = () => { v._dir = { dx: Math.sin(v._hdg), dy: Math.cos(v._hdg) }; };
            if (dist < 0.08) { setDir(); v._route = null; return true; }
            const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
            const foot = v.mesh.userData.foot || { l: 0.8 };
            // Probe knapp vor der Nase: das Raster hält bereits Abstand
            // (catPassable prüft Kachelmitten); ein großer Vorlauf würde
            // Wege sperren, die der Planer gerade freigegeben hat.
            const margin = 0.2;
            // Sichtlinie: ist die Gerade zum Punkt frei (in halben Kacheln abgetastet)?
            // Endpunkt selbst zählt nicht: Station und Verletzter dürfen
            // neben einem Gebäude oder am Steilhang liegen.
            const los = (ax, ay, bx, by) => {
                const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25));
                for (let k = 1; k < n; k++) { const u = k / n; if (!pass(ax + (bx - ax) * u, ay + (by - ay) * u)) return false; }
                return true;
            };
            const curFree = pass(cur.gx, cur.gy);
            // ===== ROUTE =====
            // Direkt, wenn frei. Sonst wird EINMAL ein Weg um das Hindernis
            // geplant (Pfadsuche auf dem Raster) und danach Wegpunkt für
            // Wegpunkt abgefahren — kein reaktives Hin- und Herzucken.
            let aim = tg;
            // Liegt das Ziel selbst im Sperrbereich (Station, Verletzter am
            // Steilhang), führt der Endanflug ab 6 Kacheln GERADE hinein —
            // ohne Route und ohne Probe, sonst bleibt das Fahrzeug davor stehen.
            const tgBlocked = !pass(tg.gx, tg.gy);
            const finalRun = tgBlocked && dist < 6;
            if (finalRun) { v._route = null; v._noRoute = false; }
            else if (!los(cur.gx, cur.gy, tg.gx, tg.gy)) {
                const R = v._route;
                const stale = !R || Math.hypot(R.tgx - tg.gx, R.tgy - tg.gy) > 2.0;
                if (stale && !(v._planT > 0)) {
                    const A = { x: Math.round(cur.gx), y: Math.round(cur.gy) }, B = { x: Math.round(tg.gx), y: Math.round(tg.gy) };
                    // (Planer prüft Kachelmitten mit derselben Passierbarkeit)
                    // Steht das Fahrzeug selbst im Sperrbereich (Abfahrt an der
                    // Station), dürfen die Nachbarkacheln als Ausfahrt dienen —
                    // sonst gilt das Raster strikt (kein Eckenschneiden).
                    const startBlocked = !pass(A.x, A.y);
                    const chain = findPath(A, B, (x, y) => pass(x, y) || (startBlocked && Math.abs(x - A.x) <= 1 && Math.abs(y - A.y) <= 1), gridSize, 20000);
                    v._planT = 0.8;                                        // frühestens in 0.8 s neu planen
                    let pts = null;
                    if (chain) {
                        // Diagonalschritte, deren Mitte ein Hindernis streift
                        // (Gebäuderadius!), über eine Achsen-Ecke führen.
                        for (let k = 0; k + 1 < chain.length; k++) {
                            const p0 = chain[k], p1 = chain[k + 1];
                            if (p0.gx === p1.gx || p0.gy === p1.gy) continue;
                            // Diagonale nur, wenn BEIDE Nachbarkacheln frei sind
                            // (sonst schneidet die Bahn eine belegte Kachel)
                            const e1 = { gx: p1.gx, gy: p0.gy }, e2 = { gx: p0.gx, gy: p1.gy };
                            const ok1 = pass(e1.gx, e1.gy), ok2 = pass(e2.gx, e2.gy);
                            if (ok1 && ok2 && pass((p0.gx + p1.gx) / 2, (p0.gy + p1.gy) / 2)) continue;
                            if (ok1) chain.splice(k + 1, 0, e1); else if (ok2) chain.splice(k + 1, 0, e2);
                            k++;
                        }
                        // Geglättet nur, wenn KEIN Teilstück eine Ecke schneidet;
                        // sonst die rohe Kachelkette (Glätten prüft nur Punkte).
                        pts = smoothPath(chain, pass, 2);
                        for (let k = 0; k + 1 < pts.length; k++) {
                            if (!los(pts[k].gx, pts[k].gy, pts[k + 1].gx, pts[k + 1].gy)) { pts = chain; break; }
                        }
                    }
                    v._route = pts ? { pts, i: 0, tgx: tg.gx, tgy: tg.gy } : null;
                }
                if (v._planT > 0) v._planT -= dt;
                const R2 = v._route;
                if (R2 && R2.pts.length) {
                    // Wegpunkte, die schon erreicht sind, überspringen; dann den
                    // ersten anpeilen, der ~1 Kachel voraus liegt (weiche Kurven)
                    while (R2.i < R2.pts.length - 1 && Math.hypot(R2.pts[R2.i].gx - cur.gx, R2.pts[R2.i].gy - cur.gy) < 0.7) R2.i++;
                    let j = R2.i;
                    while (j < R2.pts.length - 1 && Math.hypot(R2.pts[j].gx - cur.gx, R2.pts[j].gy - cur.gy) < 1.2 && los(cur.gx, cur.gy, R2.pts[j + 1].gx, R2.pts[j + 1].gy)) j++;
                    aim = R2.pts[j];
                } else {
                    // Kein Weg im Raster (z. B. rundum steil): geradeaus aufs
                    // Ziel, nur Wald/Wasser/Fels/Gebäude bremsen noch (hardPass).
                    aim = tg; v._noRoute = true;
                }
            } else { v._route = null; v._noRoute = false; }
            const want = Math.atan2(aim.gx - cur.gx, aim.gy - cur.gy);
            const maxTurn = turnRate * dt;
            const diff = wrap(want - v._hdg);
            v._hdg += Math.max(-maxTurn, Math.min(maxTurn, diff));
            const slow = Math.abs(diff) > 1.2 ? 0.35 : Math.abs(diff) > 0.5 ? 0.7 : 1;
            const step = Math.min(dist, speedTiles * dt * slow);
            setDir();
            // Letzte Sicherung direkt vor der Nase (z. B. frisch gebautes Haus)
            const px = cur.gx + Math.sin(v._hdg) * (step + margin), py = cur.gy + Math.cos(v._hdg) * (step + margin);
            // Nur sperren, wenn wir NICHT ohnehin schon im Sperrbereich stehen
            // (Abfahrt an der Station) und das Ziel nicht direkt vor uns liegt.
            // Ausnahme: das Ziel liegt selbst im Sperrbereich (Station, Verletzter
            // am Steilhang) — dann darf der Endanflug hinein, wenn er geradeaus
            // aufs Ziel zeigt und nicht mehr weit ist.
            const probeOk = v._noRoute ? pass(px, py, 0) : pass(px, py);
            if (curFree && !finalRun && !probeOk) { v._route = null; return false; }
            v.mesh.position.x = (cur.gx + Math.sin(v._hdg) * step) * tile - half;
            v.mesh.position.z = (cur.gy + Math.cos(v._hdg) * step) * tile - half;
            return false;
        };
        const driveCat = (c, dt) => driveVehicle(c, dt, MAX_SPEED.cat / tile, CAT_TURN);
        const sledPassable = (gx, gy, maxSlope = 18) => catPassable(gx, gy, maxSlope);
        sledDrive = (v, dt) => driveVehicle(v, dt, 2.6 / tile, 2.4, sledPassable);
        // Erreichbarkeit: gibt es überhaupt einen Weg (Wald, Wasser, Fels,
        // Gebäude umfahrbar)? Start und Ziel dürfen im Sperrbereich liegen.
        sledCanReach = (from, to) => {
            const A = { x: Math.round(from.gx), y: Math.round(from.gy) }, B = { x: Math.round(to.gx), y: Math.round(to.gy) };
            const near = (x, y, P) => Math.abs(x - P.x) <= 1 && Math.abs(y - P.y) <= 1;
            const chain = findPath(A, B, (x, y) => sledPassable(x, y) || near(x, y, A) || near(x, y, B), gridSize, 20000);
            if (chain) return true;
            // Kein Rasterweg — dann zählt nur, ob die Luftlinie wasserfrei ist
            // (die Notfahrt geht geradeaus, nur harte Hindernisse bremsen).
            return !crossesWater(from, to);
        };
        updaters.push((t) => {
            const cap = catCapacity();
            while (cats.length < cap) {                                  // neue Raupe je Stellplatz
                const m2 = makeSnowcat(SNOWCAT_COLOR, cats.length < cat500Count() ? '500' : '300'); m2.visible = false; scene.add(m2);
                if (m2.userData.setNight) nightVehicles.push(m2);
                // Sofort losfahren: der Zyklus startet am Garagentor, damit die
                // frisch gebaute Raupe direkt sichtbar herausfährt.
                const isBig = cats.length < cat500Count();
                // 300er zuckelt, 500er ist zügiger
                const spd = isBig ? 0.011 : 0.0075;
                cats.push({
                    mesh: m2, big: isBig, speed: spd,
                    // WICHTIG: der Versatz muss mit DERSELBEN Geschwindigkeit
                    // gerechnet werden, sonst läuft der Zyklus ins Negative und
                    // die Raupe wird außerhalb der Strecke platziert — genau
                    // deshalb erschien sie bisher „aus dem Nichts".
                    off: -(t * spd) + cats.length * 0.06
                });
                if (garagePos) {                                         // am Tor einsetzen
                    const gp = worldPosSmooth(garagePos.gx, garagePos.gy);
                    m2.position.copy(gp);
                }
            }
            // Alle vorhandenen Pisten (inkl. Demo-Abfahrt) sind Arbeitsgebiet der Raupen
            const allPistes = guestRoutes.filter(r => r.kind === 'piste' && r.path && r.path.length >= 2);
            const catS = (c) => Math.max(0.6, (c.mesh.userData.foot?.l || 0.8) / tile);
            const catW = (c) => Math.max(0.35, (c.mesh.userData.foot?.w || 0.45) / tile);
            const pisteAt = (path, p) => {
                const fi = Math.max(0, Math.min(path.length - 1, p * (path.length - 1)));
                const i0 = Math.floor(fi), i1 = Math.min(path.length - 1, i0 + 1), f = fi - i0;
                const a = path[i0], b = path[i1];
                return { gx: a.gx + (b.gx - a.gx) * f, gy: a.gy + (b.gy - a.gy) * f };
            };
            for (let i = 0; i < cats.length; i++) {
                const c = cats[i];
                if (!c._prevPos) c._prevPos = new THREE.Vector3();
                c._prevVisible = c.mesh.visible;
                c._prevPos.copy(c.mesh.position);
                // Erst wenn die Garage FERTIG gebaut ist, fährt eine Raupe aus.
                if (i >= cap || !garagePos || !garageReady) { c.mesh.visible = false; continue; }
                c.mesh.visible = true;
                const tt = Math.max(0, (t * (c.speed || 0.0075)) + c.off);
                const cyc = tt % 1;
                // Jede Runde eine ANDERE Piste — so werden nach und nach alle präpariert
                const cnum = Math.floor(tt);
                const route = allPistes.length ? allPistes[(cnum * cats.length + i) % allPistes.length] : null;
                const at = (p) => route ? pisteAt(route.path, p) : routeAt(p);
                if (cyc < 0.10) {                                        // aus der Garage rausfahren
                    const f = cyc / 0.10;
                    const start = at(1);
                    const rawX = garagePos.gx + (start.gx - garagePos.gx) * f;
                    const rawY = garagePos.gy + (start.gy - garagePos.gy) * f;
                    const w = catAvoid(rawX, rawY, garagePos.gx, garagePos.gy);
                    c._target = w;
                } else if (cyc > 0.92) {                                 // zurück in die Garage
                    const f = (cyc - 0.92) / 0.08;
                    const end = at(1);
                    const rawX = end.gx + (garagePos.gx - end.gx) * f;
                    const rawY = end.gy + (garagePos.gy - end.gy) * f;
                    const w = catAvoid(rawX, rawY, end.gx, end.gy);
                    c._target = w;
                } else {                                                 // Piste rauf und runter walzen
                    const raw = ((cyc - 0.10) / 0.82) * 2;
                    const p = raw > 1 ? 2 - raw : raw;
                    const g2 = at(1 - p);
                    // PRÄPARIEREN: der überfahrene Abschnitt wird sofort frisch.
                    // Dahinter sieht die Piste damit wieder tadellos aus.
                    if (route && route.bed && route.bed.groom) {
                        const gr2 = route.bed.groom;
                        const idx2 = Math.round((1 - p) * (gr2.length - 1));
                        for (let k = idx2 - 2; k <= idx2 + 2; k++) {
                            if (k >= 0 && k < gr2.length) gr2[k] = 1;
                        }
                    }
                    const safe = catPassable(g2.gx, g2.gy) ? g2 : catAvoid(g2.gx, g2.gy, g2.gx, g2.gy);
                    c._target = safe;
                }
                if (c.mesh.userData.update) c.mesh.userData.update(t);
                // FAHRZEUGMODELL: Die Raupe FÄHRT zum Zielpunkt — sie wird
                // nicht hingezogen. Lenken mit begrenzter Drehrate, Vortrieb
                // nur in Blickrichtung (kein Driften), Hindernisprobe vor
                // jedem Schritt (kein Wald, kein Gebäude, kein Wasser).
                const dtc = Math.min(0.1, t - (c._tPrev ?? t));
                c._tPrev = t;
                if (!c._prevVisible) {                                   // am Tor einsetzen
                    const gp = worldPosSmooth(c._target.gx, c._target.gy);
                    c.mesh.position.set(gp.x, gp.y, gp.z);
                    c._hdg = null;
                } else driveCat(c, dtc);
                settleCat(c.mesh, c._dir, catS(c), catW(c));
            }
        });

        // ===== PISTENRAND-STANGEN entlang der Route =====
        for (let i = 4; i < routePts.length - 3; i += 6) {
            const rp = routePts[i];
            // seitlicher Versatz (senkrecht zur Fahrtrichtung)
            const nxt = routePts[Math.min(routePts.length - 1, i + 1)];
            const dx = nxt.gx - rp.gx, dy = nxt.gy - rp.gy;
            const len = Math.hypot(dx, dy) || 1;
            const px = -dy / len, py = dx / len;
            for (const side of [-3.2, 3.2]) {
                const marker = makePisteMarker();
                marker.position.copy(worldPosSmooth(rp.gx + px * side, rp.gy + py * side));
                scene.add(marker);
            }
        }

        // ===== SKIFAHRER wedeln die Piste hinunter =====
        const skiers = [];
        for (let i = 0; i < 8; i++) {
            const sk = makeSkier(i);
            scene.add(sk);
            // Jeder Skifahrer individuell: Tempo, Schwungradius und -frequenz (Anfänger bis Raser)
            const prof = makeGuestProfile(sk); prof.state = 'piste';   // anklickbar
            skiers.push({
                prof, mesh: sk, off: i / 8,
                speed: 0.03 + Math.random() * 0.055,     // langsamer Genießer .. schneller Carver
                amp: 1.0 + Math.random() * 2.4,          // enge .. weite Schwünge
                freq: 1.8 + Math.random() * 2.4          // hektisch .. lang gezogen
            });
        }
        // Gefälle-Faktor: flach = gemütlich, steil = zügig (adaptiert ans Gelände)
        const slopeSpeed = (a, b) => {
            const ya = worldPosSmooth(a.gx, a.gy).y, yb = worldPosSmooth(b.gx, b.gy).y;
            const run = Math.hypot(b.gx - a.gx, b.gy - a.gy) * tile || 1;
            const grade = Math.max(0, (ya - yb) / run);                  // 0 = eben
            return Math.max(0.3, Math.min(1.7, 0.3 + grade * 9));       // sehr flach -> 0.3x
        };
        updaters.push((t) => {
            for (const s of skiers) {
                const dtl = s._lt == null ? 0.016 : Math.min(0.1, t - s._lt); s._lt = t;
                if (s.p == null) s.p = s.off;
                // Fortschritt integrieren, Tempo hängt vom lokalen Gefälle ab
                const fiPre = Math.min(routePts.length - 2, Math.floor(s.p * (routePts.length - 1)));
                // Vortrieb merken: der Fußgänger-Zweig unten rechnet ihn auf
                // ein festes Gehtempo um. Vorher wurde pauschal mehr abgezogen
                // als je addiert wurde — netto liefen die Figuren rückwärts
                // gegen null und traten sichtbar auf der Stelle.
                s.lastAdv = dtl * s.speed * slopeSpeed(routePts[Math.max(0, fiPre)], routePts[Math.min(routePts.length - 1, fiPre + 1)]);
                s.p += s.lastAdv;
                if (s.p >= 1) s.p = 0;
                const p = s.p;
                const fi = p * (routePts.length - 1);
                const i0 = Math.max(0, Math.min(routePts.length - 2, Math.floor(fi)));
                const fr = fi - i0;
                const a = routePts[i0], b = routePts[i0 + 1];
                const gx = a.gx + (b.gx - a.gx) * fr;
                const gy = a.gy + (b.gy - a.gy) * fr;
                // seitliches Wedeln senkrecht zur Falllinie
                const dx = b.gx - a.gx, dy = b.gy - a.gy;
                const len = Math.hypot(dx, dy) || 1;
                const px = -dy / len, py = dx / len;
                // Auf aperem Boden wird auch hier gelaufen statt gefahren
                const snowOK = hasSnowAt(gx, gy);
                const sway = snowOK ? Math.sin(t * s.freq + s.off * 10) * s.amp : 0;
                const pos = worldPosSmooth(gx + px * sway, gy + py * sway);
                pos.y += 0.05;
                if (!snowOK) {
                    // Netto ein FESTES Gehtempo: erst den Fahr-Vortrieb wieder
                    // abziehen, dann den Fußweg addieren.
                    s.p += dtl * s.speed * 0.5 - (s.lastAdv || 0);
                    pos.y += 0.04 + walkPose(s.mesh, t, s.off);   // Ski geschultert, echter Schritt
                } else if (s.mesh.userData.carrying) {
                    ridePose(s.mesh, s.mesh.userData.isBoarder);
                }
                s.mesh.position.lerp(pos, 0.4);
                if (!snowOK) {
                    // Zu Fuß bleibt der Körper AUFRECHT: faceDir dreht nur um
                    // die Hochachse. Die lookAt-Matrix unten zielt auf einen
                    // tiefer liegenden Punkt und hat die Läufer am Hang nach
                    // vorn umkippen lassen.
                    faceDir(s.mesh, dx, dy);
                } else {
                    // Blickrichtung bergab (Richtung nächster Punkt) + Kurvenlage
                    const ahead = worldPosSmooth(gx + dx * 0.05 + px * sway, gy + dy * 0.05 + py * sway);
                    const m = new THREE.Matrix4().lookAt(s.mesh.position, ahead, new THREE.Vector3(0,1,0));
                    const q = new THREE.Quaternion().setFromRotationMatrix(m);
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.cos(t*s.freq + s.off*10) * 0.3));
                    s.mesh.quaternion.slerp(q, 0.3);
                }
            }
        });

        // ===== GIPFELKREUZE nur auf BEFAHRBAREN Gipfeln (mit flacher Flanke) =====
        // Prüft, ob vom Gipfel aus mind. eine Richtung eine skibare (flache,
        // absteigende) Flanke hat. Reine Felszinnen (allseitig steil) bekommen
        // kein Kreuz, da niemand hochfährt.
        const hasSkiableFlank = (px, py) => {
            for (let a = 0; a < 16; a++) {
                const ang = a / 16 * Math.PI * 2, sx = Math.cos(ang) * 2, sy = Math.sin(ang) * 2;
                let good = 0, cx = px, cy = py, prevH = heightmap[Math.round(cy) * gridSize + Math.round(cx)];
                for (let s = 1; s <= 6; s++) {
                    cx += sx; cy += sy;
                    if (cx < 2 || cy < 2 || cx >= gridSize - 2 || cy >= gridSize - 2) break;
                    const h = heightmap[Math.round(cy) * gridSize + Math.round(cx)];
                    if (tileBuildable(cx, cy) && h <= prevH + 0.5) { good++; prevH = h; } else break;
                }
                if (good >= 4) return true;
            }
            return false;
        };
        const names = PEAK_NAMES[level.id] || PEAK_NAMES.sandbox;
        const cand = findTopPeaks(heightmap, gridSize, 9, gridSize * 0.12);
        const peaks = cand.filter(pk => hasSkiableFlank(pk.x, pk.y)).slice(0, 3);
        peaks.forEach((pk, i) => {
            const cross = makeSummitCross(i === 0 ? 1.25 : 1.0);
            cross.position.copy(worldPos(pk.x, pk.y)); cross.rotation.y = 0.3 + i;
            scene.add(cross);
            // Namensschild darüber (echte Meereshöhe)
            const sign = makeTextSprite(names[i] || ('Gipfel ' + (i+1)), Math.round(baseAltitude + pk.h) + ' m');
            const cp = worldPos(pk.x, pk.y); // genau auf dem Gipfelpunkt
            sign.position.set(cp.x, cp.y + 3.1, cp.z); // knapp über dem Kreuz
            scene.add(sign);
            {
                const n8 = footprintSize(2.5), o8 = parcelOrigin(Math.round(pk.x), Math.round(pk.y), n8);
                parcelClaim(o8.gx, o8.gy, n8, OCC_BUILD, 'peak');
            }
        });
        place(makeSignpost(), vx + 2, vy + 2, 0.5, 1.4);
        if (firstLake) place(makeBench(), firstLake.gx, firstLake.gy, firstLake.rot, 1.2);

        // ===== FLANIERENDE GÄSTE an der Talstation =====
        const hubs = [[vx+3,vy+1],[vx-1,vy+4],[vx+6,vy-3],[vx-3,vy+2],[vx+2,vy+6],[vx+9,vy+2]];
        const walkers = [];
        for (let i = 0; i < 14; i++) {
            const wk = makeWalker(i);
            const h0 = hubs[i % hubs.length];
            wk.position.copy(worldPos(h0[0], h0[1]));
            scene.add(wk);
            const prof = makeGuestProfile(wk); prof.state = 'stroll';   // anklickbar
            walkers.push({ mesh: wk, from: h0, to: hubs[(i+2) % hubs.length], t: Math.random(), spd: 0.06 + Math.random()*0.05, prof });
        }
        updaters.push((tt) => {
            for (const w of walkers) {
                w.t += w.spd * 0.016;
                if (w.t >= 1) { w.t = 0; w.from = w.to; w.to = hubs[Math.floor(Math.random()*hubs.length)]; }
                const gx = w.from[0] + (w.to[0]-w.from[0])*w.t;
                const gy = w.from[1] + (w.to[1]-w.from[1])*w.t;
                const pos = worldPosSmooth(gx, gy); pos.y += GROUND_CLEAR;
                w.mesh.position.lerp(pos, 0.5);
                const ah = worldPosSmooth(w.from[0]+(w.to[0]-w.from[0])*Math.min(1,w.t+0.05), w.from[1]+(w.to[1]-w.from[1])*Math.min(1,w.t+0.05));
                w.mesh.lookAt(ah.x, w.mesh.position.y, ah.z);
                // Bein-Wackeln
                const sw = Math.sin(tt*8 + w.t*20) * 0.5;
                if (w.mesh.userData.legL) { w.mesh.userData.legL.rotation.x = sw; w.mesh.userData.legR.rotation.x = -sw; }
                w.mesh.position.y += Math.abs(Math.sin(tt*8 + w.t*20)) * 0.03;
            }
        });
    })();

    // Kamera
    // Weitsicht deutlich erhöht: Himmelskuppel und Bergkulisse liegen weit
    // außerhalb der Karte und würden bei 900 einfach weggeschnitten.
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.5, 6000);

    // ===================== BILDAUFBEREITUNG =====================
    // Reihenfolge: Szene rendern -> Glühen auf hellen Flächen -> Color-Grading
    // -> Kantenglättung. Fällt der Composer aus (alte GPU), rendert das Spiel
    // ganz normal weiter.
    let composer = null, bloomPass = null, gradePass = null, smaaPass = null;
    try {
        composer = new EffectComposer(renderer);
        composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        composer.addPass(new RenderPass(scene, camera));
        // Bloom: nur wirklich helle Stellen (Schnee im Gegenlicht, Sonne,
        // Fenster, Neon) glühen weich aus.
        bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.34,    // Stärke — bewusst dezent
            0.72,    // Radius
            0.86     // Schwelle: darunter passiert nichts
        );
        composer.addPass(bloomPass);
        // Color-Grading: leichter Kontrast-S-Kurve, kühle Schatten, warme
        // Lichter, sanfte Vignette und eine Spur Filmkorn. Das ist der
        // Unterschied zwischen „Render" und „Bild".
        const GradeShader = {
            uniforms: {
                tDiffuse: { value: null },
                uTime:    { value: 0 },
                // Dezent: leichte Aufhellung, sanfter Kontrast, KEINE
                // zusätzliche Sättigung (das Grün war sonst zu kräftig).
                uVignette:{ value: 0.16 },
                uContrast:{ value: 1.04 },
                uSat:     { value: 0.94 },
                uLift:    { value: new THREE.Color(0x121c28) },
                uGain:    { value: new THREE.Color(0xfff8ee) },
                // Leichtes Nachschärfen: gleicht die Weichheit der Kantenglättung aus
                uTexel:   { value: new THREE.Vector2(1 / 1280, 1 / 720) },
                uSharp:   { value: 0.3 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float uTime, uVignette, uContrast, uSat, uSharp;
                uniform vec3 uLift, uGain;
                uniform vec2 uTexel;
                varying vec2 vUv;
                void main() {
                    vec3 c = texture2D(tDiffuse, vUv).rgb;
                    // Nachschärfen: Abstand zum Mittel der vier Nachbarn verstärken
                    if (uSharp > 0.0) {
                        vec3 nb = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                                + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
                        c = max(vec3(0.0), c + (c - nb * 0.25) * uSharp);
                    }
                    // Kontrast um die Bildmitte
                    c = (c - 0.5) * uContrast + 0.5;
                    // Schatten kühl anheben, Lichter warm tönen
                    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
                    c += uLift * (1.0 - l) * 0.42;
                    c *= mix(vec3(1.0), uGain, l * 0.5);
                    // Sättigung
                    c = mix(vec3(l), c, uSat);
                    // Vignette
                    vec2 d = vUv - 0.5;
                    c *= 1.0 - uVignette * dot(d, d) * 1.9;
                    // feines Korn, damit Verläufe nicht bandieren
                    float g = fract(sin(dot(vUv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
                    c += (g - 0.5) * 0.010;
                    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
                }`
        };
        gradePass = new ShaderPass(GradeShader);
        composer.addPass(gradePass);
        smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
        composer.addPass(smaaPass);
    } catch (e) {
        composer = null;                 // Fallback: direkter Renderpfad
    }

    // ===================== BILDQUALITÄT PASST SICH AN =====================
    // Jede Stufe legt fest, wie fein gerechnet wird (Bildpunkte je CSS-Pixel, gedeckelt durch
    // das Gerät), wie groß die Schattenkarte ist und ob Glühen und Kantenglättung laufen.
    // Die Szene wird in genau der Auflösung gerechnet, in der sie angezeigt wird – früher
    // lag ein Verkleinerungsschritt dazwischen, das Bild wirkte dadurch weich (am Handy mit
    // seinen dichten Displays besonders).
    // Hält ein Gerät die Bildrate nicht, geht es stufenweise herunter; läuft es flüssig,
    // geht es vorsichtig hinauf – bis zur vollen Schärfe (Stufe 4).
    const QUALITY = [
        { px: 1.0,  shadow: 1024, bloom: false, smaa: false, sharp: 0 },
        { px: 1.25, shadow: 2048, bloom: false, smaa: true,  sharp: 0.30 },
        { px: 1.5,  shadow: 2048, bloom: true,  smaa: true,  sharp: 0.30 },
        { px: 1.75, shadow: smallTouch ? 2048 : 4096, bloom: true, smaa: true, sharp: 0.28 },
        { px: 2.0,  shadow: smallTouch ? 2048 : 4096, bloom: true, smaa: true, sharp: 0.25 }
    ];
    const Q_MAX = QUALITY.length - 1;
    let qTier = smallTouch ? 2 : 3;              // Startstufe: Handy vorsichtiger als Rechner
    try {
        const stored = parseInt(localStorage.getItem('mt.quality'), 10);
        if (stored >= 0 && stored <= Q_MAX) qTier = stored;      // letzter Stand dieses Geräts
    } catch { /* privater Modus */ }
    /** Bildgröße, Auflösung und Blickwinkel an Fenster und Qualitätsstufe anpassen. */
    const applySize = () => {
        const w = window.innerWidth, h = window.innerHeight, q = QUALITY[qTier];
        const dpr = window.devicePixelRatio || 1;
        camera.aspect = w / Math.max(1, h);
        // Hochkant (Handy) ist das Bild schmal: ein weiterer Blickwinkel zeigt wieder genug vom Gebiet.
        camera.fov = camera.aspect >= 1 ? 50 : Math.min(66, 50 + (1 - camera.aspect) * 32);
        camera.updateProjectionMatrix();
        const ratio = Math.min(dpr, q.px);
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h);
        if (composer) {
            composer.setPixelRatio(ratio);
            composer.setSize(w, h);          // gibt die Größe an alle Stufen der Bildaufbereitung weiter
        }
        if (gradePass) {
            gradePass.uniforms.uTexel.value.set(1 / Math.max(1, w * ratio), 1 / Math.max(1, h * ratio));
            gradePass.uniforms.uSharp.value = q.sharp;
        }
    };
    const applyQuality = () => {
        const q = QUALITY[qTier];
        if (bloomPass) bloomPass.enabled = q.bloom;
        if (smaaPass) smaaPass.enabled = q.smaa;
        if (sun.shadow.mapSize.x !== q.shadow) {
            sun.shadow.mapSize.set(q.shadow, q.shadow);
            if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // wird in neuer Größe neu angelegt
        }
        applySize();
        try { localStorage.setItem('mt.quality', String(qTier)); } catch { /* privater Modus */ }
    };
    applyQuality();
    // Messung: mittlere Bildrate je Zwei-Sekunden-Fenster. Pausen (Tab im Hintergrund)
    // und die Ladephase zählen nicht.
    //   unter 26 Bilder/s           → eine Stufe herunter
    //   über 52 Bilder/s, mehrfach  → eine Stufe hinauf – auf Probe: fällt die Bildrate danach
    //                                 unter 45, geht es zurück und der nächste Versuch wartet länger
    let qFrames = 0, qTime = 0, qGood = 0, qNeed = 2, qWarm = 0, qProbe = 0;
    const qualityFrame = (rawDt) => {
        if (document.visibilityState !== 'visible' || rawDt > 0.4) { qFrames = 0; qTime = 0; return; }
        if (qWarm < 4) { qWarm += rawDt; return; }
        qFrames++; qTime += rawDt;
        if (qTime < 2) return;
        const fps = qFrames / qTime; qFrames = 0; qTime = 0;
        const probing = qProbe > 0;
        if (probing) qProbe--;
        if (qTier > 0 && (fps < 26 || (probing && fps < 45))) {
            if (probing) { qNeed = Math.min(64, qNeed * 3); qProbe = 0; }   // der Schritt hinauf war zu viel
            qTier--; qGood = 0; qWarm = 3; applyQuality();
        } else if (fps > 52 && qTier < Q_MAX && !probing) {
            if (++qGood >= qNeed) { qTier++; qGood = 0; qWarm = 3; qProbe = 3; applyQuality(); }
        } else if (fps <= 52) qGood = 0;
    };

    // Startblick auf das Resort: Ziel zwischen Talstation und Gipfel, Distanz nach Kartengröße
    // Startblick UNTEN am Basisplatz (Talpunkt), leicht Richtung Berg versetzt
    const camG = worldPos(BASE_GX + (RSX - BASE_GX) * 0.22, BASE_GY + (RSY - BASE_GY) * 0.22);
    const target = new THREE.Vector3(camG.x, camG.y + worldSpan * 0.03, camG.z);
    // Oberfläche an einem beliebigen Weltpunkt: auf der Karte die Schneedecke,
    // außerhalb das Umland (dieselbe Formel wie die Geländeschürze). Daran
    // richtet sich die Kamera aus – sie kann nirgends in den Boden eintauchen.
    const APRON_REACH = worldSpan * 1.70;          // Vorgabe von buildTerrainApron
    const surfaceAt = (wx, wz) => {
        const ax = Math.abs(wx), az = Math.abs(wz);
        if (ax <= half && az <= half) return yAtSmooth((wx + half) / tile, (wz + half) / tile);
        // außerhalb: Randpunkt auf dem Strahl vom Kartenmittelpunkt, von dort nach außen
        const k = half / Math.max(ax, az);
        const ex = wx * k, ez = wz * k;
        const edgeY = yAtSmooth((ex + half) / tile, (ez + half) / tile);
        const v = Math.min(1, (Math.hypot(wx, wz) - Math.hypot(ex, ez)) / APRON_REACH);
        // Die Schürze ist grob vernetzt und weicht von der Formel ab – etwas Luft lassen.
        return apronHeight(edgeY, Math.atan2(ez, ex), v).y + 2.5;
    };
    // Für die Kamera selbst zählt zusätzlich alles Feste, das aus dem Schnee ragt (Felsblöcke).
    const solidAt = (wx, wz) => Math.max(surfaceAt(wx, wz), rockTopAt(wx, wz));
    // Die erste Kulissenkette steht bei 1.30 Kartenbreiten – die Kamera bleibt davor.
    const orbit = attachOrbit(camera, canvas, target, worldSpan, { groundAt: surfaceAt, solidAt, bound: half, maxRadius: worldSpan * 1.15 });
    orbit.setDist(worldSpan * 0.62);
    // ===== DUNST WANDERT MIT =====
    // Die festen Werte (95 … 560) waren auf die kleinste Karte (291 breit) abgestimmt.
    // Auf großen Karten lag dadurch schon der Startblick halb im Nebel, und im
    // Überblick verschwand das ganze Gebiet. Der Dunst skaliert jetzt mit der
    // Kartengröße und weicht beim Herauszoomen zurück: der Bereich um den
    // Drehpunkt bleibt so klar wie beim Startblick, nur die Ferne verblasst.
    const FOG_NEAR = worldSpan * (95 / 291), FOG_DEPTH = worldSpan * (465 / 291), FOG_LEAD = worldSpan * 0.29;
    const updateFog = () => {
        if (!scene.fog) return;
        const near = Math.max(FOG_NEAR, orbit.viewDist() - FOG_LEAD);
        scene.fog.near = near; scene.fog.far = near + FOG_DEPTH;
    };
    updateFog();
    if (import.meta.env.DEV) window.__mtCam = { orbit, camera, surfaceAt, solidAt, terrain, apron, rocks, forest, scene, sun, renderer, THREE, half, world, heightmap, hScale, gridSize };   // nur beim Entwickeln: Kamera und Szene prüfen

    // Schnee-Partikel
    const snow = (() => {
        const N=1700; const g=new THREE.BufferGeometry(); const p=new Float32Array(N*3);
        for(let i=0;i<N;i++){ p[i*3]=(Math.random()-0.5)*worldSpan; p[i*3+1]=Math.random()*worldSpan*0.4+5; p[i*3+2]=(Math.random()-0.5)*worldSpan; }
        g.setAttribute('position', new THREE.BufferAttribute(p,3));
        const pts=new THREE.Points(g, new THREE.PointsMaterial({ color:0xffffff, size:0.3, transparent:true, opacity:0.65 }));
        scene.add(pts); return pts;
    })();

    // =====================================================================
    //  SICHTBARE WINDBÖE — "Schneefahne"
    //  --------------------------------------------------------------------
    //  Eine Bö ist sonst nur an den Fahnen zu erahnen. Hier fegt zusätzlich
    //  eine flache Wolke aufgewirbelten Schnees quer über das Gelände: ein
    //  Band von Partikeln, das dicht über dem Boden in Windrichtung wandert,
    //  an- und wieder abschwillt. Die Partikel folgen dem Höhenprofil, damit
    //  die Fahne über Kuppen streicht statt durch sie hindurch.
    // =====================================================================
    const gustVeil = (() => {
        // Deutlich mehr, dafür sehr viel feinere Körner: eine Schneefahne
        // besteht aus Staub, nicht aus Wattebäuschen.
        const N = 2600;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(N * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xf4f8ff, size: 0.13, transparent: true, opacity: 0,
            depthWrite: false, sizeAttenuation: true }));
        pts.frustumCulled = false;
        pts.visible = false;
        scene.add(pts);
        // Ruhelage: quer zur Böenrichtung gestreut, mit etwas Tiefe
        const lat = new Float32Array(N), lon = new Float32Array(N),
              hgt = new Float32Array(N), ph = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            lat[i] = (Math.random() - 0.5) * worldSpan * 1.1;   // quer zum Wind
            lon[i] = (Math.random() - 0.5) * 34;                // Tiefe der Front
            // Dichte nimmt nach oben stark ab: unten fegt es dicht über den
            // Boden, darüber wirbelt nur noch vereinzelt Staub.
            const u0 = Math.random();
            hgt[i] = 0.06 + u0 * u0 * u0 * 3.2;
            ph[i]  = Math.random() * 6.283;
        }
        return { pts, geo, pos, lat, lon, hgt, ph, N };
    })();

    const updateGustVeil = (t) => {
        const V = gustVeil;
        const f = wind.gustF || 0;
        if (f <= 0.01) { V.pts.visible = false; return; }
        V.pts.visible = true;
        V.pts.material.opacity = Math.min(0.40, f * 0.46);
        V.pts.material.size = 0.09 + f * 0.10;
        const dx = wind.x, dz = wind.z;          // Windrichtung
        const px = -dz, pz = dx;                 // quer dazu
        const cx = dx * wind.gustPos, cz = dz * wind.gustPos;
        const half2 = worldSpan * 0.5;
        for (let i = 0; i < V.N; i++) {
            // Fahne wabert leicht, damit sie nicht wie ein Lineal aussieht
            const wob = Math.sin(t * 2.3 + V.ph[i]) * 2.2 * f;
            const x = cx + px * V.lat[i] + dx * (V.lon[i] + wob);
            const z = cz + pz * V.lat[i] + dz * (V.lon[i] + wob);
            if (Math.abs(x) > half2 || Math.abs(z) > half2) {
                // ausserhalb der Karte: unsichtbar weit nach unten parken
                V.pos[i * 3] = x; V.pos[i * 3 + 1] = -9999; V.pos[i * 3 + 2] = z;
                continue;
            }
            const gx = (x + half) / tile, gy = (z + half) / tile;
            // Nur wo Schnee liegt, wirbelt auch welcher auf
            const base = yAtSmooth(gx, gy);
            // Feines Flimmern statt gleichförmigem Schweben
            const lift = V.hgt[i] * f * (0.55 + 0.45 * Math.sin(t * 5.3 + V.ph[i] * 3.1));
            V.pos[i * 3] = x;
            V.pos[i * 3 + 1] = base + 0.04 + lift;
            V.pos[i * 3 + 2] = z;
        }
        V.geo.attributes.position.needsUpdate = true;
    };

    /**
     * Gangbild für Gäste, die abschnallen und laufen müssen. Die Beine
     * schwingen gegenläufig aus der Hüfte, die Arme pendeln dazu gegengleich,
     * der Oberkörper beugt sich leicht vor und wiegt mit. Rückgabe ist der
     * vertikale Versatz — bei jedem Schritt hebt sich der Körper kurz.
     */
    /**
     * Figur in eine Gitterrichtung drehen. Bewusst NICHT über lookAt(): wenn
     * Ziel- und Standpunkt fast zusammenfallen (kurze Segmente, nachhinkende
     * Position), entartet dessen Matrix und die Figur kippt um — genau das
     * ließ einzelne Gäste "liegen" statt laufen.
     */
    /**
     * FAHRZEUG PLAN AUFS GELÄNDE LEGEN.
     *
     * `faceDir` dreht nur um die Hochachse — ein Kettenfahrzeug steht damit
     * am Hang schief in der Luft bzw. gräbt sich vorn ein. Diese Funktion
     * ergänzt Nicken (in Fahrtrichtung) und Wanken (quer dazu) aus dem
     * tatsächlichen Geländegefälle.
     */
    /**
     * Raupe auf den Boden setzen: Nach dem Nachziehen (lerp) und dem
     * Schrittbegrenzer stimmt die Höhe nicht mehr zwingend mit dem Gelände an
     * der tatsächlichen XZ-Position überein, und auf Kuppen liegt die Mitte
     * tiefer als die Kettenenden. Deshalb die vier Kettenecken im lokalen
     * Rahmen abtasten und den Körper auf die höchste davon heben — so
     * versinkt nie eine Ecke in der Landschaft.
     */
    const _catCorner = new THREE.Vector3();
    /**
     * Raupe auf den Boden setzen — an der TATSÄCHLICHEN Position, nach lerp
     * und Schrittbegrenzer. (Vorher wurde die Lage am Zielpunkt berechnet,
     * die Raupe hing aber dahinter: Neigung und Höhe passten zu einer
     * anderen Stelle → abheben, verkippen.)
     * Ablauf: Fahrtrichtung beibehalten, Ebene durch die vier Kettenenden
     * legen, Mitte auf deren Mittel setzen, zuletzt kein Ende im Boden lassen.
     */
    function settleCat(mesh, dir, S, SW) {
        const ft = mesh.userData.foot || { w: 0.45, l: 0.8 };
        const L = ft.l, W = ft.w;
        const { gx, gy } = worldToGrid(mesh.position.x, mesh.position.z);
        const d = dir && (Math.abs(dir.dx) > 1e-6 || Math.abs(dir.dy) > 1e-6) ? dir : (mesh.userData._lastDir || { dx: 0, dy: 1 });
        mesh.userData._lastDir = d;
        alignToSlope(mesh, gx, gy, d.dx, d.dy, S || L / tile, SW || W / tile);
        mesh.position.y = mesh.userData._groundY + 0.05;
        let lift = 0;
        for (const [b, a] of [[W, L], [-W, L], [W, -L], [-W, -L]]) {
            _catCorner.set(b, 0, a).applyQuaternion(mesh.quaternion);
            const wx = mesh.position.x + _catCorner.x, wz = mesh.position.z + _catCorner.z;
            const expect = mesh.position.y + _catCorner.y;
            const c = worldToGrid(wx, wz);
            const sink = yAtSmooth(c.gx, c.gy) + 0.03 - expect;
            if (sink > lift) lift = sink;
        }
        if (lift > 0) mesh.position.y += lift;
        // Höhe zeitlich glätten (nur nach unten hart: nie im Boden)
        const ud = mesh.userData;
        if (ud._yS != null && ud._yS < mesh.position.y) mesh.position.y = ud._yS + (mesh.position.y - ud._yS) * 0.35;
        ud._yS = mesh.position.y;
    }
    function alignToSlope(mesh, gx, gy, dx, dy, S = 1.6, SW = S) {
        const len = Math.hypot(dx, dy) || 1;
        const fx = dx / len, fy = dy / len;         // Fahrtrichtung
        const px = -fy, py = fx;                    // quer dazu
        // S = halbe Länge, SW = halbe Breite der Aufstandsfläche (Kacheln).
        // Raupen: die VIER KETTENENDEN abtasten und die Lage als Ebene durch
        // diese Punkte bestimmen — so liegen beide Ketten vorn und hinten auf.
        const c = (a, b) => yAtSmooth(gx + fx * a + px * b, gy + fy * a + py * b);
        const yFL = c(S, SW), yFR = c(S, -SW), yBL = c(-S, SW), yBR = c(-S, -SW);
        const yF = (yFL + yFR) / 2, yB = (yBL + yBR) / 2;
        const yL = (yFL + yBL) / 2, yR = (yFR + yBR) / 2;
        const yaw = Math.atan2(fx, fy);
        // Nicken: negativ = Nase hoch (bergauf)
        const pitch = Math.atan2(yF - yB, 2 * S);
        const roll = Math.atan2(yL - yR, 2 * SW);
        // Fahrzeugmitte = Mittel der vier Auflagepunkte (starre Ebene)
        mesh.userData._groundY = (yFL + yFR + yBL + yBR) / 4;
        // Zeitliche Glättung für Fahrzeuge mit Aufstandsfläche: das Gelände
        // wird jedes Bild neu abgetastet — ohne Dämpfung zittert die Lage.
        let P = pitch, Rl = roll;
        if (mesh.userData.foot) {
            const pr = mesh.userData._pr;
            if (pr) { P = pr.p + (pitch - pr.p) * 0.16; Rl = pr.r + (roll - pr.r) * 0.16; }
            mesh.userData._pr = { p: P, r: Rl };
        }
        mesh.rotation.set(0, 0, 0);
        mesh.rotation.y = yaw;
        // in lokalen Achsen anlegen, damit Reihenfolge stimmt
        mesh.rotateX(-P);
        // Lokal +x zeigt nach RECHTS (entgegen px/py). roll > 0 heißt „links
        // höher“ — dafür muss die rechte Seite SINKEN, also negatives Vorzeichen.
        // (Vorher seitenverkehrt: eine Kette grub sich am Querhang ein.)
        mesh.rotateZ(-Rl);
    }
    function faceDir(mesh, dx, dy) {
        if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;   // Richtung unbekannt -> Haltung behalten
        mesh.rotation.set(0, Math.atan2(dx, dy), 0);
    }
    function walkPose(mesh, t, off, pace = 1) {
        const ud = mesh.userData;
        const ph = t * 6.2 * pace + off * 7;
        const sw = Math.sin(ph);
        if (ud.legL) {
            ud.legL.rotation.set(sw * 0.62, 0, 0);      // z=0 löscht Carving-Reste
            ud.legR.rotation.set(-sw * 0.62, 0, 0);
        }
        if (ud.armL) {
            ud.armL.rotation.x = -sw * 0.5; ud.armR.rotation.x = sw * 0.5;
            ud.armL.rotation.z = 0.12;      ud.armR.rotation.z = -0.12;
        }
        if (ud.torso) {
            // y=0 löscht die Gegenrotation aus der Skitechnik
            ud.torso.rotation.set(0.16 + Math.cos(ph * 2) * 0.035, 0, -sw * 0.05);
        }
        if (!ud.carrying && ud.setCarry) ud.setCarry(true);          // Ski schultern
        return Math.abs(Math.cos(ph)) * 0.045;
    }
    /** Zurück in die Fahrhaltung: Gliedmaßen neutral, Ausrüstung angeschnallt. */
    function ridePose(mesh, isBoarder) {
        const ud = mesh.userData;
        // ALLE Achsen zurücksetzen — vom Carving bleiben sonst seitliche
        // Bein-/Armwinkel stehen und die Figur wirkt schief.
        if (ud.legL) { ud.legL.rotation.set(0, 0, 0); ud.legR.rotation.set(0, 0, 0); }
        if (ud.armL) { ud.armL.rotation.set(0, 0, 0); ud.armR.rotation.set(0, 0, 0); }
        if (ud.torso) ud.torso.rotation.set(0, 0, 0);
        if (ud.setCarry) ud.setCarry(false);
        if (ud.setSnowboard) ud.setSnowboard(!!isBoarder);
        else if (ud.gear) ud.gear.visible = true;
    }

    // ===== SICHTBARE GÄSTE (Skifahrer, die auf Routen zirkulieren) =====
    const guestPool = [];
    // Gäste-KI: jeder Gast wählt sich selbst Lift und Piste, fährt Lift hoch,
    // sucht sich oben eine (nahe) Piste, wedelt runter, sucht unten einen (nahen)
    // Lift usw. Kein Vollgas quer über die Karte — nur nahe Anschlüsse (Radius R).
    const routeTop = (r) => (r.path ? r.path[0] : r.top);
    const routeBottom = (r) => (r.path ? r.path[r.path.length - 1] : r.bottom);
    const R_LINK = 26; // max. Kachel-Distanz für einen "nahen" Anschluss
    const pickNear = (list, from, key) => {
        if (!list.length) return null;
        const near = list.filter(r => Math.hypot(key(r).gx - from.gx, key(r).gy - from.gy) < R_LINK);
        const pool = near.length ? near : list;
        // unter den Nahen zufällig, sonst der nächstgelegene
        if (near.length) return pool[(Math.random() * pool.length) | 0];
        let best = null, bd = Infinity;
        for (const r of list) { const d = Math.hypot(key(r).gx - from.gx, key(r).gy - from.gy); if (d < bd) { bd = d; best = r; } }
        return best;
    };
    // ===== WEGENETZ-LOGIK =====
    // Grundregel: durchs Skigebiet bewegt man sich mit den LIFTEN. Zu Fuß geht
    // nur, wer ein Ziel in unmittelbarer Nähe hat. Niemand marschiert quer
    // über den Berg zu einer Hütte am anderen Ende der Karte.
    // ===== ANZIEHUNGSKRAFT EINER ANLAGE =====
    // Eine große, schnelle Bahn ist das Ziel im Gebiet: dorthin läuft man
    // auch ein Stück, und dort stellt man sich lieber an als am Tellerlift.
    // `pull` wächst mit Förderleistung (Plätze/Takt) und Fahrgeschwindigkeit.
    const liftPull = (L) => {
        const cap = L.cap || 2, gap = L.gap || 6, spd = L.rideSpeed || 1;
        const perMin = (cap / Math.max(1, gap)) * 60;      // Personen pro Minute
        return Math.pow(perMin, 0.62) * (0.7 + spd * 0.35);
    };
    /** Wie weit läuft ein Gast für DIESE Anlage? Große Bahnen ziehen weiter. */
    // Spreizung bewusst flach, aber über den ganzen Bereich: zum Tellerlift
    // läuft man 22 Kacheln, zur großen Einseilumlaufbahn über 60.
    const walkRangeFor = (L) => Math.min(72, 22 + liftPull(L) * 1.25);
    const WALK_MAX = 20;          // Kacheln, die ein Gast höchstens zu Fuß geht
    const BRANCH_RADIUS = 10;     // Umkreis, in dem auf eine andere Piste gewechselt wird
    const dist2D = (a, b) => Math.hypot(a.gx - b.gx, a.gy - b.gy);
    /**
     * Nächstgelegene Kasse (nur dort gibt es den Skipass) — aber NUR in
     * Gehweite. Ohne diese Grenze lief jeder Gast ohne Skipass zur einzigen
     * Kasse im Gebiet, notfalls quer über die gesamte Karte. Genau daher kam
     * die Wanderung aus den Nebenorten.
     */
    const TICKET_WALK_MAX = 30;
    const nearestTicketDesk = (from) => {
        let best = null, bd = TICKET_WALK_MAX;
        for (const b of placedBuildings) {
            if (b.type !== 'ticket') continue;
            const p = { gx: (b.rec.x + half) / tile, gy: (b.rec.z + half) / tile };
            const d = dist2D(p, from);
            if (d < bd) { bd = d; best = { pos: p, d, b }; }
        }
        return best;
    };
    /** Einkehrziel in Gehweite — je dringender das Bedürfnis, desto eher. */
    const nearbyVisit = (g, from) => {
        const cands = [];
        for (const b of placedBuildings) {
            if (!VISIT_TYPES.includes(b.type)) continue;
            const p = { gx: (b.rec.x + half) / tile, gy: (b.rec.z + half) / tile };
            const d = dist2D(p, from);
            if (d <= WALK_MAX) cands.push({ b, p, d });
        }
        if (!cands.length) return null;
        // Volle Blase hat VORRANG: gibt es eine Toilette in Reichweite, wird
        // sie angesteuert. Vorher war 'toilet' überhaupt kein Besuchsziel —
        // die Blase stieg immer weiter und drückte dauerhaft die Laune.
        if (g.bladder > 62) {
            const wc = cands.filter(c => c.b.type === 'toilet');
            if (wc.length) {
                wc.sort((x, y) => x.d - y.d);
                return wc[0];
            }
        }
        // Hunger/Durst ziehen zur Gastro, Müdigkeit zum Bett
        const wantFood = g.hunger > 60 || g.thirst > 60;
        const wantBed = g.mood < 35 || g.bladder > 80;
        const pref = cands.filter(c =>
            (wantFood && PARTY_TYPES.includes(c.b.type)) ||
            (wantBed && SLEEP_TYPES.includes(c.b.type)));
        const pool = pref.length ? pref : cands;
        return pool[(Math.random() * pool.length) | 0];
    };
    /**
     * Gast auf einen kurzen Fußweg schicken.
     *
     * HARTE SICHERUNG: Fußwege sind IMMER kurz. Egal welcher Aufrufer ein Ziel
     * vorschlägt — liegt es weiter als WALK_HARD_MAX entfernt, wird der Weg
     * verweigert und der Gast bleibt stehen. Das verhindert zuverlässig, dass
     * irgendeine Suchfunktion jemanden quer über die Karte marschieren lässt.
     */
    const WALK_HARD_MAX = 34;
    const WALK_HARD_MAX_LIFT = 66;   // zur Talstation läuft man deutlich weiter
    /** Liegt an dieser Stelle Wasser? (See, Fluss, Meer) */
    const isWaterAt = (gx, gy) => {
        const x = Math.round(gx), y = Math.round(gy);
        if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
        return world.landcover[y * gridSize + x] === 2;
    };
    /** Kreuzt die direkte Verbindung ein Gewässer? */
    const crossesWater = (a, b) => {
        const steps = Math.max(2, Math.ceil(dist2D(a, b)));
        for (let k = 0; k <= steps; k++) {
            const f = k / steps;
            if (isWaterAt(a.gx + (b.gx - a.gx) * f, a.gy + (b.gy - a.gy) * f)) return true;
        }
        return false;
    };
    const sendWalk = (g, from, to, visitType, meta) => {
        // Für den Weg zu einer Talstation gilt eine großzügigere Grenze als
        // für einen Hüttenbesuch: 34 Kacheln waren so knapp, dass eine große
        // Bahn am anderen Ende des Basisplatzes gar nicht erreichbar war und
        // die Gäste stattdessen herumstanden.
        const cap = visitType === 'liftwalk' ? WALK_HARD_MAX_LIFT : WALK_HARD_MAX;
        if (dist2D(from, to) > cap) return false;
        // NIEMAND läuft durchs Wasser. Führt der direkte Weg über einen See,
        // einen Fluss oder ins Meer, wird er verworfen.
        if (crossesWater(from, to)) return false;
        g.state = 'walk'; g.prog = 0;
        g.walkFrom = { gx: from.gx, gy: from.gy };
        g.walkTo = { gx: to.gx, gy: to.gy };
        g.walkLen = Math.max(1, dist2D(from, to));
        g.visitType = visitType;
        g.frontX = meta?.frontX ?? 0; g.frontY = meta?.frontY ?? 1;
        g.tgtR = meta?.radius || 2.5;
        return true;
    };
    /**
     * An einer Liftschlange anstellen.
     *
     * SICHERHEITSNETZ: Ohne gültigen Skipass wird NIEMAND eingereiht — egal
     * welcher Aufrufer es versucht. Die Regel steckt damit an genau einer
     * Stelle und lässt sich durch keinen neuen Pfad umgehen.
     */
    const joinLiftQueue = (g, L, down = false) => {
        if (!g.hasTicket) return false;
        if (g.queueOf) leaveQueue(g);
        // Fahrten je Anlage merken — Grundlage für die Neugier bei der Wahl
        if (!g.ridden) g.ridden = new Map();
        g.ridden.set(L, (g.ridden.get(L) || 0) + 1);
        g.state = 'queue'; g.route = L; g.prog = 0;
        g.queueOf = L; g.queueDown = down;
        (down ? L.queueDown : L.queue).push(g);
        g.mesh.visible = true;
        ridePose(g.mesh, g.isBoarder);
        return true;
    };
    const leaveQueue = (g) => {
        if (!g.queueOf) return;
        for (const arr of [g.queueOf.queue, g.queueOf.queueDown]) {
            const i = arr.indexOf(g);
            if (i >= 0) arr.splice(i, 1);
        }
        g.queueOf = null; g.queueDown = false;
    };
    /**
     * Was tut der Gast an dieser Stelle als Nächstes?
     * `atTop` = er steht an einer Bergstation und hat die freie Wahl:
     * Piste hinunter, Anschlusslift höher, oder Einkehr in der Nähe.
     */
    const planNext = (g, at, atTop, lifts, pistes) => {
        // 1) Ohne Skipass geht gar nichts — erst zur Kasse.
        // OHNE GÜLTIGEN SKIPASS FÄHRT NIEMAND — keine Ausnahme. Ist keine
        // Kasse in Gehweite, wartet der Gast an Ort und Stelle. Er bekommt
        // den Pass NICHT geschenkt; der Spieler muss eine Kasse hinbauen.
        if (!g.hasTicket) {
            const desk = nearestTicketDesk(at);
            if (desk && sendWalk(g, at, desk.pos, 'ticket', desk.b)) return;
            g.noTicket = true;                       // fürs Infofeld
            g.state = 'idle'; g.prog = 0;
            g.idleAt = { gx: at.gx, gy: at.gy };
            g.inVillage = null;
            for (const vv of villages) if (dist2D(vv, at) < 22) { g.inVillage = vv.name; break; }
            return;
        }
        g.noTicket = false;

        // ===== WELCHE WEGE FÜHREN VON HIER WEITER? =====
        // Erst alle Möglichkeiten sammeln, dann entscheiden. Stranden ist die
        // ALLERLETZTE Option — sobald der Spieler irgendwo in der Nähe baut,
        // greift wieder eine der Optionen und der Stau löst sich von selbst.
        // Abfahrten, die von HIER aus noch bergab führen. Es zählt nicht nur der
        // Pistenanfang: kreuzt oder streift eine Piste diese Stelle, kann man
        // dort einfach einsteigen — solange noch Strecke nach unten übrig ist.
        const downhill = [];
        for (const r of pistes) {
            if (dist2D(routeTop(r), at) < R_LINK) { downhill.push({ r, at: 0 }); continue; }
            if (!r.path || r.path.length < 3) continue;
            let bi = -1, bd = Infinity;
            for (let k = 0; k < r.path.length - 1; k++) {
                const dd = dist2D(r.path[k], at);
                if (dd < bd) { bd = dd; bi = k; }
            }
            // in Reichweite UND es bleibt noch ein gutes Stück Abfahrt übrig
            if (bd <= BRANCH_RADIUS && bi >= 0 && bi < r.path.length - 3) {
                downhill.push({ r, at: bi / (r.path.length - 1) });
            }
        }
        /** Eine der gefundenen Abfahrten aufnehmen (ggf. mitten auf der Strecke). */
        const takeDownhill = () => {
            // Gewichtet statt zufällig: unbekannte Pisten locken, und lange
            // Abfahrten sind interessanter als kurze Stummel. So wandern die
            // Gäste mit der Zeit in entlegene Teile des Gebiets.
            let sum = 0;
            const w = downhill.map(d => {
                const ridden = (g.ridden && g.ridden.get(d.r)) || 0;
                const len = d.r.lenTiles || (d.r.path ? d.r.path.length : 20);
                const v = Math.max(0.05, Math.pow(len, 0.6) / (1 + ridden * 0.8));
                sum += v; return v;
            });
            let pk = Math.random() * sum, pick = downhill[downhill.length - 1];
            for (let i = 0; i < downhill.length; i++) { pk -= w[i]; if (pk <= 0) { pick = downhill[i]; break; } }
            g.state = 'piste'; g.route = pick.r; g.prog = pick.at;
            if (!g.ridden) g.ridden = new Map();
            g.ridden.set(pick.r, ((g.ridden.get(pick.r)) || 0) + 1);
        };
        const liftsUp  = lifts.filter(r => dist2D(routeBottom(r), at) < R_LINK);    // Talstation hier
        // Bergstation hier UND die Anlage lässt eine Talfahrt zu
        const liftsDown = lifts.filter(r => r.canDescend && dist2D(routeTop(r), at) < R_LINK);
        // In Gehweite erreichbare Talstationen (etwas weiter als R_LINK)
        // Zu einer kleinen Anlage läuft niemand weit — zu einer großen
        // Kabinen- oder Pendelbahn dagegen schon. Deshalb wird nicht mehr die
        // NÄCHSTE Talstation genommen, sondern die mit dem besten Verhältnis
        // aus Anziehungskraft und Weg.
        let walkLift = null, wBest = -Infinity;
        for (const r of lifts) {
            const d = dist2D(routeBottom(r), at);
            if (d <= R_LINK) continue;
            if (d > walkRangeFor(r)) continue;
            // Wegstrecke zählt weniger, Schlange und Bekanntheit mehr:
            // ein unbekannter Lift weiter weg schlägt den überfüllten daneben.
            const riddenW = (g.ridden && g.ridden.get(r)) || 0;
            const score = liftPull(r) / (1 + riddenW * 0.7) - d * 0.32 - (r.queue.length * 0.6);
            if (score > wBest) { wBest = score; walkLift = r; }
        }
        // Zu Fuß NIE in eine andere Ortschaft: wer in Ort B steht, wandert
        // nicht quer über die Karte nach Ort A. Ein Ziel, das näher an einem
        // FREMDEN Ort liegt als am eigenen Standort, fällt weg.
        if (walkLift) {
            const tgt = routeBottom(walkLift);
            for (const v of villages) {
                if (dist2D(v, at) < 22) continue;          // der eigene Ort zählt nicht
                if (dist2D(v, tgt) < 26) { walkLift = null; break; }
            }
        }
        /**
         * Anlage aus einer Liste wählen — NICHT mehr rein zufällig.
         * Gewichtet nach Anziehungskraft, gedämpft durch die aktuelle
         * Schlangenlänge: die große Bahn zieht den Pulk, aber wenn dort schon
         * alles steht, weichen einzelne auf die kleinere aus. Genau daraus
         * entsteht ein sichtbarer Ansturm statt gleichmäßiger Verteilung.
         */
        const pickLift = (list) => {
            if (list.length === 1) return list[0];
            let sum = 0;
            const w = list.map(r => {
                const wait = (r.queue.length + r.queueDown.length) / Math.max(1, r.cap || 2);
                // ===== NEUGIER =====
                // Wer eine Bahn schon mehrfach gefahren ist, zieht es zu
                // einer anderen — je öfter gefahren, desto schwächer der Sog.
                // Dazu drückt eine lange Schlange deutlich stärker als vorher.
                // Beides zusammen verteilt die Gäste über das ganze Gebiet
                // statt sie am ersten Lift zu stapeln.
                const ridden = (g.ridden && g.ridden.get(r)) || 0;
                const novelty = 1 / (1 + ridden * 0.7);
                const v = Math.max(0.05, liftPull(r) * novelty / (1 + wait * 1.1));
                sum += v; return v;
            });
            let pick = Math.random() * sum;
            for (let i = 0; i < list.length; i++) { pick -= w[i]; if (pick <= 0) return list[i]; }
            return list[list.length - 1];
        };
        const hasOnward = downhill.length || liftsUp.length || liftsDown.length || walkLift;

        // 2) Einkehr in Gehweite — aber nur, wenn es danach auch weitergeht.
        //    Am blinden Ende soll die Hütte das Problem nicht kaschieren.
        if (hasOnward) {
            const hungry = g.hunger > 55 || g.thirst > 55 || g.mood < 40;
            if (Math.random() < (hungry ? 0.55 : 0.16)) {
                const v = nearbyVisit(g, at);
                if (v && sendWalk(g, at, v.p, v.b.type, v.b)) return;
            }
        }

        // 3) Oben an der Bergstation: zuerst eine Abfahrt, sonst weiter hinauf
        if (atTop) {
            if (downhill.length) { takeDownhill(); return; }
            if (liftsUp.length && joinLiftQueue(g, pickLift(liftsUp))) return;
            // Keine Abfahrt und kein Anschluss: mit Sessel oder Gondel einfach
            // wieder hinunterfahren. Das ist völlig normal — nur am Schlepplift
            // geht es nicht, dort sitzt man fest.
            if (liftsDown.length && joinLiftQueue(g, pickLift(liftsDown), true)) return;
        }

        // 4) Talstation in Reichweite -> anstellen
        if (liftsUp.length && joinLiftQueue(g, pickLift(liftsUp))) return;
        // 5) Auch unten kann eine Abfahrt weiterführen (verzweigtes Gebiet)
        if (downhill.length) { takeDownhill(); return; }
        // 6) Talfahrt als Rückweg, falls die Anlage das hergibt
        if (liftsDown.length && joinLiftQueue(g, pickLift(liftsDown), true)) return;
        // 7) Zu Fuß zur nächsten Talstation, wenn sie in Gehweite liegt
        if (walkLift && sendWalk(g, at, routeBottom(walkLift), 'liftwalk', null)) return;

        // 8) Wirklich nichts erreichbar: Der Gast strandet sichtbar. Sobald der
        //    Spieler hier einen Lift oder eine Piste baut, greift Schritt 3–7
        //    beim nächsten Versuch und der Gast zieht von selbst weiter.
        //    Vorher darf er noch einmal einkehren, wenn eine Hütte da ist.
        if (!g.deadEndVisit) {
            const v = nearbyVisit(g, at);
            if (v && sendWalk(g, at, v.p, v.b.type, v.b)) { g.deadEndVisit = true; return; }
        }
        // Wartepunkt notfalls ans Ufer verschieben — niemand steht im See.
        let ix = at.gx, iy = at.gy;
        if (isWaterAt(ix, iy)) {
            outer2: for (let r = 1; r <= 8; r++) {
                for (let a = 0; a < 12; a++) {
                    const nx = at.gx + Math.cos(a / 12 * Math.PI * 2) * r * 1.5;
                    const ny = at.gy + Math.sin(a / 12 * Math.PI * 2) * r * 1.5;
                    if (!isWaterAt(nx, ny)) { ix = nx; iy = ny; break outer2; }
                }
            }
        }
        g.state = 'idle'; g.prog = 0; g.idleAt = { gx: ix, gy: iy };
        // Steht der Gast in einer noch nicht erschlossenen ORTSCHAFT, ist das
        // kein Notfall, sondern der normale Ausgangszustand: er wartet dort,
        // bis der Spieler einen Lift oder eine Piste hinbaut.
        g.inVillage = null;
        for (const v of villages) {
            if (dist2D(v, at) < 22) { g.inVillage = v.name; break; }
        }
    };


    // ===================== BERGRETTUNG =====================
    // Gestürzte Gäste werden geborgen: die Sanitätsstation schickt ein Skidoo,
    // die Klinik einen Helikopter. Ohne beides bleibt der Verletzte liegen —
    // das drückt die Zufriedenheit und ist für den Spieler sichtbar.
    // 0.00012 = Normalbetrieb (etwa alle paar Minuten stürzt jemand),
    // 0.0004  = Testwert, damit man das Rettungssystem schneller zu sehen bekommt.
    // ===== STURZRATE =====
    // 0.0004 je Gast und Sekunde war viel zu selten: bei 40 Fahrern auf
    // roten Pisten und gutem Pistenzustand kam rechnerisch alle zwei Minuten
    // EIN Sturz — und der war meist schon geborgen, bevor man hinsah.
    // 0.0012 ergibt bei denselben Bedingungen rund alle 30 Sekunden einen
    // Sturz, also durchgehend ein bis zwei Verletzte im Gebiet.
    const FALL_RATE = 0.0012;
    const injured = [];              // wartende Verletzte
    const rescues = [];              // laufende Einsätze
    // (Einzel-Meshes ersetzt durch heliFleet / sledFleet)
    // Parkhöhen: das Helipad liegt am Modell hinterlegt, das Skidoo steht
    // ebenerdig neben der Sanitätsstation.
    const HELIPAD_Y = 4.12, SLED_PARK_OFF = 2.4;

    /** Schneewirbel unter dem Helikopter (Rotorabwind). */
    function makeDownwash() {
        const N = 260;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(N * 3);
        const seed = new Float32Array(N);
        for (let i = 0; i < N; i++) seed[i] = Math.random();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xffffff, size: 0.16, transparent: true, opacity: 0, depthWrite: false
        }));
        pts.userData.seed = seed;
        pts.visible = false;
        scene.add(pts);
        return pts;
    }
    /** Wirbel animieren: Flocken spiralen vom Boden nach außen und oben. */
    function updateDownwash(pw, cx, cy, cz, strength, t) {
        pw.visible = strength > 0.02;
        if (!pw.visible) return;
        pw.material.opacity = 0.55 * strength;
        const p = pw.geometry.attributes.position, sd = pw.userData.seed;
        for (let i = 0; i < p.count; i++) {
            const ph = (t * (0.7 + sd[i] * 0.6) + sd[i] * 9) % 1;
            const rad = 0.6 + ph * 4.2 * (0.5 + strength);
            const ang = sd[i] * Math.PI * 2 + ph * 5.5;
            const lift = Math.sin(ph * Math.PI) * 1.4 * strength;
            p.setXYZ(i, cx + Math.cos(ang) * rad, cy + lift, cz + Math.sin(ang) * rad);
        }
        p.needsUpdate = true;
    }
    let downwash = null;

    /** Gitterposition und Fußpunkt des nächstgelegenen Gebäudes eines Typs. */
    /** ALLE Stationen eines Typs mit Position — je Station ein Fahrzeug. */
    function allBuildingPos(type) {
        const out = [];
        for (const b of placedBuildings) {
            if (b.type !== type) continue;
            out.push({
                b,
                gx: (b.rec.x + half) / tile,
                gy: (b.rec.z + half) / tile,
                baseY: b.mesh ? b.mesh.position.y : null,
                // Höhe des Landeplatzes am Modell (skaliert mit der Bauphase)
                padY: b.mesh ? (b.mesh.userData.helipadY || 0) * (b.mesh.scale.y || 1) : 0
            });
        }
        return out;
    }
    function nearestBuildingPos(type) { return allBuildingPos(type)[0] || null; }

    // ===== RETTUNGSFLOTTE =====
    // Vorher gab es genau EIN Heli-Mesh und EIN Skidoo-Mesh, egal wie viele
    // Kliniken standen. Ein zweites Krankenhaus brachte deshalb keinen
    // zweiten Heli. Jetzt hält jede Station ihr eigenes Fahrzeug; Einsätze
    // gehen an das nächste freie.
    const heliFleet = [];   // [{ mesh, station, busy }]
    const sledFleet = [];
    const syncFleet = (fleet, type, make) => {
        const stations = allBuildingPos(type);
        // je Station ein Fahrzeug anlegen
        while (fleet.length < stations.length) {
            const m = make(); m.visible = false; scene.add(m);
            if (m.userData.setNight) nightVehicles.push(m);
            fleet.push({ mesh: m, station: null, busy: false });
        }
        // überzählige (Station abgerissen) ausblenden
        for (let i = 0; i < fleet.length; i++) {
            fleet[i].station = stations[i] || null;
            if (!fleet[i].station) fleet[i].mesh.visible = false;
        }
    };

    /**
     * Fahrzeuge stehen einsatzbereit an ihrer Station, sobald diese gebaut ist —
     * der Heli auf dem Dach der Klinik, das Skidoo davor.
     */
    function parkRescueVehicles(t) {
        syncFleet(heliFleet, 'hospital', makeRescueHeli);
        syncFleet(sledFleet, 'medical', makeRescueSled);
        for (const h of heliFleet) {
            if (!h.station || h.busy) continue;
            const hp = h.station, wp = worldPosSmooth(hp.gx, hp.gy);
            const baseY = hp.baseY ?? wp.y;
            h.mesh.visible = true;
            h.mesh.position.set(wp.x, baseY + (hp.padY || HELIPAD_Y), wp.z);
            h.mesh.rotation.set(0, Math.PI * 0.25, 0);
            h.mesh.userData.setRotor(0);
            h.mesh.userData.setWinch(0.05);
            h.mesh.userData.victim.visible = false;
            if (h.mesh.userData.update) h.mesh.userData.update(t, 0);
        }
        for (const sd of sledFleet) {
            if (!sd.station || sd.busy) continue;
            const mp = sd.station, wp = worldPosSmooth(mp.gx, mp.gy + SLED_PARK_OFF);
            sd.mesh.visible = true;
            sd.mesh.position.set(wp.x, wp.y + 0.05, wp.z);
            sd.mesh.rotation.y = Math.PI * 0.15;
            sd.mesh.userData.patient.visible = false;
            if (sd.mesh.userData.update) sd.mesh.userData.update(t);
        }
    }

    /** Startet einen Einsatz für den ersten wartenden Verletzten. */
    function dispatchRescue() {
        if (!injured.length) return;
        syncFleet(heliFleet, 'hospital', makeRescueHeli);
        syncFleet(sledFleet, 'medical', makeRescueSled);
        // Freie Fahrzeuge mit Station
        const freeH = heliFleet.filter(h => h.station && !h.busy);
        const freeS = sledFleet.filter(x => x.station && !x.busy);
        if (!freeH.length && !freeS.length) return;
        const g = injured.shift();
        if (!g || g.state !== 'down') return;
        // ===== WER RÜCKT AUS? =====
        // Für den Verletzten wird das NÄCHSTE freie Skidoo und der NÄCHSTE
        // freie Heli bestimmt. Nahe, befahrbare Fälle bekommen das Skidoo,
        // ferne den Heli. Mit zwei Kliniken fliegen auch zwei Helis.
        const SLED_RANGE = 85;
        let bestS = null, dS = Infinity;
        for (const sd of freeS) {
            const d = Math.hypot(sd.station.gx - g.downAt.gx, sd.station.gy - g.downAt.gy);
            if (d >= dS || d > SLED_RANGE) continue;
            // Vorher: nur die LUFTLINIE auf Wasser geprüft. Sobald ein Bach
            // zwischen Station und Piste lag, rückte das Skidoo NIE aus —
            // obwohl es Wasser längst umfahren kann. Jetzt echte Pfadsuche.
            const reach = typeof sledCanReach === 'function' ? sledCanReach(sd.station, g.downAt) : !crossesWater(sd.station, g.downAt);
            if (reach) { dS = d; bestS = sd; }
        }
        let bestH = null, dH = Infinity;
        for (const h of freeH) {
            const d = Math.hypot(h.station.gx - g.downAt.gx, h.station.gy - g.downAt.gy);
            if (d < dH) { dH = d; bestH = h; }
        }
        const useHeli = bestH && (!bestS || dS > 42);
        if (!useHeli && !bestS) { injured.unshift(g); return; }
        if (useHeli) {
            if (!downwash) downwash = makeDownwash();
            bestH.busy = true; bestH.mesh.visible = true;
            rescues.push({ kind: 'heli', g, from: bestH.station, to: { ...g.downAt },
                           phase: 'fly', t: 0, veh: bestH });
        } else {
            bestS.busy = true; bestS.mesh.visible = true;
            rescues.push({ kind: 'sled', g, from: bestS.station, to: { ...g.downAt },
                           phase: 'out', t: 0, veh: bestS });
        }
    }

    /** Einsätze fortschreiben. */
    function updateRescues(t, dt) {
        parkRescueVehicles(t);            // Fahrzeuge stehen sichtbar bereit
        sim.rescAcc = (sim.rescAcc || 0) + dt;
        if (sim.rescAcc > 1.5) { sim.rescAcc = 0; dispatchRescue(); }
        for (let i = rescues.length - 1; i >= 0; i--) {
            const R = rescues[i];
            R.t += dt;
            const A = R.from, B = R.to;
            const sledMesh = R.veh.mesh, heliMesh = R.veh.mesh;
            if (R.kind === 'sled') {
                // ---- SKIDOO: hinfahren, aufladen, zurückfahren ----
                // Deutlich gemächlicher als vorher — ein Motorschlitten im
                // Rettungseinsatz rast nicht über die Piste.
                // Fahrzeit richtet sich nach der Strecke: ein Einsatz gleich
                // neben der Station dauert nicht so lange wie einer am
                // anderen Ende des Gebiets.
                const distTiles = Math.hypot(B.gx - A.gx, B.gy - A.gy);
                const dur = Math.max(5, Math.min(26, distTiles * 0.42));
                const out = R.phase === 'out';
                // FAHREN statt interpolieren: gleiches Fahrzeugmodell wie die
                // Raupe (Kurs, Drehrate, Hindernisprobe) — kein Driften, kein
                // Zucken um Häuser und Bäume. Zeitlimit nur als Notbremse.
                if (!R._veh) {
                    R._veh = { mesh: sledMesh, _target: null, _hdg: null };
                    const sp = worldPosSmooth(A.gx, A.gy); sledMesh.position.set(sp.x, sp.y, sp.z);
                    if (!sledMesh.userData.foot) sledMesh.userData.foot = { w: 0.3, l: 0.55 };
                }
                R._veh._target = out ? B : A;
                let arrived = false;
                if (typeof sledDrive === 'function') arrived = sledDrive(R._veh, dt);
                settleCat(sledMesh, R._veh._dir, 0.55 / tile, 0.3 / tile);
                if (sledMesh.userData.update) sledMesh.userData.update(t);
                const f = arrived || R.t > dur * 2.5 ? 1 : 0;
                if (f >= 1) {
                    if (out) {
                        R.phase = 'back'; R.t = 0;
                        // Der Gast liegt jetzt auf dem Schlitten — sein eigenes
                        // Mesh bleibt bis zum Einsatzende aus (der Gäste-Updater
                        // schaltet sonst jedes Bild wieder auf sichtbar).
                        R.g.carried = true; R.g.mesh.visible = false;
                        sledMesh.userData.patient.visible = true;
                    } else {
                        sledMesh.userData.patient.visible = false;
                        R.veh.busy = false;              // zurück an der Station
                        finishRescue(R.g);
                        rescues.splice(i, 1);
                    }
                }
                continue;
            }
            // ---- HELIKOPTER: starten, anfliegen, winden, zurück aufs Pad ----
            const wpB = worldPosSmooth(B.gx, B.gy);
            const wpA = worldPosSmooth(A.gx, A.gy);
            const CRUISE = 14;
            let px, py, pz, rotor = 1, wash = 0, winch = 0.05;
            /**
             * ===== HINDERNISFREIE FLUGHÖHE =====
             * Der Heli flog bisher auf einer GERADEN zwischen zwei Punkten.
             * Liegt ein Grat dazwischen, ging er mitten hindurch. Hier wird
             * das Gelände entlang der Reststrecke abgetastet und die höchste
             * Erhebung plus Sicherheitsabstand als Mindesthöhe erzwungen.
             */
            const safeY = (fx, fz, e2) => {
                let top = -Infinity;
                // 12 Stützstellen reichen: die Kuppe dazwischen wird durch
                // den Sicherheitsabstand mit abgedeckt.
                for (let k = 0; k <= 12; k++) {
                    const u = k / 12;
                    // von der aktuellen Position bis zum Ziel schauen, plus
                    // ein Stück über die aktuelle Stelle hinaus zurück
                    const sx2 = fx + (wpB.x - fx) * u, sz2 = fz + (wpB.z - fz) * u;
                    const gg2 = worldToGrid(sx2, sz2);
                    const yh = yAtSmooth(gg2.gx, gg2.gy);
                    if (yh > top) top = yh;
                }
                // Nah am Ziel darf er absinken, sonst würde er nie landen
                const clearNeed = 6.5 * Math.min(1, e2 * 4);
                return top + clearNeed;
            };
            if (R.phase === 'fly') {
                const f = Math.min(1, R.t / 7);
                const e = f * f * (3 - 2 * f);
                const spin = Math.min(1, R.t / 1.6);          // Rotor läuft hoch
                rotor = spin;
                const climb = Math.min(1, R.t / 3);
                px = wpA.x + (wpB.x - wpA.x) * e;
                pz = wpA.z + (wpB.z - wpA.z) * e;
                const startY = (A.baseY ?? wpA.y) + (A.padY || HELIPAD_Y);
                py = startY + (wpA.y + CRUISE - startY) * climb + (wpB.y - wpA.y) * e;
                if (R.t > 1.4) heliMesh.rotation.y = Math.atan2(wpB.x - wpA.x, wpB.z - wpA.z);
                heliMesh.rotation.z = -0.16 * climb;
                // Über Grate steigen statt hindurch: die Reststrecke wird
                // abgetastet, `py` nie unter die freie Höhe gedrückt.
                py = Math.max(py, safeY(px, pz, 1 - f));
                if (f >= 1) { R.phase = 'down'; R.t = 0; }
            } else if (R.phase === 'down') {
                const f = Math.min(1, R.t / 3.5);
                px = wpB.x; pz = wpB.z;
                py = Math.max(wpB.y + 5.5, wpB.y + CRUISE - (CRUISE - 5.5) * f);
                heliMesh.rotation.z = -0.16 * (1 - f);
                wash = f * 0.85;
                if (f >= 1) { R.phase = 'winch'; R.t = 0; }
            } else if (R.phase === 'winch') {
                const f = Math.min(1, R.t / 4.5);
                px = wpB.x; pz = wpB.z; py = wpB.y + 5.5;
                wash = 1;
                winch = f < 0.45 ? 0.1 + (f / 0.45) * 4.6
                      : f < 0.6 ? 4.7
                      : 4.7 - ((f - 0.6) / 0.4) * 4.6;
                if (f > 0.5 && !R.picked) {
                    R.picked = true;
                    // Der Verletzte verschwindet NICHT — er wird sichtbar in
                    // den Bergesack gelegt und mit der Trosse hochgezogen.
                    heliMesh.userData.bag.visible = true;
                    R.g.carried = true;            // Updater lässt ihn los; der Heli zeichnet ihn an der Trosse
                }
                if (f >= 1) { R.phase = 'home'; R.t = 0; }
            } else {
                const f = Math.min(1, R.t / 8);
                const e = f * f * (3 - 2 * f);
                px = wpB.x + (wpA.x - wpB.x) * e;
                pz = wpB.z + (wpA.z - wpB.z) * e;
                const padY = (A.baseY ?? wpA.y) + (A.padY || HELIPAD_Y);
                const cruiseY = wpB.y + 5.5 + (CRUISE - 5.5) * Math.sin(Math.min(1, f * 2) * Math.PI / 2)
                     + (wpA.y - wpB.y) * e;
                const land = Math.max(0, (f - 0.72) / 0.28);
                py = cruiseY + (padY - cruiseY) * (land * land * (3 - 2 * land));
                // Rückweg ebenfalls über die Grate — hier zählt das Gelände
                // zwischen aktueller Position und LANDEPLATZ.
                {
                    let top = -Infinity;
                    for (let k = 0; k <= 12; k++) {
                        const u = k / 12;
                        const sx2 = px + (wpA.x - px) * u, sz2 = pz + (wpA.z - pz) * u;
                        const gg2 = worldToGrid(sx2, sz2);
                        const yh = yAtSmooth(gg2.gx, gg2.gy);
                        if (yh > top) top = yh;
                    }
                    py = Math.max(py, top + 6.5 * (1 - land));
                }
                heliMesh.rotation.y = Math.atan2(wpA.x - wpB.x, wpA.z - wpB.z);
                heliMesh.rotation.z = -0.16 * Math.min(1, f * 3) * (1 - land);
                wash = Math.max(0, 0.7 - f * 1.4);
                rotor = 1 - land * 0.85;
                if (f >= 1) {
                    heliMesh.userData.bag.visible = false;
                    if (downwash) downwash.visible = false;
                    R.veh.busy = false;                  // gelandet, wieder frei
                    finishRescue(R.g);
                    rescues.splice(i, 1);
                    continue;   // ab jetzt parkt parkRescueVehicles() den Heli wieder
                }
            }
            heliMesh.position.set(px, py, pz);
            heliMesh.userData.setRotor(rotor);
            heliMesh.userData.setWinch(winch);
            if (heliMesh.userData.update) heliMesh.userData.update(t, dt);
            // ===== VERLETZTER HÄNGT WIRKLICH AN DER TROSSE =====
            // Sobald er eingehängt ist, folgt seine Figur der Bergeschlinge:
            // erst wird sie mit hochgewunden, dann fliegt sie unter dem Heli
            // zur Station mit — genau wie beim Skidoo, wo er auf dem
            // Akja liegt.
            if (R.picked) {
                heliMesh.updateMatrixWorld(true);
                heliMesh.userData.getSlingPos(_slingV);
                R.g.mesh.visible = true;
                R.g.mesh.position.set(_slingV.x, _slingV.y - 0.30, _slingV.z);
                // liegend im Sack, quer zur Flugrichtung, leichtes Pendeln
                R.g.mesh.rotation.set(-Math.PI / 2, heliMesh.rotation.y,
                                      Math.sin(t * 1.9) * 0.10);
                if (R.g.mark) R.g.mark.visible = false;
                if (R.g.sad) R.g.sad.visible = false;
            }
            if (downwash) updateDownwash(downwash, wpB.x, wpB.y + 0.15, wpB.z, wash, t);
        }
    }
    /** Geborgener Gast: erholt sich und startet wieder unten. */
    function finishRescue(g) {
        g.carried = false;
        g.hurt = false;
        g.hurtT = 0;
        g.state = null; g.prog = 0; g.route = null;
        if (g.carrier) {
            const i4 = g.carrier.slots.indexOf(g);
            if (i4 >= 0) g.carrier.slots.splice(i4, 1);
            g.carrier = null;
        }
        g.dragRisk = false;
        g.justAte = false;
        g.inVillage = null;
        g.noTicket = false;
        g.mesh.scale.set(1, 1, 1);
        g.atPos = null;
        g.mood = Math.max(30, g.mood);
        g.mesh.visible = true;
        g.mesh.rotation.set(0, 0, 0);
        if (g.mark) g.mark.visible = false;
        if (g.sad) g.sad.visible = false;
        ridePose(g.mesh, g.isBoarder);
    }

    /** Gibt es im Gebiet überhaupt ein Gebäude eines dieser Typen? */
    function hasAnyBuilding(types) {
        for (const b of placedBuildings) if (types.includes(b.type)) return true;
        return false;
    }
    /**
     * Laune-Abzüge aus unerfüllten Grundbedürfnissen. Wird jeden Frame je
     * Gast aufgerufen und wirkt sich auch auf die Gesamtzufriedenheit aus.
     */
    function applyNeedPenalty(g, dt) {
        // Nur wenn der Gast das Bedürfnis auch NICHT stillen kann: steht ein
        // passendes Gebäude im Gebiet, ist ein voller Bauch nur eine Frage
        // der Zeit und keinen Laune-Abzug wert.
        let drain = 0;
        if (g.bladder > 96 && !hasAnyBuilding(['toilet'])) drain += 1.2;
        if (g.hunger > 96 && !hasAnyBuilding(PARTY_TYPES)) drain += 1.0;
        if (g.thirst > 96 && !hasAnyBuilding(PARTY_TYPES)) drain += 0.8;
        if (drain > 0) {
            g.mood = Math.max(2, g.mood - dt * drain);
            sim.satisfaction = Math.max(10, sim.satisfaction - dt * 0.03);
        }
    }
    /**
     * Aktuelles Ärgernis eines Gastes ermitteln. Rückgabe: Kurztext oder null.
     * Reihenfolge = Dringlichkeit; das erste Treffer bestimmt die Anzeige.
     */
    function guestGripe(g) {
        if (g.state === 'down') {
            return g.hurtT > 25 ? '🚑 wartet viel zu lange auf Hilfe'
                 : g.hurtT > 12 ? '🚑 wartet auf die Bergrettung' : null;
        }
        if (g.noTicket) return '🎫 findet keine Kasse für den Skipass';
        if ((g.stranded || 0) > 5) {
            return g.inVillage
                ? '🏘️ wartet in ' + g.inVillage + ' auf einen Lift'
                : '🚧 kommt hier nicht weiter';
        }
        if (g.walking) return '🥾 muss laufen — hier liegt kein Schnee';
        // Nur melden, wenn es im Gebiet auch nichts Passendes gibt.
        if (g.bladder > 96 && !hasAnyBuilding(['toilet'])) return '🚻 findet keine Toilette';
        if (g.hunger > 96 && !hasAnyBuilding(PARTY_TYPES)) return '🍽️ findet nichts zu essen';
        if (g.thirst > 96 && !hasAnyBuilding(PARTY_TYPES)) return '🥤 findet nichts zu trinken';
        return null;
    }
    // ===== GARANTIERTER STURZ-TAKT =====
    // Die reine Wahrscheinlichkeit pro Bild ist tückisch: sie hängt an dt,
    // an der Zahl der gerade wirklich fahrenden Gäste und an mehreren
    // vorgelagerten `continue`s in der Gästeschleife. In der Praxis kam
    // dadurch minutenlang gar nichts. Deshalb zusätzlich ein Taktgeber, der
    // in festen Abständen GARANTIERT jemanden stürzen lässt — solange nicht
    // ohnehin schon genug Verletzte auf Bergung warten.
    let _fallTimer = 14;
    const FALL_MIN_GAP = 11, FALL_MAX_GAP = 26, FALL_MAX_WAITING = 4;
    const tickScheduledFalls = (dt) => {
        _fallTimer -= dt;
        if (_fallTimer > 0) return;
        _fallTimer = FALL_MIN_GAP + Math.random() * (FALL_MAX_GAP - FALL_MIN_GAP);
        if (injured.length >= FALL_MAX_WAITING) return;
        // Kandidaten: wer gerade wirklich auf einer Piste unterwegs ist
        const cand = [];
        for (const g of guestPool) {
            if (!g.mesh.visible || g.hurt) continue;
            if (g.state !== 'piste' || !g.route) continue;
            if (g.prog < 0.06 || g.prog > 0.94) continue;
            cand.push(g);
        }
        if (!cand.length) return;
        // Schlechte Pisten erhöhen die Chance, dass der Takt auch greift
        const groomBad = Math.max(0, (85 - sim.groom) / 85);
        if (Math.random() > 0.45 + groomBad * 0.55) return;
        const g = cand[(Math.random() * cand.length) | 0];
        const p = g.route.path;
        let at = g.lastGrid || null;
        if (!at && p && p.length >= 2) {
            const fi = Math.min(p.length - 1, Math.max(0, Math.round(g.prog * (p.length - 1))));
            at = { gx: p[fi].gx, gy: p[fi].gy };
        }
        if (!at) return;
        startFall(g, at);
    };

    /** Gast stürzt und bleibt verletzt liegen — Rettung wird angefordert. */
    function startFall(g, at) {
        g.state = 'down'; g.hurt = true; g.prog = 0;
        g.downAt = at || g.downAt || null;
        leaveQueue(g);
        if (!injured.includes(g)) injured.push(g);
        sim.satisfaction = Math.max(10, sim.satisfaction - 0.6);
    }
    /** Talnächstes bergwärts fahrendes Fahrzeug einer Anlage (für den Einstieg). */
    function pickBoardingCarrier(L) {
        const cars = L.model?.carriers;
        if (!cars || !cars.length) return null;
        let best = null, bd = Infinity;
        for (const c of cars) {
            if (!c.up) continue;
            if (c.along < bd) { bd = c.along; best = c; }
        }
        if (best) best.slots = [];       // neues Fahrzeug, Plätze frei
        return best;
    }
    /** Liegt auf der Lifttrasse durchgehend Schnee? */
    function liftTrackHasSnow(L) {
        const a = routeBottom(L), b = routeTop(L);
        for (let k = 1; k < 8; k++) {
            const f = k / 8;
            const gx = Math.round(a.gx + (b.gx - a.gx) * f);
            const gy = Math.round(a.gy + (b.gy - a.gy) * f);
            if (!hasSnowAt(gx, gy)) return false;
        }
        return true;
    }
    // =====================================================================
    //  SKIKURS
    //  --------------------------------------------------------------------
    //  Jede gebaute Skischule stellt einen Skilehrer. Er sammelt bis zu
    //  sechs Gäste ein und fährt mit ihnen in einer Reihe die Piste hinunter
    //  — die Gruppe hält dabei einen festen Abstand und fährt exakt seine
    //  Spur nach. Danach löst sich der Kurs auf und die Gäste machen wieder
    //  ihr eigenes Ding.
    //
    //  Zur Dauer: die Spieluhr ist stark gerafft (ein voller Tag = 90 s),
    //  eine halbe Spielstunde wären keine zwei Sekunden. Eine Kursstunde
    //  wird deshalb als eine vollständige Abfahrt mit der Gruppe modelliert,
    //  gedeckelt auf CLASS_MAX Sekunden.
    // =====================================================================
    const cachedInstructor = {};   // Lehrer-Meshes, Schlüssel = Schule + Slot
    const CLASS_SIZE = 6;          // Gäste je Kurs
    const CLASS_GAP  = 0.030;      // Abstand in Streckenanteil je Schüler
    const CLASS_RIDE = 600;        // 10 Minuten Echtzeit unterwegs
    const CLASS_REST = 300;        // danach 5 Minuten Pause vor der Schule
    const INSTRUCTORS_PER_SCHOOL = 2;
    const skiClasses = [];         // laufende Kurse
    const classSlots = new Map();  // Zustand je Lehrer: 'rest' bis wann

    /**
     * Schlüssel eines Lehrers: Platz der Schule in `placedBuildings` plus
     * Slotnummer. Jede Schule stellt INSTRUCTORS_PER_SCHOOL Lehrer, die
     * unabhängig voneinander Kurse führen.
     */
    const slotKey = (b, slot) => 's' + placedBuildings.indexOf(b) + '_' + slot;

    const instructorFor = (b, slot) => {
        const key = slotKey(b, slot);
        let im = cachedInstructor[key];
        if (!im) {
            im = makeSkiInstructor(1000 + Object.keys(cachedInstructor).length * 7);
            scene.add(im); registerFlags(im);
            cachedInstructor[key] = im;
        }
        return im;
    };

    /**
     * Lehrer ohne laufenden Kurs stehen vor ihrer Schule und warten — so ist
     * auch zwischen zwei Kursen zu sehen, dass es sie gibt. Zwei Lehrer je
     * Schule stellen sich nebeneinander.
     */
    const parkIdleInstructors = (t) => {
        for (const b of placedBuildings) {
            if (b.type !== 'skischool') continue;
            for (let slot = 0; slot < INSTRUCTORS_PER_SCHOOL; slot++) {
                if (skiClasses.some(c => c.school === b && c.slot === slot)) continue;
                const im = instructorFor(b, slot);
                // ACHTUNG: frontX/frontY ist eine RICHTUNG (sin/cos der
                // Drehung), keine Gitterposition.
                const bgx = (b.rec.x + half) / tile, bgy = (b.rec.z + half) / tile;
                const fx = b.frontX ?? 0, fy = b.frontY ?? 1;
                const sideX = fy, sideY = -fx;                 // quer zur Blickrichtung
                const off = (slot - (INSTRUCTORS_PER_SCHOOL - 1) / 2) * 1.4;
                const wp = worldPosSmooth(bgx + fx * 2.2 + sideX * off,
                                          bgy + fy * 2.2 + sideY * off);
                im.visible = true;
                im.position.set(wp.x, wp.y + GROUND_CLEAR, wp.z);
                im.rotation.set(0, Math.atan2(fx, fy), 0);
                // wartend: leicht wippen, gelegentlich winken, versetzt je Slot
                const ud = im.userData;
                const ph = slot * 2.1;
                if (ud.torso) ud.torso.rotation.x = 0.03 * Math.sin(t * 1.1 + ph);
                if (ud.armL) {
                    const wave = Math.sin(t * 0.5 + ph) > 0.85;
                    ud.armL.rotation.x = wave ? -2.2 + Math.sin(t * 9) * 0.35 : 0;
                    ud.armR.rotation.x = 0;
                }
            }
        }
    };

    /** Kurs auflösen: Schüler dürfen wieder selbst entscheiden. */
    const endSkiClass = (cls) => {
        for (const g of cls.members) {
            g.inClass = null; g.classFollow = false;
            g.prog = Math.min(0.995, g.prog);
        }
        cls.members.length = 0;
        cls.done = true;
    };

    /** Eine Piste suchen, deren Anfang nah an `at` (Weltkoordinaten) liegt. */
    const pisteNear = (pistes, wx, wz, maxD) => {
        let best = null, bd = maxD;
        for (const r of pistes) {
            if (!r.path || r.path.length < 4) continue;
            const tp = routeTop(r);
            const w = worldPosSmooth(tp.gx, tp.gy);
            const d = Math.hypot(w.x - wx, w.z - wz);
            if (d < bd) { bd = d; best = r; }
        }
        return best;
    };

    const updateSkiClasses = (t, dt, pistes) => {
        // =============== LAUFENDE KURSE ===============
        for (let i = skiClasses.length - 1; i >= 0; i--) {
            const cls = skiClasses[i];
            cls.age += dt;
            // Ausgefallene Schüler (verletzt, ausgeblendet) verlassen die Gruppe
            cls.members = cls.members.filter(g => g.inClass === cls && !g.hurt && g.mesh.visible);

            // ---- Kursende nach CLASS_RIDE Sekunden ----
            if (cls.age > CLASS_RIDE || cls.members.length === 0) {
                endSkiClass(cls);
                classSlots.set(slotKey(cls.school, cls.slot), t + CLASS_REST);
                skiClasses.splice(i, 1);
                continue;
            }

            const im = cls.mesh;
            const r = cls.route;

            // ---- SAMMELN: nach einer Abfahrt findet sich die Gruppe oben
            //      wieder zusammen. Die Schüler fahren derweil ganz normal
            //      mit dem Lift hoch, der Lehrer ist so lange „im Lift“ und
            //      damit unsichtbar.
            if (cls.mode === 'regroup') {
                im.visible = false;
                cls.wait += dt;
                // Wer ist wieder oben auf einer Piste unterwegs?
                let lead = null;
                for (const g of cls.members) {
                    if (g.state === 'piste' && g.route && g.route.path && g.prog < 0.25) {
                        if (!lead || g.prog > lead.prog) lead = g;
                    }
                }
                if (lead) {
                    cls.route = lead.route;
                    cls.prog = Math.min(0.9, lead.prog + CLASS_GAP * (CLASS_SIZE + 1));
                    cls.mode = 'ride';
                    cls.wait = 0;
                } else if (cls.wait > 70) {
                    // Niemand kommt hoch — Kurs abbrechen, statt ewig zu warten
                    endSkiClass(cls);
                    classSlots.set(slotKey(cls.school, cls.slot), t + CLASS_REST);
                    skiClasses.splice(i, 1);
                }
                continue;
            }

            // ---- FAHREN ----
            if (!r || !r.path || r.path.length < 2) {
                for (const g of cls.members) g.classFollow = false;
                cls.mode = 'regroup'; cls.wait = 0; continue;
            }
            cls.prog += dt * cls.v;
            if (cls.prog >= 1) {
                // Unten angekommen: Schüler dürfen selbst zum Lift, die
                // Gruppe sammelt sich oben wieder.
                cls.prog = 1;
                // Ab hier steuern sich die Schüler wieder selbst: sie
                // fahren die Abfahrt zu Ende und stellen sich am Lift an.
                // Bliebe `classFollow` an, würden sie unten einfrieren.
                for (const g of cls.members) { g.prog = 0.999; g.classFollow = false; }
                cls.mode = 'regroup'; cls.wait = 0;
                continue;
            }
            const fi = cls.prog * (r.path.length - 1);
            const i0b = Math.min(r.path.length - 2, Math.floor(fi)), fr = fi - i0b;
            const pa = r.path[i0b], pb = r.path[i0b + 1];
            const gx = pa.gx + (pb.gx - pa.gx) * fr, gy = pa.gy + (pb.gy - pa.gy) * fr;
            const wp = worldPosSmooth(gx, gy);
            im.visible = true;
            im.position.set(wp.x, wp.y + GROUND_CLEAR, wp.z);
            const ah = worldPosSmooth(pb.gx, pb.gy);
            im.lookAt(ah.x, im.position.y, ah.z);
            im.rotation.z = Math.sin(t * 1.9) * 0.20;      // ruhige Vorfahrschwünge
            if (im.userData.torso) im.userData.torso.rotation.x = 0.18;

            // ---- Schüler in einer Reihe hinterher ----
            cls.members.forEach((g, k) => {
                g.route = r;
                g.state = 'piste';
                g.classFollow = true;      // Position kommt vom Lehrer
                g.prog = Math.max(0, cls.prog - (k + 1) * CLASS_GAP);
                g.classLane = ((k % 2) ? 1 : -1) * (0.35 + (k >> 1) * 0.12);
            });
        }

        // =============== NEUE KURSE ERÖFFNEN ===============
        parkIdleInstructors(t);
        if (pistes.length === 0) return;
        for (const b of placedBuildings) {
            if (b.type !== 'skischool') continue;
            for (let slot = 0; slot < INSTRUCTORS_PER_SCHOOL; slot++) {
                const key = slotKey(b, slot);
                if (skiClasses.some(c => c.school === b && c.slot === slot)) continue;
                // Pause noch nicht vorbei? Beim allerersten Mal die beiden
                // Lehrer versetzt starten lassen, sonst brechen sie im
                // Gleichschritt auf.
                if (!classSlots.has(key)) classSlots.set(key, t + 5 + slot * 45);
                if (t < classSlots.get(key)) continue;

                const best = pisteNear(pistes, b.rec.x, b.rec.z, Infinity);
                if (!best) continue;
                const pool = [];
                for (const g of guestPool) {
                    if (pool.length >= CLASS_SIZE) break;
                    if (!g.mesh.visible || g.hurt || g.inClass) continue;
                    if (g.state === 'lift' || g.state === 'queue' || g.state === 'visit') continue;
                    pool.push(g);
                }
                if (pool.length < CLASS_SIZE) continue;   // erst ab voller Gruppe
                const cls = { school: b, slot, route: best, prog: 0, age: 0, wait: 0,
                              mode: 'ride', v: 0.020, mesh: instructorFor(b, slot),
                              members: pool, done: false };
                for (const g of pool) {
                    leaveQueue(g);
                    g.inClass = cls; g.state = 'piste'; g.route = best; g.prog = 0;
                    g.mesh.visible = true;
                    if (g.mark) g.mark.visible = false;
                    if (g.sad) g.sad.visible = false;
                    g.mood = Math.min(100, g.mood + 8);   // Unterricht hebt die Laune
                }
                skiClasses.push(cls);
                return;                                    // pro Tick nur ein Kurs
            }
        }
    };

    // =====================================================================
    //  KEIN HUSCHEN — SCHRITTBEGRENZER
    //  --------------------------------------------------------------------
    //  Gäste und Pistenraupen bewegen sich an vielen Stellen per lerp() oder
    //  position.set(). Springt ein Ziel (neue Route, Zustandswechsel), zog
    //  das die Figur in wenigen Bildern quer über den Hang. Dieser Filter
    //  sitzt HINTER allen Bewegungen: pro Bild darf sich niemand weiter
    //  bewegen, als es sein Fortbewegungsmittel hergibt. Ist das Ziel weit,
    //  läuft die Figur sichtbar dorthin — auf dem üblichen Weg, so lange es
    //  eben dauert.
    //
    //  Ausnahmen (echte Sprünge sind dort korrekt):
    //   - im Lift/in der Kabine: Position kommt vom Fahrzeug
    //   - unsichtbar (im Hotel, im Auto, noch nicht gespawnt)
    //   - `_spawn`-Flag: einmaliges Einsetzen an einem neuen Startpunkt
    // =====================================================================
    const MAX_SPEED = { piste: 12.0, walk: 3.4, cat: 4.5 };
    /** Bogenlänge (Kacheln) an Fortschritt prog auf einer Route — INTERPOLIERT
     *  zwischen den Stützpunkten (die liegen mehrere Kacheln auseinander). */
    const arcAt = (r, prog) => {
        if (!r.cum) { r.cum = [0]; for (let k = 1; k < r.path.length; k++) r.cum[k] = r.cum[k - 1] + Math.hypot(r.path[k].gx - r.path[k - 1].gx, r.path[k].gy - r.path[k - 1].gy); }
        const fi = Math.max(0, Math.min(r.path.length - 1, prog * (r.path.length - 1)));
        const i0 = Math.min(r.path.length - 2, Math.floor(fi)), f = fi - i0;
        return r.cum[i0] + (r.cum[i0 + 1] - r.cum[i0]) * f;
    };
    const _stepV = new THREE.Vector3();
    const clampStep = (mesh, prev, maxDist) => {
        _stepV.subVectors(mesh.position, prev);
        const d = _stepV.length();
        if (d <= maxDist || d < 1e-6) return false;
        _stepV.multiplyScalar(maxDist / d);
        mesh.position.copy(prev).add(_stepV);
        return true;
    };
    const _seatV = new THREE.Vector3();
    const _slingV = new THREE.Vector3();
    const updateGuests = (t, dt) => {
        const lifts = guestRoutes.filter(r => r.kind === 'lift');
        const pistes = guestRoutes.filter(r => r.kind === 'piste');
        updateSkiClasses(t, dt, pistes);
        tickScheduledFalls(dt);
        // ===== LIFT-TAKT: alle `gap` Sekunden fährt ein Fahrzeug ein =====
        for (const L of lifts) {
            L.timer -= dt;
            if (L.timer <= 0) {
                L.timer = L.gap;
                // Bergfahrt
                // ===== EINSTEIGEN MIT ECHTEM SITZPLATZ =====
                // Es fahren GENAU die Gäste hoch, die einsteigen — jeder
                // bekommt einen konkreten Platz an einem konkreten Fahrzeug
                // und wird dort auch gezeichnet.
                const car = pickBoardingCarrier(L);
                let n = Math.min(L.cap, L.queue.length);
                let slot = 0;
                while (n-- > 0) {
                    const gg = L.queue.shift();
                    if (!gg) break;
                    gg.queueOf = null; gg.liftDown = false;
                    gg.state = 'lift'; gg.route = L; gg.prog = 0;
                    gg.carrier = car || null;
                    gg.seatSlot = car ? Math.min(slot++, car.info.seats - 1) : 0;
                    if (car) car.slots.push(gg);
                    // Auf unbeschneiter Trasse hält sich am Schlepplift niemand:
                    // Bügel und Teller brauchen Schnee unter den Ski.
                    gg.dragRisk = (L.kind === 'tbar' || L.kind === 'platter') && !liftTrackHasSnow(L);
                }
                // Talfahrt (nur wo möglich) — die Gegenrichtung fährt ohnehin mit
                let m = Math.min(L.cap, L.queueDown.length);
                while (m-- > 0) {
                    const gg = L.queueDown.shift();
                    if (!gg) break;
                    gg.queueOf = null; gg.liftDown = true;
                    gg.state = 'lift'; gg.route = L; gg.prog = 0;
                }
            }
        }
        const haveRoutes = lifts.length + pistes.length > 0;
        const want = haveRoutes ? Math.max(16, Math.min(170 + Math.round((sim.reput || 0) * 90), Math.round(sim.active / 1.2))) : 0;
        while (guestPool.length < want) {
            const sk = makeSkier(guestPool.length);
            scene.add(sk);
            // Hinweiszeichen über dem Kopf (Sackgasse / Sturz)
            const mark = makeAlertMark();
            mark.position.y = 1.35; sk.add(mark);
            // Trauriges Gesicht für konkrete Ärgernisse (kein Schnee, Hunger…)
            const sad = makeSadMark();
            sad.position.y = 1.35; sk.add(sad);
            // Gast-Steckbrief (2D-Konzept: Name, Kategorie, Zufriedenheit) — fürs Infofeld
            const g = makeGuestProfile(sk);
            Object.assign(g, {
                off: Math.random() * 10, amp: 1.2 + Math.random() * 0.7, route: null, prog: 0, mark, sad,
                // Deutlich gemächlicher als vorher: eine Abfahrt dauert jetzt
                // spürbar Zeit, eine Liftfahrt ebenso.
                vLift: 0.012 + Math.random() * 0.004, vPiste: 0.030 + Math.random() * 0.016,
                spent: Math.round(skiPassPrice() * (0.9 + Math.random() * 0.6))
            });
            guestPool.push(g);
        }
        // Ausgangsposition je Gast merken (für den Schrittbegrenzer unten)
        for (let i = 0; i < guestPool.length; i++) {
            const g = guestPool[i];
            if (!g._prevPos) g._prevPos = new THREE.Vector3();
            g._prevVisible = g.mesh.visible;
            g._prevPos.copy(g.mesh.position);
        }
        for (let i = 0; i < guestPool.length; i++) {
            const g = guestPool[i];
            g.mesh.visible = i < want && !g.carried;
            if (i >= want) continue;
            if (g.mark && g.state !== 'idle' && g.state !== 'down' && g.mark.visible) {
                g.mark.visible = false; g.stranded = 0;
            }
            // Bedürfnisse steigen mit der Zeit (2D-Konzept), Einkehr senkt sie
            // Deutlich gemächlicher als vorher: die Bedürfnisse sollen den
            // Spieler zum Bauen anregen, nicht die Laune dauerhaft ruinieren.
            g.hunger = Math.min(100, g.hunger + dt * 0.55);
            g.thirst = Math.min(100, g.thirst + dt * 0.7);
            g.bladder = Math.min(100, g.bladder + dt * 0.4);
            // Stimmung: eine gepflegte Piste hebt sie stetig an. Der Abzug für
            // unerfüllte Bedürfnisse steckt AUSSCHLIESSLICH in
            // applyNeedPenalty() — vorher zog beides gleichzeitig und die
            // Laune sackte doppelt so schnell ab.
            // Wer skifährt, Lift fährt oder einkehrt, erholt sich SPÜRBAR —
            // sonst kann die Laune die kurzen Abzüge nie wieder aufholen.
            const busy = g.state === 'piste' || g.state === 'lift'
                      || g.state === 'visit' || g.state === 'queue';
            const rec = busy ? (sim.groom > 60 ? 2.6 : 1.6) : 0.5;
            g.mood = Math.max(5, Math.min(100, g.mood + dt * rec));
            // ===== NEUEINPLANUNG =====
            // Wer kein Ziel hat, startet unten an der Talstation und wird von
            // dort aus regulär eingeplant (Kasse -> anstellen -> Lift).
            if (!g.state) {
                if (!lifts.length && !pistes.length) { g.mesh.visible = false; continue; }
                // Gäste starten in einer ORTSCHAFT — reihum, damit in allen
                // Orten Betrieb ist. Erschließt der Spieler einen Ort nicht
                // mit Lift oder Piste, sammeln sich dort sichtbar Gäste.
                let start = g.atPos;
                if (!start && villages.length) {
                    const v = villages[(g.seed | 0) % villages.length];
                    start = { gx: v.gx + (Math.random() - 0.5) * 6,
                              gy: v.gy + 8 + (Math.random() - 0.5) * 4 };
                    g.homeVillage = v.name;
                }
                if (!start) start = lifts.length ? routeBottom(lifts[0]) : routeBottom(pistes[0]);
                g.atPos = null;
                // Echter Neueinsatz an einem Startpunkt — dieser eine Sprung
                // ist erlaubt; ab dann gilt der Schrittbegrenzer.
                g._spawn = true;
                planNext(g, start, false, lifts, pistes);
                if (!g.state) { g.mesh.visible = false; continue; }
            }
            // ===== WARTEN IN DER LIFTSCHLANGE =====
            if (g.state === 'queue') {
                const L = g.queueOf;
                if (!L) { g.state = null; continue; }
                const arr = g.queueDown ? L.queueDown : L.queue;
                const idx = arr.indexOf(g);
                if (idx < 0) { g.queueOf = null; g.state = null; continue; }
                // Aufstellung an der jeweiligen Station: bergauf unten,
                // talwärts oben — jeweils Blick Richtung Einstieg.
                const st = g.queueDown ? L.top : L.bottom;
                const other = g.queueDown ? L.bottom : L.top;
                const bx = st.gx, by = st.gy;
                const ddx = other.gx - bx, ddy = other.gy - by;
                const dl = Math.hypot(ddx, ddy) || 1;
                const ux = ddx / dl, uy = ddy / dl;
                // ===== AUFSTELLUNG =====
                // Vor einer großen Anlage steht kein Gänsemarsch, sondern ein
                // breiter Pulk. Die Reihenbreite wächst mit der Kabinengröße,
                // dadurch sieht ein Ansturm auch wie einer aus.
                const perRowQ = Math.max(2, Math.min(7, Math.ceil((L.cap || 2) / 2.5)));
                const row = Math.floor(idx / perRowQ);
                const col = (idx % perRowQ) - (perRowQ - 1) / 2;
                const qx = bx - ux * (1.2 + row * 0.78) + (-uy) * col * 0.72;
                const qy = by - uy * (1.2 + row * 0.78) + (ux) * col * 0.72;
                const qp = worldPosSmooth(qx, qy); qp.y += 0.06;
                g.mesh.visible = true;
                g.mesh.position.lerp(qp, 0.18);
                faceDir(g.mesh, ux, uy);
                // leichtes Warte-Wippen, vorderste rücken merklich auf
                const ud = g.mesh.userData;
                if (ud.legL) { const sw = Math.sin(t * 2.2 + idx) * 0.1; ud.legL.rotation.x = sw; ud.legR.rotation.x = -sw; }
                g.stuck = 0; g.lastProg = -1;
                continue;
            }
            // ===== SACKGASSE =====
            // Von hier führt kein Lift und keine Piste weiter, und auch zu Fuß
            // ist nichts erreichbar. Der Gast VERSCHWINDET NICHT — er bleibt
            // stehen, die Laune sinkt und über ihm blinkt ein Hinweiszeichen.
            // So sieht der Spieler sofort, wo sein Skigebiet nicht aufgeht.
            if (g.state === 'idle') {
                g.prog += dt;
                g.stranded = (g.stranded || 0) + dt;
                // KARENZZEIT: erst wer länger als 4 Sekunden wirklich nicht
                // weiterkommt, ärgert sich. Vorher zog schon der kurze
                // Moment zwischen zwei Zielen an der Laune.
                if (g.stranded > 4) {
                    // In einer unerschlossenen Ortschaft wartet man geduldiger
                    // als mitten am Berg — dort ist es eine echte Sackgasse.
                    const patient = !!g.inVillage;
                    g.mood = Math.max(patient ? 25 : 3, g.mood - dt * (patient ? 0.35 : 1.4));
                    if (!patient) sim.satisfaction = Math.max(10, sim.satisfaction - dt * 0.06);
                }
                // Gestrandete sammeln sich locker um den Punkt statt zu stapeln
                const ring = 0.9 + (g.seed % 5) * 0.55;
                const ang = (g.seed % 29) / 29 * Math.PI * 2;
                const ip = worldPosSmooth(g.idleAt.gx + Math.cos(ang) * ring,
                                          g.idleAt.gy + Math.sin(ang) * ring);
                ip.y += 0.09;
                g.mesh.visible = true; g.mesh.position.lerp(ip, 0.12);
                // unruhig umsehen
                g.mesh.rotation.set(0, Math.sin(t * 0.6 + g.off) * 0.9, 0);
                if (g.mark) {
                    // Wartende in der Ortschaft bekommen KEIN Alarmzeichen —
                    // sie stehen dort völlig regulär und warten auf Anschluss.
                    g.mark.visible = g.stranded > 2 && !g.inVillage;
                    g.mark.material.opacity = 0.55 + Math.abs(Math.sin(t * 2.2)) * 0.35;
                }
                // Alle zwei Sekunden neu prüfen, ob inzwischen etwas gebaut
                // wurde. Die Einkehr-Sperre wird dabei zurückgesetzt, damit ein
                // frisch gebauter Lift sofort greift und der Stau sich auflöst.
                if (g.prog > 2) {
                    g.prog = 0; g.deadEndVisit = false;
                    planNext(g, g.idleAt, false, lifts, pistes);
                    if (g.state !== 'idle') { g.stranded = 0; if (g.mark) g.mark.visible = false; }
                }
                g.stuck = 0; g.lastProg = -1;
                continue;
            }
            // ===== GESTÜRZT =====
            // Selten, aber sichtbar: der Gast liegt und wartet auf Rettung.
            if (g.state === 'down') {
                g.prog += dt;
                g.hurtT = (g.hurtT || 0) + dt;
                // Je länger jemand unversorgt liegt, desto stärker der
                // Laune-Verlust — und das schlägt aufs Gesamtklima durch.
                const wait = g.hurtT > 25 ? 3.5 : g.hurtT > 12 ? 2.2 : 1.4;
                g.mood = Math.max(2, g.mood - dt * wait);
                if (g.hurtT > 12) sim.satisfaction = Math.max(10, sim.satisfaction - dt * 0.1);
                // Liegt er schon auf dem Schlitten (Skidoo), wird er dort
                // gezeichnet — nicht mehr an der Unfallstelle.
                if (g.carried) { g.mesh.visible = false; continue; }
                const dp = worldPosSmooth(g.downAt.gx, g.downAt.gy); dp.y += 0.12;
                g.mesh.visible = true; g.mesh.position.lerp(dp, 0.25);
                // seitlich liegend
                g.mesh.rotation.set(0, g.off, Math.PI / 2);
                if (g.mark) {
                    g.mark.visible = true;
                    g.mark.material.opacity = 0.6 + Math.abs(Math.sin(t * 4.5)) * 0.4;
                }
                g.stuck = 0; g.lastProg = -1;
                continue;
            }
            // ===== BESUCHS-STATES (2D-Ziellogik): hinlaufen, einkehren/schlafen/Funpark =====
            if (g.state === 'walk' || g.state === 'visit') {
                if (g.state === 'walk') {
                    // Gehtempo ist eine feste STRECKE pro Sekunde — ein langer
                    // Weg dauert damit auch wirklich länger als ein kurzer.
                    g.prog += dt * (1.15 / (g.walkLen || 6));
                    const f = Math.min(1, g.prog);
                    const gx2 = g.walkFrom.gx + (g.walkTo.gx - g.walkFrom.gx) * f;
                    const gy2 = g.walkFrom.gy + (g.walkTo.gy - g.walkFrom.gy) * f;
                    const bob2 = walkPose(g.mesh, t, g.off, 0.8);          // Ski geschultert, echter Schritt
                    const pos2 = worldPosSmooth(gx2, gy2); pos2.y += 0.09 + bob2;
                    g.mesh.visible = true;
                    g.mesh.position.lerp(pos2, 0.3);
                    faceDir(g.mesh, g.walkTo.gx - g.walkFrom.gx, g.walkTo.gy - g.walkFrom.gy);
                    if (f >= 1) {
                        // Kasse erreicht: Skipass lösen, danach regulär weiter
                        g.atPos = { gx: g.walkTo.gx, gy: g.walkTo.gy };
                        if (g.visitType === 'ticket') {
                            g.hasTicket = true;
                            const pay = skiPassPrice();
                            money += pay; sim.revenue += pay; sim.dayRevenue += pay; g.spent += pay;
                            if (onMoney) onMoney(money);
                            ridePose(g.mesh, g.isBoarder);
                            g.state = null; g.prog = 0;
                            continue;
                        }
                        // reiner Fußweg zur Talstation: dort anstellen
                        if (g.visitType === 'liftwalk') {
                            ridePose(g.mesh, g.isBoarder);
                            g.state = null; g.prog = 0;
                            continue;
                        }
                        ridePose(g.mesh, g.isBoarder);
                        g.state = 'visit'; g.prog = 0;
                        const sleeping = SLEEP_TYPES.includes(g.visitType);
                        g.visitT = sleeping ? 9 + Math.random() * 6 : 3 + Math.random() * 4;   // Übernachten dauert länger
                        // Umsatz je Ort (Luxus & Nightlife bringen mehr)
                        const spend = ({ hotel_lux: 40, sterne: 35, therme: 30, chalet_lux: 28, disco: 22,
                            panorama: 20, hotel_mid: 18, sauna: 16, bergrest: 14, apres: 14, eisbahn: 12,
                            hotel_budget: 10, chalet_l: 10, hotel: 12, huette: 8, partyzelt: 7, chalet_s: 6 })[g.visitType] || 5;
                        money += spend; sim.revenue += spend; sim.dayRevenue += spend;
                        g.spent += spend;
                        // Bedürfnisse werden gestillt + Wunsch erfüllt -> bessere Laune
                        if (PARTY_TYPES.includes(g.visitType)) { g.hunger = 5; g.thirst = 10; g.mood = Math.min(100, g.mood + 12); }
                        if (SLEEP_TYPES.includes(g.visitType)) { g.bladder = 0; g.mood = Math.min(100, g.mood + 18); }
                        if (g.visitType === 'toilet') { g.bladder = 0; g.mood = Math.min(100, g.mood + 8); }
                        if (isFunType(g.visitType)) g.mood = Math.min(100, g.mood + 15);
                        g.doneWishes = g.doneWishes || [];
                        if (!g.doneWishes.includes(g.visitType)) g.doneWishes.push(g.visitType);
                    }
                    continue;
                }
                g.prog += dt / g.visitT;
                const isFun = isFunType(g.visitType);
                if (isFun) {
                    // ===== FUNPARK-RUN =====
                    // Gerade DURCH die Anlage, in deren Baurichtung — kein Kreisen
                    // mehr. Unterwegs genau EIN Sprung mit dem Lieblingstrick.
                    // Die Anlage steht in der Falllinie: dirX/dirY zeigen bergab.
                    // Der Gast durchfährt sie EINMAL von oben nach unten.
                    const dirX = g.frontX ?? 0, dirY = g.frontY ?? 1;
                    const runLen = DIRECTED[g.visitType] || ((g.tgtR || 3) * 2.4 + 5);
                    const s = (g.prog - 0.5) * runLen;                    // Einfahrt -> Ausfahrt
                    // Rennstrecke: Slalom um die Tore, kein Sprung
                    const isRace = g.visitType === 'racecourse';
                    const swing = isRace ? Math.sin(g.prog * Math.PI * 5) * 2.4 : 0;
                    const px2 = -dirY, py2 = dirX;                        // quer zur Fahrtrichtung
                    const gx2 = g.walkTo.gx + dirX * s + px2 * swing;
                    const gy2 = g.walkTo.gy + dirY * s + py2 * swing;
                    const pos2 = worldPosSmooth(gx2, gy2);
                    // Sprungfenster in der Mitte der Durchfahrt (entfällt beim Rennen)
                    const jp = (g.prog - 0.34) / 0.34;
                    const air = !isRace && jp > 0 && jp < 1 ? Math.sin(jp * Math.PI) : 0;
                    const high = g.trick === 'Big Air' ? 2.4 : 1.6;
                    pos2.y += 0.06 + air * high;
                    g.mesh.visible = true; g.mesh.position.lerp(pos2, 0.35);
                    // Blick bergab, beim Slalom in die jeweilige Kurve gelegt
                    const lean = isRace ? Math.cos(g.prog * Math.PI * 5) * 0.5 : 0;
                    faceDir(g.mesh, dirX + px2 * lean * 0.5, dirY + py2 * lean * 0.5);
                    if (isRace) g.mesh.rotateZ(-lean * 0.55);             // Kurvenlage
                    if (air > 0.02) {
                        // Der Trick läuft über den Sprung ab und ist am Ende sauber gelandet
                        const ud5 = g.mesh.userData;
                        if (g.trick === 'Backflip')      g.mesh.rotateX(-jp * Math.PI * 2);
                        else if (g.trick === '360°')     g.mesh.rotateY(jp * Math.PI * 2);
                        else if (g.trick === 'Drift')    g.mesh.rotateY(Math.sin(jp * Math.PI) * 1.5);
                        else if (g.trick === 'Big Air')  g.mesh.rotateX(-Math.sin(jp * Math.PI) * 0.5);
                        else                             g.mesh.rotateZ(Math.sin(jp * Math.PI) * 0.85);  // Grab
                        // Beine anziehen — sieht in der Luft deutlich besser aus
                        if (ud5.legL) { ud5.legL.rotation.x = -air * 1.1; ud5.legR.rotation.x = -air * 1.1; }
                        if (ud5.armL) { ud5.armL.rotation.z = air * 1.3; ud5.armR.rotation.z = -air * 1.3; }
                    } else {
                        const ud5 = g.mesh.userData;
                        if (ud5.legL) { ud5.legL.rotation.x = 0; ud5.legR.rotation.x = 0; }
                        if (ud5.armL) { ud5.armL.rotation.z = 0; ud5.armR.rotation.z = 0; }
                    }
                } else if (g.visitType === 'eisbahn') {
                    // ===== EISLAUFEN: Gäste gleiten wirklich auf der Eisfläche =====
                    if (g.mesh.userData.gear) g.mesh.userData.gear.visible = false;
                    if (g.mesh.userData.board) g.mesh.userData.board.visible = false;
                    const fx = g.frontX ?? 0, fy = g.frontY ?? 1;
                    const lane = 0.6 + (g.seed % 4) * 0.85;                  // Bahn-Radius
                    const dir = (g.seed % 2) ? 1 : -1;                       // Laufrichtung
                    const sp = 0.55 + (g.seed % 5) * 0.09;
                    const a = t * sp * dir + (g.seed % 17) * 0.37;
                    // Ellipse passend zur rechteckigen Bahn, leicht nach vorn versetzt
                    const ex = Math.cos(a) * lane * 1.5, ey = Math.sin(a) * lane;
                    const px2 = g.walkTo.gx + ex - fx * 0.2;
                    const py2 = g.walkTo.gy + ey - fy * 0.2;
                    const pos2 = worldPosSmooth(px2, py2);
                    g.mesh.visible = true;
                    g.mesh.position.lerp(new THREE.Vector3(pos2.x, pos2.y + 0.12, pos2.z), 0.25);
                    // in Fahrtrichtung schauen + Kurvenlage
                    const ah = worldPosSmooth(
                        g.walkTo.gx + Math.cos(a + 0.25 * dir) * lane * 1.5 - fx * 0.2,
                        g.walkTo.gy + Math.sin(a + 0.25 * dir) * lane - fy * 0.2);
                    g.mesh.lookAt(ah.x, g.mesh.position.y, ah.z);
                    g.mesh.rotation.z = -dir * 0.16;
                    const ud2 = g.mesh.userData;
                    if (ud2.armL) {          // Arme schwingen beim Laufen
                        ud2.armL.rotation.x = Math.sin(t * 3.4 + g.seed) * 0.5;
                        ud2.armR.rotation.x = -Math.sin(t * 3.4 + g.seed) * 0.5;
                    }
                } else if (PARTY_TYPES.includes(g.visitType)) {
                    // ===== APRÈS-SKI: Ski ausziehen, direkt VOR der Hütte feiern =====
                    if (g.mesh.userData.gear) g.mesh.userData.gear.visible = false;   // Ski/Board abgelegt
                    if (g.mesh.userData.board) g.mesh.userData.board.visible = false;
                    // Sitz-/Stehplätze liegen auf der Terrasse VOR dem Eingang,
                    // nicht rundherum ums Haus. Vorderseite kommt aus dem Gebäude.
                    const fx = g.frontX ?? 0, fy = g.frontY ?? 1;
                    const sx3 = -fy, sy3 = fx;                               // seitliche Achse
                    const R = g.tgtR || 2.5;
                    const idx = g.seed % 24;
                    const row = Math.floor(idx / 6);                         // 4 Reihen à 6 Plätze
                    const col = idx % 6;
                    const jitterA = ((g.seed * 53) % 100) / 100 * 0.3 - 0.15;
                    const jitterB = ((g.seed * 37) % 100) / 100 * 0.3 - 0.15;
                    // vor dem Haus, aber mit klarem Abstand — sonst stecken
                    // die Gäste in der Fassade und sind nicht mehr zu sehen
                    // Direkt AN der Terrasse: knapp vor der Fassade, dichte
                    // Reihen — nicht mehr 20 Meter davor auf freiem Feld.
                    const fwd = R * 0.72 + 0.5 + row * 0.72 + jitterA * 0.5;
                    const side = (col - 2.5) * 0.72 + jitterB * 0.5;
                    const px2 = g.walkTo.gx + fx * fwd + sx3 * side;
                    const py2 = g.walkTo.gy + fy * fwd + sy3 * side;
                    const cx2 = g.walkTo.gx, cy2 = g.walkTo.gy;              // alle schauen zur Hütte
                    const pos2 = worldPosSmooth(px2, py2);
                    // Gemeinsamer Takt für alle (Musik!), nur leicht versetzt -> Wellenbewegung
                    const beat = t * 5.5 + (g.seed % 7) * 0.28;
                    const hop = Math.abs(Math.sin(beat)) * 0.17;      // hüpfen zur Musik
                    g.mesh.visible = true;
                    g.mesh.position.lerp(new THREE.Vector3(pos2.x, pos2.y + GROUND_CLEAR + hop, pos2.z), 0.25);
                    // zur Gruppenmitte schauen (man steht im Kreis beisammen)
                    const mid = worldPosSmooth(cx2, cy2);
                    g.mesh.lookAt(mid.x, g.mesh.position.y, mid.z);
                    g.mesh.rotation.z = Math.sin(beat * 0.5) * 0.14;  // schunkeln
                    // Arme hoch und mitwippen
                    const ud = g.mesh.userData;
                    if (ud.armL) {
                        const raise = -2.1 - Math.sin(beat) * 0.5;
                        ud.armL.rotation.z = -raise * 0.45; ud.armL.rotation.x = raise;
                        ud.armR.rotation.z = raise * 0.45;  ud.armR.rotation.x = raise + Math.sin(beat + 1) * 0.3;
                    }
                } else {
                    // Hotel/Chalet: erst an die Tür treten, dann hineingehen (verschwinden)
                    const atDoor = g.prog < 0.12;
                    if (atDoor) {
                        const f2 = g.prog / 0.12;
                        const px2 = g.walkTo.gx + (1 - f2) * 1.6, py2 = g.walkTo.gy + (1 - f2) * 1.6;
                        const pos2 = worldPosSmooth(px2, py2); pos2.y += GROUND_CLEAR;
                        g.mesh.visible = true; g.mesh.position.lerp(pos2, 0.3);
                        const face = worldPosSmooth(g.walkTo.gx, g.walkTo.gy);
                        g.mesh.lookAt(face.x, g.mesh.position.y, face.z);
                    } else g.mesh.visible = false;                          // drinnen: schläft/ruht
                }
                if (g.prog >= 1) {
                    // Besuch vorbei: Ausrüstung wieder anlegen, Arme normalisieren
                    const ud = g.mesh.userData;
                    if (ud.setSnowboard) ud.setSnowboard(!!g.isBoarder);
                    else if (ud.gear) ud.gear.visible = true;
                    if (ud.armL) { ud.armL.rotation.set(0, 0, 0); ud.armR.rotation.set(0, 0, 0); }
                    g.mesh.rotation.z = 0;
                    // Wichtig: der Gast plant von HIER aus weiter, nicht vom Tal
                    g.atPos = { gx: g.walkTo.gx, gy: g.walkTo.gy };
                    g.state = null; g.route = null; g.mesh.visible = true;
                }
                continue;
            }
            const r = g.route;
            // WÄCHTER: kommt ein Gast über längere Zeit nicht vom Fleck (kaputte
            // Route, Nullsegment, Rundungsfalle), wird er neu eingeplant statt
            // für immer an derselben Stelle zu stehen.
            if (Math.abs(g.prog - (g.lastProg ?? -1)) < 1e-4) {
                g.stuck = (g.stuck || 0) + dt;
                if (g.stuck > 6) { g.stuck = 0; leaveQueue(g); g.state = null; g.route = null; g.prog = 0; g.mesh.visible = true; continue; }
            } else g.stuck = 0;
            g.lastProg = g.prog;
            // Fortschritt entlang der aktuellen Route (Piste: Tempo ans Gefälle adaptiert)
            // Liftfahrt: schnellere Anlagen (Gondel, Pendelbahn) brauchen weniger
            // lange als ein Tellerlift — die Fahrtdauer richtet sich nach der Bauart.
            // Grundbedürfnisse drücken auf die Laune, das Gesicht zeigt es an.
            applyNeedPenalty(g, dt);
            if (g.sad) {
                const gripe = guestGripe(g);
                // im Lift bleiben beide Zeichen aus
                g.sad.visible = g.state !== 'lift' && !!gripe && !(g.mark && g.mark.visible);
                if (g.sad.visible) g.sad.material.opacity = 0.6 + Math.abs(Math.sin(t * 1.8)) * 0.3;
                g.gripe = gripe;
            }
            g.uphill = false;                        // wird unten ggf. neu gesetzt
            let spd = g.state === 'lift' ? g.vLift * (r.rideSpeed || 1) : g.vPiste;
            if (g._run && g._run.rn.type === 'racecourse') spd *= 1.45;    // Rennstrecke: Vollgas
            if (g.state === 'piste' && r.path && r.path.length >= 2) {
                const fi0 = Math.min(r.path.length - 2, Math.floor(g.prog * (r.path.length - 1)));
                const pa = r.path[Math.max(0, fi0)], pb = r.path[fi0 + 1];
                const ya = worldPosSmooth(pa.gx, pa.gy).y, yb = worldPosSmooth(pb.gx, pb.gy).y;
                const run = Math.hypot(pb.gx - pa.gx, pb.gy - pa.gy) * tile || 1;
                const grade = Math.max(0, (ya - yb) / run);
                // Bergauf-Abschnitt? Dann wird gleich unten der Schlittschuh-
                // schritt mit Stockschub animiert statt des Carving-Schwungs.
                // In einer Anlage (Schanzentisch, Pipe-Wall) zählt der kurze
                // Anstieg nicht als „bergauf“ — der Schwung trägt darüber.
                let inRun = null;
                if (r.runs && r.runs.length) {
                    if (!r.cum) { r.cum = [0]; for (let k = 1; k < r.path.length; k++) r.cum[k] = r.cum[k - 1] + Math.hypot(r.path[k].gx - r.path[k - 1].gx, r.path[k].gy - r.path[k - 1].gy); }
                    const sH = arcAt(r, g.prog);
                    for (const rn of r.runs) if (sH >= rn.s0 - 1 && sH <= rn.s1 + 1) { inRun = rn; break; }
                }
                g.uphill = !inRun && yb > ya + 0.015;
                spd *= inRun ? 1.05 : Math.max(0.3, Math.min(1.7, 0.3 + grade * 9));    // flach = langsam, in der Anlage zügig
            }
            // ===== MITFAHREN AM ZUGEWIESENEN FAHRZEUG =====
            // Sitzt der Gast an einem Bügel/Sessel/in einer Kabine, folgt er
            // exakt dessen Position — nicht mehr einer eigenen Interpolation.
            if (g.state === 'lift' && g.carrier && r.model?.seatPos) {
                const car = g.carrier;
                g.prog = Math.max(0, Math.min(1, car.along));
                if (g.prog < 0.985) {
                    r.model.seatPos(car, g.seatSlot || 0, _seatV);
                    g.mesh.position.copy(_seatV);
                    g.mesh.rotation.copy(car.mesh.rotation);
                    g.mesh.visible = true;
                    // In Kabinen sind die Figuren auf Innenhöhe geschrumpft,
                    // damit sie WIRKLICH drinstehen und durch die Scheiben zu
                    // sehen sind. Sessel/Bügel bleiben unskaliert.
                    const sc5 = car.info.scale || 1;
                    g.mesh.scale.set(sc5, sc5, sc5);
                    // In der Kabine kein Hinweiszeichen — es würde durch die
                    // Verglasung hindurch schweben.
                    if (g.mark) g.mark.visible = false;
                    if (g.sad) g.sad.visible = false;
                    ridePose(g.mesh, g.isBoarder);
                    // Schlepplift ohne Schnee: der Gast verliert den Halt und
                    // stürzt unterwegs aus der Spur.
                    if (g.dragRisk && g.prog > 0.18) {
                        g.dragRisk = false;
                        const idx2 = car.slots.indexOf(g);
                        if (idx2 >= 0) car.slots.splice(idx2, 1);
                        g.carrier = null;
                        g.mesh.scale.set(1, 1, 1);
                        const gp = worldPosSmooth(
                            routeBottom(r).gx + (routeTop(r).gx - routeBottom(r).gx) * g.prog,
                            routeBottom(r).gy + (routeTop(r).gy - routeBottom(r).gy) * g.prog);
                        g.mesh.position.set(gp.x, gp.y + 0.06, gp.z);
                        startFall(g, {
                            gx: routeBottom(r).gx + (routeTop(r).gx - routeBottom(r).gx) * g.prog,
                            gy: routeBottom(r).gy + (routeTop(r).gy - routeBottom(r).gy) * g.prog
                        });
                        continue;
                    }
                    continue;
                }
                // Bergstation erreicht: aussteigen
                const idx3 = car.slots.indexOf(g);
                if (idx3 >= 0) car.slots.splice(idx3, 1);
                g.carrier = null;
                g.mesh.scale.set(1, 1, 1);      // wieder normale Größe
                g.prog = 1;
            }
            // Kursteilnehmer bekommen ihre Position vom Lehrer vorgegeben —
            // sie dürfen sich NICHT zusätzlich selbst vorwärts bewegen,
            // sonst schert die Reihe auseinander.
            if (!g.classFollow) g.prog += dt * spd;
            if (g.prog >= 1 && !g.classFollow) {
                g.prog = 0;
                if (g.state === 'lift') {
                    // Ausgestiegen — je nach Fahrtrichtung oben oder unten
                    g.mesh.visible = true;
                    const wasDown = g.liftDown;
                    g.liftDown = false;
                    planNext(g, wasDown ? routeBottom(r) : routeTop(r), !wasDown, lifts, pistes);
                } else {
                    // Abfahrt beendet — unten neu einplanen
                    planNext(g, routeBottom(r), false, lifts, pistes);
                }
                continue;
            }
            const cur = g.route, p = g.prog;
            let gx, gy, dx, dy;
            if (g.state === 'piste' && cur.path && cur.path.length >= 2) {
                const fi = p * (cur.path.length - 1), i0 = Math.min(cur.path.length - 2, Math.floor(fi)), fr = fi - i0;
                const a = cur.path[i0], b = cur.path[i0 + 1];
                gx = a.gx + (b.gx - a.gx) * fr; gy = a.gy + (b.gy - a.gy) * fr;
                dx = b.gx - a.gx; dy = b.gy - a.gy;
            } else {
                // Lift: Tal->Gipfel ; synthetische Piste: Gipfel->Tal
                const top = routeTop(cur), bot = routeBottom(cur);
                // Lift: normal Tal->Gipfel, bei Talfahrt umgekehrt.
                // Synthetische Piste: immer Gipfel->Tal.
                const upRide = g.state === 'lift' && !g.liftDown;
                const from = g.state === 'lift' ? (upRide ? bot : top) : top;
                const to   = g.state === 'lift' ? (upRide ? top : bot) : bot;
                gx = from.gx + (to.gx - from.gx) * p;
                gy = from.gy + (to.gy - from.gy) * p;
                dx = to.gx - from.gx; dy = to.gy - from.gy;
            }
            const len = Math.hypot(dx, dy) || 1;
            const px = -dy / len, py = dx / len;
            // ===== ABZWEIGUNG AUF EINE ANDERE PISTE =====
            // Beginnt oder kreuzt unterwegs eine andere Abfahrt in der Nähe,
            // kann der Gast dorthin wechseln. So entsteht aus mehreren Pisten
            // ein echtes Netz statt lauter getrennter Einbahnstraßen.
            // ===== EINKEHREN AN DER PISTE =====
            // Steht direkt neben der Abfahrt eine Hütte oder Bar, kann der
            // Gast dort einkehren — muss aber nicht. Hunger und Durst erhöhen
            // die Wahrscheinlichkeit deutlich.
            if (g.state === 'piste' && g.prog > 0.08 && g.prog < 0.9 && !g.justAte) {
                g.stopAcc = (g.stopAcc || 0) + dt;
                if (g.stopAcc > 1.5) {
                    g.stopAcc = 0;
                    const wpNow = worldPosSmooth(gx, gy);
                    let near = null, nd2 = 7.5;
                    for (const b of placedBuildings) {
                        if (!PARTY_TYPES.includes(b.type)) continue;
                        const d2 = Math.hypot(b.mesh.position.x - wpNow.x, b.mesh.position.z - wpNow.z);
                        if (d2 < nd2) { nd2 = d2; near = b; }
                    }
                    if (near) {
                        const appetite = (g.hunger > 55 ? 0.5 : 0) + (g.thirst > 55 ? 0.45 : 0) + 0.1;
                        if (Math.random() < appetite) {
                            g.state = 'visit'; g.visitType = near.type; g.prog = 0;
                            g.visitT = 3 + Math.random() * 4;
                            g.justAte = true;                 // nicht sofort wieder
                            g.resumeRoute = r; g.resumeProg = g.prog;
                            const bp = near.mesh.position;
                            const gp2 = worldToGrid(bp.x, bp.z);
                            const wpv = worldPosSmooth(gp2.gx, gp2.gy + 2.2);
                            g.mesh.position.set(wpv.x, wpv.y + 0.06, wpv.z);
                            ridePose(g.mesh, g.isBoarder);
                            const spend2 = ({ sterne: 35, panorama: 20, bergrest: 14, apres: 14,
                                restaurant: 12, eisbahn: 12, huette: 8, partyzelt: 7, imbiss: 6 })[near.type] || 6;
                            money += spend2; sim.revenue += spend2; sim.dayRevenue += spend2;
                            g.spent += spend2;
                            g.hunger = 5; g.thirst = 10; g.mood = Math.min(100, g.mood + 12);
                            continue;
                        }
                    }
                }
            }
            if (g.state === 'piste' && g.prog > 0.12 && g.prog < 0.85) {
                g.branchAcc = (g.branchAcc || 0) + dt;
                if (g.branchAcc > 1.2) {
                    g.branchAcc = 0;
                    const here = { gx, gy };
                    const opts2 = [];
                    for (const alt of pistes) {
                        if (alt === r || !alt.path || alt.path.length < 2) continue;
                        // nächstliegenden Punkt der anderen Piste suchen
                        let bi = -1, bd = Infinity;
                        for (let k = 0; k < alt.path.length - 1; k++) {
                            const dd = dist2D(alt.path[k], here);
                            if (dd < bd) { bd = dd; bi = k; }
                        }
                        // nur abbiegen, wenn es dort auch noch bergab weitergeht
                        if (bd <= BRANCH_RADIUS && bi >= 0 && bi < alt.path.length - 2) {
                            opts2.push({ alt, at: bi / (alt.path.length - 1), d: bd });
                        }
                    }
                    if (opts2.length && Math.random() < 0.45) {
                        const pick2 = opts2[(Math.random() * opts2.length) | 0];
                        g.route = pick2.alt;
                        g.prog = pick2.at;
                        continue;
                    }
                }
            }
            // ===== STURZRISIKO =====
            // Erst HIER prüfen: gx/gy (die Unfallstelle) stehen zu diesem
            // Zeitpunkt fest. Vorher waren sie noch gar nicht berechnet — der
            // Zugriff hat das Spiel bei jedem Sturz zum Absturz gebracht.
            // Schlechter Pistenzustand und schwere Abfahrten erhöhen das Risiko.
            if (g.state === 'piste' && !g.hurt) {
                const groomBad = Math.max(0, (70 - sim.groom) / 70);      // 0 = top präpariert
                const hard = r.diff === 'black' ? 2.2 : r.diff === 'red' ? 1.4 : 1;
                // Auch auf perfekt präparierter Piste stürzt gelegentlich
                // jemand — der Sockel darf nicht zu klein sein.
                // Aktuelle Position merken — der Taktgeber oben braucht eine
                // gültige Unfallstelle, auch wenn er in einem anderen Bild feuert.
                g.lastGrid = { gx, gy };
                if (Math.random() < FALL_RATE * hard * (0.55 + groomBad * 1.3) * dt) {
                    startFall(g, { gx, gy });
                    continue;
                }
            }
            // ===== APERE STELLEN: ohne Schnee wird gelaufen statt gefahren =====
            const snowHere = g.state !== 'piste' || hasSnowAt(gx, gy);
            if (!snowHere) {
                g.walking = true;
                g.mood = Math.max(5, g.mood - dt * 1.8);    // Ärger über den fehlenden Schnee
                sim.satisfaction = Math.max(15, sim.satisfaction - dt * 0.08);
                // Gehtempo ist eine feste STRECKE pro Sekunde. Der Fortschritt
                // ist aber auf die GESAMTE Pistenlänge normiert — ohne diese
                // Umrechnung liefen die Gäste auf langen Pisten praktisch auf
                // der Stelle: die Beine schwangen, die Position stand.
                if (!r.lenTiles && r.path) {
                    let L2 = 0;
                    for (let k2 = 1; k2 < r.path.length; k2++) {
                        L2 += Math.hypot(r.path[k2].gx - r.path[k2 - 1].gx, r.path[k2].gy - r.path[k2 - 1].gy);
                    }
                    r.lenTiles = Math.max(4, L2);
                }
                const walkSpd = 1.1 / (r.lenTiles || 30);   // ~1,1 Kacheln pro Sekunde
                g.prog += dt * (walkSpd - spd);             // Fahranteil auf Gehtempo korrigieren
                const bob = walkPose(g.mesh, t, g.off);     // Ski geschultert, Beine schwingen
                const wpos = worldPosSmooth(gx, gy);
                g.mesh.position.lerp(new THREE.Vector3(wpos.x, wpos.y + 0.09 + bob, wpos.z), 0.3);
                faceDir(g.mesh, dx, dy);                    // stabile Blickrichtung, kein Umkippen
                continue;
            } else if (g.walking) {
                g.walking = false;
                ridePose(g.mesh, g.isBoarder);              // wieder Schnee: anschnallen
            }
            // Im Lift: Gast sitzt IN der Gondel/im Sessel (besetzte Sitze zeigen ihn),
            // keine Figur mehr, die unter dem Seil herschwebt
            if (g.state === 'lift') {
                g.mesh.visible = false;
                const pos0 = worldPosSmooth(gx, gy); g.mesh.position.copy(pos0); // Position tracken für nahtloses Aussteigen
                continue;
            }
            // ===== SCHWUNGRHYTHMUS =====
            // Die seitliche Spur folgt einer Sinuswelle. Dazu kommt die
            // Hoch-Tief-Bewegung: am Kurvenwechsel (sway ≈ 0) streckt sich der
            // Körper (Hochentlastung), am Scheitel (|sway| ≈ 1) taucht er in
            // die Beugung ab. Erst dieses Atmen macht den Schwung glaubwürdig.
            const swPh = t * 3 + g.off * 10;
            let sway = g.state === 'piste' ? Math.sin(swPh) * g.amp : 0;
            if (g.uphill) sway *= 0.15;                 // bergauf wird nicht gewedelt
            // Im Skikurs wird nicht frei gewedelt: die Schüler fahren dem
            // Lehrer in einer leicht versetzten Reihe nach.
            if (g.classFollow) sway = Math.sin(swPh) * 0.35 + (g.classLane || 0);
            // ===== DURCH DIE ANLAGE =====
            // Liegt auf dieser Piste eine Halfpipe, ein Funpark, Kicker oder
            // eine Rennstrecke im aktuellen Abschnitt, wird sie GENUTZT: die
            // Spur wechselt in die Anlage (Pipe-Walls, Sprung, Torlauf).
            let runLift = 0; g._run = null;
            if (g.state === 'piste' && !g.uphill && r.runs && r.runs.length && r.path) {
                if (!r.cum) { r.cum = [0]; for (let k = 1; k < r.path.length; k++) r.cum[k] = r.cum[k - 1] + Math.hypot(r.path[k].gx - r.path[k - 1].gx, r.path[k].gy - r.path[k - 1].gy); }
                const sHere = arcAt(r, g.prog);
                for (const rn of r.runs) {
                    if (sHere < rn.s0 || sHere > rn.s1) continue;
                    const u = (sHere - rn.s0) / Math.max(1, rn.s1 - rn.s0);     // 0..1 durch die Anlage
                    g._run = { rn, u, air: 0, turn: 0 };
                    if (rn.type === 'halfpipe') {
                        // von Wall zu Wall (die Mulde ist im Gelände, der Boden
                        // trägt), oben an der Kante ein Trick in der Luft
                        const ph = u * Math.PI * 2 * 3 + g.off;
                        sway = Math.sin(ph) * 3.1;
                        const air = Math.max(0, (Math.abs(Math.sin(ph)) - 0.66) / 0.34);
                        // Nicht jeder Hit ist gleich: an manchen Walls (je Gast und
                        // Wall zufällig, ~40 %) geht es RICHTIG hoch — 7 m über die
                        // Kante mit Double/Cork — sonst ein normaler Air (~3 m).
                        const wallIdx = Math.floor((ph + Math.PI * 0.5) / Math.PI);
                        const hs = Math.sin(wallIdx * 12.9898 + g.off * 78.233) * 43758.5453;
                        const huge = (hs - Math.floor(hs)) < 0.4;
                        runLift = Math.sin(air * Math.PI * 0.5) * (huge ? 7.0 : 3.0);   // Luft über der Kante
                        g._run.air = air; g._run.jp = ((ph / Math.PI) % 1 + 1) % 1; g._run.big = true; g._run.huge = huge;
                        // Höhe aus der SCHALE (Ebene + Bogen), nicht aus dem Gelände
                        // darunter — die Mulde ist absichtlich tiefer/breiter als die
                        // Schale, sonst führen die Walls unter die Fahrfläche.
                        const st = rn.strip;
                        if (st && Math.abs(u - 0.5) <= 0.45) {
                            const al = (sHere - rn.sMid) * tile;
                            const planeY = st.midY - Math.tan(st.pitch) * al + Math.tan(st.roll || 0) * sway * tile;
                            const x = Math.abs(sway);
                            const shellY = x <= 1.4 ? 0 : x >= 4.7 ? 3.3 : 3.3 - Math.sqrt(Math.max(0, 3.3 * 3.3 - (x - 1.4) * (x - 1.4)));
                            const yShell = planeY - 3.29 + shellY + 0.05;
                            // an den Schalenenden (u 0.375..0.45) weich auf die Geländehöhe übergehen
                            const k = Math.min(1, Math.max(0, (Math.abs(u - 0.5) - 0.375) / 0.075));
                            g._run.yOverride = k <= 0 ? yShell : yShell + (yAtSmooth(gx + px * sway, gy + py * sway) + 0.05 - yShell) * k;
                        }
                    } else if (rn.type === 'racecourse') {
                        // Riesentorlauf: Schlangenlinie um die Tore (Tore alle
                        // ~3.3 Kacheln im Wechsel), tief in der Hocke, schnell
                        // Tore stehen (siehe makeRunDressing) bei z = −hl+2.5 + (i+0.5)/gates·(len−5.5),
                        // Seite (−1)^i, Versatz 1.7 — die Linie führt exakt durch jedes Tor.
                        const len = rn.s1 - rn.s0, gates = Math.max(4, Math.round(len / 4.2));
                        const uu = Math.max(0, Math.min(1, (u * len - 2.5) / (len - 5.5)));
                        const ph = Math.PI * uu * gates - Math.PI / 2;
                        sway = -3.1 * Math.cos(ph);                          // außen um die ÄUSSERE Torstange (bei 2.15) herum
                        g._run.turn = -Math.sin(ph);
                    } else {
                        // Funpark/Kicker: die Schanzen sind im Gelände — hier nur
                        // gerade anfahren; Absprung dort, wo der Tisch abbricht
                        sway *= 0.2;
                        // Absprungkanten (u 0..1) je Anlage — passend zu SCULPT; die
                        // Flugphase dauert ~4.5 Kacheln, unabhängig von der Anlagenlänge
                        const tables = rn.type === 'kicker' ? [0.5] : rn.type === 'funpark_s' ? [0.45] : rn.type === 'funpark' ? [0.28, 0.6] : [0.22, 0.48, 0.75];
                        const flight = 4.5 / Math.max(6, rn.s1 - rn.s0);
                        for (const tc of tables) {
                            const j = (u - tc) / flight;             // 0 Absprung .. 1 Landung
                            if (j > 0 && j < 1) { g._run.air = Math.sin(j * Math.PI); g._run.jp = j; g._run.big = rn.type === 'funpark_l' || rn.type === 'funpark'; runLift = g._run.air * (rn.type === 'kicker' ? 3.4 : rn.type === 'funpark_l' ? 3.8 : 3.0); }
                        }
                    }
                    if (!g._usedRun || g._usedRun !== rn) {          // einmal je Anlage: Laune-Bonus
                        g._usedRun = rn; g.mood = Math.min(100, g.mood + 6);
                    }
                    break;
                }
            }
            const pos = worldPosSmooth(gx + px * sway, gy + py * sway); pos.y += 0.05 + runLift;
            if (g._run && g._run.yOverride != null) pos.y = g._run.yOverride + runLift;   // auf der Halfpipe-Schale
            if (g.state === 'piste' && !g.isBoarder && !g.uphill) {
                pos.y += (1 - Math.abs(Math.cos(swPh))) * 0.07;   // hoch am Wechsel, tief am Scheitel
            }
            g.mesh.position.lerp(pos, g._run ? 0.8 : 0.35);          // in Anlagen straff folgen (Walls, Torbögen)
            const ah = worldPosSmooth(gx + dx * 0.03 + px * sway, gy + dy * 0.03 + py * sway);
            const m = new THREE.Matrix4().lookAt(g.mesh.position, ah, new THREE.Vector3(0, 1, 0));
            const q = new THREE.Quaternion().setFromRotationMatrix(m);
            if (g.state === 'piste') {
                // Snowboarder: Board zeigt in Fahrtrichtung, der Körper steht quer
                // dazu. Beim Umkanten wechselt der Winkel die Seite (Front-/Backside)
                // und der Fahrer neigt sich IN die Kurve — nicht dagegen.
                if (g.isBoarder) {
                    const carve = Math.cos(t * 3 + g.off * 10);      // -1..1 = Kantenwechsel
                    const ud3 = g.mesh.userData;
                    // Board bleibt längs zur Fahrtrichtung
                    if (ud3.board) ud3.board.rotation.y = -Math.PI / 2.6 * Math.sign(carve || 1);
                    // Oberkörper quer, Richtung wechselt mit der Kante
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 1, 0), Math.PI / 2.6 * Math.sign(carve || 1)));
                    // Schräglage in die Kurve (Rollen um die Fahrtachse)
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 0, 1), -carve * 0.34));
                    // Snowboarder fahren AUFRECHT: die lookAt-Ausrichtung neigt
                    // die Figur bereits mit dem Hang nach vorn — hier wird ein
                    // Stück davon zurückgenommen statt noch draufzulegen.
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(1, 0, 0), -0.14));
                    // Arme balancieren gegen die Kurve
                    if (ud3.armL) {
                        ud3.armL.rotation.z = 0.5 + carve * 0.5;
                        ud3.armR.rotation.z = -0.5 + carve * 0.5;
                        ud3.armL.rotation.x = -0.25; ud3.armR.rotation.x = -0.25;
                    }
                } else if (g.uphill) {
                    // ===== SCHLITTSCHUHSCHRITT BERGAUF =====
                    // Auf ansteigenden Stücken wird nicht geschwungen: die Ski
                    // grätschen im V abwechselnd nach außen, der Körper beugt
                    // sich vor und beide Stöcke schieben rhythmisch an.
                    const skPh = t * 4.2 + g.off * 6;
                    const step2 = Math.sin(skPh);
                    const ud3 = g.mesh.userData;
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(1, 0, 0), 0.2));            // deutliche Vorlage
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 1, 0), step2 * 0.12));   // leichtes Pendeln
                    if (ud3.legL) {
                        // V-Stellung: Beine abwechselnd nach außen gedreht + Abstoß
                        ud3.legL.rotation.set(Math.max(0, step2) * -0.45, 0.3, -0.14);
                        ud3.legR.rotation.set(Math.max(0, -step2) * -0.45, -0.3, 0.14);
                    }
                    if (ud3.torso) ud3.torso.rotation.set(0.24, 0, 0);
                    if (ud3.armL) {
                        // Doppelstockschub: beide Arme schwingen gemeinsam
                        const push = Math.max(0, Math.sin(skPh));     // 0 = vorn, 1 = Schub hinten
                        ud3.armL.rotation.set(-0.9 + push * 1.1, 0, 0.18);
                        ud3.armR.rotation.set(-0.9 + push * 1.1, 0, -0.18);
                    }
                } else {
                    // ===== SKIFAHREN =====
                    // Echte Technik statt bloßem Hin- und Herkippen: die Ski
                    // werden aufgekantet und drehen in die Kurve, die Beine
                    // beugen sich am Kurvenscheitel (Druckaufbau), der
                    // Oberkörper bleibt ruhig und talwärts gerichtet, und die
                    // Stöcke setzen im Rhythmus der Schwünge auf.
                    const phase = t * 3 + g.off * 10;
                    const carve = Math.cos(phase);              // -1..1 Kurvenrichtung
                    const load = Math.abs(carve);               // 1 = Kurvenscheitel
                    const ud3 = g.mesh.userData;
                    // Ganzkörper-Schräglage in den Hang, mit der Kurve wechselnd
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 0, 1), -carve * 0.42));
                    // Ski schwenken in die Kurve (Skiführung), Körper folgt nur zum Teil
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 1, 0), carve * 0.3));
                    // Vorlage: am Scheitel stärker über den Schuh
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(1, 0, 0), 0.1 + load * 0.1));
                    // Beine: Beugen unter Druck, kurveninneres Bein etwas höher
                    if (ud3.legL) {
                        // negativ = Knie nach VORN über den Schuh (Skihocke)
                        const bend = -(0.22 + load * 0.26);
                        ud3.legL.rotation.x = bend + carve * 0.1;
                        ud3.legR.rotation.x = bend - carve * 0.1;
                        ud3.legL.rotation.z = -carve * 0.16;
                        ud3.legR.rotation.z = -carve * 0.16;
                    }
                    // Oberkörper bleibt ruhig: er dreht GEGEN die Skiführung
                    // (Gegenrotation) und richtet sich leicht auf
                    if (ud3.torso) {
                        ud3.torso.rotation.y = -carve * 0.34;
                        ud3.torso.rotation.x = 0.18 + load * 0.12;
                        ud3.torso.rotation.z = carve * 0.1;
                    }
                    // Arme vor dem Körper, Stockeinsatz am Kurvenwechsel
                    if (ud3.armL) {
                        const plant = Math.max(0, -Math.sin(phase * 2));   // kurzer Impuls
                        ud3.armL.rotation.x = -0.55 - (carve > 0 ? plant * 0.5 : 0);
                        ud3.armR.rotation.x = -0.55 - (carve < 0 ? plant * 0.5 : 0);
                        ud3.armL.rotation.z = 0.42 - carve * 0.14;
                        ud3.armR.rotation.z = -0.42 - carve * 0.14;
                    }
                }
            }
            // ===== TRICKS & RENNHALTUNG in der Anlage =====
            if (g._run) {
                const R = g._run, ud6 = g.mesh.userData;
                if (R.air > 0.02) {
                    const jp = R.jp ?? 0.5, a = R.air;
                    const rotAx = (ax, ang) => q.multiply(new THREE.Quaternion().setFromAxisAngle(ax, ang));
                    // Drehungen laufen über den ganzen Flug (jp 0..1) und sind bei
                    // der Landung wieder sauber ausgedreht. Auf großen Anlagen
                    // (Halfpipe, großer Funpark) werden daraus Doubles und Corks.
                    const turns = R.huge ? 3 : R.big ? 2 : 1;
                    if (R.huge) rotAx(new THREE.Vector3(0, 0, 1), Math.sin(jp * Math.PI) * 0.7);   // zusätzlich seitlich ausgelegt (Grab)
                    if (g.trick === 'Backflip')      rotAx(new THREE.Vector3(1, 0, 0), -jp * Math.PI * 2 * turns);
                    else if (g.trick === '360°')     rotAx(new THREE.Vector3(0, 1, 0), jp * Math.PI * 2 * turns);
                    else if (g.trick === 'Drift')  { rotAx(new THREE.Vector3(0, 1, 0), jp * Math.PI * 2 * turns); rotAx(new THREE.Vector3(1, 0, 0), -Math.sin(jp * Math.PI) * 1.2); }   // Cork
                    else if (g.trick === 'Big Air') { rotAx(new THREE.Vector3(1, 0, 0), -Math.sin(jp * Math.PI) * 0.9); rotAx(new THREE.Vector3(0, 0, 1), Math.sin(jp * Math.PI * 2) * 0.6); }
                    else                           { rotAx(new THREE.Vector3(0, 0, 1), Math.sin(jp * Math.PI) * 1.1); if (R.big) rotAx(new THREE.Vector3(0, 1, 0), jp * Math.PI * 2); }   // Grab (+180/360)
                    if (ud6.legL) { ud6.legL.rotation.x = -a * 1.1; ud6.legR.rotation.x = -a * 1.1; }
                    if (ud6.armL) { ud6.armL.rotation.z = a * 1.3; ud6.armR.rotation.z = -a * 1.3; }
                } else if (R.rn.type === 'racecourse') {
                    // Abfahrtshocke, Kurvenlage in Richtung des Tors
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -R.turn * 0.55));
                    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32));
                    if (ud6.legL) { ud6.legL.rotation.x = -0.75; ud6.legR.rotation.x = -0.75; }
                    if (ud6.armL) { ud6.armL.rotation.x = -1.1; ud6.armR.rotation.x = -1.1; ud6.armL.rotation.z = 0.25; ud6.armR.rotation.z = -0.25; }
                }
            }
            g.mesh.quaternion.slerp(q, g._run ? 0.5 : 0.3);
        }
        // ===== SCHRITTBEGRENZER ANWENDEN =====
        // Läuft nach ALLEN Zustandslogiken. Wer in diesem Bild zu weit
        // gesprungen ist, wird auf einen Schritt in Richtung Ziel
        // zurückgeholt — er läuft dann sichtbar dorthin.
        for (let i = 0; i < guestPool.length; i++) {
            const g = guestPool[i];
            if (!g.mesh.visible || !g._prevVisible) continue;      // Spawn / aus dem Hotel
            if (g.state === 'lift' || g.carrier) continue;         // fährt mit
            if (g._spawn) { g._spawn = false; continue; }
            if (g._run && g._run.air > 0.02) continue;              // in der Luft (Pipe/Kicker): hoher Sprung darf nicht gebremst werden
            const vmax = g.state === 'piste' ? MAX_SPEED.piste : MAX_SPEED.walk;
            clampStep(g.mesh, g._prevPos, vmax * dt);
        }
    };

    // ===== WARTESCHLANGE an der untersten Talstation =====
    // (Die frühere Deko-Warteschlange ist entfallen: an den Talstationen
    //  stehen jetzt die ECHTEN Gäste an, siehe planNext/joinLiftQueue.)
    const updateQueue = () => {};

    // ===== SONNE: weich auslaufende Scheibe mit Streulicht-Halo =====
    // Beide nutzen einen radialen Verlauf (Canvas-Textur) statt harter Kanten,
    // damit die Sonne nicht wie ein aufgeklebter Kreis wirkt.
    const radialTex = (stops) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const cx = cv.getContext('2d');
        const grd = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
        for (const [p, c] of stops) grd.addColorStop(p, c);
        cx.fillStyle = grd; cx.fillRect(0, 0, 128, 128);
        const tx = new THREE.CanvasTexture(cv); tx.needsUpdate = true; return tx;
    };
    // Kern: innen fast weiß, nach außen weich ausblendend
    const discTex = radialTex([[0, 'rgba(255,255,250,1)'], [0.30, 'rgba(255,248,232,0.99)'],
                               [0.46, 'rgba(255,236,200,0.92)'], [0.60, 'rgba(255,222,172,0.62)'],
                               [0.74, 'rgba(255,206,150,0.28)'], [0.88, 'rgba(255,194,138,0.08)'],
                               [1, 'rgba(255,188,132,0)']]);
    const sunDisc = new THREE.Mesh(new THREE.PlaneGeometry(worldSpan * 0.16, worldSpan * 0.16),
        new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0.9, depthWrite: false,
            depthTest: true, fog: false, blending: THREE.AdditiveBlending }));
    scene.add(sunDisc);
    // Streulicht: großer, sehr weicher Schein rundherum
    // Mehr Stützstellen = weicherer Abfall. Mit nur vier Stopps sah man die
    // Übergänge als konzentrische Ringe.
    const haloTex = radialTex([[0, 'rgba(255,232,196,0.50)'], [0.14, 'rgba(255,220,178,0.34)'],
                               [0.28, 'rgba(255,208,160,0.21)'], [0.44, 'rgba(255,196,146,0.12)'],
                               [0.62, 'rgba(255,186,136,0.055)'], [0.80, 'rgba(255,178,128,0.02)'],
                               [1, 'rgba(255,172,122,0)']]);
    const sunHalo = new THREE.Mesh(new THREE.PlaneGeometry(worldSpan * 0.62, worldSpan * 0.62),
        new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.5, depthWrite: false,
            depthTest: true, fog: false, blending: THREE.AdditiveBlending }));
    scene.add(sunHalo);
    // Strahlenkranz aus schmalen Dreiecken (Godrays-Andeutung)
    // ===== MOND =====
    // Steht der Sonne gegenüber, zieht mit ihr über den Himmel und wechselt
    // von Nacht zu Nacht die Phase — Neumond bis Vollmond in acht Spieltagen.
    // KEINE Sterne: feine helle Punkte am Himmel sind von den Schneeflocken
    // kaum zu unterscheiden und stiften mehr Verwirrung als Atmosphäre.
    const moon = makeMoon(worldSpan * 0.062);
    scene.add(moon.group);
    const _moonPos = new THREE.Vector3();
    // ===== STRAHLENKRANZ =====
    // Vorher: 16 exakt gleich breite, gleich lange Dreiecke mit harter Kante
    // und überall derselben Deckkraft — ein Comic-Stern, kein Sonnenlicht.
    // Echte Dämmerungsstrahlen sind wenige, unterschiedlich breite, weiche
    // Bänder, die nach aussen ausbleichen und sich waagerecht am Horizont
    // langziehen. Deshalb jetzt eine gemalte Textur statt Geometrie: nur so
    // lassen sich weiche Kanten und ein Abfall entlang der Strahlenlänge
    // überhaupt darstellen.
    const sunRaysTex = (() => {
        const S2 = 512, C = S2 / 2;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S2;
        const c = cv.getContext('2d');
        c.clearRect(0, 0, S2, S2);
        c.globalCompositeOperation = 'lighter';
        // feste Pseudozufallsfolge — die Strahlen sollen nicht bei jedem
        // Spielstart anders stehen, aber untereinander ungleich sein
        let rs = 20240917;
        const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
        const NR = 9;                                   // wenige, dafür breite Bänder
        for (let i = 0; i < NR; i++) {
            // ungleichmässig verteilte Winkel: perfekte Symmetrie wirkt künstlich
            const a = (i / NR) * Math.PI * 2 + (rnd() - 0.5) * 0.55;
            const len = C * (0.45 + rnd() * 0.5);       // unterschiedlich lang
            const halfW = 0.035 + rnd() * 0.075;        // unterschiedlich breit
            const strength = 0.10 + rnd() * 0.16;
            // Weiche Kante durch gestapelte Streifen mit wachsender Breite
            // und fallender Deckkraft — ersetzt einen Weichzeichner, der
            // nicht überall verfügbar ist.
            const LAYERS = 6;
            for (let l = 0; l < LAYERS; l++) {
                const f = l / (LAYERS - 1);
                const wI = halfW * (0.25 + f * 1.9);
                const alpha = strength * (1 - f) * (1 - f) / LAYERS * 3.2;
                // Längsverlauf: innen hell, aussen auf Null
                const gx = Math.cos(a) * len, gy = Math.sin(a) * len;
                const grd = c.createLinearGradient(C, C, C + gx, C + gy);
                grd.addColorStop(0.00, 'rgba(255,236,200,' + (alpha * 0.9).toFixed(4) + ')');
                grd.addColorStop(0.18, 'rgba(255,222,170,' + alpha.toFixed(4) + ')');
                grd.addColorStop(0.55, 'rgba(255,198,142,' + (alpha * 0.45).toFixed(4) + ')');
                grd.addColorStop(1.00, 'rgba(255,180,120,0)');
                c.fillStyle = grd;
                c.beginPath();
                c.moveTo(C + Math.cos(a - wI) * C * 0.035, C + Math.sin(a - wI) * C * 0.035);
                c.lineTo(C + Math.cos(a - wI * 0.55) * len, C + Math.sin(a - wI * 0.55) * len);
                c.lineTo(C + Math.cos(a + wI * 0.55) * len, C + Math.sin(a + wI * 0.55) * len);
                c.lineTo(C + Math.cos(a + wI) * C * 0.035, C + Math.sin(a + wI) * C * 0.035);
                c.closePath();
                c.fill();
            }
        }
        // Der Kern muss die Strahlenansätze überdecken, sonst sieht man den
        // Sternmittelpunkt als harten Knoten.
        const core = c.createRadialGradient(C, C, 0, C, C, C * 0.30);
        core.addColorStop(0, 'rgba(255,240,210,0.55)');
        core.addColorStop(0.5, 'rgba(255,224,178,0.18)');
        core.addColorStop(1, 'rgba(255,210,160,0)');
        c.fillStyle = core; c.fillRect(0, 0, S2, S2);
        c.globalCompositeOperation = 'source-over';
        const tx = new THREE.CanvasTexture(cv);
        tx.anisotropy = 4; tx.needsUpdate = true;
        return tx;
    })();
    const sunRays = new THREE.Mesh(
        new THREE.PlaneGeometry(worldSpan * 0.95, worldSpan * 0.95),
        new THREE.MeshBasicMaterial({ map: sunRaysTex, transparent: true, opacity: 0,
            depthWrite: false, depthTest: true, fog: false,
            blending: THREE.AdditiveBlending }));
    sunRays.visible = false;
    scene.add(sunRays);

    // ===== TAG-/ABEND-ZYKLUS =====
    const dayBg = scene.background.clone();
    const eveBg = new THREE.Color(0x35496f);       // dämmriges Blau (heller als früher: die Nacht soll spielbar bleiben)
    const daySun = new THREE.Color(0xfff2dc), eveSun = new THREE.Color(0xffb36b); // warmes Abendlicht
    const moonSun = new THREE.Color(0xbfd3f2);     // kühles Mondlicht für die Nacht
    // Sekunden pro voller Zyklus (Tag->Abend->Nacht->Tag). Früher 110 s: da dämmerte es
    // gefühlt ununterbrochen. Jetzt dauert ein Spieltag fünf Minuten, gut die Hälfte davon ist heller Tag.
    const CYCLE = 300;
    // Nicht jeder Abend wird ein Postkarten-Sonnenuntergang: pro Zyklus wird
    // gewürfelt, ob es einen gibt und wie kräftig er ausfällt.
    const glowSun = new THREE.Color(0xff8b4a);     // tief glühendes Orange
    const sunsetBg = new THREE.Color(0xf0855c);    // warmer Abendhimmel
    // Wiederverwendete Farbobjekte (kein Neuanlegen je Frame)
    const _skyA = new THREE.Color(), _skyB = new THREE.Color(), _skyC = new THREE.Color();
    const _skyD = new THREE.Color(), _skyE = new THREE.Color(), _skyF = new THREE.Color();
    const _skyG = new THREE.Color(), _skyH = new THREE.Color(), _skyI = new THREE.Color();
    /** Dunstfarbe am Fuß der Bergketten — folgt Tageszeit und Abendrot. */
    const horizonTint = (day, glow) => {
        _skyI.set(0x3d5a7d).lerp(_skyF.set(0xdce9f2), day);
        if (glow > 0) _skyI.lerp(_skyG.set(0xffb789), glow * 0.7);
        return _skyI;
    };
    let lastCycle = -1, sunsetStrength = 0;
    const applyDaylight = (t) => {
        // 1 = heller Tag, 0 = tiefe Dämmerung (nie ganz Nacht)
        // ===== TAGESVERLAUF MIT MITTAGS-PLATEAU =====
        // Eine reine Kosinuswelle verbringt überall gleich viel Zeit — Mittag
        // ist dann nur ein kurzer Moment und es dämmert gefühlt dauernd.
        // Der Rohwert wird deshalb gespreizt: oberhalb von 0.62 gilt voller
        // Tag, unterhalb von 0.10 Nacht, dazwischen liegt der Übergang.
        const rawDay = 0.5 + 0.5 * Math.cos((t / CYCLE) * Math.PI * 2);
        // Plateau ab 0.52 (vorher 0.62): gut die Hälfte des Zyklus ist voller Tag.
        const dayT = Math.max(0, Math.min(1, (rawDay - 0.10) / 0.42));
        const day = dayT * dayT * (3 - 2 * dayT);      // weiches Ein-/Ausblenden
        // Neuer Zyklus -> neu auswürfeln (ca. jeder dritte Abend wird spektakulär)
        const cyc = Math.floor(t / CYCLE);
        if (cyc !== lastCycle) {
            lastCycle = cyc;
            sunsetStrength = Math.random() < 0.35 ? 0.55 + Math.random() * 0.45 : 0;
        }
        // Der Effekt wirkt nur in der Dämmerungsphase, am stärksten bei day≈0.35
        const dusk = Math.max(0, 1 - Math.abs(rawDay - 0.30) / 0.26);
        const glow = sunsetStrength * dusk;
        const dl = 0.3 + 0.7 * day;                // 0.3..1.0
        // ===== HELLERE NACHT =====
        // Früher blieb nachts nur ein schwaches, orangefarbenes Restlicht – Pisten und
        // Gebäude versanken im Dunkel. Jetzt übernimmt ein kühles Mondlicht, und das
        // Himmelslicht hellt die Schatten zusätzlich auf: man kann nachts weiterbauen.
        const deepNight = Math.max(0, Math.min(1, (0.30 - day) / 0.30));    // 1 = tiefe Nacht
        sun.intensity = 1.05 + 1.25 * day + glow * 0.5;
        sun.color.copy(eveSun).lerp(daySun, day);
        if (deepNight > 0) sun.color.lerp(moonSun, deepNight * 0.85);
        if (glow > 0) sun.color.lerp(glowSun, glow * 0.75);
        hemiLight.intensity = 0.85 + 0.30 * (1 - day);
        ambientLight.intensity = 0.26 + 0.16 * (1 - day);
        sun.position.set(-worldSpan * 0.35, worldSpan * (0.25 + 0.6 * day), worldSpan * (0.5 - 0.4 * day));
        // Tagessonne: steht dort, wo das Licht herkommt. Unterhalb von day≈0.55 zeigt
        // der Abschnitt „Sonnenscheibe + Strahlenkranz" die Abendsonne – bis dahin
        // ist die Tagessonne ausgeblendet, sonst stünden zwei Sonnen am Himmel.
        const orbFade = Math.max(0, Math.min(1, (day - 0.5) / 0.2));
        sunOrb.core.position.copy(sun.position).normalize().multiplyScalar(SUN_ORB_DIST);
        sunOrb.halo.position.copy(sunOrb.core.position);
        sunOrb.core.material.opacity = orbFade;
        sunOrb.halo.material.opacity = orbFade;
        sunOrb.core.visible = sunOrb.halo.visible = orbFade > 0.01;
        scene.background.copy(eveBg).lerp(dayBg, day);
        if (glow > 0) scene.background.lerp(sunsetBg, glow * 0.65);
        if (scene.fog) scene.fog.color.copy(scene.background);
        // ===== HIMMELSKUPPEL & KULISSE dem Tageslicht nachführen =====
        if (skyDome && skyDome.userData.setColors) {
            const zenith = _skyA.set(0x16406b).lerp(_skyB.set(0x3d79b4), day);
            const middle = _skyC.set(0x476890).lerp(_skyD.set(0x9ecbe8), day);
            const horiz  = _skyE.copy(scene.background).lerp(_skyF.set(0xe4eef6), 0.6 * day);
            if (glow > 0) {
                middle.lerp(_skyG.set(0xf4a06a), glow * 0.55);
                horiz.lerp(_skyH.set(0xffcb95), glow * 0.7);
            }
            skyDome.userData.setColors(zenith, middle, horiz);
            // Der Himmel spiegelt sich im Wasser
            if (water) water.userData.setEnv({ day, sunDir: sun.position, sunColor: sun.color, zenith: middle, horizon: horiz });
        } else if (water) {
            water.userData.setEnv({ day, sunDir: sun.position, sunColor: sun.color, horizon: scene.background });
        }
        // Kulisse voll beleuchten: Sonnenazimut, Tageszeit und Abendrot.
        // So glühen genau die Grate auf, die zur Sonne zeigen.
        // ===== NACHTBELEUCHTUNG DER ANLAGEN =====
        // `day` 1 = heller Tag, 0 = Nacht. Kabinenlicht und Blinkfeuer
        // blenden mit der Dunkelheit ein.
        {
            const dark = 1 - day;
            for (const g2 of nightLit) g2.userData.setNight(dark, t);
            // Fahrzeuge: Pistenraupen und Rettungsheli schalten nachts ihre
            // Arbeits- und Suchscheinwerfer ein.
            // (Helis und Skidoos tragen sich beim Anlegen selbst in
            //  nightVehicles ein — siehe syncFleet)
            for (const v3 of nightVehicles) v3.userData.setNight(dark);
        }
        if (apron && apron.userData.setHaze) apron.userData.setHaze(horizonTint(day, glow));
        if (valleyHaze?.userData?.setHaze) valleyHaze.userData.setHaze(horizonTint(day, glow));
        if (ranges && ranges.userData.setLight) {
            ranges.userData.setLight({
                tint: horizonTint(day, glow),
                sunAz: Math.atan2(sun.position.x, sun.position.z),
                day, glow,
                warm: _skyG.set(glow > 0.35 ? 0xff9d63 : 0xffc79a)
            });
        }
        // ===== MOND =====
        // Gegenüber der Sonne, also gespiegelt an der Weltmitte, und etwas
        // höher, damit er nicht im Gelände klebt. `cyc` zählt die Spieltage:
        // acht Tage ergeben einen vollen Phasenzyklus.
        {
            const night = 1 - day;
            const sd = sun.position.clone().normalize();
            // Weiter draussen als die FERNSTE Bergkette (2.85 x worldSpan),
            // sonst könnte deren Tiefenmaske ihn gar nicht verdecken.
            _moonPos.set(-sd.x, Math.abs(sd.y) * 0.42 + 0.40, -sd.z)
                    .normalize().multiplyScalar(worldSpan * 3.3);
            moon.setPhase((cyc % 8) / 8 + 0.06);
            moon.setLook(_moonPos, camera.position, night);
        }
        // Sonnenscheibe + Strahlenkranz am Horizont
        if (sunDisc) {
            // Es steht immer nur EINE Sonne am Himmel: die Abendsonne blendet in dem Maß ein,
            // wie die Tagessonne (sunOrb) geht – beide stehen in derselben Richtung, aber
            // verschieden weit weg, und lagen sonst je nach Kamerastand nebeneinander.
            // Und sie geht unter: in tiefer Nacht blieb sie bisher als orange Scheibe am
            // Horizont stehen, während gegenüber schon der Mond schien.
            const eveFade = (1 - orbFade) * (1 - deepNight);
            const show = (glow > 0.05 || day < 0.55) && eveFade > 0.02;
            sunDisc.visible = show;
            if (show) {
                sunDisc.position.copy(sun.position).multiplyScalar(0.82);
                sunDisc.lookAt(camera.position);
                const warm = 0.35 + glow * 0.65;
                // tief stehende Sonne wird größer und wärmer (atmosphärische Streuung)
                const low = 1 - Math.min(1, day * 1.6);
                // Refraktion drückt die tief stehende Sonne sichtbar flach.
                const sd6 = 0.75 + low * 0.5 + glow * 0.35;
                sunDisc.scale.set(sd6 * (1 + low * 0.10), sd6 * (1 - low * 0.14), 1);
                sunDisc.material.opacity = (0.55 + glow * 0.4) * eveFade;
                sunDisc.material.color.set(0xffffff).lerp(glowSun, warm * 0.55 + low * 0.25);
                sunHalo.visible = show;
                sunHalo.position.copy(sunDisc.position);
                sunHalo.quaternion.copy(sunDisc.quaternion);
                // Auch der Hof legt sich am Horizont breit — Streuung in der
                // dichten Luftschicht wirkt fast nur waagerecht.
                const sc6 = 0.7 + low * 0.6 + glow * 0.5;
                sunHalo.scale.set(sc6 * (1 + low * 0.55), sc6 * (1 - low * 0.20), 1);
                sunHalo.material.opacity = (0.14 + glow * 0.34) * eveFade;
                sunHalo.material.color.set(0xffe0b0).lerp(glowSun, warm * 0.7);
                // Strahlen drehen sich ganz langsam
                sunRays.visible = glow > 0.05;
                if (sunRays.visible) {
                    sunRays.position.copy(sunDisc.position);
                    sunRays.quaternion.copy(sunDisc.quaternion);
                    // Sehr langsame Drehung, dazu ein leichtes Atmen — starre
                    // Strahlen verraten sofort, dass es gemalt ist.
                    sunRays.rotateZ(t * 0.006);
                    // Tief stehendes Licht streut in der dichten Luft weit
                    // WAAGERECHT und kaum nach oben. Der Kranz wird deshalb
                    // in die Breite gezogen, je tiefer die Sonne steht.
                    const lowR = 1 - Math.min(1, day * 1.6);
                    const breathe = 1 + Math.sin(t * 0.23) * 0.05;
                    sunRays.scale.set((1.0 + lowR * 0.75) * breathe,
                                      (0.72 - lowR * 0.22) * breathe, 1);
                    sunRays.material.opacity = Math.min(0.34, glow * glow * 0.42 + glow * 0.08) * eveFade;
                    sunRays.material.color.copy(sunDisc.material.color);
                }
            } else { sunHalo.visible = false; sunRays.visible = false; }
        }
        // Fenster leuchten abends stärker
        MATS.winGlow.emissiveIntensity = 0.4 + (1 - day) * 1.4;
        // Flutlicht an den Pisten: ab Dämmerung an, tagsüber aus
        const night = Math.max(0, 1 - day * 1.4); // 0 am hellen Tag, ~1 in der Dämmerung
        if (apronLights?.userData?.setNight) apronLights.userData.setNight(night);
        for (const f of floodlights) {
            f.lampMat.emissiveIntensity = 0.2 + night * 2.2;
            if (f.glow) {
                const on = night > 0.12;
                f.glow.visible = on;
                if (on) f.glow.material.opacity = 0.12 + night * 0.3;
            }
        }
        return day;
    };

    let raf=0; const clock=new THREE.Clock(); let lastT=0;
    if (import.meta.env.DEV && window.__mtCam) {   // nur beim Entwickeln: Tageszeit und Qualitätsstufe stellen
        Object.assign(window.__mtCam, { clock, CYCLE, raycastTerrain: (x, y) => raycastTerrain(x, y),
            quality: { get: () => qTier, set: (n) => { qTier = Math.max(0, Math.min(Q_MAX, n | 0)); applyQuality(); } } });
    }
    const animate=()=>{
        const t=clock.getElapsedTime();
        const rawDt=t-lastT;
        // Nie rückwärts: eine negative Zeitspanne ließe Gäste „vor" den Anfang ihrer Strecke laufen.
        const dt=Math.max(0, Math.min(0.1, rawDt)); lastT=t;
        qualityFrame(rawDt);   // Bildrate messen, Qualität bei Bedarf anpassen
        playSeconds += dt;
        const dayNow = applyDaylight(t);
        if (clouds.userData.update) clouds.userData.update(dt);
        // Wolken sind Himmelsschmuck: steigt die Kamera in ihre Höhe oder darüber,
        // blenden sie aus – sonst liegen sie im Überblick als weiße Flecken über dem Gebiet.
        for (const spr of clouds.children) {
            const k = Math.max(0, Math.min(1, (spr.position.y - camera.position.y) / (worldSpan * 0.05)));
            spr.material.opacity = 0.55 * k;
            spr.visible = k > 0.01;
            // nachts nicht grellweiß vor dunklem Himmel, sondern gedämpft im Mondlicht
            spr.material.color.setScalar(0.30 + 0.70 * dayNow);
        }
        // Ökonomie: alle ~1s ein Tick, danach HUD aktualisieren
        sim.timeAcc += dt;
        if (sim.timeAcc >= 1) { simTick(sim.timeAcc); sim.timeAcc = 0; emitStats(); if (selectedSel && onSelect) onSelect(infoFor(selectedSel)); }
        updateGuests(t, dt);
        updateRescues(t, dt);
        orbit.step();          // laufender Kameraflug
        updateFog();           // Dunst an Kartengröße und Zoom anpassen
        updateConstructions(dt);
        updateQueue(t);
        for (const u of updaters) u(t);
        if (water) water.userData.update(dt);     // Wellen und Strömung
        // ===== WIND: Böen treiben Schnee, Fahnen und Wipfel =====
        updateWind(t, dt);
        // Schneefall folgt dem Wetter: bei Föhn rieselt nichts, im Sturm dicht.
        const fall = weather.snowfall;
        snow.visible = fall > 0.02;
        snow.material.opacity = 0.16 + fall * 0.74;
        snow.material.size = 0.24 + fall * 0.30;
        const sp=snow.geometry.attributes.position;
        const halfSpan = worldSpan * 0.5;
        // sichtbare Flockenzahl skaliert mit der Schneefallstärke
        const active = Math.max(1, Math.round(sp.count * Math.min(1, 0.10 + fall * 1.05)));
        snow.geometry.setDrawRange(0, active);
        for(let i=0;i<active;i++){
            let y=sp.getY(i)-0.045*(1+wind.strength*0.5)*(0.6+fall);
            // seitlich verwehen, je nach Windrichtung und Stärke
            let x=sp.getX(i)+wind.x*dt*(2.5+wind.strength*9)+Math.sin(t*1.7+i)*0.012;
            let z=sp.getZ(i)+wind.z*dt*(2.5+wind.strength*9);
            if(y<0){ y=worldSpan*0.4; x=(Math.random()-0.5)*worldSpan; z=(Math.random()-0.5)*worldSpan; }
            if(x> halfSpan) x-=worldSpan; else if(x<-halfSpan) x+=worldSpan;
            if(z> halfSpan) z-=worldSpan; else if(z<-halfSpan) z+=worldSpan;
            sp.setXYZ(i,x,y,z);
        }
        sp.needsUpdate=true;
        updateGustVeil(t);
        if (composer) {
            if (gradePass) gradePass.uniforms.uTime.value = t;
            if (bloomPass && bloomPass.enabled) {
                // Nah am Gelände strahlten Schneekappen und Dächer als weiße Höfe aus. Das
                // Glühen nimmt deshalb mit der Nähe ab und ist erst im Überblick voll da.
                const far = Math.max(0, Math.min(1, (orbit.viewDist() - 26) / Math.max(1, worldSpan * 0.42 - 26)));
                bloomPass.strength = 0.09 + 0.25 * far;        // im Überblick 0.34 wie bisher
                bloomPass.radius = 0.46 + 0.26 * far;
                bloomPass.threshold = 0.96 - 0.10 * far;
            }
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
        raf=requestAnimationFrame(animate);
    };
    animate();

    // Fenstergröße geändert, Handy gedreht oder Adressleiste ein-/ausgeblendet
    const onResize = () => applySize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    // ============================================================
    // INTERAKTIVES BAUEN: Raycast aufs Terrain, Ghost-Vorschau, Klick platziert
    // ============================================================
    const BUILD_DEFS = {
        chalet:     { cost: 40000,  r: 2.2, make: () => makeChalet({ w: 2.4, d: 2 }, 1) },
        hotel:      { cost: 180000, r: 3.2, make: () => makeHotelClass('standard') },
        restaurant: { cost: 60000,  r: 2.6, make: () => makeRestaurant() },
        ticket:     { cost: 29200,  r: 2.0, make: () => makeTicketOffice() },
        snowcannon: { cost: 29200,  r: 1.2, make: () => makeSnowCannon() },
        funpark_s:  { cost: 90000,  r: 3.6, make: () => makeRunDressing('funpark_s', 7) },
        funpark:    { cost: 220000, r: 5.2, make: () => makeRunDressing('funpark', 10) },
        funpark_l:  { cost: 420000, r: 7.5, make: () => makeRunDressing('funpark_l', 14) },
        toilet:     { cost: 18000,  r: 1.6, make: () => makeToilet() },
        parking:    { cost: 12000,  r: 4.2, make: () => makeParking(8, 7) },
        parkgarage: { cost: 95000,  r: 5.6, make: () => makeParkingGarage(3, 12, 9) },
        // Katalog aus dem 2D-Spiel (Kosten aus buildings.js übernommen/angepasst)
        skischool:  { cost: 45000,  r: 2.2, make: () => makeSkiSchool() },
        skirental:  { cost: 38000,  r: 2.2, make: () => makeSkiRental() },
        shop:       { cost: 52000,  r: 2.2, make: () => makeShop() },
        imbiss:     { cost: 26000,  r: 1.8, make: () => makeImbiss() },
        busstop:    { cost: 15000,  r: 1.8, make: () => makeBusStop() },
        // Garagen für PistenBully 300 (kompakt) und 500 (groß)
        garage:      { cost: 32500,  r: 2.6, make: () => makeSnowcatGarage(1, '300') },
        garage2:     { cost: 58000,  r: 3.4, make: () => makeSnowcatGarage(2, '300') },
        garage4:     { cost: 104000, r: 4.8, make: () => makeSnowcatGarage(4, '300') },
        garage5_1:   { cost: 52000,  r: 3.2, make: () => makeSnowcatGarage(1, '500') },
        garage5_2:   { cost: 92000,  r: 4.2, make: () => makeSnowcatGarage(2, '500') },
        garage5_4:   { cost: 168000, r: 5.8, make: () => makeSnowcatGarage(4, '500') },
        // ===== Restlicher 2D-Katalog (Kosten 1:1 aus buildings.js) =====
        // ===== SECHS HOTELSTUFEN, 25 bis 250 BETTEN =====
        hotel_pension:{ cost: 42000,  r: 2.4, make: () => makeHotelClass('pension') },
        hotel_budget: { cost: 97500,  r: 3.0, make: () => makeHotelClass('budget') },
        hotel_mid:    { cost: 227500, r: 3.4, make: () => makeHotelClass('mid') },
        hotel_resort: { cost: 380000, r: 4.0, make: () => makeHotelClass('resort') },
        hotel_lux:    { cost: 520000, r: 4.2, make: () => makeHotelClass('luxury') },
        chalet_s:     { cost: 130000, r: 2.2, make: () => makeChaletClass('small') },
        chalet_l:     { cost: 325000, r: 2.9, make: () => makeChaletClass('large') },
        chalet_lux:   { cost: 975000, r: 3.6, make: () => makeChaletClass('luxury') },
        huette:       { cost: 39000,  r: 2.2, make: () => makeGastro('huette') },
        bergrest:     { cost: 130000, r: 3.2, make: () => makeGastro('berg') },
        panorama:     { cost: 260000, r: 3.6, make: () => makeGastro('panorama') },
        sterne:       { cost: 520000, r: 3.4, make: () => makeGastro('sterne') },
        apres:        { cost: 65000,  r: 3.0, make: () => makeApresSkiBar() },
        partyzelt:    { cost: 16200,  r: 2.8, make: () => makePartyTent() },
        disco:        { cost: 325000, r: 3.6, make: () => makeDisco() },
        souvenir:     { cost: 39000,  r: 2.0, make: () => makeShop() },
        medical:      { cost: 65000,  r: 2.2, make: () => makeMedicalStation() },
        hospital:     { cost: 325000, r: 4.4, make: () => makeHospital() },
        workshop:     { cost: 80000,  r: 3.0, make: () => makeWorkshop() },
        reservoir:    { cost: 97500,  r: 5.2, make: () => makeReservoir() },
        reservoir_l:  { cost: 420000, r: 11.5, make: () => makeBigReservoir() },
        kicker:       { cost: 18500,  r: 3.4,  make: () => makeRunDressing('kicker', 8) },
        halfpipe:     { cost: 186000, r: 6.5,  make: () => makeRunDressing('halfpipe', 20) },
        racecourse:   { cost: 340000, r: 10.0, make: () => makeRunDressing('racecourse', 30) },
        cannon_s:     { cost: 9800,   r: 1.0, make: () => makeSnowCannon('small') },
        cannon_l:     { cost: 55200,  r: 1.6, make: () => makeSnowCannon('large') },
        sauna:        { cost: 195000, r: 2.6, make: () => makeSauna() },
        therme:       { cost: 2600000,r: 5.6, make: () => makeThermalBath() },
        eisbahn:      { cost: 975000, r: 7.5, make: () => makeIceRink() }
    };
    let currentBuild = null;
    let ghost = null;
    let ghostRot = 0; // Planungs-Rotation (Q/E oder R drehen das Gebäude)
    /** Bauvorschau drehen (Tasten Q/E/R, am Handy der Dreh-Knopf in der Bestätigen-Leiste). */
    const rotateGhost = (step) => {
        if (!ghost || !step) return;
        ghostRot += step;
        ghost.rotation.y = ghostRot;
        // Beschneiungs-Sektor und Richtungspfeil drehen mit dem Modell mit
        if (snowRing) snowRing.rotation.y = ghostRot;
        if (dirArrow) dirArrow.rotation.y = ghostRot;
    };
    window.addEventListener('keydown', (e) => {
        if (!ghost) return;
        const k = e.key.toLowerCase();
        // Q/E drehen in beide Richtungen (so steht es auch im HUD), R zusätzlich
        // 90°-Schritte statt 22.5°: alles andere passt nicht auf eine
        // quadratische Parzelle und ragt über deren Kanten hinaus.
        rotateGhost(k === 'q' ? -Math.PI / 2 : (k === 'e' || k === 'r') ? Math.PI / 2 : 0);
    });
    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let downX = 0, downY = 0;
    // ===== FINGER: Antippen von Kamerabewegung und Zwei-Finger-Gesten unterscheiden =====
    const touchIds = new Set();        // gerade aufliegende Finger
    let gestureSeen = false;           // in dieser Berührung lag zeitweise mehr als ein Finger auf
    let lastPointerType = 'mouse';
    const isTouchEvent = (e) => !!e && !!e.pointerType && e.pointerType !== 'mouse';
    /** Klick bzw. Antippen – also kein Ziehen der Kamera und keine Zwei-Finger-Geste. */
    const isTap = (e) => {
        if (e.__confirmed) return true;
        if (isTouchEvent(e) && gestureSeen) return false;
        return Math.hypot(e.clientX - downX, e.clientY - downY) <= (isTouchEvent(e) ? 10 : 5);
    };
    // ===== TIPPEN UND BESTÄTIGEN (Finger) =====
    // Mit der Maus sieht man die Vorschau schon beim Bewegen. Mit dem Finger gibt es
    // kein „Darüberfahren": das Antippen setzt deshalb nur die Vorschau samt Preis,
    // gebaut (oder abgerissen) wird erst nach der Bestätigung im HUD.
    let pending = null;                // {kind, pt, cost, ok, why, count, building}
    let onPending = null;
    let demolishMark = null;           // rote Scheibe über dem zum Abriss angetippten Gebäude
    const setPending = (p) => {
        pending = p;
        // Abriss vormerken: zeigen, WELCHES Gebäude gemeint ist
        if (demolishMark) { scene.remove(demolishMark); demolishMark.geometry.dispose(); demolishMark.material.dispose(); demolishMark = null; }
        if (p && p.kind === 'demolish' && p.building) {
            const r = (p.building.rec?.r || 2) + 0.9;
            demolishMark = new THREE.Mesh(
                new THREE.CircleGeometry(r, 40),
                new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.42, depthTest: false, depthWrite: false, fog: false }));
            demolishMark.rotation.x = -Math.PI / 2;
            demolishMark.position.set(p.building.rec.x, p.building.mesh.position.y + 0.4, p.building.rec.z);
            demolishMark.renderOrder = 999;
            scene.add(demolishMark);
        }
        if (onPending) onPending(p ? { kind: p.kind, cost: p.cost || 0, ok: !!p.ok, why: p.why || '', count: p.count || 0 } : null);
    };

    // Straßen-Werkzeug (zwei Klicks: Start, Ende) — Gamer baut Straßen wie im 2D
    let roadMode = false;
    let roadStart = null;      // {gx, gy}
    let roadMarker = null;
    let roadPreview = null;
    const ROAD_COST_PER = 220; // € pro Kachel-Länge
    const endRoad = () => { roadMode = false; roadStart = null; if (roadMarker) { scene.remove(roadMarker); roadMarker = null; } if (roadPreview) { scene.remove(roadPreview); roadPreview.userData.dispose?.(); roadPreview = null; } showParcelGrid(false); };

    // Lift-Werkzeug
    let liftMode = false;
    let liftStart = null;      // {pt, gx, gy}
    let liftMarker = null;
    let liftPreview = null;
    let liftPreviewKey = '';
    /**
     * Baut eine transparente Vorschau der kompletten Liftanlage (Stationen,
     * Stützen, Seil, Kabinen) an der geplanten Stelle — grün = baubar,
     * rot = zu teuer. Wird nur neu erzeugt, wenn sich der Endpunkt ändert.
     */
    const buildLiftPreview = (start, end, ok) => {
        const key = `${Math.round(end.gx)}|${Math.round(end.gy)}|${liftKind}|${ok}`;
        if (key === liftPreviewKey && liftPreview) return;
        liftPreviewKey = key;
        if (liftPreview) { scene.remove(liftPreview); liftPreview = null; }
        const N = Math.max(8, Math.round(start.pt.distanceTo(end.pt) / 4));
        const samples = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            samples.push(yAtSmooth(start.gx + (end.gx - start.gx) * t, start.gy + (end.gy - start.gy) * t));
        }
        const a = new THREE.Vector3(start.pt.x, start.pt.y, start.pt.z);
        const b = new THREE.Vector3(end.pt.x, end.pt.y, end.pt.z);
        const mk = liftKind === 'chair' ? makeChairlift(a, b, samples, liftOpts)
            : liftKind === 'chair2' ? makeChairlift2(a, b, samples, liftOpts)
            : liftKind === 'chair6' ? makeChairlift6(a, b, samples, liftOpts)
            : liftKind === 'platter' ? makePlatterLift(a, b, samples, liftOpts)
            : liftKind === 'carpet' ? makeMagicCarpet(a, b, samples)
            : liftKind === 'tbar' ? makeSurfaceLift(a, b, samples, liftOpts)
            : liftKind === 'tram' ? makeAerialTram(a, b, samples, { neonAd: nextNeonAd() })
            : liftKind === 'tramxl' ? makeAerialTramXL(a, b, samples, { ...liftOpts, neonAd: nextNeonAd() })
            : liftKind === 'mega' ? makeMegaGondola(a, b, samples, { ...liftOpts, neonAd: nextNeonAd() })
            : liftKind === 'gondola4' ? makeGondola4(a, b, samples, liftOpts)
            : liftKind === 'gondola8' ? makeGondola8(a, b, samples, liftOpts)
            : makeLift(a, b, samples, { maxMast: 14, ...liftOpts });
        const g = mk.group || mk;
        // Alles durchsichtig einfärben (Geister-Optik)
        const tint = new THREE.Color(ok ? 0x66ff88 : 0xff5555);
        g.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = false; o.receiveShadow = false;
            o.material = new THREE.MeshBasicMaterial({
                color: tint, transparent: true, opacity: 0.42,
                depthWrite: false, side: THREE.DoubleSide
            });
        });
        liftPreview = g; scene.add(g);
    };
    let liftKind = 'gondola'; // 'gondola' | 'chair' | 'tbar' | 'tram'
    // Aus dem Baudialog übernommene Einstellungen für die NÄCHSTE Anlage
    let pendingLift = null;
    const liftBaseName = (kind) => ({
        gondola: 'Gondelbahn', gondola4: '4er-Gondelbahn', gondola8: 'Kabinenbahn', mega: 'Einseilumlaufbahn', tram: 'Pendelbahn', tramxl: 'Jumbo-Pendelbahn',
        chair: 'Sesselbahn', chair2: 'Sesselbahn', chair6: 'Sesselbahn',
        tbar: 'Schlepplift', platter: 'Tellerlift', carpet: 'Förderband'
    }[kind] || 'Lift');
    const nextLiftName = (kind) => liftBaseName(kind) + ' ' + (built.lift + 1);
    // Lifttypen wie im 2D (LIFT_TYPES): Preise skaliert auf die 3D-Ökonomie
    const liftCost = (a, b) => { const p = LIFT_PARAMS[liftKind]; return Math.round(p.base + a.distanceTo(b) * p.per); };

    // ===== PISTEN-WERKZEUG (Multi-Wegpunkt, wie im 2D) =====
    let pisteMode = false;
    let pisteLit = false;     // "Piste mit Flutlicht" gewählt?
    // Pistenbreiten (Flutlicht-Variante ist immer mittelbreit)
    // Pistenbreiten in Kacheln (Halbbreite des Schneebetts).
    // `xwide` = Talabfahrt/Autobahn: sehr breit, teurer, aber hohe Kapazität.
    const PISTE_WIDTHS = { narrow: 1.8, medium: 2.6, wide: 3.8, xwide: 5.6 };
    let pisteWidth = 'medium';
    let pistePts = [];        // gesetzte Wegpunkte {gx,gy}
    let pistePreview = null;  // Vorschau-Polyline
    const pisteDots = [];     // kleine Marker der gesetzten Punkte
    const piste = { total: 0, blue: 0, red: 0, black: 0 };
    let pisteNo = 0;                      // fortlaufende Pistennummer (wie im 2D)
    const pisteSnowMats = [];             // Schneebett-Materialien -> Zustands-Färbung
    const pisteBeds = [];                 // {geo, grid} -> Schneebett folgt der Schneedecke
    // Nummernschild am Pistenende (anklickbar fürs Pisten-Infofeld)
    const addPisteSign = (at, no, diffHex) => {
        const grp = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), MATS.metal);
        post.position.y = 0.7; grp.add(post);
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08),
            new THREE.MeshStandardMaterial({ color: diffHex, roughness: 0.45 }));
        board.position.y = 1.7; grp.add(board);
        const label = makeTextSprite('Piste ' + no);
        label.position.set(0, 2.35, 0); label.scale.multiplyScalar(0.62); grp.add(label);
        const wp = worldPosSmooth(at.gx, at.gy); grp.position.copy(wp); scene.add(grp);
        return grp;
    };
    const PISTE_HEX = { blue: 0x3b82f6, red: 0xef4444, black: 0x111827 };
    const PISTE_RGB = { blue: [0.23, 0.51, 0.96], red: [0.94, 0.27, 0.27], black: [0.11, 0.11, 0.16] };
    // Initiale Abfahrt = Piste 1 (läuft durchs selbe System wie gebaute Pisten)
    if (routePts.length > 1) {
        pisteNo = 1;
        let km0 = 0;
        for (let i = 1; i < routePts.length; i++) km0 += Math.hypot(routePts[i].gx - routePts[i-1].gx, routePts[i].gy - routePts[i-1].gy) * 0.02;
        const sAt = routePts[Math.max(0, Math.floor(routePts.length * 0.9))];
        addPisteSign(sAt, 1, PISTE_HEX.red);
        const bw0 = worldPosSmooth(sAt.gx, sAt.gy);
        addSelectable({ type: 'piste', cost: 0, x: bw0.x, z: bw0.z, r: 3.2, piste: { no: 1, km: +km0.toFixed(1), diff: 'red' } });
    }
    // Schwierigkeit eines Segments aus dem Gefälle (2D-Formel: <35% blau, <55% rot, sonst schwarz)
    const segDifficulty = (a, b) => {
        const dh = Math.abs((yAtSmooth(a.gx, a.gy) - yAtSmooth(b.gx, b.gy)) / hScale);
        const dist = Math.hypot(a.gx - b.gx, a.gy - b.gy) || 1;
        const grad = (dh / dist) * 10 / 1.5;
        if (grad >= 55) return 'black';
        if (grad >= 35) return 'red';
        return 'blue';
    };
    // Landcover an einer Grid-Kachel
    const lcAt = (gx, gy) => {
        const x = Math.max(0, Math.min(gridSize - 1, Math.round(gx)));
        const y = Math.max(0, Math.min(gridSize - 1, Math.round(gy)));
        return world.landcover[y * gridSize + x];
    };
    // rohe Hangneigung (max. Höhendifferenz zu Nachbarn) — wie in buildRocks
    const ROCK_SLOPE = 11; // ab hier ist es echter Fels -> keine Piste (steilere Hänge erlaubt)
    const slopeAtRaw = (gx, gy) => {
        const x = Math.max(1, Math.min(gridSize - 2, Math.round(gx)));
        const y = Math.max(1, Math.min(gridSize - 2, Math.round(gy)));
        const hm = world.heightmap, i = y * gridSize + x, z = hm[i];
        return Math.max(Math.abs(z - hm[i - 1]), Math.abs(z - hm[i + 1]), Math.abs(z - hm[i - gridSize]), Math.abs(z - hm[i + gridSize]));
    };
    // kein Wasser (2), kein Fels-Landcover (3) und keine felsig-steile Fläche
    const isBuildableGround = (gx, gy) => { const lc = lcAt(gx, gy); return lc !== 2 && lc !== 3 && slopeAtRaw(gx, gy) < ROCK_SLOPE; };
    // Segment gültig? kein Wasser/Fels, nicht bergauf > 5°
    const segmentValid = (a, b) => {
        const dist = Math.hypot(a.gx - b.gx, a.gy - b.gy);
        if (dist < 0.5) return true;
        const steps = Math.max(1, Math.round(dist));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            if (!isBuildableGround(a.gx + (b.gx - a.gx) * t, a.gy + (b.gy - a.gy) * t)) return false;
        }
        // Höhen (roh) an beiden Enden; a soll höher/gleich sein (bergab)
        const ya = yAtSmooth(a.gx, a.gy) / hScale, yb = yAtSmooth(b.gx, b.gy) / hScale;
        const rise = yb - ya;                 // > 0 = bergauf von a nach b
        const distM = dist * 20;              // 1 Kachel = 20 m
        const angleUp = Math.atan2(Math.max(0, rise), distM) * 180 / Math.PI;
        if (angleUp > 5) return false;        // nicht bergauf > 5°
        return true;
    };
    // Wald entlang der Pisten-Wegpunkte roden (Baum-Instanzen verstecken)
    const clearForestAlongPath = (pts) => {
        if (!forest || !forest.userData.spots) return;
        const dummy = forest.userData.dummy || new THREE.Object3D();
        const rad = 2.6;
        let changed = false;
        for (const sp of forest.userData.spots) {
            if (sp.cut) continue;
            let near = false;
            for (let seg = 0; seg < pts.length - 1 && !near; seg++) {
                const a = pts[seg], b = pts[seg + 1];
                const dist = Math.hypot(a.gx - b.gx, a.gy - b.gy) || 1;
                const steps = Math.max(1, Math.round(dist));
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const cx = a.gx + (b.gx - a.gx) * t, cy = a.gy + (b.gy - a.gy) * t;
                    if (Math.hypot(sp.gx - cx, sp.gy - cy) <= rad) { near = true; break; }
                }
            }
            if (near) {
                dummy.position.set(0, -9999, 0); dummy.scale.set(0.001, 0.001, 0.001); dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                // Baum in der richtigen Instanz-Gruppe entfernen (+ Stamm bei Laubbäumen)
                const meshes = forest.userData.meshes || [forest];
                const target = meshes[sp.meshIdx ?? 0] || forest;
                target.setMatrixAt(sp.index, dummy.matrix);
                target.instanceMatrix.needsUpdate = true;
                if (sp.meshIdx === 2 && forest.userData.trunks) {
                    forest.userData.trunks.setMatrixAt(sp.index, dummy.matrix);
                    forest.userData.trunks.instanceMatrix.needsUpdate = true;
                }
                // Die Schneehaube gehört zum Baum — ohne diesen Schritt bleibt
                // nach der Rodung eine weiße Haube in der Luft hängen.
                if (sp.snowIdx != null && forest.userData.snowInsts) {
                    const si5 = forest.userData.snowInsts[sp.snowMesh ?? sp.meshIdx];
                    if (si5) {
                        si5.setMatrixAt(sp.snowIdx, dummy.matrix);
                        si5.instanceMatrix.needsUpdate = true;
                    }
                }
                sp.cut = true; changed = true;
            }
        }
        if (changed) forest.instanceMatrix.needsUpdate = true;
    };
    // Färbt den Terrain-BODEN entlang der Piste weiß (Schnee) — nicht nur das Band,
    // damit gerodeter Wald-/Wiesenboden nicht grün durchscheint.
    // Sanftes Plateau unter einem neuen Gebäude: innen exakt auf Bauhöhe,
    // nach außen weich auslaufend — so verschwindet nichts halb im Hang.
    /**
     * Liegt eine Kachel auf einer Piste oder unter einer Liftlinie?
     * Der AccessPlanner bekommt das als Sperrfläche: weder Straße noch
     * Parkplatz gehören in eine Abfahrt oder unter eine Bahn.
     */
    const nearPisteOrLift = (gx, gy, r) => {
        const r2 = r * r;
        for (const rt of guestRoutes) {
            if (rt.kind === 'piste' && rt.path) {
                for (const p of rt.path) {
                    const dx2 = p.gx - gx, dy2 = p.gy - gy;
                    if (dx2 * dx2 + dy2 * dy2 < r2) return true;
                }
            } else if (rt.kind === 'lift') {
                const a = rt.bottom, b = rt.top;
                if (!a || !b) continue;
                const vx2 = b.gx - a.gx, vy2 = b.gy - a.gy;
                const L2 = vx2 * vx2 + vy2 * vy2 || 1;
                let t2 = ((gx - a.gx) * vx2 + (gy - a.gy) * vy2) / L2;
                t2 = Math.max(0, Math.min(1, t2));
                const px3 = a.gx + vx2 * t2 - gx, py3 = a.gy + vy2 * t2 - gy;
                if (px3 * px3 + py3 * py3 < r2) return true;
            }
        }
        return false;
    };

    const flattenUnderBuilding = (cgx, cgy, radius, targetY) => {
        const pos = terrain?.geometry?.attributes?.position;
        if (!pos) return;
        const targetH = targetY / hScale;                       // Weltkoordinate -> Heightmap
        // Der voll eingeebnete Kern muss GRÖSSER sein als das Gebäude selbst,
        // sonst drückt das Gelände an den Rändern wieder hoch und das Haus
        // sieht aus, als stecke es im Schnee.
        const inner = radius * 1.2, outer = radius * 2.3;
        const gx0 = Math.max(1, Math.floor(cgx - outer)), gx1 = Math.min(gridSize - 2, Math.ceil(cgx + outer));
        const gy0 = Math.max(1, Math.floor(cgy - outer)), gy1 = Math.min(gridSize - 2, Math.ceil(cgy + outer));
        for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
                const d = Math.hypot(gx - cgx, gy - cgy);
                if (d > outer) continue;
                // 1 = voll einebnen (unter dem Haus), 0 = Gelände unverändert
                const w = d <= inner ? 1 : 1 - (d - inner) / (outer - inner);
                const sm = w * w * (3 - 2 * w);                  // weicher Übergang
                const vi = gy * gridSize + gx;
                const h = heightmap[vi];
                const nh = h + (targetH - h) * sm;
                heightmap[vi] = nh;
                pos.setY(vi, nh * hScale);
            }
        }
        pos.needsUpdate = true;
        // Bäume im veränderten Bereich mitziehen — sonst schweben sie.
        if (forest?.userData?.reseat) forest.userData.reseat(cgx, cgy, outer + 2);
        if (glacier?.userData?.reseat) glacier.userData.reseat(cgx, cgy, outer + 2);
        terrain.geometry.computeVertexNormals();
    };
    /**
     * Steilste Abwärtsrichtung (Falllinie) an einer Stelle. Danach richten
     * sich Funpark, Kicker, Halfpipe und Rennstrecke aus — durchfahren wird
     * immer bergab, nie quer zum Hang.
     */
    /**
     * Durchfahrts-Anlagen (Funpark, Kicker, Halfpipe, Rennstrecke) stehen NUR
     * auf EXTRABREITEN Pisten — mittig auf der Pistenachse, in Fahrtrichtung
     * (bergab entlang der Piste, nicht einfach in die Falllinie). Liefert
     * die eingerastete Mitte und die Richtung oder null, wenn hier keine
     * passende Piste liegt bzw. die Anlage nicht mehr hineinpasst.
     */
    let runFailReason = '';                 // warum die letzte Prüfung scheiterte (für den Hinweis)
    function pisteRunAt(gx, gy, len) {
        let best = null, bd = Infinity, anyXW = false;
        for (const rt of guestRoutes) {
            if (rt.kind !== 'piste' || !rt.path) continue;
            // extrabreit: per Breitenkennung — oder (ältere Pisten) per Schneebettbreite
            const isXW = rt.width === 'xwide' || (rt.width == null && (rt.snowW || 0) >= PISTE_WIDTHS.xwide - 0.01);
            if (!isXW) continue;
            anyXW = true;
            // Der Pistenpfad besteht nur aus den geklickten Wegpunkten (oft
            // nur 2). Deshalb NICHT auf den nächsten Wegpunkt springen, sondern
            // den Cursor auf das nächste SEGMENT projizieren — sonst rastet
            // die Anlage immer nur an Anfang/Ende der Piste ein.
            let sAcc = 0;
            for (let i = 0; i < rt.path.length - 1; i++) {
                const a = rt.path[i], b = rt.path[i + 1];
                const ddx = b.gx - a.gx, ddy = b.gy - a.gy, L2 = ddx * ddx + ddy * ddy || 1;
                const t = Math.max(0, Math.min(1, ((gx - a.gx) * ddx + (gy - a.gy) * ddy) / L2));
                const px = a.gx + ddx * t, py = a.gy + ddy * t;
                const d = Math.hypot(px - gx, py - gy);
                if (d < bd) { bd = d; best = { rt, s: sAcc + Math.sqrt(L2) * t }; }
                sAcc += Math.sqrt(L2);
            }
        }
        if (!best) { runFailReason = anyXW ? 'keine extrabreite Piste unter dem Cursor' : 'es gibt noch keine EXTRABREITE Piste — erst eine bauen (Piste → extrabreit)'; return null; }
        const rt = best.rt, path = rt.path;
        if (bd > (rt.snowW || PISTE_WIDTHS.xwide) * 0.9) { runFailReason = 'Cursor liegt neben der extrabreiten Piste (' + bd.toFixed(0) + ' Kacheln)'; return null; }
        // Passt die Anlage der Länge nach noch auf die Piste? (halbe Länge
        // nach oben UND unten muss innerhalb des Pistenverlaufs liegen)
        // Bogenlänge entlang der Piste: die Anlage braucht len/2 + 1 nach
        // oben UND unten. Reicht es an der Cursorstelle nicht, wird die Mitte
        // entlang der Piste verschoben, bis es passt (statt abzulehnen) —
        // so rastet die Anlage ÜBERALL auf der Piste ein, nur nicht darüber hinaus.
        const cum = [0];
        for (let k = 1; k < path.length; k++) cum[k] = cum[k - 1] + Math.hypot(path[k].gx - path[k - 1].gx, path[k].gy - path[k - 1].gy);
        const total = cum[path.length - 1], need = len * 0.5 + 1;
        if (total < need * 2) { runFailReason = 'Piste zu kurz für diese Anlage (' + Math.round(total) + ' von ' + Math.ceil(need * 2) + ' Kacheln)'; return null; }
        const at = (sv) => { let q = 0; while (q < path.length - 2 && cum[q + 1] < sv) q++; const ff = (sv - cum[q]) / Math.max(1e-6, cum[q + 1] - cum[q]); return { gx: path[q].gx + (path[q + 1].gx - path[q].gx) * ff, gy: path[q].gy + (path[q + 1].gy - path[q].gy) * ff }; };
        // ===== PASSENDSTE STELLE =====
        // Eine gerade Anlage kann einer Kurve nicht folgen. Rund um die
        // Cursorstelle wird deshalb die Lage gesucht, an der die Piste über die
        // Anlagenlänge am geradesten UND am ebensten ist (seitliche Abweichung
        // der Pistenachse von der Sekante + Höhenabweichung vom Hang).
        const fitAt = (sm) => {
            const a = at(sm - len * 0.5), b = at(sm + len * 0.5);
            const ddx = b.gx - a.gx, ddy = b.gy - a.gy, L = Math.hypot(ddx, ddy) || 1;
            const ux = ddx / L, uy = ddy / L;
            const ya = yAtSmooth(a.gx, a.gy), yb = yAtSmooth(b.gx, b.gy);
            let lat = 0, vert = 0;
            for (let k = 0; k <= 10; k++) {
                const sv = sm - len * 0.5 + len * k / 10, pq = at(sv);
                lat = Math.max(lat, Math.abs(-(pq.gx - a.gx) * uy + (pq.gy - a.gy) * ux));
                const yp = ya + (yb - ya) * (k / 10);
                vert = Math.max(vert, Math.abs(yAtSmooth(pq.gx, pq.gy) - yp));
            }
            return { score: lat + vert * 0.9, lat, vert, ux, uy, ya, yb };
        };
        const sCur = Math.max(need, Math.min(total - need, best.s));
        // Bereits gebaute Anlagen auf dieser Piste: keine Überlappung (2 Kacheln Luft)
        const clash = (sm) => (rt.runs || []).some(rn => sm + len * 0.5 > rn.s0 - 2 && sm - len * 0.5 < rn.s1 + 2);
        // ===== WO GENAU? =====
        // Grundsatz: die Anlage bleibt DORT, wo der Spieler klickt. Verschoben
        // wird nur, wenn es dort wirklich nicht geht (zu kurvig/uneben oder
        // schon belegt) — dann zur NÄCHSTEN Stelle, an der es geht.
        const tolOK = (rt.snowW || 5.6) * 0.8 + 0.5;          // großzügig: Gelände wird ohnehin modelliert
        const okAt = (sm) => !clash(sm) && fitAt(sm).score <= tolOK;
        let sMid = sCur, best2 = null;
        if (okAt(sCur)) best2 = fitAt(sCur);
        else {
            for (let off = 1; off <= total; off += 1) {
                let any = false;
                for (const sg of [-1, 1]) {
                    const sm = sCur + off * sg;
                    if (sm < need || sm > total - need) continue;
                    any = true;
                    if (okAt(sm)) { sMid = sm; best2 = fitAt(sm); break; }
                }
                if (best2 || !any) break;
            }
        }
        if (!best2) {
            runFailReason = (rt.runs || []).length ? 'kein freier, gerader Abschnitt mehr auf dieser Piste' : 'Piste zu kurvig/uneben für diese Anlage (' + len + ' Kacheln gerade nötig)';
            return null;
        }
        runFailReason = '';
        const c0 = at(sMid);
        let dx = best2.ux, dy = best2.uy;
        if (best2.ya < best2.yb) { dx = -dx; dy = -dy; }               // Sicherheit: immer bergab
        return { gx: c0.gx, gy: c0.gy, dx, dy, rot: Math.atan2(dx, dy), rt, s0: sMid - len * 0.5, s1: sMid + len * 0.5, sMid };
    }
    /**
     * GELÄNDEMODELLIERUNG der Durchfahrts-Anlagen: Höhenänderung (Weltmeter)
     * an der Stelle (u längs −1..1 von oben nach unten, a quer in Kacheln).
     * Die Form entsteht IM Schnee — Pipe-Mulde, Schanzentisch, Wellen —
     * und die Gäste fahren darüber wie über jede andere Stelle der Piste.
     */
    const sm = (x) => smooth01(x);
    const bump = (u, c, w) => { const d = Math.abs(u - c) / w; return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(d * Math.PI); };
    /** Schanzentisch: Anlauf steigt sanft an, Absprungkante, dahinter ein Loch, dann Landung */
    const tableJump = (u, c, h, lenU) => {
        const r = (u - c) / lenU;                  // −1 Anlaufbeginn .. 0 Absprung .. +1 Landung
        if (r < -1 || r > 1.1) return 0;
        if (r <= 0) return h * sm((r + 1) / 1) * (0.55 + 0.45 * sm((r + 1)));   // ansteigend, oben flacher
        if (r < 0.12) return h * (1 - r / 0.12);                                 // Kante
        return -h * 0.25 * bump(r, 0.45, 0.45);                                  // kleine Landemulde
    };
    const SCULPT = {
        halfpipe: (u, a) => {
            // Die Schale (makeHalfpipeShell, Länge 15 = u ±0.75) liegt IN der
            // Mulde. Die Schneedecke wird darunter GROSSZÜGIG entfernt: Das
            // Gelände wird zwischen seinen Stützpunkten linear interpoliert,
            // und eine Gerade liegt bei einer Bogenform immer ÜBER dem Bogen —
            // deshalb nach außen versetztes Profil und 0.8 m Extra-Tiefe,
            // sonst ragt der Schnee durch Boden und Walls der Schale.
            // Profil RELATIV ZUR EBENE der Schale (sculpt.plane): Boden 3.3 unter
            // Deckniveau, Bogen nach außen versetzt und mit Extra-Tiefe, weil das
            // Gelände zwischen den Stützpunkten linear läuft und eine Gerade
            // immer über dem Bogen liegt.
            // Bogen NACH INNEN versetzt (x = |a| − 1.2): die Mulde ist damit
            // breiter als die Schale, das Gelände bleibt unter den Walls; ab der
            // Wall-Oberkante (4.9) liegt es auf Deckniveau (unter dem Deckbrett).
            const A = Math.abs(a);
            if (A >= 4.9) return 0.05;
            const x = Math.max(0, A - 1.2);
            const shellY = x <= 1.4 ? 0 : x >= 4.7 ? 3.3 : 3.3 - Math.sqrt(Math.max(0, 3.3 * 3.3 - (x - 1.4) * (x - 1.4)));
            return (shellY - 3.3) - 0.9 + 0.05;
        },
        kicker: (u, a) => {
            const w = 1 - sm((Math.abs(a) - 1.7) / 1.4);
            return tableJump(u, 0.0, 2.4, 0.8) * w;          // Anlauf ~3 Kacheln, 2.4 m Tisch
        },
        funpark_s: (u, a) => {
            const w = 1 - sm((Math.abs(a) - 1.5) / 1.4);
            return (tableJump(u, -0.1, 1.0, 0.45) + bump(u, 0.7, 0.2) * 0.45) * w;
        },
        funpark: (u, a) => {
            const w = 1 - sm((Math.abs(a) - 1.6) / 1.5);
            return (tableJump(u, -0.45, 1.1, 0.32) + tableJump(u, 0.2, 1.4, 0.32) + bump(u, 0.75, 0.14) * 0.5) * w;
        },
        funpark_l: (u, a) => {
            const w = 1 - sm((Math.abs(a) - 1.8) / 1.6);
            return (tableJump(u, -0.55, 1.1, 0.25) + tableJump(u, -0.05, 1.7, 0.3) + tableJump(u, 0.5, 1.2, 0.25) + bump(u, 0.85, 0.1) * 0.4) * w;
        },
        racecourse: (u, a) => 0                    // Rennstrecke: Piste bleibt, nur Tore
    };
    // Halfpipe: Mulde eisig-blau (je tiefer, desto kräftiger), Deckkante als
    // blaue Linie; Kicker/Funpark: Tisch und Landung leicht angeblaut
    SCULPT.halfpipe.plane = true;
    SCULPT.halfpipe.tint = (u, a, dh) => {
        if (Math.abs(u) > 0.9) return 0;
        const lip = Math.abs(Math.abs(a) - 4.9) < 0.6 ? 2.9 : 0;
        // Boden der Mulde bleibt Schnee (kein Blau); nur die Walls werden
        // nach oben hin eisig — der sichtbare Streifen zwischen Schale und Deck
        const x = Math.abs(a);
        const wall = x < 2.2 ? 0 : Math.min(1, (x - 2.2) / 2.2);
        return Math.max(lip, wall * 0.55);
    };
    for (const k of ['kicker', 'funpark_s', 'funpark', 'funpark_l']) SCULPT[k].tint = (u, a, dh) => Math.min(0.6, Math.abs(dh) * 0.5);
    function fallLineAt(cgx, cgy, len) {
        const R = Math.max(3, len * 0.5);
        let best = null, bestDrop = -1e9;
        for (let a = 0; a < 24; a++) {
            const ang = (a / 24) * Math.PI * 2;
            const dx = Math.sin(ang), dy = Math.cos(ang);
            const hi = yAtSmooth(cgx - dx * R, cgy - dy * R);
            const lo = yAtSmooth(cgx + dx * R, cgy + dy * R);
            const drop = hi - lo;                       // je größer, desto steiler bergab
            if (drop > bestDrop) { bestDrop = drop; best = { rot: ang, dx, dy }; }
        }
        return best || { rot: 0, dx: 0, dy: 1 };
    }
    /**
     * Ebnet einen Streifen entlang der Falllinie zu einer glatten, geneigten
     * Rinne — so liegt die Anlage IM Hang statt darauf. Gibt Mittelhöhe und
     * Neigungswinkel zurück, damit das Modell passend gekippt werden kann.
     */
    function flattenRunStrip(cgx, cgy, fall, len, width, sculpt = null) {
        const pos = terrain.geometry.attributes.position;
        const halfLen = len * 0.5, halfW = Math.max(2.5, width * 0.85);
        const topY = yAtSmooth(cgx - fall.dx * halfLen, cgy - fall.dy * halfLen);
        const botY = yAtSmooth(cgx + fall.dx * halfLen, cgy + fall.dy * halfLen);
        // Lage der Anlage: Nicken aus oben/unten, Wanken aus links/rechts —
        // die Anlage folgt dem Hang, das Gelände bleibt, wie es ist.
        const px = -fall.dy, py = fall.dx;
        const lY = yAtSmooth(cgx + px * halfW * 0.6, cgy + py * halfW * 0.6);
        const rY = yAtSmooth(cgx - px * halfW * 0.6, cgy - py * halfW * 0.6);
        const midY = (topY + botY + lY + rY) * 0.25;
        const pitch = Math.atan2(topY - botY, len * tile);
        const roll = Math.atan2(lY - rY, halfW * 1.2 * tile);
        // KEIN Einebnen mehr (der Streifen wurde vorher zur Ebene gezogen —
        // das sah wie ein planierter Platz aus). Nur die Halfpipe bekommt ihre
        // Mulde, und zwar RELATIV zum vorhandenen Gelände.
        if (!sculpt) return { midY, pitch, roll };
        // Ebenen-Anlagen (Halfpipe) bekommen lange, sanfte Ein-/Ausfahrtsrampen:
        // der Aushub reicht über die Anlagenlänge hinaus und läuft flach aus.
        const ext = sculpt.plane ? halfLen * 0.4 : 0;
        const rad = Math.ceil(Math.max(halfLen + ext, halfW)) + 3;
        const x0 = Math.max(1, Math.floor(cgx - rad)), x1 = Math.min(gridSize - 2, Math.ceil(cgx + rad));
        const y0 = Math.max(1, Math.floor(cgy - rad)), y1 = Math.min(gridSize - 2, Math.ceil(cgy + rad));
        const changed = [];                                   // [vi, alteHöhe] — für den Abriss
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
            const rx = gx - cgx, ry = gy - cgy;
            const along = rx * fall.dx + ry * fall.dy;          // längs zur Falllinie
            const across = -rx * fall.dy + ry * fall.dx;        // quer dazu
            if (Math.abs(along) > halfLen + ext || Math.abs(across) > halfW + 3) continue;
            const dh = sculpt(Math.max(-1, Math.min(1, along / halfLen)), across);
            const vi = gy * gridSize + gx;
            // Einfärbung: Mulde/Tisch eisig (nach Tiefe/Höhe), Deckkante als blaue Linie
            if (sculpt.tint) { const tv = sculpt.tint(along / halfLen, across, dh); if (tv > RUN_TINT[vi]) RUN_TINT[vi] = tv; }
            const h = heightmap[vi];
            let nh;
            if (sculpt.plane) {
                // ===== BAUWERK AUF EBENE (Halfpipe) =====
                // Die Schale ist ein starres, ebenes Bauteil. Das Gelände wird
                // deshalb im Grundriss auf DIESE Ebene + Profil gesetzt (gesenkt
                // ODER angehoben) — nicht relativ zum welligen Hang, sonst ragt
                // an einer Kuppe der Schnee mitten durch Boden und Walls.
                const planeY = midY - Math.tan(pitch) * along * tile + Math.tan(roll) * across * tile;
                const target = (planeY + dh) / hScale;
                const wA = 1 - smooth01((Math.abs(across) - 5.9) / 1.8);
                // Rampe: volle Tiefe bis zum Schalenende (0.75·hl), dann über
                // ~0.6·hl (Halfpipe: 6 Kacheln → ca. 19°) auf Pistenniveau
                const wL = 1 - smooth01((Math.abs(along) - halfLen * 0.72) / (halfLen * 0.78));
                const w = Math.max(0, Math.min(1, wA * wL));
                if (w <= 0.01) continue;
                nh = h + (target - h) * w;
            } else {
                // Form relativ zur vorhandenen Höhe (u = −1 oben .. +1 unten)
                if (Math.abs(dh) < 0.01) continue;
                nh = h + dh / hScale;
            }
            changed.push(vi, h);
            heightmap[vi] = nh;
            pos.setY(vi, nh * hScale);
        }
        pos.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        // auch hier die Bäume auf die neue Geländehöhe nachsetzen
        if (forest?.userData?.reseat) forest.userData.reseat(cgx, cgy, Math.max(len, width) + 4);
        // Gletschereis liegt als eigenes Mesh auf dem Gelände — mitziehen, sonst
        // deckt es die Mulde wie eine alte Schneedecke zu.
        if (glacier?.userData?.reseat) glacier.userData.reseat(cgx, cgy, Math.max(len, width) + 6);
        if (sculpt.tint) repaintSnowCover();                 // Einfärbung sofort sichtbar
        return { midY, pitch, roll, changed, rad };
    }
    /** Geländeänderung einer Anlage rückgängig machen (Abriss). */
    function restoreRunStrip(cgx, cgy, strip) {
        if (!strip?.changed?.length) return;
        const pos = terrain.geometry.attributes.position;
        for (let k = 0; k < strip.changed.length; k += 2) {
            const vi = strip.changed[k], h = strip.changed[k + 1];
            heightmap[vi] = h; pos.setY(vi, h * hScale); RUN_TINT[vi] = 0;
        }
        pos.needsUpdate = true;
        terrain.geometry.computeVertexNormals();
        const r = (strip.rad || 16) + 4;
        if (forest?.userData?.reseat) forest.userData.reseat(cgx, cgy, r);
        if (glacier?.userData?.reseat) glacier.userData.reseat(cgx, cgy, r);
        repaintSnowCover();
    }

    // ===== SCHNEEDECKE, WETTER & TAUWETTER =====
    // Die Schneegrenze ist NICHT fix: sie wandert mit dem Wetter. Bei starkem
    // Schneefall sinkt sie bis ins Tal (alles weiß), in Warmphasen steigt sie
    // weit den Berg hinauf und legt die Wiesen frei. Kunstschnee aus den
    // Kanonen hält sich auch unterhalb der Grenze — bis er wegtaut.
    // (SNOW_BASE / _snowLine / cannons / CANNON_ARC sind oben deklariert)
    function snowLineY() { return _maxH * weather.snowLine; }
    /** 0..1 mit weichem Ein-/Ausblenden (smoothstep) — für sanfte Ränder. */
    function smooth01(x) {
        const v = Math.max(0, Math.min(1, x));
        return v * v * (3 - 2 * v);
    }
    const rollPhase = () => {
        const total = WEATHER_PHASES.reduce((s, p) => s + p.w, 0);
        let r = Math.random() * total;
        for (const q of WEATHER_PHASES) { r -= q.w; if (r <= 0) return q; }
        return WEATHER_PHASES[0];
    };
    /** Nächste Phase übernehmen und gleich die übernächste vorhersagen. */
    const pickWeather = () => {
        const p = weather.next || rollPhase();
        weather.phase = p;
        weather.next = rollPhase();                   // das ist die Vorhersage im HUD
        // Ziel-Schneegrenze, nach oben auf den Gipfel begrenzt
        weather.target = Math.min(0.92, SNOWLINE_NORM * p.line);
        weather.targetFall = p.snowfall;
        weather.timer = 45 + Math.random() * 60;      // Phase hält 45–105 s
    };
    // Wetter fortschreiben; gibt true zurück, wenn sich die Schneegrenze
    // spürbar verschoben hat und das Terrain neu eingefärbt werden muss.
    function updateWeather(dt) {
        weather.timer -= dt;
        if (weather.timer <= 0) pickWeather();
        // weiche Annäherung, damit der Schnee nicht springt. Absinken (es
        // schneit zu) geht schneller als Ansteigen (Tauen braucht länger).
        const falling = weather.target < weather.snowLine;
        weather.snowLine += (weather.target - weather.snowLine) * Math.min(1, dt * (falling ? 0.16 : 0.06));
        weather.snowfall += (weather.targetFall - weather.snowfall) * Math.min(1, dt * 0.35);
        // Schnee auf den Baumkronen: baut sich beim Schneien auf und rutscht
        // in Warmphasen langsam wieder ab.
        // Die Schneelast auf den Kronen folgt dem SCHNEEFALL: leichtes Rieseln
        // zuckert an, starker Schneefall packt voll zu. Hört es auf zu
        // schneien (oder kommt der Föhn), taut die Last über die langsame
        // Abwärts-Annäherung unten von selbst wieder ab.
        const loadTarget = smooth01((weather.snowfall - 0.05) / 0.75);
        weather.treeLoad += (loadTarget - weather.treeLoad) * Math.min(1, dt * (loadTarget > weather.treeLoad ? 0.22 : 0.05));
        if (forest?.userData?.setSnowLoad) forest.userData.setSnowLoad(weather.treeLoad);
        // Der Wald im Umland zieht mit, sonst stünde hinter der Kante ein dunkler Wald neben einem verschneiten.
        if (apronForest?.userData?.setSnow) apronForest.userData.setSnow(weather.treeLoad);
        // Felsen bekommen nur einen Hauch Schnee — halb so viel wie die Bäume.
        if (rocks?.userData?.setSnow) rocks.userData.setSnow(weather.treeLoad * 0.5);
        _snowLine = snowLineY();
        return Math.abs(weather.snowLine - _lastPaintedLine) > 0.003;
    }
    /**
     * Ein Durchgang über das Gitter, der beides erledigt:
     *  - Neuschnee legt sich hin und bleibt liegen (bei genug Schneefall)
     *  - Kunst-/Neuschnee taut unterhalb der Schneegrenze wieder weg,
     *    je tiefer die Lage, desto schneller.
     * Zusammengelegt, weil zwei getrennte Läufe über 140.000 Kacheln die
     * Bildrate merklich kosten.
     */
    function stepSnowCover(dt) {
        const f = weather.snowfall;
        const add = f >= 0.22 ? dt * 0.075 * f : 0;
        const rate = dt * 0.025;
        const limit = snowLineY();
        const warmSpan = Math.max(1, limit * 0.6);
        const n = gridSize * gridSize;
        for (let vi = 0; vi < n; vi++) {
            const lc = world.landcover[vi];
            if (lc === 2) continue;                       // auf Wasser bleibt nichts liegen
            let s = SNOW_BASE[vi];
            if (add > 0 && s < 1) s = Math.min(1, s + add);
            if (s > 0) {
                const h = heightmap[vi] || 0;
                if (h < limit) {                          // unterhalb der Grenze taut es
                    const warmth = Math.min(1, (limit - h) / warmSpan);
                    s = Math.max(0, s - rate * (0.25 + warmth));
                }
            }
            SNOW_BASE[vi] = s;
        }
    }
    // Beschneiung anwenden: alle Kanonen mit Wasser machen ihren Sektor weiß
    function applySnowmaking() {
        if (!cannons.length) return;
        const col = terrain?.geometry?.attributes?.color;
        if (!col) return;
        // Ohne Stausee läuft die Kanone nur im Notbetrieb (kurze Reichweite),
        // mit genug Wasser erreicht sie ihre volle Wurfweite.
        const power = cannonPower();
        const snow = [0.93, 0.95, 0.98];
        let changed = false;
        for (const c of cannons) {
            // Die Kanone bläst entlang ihrer lokalen +X-Achse (so steht das Modell).
            // Bei rotation.y = rot zeigt +X im Weltraum auf (cos rot, -sin rot).
            const dirX = Math.cos(c.rot), dirY = -Math.sin(c.rot);
            const R = c.range * power;
            const x0 = Math.max(0, Math.floor(c.gx - R)), x1 = Math.min(gridSize - 1, Math.ceil(c.gx + R));
            const y0 = Math.max(0, Math.floor(c.gy - R)), y1 = Math.min(gridSize - 1, Math.ceil(c.gy + R));
            for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
                const dx = gx - c.gx, dy = gy - c.gy;
                const dist = Math.hypot(dx, dy);
                if (dist > R || dist < 0.5) continue;
                // nur im Strahlkegel (Richtung + Öffnungswinkel)
                const dot = (dx / dist) * dirX + (dy / dist) * dirY;
                const cosHalf = Math.cos(CANNON_ARC / 2);
                if (dot < cosHalf) continue;
                const vi = gy * gridSize + gx;
                if (lcAt(gx, gy) === 2) continue;                    // kein Schnee auf Wasser
                // WEICHER RAND: zum Rand des Kegels und zur maximalen Wurfweite
                // hin nimmt die Schneemenge ab, statt hart abzubrechen.
                const fRad = smooth01((R - dist) / (R * 0.32));
                const fArc = smooth01((dot - cosHalf) / ((1 - cosHalf) * 0.45));
                const cover = Math.min(1, fRad * fArc);
                if (cover <= 0.02) continue;
                if (cover > SNOW_BASE[vi]) SNOW_BASE[vi] = cover;
                const grain = (((vi * 374761393) >>> 24 & 15) - 7.5) / 255;
                col.setXYZ(vi, snow[0] + grain, snow[1] + grain, snow[2] + grain);
                changed = true;
            }
        }
        if (changed) col.needsUpdate = true;
    }
    // Originalfarben des Terrains sichern. Nur so lässt sich der Boden beim
    // Wetterwechsel wieder korrekt aufhellen — sonst würde das Grün mit jedem
    // Durchgang nachdunkeln, weil man auf schon eingefärbte Werte rechnet.
    const COL0 = terrain.geometry.attributes.color.array.slice();
    // Einfärbung modellierter Anlagen (0..1): Pipe-Mulde eisig-blau, Deckkante blau —
    // sonst ist eine weiße Mulde im weißen Schnee praktisch unsichtbar.
    const RUN_TINT = new Float32Array(gridSize * gridSize);
    /**
     * Malt die komplette Schneedecke neu: oberhalb der aktuellen Schneegrenze
     * (und überall mit Kunstschnee) Originalfarbe/Weiß, darunter Wiesengrün.
     * Läuft nur alle paar Sekunden, weil sie über das ganze Gitter geht.
     */
    function repaintSnowCover() {
        const col = terrain?.geometry?.attributes?.color;
        if (!col) return;
        const arr = col.array;
        const limit = snowLineY();
        _lastPaintedLine = weather.snowLine;
        // Umland mitziehen: dieselbe Schneegrenze, damit Karte und Schürze
        // immer denselben Winterstand zeigen.
        // Übergangsband um die Schneegrenze: kein harter Schnitt, sondern ein
        // Streifen, in dem der Boden von grün nach weiß überblendet.
        const band = Math.max(1, limit * 0.30);
        if (apronForest?.userData?.setSnowLine) apronForest.userData.setSnowLine(limit * hScale, band * hScale);
        for (let vi = 0; vi < gridSize * gridSize; vi++) {
            const lc = world.landcover[vi];
            if (lc === 2 || lc === 3) continue;            // Wasser/Fels bleiben, wie sie sind
            const i3 = vi * 3;
            const h = heightmap[vi] || 0;
            // 1) Naturschnee: weich über die Schneegrenze eingeblendet.
            //
            // FEINGRANULARER ÜBERGANG: Ein reiner Höhenverlauf lässt das Grün
            // als geschlossene Front zurückweichen. In Wirklichkeit bleibt
            // Schnee fleckig liegen — in Mulden und Schattenlagen länger, auf
            // Rippen und Südhängen kürzer. Ein feines Rauschfeld verschiebt
            // deshalb die wirksame Grenze je Punkt um ein Stück.
            const gx0 = vi % gridSize, gy0 = (vi / gridSize) | 0;
            // GETEILTE Formel (TerrainMesh.snowLayer) — die Schürze rechnet
            // mit exakt derselben, deshalb taut das Umland identisch.
            const sl = snowLayer(h, limit, gx0, gy0);
            const nat = lc === 8 ? 1 : sl.nat;
            // 2) Wie grün wäre es hier ohne Schnee? (tiefer = satter)
            const gf = sl.gf;
            const gr = COL0[i3]     + (0.30 - COL0[i3])     * gf;
            const gg = COL0[i3 + 1] + (0.42 - COL0[i3 + 1]) * gf;
            const gb = COL0[i3 + 2] + (0.22 - COL0[i3 + 2]) * gf;
            // 3) grün -> Naturschnee überblenden
            let r = gr + (COL0[i3]     - gr) * nat;
            let g = gg + (COL0[i3 + 1] - gg) * nat;
            let b = gb + (COL0[i3 + 2] - gb) * nat;
            // 3b) WIE der Schnee liegt: Verwehungen und Hangschattierung.
            // Wo viel Schnee liegt, zeichnet ein weiches Wellenfeld flache
            // Wächten und Windrippen; Nordhänge bleiben eine Spur kühler,
            // Sonnenhänge heller. Das gibt der weißen Fläche Struktur,
            // statt sie als gleichförmiges Weiß stehen zu lassen.
            if (nat > 0.15) {
                const drift = Math.sin(gx0 * 0.19 + Math.cos(gy0 * 0.13) * 1.7) * 0.5
                            + Math.sin(gy0 * 0.26 + Math.sin(gx0 * 0.11) * 1.3) * 0.5;
                const dv = drift * 0.030 * nat;
                // Hangrichtung: Gefälle nach Süden = heller, nach Norden = kühler
                const hN = heightmap[Math.max(0, vi - gridSize)] || h;
                const hS = heightmap[Math.min(gridSize * gridSize - 1, vi + gridSize)] || h;
                const aspect = Math.max(-1, Math.min(1, (hN - hS) / 12));
                const av = aspect * 0.022 * nat;
                r += dv + av * 1.0;
                g += dv + av * 0.85;
                b += dv * 0.7 + av * 0.55;
            }
            // 4) Kunstschnee obendrauf, ebenfalls weich (weicher Kegelrand)
            const art = SNOW_BASE[vi];
            if (art > 0.01) {
                const grain = (((vi * 374761393) >>> 24 & 15) - 7.5) / 255;
                const a = smooth01(art);
                r += (0.93 + grain - r) * a;
                g += (0.95 + grain - g) * a;
                b += (0.98 + grain - b) * a;
            }
            // 5) Anlagen-Einfärbung: Pipe/Schanzen eisig, Deckkante blau
            const rtn = RUN_TINT[vi];
            if (rtn > 0.01) {
                if (rtn >= 2) {                                   // Kantenlinie (Marker 2+)
                    const k = Math.min(1, rtn - 2);
                    r += (0.18 - r) * k; g += (0.45 - g) * k; b += (0.92 - b) * k;
                } else {
                    r += (0.80 - r) * rtn; g += (0.89 - g) * rtn; b += (0.97 - b) * rtn;
                }
            }
            // Drift- und Hangschattierung können knapp über 1 laufen — hier
            // sauber begrenzen, sonst kippen die Farben.
            arr[i3]     = r < 0 ? 0 : r > 1 ? 1 : r;
            arr[i3 + 1] = g < 0 ? 0 : g > 1 ? 1 : g;
            arr[i3 + 2] = b < 0 ? 0 : b > 1 ? 1 : b;
        }
        col.needsUpdate = true;
        // Umland mitziehen – NACH dem Spielfeld, denn die Schürze übernimmt an der Kante
        // dessen frisch gemalte Farben (nahtloser Übergang statt sichtbarem Kartenrand).
        if (apron?.userData?.setSnowLine) apron.userData.setSnowLine(limit * hScale, arr);
        repaintPisteBeds();
        repaintBuildingPads();
    }
    /**
     * Vorplätze der Gebäude einfärben. Liegt Schnee, sind sie hell; ist der
     * Boden getaut, werden sie zu einem gräulich-erdigen Platz — sonst bliebe
     * mitten auf der grünen Wiese eine weiße Scheibe stehen.
     */
    function repaintBuildingPads() {
        for (const pd of buildingPads) {
            const x = Math.max(0, Math.min(gridSize - 1, Math.round(pd.gx)));
            const y = Math.max(0, Math.min(gridSize - 1, Math.round(pd.gy)));
            const cov = smooth01(snowCoverAt(y * gridSize + x));
            // aper: heller Kies-/Erdton, verschneit: fast weiß
            pd.mat.color.setRGB(
                0.55 + (0.93 - 0.55) * cov,
                0.54 + (0.95 - 0.54) * cov,
                0.50 + (0.98 - 0.50) * cov);
        }
    }
    /**
     * Schneebetten der gebauten Pisten an den Schneezustand angleichen. Weiß,
     * solange Schnee liegt; grün, wo die Piste ausgeapert ist. Der Gast muss
     * dort ohnehin laufen — jetzt sieht man auch, warum.
     */
    /**
     * Verschleiß-Geometrie an ein Pistenbett hängen: Schneehaufen und
     * Dreckflecken mit eigener Schwelle, die mit dem Abschnitts-Verschleiß
     * wachsen und hinter der Walze wieder verschwinden. Funktioniert für
     * gebaute Pisten UND die Startabfahrt (die hat kein Band-Mesh).
     */
    function attachWearFx(bedRec, pts, widthTiles) {
        const nPairs = bedRec.groom.length;
        const mounds = [], muds = [];
        let trav = 0;
        for (let seg = 0; seg < pts.length - 1; seg++) {
            const a4 = pts[seg], b4 = pts[seg + 1];
            const segL = Math.hypot(b4.gx - a4.gx, b4.gy - a4.gy) || 0.001;
            const px4 = -(b4.gy - a4.gy) / segL, py4 = (b4.gx - a4.gx) / segL;
            trav += segL;
            // Deutlich DICHTER als vorher: viele kleine Buckel statt weniger
            // grober Klumpen. Pro Stelle streuen drei Punkte quer zur Piste.
            if (trav > 0.85) {
                trav = 0;
                for (let k4 = 0; k4 < 3; k4++) {
                    const h4 = ((seg * 2654435761 + k4 * 40503) >>> 7) & 4095;
                    const lat = (((h4 & 255) / 255) - 0.5) * widthTiles * 1.7;
                    const jitter = (((h4 >> 8) & 15) / 15 - 0.5) * 0.8;
                    const gx4 = a4.gx + px4 * lat + (b4.gx - a4.gx) / segL * jitter;
                    const gy4 = a4.gy + py4 * lat + (b4.gy - a4.gy) / segL * jitter;
                    const rec4 = { gx: gx4, gy: gy4,
                        segIdx: Math.min(nPairs - 1, Math.round(seg / (pts.length - 1) * (nPairs - 1))),
                        thr: 0.1 + ((h4 >> 4) & 15) / 15 * 0.62,   // breit gestreute Schwellen
                        rot: h4 * 0.11,
                        size: 0.5 + ((h4 >> 9) & 7) / 7 * 0.75,    // stark variierende Größe
                        gi: 0 };
                    rec4.gi = Math.max(0, Math.min(gridSize - 1, Math.round(gy4))) * gridSize
                            + Math.max(0, Math.min(gridSize - 1, Math.round(gx4)));
                    mounds.push(rec4);
                    // Jede vierte Stelle ist zusätzlich ein Matsch-Kandidat —
                    // sichtbar wird sie aber nur, wo KEIN Schnee liegt.
                    if ((h4 & 3) === 0) muds.push({ ...rec4, size: rec4.size * 0.9 });
                }
            }
        }
        // Kleine, flache Schneebuckel — bewusst zart, sie sollen die Piste
        // texturieren und nicht als Findlinge herumliegen.
        const moundGeo = new THREE.SphereGeometry(0.2, 6, 4);
        moundGeo.scale(1, 0.3, 1.5);
        const moundInst = new THREE.InstancedMesh(moundGeo,
            new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.95 }),
            Math.max(1, mounds.length));
        // Matsch: flache braune Lachen auf aperem Grund
        const mudGeo = new THREE.SphereGeometry(0.26, 7, 4);
        mudGeo.scale(1.3, 0.1, 1.1);
        const mudInst = new THREE.InstancedMesh(mudGeo,
            new THREE.MeshStandardMaterial({ color: 0x6b5b45, roughness: 1 }),
            Math.max(1, muds.length));
        const zero = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
        for (let k = 0; k < moundInst.count; k++) moundInst.setMatrixAt(k, zero);
        for (let k = 0; k < mudInst.count; k++) mudInst.setMatrixAt(k, zero);
        scene.add(moundInst); scene.add(mudInst);
        bedRec.wearFx = [
            { inst: moundInst, list: mounds, maxS: 1.0, needSnow: true },
            { inst: mudInst, list: muds, maxS: 1.0, needSnow: false }
        ];
    }
    function repaintPisteBeds() {
        for (const bed of pisteBeds) {
            // Die Startabfahrt hat KEIN Band-Mesh — dort gibt es nur die
            // Verschleiß-Geometrie weiter unten.
            const ca = bed.geo ? bed.geo.attributes.color : null;
            if (ca) {
            const arr = ca.array, grid = bed.grid;
            for (let i = 0, gi = 0; i < arr.length; i += 3, gi += 2) {
                const gx = Math.max(0, Math.min(gridSize - 1, Math.round(grid[gi])));
                const gy = Math.max(0, Math.min(gridSize - 1, Math.round(grid[gi + 1])));
                const cov = smooth01(snowCoverAt(gy * gridSize + gx));
                // Lokaler Pistenzustand: frisch gewalzt strahlt, verspurt wird
                // stumpf und leicht gräulich — direkt hinter der Raupe sieht
                // der Abschnitt deshalb sofort wieder gut aus.
                const q = bed.groom ? bed.groom[gi >> 1] : 1;
                // DEUTLICH sichtbarer Verschleiß: frisch gewalzt = strahlend
                // weiß, verspurt = blaugrau schattiert (wie zerfahrener Schnee
                // am Nachmittag). Hinter der Walze springt der Abschnitt
                // sichtbar zurück auf Weiß.
                const wr = 0.60 + 0.40 * q;                 // Rot fällt am stärksten
                const wg = 0.65 + 0.35 * q;
                const wb = 0.76 + 0.24 * q;                 // Blau bleibt -> kühler Schatten
                arr[i]     = (0.34 + (1 - 0.34) * cov) * wr;
                arr[i + 1] = (0.46 + (1 - 0.46) * cov) * wg;
                arr[i + 2] = (0.24 + (1 - 0.24) * cov) * wb;
            }
            ca.needsUpdate = true;
            }
            // Buckel/Dreck: wachsen mit dem Verschleiß, verschwinden hinter
            // der Walze (groom springt auf 1 -> Skalierung auf 0).
            if (bed.wearFx) {
                for (const fx of bed.wearFx) {
                    for (let k = 0; k < fx.list.length; k++) {
                        const rec4 = fx.list[k];
                        const wear = 1 - (bed.groom ? bed.groom[rec4.segIdx] : 1);
                        // Schneebuckel nur auf Schnee, Matsch nur auf aperem
                        // Grund — auf der Wiese bilden sich keine Schneehügel.
                        const cov4 = snowCoverAt(rec4.gi);
                        const gate = fx.needSnow ? smooth01((cov4 - 0.35) / 0.3)
                                                 : smooth01((0.45 - cov4) / 0.3);
                        // Matsch verschwindet beim Walzen nicht, er verteilt
                        // sich nur — daher bleibt ein Sockel stehen.
                        const wr2 = fx.needSnow ? wear : Math.max(wear, 0.35);
                        const sc = Math.max(0.001,
                            smooth01((wr2 - rec4.thr) / 0.3) * fx.maxS * rec4.size * gate);
                        const wp4 = worldPosSmooth(rec4.gx, rec4.gy);
                        _fxV.set(wp4.x, wp4.y + 0.03, wp4.z);
                        _fxQ.setFromAxisAngle(_fxUp, rec4.rot);
                        _fxS.set(sc, sc, sc);
                        _fxM.compose(_fxV, _fxQ, _fxS);
                        fx.inst.setMatrixAt(k, _fxM);
                    }
                    fx.inst.instanceMatrix.needsUpdate = true;
                }
            }
        }
    }
    // Wiederverwendete Rechenobjekte für die Verschleiß-Geometrie
    const _fxM = new THREE.Matrix4(), _fxQ = new THREE.Quaternion();
    const _fxV = new THREE.Vector3(), _fxS = new THREE.Vector3();
    const _fxUp = new THREE.Vector3(0, 1, 0);
    // Auch die STARTABFAHRT verschleißt: sie bekommt ein eigenes Zustands-
    // Array samt Haufen/Dreck — ohne das sah die meistbefahrene Piste des
    // Spiels immer gleich aus, egal wie viele Gäste durch waren.
    for (const rt of guestRoutes) {
        if (rt.kind !== 'piste' || !rt.path || rt.bed) continue;
        const bedRec = { geo: null, grid: null,
            groom: new Float32Array(Math.max(4, rt.path.length)).fill(1) };
        attachWearFx(bedRec, rt.path, 3.2);
        rt.bed = bedRec;
        pisteBeds.push(bedRec);
    }

    /**
     * ORTSCHAFTEN PLATZIEREN.
     *
     * Läuft bewusst SPÄT, weil flattenUnderBuilding/place erst hier verfügbar
     * sind — nur so lassen sich Ortsplatz und Parkplatz sauber ins Gelände
     * einebnen statt schief im Hang zu hängen.
     *
     * Die Orte liegen in verschiedenen ECKEN der Karte, damit sie weit
     * auseinanderliegen und jeder ein eigenes Einzugsgebiet hat.
     */
    function placeVillages() {
        const lvlIdx = level?.index ?? 0;
        const nVill = lvlIdx === 0 ? 1 : lvlIdx >= 6 ? 3 : 2;
        const style = VSTYLE[level?.id] || 'alpin';
        const names = (VNAMES[level?.id] || VNAMES.alpen).slice();

        // --- Kandidaten: die vier Kartenecken, nach Eignung bewertet ---
        const M = 34;
        const CORNERS = [
            { gx: M, gy: M }, { gx: gridSize - 1 - M, gy: M },
            { gx: gridSize - 1 - M, gy: gridSize - 1 - M }, { gx: M, gy: gridSize - 1 - M }
        ];
        /** Sucht nahe einem Zielpunkt die flachste, tiefste bebaubare Stelle. */
        const bestNear = (cx, cy, radius) => {
            let best = null;
            for (let gy = Math.max(M, cy - radius); gy <= Math.min(gridSize - 1 - M, cy + radius); gy += 4) {
                for (let gx = Math.max(M, cx - radius); gx <= Math.min(gridSize - 1 - M, cx + radius); gx += 4) {
                    const idx = gy * gridSize + gx;
                    const lc2 = world.landcover[idx];
                    if (lc2 === 2 || lc2 === 3 || lc2 === 8) continue;    // Wasser/Fels/Eis
                    // auch die Umgebung muss trocken sein — ein Ort am
                    // Seeufer hätte sonst Häuser im Wasser stehen
                    let wet = false;
                    for (let dy = -8; dy <= 8 && !wet; dy += 4)
                        for (let dx = -8; dx <= 8; dx += 4) {
                            const ni = (gy + dy) * gridSize + (gx + dx);
                            if (world.landcover[ni] === 2) { wet = true; break; }
                        }
                    if (wet) continue;
                    const h0 = heightmap[idx];
                    let span2 = 0;
                    for (let dy = -6; dy <= 6; dy += 3)
                        for (let dx = -6; dx <= 6; dx += 3) {
                            const hh = heightmap[(gy + dy) * gridSize + (gx + dx)];
                            span2 = Math.max(span2, Math.abs(hh - h0));
                        }
                    if (span2 > 11) continue;                              // zu steil
                    // Bewertung: flach und tief gelegen ist gut, Nähe zur Ecke auch
                    const score = span2 * 2 + h0 * 0.15 + Math.hypot(gx - cx, gy - cy) * 0.35;
                    if (!best || score < best.score) best = { gx, gy, score };
                }
            }
            return best;
        };

        const spots = [];

        // --- HAUPTORT: neben der Talstation, aber NICHT darauf ---
        // Er muss zu Fuß erreichbar bleiben (sonst kämen die Startgäste nie
        // zum Lift), liegt aber quer zur Liftachse versetzt, damit der Lift
        // nicht mitten im Dorf beginnt.
        {
            const axX = RSX - RVX, axY = RSY - RVY;
            const axL = Math.hypot(axX, axY) || 1;
            const px2 = -axY / axL, py2 = axX / axL;
            let main = null;
            for (const side of [1, -1]) {
                for (const dist of [17, 20, 14, 23]) {
                    const cx = RVX + px2 * side * dist - (axX / axL) * 6;
                    const cy = RVY + py2 * side * dist - (axY / axL) * 6;
                    const f = bestNear(Math.round(cx), Math.round(cy), 10);
                    if (f && Math.hypot(f.gx - RVX, f.gy - RVY) > 12) { main = f; break; }
                }
                if (main) break;
            }
            spots.push(main || { gx: RVX, gy: Math.min(gridSize - M, RVY + 18) });
        }

        // --- NEBENORTE: in den ENTFERNTESTEN Ecken, weit weg vom Hauptort ---
        if (nVill > 1) {
            const far = CORNERS.map((c, i) => ({ i, c,
                d: Math.hypot(c.gx - spots[0].gx, c.gy - spots[0].gy) }));
            far.sort((a, b) => b.d - a.d);                 // entfernteste Ecke zuerst
            for (const { c } of far) {
                if (spots.length >= nVill) break;
                const f = bestNear(c.gx, c.gy, 30);
                if (!f) continue;
                if (spots.some(sp => Math.hypot(sp.gx - f.gx, sp.gy - f.gy) < 95)) continue;
                spots.push(f);
            }
        }

        spots.forEach((sp, i) => {
            const vname = names[i % names.length];
            // Jeder Ort ist anders: Größe und Ausrichtung variieren.
            // ===== ORTSGRÖSSE WÜRFELN =====
            // Der Hauptort ist der größte, die Nebenorte streuen deutlich —
            // vom Weiler mit fünf Höfen bis zum ausgewachsenen Bergdorf.
            // Der Seed ist ortsspezifisch, damit dieselbe Karte reproduzierbar
            // bleibt, die Orte untereinander sich aber klar unterscheiden.
            let vseed = ((i + 1) * 2246822519 + gridSize * 374761393) >>> 0;
            const vrand = () => { vseed = (vseed * 1664525 + 1013904223) >>> 0; return vseed / 4294967296; };
            const wish = i === 0 ? 2.4 + vrand() * 1.0        // Hauptort: gross
                       : 0.7 + vrand() * vrand() * 2.6;       // Nebenorte: meist klein
            const v = makeVillage({ style, name: vname, size: wish, seed: i * 977 + gridSize });
            // Tatsächliche Ausdehnung aus dem Modell übernehmen: ein grosser
            // Ort braucht mehr eingeebnete und waldfreie Fläche als ein Weiler.
            const vRad = Math.ceil((v.userData.radius || 8) + 2.5);
            const wx = sp.gx * tile - half, wz = sp.gy * tile - half;
            const st2 = footprintStats(sp.gx, sp.gy, vRad);
            flattenUnderBuilding(sp.gx, sp.gy, vRad, st2.minY);            // Ortsplatz einebnen
            v.position.set(wx, st2.minY - 0.05, wz);
            // Auch der Ort steht achsenparallel — die zufällige Schrägstellung
            // ließ Häuser, Straßen und Parkplatz gegeneinander verdreht wirken.
            // Die Variation steckt jetzt in der Viertelumdrehung, nicht im Winkel.
            v.rotation.y = snapYaw(Math.atan2(-wx, -wz)) + Math.floor(vrand() * 4) * (Math.PI / 2);
            scene.add(v);
            // Ortsfläche im Raster sperren, damit weder Straßen noch
            // Gebäude mitten im Dorf landen.
            {
                // Als SCHEIBE sperren, nicht als Quadrat: der Ort ist rund,
                // ein Quadrat mit Kantenlänge 2·vRad blockierte an den Ecken
                // viel freies Land und drängte Straße und Parkplatz unnötig
                // weit weg.
                const r2 = vRad * vRad;
                for (let dy = -vRad; dy <= vRad; dy++) for (let dx = -vRad; dx <= vRad; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const x = Math.round(sp.gx + dx), y = Math.round(sp.gy + dy);
                    if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) continue;
                    occGrid[y * gridSize + x] = OCC_BUILD;
                    occOwner.set(x + ',' + y, 'village');
                }
            }
            // Kein Dorf im Wald: Bäume im Ortsbereich weichen. Zwei gekreuzte
            // Linien decken die runde Ortsfläche zuverlässig ab.
            clearForestAlongPath([{ gx: sp.gx - vRad, gy: sp.gy }, { gx: sp.gx + vRad, gy: sp.gy }]);
            clearForestAlongPath([{ gx: sp.gx, gy: sp.gy - vRad }, { gx: sp.gx, gy: sp.gy + vRad }]);
            // Bei einem Straßendorf reichen zwei Linien nicht — die Diagonalen
            // decken die längliche Fläche mit ab.
            if (v.userData.layout === 'strasse') {
                const dq = Math.round(vRad * 0.72);
                clearForestAlongPath([{ gx: sp.gx - dq, gy: sp.gy - dq }, { gx: sp.gx + dq, gy: sp.gy + dq }]);
                clearForestAlongPath([{ gx: sp.gx - dq, gy: sp.gy + dq }, { gx: sp.gx + dq, gy: sp.gy - dq }]);
            }

            // ===================================================
            //  ERSCHLIESSUNG — geplant vom AccessPlanner
            //  -------------------------------------------------
            //  Die gesamte Planung (Ortseingang, Hauptstraße um Hindernisse,
            //  Parkplatz außerhalb des Ortes, Einfahrtsstich, Haltestelle)
            //  steckt in einem eigenen, isoliert getesteten Modul. Hier
            //  wird nur noch gebaut, was der Plan vorgibt.
            const vgx = Math.round(sp.gx), vgy = Math.round(sp.gy);
            const plan = planVillageAccess({
                gridSize, vgx, vgy, vRad,
                blocked: (x, y) => occAt(x, y) === OCC_BUILD,
                buildable: (x, y) => tileBuildable(x, y),
                avoid: (x, y) => nearPisteOrLift(x, y, 5),
                lotSize: footprintSize(6.5),
                anchorX: (i === 0) ? RVX : sp.gx,
                anchorY: (i === 0) ? RVY : sp.gy,
                wantBusStop: i === 0
            });
            const { dirX, dirY } = plan;
            const bx = plan.edge.x, by = plan.edge.y;

            // ----- Ort zur Zufahrt drehen: das Ortsschild steht am Eingang -----
            v.rotation.y = snapYaw(Math.atan2(plan.entry.x - vgx, plan.entry.y - vgy));

            // ----- Hauptstraße -----
            for (let k = 1; k < plan.mainWay.length; k++) clearForestAlongPath([plan.mainWay[k - 1], plan.mainWay[k]]);
            const mainRoad = addRoadCurve(plan.mainWay, 4.2);         // Ortseingang -> Kante
            const entryKeyV = roadKey(bx, by);
            roadEntries.push({ key: entryKeyV, gx: bx, gy: by });
            if (!carEntryKey) carEntryKey = entryKeyV;

            // ----- Parkplatz + Stich -----
            const pgxV = plan.lot ? plan.lot.gx : Math.round(vgx + dirX * (vRad + 8));
            const pgyV = plan.lot ? plan.lot.gy : Math.round(vgy + dirY * (vRad + 8));
            const yawP = plan.lot ? plan.yaw : snapYaw(Math.atan2(dirX, dirY));
            flattenUnderBuilding(pgxV, pgyV, 6, footprintStats(pgxV, pgyV, 6).minY);
            let stub = [];
            if (plan.lot && plan.stub) {
                clearForestAlongPath([plan.stub[0], plan.stub[plan.stub.length - 1]]);
                stub = addRoad(plan.stub[0].gx, plan.stub[0].gy,
                               plan.junction.gx, plan.junction.gy, 3.2);
            }
            // Fahrweg: rp[0] = Padkante, rp[last] = Kante. Der Anschluss an
            // die Hauptstraße erfolgt am Knoten; von dort der Rest der Straße.
            let jRoad = 0, jd = Infinity;
            if (plan.junction) for (let k = 0; k < mainRoad.length; k++) {
                const d = Math.hypot(mainRoad[k].gx - plan.junction.gx, mainRoad[k].gy - plan.junction.gy);
                if (d < jd) { jd = d; jRoad = k; }
            }
            const rp = stub.length ? stub.concat(mainRoad.slice(jRoad + 1)) : mainRoad.slice();

            // ----- Bushaltestelle (nur Hauptort) -----
            if (plan.busStop) {
                const B = plan.busStop;
                const bs = makeBusStop();
                const stB = footprintStats(B.gx, B.gy, 1.5);
                flattenUnderBuilding(B.gx, B.gy, 1.5, stB.minY);
                bs.position.set(B.gx * tile - half, stB.minY, B.gy * tile - half);
                bs.rotation.y = B.yaw;
                scene.add(bs); registerFlags(bs);
                parcelClaim(B.ox, B.oy, B.n, OCC_BUILD, 'busstop');
                placedBuildings.push({ mesh: bs, cost: 15000,
                    rec: { x: bs.position.x, z: bs.position.z, r: 1.8 }, type: 'busstop',
                    parcel: { ox: B.ox, oy: B.oy, n: B.n }, stopAt: B.stopAt });
                addSelectable({ type: 'busstop', cost: 15000, x: bs.position.x, z: bs.position.z, r: 1.8 });
                built.busstop++;
            }
            const pS = footprintStats(pgxV, pgyV, 6);

            const lotMesh = makeParking(10, 7);
            lotMesh.position.set(pgxV * tile - half, pS.minY, pgyV * tile - half);
            // Pad nach der EINFAHRT ausrichten (Stichrichtung), damit die
            // Stellplatzreihen parallel zu den aufgemalten Linien liegen.
            lotMesh.rotation.y = yawP;
            scene.add(lotMesh);
            {
                const g7 = worldToTile(lotMesh.position.x, lotMesh.position.z);
                const n7 = footprintSize(6.5), o7 = parcelOrigin(g7.gx, g7.gy, n7);
                parcelClaim(o7.gx, o7.gy, n7, OCC_BUILD, 'parking');
            }
            // auch am Parkplatz und entlang der Einfahrt freischlagen
            clearForestAlongPath([{ gx: pgxV - 6, gy: pgyV }, { gx: pgxV + 6, gy: pgyV }]);
            // (der Weg Parkplatz -> Ort wird oben schon freigeschlagen)
            // ===== STELLPLÄTZE ORDENTLICH IN REIHEN =====
            // Vorher standen vier Autos in einer losen Linie quer über den
            // Platz. Jetzt zwei saubere Reihen mit gleichem Abstand, längs
            // zur Zufahrt ausgerichtet — so parken sie sortiert ein statt
            // kreuz und quer.
            const vSpots = [];
            {
                const COLS = 5, ROWS = 2;
                const colStep = 1.9, rowStep = 2.6;
                // längs = quer zur Zufahrtsrichtung, damit die Autos von der
                // Straße aus direkt in die Lücke einbiegen
                // Einfahrtsrichtung aus dem Pad-Yaw ableiten
                const eDX = Math.round(Math.sin(yawP)), eDY = Math.round(Math.cos(yawP));
                const lx = -eDY, ly = eDX;           // Längsachse des Pads (quer zur Einfahrt)
                for (let r2 = 0; r2 < ROWS; r2++) {
                    for (let c2 = 0; c2 < COLS; c2++) {
                        const along = (c2 - (COLS - 1) / 2) * colStep;
                        const across = (r2 - (ROWS - 1) / 2) * rowStep;
                        vSpots.push({
                            x: (pgxV + lx * along + eDX * across) * tile - half,
                            z: (pgyV + ly * along + eDY * across) * tile - half
                        });
                    }
                }
            }
            // WICHTIG: eigener Zielpunkt im Ort. Ohne ihn liefen die
            // Ankommenden quer über die Karte zur Hauptkasse.
            const localTarget = new THREE.Vector3(vgx * tile - half, st2.minY, vgy * tile - half);
            const vLot = { gx: pgxV, gy: pgyV, padY: pS.minY, spots: vSpots,
                           cap: vSpots.length * 8, occ: 0, basePrice: 10, price: null,
                           income: 0, ticketPos: localTarget, roadPath: rp, village: vname,
                           // Diese Zufahrt wurde beim Bau geplant (Kurve um
                           // Hindernisse herum) und darf nicht durch eine
                           // Kachelsuche ersetzt werden.
                           fixedPath: true, entryKey: entryKeyV,
                           // Blickrichtung geparkter Autos: quer zur Reihe,
                           // also entlang der Einfahrtsrichtung.
                           rowYaw: yawP };
            parkingLots.push(vLot);
            addSelectable({ type: 'parking', cost: 0, x: lotMesh.position.x,
                            z: lotMesh.position.z, r: 6.5, lot: vLot });
            villages.push({ gx: sp.gx, gy: sp.gy, name: vname, mesh: v,
                            main: i === 0, lot: vLot });
            addSelectable({ type: 'village', cost: 0, x: wx, z: wz, r: 11,
                            villageName: vname });
        });
    }
    placeVillages();
    // ===== NACHGEZOGENES EINEBNEN DER STARTBEBAUUNG =====
    // Erst hier existiert flattenUnderBuilding. Nach dem Einebnen muss das
    // Gebäude neu aufgesetzt werden, weil sich der Boden darunter geändert hat.
    for (const pf of pendingFlatten) {
        flattenUnderBuilding(pf.gx, pf.gy, pf.r, pf.y);
        const st9 = footprintStats(pf.gx, pf.gy, pf.r);
        pf.obj.position.y = st9.minY;
    }
    pendingFlatten.length = 0;

    // Schürze einmal initial einfärben und danach bei jedem Wetterwechsel
    if (apronForest?.userData?.setSnowLine) apronForest.userData.setSnowLine(snowLineY() * hScale, Math.max(1, snowLineY() * 0.30) * hScale);
    repaintSnowCover();   // Ausgangszustand: Tieflagen sind aper (färbt am Ende auch die Schürze)
    /**
     * Schneedecke an einer Gitterzelle als Wert 0..1. Das ist die EINE Quelle
     * der Wahrheit — sie bestimmt sowohl die Einfärbung des Bodens als auch,
     * ob dort gefahren oder gelaufen werden muss. Dadurch kann eine Piste
     * niemals weiß aussehen und trotzdem aper sein (oder umgekehrt).
     */
    function snowCoverAt(vi) {
        const lc = world.landcover[vi];
        if (lc === 8) return 1;                            // Gletscher
        if (lc === 2) return 0;                            // Wasser
        const limit = _snowLine;
        const band = Math.max(1, limit * 0.30);
        const nat = smooth01(((heightmap[vi] || 0) - (limit - band)) / band);
        return Math.max(nat, SNOW_BASE[vi]);
    }
    /**
     * Liegt an dieser Stelle genug Schnee zum Fahren? Aper ist es unterhalb
     * der Schneegrenze, sofern dort nicht beschneit wurde oder frisch fiel.
     */
    function hasSnowAt(gx, gy) {
        const x = Math.max(0, Math.min(gridSize - 1, Math.round(gx)));
        const y = Math.max(0, Math.min(gridSize - 1, Math.round(gy)));
        const vi = y * gridSize + x;
        return snowCoverAt(vi) > 0.35;                  // erst ab echter Decke fahrbar
    }
    /**
     * Grundfarbe einer Kachel auf "Schnee" setzen. Nötig überall dort, wo
     * gerodet oder planiert wurde: der ursprüngliche Waldboden ist dunkelgrün,
     * und ohne diese Korrektur bliebe eine verschneite Pistenschneise dunkel.
     */
    function setBaseToSnow(vi) {
        const i3 = vi * 3;
        const grain = (((vi * 374761393) >>> 24 & 15) - 7.5) / 255;
        COL0[i3] = 0.93 + grain; COL0[i3 + 1] = 0.95 + grain; COL0[i3 + 2] = 0.98 + grain;
    }
    const snowifyGroundAlongPath = (pts, radius = 3.4) => {
        const col = terrain?.geometry?.attributes?.color;
        if (!col) return;
        const snow = [0.93, 0.95, 0.98];
        // Bounding-Box des Pfads bestimmen (nur diesen Bereich scannen)
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (const p of pts) { minX = Math.min(minX, p.gx); maxX = Math.max(maxX, p.gx); minY = Math.min(minY, p.gy); maxY = Math.max(maxY, p.gy); }
        const gx0 = Math.max(0, Math.floor(minX - radius)), gx1 = Math.min(gridSize - 1, Math.ceil(maxX + radius));
        const gy0 = Math.max(0, Math.floor(minY - radius)), gy1 = Math.min(gridSize - 1, Math.ceil(maxY + radius));
        const r2 = radius * radius;
        let changed = false;
        for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
                // nächster Abstand zur Polylinie
                let near = false;
                for (let seg = 0; seg < pts.length - 1 && !near; seg++) {
                    const a = pts[seg], b = pts[seg + 1];
                    const dx = b.gx - a.gx, dy = b.gy - a.gy, l2 = dx * dx + dy * dy || 1;
                    let t = ((gx - a.gx) * dx + (gy - a.gy) * dy) / l2; t = Math.max(0, Math.min(1, t));
                    const px = a.gx + dx * t, py = a.gy + dy * t;
                    if ((gx - px) * (gx - px) + (gy - py) * (gy - py) <= r2) near = true;
                }
                if (!near) continue;
                const vi = gy * gridSize + gx;
                SNOW_BASE[vi] = 1;      // Piste ist präpariert -> hier liegt Schnee
                setBaseToSnow(vi);      // Waldboden darunter zählt ab jetzt als Schneegrund
                const grain = (((vi * 374761393) >>> 24 & 15) - 7.5) / 255;
                col.setXYZ(vi, snow[0] + grain, snow[1] + grain, snow[2] + grain);
                changed = true;
            }
        }
        if (changed) col.needsUpdate = true;
    };
    const pisteCostForPts = (pts) => {
        let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].gx - pts[i-1].gx, pts[i].gy - pts[i-1].gy);
        // Breitere Pisten kosten mehr Erdbewegung und Präparierung
        const wMul = { narrow: 0.8, medium: 1, wide: 1.35, xwide: 1.95 }[pisteWidth] || 1;
        return Math.round((2000 + d * 400) * wMul);
    };
    // Baut das gefärbte Pistenband entlang der Wegpunkte; km je Schwierigkeit zählen.
    const buildPistePath = (rawPts) => {
        // aufeinanderfolgende zu nahe Punkte entfernen (Doppelklick-Duplikate)
        const pts = [];
        for (const q of rawPts) { const last = pts[pts.length-1]; if (!last || Math.hypot(last.gx-q.gx, last.gy-q.gy) > 1.5) pts.push(q); }
        if (pts.length < 2) return null;
        // so orientieren, dass Punkt 0 oben (höchster) ist
        if (yAtSmooth(pts[0].gx, pts[0].gy) < yAtSmooth(pts[pts.length-1].gx, pts[pts.length-1].gy)) pts.reverse();
        // Zusammenlaufende Pisten intelligent verbinden: Start/Ende nahe einer
        // bestehenden Piste -> exakt auf deren Achse einfädeln (kein Versatz-Chaos)
        const snapToPiste = (q) => {
            let best = null, bd = 7;
            for (const rt of guestRoutes) {
                if (rt.kind !== 'piste' || !rt.path) continue;
                for (const pp of rt.path) {
                    const d = Math.hypot(pp.gx - q.gx, pp.gy - q.gy);
                    if (d < bd) { bd = d; best = pp; }
                }
            }
            return best ? { gx: best.gx, gy: best.gy } : q;
        };
        // Beim Einfädeln nicht einfach den Endpunkt versetzen (das gab einen
        // sichtbaren Knick), sondern die letzten eigenen Punkte weich zur
        // Achse der bestehenden Piste hinbiegen.
        const blendInto = (end) => {
            const idx0 = end ? pts.length - 1 : 0;
            const snapped = snapToPiste(pts[idx0]);
            if (snapped === pts[idx0]) return;
            const dxs = snapped.gx - pts[idx0].gx, dys = snapped.gy - pts[idx0].gy;
            const reach = Math.min(3, pts.length - 1);       // so viele Punkte biegen mit
            for (let k = 0; k <= reach; k++) {
                const i2 = end ? pts.length - 1 - k : k;
                const f = Math.pow(1 - k / (reach + 1), 2);  // quadratisch auslaufend
                pts[i2] = { gx: pts[i2].gx + dxs * f, gy: pts[i2].gy + dys * f };
            }
        };
        blendInto(false);
        blendInto(true);
        // Ecken runden (Chaikin): aus jedem Knick werden zwei sanfte Punkte.
        // Das glättet sowohl die Klick-Ecken des Spielers als auch die
        // Übergänge an den Einfädelstellen.
        for (let round = 0; round < 2; round++) {
            if (pts.length < 3) break;
            const sm2 = [pts[0]];
            for (let i2 = 0; i2 < pts.length - 1; i2++) {
                const a3 = pts[i2], b3 = pts[i2 + 1];
                sm2.push({ gx: a3.gx * 0.75 + b3.gx * 0.25, gy: a3.gy * 0.75 + b3.gy * 0.25 });
                sm2.push({ gx: a3.gx * 0.25 + b3.gx * 0.75, gy: a3.gy * 0.25 + b3.gy * 0.75 });
            }
            sm2.push(pts[pts.length - 1]);
            pts.length = 0; pts.push(...sm2);
        }

        // Breite je nach gewählter Variante (Flutlicht = immer mittel)
        const snowW = PISTE_WIDTHS[pisteLit ? 'medium' : pisteWidth] || PISTE_WIDTHS.medium;
        const tintW = snowW * 0.73;   // farbige Markierung schmaler als das Schneebett
        // Durchschnittsgefälle der GESAMTEN Piste bestimmt die Schwierigkeit (wie im 2D)
        let sumRun = 0, sumDrop = 0;
        for (let s2 = 0; s2 < pts.length - 1; s2++) {
            const a2 = pts[s2], b2 = pts[s2 + 1];
            sumDrop += Math.abs((yAtSmooth(a2.gx, a2.gy) - yAtSmooth(b2.gx, b2.gy)) / hScale);
            sumRun += Math.hypot(a2.gx - b2.gx, a2.gy - b2.gy);
        }
        const avgGrad = (sumDrop / (sumRun || 1)) * 10 / 1.5;
        const avgDiff = avgGrad >= 55 ? 'black' : avgGrad >= 35 ? 'red' : 'blue';
        const snowPos = [], snowIdx = [], bedGrid = []; let sv = 0;
        const tintPos = [], tintCol = [], tintIdx = []; let tv = 0;
        const diffLen = { blue: 0, red: 0, black: 0 }; let totalKm = 0;   // für Pisteninfo
        for (let seg = 0; seg < pts.length - 1; seg++) {
            const a = pts[seg], b = pts[seg + 1];
            const diff = avgDiff;                      // gesamte Piste hat EINE Schwierigkeit
            const c = PISTE_RGB[diff];
            const segDist = Math.hypot(b.gx - a.gx, b.gy - a.gy) || 1;
            piste[diff] += segDist * 0.02; piste.total += segDist * 0.02;
            diffLen[diff] += segDist; totalKm += segDist * 0.02;
            const sub = Math.max(1, Math.round(segDist));
            const dx = b.gx - a.gx, dy = b.gy - a.gy, len = Math.hypot(dx, dy) || 1;
            const px = -dy / len, py = dx / len;
            for (let k = 0; k <= sub; k++) {
                const t = k / sub, cx = a.gx + dx * t, cy = a.gy + dy * t;
                // Schneebett (deckend, verdeckt gerodeten Waldboden)
                const sl = worldPosSmooth(cx + px * snowW, cy + py * snowW);
                const sr = worldPosSmooth(cx - px * snowW, cy - py * snowW);
                snowPos.push(sl.x, sl.y + 0.05, sl.z, sr.x, sr.y + 0.05, sr.z);
                // Gitterkoordinaten je Stützpunkt merken -> Schneezustand abfragbar
                bedGrid.push(cx + px * snowW, cy + py * snowW, cx - px * snowW, cy - py * snowW);
                if (k > 0) { const bi = sv - 2; snowIdx.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2); }
                sv += 2;
                // farbige Schwierigkeitsmarkierung (schmaler, obenauf)
                const tl = worldPosSmooth(cx + px * tintW, cy + py * tintW);
                const tr = worldPosSmooth(cx - px * tintW, cy - py * tintW);
                tintPos.push(tl.x, tl.y + 0.09, tl.z, tr.x, tr.y + 0.09, tr.z);
                tintCol.push(c[0], c[1], c[2], c[0], c[1], c[2]);
                if (k > 0) { const bi = tv - 2; tintIdx.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2); }
                tv += 2;
            }
        }
        // 1. Schneebett. Die Vertexfarben folgen dem echten Schneezustand:
        //    taut die Piste im Tal aus, wird das Band dort grün — sonst sähe
        //    eine apere Piste weiß aus, obwohl man sie laufen muss.
        const gs = new THREE.BufferGeometry();
        gs.setAttribute('position', new THREE.Float32BufferAttribute(snowPos, 3));
        const bedCol = new Float32Array((snowPos.length / 3) * 3).fill(1);
        gs.setAttribute('color', new THREE.BufferAttribute(bedCol, 3));
        gs.setIndex(snowIdx); gs.computeVertexNormals();
        const ms = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.85, vertexColors: true });
        pisteSnowMats.push(ms);                        // Zustand färbt das Schneebett
        const snowMesh = new THREE.Mesh(gs, ms); snowMesh.receiveShadow = true; scene.add(snowMesh);
        // Zustand je Stützpunktpaar: 1 = frisch gewalzt, 0 = völlig verspurt.
        // Dadurch verschleißt die Piste abschnittsweise und die Raupe kann
        // gezielt einzelne Stücke wieder herrichten.
        const nPairs = bedGrid.length / 2;
        const bedRec = { geo: gs, grid: bedGrid, groom: new Float32Array(nPairs).fill(1) };
        pisteBeds.push(bedRec);
        bedRec.route = null;                            // wird gleich verknüpft
        attachWearFx(bedRec, pts, snowW);
        // 2. Farbige Markierung (dezent, halbtransparent)
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(tintPos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(tintCol, 3));
        g.setIndex(tintIdx); g.computeVertexNormals();
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.32, roughness: 0.7, depthWrite: false });
        scene.add(new THREE.Mesh(g, m));
        // Pistenbett auf verändertes Gelände nachsetzen (Funpark/Halfpipe
        // graben sich später in die Piste ein): Schneeband und Markierung
        // folgen den Kachelhöhen, die in `bedGrid` bzw. tintGrid stehen.
        // Dauerhaft ausgeblendete Bandpunkte (über Anlagen): ein späteres
        // reseat (z. B. für einen Kicker weiter unten) darf sie NICHT wieder
        // hochholen — sonst liegt das Schneeband wieder über der Halfpipe.
        bedRec.hidden = new Set();
        bedRec.reseat = (cgx, cgy, rad, hideFn = null) => {
            const pa = gs.attributes.position, ta = g.attributes.position;
            for (let i = 0, gi = 0; i < pa.count; i++, gi += 2) {
                const gx = bedGrid[gi], gy = bedGrid[gi + 1];
                if (Math.hypot(gx - cgx, gy - cgy) > rad) continue;
                // Im Bereich einer modellierten Anlage (Pipe-Mulde, Schanzen)
                // würde das flache Band die Form zudecken — dort wird es unter
                // das Gelände gelegt; der weiße Pistenboden selbst bleibt sichtbar.
                if (hideFn && hideFn(gx, gy)) bedRec.hidden.add(i);
                pa.setY(i, bedRec.hidden.has(i) ? yAtSmooth(gx, gy) - 8 : yAtSmooth(gx, gy) + 0.05);   // −8: sicher unter der 3-m-Mulde
            }
            // Markierung: gleiche Reihenfolge (links/rechts je Stützpunkt), auf
            // 73 % der Breite — Höhe an ihrer eigenen Lage abgreifen
            for (let i = 0, gi = 0; i < ta.count; i++, gi += 2) {
                const gxo = bedGrid[gi], gyo = bedGrid[gi + 1];
                // Achse = Mittel aus linkem und rechtem Bettpunkt des Paars
                const pi = i - (i % 2), cx2 = (bedGrid[pi * 2] + bedGrid[pi * 2 + 2]) / 2, cy2 = (bedGrid[pi * 2 + 1] + bedGrid[pi * 2 + 3]) / 2;
                const gx = cx2 + (gxo - cx2) * 0.73, gy = cy2 + (gyo - cy2) * 0.73;
                if (Math.hypot(gx - cgx, gy - cgy) > rad) continue;
                ta.setY(i, bedRec.hidden.has(i) ? yAtSmooth(gx, gy) - 8 : yAtSmooth(gx, gy) + 0.09);
            }
            pa.needsUpdate = true; ta.needsUpdate = true;
            gs.computeVertexNormals(); g.computeVertexNormals();
        };
        // Randstangen entlang der Piste — mit GLOBALEM Abstand über die ganze
        // Strecke. Vorher wurde pro Segment mindestens ein Paar gesetzt; seit
        // dem Kurvenrunden sind die Segmente viel kürzer und die Piste stand
        // voller Pfosten.
        {
            const edge = snowW + 0.4;
            const SPACING = 6;                       // Kacheln zwischen den Stangenpaaren
            let travelled2 = 0, nextAt2 = 1.5;
            for (let seg = 0; seg < pts.length - 1; seg++) {
                const a = pts[seg], b = pts[seg + 1];
                const dx = b.gx - a.gx, dy = b.gy - a.gy, len = Math.hypot(dx, dy) || 1;
                const px = -dy / len, py = dx / len;
                while (nextAt2 <= travelled2 + len) {
                    const t = (nextAt2 - travelled2) / len;
                    const cx = a.gx + dx * t, cy = a.gy + dy * t;
                    for (const side of [edge, -edge]) {
                        const mk = makePisteMarker(PISTE_HEX[avgDiff]);
                        mk.position.copy(worldPosSmooth(cx + px * side, cy + py * side));
                        scene.add(mk);
                    }
                    nextAt2 += SPACING;
                }
                travelled2 += len;
            }
        }
        // Flutlichtmasten nur wenn "Piste mit Flutlicht" gewählt wurde
        if (pisteLit) {
            const edge = 4.2, spacing = 16;
            let travelled = 0, nextAt = spacing * 0.6, sideFlip = 1;
            for (let seg = 0; seg < pts.length - 1; seg++) {
                const a = pts[seg], b = pts[seg + 1];
                const dx = b.gx - a.gx, dy = b.gy - a.gy, segLen = Math.hypot(dx, dy) || 1;
                const px = -dy / segLen, py = dx / segLen;
                while (nextAt <= travelled + segLen) {
                    const t = (nextAt - travelled) / segLen;
                    const cx = a.gx + dx * t, cy = a.gy + dy * t;
                    const side = edge * sideFlip;
                    const wp = worldPosSmooth(cx + px * side, cy + py * side);
                    const mast = makeFloodlight(6);
                    mast.position.copy(wp);
                    // +Z (Ausleger/Kegel) zur Pistenmitte drehen: Richtung = -side*perp
                    mast.rotation.y = Math.atan2(-px * Math.sign(side), -py * Math.sign(side));
                    scene.add(mast);
                    if (mast.userData.lampMat) floodlights.push(mast.userData);
                    nextAt += spacing; sideFlip *= -1;
                }
                travelled += segLen;
            }
        }
        // Bäume unter der Piste roden + Boden weiß einfärben (Schnee)
        clearForestAlongPath(pts);
        if (rocks?.userData?.clearAlong) rocks.userData.clearAlong(pts, snowW + 1.2);
        snowifyGroundAlongPath(pts);
        // Piste als befahrbare Gäste-Route (Gäste wählen sie selbst)
        // diff mitgeben: schwere Pisten führen häufiger zu Stürzen
        const rt = { top: pts[0], bottom: pts[pts.length - 1], path: pts.slice(), kind: 'piste', diff: avgDiff, bed: bedRec,
                     width: pisteLit ? 'medium' : pisteWidth, snowW };
        bedRec.route = rt;
        guestRoutes.push(rt);
        // Pistennummer + anklickbares Schild am unteren Ende (wie im 2D)
        pisteNo++;
        const domDiff = diffLen.black > diffLen.red && diffLen.black > diffLen.blue ? 'black'
            : diffLen.red > diffLen.blue ? 'red' : 'blue';
        const bot = pts[pts.length - 1];
        addPisteSign(bot, pisteNo, PISTE_HEX[domDiff]);
        const bw = worldPosSmooth(bot.gx, bot.gy);
        addSelectable({ type: 'piste', cost: 0, x: bw.x, z: bw.z, r: 3.2,
            piste: { no: pisteNo, km: +totalKm.toFixed(1), diff: domDiff, width: pisteLit ? 'medium' : pisteWidth } });
        return true;
    };
    const clearPisteDraft = () => {
        pistePts = [];
        if (pistePreview) { scene.remove(pistePreview); pistePreview = null; }
        for (const d of pisteDots) scene.remove(d);
        pisteDots.length = 0;
    };
    const refreshPistePreview = (hoverPt) => {
        const chain = pistePts.map(q => worldPosSmooth(q.gx, q.gy).clone().add(new THREE.Vector3(0, 0.25, 0)));
        let valid = true;
        if (hoverPt) {
            const gr = worldToGrid(hoverPt.x, hoverPt.z);
            if (pistePts.length > 0) valid = segmentValid(pistePts[pistePts.length - 1], { gx: gr.gx, gy: gr.gy });
            else valid = isBuildableGround(gr.gx, gr.gy);
            chain.push(hoverPt.clone().add(new THREE.Vector3(0, 0.25, 0)));
        }
        if (chain.length < 2) { if (pistePreview) { scene.remove(pistePreview); pistePreview = null; } return; }
        const col = valid ? 0xfcd34d : 0xff5555;
        // Transparentes Pistenband in der gewählten Breite — zeigt schon vor dem
        // Bau, wie breit die Piste wirklich wird.
        const gpts = pistePts.slice();
        if (hoverPt) { const gr = worldToGrid(hoverPt.x, hoverPt.z); gpts.push({ gx: gr.gx, gy: gr.gy }); }
        const wHalf = (PISTE_WIDTHS[pisteLit ? 'medium' : pisteWidth] || PISTE_WIDTHS.medium);
        const pos = [], idx = []; let v = 0;
        for (let seg = 0; seg < gpts.length - 1; seg++) {
            const A = gpts[seg], B = gpts[seg + 1];
            const dx = B.gx - A.gx, dy = B.gy - A.gy, len = Math.hypot(dx, dy) || 1;
            const px = -dy / len, py = dx / len;
            const sub = Math.max(1, Math.round(len));
            for (let k = 0; k <= sub; k++) {
                const t = k / sub, cx = A.gx + dx * t, cy = A.gy + dy * t;
                const l = worldPosSmooth(cx + px * wHalf, cy + py * wHalf);
                const r = worldPosSmooth(cx - px * wHalf, cy - py * wHalf);
                pos.push(l.x, l.y + 0.18, l.z, r.x, r.y + 0.18, r.z);
                if (k > 0) { const bi = v - 2; idx.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2); }
                v += 2;
            }
        }
        if (pistePreview) { scene.remove(pistePreview); pistePreview = null; }
        if (!pos.length) return;
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        gg.setIndex(idx); gg.computeVertexNormals();
        pistePreview = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide
        }));
        scene.add(pistePreview);
    };

    const worldToGrid = (wx, wz) => ({ gx: (wx + half) / tile, gy: (wz + half) / tile });

    // Schneekanonen schneien in EINE Richtung — der Sektor wird in der
    // Bauvorschau angezeigt und dreht sich mit der Bau-Rotation (Q/E).
    let snowRing = null;
    const showSnowRange = (type, wx, wz, y, rot, existing = false) => {
        const r = CANNON_RANGE[type];
        if (!r) { if (snowRing) { scene.remove(snowRing); snowRing = null; } return; }
        if (!snowRing) {
            snowRing = new THREE.Group();
            // Kreissektor in Blickrichtung (Radius 1, wird skaliert)
            const sector = new THREE.CircleGeometry(1, 40, -CANNON_ARC / 2, CANNON_ARC);
            sector.rotateX(-Math.PI / 2);
            const fill = new THREE.Mesh(sector, new THREE.MeshBasicMaterial({
                color: 0x7dd3fc, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }));
            const edge = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 40, 1, -CANNON_ARC / 2, CANNON_ARC).rotateX(-Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95,
                    depthWrite: false, side: THREE.DoubleSide }));
            snowRing.add(fill); snowRing.add(edge);
            snowRing.userData.parts = { edge, fill };
            scene.add(snowRing);
        }
        // Vorschau zeigt die TATSÄCHLICHE Wurfweite inkl. dieser neuen Kanone,
        // damit sichtbar ist, wie stark Wassermangel die Reichweite kürzt.
        // existing = die Kanone steht schon und ist im Bedarf mitgezählt
        const needAfter = waterNeed() + (existing ? 0 : (CANNON_WATER[type] || 0));
        const ratioAfter = needAfter === 0 ? 0 : Math.max(0, Math.min(1, waterSupply() / needAfter));
        const R = r * tile * (0.4 + 0.6 * ratioAfter);
        snowRing.scale.set(R, 1, R);
        snowRing.position.set(wx, y + 0.35, wz);
        // Der Sektor zeigt entlang +X — genau dorthin, wohin das Kanonenmodell bläst.
        snowRing.rotation.y = (rot || 0);
        const enough = waterSupply() >= needAfter;
        snowRing.userData.parts.edge.material.color.setHex(enough ? 0x38bdf8 : 0xf87171);
        snowRing.userData.parts.fill.material.color.setHex(enough ? 0x7dd3fc : 0xfca5a5);
        snowRing.visible = true;
    };
    const hideSnowRange = () => { if (snowRing) { scene.remove(snowRing); snowRing = null; } };

    // ===== FAHRTRICHTUNGS-PFEIL (Funpark, Halfpipe, Kicker, Rennstrecke) =====
    // Diese Anlagen werden in EINER Richtung durchfahren. Der Pfeil zeigt beim
    // Bauen, wohin die Gäste laufen werden — und dreht mit Q/E mit.
    let dirArrow = null;
    const showDirArrow = (type, wx, wz, y, rot) => {
        const len = DIRECTED[type];
        if (!len) { hideDirArrow(); return; }
        if (!dirArrow) {
            dirArrow = new THREE.Group();
            const mat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true,
                opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
            // Schaft entlang +Z (Länge 1, wird skaliert)
            const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.78), mat);
            shaft.rotation.x = -Math.PI / 2; shaft.position.z = 0.39 - 0.5;
            const head = new THREE.Mesh(new THREE.CircleGeometry(0.2, 3), mat);
            head.rotation.x = -Math.PI / 2; head.rotation.z = -Math.PI / 2;
            head.position.z = 0.42; head.scale.set(1, 1.5, 1);
            dirArrow.add(shaft); dirArrow.add(head);
            dirArrow.userData.mat = mat;
            scene.add(dirArrow);
        }
        dirArrow.scale.set(len * tile * 0.2, 1, len * tile);   // schlank, verdeckt die Anlage nicht
        dirArrow.position.set(wx, y + 0.45, wz);
        dirArrow.rotation.y = rot || 0;      // +Z = Fahrtrichtung, wie beim Modell
        dirArrow.visible = true;
    };
    const hideDirArrow = () => { if (dirArrow) { scene.remove(dirArrow); dirArrow = null; } };

    const makeGhost = (type) => {
        if (ghost) { scene.remove(ghost); ghost = null; }
        const def = BUILD_DEFS[type];
        if (!def) return;
        const g = def.make();
        g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
        g.userData.def = def;
        g.userData.type = type;
        ghost = g; ghost.visible = false; scene.add(ghost);
    };

    // Punkt auf dem Gelände unter einem Bildschirmpunkt.
    // Früher wurde dafür das ganze Geländenetz Dreieck für Dreieck geprüft (bis zu
    // 770 000 – bei jeder Mausbewegung, auf dem Handy bei jedem Antippen spürbar).
    // Jetzt wandert der Strahl über die Höhenkarte: erst in kleinen Schritten bis
    // unter die Oberfläche, dann per Halbierung genau an den Schnittpunkt.
    const raycastTerrain = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        ptr.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ptr.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ptr, camera);
        const o = raycaster.ray.origin, d = raycaster.ray.direction;
        // Abschnitt des Strahls, der über der Karte (Quadrat ±half) liegt
        let t0 = 0, t1 = camera.far;
        for (const [oc, dc] of [[o.x, d.x], [o.z, d.z]]) {
            if (Math.abs(dc) < 1e-9) { if (oc < -half || oc > half) return null; continue; }
            let a = (-half - oc) / dc, b = (half - oc) / dc;
            if (a > b) { const s = a; a = b; b = s; }
            if (a > t0) t0 = a;
            if (b < t1) t1 = b;
            if (t0 > t1) return null;
        }
        const above = (t) => (o.y + d.y * t) - yAtSmooth((o.x + d.x * t + half) / tile, (o.z + d.z * t + half) / tile);
        if (above(t0) <= 0) return null;               // Strahl tritt schon unterhalb der Oberfläche in die Karte ein
        const STEP = 0.6 * tile;
        let ta = t0, tb = -1;
        for (let t = t0 + STEP; ; t += STEP) {
            const tt = Math.min(t, t1);
            if (above(tt) <= 0) { tb = tt; break; }
            ta = tt;
            if (tt >= t1) break;
        }
        if (tb < 0) return null;                        // über die Karte hinweg, ohne den Boden zu treffen
        for (let i = 0; i < 12; i++) { const tm = (ta + tb) * 0.5; if (above(tm) > 0) ta = tm; else tb = tm; }
        const t = (ta + tb) * 0.5;
        const x = o.x + d.x * t, z = o.z + d.z * t;
        return new THREE.Vector3(x, yAtSmooth((x + half) / tile, (z + half) / tile), z);
    };
    /** Geländepunkt zu einem Ereignis: vom Bildschirm – oder ein mitgegebener Weltpunkt (Bestätigen am Handy). */
    const pickPoint = (e) => (e && e.__pt) ? e.__pt.clone() : raycastTerrain(e.clientX, e.clientY);

    const MAX_SLOPE = 1.6; // max. Gefälle der Grundfläche (Welt-Einheiten)
    const onMove = (e) => {
        if (roadMode) {
            if (!roadStart) return;
            const pt = pickPoint(e);
            if (!pt) return;
            const gr = worldToGrid(pt.x, pt.z);
            // Vorschau muss GENAU dieselbe Einrastung benutzen wie der Bau,
            // sonst zeigt die Linie woanders hin als die Strasse spaeter liegt.
            let egx = Math.round(gr.gx), egy = Math.round(gr.gy);
            {
                const dx = egx - roadStart.gx, dy = egy - roadStart.gy;
                const ax = Math.abs(dx), ay = Math.abs(dy);
                if (ax > ay * 2.4)      egy = roadStart.gy;
                else if (ay > ax * 2.4) egx = roadStart.gx;
                else {
                    const d = Math.round((ax + ay) / 2);
                    egx = roadStart.gx + Math.sign(dx) * d;
                    egy = roadStart.gy + Math.sign(dy) * d;
                }
                egx = Math.max(1, Math.min(gridSize - 2, egx));
                egy = Math.max(1, Math.min(gridSize - 2, egy));
            }
            // Blockiert ein Gebaeude die Trasse? Dann Vorschau rot.
            let blockedPrev = false;
            {
                const ln = Math.hypot(egx - roadStart.gx, egy - roadStart.gy);
                const steps = Math.max(2, Math.round(ln));
                for (let k = 0; k <= steps && !blockedPrev; k++) {
                    const f = k / steps;
                    const bx = Math.round(roadStart.gx + (egx - roadStart.gx) * f);
                    const by = Math.round(roadStart.gy + (egy - roadStart.gy) * f);
                    for (let oy = -2; oy <= 2 && !blockedPrev; oy++)
                        for (let ox = -2; ox <= 2; ox++)
                            if (occAt(bx + ox, by + oy) === OCC_BUILD) { blockedPrev = true; break; }
                }
            }
            const ok = !blockedPrev && roadGradeOK(roadStart.gx, roadStart.gy, egx, egy);
            // Vorschau als echtes Band: gleiche Stützpunkte wie der spätere
            // Bau, gleiche Breite, folgt dem Gelände.
            const dist = Math.hypot(egx - roadStart.gx, egy - roadStart.gy) || 1;
            const steps = Math.max(2, Math.round(dist));
            const samples = [];
            for (let k = 0; k <= steps; k++) {
                const f = k / steps;
                samples.push({ gx: roadStart.gx + (egx - roadStart.gx) * f,
                               gy: roadStart.gy + (egy - roadStart.gy) * f });
            }
            if (roadPreview) { scene.remove(roadPreview); roadPreview.userData.dispose?.(); }
            roadPreview = buildRoadPreview(samples, 3.6, ok);
            scene.add(roadPreview);
            return;
        }
        if (liftMode) {
            if (!liftStart) return;
            const pt = pickPoint(e);
            if (!pt) return;
            const pts = [liftStart.pt.clone().add(new THREE.Vector3(0,2.4,0)), pt.clone().add(new THREE.Vector3(0,2.4,0))];
            // Echte, transparente Vorschau der kompletten Anlage
            const okBuild = money >= liftCost(liftStart.pt, pt);
            const gr2 = worldToGrid(pt.x, pt.z);
            buildLiftPreview(liftStart, { pt, gx: gr2.gx, gy: gr2.gy }, okBuild);
            return;
        }
        if (pisteMode) {
            if (pistePts.length === 0) return;
            const pt = pickPoint(e);
            if (pt) refreshPistePreview(pt);
            return;
        }
        if (!currentBuild || !ghost) return;
        const pt = pickPoint(e);
        if (!pt) { ghost.visible = false; return; }
        const def = ghost.userData.def;
        // ===== AUF DIE PARZELLE EINRASTEN =====
        // Das Gebäude sitzt exakt MITTIG auf seinem Kachelquadrat, nicht mehr
        // irgendwo auf einer Kachelecke.
        const gr0 = worldToGrid(pt.x, pt.z);
        const par = snapToParcel(gr0.gx, gr0.gy, def.r);
        const gr = { gx: par.gx, gy: par.gy };
        const wx = par.x, wz = par.z;
        const st = footprintStats(gr.gx, gr.gy, def.r * 0.8);
        ghost.visible = true;
        ghost.position.set(wx, st.minY, wz); // bündig auf tiefstem Fußpunkt, gerastert
        // Parkplatz und Parkhaus richten sich selbst zur nächsten Straße aus
        const dockPrev = (ghost.userData.type === 'parking' || ghost.userData.type === 'parkgarage')
            ? findRoadDock(gr.gx, gr.gy) : null;
        ghost.rotation.y = dockPrev ? dockPrev.yaw : ghostRot;
        ghost.rotation.x = 0; ghost.rotation.z = 0;
        // Jede Kachel der Parzelle muss bebaubar sein, nicht nur die Mitte
        let tilesOK = true;
        for (let yy = par.oy; yy < par.oy + par.n && tilesOK; yy++)
            for (let xx = par.ox; xx < par.ox + par.n; xx++)
                if (!tileBuildable(xx, yy)) { tilesOK = false; break; }
        const ok = par.free && tilesOK && money >= def.cost && st.slope <= MAX_SLOPE;
        showParcel(par, ok);
        const tint = ok ? 0x66ff88 : 0xff5555;
        ghost.traverse(o => { if (o.material && o.material.emissive) { o.material.emissive.setHex(tint); o.material.emissiveIntensity = 0.5; } });
        ghost.userData.buildable = ok;
        // Beschneiungsfläche einblenden, wenn eine Schneekanone platziert wird
        showSnowRange(ghost.userData.type, wx, wz, st.minY, ghostRot);
        // Fahrtrichtung anzeigen. Durchfahrts-Anlagen richten sich automatisch
        // in die Falllinie — der Pfeil zeigt deshalb bergab, nicht die Bau-Rotation.
        if (DIRECTED[ghost.userData.type]) {
            const run = pisteRunAt(gr0.gx, gr0.gy, DIRECTED[ghost.userData.type]);
            if (run) {
                // mittig auf die Pistenachse, in Fahrtrichtung
                const rx = run.gx * tile - half, rz = run.gy * tile - half;
                ghost.position.set(rx, yAtSmooth(run.gx, run.gy), rz);
                ghost.rotation.order = 'YXZ';
                ghost.rotation.y = run.rot;
                {   // Vorschau-Neigung entlang der Piste
                    const hl = DIRECTED[ghost.userData.type] * 0.5;
                    const yT = yAtSmooth(run.gx - run.dx * hl, run.gy - run.dy * hl), yB = yAtSmooth(run.gx + run.dx * hl, run.gy + run.dy * hl);
                    ghost.rotation.x = Math.atan2(yT - yB, DIRECTED[ghost.userData.type] * tile);
                    const hw = Math.max(2.5, def.r * 0.85) * 0.6, px2 = -run.dy, py2 = run.dx;
                    const yL = yAtSmooth(run.gx + px2 * hw, run.gy + py2 * hw), yR = yAtSmooth(run.gx - px2 * hw, run.gy - py2 * hw);
                    ghost.rotation.z = -Math.atan2(yL - yR, hw * 2 * tile);
                }
                showDirArrow(ghost.userData.type, rx, rz, yAtSmooth(run.gx, run.gy), run.rot);
                showParcel(par, money >= def.cost);
                ghost.userData.buildable = money >= def.cost;
                if (onBuildHint) onBuildHint(money >= def.cost ? '' : 'zu wenig Geld');
                const t2 = ghost.userData.buildable ? 0x66ff88 : 0xff5555;
                ghost.traverse(o => { if (o.material && o.material.emissive) { o.material.emissive.setHex(t2); o.material.emissive.setHex(t2); } });
            } else {
                // keine extrabreite Piste unter dem Cursor: nicht baubar
                if (onBuildHint) onBuildHint(runFailReason);
                if (onToast && runFailReason !== ghost.userData._lastReason) { ghost.userData._lastReason = runFailReason; onToast('Nicht baubar: ' + runFailReason); }
                hideDirArrow();
                ghost.userData.buildable = false;
                ghost.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(0xff5555); });
                showParcel(par, false);
            }
        } else {
            showDirArrow(ghost.userData.type, wx, wz, st.minY, ghostRot);
        }
    };
    /**
     * Lift zwischen zwei Geländepunkten bauen (Art: `liftKind`, Name/Lackierung: `pendingLift`).
     * Eigene Funktion, damit auch ein geladener Spielstand Lifte nachbauen kann.
     */
    const constructLift = (start, pt, cost) => {
        const grE = worldToGrid(pt.x, pt.z);
        const N = Math.max(8, Math.round(start.pt.distanceTo(pt) / 4));
        const samples = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            samples.push(yAtSmooth(start.gx + (grE.gx - start.gx) * t, start.gy + (grE.gy - start.gy) * t));
        }
        const a = new THREE.Vector3(start.pt.x, start.pt.y, start.pt.z);
        const b = new THREE.Vector3(pt.x, pt.y, pt.z);
        // Lackierung aus dem Baudialog — nur Gondel-/Kabinenbahnen
        const lo = (pendingLift && pendingLift.color != null)
            ? { ...liftOpts, cabinColor: pendingLift.color } : liftOpts;
        const lift = liftKind === 'chair' ? makeChairlift(a, b, samples, lo)
            : liftKind === 'chair2' ? makeChairlift2(a, b, samples, lo)
            : liftKind === 'chair6' ? makeChairlift6(a, b, samples, lo)
            : liftKind === 'platter' ? makePlatterLift(a, b, samples, lo)
            : liftKind === 'carpet' ? makeMagicCarpet(a, b, samples)
            : liftKind === 'tbar' ? makeSurfaceLift(a, b, samples, lo)
            : liftKind === 'tram' ? makeAerialTram(a, b, samples, { neonAd: nextNeonAd() })
            : liftKind === 'tramxl' ? makeAerialTramXL(a, b, samples, { ...lo, neonAd: nextNeonAd() })
            : liftKind === 'mega' ? makeMegaGondola(a, b, samples, { ...lo, neonAd: nextNeonAd() })
            : liftKind === 'gondola4' ? makeGondola4(a, b, samples, lo)
            : liftKind === 'gondola8' ? makeGondola8(a, b, samples, lo)
            : makeLift(a, b, samples, { maxMast: 14, ...lo });
        scene.add(lift.group); applyGlassEnv(lift.group); registerFlags(lift.group);
        if (lift.group.userData.setNight) nightLit.push(lift.group);
        // Bauphase: Gerüst/Kran an der Talstation, danach fährt der Lift an
        startConstruction(lift.group, 14, () => { updaters.push(lift.update); if (lift.setOccupancy) liftHandles.push(lift); },
            a.clone(), { a: a.clone(), b: b.clone() });
        // Felsen entlang der Trasse räumen — sonst verschwinden
        // Stützen und Stationen zwischen den Blöcken.
        if (rocks?.userData?.clearAlong) {
            rocks.userData.clearAlong(
                [{ gx: start.gx, gy: start.gy }, { gx: grE.gx, gy: grE.gy }], 4.5);
        }
        // Bodengebundene Lifte (Schlepplift): Wald roden + Boden beschneien entlang der Trasse
        if (liftKind === 'tbar') {
            const lane = [{ gx: start.gx, gy: start.gy }, { gx: grE.gx, gy: grE.gy }];
            clearForestAlongPath(lane);
            snowifyGroundAlongPath(lane, 3.0);
        }
        // Beide Stationen im Raster sperren
        for (const q of [start.pt, pt]) {
            const g9 = worldToTile(q.x, q.z);
            const n9 = footprintSize(2), o9 = parcelOrigin(g9.gx, g9.gy, n9);
            parcelClaim(o9.gx, o9.gy, n9, OCC_BUILD, 'lift');
        }
        // Gäste-Route: höherer Endpunkt = oben
        const s0 = { gx: start.gx, gy: start.gy }, s1 = { gx: grE.gx, gy: grE.gy };
        const topSt = yAtSmooth(s0.gx, s0.gy) >= yAtSmooth(s1.gx, s1.gy) ? s0 : s1;
        const botSt = topSt === s0 ? s1 : s0;
        const lp = LIFT_PARAMS[liftKind] || LIFT_PARAMS.chair;
        const route = makeLiftRoute(topSt, botSt, liftKind, lp);
        // BEIDE Stationen anklickbar machen — sonst gibt es keine Infos
        // zur Anlage, wenn man auf die Berg- oder Talstation klickt.
        for (const st2 of [start.pt, pt]) {
            addSelectable({ type: 'lift', cost, x: st2.x, z: st2.z, r: 3.0 });
        }
        route.name = (pendingLift && pendingLift.name) || nextLiftName(liftKind);
        route.model = lift;      // Fahrzeuge für die echte Sitzplatzvergabe
        guestRoutes.push(route);
        logAction({ a: 'l', k: liftKind, n: route.name, c: (pendingLift && pendingLift.color != null) ? pendingLift.color : null,
            ax: +start.pt.x.toFixed(2), az: +start.pt.z.toFixed(2), bx: +pt.x.toFixed(2), bz: +pt.z.toFixed(2) });
        pendingLift = null;
        money -= cost; built.lift++;
        if (onMoney) onMoney(money); emitStats();
        return true;
    };
    /** Finger: Bauvorschau an die angetippte Stelle setzen und zum Bestätigen vormerken. */
    const buildPending = (pt) => {
        if (!ghost) return;
        onMove({ __pt: pt.clone() });
        const gdef = BUILD_DEFS[ghost.userData.type];
        const cost = gdef ? gdef.cost : 0;
        setPending({ kind: 'build', pt: pt.clone(), cost, ok: !!ghost.userData.buildable,
            why: money < cost ? 'zu wenig Geld'
                : (DIRECTED[ghost.userData.type] && runFailReason) ? runFailReason
                : 'belegt, zu steil oder hier nicht erlaubt' });
    };
    /** Finger: Stand der gezeichneten Piste in der Bestätigen-Leiste zeigen. */
    const pistePending = (why) => {
        if (pistePts.length === 0) { setPending(why ? { kind: 'piste', ok: false, count: 0, why } : null); return; }
        const pc = pisteCostForPts(pistePts);
        const ok = pistePts.length >= 2 && money >= pc;
        setPending({ kind: 'piste', cost: pc, ok, count: pistePts.length,
            why: why || (pistePts.length < 2 ? 'noch ein Punkt nötig' : money < pc ? 'zu wenig Geld' : '') });
    };
    const onDown = (e) => {
        lastPointerType = e.pointerType || 'mouse';
        if (isTouchEvent(e)) {
            touchIds.add(e.pointerId);
            if (touchIds.size > 1) { gestureSeen = true; return; }   // zweiter Finger: Geste, kein Antippen
        }
        downX = e.clientX; downY = e.clientY;
    };
    /** Nach dem Loslassen aufräumen – als LETZTER pointerup-Lauscher, damit alle anderen den Stand noch sehen. */
    const onTouchEnd = (e) => {
        if (!isTouchEvent(e)) return;
        touchIds.delete(e.pointerId);
        if (touchIds.size === 0) gestureSeen = false;
    };
    const onUp = (e) => {
        if (!isTap(e)) return; // war Kamera-Drag oder Zwei-Finger-Geste
        const needConfirm = isTouchEvent(e) && !e.__confirmed;
        // --- STRASSEN-BAU (zwei Klicks: Start, dann Ende; danach weiter ab Endpunkt) ---
        if (roadMode) {
            const pt = pickPoint(e);
            if (!pt) return;
            const gr = worldToGrid(pt.x, pt.z);
            // ===== AUF GANZE KACHELN, ACHSENPARALLEL ODER 45° =====
            // Freie Winkel erzeugten Straßenbänder, die schräg über die
            // Kacheln liefen und Grundstücke anschnitten. Vom Startpunkt aus
            // wird deshalb auf die nächste Achse bzw. Diagonale gerundet.
            let sgx = Math.round(gr.gx), sgy = Math.round(gr.gy);
            if (roadStart) {
                const dx = sgx - roadStart.gx, dy = sgy - roadStart.gy;
                const ax = Math.abs(dx), ay = Math.abs(dy);
                if (ax > ay * 2.4)      sgy = roadStart.gy;                  // waagerecht
                else if (ay > ax * 2.4) sgx = roadStart.gx;                  // senkrecht
                else {                                                       // 45°
                    const d = Math.round((ax + ay) / 2);
                    sgx = roadStart.gx + Math.sign(dx) * d;
                    sgy = roadStart.gy + Math.sign(dy) * d;
                }
                sgx = Math.max(1, Math.min(gridSize - 2, sgx));
                sgy = Math.max(1, Math.min(gridSize - 2, sgy));
            }
            if (!roadStart) {
                roadStart = { gx: sgx, gy: sgy };
                const mp = worldPosSmooth(sgx, sgy);
                roadMarker = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xb45309, emissiveIntensity: 0.6 }));
                roadMarker.position.set(mp.x, mp.y + 0.4, mp.z); scene.add(roadMarker);
                if (isTouchEvent(e)) setPending({ kind: 'roadStart', ok: false });   // Finger: Zwischenstand zeigen, ✕ setzt zurück
                return;
            }
            const len = Math.hypot(sgx - roadStart.gx, sgy - roadStart.gy);
            const cost = Math.round(400 + len * ROAD_COST_PER);
            // Führt die Trasse über ein Gebäude? Dann gar nicht erst bauen —
            // "belegt ist belegt" gilt auch für Straßen.
            const blocked = (() => {
                const steps = Math.max(2, Math.round(len));
                for (let k = 0; k <= steps; k++) {
                    const f = k / steps;
                    const bx = Math.round(roadStart.gx + (sgx - roadStart.gx) * f);
                    const by = Math.round(roadStart.gy + (sgy - roadStart.gy) * f);
                    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++)
                        if (occAt(bx + ox, by + oy) === OCC_BUILD) return true;
                }
                return false;
            })();
            const roadOK = len >= 2 && !blocked && money >= cost && roadGradeOK(roadStart.gx, roadStart.gy, sgx, sgy);
            if (needConfirm) {
                onMove({ __pt: pt.clone() });              // Vorschau der Trasse bis zum angetippten Punkt
                setPending({ kind: 'road', pt: pt.clone(), cost, ok: roadOK,
                    why: len < 2 ? 'zu kurz' : blocked ? 'Gebäude im Weg' : money < cost ? 'zu wenig Geld' : 'zu steil' });
                return;
            }
            // Finger: nach dem Bestätigen geht es am Endpunkt weiter – das zeigt die Leiste wieder an
            if (e.__confirmed) setPending({ kind: 'roadStart', ok: false });
            if (roadOK) {
                addRoad(roadStart.gx, roadStart.gy, sgx, sgy, 3.6);
                logAction({ a: 'r', x0: roadStart.gx, y0: roadStart.gy, x1: sgx, y1: sgy });
                money -= cost; if (onMoney) onMoney(money); emitStats();
                recomputeCarPath();                                   // Autos nutzen das erweiterte Netz
                roadStart = { gx: sgx, gy: sgy };                     // ab Endpunkt weiterbauen (Kette)
                const mp = worldPosSmooth(sgx, sgy);
                if (roadMarker) roadMarker.position.set(mp.x, mp.y + 0.4, mp.z);
                // Vorschau des gerade gebauten Stücks wegräumen — sonst
                // liegt das grüne Band noch über der fertigen Straße.
                if (roadPreview) { scene.remove(roadPreview); roadPreview.userData.dispose?.(); roadPreview = null; }
            }
            return;
        }
        // --- LIFT-BAU (zwei Klicks) ---
        if (liftMode) {
            const pt = pickPoint(e);
            if (!pt) return;
            if (!liftStart) {
                const gr = worldToGrid(pt.x, pt.z);
                liftStart = { pt: pt.clone(), gx: gr.gx, gy: gr.gy };
                liftMarker = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.6 }));
                liftMarker.position.copy(pt); scene.add(liftMarker);
                if (isTouchEvent(e)) setPending({ kind: 'liftStart', ok: false });   // Finger: Zwischenstand zeigen, ✕ setzt zurück
                return;
            }
            // zweiter Klick: bauen
            const cost = liftCost(liftStart.pt, pt);
            if (needConfirm) {
                onMove({ __pt: pt.clone() });              // Vorschau der ganzen Anlage zum angetippten Punkt
                const longEnough = liftStart.pt.distanceTo(pt) > 6;
                setPending({ kind: 'lift', pt: pt.clone(), cost, ok: money >= cost && longEnough,
                    why: !longEnough ? 'zu kurz' : 'zu wenig Geld' });
                return;
            }
            if (money >= cost && liftStart.pt.distanceTo(pt) > 6) constructLift(liftStart, pt, cost);
            // aufräumen + abwählen
            if (liftMarker) { scene.remove(liftMarker); liftMarker = null; }
            if (liftPreview) { scene.remove(liftPreview); liftPreview = null; }
            liftStart = null; liftMode = false;
            if (onBuildDone) onBuildDone();
            return;
        }
        // --- PISTEN-BAU: Wegpunkt setzen (Einzelklick), Doppelklick beendet ---
        if (pisteMode) {
            const pt = pickPoint(e);
            if (!pt) return;
            const gr = worldToGrid(pt.x, pt.z);
            const np = { gx: gr.gx, gy: gr.gy };
            // Regeln: kein Wasser/Fels, nicht bergauf > 5°
            const pointOK = pistePts.length === 0 ? isBuildableGround(np.gx, np.gy) : segmentValid(pistePts[pistePts.length - 1], np);
            if (!pointOK) {
                // Mit der Maus zeigt die rote Vorschaulinie, dass es hier nicht geht – am Handy sagt es die Leiste.
                if (isTouchEvent(e)) pistePending('hier nicht möglich (bergauf, Wasser oder Fels)');
                return; // ungültiges Segment -> ignorieren
            }
            pistePts.push(np);
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfcd34d, emissive: 0xf59e0b, emissiveIntensity: 0.5 }));
            dot.position.copy(pt); scene.add(dot); pisteDots.push(dot);
            refreshPistePreview(null);
            // Finger: statt Doppelklick beendet ein Knopf im HUD die Piste
            if (isTouchEvent(e)) pistePending();
            return;
        }
        // --- GEBÄUDE-BAU ---
        if (!currentBuild || !ghost) return;
        const pt = pickPoint(e);
        if (!pt) return;
        if (needConfirm) { buildPending(pt); return; }
        const gr0 = worldToGrid(pt.x, pt.z);
        placeBuildingAt(ghost.userData.type, gr0);
    };
    /**
     * Gebäude an Rasterposition setzen — die komplette Baulogik in EINER
     * Funktion, damit sie auch ohne Maus (Tests) durchlaufen werden kann.
     * Liefert true, wenn gebaut wurde.
     */
    const placeBuildingAt = (type, gr0) => {
        const def = BUILD_DEFS[type];
        if (!def) return false;
        const par = snapToParcel(gr0.gx, gr0.gy, def.r);
        let gr = { gx: par.gx, gy: par.gy };
        let wx = par.x, wz = par.z;
        // Durchfahrts-Anlagen: nur auf extrabreiter Piste, Mitte auf der Pistenachse
        const run = DIRECTED[type] ? pisteRunAt(gr0.gx, gr0.gy, DIRECTED[type]) : null;
        if (DIRECTED[type]) {
            if (!run || money < def.cost) return false;
            gr = { gx: run.gx, gy: run.gy };
            wx = run.gx * tile - half; wz = run.gy * tile - half;
        }
        const st = footprintStats(gr.gx, gr.gy, def.r * 0.8);
        let tilesOK2 = true;
        for (let yy = par.oy; yy < par.oy + par.n && tilesOK2; yy++)
            for (let xx = par.ox; xx < par.ox + par.n; xx++)
                if (!tileBuildable(xx, yy)) { tilesOK2 = false; break; }
        if (!DIRECTED[type] && (!par.free || !tilesOK2 || money < def.cost || st.slope > MAX_SLOPE)) return false;
        const g = def.make();
        // ===== STANDFLÄCHE =====
        // Eine flache, leicht überstehende Platte unter dem Gebäude. Sie fängt
        // Restunebenheiten ab, sodass nie eine Ecke im Schnee verschwindet.
        if (!DIRECTED[type] && type !== 'road') {
            const padR = Math.max(1.2, def.r * 1.05);
            const pad = new THREE.Mesh(
                new THREE.CylinderGeometry(padR, padR * 1.06, 0.22, 20),
                new THREE.MeshStandardMaterial({ color: 0xeef3fa, roughness: 0.92 }));
            pad.position.y = -0.06;          // Oberkante knapp über Grund
            pad.receiveShadow = true;
            g.add(pad);
            // Merken, damit der Vorplatz mit dem Untergrund mitfärbt: auf Schnee
            // hell, auf getauter Wiese ein gräulicher Vorplatz statt weißem Fleck.
            buildingPads.push({ mat: pad.material, gx: gr.gx, gy: gr.gy });
        }
        // Normale Gebäude rasten auf 90° ein; Durchfahrtsanlagen (Funpark,
        // Kicker, Rennstrecke) behalten ihre Falllinien-Ausrichtung, weil sie
        // sonst quer zum Hang stünden.
        let placeRot = snapYaw(ghostRot);
        // Parkflächen übernehmen die Ausrichtung zur Straße aus der Vorschau
        if (type === 'parking' || type === 'parkgarage') {
            const dk = findRoadDock(gr.gx, gr.gy);
            if (dk) placeRot = dk.yaw;
        }
        let placeY = st.minY;
        if (DIRECTED[type]) {
            // ===== DURCHFAHRTS-ANLAGEN =====
            // Funpark, Kicker, Halfpipe und Rennstrecke werden von OBEN NACH
            // UNTEN durchfahren. Sie richten sich deshalb automatisch in die
            // Falllinie und werden als geneigte Rinne ins Gelände eingebettet,
            // statt waagerecht obenauf zu sitzen.
            // Richtung = Pistenverlauf bergab (pisteRunAt), nicht die Falllinie
            const fall = run ? { rot: run.rot, dx: run.dx, dy: run.dy } : fallLineAt(gr.gx, gr.gy, DIRECTED[type]);
            placeRot = fall.rot;
            const sculptFn = SCULPT[type] || null;
            // Diagnose (Konsole): Höhe von Heightmap UND Mesh an der Anlagenmitte vor/nach dem Modellieren
            const _vi = Math.round(gr.gy) * gridSize + Math.round(gr.gx);
            const _pa = terrain.geometry.attributes.position;
            const _before = { hm: +(heightmap[_vi] * hScale).toFixed(2), mesh: +_pa.getY(_vi).toFixed(2) };
            let strip;
            try {
                strip = flattenRunStrip(gr.gx, gr.gy, fall, DIRECTED[type], def.r, sculptFn);
            } catch (err) {
                console.error('[Anlage] Fehler beim Modellieren des Geländes:', err);
                if (onToast) onToast('FEHLER beim Modellieren: ' + (err && err.message));
                strip = { midY: yAtSmooth(gr.gx, gr.gy), pitch: 0, roll: 0 };
            }
            {
                const after = { hm: +(heightmap[_vi] * hScale).toFixed(2), mesh: +_pa.getY(_vi).toFixed(2) };
                const msg = 'Diagnose ' + type + ': Mitte (' + Math.round(gr.gx) + ',' + Math.round(gr.gy) + ') · Höhe vorher ' + _before.hm + ' / Mesh ' + _before.mesh
                    + ' → nachher ' + after.hm + ' / Mesh ' + after.mesh + ' · sculpt ' + !!sculptFn + ' · plane ' + !!(sculptFn && sculptFn.plane) + ' · v' + _pa.version + ' · Gletscher ' + (world.landcover[_vi] === 8 ? 'JA (nachgesetzt)' : 'nein');
                console.log('[Anlage] ' + msg);
                if (onToast) onToast(msg);
            }
            placeY = strip.midY;
            // Die Form steckt jetzt im Gelände; die Ausstattung (Tore, Banner,
            // Marker, Rails) wird NICHT als Ganzes gekippt, sondern jedes
            // Element einzeln auf die Pistenoberfläche gesetzt (siehe unten).
            g.rotation.order = 'YXZ';
            g.rotation.x = 0; g.rotation.z = 0;
            // Halfpipe: zusätzlich eine gekrümmte Schale (Boden, Walls, Decks
            // mit blauen Kanten) IN der Geländemulde — die weiche Mulde allein
            // ist im Schnee kaum zu erkennen. Die Schale folgt dem Hang (Nicken/
            // Wanken), ihre Decks liegen auf dem Pistenniveau.
            if (type === 'halfpipe') {
                const shell = makeHalfpipeShell(15);
                shell.rotation.order = 'YXZ';
                // Wanken NEGATIV: lokal +x zeigt nach −quer (siehe alignToSlope)
                shell.rotation.x = strip.pitch; shell.rotation.z = -(strip.roll || 0);
                shell.position.set(0, -(shell.userData.pipeR) - 0.04, 0);   // Deckoberkante ≈ Pistenniveau (bündig im Schnee)
                g.add(shell);
            }
            // Pistenbett unter der Anlage nachziehen (Schnee liegt jetzt tiefer/geneigt)
            {
                // Schneebänder ALLER Pisten im Bereich der Anlage nachziehen bzw.
                // ausblenden — nicht nur das der Zielpiste. Liegt eine zweite
                // (überlappend gezogene oder kreuzende) Piste über der Pipe,
                // deckte deren Band die Mulde sonst weiter zu.
                const hl = DIRECTED[type] * 0.5, sculpted = !!SCULPT[type] && type !== 'racecourse';
                const hideFn = sculpted
                    ? (gx2, gy2) => {
                        const ax = gx2 - gr.gx, ay = gy2 - gr.gy;
                        const along = ax * fall.dx + ay * fall.dy, across = -ax * fall.dy + ay * fall.dx;
                        return Math.abs(along) <= hl + 3 && Math.abs(across) <= (type === 'halfpipe' ? 7.5 : def.r + 1.5);
                    }
                    : null;
                for (const rt2 of guestRoutes) {
                    if (rt2.kind !== 'piste' || !rt2.bed?.reseat) continue;
                    rt2.bed.reseat(gr.gx, gr.gy, hl + def.r + 6, hideFn);
                }
            }
            // An der Piste registrieren: Skifahrer, die hier vorbeikommen,
            // fahren DURCH die Anlage (Halfpipe-Walls, Sprünge, Torlauf).
            if (run?.rt) {
                if (!run.rt.runs) run.rt.runs = [];
                run.rt.runs.push({ type, s0: run.s0, s1: run.s1, sMid: run.sMid, mesh: g, strip, gx: gr.gx, gy: gr.gy, dx: fall.dx, dy: fall.dy, hl: DIRECTED[type] * 0.5, r: def.r });
            }
        } else {
            // Gelände sanft an das Gebäude anpassen (kein halbes Versinken im Hang)
            flattenUnderBuilding(gr.gx, gr.gy, def.r, st.minY);
        }
        g.position.set(wx, placeY + 0.05, wz);   // knapp über Grund, nie darin
        g.rotation.y = placeRot; // Planungs-Rotation bzw. Falllinie übernehmen
        scene.add(g); applyGlassEnv(g);
        // Durchfahrts-Anlagen: jedes Ausstattungselement auf seine eigene
        // Geländehöhe setzen (userData.ground) — so steht nichts in der Luft
        // oder im Schnee, auch wenn der Hang gewölbt ist.
        if (DIRECTED[type]) {
            const cy = Math.cos(placeRot), sy = Math.sin(placeRot);
            const seat = (node, ox, oz) => {
                node.traverse((ch) => {
                    if (!ch.userData?.ground) return;
                    const lx = ch.position.x + ox, lz = ch.position.z + oz;   // lokal (inkl. Gruppenversatz)
                    const wx2 = wx + lx * cy + lz * sy, wz2 = wz - lx * sy + lz * cy;
                    const gy2 = yAtSmooth((wx2 + half) / tile, (wz2 + half) / tile);
                    ch.position.y = gy2 - g.position.y + (ch.userData.lift || 0) + 0.02;
                });
            };
            seat(g, 0, 0);
            // Stadion-Strahler der Anlage ans Nachtlicht hängen
            g.traverse((ch) => { if (ch.userData?.lampMat && ch.userData?.isFlood) floodlights.push(ch.userData); });
        }
        // Für ein Gebäude muss der Wald weichen: Bäume im Baufeld werden
        // gerodet (inkl. ihrer Schneehauben), sonst wachsen Fichten durch
        // Dach und Terrasse.
        {
            const cg = { gx: (wx + half) / tile, gy: (wz + half) / tile };
            const rr = def.r + 1.2;
            clearForestAlongPath([
                { gx: cg.gx - rr * 0.5, gy: cg.gy },
                { gx: cg.gx + rr * 0.5, gy: cg.gy }
            ]);
            if (rocks?.userData?.clearAlong) {
                rocks.userData.clearAlong([{ gx: cg.gx - rr * 0.5, gy: cg.gy },
                                           { gx: cg.gx + rr * 0.5, gy: cg.gy }], rr * 0.8);
            }
        }
        // Bauphase: Gebäude wächst mit Gerüst hoch, danach Betrieb (Rauch/Animation)
        startConstruction(g, 9, () => { if (g.userData.update) updaters.push(g.userData.update); });
        const rec = { x: wx, z: wz, r: def.r };
        // Parzelle belegen und am Gebäude vermerken, damit der Abriss sie
        // exakt wieder freigeben kann.
        parcelClaim(par.ox, par.oy, par.n, OCC_BUILD, type);
        registerFlags(g);                         // Fahnen wehen im Wind
        // Vorderseite merken (Richtung, in die das Gebäude schaut) — dort
        // sitzen später die Gäste an den Tischen, nicht hinter dem Haus.
        const frontX = Math.sin(placeRot), frontY = Math.cos(placeRot);
        placedBuildings.push({ mesh: g, cost: def.cost, rec, type, frontX, frontY, radius: def.r,
                               parcel: { ox: par.ox, oy: par.oy, n: par.n } });
        if (built[type] !== undefined) built[type]++;
        // Neuer Parkplatz/Parkhaus -> als Auto-Ziel registrieren (wenn per Straße verbunden)
        if (type === 'parking' || type === 'parkgarage') {
            const pry2 = g.rotation.y, padY2 = st.minY + 0.14;
            // Parkhaus: große Kapazität -> viele Stellplätze auf dem Vorplatz
            const cols = type === 'parkgarage' ? [-5, -3, -1, 1, 3, 5] : [-3.5, -1.75, 0, 1.75, 3.5];
            const zz = type === 'parkgarage' ? 6 : 2.5;
            const toWorld = (cx, z2) => ({ x: wx + cx * Math.cos(pry2) + z2 * Math.sin(pry2), z: wz - cx * Math.sin(pry2) + z2 * Math.cos(pry2) });
            const spots = type === 'parkgarage'
                ? cols.flatMap(cx => [toWorld(cx, zz), toWorld(cx, zz + 2.4)])   // zwei Reihen = doppelte Kapazität
                : cols.map(cx => toWorld(cx, zz));
            const lot = { gx: gr.gx, gy: gr.gy, padY: padY2, spots, cap: spots.length * 10, occ: 0, basePrice: type === 'parkgarage' ? 20 : 10, price: null, income: 0, ticketPos: mainTicketPos,
                          rowYaw: pry2 };
            // ===== EINFAHRT ZUR STRASSE =====
            // Liegt eine Straße in der Nähe, wird automatisch eine kurze
            // Stichstraße dorthin gebaut. Ohne sie hätte der Parkplatz keine
            // `roadPath` und es käme trotz Bau kein einziges Auto an.
            const dock = findRoadDock(gr.gx, gr.gy, 10);
            if (dock) {
                // Der Stich beginnt an der PADKANTE, nicht in der Mitte —
                // sonst läuft die Straße über die Stellplätze.
                const ddx = dock.gx - gr.gx, ddy = dock.gy - gr.gy;
                const dl = Math.hypot(ddx, ddy) || 1;
                const edgeOff = type === 'parkgarage' ? 5.4 : 4.0;
                const sx0 = gr.gx + (ddx / dl) * edgeOff, sy0 = gr.gy + (ddy / dl) * edgeOff;
                if (dl > edgeOff + 0.8) {
                    const stubP = addRoad(sx0, sy0, dock.gx, dock.gy, 3.0);
                    // Fahrweg: Stich + Straße bis zur eigenen Einfahrt. Wird
                    // unten von recomputeCarPath auf Kachelbasis vervollständigt;
                    // der Stich sorgt dafür, dass die Autos an der Padkante
                    // starten und nicht mitten auf dem Platz.
                    lot._stub = stubP;
                }
            }
            // Nächste Randeinfahrt als eigene merken, damit die Autos nicht
            // quer über die Karte zu einer fremden Zufahrt fahren.
            {
                // Variable NICHT `e` nennen — in dieser Datei heißt der
                // Event-Parameter so, und der TDZ-Prüfer verwechselt beides.
                let nah = null, nd2 = Infinity;
                for (const ent2 of roadEntries) {
                    const d2 = Math.hypot(ent2.gx - gr.gx, ent2.gy - gr.gy);
                    if (d2 < nd2) { nd2 = d2; nah = ent2; }
                }
                if (nah) lot.entryKey = nah.key;
            }
            parkingLots.push(lot);
            addSelectable({ type, cost: def.cost, x: wx, z: wz, r: def.r, lot });
            recomputeCarPath();
            // Ticketschalter des nächstgelegenen Ortes zuweisen, damit die
            // Gäste nicht quer über die Karte zur Hauptkasse laufen.
            {
                let bestT = null, btd = 1e9;
                for (const b of placedBuildings) {
                    if (b.type !== 'ticket') continue;
                    const d = Math.hypot(b.rec.x - wx, b.rec.z - wz);
                    if (d < btd) { btd = d; bestT = b; }
                }
                if (bestT) lot.ticketPos = { x: bestT.rec.x, z: bestT.rec.z };
            }
        } else {
            addSelectable({ type, cost: def.cost, x: wx, z: wz, r: def.r });
            // Garage gebaut -> Raupen starten und enden hier
            if (type.startsWith('garage')) {
                garagePos = { gx: gr.gx, gy: gr.gy };
                garageReady = false;                 // Fahrzeuge bleiben drin,
                // bis der Rohbau steht — die Bauphase dauert 9 Sekunden.
                setTimeout(() => { garageReady = true; }, 9200);
            }
            // Schneekanone: Richtung merken und den Sektor sofort beschneien
            if (CANNON_RANGE[type]) {
                cannons.push({ gx: gr.gx, gy: gr.gy, rot: ghostRot, range: CANNON_RANGE[type], type });
                applySnowmaking();
            }
            // Neuer Stausee -> vorhandene Kanonen bekommen Wasser und beschneien nach
            if (type === 'reservoir' || type === 'reservoir_l') { applySnowmaking(); repaintSnowCover(); }
        }
        money -= def.cost;
        if (onMoney) onMoney(money); emitStats();
        currentBuild = null;
        showParcelGrid(false);                       // Baumodus beendet -> Raster aus
        hideSnowRange(); hideDirArrow();
        if (ghost) { scene.remove(ghost); ghost = null; }
        logAction({ a: 'b', t: type, x: +gr0.gx.toFixed(3), y: +gr0.gy.toFixed(3), r: +ghostRot.toFixed(4) });
        if (onBuildDone) onBuildDone();
        return true;
    };

    // ===== ABRISS-MODUS =====
    let demolishMode = false;
    let onBuildDone = null;
    let onBuildHint = null;      // Grund, warum gerade nicht gebaut werden kann (HUD)
    let onToast = null;          // kurze Meldung im HUD (Diagnose)
    const onDemolish = (e) => {
        if (!demolishMode) return;
        if (!isTap(e)) return;
        const pt = pickPoint(e);
        if (!pt) return;
        // nächstes gebautes Gebäude in Reichweite finden
        let best = -1, bestD = 1e9;
        placedBuildings.forEach((b, i) => {
            const d = Math.hypot(b.rec.x - pt.x, b.rec.z - pt.z);
            if (d < b.rec.r + 1 && d < bestD) { bestD = d; best = i; }
        });
        if (best < 0) { if (isTouchEvent(e)) setPending(null); return; }
        // Finger: ein Fehltipper soll kein Hotel kosten – erst nachfragen
        if (isTouchEvent(e)) {
            const b = placedBuildings[best];
            setPending({ kind: 'demolish', building: b, cost: -Math.round((b.cost || 0) * 0.6), ok: true });
            return;
        }
        demolishIndex(best);
    };
    /** Gebäude mit Index in placedBuildings abreißen (auch ohne Maus, für Tests). */
    const demolishIndex = (best) => {
        const b = placedBuildings[best];
        if (!b) return false;
        scene.remove(b.mesh);
        // Parzelle wieder freigeben — beim Abriss muss das Grundstück
        // vollständig zurück ins Raster, sonst bleibt es für immer gesperrt.
        if (b.parcel) parcelRelease(b.parcel.ox, b.parcel.oy, b.parcel.n);
        else {
            const g5 = worldToTile(b.rec.x, b.rec.z), n5 = footprintSize(b.rec.r);
            const o5 = parcelOrigin(g5.gx, g5.gy, n5);
            parcelRelease(o5.gx, o5.gy, n5);
        }
        placedBuildings.splice(best, 1);
        if (b.type && built[b.type] !== undefined) built[b.type]--;
        // Durchfahrts-Anlage: Registrierung an der Piste lösen (sonst bleibt der
        // Abschnitt für immer „belegt“), Schneeband wieder hochholen, Gelände
        // zurücksetzen
        if (DIRECTED[b.type]) {
            for (const rt2 of guestRoutes) {
                if (rt2.kind !== 'piste' || !rt2.runs) continue;
                const idx = rt2.runs.findIndex(x => x.mesh === b.mesh);
                if (idx < 0) continue;
                const rn = rt2.runs[idx];
                rt2.runs.splice(idx, 1);
                restoreRunStrip(rn.gx, rn.gy, rn.strip);
                const inside = (gx2, gy2) => {
                    const ax = gx2 - rn.gx, ay = gy2 - rn.gy;
                    const along = ax * rn.dx + ay * rn.dy, across = -ax * rn.dy + ay * rn.dx;
                    return Math.abs(along) <= rn.hl + 3 && Math.abs(across) <= (b.type === 'halfpipe' ? 7.5 : rn.r + 1.5);
                };
                for (const rt3 of guestRoutes) {
                    if (rt3.kind !== 'piste' || !rt3.bed?.reseat) continue;
                    if (rt3.bed.hidden) {
                        const grid = rt3.bed.grid;
                        for (const i of [...rt3.bed.hidden]) if (inside(grid[i * 2], grid[i * 2 + 1])) rt3.bed.hidden.delete(i);
                    }
                    rt3.bed.reseat(rn.gx, rn.gy, rn.hl + rn.r + 6, null);
                }
                break;
            }
        }
        // zugehöriges Selectable + Parkplatz-Lot entfernen
        const si = selectables.findIndex(s => Math.abs(s.x - b.rec.x) < 0.6 && Math.abs(s.z - b.rec.z) < 0.6);
        if (si >= 0) {
            const rl = selectables[si].lot; selectables.splice(si, 1);
            if (rl) { const li = parkingLots.indexOf(rl); if (li >= 0) parkingLots.splice(li, 1); recomputeCarPath(); }
        }
        selectedSel = null; if (onSelect) onSelect(null);
        money += Math.round(b.cost * 0.6); // 60% Erstattung
        if (onMoney) onMoney(money); emitStats();
        logAction({ a: 'd', t: b.type, x: +b.rec.x.toFixed(2), z: +b.rec.z.toFixed(2) });
        return true;
    };
    // ===== INFO-AUSWAHL: Gebäude/Parkplatz anklicken -> Infofeld =====
    const onPick = (e) => {
        if (currentBuild || demolishMode || liftMode || pisteMode || roadMode) return;
        if (!isTap(e)) return;  // war Kamera-Drag oder Zwei-Finger-Geste
        const pt = pickPoint(e);
        // Zuerst Menschen prüfen (Gäste sind anklickbar) — direkter Mesh-Raycast
        const ptr = new THREE.Vector2(
            ((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1,
            -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1);
        raycaster.setFromCamera(ptr, camera);
        let pickedGuest = null, pgD = 1e9;
        for (const g of clickableGuests) {
            if (!g.mesh.visible) continue;
            const hit = raycaster.intersectObject(g.mesh, true)[0];
            if (hit && hit.distance < pgD) { pgD = hit.distance; pickedGuest = g; }
        }
        if (!pickedGuest) {
            // Fallback: Figuren sind klein — nächster Gast im Bildschirm-Umkreis
            let bestPx = 48;   // großzügiger Trefferradius — Figuren sind klein
            const r = canvas.getBoundingClientRect();
            for (const g of clickableGuests) {
                if (!g.mesh.visible) continue;
                const sp = g.mesh.position.clone().project(camera);
                const sx2 = (sp.x * 0.5 + 0.5) * r.width, sy2 = (-sp.y * 0.5 + 0.5) * r.height;
                const d = Math.hypot(sx2 - (e.clientX - r.left), sy2 - (e.clientY - r.top));
                if (sp.z < 1 && d < bestPx) { bestPx = d; pickedGuest = g; }
            }
        }
        if (pickedGuest) {
            selectedSel = { type: 'guest', guest: pickedGuest, x: pickedGuest.mesh.position.x, z: pickedGuest.mesh.position.z, r: 1 };
            if (onSelect) onSelect(infoFor(selectedSel));
            return;
        }
        // ===== GEBÄUDE TREFFEN — DREI STUFEN =====
        // 1) echter Mesh-Raycast auf alle Bauten
        // 2) Bildschirmnähe zum Gebäudemittelpunkt (wie bei den Gästen)
        // 3) erst zuletzt der Bodenpunkt unter dem Zeiger
        //
        // Stufe 1 allein reichte nicht: der Start-Lift ist EIN riesiges
        // Objekt, das quer über den halben Hang reicht. Sein Talstations-
        // gebäude steht direkt neben der Kasse und wurde bei fast jedem
        // Klick zuerst getroffen. Deshalb gewinnt bei annähernd gleicher
        // Entfernung jetzt das KLEINERE Objekt.
        const rectC = canvas.getBoundingClientRect();
        const selIndexOf = (b) =>
            selectables.findIndex(s => Math.hypot(s.x - b.rec.x, s.z - b.rec.z) < 1.2);
        let best = -1, bestD = 1e9;
        {
            const hits = [];
            for (const b of placedBuildings) {
                if (!b.mesh || b.mesh.visible === false) continue;
                const hit = raycaster.intersectObject(b.mesh, true)[0];
                if (hit) hits.push({ b, d: hit.distance, r: b.rec?.r ?? 3 });
            }
            if (hits.length) {
                hits.sort((p1, p2) => p1.d - p2.d);
                const near = hits[0].d;
                // alles, was fast gleich weit vorn liegt, gilt als gleichwertig —
                // darunter gewinnt der kleinste Grundriss
                let pick = hits[0];
                for (const h of hits) {
                    if (h.d > near + 4.0) break;
                    if (h.r < pick.r) pick = h;
                }
                const si2 = selIndexOf(pick.b);
                if (si2 >= 0) { best = si2; bestD = 0; }
            }
        }
        // Stufe 2: Bildschirmnähe. Kleine Bauten wie die Kasse verschwinden
        // hinter Bäumen, Schnee und Gästen — ein Klick in ihre Nähe soll
        // trotzdem sitzen.
        if (best < 0) {
            let bestPx2 = 40;
            for (let i = 0; i < selectables.length; i++) {
                const sSel = selectables[i];
                const y2 = yAtSmooth((sSel.x + half) / tile, (sSel.z + half) / tile);
                const sp = new THREE.Vector3(sSel.x, y2 + 1.0, sSel.z).project(camera);
                if (sp.z >= 1) continue;
                const sx3 = (sp.x * 0.5 + 0.5) * rectC.width;
                const sy3 = (-sp.y * 0.5 + 0.5) * rectC.height;
                const d = Math.hypot(sx3 - (e.clientX - rectC.left), sy3 - (e.clientY - rectC.top));
                if (d < bestPx2) { bestPx2 = d; best = i; bestD = 0; }
            }
        }
        if (best < 0 && !pt) { selectedSel = null; if (onSelect) onSelect(null); return; }
        // Stufe 3: nächstes Objekt zum Bodenpunkt
        if (best < 0) {
            selectables.forEach((sSel, i) => {
                const d = Math.hypot(sSel.x - pt.x, sSel.z - pt.z);
                if (d < sSel.r + 2.4 && d < bestD) { bestD = d; best = i; }
            });
        }
        selectedSel = best >= 0 ? selectables[best] : null;
        // Bei einer angeklickten Schneekanone ihren Beschneiungssektor zeigen
        if (selectedSel && CANNON_RANGE[selectedSel.type]) {
            const c = cannons.find(cc => Math.abs(cc.gx * tile - half - selectedSel.x) < 1.2
                && Math.abs(cc.gy * tile - half - selectedSel.z) < 1.2);
            showSnowRange(selectedSel.type, selectedSel.x, selectedSel.z,
                yAtSmooth((selectedSel.x + half) / tile, (selectedSel.z + half) / tile), c ? c.rot : 0, true);
        } else hideSnowRange();
        // Bei angeklickter Richtungsanlage ihre Fahrtrichtung zeigen
        if (selectedSel && DIRECTED[selectedSel.type]) {
            const pb = placedBuildings.find(b => Math.abs(b.rec.x - selectedSel.x) < 1.2 && Math.abs(b.rec.z - selectedSel.z) < 1.2);
            showDirArrow(selectedSel.type, selectedSel.x, selectedSel.z,
                yAtSmooth((selectedSel.x + half) / tile, (selectedSel.z + half) / tile),
                pb ? Math.atan2(pb.frontX, pb.frontY) : 0);
        } else hideDirArrow();
        if (onSelect) onSelect(selectedSel ? infoFor(selectedSel) : null);
    };
    // Wird auch bei jedem Werkzeugwechsel aufgerufen – eine vorgemerkte Aktion gilt dann nicht mehr.
    const deselect = () => { selectedSel = null; if (onSelect) onSelect(null); if (pending) setPending(null); };
    const endLift = () => { liftMode = false; liftStart = null; if (liftMarker) { scene.remove(liftMarker); liftMarker = null; } if (liftPreview) { scene.remove(liftPreview); liftPreview = null; } liftPreviewKey = ''; };
    const endPiste = () => { pisteMode = false; clearPisteDraft(); };
    /** Gezeichnete Piste bauen und den Pistenmodus beenden (Doppelklick bzw. „Fertig" am Handy). */
    const finishPiste = () => {
        if (!pisteMode) return;
        const cost = pisteCostForPts(pistePts);
        if (pistePts.length >= 2 && money >= cost) {
            const ok = buildPistePath(pistePts);
            if (ok) {
                money -= cost; if (onMoney) onMoney(money); emitStats();
                logAction({ a: 'p', w: pisteWidth, lit: pisteLit, pts: pistePts.map(q => [+q.gx.toFixed(2), +q.gy.toFixed(2)]) });
            }
        }
        clearPisteDraft();
        pisteMode = false;
        if (onBuildDone) onBuildDone();
    };
    const onDblClick = (e) => {
        if (!pisteMode) return;
        e.preventDefault();
        if (lastPointerType !== 'mouse') return;       // am Handy beendet der Knopf im HUD, nicht der Doppeltipp
        finishPiste();
    };
    /** Bestätigung aus dem HUD (Finger): die vorgemerkte Aktion jetzt ausführen. */
    const confirmPending = () => {
        const p = pending;
        if (!p || !p.ok) return;
        setPending(null);
        if (p.kind === 'piste') { finishPiste(); return; }
        if (p.kind === 'demolish') { const i = placedBuildings.indexOf(p.building); if (i >= 0) demolishIndex(i); return; }
        onUp({ __confirmed: true, __pt: p.pt, pointerType: 'touch', clientX: 0, clientY: 0 });
    };
    /** Vorgemerkte Aktion verwerfen; das Werkzeug bleibt aktiv, man kann neu antippen. */
    const cancelPending = () => {
        const p = pending;
        if (!p) return;
        setPending(null);
        if (p.kind === 'piste') { clearPisteDraft(); }                // Entwurf weg, Werkzeug bleibt: neu ansetzen
        else if (p.kind === 'lift' || p.kind === 'liftStart') {
            // zurück auf Anfang: die Talstation wird neu gesetzt
            if (liftMarker) { scene.remove(liftMarker); liftMarker = null; }
            if (liftPreview) { scene.remove(liftPreview); liftPreview = null; }
            liftPreviewKey = '';
            liftStart = null;
        } else if (p.kind === 'road') {
            // nur das angetippte Stück verwerfen – der Startpunkt bleibt stehen
            if (roadPreview) { scene.remove(roadPreview); roadPreview.userData.dispose?.(); roadPreview = null; }
            setPending({ kind: 'roadStart', ok: false });
        } else if (p.kind === 'roadStart') {
            roadStart = null;
            if (roadMarker) { scene.remove(roadMarker); roadMarker = null; }
            if (roadPreview) { scene.remove(roadPreview); roadPreview.userData.dispose?.(); roadPreview = null; }
        } else if (p.kind === 'build') {
            if (ghost) ghost.visible = false;
            hideSnowRange(); hideDirArrow(); showParcel(null, false);
        }
    };
    /** Finger: letzten gesetzten Pistenpunkt zurücknehmen. */
    const undoPistePoint = () => {
        if (!pisteMode || pistePts.length === 0) return;
        pistePts.pop();
        const d = pisteDots.pop();
        if (d) scene.remove(d);
        refreshPistePreview(null);
        pistePending();
    };
    /** Finger: vorgemerktes Gebäude um 90° drehen (ersetzt die Tasten Q/E). */
    const rotateBuild = () => {
        if (!ghost) return;
        rotateGhost(Math.PI / 2);
        if (pending && pending.kind === 'build') buildPending(pending.pt);
    };
    // Vorschau beim Darüberfahren gibt es nur mit der Maus; der Finger setzt sie durch Antippen.
    const onHover = (e) => { if (!isTouchEvent(e)) onMove(e); };
    canvas.addEventListener('pointermove', onHover);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerup', onDemolish);
    canvas.addEventListener('pointerup', onPick);
    canvas.addEventListener('pointerup', onTouchEnd);
    canvas.addEventListener('pointercancel', onTouchEnd);
    canvas.addEventListener('dblclick', onDblClick);

    // ===== SPIELSTAND: SICHERN UND LADEN =====
    const SIM_KEYS = ['served', 'revenue', 'satisfaction', 'dayProfit', 'bestDayProfit', 'dayAcc', 'dayRevenue',
                      'dayCost', 'groom', 'reput', 'attract', 'mood', 'carGuestsToday'];
    /** Aktueller Spielstand als schlichtes Objekt (JSON-tauglich). */
    const getSave = () => {
        const simOut = {};
        for (const k of SIM_KEYS) if (Number.isFinite(sim[k])) simOut[k] = +sim[k].toFixed(3);
        return {
            v: 1, level: level?.id || '', t: Date.now(),
            money: Math.round(money), played: Math.round(playSeconds),
            sim: simOut,
            eco: { skiPass: eco.skiPass, ad: { id: eco.ad.id, daysLeft: eco.ad.daysLeft } },
            lots: parkingLots.filter(l => l.price != null).map(l => ({ x: +l.gx.toFixed(1), y: +l.gy.toFixed(1), p: l.price })),
            // Kurzfassung für die Anzeige im Menü: was der Spieler selbst gebaut hat
            sum: {
                lifts: saveLog.filter(a => a.a === 'l').length,
                buildings: Math.max(0, saveLog.filter(a => a.a === 'b').length - saveLog.filter(a => a.a === 'd').length),
                km: +piste.total.toFixed(1), revenue: Math.round(sim.revenue)
            },
            log: saveLog.slice()
        };
    };
    /**
     * Spielstand laden: die gemerkten Aktionen der Reihe nach nachbauen, dann Kontostand
     * und Kennzahlen übernehmen. Was sich nicht mehr bauen lässt (etwa nach einer
     * Änderung am Spiel), wird übersprungen – der Rest bleibt erhalten.
     */
    const loadSave = (data) => {
        if (!data || data.v !== 1 || !Array.isArray(data.log)) return { ok: false, applied: 0, skipped: 0 };
        // Während des Nachbauens bleibt das HUD stumm (keine Meldungen, kein Werkzeugwechsel)
        const keep = { onMoney, onStats, onBuildDone, onToast, onSelect, onBuildHint, onPending,
                       ghostRot, liftKind, pisteWidth, pisteLit, pendingLift };
        onMoney = onStats = onBuildDone = onToast = onSelect = onBuildHint = onPending = null;
        replaying = true;
        const at = (x, z) => new THREE.Vector3(x, yAtSmooth((x + half) / tile, (z + half) / tile), z);
        let applied = 0, skipped = 0;
        for (const a of data.log.slice(0, 5000)) {
            money = 1e12;                                  // Nachbauen kostet nichts
            let ok = false;
            try {
                if (a.a === 'b') {
                    ghostRot = +a.r || 0;
                    ok = !!placeBuildingAt(a.t, { gx: +a.x, gy: +a.y });
                } else if (a.a === 'l') {
                    const A = at(+a.ax, +a.az), B = at(+a.bx, +a.bz);
                    if (LIFT_PARAMS[a.k] && A.distanceTo(B) > 6) {
                        liftKind = a.k;
                        pendingLift = { name: String(a.n || ''), color: a.c ?? null };
                        const gA = worldToGrid(A.x, A.z);
                        ok = !!constructLift({ pt: A, gx: gA.gx, gy: gA.gy }, B, liftCost(A, B));
                    }
                } else if (a.a === 'p') {
                    pisteWidth = a.w || 'medium'; pisteLit = !!a.lit;
                    ok = !!buildPistePath((a.pts || []).map(q => ({ gx: +q[0], gy: +q[1] })));
                } else if (a.a === 'r') {
                    addRoad(+a.x0, +a.y0, +a.x1, +a.y1, 3.6); ok = true;
                } else if (a.a === 'd') {
                    const i = placedBuildings.findIndex(b => b.type === a.t && Math.abs(b.rec.x - a.x) < 0.8 && Math.abs(b.rec.z - a.z) < 0.8);
                    if (i >= 0) ok = !!demolishIndex(i);
                }
            } catch (err) {
                console.warn('[Spielstand] Aktion übersprungen:', a, err);
            }
            if (ok) { applied++; saveLog.push(a); } else skipped++;
        }
        // Bauzeiten überspringen: alles steht sofort fertig da
        for (const c of constructions) c.t = c.dur;
        updateConstructions(0);
        if (garagePos) garageReady = true;
        recomputeCarPath();
        // Zahlen übernehmen
        money = Number.isFinite(data.money) ? data.money : ((level && level.startingMoney) || 2000000);
        playSeconds = Number.isFinite(data.played) ? data.played : 0;
        for (const k of SIM_KEYS) if (data.sim && Number.isFinite(data.sim[k])) sim[k] = data.sim[k];
        if (data.eco) {
            eco.skiPass = Number.isFinite(data.eco.skiPass) ? data.eco.skiPass : null;
            const ad = data.eco.ad;
            eco.ad = (ad && AD_PACKAGES.some(pk => pk.id === ad.id) && ad.daysLeft > 0) ? { id: ad.id, daysLeft: +ad.daysLeft } : { id: null, daysLeft: 0 };
        }
        for (const q of (Array.isArray(data.lots) ? data.lots : [])) {
            const lot = parkingLots.find(l => Math.abs(l.gx - q.x) < 1 && Math.abs(l.gy - q.y) < 1);
            if (lot && Number.isFinite(q.p)) lot.price = q.p;
        }
        replaying = false;
        ({ onMoney, onStats, onBuildDone, onToast, onSelect, onBuildHint, onPending, ghostRot, liftKind, pisteWidth, pisteLit, pendingLift } = keep);
        deselect();
        if (onMoney) onMoney(money);
        emitStats();
        return { ok: true, applied, skipped };
    };

    return {
        // ----- Spielstand -----
        getSave(){ return getSave(); },
        loadSave(data){ return loadSave(data); },
        setOnSaveChange(cb){ onSaveChange = cb; },
        dispose(){ cancelAnimationFrame(raf); orbit.dispose(); window.removeEventListener('resize',onResize); window.visualViewport?.removeEventListener('resize',onResize); canvas.removeEventListener('pointermove',onHover); canvas.removeEventListener('pointerdown',onDown); canvas.removeEventListener('pointerup',onUp); canvas.removeEventListener('pointerup',onDemolish); canvas.removeEventListener('pointerup',onPick); canvas.removeEventListener('pointerup',onTouchEnd); canvas.removeEventListener('pointercancel',onTouchEnd); canvas.removeEventListener('dblclick',onDblClick); renderer.dispose(); scene.traverse(o=>{o.geometry?.dispose?.(); if(o.material&&!Array.isArray(o.material))o.material.dispose?.();}); },
        // ----- Bedienung per Finger: vorgemerkte Aktion bestätigen oder verwerfen -----
        setOnPending(cb){ onPending = cb; },
        confirmPending(){ confirmPending(); },
        cancelPending(){ cancelPending(); },
        undoPistePoint(){ undoPistePoint(); },
        rotateBuild(){ rotateBuild(); },
        setBuild(type){ deselect(); currentBuild = type; demolishMode = false; endLift(); endPiste(); endRoad(); showParcelGrid(!!type); if (!type) { hideSnowRange(); hideDirArrow(); } if (type) makeGhost(type); else if (ghost) { scene.remove(ghost); ghost = null; } },
        deselect(){ deselect(); },
        setDemolish(on){ deselect(); demolishMode = on; currentBuild = null; endLift(); endPiste(); endRoad(); if (ghost) { scene.remove(ghost); ghost = null; } },
        setLift(on, kind, cfg){
            deselect(); endLift(); endPiste(); endRoad();
            liftMode = !!on; if (kind) liftKind = kind;
            // Vom Baudialog: Anlagenname und Kabinenlackierung
            pendingLift = cfg ? { name: cfg.name || '', color: cfg.color ?? null } : null;
            currentBuild = null; demolishMode = false;
            if (ghost) { scene.remove(ghost); ghost = null; }
        },
        /** Vorschlag für den nächsten Anlagennamen (fortlaufend nummeriert). */
        suggestLiftName(kind){ return nextLiftName(kind); },
        setPiste(on, lit, width){ deselect(); endLift(); endPiste(); endRoad(); pisteMode = !!on; pisteLit = !!lit; if (width) pisteWidth = width; currentBuild = null; demolishMode = false; if (ghost) { scene.remove(ghost); ghost = null; } },
        setRoad(on){ deselect(); endLift(); endPiste(); endRoad(); roadMode = !!on; showParcelGrid(!!on); currentBuild = null; demolishMode = false; if (ghost) { scene.remove(ghost); ghost = null; } },
        getMoney(){ return money; },
        getStats(){ return getStats(); },
        /** Nur für Tests: Blick auf innere Zustände (kein Spiel-API). */
        __dbg(){ return { placedBuildings, guestPool, rescues, sledFleet, heliFleet, injured, startFall, built, sim, half, tile, worldToGrid, worldPosSmooth, walkers: _dbgWalkers, guestRoutes, pisteRunAt, yAtSmooth, buildPistePath, setPisteWidth: (w) => { pisteWidth = w; }, placeBuildingAt, demolishIndex, setMoney: (m) => { money = m; }, terrain, heightmap, gridSize }; },
        setOnMoney(cb){ onMoney = cb; },
        setOnStats(cb){ onStats = cb; },
        setOnBuildDone(cb){ onBuildDone = cb; },
        setOnBuildHint(cb){ onBuildHint = cb; },
        setOnToast(cb){ onToast = cb; },
        setOnSelect(cb){ onSelect = cb; },
        /**
         * Kamera zum Problem führen. `kind` ist 'stranded' oder 'injured'.
         * Bei Gestrandeten wird die GRÖSSTE Ansammlung angeflogen, bei
         * Verletzten der erste Wartende — so sieht der Spieler sofort, wo es hakt.
         */
        focusProblem(kind) {
            // Parkplätze voll: Kamera zum vollsten Parkplatz, damit man sieht,
            // wo Platz fehlt — und ihn gleich im Infofeld hat.
            if (kind === 'hotel') {
                let full = null, fr = -1;
                for (const b of placedBuildings) {
                    const cap = bedsOf(b.type); if (!cap) continue;
                    const r = (b.occ || 0) / cap;
                    if (r > fr) { fr = r; full = b; }
                }
                if (!full) return false;
                orbit.flyTo(full.mesh.position, worldSpan * 0.13);
                const sel = selectables.find(sx => Math.abs(sx.x - full.rec.x) < 0.5 && Math.abs(sx.z - full.rec.z) < 0.5);
                if (sel) { selectedSel = sel; if (onSelect) onSelect(infoFor(selectedSel)); }
                return true;
            }
            if (kind === 'parking') {
                let full = null, fr = -1;
                for (const l of parkingLots) {
                    if (!l.spots?.length) continue;
                    const r = (l.taken ? l.taken.size : 0) / l.spots.length;
                    if (r > fr) { fr = r; full = l; }
                }
                if (!full) return false;
                const wp = worldPosSmooth(full.gx, full.gy);
                orbit.flyTo(wp, worldSpan * 0.13);
                const sel = selectables.find(sx => sx.lot === full);
                if (sel) { selectedSel = sel; if (onSelect) onSelect(infoFor(selectedSel)); }
                return true;
            }
            const pool = guestPool.filter(g => kind === 'injured'
                ? g.state === 'down'
                : kind === 'grumpy'
                ? !!g.gripe
                : (g.state === 'idle' && (g.stranded || 0) > 2));
            if (!pool.length) return false;
            let best = pool[0];
            if (kind !== 'injured') {
                // Gast mit den meisten Nachbarn = Mittelpunkt der größten Gruppe
                let bestN = -1;
                for (const g of pool) {
                    let n = 0;
                    for (const o of pool) {
                        if (o === g) continue;
                        if (g.mesh.position.distanceTo(o.mesh.position) < 14) n++;
                    }
                    if (n > bestN) { bestN = n; best = g; }
                }
            }
            orbit.flyTo(best.mesh.position, worldSpan * 0.13);
            // Den betroffenen Gast gleich im Infofeld zeigen
            selectedSel = { type: 'guest', guest: best, x: best.mesh.position.x, z: best.mesh.position.z, r: 1 };
            if (onSelect) onSelect(infoFor(selectedSel));
            return true;
        },
        // Preis des ausgewählten Objekts anpassen (Kasse = Skipass global, Parkplatz/Parkhaus = Parkschein)
        /**
         * Werbekampagne an der Kasse buchen. Kostet einmalig und läuft
         * AD_DAYS Spieltage (= zwei Monate). Eine laufende Kampagne wird
         * ersetzt, die Restlaufzeit verfällt dabei.
         */
        bookAdPackage(id){
            const pk = AD_PACKAGES.find(a => a.id === id);
            if (!pk) return false;
            if (money < pk.cost) return false;
            money -= pk.cost;
            eco.ad = { id: pk.id, daysLeft: AD_DAYS };
            if (onSaveChange) onSaveChange();
            if (onMoney) onMoney(money);
            emitStats();
            if (onSelect && selectedSel) onSelect(infoFor(selectedSel));
            return true;
        },
        cancelAdPackage(){
            eco.ad = { id: null, daysLeft: 0 };
            if (onSaveChange) onSaveChange();
            emitStats();
            if (onSelect && selectedSel) onSelect(infoFor(selectedSel));
        },
        setSelectedPrice(v){
            if (!selectedSel) return;
            const p = Math.max(1, Math.round(v));
            if (selectedSel.type === 'ticket') eco.skiPass = p;
            else if (selectedSel.lot) selectedSel.lot.price = p;
            if (onSaveChange) onSaveChange();
            if (onSelect) onSelect(infoFor(selectedSel));
        },
        buildDefs: BUILD_DEFS
    };
}
