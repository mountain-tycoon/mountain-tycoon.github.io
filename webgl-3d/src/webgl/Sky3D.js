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

/**
 * FERNE BERGKETTEN als Kulisse rings um die Karte.
 *
 * Wichtig für die Bildwirkung: die Ketten dürfen NICHT als konzentrische
 * Ringe lesbar sein. Deshalb
 *   - laufen die Bergfüße über Vertex-Transparenz weich in den Himmel aus
 *     (kein Dunst-Zylinder mehr, der als Kreis sichtbar war),
 *   - liegen die Ebenen unterschiedlich weit weg UND unterschiedlich hoch,
 *   - sind sie gegeneinander verdreht, damit sich Gipfel nie decken,
 *   - nähert sich die Farbe nach hinten immer stärker dem Himmel an.
 */
export function makeDistantRanges(worldSpan, opts = {}) {
    // Charakter der Kulisse je Level:
    //   rugged  0..1  Zackigkeit — Hochgebirge bekommt schroffe Grate
    //   forest  0..1  angedeutete Bewaldung an den unteren Hängen
    //   glacier 0..1  Gletscherzungen zwischen den höchsten Gipfeln
    const RUGGED = opts.rugged ?? 0.4;
    const FOREST = opts.forest ?? 0.5;
    const GLACIER = opts.glacier ?? 0.2;
    const group = new THREE.Group();
    group.renderOrder = -900;

    // Himmelston, gegen den die Ketten ausbleichen — je ferner, desto näher
    // liegt die Bergfarbe an diesem Wert.
    const SKY = new THREE.Color(0xcddff0);

    const LAYERS = [
        // r = Entfernung, h = Höhe, jag = Zackigkeit, fade = Annäherung an den Himmel
        { r: worldSpan * 1.30, h: 34, jag: 0.42, col: 0x53749b, fade: 0.30, snow: 0.46, seg: 190, seed: 11, rot: 0.0,  y: -14 },
        { r: worldSpan * 1.70, h: 52, jag: 0.34, col: 0x6b8cb0, fade: 0.46, snow: 0.38, seg: 165, seed: 29, rot: 0.7,  y: -18 },
        { r: worldSpan * 2.20, h: 72, jag: 0.26, col: 0x86a4c2, fade: 0.62, snow: 0.30, seg: 140, seed: 47, rot: 1.5,  y: -24 },
        { r: worldSpan * 2.85, h: 96, jag: 0.18, col: 0x9fb7cf, fade: 0.78, snow: 0.20, seg: 120, seed: 71, rot: 2.4,  y: -32 }
    ];

    const materials = [];
    for (let li = 0; li < LAYERS.length; li++) {
        const L = LAYERS[li];
        const pos = [], col = [], azi = [], hgt = [];
        const base = new THREE.Color(L.col).lerp(SKY, L.fade);
        const snowC = new THREE.Color(0xf6faff).lerp(SKY, L.fade * 0.55);

        let sd = L.seed;
        const rnd = () => { sd = (sd * 1664525 + 1013904223) % 4294967296; return sd / 4294967296; };

        // Weiches Höhenprofil: mehrere Frequenzen, nach hinten immer sanfter.
        const heights = [];
        for (let i = 0; i <= L.seg; i++) {
            const a = (i / L.seg) * Math.PI * 2;
            const massif = Math.sin(a * 2 + L.seed * 0.7) * 0.55        // große Massive
                         + Math.sin(a * 3.7 + L.seed * 1.3) * 0.30;
            // Hochgebirge: kräftigere Hochfrequenz-Anteile = schroffere Grate
            const sharp = 1 + RUGGED * 1.5;
            const peaks  = Math.sin(a * 8.3 + L.seed * 2.1) * 0.16 * sharp
                         + Math.sin(a * 13.1 + L.seed) * 0.09 * sharp
                         + Math.sin(a * 21.7 + L.seed * 1.7) * 0.05 * RUGGED * 2.2;
            const grain  = (rnd() - 0.5) * L.jag * (1 + RUGGED * 0.9);
            heights.push(Math.max(0.18, 0.52 + massif * 0.38 + peaks + grain));
        }
        // Naht schließen und Profil glätten — keine harten Zacken am Horizont
        heights[L.seg] = heights[0];
        // Weniger glätten, wenn das Gebirge schroff sein soll — die vorderen
        // Ketten behalten dann ihre Grate, die fernen bleiben ruhig.
        const passes = RUGGED > 0.65 ? (li === 0 ? 0 : 1) : RUGGED > 0.35 ? 1 : 2;
        for (let pass = 0; pass < passes; pass++) {
            const sm = heights.slice();
            for (let i = 0; i <= L.seg; i++) {
                const a = heights[(i - 1 + L.seg) % L.seg], b = heights[i], c = heights[(i + 1) % L.seg];
                sm[i] = a * 0.25 + b * 0.5 + c * 0.25;
            }
            for (let i = 0; i <= L.seg; i++) heights[i] = sm[i];
        }

        const FOOT = L.y;                       // Fuß liegt unter dem Horizont
        // Farbe inkl. ALPHA: unten durchsichtig -> die Kette schwebt nicht
        // auf einer sichtbaren Kante, sondern verliert sich im Dunst.
        // Angedeutete Bewaldung: die vorderen Ketten bekommen an den unteren
        // Hängen einen Hauch Grün. Nach hinten verschwindet er im Dunst.
        const forestC = new THREE.Color(0x3f5f4c).lerp(SKY, 0.45 + L.fade * 0.5);
        const iceC = new THREE.Color(0xd6ecf7).lerp(SKY, L.fade * 0.4);
        const forestStrength = FOREST * Math.max(0, 1 - L.fade * 1.25) * 0.55;
        const tint = (hh, idx) => {
            const c = base.clone();
            // unten Wald, oben Schnee
            if (forestStrength > 0.01) {
                const low = Math.max(0, 1 - hh / 0.72);          // je tiefer, desto grüner
                // fleckig statt flächig: nur in manchen Abschnitten
                const patch = 0.5 + 0.5 * Math.sin(idx * 0.7 + L.seed);
                c.lerp(forestC, low * forestStrength * patch);
            }
            const t = Math.max(0, (hh - (1 - L.snow)) / Math.max(0.01, L.snow));
            c.lerp(snowC, Math.min(1, t * 1.2) * 0.35);   // Rest macht der Shader (fleckig)
            // Gletscherzunge: nur an wirklich hohen Gipfeln, schmal und selten
            if (GLACIER > 0.05 && hh > 0.82) {
                const tongue = Math.sin(idx * 1.31 + L.seed * 2.3);
                if (tongue > 0.72) {
                    const g = (tongue - 0.72) / 0.28;
                    c.lerp(iceC, g * GLACIER * 0.55);
                }
            }
            return c;
        };
        for (let i = 0; i < L.seg; i++) {
            const a0 = (i / L.seg) * Math.PI * 2 + L.rot;
            const a1 = ((i + 1) / L.seg) * Math.PI * 2 + L.rot;
            const x0 = Math.cos(a0) * L.r, z0 = Math.sin(a0) * L.r;
            const x1 = Math.cos(a1) * L.r, z1 = Math.sin(a1) * L.r;
            const y0 = heights[i] * L.h, y1 = heights[i + 1] * L.h;
            pos.push(x0, FOOT, z0,  x1, FOOT, z1,  x1, y1, z1);
            pos.push(x0, FOOT, z0,  x1, y1, z1,  x0, y0, z0);
            // Blickrichtung des Vertex (für die Sonnenbeleuchtung) und
            // normierte Gipfelhöhe (Grate fangen das Licht zuerst).
            for (const [aa, hh] of [[a0, 0], [a1, 0], [a1, heights[i + 1]],
                                    [a0, 0], [a1, heights[i + 1]], [a0, heights[i]]]) {
                azi.push(aa); hgt.push(hh);
            }
            const cA = tint(heights[i], i), cC = tint(heights[i + 1], i + 1);
            const footA = 0.0;                  // unten voll transparent
            const topA = 0.92 - L.fade * 0.30;  // ferne Ketten insgesamt zarter
            const push = (c, a) => col.push(c.r, c.g, c.b, a);
            push(base, footA); push(base, footA); push(cC, topA);
            push(base, footA); push(cC, topA);   push(cA, topA);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));  // RGBA
        geo.setAttribute('aAzimuth', new THREE.Float32BufferAttribute(azi, 1));
        geo.setAttribute('aHeight', new THREE.Float32BufferAttribute(hgt, 1));
        // Eigener Shader: die Sonne beleuchtet die ihr ZUGEWANDTEN Flanken,
        // abgewandte Hänge bleiben kühl und dunkel. Bei tiefem Sonnenstand
        // glühen die Grate warm auf (Alpenglühen).
        const mat = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
            uniforms: {
                uTint:  { value: new THREE.Color(0xffffff) },
                uWarm:  { value: new THREE.Color(0xffb27a) },
                uCool:  { value: new THREE.Color(0x4c6a92) },
                uSunAz: { value: 0.0 },   // Azimut der Sonne
                uDay:   { value: 1.0 },   // 0 Nacht .. 1 Tag
                uGlow:  { value: 0.0 },   // Stärke des Abendrots
                uSnow:  { value: snowC.clone() },
                uSnowLine: { value: 1 - L.snow },
                uDetail: { value: Math.max(0.15, 1 - L.fade * 1.1) }   // vorn scharf, hinten Dunst
            },
            vertexShader: `
                attribute vec4 color;
                attribute float aAzimuth;
                attribute float aHeight;
                varying vec4 vCol;
                varying float vFace;
                varying float vHigh;
                varying float vAz;
                varying float vY;
                uniform float uSunAz;
                void main() {
                    vCol = color;
                    // 1 = direkt zur Sonne, 0 = von ihr abgewandt
                    vFace = cos(aAzimuth - uSunAz) * 0.5 + 0.5;
                    vHigh = aHeight;
                    vAz = aAzimuth;
                    vY = position.y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                varying vec4 vCol;
                varying float vFace;
                varying float vHigh;
                varying float vAz;
                varying float vY;
                uniform vec3 uTint; uniform vec3 uWarm; uniform vec3 uCool; uniform vec3 uSnow;
                uniform float uDay; uniform float uGlow; uniform float uDetail; uniform float uSnowLine;
                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                float vnoise(vec2 p) {
                    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
                }
                void main() {
                    vec3 c = vCol.rgb * uTint;
                    // ===== OBERFLÄCHE =====
                    // Statt glatter Pappkulisse: Felsbänder, Runsen und fleckiger
                    // Schnee aus Rauschen über Azimut und Höhe. uDetail blendet
                    // das nach hinten aus (Dunst verschluckt Details).
                    vec2 uv = vec2(vAz * 22.0, vY * 0.09);
                    float n1 = vnoise(uv * 2.0);
                    float n2 = vnoise(uv * 6.0 + 3.1);
                    float n3 = vnoise(uv * 14.0 + 7.7);
                    float rock = (n1 - 0.5) * 0.22 + (n2 - 0.5) * 0.12 + (n3 - 0.5) * 0.06;
                    // Runsen: schmale, dunkle Rinnen, die vom Grat abwärts laufen
                    float gully = smoothstep(0.42, 0.5, abs(sin(vAz * 46.0 + n1 * 5.0 + vY * 0.02)));
                    // Schneelinie mit fransigem Rand; Schnee hält nicht in den Runsen
                    float snow = smoothstep(uSnowLine - 0.16, uSnowLine + 0.10, vHigh + (n2 - 0.5) * 0.30 + (n3 - 0.5) * 0.10);
                    snow *= mix(0.55, 1.0, gully);
                    vec3 rockC = c * (1.0 + rock * uDetail) * mix(0.86, 1.0, mix(1.0, gully, uDetail));
                    vec3 snowC = uSnow * uTint * (1.0 + (n3 - 0.5) * 0.06 * uDetail);
                    c = mix(rockC, snowC, snow * uDetail + (1.0 - uDetail) * snow * 0.5);
                    // Grundmodellierung: Sonnenseite heller, Schattenseite kühler
                    float lit = smoothstep(0.25, 0.95, vFace);
                    c = mix(c * mix(0.72, 0.92, uDay), c, lit);
                    c = mix(c, c * 1.14, lit * uDay);
                    c = mix(c, mix(c, uCool, 0.32), (1.0 - lit) * (1.0 - uDay * 0.55));
                    // Gratlicht: die Kante zum Himmel fängt Licht
                    float ridge = smoothstep(0.86, 1.0, vHigh) * lit * uDay;
                    c = mix(c, c * 1.12 + 0.03, ridge * uDetail);
                    // Alpenglühen: nur hohe, der Sonne zugewandte Grate
                    float rim = smoothstep(0.55, 1.0, vFace) * smoothstep(0.5, 1.05, vHigh);
                    c = mix(c, uWarm, rim * uGlow * 0.85);
                    gl_FragColor = vec4(c, vCol.a);
                }`
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = -900 - (LAYERS.length - li);   // fernste zuerst
        mesh.frustumCulled = false;
        group.add(mesh);
        materials.push(mat);
        // ===== TIEFENMASKE =====
        // Die Ketten sind transparent und schreiben deshalb keine Tiefe —
        // ein Himmelskörper dahinter würde einfach durchscheinen. Dieses
        // unsichtbare Zwillingsnetz schreibt NUR Tiefe (colorWrite: false)
        // und sorgt dafür, dass der Mond hinter den Graten verschwindet.
        // polygonOffset ist hier NICHT optional: Maske und sichtbares Netz
        // benutzen dieselbe Geometrie. Ohne Versatz liegen ihre Tiefenwerte
        // exakt aufeinander, der Tiefentest des sichtbaren Netzes fällt je
        // nach Rundung mal so und mal so aus — genau das flimmerte bei jeder
        // Kamerabewegung. Die Maske wird deshalb minimal nach HINTEN
        // geschoben, damit die sichtbare Kette immer davor liegt.
        const occ = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            colorWrite: false, depthWrite: true, depthTest: true,
            polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 12,
            side: THREE.DoubleSide, fog: false }));
        occ.renderOrder = -950 - (LAYERS.length - li);
        occ.frustumCulled = false;
        group.add(occ);
    }

    // Beleuchtung zur Laufzeit setzen: Tönung, Sonnenrichtung, Tageszeit und
    // Stärke des Abendrots. Damit reagiert die ganze Kulisse auf den Sonnenlauf.
    const WHITE = new THREE.Color(0xffffff);
    group.userData.setLight = ({ tint, sunAz = 0, day = 1, glow = 0, warm }) => {
        for (const m of materials) {
            const u = m.uniforms;
            if (tint) { u.uTint.value.copy(tint); u.uTint.value.lerp(WHITE, 0.5 + day * 0.38); }
            if (warm) u.uWarm.value.copy(warm);
            u.uSunAz.value = sunAz;
            u.uDay.value = day;
            u.uGlow.value = glow;
        }
    };
    // Abwärtskompatibel: alte Aufrufe setzen nur die Tönung.
    group.userData.setTint = (c, day = 1) => group.userData.setLight({ tint: c, day });
    return group;
}

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
    // depthTest AN: der Mond steht weiter draussen als die Bergketten und
    // wird von deren Tiefenmaske verdeckt (siehe makeDistantRanges ->
    // occluder). Ohne das schwebte er über den Gipfeln.
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
