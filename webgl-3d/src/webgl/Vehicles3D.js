// ============================================================
// 3D-FAHRZEUGE: Auto, Bus, Pistenraupe (Snowcat)
// Realistische Farben, einfache aber saubere Karosserien.
// ============================================================
import * as THREE from 'three';

const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.85 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fbfe0, roughness: 0.16, metalness: 0.18, envMapIntensity: 0.35 });
const CAR_COLORS = [0xe5e7eb, 0x9ca3af, 0x4b5563, 0x1f2937, 0x1e3a5f, 0x6b1f2a, 0xd6d3d1];
// Fahrzeugmaterialien — exportiert, damit die Szene den metallischen
// Oberflächen gezielt eine Reflexionskarte zuweisen kann.
export const M0 = {
    // Metall an Raupen, Skidoo und Helikopter
    metalDark: new THREE.MeshStandardMaterial({ color: 0x525a65, roughness: 0.42, metalness: 0.65, envMapIntensity: 0.35 }),
    warn: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 })
};

function wheels(g, w, l, y) {
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 0.16, 10);
    geo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wm = new THREE.Mesh(geo, wheelMat);
        wm.position.set(sx * w * 0.5, y, sz * l * 0.32);
        wm.castShadow = true;
        g.add(wm);
    }
}

export function makeCar(colorIdx = 0) {
    const g = new THREE.Group();
    const w = 0.9, l = 2.0;
    const col = CAR_COLORS[colorIdx % CAR_COLORS.length];
    const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.34, metalness: 0.35, envMapIntensity: 0.4 });  // Autolack
    // untere Karosserie
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, l), bodyMat);
    lower.position.y = 0.28; lower.castShadow = true; g.add(lower);
    // Motorhaube/Heck (flacher Aufbau)
    const mid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.16, l * 0.62), bodyMat);
    mid.position.set(0, 0.46, -0.03); g.add(mid);
    // Dach (Greenhouse)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.26, l * 0.42), bodyMat);
    roof.position.set(0, 0.66, -0.05); roof.castShadow = true; g.add(roof);
    // getönte Scheiben: Front, Heck, zwei Seiten
    const glass = new THREE.MeshStandardMaterial({ color: 0x203040, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.85 });
    const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, 0.24, 0.05), glass);
    front.position.set(0, 0.65, l * 0.16); front.rotation.x = -0.28; g.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, 0.22, 0.05), glass);
    rear.position.set(0, 0.65, -l * 0.26); rear.rotation.x = 0.28; g.add(rear);
    for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, l * 0.34), glass);
        side.position.set(sx * w * 0.4, 0.65, -0.05); g.add(side);
    }
    // Scheinwerfer
    const hl = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe07a, emissiveIntensity: 0.6 });
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.04), hl); m.position.set(sx * w * 0.3, 0.3, l * 0.5); g.add(m); }
    // Rücklichter
    const tl = new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x771111, emissiveIntensity: 0.5 });
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.04), tl); m.position.set(sx * w * 0.3, 0.3, -l * 0.5); g.add(m); }
    wheels(g, w, l, 0.19);
    return g;
}

export function makeBus() {
    const g = new THREE.Group();
    const w = 1.0, l = 3.2, bodyH = 1.0;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, l), bodyMat);
    body.position.y = 0.62; body.castShadow = true; g.add(body);
    // Fensterband
    for (const sx of [1, -1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, l * 0.82), glassMat);
        strip.position.set(sx * w * 0.5, 0.78, 0); g.add(strip);
    }
    const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.4, 0.02), glassMat);
    front.position.set(0, 0.78, l * 0.5); g.add(front);
    wheels(g, w, l, 0.2);
    return g;
}

/** Pistenraupe (Snowcat): Kettenfahrzeug mit Räumschild & Fräse. */
/**
 * Pistenraupe. `model` wählt die Baureihe:
 *  - '300' = kompakter Allrounder (schmaler, kürzer, kleines Schild)
 *  - '500' = großes Flaggschiff (breiter, längere Kette, Heckfräse, Kabinenaufbau)
 */
export function makeSnowcat(bodyColor = 0xf97316, model = '300') {
    const big = model === '500';
    const g = new THREE.Group();
    const w = big ? 1.75 : 0.9, l = big ? 3.2 : 1.6;
    // Aufstandsfläche für die Bodenanpassung in der Szene (halbe Maße)
    g.userData.foot = { w: w * 0.5, l: l * 0.5 };
    // ===== LACKIERUNG =====
    // Metallic, aber bewusst HELL: Pistenraupen sind kräftig lackiert und
    // sollen im Schnee nicht als dunkler Klotz erscheinen.
    const orange = new THREE.MeshStandardMaterial({
        color: bodyColor, roughness: 0.38, metalness: 0.45, envMapIntensity: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.75, metalness: 0.35 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xa8b2bd, roughness: 0.3, metalness: 0.75 });

    // ===== LAUFWERK =====
    // Kettenlaufwerk mit Trag- und Umlenkrollen sowie Stollen auf dem Band.
    for (const sx of [-1, 1]) {
        const track = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, l), dark);
        track.position.set(sx * w * 0.44, 0.17, 0); track.castShadow = true; g.add(track);
        // Umlenkräder vorn und hinten (rund, damit die Kette umläuft)
        for (const sz of [-l * 0.46, l * 0.46]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 12), dark);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(sx * w * 0.44, 0.17, sz); g.add(wheel);
        }
        // Laufrollen dazwischen
        for (let k = 0; k < (big ? 5 : 3); k++) {
            const f = (k + 0.5) / (big ? 5 : 3) - 0.5;
            const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.30, 10), steel);
            rl.rotation.z = Math.PI / 2;
            rl.position.set(sx * w * 0.44, 0.10, f * l * 0.8); g.add(rl);
        }
        // Stollen auf dem Kettenband
        const nCleat = big ? 14 : 9;
        for (let k = 0; k < nCleat; k++) {
            const cz = -l / 2 + (k + 0.5) * (l / nCleat);
            const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.05, 0.07), steel);
            cleat.position.set(sx * w * 0.44, 0.325, cz); g.add(cleat);
        }
    }

    // ===== AUFBAU =====
    // Chassis mit abgesetztem Motorraum, dahinter die Kabine.
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, 0.36, l * 0.82), orange);
    chassis.position.y = 0.48; chassis.castShadow = true; g.add(chassis);
    // Motorhaube hinten, leicht abgeschrägt
    const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.30, l * 0.30), orange);
    hood.position.set(0, 0.78, -l * 0.26); hood.rotation.x = -0.06; hood.castShadow = true; g.add(hood);
    // Lüftungsgitter auf der Haube
    for (let k = 0; k < 4; k++) {
        const grill = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.02, 0.035), dark);
        grill.position.set(0, 0.94, -l * 0.32 + k * 0.075); g.add(grill);
    }
    // Auspuff
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 8), steel);
    exhaust.position.set(w * 0.30, 1.05, -l * 0.30); g.add(exhaust);

    // ===== KABINE =====
    // Nach vorn geneigte Panoramascheibe, Dachholm, Rundumleuchte.
    const cabH = big ? 0.62 : 0.52;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, cabH, l * 0.34), orange);
    cab.position.set(0, 0.48 + 0.18 + cabH / 2, l * 0.02); cab.castShadow = true; g.add(cab);
    // umlaufende Verglasung
    for (const [gx2, gz, ry, gw] of [[w * 0.39, 0, Math.PI / 2, l * 0.30],
                                     [-w * 0.39, 0, -Math.PI / 2, l * 0.30],
                                     [0, l * 0.17, 0, w * 0.70],
                                     [0, -l * 0.17, Math.PI, w * 0.70]]) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(gw, cabH * 0.62), glassMat);
        pane.position.set(gx2, 0.48 + 0.18 + cabH * 0.56, l * 0.02 + gz);
        pane.rotation.y = ry; g.add(pane);
    }
    // Dachkante und Rundumleuchte
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.05, l * 0.36), dark);
    roof.position.set(0, 0.48 + 0.18 + cabH + 0.02, l * 0.02); g.add(roof);
    // ===== BELEUCHTUNG =====
    // Eine Pistenraupe strahlt nach VORN — dorthin, wo sie arbeitet. Auf dem
    // Dach sitzt nur die rotierende orange Rundumleuchte, sonst nichts.
    // (Ein Rundum-Lichterkranz sah aus wie ein Rummelplatz.)
    const nightParts = [];
    const lampMat = new THREE.MeshStandardMaterial({
        color: 0xfff8e2, emissive: 0xffeec0, emissiveIntensity: 0.6, roughness: 0.3 });
    const workBeamMat = new THREE.MeshBasicMaterial({
        color: 0xffeec2, transparent: true, opacity: 0, depthWrite: false,
        fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beams = [];
    /** Strahler mit Gehäuse und Lichtkegel — ausschließlich nach vorn. */
    const workLamp = (x, y, z, len2, rad) => {
        const hous = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.07), dark);
        hous.position.set(x, y, z); g.add(hous);
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.085, 0.02), lampMat);
        lens.position.set(x, y, z + 0.045); g.add(lens);
        // ACHTUNG VORZEICHEN: ConeGeometry hat die Spitze bei +Y. Mit
        // rotation.x = +PI/2 landet die Spitze bei +Z, also VORN — dann sitzt
        // die breite Basis an der Lampe und der Kegel läuft nach vorn spitz
        // zu. Genau falsch herum. -PI/2 dreht die Spitze zur Lampe zurück,
        // die Basis öffnet sich nach vorn. (Die Frontscheinwerfer machten es
        // schon immer richtig — hier war es abgeschrieben und dabei gekippt.)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len2, 14, 1, true), workBeamMat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(x, y - len2 * 0.09, z + len2 / 2 + 0.05);
        cone.renderOrder = 6;
        g.add(cone); beams.push(cone);
        return lens;
    };
    // Zwei Arbeitsscheinwerfer über der Frontscheibe — mehr braucht es nicht.
    const roofY = 0.48 + 0.18 + cabH + 0.05;
    for (const sx of [-1, 1]) {
        nightParts.push(workLamp(sx * w * 0.22, roofY, l * 0.20, big ? 6.5 : 5.5, big ? 1.5 : 1.2));
    }
    // ===== ROTIERENDE RUNDUMLEUCHTE =====
    // Orangefarbener Dom mit innenliegendem Reflektor, der sich wirklich
    // dreht — der Lichtsektor wandert dadurch sichtbar rundherum.
    const beaconG = new THREE.Group();
    const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.05, 12), dark);
    beaconG.add(beaconBase);
    const domeMat = new THREE.MeshStandardMaterial({
        color: 0xff9a1f, emissive: 0xff7a00, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.72, roughness: 0.25 });
    const dome2 = new THREE.Mesh(new THREE.SphereGeometry(0.082, 12, 8, 0, 6.283, 0, Math.PI / 2), domeMat);
    dome2.scale.set(1, 1.25, 1); dome2.position.y = 0.025; beaconG.add(dome2);
    // Rotierender Reflektor im Inneren
    const rotor2 = new THREE.Group();
    const refl = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.055, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffb340, emissiveIntensity: 2.2 }));
    refl.position.y = 0.05; rotor2.add(refl);
    // Der austretende Lichtsektor: flacher Konus, der mitrotiert
    const sectorMat = new THREE.MeshBasicMaterial({
        color: 0xff9a2a, transparent: true, opacity: 0, depthWrite: false,
        fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    // Auch hier: Spitze gehört an die Leuchte, die Öffnung nach außen.
    const sector = new THREE.Mesh(new THREE.ConeGeometry(0.85, 4.2, 10, 1, true), sectorMat);
    sector.rotation.x = -Math.PI / 2; sector.position.set(0, 0.05, 2.15);
    sector.renderOrder = 6; rotor2.add(sector);
    beaconG.add(rotor2);
    beaconG.position.set(w * 0.22, roofY + 0.05, l * 0.02);
    g.add(beaconG);

    // Positions-/Schlussleuchten hinten (leuchten, strahlen aber nicht)
    const tailMat = new THREE.MeshStandardMaterial({
        color: 0xff5a4a, emissive: 0xff2a12, emissiveIntensity: 0.8 });
    for (const sx of [-1, 1]) {
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.04), tailMat);
        tl.position.set(sx * w * 0.4, 0.6, -l * 0.5); g.add(tl);
    }
    g.userData.nightLamps = nightParts;
    g.userData.beamMat = workBeamMat;
    g.userData.lampMat = lampMat;
    g.userData.tailMat = tailMat;
    // Die Frontscheinwerfer entstehen weiter unten im Aufbau; sie tragen
    // sich hier nachträglich ein, damit sie im selben Nachtmodus hängen.
    const extraNight = [];
    g.userData.registerNightMat = (mat, dayI, nightI) =>
        extraNight.push({ mat, dayI, nightI });
    g.userData.setNight = (dark2) => {
        const d = Math.max(0, Math.min(1, dark2));
        lampMat.emissiveIntensity = 0.2 + d * 2.0;
        tailMat.emissiveIntensity = 0.3 + d * 1.3;
        workBeamMat.opacity = d * 0.13;
        for (const b of beams) b.visible = d > 0.05;
        // Die Rundumleuchte blinkt IMMER — sie ist eine Warnleuchte, keine
        // Beleuchtung. Nachts wirkt ihr Lichtsektor nur stärker.
        sectorMat.opacity = 0.03 + d * 0.16;
        sector.visible = true;
        for (const e of extraNight) e.mat.emissiveIntensity = e.dayI + d * (e.nightI - e.dayI);
        if (g.userData.headBeamMat) g.userData.headBeamMat.opacity = 0.03 + d * 0.15;
    };
    g.userData.beaconRotor = rotor2;
    g.userData.setNight(0);

    // Räumschild vorne — beim 500er breiter und mit Mittelsteg
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(w * (big ? 1.65 : 1.35), big ? 0.6 : 0.45, 0.12), bladeMat);
    blade.position.set(0, big ? 0.45 : 0.38, l * 0.55); blade.castShadow = true; g.add(blade);
    if (big) {
        for (const sx3 of [-0.62, 0, 0.62]) {   // Verstärkungsrippen am großen Schild
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), dark);
            rib.position.set(sx3 * w, 0.45, l * 0.55 - 0.08); g.add(rib);
        }
        // Hydraulikarme zum Schild
        for (const sx3 of [-1, 1]) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8), M0.metalDark);
            arm.rotation.x = Math.PI / 2.3; arm.position.set(sx3 * w * 0.3, 0.42, l * 0.36); g.add(arm);
        }
    }
    // Heckfräse mit Auslegern — beim 500er deutlich breiter und mit Finisher
    const tiller = new THREE.Mesh(new THREE.BoxGeometry(w * (big ? 1.6 : 1.25), big ? 0.36 : 0.28, 0.22), dark);
    tiller.position.set(0, 0.3, -l * 0.55); g.add(tiller);
    if (big) {
        const finisher = new THREE.Mesh(new THREE.BoxGeometry(w * 1.6, 0.05, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }));
        finisher.position.set(0, 0.16, -l * 0.68); g.add(finisher);
        // Zusatzscheinwerfer auf dem Kabinendach
        for (const sx3 of [-0.3, 0.3]) {
            const spot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1),
                new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xfff0b0, emissiveIntensity: 1.4 }));
            spot.position.set(sx3, 1.24, 0.05); g.add(spot);
        }
        // Seilwindenturm (typisch für die großen Maschinen)
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.75), M0.metalDark);
        mast.position.set(0, 1.5, -0.25); g.add(mast);
    }
    for (const sx2 of [-1, 1]) {
        const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7), dark);
        boom.rotation.x = Math.PI / 2.6; boom.position.set(sx2 * w * 0.4, 0.5, -l * 0.45); g.add(boom);
    }
    // ===== FEINDETAILS =====
    // Kettenprofil: quer laufende Stollen auf beiden Laufwerken
    const cleat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const nCleat = big ? 11 : 7;
    for (const sx3 of [-1, 1]) for (let ci = 0; ci < nCleat; ci++) {
        const cz = -l * 0.46 + (ci / (nCleat - 1)) * l * 0.92;
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.07), cleat);
        st.position.set(sx3 * w * 0.42, 0.03, cz); g.add(st);
        const st2 = st.clone(); st2.position.y = 0.29; g.add(st2);
    }
    // Umlenkrollen an den Kettenenden
    for (const sx3 of [-1, 1]) for (const cz of [-l * 0.46, l * 0.46]) {
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 10), M0.metalDark);
        roll.rotation.z = Math.PI / 2; roll.position.set(sx3 * w * 0.42, 0.16, cz); g.add(roll);
    }
    // (Die Rundumleuchte sitzt weiter oben im Aufbau — es gab hier
    //  versehentlich eine ZWEITE, die dicht daneben stand.)
    // Seitenspiegel
    for (const sx3 of [-1, 1]) {
        const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26), M0.metalDark);
        arm2.rotation.z = Math.PI / 2; arm2.position.set(sx3 * w * 0.46, 1.1, 0.12); g.add(arm2);
        const mir = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.09), M0.metalDark);
        mir.position.set(sx3 * w * 0.6, 1.1, 0.12); g.add(mir);
    }
    // Frontscheinwerfer über dem Räumschild
    for (const sx3 of [-0.34, 0.34]) {
        const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.06),
            new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xffe9a0, emissiveIntensity: 1.5 }));
        hl2.position.set(sx3 * w, 0.72, l * 0.4); g.add(hl2);
    }
    // Warnstreifen am Räumschild (typisches Baustellenmuster)
    for (let si = 0; si < (big ? 7 : 5); si++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * (big ? 0.2 : 0.22), big ? 0.6 : 0.45, 0.02),
            new THREE.MeshStandardMaterial({ color: si % 2 ? 0x1f2937 : 0xfbbf24, roughness: 0.6 }));
        const span = w * (big ? 1.6 : 1.3);
        stripe.position.set(-span / 2 + (si + 0.5) * (span / (big ? 7 : 5)),
                            big ? 0.45 : 0.38, l * 0.55 + 0.07);
        g.add(stripe);
    }
    // Fahrer in der Kabine
    const driver = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.16),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.75 }));
    driver.position.set(0, 0.95, -0.02); g.add(driver);
    const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.6 }));
    dHead.position.set(0, 1.14, -0.02); g.add(dHead);
    // Heckklappe / Werkzeugkasten
    const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.22, 0.2), M0.metalDark);
    box.position.set(0, 0.62, -l * 0.42); g.add(box);
    // Auspuffrohr + Abgaswolke (zieht entgegen der Fahrtrichtung ab)
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), M0.metalDark);
    pipe.position.set(0.3, 1.15, -0.55); g.add(pipe);
    // Warnstreifen (rot/weiß) an Chassis-Seiten
    for (const sx2 of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, l * 0.75), M0.warn);
        stripe.position.set(sx2 * w * 0.5, 0.5, 0); g.add(stripe);
    }
    // Front-Kühlergrill
    const grill = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.22, 0.05), M0.metalDark);
    grill.position.set(0, 0.5, l * 0.4); g.add(grill);
    // Kabinenfenster rundum (Seiten + Heck)
    for (const [px, pz, ry] of [[-w*0.38, -0.1, Math.PI/2], [w*0.38, -0.1, Math.PI/2], [0, -0.3, 0]]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(l * 0.34, 0.34), glassMat);
        side.position.set(px, 0.98, pz); side.rotation.y = ry; g.add(side);
    }
    // FRONTSCHEINWERFER (leuchtend) + Lichtkegel
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xfff0b0, emissiveIntensity: 1.6 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.16,
        depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    g.userData.headBeamMat = beamMat;
    g.userData.registerNightMat(headMat, 0.8, 3.2);
    for (const sx2 of [-1, 1]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), headMat);
        hl.position.set(sx2 * w * 0.32, 0.55, l * 0.5); g.add(hl);
        // Deutlich weiter reichender Kegel — 1.6 Einheiten waren nachts
        // kaum als Licht zu erkennen.
        const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6.5, 14, 1, true), beamMat);
        beam.rotation.x = -Math.PI / 2; beam.position.set(sx2 * w * 0.32, 0.5, l * 0.5 + 3.3);
        beam.renderOrder = 6; g.add(beam);
    }
    // ARBEITSSCHEINWERFER auf dem Kabinendach
    for (const sx2 of [-1, 1]) {
        const wl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), headMat);
        wl.position.set(sx2 * w * 0.28, 1.22, 0.05); g.add(wl);
    }
    // Rundumleuchte
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfca5a5, emissive: 0xff5555, emissiveIntensity: 0.9 }));
    beacon.position.set(0, 1.25, -0.1); g.add(beacon);
    g.userData.beacon = beacon;

    // AUSPUFFRAUCH (dunkelgrau, steigt auf) — als Kind, fährt mit
    const NS = 40;
    const smokePos = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { smokePos[i*3]=0.3; smokePos[i*3+1]=1.1; smokePos[i*3+2]=-0.6; }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
    const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ color: 0x555a63, size: 0.3, transparent: true, opacity: 0.5, depthWrite: false }));
    g.add(smoke);

    // SCHNEEFONTÄNE hinter der Fräse (weiß, spritzt nach hinten/oben)
    const NF = 90;
    const sprayPos = new Float32Array(NF * 3);
    for (let i = 0; i < NF; i++) { sprayPos[i*3]=0; sprayPos[i*3+1]=0.35; sprayPos[i*3+2]=-1.0; }
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
    g.add(spray);

    const rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5; return x - Math.floor(x); };
    // Fahrtrichtung aus der Weltbewegung ableiten (für den Abgas-Schweif)
    const _wp = new THREE.Vector3(), _prev = new THREE.Vector3(), _loc = new THREE.Vector3();
    let hasPrev = false, driveZ = 1, driveX = 0, driveSpeed = 0;
    g.userData.roofBeacon = refl;
    g.userData.update = (t) => {
        // Rundumleuchte: der Reflektor dreht sich, der Lichtsektor wandert mit.
        if (g.userData.beaconRotor) g.userData.beaconRotor.rotation.y = t * 4.2;
        beacon.material.emissiveIntensity = 0.5 + 0.5 * Math.abs(Math.sin(t * 6));
        // aktuelle Fahrtrichtung in LOKALEN Koordinaten bestimmen
        g.getWorldPosition(_wp);
        if (hasPrev) {
            _loc.copy(_wp).sub(_prev);
            driveSpeed = _loc.length();
            if (driveSpeed > 1e-5) {
                // Weltrichtung -> lokale Richtung (ohne Translation)
                const q = g.getWorldQuaternion(new THREE.Quaternion()).invert();
                _loc.normalize().applyQuaternion(q);
                driveX = _loc.x; driveZ = _loc.z;
            }
        }
        _prev.copy(_wp); hasPrev = true;
        // Rauch steigt auf und wird ENTGEGEN der Fahrtrichtung weggeweht
        const drift = Math.min(1, driveSpeed * 26);          // schneller = längerer Schweif
        const bx = -driveX * drift, bz = -driveZ * drift;
        const sp = smoke.geometry.attributes.position;
        for (let i = 0; i < sp.count; i++) {
            let ph = ((i / sp.count) + t * 0.5) % 1;
            sp.setX(i, 0.3 + Math.sin(t * 2 + i) * 0.12 * ph + bx * ph * 2.2);
            sp.setY(i, 1.1 + ph * 1.6);
            sp.setZ(i, -0.6 - ph * 0.4 + bz * ph * 2.2);
        }
        sp.needsUpdate = true;
        // Schneefontäne: fliegt ebenfalls nach hinten (relativ zur Fahrtrichtung)
        const fp = spray.geometry.attributes.position;
        for (let i = 0; i < fp.count; i++) {
            let ph = ((i / fp.count) + t * 1.4) % 1;
            const spread = (rnd(i) - 0.5) * 0.9;
            fp.setX(i, spread * ph + bx * ph * 1.6);
            fp.setY(i, 0.35 + ph * 1.1 - ph * ph * 1.3);
            fp.setZ(i, -1.0 - ph * 1.4 + bz * ph * 1.6);
        }
        fp.needsUpdate = true;
    };
    return g;
}

// ============================================================
// SKIFAHRER-FIGUR (klein, bunt) — fährt in Schwüngen die Piste runter
// ============================================================
// ===== GARDEROBE =====
// Jacken, Hosen, Helme und Hauttöne werden unabhängig voneinander gewürfelt.
// Dadurch entstehen aus wenigen Listen sehr viele Kombinationen, statt dass
// alle Gäste in derselben Uniform herumfahren.
const JACKETS = [0xef4444, 0x2563eb, 0x16a34a, 0xf59e0b, 0x9333ea, 0x0ea5e9,
                 0xec4899, 0x14b8a6, 0xf97316, 0x1e293b, 0xfafafa, 0x84cc16];
const PANTS   = [0x1f2937, 0x111827, 0x334155, 0x3f3f46, 0x1e3a5f, 0x4a2f2f, 0x0f766e];
const HELMETS = [0xf8fafc, 0x111827, 0xdc2626, 0x2563eb, 0xfbbf24, 0x64748b, 0x16a34a];
const SKINS   = [0xf1c9a5, 0xe8b98c, 0xd6a276, 0xc78d5f, 0x8d5a3b, 0xf6d5b8];
const GOGGLES = [0x22d3ee, 0xf59e0b, 0xa855f7, 0x22c55e, 0xef4444, 0x0f172a];

/**
 * SKILEHRER — auf den ersten Blick von den Gästen zu unterscheiden.
 *
 * Basis ist die normale Skifigur, darüber kommt die Ausrüstung, an der man
 * einen Lehrer im Skigebiet sofort erkennt: knallrote Latzweste mit weißem
 * Kreuz, gelbe Armbinde, Trillerpfeife an der Kordel und ein kleiner Wimpel
 * am Rucksack, damit die Gruppe ihn auch von hinten im Pulk findet.
 */
export function makeSkiInstructor(idx = 0) {
    const g = makeSkier(idx);
    const red = new THREE.MeshStandardMaterial({ color: 0xd91c2b, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5,
        emissive: 0x6b5200, emissiveIntensity: 0.35 });
    const torso = g.userData.torso;
    if (torso) {
        // Latzweste vorne und hinten
        for (const sz of [1, -1]) {
            const bib = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.235, 0.015), red);
            bib.position.set(0, 0.10, sz * 0.098); torso.add(bib);
        }
        for (const sx of [-1, 1]) {
            const side = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.235, 0.19), red);
            side.position.set(sx * 0.118, 0.10, 0); torso.add(side);
        }
        // Weißes Kreuz auf der Brust
        const cw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.012), white);
        cw.position.set(0, 0.11, 0.107); torso.add(cw);
        const ch2 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.13, 0.012), white);
        ch2.position.set(0, 0.11, 0.107); torso.add(ch2);
        // Gelbe Armbinde
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.075), yellow);
        band.position.set(-0.128, 0.14, 0); torso.add(band);
        // Trillerpfeife an der Kordel
        const cord = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 5, 14),
            new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }));
        cord.rotation.x = Math.PI / 2.3; cord.position.set(0, 0.20, 0.05); torso.add(cord);
        const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.05),
            new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.35, metalness: 0.6 }));
        whistle.position.set(0.01, 0.14, 0.105); torso.add(whistle);
        // Rucksack mit Wimpel — von hinten gut zu sehen
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.08), red);
        pack.position.set(0, 0.11, -0.13); torso.add(pack);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 5),
            new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7 }));
        stick.position.set(0.06, 0.30, -0.15); torso.add(stick);
        const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.10), yellow);
        pennant.position.set(0.145, 0.42, -0.15); pennant.userData.isFlag = true; torso.add(pennant);
        g.userData.pennant = pennant;
    }
    g.userData.isInstructor = true;
    return g;
}

export function makeSkier(colorIdx = 0) {
    const g = new THREE.Group();
    // Deterministisch, aber je Gast anders: aus dem Index werden mehrere
    // unabhängige Zufallszahlen abgeleitet.
    const h = (n) => ((colorIdx + 1) * 2654435761 >>> (n * 3)) & 1023;
    const jacketCol = JACKETS[h(1) % JACKETS.length];
    const pantsCol  = PANTS[h(2) % PANTS.length];
    const helmetCol = HELMETS[h(3) % HELMETS.length];
    const skinCol   = SKINS[h(4) % SKINS.length];
    const goggleCol = GOGGLES[h(5) % GOGGLES.length];
    const style     = h(6) % 4;          // 0 Helm · 1 Mütze · 2 Helm+Schal · 3 Mütze+Rucksack

    const jacket = new THREE.MeshStandardMaterial({ color: jacketCol, roughness: 0.6 });
    const pants = new THREE.MeshStandardMaterial({ color: pantsCol, roughness: 0.75 });
    const skin = new THREE.MeshStandardMaterial({ color: skinCol, roughness: 0.6 });
    const helmet = new THREE.MeshStandardMaterial({ color: helmetCol, roughness: style === 1 || style === 3 ? 0.9 : 0.42 });
    // Beine: zwei getrennte Beine, die aus der HÜFTE schwingen (Drehpunkt oben).
    // Nur so sieht ein Schritt beim Laufen natürlich aus.
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55 });
    // WICHTIG: die Sohle muss knapp ÜBER dem Ursprung liegen (y≈0.03),
    // sonst versinkt die Figur im Gelände und wirkt, als liefe sie unterirdisch.
    const mkLeg = (x) => {
        const hip = new THREE.Group();
        hip.position.set(x, 0.38, 0);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.28, 0.13), pants);
        thigh.position.y = -0.15; thigh.castShadow = true; hip.add(thigh);
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.08, 0.17), bootMat);
        boot.position.set(0, -0.31, 0.02); hip.add(boot);   // Sohle bei y = 0.03
        return hip;
    };
    const legL = mkLeg(-0.055), legR = mkLeg(0.055);
    g.add(legL); g.add(legR);
    g.userData.legL = legL; g.userData.legR = legR;
    // Rumpf: eigener Drehpunkt an der Hüfte, damit er sich vorbeugen kann
    const torsoPivot = new THREE.Group();
    torsoPivot.position.y = 0.36; g.add(torsoPivot);
    g.userData.torso = torsoPivot;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.18), jacket);
    torso.position.y = 0.10; torso.castShadow = true; torsoPivot.add(torso);
    // Kopf mit Helm
    // ===== KOPF & AUSSTATTUNG =====
    // Gesicht immer in Hautfarbe, darüber je nach Stil Helm oder Wollmütze.
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 10), skin);
    face.position.y = 0.66; g.add(face);
    if (style === 1 || style === 3) {
        // Wollmütze mit Bommel
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), helmet);
        cap.position.y = 0.672; g.add(cap);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.045, 12), helmet);
        brim.position.y = 0.655; g.add(brim);
        const pom = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.95 }));
        pom.position.y = 0.775; g.add(pom);
    } else {
        // Skihelm mit Kinnpartie
        const hel = new THREE.Mesh(new THREE.SphereGeometry(0.104, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), helmet);
        hel.position.y = 0.662; g.add(hel);
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.07, 0.16),
            new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 }));
        ear.position.y = 0.615; g.add(ear);
    }
    // Skibrille mit Rahmen und getöntem Glas
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.055, 12),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }));
    strap.position.y = 0.678; g.add(strap);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.058, 0.03),
        new THREE.MeshStandardMaterial({ color: goggleCol, roughness: 0.15, metalness: 0.55,
            emissive: goggleCol, emissiveIntensity: 0.18 }));
    goggles.position.set(0, 0.678, 0.082); g.add(goggles);
    // Accessoires je nach Stil
    if (style === 2) {
        // Schal, der im Fahrtwind flattert
        const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.19),
            new THREE.MeshStandardMaterial({ color: JACKETS[(colorIdx * 7 + 3) % JACKETS.length], roughness: 0.9 }));
        scarf.position.y = 0.575; g.add(scarf);
        const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.04),
            new THREE.MeshStandardMaterial({ color: JACKETS[(colorIdx * 7 + 3) % JACKETS.length], roughness: 0.9 }));
        tail2.position.set(0.06, 0.47, -0.11); tail2.rotation.x = 0.3; g.add(tail2);
    }
    if (style === 3) {
        // Kleiner Rucksack
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.11),
            new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }));
        bag.position.set(0, 0.47, -0.15); g.add(bag);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12),
            new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }));
        flap.position.set(0, 0.56, -0.15); g.add(flap);
    }
    // Reißverschluss-Blende auf der Jacke — bricht die einfarbige Fläche auf
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 }));
    zip.position.set(0, 0.46, 0.093); g.add(zip);
    // Ski + Stöcke: als Gruppe, damit sie beim Après-Ski abgelegt werden können
    const gear = new THREE.Group();
    const skiMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
    for (const sx of [-0.09, 0.09]) {
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.7), skiMat);
        ski.position.set(sx, 0.03, 0.05); gear.add(ski);
    }
    for (const sx of [-0.16, 0.16]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4), new THREE.MeshStandardMaterial({ color: 0x64748b }));
        pole.position.set(sx, 0.2, -0.02); gear.add(pole);
    }
    g.add(gear); g.userData.gear = gear;
    // Alternative Ausrüstung: Snowboard (quer zur Fahrtrichtung, mit Bindungen)
    const board = new THREE.Group();
    const bMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.35, metalness: 0.15 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.19), bMat);
    deck.position.set(0, 0.03, 0.04); board.add(deck);
    for (const bx of [-0.34, 0.34]) {   // aufgebogene Enden
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.17), bMat);
        tip.position.set(bx * 1.55, 0.055, 0.04); tip.rotation.z = bx < 0 ? 0.32 : -0.32; board.add(tip);
    }
    for (const bx of [-0.17, 0.17]) {   // Bindungen
        const bind = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.15),
            new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }));
        bind.position.set(bx, 0.07, 0.04); board.add(bind);
    }
    board.visible = false; g.add(board); g.userData.board = board;
    /** Auf Snowboard umstellen: Ski weg, Board an, Körper leicht quer. */
    g.userData.setSnowboard = (on) => {
        gear.visible = !on; board.visible = on;
        g.userData.isBoarder = on;
    };
    // Arme: Drehpunkt an der SCHULTER, damit sie beim Gehen und Tanzen
    // aus dem Gelenk pendeln statt um ihre eigene Mitte zu kippen.
    const armMat = new THREE.MeshStandardMaterial({ color: JACKETS[colorIdx % JACKETS.length], roughness: 0.7 });
    const mkArm = (x) => {
        const sh = new THREE.Group();
        sh.position.set(x, 0.56, 0);
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.08), armMat);
        a.position.y = -0.15; sh.add(a);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skin);
        hand.position.y = -0.31; sh.add(hand);
        return sh;
    };
    const armL = mkArm(-0.16), armR = mkArm(0.16);
    g.add(armL); g.add(armR);
    g.userData.armL = armL; g.userData.armR = armR;
    /**
     * Ausrüstung schultern statt sie verschwinden zu lassen. Wer über eine
     * apere Wiese läuft, trägt die Ski über der Schulter bzw. das Board
     * unter dem Arm — das sieht deutlich glaubwürdiger aus als Skifahrer,
     * denen die Ausrüstung einfach fehlt.
     */
    const gearHome = { p: gear.position.clone(), r: gear.rotation.clone() };
    const boardHome = { p: board.position.clone(), r: board.rotation.clone() };
    g.userData.setCarry = (on) => {
        if (on) {
            gear.position.set(0.17, 0.34, -0.02);
            gear.rotation.set(-0.95, 0, -0.16);       // Ski diagonal über der Schulter
            board.position.set(0.26, 0.3, 0);
            board.rotation.set(0, 0, 1.35);           // Board hochkant unterm Arm
        } else {
            gear.position.copy(gearHome.p); gear.rotation.copy(gearHome.r);
            board.position.copy(boardHome.p); board.rotation.copy(boardHome.r);
        }
        g.userData.carrying = on;
    };
    g.scale.setScalar(1.3);
    return g;
}

// Pistenrand-Stange (dünner Stab mit oranger Spitze)
export function makePisteMarker(tipColor = 0xf97316) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 }));
    pole.position.y = 0.5; g.add(pole);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28), new THREE.MeshStandardMaterial({ color: tipColor, emissive: tipColor, emissiveIntensity: 0.3 }));
    tip.position.y = 1.0; g.add(tip);
    return g;
}

// ============================================================
// FUSSGÄNGER (Gäste): laufende Figur mit Bein-Wackeln
// ============================================================
const COATS = [0xef4444, 0x2563eb, 0x0d9488, 0xf59e0b, 0x7c3aed, 0xdb2777, 0x334155];
export function makeWalker(colorIdx = 0) {
    const g = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: COATS[colorIdx % COATS.length], roughness: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 });
    const hat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.1), pants);
    legL.position.set(-0.07, 0.2, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.07; g.add(legR);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.16), coat);
    torso.position.y = 0.5; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), skin);
    head.position.y = 0.74; g.add(head);
    // Bunte Bommelmütze
    const beanieCols = [0xdc2626, 0x2563eb, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0ea5e9, 0xffffff];
    const beanieMat = new THREE.MeshStandardMaterial({ color: beanieCols[(colorIdx*3+1) % beanieCols.length], roughness: 0.85 });
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10, 0, Math.PI*2, 0, Math.PI*0.62), beanieMat);
    beanie.position.y = 0.79; g.add(beanie);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 14), beanieMat);
    brim.rotation.x = Math.PI/2; brim.position.y = 0.75; g.add(brim);
    const bommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    bommel.position.y = 0.9; g.add(bommel);
    g.scale.setScalar(1.25);
    g.userData.legL = legL; g.userData.legR = legR;
    return g;
}

/**
 * Schwebendes Ausrufezeichen über dem Kopf — Hinweis für den Spieler, dass
 * mit diesem Gast etwas nicht stimmt (Sackgasse, Sturz). Bewusst sehr
 * transparent, damit es die Szene nicht zukleistert, und als Sprite, damit
 * es immer zur Kamera zeigt.
 */
export function makeAlertMark(color = 0xef4444) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const c = cv.getContext('2d');
    const hex = '#' + color.toString(16).padStart(6, '0');
    // Kräftiger Schein hinter dem Zeichen — deutlich sichtbar, aber weich
    const grd = c.createRadialGradient(48, 48, 3, 48, 48, 46);
    grd.addColorStop(0, hex + 'ee');
    grd.addColorStop(0.55, hex + '77');
    grd.addColorStop(1, hex + '00');
    c.fillStyle = grd; c.fillRect(0, 0, 96, 96);
    // Ausrufezeichen mit dunklem Rand, damit es auf Schnee steht
    c.strokeStyle = 'rgba(60,6,6,0.85)'; c.lineWidth = 5; c.lineJoin = 'round';
    c.fillStyle = '#ffffff';
    const bar = () => { c.beginPath(); c.roundRect(41, 17, 14, 39, 7); };
    const dot = () => { c.beginPath(); c.arc(48, 74, 7.5, 0, Math.PI * 2); };
    bar(); c.stroke(); c.fill();
    dot(); c.stroke(); c.fill();
    const tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        // depthTest AN: das Zeichen darf nicht durch Berge und Gebäude
        // hindurch sichtbar sein.
        map: tex, transparent: true, opacity: 0.75, depthWrite: false, depthTest: true
    }));
    spr.scale.set(0.8, 0.8, 1);
    spr.renderOrder = 12;
    spr.visible = false;
    return spr;
}

/**
 * Rettungs-Skidoo der Sanitätsstation: Motorschlitten mit Kufen, Laufkette und
 * angehängtem Akja (Rettungsschlitten), auf dem der Verletzte abtransportiert
 * wird. Das Blaulicht blinkt über `userData.update`.
 */
export function makeRescueSled() {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 1.15), red);
    body.position.y = 0.34; body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.34), red);
    nose.position.set(0, 0.3, 0.66); nose.rotation.x = -0.25; g.add(nose);
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x9fb6c9, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    shield.position.set(0, 0.56, 0.42); shield.rotation.x = -0.5; g.add(shield);
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.8), dark);
    track.position.set(0, 0.12, -0.2); g.add(track);
    for (const sx of [-1, 1]) {
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.6), dark);
        ski.position.set(sx * 0.22, 0.06, 0.5); g.add(ski);
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.26), dark);
        strut.position.set(sx * 0.22, 0.2, 0.5); g.add(strut);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42), dark);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.62, 0.3); g.add(bar);
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 }));
    rider.position.set(0, 0.68, 0.02); g.add(rider);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }));
    head.position.set(0, 0.96, 0.02); g.add(head);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x2563eb, emissiveIntensity: 2 }));
    beacon.position.set(0, 0.54, -0.42); g.add(beacon);
    // Akja am Heck: flache Wanne, der Patient wird sichtbar geschaltet
    const akja = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 1.0),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }));
    tub.position.y = 0.14; akja.add(tub);
    for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 1.0), dark);
        rail.position.set(sx * 0.23, 0.16, 0); akja.add(rail);
    }
    const draw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), dark);
    draw.rotation.x = Math.PI / 2; draw.position.set(0, 0.2, 0.72); akja.add(draw);
    const patient = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.85 }));
    patient.position.y = 0.28; patient.visible = false; akja.add(patient);
    akja.position.set(0, 0, -1.15); g.add(akja);
    g.userData.patient = patient;
    g.userData.update = (t) => {
        beacon.material.emissiveIntensity = 1 + Math.abs(Math.sin(t * 7)) * 3;
    };
    return g;
}

/**
 * Rettungshubschrauber der Klinik — gelb lackiert und schlank geschnitten.
 * `userData.setRotor(v)` steuert die Drehzahl, `setWinch(l)` die Seillänge,
 * `userData.victim` ist der Geborgene an der Bergeschlinge.
 */
export function makeRescueHeli() {
    const g = new THREE.Group();
    const S = 1.34;                       // Gesamtmaßstab: spürbar größer als vorher
    const body = new THREE.Group(); body.scale.setScalar(S); g.add(body);

    const yellow = new THREE.MeshStandardMaterial({ color: 0xf5b60a, roughness: 0.36, metalness: 0.35, envMapIntensity: 0.5 });
    const white  = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, metalness: 0.2 });
    const dark   = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.62, metalness: 0.5 });
    const steel  = new THREE.MeshStandardMaterial({ color: 0x8b95a1, roughness: 0.34, metalness: 0.72 });
    const trim   = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x8fb0c6, roughness: 0.06,
        metalness: 0.35, transparent: true, opacity: 0.52, side: THREE.DoubleSide });
    glassM.userData.isWindow = true;

    // ===== ZELLE =====
    // Längs gestreckter Rumpf aus drei ineinandergreifenden Volumen:
    // Bugkanzel, Kabinenmittelteil mit Schiebetür, konischer Heckübergang.
    const hull = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 16), yellow);
    hull.scale.set(0.90, 0.86, 1.75); hull.position.y = 0.95; hull.castShadow = true; body.add(hull);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.15, 20), yellow);
    mid.rotation.x = Math.PI / 2; mid.scale.set(1, 1, 0.92);
    mid.position.set(0, 0.95, -0.28); mid.castShadow = true; body.add(mid);
    const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.15, 1.0, 16), yellow);
    taper.rotation.x = Math.PI / 2; taper.position.set(0, 0.99, -1.25); body.add(taper);
    // Bugkanzel: rundum verglast
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.47, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), glassM);
    nose.rotation.x = Math.PI / 2.05; nose.scale.set(0.92, 1.25, 0.9);
    nose.position.set(0, 0.95, 0.72); body.add(nose);
    // Seitenfenster der Kabine
    for (const sx of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), glassM);
        win.position.set(sx * 0.462, 1.06, -0.2); win.rotation.y = sx * Math.PI / 2; body.add(win);
        const win2 = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), glassM);
        win2.position.set(sx * 0.462, 1.02, -0.85); win2.rotation.y = sx * Math.PI / 2; body.add(win2);
        // Schiebetürrahmen und Griff
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.52, 0.78), steel);
        frame.position.set(sx * 0.47, 1.0, -0.2); body.add(frame);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.9), steel);
        rail.position.set(sx * 0.48, 1.28, -0.2); body.add(rail);
    }
    // Rettungslackierung: Bauchband, Rückenband, rotes Kreuz
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.24, 20, 1, true), white);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1.002, 1.002, 0.93);
    belt.position.set(0, 0.72, -0.28); body.add(belt);
    for (const sx of [-1, 1]) {
        const cr1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.30, 0.09), trim);
        cr1.position.set(sx * 0.475, 0.98, -0.62); body.add(cr1);
        const cr2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.30), trim);
        cr2.position.set(sx * 0.475, 0.98, -0.62); body.add(cr2);
    }
    // ===== HECKAUSLEGER MIT FENESTRON-LEITWERK =====
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.065, 2.5, 12), yellow);
    boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.02, -1.95); boom.castShadow = true; body.add(boom);
    // Versteifungsrippen auf dem Ausleger
    for (let k = 0; k < 4; k++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.098 - k * 0.012, 0.016, 6, 14), steel);
        rib.rotation.y = Math.PI / 2; rib.position.set(0, 1.02, -1.35 - k * 0.42); body.add(rib);
    }
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.72, 0.42), yellow);
    finV.position.set(0, 1.42, -2.95); finV.rotation.x = -0.12; body.add(finV);
    const finLow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.26), yellow);
    finLow.position.set(0, 0.80, -2.98); body.add(finLow);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.28), yellow);
    stab.position.set(0, 1.10, -2.72); body.add(stab);
    for (const sx of [-1, 1]) {                       // Endscheiben
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.24), yellow);
        ep.position.set(sx * 0.5, 1.22, -2.72); body.add(ep);
    }
    // Fenestron: ummantelter Heckrotor in einem Ring
    const shroud = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.075, 8, 22), yellow);
    shroud.rotation.y = Math.PI / 2; shroud.position.set(0.05, 1.18, -2.92); body.add(shroud);
    const tail = new THREE.Group();
    for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.075), dark);
        b.rotation.z = (i / 8) * Math.PI * 2; tail.add(b);
    }
    tail.rotation.y = Math.PI / 2; tail.position.set(0.05, 1.18, -2.92); body.add(tail);

    // ===== ROTORKOPF =====
    // Sichtbarer Kopf mit Taumelscheibe, Blattgriffen und Steuerstangen —
    // erst das macht den Heli von nahem interessant.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 10), steel);
    mast.position.y = 1.52; body.add(mast);
    const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), yellow);
    cowl.scale.set(1, 0.5, 1.25); cowl.position.y = 1.40; body.add(cowl);
    const swash = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), steel);
    swash.position.y = 1.62; body.add(swash);
    const rotor = new THREE.Group();
    const hubBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.22, 12), steel);
    rotor.add(hubBody);
    const NBL = 5;                                   // fünfblättrig
    for (let i = 0; i < NBL; i++) {
        const an = (i / NBL) * Math.PI * 2;
        const arm = new THREE.Group(); arm.rotation.y = an; rotor.add(arm);
        // Blattgriff + Dämpfer
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.075, 0.11), steel);
        grip.position.set(0.24, 0.02, 0); arm.add(grip);
        const damp = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.26, 6), dark);
        damp.rotation.z = Math.PI / 2; damp.position.set(0.3, -0.08, 0.09); arm.add(damp);
        // Steuerstange zur Taumelscheibe
        const pitch = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 5), steel);
        pitch.position.set(0.22, -0.11, 0.07); arm.add(pitch);
        // Blatt: leicht verjüngt, mit abgesetzter Blattspitze
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.032, 0.21), dark);
        blade.position.set(1.68, 0.02, 0); arm.add(blade);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.034, 0.2), trim);
        tip.position.set(3.02, 0.02, 0); arm.add(tip);
    }
    rotor.position.y = 1.74; body.add(rotor);

    // ===== KUFENLANDEGESTELL MIT QUERTRÄGERN =====
    for (const sx of [-1, 1]) {
        const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.15, 10), steel);
        skid.rotation.x = Math.PI / 2; skid.position.set(sx * 0.52, 0.14, 0.05); body.add(skid);
        // aufgebogene Kufenspitze
        const curveT = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.36, 8), steel);
        curveT.position.set(sx * 0.52, 0.22, 1.18); curveT.rotation.x = 1.05; body.add(curveT);
        // Trittbrett für den Bergretter
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.9), dark);
        step.position.set(sx * 0.56, 0.34, -0.15); body.add(step);
    }
    for (const sz of [-0.55, 0.62]) {                 // zwei Querträger als Bogen
        const cross = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 18, Math.PI), steel);
        cross.position.set(0, 0.14, sz); cross.rotation.y = Math.PI / 2; body.add(cross);
    }

    // ===== RETTUNGSWINDE =====
    // Ausleger mit Umlenkrolle über der Schiebetür, darunter die Trosse.
    const armW = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.075, 0.11), steel);
    armW.position.set(0.72, 1.30, 0.25); body.add(armW);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 12), dark);
    drum.rotation.z = Math.PI / 2; drum.position.set(0.5, 1.30, 0.25); body.add(drum);
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), steel);
    pulley.rotation.z = Math.PI / 2; pulley.position.set(0.96, 1.27, 0.25); body.add(pulley);
    // Die Winde hängt AUSSERHALB der Skalierung, damit Seillängen in echten
    // Weltmetern gerechnet werden können.
    const winch = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 }));
    rope.position.y = -0.5; winch.add(rope);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), steel);
    hook.rotation.x = Math.PI / 2; winch.add(hook);
    const sling = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.032, 6, 16), trim);
    sling.rotation.x = Math.PI / 2; winch.add(sling);
    // Bergesack: darin liegt der Verletzte sichtbar quer unter dem Heli
    const bag = new THREE.Group();
    const shellB = new THREE.Mesh(new THREE.CapsuleGeometry
        ? new THREE.CapsuleGeometry(0.17, 0.9, 6, 12)
        : new THREE.CylinderGeometry(0.17, 0.17, 1.1, 12), trim);
    shellB.rotation.z = Math.PI / 2; bag.add(shellB);
    for (const bz of [-0.32, 0, 0.32]) {              // Gurte
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 5, 12), dark);
        strap.rotation.y = Math.PI / 2; strap.position.x = bz; bag.add(strap);
    }
    const lift2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.02), steel);
    lift2.position.y = 0.16; bag.add(lift2);
    bag.visible = false; winch.add(bag);
    winch.position.set(0.96 * S, 1.27 * S, 0.25 * S); g.add(winch);

    // ===== BELEUCHTUNG =====
    const search = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xfff0b0, emissiveIntensity: 2 }));
    search.position.set(0, 0.5, 0.92); body.add(search);
    const searchHous = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 12), dark);
    searchHous.rotation.x = Math.PI / 2; searchHous.position.set(0, 0.5, 0.84); body.add(searchHous);
    const beaconTop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10),
        new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 1.6 }));
    beaconTop.position.set(0, 1.34, -1.05); body.add(beaconTop);
    for (const [bx, bc] of [[-0.56, 0xef4444], [0.56, 0x22c55e]]) {
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
            new THREE.MeshStandardMaterial({ color: bc, emissive: bc, emissiveIntensity: 2 }));
        nav.position.set(bx, 0.78, -0.1); body.add(nav);
    }
    // Kennung am Heck
    const idTex = makeCallsignTexture('RETTUNG 1');
    const idP = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22),
        new THREE.MeshStandardMaterial({ map: idTex, transparent: true, side: THREE.DoubleSide }));
    idP.position.set(0.12, 1.22, -1.9); idP.rotation.y = Math.PI / 2; body.add(idP);

    g.userData.victim = bag;      // Rückwärtskompatibel: hieß früher `victim`
    g.userData.bag = bag;
    g.userData.sling = sling;
    g.userData.slingWorld = new THREE.Vector3();
    let rotorSpeed = 0, ropeLen = 0.05;
    g.userData.setRotor = (v) => { rotorSpeed = v; };
    g.userData.setWinch = (len) => {
        ropeLen = Math.max(0.05, len);
        rope.scale.y = ropeLen; rope.position.y = -ropeLen / 2;
        hook.position.y = -ropeLen;
        sling.position.y = -ropeLen - 0.1;
        bag.position.y = -ropeLen - 0.28;
    };
    /** Weltposition der Bergeschlinge — daran hängt der Verletzte. */
    g.userData.getSlingPos = (out) => {
        sling.getWorldPosition(out || g.userData.slingWorld);
        return out || g.userData.slingWorld;
    };
    // ===== NACHTBELEUCHTUNG =====
    // Ein Rettungsheli im Nachteinsatz ist von weitem an seinem Suchscheinwerfer
    // zu erkennen. Dazu Landescheinwerfer an den Kufen, Blitzlichter oben und
    // unten und je ein Lichtkegel, damit man den Strahl auch sieht.
    const beamMatH = new THREE.MeshBasicMaterial({
        color: 0xfff2cc, transparent: true, opacity: 0, depthWrite: false,
        fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const heliBeams = [];
    /**
     * Lichtkegel am Heli.
     *
     * WICHTIG ist der Drehpunkt: der Kegel hängt in einer Gruppe, die GENAU
     * an der Lampe sitzt, und ist darin um seine halbe Länge nach unten
     * versetzt. Vorher lag der Drehpunkt in der Kegelmitte — beim Schwenken
     * wanderte deshalb auch die Spitze weg und der Strahl saß nicht mehr
     * unter dem Scheinwerfer.
     */
    const mkBeam = (x, y, z, len2, rad, tilt) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, z);
        pivot.rotation.x = tilt || 0;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len2, 16, 1, true), beamMatH);
        cone.position.y = -len2 / 2;          // Spitze bleibt im Ursprung = an der Lampe
        cone.renderOrder = 6;
        pivot.add(cone);
        body.add(pivot); heliBeams.push(cone);
        return pivot;
    };
    // EIN Suchscheinwerfer, mehr nicht. Drei gleichzeitige Kegel sahen aus
    // wie eine Bühnenbeleuchtung, nicht wie ein Rettungshubschrauber.
    // Ursprung des Kegels EXAKT an der Scheinwerferkugel (search steht bei
    // 0 / 0.50 / 0.92) — vorher saß er 8 cm daneben.
    const searchBeam = mkBeam(0, 0.46, 0.92, 22, 4.2, 0);
    const landMat = new THREE.MeshStandardMaterial({
        color: 0xfff8e0, emissive: 0xffeec0, emissiveIntensity: 1.0 });
    // Blitzlichter (Strobes) oben auf dem Getriebe und unten am Rumpf
    const strobeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 });
    const strobes = [];
    for (const [sxp, syp, szp] of [[0, 1.70, 0.1], [0, 0.42, -0.5]]) {
        const st3 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), strobeMat);
        st3.position.set(sxp, syp, szp); body.add(st3); strobes.push(st3);
    }
    let nightLevel = 0;
    /** `dark` 0 = Tag, 1 = Nacht. */
    g.userData.setNight = (dark2) => {
        nightLevel = Math.max(0, Math.min(1, dark2));
        search.material.emissiveIntensity = 1.2 + nightLevel * 5.5;
        landMat.emissiveIntensity = 0.5 + nightLevel * 4.0;
        beamMatH.opacity = nightLevel * 0.14;
        for (const b of heliBeams) b.visible = nightLevel > 0.05;
    };
    g.userData.setNight(0);

    g.userData.update = (t, dt = 0.016) => {
        rotor.rotation.y += rotorSpeed * dt * 24;
        tail.rotation.x += rotorSpeed * dt * 38;
        // Suchscheinwerfer schwenkt langsam, wie beim Absuchen des Hangs
        // Schwenk um die LAMPE (Drehpunkt der Gruppe), nicht um die Kegelmitte.
        // Zusätzlich wird die Neigung des Rumpfes herausgerechnet, damit der
        // Strahl senkrecht nach unten hängt statt mit der Zelle zu kippen.
        searchBeam.rotation.z = Math.sin(t * 0.7) * 0.16 - (g.rotation.z || 0);
        searchBeam.rotation.x = Math.sin(t * 0.5 + 1.1) * 0.11;
        // Strobes: kurzer Doppelblitz, sonst dunkel
        const ph2 = (t * 0.9) % 1;
        const flash = (ph2 < 0.045 || (ph2 > 0.10 && ph2 < 0.145)) ? 1 : 0;
        strobeMat.emissiveIntensity = 0.1 + flash * (2 + nightLevel * 9);
        // Blattkonus: unter Last biegen sich die Blätter sichtbar nach oben
        rotor.position.y = 1.74 + rotorSpeed * 0.03;
        swash.rotation.z = Math.sin(t * 0.8) * 0.02 * rotorSpeed;
        search.material.emissiveIntensity = 1.4 + Math.abs(Math.sin(t * 3)) * 1.2;
        beaconTop.material.emissiveIntensity = Math.sin(t * 7) > 0.4 ? 2.4 : 0.15;
        // Trosse pendelt bei ausgefahrener Winde leicht nach
        if (ropeLen > 0.6) winch.rotation.z = Math.sin(t * 1.9) * 0.05;
        else winch.rotation.z = 0;
    };
    g.userData.setWinch(0.05);
    return g;
}

/** Kennung als kleine Schrifttextur fürs Heck. */
function makeCallsignTexture(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 256, 64);
    c.fillStyle = '#1f2937';
    c.font = 'bold 38px Helvetica, Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(text), 128, 34);
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4; tx.needsUpdate = true;
    return tx;
}

/**
 * SCHWERLAST-HELIKOPTER für den Seilbahnbau: kräftiger Doppelrotor-Lastenheli
 * mit Außenlast am Lasthaken, der beim Bau einer Anlage das Zugseil über die
 * gesamte Trasse einfliegt. Bewusst gedrungener und industrieller als der
 * schlanke gelbe Rettungshubschrauber.
 */
export function makeCargoHeli() {
    const g = new THREE.Group();
    const orange = new THREE.MeshStandardMaterial({ color: 0xea6a15, roughness: 0.5, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.6, metalness: 0.4 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc3dc, roughness: 0.1,
        metalness: 0.3, transparent: true, opacity: 0.6 });

    // Wuchtiger Rumpf: Kastenform mit abgeschrägter Nase
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.35, 4.6), orange);
    body.position.y = 1.5; body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.9), orange);
    nose.position.set(0, 1.42, 2.6); nose.rotation.x = -0.18; g.add(nose);
    // Cockpitverglasung
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.72, 1.1), glass);
    cockpit.position.set(0, 1.62, 2.35); g.add(cockpit);
    // Heckausleger mit hinterem Rotorturm (Tandem-Bauweise)
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.6), orange);
    boom.position.set(0, 1.72, -2.6); g.add(boom);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 1.0), orange);
    pylon.position.set(0, 2.5, -3.0); pylon.rotation.x = 0.22; g.add(pylon);
    // Warnstreifen
    for (const sz of [1.2, -0.6]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.26, 0.5), dark);
        stripe.position.set(0, 1.5, sz); g.add(stripe);
    }
    // Zwei Rotormasten mit je vier Blättern (vorn und hinten)
    const rotors = [];
    for (const [rz, ry] of [[1.2, 2.35], [-3.0, 3.25]]) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.55, 8), metal);
        mast.position.set(0, ry - 0.2, rz); g.add(mast);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10), dark);
        hub.position.set(0, ry, rz); g.add(hub);
        const rot = new THREE.Group();
        rot.position.set(0, ry + 0.06, rz);
        for (let b = 0; b < 4; b++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.05, 0.34), dark);
            blade.rotation.y = (b / 4) * Math.PI * 2;
            rot.add(blade);
        }
        g.add(rot); rotors.push(rot);
    }
    // Kufen auf kräftigen Streben
    for (const sx of [-0.62, 0.62]) {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 3.8), metal);
        skid.position.set(sx, 0.42, -0.1); g.add(skid);
        for (const sz of [1.1, -1.1]) {
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0), metal);
            strut.position.set(sx * 0.8, 0.92, sz); strut.rotation.z = sx > 0 ? -0.3 : 0.3; g.add(strut);
        }
    }
    // Lasthaken mit Seil und Seiltrommel als Außenlast
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 5), metal);
    rope.position.set(0, -0.4, 0); g.add(rope);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 14), dark);
    drum.rotation.z = Math.PI / 2; drum.position.set(0, -1.75, 0); drum.castShadow = true; g.add(drum);
    const drumRim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 6, 16), metal);
    drumRim.rotation.y = Math.PI / 2; drumRim.position.set(0, -1.75, 0); g.add(drumRim);
    // Blinkende Positionslichter
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.4 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), beaconMat);
    beacon.position.set(0, 2.25, -1.0); g.add(beacon);

    g.userData.rotors = rotors;
    g.userData.load = { rope, drum, rim: drumRim };
    g.userData.update = (t) => {
        for (const r of rotors) r.rotation.y += 0.55;
        beaconMat.emissiveIntensity = (Math.sin(t * 6) > 0.4) ? 1.8 : 0.15;
    };
    return g;
}

/**
 * TRAURIGES GESICHT über dem Kopf: zeigt an, dass ein Gast ein konkretes
 * Ärgernis hat (kein Schnee, Hunger, dringend zur Toilette, zu lange auf
 * Hilfe wartend). Bewusst anders als das rote Ausrufezeichen.
 */
export function makeSadMark() {
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, 96, 96);
    // weicher Schein
    const gr = x.createRadialGradient(48, 48, 6, 48, 48, 46);
    gr.addColorStop(0, 'rgba(250,204,21,0.95)');
    gr.addColorStop(1, 'rgba(250,204,21,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(48, 48, 46, 0, Math.PI * 2); x.fill();
    // Gesichtsscheibe
    x.fillStyle = '#facc15'; x.beginPath(); x.arc(48, 48, 30, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#78350f'; x.lineWidth = 4;
    x.beginPath(); x.arc(48, 48, 30, 0, Math.PI * 2); x.stroke();
    // Augen
    x.fillStyle = '#78350f';
    x.beginPath(); x.arc(38, 41, 4.5, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(58, 41, 4.5, 0, Math.PI * 2); x.fill();
    // heruntergezogener Mund
    x.strokeStyle = '#78350f'; x.lineWidth = 5;
    x.beginPath(); x.arc(48, 68, 15, Math.PI * 1.2, Math.PI * 1.8); x.stroke();
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.8, depthTest: true, depthWrite: false
    }));
    spr.scale.set(0.8, 0.8, 0.8);
    spr.visible = false;
    spr.renderOrder = 12;
    return spr;
}
