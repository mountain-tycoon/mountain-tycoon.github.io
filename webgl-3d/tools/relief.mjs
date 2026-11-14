// Reliefbild der erzeugten Landschaft je Level (Draufsicht, schattiert, nach Bodenart gefärbt).
// Damit lässt sich die Geländeform prüfen, ohne das Spiel zu laden.
//   node tools/relief.mjs [ziel-ordner] [level-id ...]
// Ohne Level-Angabe werden alle Kampagnen-Level und die Sandbox gezeichnet. Liegt ein
// Umland vor (world.outer), zeigt das Bild die ganze erzeugte Fläche mit dem Spielfeld
// als Rahmen.
import path from 'path'; import fs from 'fs'; import zlib from 'zlib'; import { fileURLToPath } from 'url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// RELIEF_UTILS=<pfad> zeichnet mit einer anderen Fassung der Geländeerzeugung (Vergleich alt/neu)
const { generateWorldData, upsampleWorld, buildLevelWorld } = await import(process.env.RELIEF_UTILS || `${base}/src/engine/utils.js`);
const { CAMPAIGN_LEVELS, MASSIFS, SANDBOX_DEFAULTS } = await import(`${base}/src/constants/campaign.js`);

const outDir = process.argv[2] || '.';
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function writePng(file, w, h, rgb) {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const COL = { 0: [236, 240, 248], 1: [46, 92, 62], 2: [44, 96, 150], 3: [128, 124, 122], 4: [70, 72, 78], 5: [84, 122, 60], 6: [120, 138, 150], 7: [128, 160, 92], 8: [170, 214, 238] };
const AREA_F = 1.75, HS = 0.09;

function render(id, level) {
    const baseSize = level.gridSize || 192;
    const t0 = performance.now();
    let world;
    if (buildLevelWorld) world = buildLevelWorld(level, MASSIFS[id]);
    else world = upsampleWorld(generateWorldData(baseSize, { ...(level.terrain || {}), theme: level.theme, massif: MASSIFS[id] }), baseSize, AREA_F, { seed: level.terrain?.seed || 7 });
    const ms = performance.now() - t0;
    const play = world.gridSize || Math.round(baseSize * AREA_F);
    const src = world.outer || { heightmap: world.heightmap, landcover: world.landcover, gridSize: play, offset: 0 };
    const G = src.gridSize, hm = src.heightmap, lc = src.landcover, off = src.offset || 0;
    // RELIEF_CROP="x,y,kante" zeichnet einen Ausschnitt in voller Auflösung (Lage im erzeugten Raster)
    const crop = (process.env.RELIEF_CROP || '').split(',').map(Number);
    const cropOn = crop.length === 3 && crop.every(Number.isFinite);
    const step = cropOn ? 1 : Math.max(1, Math.ceil(G / 1000));
    const W = cropOn ? crop[2] : Math.floor(G / step);
    const ox = cropOn ? crop[0] : 0, oy = cropOn ? crop[1] : 0;
    const rgb = Buffer.alloc(W * W * 3);
    let mx = -1e9, mn = 1e9; for (let i = 0; i < hm.length; i++) { if (hm[i] > mx) mx = hm[i]; if (hm[i] < mn) mn = hm[i]; }
    const L = [-0.5, 0.62, -0.6]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
        const x = Math.min(G - 2, Math.max(1, ox + px * step)), y = Math.min(G - 2, Math.max(1, oy + py * step));
        const i = y * G + x;
        const dx = (hm[i + 1] - hm[i - 1]) * HS * 0.5, dy = (hm[i + G] - hm[i - G]) * HS * 0.5;
        const nl = Math.hypot(dx, 1, dy);
        const lam = Math.max(0, (-dx * L[0] + L[1] - dy * L[2]) / nl);
        const steep = Math.hypot(dx, dy);
        let c = COL[lc[i]] || COL[0];
        if (lc[i] !== 2 && steep > 0.75) { const k = Math.min(1, (steep - 0.75) / 0.5); c = [c[0] + (118 - c[0]) * k, c[1] + (112 - c[1]) * k, c[2] + (110 - c[2]) * k]; }
        const sh = 0.34 + 0.86 * lam;
        const inPlay = x >= off && y >= off && x < off + play && y < off + play;
        const dim = inPlay || !world.outer ? 1 : 0.82;
        const o = (py * W + px) * 3;
        rgb[o] = Math.min(255, c[0] * sh * dim); rgb[o + 1] = Math.min(255, c[1] * sh * dim); rgb[o + 2] = Math.min(255, c[2] * sh * dim);
        // Rahmen des Spielfelds
        if (world.outer) {
            const onX = (Math.abs(x - off) < step || Math.abs(x - (off + play - 1)) < step) && y >= off && y < off + play;
            const onY = (Math.abs(y - off) < step || Math.abs(y - (off + play - 1)) < step) && x >= off && x < off + play;
            if (onX || onY) { rgb[o] = 235; rgb[o + 1] = 60; rgb[o + 2] = 50; }
        }
    }
    const file = path.join(outDir, `relief-${id}.png`);
    writePng(file, W, W, rgb);
    // Kennzahlen des Spielfelds: Hangneigung je Kachel (Höheneinheiten), Wald, Wasser, Eis
    const P = world.heightmap, PL = world.landcover;
    let n = 0, s2 = 0, s4 = 0, s8 = 0, wood = 0, wat = 0, ice = 0, top = -1e9;
    for (let y = 1; y < play - 1; y++) for (let x = 1; x < play - 1; x++) {
        const i = y * play + x, z = P[i];
        const sl = Math.max(Math.abs(z - P[i - 1]), Math.abs(z - P[i + 1]), Math.abs(z - P[i - play]), Math.abs(z - P[i + play]));
        n++; if (sl < 2) s2++; if (sl < 4) s4++; if (sl < 8) s8++;
        const c = PL[i]; if (c === 1 || c === 5 || c === 6) wood++; else if (c === 2) wat++; else if (c === 8) ice++;
        if (z > top) top = z;
    }
    const pc = (v) => (v / n * 100).toFixed(0).padStart(3) + '%';
    console.log(id.padEnd(14), `${G}x${G}`.padEnd(10), `Spielfeld ${play}`, `Gipfel ${top.toFixed(0)}`.padEnd(12), `Hang <2 ${pc(s2)} <4 ${pc(s4)} <8 ${pc(s8)}`,
        `| Wald ${pc(wood)} Wasser ${pc(wat)} Eis ${pc(ice)}`, `| ${ms.toFixed(0)} ms`);
}

const levels = [...CAMPAIGN_LEVELS.map(l => [l.id, l]), ['sandbox', { ...SANDBOX_DEFAULTS, id: 'sandbox' }]];
for (const [id, level] of levels) { if (only.length && !only.includes(id)) continue; render(id, level); }
