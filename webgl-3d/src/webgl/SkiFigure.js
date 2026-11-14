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

const THIGH = 0.23, SHIN = 0.21, HIP_Y = 0.52;
export const PLAYER_SCALE = 1.06;

const mat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Glied von oben (Gelenk) nach unten: Kapsel der Länge len. */
const limb = (r, len, material) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 10), material);
    m.position.y = -len / 2; m.castShadow = true;
    return m;
};

export function makePlayerSkier() {
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);          // sinkt mit gebeugten Knien ab
    const M = {
        jacket: mat(0xd8452a, 0.62), trim: mat(0xf3efe6, 0.6), pants: mat(0x1c2533, 0.75),
        boot: mat(0x2b3038, 0.45, 0.2), glove: mat(0x15181d, 0.8), skin: mat(0xe2b594, 0.6),
        helmet: mat(0xf1f1ee, 0.35), lens: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.12, metalness: 0.7, emissive: 0x7a4a05, emissiveIntensity: 0.25 }),
        strap: mat(0x1b1e24, 0.8), ski: mat(0x1f5fbf, 0.35, 0.1), skiBase: mat(0x10131a, 0.5), pole: mat(0x9aa3ad, 0.35, 0.6), bind: mat(0x111318, 0.6)
    };

    // ----- Beine: Hüfte -> Knie -> Knöchel (Schuh + Ski) -----
    const mkLeg = (x) => {
        const hip = new THREE.Group(); hip.position.set(x, HIP_Y, 0);
        hip.add(limb(0.062, THIGH + 0.03, M.pants));
        const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
        knee.add(limb(0.05, SHIN, M.pants));
        const ankle = new THREE.Group(); ankle.position.y = -SHIN + 0.075; knee.add(ankle);
        // Skischuh: Schaft und Sohle, zwei Schnallen
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.06, 0.11, 10), M.boot);
        shaft.position.y = 0.005; shaft.castShadow = true; ankle.add(shaft);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), M.boot);
        shoe.position.set(0, -0.045, 0.03); ankle.add(shoe);
        for (const by of [0.02, -0.02]) {
            const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.012, 0.03), M.pole);
            buckle.position.set(0, by, 0.045); ankle.add(buckle);
        }
        // Ski: schlanke Latte mit aufgebogener Spitze, Bindung unter dem Schuh
        const ski = new THREE.Group(); ski.position.y = -0.085;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 1.02), M.ski);
        plank.position.z = 0.06; plank.castShadow = true; ski.add(plank);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.14), M.ski);
        tip.position.set(0, 0.022, 0.63); tip.rotation.x = -0.38; ski.add(tip);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.006, 1.0), M.skiBase);
        sole.position.set(0, -0.009, 0.06); ski.add(sole);
        const bind = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.26), M.bind);
        bind.position.set(0, 0.02, 0.03); ski.add(bind);
        ankle.add(ski);
        body.add(hip);
        return { hip, knee, ankle, ski };
    };
    const L = mkLeg(-0.068), R = mkLeg(0.068);

    // ----- Rumpf (beugt sich aus der Hüfte) mit Kopf und Armen -----
    const torso = new THREE.Group(); torso.position.y = HIP_Y - 0.02; body.add(torso);
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.06, 4, 10), M.pants);
    hips.rotation.z = Math.PI / 2; hips.position.y = 0.01; torso.add(hips);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.16, 5, 12), M.jacket);
    chest.position.y = 0.17; chest.scale.set(1.2, 1, 0.82); chest.castShadow = true; torso.add(chest);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 14), M.trim);
    stripe.position.y = 0.2; stripe.scale.set(1.22, 1, 0.84); torso.add(stripe);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.05, 10), M.jacket);
    collar.position.y = 0.32; torso.add(collar);
    const head = new THREE.Group(); head.position.y = 0.4; torso.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 12), M.skin); head.add(face);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.083, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.helmet);
    shell.position.y = 0.006; shell.castShadow = true; head.add(shell);
    const ears = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.11), M.helmet);
    ears.position.set(0, -0.03, -0.012); head.add(ears);
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0845, 0.0845, 0.034, 16), M.strap);
    strap.position.y = 0.012; head.add(strap);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 8, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.36, Math.PI * 0.2), M.lens);
    lens.position.set(0, 0, 0.018); lens.scale.set(1.08, 1, 1); head.add(lens);

    const mkArm = (x) => {
        const sh = new THREE.Group(); sh.position.set(x, 0.285, 0);
        sh.add(limb(0.045, 0.19, M.jacket));
        const elbow = new THREE.Group(); elbow.position.y = -0.17; sh.add(elbow);
        elbow.add(limb(0.04, 0.17, M.jacket));
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 8), M.glove);
        hand.position.y = -0.18; elbow.add(hand);
        // Stock: Griff in der Hand, Teller kurz vor der Spitze
        const pole = new THREE.Group(); pole.position.y = -0.18; elbow.add(pole);
        const shaftP = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.62, 6), M.pole);
        shaftP.position.y = -0.27; pole.add(shaftP);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6), M.glove);
        grip.position.y = 0.01; pole.add(grip);
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), M.glove);
        basket.position.y = -0.53; pole.add(basket);
        torso.add(sh);
        return { sh, elbow, pole };
    };
    const AL = mkArm(-0.155), AR = mkArm(0.155);

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
        L.ski.visible = R.ski.visible = !on; carried.visible = !!on;
        AL.pole.visible = AR.pole.visible = !on;
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
    };
    /**
     * Ganze Haltung in einem Aufruf.
     *   bendL/bendR  Kniebeuge je Bein        swingL/swingR  Schrittschwung
     *   plough       Pflug (0…1)              lean           Oberkörper vor
     *   armX, elbow  Arme vor, Ellbogen       armOut         Arme seitlich
     *   pole         Stockwinkel              sit            sitzend (Sessel): Oberschenkel waagerecht
     */
    ud.setPose = (p) => {
        if (p.sit) {
            for (const [leg, s] of [[L, -1], [R, 1]]) {
                leg.hip.rotation.set(-1.45, 0, s * 0.03); leg.knee.rotation.x = 1.25; leg.ankle.rotation.set(0.2, 0, 0);
            }
            body.position.y = 0;
        } else {
            const dl = setLeg(L, p.bendL ?? 0, p.swingL ?? 0, -(p.plough ?? 0) * 0.16, -1);
            const dr = setLeg(R, p.bendR ?? 0, p.swingR ?? 0, -(p.plough ?? 0) * 0.16, 1);
            // Pflug: Skispitzen zusammen
            L.ankle.rotation.y = -(p.plough ?? 0) * 0.3; R.ankle.rotation.y = (p.plough ?? 0) * 0.3;
            body.position.y = -Math.min(dl, dr);
        }
        const lean = p.lean ?? 0;
        torso.rotation.set(lean, 0, 0);
        head.rotation.x = -lean * 0.75;                       // der Blick bleibt nach vorn gerichtet
        setArm(AL, p.armX ?? 0, p.elbow ?? 0, (p.armOut ?? 0.12) + (p.armOutL ?? 0), -1, p.pole ?? 0.5, lean);
        setArm(AR, p.armXR ?? p.armX ?? 0, p.elbow ?? 0, (p.armOut ?? 0.12) + (p.armOutR ?? 0), 1, p.pole ?? 0.5, lean);
    };
    /** Höhe der Hüfte über den Füßen (für das Sitzen im Sessel). */
    ud.hipY = HIP_Y;
    ud.setPose({});
    g.scale.setScalar(PLAYER_SCALE);
    return g;
}
