// ============================================================
// 3D-GEBÄUDE & LIFT-ANLAGEN (Three.js)
// Chalet-Stil: Steinsockel, Holzwände, verschneite Giebeldächer,
// warm leuchtende Fenster. Lifte mit Stützen, Seil & Gondeln.
// Alle Höhen in WELT-Einheiten des 3D-Terrains (y = height * hScale).
// ============================================================
import * as THREE from 'three';

// ===== WIND FÜR DIE ANLAGEN =====
// Scene3D meldet Böenstärke und Richtung hierher; alle hängenden Kabinen
// lesen sie und pendeln entsprechend aus. Über eine Modulvariable statt über
// jede einzelne Signatur, weil sonst jede Anlage einen neuen Parameter
// bräuchte.
let _windGust = 0, _windDir = 0;
export function setWindGust(f = 0, dir = 0) { _windGust = f; _windDir = dir; }
/**
 * Querkraft des Windes auf eine Kabine, die entlang `yaw` fährt.
 * 0 = Wind kommt von vorn/hinten, ±1 = voll von der Seite.
 */
function windCross(yaw) { return Math.sin(_windDir - yaw) * _windGust; }

let _levelCountry = 'Österreich';
/** Setzt das Land des laufenden Levels — bestimmt alle Landesflaggen. */
export function setLevelCountry(country) { if (country) _levelCountry = String(country); }
export function getLevelCountry() { return _levelCountry; }


// wiederverwendbare Materialien (Performance)
export const MATS = {
    stone: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.85 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x5a3826, roughness: 0.8 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf3f7ff, roughness: 0.6 }),
    winGlow: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffab40, emissiveIntensity: 0.8, roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x86c5e8, roughness: 0.25, metalness: 0.3 }),
    // Echtes Metall: hohe Metalness, niedrige Rauheit. Erst zusammen mit
    // scene.environment entstehen daraus sichtbare Spiegelungen an Stützen,
    // Seilen, Klemmen und Geländern.
    metal: new THREE.MeshStandardMaterial({ color: 0xc2ccd7, roughness: 0.34, metalness: 0.55, envMapIntensity: 0.6 }),
    // Kabinenlack: metallisch, aber matt — sieht nach Betriebsjahren aus
    cabinR: new THREE.MeshStandardMaterial({ color: 0xe04242, roughness: 0.42, metalness: 0.42, envMapIntensity: 0.55 }),
    cabinB: new THREE.MeshStandardMaterial({ color: 0x3494db, roughness: 0.42, metalness: 0.42, envMapIntensity: 0.55 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.95 })
};
const M = MATS;

/**
 * ===== NACHTBELEUCHTUNG VON ANLAGEN =====
 *
 * Zwei Effekte, die erst in der Dämmerung sichtbar werden:
 *  - Kabinen glimmen von innen (warmes Licht durch die Scheiben)
 *  - auf jedem ZWEITEN Mast blinkt ein kleines rotes Hindernisfeuer
 *
 * Beides wird über `group.userData.setNight(dark, t)` gesteuert; `dark` läuft
 * von 0 (heller Tag) bis 1 (Nacht). Die Szene ruft das je Frame auf.
 */
function attachNightLights(group, opts) {
    const beacons = opts.beacons || [];           // rote Blinklichter
    // FENSTER werden ausdrücklich markiert (material.userData.isWindow).
    // Nur sie leuchten nachts — der Wagenkasten bleibt dunkel, sonst glüht
    // die ganze Kabine wie eine Laterne.
    const windows = [];
    group.traverse(o => {
        const m = o.material;
        if (m && !Array.isArray(m) && m.userData && m.userData.isWindow) windows.push(m);
    });
    group.userData.setNight = (dark, t) => {
        const d = Math.max(0, Math.min(1, dark));
        for (const m of windows) {
            if (!m.emissive) continue;
            m.emissive.setRGB(1.0, 0.74, 0.40);   // warmes Glühlampenlicht
            m.emissiveIntensity = d * 0.42;       // nur ein leises Glimmen
            m.opacity = 0.55 + d * 0.18;          // nachts leicht dichter
        }
        // Blinken: kurzer Puls, alle ~1.6 s, Masten leicht versetzt
        for (const b of beacons) {
            const ph = (t * 0.62 + b.off) % 1;
            const on = ph < 0.14;
            b.mat.emissiveIntensity = (on ? 2.4 : 0.05) * (0.25 + d * 0.75);
            b.mat.opacity = 0.35 + (on ? 0.6 : 0.0) * (0.3 + d * 0.7);
        }
    };
    group.userData.setNight(0, 0);
}

/** Kleines rotes Hindernisfeuer auf einem Mastkopf. */
function makeBeacon(x, y, z, off) {
    const mat = new THREE.MeshStandardMaterial({
        color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 0.05,
        transparent: true, opacity: 0.35, roughness: 0.4
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat);
    mesh.position.set(x, y, z);
    return { mesh, mat, off };
}


// Kaminrauch: kleines Partikelsystem, das an einer lokalen Position aufsteigt.
function makeChimneySmoke(x, y, z) {
    const N = 26;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd7dbe0, size: 0.22, transparent: true, opacity: 0.42, depthWrite: false }));
    const update = (t) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            let ph = ((i / p.count) + t * 0.28) % 1;
            p.setX(i, x + Math.sin(t * 1.5 + i) * 0.28 * ph);
            p.setY(i, y + ph * 2.2);
            p.setZ(i, z + Math.cos(t * 1.1 + i * 0.7) * 0.2 * ph);
        }
        p.needsUpdate = true;
    };
    return { pts, update };
}

function addWindows(group, w, d, h, y0) {
    // vier Fenster vorne + hinten, warm leuchtend
    const wg = new THREE.PlaneGeometry(0.5, 0.6);
    for (const sign of [1, -1]) {
        for (let i = -1; i <= 1; i++) {
            if (i === 0 && w < 2.2) continue;
            const m = new THREE.Mesh(wg, M.winGlow);
            m.position.set(i * w * 0.28, y0 + h * 0.5, sign * (d / 2 + 0.01));
            if (sign < 0) m.rotation.y = Math.PI;
            group.add(m);
        }
    }
}

/**
 * Chalet / Hütte: Steinsockel + Holzkörper + verschneites Giebeldach.
 * size: {w, d} Grundfläche, floors: Stockwerke
 */
export function makeChalet(size = { w: 2.4, d: 2 }, floors = 1) {
    const g = new THREE.Group();
    const { w, d } = size;
    const bodyH = 1.1 * floors;

    // Steinsockel
    const sock = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.35, d + 0.1), M.stone);
    sock.position.y = 0.175; sock.castShadow = sock.receiveShadow = true;
    g.add(sock);

    // Holzkörper
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), M.wood);
    body.position.y = 0.35 + bodyH / 2; body.castShadow = body.receiveShadow = true;
    g.add(body);
    addWindows(g, w, d, bodyH, 0.35);

    // Giebeldach (Prisma) + Schneeauflage
    const roofH = 0.8;
    const roofGeo = new THREE.CylinderGeometry(0.001, d * 0.72, roofH, 3, 1);
    roofGeo.rotateY(Math.PI / 2); // First entlang x
    const roof = new THREE.Mesh(roofGeo, M.roof);
    roof.scale.set(1, 1, (w + 0.5) / (d * 0.72 * Math.sqrt(3)) * 1.0);
    roof.position.y = 0.35 + bodyH + roofH / 2;
    roof.rotation.z = 0;
    roof.castShadow = true;
    // einfacher: eigenes Prisma bauen
    g.remove(roof);
    const rp = makePrismRoof(w + 0.5, d + 0.4, roofH);
    rp.position.y = 0.35 + bodyH;
    g.add(rp);
    // ===== Alpine Details: Balkon, Blumenkästen, Kamin, Wetterfahne, Laterne =====
    const balcY = 0.35 + bodyH * 0.62;
    const balc = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.08, 0.42), M.woodDark);
    balc.position.set(0, balcY, d / 2 + 0.2); g.add(balc);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.05, 0.05), M.woodDark);
    rail.position.set(0, balcY + 0.38, d / 2 + 0.38); g.add(rail);
    const nBar = Math.max(4, Math.round(w * 2.5));
    for (let i = 0; i <= nBar; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), M.woodDark);
        bar.position.set(-(w + 0.3) / 2 + (w + 0.3) * i / nBar, balcY + 0.2, d / 2 + 0.38); g.add(bar);
    }
    // Blumenkästen am Balkon (rote Geranien)
    for (const bx of [-w * 0.28, w * 0.28]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.12, 0.16), M.woodDark);
        box.position.set(bx, balcY + 0.12, d / 2 + 0.44); g.add(box);
        for (let f = 0; f < 3; f++) {
            const fl = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6),
                new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.8 }));
            fl.position.set(bx - w * 0.1 + f * w * 0.1, balcY + 0.21, d / 2 + 0.44); g.add(fl);
        }
    }
    // Steinkamin mit Rauchfang
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), M.stone);
    chim.position.set(w * 0.3, 0.35 + bodyH + roofH * 0.55, -d * 0.2); chim.castShadow = true; g.add(chim);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.4), M.stone);
    cap.position.set(w * 0.3, 0.35 + bodyH + roofH * 0.55 + 0.48, -d * 0.2); g.add(cap);
    // Wetterfahne auf dem First
    const vane = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), M.metal);
    vane.position.set(-w * 0.25, 0.35 + bodyH + roofH + 0.25, 0); g.add(vane);
    const vaneFlag = makeFlagCloth(0.24, 0.14, { color: 0x1f2937, seg: 8 });
    vaneFlag.position.set(-w * 0.25, 0.35 + bodyH + roofH + 0.42, 0); g.add(vaneFlag);
    // Laterne neben der Tür
    const lampPost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), M.metal);
    lampPost.position.set(-w * 0.34, 0.35 + bodyH * 0.62, d / 2 + 0.1); g.add(lampPost);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), M.winGlow);
    lamp.position.set(-w * 0.34, 0.35 + bodyH * 0.62, d / 2 + 0.22); g.add(lamp);
    // Brennholzstapel an der Seitenwand
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 7), r % 2 ? M.wood : M.woodDark);
        log.rotation.z = Math.PI / 2;
        log.position.set(-(w / 2 + 0.3), 0.4 + r * 0.12, -d * 0.2 + c * 0.12); g.add(log);
    }

    // Kamin + aufsteigender Rauch
    const chY = 0.35 + bodyH + roofH * 0.7;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), M.stone);
    chimney.position.set(w * 0.28, chY, 0);
    chimney.castShadow = true;
    g.add(chimney);
    const smoke = makeChimneySmoke(w * 0.28, chY + 0.5, 0);
    g.add(smoke.pts);
    g.userData.update = smoke.update;

    g.userData.footprintY = 0.35 + bodyH + roofH;
    return g;
}

// Giebeldach als Prisma mit Schnee-Oberseite
function makePrismRoof(w, d, h) {
    const grp = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(geo, M.roof);
    roof.castShadow = true;
    grp.add(roof);
    // Schnee: leicht größeres, flaches Prisma oben drauf
    const sgeo = new THREE.ExtrudeGeometry(shape, { depth: w + 0.15, bevelEnabled: false });
    sgeo.translate(0, 0.06, -(w + 0.15) / 2);
    sgeo.rotateY(Math.PI / 2);
    sgeo.scale(1.04, 0.6, 1);
    const snow = new THREE.Mesh(sgeo, M.snow);
    grp.add(snow);
    return grp;
}

/** Großes Hotel: mehrstöckiger Bau mit Balkonreihen + Giebeldach. */
/** Hotelklassen aus dem 2D: Budget / Mittelklasse / Luxus. */
/**
 * HOTELKLASSEN — sechs Stufen von der Pension bis zum Grandhotel.
 *
 * Jede Stufe unterscheidet sich in Masse, Materialität und Ausstattung,
 * nicht nur in der Skalierung: die Pension ist ein umgebautes Wohnhaus,
 * das Grandhotel bekommt Portal, Seitenflügel, Turm und Dachterrasse.
 * `HOTEL_BEDS` (siehe unten) hält die zugehörigen Bettenzahlen.
 */
export function makeHotelClass(cls = 'mid') {
    const floors = { pension: 2, budget: 3, standard: 4, mid: 5, resort: 6, luxury: 7 }[cls] ?? 4;
    const g = makeHotel(floors);
    const gold  = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.32, metalness: 0.65 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fb4cc, roughness: 0.12, metalness: 0.4,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    glass.userData.isWindow = true;
    const warmGlow = new THREE.MeshStandardMaterial({ color: 0xffe0a3, emissive: 0xffb347, emissiveIntensity: 1.0 });
    const carpet = new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.85 });
    const stoneL = new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.82 });
    const woodD  = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.8 });

    /** Reihe kleiner Balkone an einer Fassadenseite. */
    const balconies = (n, y0, dy, zSign, width) => {
        for (let f = 0; f < n; f++) {
            const y = y0 + f * dy;
            const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.09, 0.55), stoneL);
            slab.position.set(0, y, zSign * 1.75); g.add(slab);
            for (const hy of [0.16, 0.34]) {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, 0.045), M.metal);
                rail.position.set(0, y + hy, zSign * 2.0); g.add(rail);
            }
            // Blumenkästen
            for (let k = -1; k <= 1; k++) {
                const box = new THREE.Mesh(new THREE.BoxGeometry(width * 0.24, 0.13, 0.16), woodD);
                box.position.set(k * width * 0.3, y + 0.1, zSign * 1.98); g.add(box);
                const bloom = new THREE.Mesh(new THREE.BoxGeometry(width * 0.22, 0.09, 0.13),
                    new THREE.MeshStandardMaterial({ color: 0xd7484f, roughness: 0.85 }));
                bloom.position.set(k * width * 0.3, y + 0.20, zSign * 1.98); g.add(bloom);
            }
        }
    };

    if (cls === 'pension') {
        // Umgebautes Wohnhaus: klein, breiter als hoch, Holzbalkon, Gaststube
        g.scale.set(0.72, 0.66, 0.78);
        const shed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.6), M.wood);
        shed.position.set(2.6, 0.95, -0.4); shed.castShadow = true; g.add(shed);
        const shedRoof = makePrismRoof(2.5, 1.8, 0.55);
        shedRoof.position.set(2.6, 1.5, -0.4); g.add(shedRoof);
        // Holzbalkon über die ganze Front
        const bal = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.1, 0.7), woodD);
        bal.position.set(0, 2.05, 1.75); g.add(bal);
        for (let k = 0; k < 11; k++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), woodD);
            bar.position.set(-2.0 + k * 0.4, 2.28, 2.05); g.add(bar);
        }
        // Gartenzaun und zwei Bänke
        for (let k = 0; k < 9; k++) {
            const pk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), woodD);
            pk.position.set(-2.4 + k * 0.6, 0.45, 2.9); g.add(pk);
        }
    } else if (cls === 'budget') {
        // Zweckbau: flach, nüchtern, aber mit Vordach und Leuchtreklame
        g.scale.set(0.9, 0.85, 0.92);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.1), stoneL);
        canopy.position.set(0, 1.35, 1.95); g.add(canopy);
        for (const sx of [-1.2, 1.2]) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), M.metal);
            col.position.set(sx, 0.72, 2.35); g.add(col);
        }
        balconies(2, 2.0, 1.0, 1, 3.4);
    } else if (cls === 'standard') {
        // Klassisches Alpenhotel: Balkonreihen, Erker, Wintergarten
        g.scale.set(1.0, 1.0, 1.0);
        balconies(3, 1.7, 1.0, 1, 3.6);
        const erker = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.6, 8), M.wood);
        erker.position.set(-2.0, 1.7, 1.2); erker.castShadow = true; g.add(erker);
        const erkerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 8), M.cabinR);
        erkerRoof.position.set(-2.0, 3.2, 1.2); g.add(erkerRoof);
        const winterG = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.4), glass);
        winterG.position.set(1.5, 0.95, 2.1); g.add(winterG);
    } else if (cls === 'mid') {
        // Vier-Sterne-Haus: Seitenflügel, Glasfoyer, Terrasse mit Schirmen
        g.scale.set(1.1, 1.12, 1.05);
        for (const sx of [-1, 1]) {
            const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 2.6), M.wood);
            wing.position.set(sx * 2.7, 1.8, -0.2); wing.castShadow = true; g.add(wing);
            const wr = makePrismRoof(2.1, 2.9, 0.85);
            wr.position.set(sx * 2.7, 3.2, -0.2); g.add(wr);
        }
        const foyer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 1.5), glass);
        foyer.position.set(0, 1.25, 2.1); g.add(foyer);
        balconies(3, 2.3, 1.0, 1, 3.6);
        // Terrasse mit Sonnenschirmen
        const terr = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.14, 2.2), stoneL);
        terr.position.set(0, 0.45, 3.4); g.add(terr);
        for (const sx of [-1.6, 0, 1.6]) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), M.metal);
            pole.position.set(sx, 1.0, 3.4); g.add(pole);
            const shade = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.32, 8),
                new THREE.MeshStandardMaterial({ color: 0xe7dfd0, roughness: 0.9 }));
            shade.position.set(sx, 1.6, 3.4); g.add(shade);
        }
    } else if (cls === 'resort') {
        // Großes Resort: zwei versetzte Baukörper, Verbindungsbrücke, Pool
        g.scale.set(1.18, 1.2, 1.12);
        const annex = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 2.6), M.wood);
        annex.position.set(3.6, 2.1, -1.0); annex.castShadow = true; g.add(annex);
        const ar = makePrismRoof(3.6, 3.0, 1.0);
        ar.position.set(3.6, 3.8, -1.0); g.add(ar);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.1), glass);
        bridge.position.set(2.2, 2.4, -0.6); g.add(bridge);
        balconies(4, 1.9, 1.0, 1, 3.6);
        // Beheizter Aussenpool mit Beckenrand
        const pool = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 1.7),
            new THREE.MeshStandardMaterial({ color: 0x2f9fd6, roughness: 0.12, metalness: 0.25,
                transparent: true, opacity: 0.85 }));
        pool.position.set(-1.6, 0.5, 3.3); g.add(pool);
        const rim = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 2.1), stoneL);
        rim.position.set(-1.6, 0.44, 3.3); g.add(rim);
        for (let k = 0; k < 4; k++) {
            const bed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.0),
                new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.9 }));
            bed.position.set(0.6 + k * 0.62, 0.58, 3.3); bed.rotation.z = -0.12; g.add(bed);
        }
    } else if (cls === 'luxury') {
        // Grandhotel: Portal mit Säulen, Turm, Dachterrasse, Fahnen
        g.scale.set(1.3, 1.4, 1.22);
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.4), gold);
        canopy.position.set(0, 1.55, 2.05); canopy.castShadow = true; g.add(canopy);
        const rug = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 2.6), carpet);
        rug.position.set(0, 0.43, 3.0); g.add(rug);
        for (const sx of [-1.4, 1.4]) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.5, 12), stoneL);
            col.position.set(sx, 0.85, 2.6); col.castShadow = true; g.add(col);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.14, 12), gold);
            cap.position.set(sx, 1.66, 2.6); g.add(cap);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), warmGlow);
            lamp.position.set(sx, 1.86, 2.6); g.add(lamp);
        }
        // Eckturm mit Zwiebelhaube
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 4.6, 12), M.wood);
        tower.position.set(-2.4, 2.7, -0.8); tower.castShadow = true; g.add(tower);
        const onion = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 12), M.cabinB);
        onion.scale.set(1, 1.3, 1); onion.position.set(-2.4, 5.4, -0.8); g.add(onion);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 8), gold);
        spire.position.set(-2.4, 6.4, -0.8); g.add(spire);
        balconies(4, 2.1, 1.0, 1, 3.8);
        // Dachterrasse mit Glasbrüstung und Spa-Kuppel
        const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 2.4), stoneL);
        deck.position.set(1.2, 4.1, 0); g.add(deck);
        for (const [dx, dz, dw] of [[1.2, 1.2, 3.6], [1.2, -1.2, 3.6]]) {
            const par = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.5, 0.05), glass);
            par.position.set(dx, 4.4, dz); g.add(par);
        }
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10, 0, 6.283, 0, Math.PI / 2), glass);
        dome.position.set(1.9, 4.16, 0); g.add(dome);
        // Zwei Landesflaggen am Portal
        for (const sx of [-1.9, 1.9]) {
            const fp = makeFlagPole(2.2, { country: _levelCountry, w: 0.9, h: 0.56 });
            fp.position.set(sx, 1.7, 2.2); g.add(fp);
        }
    }
    // ===== BELEGUNGSANZEIGE =====
    // Kleine Leuchttafel an der Fassade: grün = Zimmer frei, rot = ausgebucht.
    // Wird zur Laufzeit über setOccupancy() gefüttert.
    const board = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x0d1520, roughness: 0.45 }));
    board.add(plate);
    const barBg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x2a3442, roughness: 0.7 }));
    barBg.position.set(0, -0.10, 0.045); board.add(barBg);
    const fillMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 1.1 });
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.03), fillMat);
    fill.position.set(0, -0.10, 0.05); board.add(fill);
    const txtMat = new THREE.MeshStandardMaterial({ transparent: true, emissiveIntensity: 1.2 });
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.2), txtMat);
    txt.position.set(0, 0.10, 0.05); board.add(txt);
    board.position.set(0, 1.05, 2.32);
    g.add(board);
    let lastPct = -1;
    /** @param used belegte Betten @param total Gesamtbetten */
    g.userData.setOccupancy = (used, total) => {
        const pct = total > 0 ? Math.max(0, Math.min(1, used / total)) : 0;
        fill.scale.x = Math.max(0.001, pct);
        fill.position.x = -0.5 * (1 - pct);
        // grün -> gelb -> rot, je voller das Haus
        fillMat.color.setRGB(0.30 + pct * 0.62, 0.85 - pct * 0.55, 0.45 - pct * 0.38);
        fillMat.emissive.copy(fillMat.color);
        const shown = Math.round(pct * 100);
        if (shown !== lastPct) {
            lastPct = shown;
            const label = Math.round(used) + '/' + total;
            const tx = makeLabelTexture(label, pct > 0.92 ? '#fca5a5' : '#dbeafe', '#0d1520');
            txtMat.map = tx; txtMat.emissiveMap = tx; txtMat.needsUpdate = true;
            txtMat.emissive.setHex(0x93c5fd);
        }
    };
    g.userData.hotelClass = cls;
    return g;
}

/** Bettenzahl je Hotelklasse — von der kleinen Pension bis zum Grandhotel. */
export const HOTEL_BEDS = {
    pension: 25, budget: 60, standard: 90, mid: 130, resort: 180, luxury: 250
};

export function makeChaletClass(cls = 'small') {
    if (cls === 'large') return makeChalet({ w: 3.4, d: 2.8 }, 2);
    if (cls === 'luxury') {
        const g = makeChalet({ w: 4.2, d: 3.2 }, 2);
        const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.6 });
        // Panoramabalkon + beleuchteter Außenpool
        const balc = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.3), M.woodDark);
        balc.position.set(0, 1.55, 1.9); g.add(balc);
        for (let i = -4; i <= 4; i++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), gold);
            bar.position.set(i * 0.5, 1.85, 2.5); g.add(bar);
        }
        const pool = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.2),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.3, emissive: 0x0e7490, emissiveIntensity: 0.5 }));
        pool.position.set(2.6, 0.12, 1.4); g.add(pool);
        return g;
    }
    return makeChalet({ w: 2.4, d: 2 }, 1);
}
export function makeHotel(floorsHint = 4) {
    const g = new THREE.Group();
    const w = 4, d = 3, bodyH = 3.2;
    const sock = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.4, d + 0.2), M.stone);
    sock.position.y = 0.2; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), M.wood);
    body.position.y = 0.4 + bodyH / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    // Balkonbänder + Fensterreihen
    for (let f = 0; f < 3; f++) {
        const y = 0.9 + f * 1.0;
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1), M.woodDark);
        band.position.y = y; g.add(band);
        for (let i = -1; i <= 1; i++) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.55), M.winGlow);
            win.position.set(i * 1.1, y + 0.35, d / 2 + 0.02); g.add(win);
            const win2 = win.clone(); win2.position.z = -d / 2 - 0.02; win2.rotation.y = Math.PI; g.add(win2);
        }
    }
    const rp = makePrismRoof(w + 0.5, d + 0.4, 1.1);
    rp.position.y = 0.4 + bodyH; g.add(rp);
    // ===== Hotel-Details: Namensschild, Vordach, Fahnen, Balkongeländer, Blumen =====
    // Beleuchteter Schriftzug über dem Eingang
    const nameSign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.3, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }));
    nameSign.position.set(0, 0.4 + bodyH * 0.92, d / 2 + 0.08); g.add(nameSign);
    for (let i = 0; i < 5; i++) {
        const letter = new THREE.Mesh(new THREE.BoxGeometry(w * 0.075, 0.16, 0.03),
            new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xfbbf24, emissiveIntensity: 0.85 }));
        letter.position.set(-w * 0.2 + i * w * 0.1, 0.4 + bodyH * 0.92, d / 2 + 0.13); g.add(letter);
    }
    // Eingangs-Vordach mit zwei Stützen
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.1, 0.9), M.woodDark);
    canopy.position.set(0, 1.5, d / 2 + 0.45); g.add(canopy);
    for (const sx of [-w * 0.2, w * 0.2]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 8), M.woodDark);
        col.position.set(sx, 0.75, d / 2 + 0.8); g.add(col);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), M.winGlow);
        lamp.position.set(sx, 1.65, d / 2 + 0.45); g.add(lamp);
    }
    // Balkongeländer + Blumenkästen auf jeder Etage
    for (let f = 0; f < 3; f++) {
        const y = 0.9 + f * 1.0;
        for (let i = -1; i <= 1; i++) {
            const railing = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.04), M.woodDark);
            railing.position.set(i * 1.1, y + 0.26, d / 2 + 0.16); g.add(railing);
            for (let b = 0; b < 4; b++) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.025), M.woodDark);
                bar.position.set(i * 1.1 - 0.3 + b * 0.2, y + 0.14, d / 2 + 0.16); g.add(bar);
            }
            if (f < 2) {   // Geranien auf den unteren Etagen
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), M.woodDark);
                box.position.set(i * 1.1, y + 0.09, d / 2 + 0.2); g.add(box);
                for (let fl = 0; fl < 3; fl++) {
                    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6),
                        new THREE.MeshStandardMaterial({ color: fl % 2 ? 0xdc2626 : 0xf472b6, roughness: 0.85 }));
                    flower.position.set(i * 1.1 - 0.15 + fl * 0.15, y + 0.16, d / 2 + 0.2); g.add(flower);
                }
            }
        }
    }
    // Zwei Fahnenmasten vor dem Haus
    for (const sx of [-w * 0.42, w * 0.42]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), M.metal);
        pole.position.set(sx, 1.2, d / 2 + 1.2); g.add(pole);
        const flag = makeFlagCloth(0.56, 0.34, sx < 0 ? { country: _levelCountry, color: 0xdc2626 } : { color: 0x1d4ed8 });
        flag.position.set(sx, 2.2, d / 2 + 1.2); g.add(flag);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.35), M.stone);
    chimney.position.set(w * 0.3, 0.4 + bodyH + 0.7, 0); chimney.castShadow = true; g.add(chimney);
    const smoke = makeChimneySmoke(w * 0.3, 0.4 + bodyH + 1.2, 0);
    g.add(smoke.pts); g.userData.update = smoke.update;
    return g;
}

/** Bergrestaurant / Gastro: breiter Flachbau mit Panoramafront + Terrasse. */
export function makeRestaurant() {
    const g = new THREE.Group();
    const w = 3.2, d = 2.4, bodyH = 1.3;
    const sock = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.3, d + 0.1), M.stone);
    sock.position.y = 0.15; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), M.wood);
    body.position.y = 0.3 + bodyH / 2; body.castShadow = true; g.add(body);
    // große Panoramaglasfront
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, bodyH * 0.7), M.glass);
    glass.position.set(0, 0.3 + bodyH * 0.5, d / 2 + 0.02); g.add(glass);
    // Terrasse (Deck + Sonnenschirme)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 1.3), M.woodDark);
    deck.position.set(0, 0.28, d / 2 + 0.75); deck.receiveShadow = true; g.add(deck);
    for (const x of [-w * 0.3, 0, w * 0.3]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), M.metal);
        pole.position.set(x, 0.6, d / 2 + 0.75); g.add(pole);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.28, 8), M.cabinR);
        shade.position.set(x, 0.95, d / 2 + 0.75); g.add(shade);
    }
    const rp = makePrismRoof(w + 0.4, d + 0.3, 0.7);
    rp.position.y = 0.3 + bodyH; g.add(rp);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.28), M.stone);
    chimney.position.set(-w * 0.3, 0.3 + bodyH + 0.55, 0); chimney.castShadow = true; g.add(chimney);
    // ===== Details: Wirtshausschild, Speisetafel, Wimpel, Bänke, Laternen =====
    // Ausleger-Schild wie am Gasthaus
    const armS = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), M.metal);
    armS.position.set(w / 2 + 0.05, 0.3 + bodyH * 0.85, d / 2 + 0.3); g.add(armS);
    const signPl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.6 }));
    signPl.position.set(w / 2 + 0.05, 0.3 + bodyH * 0.62, d / 2 + 0.55); g.add(signPl);
    const signGlow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.7 }));
    signGlow.position.set(w / 2 + 0.11, 0.3 + bodyH * 0.62, d / 2 + 0.55); g.add(signGlow);
    // Speisekarten-Tafel neben dem Eingang
    const menu = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }));
    menu.position.set(-w * 0.36, 0.62, d / 2 + 0.32); menu.rotation.x = -0.12; g.add(menu);
    for (let i = 0; i < 3; i++) {
        const chalk = new THREE.Mesh(new THREE.BoxGeometry(0.26 - i * 0.05, 0.03, 0.01),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
        chalk.position.set(-w * 0.36, 0.76 - i * 0.11, d / 2 + 0.36); g.add(chalk);
    }
    // Wimpelkette über der Terrasse
    const pennCols = [0xef4444, 0xfbbf24, 0x22c55e, 0x3b82f6];
    for (let i = 0; i < 9; i++) {
        const pen = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3),
            new THREE.MeshStandardMaterial({ color: pennCols[i % 4], side: THREE.DoubleSide }));
        pen.rotation.x = Math.PI;
        pen.position.set(-w * 0.42 + i * (w * 0.84 / 8), 1.28 - Math.sin(i / 8 * Math.PI) * 0.12, d / 2 + 1.35);
        g.add(pen);
    }
    // Bänke auf der Terrasse
    for (const bx of [-w * 0.22, w * 0.22]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.22), M.wood);
        bench.position.set(bx, 0.5, d / 2 + 1.25); g.add(bench);
        for (const lx of [-0.28, 0.28]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), M.woodDark);
            leg.position.set(bx + lx, 0.4, d / 2 + 1.25); g.add(leg);
        }
    }
    // Warme Laternen an der Fassade
    for (const lx of [-w * 0.45, w * 0.45]) {
        const lan = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.13), M.winGlow);
        lan.position.set(lx, 0.3 + bodyH * 0.8, d / 2 + 0.14); g.add(lan);
    }
    const smoke = makeChimneySmoke(-w * 0.3, 0.3 + bodyH + 1.0, 0);
    g.add(smoke.pts); g.userData.update = smoke.update;
    return g;
}

/**
 * NEON-WERBEBANNER für die großen Anlagen (ab 10 Personen).
 *
 * Dunkler Kasten mit leuchtender Schrift, umlaufender Leuchtröhre und
 * Montagearmen — beidseitig lesbar. Die Röhre flackert leicht wie echtes
 * Neon. `opts.color` ist die Leuchtfarbe, `opts.width/height` die Maße.
 */
export function makeNeonBanner(text, opts = {}) {
    const g = new THREE.Group();
    const W = opts.width ?? 4.6, H = opts.height ?? 1.05;
    const col = opts.color ?? 0x36e0ea;
    const col2 = opts.color2 ?? 0xff4fa3;          // Kontrastfarbe für Zierrat

    // ---- Trägerrahmen aus Rohren, an dem alles hängt ----
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.5, metalness: 0.6 });
    for (const sy of [-1, 1]) {
        const chord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, W + 0.5, 7), frameMat);
        chord.rotation.z = Math.PI / 2; chord.position.set(0, sy * (H / 2 + 0.24), -0.18); g.add(chord);
    }
    for (let k = 0; k <= 5; k++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, H + 0.48, 6), frameMat);
        post.position.set(-W / 2 + k * (W / 5), 0, -0.18); g.add(post);
        if (k < 5) {                                  // Diagonalen = Fachwerk
            const dl = Math.hypot(W / 5, H + 0.48);
            const dg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, dl, 5), frameMat);
            dg.position.set(-W / 2 + (k + 0.5) * (W / 5), 0, -0.18);
            dg.rotation.z = (k % 2 ? 1 : -1) * Math.atan2(W / 5, H + 0.48);
            g.add(dg);
        }
    }

    // ---- Schildkasten ----
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x070b12, roughness: 0.42, metalness: 0.35 }));
    g.add(back);
    const tex = makeNeonTexture(text, col);
    // Deutlich zurückhaltender als zuvor: das Schild soll die Station
    // schmücken, nicht den halben Hang ausleuchten.
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: col, emissiveMap: tex,
        emissiveIntensity: 0.85, transparent: true });
    for (const nz of [0.092, -0.092]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, W * 0.9 / 4), mat);
        face.position.z = nz;
        if (nz < 0) face.rotation.y = Math.PI;
        g.add(face);
    }

    // ---- Doppelte Leuchtröhre als Rahmen, innen und aussen ----
    const tubeMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.62 });
    const tube2Mat = new THREE.MeshStandardMaterial({ color: col2, emissive: col2, emissiveIntensity: 0.5 });
    for (const [inset, tm] of [[0, tubeMat], [0.09, tube2Mat]]) {
        const w2 = W - inset * 2, h2 = H - inset * 2;
        for (const [sw, sh, px, py] of [[w2, 0.05, 0, h2 / 2], [w2, 0.05, 0, -h2 / 2],
                                        [0.05, h2, -w2 / 2, 0], [0.05, h2, w2 / 2, 0]]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.06), tm);
            bar.position.set(px, py, 0.02); g.add(bar);
        }
    }

    // ---- LAUFLICHT: einzelne Glühbirnen rundum, die im Kreis wandern ----
    const bulbs = [];
    const bulbMats = [];
    const NB2 = 14, NV = 3;
    const mkBulb = (x, y) => {
        const bm = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd97a, emissiveIntensity: 0.12 });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), bm);
        b.position.set(x, y, 0.12); g.add(b);
        bulbs.push(b); bulbMats.push(bm);
    };
    for (let k = 0; k < NB2; k++) {                  // oben (links -> rechts)
        mkBulb(-W / 2 + 0.16 + k * ((W - 0.32) / (NB2 - 1)), H / 2 + 0.12);
    }
    for (let k = 0; k < NV; k++) mkBulb(W / 2 + 0.14, H / 2 - 0.12 - k * (H / NV));
    for (let k = NB2 - 1; k >= 0; k--) {             // unten (rechts -> links)
        mkBulb(-W / 2 + 0.16 + k * ((W - 0.32) / (NB2 - 1)), -H / 2 - 0.12);
    }
    for (let k = 0; k < NV; k++) mkBulb(-W / 2 - 0.14, -H / 2 + 0.12 + k * (H / NV));

    // ---- Giebelaufsatz mit Logo-Scheibe ----
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.42, H * 0.42, 0.1, 22),
        new THREE.MeshStandardMaterial({ color: 0x070b12, roughness: 0.4 }));
    crest.rotation.x = Math.PI / 2; crest.position.set(0, H / 2 + 0.52, 0); g.add(crest);
    const crestRing = new THREE.Mesh(new THREE.TorusGeometry(H * 0.44, 0.035, 6, 24), tube2Mat);
    crestRing.position.set(0, H / 2 + 0.52, 0.02); g.add(crestRing);
    // Strahlen im Logo — drehen sich langsam
    const rays = new THREE.Group();
    for (let k = 0; k < 8; k++) {
        const ray = new THREE.Mesh(new THREE.BoxGeometry(H * 0.62, 0.035, 0.03), tubeMat);
        ray.rotation.z = (k / 8) * Math.PI; rays.add(ray);
    }
    rays.position.set(0, H / 2 + 0.52, 0.07); g.add(rays);

    // ---- Ausleger nach hinten zur Wand ----
    for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), frameMat);
        arm.rotation.x = Math.PI / 2;
        arm.position.set(sx * W * 0.34, 0, -0.45); g.add(arm);
        const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.85, 5), frameMat);
        stay.position.set(sx * W * 0.34, -H * 0.42, -0.3);
        stay.rotation.x = -0.72; g.add(stay);
    }

    g.userData.update = (t) => {
        // Neon: ruhiges Pulsieren mit seltenem Zucken
        // Nur noch ein leises Atmen statt hektischem Flackern
        const flick = (Math.sin(t * 23 + W) > 0.988) ? -0.35 : 0;
        mat.emissiveIntensity = 0.78 + Math.sin(t * 1.1) * 0.10 + flick;
        tubeMat.emissiveIntensity = 0.58 + Math.sin(t * 1.1 + 0.6) * 0.09 + flick * 0.4;
        tube2Mat.emissiveIntensity = 0.46 + Math.sin(t * 1.5 + 1.9) * 0.09;
        rays.rotation.z = t * 0.22;
        // Lauflicht: eine weiche Welle wandert einmal pro 3.4 s herum
        const n = bulbMats.length;
        const head = (t / 3.4) % 1;
        for (let i = 0; i < n; i++) {
            let d = (i / n) - head; d -= Math.floor(d);      // 0..1 Abstand zur Welle
            const on = d < 0.26 ? 1 - d / 0.26 : 0;
            bulbMats[i].emissiveIntensity = 0.10 + on * 0.85;
        }
    };
    return g;
}

/** Ticket-Office / Talstation-Kasse: kleiner Pavillon mit blauem Dach. */
export function makeTicketOffice() {
    const g = new THREE.Group();
    const w = 2.2, d = 2.2, bodyH = 1.1;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), M.wood);
    body.position.y = bodyH / 2; body.castShadow = true; g.add(body);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.5, 0.2), M.woodDark);
    counter.position.set(0, 0.5, d / 2 + 0.1); g.add(counter);
    addWindows(g, w, d, bodyH, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.95, 0.7, 4), M.cabinB);
    roof.rotation.y = Math.PI / 4; roof.position.y = bodyH + 0.35; roof.castShadow = true; g.add(roof);
    // (Kein Neonschild mehr über der Kasse — der Fahnenmast markiert sie
    //  deutlich genug, und das Portal wirkte über dem kleinen Pavillon
    //  überdimensioniert.)
    // Beleuchteter Schriftzug flach an der Fassade, direkt über dem Schalter
    const kasseTex = makeNeonTexture('SKIPASS', 0x7dfcff);
    const kasseMat = new THREE.MeshStandardMaterial({ map: kasseTex, emissive: 0x7dfcff,
        emissiveMap: kasseTex, emissiveIntensity: 0.75, transparent: true });
    const kasseFascia = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, w * 0.86 / 4), kasseMat);
    kasseFascia.position.set(0, bodyH * 0.86, d / 2 + 0.035);
    g.add(kasseFascia);
    // Leuchtpfeil, der auf den Schalter zeigt
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22c55e, emissiveIntensity: 1.6 });
    const arrowG = new THREE.Group();
    for (let k = 0; k < 3; k++) {
        const ch = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 4), arrowMat);
        ch.rotation.x = Math.PI / 2; ch.rotation.z = Math.PI / 4;
        ch.position.set(0, -k * 0.24, 0); arrowG.add(ch);
    }
    arrowG.position.set(w * 0.5, bodyH * 0.55, d / 2 + 0.12); g.add(arrowG);
    // ===== GROSSE LADENFLAGGE ÜBER DER KASSE =====
    // Ein hoher Mast mit einem übergroßen Banner der Landesfarben. Er ist von
    // weitem zu sehen und macht die Kasse zum eindeutigen Anlaufpunkt.
    const POLE_H = 5.6;
    const flagPole = makeFlagPole(POLE_H, { country: _levelCountry, w: 2.4, h: 1.5, seg: 22 });
    flagPole.position.set(w * 0.62, 0.1, -d * 0.42);
    g.add(flagPole);
    // Zweiter, kleinerer Wimpel als Gegengewicht in der Silhouette
    const flagPole2 = makeFlagPole(3.8, { color: 0x36e0ea, w: 1.3, h: 0.8, seg: 16 });
    flagPole2.position.set(-w * 0.62, 0.1, -d * 0.42);
    g.add(flagPole2);
    // Bodenspots strahlen die Flagge an — auch nachts sichtbar
    for (const sx of [-1, 1]) {
        const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.14, 10),
            new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffe9a8,
                emissiveIntensity: 1.4 }));
        spot.position.set(w * 0.62 + sx * 0.42, 0.14, -d * 0.42 + 0.3); g.add(spot);
    }
    // ===== ANKLICKFLÄCHE =====
    // Die Kasse ist klein und der Mausklick traf oft daneben. Ein unsichtbarer
    // Quader um Haus, Schild und Fahnenmast herum fängt den Raycast ab.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w * 2.6, POLE_H, d * 2.4),
        new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, POLE_H / 2, -d * 0.15);
    hit.userData.isPickProxy = true;
    g.add(hit);
    g.userData.update = (t) => {
        kasseMat.emissiveIntensity = 0.62 + Math.sin(t * 1.6) * 0.14
            + (Math.sin(t * 29) > 0.985 ? -0.4 : 0);
        // Pfeil blinkt nacheinander von oben nach unten
        arrowG.children.forEach((c, k) => {
            const on = ((t * 2.4 - k * 0.25) % 1) < 0.5;
            c.material = c.material;
            c.scale.setScalar(on ? 1.15 : 0.9);
        });
        arrowMat.emissiveIntensity = 1.2 + Math.abs(Math.sin(t * 2.4)) * 1.1;
    };
    return g;
}

/**
 * EIN-MANN-HÄUSCHEN für Schlepp- und Tellerlifte.
 *
 * Diese Anlagen brauchen kein Stationsgebäude — es steht dort lediglich eine
 * Bude für den Liftwart, kaum größer als eine Telefonzelle: Holzkasten,
 * Fenster zur Trasse, Pultdach mit Schneeauflage.
 */
function makeOperatorHut(yaw = 0) {
    const g = new THREE.Group();
    const W = 1.05, D = 1.05, H = 1.85;
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.15, 0.16, D + 0.15), M.stone);
    base.position.y = 0.08; g.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), M.wood);
    body.position.y = 0.16 + H / 2; body.castShadow = true; g.add(body);
    // Sichtfenster zur Trasse
    const win = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.72, H * 0.34),
        new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffca6a,
            emissiveIntensity: 0.5, roughness: 0.4 }));
    win.position.set(0, 0.16 + H * 0.62, D / 2 + 0.01); g.add(win);
    // Schmale Tür an der Rückseite
    const door = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, H * 0.62, 0.04), M.woodDark);
    door.position.set(0, 0.16 + H * 0.31, -D / 2 - 0.02); g.add(door);
    // Pultdach mit Schnee
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.35, 0.1, D + 0.35), M.woodDark);
    roof.position.y = 0.16 + H + 0.05; roof.rotation.x = 0.12; roof.castShadow = true; g.add(roof);
    const snow = new THREE.Mesh(new THREE.BoxGeometry(W + 0.28, 0.07, D + 0.28), M.snow);
    snow.position.y = 0.16 + H + 0.13; snow.rotation.x = 0.12; g.add(snow);
    g.rotation.y = yaw;
    g.userData.topY = 0.16 + H;
    return g;
}

/**
 * Chalet-Stationshütte: Steinsockel, Holzwände mit Türen & leuchtenden
 * Fenstern, verschneites Satteldach. Basis liegt auf y=0 (lokal), also
 * an die Terrainhöhe der Station setzen. `yaw` dreht sie längs zur Trasse.
 * Rückgabe: Group mit userData.topY (Oberkante Wände, z. B. für Masten).
 */
/** Kleine Textur mit Schriftzug — für Werbebanderolen auf Gondeln u. Ä. */
/**
 * Farbwert -> CSS-Farbe. Nimmt Zahlen (0x36e0ea) UND fertige Strings
 * ('#36e0ea') entgegen.
 *
 * WICHTIG: vorher wurde blind `.toString(16)` aufgerufen. Bei einem String
 * ignoriert String.prototype.toString die Basis und liefert '#36e0ea'
 * zurück — mit dem vorangestellten '#' wurde daraus '##36e0ea', also eine
 * ungültige CSS-Farbe. Canvas behält dann still die ALTE Füllfarbe bei,
 * weshalb die Schrift in der Hintergrundfarbe gezeichnet und damit
 * unlesbar wurde. Genau das war der Fehler bei allen Neonschildern.
 */
function cssColor(c, fallback = '#ffffff') {
    if (typeof c === 'number' && Number.isFinite(c)) {
        return '#' + (c >>> 0).toString(16).padStart(6, '0');
    }
    if (typeof c === 'string') return c[0] === '#' ? c : '#' + c;
    return fallback;
}

function makeLabelTexture(text, color = 0xffffff, bg = 0x1d4ed8) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 72;
    const cx = cv.getContext('2d');
    cx.fillStyle = cssColor(bg, '#1d4ed8');
    cx.fillRect(0, 0, 256, 72);
    cx.fillStyle = cssColor(color, '#ffffff');
    cx.font = 'bold 40px Helvetica, Arial, sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(String(text).slice(0, 16), 128, 38);
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4; tx.needsUpdate = true;
    return tx;
}

/**
 * NEON-SCHRIFT als Textur — deutlich lesbarer als das kleine Label:
 * breites Canvas, Schriftgröße wird auf die Breite eingepasst, mehrfach
 * überlagerter Schein (shadowBlur) und ein heller Kern, so wie eine echte
 * Leuchtröhre. Der Hintergrund bleibt dunkel, damit der Kontrast steht.
 */
function makeNeonTexture(text, color = 0x36e0ea) {
    const W = 1024, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const col = cssColor(color, '#36e0ea');
    c.fillStyle = '#05080f';
    c.fillRect(0, 0, W, H);
    const label = String(text).toUpperCase().slice(0, 22);
    // Schriftgröße so wählen, dass der Text die Breite füllt, aber nicht
    // überläuft — sonst wird bei langen Markennamen abgeschnitten.
    let size = 150;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (; size > 34; size -= 4) {
        c.font = '900 ' + size + 'px Helvetica, Arial, sans-serif';
        if ((c.measureText(label).width || 0) <= W * 0.88) break;
    }
    c.font = '900 ' + size + 'px Helvetica, Arial, sans-serif';
    // Halo: mehrere Durchgänge mit abnehmendem Radius
    c.shadowColor = col;
    for (const [blur, alpha] of [[46, 0.5], [26, 0.7], [12, 0.9]]) {
        c.shadowBlur = blur; c.globalAlpha = alpha;
        c.fillStyle = col; c.fillText(label, W / 2, H / 2 + 4);
    }
    // Heller Kern der Röhre
    c.globalAlpha = 1; c.shadowBlur = 6;
    c.fillStyle = '#ffffff';
    c.fillText(label, W / 2, H / 2 + 4);
    c.shadowBlur = 0;
    c.lineWidth = Math.max(2, size * 0.045);
    c.strokeStyle = col;
    c.strokeText(label, W / 2, H / 2 + 4);
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 8; tx.needsUpdate = true;
    return tx;
}


/* ===================================================================
 *  FLAGGEN
 *  ------------------------------------------------------------------
 *  Bisher war eine Fahne ein starres Brettchen, das als Ganzes gedreht
 *  wurde. Jetzt ist sie ein feingeteiltes Tuch, dessen Stützpunkte je
 *  Bild von einer wandernden Welle verformt werden: die Amplitude wächst
 *  zum freien Ende hin, am Mast bleibt das Tuch fest. Bei wenig Wind
 *  hängt es sichtbar durch, bei Böen steht es waagerecht aus.
 * =================================================================== */

/** Landesflaggen als Canvas-Textur. Schlüssel = `country` aus campaign.js. */
const FLAG_PAINTERS = {
    'Deutschland':      (c, W, H) => { const b = ['#111111', '#dd0000', '#ffce00']; for (let i = 0; i < 3; i++) { c.fillStyle = b[i]; c.fillRect(0, H * i / 3, W, H / 3 + 1); } },
    'Österreich':       (c, W, H) => { const b = ['#ed2939', '#ffffff', '#ed2939']; for (let i = 0; i < 3; i++) { c.fillStyle = b[i]; c.fillRect(0, H * i / 3, W, H / 3 + 1); } },
    'Schweiz':          (c, W, H) => { c.fillStyle = '#d52b1e'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffffff'; const a = H * 0.18, l = H * 0.62; c.fillRect(W / 2 - l / 2, H / 2 - a / 2, l, a); c.fillRect(W / 2 - a / 2, H / 2 - l / 2, a, l); },
    'Frankreich':       (c, W, H) => { const b = ['#002395', '#ffffff', '#ed2939']; for (let i = 0; i < 3; i++) { c.fillStyle = b[i]; c.fillRect(W * i / 3, 0, W / 3 + 1, H); } },
    'Italien':          (c, W, H) => { const b = ['#009246', '#ffffff', '#ce2b37']; for (let i = 0; i < 3; i++) { c.fillStyle = b[i]; c.fillRect(W * i / 3, 0, W / 3 + 1, H); } },
    'Norwegen':         (c, W, H) => { c.fillStyle = '#ba0c2f'; c.fillRect(0, 0, W, H); const cx = W * 0.36, cy = H / 2, o = H * 0.22, i2 = H * 0.11; c.fillStyle = '#ffffff'; c.fillRect(0, cy - o / 2, W, o); c.fillRect(cx - o / 2, 0, o, H); c.fillStyle = '#00205b'; c.fillRect(0, cy - i2 / 2, W, i2); c.fillRect(cx - i2 / 2, 0, i2, H); },
    'USA':              (c, W, H) => { for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#b22234'; c.fillRect(0, H * i / 13, W, H / 13 + 1); } c.fillStyle = '#3c3b6e'; c.fillRect(0, 0, W * 0.42, H * 7 / 13); c.fillStyle = '#ffffff'; for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(W * 0.045 + k * W * 0.066, H * 0.055 + r * H * 0.075, H * 0.018, 0, 6.284); c.fill(); } },
    'Kanada':           (c, W, H) => { c.fillStyle = '#d80621'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffffff'; c.fillRect(W * 0.25, 0, W * 0.5, H); c.fillStyle = '#d80621'; c.save(); c.translate(W * 0.5, H * 0.52); const u = H * 0.34; c.beginPath(); c.moveTo(0, -u); for (const sg of [1, -1]) { c.lineTo(sg * u * 0.24, -u * 0.34); c.lineTo(sg * u * 0.62, -u * 0.46); c.lineTo(sg * u * 0.5, -u * 0.02); c.lineTo(sg * u * 0.88, u * 0.16); c.lineTo(sg * u * 0.3, u * 0.5); c.lineTo(sg * u * 0.12, u * 0.9); c.lineTo(0, u * 0.86); if (sg === 1) { c.lineTo(0, u * 0.86); } } c.closePath(); c.fill(); c.restore(); },
    'Chile / Argentinien': (c, W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = '#d52b1e'; c.fillRect(0, H / 2, W, H / 2); c.fillStyle = '#0039a6'; c.fillRect(0, 0, W * 0.36, H / 2); c.fillStyle = '#ffffff'; c.save(); c.translate(W * 0.18, H * 0.25); c.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? H * 0.055 : H * 0.135, an = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } c.closePath(); c.fill(); c.restore(); },
    'Japan':            (c, W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = '#bc002d'; c.beginPath(); c.arc(W * 0.5, H * 0.5, H * 0.3, 0, 6.284); c.fill(); }
};

const _flagTexCache = {};
export function makeCountryFlagTexture(country) {
    const key = String(country || 'Österreich');
    if (_flagTexCache[key]) return _flagTexCache[key];
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 128;
    const c = cv.getContext('2d');
    const paint = FLAG_PAINTERS[key] || FLAG_PAINTERS['Österreich'];
    paint(c, 192, 128);
    // feiner Rand, damit das Tuch nicht randlos in die Luft ausläuft
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2; c.strokeRect(1, 1, 190, 126);
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4; tx.needsUpdate = true;
    _flagTexCache[key] = tx;
    return tx;
}

/**
 * Wehendes Tuch. Rückgabe ist das Mesh; der Aufhängepunkt (Mast) liegt bei
 * x = 0, das Tuch spannt sich nach +x auf.
 *
 * `opts.country`  Landesflagge als Textur
 * `opts.color`    einfarbiges Tuch, wenn kein Land gesetzt ist
 * `opts.seg`      Unterteilung längs (Standard 16)
 */
export function makeFlagCloth(w = 0.9, h = 0.56, opts = {}) {
    const SX = opts.seg || 16, SY = Math.max(3, Math.round(SX * h / w * 0.7));
    const geo = new THREE.PlaneGeometry(w, h, SX, SY);
    // Ursprung an die Mastkante schieben: x läuft dann von 0 bis w
    geo.translate(w / 2, 0, 0);
    const mat = opts.country
        ? new THREE.MeshStandardMaterial({ map: makeCountryFlagTexture(opts.country),
            roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide })
        : opts.map
        ? new THREE.MeshStandardMaterial({ map: opts.map, roughness: 0.86, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: opts.color ?? 0xdc2626,
            roughness: 0.86, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    // Ruhelage der Stützpunkte merken — die Welle rechnet immer darauf.
    const pos = geo.attributes.position;
    const base = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { base[i * 2] = pos.getX(i); base[i * 2 + 1] = pos.getY(i); }
    mesh.userData.isFlag = true;
    mesh.userData.flagPhase = Math.random() * 6.283;
    /**
     * @param t         Zeit in Sekunden
     * @param strength  Windstärke 0..1
     */
    mesh.userData.flagWave = (t, strength) => {
        const ph = mesh.userData.flagPhase;
        const st = Math.max(0.0, Math.min(1, strength));
        const k = 7.5 / Math.max(0.2, w);          // Wellenzahl
        const spd = 3.2 + st * 6.0;                 // Wellengeschwindigkeit
        // ===== FLAUTE =====
        // Unter ~20 % Wind kippt das Tuch zunehmend nach unten, bei echter
        // Windstille hängt es SENKRECHT am Mast und liegt nur noch als
        // schmale Falte da. `limp` ist 0 im Wind und 1 in der Flaute.
        const lu = Math.max(0, Math.min(1, (0.20 - st) / 0.18));
        const limp = lu * lu * (3 - 2 * lu);
        // In der Flaute bewegt sich fast nichts — nur ein leises Wiegen.
        const calmSw = Math.sin(t * 0.55 + ph) * 0.05 + Math.sin(t * 0.31 + ph * 2) * 0.03;
        for (let i = 0; i < pos.count; i++) {
            const x0 = base[i * 2], y0 = base[i * 2 + 1];
            const f = Math.max(0, x0 / w);          // 0 am Mast, 1 am freien Ende
            const grip = f * f;                     // Einspannung: am Mast keine Bewegung
            // --- wehend ---
            const wv = Math.sin(k * x0 - t * spd + ph) * 0.09
                     + Math.sin(k * 1.9 * x0 - t * spd * 1.5 + ph * 1.7) * 0.035;
            const sag = (1 - st) * 0.55;
            const flyX = x0 * (1 - sag * 0.42);
            const flyY = y0 - grip * sag * h * 0.85;
            const flyZ = wv * grip * h * (0.55 + st * 1.5)
                       + y0 * 0.10 * Math.sin(k * x0 - t * spd + ph) * grip;
            // --- hängend ---
            // Das Tuch klappt um die Mastachse nach unten: was im Wind nach
            // aussen zeigt (x), zeigt jetzt nach unten (-y). Die Bahn legt
            // sich dabei in leichte Falten, statt als steifes Brett zu stehen.
            const fold = Math.sin(f * 3.6 + ph) * 0.10 * w;
            const hangX = (0.10 + f * 0.10) * w * (1 + calmSw) + y0 * 0.55;
            const hangY = -x0 * (0.94 + calmSw * 0.4) + y0 * 0.30;
            const hangZ = fold * (0.5 + f) + y0 * 0.25;
            pos.setX(i, flyX + (hangX - flyX) * limp);
            pos.setY(i, flyY + (hangY - flyY) * limp);
            pos.setZ(i, flyZ + (hangZ - flyZ) * limp);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
    };
    return mesh;
}

/** Mast + wehendes Tuch als fertige Gruppe. Höhe = Mastlänge. */
export function makeFlagPole(height = 2.2, opts = {}) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, height, 8), M.metal);
    pole.position.y = height / 2; pole.castShadow = true; g.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), M.metal);
    knob.position.y = height + 0.04; g.add(knob);
    const w = opts.w ?? height * 0.42, h = opts.h ?? w * 0.62;
    const cloth = makeFlagCloth(w, h, opts);
    cloth.position.set(0.04, height - h * 0.62, 0);
    g.add(cloth);
    g.userData.cloth = cloth;
    return g;
}

function stationHouse(w, d, wallH, yaw = 0, seed = 0) {
    const g = new THREE.Group();
    // ===== VARIATION JE ANLAGE =====
    // Der Seed (aus der Stationsposition) wählt Wandfarbe, Vordachfarbe und
    // Dachstil — jede Bahn bekommt so ihr eigenes Gesicht statt Einheitshütte.
    // Kräftig gestreute Paletten — von rustikalem Holz über weiß verputzt
    // bis zu modernem Anthrazit. Der Hash streut den Seed, damit auch nah
    // beieinanderliegende Stationen NICHT im selben Look enden.
    const WALL_COLS = [0x8a6a48, 0x5a4530, 0xa88d68, 0xe8e4dc, 0x64707c, 0x3a424c, 0xb0937b, 0x86504a];
    const TRIM_COLS = [0x1d4ed8, 0xdc2626, 0x0e7490, 0x9333ea, 0xea580c, 0x16a34a, 0xca8a04, 0x0f172a];
    const ROOF_COLS = [0xb43a3a, 0x2f4f6f, 0x3f5b45, 0x6b5a48];
    const sv = ((Math.abs(Math.floor(seed)) * 2654435761) >>> 8) >>> 0;
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLS[sv % WALL_COLS.length], roughness: 0.85 });
    const trimCol = TRIM_COLS[(sv >> 3) % TRIM_COLS.length];
    const flatRoof = (sv % 3) === 2;                 // jede dritte Bahn: modernes Flachdach
    // Satteldächer sind mal verschneit, mal als farbiges Blechdach sichtbar
    const roofSnowy = (sv >> 5) % 2 === 0;
    const gableMat = roofSnowy ? M.snow : new THREE.MeshStandardMaterial({
        color: ROOF_COLS[(sv >> 6) % ROOF_COLS.length], roughness: 0.6, metalness: 0.3 });
    // Steinsockel
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), M.stone);
    base.position.y = 0.25; base.castShadow = true; base.receiveShadow = true; g.add(base);
    // Wände in der Anlagenfarbe
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, wallH, d - 0.2), wallMat);
    walls.position.y = 0.5 + wallH / 2; walls.castShadow = true; g.add(walls);
    const topY = 0.5 + wallH;
    // Ein-/Ausstiegs-Tore an beiden Stirnseiten (längs = z)
    const doorH = Math.min(1.5, wallH * 0.85), doorW = Math.min(1.3, w * 0.5);
    for (const zz of [d / 2 - 0.06, -(d / 2 - 0.06)]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.12), M.woodDark);
        door.position.set(0, 0.5 + doorH / 2, zz); g.add(door);
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, 0.14, 0.16), M.woodDark);
        lintel.position.set(0, 0.5 + doorH + 0.07, zz); g.add(lintel);
    }
    // leuchtende Fenster entlang der Längsseiten
    const winH = Math.min(0.7, wallH * 0.5);
    const nWin = Math.max(2, Math.round(d / 2.2));
    for (const sx of [w / 2 - 0.05, -(w / 2 - 0.05)]) {
        for (let i = 0; i < nWin; i++) {
            const zz = -d / 2 + d * (i + 1) / (nWin + 1);
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, Math.min(0.85, d / (nWin + 1) * 0.6)), M.winGlow);
            win.position.set(sx, 0.5 + wallH * 0.55, zz); g.add(win);
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, winH + 0.14, Math.min(0.85, d / (nWin + 1) * 0.6) + 0.14), M.woodDark);
            frame.position.set(sx - Math.sign(sx) * 0.01, 0.5 + wallH * 0.55, zz); g.add(frame);
        }
    }
    // ===== BAHNSTEIG & ZUGANG =====
    // Ein umlaufender Perron mit Geländer, Drehkreuzen am Eingang und einer
    // kleinen Vorhalle macht aus dem Kasten eine echte Liftstation.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w + 1.5, 0.16, d + 1.2), M.stone);
    deck.position.y = 0.44; deck.receiveShadow = true; g.add(deck);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.55 });
    // Geländer an den Längsseiten, Stirnseiten bleiben als Zugang frei
    for (const sx of [-1, 1]) {
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, d + 1.0), railMat);
        hand.position.set(sx * (w / 2 + 0.7), 1.06, 0); g.add(hand);
        const nP = Math.max(2, Math.round(d / 1.4));
        for (let i = 0; i <= nP; i++) {
            const zz = -(d + 1.0) / 2 + (i / nP) * (d + 1.0);
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.6, 6), railMat);
            post.position.set(sx * (w / 2 + 0.7), 0.78, zz); g.add(post);
        }
    }
    // ===== ZUGANG =====
    // Die Station steht LÄNGS zur Trasse: +Z zeigt zur Gegenstation, -Z ins
    // Gelände. Gäste kommen von der Geländeseite — Drehkreuze, Vordach und
    // Infotafel gehören deshalb auf die -Z-Seite, nicht Richtung Seil.
    const EZ = -(d / 2);                       // Einstiegsseite
    for (const ox of [-0.45, 0.45]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 8), railMat);
        pillar.position.set(ox, 1.0, EZ - 0.45); g.add(pillar);
        for (let a2 = 0; a2 < 3; a2++) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.035), railMat);
            arm.position.set(ox + Math.cos(a2 * 2.1) * 0.21, 1.05, EZ - 0.45 + Math.sin(a2 * 2.1) * 0.21);
            arm.rotation.y = -a2 * 2.1; g.add(arm);
        }
    }
    const entryRoof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.1, 1.5),
        new THREE.MeshStandardMaterial({ color: trimCol, roughness: 0.55 }));
    entryRoof.position.set(0, topY + 0.35, EZ - 0.6); g.add(entryRoof);
    for (const ox of [-(w / 2 + 0.35), w / 2 + 0.35]) {
        const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, topY - 0.1, 6), railMat);
        cp.position.set(ox, (topY + 0.3) / 2 + 0.2, EZ - 1.15); g.add(cp);
    }
    const infoPanel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x0a1a2e, emissiveIntensity: 0.6 }));
    infoPanel.position.set(w / 2 + 0.6, 1.25, EZ + 0.2); infoPanel.rotation.y = 0.35; g.add(infoPanel);
    // Warnbake und Mülleimer am Perron
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 }));
    cone.position.set(-(w / 2 + 0.5), 0.72, d / 2 - 0.3); g.add(cone);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.42, 10), railMat);
    bin.position.set(w / 2 + 0.45, 0.73, d / 2 - 0.5); g.add(bin);

    // Dach: klassisch verschneites Satteldach ODER modernes Flachdach in der
    // Anlagenfarbe — der Seed entscheidet.
    let ridgeY;
    if (flatRoof) {
        const flat = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.14, d + 0.5),
            new THREE.MeshStandardMaterial({ color: trimCol, roughness: 0.5, metalness: 0.25 }));
        flat.position.y = topY + 0.07; flat.castShadow = true; g.add(flat);
        const snowCap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.08, d + 0.3), M.snow);
        snowCap.position.y = topY + 0.18; g.add(snowCap);
        ridgeY = topY + 0.24;
    } else {
        const rW = w * 0.62, pitch = 0.5;
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(rW, 0.16, d + 0.5), gableMat);
        r1.position.set(-w * 0.21, topY + rW * 0.5 * Math.sin(pitch) * 0.5, 0); r1.rotation.z = pitch; r1.castShadow = true; g.add(r1);
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(rW, 0.16, d + 0.5), gableMat);
        r2.position.set(w * 0.21, topY + rW * 0.5 * Math.sin(pitch) * 0.5, 0); r2.rotation.z = -pitch; r2.castShadow = true; g.add(r2);
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, d + 0.5), M.woodDark);
        ridge.position.set(0, topY + rW * 0.5 * Math.sin(pitch), 0); g.add(ridge);
        ridgeY = topY + rW * 0.5 * Math.sin(pitch);
    }

    // ===== Details: Werbetafel, Stationsschild, Fahnen, Uhr, Lampen =====
    // Beleuchtete Werbetafel an der Längsseite
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, d * 0.55),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45, emissive: 0x1e3a8a, emissiveIntensity: 0.35 }));
    board.position.set(w / 2 + 0.06, 0.5 + wallH * 0.62, 0); g.add(board);
    for (let i = 0; i < 3; i++) {   // angedeutete Schriftzeilen
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, d * (0.34 - i * 0.07)),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde68a, emissiveIntensity: 0.6 }));
        line.position.set(w / 2 + 0.11, 0.5 + wallH * 0.62 + 0.2 - i * 0.19, 0); g.add(line);
    }
    // Stationsschild über dem Tor (Holztafel mit Rahmen)
    for (const zz of [d / 2 + 0.08, -(d / 2 + 0.08)]) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.5, w * 0.62), 0.34, 0.07), M.woodDark);
        sign.position.set(0, 0.5 + Math.min(1.5, wallH * 0.85) + 0.3, zz); g.add(sign);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.3, w * 0.52), 0.2, 0.03),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xcbd5e1, emissiveIntensity: 0.3 }));
        plate.position.set(0, 0.5 + Math.min(1.5, wallH * 0.85) + 0.3, zz + Math.sign(zz) * 0.05); g.add(plate);
    }
    // Zwei Fahnen auf dem First
    for (const [fz, col] of [[d * 0.32, null], [-d * 0.32, 0xf8fafc]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), M.metal);
        pole.position.set(0, ridgeY + 0.75, fz); g.add(pole);
        const flag = makeFlagCloth(0.56, 0.34, col === null ? { country: _levelCountry } : { color: col });
        flag.position.set(0, ridgeY + 1.28, fz); g.add(flag);
    }
    // Stationsuhr am Giebel
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xe2e8f0, emissiveIntensity: 0.4 }));
    clock.rotation.x = Math.PI / 2; clock.position.set(0, ridgeY - 0.35, d / 2 + 0.1); g.add(clock);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.02), M.woodDark);
    hand.position.set(0, ridgeY - 0.29, d / 2 + 0.14); g.add(hand);
    // Warme Außenlampen neben den Toren
    for (const zz of [d / 2 + 0.05, -(d / 2 + 0.05)]) {
        for (const sx of [-w * 0.32, w * 0.32]) {
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), M.winGlow);
            lamp.position.set(sx, 0.5 + wallH * 0.8, zz); g.add(lamp);
        }
    }
    g.rotation.y = yaw;
    g.userData.topY = topY;
    return g;
}

/**
 * LIFT-ANLAGE (Gondelbahn) zwischen Tal- und Bergstation.
 * a, b: THREE.Vector3 Stationen (y = Terrain).
 * groundYs: Array von Terrain-Y-Werten entlang der Strecke (0..1),
 *           damit das Seil dem Geländeprofil folgt (Gondeln nie im Berg).
 */
export function makeLift(a, b, groundYs = null, opts = {}) {
    const group = new THREE.Group();
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const nd = dir.clone().normalize();
    const perp = new THREE.Vector3(-nd.z, 0, nd.x);
    // Seilhöhe über Grund. Die Bäume werden bis rund 2,4 Einheiten hoch —
    // Kabinen und Sessel müssen also klar darüber schweben, sonst hängen sie
    // optisch in den Wipfeln. Schlepplifte bleiben bewusst niedrig, weil man
    // dort am Boden mitgezogen wird.
    const clearance = opts.kind === 'tbar' || opts.kind === 'platter' ? 2.75
        : opts.chair ? 5.2 : 6.2;

    // Stationen (Chalet-Hütte, längs zur Trasse ausgerichtet)
    const yaw = Math.atan2(nd.x, nd.z);
    const mkStation = (p) => {
        // Seed aus der Weltposition: dieselbe Bahn bekommt an beiden Stationen
        // denselben Stil, verschiedene Bahnen sehen verschieden aus.
        const seed = Math.round(Math.abs(a.x * 13.7) + Math.abs(a.z * 7.3));
        const house = stationHouse(2.6, 3.2, 1.4, yaw, seed);
        house.position.copy(p); group.add(house);
    };
    mkStation(a); mkStation(b);

    // ===== SEIL-HÖHENPROFIL =====
    // Das Seil zieht NICHT als Sehne zum Gipfel durch, sondern folgt dem
    // Gelände. Die Stützen haben eine bauartabhängige Maximalhöhe: über einer
    // Senke kann das Seil also nur so weit "abkürzen", wie die Masten reichen.
    const maxMast = opts.maxMast ?? 9;               // max. Stützenhöhe über Grund
    const N = Math.max(8, Math.floor(len / 4));
    // An den STATIONEN läuft das Seil auf Einstiegshöhe herunter — die Kabinen
    // fahren also in die Station ein, statt hoch darüber zu schweben. Erst
    // dahinter steigt es auf die volle Trassenhöhe.
    const STATION_Y = 2.9;
    const rampT = Math.min(0.32, 16 / Math.max(1, len));   // Länge der Einfahrt
    const stationBlend = (t) => {
        const e = Math.min(1, Math.min(t, 1 - t) / rampT);
        return e * e * (3 - 2 * e);                        // 0 = Station, 1 = freie Strecke
    };
    const cableA = a.y + STATION_Y, cableB = b.y + STATION_Y;
    const groundAt = (t) => {
        if (groundYs && groundYs.length) {
            return groundYs[Math.min(groundYs.length - 1, Math.round(t * (groundYs.length - 1)))];
        }
        return a.clone().lerp(b, t).y;
    };
    const pts = [];
    const gnd = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const base = a.clone().lerp(b, t);
        const groundY = groundAt(t);
        gnd.push(groundY);
        // Höhe über Grund: an den Stationen niedrig, auf der Strecke hoch
        const sm = stationBlend(t);
        let y = groundY + STATION_Y + (clearance - STATION_Y) * sm;
        // an den Enden exakt auf die Stationskabelhöhe ziehen
        const endY = cableA + (cableB - cableA) * t;
        y = endY + (y - endY) * sm;
        pts.push(new THREE.Vector3(base.x, y, base.z));
    }
    // Glätten (Seile knicken nicht), dabei aber in den erlaubten Korridor
    // zwängen: nie unter Grund+clearance, nie über Grund+maxMast.
    for (let k = 0; k < 14; k++) {
        for (let i = 1; i < pts.length - 1; i++) {
            pts[i].y = pts[i].y * 0.35 + (pts[i - 1].y + pts[i + 1].y) * 0.325;
            // Der erlaubte Korridor folgt derselben Ein-/Ausfahrtskurve —
            // sonst würde die Glättung das Seil an den Stationen wieder hochziehen.
            const sm = stationBlend(i / N);
            const lo = gnd[i] + STATION_Y + (clearance - STATION_Y) * sm;
            const hi = gnd[i] + Math.max(STATION_Y + 0.4, maxMast * sm + STATION_Y * (1 - sm));
            if (pts[i].y < lo) pts[i].y = lo;
            if (pts[i].y > hi) pts[i].y = hi;
        }
    }
    // ===== SEIL HÄNGT IN DEN MASTEN =====
    // Ein Tragseil folgt nicht dem Gelände, sondern spannt sich von Stütze zu
    // Stütze und hängt dazwischen durch. Die Mastpositionen werden deshalb
    // ZUERST festgelegt, das Seil wird an ihnen aufgehängt und in jedem Feld
    // mit einem Durchhang versehen.
    // Stützenabstand je Bauart: Schleppen brauchen viele kurze Felder,
    // Kabinenbahnen deutlich weniger.
    const surfaceKind = opts.kind === 'tbar' || opts.kind === 'platter';
    const spanLen = surfaceKind ? 7 : 14;
    const nP = Math.max(2, Math.floor(len / spanLen));
    const anchors = [];                       // {t, y} je Aufhängepunkt
    anchors.push({ t: 0, y: pts[0].y });
    for (let i = 1; i < nP; i++) {
        const t = i / nP;
        const idx = Math.min(N, Math.round(t * N));
        anchors.push({ t, y: pts[idx].y });
    }
    anchors.push({ t: 1, y: pts[N].y });
    // Seilverlauf neu aufbauen: zwischen den Aufhängepunkten geradlinig,
    // minus einem sinusförmigen Durchhang (gute Näherung der Kettenlinie).
    // Durchhang je Feld — bei Schlepp-/Tellerliften FAST NULL, sonst hingen
    // die Bügel im Schnee (das Seil liegt dort nur 2.4 über Grund).
    const SAG = surfaceKind
        ? Math.min(0.10, len / nP * 0.006)
        : Math.min(1.4, len / nP * 0.055);
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        let k = 0;
        while (k < anchors.length - 2 && anchors[k + 1].t < t) k++;
        const A = anchors[k], Bp = anchors[k + 1];
        const f = (t - A.t) / ((Bp.t - A.t) || 1);
        const yLine = A.y + (Bp.y - A.y) * f;
        // an den Stationen kein Durchhang (dort läuft das Seil aufs Rad)
        const edge = Math.min(1, Math.min(t, 1 - t) / 0.06);
        pts[i].y = yLine - Math.sin(Math.PI * Math.max(0, Math.min(1, f))) * SAG * edge;
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    // Masthöhen aus denselben Aufhängepunkten — dadurch endet jede Stütze
    // GENAU dort, wo das Seil sie berührt.
    const mastTops = anchors.slice(1, -1).map(an => {
        const p = a.clone().lerp(b, an.t);
        return { t: an.t, x: p.x, y: an.y, z: p.z };
    });

    // ===== UMLENKRÄDER (Bullräder) an Tal- und Bergstation =====
    const stationWheels = [];
    const buildHead = (cp, base) => {
        // Tragmast von der Station hoch zum Rad
        const mastH = cp.y - (base.y + 1.3);
        if (mastH > 0.3) {
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, mastH, 8), M.metal);
            mast.position.set(cp.x, base.y + 1.3 + mastH / 2, cp.z); mast.castShadow = true; group.add(mast);
        }
        // Großes horizontales Umlenkrad mit Nabe & Speichen
        const wheel = new THREE.Group();
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.26, 24), M.metal);
        wheel.add(rim);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 24), M.woodDark);
        wheel.add(inner);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 10), M.metal);
        wheel.add(hub);
        for (let k = 0; k < 6; k++) {
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.09), M.metal);
            spoke.rotation.y = k * Math.PI / 6;
            wheel.add(spoke);
        }
        wheel.position.copy(cp);
        wheel.castShadow = true;
        group.add(wheel);
        stationWheels.push(wheel);
    };
    buildHead(pts[0], a);
    buildHead(pts[pts.length - 1], b);

    // Stützen an einigen Sample-Stellen
    const beacons = [];
    for (let i = 1; i < nP; i++) {
        const t = i / nP;
        // Kopf der Stütze = Aufhängepunkt des Seils
        const mt = mastTops[i - 1];
        const top = { x: mt.x, y: mt.y, z: mt.z };
        const gi = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const groundY = (groundYs && groundYs.length)
            ? groundYs[Math.min(groundYs.length - 1, Math.round(t * (groundYs.length - 1)))]
            : a.clone().lerp(b, t).y;
        const pyH = Math.max(1, top.y - groundY);
        const pyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, pyH, 6), M.metal);
        pyl.position.set(top.x, groundY + pyH / 2, top.z); pyl.castShadow = true; group.add(pyl);
        // Hindernisfeuer auf JEDEM ZWEITEN Masten
        if (i % 2 === 0) {
            const bc = makeBeacon(top.x, top.y + 0.42, top.z, (i * 0.37) % 1);
            group.add(bc.mesh); beacons.push(bc);
        }
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.14), M.metal);
        arm.position.copy(top); group.add(arm);
        // Rollenbatterie
        for (const off of [-0.7, 0.7]) {
            const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8), M.woodDark);
            roll.rotation.x = Math.PI / 2;
            roll.position.copy(top).add(perp.clone().multiplyScalar(off));
            group.add(roll);
        }
        // Details an der Stütze: Nummernschild, Warnring, Leiter, ab und zu Werbung
        const numPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.05),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xcbd5e1, emissiveIntensity: 0.25 }));
        numPlate.position.set(top.x, groundY + pyH * 0.62, top.z);
        numPlate.position.add(perp.clone().multiplyScalar(0.22)); group.add(numPlate);
        const warn = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.3, 8),
            new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }));
        warn.position.set(top.x, groundY + 0.55, top.z); group.add(warn);
        // Steigleiter am Mast
        for (let s = 0; s < Math.max(2, Math.floor(pyH / 0.55)); s++) {
            const rung = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), M.metal);
            rung.position.set(top.x, groundY + 0.7 + s * 0.5, top.z);
            rung.position.add(perp.clone().multiplyScalar(-0.19)); group.add(rung);
        }
        // Jede dritte Stütze bekommt eine Werbetafel
        if (i % 3 === 1) {
            const ad = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 0.07),
                new THREE.MeshStandardMaterial({ color: [0x1d4ed8, 0xdc2626, 0x059669][i % 3], roughness: 0.5 }));
            ad.position.set(top.x, groundY + pyH * 0.42, top.z);
            ad.position.add(perp.clone().multiplyScalar(0.5));
            ad.lookAt(ad.position.clone().add(perp)); group.add(ad);
            const adLine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.02),
                new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde68a, emissiveIntensity: 0.5 }));
            adLine.position.copy(ad.position).add(perp.clone().multiplyScalar(0.05));
            adLine.quaternion.copy(ad.quaternion); group.add(adLine);
        }
    }

    // zwei Seile (hin/zurück) als Röhren entlang der Kurve
    for (const off of [-0.7, 0.7]) {
        const offPts = pts.map(p => p.clone().add(perp.clone().multiplyScalar(off)));
        const c2 = new THREE.CatmullRomCurve3(offPts);
        const tube = new THREE.TubeGeometry(c2, N, 0.03, 5, false);
        group.add(new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.6, metalness: 0.4 })));
    }

    // Träger am Seil: Gondelkabine (Standard), offener Sessel (chair) oder Schleppbügel (tbar).
    const chair = !!opts.chair;
    const surface = opts.kind === 'tbar' || opts.kind === 'platter';
    const platter = opts.kind === 'platter';       // Tellerlift: 1 Person je Bügel
    const nSeats = opts.seats || (chair ? 4 : 2);  // 2er/4er/6er-Sessel
    const gondolas = [];
    const nGond = Math.max(3, Math.floor(len / (surface ? 5 : chair ? 6 : opts.cabin8 ? 12 : opts.cabin4 ? 6 : 8)));
    const gGeo = new THREE.BoxGeometry(0.75, 0.85, 0.75);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    const riderCols = [0xef4444, 0x2563eb, 0x16a34a, 0xf59e0b, 0x9333ea];
    for (let i = 0; i < nGond; i++) {
        const gg = new THREE.Group();
        // Klemme direkt am Seil
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.34), M.metal);
        clamp.position.y = 0; gg.add(clamp);
        for (const rz of [-0.11, 0.11]) {
            const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), M.woodDark);
            roll.rotation.x = Math.PI / 2; roll.position.set(0, 0.02, rz); gg.add(roll);
        }
        if (surface) {
            // Schleppbügel (T-Bar): langes Seil zum Boden, Querbügel, stehender Skifahrer
            const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3), M.metal);
            rope.position.y = -1.15; gg.add(rope);
            if (platter) {   // Tellerlift: runder Teller statt Querbügel
                const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), M.woodDark);
                disc.position.y = -2.28; gg.add(disc);
            } else {
                const tbar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), M.woodDark);
                tbar.position.y = -2.28; gg.add(tbar);
            }
            // stehender Skifahrer am Bügel — nur sichtbar bei Auslastung
            const riders = new THREE.Group();
            for (let r = 0; r < (platter ? 1 : 2); r++) {
                const sk = new THREE.Group();
                const xo = -0.22 + r * 0.44;
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.16), new THREE.MeshStandardMaterial({ color: riderCols[(i + r) % riderCols.length], roughness: 0.7 }));
                body.position.set(xo, -2.02, 0); sk.add(body);
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf1c9a5 }));
                head.position.set(xo, -1.68, 0); sk.add(head);
                const legs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
                legs.position.set(xo, -2.42, 0.02); sk.add(legs);
                const ski = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.95), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
                ski.position.set(xo, -2.62, 0.18); sk.add(ski);
                sk.userData.slot = r;
                riders.add(sk);
            }
            riders.visible = false;
            gg.add(riders);
            gg.userData.riders = riders;
            // Wo sitzen/stehen echte Gäste an diesem Fahrzeug?
            gg.userData.seatInfo = { seats: platter ? 1 : 2, y: -2.30, spread: 0.44 };
        } else if (chair) {
            // Aufhängung + offener Vierersessel
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.7), M.metal);
            arm.position.y = -0.35; gg.add(arm);
            const sw = 0.37 * nSeats + 0.05;                 // Sesselbreite nach Sitzanzahl
            const seat = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.1, 0.5), seatMat);
            seat.position.y = -0.72; seat.castShadow = true; gg.add(seat);
            const back = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.5, 0.08), seatMat);
            back.position.set(0, -0.5, -0.24); gg.add(back);
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, sw), M.metal);
            bar.rotation.z = Math.PI / 2; bar.position.set(0, -0.45, 0.24); gg.add(bar);
            if (opts.bubble) {                                // Haube (6er mit Wetterschutz)
                const bub = new THREE.Mesh(new THREE.SphereGeometry(sw * 0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
                    new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
                bub.scale.set(1, 0.85, 0.7); bub.position.set(0, -0.46, -0.04); gg.add(bub);
            }
            // sitzende Wintersportler — nur sichtbar wenn Gäste einsteigen (Auslastung)
            const riders = new THREE.Group();
            const x0 = -(nSeats - 1) * 0.37 / 2;
            for (let r = 0; r < nSeats; r++) {
                const seat1 = new THREE.Group();
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.2), new THREE.MeshStandardMaterial({ color: riderCols[(i + r) % riderCols.length], roughness: 0.7 }));
                body.position.set(x0 + r * 0.37, -0.52, 0.05); seat1.add(body);
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf1c9a5 }));
                head.position.set(x0 + r * 0.37, -0.32, 0.05); seat1.add(head);
                const legs = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.1), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
                legs.position.set(x0 + r * 0.37, -0.86, 0.16); seat1.add(legs);
                const skis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.8), new THREE.MeshStandardMaterial({ color: [0xdc2626, 0x2563eb][r % 2] }));
                skis.position.set(x0 + r * 0.37, -1.02, 0.3); seat1.add(skis);
                seat1.userData.slot = r; // Sitzplatz-Index für Teilbesetzung
                riders.add(seat1);
            }
            riders.visible = false;
            gg.add(riders);
            gg.userData.riders = riders;
            gg.userData.seatInfo = { seats: nSeats, y: -0.80, spread: 0.37 };
        } else {
            // ===== GONDELKABINE =====
            // `big` = 8er-Kabinenbahn: deutlich größer, mit umlaufendem
            // Panoramafenster­band, Doppeltür und flacherem Dach mit Reling.
            const big = !!opts.cabin8;
            const small = !!opts.cabin4;   // kompakte 4er-Kabine
            const CW = big ? 1.12 : small ? 0.62 : 0.75;   // Breite/Tiefe der Kabine
            const CH = big ? 1.05 : small ? 0.74 : 0.85;   // Höhe
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.036 : 0.028, big ? 0.036 : 0.028, big ? 0.62 : 0.55), M.metal);
            arm.position.y = big ? -0.36 : -0.32; gg.add(arm);
            // Lackierung: entweder die im Baudialog gewählte Farbe (dann alle
            // Kabinen einheitlich) oder das abwechselnde Levelschema.
            // Auch hier gebrauchter Lack statt Hochglanz
            // Eigene Materialinstanz je Kabine, damit das Innenlicht einzeln
            // gesteuert werden kann (geteilte Materialien ließen sich nicht
            // getrennt beleuchten).
            const srcMat = opts.cabinColor != null
                ? { color: opts.cabinColor } : (i % 2 ? M.cabinB : M.cabinR);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: srcMat.color, roughness: 0.42, metalness: 0.42, envMapIntensity: 0.55
            });
            gg.userData.bodyMat = bodyMat;
            const cabY = big ? -1.22 : -1.05;
            const cab = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CW), bodyMat);
            cab.position.y = cabY; cab.castShadow = true; gg.add(cab);

            // Verglasung: neutral getönt, DOPPELSEITIG (sonst ist die Scheibe
            // von außen unsichtbar) und pro Seite korrekt ausgerichtet.
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x8b929b, roughness: 0.24, metalness: 0.12,
                transparent: true, opacity: 0.92, side: THREE.DoubleSide
            });
            glassMat.userData.isWindow = true;
            const gw = CW * 0.78, gh = big ? 0.56 : 0.42;   // Scheibengröße
            const off = CW / 2 + 0.012;                      // knapp außen auf der Wand
            // [x, z, yaw] — yaw dreht die Scheibennormale nach außen
            const sides = [
                [ off, 0,  Math.PI / 2],   // rechts
                [-off, 0, -Math.PI / 2],   // links
                [0,  off, 0],              // vorn
                [0, -off, Math.PI]         // hinten
            ];
            for (const [px, pz, yaw] of sides) {
                const pane = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), glassMat);
                pane.position.set(px, cabY + (big ? 0.12 : 0.08), pz);
                pane.rotation.y = yaw;
                gg.add(pane);
            }
            // Zierleisten ober- und unterhalb des Fensterbands
            const beltT = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.04, 0.05, CW + 0.04), M.metal);
            beltT.position.y = cabY + (big ? 0.44 : 0.3); gg.add(beltT);
            const beltB = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.04, 0.04, CW + 0.04), M.metal);
            beltB.position.y = cabY - (big ? 0.2 : 0.15); gg.add(beltB);
            // Türspalt(e): die große Kabine hat eine breite Doppeltür
            for (const sx of (big ? [-0.28, 0.28] : [0])) {
                const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, gh, CW + 0.03), M.metal);
                seam.position.set(sx, cabY + (big ? 0.12 : 0.08), 0); gg.add(seam);
            }
            // Dach: klein = gewölbt, groß = flach mit Reling und Dachluke
            if (big) {
                const roofP = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.1, 0.09, CW + 0.1), bodyMat);
                roofP.position.y = cabY + CH / 2 + 0.04; roofP.castShadow = true; gg.add(roofP);
                const rail = new THREE.Mesh(new THREE.TorusGeometry(CW * 0.52, 0.022, 6, 16), M.metal);
                rail.rotation.x = Math.PI / 2; rail.position.y = cabY + CH / 2 + 0.16; gg.add(rail);
                const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10), M.metal);
                hatch.position.y = cabY + CH / 2 + 0.1; gg.add(hatch);
            } else {
                const roofC = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
                roofC.scale.set(1, 0.42, 1); roofC.position.y = cabY + 0.43; roofC.castShadow = true; gg.add(roofC);
            }
            // Nummernschild vorn
            const num = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.26 : 0.2, big ? 0.17 : 0.14, 0.02),
                new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xcbd5e1, emissiveIntensity: 0.3 }));
            num.position.set(0, cabY + (big ? 0.5 : 0.35), off + 0.01); gg.add(num);
            // Gäste stehen auf dem KABINENBODEN und werden auf Innenhöhe
            // skaliert — eine ungeschrumpfte Figur (~1.55 hoch) passt in eine
            // 0.85 hohe Kabine nicht hinein und klebte vorher außen dran.
            gg.userData.seatInfo = {
                seats: big ? 8 : small ? 4 : 6,
                y: cabY - CH / 2 + 0.02,          // Bodenhöhe innen
                spread: CW * 0.3,
                rows: 2, rowGap: CW * 0.26,
                scale: Math.min(1, (CH * 0.88) / 1.55)
            };
            // Werbebanderole auf der Kabine — Text je Level (siehe opts.adText)
            if (opts.adText) {
                const adTex = makeLabelTexture(opts.adText, opts.adColor || 0xffffff, opts.adBg || 0x1d4ed8);
                const adMat = new THREE.MeshBasicMaterial({ map: adTex, transparent: true, side: THREE.DoubleSide });
                const aOff = CW / 2 + 0.016;
                for (const [ax, az, ry] of [[aOff, 0, Math.PI / 2], [-aOff, 0, -Math.PI / 2],
                                            [0, aOff, 0], [0, -aOff, Math.PI]]) {
                    const ad = new THREE.Mesh(new THREE.PlaneGeometry(CW * 0.86, big ? 0.24 : 0.2), adMat);
                    ad.position.set(ax, cabY - (big ? 0.36 : 0.23), az); ad.rotation.y = ry; gg.add(ad);
                }
            }
        }
        gg.rotation.y = Math.atan2(nd.x, nd.z); // längs zur Fahrtrichtung
        group.add(gg);
        gondolas.push({ mesh: gg, phase: i / nGond, up: i % 2 === 0, seed: (i * 0.6180339887) % 1,
            riders: gg.userData.riders || null, along: 0,
            info: gg.userData.seatInfo || { seats: 4, y: -0.8, spread: 0.37 },
            slots: [] });
    }

    // ===== ECHTE BESETZUNG =====
    // Die Sitze werden NICHT mehr nach einer Auslastungsquote gefüllt. Statt
    // dessen fahren die tatsächlichen Gast-Figuren mit: Scene3D weist jedem
    // einsteigenden Gast einen Sitzplatz zu und liest dessen Weltposition
    // hier ab. Die dekorativen Dummy-Fahrgäste bleiben daher unsichtbar.
    const update = (t) => {
        for (const w of stationWheels) w.rotation.y = t * 0.8;
        for (const g of gondolas) {
            let p = (g.phase + t * 0.02) % 1;
            const along = g.up ? p : 1 - p;
            const side = g.up ? -0.7 : 0.7;
            // Gruppe sitzt EXAKT auf dem Seil, Kabine hängt via lokalem Offset
            const pt = curve.getPoint(along).add(perp.clone().multiplyScalar(side));
            g.mesh.position.copy(pt);
            // ===== WINDPENDELN =====
            // In einer Bö drückt der Wind die Kabine quer aus dem Lot und
            // lässt sie zusätzlich unruhig zittern (Buffeting). Sessel und
            // Bügel hängen kürzer und reagieren daher schwächer.
            if (_windGust > 0.01) {
                const cross = windCross(yaw);
                const damp = chair ? 0.45 : surface ? 0.12 : 1;
                const buffet = Math.sin(t * 5.7 + g.phase * 19) * _windGust * 0.05;
                g.mesh.rotation.z = (cross * 0.30 + buffet) * damp;
                g.mesh.rotation.x = Math.sin(t * 3.9 + g.phase * 11) * _windGust * 0.06 * damp;
            } else if (g.mesh.rotation.z !== 0 || g.mesh.rotation.x !== 0) {
                g.mesh.rotation.z *= 0.90; g.mesh.rotation.x *= 0.90;
                if (Math.abs(g.mesh.rotation.z) < 0.001) g.mesh.rotation.z = 0;
                if (Math.abs(g.mesh.rotation.x) < 0.001) g.mesh.rotation.x = 0;
            }
            g.along = along;                     // für die Sitzplatzvergabe
            if (g.riders) g.riders.visible = false;
        }
    };
    attachNightLights(group, { beacons });
    group.userData.update = update;
    return {
        group, update,
        setOccupancy: () => {},                  // Quote wird nicht mehr benutzt
        carriers: gondolas,
        // Weltposition eines Sitzplatzes: Fahrzeugmitte + seitlicher Versatz.
        // Die Maße kommen je Bauart aus `info` (Bügel, Sessel, Kabine).
        seatPos: (carrier, slot, out) => {
            const inf = carrier.info;
            // Bei mehreren Reihen wird die Kabine in Tiefe UND Breite belegt,
            // sonst stünden alle in einer Linie quer durch die Wand.
            const rows = inf.rows || 1;
            const perRow = Math.ceil(inf.seats / rows);
            const row = Math.floor(slot / perRow), col = slot % perRow;
            const lx = (col - (perRow - 1) / 2) * inf.spread;
            const lz = rows > 1 ? (row - (rows - 1) / 2) * (inf.rowGap || 0.3) : 0;
            out.set(lx, inf.y, lz);
            carrier.mesh.localToWorld(out);
            return out;
        }
    };
}

/**
 * Große 8er-Kabinenbahn: dickeres Tragseil, höhere Stützen, weniger aber
 * deutlich größere Kabinen mit Panoramaverglasung.
 */
export function makeGondola8(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 16, ...opts, cabin8: true });
}

/**
 * KLEINE 4er-GONDELBAHN: die günstigste Kabinenbahn. Kompakte Kabinen,
 * enger Abstand, niedrige Stützen — der Einstieg in den Kabinenbau.
 */
export function makeGondola4(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 11, ...opts, cabin4: true });
}

/** Sessellift: offene Sessel statt Kabinen. */
export function makeChairlift(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 10, ...opts, chair: true, seats: 4 });
}
/** 2er-Sessellift (2D: CHAIR_2) — schmaler, einfacher Sessel. */
export function makeChairlift2(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 8.5, ...opts, chair: true, seats: 2 });
}
/** 6er-Sesselbahn mit Wetterschutzhaube (2D: CHAIR_6). */
export function makeChairlift6(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 12, ...opts, chair: true, seats: 6, bubble: true });
}
/** Tellerlift (2D: TOW_P) — Einzelteller statt Querbügel. */
export function makePlatterLift(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 5, ...opts, kind: 'platter' });
}
/** Magic Carpet (2D: CARPET) — Förderband für Anfänger, mit Geländer und Dach. */
export function makeMagicCarpet(a, b, groundYs = null) {
    const group = new THREE.Group();
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length() || 1;
    const nd = dir.clone().normalize();
    const yaw = Math.atan2(nd.x, nd.z);
    const N = Math.max(6, Math.floor(len / 2));
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.3 });
    const segs = [];
    for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
        if (groundYs && groundYs.length) {
            p0.y = groundYs[Math.min(groundYs.length - 1, Math.round(t0 * (groundYs.length - 1)))];
            p1.y = groundYs[Math.min(groundYs.length - 1, Math.round(t1 * (groundYs.length - 1)))];
        }
        const mid = p0.clone().lerp(p1, 0.5);
        const segLen = p0.distanceTo(p1) || 1;
        const belt = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, segLen), beltMat);
        belt.position.copy(mid); belt.position.y += 0.12;
        belt.lookAt(p1.x, p1.y + 0.12, p1.z); belt.receiveShadow = true;
        group.add(belt); segs.push(belt);
        // Seitliche Leitplanken
        for (const s of [-0.62, 0.62]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, segLen), frameMat);
            rail.position.copy(mid); rail.position.y += 0.38;
            rail.position.x += Math.cos(yaw) * s; rail.position.z -= Math.sin(yaw) * s;
            rail.lookAt(rail.position.x + nd.x, rail.position.y, rail.position.z + nd.z);
            group.add(rail);
        }
    }
    // Antriebsrollen an beiden Enden
    const wheels = [];
    for (const p of [a, b]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12), M.metal);
        w.rotation.z = Math.PI / 2; w.rotation.y = yaw; w.position.copy(p); w.position.y += 0.2;
        group.add(w); wheels.push(w);
        // KEIN Aufbau an den Enden — ein Förderband ist nur ein Band mit
        // Umlenkrolle. Alles Weitere wirkte wie ein Gebäude.
    }
    // Kein Wetterdach, keine Stationshäuschen: ein Zauberteppich ist nur das
    // Band mit seinen Umlenkrollen und den seitlichen Leitplanken.

    // Rollen drehen sich mit der Bandbewegung
    const update = (t) => {
        for (const w of wheels) w.rotation.x = t * 2.2;
    };
    group.userData.update = update;
    return { group, update, setOccupancy: () => {} };
}

/** Schlepplift: niedriges Seil mit Schleppbügeln, stehende Skifahrer. */
export function makeSurfaceLift(a, b, groundYs = null, opts = {}) {
    return makeLift(a, b, groundYs, { maxMast: 4.5, ...opts, kind: 'tbar' });
}

/**
 * Flutlichtmast für Nacht-/Abendskifahren. Steht auf y=groundY.
 * Gibt lampMat (Emissive) und glow (Lichtkegel) zurück, damit die Szene
 * die Beleuchtung am Tag-/Nacht-Zyklus schalten kann.
 */
export function makeFloodlight(height = 6) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, height, 8), M.metal);
    pole.position.y = height / 2; pole.castShadow = true; g.add(pole);
    // Ausleger zum Piste-Zentrum (lokales +Z zeigt Richtung Piste)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.1), M.metal);
    arm.position.set(0, height - 0.2, 0.55); g.add(arm);
    // Lampenkopf (leuchtet)
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffe08a, emissiveIntensity: 0.2, roughness: 0.4 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), lampMat);
    lamp.position.set(0, height - 0.28, 1.05); lamp.rotation.x = 0.5; g.add(lamp);
    // weicher Lichtkegel auf die Piste (additiv, nachts sichtbar)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(new THREE.ConeGeometry(2.4, height + 0.5, 16, 1, true), glowMat);
    // Spitze oben an der Lampe, breite Basis unten auf der Piste (leicht zur Piste geneigt)
    glow.position.set(0, height * 0.5, 1.1);
    glow.rotation.x = -0.28;
    glow.visible = false;
    g.add(glow);
    g.userData.lampMat = lampMat;
    g.userData.glow = glow;
    return g;
}

/**
 * Pendelbahn (Aerial Tram): zwei große Kabinen, die zwischen den
 * Stationen hin- und herpendeln — hohe Masten, dickes Tragseil.
 */
export function makeAerialTram(a, b, groundYs = null, opts = {}) {
    // `opts.jumbo` = Großvariante: deutlich höhere Masten, größere Kabinen.
    const JUMBO = !!opts.jumbo;
    const group = new THREE.Group();
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const nd = dir.clone().normalize();
    const perp = new THREE.Vector3(-nd.z, 0, nd.x);
    // Deutlich höher als vorher — die Kabinen sollen klar über dem Wald
    // schweben, die Großvariante nochmals darüber.
    const clearance = JUMBO ? 13.5 : 9.5;
    // ===== KABINENMASSE ZUERST =====
    // Der Einstiegsperron muss GENAU auf Höhe des Kabinenbodens liegen,
    // deshalb werden die Maße vor dem Stationsbau festgelegt und die
    // Stationshöhe daraus zurückgerechnet.
    // Proportionen nach dem Vorbild: die Großkabine ist LANG und NIEDRIG —
    // etwa dreimal so lang wie hoch. Das Gehänge sitzt entsprechend weit
    // über dem Dach.
    const CW = JUMBO ? 2.9 : 2.6;      // Breite (quer zur Fahrt)
    const CH = JUMBO ? 2.2 : 2.0;      // Höhe
    const CD = JUMBO ? 6.8 : 2.4;      // Tiefe (längs zur Fahrt)
    const cabY = -(JUMBO ? 3.4 : 2.5);
    // ===== STATIONSHÖHE ZUERST, SEILHÖHE DARAUS =====
    // Umgekehrt zu vorher: die Halle bekommt eine feste, bewusst niedrige
    // Höhe. Daraus folgt die Perronoberkante, daraus die Höhe, in der das
    // Tragseil in die Station einläuft. So kann die Station nie mehr
    // ungewollt auf Streckenhöhe hochwachsen.
    const STATION_H = JUMBO ? 3.05 : 2.65;
    const DECK_Y = 0.6 + STATION_H + 0.36;             // Oberkante Fachwerkdach
    const CABIN_FLOOR = DECK_Y + 0.16;                 // Perronoberkante
    const stationClear = CABIN_FLOOR - cabY + CH / 2;  // Seilhöhe an der Station
    const ST_DROP = Math.max(0, clearance - stationClear);
    const yaw = Math.atan2(nd.x, nd.z);

    // ===== MODERNE STATIONSHALLEN =====
    // Betonkern, Glasfassade, auskragendes Flugdach — bewusst zeitgenössisch
    // statt der alten Chalet-Hütte.
    const mkStation = (p, isTop) => {
        const st = new THREE.Group();
        const W = JUMBO ? 5.4 : 4.3, D = JUMBO ? 8.6 : 5.6, H = STATION_H;
        const podium = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 0.6, D + 1.8), M.stone);
        podium.position.y = 0.3; podium.receiveShadow = true; st.add(podium);
        // Schräge Betonscheiben als Tragwerk
        for (const sx of [-1, 1]) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.45, H * 1.12, D * 0.9),
                new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.8 }));
            fin.position.set(sx * W / 2, 0.6 + H * 0.56, 0);
            fin.rotation.z = sx * 0.07; fin.castShadow = true; st.add(fin);
        }
        // Durchgehende Glasfassade an den Stirnseiten
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x86aec8, roughness: 0.12,
            metalness: 0.4, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        for (const sz of [-1, 1]) {
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, H * 0.86), glassMat);
            wall.position.set(0, 0.6 + H * 0.48, sz * D / 2); st.add(wall);
            for (let k = 0; k < 4; k++) {          // Pfosten der Fassade
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, H * 0.86, 0.1), M.metal);
                post.position.set(-W * 0.36 + k * (W * 0.24), 0.6 + H * 0.48, sz * D / 2); st.add(post);
            }
        }
        // ===== BETONDACH MIT EINFAHRTSSCHLITZ =====
        // Massive Betonscheibe wie zuvor — aber sie ist in der Mitte über
        // der Fahrgasse AUFGETRENNT. Die Kabine fährt durch den Schlitz ein
        // und kann daher nie mehr durch das Dach gleiten. Rundum ein
        // Stahlgeländer mit Handlauf, Knieholm und Pfosten.
        {
            const RW2 = W + 2.2, RD = D + 2.6;
            const TOP = 0.6 + H + 0.52;                 // Oberkante Beton = Gehebene = Kabinenboden
            const conc = new THREE.MeshStandardMaterial({ color: 0xbfc6ce, roughness: 0.85, metalness: 0.05 });
            const GAP = CW + 0.9;                       // freie Gasse für die Kabine
            const sideW = (RW2 - GAP) / 2;
            // Zwei Betonschenkel links und rechts der Gasse
            for (const sx of [-1, 1]) {
                const slab = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.50, RD), conc);
                slab.position.set(sx * (GAP + sideW) / 2, TOP - 0.25, 0);
                slab.castShadow = true; slab.receiveShadow = true; st.add(slab);
                // Unterzug als sichtbare Rippe
                const beam2 = new THREE.Mesh(new THREE.BoxGeometry(sideW * 0.5, 0.3, RD), conc);
                beam2.position.set(sx * (GAP + sideW) / 2, TOP - 0.64, 0); st.add(beam2);
            }
            // Querriegel hinter der Kabine schließt die beiden Schenkel
            const back = new THREE.Mesh(new THREE.BoxGeometry(GAP, 0.50, RD * 0.16), conc);
            back.position.set(0, TOP - 0.25, (isTop ? 1 : -1) * (RD / 2 - RD * 0.08));
            back.castShadow = true; st.add(back);
            // Auskragende Konsolen tragen die Kragplatte
            for (const sx of [-1, 1]) for (const kz of [-1, -0.34, 0.34, 1]) {
                const cons = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.26, 0.3), conc);
                cons.position.set(sx * (W / 2 + 0.55), TOP - 0.80, kz * RD * 0.36);
                cons.rotation.z = sx * 0.22; st.add(cons);
            }
            // ===== STAHLGELÄNDER RINGSUM =====
            // Handlauf oben, Knieholm auf halber Höhe, Pfosten alle ~1.2 m,
            // an den Aussenkanten des Daches. Die Fahrgasse bleibt offen.
            const railMat = M.metal;
            const mkRun = (x0, z0, x1, z1) => {
                const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
                const ang = Math.atan2(dx, dz);
                for (const hy of [0.52, 1.02]) {
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, L, 8), railMat);
                    bar.rotation.set(Math.PI / 2, ang, 0);
                    bar.position.set((x0 + x1) / 2, TOP + hy, (z0 + z1) / 2); st.add(bar);
                }
                const nP = Math.max(2, Math.round(L / 1.2));
                for (let k = 0; k <= nP; k++) {
                    const u = k / nP;
                    const po = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 1.04, 8), railMat);
                    po.position.set(x0 + dx * u, TOP + 0.52, z0 + dz * u); st.add(po);
                }
            };
            for (const sx of [-1, 1]) {
                mkRun(sx * RW2 / 2, -RD / 2, sx * RW2 / 2, RD / 2);             // Aussenkante längs
                // KEIN Geländer an der Gassenkante — dort steigen die Gäste
                // seitlich in die Kabine ein, ein Holm davor würde den Weg
                // versperren. Nur die Stirnseiten werden gesichert.
                mkRun(sx * (GAP / 2 + 0.35), (isTop ? -1 : 1) * RD / 2,
                      sx * RW2 / 2, (isTop ? -1 : 1) * RD / 2);                 // Stirnseite vorn
            }
            mkRun(-RW2 / 2, (isTop ? 1 : -1) * RD / 2, RW2 / 2, (isTop ? 1 : -1) * RD / 2); // hinten durchgehend
            // Schnee liegt auf den Betonschenkeln, nie in der Gasse
            for (const sx of [-1, 1]) {
                const cap = new THREE.Mesh(new THREE.BoxGeometry(sideW * 0.8, 0.08, RD * 0.96), M.snow);
                cap.position.set(sx * (GAP + sideW) / 2, TOP + 0.04, 0); st.add(cap);
            }
        }
        // Umlenkscheibe + Antrieb im Inneren
        const sheave = new THREE.Mesh(new THREE.CylinderGeometry(JUMBO ? 2.4 : 1.9, JUMBO ? 2.4 : 1.9, 0.4, 24), M.metal);
        sheave.rotation.z = Math.PI / 2;
        sheave.position.set(0, 0.6 + H * 0.66, (isTop ? -1 : 1) * D * 0.2);
        st.add(sheave); st.userData.sheave = sheave;
        const motor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 2.1),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }));
        motor.position.set(W * 0.26, 1.25, (isTop ? 1 : -1) * D * 0.22); st.add(motor);
        // Drehkreuze im Erdgeschoss
        for (let g3 = 0; g3 < 3; g3++) {
            const gate = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.0, 0.13), M.metal);
            gate.position.set(-1.5 + g3 * 1.5, 1.1, (isTop ? 1 : -1) * (D / 2 - 0.8)); st.add(gate);
        }
        // ===== EINSTIEGSPERRON AUF DEM DACH =====
        // Die Pendelkabine hält OBEN an. Die Gäste kommen über eine
        // Außentreppe mit Zwischenpodest aufs Dach und steigen dort ein.
        const deckY = DECK_Y;
        const perron = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.16, D * 0.82),
            new THREE.MeshStandardMaterial({ color: 0x5a646f, roughness: 0.85 }));
        perron.position.set(0, deckY + 0.08, 0); st.add(perron);
        // Geländer rund um den Perron (Einstiegsseite bleibt offen)
        for (const [rx, rz, rw, ry2] of [[0, (isTop ? 1 : -1) * D * 0.44, W * 0.92, 0],
                                         [-W * 0.46, 0, D * 0.82, Math.PI / 2],
                                         [W * 0.46, 0, D * 0.82, Math.PI / 2]]) {
            for (const hy of [0.5, 1.0]) {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.05, 0.05), M.metal);
                rail.position.set(rx, deckY + hy, rz); rail.rotation.y = ry2; st.add(rail);
            }
        }
        // Außentreppe: zwei Läufe mit Podest an der Stirnseite
        const stairSide = (isTop ? 1 : -1) * (D / 2 + 0.55);
        const nStep = 14, stepH = deckY / nStep;
        for (let k = 0; k < nStep; k++) {
            const half2 = k < nStep / 2;
            const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.34),
                new THREE.MeshStandardMaterial({ color: 0x707a86, roughness: 0.9 }));
            const run = (k % (nStep / 2)) * 0.36 - 1.2;
            step.position.set(half2 ? -1.5 + run * 0 : 1.5, stepH * (k + 1),
                              stairSide + (half2 ? run : -run));
            step.position.x = half2 ? -1.4 : 1.4;
            st.add(step);
        }
        // Podest auf halber Höhe verbindet die beiden Läufe
        const landing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.0),
            new THREE.MeshStandardMaterial({ color: 0x707a86, roughness: 0.9 }));
        landing.position.set(0, deckY / 2, stairSide + (isTop ? 1.3 : -1.3)); st.add(landing);
        // Treppengeländer
        for (const sx of [-2.2, 2.2]) {
            const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.0), M.metal);
            hand.position.set(sx, deckY * 0.62, stairSide); hand.rotation.x = 0.5; st.add(hand);
        }
        // ===== FAHNENMASTEN AN DEN ECKEN =====
        // Stehen weit ausserhalb der Fahrgasse auf den Fachwerkecken.
        // ===== NEON-WERBEBANNER =====
        // Die großen Anlagen tragen an der Stationsflanke ein leuchtendes
        // Banner mit einem levelspezifischen Produkt.
        if (opts.neonAd) {
            const nb = makeNeonBanner(opts.neonAd.text, {
                color: opts.neonAd.color, color2: opts.neonAd.color2,
                width: Math.min(6.2, D * 0.8), height: 1.15 });
            nb.position.set(-(W / 2 + 1.35), 0.6 + H * 0.62, 0);
            nb.rotation.y = -Math.PI / 2;
            st.add(nb);
            if (nb.userData.update) neonUpdaters.push(nb.userData.update);
        }
        st.userData.flagPoles = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const fp = makeFlagPole(2.5, { country: _levelCountry, w: 1.05, h: 0.66 });
            fp.position.set(sx * (W / 2 + 0.95), deckY, sz * (D / 2 - 0.4));
            st.add(fp); st.userData.flagPoles.push(fp);
        }
        // ===== FASSADENDETAIL =====
        // Senkrechte Sonnenschutzlamellen vor dem Glas und ein umlaufendes
        // LED-Band an der Traufe — macht die kleinere Station wertiger.
        for (const sx of [-1, 1]) {
            for (let k = 0; k < 7; k++) {
                const lam = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.8, 0.22), M.metal);
                lam.position.set(sx * (W / 2 + 0.09), 0.6 + H * 0.5, -D * 0.36 + k * (D * 0.72 / 6));
                st.add(lam);
            }
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, D * 0.94),
                new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x2ea8ff, emissiveIntensity: 0.8 }));
            led.position.set(sx * (W / 2 + 0.13), 0.6 + H * 0.9, 0); st.add(led);
        }
        // Sichtbetonrippen am Sockel
        for (let k = 0; k < 6; k++) {
            const rib = new THREE.Mesh(new THREE.BoxGeometry(W + 1.5, 0.5, 0.09), M.stone);
            rib.position.set(0, 0.35, -D * 0.4 + k * (D * 0.8 / 5)); st.add(rib);
        }
        st.userData.deckY = deckY;
        // Leuchtschriftzug
        // KEINE Stationsbeschriftung mehr — der Anlagenname steht im Infofeld,
        // am Bauwerk selbst wirkten die Schilder aufgesetzt.
        st.position.copy(p); st.rotation.y = yaw;
        group.add(st);
        return st;
    };
    const neonUpdaters = [];
    const stA = mkStation(a, false), stB = mkStation(b, true);

    // EIN zentrales Tragseil-Höhenprofil
    const N = Math.max(10, Math.floor(len / 4));
    const cableA = a.y + stationClear, cableB = b.y + stationClear;
    // Anstieg von Stations- auf Streckenhöhe innerhalb der ersten/letzten 12 %
    const riseS = (f) => { const u = Math.min(1, Math.min(f, 1 - f) / 0.12); return u * u * (3 - 2 * u); };
    const pts = [];
    // ===== SEILVERLAUF MIT DURCHHANG =====
    // Das Tragseil einer Pendelbahn spannt sich frei von Station zu Station
    // (bzw. über die wenigen Stützen) und hängt dazwischen deutlich durch.
    // Der Durchhang wächst mit der Feldlänge — bei großen Spannweiten ist er
    // das prägende Merkmal.
    const nSpan = Math.max(1, Math.round(len / 55));
    const tramSag = Math.min(9, len / nSpan * 0.055);
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const base = a.clone().lerp(b, t);
        const lineY = cableA + (cableB - cableA) * t + ST_DROP * riseS(t);
        let groundY = base.y;
        if (groundYs && groundYs.length) groundY = groundYs[Math.min(groundYs.length - 1, Math.round(t * (groundYs.length - 1)))];
        // Feldposition: 0 an einer Stütze, 1 an der nächsten
        const f = (t * nSpan) % 1;
        const sag = Math.sin(Math.PI * f) * tramSag;
        // an den Stationen läuft der Durchhang aus
        const edge = Math.min(1, Math.min(t, 1 - t) / 0.05);
        pts.push(new THREE.Vector3(base.x,
            Math.max(lineY - sag * edge, groundY + stationClear * 0.55), base.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);

    // Seilsattel (Aufnahme): Wange links/rechts mit Rille dazwischen, quer zur Fahrt
    const buildSaddle = (cp) => {
        const sd = new THREE.Group();
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.6), M.metal);
        sd.add(shoe);
        for (const cx of [-0.24, 0.24]) {
            const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 1.6), M.metal);
            cheek.position.set(cx, 0.18, 0); sd.add(cheek);
        }
        sd.position.copy(cp).add(new THREE.Vector3(0, -0.18, 0));
        sd.rotation.y = yaw; group.add(sd);
    };

    // hohe Masten mit Seilsattel obenauf
    // Anzahl der Stützen: vorher lieferte floor(len/22) bei kurzen Bahnen 1
    // und die Schleife (i=1; i<1) lief NIE — es gab überhaupt keine Masten
    // und damit auch keine Querverstrebungen zu sehen.
    // Eine Pendelbahn überspannt große Distanzen mit SEHR WENIGEN Stützen —
    // oft nur einer oder zweien. Genau das macht ihre Silhouette aus.
    const nMast = Math.max(2, Math.round(len / 55));
    const tramBeacons = [];
    for (let i = 1; i < nMast; i++) {
        const t = i / nMast;
        const top = curve.getPoint(t);
        const groundY = (groundYs && groundYs.length) ? groundYs[Math.min(groundYs.length - 1, Math.round(t * (pts.length - 1)))] : a.clone().lerp(b, t).y;
        const h = Math.max(2, top.y - groundY);
        // Gittermast: vier Eckrohre mit Querringen — moderner und schlanker
        // als der bisherige massive Kegel.
        const legR = JUMBO ? 0.85 : 0.62;
        for (const [ox, oz] of [[-legR, -legR], [legR, -legR], [legR, legR], [-legR, legR]]) {
            const wo = perp.clone().multiplyScalar(ox).add(nd.clone().multiplyScalar(oz));
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, h, 6), M.metal);
            leg.position.set(top.x + wo.x, groundY + h / 2, top.z + wo.z);
            leg.castShadow = true; group.add(leg);
        }
        // Querverstrebungen: horizontale Ringe UND diagonale Kreuze zwischen
        // den Etagen — erst die Diagonalen machen das Fachwerk erkennbar.
        const LVL = 2.2;
        for (let lv = 1; lv * LVL < h; lv++) {
            const y0 = groundY + lv * LVL;
            for (const side of [0, 1]) {            // je Mastseite ein Rahmen
                const axis = side ? nd : perp;
                const wo = axis.clone().multiplyScalar(legR);
                for (const sgn of [1, -1]) {
                    const ctr = wo.clone().multiplyScalar(sgn);
                    const bar = new THREE.Mesh(new THREE.BoxGeometry(legR * 2, 0.14, 0.14), M.metal);
                    bar.position.set(top.x + ctr.x, y0, top.z + ctr.z);
                    bar.rotation.y = side ? yaw + Math.PI / 2 : yaw;
                    group.add(bar);
                    // zwei gegenläufige Diagonalen = Andreaskreuz
                    const diagLen = Math.hypot(legR * 2, LVL);
                    for (const dsg of [1, -1]) {
                        const diag = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.11, 0.11), M.metal);
                        diag.position.set(top.x + ctr.x, y0 - LVL / 2, top.z + ctr.z);
                        diag.rotation.y = side ? yaw + Math.PI / 2 : yaw;
                        diag.rotation.z = dsg * Math.atan2(LVL, legR * 2);
                        group.add(diag);
                    }
                }
            }
        }
        // Kopfrahmen: der oberste Abschnitt blieb bisher ohne Verband, weil
        // die Etagenschleife dort abbricht.
        for (const side of [0, 1]) {
            const axis = side ? nd : perp;
            for (const sgn of [1, -1]) {
                const ctr = axis.clone().multiplyScalar(legR * sgn);
                const bar = new THREE.Mesh(new THREE.BoxGeometry(legR * 2, 0.14, 0.14), M.metal);
                bar.position.set(top.x + ctr.x, top.y - 0.25, top.z + ctr.z);
                bar.rotation.y = side ? yaw + Math.PI / 2 : yaw; group.add(bar);
                const dl = Math.hypot(legR * 2, 1.6);
                for (const dsg of [1, -1]) {
                    const dg = new THREE.Mesh(new THREE.BoxGeometry(dl, 0.11, 0.11), M.metal);
                    dg.position.set(top.x + ctr.x, top.y - 1.05, top.z + ctr.z);
                    dg.rotation.y = side ? yaw + Math.PI / 2 : yaw;
                    dg.rotation.z = dsg * Math.atan2(1.6, legR * 2);
                    group.add(dg);
                }
            }
        }
        const mast = new THREE.Mesh(new THREE.BoxGeometry(legR * 2.6, 0.28, 0.36), M.metal);
        mast.position.set(top.x, top.y + 0.3, top.z); mast.rotation.y = yaw; group.add(mast);
        if (i % 2 === 0) {
            const bc = makeBeacon(top.x, top.y + 0.7, top.z, (i * 0.41) % 1);
            group.add(bc.mesh); tramBeacons.push(bc);
        }
        buildSaddle(top);
    }

    // Portal-Seilaufnahme an beiden Stationen (zwei Pfosten + Querträger + Sattel)
    const buildPortal = (station, cp) => {
        const postH = cp.y - station.y;
        if (postH <= 0.5) return;
        for (const s of [-2.3, 2.3]) {
            const foot = cp.clone().add(perp.clone().multiplyScalar(s));
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, postH, 8), M.metal);
            post.position.set(foot.x, station.y + postH / 2, foot.z); post.castShadow = true; group.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.3, 0.3), M.metal);
        beam.position.copy(cp).add(new THREE.Vector3(0, 0.2, 0)); beam.rotation.y = yaw; group.add(beam);
        buildSaddle(cp);
        // Umlenkscheibe (vertikal) in Fahrtrichtung
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.24, 20), M.woodDark);
        wheel.rotation.z = Math.PI / 2; wheel.rotation.y = yaw;
        wheel.position.copy(cp).add(new THREE.Vector3(0, -0.1, 0)); group.add(wheel);
    };
    buildPortal(a, pts[0]);
    buildPortal(b, pts[pts.length - 1]);

    // ZWEI getrennte Tragseile — eines je Fahrtrichtung. Vorher lief beides
    // über ein mittiges Seil, weshalb sich die Kabinen in der Mitte der
    // Strecke durchdrungen haben.
    const TRAM_GAUGE = 1.75;                 // halber Seilabstand
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.6, metalness: 0.5 });
    for (const sgn of [-1, 1]) {
        const off2 = perp.clone().multiplyScalar(TRAM_GAUGE * sgn);
        const shifted = new THREE.CatmullRomCurve3(pts.map(p2 => p2.clone().add(off2)));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(shifted, N, 0.09, 8, false), ropeMat));
    }

    // ===== ZWEI MODERNE PENDELKABINEN =====
    // Abgerundeter Wagenkasten mit umlaufendem Panoramaband, Dachaufbau mit
    // Laufwerk und Gehänge. `JUMBO` liefert die Großvariante.
    // (Kabinenmaße CW/CH/CD/cabY sind oben definiert — der Perron hängt daran.)
    const cabBase = opts.cabinColor != null ? opts.cabinColor : null;
    // Lackierter Blechkasten mit Patina: hohe Metalligkeit, aber deutlich
    // rauer als Neulack — dadurch wirkt die Oberfläche stumpf und benutzt
    // statt frisch poliert. Die leicht abgedunkelte Farbe unterstützt das.
    const usedCab = (hex) => new THREE.MeshStandardMaterial({
        color: hex, roughness: 0.42, metalness: 0.45, envMapIntensity: 0.55
    });
    const cabMat = [ usedCab(cabBase ?? 0xd8354b), usedCab(cabBase ?? 0x2668c8) ];
    const cabGlass = new THREE.MeshStandardMaterial({ color: 0x93a6b6, roughness: 0.1,
        metalness: 0.35, transparent: true, opacity: 0.58, side: THREE.DoubleSide });
    cabGlass.userData.isWindow = true;
    const cabins = [];
    for (let i = 0; i < 2; i++) {
        const cg = new THREE.Group();

        // ===== LAUFWERK =====
        // Zwei Wagen auf den Tragseilen, verbunden durch eine Traverse.
        // Auf jedem Wagen sitzen vier Laufrollen — genau dieses gedrungene
        // Rollenpaket prägt die Silhouette einer großen Pendelbahn.
        const bogieY = 0.0;
        const bogieSpan = CD * 0.34;
        for (const bz of [-bogieSpan, bogieSpan]) {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.30, 1.15), M.metal);
            frame.position.set(0, bogieY + 0.05, bz); cg.add(frame);
            for (const wz of [-0.40, -0.14, 0.14, 0.40]) {
                const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.20, 14), M.metal);
                roll.rotation.x = Math.PI / 2;
                roll.position.set(0, bogieY + 0.20, bz + wz); cg.add(roll);
            }
        }
        // Längstraverse zwischen den beiden Wagen
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, bogieSpan * 2 + 0.6), M.metal);
        beam.position.set(0, bogieY - 0.22, 0); cg.add(beam);

        // ===== A-BOCK-GEHÄNGE =====
        // Ein breiter, nach unten sich verjüngender Bock trägt die Kabine.
        // Er läuft oben zu einem Träger zusammen und spreizt sich unten zu
        // zwei Beinen, die auf dem Kabinendach aufsetzen.
        const hangTop = bogieY - 0.35;
        const hangBot = cabY + CH / 2;
        const hangH = hangTop - hangBot;
        for (const sx of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.30, hangH, 0.44), M.metal);
            leg.position.set(sx * CW * 0.24, hangBot + hangH / 2, 0);
            leg.rotation.z = sx * 0.13;                 // spreizt sich nach unten
            leg.castShadow = true; cg.add(leg);
        }
        // Querjoch oben, wo die Beine zusammenlaufen
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.62, 0.26, 0.5), M.metal);
        yoke.position.set(0, hangTop - 0.05, 0); cg.add(yoke);

        // ===== WAGENKASTEN: LIEGENDER ZYLINDER =====
        // Kein Kasten mit angesetzten Rundungen mehr, sondern EIN
        // durchgehender Körper — eine liegende Röhre längs zur Fahrtrichtung,
        // oben und unten leicht abgeflacht.
        const R = CH * 0.5;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, CD, 22, 1, false), cabMat[i]);
        body.rotation.x = Math.PI / 2;           // Achse längs zur Fahrt
        body.scale.set(CW / (R * 2), 1, 0.94);   // Breite anpassen, Dach abflachen
        body.position.y = cabY; body.castShadow = true; cg.add(body);
        // Stirnkappen bündig im Zylinder
        for (const ez of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 22), cabMat[i]);
            cap.scale.set(CW / (R * 2), 0.94, 1);
            cap.position.set(0, cabY, ez * (CD / 2 - 0.004));
            if (ez < 0) cap.rotation.y = Math.PI;
            cg.add(cap);
        }
        // Umlaufende Spanten geben der Röhre Struktur
        for (const rz of [-CD * 0.30, 0, CD * 0.30]) {
            const rib = new THREE.Mesh(new THREE.TorusGeometry(R * 1.008, 0.032, 6, 24), M.metal);
            rib.rotation.y = Math.PI / 2;
            rib.scale.set(1, 0.94, CW / (R * 2));
            rib.position.set(0, cabY, rz); cg.add(rib);
        }

        // ===== FENSTERBAND IM ZYLINDER =====
        // Mehrere schmale Scheibensegmente folgen der Rundung statt einer
        // flachen Platte an der Wand.
        const winY = cabY + CH * 0.10;
        const winH = CH * 0.42;
        const nPane = JUMBO ? 9 : 6;
        const mull = new THREE.MeshStandardMaterial({ color: 0x9aa4af, roughness: 0.45, metalness: 0.6 });
        const segW = (CD * 0.92) / nPane;
        for (const sx of [1, -1]) {
            for (let k = 0; k < nPane; k++) {
                const zc = -CD * 0.46 + segW * (k + 0.5);
                const pane = new THREE.Mesh(new THREE.PlaneGeometry(segW * 0.86, winH), cabGlass);
                pane.position.set(sx * (CW / 2 - 0.015), winY, zc);
                pane.rotation.y = sx * Math.PI / 2;
                cg.add(pane);
                if (k < nPane - 1) {
                    const post = new THREE.Mesh(new THREE.BoxGeometry(0.022, winH + 0.02, 0.028), mull);
                    post.position.set(sx * (CW / 2 - 0.006), winY, zc + segW / 2);
                    cg.add(post);
                }
            }
        }
        // Stirnfenster
        for (const ez of [1, -1]) {
            const band = new THREE.Mesh(new THREE.PlaneGeometry(CW * 0.66, winH * 0.88), cabGlass);
            band.position.set(0, winY, ez * (CD / 2 + 0.004));
            if (ez < 0) band.rotation.y = Math.PI; cg.add(band);
        }

        // Dunkles Schürzenblech als schmaler Ring unterhalb der Fenster
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.004, R * 1.004, CD * 0.99, 22, 1, true,
            Math.PI * 0.62, Math.PI * 0.76),
            new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }));
        skirt.rotation.x = Math.PI / 2;
        skirt.scale.set(CW / (R * 2), 1, 0.94);
        skirt.position.y = cabY; cg.add(skirt);

        // ===== KABINENDACH =====
        // Keine aufgelegte Platte mehr: das Dach ist eine flach gewölbte
        // Schale, die der Röhre folgt, mit Regenrinne, zwei Dachrelings,
        // Quersprossen, Technikkasten und Antenne — so wie das Dach einer
        // echten Großkabine, auf dem auch Personal steht.
        {
            const RY = R * 0.94;                       // vertikaler Radius der Röhre
            const roofY = cabY + RY;
            // Schale: oberes Segment eines liegenden Zylinders
            const shell = new THREE.Mesh(
                new THREE.CylinderGeometry(R * 1.012, R * 1.012, CD * 0.995, 24, 1, true,
                    Math.PI * 0.30, Math.PI * 0.40),
                new THREE.MeshStandardMaterial({ color: 0xd9dee5, roughness: 0.45,
                    metalness: 0.35, side: THREE.DoubleSide }));
            shell.rotation.x = Math.PI / 2;
            shell.scale.set(CW / (R * 2), 1, 0.94);
            shell.position.y = cabY; shell.castShadow = true; cg.add(shell);
            // Regenrinne als schmale Leiste an beiden Traufen
            for (const sx of [-1, 1]) {
                const gut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, CD * 0.98), M.metal);
                gut.position.set(sx * CW * 0.44, cabY + RY * 0.72, 0); cg.add(gut);
            }
            // Zwei Dachrelings längs, dazwischen Quersprossen
            for (const sx of [-1, 1]) {
                const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, CD * 0.86, 8), M.metal);
                rail.rotation.x = Math.PI / 2;
                rail.position.set(sx * CW * 0.30, roofY + 0.20, 0); cg.add(rail);
                for (let k = -2; k <= 2; k++) {
                    const st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.20, 6), M.metal);
                    st2.position.set(sx * CW * 0.30, roofY + 0.10, k * CD * 0.18); cg.add(st2);
                }
            }
            for (const rz of [-CD * 0.30, 0, CD * 0.30]) {
                const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, CW * 0.60, 6), M.metal);
                cr.rotation.z = Math.PI / 2;
                cr.position.set(0, roofY + 0.20, rz); cg.add(cr);
            }
            // Technikkasten (Antrieb Türen, Notversorgung) + Lüftergitter
            const box = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.34, 0.20, CD * 0.26),
                new THREE.MeshStandardMaterial({ color: 0x59626d, roughness: 0.55, metalness: 0.5 }));
            box.position.set(0, roofY + 0.10, CD * 0.22); cg.add(box);
            for (let k = 0; k < 4; k++) {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.34 + 0.01, 0.02, 0.03), M.metal);
                fin.position.set(0, roofY + 0.04 + k * 0.045, CD * 0.22 + CD * 0.13); cg.add(fin);
            }
            // Antenne und Rundumleuchte
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.5, 6), M.metal);
            ant.position.set(CW * 0.20, roofY + 0.32, -CD * 0.30); cg.add(ant);
            const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 10),
                new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff6a00,
                    emissiveIntensity: 0.9, roughness: 0.4 }));
            bl.position.set(-CW * 0.20, roofY + 0.10, -CD * 0.30); cg.add(bl);
        }

        // Schiebetüren mittig auf den Längsseiten
        const doors = [];
        const doorW = CD * 0.20, doorH = CH * 0.62;
        for (const sx of [1, -1]) {
            for (const dz of [-1, 1]) {
                // Bündig in der Wand — kein aufgesetzter Kasten
                const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.02, doorH, doorW),
                    new THREE.MeshStandardMaterial({ color: 0x8e99a6, roughness: 0.35, metalness: 0.4 }));
                leaf.position.set(sx * (CW / 2 + 0.012), cabY - CH * 0.04, dz * doorW / 2);
                cg.add(leaf);
                doors.push({ mesh: leaf, closedZ: dz * doorW / 2, openZ: dz * doorW * 1.5 });
            }
        }
        cg.userData.doors = doors;

        cg.rotation.y = yaw;
        cg.userData.seatInfo = {
            seats: JUMBO ? 20 : 12,
            y: cabY - CH / 2 + 0.03,
            spread: CW * 0.2,
            rows: JUMBO ? 5 : 3,
            rowGap: CD * (JUMBO ? 0.17 : 0.22),
            scale: Math.min(1, (CH * 0.9) / 1.55)
        };
        group.add(cg);
        cabins.push({ mesh: cg, side: i === 0 ? -TRAM_GAUGE : TRAM_GAUGE, dir: i,
            along: 0, up: i === 0, info: cg.userData.seatInfo, slots: [], riders: null,
            doors: cg.userData.doors, atStation: true });
    }

    // ===== FAHRPROFIL MIT STATIONSHALT =====
    // Eine Pendelbahn fährt nicht endlos: sie hält an beiden Enden, öffnet
    // die Türen, lässt umsteigen und fährt dann zurück. Der Zyklus besteht
    // aus Halt unten – Bergfahrt – Halt oben – Talfahrt.
    const RUN = 20, DWELL = 7;                  // Sekunden je Abschnitt
    const CYCLE = (RUN + DWELL) * 2;
    const easeIO = (f) => f * f * (3 - 2 * f);  // sanft anfahren und bremsen
    let _lastT = 0;
    const update = (t) => {
        const dtFrame = Math.max(0.0001, Math.min(0.1, t - _lastT));
        _lastT = t;
        const ph = ((t % CYCLE) + CYCLE) % CYCLE;
        let along0, open;                       // Position der Kabine 0, Türzustand
        if (ph < DWELL)                { along0 = 0; open = 1; }
        else if (ph < DWELL + RUN)     { along0 = easeIO((ph - DWELL) / RUN); open = 0; }
        else if (ph < DWELL * 2 + RUN) { along0 = 1; open = 1; }
        else                           { along0 = 1 - easeIO((ph - DWELL * 2 - RUN) / RUN); open = 0; }
        for (const nu of neonUpdaters) nu(t);
        if (stA.userData.sheave) stA.userData.sheave.rotation.x += open ? 0 : 0.03;
        if (stB.userData.sheave) stB.userData.sheave.rotation.x -= open ? 0 : 0.03;
        for (const c of cabins) {
            const along = c.dir === 0 ? along0 : 1 - along0;
            const pt = curve.getPoint(along).add(perp.clone().multiplyScalar(c.side));
            c.mesh.position.copy(pt);
            c.along = along;
            c.up = c.dir === 0;
            c.atStation = open === 1;
            // ===== PENDELN =====
            // Eine hängende Kabine ist ein Pendel: Beschleunigen und Bremsen
            // lenken sie aus, danach schwingt sie mit ihrer Eigenfrequenz aus.
            // `swing` speichert Auslenkung und Geschwindigkeit je Kabine.
            {
                const prev = c._lastAlong ?? along;
                const vel = (along - prev) / Math.max(0.0001, dtFrame);
                c._lastAlong = along;
                const accel = (vel - (c._lastVel ?? 0)) / Math.max(0.0001, dtFrame);
                c._lastVel = vel;
                // Trägheit: Beschleunigung wirkt als Anregung
                c._sw = (c._sw ?? 0);
                c._swV = (c._swV ?? 0) - accel * 0.0038;
                // Rückstellkraft (Pendel) und Dämpfung
                const OMEGA = 1.35;              // Eigenfrequenz
                c._swV += -c._sw * OMEGA * OMEGA * dtFrame;
                c._swV *= Math.pow(0.70, dtFrame);
                c._sw += c._swV * dtFrame;
                c._sw = Math.max(-0.30, Math.min(0.30, c._sw));
                // längs zur Fahrtrichtung ausschwingen
                c.mesh.rotation.x = c._sw;
                // Bö: die große Kabine legt sich quer und zittert dabei
                if (_windGust > 0.01) {
                    const cross = windCross(yaw);
                    c.mesh.rotation.z = cross * 0.26
                        + Math.sin(t * 4.3 + c.dir * 2.1) * _windGust * 0.05;
                } else if (c.mesh.rotation.z !== 0) {
                    c.mesh.rotation.z *= 0.92;
                    if (Math.abs(c.mesh.rotation.z) < 0.001) c.mesh.rotation.z = 0;
                }
            }
            // Türen auf/zu schieben
            if (c.doors) for (const d of c.doors) {
                const target = open ? d.openZ : d.closedZ;
                d.mesh.position.z += (target - d.mesh.position.z) * 0.12;
            }
        }
    };
    attachNightLights(group, { beacons: tramBeacons });
    group.userData.update = update;
    return {
        group, update, setOccupancy: () => {}, carriers: cabins,
        seatPos: (carrier, slot, out) => {
            const inf = carrier.info;
            if (inf.ring) {
                // Runde Kabine: Plätze auf einem Kreis, einer in der Mitte
                const n = Math.max(1, inf.seats - 1);
                if (slot === 0) out.set(0, inf.y, 0);
                else {
                    const a2 = ((slot - 1) / n) * Math.PI * 2;
                    out.set(Math.sin(a2) * inf.ring, inf.y, Math.cos(a2) * inf.ring);
                }
            } else {
                const rows = inf.rows || 1;
                const perRow = Math.ceil(inf.seats / rows);
                const row = Math.floor(slot / perRow), col = slot % perRow;
                out.set((col - (perRow - 1) / 2) * inf.spread, inf.y,
                        rows > 1 ? (row - (rows - 1) / 2) * (inf.rowGap || 0.3) : 0);
            }
            carrier.mesh.localToWorld(out);
            return out;
        }
    };
}

/** Jumbo-Pendelbahn: Maximalvariante mit sehr hohen Masten und 20er-Kabinen. */
export function makeAerialTramXL(a, b, groundYs = null, opts = {}) {
    return makeAerialTram(a, b, groundYs, { ...opts, jumbo: true });
}

/** Parkplatz: Asphaltfeld auf einem Sockel, der Unebenheiten überbrückt. */
export function makeParking(w = 8, d = 8) {
    const g = new THREE.Group();
    // Stützsockel nach unten, damit der Platz an Hängen nicht frei schwebt
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 }));
    base.position.y = -0.75; base.receiveShadow = true; g.add(base);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.95 }));
    pad.position.y = 0.06; pad.receiveShadow = true; g.add(pad);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, roughness: 0.7 });
    // Stellplatz-Markierungen: kurze Striche für vordere & hintere Reihe + Mittelgang frei
    const bay = 2.0;
    for (let i = -w / 2 + bay; i < w / 2 - 0.1; i += bay) {
        for (const sgn of [1, -1]) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, d * 0.34), lineMat);
            line.position.set(i, 0.13, sgn * d * 0.22); g.add(line);
        }
    }
    // Reihen-Abschlusslinie vorne & hinten
    for (const sgn of [1, -1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.02, 0.08), lineMat);
        edge.position.set(0, 0.13, sgn * d * 0.38); g.add(edge);
    }
    return g;
}

/** Kleine Beschilderte Hütte — Basis für Skischule, Verleih, Shop, Imbiss (2D-Katalog). */
function makeSignHut(w, d, signColor, awning = false) {
    const g = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.3, d + 0.1), M.stone);
    sock.position.y = 0.15; sock.castShadow = sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), M.wood);
    body.position.y = 0.3 + 0.5; body.castShadow = body.receiveShadow = true; g.add(body);
    const rp = makePrismRoof(w + 0.4, d + 0.35, 0.6);
    rp.position.y = 1.3; g.add(rp);
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.42, 0.05), M.winGlow);
    win.position.set(0, 0.85, d / 2 + 0.03); g.add(win);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.3, 0.08),
        new THREE.MeshStandardMaterial({ color: signColor, roughness: 0.5 }));
    sign.position.set(0, 1.42, d / 2 + 0.1); g.add(sign);
    if (awning) {
        const aw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.05, 0.55),
            new THREE.MeshStandardMaterial({ color: 0xd94848, roughness: 0.8 }));
        aw.position.set(0, 1.12, d / 2 + 0.3); aw.rotation.x = 0.25; g.add(aw);
    }
    return g;
}
/** Skischule (2D: ski_school) — rotes Schild, Fähnchen. */
export function makeSkiSchool() {
    const g = makeSignHut(2.2, 1.8, 0xdc2626);
    for (let i = 0; i < 3; i++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), M.metal);
        pole.position.set(-0.8 + i * 0.8, 0.75, 1.4); g.add(pole);
        const flag = makeFlagCloth(0.3, 0.18, { color: [0xdc2626, 0x2563eb, 0xf59e0b][i], seg: 10 });
        flag.position.set(-0.8 + i * 0.8, 1.05, 1.4); g.add(flag);
    }
    return g;
}
/** Skiverleih (2D: ski_rental) — Ski-Paare am Giebel. */
export function makeSkiRental() {
    const g = makeSignHut(2.4, 1.9, 0x2563eb);
    for (let i = 0; i < 4; i++) {
        const ski = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.03),
            new THREE.MeshStandardMaterial({ color: [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b][i], roughness: 0.5 }));
        ski.position.set(-0.6 + i * 0.4, 0.85, 1.02); ski.rotation.x = -0.18; g.add(ski);
    }
    return g;
}
/** Sport-/Souvenirshop (2D: sports_shop) — Markise. */
export function makeShop() { return makeSignHut(2.4, 2.0, 0x16a34a, true); }
/** Imbiss (2D: berghuette_gastro klein) — Kiosk mit Theke und Rauch. */
export function makeImbiss() {
    const g = makeSignHut(1.8, 1.5, 0xf59e0b, true);
    const theke = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.3), M.wood);
    theke.position.set(0, 0.95, 0.95); g.add(theke);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), M.stone);
    chimney.position.set(0.55, 1.75, 0); g.add(chimney);
    return g;
}
/** Bushaltestelle (2D: bus_stop) — Glashäuschen mit Schild. */
export function makeBusStop() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.0), M.stone);
    base.position.y = 0.05; g.add(base);
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc3d8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.45 });
    glass.userData.isWindow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.05), glass);
    back.position.set(0, 0.6, -0.45); g.add(back);
    for (const sx of [-0.97, 0.97]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.9), glass); side.position.set(sx, 0.6, 0); g.add(side); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 1.15), M.metal);
    roof.position.y = 1.15; roof.castShadow = true; g.add(roof);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), M.metal);
    post.position.set(1.25, 0.8, 0.3); g.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
    sign.position.set(1.25, 1.5, 0.3); g.add(sign);
    return g;
}
/** Pistenraupen-Garage (2D: snowcat_garage) — orange Halle mit Rolltor. */
export function makeSnowcatGarage(bays = 1, model = '300') {
    const big = model === '500';
    const g = new THREE.Group();
    // Halle für die großen 500er-Maschinen ist breiter und höher
    const w = (big ? 4.2 : 3.2) + (bays - 1) * (big ? 3.4 : 2.6);                  // je Stellplatz breiter
    const H = big ? 2.1 : 1.6, D = big ? 3.4 : 2.6;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(w, H, D),
        new THREE.MeshStandardMaterial({ color: big ? 0x9a3412 : 0xb45309, roughness: 0.8 }));
    hall.position.y = H / 2; hall.castShadow = hall.receiveShadow = true; g.add(hall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.12, D + 0.3), M.metal);
    roof.position.y = H + 0.06; roof.castShadow = true; g.add(roof);
    // Typschild "300" / "500" über dem Tor
    const typeTex = makeLabelTexture(model, 0xffffff, big ? 0x7c2d12 : 0xb45309);
    const typePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28),
        new THREE.MeshBasicMaterial({ map: typeTex }));
    typePlate.position.set(-w / 2 + 0.8, H - 0.3, D / 2 + 0.02); g.add(typePlate);
    // ein Rolltor je Pistenraupe
    const doorW = big ? 3.0 : 2.2, doorH = big ? 1.7 : 1.2, gap = w / bays;
    for (let b = 0; b < bays; b++) {
        const cx = -w / 2 + gap * (b + 0.5);
        const dw = Math.min(doorW, gap - 0.3);
        const door = new THREE.Mesh(new THREE.BoxGeometry(dw, doorH, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.3 }));
        door.position.set(cx, doorH / 2, D / 2 + 0.01); g.add(door);
        for (let i = 0; i < (big ? 6 : 4); i++) {
            const lam = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.02, 0.01), M.metal);
            lam.position.set(cx, 0.25 + i * 0.28, D / 2 + 0.05); g.add(lam);
        }
    }
    const sign2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 }));
    sign2.position.set(w / 2 - 0.7, H - 0.3, D / 2 + 0.03); g.add(sign2);
    return g;
}

/** Parkhaus: mehrstöckige Betondeck-Garage mit großer Kapazität. */
export function makeParkingGarage(floors = 3, w = 12, d = 9) {
    const g = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.9 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.95 });
    const fh = 2.2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 }));
    base.position.y = -0.7; base.receiveShadow = true; g.add(base);
    for (let f = 0; f < floors; f++) {
        const y = f * fh;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), deckMat);
        deck.position.y = y + 0.12; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
        const railH = 0.5;
        for (const sgn of [1, -1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(w, railH, 0.15), concrete);
            rail.position.set(0, y + fh - railH / 2, sgn * d / 2); g.add(rail);
            const railx = new THREE.Mesh(new THREE.BoxGeometry(0.15, railH, d), concrete);
            railx.position.set(sgn * w / 2, y + fh - railH / 2, 0); g.add(railx);
        }
        for (const cx of [-w / 2 + 0.4, 0, w / 2 - 0.4]) for (const cz of [-d / 2 + 0.4, d / 2 - 0.4]) {
            const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, fh, 0.4), concrete);
            col.position.set(cx, y + fh / 2, cz); g.add(col);
        }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), deckMat);
    roof.position.y = floors * fh + 0.1; roof.castShadow = true; g.add(roof);
    // Blaues "P"-Schild an der Einfahrt
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }));
    sign.position.set(-w / 2 + 0.9, floors * fh * 0.5, d / 2 + 0.12); g.add(sign);
    return g;
}

/** Schneekanone: Mast mit Turbine, sprüht feinen Nebel. */
/** Gastro-Varianten aus dem 2D: Berghütte, Bergrestaurant, Panorama, Sterneküche. */
export function makeGastro(kind = 'restaurant') {
    const g = makeRestaurant();
    if (kind === 'huette') {                  // rustikale kleine Hütte
        g.scale.setScalar(0.8);
        const stack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), M.stone);
        stack.position.set(1.0, 2.3, 0); g.add(stack);
    } else if (kind === 'berg') {             // größeres Bergrestaurant mit Sonnenterrasse
        g.scale.set(1.3, 1.15, 1.3);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.8), M.wood);
        deck.position.set(0, 0.35, 2.1); g.add(deck);
        for (let i = 0; i < 4; i++) {
            const par = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 10),
                new THREE.MeshStandardMaterial({ color: [0xef4444, 0xf59e0b][i % 2], roughness: 0.75 }));
            par.position.set(-1.5 + i * 1.0, 1.25, 2.1); g.add(par);
            const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), M.metal);
            st.position.set(-1.5 + i * 1.0, 0.85, 2.1); g.add(st);
        }
    } else if (kind === 'panorama') {         // Glasfront mit Panoramafenstern
        g.scale.set(1.45, 1.3, 1.4);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.5, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x9fd8ea, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.6 }));
        glass.position.set(0, 1.3, 1.7); g.add(glass);
        for (let i = -2; i <= 2; i++) {
            const mull = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.13), M.metal);
            mull.position.set(i * 1.0, 1.3, 1.72); g.add(mull);
        }
        const tele = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 8), M.metal);
        tele.rotation.x = 0.5; tele.position.set(2.4, 1.1, 2.3); g.add(tele);
    } else if (kind === 'sterne') {           // Sterneküche: Gourmet-Tempel mit Gold & Kerzenlicht
        g.scale.set(1.35, 1.4, 1.3);
        const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.7 });
        const warmGlow = new THREE.MeshStandardMaterial({ color: 0xffe0a3, emissive: 0xffb347, emissiveIntensity: 1.1 });
        // Markise mit Fransen + Eingangssäulen
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.2), gold);
        canopy.position.set(0, 1.9, 1.85); canopy.castShadow = true; g.add(canopy);
        for (let i = 0; i < 9; i++) {
            const fr = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), gold);
            fr.rotation.x = Math.PI; fr.position.set(-1.2 + i * 0.3, 1.78, 2.42); g.add(fr);
        }
        for (const sx of [-1.2, 1.2]) {
            const t = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.3, 10), gold);
            t.position.set(sx, 0.95, 2.3); t.castShadow = true; g.add(t);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), warmGlow);
            lamp.position.set(sx, 1.72, 2.3); g.add(lamp);
        }
        // Michelin-Stern auf dem First, auf poliertem Sockel
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 12), gold);
        pedestal.position.set(0, 2.62, 0); g.add(pedestal);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), gold);
        star.position.set(0, 3.0, 0); star.castShadow = true; g.add(star);
        // Gedeckte Terrassentische mit Kerzen und weißen Decken
        for (const [tx, tz] of [[-1.3, 2.9], [0, 3.2], [1.3, 2.9]]) {
            const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 14),
                new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.85 }));
            cloth.position.set(tx, 0.55, tz); g.add(cloth);
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8),
                new THREE.MeshStandardMaterial({ color: 0xfff7e0 }));
            candle.position.set(tx, 0.88, tz); g.add(candle);
            const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), warmGlow);
            flame.position.set(tx, 1.0, tz); g.add(flame);
        }
        // Weinregal-Fenster (warm beleuchtet)
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.06), M.winGlow);
        win.position.set(0, 1.1, 1.72); g.add(win);
    }
    return g;
}
export function makeSnowCannon(size = 'medium') {
    const g = new THREE.Group();
    // Schnee-Lanze: hoher Turm statt Propeller (2D: snow_cannon_large)
    if (size === 'large') {
        const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 10), M.metal);
        mast2.position.y = 2.1; mast2.castShadow = true; g.add(mast2);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 10),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.35, metalness: 0.5 }));
        head.position.y = 4.4; g.add(head);
        for (let i = 0; i < 4; i++) {
            const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), M.metal);
            const a = i / 4 * Math.PI * 2;
            noz.position.set(Math.cos(a) * 0.2, 4.7, Math.sin(a) * 0.2); g.add(noz);
        }
        const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 12), M.stone);
        base2.position.y = 0.2; base2.receiveShadow = true; g.add(base2);
        return g;
    }
    const s = size === 'small' ? 0.72 : 1;
    g.scale.setScalar(s);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.4, 8), M.metal);
    mast.position.y = 0.7; mast.castShadow = true; g.add(mast);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4, metalness: 0.4 }));
    fan.rotation.z = Math.PI / 2; fan.position.set(0, 1.5, 0); fan.castShadow = true; g.add(fan);
    // Nebel-Partikel
    const N = 60;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i*3]=0; pos[i*3+1]=1.5; pos[i*3+2]=0; }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mist = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7 }));
    g.add(mist);
    g.userData.mist = mist;
    g.userData.update = (t) => {
        const p = mist.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
            let ph = ((i / p.count) + t * 0.4) % 1;
            p.setX(i, ph * 4);
            p.setY(i, 1.5 + Math.sin(i) * 0.3 - ph * 0.8);
            p.setZ(i, Math.cos(i * 1.3) * 0.4 * ph);
        }
        p.needsUpdate = true;
    };
    return g;
}

/** Funpark: Kicker (Schanze) + Rail. */
export function makeFunpark(size = 'medium') {
    const g = new THREE.Group();
    // Kleiner Park: nur Kicker + Rail; mittel: + Halfpipe/Box; groß: alles
    const lvl = size === 'small' ? 1 : size === 'large' ? 3 : 2;
    const snow = M.snow;
    const railMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.6 });
    const railMat2 = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4, metalness: 0.6 });
    // Großer + kleiner Kicker (Sprungschanzen)
    const kicker = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2.6), snow);
    kicker.rotation.x = -0.35; kicker.position.set(-1.2, 0.4, -1.5); kicker.castShadow = true; g.add(kicker);
    const kicker2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.7), snow);
    kicker2.rotation.x = -0.3; kicker2.position.set(1.4, 0.25, -2.2); kicker2.castShadow = true; g.add(kicker2);
    // Gerades Rail + geneigtes Down-Rail
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), railMat);
    rail.rotation.z = Math.PI / 2; rail.position.set(2.6, 0.45, 0.6); g.add(rail);
    for (const sx of [-1.3, 1.3]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45), M.metal); leg.position.set(2.6 + sx, 0.22, 0.6); g.add(leg); }
    const dRail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), railMat2);
    dRail.rotation.z = Math.PI / 2 + 0.22; dRail.position.set(-2.6, 0.55, 1.2); g.add(dRail);
    for (const [sx, h] of [[-1.2, 0.85], [1.2, 0.3]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h), M.metal); leg.position.set(-2.6 + sx, h / 2, 1.2); g.add(leg); }
    // Mini-Halfpipe (zwei geschwungene Schneewände) — ab mittlerer Größe
    if (lvl >= 2) for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 12, 1, true, 0, Math.PI / 2), snow);
        wall.rotation.z = Math.PI / 2; wall.rotation.x = side > 0 ? Math.PI : 0;
        wall.position.set(0.2, 0.45, 2.8 + side * 1.05); wall.castShadow = true; g.add(wall);
    }
    // Box-Feature (breites Slide-Element) — ab mittlerer Größe
    if (lvl >= 2) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.7), new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35 }));
        box.position.set(0.4, 0.32, -0.3); g.add(box);
    }
    // Bunte Slalom-/Parkfahnen als Rahmen
    const flagCols = [0xdc2626, 0x2563eb, 0xf59e0b, 0x22c55e];
    for (let i = 0; i < 6; i++) {
        const px = -3 + i * 1.25;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), M.metal);
        pole.position.set(px, 0.55, -3.1); g.add(pole);
        const fl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: flagCols[i % 4], roughness: 0.7 }));
        fl.position.set(px + 0.15, 0.9, -3.1); g.add(fl);
    }
    // Einfahrts-Bogen
    for (const sx of [-1.1, 1.1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), railMat); p.position.set(sx, 0.95, 3.9); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.22, 0.22), railMat);
    top.position.set(0, 1.95, 3.9); g.add(top);
    // Zweiter Park-Bereich: Big-Air-Schanze + Wallride + Tubes — nur großer Park
    if (lvl >= 3) {
        const bigAir = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 3.6), snow);
        bigAir.rotation.x = -0.42; bigAir.position.set(-4.6, 0.75, -0.6); bigAir.castShadow = true; g.add(bigAir);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 3.0), new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.6 }));
        wall.rotation.z = 0.22; wall.position.set(4.9, 0.9, -1.4); wall.castShadow = true; g.add(wall);
        for (let i = 0; i < 3; i++) {
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 10), new THREE.MeshStandardMaterial({ color: [0xef4444, 0x0ea5e9, 0xfacc15][i], roughness: 0.5 }));
            tube.rotation.z = Math.PI / 2; tube.position.set(-1.5 + i * 1.6, 0.28, 5.4); g.add(tube);
        }
    }
    g.scale.setScalar(lvl === 1 ? 0.8 : lvl === 3 ? 1.5 : 1.15);
    return g;
}

/** Krankenstation (2D: medical_station) — weißes Häuschen mit rotem Kreuz. */
export function makeMedicalStation() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
    const sock = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 2.2), M.stone);
    sock.position.y = 0.14; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 2.0), white);
    body.position.y = 0.28 + 0.75; body.castShadow = body.receiveShadow = true; g.add(body);
    const rp = makePrismRoof(3.0, 2.4, 0.6); rp.position.y = 1.78; g.add(rp);
    // Rotes Kreuz an der Fassade
    for (const [sx, sy, sz] of [[1.0, 0.16, 0.05], [0.16, 1.0, 0.05]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), red);
        bar.position.set(0, 1.25, 1.03); g.add(bar);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.06), M.woodDark);
    door.position.set(-0.7, 0.78, 1.02); g.add(door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), M.winGlow);
    win.position.set(0.8, 1.0, 1.02); g.add(win);
    return g;
}
/** Krankenhaus (2D: hospital) — großer Klinikbau mit Hubschrauber-Landeplatz. */
export function makeHospital() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.65 });
    const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
    const sock = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.4, 4.4), M.stone);
    sock.position.y = 0.2; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.4, 4.0), white);
    body.position.y = 0.4 + 1.7; body.castShadow = body.receiveShadow = true; g.add(body);
    addWindows(g, 5.6, 4.0, 3.4, 0.4);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.2, 4.3), M.metal);
    roof.position.y = 3.9; roof.castShadow = true; g.add(roof);
    // Helipad auf dem Dach
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 20),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }));
    pad.position.y = 4.04; g.add(pad);
    // Landeplatz-Höhe am Modell hinterlegen: der Rettungshelikopter parkt
    // exakt hier, ohne dass die Szene den Wert raten muss.
    g.userData.helipadY = 4.09;
    for (const [sx, sy] of [[0.9, 0.14], [0.14, 0.9]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sy), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
        m.position.y = 4.09; g.add(m);
    }
    // großes rotes Kreuz an der Front
    for (const [sx, sy] of [[1.4, 0.3], [0.3, 1.4]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.08), red);
        bar.position.set(-1.6, 2.6, 2.04); g.add(bar);
    }
    return g;
}
/** Werkstatt (2D: workshop) — Halle mit Werkzeugbank und Rolltor. */
export function makeWorkshop() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.3 });
    const sock = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.3, 3.0), M.stone);
    sock.position.y = 0.15; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.8, 2.8), steel);
    body.position.y = 0.3 + 0.9; body.castShadow = body.receiveShadow = true; g.add(body);
    // Tonnendach
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4.0, 16, 1, false, 0, Math.PI), M.metal);
    roof.rotation.z = Math.PI / 2; roof.position.y = 2.1; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.35 }));
    door.position.set(0, 1.0, 1.42); g.add(door);
    // Werkzeugtafel + Funkenflug-Lampe
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.06), M.woodDark);
    board.position.set(-1.3, 1.4, 1.43); g.add(board);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), M.winGlow);
    lamp.position.set(1.4, 1.7, 1.45); g.add(lamp);
    return g;
}
/** Wasserspeicher / Stausee (2D: stausee) — Becken mit Damm und Pumpenhaus. */
export function makeReservoir() {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 });
    // Damm-Ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.45, 10, 26), rock);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; ring.receiveShadow = true; g.add(ring);
    // Wasserfläche
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.35, 26),
        new THREE.MeshStandardMaterial({ color: 0x1d6fa5, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.9 }));
    water.position.y = 0.28; g.add(water);
    // Pumpenhaus + Rohr
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.0), M.wood);
    hut.position.set(3.2, 0.75, 0); hut.castShadow = true; g.add(hut);
    const rp = makePrismRoof(1.4, 1.2, 0.4); rp.position.set(3.2, 1.2, 0); g.add(rp);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 10), M.metal);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(4.5, 0.5, 0); g.add(pipe);
    return g;
}
/**
 * Großer Stausee: echte Staumauer mit Bogen, weite Wasserfläche, Krone mit
 * Geländer und Laternen, Überlauf und Pumpstation. Fasst ein Vielfaches
 * eines normalen Wasserspeichers.
 */
export function makeBigReservoir() {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.85 });
    const R = 7.2;
    // Uferwall rundherum (ohne die Seite, an der die Mauer steht)
    const bank = new THREE.Mesh(new THREE.TorusGeometry(R, 0.9, 10, 40, Math.PI * 1.45), rock);
    bank.rotation.x = Math.PI / 2; bank.rotation.z = -Math.PI * 0.72;
    bank.position.y = 0.55; bank.receiveShadow = true; g.add(bank);
    // Wasserfläche
    const water = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.35, R - 0.6, 0.7, 40),
        new THREE.MeshStandardMaterial({ color: 0x14608f, roughness: 0.1, metalness: 0.45, transparent: true, opacity: 0.92 }));
    water.position.y = 0.5; g.add(water);
    g.userData.water = water;   // für sanftes Wellen-Wippen
    // Staumauer: leicht gebogenes Betonband auf der Talseite
    const dam = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.5, R + 1.4, 2.6, 40, 1, true, -0.55, 1.1), concrete);
    dam.position.y = 1.3; dam.castShadow = dam.receiveShadow = true;
    dam.material.side = THREE.DoubleSide; g.add(dam);
    // Mauerkrone als begehbarer Steg
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.0, R + 1.0, 0.25, 40, 1, true, -0.55, 1.1), concrete);
    crown.position.y = 2.62; crown.material.side = THREE.DoubleSide; g.add(crown);
    // Geländer + Laternen auf der Krone
    const rail = new THREE.MeshStandardMaterial({ color: 0x3f4652, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i <= 9; i++) {
        const a = -0.55 + (i / 9) * 1.1;
        const px = Math.sin(a) * (R + 1.05), pz = Math.cos(a) * (R + 1.05);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), rail);
        post.position.set(px, 3.05, pz); g.add(post);
        if (i % 3 === 0) {
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
                new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffd98a, emissiveIntensity: 1.1 }));
            lamp.position.set(px, 3.5, pz); g.add(lamp);
        }
    }
    // Überlaufrinne mitten in der Mauer
    const spill = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.2), concrete);
    spill.position.set(0, 2.5, R + 1.0); g.add(spill);
    // Pumpstation am Fuß der Mauer + Druckrohre den Hang hinunter
    const house = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.8), M.stone);
    house.position.set(0, 0.75, R + 3.6); house.castShadow = true; g.add(house);
    const hr = makePrismRoof(2.6, 2.2, 0.7); hr.position.set(0, 1.5, R + 3.6); g.add(hr);
    for (const ox of [-0.55, 0.55]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.0, 12), M.metal);
        pipe.rotation.x = Math.PI / 2.6; pipe.position.set(ox, 1.5, R + 2.2);
        pipe.castShadow = true; g.add(pipe);
    }
    return g;
}

/** Après-Ski-Bar (2D: apres_ski_bar) — Holzbar mit Terrasse, Lichterkette, Musik. */
export function makeApresSkiBar() {
    const g = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 2.6), M.stone);
    sock.position.y = 0.15; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 2.4), M.woodDark);
    body.position.y = 0.3 + 0.75; body.castShadow = body.receiveShadow = true; g.add(body);
    const rp = makePrismRoof(3.7, 2.9, 0.6); rp.position.y = 1.8; g.add(rp);
    // Terrasse mit Stehtischen
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.6), M.wood);
    deck.position.set(0, 0.3, 2.0); g.add(deck);
    for (const tx of [-1.0, 0.2, 1.3]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), M.metal);
        leg.position.set(tx, 0.7, 2.0); g.add(leg);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), M.wood);
        top.position.set(tx, 1.05, 2.0); g.add(top);
    }
    // Lichterkette über der Terrasse
    const bulbCols = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2];
    for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8),
            new THREE.MeshStandardMaterial({ color: bulbCols[i % 4], emissive: bulbCols[i % 4], emissiveIntensity: 0.9 }));
        b.position.set(-1.6 + i * 0.4, 2.05 - Math.sin(i / 8 * Math.PI) * 0.18, 2.7); g.add(b);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.07),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, emissiveIntensity: 0.6, roughness: 0.5 }));
    sign.position.set(0, 1.5, 1.24); g.add(sign);
    return g;
}
/** Partyzelt (2D: partyzelt) — gestreiftes Zelt mit Girlanden. */
export function makePartyTent() {
    // ===== FESTZELT ALS ECHTE GASTRO =====
    // Rechteckiges Bierzelt mit offener Front: Holzterrasse, Bierbänke,
    // Bar-Theke mit Zapfanlage und Fässern, Lichterketten und Leuchtschild —
    // keine leere Zirkuskuppel mehr.
    const g = new THREE.Group();
    const W = 5.2, D = 4.2, H = 2.1;
    const canvasA = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85, side: THREE.DoubleSide });
    const canvasB = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.85, side: THREE.DoubleSide });
    // Holzterrasse als Boden, ragt vorn heraus
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.18, D + 2.2), M.wood);
    deck.position.set(0, 0.09, 0.7); deck.receiveShadow = true; g.add(deck);
    // Rückwand + Seitenwände (Front bleibt offen)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), canvasA);
    back.position.set(0, 0.18 + H / 2, -D / 2); g.add(back);
    for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), (sx < 0 ? canvasB : canvasA));
        side.position.set(sx * W / 2, 0.18 + H / 2, 0);
        side.rotation.y = Math.PI / 2; g.add(side);
    }
    // Firstzelt-Dach: zwei geneigte Bahnen, rot-weiß gestreift. Die Streifen
    // liegen zunächst FLACH (Normale nach oben) und werden dann um die
    // First-Achse gekippt — so zeigt die Plane sicher nach außen/oben und das
    // Dach steht nicht mehr auf dem Kopf.
    const roofH = 1.1;
    const slopeLen = Math.hypot(roofH, D / 2) * 1.02;
    const tilt = Math.atan2(roofH, D / 2);
    for (const sx of [-1, 1]) {
        for (let st = 0; st < 4; st++) {
            const geo2 = new THREE.PlaneGeometry(W / 4, slopeLen);
            geo2.rotateX(-Math.PI / 2);                  // flach legen, Normale +Y
            const strip = new THREE.Mesh(geo2, st % 2 ? canvasB : canvasA);
            // um die X-Achse zur Traufe kippen: +z-Seite kippt nach +, -z nach -
            strip.rotation.x = sx * tilt;
            strip.position.set(-W / 2 + (st + 0.5) * (W / 4),
                               0.18 + H + roofH / 2,
                               sx * D / 4);
            strip.castShadow = true; g.add(strip);
        }
    }
    // Firstbalken deckt die Stoßkante ab
    const ridge2 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.09, 0.14), M.woodDark);
    ridge2.position.set(0, 0.18 + H + roofH, 0); g.add(ridge2);
    // Eckmasten mit kleinen Fahnen
    for (const [mx, mz] of [[-W/2, -D/2], [W/2, -D/2], [-W/2, D/2], [W/2, D/2]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, H + 0.3, 8), M.metal);
        pole.position.set(mx, 0.18 + (H + 0.3) / 2, mz); g.add(pole);
        const flag = makeFlagCloth(0.46, 0.28, { color: 0xfbbf24, seg: 12 });
        flag.position.set(mx, 0.18 + H + 0.4, mz); g.add(flag);
    }
    // ===== BAR-THEKE mit Zapfanlage an der Rückwand =====
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.55, 0.5), M.woodDark);
    bar.position.set(0, 0.18 + 0.28, -D / 2 + 0.75); g.add(bar);
    const barTop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.66, 0.06, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.4 }));
    barTop.position.set(0, 0.18 + 0.58, -D / 2 + 0.75); g.add(barTop);
    for (const tx of [-0.5, 0, 0.5]) {           // Zapfhähne
        const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), M.metal);
        tap.position.set(tx, 0.18 + 0.75, -D / 2 + 0.75); g.add(tap);
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
            new THREE.MeshStandardMaterial({ color: [0xdc2626, 0x1d4ed8, 0x16a34a][(tx + 0.5) * 2 | 0], roughness: 0.5 }));
        handle.position.set(tx, 0.18 + 0.92, -D / 2 + 0.75); g.add(handle);
    }
    // Bierfässer neben der Bar
    for (const [bx, bz] of [[-W * 0.38, -D / 2 + 0.6], [-W * 0.38, -D / 2 + 1.15], [W * 0.38, -D / 2 + 0.7]]) {
        const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 10),
            new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.6 }));
        keg.position.set(bx, 0.18 + 0.25, bz); g.add(keg);
    }
    // ===== BIERBÄNKE: drei Garnituren unter dem Dach und auf der Terrasse =====
    const mkGarnitur = (x, z, rot) => {
        const set2 = new THREE.Group();
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.55), M.wood);
        table.position.y = 0.55; set2.add(table);
        for (const lx of [-0.65, 0.65]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.5), M.woodDark);
            leg.position.set(lx, 0.28, 0); set2.add(leg);
        }
        for (const bz of [-0.55, 0.55]) {
            const bench = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.26), M.wood);
            bench.position.set(0, 0.34, bz); set2.add(bench);
        }
        set2.position.set(x, 0.18, z); set2.rotation.y = rot;
        g.add(set2);
    };
    mkGarnitur(-1.3, 0.1, 0.12);
    mkGarnitur(1.3, 0.2, -0.08);
    mkGarnitur(0, 1.9, Math.PI / 2 + 0.1);       // auf der Terrasse
    // ===== LICHTERKETTEN über der Front und quer =====
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd76a, emissiveIntensity: 1.4 });
    for (let i = 0; i < 9; i++) {
        const fx = -W / 2 + (i / 8) * W;
        const sag = Math.sin((i / 8) * Math.PI) * 0.22;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), bulbMat);
        bulb.position.set(fx, 0.18 + H + 0.05 - sag, D / 2 + 0.02); g.add(bulb);
        const bulb2 = bulb.clone(); bulb2.position.z = 1.6; bulb2.position.y -= 0.12; g.add(bulb2);
    }
    // Leuchtschild über dem Eingang
    const signTex = makeLabelTexture('FESTZELT', '#fff3c4', '#7c2d12');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5),
        new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffb84d, emissiveMap: signTex,
            emissiveIntensity: 0.9, transparent: true, side: THREE.DoubleSide }));
    sign.position.set(0, 0.18 + H + roofH * 0.45, D / 2 + 0.08); g.add(sign);
    return g;
}
/** Diskothek (2D: diskothek) — dunkler Club mit Leuchtschriftzug und Spots. */
export function makeDisco() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e1b3a, roughness: 0.5, metalness: 0.25 });
    const sock = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 3.4), M.stone);
    sock.position.y = 0.15; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 3.2), dark);
    body.position.y = 0.3 + 1.1; body.castShadow = body.receiveShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.16, 3.5), M.metal);
    roof.position.y = 2.5; g.add(roof);
    // Neon-Streifen
    for (const [y, col] of [[1.9, 0xec4899], [1.55, 0x8b5cf6], [1.2, 0x22d3ee]]) {
        const n = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.05),
            new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.1 }));
        n.position.set(0, y, 1.63); g.add(n);
    }
    // Discokugel über dem Eingang
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.05, metalness: 1.0 }));
    ball.position.set(0, 2.9, 1.9); g.add(ball);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), M.metal);
    rope.position.set(0, 3.3, 1.9); g.add(rope);
    return g;
}
/** Sauna-Anlage (2D: sauna) — Blockhaus mit Ofenrohr und Aufguss-Dampf. */
export function makeSauna() {
    const g = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.28, 2.4), M.stone);
    sock.position.y = 0.14; sock.receiveShadow = true; g.add(sock);
    // Echte Rundholz-Blockbauweise: gestapelte Stämme mit überstehenden Ecken
    const logMat = [M.wood, M.woodDark];
    for (let i = 0; i < 6; i++) {
        const y = 0.4 + i * 0.26;
        const mat = logMat[i % 2];
        if (i % 2 === 0) {                                  // Längsstämme (X-Richtung)
            for (const sz of [-1, 1]) {
                const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.1, 10), mat);
                log.rotation.z = Math.PI / 2;
                log.position.set(0, y, sz * 1.05); log.castShadow = true; g.add(log);
            }
        } else {                                            // Querstämme (Z-Richtung)
            for (const sx of [-1, 1]) {
                const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.5, 10), mat);
                log.rotation.x = Math.PI / 2;
                log.position.set(sx * 1.35, y, 0); log.castShadow = true; g.add(log);
            }
        }
    }
    // Innenwand, damit man nicht durch die Stämme sieht
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.6, 1.9),
        new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.95 }));
    inner.position.y = 1.2; g.add(inner);
    const rp = makePrismRoof(3.3, 2.6, 0.55); rp.position.y = 1.98; g.add(rp);
    // Holzschindeln auf dem Dach
    for (let r = 0; r < 4; r++) for (const sz of [-1, 1]) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.3), M.woodDark);
        sh.position.set(0, 2.06 + r * 0.11, sz * (1.15 - r * 0.28));
        sh.rotation.x = sz * 0.42; g.add(sh);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), M.metal);
    pipe.position.set(1.0, 2.4, 0); g.add(pipe);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.16, 8), M.metal);
    cap.position.set(1.0, 2.93, 0); g.add(cap);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.06), M.woodDark);
    door.position.set(0, 0.85, 1.13); g.add(door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.05), M.winGlow);
    win.position.set(0, 1.5, 1.13); g.add(win);
    // ===== Wellness-Details: Tauchbecken, Ruheliegen, Laternen, Birkenholz =====
    const plunge = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 16),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.3, emissive: 0x0e7490, emissiveIntensity: 0.55 }));
    plunge.position.set(-2.1, 0.35, 0.9); g.add(plunge);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.07, 8, 18), M.woodDark);
    rim.rotation.x = Math.PI / 2; rim.position.set(-2.1, 0.57, 0.9); g.add(rim);
    // zwei Ruheliegen mit Handtüchern
    for (const [lx, lz] of [[1.9, 1.0], [1.9, -0.2]]) {
        const bed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 1.5), M.wood);
        bed.position.set(lx, 0.35, lz); bed.rotation.x = -0.12; g.add(bed);
        for (const sx of [-0.2, 0.2]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), M.woodDark);
            leg.position.set(lx + sx, 0.17, lz); g.add(leg);
        }
        const towel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 }));
        towel.position.set(lx, 0.43, lz + 0.4); g.add(towel);
    }
    // Warme Laternen am Weg
    const warm = new THREE.MeshStandardMaterial({ color: 0xffe0a3, emissive: 0xffb347, emissiveIntensity: 1.0 });
    for (const [px, pz] of [[-1.5, 1.5], [1.5, 1.5]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 6), M.woodDark);
        post.position.set(px, 0.4, pz); g.add(post);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), warm);
        lamp.position.set(px, 0.92, pz); g.add(lamp);
    }
    // Gestapeltes Brennholz an der Seitenwand
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.7, 8), r % 2 ? M.wood : M.woodDark);
        log.rotation.z = Math.PI / 2;
        log.position.set(-1.75, 0.35 + r * 0.16, -0.55 + c * 0.16); g.add(log);
    }
    return g;
}
/** Große Therme (2D: therme) — Glaskuppel über beleuchtetem Becken. */
export function makeThermalBath() {
    const g = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.35, 5.0), M.stone);
    sock.position.y = 0.18; sock.receiveShadow = true; g.add(sock);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.2, 4.6),
        new THREE.MeshStandardMaterial({ color: 0xe6ebf2, roughness: 0.6 }));
    base.position.y = 0.35 + 0.6; base.castShadow = base.receiveShadow = true; g.add(base);
    // Innenbecken (leuchtet türkis)
    const pool = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 3.2),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.1, metalness: 0.3, emissive: 0x0891b2, emissiveIntensity: 0.6 }));
    pool.position.y = 1.6; g.add(pool);
    // Glaskuppel
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.0, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x9fd8ea, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    dome.scale.set(1, 0.75, 0.8); dome.position.y = 1.55; g.add(dome);
    for (let i = 0; i < 8; i++) {   // Kuppelstreben
        const a = i / 8 * Math.PI;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.05, 6, 20, Math.PI), M.metal);
        rib.rotation.y = a; rib.scale.set(1, 0.75, 0.8); rib.position.y = 1.55; g.add(rib);
    }
    // Außen-Whirlpool
    const spa = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.12, emissive: 0x0e7490, emissiveIntensity: 0.5 }));
    spa.position.set(4.0, 0.6, 1.6); g.add(spa);
    return g;
}
/** Eislaufbahn (2D: eislaufbahn) — Eisfläche mit Bande und Flutlicht. */
export function makeIceRink() {
    const g = new THREE.Group();
    const W = 11, D = 8;                                   // deutlich größere Bahn
    const ice = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, D),
        new THREE.MeshStandardMaterial({ color: 0xd7ecf7, roughness: 0.05, metalness: 0.3 }));
    ice.position.y = 0.1; ice.receiveShadow = true; g.add(ice);
    // Bande ringsum (mit Werbebande unten)
    const bandeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    const adMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
    for (const sz of [1, -1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.5, 0.18), bandeMat);
        b.position.set(0, 0.35, sz * (D / 2 + 0.05)); g.add(b);
        const ad = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.2, 0.05), adMat);
        ad.position.set(0, 0.25, sz * (D / 2 + 0.14)); g.add(ad);
    }
    for (const sx of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, D + 0.4), bandeMat);
        b.position.set(sx * (W / 2 + 0.05), 0.35, 0); g.add(b);
    }
    // Spielfeldmarkierungen: Mittelkreis, Mittellinie, zwei Zonenkreise
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });
    const circ = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.04, 6, 30), lineMat);
    circ.rotation.x = Math.PI / 2; circ.position.y = 0.18; g.add(circ);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, D - 0.4), lineMat);
    mid.position.y = 0.18; g.add(mid);
    for (const sx of [-3.4, 3.4]) {
        const c2 = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 6, 22),
            new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
        c2.rotation.x = Math.PI / 2; c2.position.set(sx, 0.18, 0); g.add(c2);
    }
    // Flutlichtmasten an allen Ecken
    for (const [px, pz] of [[-W / 2 - 0.5, -D / 2 - 0.5], [W / 2 + 0.5, -D / 2 - 0.5],
                            [-W / 2 - 0.5, D / 2 + 0.5], [W / 2 + 0.5, D / 2 + 0.5]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8), M.metal);
        pole.position.set(px, 1.7, pz); pole.castShadow = true; g.add(pole);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.28), M.winGlow);
        lamp.position.set(px, 3.45, pz); g.add(lamp);
    }
    // Kleines Verleihhäuschen für Schlittschuhe
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.4), M.wood);
    hut.position.set(-W / 2 - 1.6, 0.6, D / 2 - 1.0); hut.castShadow = true; g.add(hut);
    const hutRoof = makePrismRoof(2.1, 1.7, 0.5);
    hutRoof.position.set(-W / 2 - 1.6, 1.2, D / 2 - 1.0); g.add(hutRoof);
    // Bänke zum Anschnallen
    for (let i = 0; i < 3; i++) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.4), M.woodDark);
        bench.position.set(-2 + i * 2.2, 0.45, D / 2 + 1.1); g.add(bench);
        for (const lx of [-0.6, 0.6]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), M.woodDark);
            leg.position.set(-2 + i * 2.2 + lx, 0.2, D / 2 + 1.1); g.add(leg);
        }
    }
    return g;
}
/** Toilettenhäuschen (2D: toilettenhauschen) — kleines Servicegebäude mit WC-Schildern. */
export function makeToilet() {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
    const sock = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 1.5), M.stone);
    sock.position.y = 0.12; sock.receiveShadow = true; g.add(sock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.3), wallMat);
    body.position.y = 0.24 + 0.75; body.castShadow = body.receiveShadow = true; g.add(body);
    const rp = makePrismRoof(2.1, 1.6, 0.45); rp.position.y = 1.74; g.add(rp);
    // Zwei Türen mit WC-Schildern (Damen/Herren)
    for (const [dx, col] of [[-0.44, 0xdc2626], [0.44, 0x2563eb]]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.06), M.woodDark);
        door.position.set(dx, 0.24 + 0.55, 0.68); g.add(door);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.04), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
        sign.position.set(dx, 1.28, 0.72); g.add(sign);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), M.metal);
        knob.position.set(dx + (dx < 0 ? 0.22 : -0.22), 0.24 + 0.55, 0.73); g.add(knob);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), M.winGlow);
    lamp.position.set(0, 1.45, 0.72); g.add(lamp);
    return g;
}

// ============================================================
// POIs & DEKO
// ============================================================
/** Gipfelkreuz: Holzkreuz mit Schnee-Auflage auf Felssockel. */
export function makeSummitCross(scale = 1) {
    const g = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), M.stone);
    sock.scale.set(1, 0.5, 1); sock.position.y = 0.2; sock.castShadow = true; g.add(sock);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), M.woodDark);
    post.position.y = 1.4; post.castShadow = true; g.add(post);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.16), M.woodDark);
    cross.position.y = 2.05; cross.castShadow = true; g.add(cross);
    // Schnee auf dem Querbalken
    const snow = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.07, 0.18), M.snow);
    snow.position.y = 2.15; g.add(snow);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), M.snow);
    cap.position.y = 2.5; g.add(cap);
    g.scale.setScalar(scale);
    return g;
}

/** Panoramabank (am See/Aussichtspunkt). */
export function makeBench() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.35), M.wood);
    seat.position.y = 0.35; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.06), M.wood);
    back.position.set(0, 0.55, -0.15); g.add(back);
    for (const sx of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.32), M.woodDark);
        leg.position.set(sx, 0.17, 0); g.add(leg);
    }
    return g;
}

/** Info-Schild/Wegweiser mit Pfeiltafeln. */
export function makeSignpost() {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6), M.woodDark);
    post.position.y = 0.8; post.castShadow = true; g.add(post);
    const colors = [0x2563eb, 0xdc2626, 0x111827];
    colors.forEach((c, i) => {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
        board.position.set(0.28, 1.4 - i * 0.22, 0); g.add(board);
    });
    return g;
}

// Text-Schild als Billboard (Canvas-Textur) — für Gipfelnamen.
export function makeTextSprite(text, sub = '') {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const ctx = cv.getContext('2d');
    // Holz-Schild-Hintergrund
    ctx.fillStyle = 'rgba(30,41,59,0.78)';
    ctx.strokeStyle = 'rgba(200,215,235,0.55)';
    ctx.lineWidth = 3;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(6, 6, 244, 84, 12); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(6, 6, 244, 84); ctx.strokeRect(6, 6, 244, 84); }
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, sub ? 40 : 48);
    if (sub) { ctx.fillStyle = '#fcd34d'; ctx.font = '22px Segoe UI, sans-serif'; ctx.fillText(sub, 128, 68); }
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, opacity: 0.82 }));
    spr.scale.set(2.6, 1.0, 1); // dezenter
    return spr;
}

// Findet die N höchsten, räumlich getrennten Gipfel.
export function findTopPeaks(heightmap, gridSize, n = 3, minSep = null) {
    minSep = minSep || gridSize * 0.16;
    const cand = [];
    for (let y = 3; y < gridSize - 3; y += 2) {
        for (let x = 3; x < gridSize - 3; x += 2) {
            cand.push({ x, y, h: heightmap[y * gridSize + x] });
        }
    }
    cand.sort((a, b) => b.h - a.h);
    const peaks = [];
    for (const c of cand) {
        if (peaks.length >= n) break;
        if (peaks.every(p => Math.hypot(p.x - c.x, p.y - c.y) >= minSep)) peaks.push(c);
    }
    return peaks;
}

/* ===================== WETTKAMPF- & PARK-ANLAGEN ===================== */
// Alle drei werden in EINER Richtung durchfahren: die Fahrtrichtung ist die
// lokale +Z-Achse. Der Richtungspfeil in der Bauvorschau zeigt genau dorthin.

/**
 * Halfpipe als ECHTE U-Rinne: der Querschnitt ist ein durchgehendes U-Profil
 * (Viertelkreis - flacher Boden - Viertelkreis), das ueber die volle Laenge
 * extrudiert wird. Fahrtrichtung ist +Z, oben am -Z-Ende steht der Dropin.
 */
export function makeHalfpipe() {
    const g = new THREE.Group();
    const L = 22, R = 3.4, FLAT = 2.6, THICK = 0.45, DECK = 1.5;

    // --- Querschnitt zeichnen: innen befahrbar, aussen Wandstaerke ---
    const sh = new THREE.Shape();
    const xi = FLAT / 2, xo = FLAT / 2 + R;          // Boden- und Deckkante
    sh.moveTo(-xo - DECK, R);                        // linkes Deck aussen
    sh.lineTo(-xo, R);                               // Deckkante links
    sh.absarc(-xi, R, R, Math.PI, Math.PI * 1.5, false);   // Viertelbogen nach unten
    sh.lineTo(xi, 0);                                // flacher Boden
    sh.absarc(xi, R, R, Math.PI * 1.5, Math.PI * 2, false); // Viertelbogen hoch
    sh.lineTo(xo + DECK, R);                         // rechtes Deck
    sh.lineTo(xo + DECK, R - THICK);                 // aussen zurueck
    sh.lineTo(xo, R - THICK);
    sh.absarc(xi, R, R - THICK, Math.PI * 2, Math.PI * 1.5, true);
    sh.lineTo(-xi, -THICK + 0.0001);
    sh.absarc(-xi, R, R - THICK, Math.PI * 1.5, Math.PI, true);
    sh.lineTo(-xo - DECK, R - THICK);
    sh.closePath();

    const geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 16 });
    geo.translate(0, 0, -L / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xe9f2ff, roughness: 0.5, side: THREE.DoubleSide });
    const pipe = new THREE.Mesh(geo, pipeMat);
    pipe.castShadow = pipe.receiveShadow = true;
    g.add(pipe);

    // Blaue Fuehrungslinien auf beiden Deckkanten
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2b8fe6, roughness: 0.45 });
    for (const sx of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, L), lineMat);
        l.position.set(sx * (xo + 0.1), R + 0.02, 0); g.add(l);
    }
    // Mittellinie im Boden
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, L), lineMat);
    mid.position.set(0, 0.02, 0); g.add(mid);

    // --- Dropin-Turm am oberen Ende (-Z) ---
    const legMat = M.metal;
    for (const lx of [-(xo + DECK), xo + DECK]) for (const lz of [-L / 2 - 0.5, -L / 2 - 2.1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, R + 1.7, 6), legMat);
        leg.position.set(lx, (R + 1.7) / 2, lz); leg.castShadow = true; g.add(leg);
    }
    const plat = new THREE.Mesh(new THREE.BoxGeometry((xo + DECK) * 2, 0.22, 2.0), M.wood);
    plat.position.set(0, R + 1.7, -L / 2 - 1.3); plat.castShadow = true; g.add(plat);
    // Gelaender auf der Plattform
    for (const lx of [-(xo + DECK) + 0.15, xo + DECK - 0.15]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), legMat);
        post.position.set(lx, R + 2.2, -L / 2 - 1.3); g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry((xo + DECK) * 2, 0.07, 0.07), legMat);
    rail.position.set(0, R + 2.7, -L / 2 - 1.3); g.add(rail);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry((xo + DECK) * 2 + 0.4, 0.12, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 }));
    canopy.position.set(0, R + 3.5, -L / 2 - 1.3); g.add(canopy);
    for (const lx of [-(xo + DECK) + 0.2, xo + DECK - 0.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), legMat);
        post.position.set(lx, R + 2.6, -L / 2 - 1.3); g.add(post);
    }
    // Treppe hinauf
    for (let i = 0; i < 7; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.34), M.wood);
        step.position.set(xo + DECK + 0.7, 0.35 + i * (R + 1.4) / 7, -L / 2 - 1.3 + i * 0.3);
        g.add(step);
    }

    // --- Flutlicht an den Laengsseiten ---
    for (const sx of [-1, 1]) for (const lz of [-L * 0.26, L * 0.26]) {
        const mast = makeFloodlight(6);
        mast.position.set(sx * (xo + DECK + 2.2), 0, lz);
        mast.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(mast);
    }
    // --- Bandenzaun aussen ---
    const bandBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7, side: THREE.DoubleSide });
    const bandRed  = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) {
        const z = -L / 2 + (i + 0.5) * (L / 8);
        const pnl = new THREE.Mesh(new THREE.PlaneGeometry(L / 8 - 0.15, 0.9), i % 2 ? bandRed : bandBlue);
        pnl.position.set(sx * (xo + DECK + 3.2), 0.45, z);
        pnl.rotation.y = Math.PI / 2; g.add(pnl);
    }
    return g;
}

/**
 * Kleiner Kicker: Anlauf, Absprungtisch und Landehang — alles aus sauberen
 * Grundkoerpern statt handgestrickter Geometrie, damit keine Flaeche fehlt.
 * Fahrtrichtung ist +Z: man faehrt von -Z an und springt ueber die Kante.
 */
export function makeKicker() {
    const g = new THREE.Group();
    const groomed = new THREE.MeshStandardMaterial({ color: 0xdfeafa, roughness: 0.62 });
    const snow = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, roughness: 0.85 });
    const W = 2.8, H = 1.45;

    // 1) Anlauframpe: flacher Keil, der nach +Z ansteigt (gekippte Platte)
    const rampLen = 4.2;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(W, 0.26, rampLen), groomed);
    const slope = Math.atan2(H, rampLen);
    ramp.rotation.x = -slope;
    ramp.position.set(0, H / 2, -0.4);
    ramp.castShadow = ramp.receiveShadow = true; g.add(ramp);

    // 2) Schneekoerper unter der Rampe, damit sie nicht schwebt
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, rampLen * 0.92), snow);
    body.position.set(0, H / 2 - 0.12, -0.5);
    body.receiveShadow = true; g.add(body);
    // seitliche Boeschungen
    for (const sx of [-1, 1]) {
        const flank = new THREE.Mesh(new THREE.BoxGeometry(0.5, H * 0.8, rampLen * 0.9), snow);
        flank.position.set(sx * (W / 2 + 0.2), H * 0.36, -0.5);
        flank.rotation.z = sx * 0.28; g.add(flank);
    }

    // 3) Absprungtisch: kurzes waagerechtes Stueck an der Kante
    const table = new THREE.Mesh(new THREE.BoxGeometry(W, 0.28, 1.0), groomed);
    table.position.set(0, H + 0.02, rampLen / 2 - 0.3);
    table.castShadow = true; g.add(table);

    // 4) Landehang: faellt hinter der Kante wieder ab
    const landLen = 4.6;
    const land = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.24, landLen), groomed);
    land.rotation.x = 0.34;
    land.position.set(0, H * 0.52, rampLen / 2 + landLen / 2 - 0.4);
    land.receiveShadow = true; g.add(land);
    const landBody = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, H * 0.9, landLen * 0.8), snow);
    landBody.position.set(0, H * 0.2, rampLen / 2 + landLen * 0.38);
    landBody.rotation.x = 0.34; g.add(landBody);

    // 5) Schneewulst als Fuss, damit der Kicker im Gelaende sitzt
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(W * 1.1, W * 1.7, 0.3, 16), snow);
    skirt.position.set(0, 0.1, 0.6); skirt.receiveShadow = true; g.add(skirt);

    // 6) Zwei Markierungsfahnen an der Einfahrt
    const flagMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7, side: THREE.DoubleSide });
    for (const fx of [-W / 2 - 0.55, W / 2 + 0.55]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), M.metal);
        pole.position.set(fx, 0.95, -rampLen / 2 - 0.3); g.add(pole);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.36, 8),
            new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 }));
        base.position.set(fx, 0.18, -rampLen / 2 - 0.3); g.add(base);
        const flag = makeFlagCloth(0.76, 0.48, { color: flagMat.color?.getHex?.() ?? 0xf97316 });
        flag.position.set(fx, 1.66, -rampLen / 2 - 0.3); g.add(flag);
    }
    // Holzschild seitlich
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), M.wood);
    sign.position.set(-W / 2 - 1.0, 0.55, -0.6); sign.rotation.y = 0.35; g.add(sign);
    return g;
}
export function makeRaceCourse() {
    const g = new THREE.Group();
    const L = 30, W = 9;
    const piste = new THREE.MeshStandardMaterial({ color: 0xeef5ff, roughness: 0.6 });
    const lane = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, L), piste);
    lane.position.y = 0.09; lane.receiveShadow = true; g.add(lane);
    // Blaue Ideallinie, leicht geschwungen
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2b8fe6, roughness: 0.5 });
    for (let i = 0; i < 24; i++) {
        const t = i / 23, z = -L/2 + t * L;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, L / 24), lineMat);
        seg.position.set(Math.sin(t * Math.PI * 2.2) * W * 0.28, 0.2, z); g.add(seg);
    }
    // Torstangen abwechselnd rot/blau, versetzt zur Linie
    const poleR = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
    const poleB = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
    for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9, z = -L/2 + t * L;
        const cx = Math.sin(t * Math.PI * 2.2) * W * 0.28;
        const mat = i % 2 ? poleB : poleR;
        for (const ox of [-0.9, 0.9]) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), mat);
            pole.position.set(cx + ox, 0.75, z); pole.castShadow = true; g.add(pole);
        }
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.55), mat);
        cloth.position.set(cx, 1.1, z); g.add(cloth);
    }
    // Start- und Zielbogen (+Z = Fahrtrichtung: Start bei -Z, Ziel bei +Z)
    const arch = (z, label) => {
        const a = new THREE.Group();
        const col = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
        for (const ox of [-W/2 - 0.3, W/2 + 0.3]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.0, 0.55), col);
            leg.position.set(ox, 1.5, 0); leg.castShadow = true; a.add(leg);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.9, 0.6), col);
        beam.position.y = 3.3; beam.castShadow = true; a.add(beam);
        const tex = makeLabelTexture(label, '#ffffff', '#dc2626');
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, 0.72),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        plate.position.set(0, 3.3, 0.32); a.add(plate);
        a.position.z = z; return a;
    };
    g.add(arch(-L/2 - 0.5, 'START'));
    g.add(arch(L/2 + 0.5, 'ZIEL'));
    // Anzeigetafel am Ziel (ohne Tribüne — die Strecke bleibt schlank)
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.9, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.5, emissive: 0x0a1a2e, emissiveIntensity: 0.5 }));
    board.position.set(-W / 2 - 3.2, 2.4, L / 2 + 0.5); board.castShadow = true; g.add(board);
    for (const bx of [-1.2, 1.2]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), M.metal);
        leg.position.set(-W / 2 - 3.2 + bx, 1.3, L / 2 + 0.5); g.add(leg);
    }
    const timeTex = makeLabelTexture('1:22.48', '#fbbf24', '#0b1220');
    const timePlate = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.85),
        new THREE.MeshBasicMaterial({ map: timeTex, transparent: true }));
    timePlate.position.set(-W / 2 - 3.2, 2.7, L / 2 + 0.64); g.add(timePlate);
    // Fangnetze links und rechts
    const net = new THREE.MeshStandardMaterial({ color: 0xf05252, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) {
        const z = -L/2 + (i + 0.5) * (L / 10);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(L / 10 - 0.1, 1.2), net);
        p.position.set(sx * (W/2 + 1.2), 0.6, z); p.rotation.y = Math.PI / 2; g.add(p);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), M.metal);
        post.position.set(sx * (W/2 + 1.2), 0.65, z - L / 20); g.add(post);
    }
    // Flutlicht an beiden Seiten
    for (const sx of [-1, 1]) for (const lz of [-L * 0.3, L * 0.3]) {
        const mast = makeFloodlight(6.5);
        mast.position.set(sx * (W/2 + 2.6), 0, lz);
        mast.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(mast);
    }
    return g;
}

/**
 * GROSSE EINSEILUMLAUFBAHN ("3S-Klasse"): das Prestigeobjekt des Skigebiets.
 * Kuppelbare 10er-Kabinen an einem dicken Förderseil, das über hohe
 * Fachwerk-Stützen mit Rollenbatterien läuft. Beide Stationen sind große
 * Hallen mit Glasfront, Umlenkscheibe, Vordach und Leuchtschriftzug.
 */
export function makeMegaGondola(a, b, groundYs = null, opts = {}) {
    const group = new THREE.Group();
    const d3 = new THREE.Vector3().subVectors(b, a);
    const nd = d3.clone().normalize();
    const perp = new THREE.Vector3(-nd.z, 0, nd.x);
    const yaw = Math.atan2(nd.x, nd.z);
    const CLEAR = 8.4;                       // schwebt deutlich über dem Wald
    const N = 48;

    // ---- Seilverlauf: Stationen + Stützenköpfe ----
    // ===== SEILANSTIEG ERST HINTER DER HALLE =====
    // Vorher war die Anlaufstrecke ein ANTEIL der Bahnlänge (8 %). Bei einer
    // kurzen Bahn sind 8 % nur wenige Meter — das Seil stieg also schon
    // INNERHALB der Station steil an, und die daran hängenden Kabinen
    // schoben sich durch das Hallendach. Ab 300 m fiel es nicht auf, darunter
    // immer. Jetzt zählt eine feste Strecke in Metern, und der Anstieg
    // beginnt erst, wenn die Kabine die Halle verlassen hat.
    const HALL_D = 8.4, HALL_W = 7.4;               // Grundriss der Stationshalle
    const CLEAR_START = HALL_D / 2 + 2.6;           // bis hierhin bleibt das Seil flach
    const CLEAR_RAMP = 16;                          // danach über 16 m auf volle Höhe
    const lenTotal = Math.max(1, d3.length());
    const pts = [];
    for (let i = 0; i <= N; i++) {
        const f = i / N;
        const base = a.clone().lerp(b, f);
        const gy = groundYs ? groundYs[Math.min(groundYs.length - 1, Math.round(f * (groundYs.length - 1)))] : base.y;
        // Abstand zur nächstgelegenen Station IN METERN
        const dStat = Math.min(f, 1 - f) * lenTotal;
        const u = Math.max(0, Math.min(1, (dStat - CLEAR_START) / CLEAR_RAMP));
        const stationBlend = u * u * (3 - 2 * u);
        pts.push(new THREE.Vector3(base.x, gy + 3.4 + CLEAR * stationBlend, base.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);

    // ---- Fachwerk-Stützen mit Rollenbatterie ----
    const nMasts = Math.max(2, Math.round(d3.length() / 13));
    const megaBeacons = [];
    const mastF = [];                        // Stützen-Positionen 0..1 für den Mastschlag
    for (let m = 1; m <= nMasts; m++) {
        const f = m / (nMasts + 1);
        mastF.push(f);
        const top = curve.getPoint(f);
        const gy = groundYs ? groundYs[Math.min(groundYs.length - 1, Math.round(f * (groundYs.length - 1)))] : 0;
        const h = Math.max(2, top.y - gy);
        // Vier Eckrohre + Diagonalen = echtes Gittermast-Bild
        for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, h, 6), M.metal);
            const wo = perp.clone().multiplyScalar(ox).add(nd.clone().multiplyScalar(oz));
            leg.position.set(top.x + wo.x, gy + h / 2, top.z + wo.z);
            leg.castShadow = true; group.add(leg);
        }
        for (let lv = 1; lv * 2.2 < h; lv++) {
            const ring = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.11, 1.25), M.metal);
            ring.position.set(top.x, gy + lv * 2.2, top.z); ring.rotation.y = yaw; group.add(ring);
            // Andreaskreuze zwischen den Etagen
            for (const side of [0, 1]) {
                const axis = side ? nd : perp;
                for (const sgn of [1, -1]) {
                    const ctr = axis.clone().multiplyScalar(0.5 * sgn);
                    const dl = Math.hypot(1.0, 2.2);
                    for (const dsg of [1, -1]) {
                        const dg = new THREE.Mesh(new THREE.BoxGeometry(dl, 0.08, 0.08), M.metal);
                        dg.position.set(top.x + ctr.x, gy + lv * 2.2 - 1.1, top.z + ctr.z);
                        dg.rotation.y = side ? yaw + Math.PI / 2 : yaw;
                        dg.rotation.z = dsg * Math.atan2(2.2, 1.0);
                        group.add(dg);
                    }
                }
            }
        }
        // Traverse mit Rollenbatterien je Fahrtrichtung
        const cross = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.26, 0.34), M.metal);
        cross.position.set(top.x, top.y + 0.25, top.z); cross.rotation.y = yaw; group.add(cross);
        if (m % 2 === 0) {
            const bc = makeBeacon(top.x, top.y + 0.62, top.z, (m * 0.29) % 1);
            group.add(bc.mesh); megaBeacons.push(bc);
        }
        for (const sgn of [-1, 1]) {
            const bat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 1.9), M.woodDark);
            const wo = perp.clone().multiplyScalar(sgn * 1.9);
            bat.position.set(top.x + wo.x, top.y + 0.02, top.z + wo.z); bat.rotation.y = yaw; group.add(bat);
            for (let r = 0; r < 5; r++) {
                const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.15, 10), M.metal);
                const zo = nd.clone().multiplyScalar(-0.72 + r * 0.36);
                roll.rotation.x = Math.PI / 2; roll.rotation.z = yaw;
                roll.position.set(top.x + wo.x + zo.x, top.y - 0.06, top.z + wo.z + zo.z);
                group.add(roll);
            }
        }
    }

    // ---- Zwei Förderseile (Berg-/Talfahrt getrennt) ----
    const GAUGE = 1.9;
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x232b36, roughness: 0.55, metalness: 0.6 });
    for (const sgn of [-1, 1]) {
        const off = perp.clone().multiplyScalar(GAUGE * sgn);
        const shifted = new THREE.CatmullRomCurve3(pts.map(p2 => p2.clone().add(off)));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(shifted, N, 0.11, 8, false), ropeMat));
    }

    // ---- Große Stationshallen ----
    const mkHall = (base, isTop) => {
        const hall = new THREE.Group();
        const W = HALL_W, D = HALL_D, H = 3.95;   // Untersicht 4.45 > Seil 3.4 + Gehänge
        const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.5, D + 1.6), M.stone);
        floor.position.y = 0.25; floor.receiveShadow = true; hall.add(floor);
        // Betonstützen + Glasfassade
        for (const ox of [-W / 2, W / 2]) for (const oz of [-D / 2, 0, D / 2]) {
            const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, 0.4), M.stone);
            col.position.set(ox, 0.5 + H / 2, oz); col.castShadow = true; hall.add(col);
        }
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb4cc, roughness: 0.15,
            metalness: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        for (const ox of [-W / 2 + 0.05, W / 2 - 0.05]) {
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, H * 0.82), glassMat);
            wall.position.set(ox, 0.5 + H * 0.5, 0); wall.rotation.y = Math.PI / 2; hall.add(wall);
        }
        // ===== BETONDACH MIT UMLAUFENDEM STAHLGELÄNDER =====
        // Höhe so gewählt, dass die Untersicht sicher über Seil (3.4),
        // Gehänge und Kabinenoberkante liegt — die Kabinen fahren unten
        // durch die Halle, nie mehr durch das Dach.
        {
            const RW2 = W + 2.0, RD = D + 2.4;
            const UND = 0.5 + H;                        // Untersicht des Daches
            const conc = new THREE.MeshStandardMaterial({ color: 0xc3cad2, roughness: 0.85, metalness: 0.05 });
            const slab = new THREE.Mesh(new THREE.BoxGeometry(RW2, 0.36, RD), conc);
            slab.position.y = UND + 0.18; slab.castShadow = true; slab.receiveShadow = true; hall.add(slab);
            // Unterzüge quer — gliedern die Untersicht
            for (let k = 0; k < 6; k++) {
                const ub = new THREE.Mesh(new THREE.BoxGeometry(RW2 * 0.96, 0.26, 0.34), conc);
                ub.position.set(0, UND - 0.13, -RD * 0.38 + k * (RD * 0.76 / 5)); hall.add(ub);
            }
            // Kragkonsolen an den Längsseiten
            for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
                const cons = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.24, 0.3), conc);
                cons.position.set(sx * (W / 2 + 0.5), UND - 0.42, -RD * 0.34 + k * (RD * 0.68 / 4));
                cons.rotation.z = sx * 0.24; hall.add(cons);
            }
            // Stahlgeländer auf der Attika: Handlauf, Knieholm, Pfosten
            const TOPY = UND + 0.36;
            const mkRun = (x0, z0, x1, z1) => {
                const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
                const ang = Math.atan2(dx, dz);
                for (const hy of [0.5, 0.98]) {
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, L, 8), M.metal);
                    bar.rotation.set(Math.PI / 2, ang, 0);
                    bar.position.set((x0 + x1) / 2, TOPY + hy, (z0 + z1) / 2); hall.add(bar);
                }
                const nP = Math.max(2, Math.round(L / 1.15));
                for (let k = 0; k <= nP; k++) {
                    const u = k / nP;
                    const po = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 1.0, 8), M.metal);
                    po.position.set(x0 + dx * u, TOPY + 0.5, z0 + dz * u); hall.add(po);
                }
            };
            mkRun(-RW2 / 2, -RD / 2,  RW2 / 2, -RD / 2);
            mkRun(-RW2 / 2,  RD / 2,  RW2 / 2,  RD / 2);
            mkRun(-RW2 / 2, -RD / 2, -RW2 / 2,  RD / 2);
            mkRun( RW2 / 2, -RD / 2,  RW2 / 2,  RD / 2);
            // Technik auf dem Dach: Lüfteraggregat und Kabelpritsche
            const tech = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.4),
                new THREE.MeshStandardMaterial({ color: 0x6b747f, roughness: 0.6, metalness: 0.4 }));
            tech.position.set(W * 0.22, TOPY + 0.35, isTop ? RD * 0.24 : -RD * 0.24); hall.add(tech);
            for (let k = 0; k < 4; k++) {
                const gr = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.04, 0.05), M.metal);
                gr.position.set(W * 0.22, TOPY + 0.18 + k * 0.12, isTop ? RD * 0.24 - 0.7 : -RD * 0.24 + 0.7);
                hall.add(gr);
            }
            const tray = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, RD * 0.7), M.metal);
            tray.position.set(-W * 0.3, TOPY + 0.16, 0); hall.add(tray);
            // Schnee auf der Attika
            const cap = new THREE.Mesh(new THREE.BoxGeometry(RW2 * 0.98, 0.09, RD * 0.98), M.snow);
            cap.position.y = TOPY + 0.05; hall.add(cap);
        }
        // Neon-Werbebanner an der Hallenflanke
        if (opts.neonAd) {
            const nb = makeNeonBanner(opts.neonAd.text, {
                color: opts.neonAd.color, color2: opts.neonAd.color2,
                width: Math.min(6.4, D * 0.78), height: 1.2 });
            nb.position.set(-(W / 2 + 1.25), 0.5 + H * 0.6, 0);
            nb.rotation.y = -Math.PI / 2;
            hall.add(nb);
            if (nb.userData.update) megaNeon.push(nb.userData.update);
        }
        // Fahnenmasten an den vier Hallenecken
        hall.userData.flagPoles = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const fp = makeFlagPole(2.8, { country: _levelCountry, w: 1.15, h: 0.72 });
            fp.position.set(sx * (W / 2 + 0.7), 0.5 + H * 0.62, sz * (D / 2 - 0.3));
            hall.add(fp); hall.userData.flagPoles.push(fp);
        }
        // Große Umlenkscheibe im Inneren
        const sheave = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.42, 28), M.metal);
        sheave.position.set(0, 3.4, isTop ? -D * 0.22 : D * 0.22);
        hall.add(sheave);
        hall.userData.sheave = sheave;
        // Antriebsmotor daneben
        const motor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 2.0),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 }));
        motor.position.set(W * 0.28, 0.5 + 0.6, isTop ? D * 0.2 : -D * 0.2); hall.add(motor);
        // Perron mit Geländer und Drehkreuzen
        for (const sx of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, D * 0.7), M.metal);
            rail.position.set(sx * W * 0.3, 1.5, isTop ? D * 0.15 : -D * 0.15); hall.add(rail);
        }
        for (let g2 = 0; g2 < 3; g2++) {
            const gate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), M.metal);
            gate.position.set(-1.4 + g2 * 1.4, 1.0, (isTop ? 1 : -1) * (D / 2 - 0.7)); hall.add(gate);
        }
        // Leuchtschriftzug über dem Eingang
        // ebenfalls ohne Beschriftung
        hall.position.copy(base); hall.rotation.y = yaw;
        group.add(hall);
        return hall;
    };
    const megaNeon = [];
    const hallA = mkHall(a, false);
    const hallB = mkHall(b, true);

    // ---- Kuppelbare 10er-Kabinen ----
    const cabinColor = opts.cabinColor ?? 0xc81e3c;
    const bodyMat = new THREE.MeshStandardMaterial({ color: cabinColor, roughness: 0.42, metalness: 0.42, envMapIntensity: 0.55 });
    const nCab = Math.max(4, Math.round(d3.length() / 11));
    const carriers = [];
    for (let i = 0; i < nCab; i++) {
        const cg = new THREE.Group();
        // Kuppelklemme + Laufwerk auf dem Seil
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.85), M.metal);
        clamp.position.y = 0.04; cg.add(clamp);
        for (const wz of [-0.3, 0.3]) {
            const rollw = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.13, 10), M.woodDark);
            rollw.rotation.x = Math.PI / 2; rollw.position.set(0, 0.16, wz); cg.add(rollw);
        }
        const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.92), M.metal);
        hang.position.y = -0.50; cg.add(hang);
        // Kabinenkörper: großes abgerundetes Volumen
        // ===== 10er-KABINE ALS TONNE =====
        // Ein stehender, leicht bauchiger Rundkörper — die Silhouette einer
        // Tonne. Kein Kasten, keine flachen Wände.
        const CW = 2.70, CH = 1.70, CD = 2.70, cabY = -1.90;
        const RR = CW * 0.5;
        // Bauch: oben und unten etwas enger als in der Mitte
        const bodyG = new THREE.CylinderGeometry(RR * 0.90, RR * 0.90, CH, 22, 3, false);
        {   // Ausbauchung: mittlere Ringe nach außen drücken
            const pa = bodyG.attributes.position, arr = pa.array;
            for (let k = 0; k < arr.length; k += 3) {
                const yy = arr[k + 1] / (CH * 0.5);                 // -1 .. 1
                const bulge = 1 + (1 - yy * yy) * 0.13;             // in der Mitte dicker
                arr[k] *= bulge; arr[k + 2] *= bulge;
            }
            pa.needsUpdate = true; bodyG.computeVertexNormals();
        }
        const cab = new THREE.Mesh(bodyG, bodyMat);
        cab.position.y = cabY; cab.castShadow = true; cg.add(cab);
        // AUSSENRADIUS der ausgebauchten Wand. Alle Anbauten (Fenster,
        // Reifen, Streben) müssen sich daran orientieren — sonst
        // verschwinden sie im Kabinenkörper.
        const RW = RR * 0.90 * 1.13;
        // Fassreifen — das kennzeichnende Merkmal einer Tonne
        for (const ry of [-CH * 0.32, -CH * 0.06, CH * 0.20, CH * 0.38]) {
            const hoop = new THREE.Mesh(new THREE.TorusGeometry(RW * 1.01, 0.033, 6, 26), M.metal);
            hoop.rotation.x = Math.PI / 2;
            hoop.position.y = cabY + ry; cg.add(hoop);
        }
        // ===== RUNDE BULLAUGEN MIT QUERSTREBEN =====
        // Kein Fensterband, sondern einzelne kreisrunde Scheiben rings um die
        // Tonne — jede mit einem waagerechten und einem senkrechten Steg.
        const glass = new THREE.MeshStandardMaterial({ color: 0x9aa9b8, roughness: 0.14,
            metalness: 0.30, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        glass.userData.isWindow = true;
        {
            const nWin = 8;                       // Bullaugen rings um die Tonne
            const wr = RR * 0.30;                 // Radius eines Fensters
            const winY2 = cabY + CH * 0.06;
            const frameMat = new THREE.MeshStandardMaterial({
                color: 0x9aa4af, roughness: 0.45, metalness: 0.5 });
            for (let k = 0; k < nWin; k++) {
                const ang = (k / nWin) * Math.PI * 2 + Math.PI / nWin;
                // Die Scheibe ist keine flache Platte, sondern eine leicht
                // nach außen gewölbte Kalotte — sonst verschwände sie in der
                // gebauchten Tonnenwand. Der Rand liegt genau auf der Wand,
                // die Kuppe steht rund 0.11 davor.
                const TH = 0.5;                       // halber Öffnungswinkel
                const SR = wr / Math.sin(TH);         // Kugelradius der Kalotte
                const pane = new THREE.Mesh(
                    new THREE.SphereGeometry(SR, 16, 10, 0, Math.PI * 2, 0, TH), glass);
                const ctrR = (RW + 0.01) - SR * Math.cos(TH);
                pane.position.set(Math.sin(ang) * ctrR, winY2, Math.cos(ang) * ctrR);
                pane.rotation.y = ang; pane.rotateX(Math.PI / 2); cg.add(pane);
                // Rahmenring
                const ring = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.026, 6, 18), frameMat);
                ring.position.set(Math.sin(ang) * (RW + 0.03), winY2, Math.cos(ang) * (RW + 0.03));
                ring.rotation.y = ang; cg.add(ring);
                // Querstreben: ein Steg waagerecht, einer senkrecht
                for (const rot of [0, Math.PI / 2]) {
                    const bar = new THREE.Mesh(new THREE.BoxGeometry(wr * 1.95, 0.022, 0.022), frameMat);
                    bar.position.set(Math.sin(ang) * (RW + 0.035), winY2, Math.cos(ang) * (RW + 0.035));
                    bar.rotation.y = ang; bar.rotation.z = rot;
                    cg.add(bar);
                }
            }
        }
        // ===== DECKEL, BODEN UND AUFBAUTEN =====
        // Die Tonne bekommt Profil: abgesetzter Deckelrand, Sockelring,
        // senkrechte Streben zwischen den Bullaugen, Dachluke mit Bügel und
        // eine umlaufende Zierleiste unterhalb der Fenster.
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(RR * 0.99, RR * 0.90, 0.12, 24), bodyMat);
        lid.position.y = cabY + CH / 2 + 0.05; lid.castShadow = true; cg.add(lid);
        const lidRim = new THREE.Mesh(new THREE.TorusGeometry(RW * 0.99, 0.038, 6, 26), M.metal);
        lidRim.rotation.x = Math.PI / 2;
        lidRim.position.y = cabY + CH / 2 + 0.01; cg.add(lidRim);
        const base2 = new THREE.Mesh(new THREE.CylinderGeometry(RR * 0.90, RR * 0.82, 0.14, 24), bodyMat);
        base2.position.y = cabY - CH / 2 - 0.06; cg.add(base2);
        const baseRim = new THREE.Mesh(new THREE.TorusGeometry(RR * 0.90, 0.036, 6, 26), M.metal);
        baseRim.rotation.x = Math.PI / 2;
        baseRim.position.y = cabY - CH / 2 - 0.01; cg.add(baseRim);
        // Senkrechte Streben zwischen den Fenstern
        {
            const strutMat = new THREE.MeshStandardMaterial({ color: 0x9aa4af, roughness: 0.45, metalness: 0.5 });
            const nS = 8;
            for (let k = 0; k < nS; k++) {
                const ang = (k / nS) * Math.PI * 2;   // genau zwischen den Bullaugen
                const st2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, CH * 0.62, 0.05), strutMat);
                st2.position.set(Math.sin(ang) * (RW + 0.02), cabY + CH * 0.04, Math.cos(ang) * (RW + 0.02));
                st2.rotation.y = ang; cg.add(st2);
            }
        }
        // Zierleiste unterhalb der Fenster
        const trim = new THREE.Mesh(new THREE.TorusGeometry(RW * 1.005, 0.028, 6, 26),
            new THREE.MeshStandardMaterial({ color: 0xeceff3, roughness: 0.4, metalness: 0.3 }));
        trim.rotation.x = Math.PI / 2;
        trim.position.y = cabY - CH * 0.24; cg.add(trim);
        // Dachluke mit Haltebügel
        const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14), M.metal);
        hatch.position.y = cabY + CH / 2 + 0.13; cg.add(hatch);
        const hoopTop = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.022, 6, 16), M.metal);
        hoopTop.rotation.x = Math.PI / 2;
        hoopTop.position.y = cabY + CH / 2 + 0.19; cg.add(hoopTop);
        // Türfuge mit Griffleiste
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, CH * 0.74, 0.02), M.metal);
        seam.position.set(0, cabY, RW + 0.02); cg.add(seam);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), M.metal);
        handle.position.set(0.14, cabY - CH * 0.08, RW + 0.04); cg.add(handle);

        // Kabinennummer
        const numTex = makeLabelTexture(String(i + 1), '#0f172a', '#f8fafc');
        const num = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22),
            new THREE.MeshBasicMaterial({ map: numTex, transparent: true }));
        num.position.set(0, cabY + CH * 0.36, CD / 2 + 0.02); cg.add(num);
        cg.rotation.y = yaw;
        cg.userData.seatInfo = {
            // RING statt Raster: in einer runden Kabine stehen die Gäste im
            // Kreis. Der Radius bleibt sicher innerhalb der Tonnenwand.
            seats: 10, ring: RR * 0.58,
            y: cabY - CH / 2 + 0.03, spread: CW * 0.18,
            rows: 2, rowGap: CD * 0.22, scale: Math.min(1, (CH * 0.82) / 1.55)
        };
        group.add(cg);
        carriers.push({ mesh: cg, phase: i / nCab, up: i % 2 === 0,
            seed: (i * 0.6180339887) % 1, riders: null, along: 0,
            info: cg.userData.seatInfo, slots: [] });
    }

    let _lt = 0;
    // ===== FAHRPROFIL EINER KUPPELBAREN UMLAUFBAHN =====
    // In der Station werden die Kabinen vom Seil abgekuppelt und laufen im
    // Reifenförderer LANGSAM durch — draußen auf der Strecke volle Fahrt.
    // Deshalb wird der gleichförmige Umlaufparameter so verzerrt, dass die
    // Geschwindigkeit an beiden Enden auf ca. 35 % abfällt. Nebeneffekt:
    // die Kabinen rücken vor der Station auf, genau wie im Original.
    const SLOW = 0.35;
    const stationWarp = (u) => {
        const sm = u * u * (3 - 2 * u);       // Ableitung 0 an den Rändern
        return SLOW * u + (1 - SLOW) * sm;    // Mischung -> Ableitung SLOW an den Rändern
    };
    const update = (t) => {
        const dtF = Math.max(0.0001, Math.min(0.1, t - _lt)); _lt = t;
        for (const nu of megaNeon) nu(t);
        hallA.userData.sheave.rotation.y = t * 0.5;
        hallB.userData.sheave.rotation.y = -t * 0.5;
        for (const c of carriers) {
            const p = stationWarp((c.phase + t * 0.016) % 1);
            const along = c.up ? p : 1 - p;
            const side = c.up ? -GAUGE : GAUGE;
            const pos = curve.getPoint(along).add(perp.clone().multiplyScalar(side));
            // ===== PENDELN AN DER KLEMME =====
            // Große Kabinen schwingen beim Überfahren der Stützen und in
            // Böen leicht nach. Anregung kommt aus der Steigungsänderung.
            const slope = (pos.y - (c._lastY ?? pos.y)) / Math.max(0.0001, dtF);
            c._lastY = pos.y;
            c._swV = (c._swV ?? 0) + ((c._lastSlope ?? 0) - slope) * 0.006;
            c._lastSlope = slope;
            // MASTSCHLAG: beim Überrollen der Rollenbatterie bekommt die
            // Kabine einen kurzen Stoß — das ist im Original deutlich zu sehen.
            {
                const prevA = c._lastAlong ?? along;
                c._lastAlong = along;
                for (const mf of mastF) {
                    if ((prevA - mf) * (along - mf) <= 0 && prevA !== along) {
                        c._swV += (along > prevA ? 1 : -1) * 0.16;
                        break;
                    }
                }
            }
            c._sw = (c._sw ?? 0);
            const OM = 1.6;
            c._swV += -c._sw * OM * OM * dtF;
            c._swV *= Math.pow(0.5, dtF);
            c._sw += c._swV * dtF;
            c._sw = Math.max(-0.15, Math.min(0.15, c._sw));
            c.mesh.position.copy(pos);
            c.mesh.rotation.x = c._sw;
            // Bö: die Tonne legt sich quer und pendelt sichtbar nach
            if (_windGust > 0.01) {
                c.mesh.rotation.z = windCross(yaw) * 0.28
                    + Math.sin(t * 4.9 + c.seed * 17) * _windGust * 0.06;
            } else if (c.mesh.rotation.z !== 0) {
                c.mesh.rotation.z *= 0.92;
                if (Math.abs(c.mesh.rotation.z) < 0.001) c.mesh.rotation.z = 0;
            }
            c.along = along;
        }
    };
    attachNightLights(group, { beacons: megaBeacons });
    group.userData.update = update;
    return {
        group, update, setOccupancy: () => {}, carriers,
        seatPos: (carrier, slot, out) => {
            const inf = carrier.info;
            if (inf.ring) {
                // Runde Kabine: Plätze auf einem Kreis, einer in der Mitte
                const n = Math.max(1, inf.seats - 1);
                if (slot === 0) out.set(0, inf.y, 0);
                else {
                    const a2 = ((slot - 1) / n) * Math.PI * 2;
                    out.set(Math.sin(a2) * inf.ring, inf.y, Math.cos(a2) * inf.ring);
                }
            } else {
                const rows = inf.rows || 1;
                const perRow = Math.ceil(inf.seats / rows);
                const row = Math.floor(slot / perRow), col = slot % perRow;
                out.set((col - (perRow - 1) / 2) * inf.spread, inf.y,
                        rows > 1 ? (row - (rows - 1) / 2) * (inf.rowGap || 0.3) : 0);
            }
            carrier.mesh.localToWorld(out);
            return out;
        }
    };
}

/**
 * ORTSCHAFT (rein dekorativ, kein Spielgebäude).
 *
 * Erzeugt ein kleines Dorf als Ausgangspunkt des Skigebiets: Kirche mit Turm,
 * eine Handvoll Wohnhäuser um einen Platz, ein paar Nebengebäude und ein
 * Ortsschild am Ortseingang. Der Baustil richtet sich nach dem Level, damit
 * Schwarzwald, Dolomiten und Hokkaidō erkennbar verschieden aussehen.
 *
 * `opts.style`  Baustil-Schlüssel (siehe VILLAGE_STYLES)
 * `opts.name`   Ortsname fürs Schild
 * `opts.size`   1..3 — Anzahl der Häuser skaliert damit
 */
const VILLAGE_STYLES = {
    // wall, roof, trim, tower: 'spitz' | 'zwiebel' | 'flach' | 'pagode'
    alpin:      { wall: 0xe8e2d6, roof: 0x8a4a3a, trim: 0x6b4a30, tower: 'zwiebel', steep: 0.85 },
    schwarzwald:{ wall: 0xefe9dc, roof: 0x6d5545, trim: 0x4a382a, tower: 'spitz',   steep: 1.0  },
    dolomiten:  { wall: 0xf0e6d2, roof: 0x9c5a3c, trim: 0x7a5230, tower: 'spitz',   steep: 0.7  },
    nordisch:   { wall: 0xa8433a, roof: 0x37404a, trim: 0x2e3640, tower: 'spitz',   steep: 0.95 },
    nordamerika:{ wall: 0x7d6247, roof: 0x4a5158, trim: 0x3a2f24, tower: 'spitz',   steep: 0.8  },
    anden:      { wall: 0xdcd2c0, roof: 0x8f6b4a, trim: 0x6a4f38, tower: 'flach',   steep: 0.45 },
    japan:      { wall: 0x2f3238, roof: 0x54595f, trim: 0x8a6a48, tower: 'pagode',  steep: 0.55 }
};

export function makeVillage(opts = {}) {
    const S = VILLAGE_STYLES[opts.style] || VILLAGE_STYLES.alpin;
    // Seed macht jeden Ort einzigartig: Hausanzahl, Radien, Drehwinkel und
    // Dachtöne streuen — sonst sähen alle Orte eines Levels gleich aus.
    let vs = ((opts.seed ?? 0) * 2654435761 + 12345) >>> 0;
    const vr = () => { vs = (vs * 1664525 + 1013904223) >>> 0; return vs / 4294967296; };
    const vjit = vr();

    // ===== ORTSGRÖSSE =====
    // Bisher gab es nur drei feste Stufen und dieselbe Ringanordnung — alle
    // Orte sahen dadurch trotz Seed fast gleich aus. Jetzt ist die Größe eine
    // stetige Zahl (0.55 bis 3.4) und der GRUNDRISS wechselt: Weiler,
    // Straßendorf oder Platzdorf. Das unterscheidet die Orte auf den ersten
    // Blick weit stärker als ein paar Häuser mehr.
    const sizeReq = opts.size != null ? opts.size : 2;
    const size = Math.max(0.55, Math.min(3.4, sizeReq * (0.72 + vr() * 0.62)));
    // Grundriss: kleine Orte sind fast immer Weiler oder Straßendörfer,
    // große fast immer Platzdörfer.
    const layoutRoll = vr();
    const layout = size < 1.1 ? (layoutRoll < 0.6 ? 'weiler' : 'strasse')
                 : size < 2.1 ? (layoutRoll < 0.45 ? 'strasse' : layoutRoll < 0.8 ? 'platz' : 'weiler')
                 : (layoutRoll < 0.75 ? 'platz' : 'strasse');
    const g = new THREE.Group();

    const wallMat = new THREE.MeshStandardMaterial({ color: S.wall, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: S.roof, roughness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({ color: S.trim, roughness: 0.9 });
    const winMat = new THREE.MeshStandardMaterial({
        color: 0xffe6a8, emissive: 0xffca6a, emissiveIntensity: 0.75, roughness: 0.4 });

    /** Satteldach aus zwei geneigten Platten + Firstbalken. */
    const gable = (parent, w, d, y, pitch) => {
        const rw = w * 0.62;
        for (const sx of [-1, 1]) {
            const r = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.12, d + 0.35), roofMat);
            r.position.set(sx * w * 0.21, y + rw * 0.5 * Math.sin(pitch) * 0.5, 0);
            r.rotation.z = -sx * pitch; r.castShadow = true; parent.add(r);
        }
        const snow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.07, d + 0.2), M.snow);
        snow.position.y = y + rw * 0.5 * Math.sin(pitch) * 0.62; parent.add(snow);
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, d + 0.35), trimMat);
        ridge.position.y = y + rw * 0.5 * Math.sin(pitch); parent.add(ridge);
        return y + rw * 0.5 * Math.sin(pitch);
    };

    /** Wohnhaus mit beleuchteten Fenstern. */
    const house = (x, z, rot, w, d, h) => {
        const hs = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), M.stone);
        base.position.y = 0.1; hs.add(base);
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        body.position.y = 0.2 + h / 2; body.castShadow = true; hs.add(body);
        // Fenster ringsum
        for (const [fx, fz, ry] of [[w / 2 + 0.01, 0, Math.PI / 2], [-w / 2 - 0.01, 0, Math.PI / 2],
                                    [0, d / 2 + 0.01, 0], [0, -d / 2 - 0.01, 0]]) {
            for (const off of [-0.28, 0.28]) {
                const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.36), winMat);
                if (ry) win.position.set(fx, 0.2 + h * 0.58, off);
                else win.position.set(off, 0.2 + h * 0.58, fz);
                win.rotation.y = ry; hs.add(win);
            }
        }
        // Balkon zur Talseite (typisch alpin)
        if (S.tower !== 'pagode') {
            const bal = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.06, 0.4), trimMat);
            bal.position.set(0, 0.2 + h * 0.42, d / 2 + 0.2); hs.add(bal);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.22, 0.05), trimMat);
            rail.position.set(0, 0.2 + h * 0.42 + 0.14, d / 2 + 0.38); hs.add(rail);
        }
        gable(hs, w, d, 0.2 + h, 0.5 * S.steep + 0.15);
        // Kamin mit Rauchfahne
        const chim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), M.stone);
        chim.position.set(w * 0.28, 0.2 + h + 0.3, -d * 0.2); hs.add(chim);
        hs.position.set(x, 0, z); hs.rotation.y = rot;
        g.add(hs);
        return hs;
    };

    // ===== KIRCHE ODER KAPELLE =====
    // Ein Weiler hat keine Pfarrkirche — dort steht höchstens eine Kapelle.
    const hasChurch = size >= 1.15;
    const chapelOnly = !hasChurch;
    const chScale = Math.min(1.25, 0.72 + size * 0.18);
    const ch = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 4.2), wallMat);
    nave.position.y = 1.1; nave.castShadow = true; ch.add(nave);
    gable(ch, 2.4, 4.2, 2.2, 0.55 * S.steep + 0.2);
    // Rundbogenfenster
    for (const sx of [-1, 1]) for (const oz of [-1.2, 0, 1.2]) {
        const w2 = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.7), winMat);
        w2.position.set(sx * 1.21, 1.3, oz); w2.rotation.y = Math.PI / 2; ch.add(w2);
    }
    // Turm
    const towerH = 4.6;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.25, towerH, 1.25), wallMat);
    tower.position.set(0, towerH / 2, 2.6); tower.castShadow = true; ch.add(tower);
    // Zifferblatt
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16),
        new THREE.MeshStandardMaterial({ color: 0xf6f2e6, emissive: 0xd9cfae, emissiveIntensity: 0.4 }));
    clock.position.set(0, towerH - 0.9, 3.24); ch.add(clock);
    // Turmhelm je Baustil
    if (S.tower === 'zwiebel') {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 12), roofMat);
        bulb.scale.set(1, 1.25, 1); bulb.position.set(0, towerH + 0.55, 2.6); ch.add(bulb);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.5, 10), roofMat);
        neck.position.set(0, towerH + 1.3, 2.6); ch.add(neck);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 10), roofMat);
        cone.position.set(0, towerH + 1.85, 2.6); ch.add(cone);
    } else if (S.tower === 'pagode') {
        for (let k = 0; k < 3; k++) {
            const eave = new THREE.Mesh(new THREE.ConeGeometry(1.15 - k * 0.22, 0.4, 4), roofMat);
            eave.rotation.y = Math.PI / 4;
            eave.position.set(0, towerH - 0.4 + k * 0.75, 2.6); ch.add(eave);
        }
    } else if (S.tower === 'flach') {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.5), roofMat);
        cap.position.set(0, towerH + 0.11, 2.6); ch.add(cap);
    } else {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 4), roofMat);
        spire.rotation.y = Math.PI / 4; spire.position.set(0, towerH + 1.2, 2.6); ch.add(spire);
    }
    // Kreuz bzw. Spitze
    if (S.tower !== 'pagode') {
        const top = S.tower === 'zwiebel' ? towerH + 2.3 : S.tower === 'flach' ? towerH + 0.9 : towerH + 2.5;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), M.metal);
        post.position.set(0, top, 2.6); ch.add(post);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), M.metal);
        arm.position.set(0, top + 0.12, 2.6); ch.add(arm);
    }
    ch.position.set(0, 0, 0);
    if (chapelOnly) {
        // Kapelle: nur Schiff und Dachreiter, kein Turm und keine Uhr
        ch.scale.setScalar(0.42);
        for (const c2 of ch.children) {
            const py = c2.position?.y ?? 0;
            if (py > 3.0) c2.visible = false;              // Turmaufbauten weg
        }
    } else {
        ch.scale.setScalar(chScale);
    }
    g.add(ch);

    // ===== HÄUSER um einen kleinen Platz =====
    const nHouse = Math.max(3, Math.round(2 + size * 4.2 + vjit * 3));
    const baseA = vjit * Math.PI * 2;
    let extent = 8;                       // grösster Abstand vom Ortsmittelpunkt
    if (layout === 'strasse') {
        // ===== STRASSENDORF =====
        // Häuser stehen in zwei Reihen links und rechts einer Dorfstraße,
        // die Ortslänge wächst mit der Einwohnerzahl.
        const dirA = baseA;
        const ux = Math.cos(dirA), uz = Math.sin(dirA);
        const px = -uz, pz = ux;
        const spacing = 3.0 + vr() * 0.9;
        const rows = Math.ceil(nHouse / 2);
        const lenHalf = (rows - 1) * spacing / 2;
        for (let i = 0; i < nHouse; i++) {
            const k = Math.floor(i / 2), sideS = (i % 2) ? 1 : -1;
            const along = -lenHalf + k * spacing + (vr() - 0.5) * 0.8;
            const off = sideS * (3.0 + vr() * 1.1);
            const w = 1.4 + vr() * 0.9, d = 1.7 + vr() * 1.0, h = 1.4 + vr() * 1.1;
            house(ux * along + px * off, uz * along + pz * off,
                  -dirA + (sideS > 0 ? 0 : Math.PI) + (vr() - 0.5) * 0.25, w, d, h);
        }
        // Die Dorfstraße selbst als schmales Band
        const road = new THREE.Mesh(new THREE.BoxGeometry(lenHalf * 2 + 6, 0.1, 2.4),
            new THREE.MeshStandardMaterial({ color: 0xa9a293, roughness: 0.96 }));
        road.position.set(0, 0.05, 0); road.rotation.y = -dirA; g.add(road);
        extent = lenHalf + 6;
    } else if (layout === 'weiler') {
        // ===== WEILER =====
        // Eine Handvoll Höfe, locker und unregelmässig gestreut, ohne Platz.
        for (let i = 0; i < nHouse; i++) {
            const a = vr() * Math.PI * 2;
            const r = 3.2 + vr() * (3.5 + size * 1.6);
            const w = 1.6 + vr() * 1.1, d = 1.9 + vr() * 1.2, h = 1.3 + vr() * 0.9;
            house(Math.cos(a) * r, Math.sin(a) * r, vr() * Math.PI * 2, w, d, h);
            extent = Math.max(extent, r + 3);
        }
    } else {
        // ===== PLATZDORF =====
        // Häuser in ein bis zwei Ringen um den Dorfplatz.
        const ringR = 4.4 + size * 1.1;
        for (let i = 0; i < nHouse; i++) {
            const outer3 = i >= Math.ceil(nHouse * 0.62);
            const inRing = outer3 ? nHouse - Math.ceil(nHouse * 0.62) : Math.ceil(nHouse * 0.62);
            const idxIn = outer3 ? i - Math.ceil(nHouse * 0.62) : i;
            const a = (idxIn / Math.max(1, inRing)) * Math.PI * 2 + baseA
                    + (outer3 ? 0.4 : 0) + (vr() - 0.5) * 0.3;
            const r = (outer3 ? ringR + 3.6 : ringR) + vr() * 1.6;
            const w = 1.45 + vr() * 0.9, d = 1.7 + vr() * 1.0, h = 1.45 + vr() * 1.1;
            house(Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2 + (vr() - 0.5) * 0.4, w, d, h);
            extent = Math.max(extent, r + 3);
        }
    }
    // Nebengebäude: Anzahl wächst mit dem Ort (Weiler haben die meisten Scheunen)
    const nShed = Math.max(1, Math.round((layout === 'weiler' ? 1.6 : 1.0) * (0.6 + size)));
    for (let k = 0; k < nShed; k++) {
        const a = baseA + 1.1 + k * 1.9 + vr() * 0.7;
        const r = extent * (0.62 + vr() * 0.3);
        const shw = 1.7 + vr() * 1.3;
        const shed = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(shw, 1.5, shw * 0.8), trimMat);
        b.position.y = 0.75; b.castShadow = true; shed.add(b);
        gable(shed, shw, shw * 0.8, 1.5, 0.4);
        shed.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        shed.rotation.y = vr() * Math.PI; g.add(shed);
    }
    // Dorfplatz mit Brunnen — nur im Platzdorf, und dort passend gross
    if (layout === 'platz') {
        const pr2 = 2.4 + size * 0.55;
        const plaza = new THREE.Mesh(new THREE.CylinderGeometry(pr2, pr2, 0.12, 24),
            new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.95 }));
        plaza.position.set(0, 0.06, -3.4); g.add(plaza);
    }
    // Brunnen hat jeder Ort — im Weiler steht er einfach zwischen den Höfen
    {
        const well = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.55, 12), M.stone);
        well.position.set(0, 0.33, -3.4); g.add(well);
        const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.5, 6), roofMat);
        wellRoof.position.set(0, 1.35, -3.4); g.add(wellRoof);
        for (const sx of [-0.35, 0.35]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0), trimMat);
            p.position.set(sx, 0.85, -3.4); g.add(p);
        }
    }
    // Straßenlaternen: je grösser der Ort, desto mehr
    const nLamp = Math.max(2, Math.round(1.5 + size * 1.8));
    for (let i = 0; i < nLamp; i++) {
        const a = (i / nLamp) * Math.PI * 2 + 0.4;
        const lp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), M.metal);
        pole.position.y = 1.1; lp.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xfff0c4, emissive: 0xffd98a, emissiveIntensity: 1.2 }));
        lamp.position.y = 2.3; lp.add(lamp);
        const lr = layout === 'platz' ? 3.2 + size * 0.6 : extent * 0.55;
        lp.position.set(Math.cos(a) * lr, 0, Math.sin(a) * lr - (layout === 'platz' ? 3.4 : 0));
        g.add(lp);
    }

    // ===== ORTSSCHILD am Ortseingang =====
    const signG = new THREE.Group();
    for (const sx of [-1.05, 1.05]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 6), M.metal);
        post.position.set(sx, 1.0, 0); signG.add(post);
    }
    const boardTex = makeLabelTexture(opts.name || 'Bergdorf', '#12202e', '#f4f7fb');
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 0.07),
        new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.5 }));
    board.position.y = 1.65; signG.add(board);
    for (const sz of [0.042, -0.042]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.58),
            new THREE.MeshStandardMaterial({ map: boardTex, transparent: true,
                emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.25 }));
        face.position.set(0, 1.65, sz);
        if (sz < 0) face.rotation.y = Math.PI;
        signG.add(face);
    }
    const snowCap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.16), M.snow);
    snowCap.position.y = 2.03; signG.add(snowCap);
    const signZ = extent + 1.5;
    signG.position.set(0, 0, signZ);
    signG.scale.setScalar(0.8 + Math.min(0.45, size * 0.16));
    g.add(signG);

    g.userData.isVillage = true;
    g.userData.signPos = { x: 0, z: signZ };
    // Für den Aufrufer: tatsächliche Ausdehnung, Grundriss und Hausanzahl.
    // Ohne die Angabe würde ein grosser Ort über die eingeebnete und vom
    // Wald befreite Fläche hinausragen.
    g.userData.radius = extent;
    g.userData.layout = layout;
    g.userData.houses = nHouse;
    g.userData.size = size;
    return g;
}

/* ===================================================================
 *  DURCHFAHRTS-ANLAGEN ALS "DRESSING"
 *  ------------------------------------------------------------------
 *  Halfpipe, Kicker, Funpark und Rennstrecke sind KEINE aufgestellten
 *  Klötze mehr: die Form (Pipe-Mulde, Schanzentisch, Wellen) wird im
 *  Gelände modelliert (Scene3D: sculptRun). Hier entsteht nur die
 *  Ausstattung, die auf dem Schnee steht — Startbanner, Wimpelketten,
 *  Kantenmarker, Tore, Rails, Zielbogen. Jedes Element trägt
 *  userData.ground = true und wird in der Szene einzeln auf die Piste
 *  gesetzt (der Hang bleibt, wie er ist). +Z = Fahrtrichtung.
 * =================================================================== */
const RUN_POLE = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.4, metalness: 0.5 });
const RUN_RED = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.55 });
const RUN_BLUE = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 });
const RUN_ORANGE = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 });
const RUN_STEEL = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.3, metalness: 0.7 });
function groundEl(m, x, z, lift = 0) { m.position.set(x, lift, z); m.userData.ground = true; m.userData.lift = lift; return m; }
/** Schlanker Pfosten mit Farbkappe (Tor-/Markerstange) */
function runPole(h = 1.6, capMat = RUN_RED) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, h, 7), RUN_POLE);
    p.position.y = h / 2; p.castShadow = true; g.add(p);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h * 0.32, 7), capMat);
    cap.position.y = h - h * 0.16; g.add(cap);
    return g;
}
/** Banner zwischen zwei Pfosten (Text als Textur), z. B. START / ZIEL / HALFPIPE */
function runBanner(text, w = 5.2, h = 0.9, poleH = 3.0, bg = 0x0f172a, fg = 0xffffff) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, poleH, 8), RUN_POLE);
        p.position.set(sx * w / 2, poleH / 2, 0); p.castShadow = true; g.add(p);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8), M.concrete);
        foot.position.set(sx * w / 2, 0.06, 0); g.add(foot);
    }
    const tex = makeLabelTexture(text, fg, bg);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, h), mat);
    cloth.position.y = poleH - h / 2 - 0.08; cloth.castShadow = true; g.add(cloth);
    // Querrohr oben
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, w, 6), RUN_POLE);
    bar.rotation.z = Math.PI / 2; bar.position.y = poleH; g.add(bar);
    return g;
}
/** Wimpelkette: kleine Dreiecke abwechselnd farbig, zwischen zwei Punkten */
function pennantLine(len, n = 12, colors = [RUN_RED, RUN_BLUE, RUN_ORANGE]) {
    const g = new THREE.Group();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), RUN_POLE);
    line.rotation.x = Math.PI / 2; line.position.set(0, 0, 0); g.add(line);
    const tri = new THREE.Shape(); tri.moveTo(-0.14, 0); tri.lineTo(0.14, 0); tri.lineTo(0, -0.3); tri.closePath();
    const tg = new THREE.ShapeGeometry(tri);
    for (let i = 0; i < n; i++) {
        const f = new THREE.Mesh(tg, colors[i % colors.length]);
        f.material.side = THREE.DoubleSide;
        f.position.set(0, -0.02, -len / 2 + (i + 0.5) * len / n);
        f.rotation.y = Math.PI / 2;
        g.add(f);
    }
    return g;
}
/** Wimpelkette samt zwei Pfosten, auf Bodenhöhe gestellt */
function pennantRun(x, z0, z1, h = 1.9) {
    const g = new THREE.Group();
    const len = z1 - z0;
    const a = runPole(h, RUN_BLUE), b = runPole(h, RUN_BLUE);
    groundEl(a, x, z0); groundEl(b, x, z1);
    const line = pennantLine(len, Math.max(4, Math.round(len / 1.2)));
    groundEl(line, x, (z0 + z1) / 2, h - 0.05);
    g.add(a, b, line);
    return g;
}
/** Rail/Box: Stahlrohr auf zwei Stützen */
function runRail(len = 3.2) {
    const g = new THREE.Group();
    for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), RUN_STEEL);
        leg.position.set(0, 0.27, sz * (len / 2 - 0.2)); g.add(leg);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), RUN_STEEL);
    bar.rotation.x = Math.PI / 2; bar.position.y = 0.58; bar.castShadow = true; g.add(bar);
    return g;
}
/** Kleine Tribüne (Rennstrecke) */
function runStand() {
    const g = new THREE.Group();
    for (let r = 0; r < 3; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 0.7), M.woodDark);
        step.position.set(0, 0.18 + r * 0.35, r * 0.7); step.castShadow = true; g.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 2.6), RUN_BLUE);
    roof.position.set(0, 2.4, 0.7); g.add(roof);
    for (const sx of [-1, 1]) for (const sz of [0, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), RUN_POLE);
        p.position.set(sx * 2.1, 1.2, -0.3 + sz * 2.0); g.add(p);
    }
    return g;
}
/** Stadion-Strahler: Mast mit Scheinwerferbatterie (4 Lampen), nachts an */
function runFlood(h = 5.2) {
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, h, 8), RUN_POLE);
    mast.position.y = h / 2; mast.castShadow = true; g.add(mast);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 8), M.concrete);
    foot.position.y = 0.08; g.add(foot);
    const rig = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.12), RUN_STEEL);
    rig.position.y = h - 0.15; g.add(rig);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff1c2, emissiveIntensity: 0.25, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.14), lampMat);
        lamp.position.set(-0.5 + i * 0.33, h - 0.15, 0.1);
        lamp.rotation.x = -0.55; g.add(lamp);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), RUN_STEEL);
        housing.position.set(-0.5 + i * 0.33, h - 0.15, -0.02); housing.rotation.x = -0.55; g.add(housing);
    }
    // weicher Lichtkegel (nachts sichtbar)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    // Kegel: Spitze OBEN an der Lampe, weitet sich zum Boden hin und ist
    // zur Strecke (+z) geneigt — ConeGeometry hat die Spitze bei +y.
    const ch = h - 0.4, tilt = 0.55;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, ch, 14, 1, true), glowMat);
    cone.position.set(0, h - 0.15 - Math.cos(tilt) * ch / 2, 0.1 + Math.sin(tilt) * ch / 2);
    cone.rotation.x = -tilt; g.add(cone);
    g.userData.lampMat = lampMat; g.userData.glow = cone; g.userData.isFlood = true;
    return g;
}
/** Fahnentuch mit Symbol: Stern, Blitz, Schneeflocke, Board, Zielflagge */
function makeSymbolFlagTexture(kind, bg = '#e11d48', fg = '#ffffff') {
    const W = 256, H = 160;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    // dunkler Saum
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10);
    c.fillStyle = fg; c.strokeStyle = fg; c.lineWidth = 8; c.lineJoin = 'round'; c.lineCap = 'round';
    const cx = W * 0.5, cy = H * 0.5;
    if (kind === 'star') {
        c.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 26 : 58, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        c.closePath(); c.fill();
    } else if (kind === 'bolt') {
        c.beginPath(); c.moveTo(cx + 12, cy - 62); c.lineTo(cx - 26, cy + 6); c.lineTo(cx - 2, cy + 6); c.lineTo(cx - 14, cy + 62); c.lineTo(cx + 28, cy - 10); c.lineTo(cx + 4, cy - 10); c.closePath(); c.fill();
    } else if (kind === 'flake') {
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3;
            c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58); c.stroke();
            for (const s2 of [-1, 1]) { const bx = cx + Math.cos(a) * 34, by = cy + Math.sin(a) * 34; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + s2 * 0.9) * 18, by + Math.sin(a + s2 * 0.9) * 18); c.stroke(); }
        }
    } else if (kind === 'board') {
        c.save(); c.translate(cx, cy); c.rotate(-0.6);
        c.beginPath(); c.roundRect ? c.roundRect(-64, -16, 128, 32, 16) : c.rect(-64, -16, 128, 32); c.fill();
        c.fillStyle = bg; c.fillRect(-22, -6, 12, 12); c.fillRect(10, -6, 12, 12);
        c.restore();
    } else if (kind.startsWith('txt:')) {                        // Schriftzug, groß und fett
        const word = kind.slice(4);
        c.font = `900 ${word.length > 4 ? 78 : 96}px 'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 12; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.strokeText(word, cx, cy + 4);
        c.fillStyle = fg; c.fillText(word, cx, cy + 4);
    } else {                                                     // 'checker': Zielflagge
        const n = 6, sw = W / n, sh = H / 4;
        for (let y = 0; y < 4; y++) for (let x = 0; x < n; x++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * sw, y * sh, sw, sh); }
    }
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4; tx.needsUpdate = true;
    return tx;
}
/** Wehende Fahne (Fahnenmast mit Symboltuch, wird von registerFlags animiert) */
function runFlag(kind = 'star', bg = '#e11d48', h = 3.4) {
    // Textfahnen (FUN, AIR, …) sind deutlich größer als die Symbolfahnen
    const big = kind.startsWith('txt:');
    return makeFlagPole(big ? h + 1.2 : h, { map: makeSymbolFlagTexture(kind, bg), w: big ? 2.3 : 1.3, h: big ? 1.35 : 0.82 });
}
export function makeRunDressing(type, len) {
    const g = new THREE.Group();
    const hl = len / 2;
    const flagSet = type === 'racecourse'
        ? [['checker', '#ffffff'], ['bolt', '#e11d48'], ['checker', '#ffffff'], ['star', '#2563eb']]
        : type === 'halfpipe'
        ? [['txt:AIR', '#2563eb'], ['flake', '#0ea5e9'], ['txt:RIDE', '#e11d48'], ['bolt', '#f97316']]
        : [['txt:FUN', '#f97316'], ['star', '#e11d48'], ['txt:PARK', '#2563eb'], ['flake', '#facc15']];
    // Strahler an Halfpipe und großem Funpark, Fahnen an allen größeren Anlagen
    if (type === 'halfpipe' || type === 'funpark_l' || type === 'racecourse') {
        const side = type === 'halfpipe' ? 6.4 : type === 'racecourse' ? 4.6 : 4.2;
        const n = type === 'racecourse' ? 3 : 2;
        for (let i = 0; i < n; i++) {
            const z = -hl + 1.5 + (i + 0.5) * (len - 3) / n;
            // Lampenrig zeigt lokal nach +z; links stehend (x<0) muss es nach +x leuchten → +90°, rechts → −90°
            for (const sx of [-1, 1]) { const f = runFlood(type === 'halfpipe' ? 5.6 : 5.0); f.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(groundEl(f, sx * side, z)); }
        }
    }
    if (type !== 'kicker') {
        const fx = type === 'halfpipe' ? 6.0 : type === 'racecourse' ? 4.0 : 3.8;
        for (let i = 0; i < 4; i++) g.add(groundEl(runFlag(flagSet[i][0], flagSet[i][1]), (i % 2 ? 1 : -1) * fx, -hl + 1.2 + (i >> 1) * (len - 2.4)));
    }
    const name = { halfpipe: 'HALFPIPE', kicker: 'KICKER', racecourse: 'RENNSTRECKE', funpark_s: 'FUNPARK', funpark: 'FUNPARK', funpark_l: 'FUNPARK' }[type] || 'PARK';
    if (type === 'racecourse') {
        // Start-Tor oben, Zielbogen unten, Tore im Wechsel, Tribüne am Ziel
        g.add(groundEl(runBanner('START', 5.4, 0.9, 3.2, 0x0f172a, 0xffffff), 0, -hl + 0.6));
        g.add(groundEl(runBanner('ZIEL', 6.2, 1.1, 3.6, 0xdc2626, 0xffffff), 0, hl - 0.8));
        const gates = Math.max(4, Math.round(len / 4.2));
        for (let i = 0; i < gates; i++) {
            const t = (i + 0.5) / gates, z = -hl + 2.5 + t * (len - 5.5);
            const side = i % 2 === 0 ? 1 : -1, x = side * 1.7;
            const mat = i % 2 === 0 ? RUN_RED : RUN_BLUE;
            g.add(groundEl(runPole(1.7, mat), x - side * 0.45, z));
            g.add(groundEl(runPole(1.7, mat), x + side * 0.45, z));
            // Torflagge zwischen den Stangen
            const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), mat);
            flag.material = mat.clone(); flag.material.side = THREE.DoubleSide;
            g.add(groundEl(flag, x, z, 1.35));
        }
        g.add(groundEl(runStand(), 5.2, hl - 4.5));
        // Zeitanzeige
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.12), new THREE.MeshStandardMaterial({ map: makeLabelTexture('00:00.00', 0x22c55e, 0x0b1120), emissive: 0x0a2a14, emissiveIntensity: 0.5 }));
        g.add(groundEl(board, -4.2, hl - 1.6, 2.2));
        const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), RUN_POLE);
        g.add(groundEl(bp, -4.2, hl - 1.6, 1.1));
    } else if (type === 'halfpipe') {
        g.add(groundEl(runBanner(name, 5.6, 0.9, 3.2, 0x1e3a8a, 0xffffff), 0, -hl + 0.5));
        // Kantenmarker entlang beider Decks (Mulde ist ~4.3 breit je Seite)
        const n = Math.max(4, Math.round(len / 2.2));
        for (let i = 0; i < n; i++) {
            const z = -hl + 2 + (i + 0.5) * (len - 3) / n;
            for (const sx of [-1, 1]) g.add(groundEl(runPole(0.9, RUN_BLUE), sx * 4.6, z));
        }
        g.add(pennantRun(-5.6, -hl + 1, hl - 1));
        g.add(pennantRun(5.6, -hl + 1, hl - 1));
    } else if (type === 'kicker') {
        for (const sx of [-1, 1]) g.add(groundEl(runPole(1.4, RUN_ORANGE), sx * 2.2, 0.4));
        for (const sx of [-1, 1]) g.add(groundEl(runPole(1.0, RUN_ORANGE), sx * 2.2, hl - 1.2));
    } else {
        // Funpark: Banner, Wimpel, Rails neben der Linie
        g.add(groundEl(runBanner(name, 5.0, 0.85, 3.0, 0x7c2d12, 0xffedd5), 0, -hl + 0.5));
        g.add(pennantRun(-3.4, -hl + 1, hl - 1));
        g.add(pennantRun(3.4, -hl + 1, hl - 1));
        g.add(groundEl(runRail(3.0), 2.2, -hl * 0.2));
        if (len >= 10) g.add(groundEl(runRail(3.6), -2.2, hl * 0.45));
        for (const sx of [-1, 1]) g.add(groundEl(runPole(1.2, RUN_ORANGE), sx * 2.0, hl * 0.1));
    }
    return g;
}

/**
 * HALFPIPE-SCHALE: nur die gekrümmte Fahrfläche (Boden + zwei Viertelbogen-
 * Walls + Decks) mit blauen Kantenlinien — ohne Turm und Klotz. Wird IN die
 * modellierte Geländemulde gelegt: Ursprung = Pipe-Boden, Decks bei y = R.
 */
export function makeHalfpipeShell(L = 19, R = 3.3, FLAT = 2.8) {
    const g = new THREE.Group();
    const DECK = 1.2, THICK = 0.3;
    const sh = new THREE.Shape();
    const xi = FLAT / 2, xo = FLAT / 2 + R;
    sh.moveTo(-xo - DECK, R);
    sh.lineTo(-xo, R);
    sh.absarc(-xi, R, R, Math.PI, Math.PI * 1.5, false);
    sh.lineTo(xi, 0);
    sh.absarc(xi, R, R, Math.PI * 1.5, Math.PI * 2, false);
    sh.lineTo(xo + DECK, R);
    sh.lineTo(xo + DECK, R - THICK);
    sh.lineTo(xo, R - THICK);
    sh.absarc(xi, R, R - THICK, Math.PI * 2, Math.PI * 1.5, true);
    sh.lineTo(-xi, -THICK + 0.0001);
    sh.absarc(-xi, R, R - THICK, Math.PI * 1.5, Math.PI, true);
    sh.lineTo(-xo - DECK, R - THICK);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 18 });
    geo.translate(0, 0, -L / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xdbe7f5, roughness: 0.42, metalness: 0.03, side: THREE.DoubleSide });   // Firn-Eis: hell, leicht blau, glatt
    const pipe = new THREE.Mesh(geo, pipeMat);
    pipe.castShadow = pipe.receiveShadow = true;
    g.add(pipe);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2b8fe6, roughness: 0.45 });
    for (const sx of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, L), lineMat);
        l.position.set(sx * (xo + 0.08), R + 0.02, 0); g.add(l);
    }
    // Schneeboden: die Flat unten und der Übergang in die Walls sind
    // schneebedeckt (matt weiß) statt eisblau — nur die Walls bleiben Firn
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.95, metalness: 0 });
    const floorW = FLAT + R * 1.1;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(floorW, 0.06, L - 0.2), snowMat);
    floor.position.set(0, 0.03, 0); floor.receiveShadow = true; g.add(floor);
    // weicher Schneeansatz an beiden Wall-Füßen (flache Keile)
    for (const sx of [-1, 1]) {
        const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, L - 0.2), snowMat);
        wedge.position.set(sx * (floorW / 2 + 0.3), 0.14, 0); wedge.rotation.z = sx * -0.42; g.add(wedge);
    }
    // Ein- und Ausfahrt: Schneeschürzen an beiden Schalenenden, die vom
    // Schalenboden sanft in die Geländemulde hinunterführen (kein Absatz)
    for (const sz of [-1, 1]) {
        const apron = new THREE.Mesh(new THREE.BoxGeometry(floorW + 1.2, 0.08, 3.0), snowMat);
        apron.position.set(0, -0.38, sz * (L / 2 + 1.35)); apron.rotation.x = sz * 0.27; apron.receiveShadow = true; g.add(apron);
        // seitliche Schneekeile, die die Wall-Enden abrunden
        for (const sx of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.BoxGeometry(R + 0.4, 0.08, 2.2), snowMat);
            cap.position.set(sx * (xi + R * 0.55), R * 0.55, sz * (L / 2 + 0.9));
            cap.rotation.x = sz * 0.9; cap.rotation.z = sx * -0.6; g.add(cap);
        }
    }
    // Decks (die ebenen Bretter außen) sind Schnee, nicht Eis
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xf1f4f8, roughness: 0.92 });
    for (const sx of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(DECK + 0.6, 0.05, L), deckMat);
        d.position.set(sx * (xo + DECK / 2 + 0.1), R + 0.01, 0); d.receiveShadow = true; g.add(d);
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, L), lineMat);
    mid.position.set(0, 0.08, 0); g.add(mid);
    g.userData.pipeR = R;
    return g;
}
