// Landschaftsstatistik je Level: Gipfelzahl, Ebenenanteil, Feinwelligkeit (Noppen)
import path from 'path'; import { fileURLToPath } from 'url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { generateWorldData, upsampleWorld } = await import(`${base}/src/engine/utils.js`);
const { CAMPAIGN_LEVELS, MASSIFS } = await import(`${base}/src/constants/campaign.js`);
let bad = 0;
for (const L of CAMPAIGN_LEVELS) {
  const B = L.gridSize, GS = B * 2;
  const w = upsampleWorld(generateWorldData(B, { ...(L.terrain||{}), theme: L.theme, massif: MASSIFS[L.id] }), B, 2, { seed: L.terrain?.seed || 7 });
  const hm = w.heightmap; let mx = -1e9; for (const h of hm) if (h > mx) mx = h;
  // Gipfel: lokale Maxima im Radius 24, über 50 % der Maximalhöhe
  let peaks = 0; const R = 24;
  for (let y = R; y < GS - R; y += 3) for (let x = R; x < GS - R; x += 3) { const h = hm[y*GS+x]; if (h < mx*0.5) continue; let top = true; for (let dy = -R; dy <= R && top; dy += 3) for (let dx = -R; dx <= R; dx += 3) { if (hm[(y+dy)*GS+x+dx] > h) { top = false; break; } } if (top) peaks++; }
  // Ebenen: Anteil der Kacheln mit Gefälle < 0.6 Einheiten/Kachel (Weltmaßstab: sehr flach)
  let flat = 0, n = 0, wig = 0;
  for (let y = 2; y < GS - 2; y += 2) for (let x = 2; x < GS - 2; x += 2) {
    const i = y*GS+x; const g = Math.max(Math.abs(hm[i]-hm[i+1]), Math.abs(hm[i]-hm[i+GS])); n++; if (g < 0.6) flat++;
    // Feinwelligkeit: zweite Ableitung (Krümmung) über 4 Kacheln
    const c = Math.abs(hm[i-2] - 2*hm[i] + hm[i+2]) + Math.abs(hm[i-2*GS] - 2*hm[i] + hm[i+2*GS]); wig += c;
  }
  const flatPct = flat / n * 100, wiggle = wig / n / mx * 1000;
  console.log(L.id.padEnd(14), 'Gipfel', String(peaks).padStart(2), '| Ebene', flatPct.toFixed(1).padStart(5) + '%', '| Feinwelligkeit', wiggle.toFixed(2));
  if (flatPct > 22) { bad++; console.log('  ✗ zu viel Ebene'); }
}
console.log(bad ? bad + ' Fehler' : 'Landschaft OK');
process.exit(bad ? 1 : 0);
