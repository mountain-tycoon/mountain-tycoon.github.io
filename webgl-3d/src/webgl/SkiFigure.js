// ============================================================
// FIGUR DES SPIELERS (Selbst fahren): ein Skifahrer mit runden Gliedmaßen,
// Knie- und Ellbogengelenken, Helm mit Brille, Skischuhen, Ski an den
// Füßen und Stöcken in den Händen. Gebaut in „Körpermaß" (ca. 1 hoch),
// die Gruppe wird auf die Größe der Gäste skaliert.
//
// Gelenke stehen in userData; setPose() stellt Beine so, dass die Ski
// flach bleiben und die Füße unter der Hüfte stehen.
// ============================================================
import * as THREE from 'three';
import { composeOutfit } from './SkiOutfits.js';

const THIGH = 0.23, SHIN = 0.21, HIP_Y = 0.52;
export const PLAYER_SCALE = 1.06;

const mat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * Glied von oben (Gelenk) nach unten: oben kräftig, nach unten schlanker (`taper`), beide Enden gerundet –
 * so haben Oberschenkel, Waden und Arme eine Form statt überall gleich dicker Röhren.
 */
const limb = (r, len, material, taper = 0.82) => {
    const rb = r * taper, pts = [];
    for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r, -r + Math.cos(a) * r)); }
    pts.push(new THREE.Vector2((r + rb) / 2 * 1.03, -len * 0.42));                    // leichter Bauch (Muskel)
    for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * rb, -len + rb - Math.sin(a) * rb)); }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 12), material);
    m.castShadow = true;
    return m;
};

/** Stoffstruktur als Normalenkarte: feines Gewebe und ein paar schräge Falten – einmal erzeugt, von allen Figuren geteilt. */
let fabricTex = null;
const fabricNormal = () => {
    if (fabricTex) return fabricTex;
    const N = 128, h = new Float32Array(N * N);
    const rnd = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N * Math.PI * 2, v = y / N * Math.PI * 2;
        const folds = Math.sin(u * 2 + Math.sin(v * 3) * 0.9 + v) * 0.5 + Math.sin(u * 5 - v * 2 + Math.sin(u * 2) * 1.2) * 0.25;
        const weave = (Math.sin(x * 1.57) * Math.sin(y * 1.57)) * 0.025 + (rnd(x * 131 + y * 17) - 0.5) * 0.05;      // nur ein Hauch – sonst wirkt der Stoff wie ein Netz
        h[y * N + x] = folds * 0.55 + weave;
    }
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
        const nx = -dx * 2.2, ny = -dy * 2.2, l = Math.hypot(nx, ny, 1), o = (y * N + x) * 4;
        img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    fabricTex = new THREE.CanvasTexture(c);
    fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping; fabricTex.repeat.set(1, 2);
    return fabricTex;
};

/** @param o zusammengesetztes Outfit (composeOutfit in SkiOutfits.js); ohne Angabe die gespeicherte Auswahl. */
export function makePlayerSkier(o = composeOutfit()) {
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);          // sinkt mit gebeugten Knien ab
    const wool = o.torso === 'sweater';
    const M = {
        jacket: mat(o.jacket, wool ? 0.95 : 0.6), panel: mat(o.panel, 0.7), trim: mat(o.trim, wool ? 0.95 : 0.55), pants: mat(o.pants, 0.78),
        knee: mat(o.knee, 0.8), boot: mat(o.boot, 0.4, 0.1), bootDark: mat(o.bootDark, 0.5, 0.2), glove: mat(o.glove, 0.8), skin: mat(0xe2b594, 0.6),
        helmet: mat(o.headCol, o.head === 'helmet' ? 0.32 : 0.95, o.head === 'helmet' ? 0.15 : 0), helmetTrim: mat(o.headTrim, 0.45),
        lens: new THREE.MeshStandardMaterial({ color: o.lens, roughness: 0.1, metalness: 0.75, emissive: new THREE.Color(o.lens).multiplyScalar(0.35), emissiveIntensity: 0.3 }),
        strap: mat(o.strap, 0.7), ski: mat(o.ski, 0.35, 0.1), skiTop: mat(o.skiTop, 0.4), skiBase: mat(0x10131a, 0.5), pole: mat(o.pole, 0.35, 0.6), bind: mat(0x111318, 0.6),
        pack: mat(o.packCol, 0.8), hair: mat(o.hair, 0.9)
    };
    // Stoff: Jacke und Hose bekommen Gewebe und Falten (Normalenkarte) – weite Kleidung kräftiger als ein Rennanzug
    if (typeof document !== 'undefined') {
        const nm = fabricNormal(), tight = o.torso === 'suit';
        for (const k of ['jacket', 'pants', 'panel', 'knee']) { M[k].normalMap = nm; M[k].normalScale = new THREE.Vector2(tight ? 0.25 : 0.7, tight ? 0.25 : 0.7); }
    }
    // Passform: weite Hose … enger Rennanzug. Daraus folgt auch, wie stark der Stoff im Fahrtwind flattert.
    const FAT = { loose: 1.22, normal: 1, tight: 0.9 }, FLAP = { loose: 1, normal: 0.4, tight: 0 };
    const fat = FAT[o.pantsFit] || 1, topFat = o.torso === 'suit' ? 0.94 : (FAT[o.topFit] || 1) > 1 ? 1.08 : 1;
    const flapPants = FLAP[o.pantsFit] ?? 0.4;
    const flapTop = o.torso === 'suit' ? 0 : o.torso === 'sweater' ? Math.min(0.3, FLAP[o.topFit] ?? 0.4) : (FLAP[o.topFit] ?? 0.4);
    const cloth = [];           // Stoffteile, die flattern: { mesh, sx, sz, amp, phase }

    // ----- Beine: Hüfte -> Knie -> Knöchel (Schuh + Ski) -----
    const mkLeg = (x) => {
        const hip = new THREE.Group(); hip.position.set(x, HIP_Y, 0);
        const thigh = limb(0.072 * fat, THIGH + 0.03, M.pants, 0.78); thigh.scale.set(1, 1, 1.12); hip.add(thigh);
        cloth.push({ mesh: thigh, sx: 1, sz: 1.12, amp: flapPants * 0.16, phase: x * 40 });
        const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
        const shin = limb(0.058 * fat, SHIN, M.pants, 0.84); shin.scale.set(1, 1, 1.1); knee.add(shin);
        // Hosensaum, der über dem Schuh aufliegt
        const cuffP = new THREE.Mesh(new THREE.CylinderGeometry(0.056 * fat, 0.068 * fat, 0.05, 12), M.pants);
        cuffP.position.y = -SHIN + 0.115; knee.add(cuffP);
        cloth.push({ mesh: shin, sx: 1, sz: 1.1, amp: flapPants * 0.22, phase: x * 40 + 1.7 });
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), M.knee);
        pad.scale.set(1, 0.85, 0.75); pad.position.set(0, -0.005, 0.03); knee.add(pad);
        const ankle = new THREE.Group(); ankle.position.y = -SHIN + 0.075; knee.add(ankle);
        // Skischuh: heller Schaft mit dunkler Manschette, kräftige Schale, zwei Schnallen
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.06, 0.035, 12), M.bootDark);
        cuff.position.y = 0.06; ankle.add(cuff);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.066, 0.12, 12), M.boot);
        shaft.position.y = 0.0; shaft.rotation.x = 0.12; shaft.castShadow = true; ankle.add(shaft);
        const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.12, 4, 10), M.boot);
        shoe.rotation.x = Math.PI / 2; shoe.scale.set(1, 1, 0.72); shoe.position.set(0, -0.048, 0.035); ankle.add(shoe);
        const soleB = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.24), M.bootDark);
        soleB.position.set(0, -0.078, 0.035); ankle.add(soleB);
        for (const by of [0.03, -0.015]) {
            const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.014, 0.03), M.pole);
            buckle.position.set(0, by, 0.05); ankle.add(buckle);
        }
        // Ski: taillierte Latte mit aufgebogener Schaufel und leicht aufgebogenem Ende, helles Dekor, Bindung
        const ski = new THREE.Group(); ski.position.y = -0.092;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.98), M.ski);
        plank.position.z = 0.05; plank.castShadow = true; ski.add(plank);
        const deco = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.5), M.skiTop);
        deco.position.set(0, 0.009, 0.3); ski.add(deco);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.014, 12, 1, false, -Math.PI / 2, Math.PI), M.ski);
        tip.scale.set(1, 1, 3.4); tip.position.set(0, 0.012, 0.535); tip.rotation.x = -0.34; ski.add(tip);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.07), M.ski);
        tail.position.set(0, 0.006, -0.465); tail.rotation.x = 0.25; ski.add(tail);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.006, 0.96), M.skiBase);
        sole.position.set(0, -0.009, 0.05); ski.add(sole);
        for (const [bz, bl] of [[0.15, 0.1], [-0.1, 0.09]]) {
            const bind = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.034, bl), M.bind);
            bind.position.set(0, 0.022, bz); ski.add(bind);
        }
        ankle.add(ski);
        // Kufe für die Eisbahn (statt des Skis)
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.3), M.pole);
        blade.position.set(0, -0.092, 0.03); blade.visible = false; ankle.add(blade);
        body.add(hip);
        return { hip, knee, ankle, ski, blade };
    };
    const L = mkLeg(-0.068), R = mkLeg(0.068);

    // ----- Rumpf (beugt sich aus der Hüfte) mit Kopf und Armen -----
    const torso = new THREE.Group(); torso.position.y = HIP_Y - 0.02; body.add(torso);
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.07, 4, 10), M.pants);
    hips.rotation.z = Math.PI / 2; hips.position.y = 0.01; hips.scale.set(1, 1, 0.9); torso.add(hips);
    // Jacke: Drehkörper mit Taille, Brust und Schulterpartie – breiter als tief
    const prof = [[0.0, 0.03], [0.088, 0.035], [0.092, 0.09], [0.098, 0.17], [0.108, 0.235], [0.104, 0.285], [0.07, 0.325], [0.05, 0.335], [0.0, 0.335]]
        .map(([r, y]) => new THREE.Vector2(r, y));
    const chest = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), M.jacket);
    chest.scale.set(1.3 * topFat, 1, 0.84 * topFat); chest.castShadow = true; torso.add(chest);
    cloth.push({ mesh: chest, sx: 1.3 * topFat, sz: 0.84 * topFat, amp: flapTop * 0.07, phase: 0.6 });
    // Jackenschoß hinten: hängt lose und schlägt im Fahrtwind (nur bei Jacken, die nicht eng anliegen)
    let tail = null;
    if (flapTop > 0.2 && o.torso === 'jacket') {
        tail = new THREE.Group(); tail.position.set(0, 0.07, -0.074 * topFat);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.2 * topFat, 0.075, 0.012), M.jacket);
        flap.position.y = -0.03; tail.add(flap);
        torso.add(tail);
    }
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.094, 0.05, 18), M.panel);       // dunkler Saum
    hem.position.y = 0.055; hem.scale.set(1.31, 1, 0.85); torso.add(hem);
    // Querstreifen auf der Brust (Norwegermuster, Rennstreifen …)
    for (let b = 0; b < (o.bands || 0); b++) {
        const y = 0.2 - (b - ((o.bands - 1) / 2)) * 0.05;
        const rr = 0.098 + (y - 0.17) * 0.12 + 0.004;
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.002, rr, o.bands > 1 ? 0.02 : 0.03, 18), M.trim);
        stripe.position.y = y; stripe.scale.set(1.305, 1, 0.845); torso.add(stripe);
    }
    if (o.torso === 'jacket') for (const sx of [-1, 1]) {                                         // Schulterpolster
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), M.panel);
        cap.scale.set(1.05, 0.8, 0.95); cap.position.set(sx * 0.15, 0.292, 0); torso.add(cap);
    }
    if (o.torso !== 'sweater') {
        const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.25, 0.01), M.panel);
        zip.position.set(0, 0.19, 0.089); torso.add(zip);
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(wool ? 0.06 : 0.056, 0.066, wool ? 0.075 : 0.06, 12), wool ? M.trim : M.panel);
    collar.position.y = 0.335; torso.add(collar);                                                 // Kragen bzw. Rollkragen
    if (o.pack) {
        const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.1, 4, 10), M.pack);         // kleiner Rucksack
        pack.scale.set(1.25, 1, 0.6); pack.position.set(0, 0.2, -0.105); pack.castShadow = true; torso.add(pack);
        for (const sx of [-1, 1]) {
            const strapP = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.2, 0.012), M.pack);
            strapP.position.set(sx * 0.07, 0.24, 0.083); strapP.rotation.x = -0.12; torso.add(strapP);
        }
    }
    // Schultern (auch ohne Polster rund), Hals und – bei Jacken – eine Kapuze im Nacken
    if (o.torso !== 'jacket') for (const sx of [-1, 1]) {
        const delt = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), M.jacket);
        delt.scale.set(1.0, 0.8, 0.95); delt.position.set(sx * 0.158, 0.288, 0); torso.add(delt);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.038, 0.06, 10), M.skin); neck.position.y = 0.365; torso.add(neck);
    if (o.torso === 'jacket' && !o.gear) {
        const hood = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), M.jacket);
        hood.scale.set(1.1, 0.55, 0.8); hood.rotation.x = -1.9; hood.position.set(0, 0.315, -0.075); torso.add(hood);
        for (const sx of [-1, 1]) {                                                              // Brusttaschen
            const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), M.panel);
            pocket.position.set(sx * 0.07, 0.215, 0.09 * topFat); pocket.rotation.y = sx * 0.5; torso.add(pocket);
        }
    }
    const head = new THREE.Group(); head.position.y = 0.415; torso.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 14), M.skin); face.scale.set(0.93, 1.06, 1); head.add(face);
    // Gesicht: Kinnpartie, Nase, Mund, Ohren – und Augen, wo keine Brille davor sitzt
    {
        const dark = mat(0x2a1c16, 0.8), white = mat(0xf2f2ee, 0.4), lip = mat(0xa85a4c, 0.7);
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), M.skin); jaw.scale.set(0.95, 0.8, 0.95); jaw.position.set(0, -0.034, 0.012); head.add(jaw);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 6), M.skin); nose.rotation.x = Math.PI / 2 - 0.5; nose.position.set(0, -0.008, 0.07); head.add(nose);
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), lip); mouth.position.set(0, -0.036, 0.062); head.add(mouth);
        for (const sx of [-1, 1]) {
            const ear = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), M.skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(sx * 0.066, -0.004, -0.004); head.add(ear);
            if (o.eyes === 'none' || o.eyes === 'cage') {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 6), white); eye.position.set(sx * 0.026, 0.012, 0.061); head.add(eye);
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 6, 5), dark); pupil.position.set(sx * 0.026, 0.012, 0.0685); head.add(pupil);
                const brow = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.005, 0.006), M.hair); brow.position.set(sx * 0.026, 0.028, 0.064); brow.rotation.z = -sx * 0.12; head.add(brow);
            }
        }
    }
    if (o.head === 'helmet') {
        // Helm: Schale bis über die Ohren, vorn offen fürs Gesicht; Zierstreifen und Kinnriemen
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.086, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), M.helmet);
        shell.position.y = 0.008; shell.castShadow = true; head.add(shell);
        const back = new THREE.Mesh(new THREE.SphereGeometry(0.0855, 20, 10, Math.PI * 0.62, Math.PI * 1.76, Math.PI * 0.5, Math.PI * 0.3), M.helmet);
        back.position.y = 0.008; head.add(back);
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.087, 0.008, 6, 20, Math.PI), M.helmetTrim);
        ridge.rotation.y = Math.PI / 2; ridge.position.y = 0.008; head.add(ridge);
        const chin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), M.panel);
        for (const sx of [-1, 1]) { const c = chin.clone(); c.position.set(sx * 0.06, -0.045, 0.02); c.rotation.z = sx * 0.35; head.add(c); }
    } else {
        // Haare unter Mütze oder Stirnband
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.076, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), M.hair);
        hair.position.set(0, 0.004, -0.008); head.add(hair);
        if (o.head === 'beanie' || o.head === 'bobble') {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.helmet);
            cap.scale.set(1, o.head === 'beanie' ? 1.2 : 1.05, 1); cap.position.y = 0.02; cap.castShadow = true; head.add(cap);
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 16), M.helmetTrim);
            brim.position.y = 0.03; head.add(brim);
            if (o.head === 'bobble') {
                const pom = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), M.helmetTrim);
                pom.position.y = 0.118; head.add(pom);
            }
        } else if (o.head === 'headband') {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.04, 16), M.helmet);
            band.position.y = 0.03; head.add(band);
        } else {
            // Schirmmütze mit Ohrenklappen
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M.helmet);
            cap.position.y = 0.022; cap.castShadow = true; head.add(cap);
            const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 12, 1, false, -Math.PI / 2, Math.PI), M.helmetTrim);
            peak.position.set(0, 0.03, 0.055); head.add(peak);
            for (const sx of [-1, 1]) { const flap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.06, 0.06), M.helmet); flap.position.set(sx * 0.074, -0.005, -0.005); head.add(flap); }
        }
    }
    if (o.eyes === 'goggles') {
        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0875, 0.0875, 0.03, 20), M.strap);
        strap.position.y = 0.012; head.add(strap);                                                // Brillenband
        const frame = new THREE.Mesh(new THREE.SphereGeometry(0.0745, 14, 8, Math.PI * 0.17, Math.PI * 0.66, Math.PI * 0.33, Math.PI * 0.26), M.panel);
        frame.position.set(0, 0.004, 0.012); head.add(frame);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.076, 14, 8, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.36, Math.PI * 0.2), M.lens);
        lens.position.set(0, 0.004, 0.013); head.add(lens);
    } else if (o.eyes === 'cage') {
        // Eishockey: Gitter vor dem Gesicht
        const A = Math.PI * 0.44, H = Math.PI * 0.62;
        for (const a of [-0.5, -0.17, 0.17, 0.5]) {                                                 // senkrechte Stäbe
            const bar = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.0035, 4, 10, A).rotateZ(-A / 2 - 0.12).rotateY(-Math.PI / 2 + a), M.strap);
            bar.position.y = 0.004; head.add(bar);
        }
        for (const y of [-0.04, -0.012, 0.016]) {                                                   // Querstäbe
            const hoop = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(0.083 * 0.083 - y * y), 0.0035, 4, 14, H).rotateZ(Math.PI / 2 - H / 2).rotateX(Math.PI / 2), M.strap);
            hoop.position.y = y + 0.004; head.add(hoop);
        }
    } else if (o.eyes === 'shades') {
        // Sonnenbrille: zwei Gläser, Steg, Bügel
        for (const sx of [-1, 1]) {
            const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.008, 10), M.lens);
            glass.rotation.x = Math.PI / 2; glass.scale.set(1.25, 1, 1); glass.position.set(sx * 0.028, 0.008, 0.066); head.add(glass);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.07), M.strap);
            arm.position.set(sx * 0.066, 0.01, 0.028); head.add(arm);
        }
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.005), M.strap);
        bridge.position.set(0, 0.012, 0.068); head.add(bridge);
    }

    const mkArm = (x) => {
        const sh = new THREE.Group(); sh.position.set(x, 0.285, 0);
        sh.add(limb(0.052, 0.19, M.jacket, 0.84));
        const elbow = new THREE.Group(); elbow.position.y = -0.17; sh.add(elbow);
        elbow.add(limb(0.045, 0.16, M.jacket, 0.84));
        const cuffA = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.048, 0.045, 10), M.glove);
        cuffA.position.y = -0.145; elbow.add(cuffA);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), M.glove);
        hand.scale.set(0.9, 1.15, 1); hand.position.y = -0.185; elbow.add(hand);
        const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 3, 6), M.glove);
        thumb.position.set(-Math.sign(x) * 0.03, -0.175, 0.022); thumb.rotation.z = -Math.sign(x) * 0.7; elbow.add(thumb);
        // Stock: Griff in der Hand, Teller kurz vor der Spitze
        const pole = new THREE.Group(); pole.position.y = -0.18; elbow.add(pole);
        const shaftP = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.62, 6), M.pole);
        shaftP.position.y = -0.27; pole.add(shaftP);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6), M.glove);
        grip.position.y = 0.01; pole.add(grip);
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), M.glove);
        basket.position.y = -0.53; pole.add(basket);
        torso.add(sh);
        return { sh, elbow, pole, hand, stick: null };
    };
    const AL = mkArm(-0.172), AR = mkArm(0.172);

    // ----- Ausrüstung je Sportart -----
    if (o.gear === 'nordic') {
        // Langlauf: schmale, leichte Ski und Stöcke bis zur Schulter
        for (const leg of [L, R]) leg.ski.scale.set(0.6, 0.8, 1.06);
        for (const arm of [AL, AR]) arm.pole.scale.y = 1.34;
    }
    if (o.gear === 'hockey') for (const arm of [AL, AR]) arm.hand.scale.set(1.15, 1.5, 1.3);      // dicke Handschuhe
    if (o.gear === 'glider') {
        // Gurtzeug: Sitzschale am Rücken, Beingurte
        const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.14, 4, 10), M.pack);
        seat.scale.set(1.3, 1, 0.75); seat.position.set(0, 0.12, -0.11); seat.castShadow = true; torso.add(seat);
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), M.pack);
        belt.position.y = 0.06; belt.scale.set(1.32, 1, 0.9); torso.add(belt);
    }
    if (o.rifle) {
        // Biathlongewehr quer über dem Rücken, Lauf nach oben
        const rifle = new THREE.Group();
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.05), M.bind); stock.position.y = -0.05; rifle.add(stock);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), M.pole); barrel.position.y = 0.26; rifle.add(barrel);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.05, 0.03), M.trim); mag.position.set(0, 0.02, 0.04); rifle.add(mag);
        rifle.position.set(0.02, 0.2, -0.115); rifle.rotation.z = 0.32; torso.add(rifle);
    }

    // Geschulterte Ski (zu Fuß auf aperem Boden)
    const carried = new THREE.Group();
    for (const dx of [-0.02, 0.02]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.02, 0.075), M.ski);
        c.position.x = dx; carried.add(c);
    }
    carried.position.set(0.16, 0.36, -0.05); carried.rotation.set(0.5, 0, -0.08); carried.visible = false;
    torso.add(carried);

    const ud = g.userData;
    ud.torso = torso; ud.head = head;
    ud.carrying = false;
    /** Ski schultern (zu Fuß) oder wieder anschnallen. */
    ud.setCarry = (on) => {
        ud.carrying = !!on;
        L.ski.visible = R.ski.visible = !on && !ud.onIce; carried.visible = !!on && !ud.onIce;
        AL.pole.visible = AR.pole.visible = !on && !ud.onIce;
    };
    /**
     * Bein stellen: bend = Kniebeuge (0 gestreckt … 1.4 tief), swing = Vor-/Rückschwung der
     * ganzen Stellung, spread = seitlich ausgestellt (Pflug). Der Ski bleibt flach.
     * Liefert, um wie viel das Bein dadurch kürzer wird.
     */
    const setLeg = (leg, bend, swing, spread, sign) => {
        const back = Math.asin(Math.min(0.98, THIGH * Math.sin(bend) / SHIN));   // Unterschenkel so weit zurück, dass der Fuß unter der Hüfte bleibt
        leg.hip.rotation.set(-bend + swing, 0, sign * spread);
        leg.knee.rotation.x = bend + back;
        leg.ankle.rotation.set(-back - swing, 0, -sign * spread);
        return (THIGH + SHIN) - (THIGH * Math.cos(bend) + SHIN * Math.cos(back));
    };
    /** Arm stellen: Schulter- und Ellbogenwinkel, seitlich abgespreizt; der Stock zeigt mit `pole` (Weltwinkel) nach hinten unten. */
    const setArm = (arm, shoulder, elbow, out, sign, pole, lean) => {
        arm.sh.rotation.set(shoulder, 0, sign * out);
        arm.elbow.rotation.x = elbow;
        arm.pole.rotation.x = pole - shoulder - elbow - lean;
        if (arm.stick) arm.stick.rotation.x = -0.95 - shoulder - elbow - lean;       // Schläger nach vorn unten aufs Eis
    };
    /**
     * Ganze Haltung in einem Aufruf.
     *   bendL/bendR  Kniebeuge je Bein        swingL/swingR  Schrittschwung
     *   plough       Pflug (0…1)              lean           Oberkörper vor
     *   armX, elbow  Arme vor, Ellbogen       armOut         Arme seitlich
     *   pole         Stockwinkel              sit            sitzend (Sessel): Oberschenkel waagerecht
     *   roll, twist  Oberkörper seitlich aufrichten bzw. drehen (Hüftknick in der Kurve)
     *   splay        Skating: Skispitzen auseinander (0…1)      outL/outR  Bein seitlich abgestoßen
     */
    ud.setPose = (p) => {
        if (p.sit) {
            for (const [leg, s] of [[L, -1], [R, 1]]) {
                leg.hip.rotation.set(-1.45, 0, s * 0.03); leg.knee.rotation.x = 1.25; leg.ankle.rotation.set(0.2, 0, 0);
            }
            body.position.y = 0;
        } else {
            const dl = setLeg(L, p.bendL ?? 0, p.swingL ?? 0, (p.plough ?? 0) * 0.24 + (p.outL ?? 0), -1);
            const dr = setLeg(R, p.bendR ?? 0, p.swingR ?? 0, (p.plough ?? 0) * 0.24 + (p.outR ?? 0), 1);
            // Pflug: Füße breit, Skispitzen zusammen – Skating (splay): Spitzen auseinander.
            // (Das linke Bein sitzt bei −x: positive Drehung um y führt seine Spitze nach innen.)
            const tips = (p.plough ?? 0) - (p.splay ?? 0);
            L.ankle.rotation.y = tips * 0.3; R.ankle.rotation.y = -tips * 0.3;
            body.position.y = -Math.min(dl, dr);
        }
        const lean = p.lean ?? 0;
        // roll: Oberkörper gegen die Schräglage der Beine aufrichten (Hüftknick), twist: zum Tal gedreht
        torso.rotation.set(lean, p.twist ?? 0, p.roll ?? 0);
        head.rotation.set(-lean * 0.75, -(p.twist ?? 0) * 0.5, -(p.roll ?? 0) * 0.6);   // der Blick bleibt nach vorn gerichtet, der Kopf waagerecht
        setArm(AL, p.armX ?? 0, p.elbow ?? 0, (p.armOut ?? 0.12) + (p.armOutL ?? 0), -1, p.pole ?? 0.5, lean);
        setArm(AR, p.armXR ?? p.armX ?? 0, p.elbow ?? 0, (p.armOut ?? 0.12) + (p.armOutR ?? 0), 1, p.pole ?? 0.5, lean);
    };
    // Eisbahn: Schlittschuhe statt Ski, ein Hockeyschläger statt der Stöcke
    {
        const stick = new THREE.Group(); stick.position.y = -0.18; stick.visible = false;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.86, 0.028), M.bind); shaft.position.y = -0.4; stick.add(shaft);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.06, 0.24), M.bind); blade.position.set(0, -0.82, 0.1); blade.rotation.x = 0.95; stick.add(blade);
        AR.elbow.add(stick); AR.stick = stick;
    }
    /** Stöcke ein-/ausblenden (am Gleitschirm bleiben die Hände an den Steuerleinen). */
    ud.setPoles = (on) => { AL.pole.visible = AR.pole.visible = !!on && !ud.onIce && !ud.carrying; };
    ud.onIce = false;
    ud.setIce = (on) => {
        ud.onIce = !!on;
        L.blade.visible = R.blade.visible = AR.stick.visible = ud.onIce;
        ud.setCarry(ud.carrying && !ud.onIce);
    };
    /** Höhe der Hüfte über den Füßen (für das Sitzen im Sessel). */
    ud.hipY = HIP_Y;
    /**
     * Fahrtwind: `speed` 0…1, `t` Zeit in Sekunden. Weite Kleidung flattert kräftig, normale leicht, ein
     * Rennanzug gar nicht. Bewegt werden nur Maßstäbe weniger Teile – das kostet nichts.
     */
    ud.setWind = (speed, t) => {
        const k = Math.max(0, Math.min(1, speed));
        for (const c of cloth) {
            if (!c.amp) continue;
            const w = Math.sin(t * 31 + c.phase) * 0.6 + Math.sin(t * 47 + c.phase * 2.3) * 0.4;      // unruhig, nicht gleichmäßig
            c.mesh.scale.x = c.sx * (1 + c.amp * k * w * 0.6);
            c.mesh.scale.z = c.sz * (1 + c.amp * k * (0.5 + 0.5 * w));                                // der Stoff bläht sich nach hinten
        }
        if (tail) tail.rotation.x = -k * flapTop * (0.55 + 0.45 * Math.sin(t * 27) + 0.25 * Math.sin(t * 43 + 1));
    };
    ud.setPose({});
    g.scale.setScalar(PLAYER_SCALE);
    return g;
}
