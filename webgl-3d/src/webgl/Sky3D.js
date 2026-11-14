import * as THREE from 'three';

// Weiche Wolken-Billboards, die langsam über die Karte driften.
export function makeClouds(worldSpan, count = 10, baseY = null) {
    const group = new THREE.Group();
    // weiche Wolken-Textur (radiale Puschel)
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 7; i++) {
        const x = 30 + Math.random() * 68, y = 40 + Math.random() * 48, r = 18 + Math.random() * 26;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.85)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    const clouds = [];
    for (let i = 0; i < count; i++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
        const scl = worldSpan * (0.12 + Math.random() * 0.14);
        spr.scale.set(scl * 1.7, scl, 1);
        // Höhe: deutlich über dem höchsten Gipfel (baseY), sonst hängt die
        // Kamera in der Übersicht ständig in den Wolken.
        const y = baseY != null ? baseY + worldSpan * (0.10 + Math.random() * 0.16) : worldSpan * (0.32 + Math.random() * 0.18);
        spr.position.set((Math.random() - 0.5) * worldSpan * 1.4, y, (Math.random() - 0.5) * worldSpan * 1.4);
        group.add(spr);
        clouds.push({ spr, speed: 0.4 + Math.random() * 0.6 });
    }
    group.userData.update = (dt) => {
        for (const c of clouds) {
            c.spr.position.x += c.speed * dt;
            if (c.spr.position.x > worldSpan * 0.75) c.spr.position.x = -worldSpan * 0.75;
        }
    };
    return group;
}

/**
 * VERLAUFS-HIMMELSKUPPEL: ersetzt die flache Hintergrundfarbe durch einen
 * echten Farbverlauf vom tiefen Zenitblau zum hellen, leicht dunstigen
 * Horizont. Die Farben lassen sich zur Laufzeit setzen (Tag/Abend).
 */
export function makeSkyDome(radius = 900) {
    const geo = new THREE.SphereGeometry(radius, 32, 20);
    const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
            topCol: { value: new THREE.Color(0x3d79b4) },
            midCol: { value: new THREE.Color(0x9ecbe8) },
            botCol: { value: new THREE.Color(0xe4eef6) },
            horizon: { value: 0.02 }
        },
        vertexShader: `
            varying float vH;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vH = normalize(wp.xyz).y;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: `
            uniform vec3 topCol; uniform vec3 midCol; uniform vec3 botCol;
            uniform float horizon;
            varying float vH;
            void main() {
                float h = clamp(vH, -1.0, 1.0);
                // unterhalb des Horizonts in den Dunst auslaufen lassen
                // Sanfterer Aufbau: der Horizontdunst reicht deutlich höher
                // hinauf und geht weich ins Mittelblau über — das lässt die
                // Bergkulisse mit dem Himmel verschmelzen.
                float t = clamp((h - horizon) / (1.0 - horizon), 0.0, 1.0);
                vec3 c = mix(midCol, topCol, pow(t, 1.35));
                c = mix(botCol, c, smoothstep(horizon - 0.02, horizon + 0.34, h));
                gl_FragColor = vec4(c, 1.0);
            }`
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    dome.userData.setColors = (top, mid, bot) => {
        mat.uniforms.topCol.value.copy(top);
        mat.uniforms.midCol.value.copy(mid);
        mat.uniforms.botCol.value.copy(bot);
    };
    return dome;
}

// (Die Bergkulisse ist kein Ring aus Silhouetten mehr: das Umland ist echtes Gelände, siehe Surround3D.js.)

/**
 * VOGELSCHWARM: ein paar Greifvögel kreisen langsam über dem Gebiet. Kleine
 * Silhouetten-Sprites mit Flügelschlag — rein atmosphärisch, aber die
 * Bewegung am Himmel macht die Kulisse lebendig.
 */
export function makeBirds(worldSpan, count = 7) {
    const group = new THREE.Group();
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const g = cv.getContext('2d');
    g.strokeStyle = 'rgba(28,32,40,0.95)'; g.lineWidth = 3.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(4, 22); g.quadraticCurveTo(18, 6, 32, 18); g.quadraticCurveTo(46, 6, 60, 22); g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    const birds = [];
    for (let i = 0; i < count; i++) {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
        const sp = new THREE.Sprite(mat);
        const s = 1.6 + Math.random() * 1.2;
        sp.scale.set(s * 2, s, 1);
        group.add(sp);
        birds.push({ sp, s,
            cx: (Math.random() - 0.5) * worldSpan * 0.6, cz: (Math.random() - 0.5) * worldSpan * 0.6,
            r: worldSpan * (0.06 + Math.random() * 0.08), h: worldSpan * (0.22 + Math.random() * 0.12),
            w: (0.06 + Math.random() * 0.05) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 7,
            flap: 3 + Math.random() * 3, drift: (Math.random() - 0.5) * 0.4 });
    }
    group.userData.update = (t, night = 0) => {
        for (const b of birds) {
            const a = t * b.w + b.ph;
            b.cx += b.drift * 0.016;
            if (Math.abs(b.cx) > worldSpan * 0.4) b.drift = -b.drift;
            b.sp.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.3 + b.ph) * 2.5, b.cz + Math.sin(a) * b.r);
            // Flügelschlag: kurze Schlagphasen, dazwischen Gleiten
            const beat = Math.sin(t * b.flap + b.ph);
            const glide = Math.sin(t * 0.4 + b.ph * 2) > 0.2;
            b.sp.scale.y = b.s * (glide ? 0.55 : 0.45 + Math.abs(beat) * 0.6);
            b.sp.material.opacity = 0.85 * (1 - night);    // nachts unsichtbar
        }
    };
    return group;
}

/* ===================================================================
 *  MOND
 *  ------------------------------------------------------------------
 *  Eine Mondscheibe mit echter Oberfläche (Maria, Krater, heller Rand)
 *  und wechselnder Phase. Die Phase wird NICHT jeden Frame neu gezeichnet
 *  — das Canvas wird nur beim Wechsel neu gerendert und dann als Textur
 *  hochgeladen. Dazu ein weicher Hof und, weil ein Mond ohne Sterne
 *  seltsam allein wirkt, ein feines Sternenfeld.
 * =================================================================== */

/** Zeichnet die Mondscheibe mit Phasenschatten in ein Canvas. */
function paintMoon(cv, phase) {
    const S = cv.width, R = S * 0.42, C = S / 2;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, S, S);
    // ---- Grundscheibe mit leichtem Randabfall ----
    const g1 = c.createRadialGradient(C - R * 0.18, C - R * 0.18, R * 0.1, C, C, R);
    g1.addColorStop(0, '#fdfcf6');
    g1.addColorStop(0.72, '#e8e6dc');
    g1.addColorStop(1, '#c9c7bd');
    c.beginPath(); c.arc(C, C, R, 0, 6.2832); c.closePath();
    c.fillStyle = g1; c.fill();
    // ---- Mare: dunkle Basaltebenen, fest verteilt (der Mond dreht sich nicht) ----
    const mare = [[-0.30, -0.26, 0.30], [0.10, -0.36, 0.20], [-0.06, 0.02, 0.26],
                  [0.30, 0.10, 0.17], [-0.34, 0.28, 0.15], [0.06, 0.36, 0.13]];
    c.globalAlpha = 0.30; c.fillStyle = '#8d8b83';
    for (const [mx, my, mr] of mare) {
        c.beginPath();
        c.ellipse(C + mx * R, C + my * R, mr * R, mr * R * 0.82, mx * 2, 0, 6.2832);
        c.fill();
    }
    // ---- Krater: heller Wall, dunkler Boden ----
    c.globalAlpha = 1;
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 46; i++) {
        const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * R * 0.93;
        const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
        const cr = (0.012 + rnd() * 0.055) * R * 2;
        c.globalAlpha = 0.22 + rnd() * 0.2;
        c.beginPath(); c.arc(x, y, cr, 0, 6.2832);
        c.fillStyle = '#9d9b92'; c.fill();
        c.globalAlpha = 0.30;
        c.beginPath(); c.arc(x - cr * 0.18, y - cr * 0.18, cr * 0.82, 0, 6.2832);
        c.fillStyle = '#ffffff'; c.fill();
    }
    // ---- Strahlenkrater (Tycho) ----
    c.globalAlpha = 0.16; c.strokeStyle = '#ffffff'; c.lineWidth = S * 0.006;
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * 6.2832 + 0.3;
        c.beginPath();
        c.moveTo(C - R * 0.1, C + R * 0.52);
        c.lineTo(C - R * 0.1 + Math.cos(a) * R * (0.5 + (i % 3) * 0.2),
                 C + R * 0.52 + Math.sin(a) * R * (0.5 + (i % 3) * 0.2));
        c.stroke();
    }
    c.globalAlpha = 1;
    // ---- PHASE ----
    // phase 0 = Neumond, 0.5 = Vollmond, 1 = wieder Neumond.
    // Der Terminator ist die Projektion eines Halbkreises: seine Breite
    // folgt cos(2*pi*phase). Vorzeichen entscheidet, ob die Sichel links
    // oder rechts steht (zunehmend/abnehmend).
    const k = Math.cos(phase * Math.PI * 2);        // +1 Neumond, -1 Vollmond
    c.globalCompositeOperation = 'destination-in';
    c.beginPath();
    if (phase < 0.5) {
        // zunehmend: rechte Hälfte hell
        c.arc(C, C, R, -Math.PI / 2, Math.PI / 2, false);
        c.ellipse(C, C, R * Math.abs(k), R, 0, Math.PI / 2, -Math.PI / 2, k < 0);
    } else {
        // abnehmend: linke Hälfte hell
        c.arc(C, C, R, Math.PI / 2, -Math.PI / 2, false);
        c.ellipse(C, C, R * Math.abs(k), R, 0, -Math.PI / 2, Math.PI / 2, k > 0);
    }
    c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.globalCompositeOperation = 'source-over';
}

/**
 * Mond als Billboard. Rückgabe:
 *   group      in die Szene hängen
 *   setPhase(p)  0..1, zeichnet nur bei echter Änderung neu
 *   setLook(pos, camPos, night)  Position, Ausrichtung, Sichtbarkeit
 */
export function makeMoon(size = 60) {
    const group = new THREE.Group();
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    let phase = -1;
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    // depthTest AN: der Mond steht weiter draußen als die Berge des Umlands und
    // wird von ihnen verdeckt. Ohne das schwebte er über den Gipfeln.
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false,
            depthTest: true, fog: false, opacity: 1 }));
    disc.renderOrder = -800;          // nach den Ketten, vor allem Übrigen
    group.add(disc);
    // Hof: additiv, damit er den Himmel aufhellt statt ihn abzudecken
    const hcv = document.createElement('canvas'); hcv.width = hcv.height = 128;
    {
        const hc = hcv.getContext('2d');
        const gr = hc.createRadialGradient(64, 64, 6, 64, 64, 64);
        gr.addColorStop(0, 'rgba(205,220,250,0.20)');
        gr.addColorStop(0.30, 'rgba(190,208,245,0.07)');
        gr.addColorStop(1, 'rgba(175,198,240,0)');
        hc.fillStyle = gr; hc.fillRect(0, 0, 128, 128);
    }
    // Der Hof war deutlich zu präsent — kleiner und viel schwächer.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 3.0, size * 3.0),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hcv), transparent: true,
            depthWrite: false, depthTest: true, fog: false,
            blending: THREE.AdditiveBlending, opacity: 0.25 }));
    halo.position.z = -0.5;
    halo.renderOrder = -801;
    group.add(halo);
    group.visible = false;

    const setPhase = (p) => {
        const q = ((p % 1) + 1) % 1;
        if (Math.abs(q - phase) < 0.004) return;
        phase = q;
        paintMoon(cv, q);
        tex.needsUpdate = true;
        // Bei Neumond bleibt fast nichts übrig — dann auch den Hof dämpfen.
        const lit = 0.5 - 0.5 * Math.cos(q * Math.PI * 2);   // 0 Neumond, 1 Vollmond
        halo.material.opacity = 0.04 + lit * 0.20;
        group.userData.lit = lit;
    };
    setPhase(0.5);

    /** `night` 0..1 — tagsüber blendet der Mond fast ganz aus. */
    const setLook = (pos, camPos, night) => {
        const vis = night > 0.04;
        group.visible = vis;
        if (!vis) return;
        group.position.copy(pos);
        group.lookAt(camPos);
        const lit = group.userData.lit ?? 1;
        // Insgesamt zurückhaltender: der Mond soll am Himmel STEHEN, nicht
        // ihn beherrschen. Voll sichtbar erst in tiefer Nacht.
        const n2 = Math.max(0, (night - 0.18) / 0.82);
        disc.material.opacity = Math.min(1, n2 * 1.1) * (0.18 + lit * 0.50);
        halo.material.opacity = (0.03 + lit * 0.16) * n2;
    };
    return { group, setPhase, setLook };
}
