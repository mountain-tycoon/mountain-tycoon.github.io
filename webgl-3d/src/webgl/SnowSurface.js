// Schneedecke als Material – für das Spielfeld UND das Umland dahinter.
//
// Früher wurde Schnee als Farbe in die Eckpunkte des Geländes gemalt: eine glatte, einfarbige
// Fläche, deren Schneegrenze dem Raster folgte. Jetzt entscheidet das Material für jeden
// Bildpunkt selbst, ob dort Schnee liegt und wie er aussieht:
//   - Schneegrenze: fleckig aufgelöst; Sonnenhänge apern früher aus, Schattenhänge halten ihn
//   - Steilflanken: der Schnee rutscht ab, gebänderter Fels schaut heraus (Neuschnee überzuckert ihn)
//   - Schatten auf Schnee sind blau (Himmelslicht), die Sonnenseite bleibt warm-weiß
//   - Oberfläche: Windrippen und Körnung in der Nähe, einzelne Kristalle glitzern in der Sonne
//   - unter Bäumen liegt der Schnee dünner und dunkler
// Die Eckfarbe des Geländes ist nur noch der UNTERGRUND (Wiese, Waldboden, Fels, Asphalt).
//
// Eckpunkt-Daten, die das Material erwartet:
//   color   Untergrund ohne Schnee
//   aSnow   liegender Neu-/Kunstschnee 0..1 (Spielfeld; das Umland rechnet ihn aus uFresh)
//   aMark   x: Anlagen-Einfärbung (0..1 eisig, ab 2 blaue Kantenlinie) · y: Kronendach 0..1
import * as THREE from 'three';

export const FRESH_BINS = 24;

/** Gemeinsame Stellgrößen für alle Schneeflächen einer Szene (einmal anlegen, überall einhängen). */
export function createSnowUniforms() {
    return {
        uSnowLine: { value: 0 },                                   // Welt-Y, ab der Naturschnee geschlossen liegt
        uSnowBand: { value: 1 },                                   // Höhe des Übergangs darunter (Welt)
        uFreshLoad: { value: 0 },                                  // frischer Schneefall 0..1 (überzuckert Fels)
        uSunDirW: { value: new THREE.Vector3(-0.4, 0.8, 0.4) },    // Richtung zur Sonne
        uSunCol: { value: new THREE.Color(1, 1, 1) },
        uShade: { value: new THREE.Color(0.78, 0.89, 1.10) },      // Tönung des Himmelslichts auf Schnee
        uRockCol: { value: new THREE.Color(0.42, 0.44, 0.48) },
        uSnowCol: { value: new THREE.Color(0.93, 0.95, 0.985) },
        uHorizon: { value: new THREE.Color(0.86, 0.91, 0.95) },    // Farbe des Himmels am Horizont
        uRim: { value: new THREE.Vector2(1e8, 2e8) },              // Randdunst: von/bis Abstand zur Kartenmitte
        uFresh: { value: new Float32Array(FRESH_BINS) },           // Neuschnee je Höhenstufe (Umland)
        uFreshTop: { value: 1 },                                   // Welt-Y der obersten Stufe
        uDetail: { value: 1 },                                     // Feinstruktur 0..1 (Qualitätsstufe)
        uTime: { value: 0 }
    };
}

const VERT_DECL = /* glsl */`
    attribute float aSnow;
    attribute vec2 aMark;
    varying float vSnowA;
    varying vec2 vMark;
    varying vec3 vSnowPos;
    varying vec3 vSnowN;
`;
const VERT_MAIN = /* glsl */`
    vSnowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vSnowN = normalize(mat3(modelMatrix) * objectNormal);
    vSnowA = aSnow; vMark = aMark;
`;

const FRAG_DECL = /* glsl */`
    uniform float uSnowLine, uSnowBand, uFreshLoad, uDetail, uTime;
    uniform vec3 uSunDirW, uSunCol, uShade, uRockCol, uSnowCol, uHorizon;
    uniform vec2 uRim;
    #ifdef SNOW_BINS
    uniform float uFresh[${FRESH_BINS}];
    uniform float uFreshTop;
    #endif
    varying float vSnowA;
    varying vec2 vMark;
    varying vec3 vSnowPos;
    varying vec3 vSnowN;
    float gSnowCover = 0.0;      // Schneedecke an diesem Bildpunkt
    float gSnowNear = 0.0;       // 1 nah an der Kamera .. 0 fern (Feinstruktur blendet aus)
    // Rauschen ohne Sinus: bleibt auch bei großen Koordinaten und auf Handys stabil
    float snHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    float snNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(snHash(i), snHash(i + vec2(1.0, 0.0)), f.x), mix(snHash(i + vec2(0.0, 1.0)), snHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float snFbm(vec2 p) { return snNoise(p) * 0.58 + snNoise(p * 2.13 + 7.1) * 0.28 + snNoise(p * 4.7 - 3.3) * 0.14; }
    // Windrippen: quer zum Wind eng, längs gestreckt – dazu feine Körnung
    float snRelief(vec2 q) {
        // die Rippen laufen nicht schnurgerade: ein weites Rauschfeld verbiegt sie
        vec2 b = q + vec2(snNoise(q * 0.07 + 2.0), snNoise(q * 0.07 - 5.0)) * 5.0;
        vec2 w = vec2(dot(b, vec2(0.83, 0.55)), dot(b, vec2(-0.55, 0.83)));
        return snNoise(vec2(w.x * 0.30, w.y * 1.05)) * 0.46 + snNoise(q * 1.9 + 3.0) * 0.32 + snNoise(q * 5.1) * 0.22;
    }
`;

// Nach <color_fragment>: diffuseColor.rgb enthält hier die Eckfarbe = Untergrund
const FRAG_COLOR = /* glsl */`
    {
        vec3 Nw = normalize(vSnowN);
        vec2 xz = vSnowPos.xz;
        float camDist = length(cameraPosition - vSnowPos);
        gSnowNear = (1.0 - smoothstep(70.0, 260.0, camDist)) * uDetail;
        float n1 = snFbm(xz * 0.021);                    // große Flecken
        float n2 = snNoise(xz * 0.17 + 11.0);            // mittlere
        float n3 = snNoise(xz * 0.9 + 5.0);              // feine
        float steep = 1.0 - Nw.y;                        // 0 eben .. 1 senkrecht

        // ---- Wo liegt Schnee? ----
        // Naturschnee oberhalb der Schneegrenze. Die Grenze löst sich fleckig auf; Hänge, die
        // zur Sonne geneigt sind, apern früher aus, Schattenhänge halten den Schnee länger.
        vec2 sunH = normalize(uSunDirW.xz + vec2(1e-4));
        float aspect = dot(Nw.xz, sunH);
        float line = uSnowLine + ((n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.5 + aspect * 1.6) * uSnowBand;
        float nat = smoothstep(line - uSnowBand, line, vSnowPos.y);
        // Neuschnee und Kunstschnee: bleibt auch unterhalb der Grenze liegen, bis er wegtaut
        #ifdef SNOW_BINS
            float ft = clamp(vSnowPos.y / uFreshTop, 0.0, 1.0) * ${(FRESH_BINS - 1).toFixed(1)};
            int fi = int(floor(ft));
            float fresh = mix(uFresh[fi], uFresh[min(fi + 1, ${FRESH_BINS - 1})], fract(ft));
        #else
            float fresh = vSnowA;
        #endif
        float fr = clamp(fresh + (n2 - 0.5) * 0.45 * (1.0 - abs(2.0 * fresh - 1.0)), 0.0, 1.0);
        float cover = max(nat, fr * fr * (3.0 - 2.0 * fr));

        // Steilflanken: der Schnee rutscht ab, Fels schaut heraus. Frischer Schneefall überzuckert ihn.
        float rockN = (n2 - 0.5) * 0.10 + (n3 - 0.5) * 0.07 * gSnowNear;
        float rockFace = smoothstep(0.13, 0.27, steep + rockN);
        float hold = 1.0 - smoothstep(0.16, 0.31, steep + rockN - uFreshLoad * 0.045);
        cover *= hold;
        // Unter dem Kronendach liegt weniger Schnee. Werte über 1 heißen „Wald aus der Ferne":
        // dort stehen nur einzelne Bäume, die Kronen werden in den Boden gezeichnet.
        float canopy = min(vMark.y, 1.0);
        float farWood = clamp(vMark.y - 1.0, 0.0, 1.0);
        cover *= 1.0 - canopy * 0.30 * (0.4 + 0.6 * n3);
        cover *= 1.0 - farWood * (0.50 + 0.25 * n2);

        // ---- Untergrund ----
        // Fels: gebändert (Schichten folgen der Höhe), fleckig, in Rinnen dunkler
        float strata = snNoise(vec2(vSnowPos.y * 0.62 + n1 * 3.0, dot(xz, vec2(0.045, 0.03))));
        vec3 rock = uRockCol * (0.80 + 0.38 * strata) * (0.90 + 0.22 * n2);
        vec3 ground = diffuseColor.rgb;
        // offenes Land ist fleckig: fahle und sattere Stellen, hier und da Braun
        ground *= 0.86 + 0.26 * n1;
        ground = mix(ground, ground * vec3(1.16, 1.02, 0.74), smoothstep(0.45, 0.9, n2) * 0.35 * (1.0 - canopy));
        // ferner Wald: Kronen von oben, bei Schneefall überzuckert
        vec3 crowns = mix(vec3(0.11, 0.20, 0.14), vec3(0.20, 0.30, 0.19), n2);
        crowns = mix(crowns, vec3(0.70, 0.76, 0.76), uFreshLoad * 0.7);
        ground = mix(ground, crowns, farWood * 0.85);
        ground = mix(ground, rock, rockFace);
        ground *= 0.93 + 0.14 * n3 * gSnowNear;          // Körnung in der Nähe

        // ---- Schnee ----
        vec3 snow = uSnowCol;
        float drift = snNoise(vec2(dot(xz, vec2(0.83, 0.55)) * 0.03, dot(xz, vec2(-0.55, 0.83)) * 0.14));
        snow *= 0.962 + 0.055 * drift;                   // Verwehungen: leichte Helligkeitsbänder
        snow = mix(snow, snow * vec3(0.86, 0.90, 0.89), canopy * 0.6);       // Nadeln, Tropfkanten
        // dünner Schnee am Rand der Decke ist grauer, der Grund scheint durch
        snow = mix(snow * vec3(0.90, 0.92, 0.95), snow, smoothstep(0.25, 0.85, cover));
        // Anlagen: Pipe und Schanzen eisig, Deckkante blau (auch ohne Schnee sichtbar)
        float tint = vMark.x;
        snow = mix(snow, vec3(0.80, 0.89, 0.97), clamp(tint, 0.0, 1.0));
        float edgeMark = clamp(tint - 2.0, 0.0, 1.0);
        snow = mix(snow, vec3(0.18, 0.45, 0.92), edgeMark);
        cover = max(cover, max(clamp(tint, 0.0, 1.0) * 0.8, edgeMark));

        gSnowCover = cover;
        diffuseColor.rgb = mix(ground, snow, cover);
    }
`;
const FRAG_ROUGH = /* glsl */`
    roughnessFactor = mix(0.96, 0.84, gSnowCover);
`;
// Nach <normal_fragment_maps>: die Normale um das Feinrelief der Schneeoberfläche kippen
const FRAG_NORMAL = /* glsl */`
    {
        float k = gSnowCover * gSnowNear;
        if (k > 0.02) {
            vec2 q = vSnowPos.xz;
            float e = 0.30;
            float h0 = snRelief(q), hx = snRelief(q + vec2(e, 0.0)), hz = snRelief(q + vec2(0.0, e));
            vec3 tilt = vec3(h0 - hx, 0.0, h0 - hz) / e;
            normal = normalize(normal + (viewMatrix * vec4(tilt, 0.0)).xyz * 0.30 * k);
        }
    }
`;
// Nach <lights_fragment_end>: Schattenton und Glitzern
const FRAG_LIGHT = /* glsl */`
    {
        // Schatten auf Schnee sind blau: dort kommt nur Himmelslicht an
        reflectedLight.indirectDiffuse *= mix(vec3(1.0), uShade, gSnowCover);
        // Glitzern: einzelne Kristalle blitzen auf, wo die Sonne hinkommt (nur in der Nähe)
        float near = gSnowCover * gSnowNear;
        if (near > 0.02) {
            vec3 Vw = normalize(cameraPosition - vSnowPos);
            vec3 Hw = normalize(Vw + normalize(uSunDirW));
            vec2 cell = floor(vSnowPos.xz * 11.0);
            float pick = snHash(cell + 3.7);
            vec3 facet = normalize(normalize(vSnowN) + (vec3(snHash(cell), snHash(cell + 9.1), snHash(cell + 21.3)) - 0.5) * 1.3);
            float glint = pow(max(dot(facet, Hw), 0.0), 320.0) * step(0.90, pick);
            float sunlit = clamp(dot(reflectedLight.directDiffuse, vec3(0.5)), 0.0, 1.0);
            // nur ganz nah: weiter weg würden die Funken flimmern
            float close = 1.0 - smoothstep(25.0, 110.0, length(cameraPosition - vSnowPos));
            reflectedLight.directSpecular += uSunCol * glint * sunlit * near * close * 2.6;
        }
    }
`;
/**
 * Dunst für alles, was zur Landschaft gehört (Gelände, Umland, Wasser, Gletscher, Pisten).
 * Bis zur halben Nebeltiefe genau der lineare Nebel der übrigen Szene – Gebäude, Bäume und
 * Boden bleiben dort farbgleich. Dahinter läuft er weich aus statt ganz zuzuziehen: die Ferne
 * verschwindet nicht, sondern bleibt als blasse Silhouette stehen.
 */
export const SOFT_FOG = /* glsl */`
    #ifdef USE_FOG
        float sfD = max(0.0, vFogDepth - fogNear) / max(1.0, fogFar - fogNear);
        float sfF = sfD <= 0.5 ? sfD : 0.5 + 0.42 * (1.0 - exp(-(sfD - 0.5) * 2.4));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, sfF);
    #endif
`;
// … und ganz außen geht das Gelände in die Farbe des Horizonts über.
const FRAG_FOG = SOFT_FOG + /* glsl */`
    #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizon, smoothstep(uRim.x, uRim.y, length(vSnowPos.xz)));
    #endif
`;

/**
 * Einem anderen weißen Material (Gletschereis, Pistenband) denselben Schattenton und Dunst
 * geben wie der Schneedecke – sonst hebt es sich farblich von ihr ab.
 */
export function matchSnowLook(mat, uniforms, key = 'snow-look') {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uShade = uniforms.uShade;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uShade;')
            .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= uShade;')
            .replace('#include <fog_fragment>', SOFT_FOG);
    };
    mat.customProgramCacheKey = () => key;
    mat.needsUpdate = true;
    return mat;
}

/**
 * Material für eine Schneefläche.
 * @param {object} uniforms  aus createSnowUniforms()
 * @param {{bins?: boolean}} [opts]  bins: Neuschnee aus den Höhenstufen (Umland) statt aus aSnow
 */
export function makeSnowMaterial(uniforms, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 });
    if (opts.bins) mat.defines = { ...(mat.defines || {}), SNOW_BINS: 1 };
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + VERT_DECL)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
            .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
            .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
            .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_LIGHT)
            .replace('#include <fog_fragment>', FRAG_FOG);
    };
    // eigener Schlüssel: Spielfeld- und Umland-Variante dürfen sich kein Programm teilen
    mat.customProgramCacheKey = () => 'snow-surface-' + (opts.bins ? 'bins' : 'attr');
    return mat;
}

// ---- Untergrund (Eckfarbe) --------------------------------------------------------------------
/** Wertrauschen 0..1 an einer Weltlage – für die Fleckigkeit des Untergrunds (Spielfeld und Umland gleich). */
export function groundNoise(x, z) {
    const h = (ix, iy) => { let n = (ix * 374761393 + iy * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const v = (px, py) => {
        const ix = Math.floor(px), iy = Math.floor(py);
        let fx = px - ix, fy = py - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const a0 = h(ix, iy), b0 = h(ix + 1, iy), c0 = h(ix, iy + 1), d0 = h(ix + 1, iy + 1);
        return (a0 + (b0 - a0) * fx) * (1 - fy) + (c0 + (d0 - c0) * fx) * fy;
    };
    return v(x * 0.043 + 11.3, z * 0.043 - 7.9) * 0.62 + v(x * 0.19 - 3.1, z * 0.19 + 5.7) * 0.38;
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Farbe des Untergrunds ohne Schnee – dieselbe Formel für Spielfeld und Umland.
 * @param type  Landbedeckung (0 offen, 1/6 Nadel-/Winterwald, 5 Mischwald, 3 Fels, 4 Asphalt, 7 Wiese, 8 Gletscher)
 * @param alt   Höhenlage 0..1 (Tal .. Gipfel)
 * @param n     Rauschwert 0..1 für die Fleckigkeit
 * @param pal   Palette aus groundPalette()
 */
export function groundColor(type, alt, n, pal) {
    if (type === 8) return mix3([0.42, 0.68, 0.86], [0.72, 0.88, 0.97], c01(alt));       // Gletschereis
    if (type === 3) return pal.rock;
    if (type === 4) return [0.22, 0.24, 0.28];
    if (type === 1 || type === 6) return mix3(pal.floorConifer, pal.floorConiferB, n);  // Nadelstreu
    if (type === 5) return mix3(pal.floorBroad, pal.floorBroadB, n);                    // Laub
    // Offenes Land: Winterwiese unten, nach oben karger (Matten, Schutt)
    const meadow = mix3(pal.meadowA, pal.meadowB, n);
    return mix3(meadow, pal.scree, c01((alt - 0.45) / 0.45) * 0.85);
}
/** Palette des Untergrunds aus dem Farbthema des Levels. */
export function groundPalette(theme = {}, rockCol = [0.42, 0.44, 0.48]) {
    const gl = (theme.grassLight || [140, 176, 96]).map(c => c / 255);
    const gd = (theme.grassDark || [96, 132, 70]).map(c => c / 255);
    const winter = [0.50, 0.47, 0.29];               // fahles Wintergras
    return {
        // gedämpft und ins Gelbbraune gezogen: eine apere Winterwiese, kein Sommerrasen
        meadowA: mix3(mix3(gd, winter, 0.42), [0.30, 0.34, 0.22], 0.25),
        meadowB: mix3(mix3(gl, winter, 0.5), [0.42, 0.44, 0.27], 0.2),
        scree: [0.44, 0.42, 0.38],
        floorConifer: [0.15, 0.20, 0.13], floorConiferB: [0.20, 0.22, 0.14],
        floorBroad: [0.26, 0.25, 0.15], floorBroadB: [0.32, 0.28, 0.16],
        rock: rockCol
    };
}
