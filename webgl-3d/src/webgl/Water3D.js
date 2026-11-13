// Wasser im 3D-Gelände: Seen und Bäche als EINE zusammenhängende, glatte Fläche.
//
// Früher war Wasser blau angemaltes Gelände mit einer dünnen Folie darüber, Bäche
// bestanden aus einzelnen Kacheln mit durchlaufender Textur – man sah eine Treppe aus
// blauen und weißen Quadraten. Jetzt:
//   1. prepareWater  gräbt Seebecken und Bachbetten ein Stück ins Gelände (vor dem Bau
//                    des Geländenetzes) und merkt sich Spiegelhöhe und Wassertiefe.
//   2. buildWater    spannt eine Fläche über alle Wasserpunkte und ihren Ufersaum. Das
//                    Ufer entsteht dort, wo das Gelände aus dem Wasser taucht; ein
//                    Shader macht daraus Tiefe (flach = hell, tief = dunkel), Wellen,
//                    Himmelsspiegelung, Sonnenglanz, Ufersaum und – im Bach – Strömung
//                    mit Schaum an den Stromschnellen.
import * as THREE from 'three';

const sm01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const WATER = 2;                 // landcover-Kennung für Wasser
const LAKE_SPAN = 1.6;           // bis zu diesem Höhenunterschied (Weltmeter) gilt ein Gewässer als See
const NEIGH4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Gewässer erfassen und ihr Bett ins Gelände graben. Verändert `world.heightmap` an den
 * Wasserpunkten und legt `world.waterDepth` an (Tiefe je Rasterpunkt, für die Bodenfarbe).
 * Muss laufen, BEVOR das Geländenetz gebaut wird.
 */
export function prepareWater(world, gridSize, opts = {}) {
    const { heightmap, landcover } = world;
    const hScale = opts.hScale ?? 0.09;
    const G = gridSize, N = G * G;
    const h0 = Float32Array.from(heightmap);              // Höhen vor dem Eingraben
    const groupOf = new Int32Array(N).fill(-1);
    const groups = [];
    const stack = [];
    for (let s = 0; s < N; s++) {
        if (landcover[s] !== WATER || groupOf[s] >= 0) continue;
        const id = groups.length, pts = [];
        let lo = Infinity, hi = -Infinity, rimLo = Infinity;
        stack.length = 0; stack.push(s); groupOf[s] = id;
        while (stack.length) {
            const i = stack.pop(); pts.push(i);
            const h = h0[i] * hScale; if (h < lo) lo = h; if (h > hi) hi = h;
            const x = i % G, y = (i / G) | 0;
            for (const [dx, dy] of NEIGH4) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
                const j = ny * G + nx;
                if (landcover[j] !== WATER) { const r = h0[j] * hScale; if (r < rimLo) rimLo = r; continue; }
                if (groupOf[j] < 0) { groupOf[j] = id; stack.push(j); }
            }
        }
        const lake = pts.length >= 6 && (hi - lo) <= LAKE_SPAN;
        // Seespiegel: knapp unter dem tiefsten Uferpunkt – so läuft nirgends Wasser über die Wiese
        const level = lake ? Math.min(lo + 0.03, (Number.isFinite(rimLo) ? rimLo : lo) - 0.03) : NaN;
        groups.push({ pts, lo, hi, lake, level });
    }
    // Abstand zum Ufer in Schritten (1 = direkt am Ufer), für die Tiefe des Betts
    const shore = new Uint8Array(N);
    let frontier = [];
    for (let i = 0; i < N; i++) {
        if (landcover[i] !== WATER) continue;
        const x = i % G, y = (i / G) | 0;
        for (const [dx, dy] of NEIGH8) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= G || ny >= G || landcover[ny * G + nx] !== WATER) { shore[i] = 1; frontier.push(i); break; }
        }
    }
    for (let d = 2; d <= 6 && frontier.length; d++) {
        const next = [];
        for (const i of frontier) {
            const x = i % G, y = (i / G) | 0;
            for (const [dx, dy] of NEIGH4) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
                const j = ny * G + nx;
                if (landcover[j] === WATER && shore[j] === 0) { shore[j] = d; next.push(j); }
            }
        }
        frontier = next;
    }
    const depth = new Float32Array(N);                    // Wassertiefe in Weltmetern (> 0 im Wasser)
    const surface = new Float32Array(N).fill(NaN);        // Spiegelhöhe je Wasserpunkt (Weltmeter)
    for (const g of groups) {
        for (const i of g.pts) {
            const step = Math.max(1, shore[i] || 6) - 1;  // 0 am Ufer, wächst zur Mitte
            const ground = h0[i] * hScale;
            if (g.lake) {
                // Becken: am Ufer flach, zur Mitte bis gut einen Meter tief
                const bed = Math.min(ground, g.level - (0.16 + 0.30 * Math.min(step, 3)));
                heightmap[i] = bed / hScale;
                depth[i] = g.level - bed;
                surface[i] = g.level;
            } else {
                // Bach: schmales Bett, der Spiegel folgt dem Gefälle des Geländes
                const d = 0.14 + 0.09 * Math.min(step, 2);
                surface[i] = ground - 0.05;
                heightmap[i] = (surface[i] - d) / hScale;
                depth[i] = d;
            }
        }
    }
    world.waterDepth = depth;
    return { groups, groupOf, depth, surface, h0, hScale };
}

/** Bodenfarbe unter Wasser: am Ufer heller Kies, zur Tiefe hin dunkel (für das Geländenetz). */
export function waterBedColor(depth) {
    const k = sm01((depth - 0.14) / 0.75);
    return [0.46 + (0.10 - 0.46) * k, 0.52 + (0.20 - 0.52) * k, 0.55 + (0.28 - 0.55) * k];
}

const VERT = /* glsl */`
    attribute float aDepth;
    attribute float aEdge;
    attribute float aFoam;
    attribute float aKind;
    attribute vec2 aFlow;
    varying vec3 vWorld;
    varying float vDepth;
    varying float vEdge;
    varying float vFoam;
    varying float vKind;
    varying vec2 vFlow;
    #include <fog_pars_vertex>
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vDepth = aDepth; vEdge = aEdge; vFoam = aFoam; vKind = aKind; vFlow = aFlow;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }`;

const FRAG = /* glsl */`
    uniform float uTime;
    uniform float uDay;          // 1 = heller Tag, 0 = Nacht
    uniform vec3 uSunDir;
    uniform vec3 uSunCol;
    uniform vec3 uZenith;
    uniform vec3 uHorizon;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    varying vec3 vWorld;
    varying float vDepth;
    varying float vEdge;
    varying float vFoam;
    varying float vKind;
    varying vec2 vFlow;
    #include <fog_pars_fragment>

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    // Wellenhöhe: zwei Lagen, die gegeneinander wandern. Im Bach schiebt die Strömung beide stromab.
    float wave(vec2 p) {
        vec2 drift = vFlow * uTime;
        float a = noise((p - drift) * 1.6 + vec2(uTime * 0.10, uTime * 0.06));
        float b = noise((p - drift * 1.4) * 4.1 - vec2(uTime * 0.17, -uTime * 0.12));
        return a * 0.62 + b * 0.38;
    }
    void main() {
        vec2 p = vWorld.xz;
        float speed = length(vFlow);
        // Oberflächennormale aus dem Wellenfeld (Bäche unruhiger als Seen)
        float e = 0.14;
        float h = wave(p), hx = wave(p + vec2(e, 0.0)), hz = wave(p + vec2(0.0, e));
        float amp = mix(0.055, 0.13, clamp(vKind + speed * 0.3, 0.0, 1.0));
        vec3 N = normalize(vec3((h - hx) * amp / e, 1.0, (h - hz) * amp / e));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);

        // Die Uferlinie folgt sonst dem Raster des Geländes; ein weiches Rauschen lässt sie
        // unregelmäßig aus- und einbuchten
        float depth = vDepth + (noise(p * 0.85 + 17.0) - 0.5) * 0.15 * smoothstep(0.6, 0.0, vDepth);
        // Wasserkörper: flach = hell und türkis, tief = dunkel
        float deep = smoothstep(0.05, 0.95, depth);
        vec3 body = mix(uShallow, uDeep, deep);
        // Spiegelung des Himmels: flacher Blick spiegelt den hellen Horizont, steiler den Zenit
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, clamp(R.y * 1.5, 0.0, 1.0));
        vec3 col = mix(body, sky, 0.16 + 0.60 * fres);
        col *= 0.42 + 0.58 * uDay;                               // nachts dunkler
        // Sonnen- bzw. Mondglanz
        float glint = pow(max(dot(R, uSunDir), 0.0), 240.0) + 0.25 * pow(max(dot(R, uSunDir), 0.0), 40.0);
        col += uSunCol * glint * (0.25 + 0.95 * uDay);

        // Schaum: schmaler Saum am Ufer, laufende Streifen in den Stromschnellen
        float inWater = step(0.0, depth);
        float shoreline = (1.0 - smoothstep(0.03, 0.17, depth)) * inWater;
        float lace = 0.45 + 0.55 * noise(p * 5.5 + vec2(uTime * 0.25, -uTime * 0.18));
        vec2 dir = speed > 0.001 ? vFlow / speed : vec2(1.0, 0.0);
        float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
        float streak = noise(vec2(along * 1.9 - uTime * speed * 2.6, across * 4.6));
        float rapids = vFoam * smoothstep(0.42, 0.78, streak);
        float foam = clamp(shoreline * lace * 0.75 + rapids, 0.0, 1.0);
        col = mix(col, vec3(0.94, 0.97, 0.99) * (0.50 + 0.50 * uDay), foam);

        // Deckkraft: zum Ufer hin läuft das Wasser durchsichtig aus
        float alpha = smoothstep(-0.03, 0.15, depth) * smoothstep(0.0, 0.5, vEdge) * mix(0.80, 0.97, deep);
        alpha = max(alpha, foam * inWater * smoothstep(0.0, 0.5, vEdge));
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
    }`;

/**
 * Wasserfläche bauen (nach prepareWater und nach allem, was das Gelände noch einebnet).
 * @returns {THREE.Group|null} mit userData.update(dt) und userData.setEnv({day, sunDir, sunColor, zenith, horizon})
 */
export function buildWater(world, gridSize, info, opts = {}) {
    const { heightmap, landcover } = world;
    const { groups, groupOf, surface, h0, hScale } = info;
    const tile = opts.tileSize ?? 1;
    const G = gridSize;
    const half = ((G - 1) * tile) / 2;
    if (!groups.length) return null;
    const isW = (x, y) => x >= 0 && y >= 0 && x < G && y < G && landcover[y * G + x] === WATER;

    // Eckpunkte: Wasserpunkte und ihr Ufersaum (Landpunkte direkt neben Wasser)
    const vIndex = new Map();
    const pos = [], aDepth = [], aEdge = [], aFoam = [], aKind = [], aFlow = [];
    const vertex = (x, y) => {
        const i = y * G + x;
        let vi = vIndex.get(i);
        if (vi !== undefined) return vi;
        const water = landcover[i] === WATER;
        const ground = (heightmap[i] || 0) * hScale;
        let ySurf, kind = 0;
        if (water) {
            ySurf = surface[i];
            kind = groups[groupOf[i]].lake ? 0 : 1;
        } else {
            // Ufersaum: Spiegelhöhe der angrenzenden Wasserpunkte (Mittel) – die Fläche taucht
            // dort unter das Gelände, statt die Böschung hinaufzulaufen
            let sum = 0, n = 0, river = 0;
            for (const [dx, dy] of NEIGH8) {
                if (!isW(x + dx, y + dy)) continue;
                const j = (y + dy) * G + (x + dx);
                sum += surface[j]; n++;
                if (!groups[groupOf[j]].lake) river++;
            }
            ySurf = n ? sum / n : ground;
            kind = river > 0 ? 1 : 0;
        }
        // Strömung: Gefälle des ursprünglichen Geländes (nur im Bach)
        let fx = 0, fz = 0, foam = 0;
        if (kind === 1) {
            const xa = Math.max(0, x - 1), xb = Math.min(G - 1, x + 1), ya = Math.max(0, y - 1), yb = Math.min(G - 1, y + 1);
            const gx = (h0[y * G + xa] - h0[y * G + xb]) * hScale / ((xb - xa) * tile || 1);
            const gz = (h0[ya * G + x] - h0[yb * G + x]) * hScale / ((yb - ya) * tile || 1);
            const slope = Math.hypot(gx, gz);
            const sp = Math.max(0.35, Math.min(1.7, 0.35 + slope * 3.2));     // Fließtempo
            if (slope > 1e-5) { fx = gx / slope * sp; fz = gz / slope * sp; }
            foam = sm01((slope - 0.16) / 0.34);                               // Stromschnellen
        }
        vi = pos.length / 3;
        vIndex.set(i, vi);
        pos.push(x * tile - half, ySurf, y * tile - half);
        aDepth.push(ySurf - ground);
        aEdge.push(water ? 1 : 0);
        aFoam.push(foam);
        aKind.push(kind);
        aFlow.push(fx, fz);
        return vi;
    };

    const index = [];
    for (let y = 0; y < G - 1; y++) {
        for (let x = 0; x < G - 1; x++) {
            const w00 = isW(x, y), w10 = isW(x + 1, y), w01 = isW(x, y + 1), w11 = isW(x + 1, y + 1);
            if (!(w00 || w10 || w01 || w11)) continue;
            const a = vertex(x, y), b = vertex(x + 1, y), c = vertex(x + 1, y + 1), d = vertex(x, y + 1);
            // Diagonale so legen, dass sie zwei Wasserpunkte verbindet – sonst reißt ein
            // schräg laufender Bach an jeder Kachel zu einzelnen Rauten auf
            const alongAC = (w00 && w11) && !(w10 && w01);
            const alongBD = (w10 && w01) && !(w00 && w11);
            if (alongBD && !alongAC) index.push(a, d, b, b, d, c);
            else index.push(a, c, b, a, d, c);
        }
    }
    if (!index.length) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(aDepth, 1));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(aEdge, 1));
    geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(aFoam, 1));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(aKind, 1));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(aFlow, 2));
    geo.setIndex(index);

    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uDay: { value: 1 },
        uSunDir: { value: new THREE.Vector3(-0.4, 0.8, 0.4).normalize() },
        uSunCol: { value: new THREE.Color(1.0, 0.96, 0.86) },
        uZenith: { value: new THREE.Color(0.30, 0.50, 0.74) },
        uHorizon: { value: new THREE.Color(0.74, 0.84, 0.92) },
        uDeep: { value: new THREE.Color(0.05, 0.19, 0.33) },
        uShallow: { value: new THREE.Color(0.24, 0.50, 0.58) }
    }]);
    const mat = new THREE.ShaderMaterial({
        uniforms, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, fog: true,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;                        // nach dem Gelände, vor Schneeflocken und Glas

    const group = new THREE.Group();
    group.add(mesh);
    group.userData.update = (dt) => { uniforms.uTime.value = (uniforms.uTime.value + dt) % 3600; };
    /** Tageslicht nachführen (Himmel spiegelt sich im Wasser). */
    group.userData.setEnv = (env) => {
        if (env.day != null) uniforms.uDay.value = env.day;
        if (env.sunDir) uniforms.uSunDir.value.copy(env.sunDir).normalize();
        if (env.sunColor) uniforms.uSunCol.value.copy(env.sunColor);
        if (env.zenith) uniforms.uZenith.value.copy(env.zenith);
        if (env.horizon) uniforms.uHorizon.value.copy(env.horizon);
    };
    return group;
}
