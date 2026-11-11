// Profil vom Startdorf (tiefste Randkachel) zum Hauptgipfel: kein Tal dazwischen,
// unten sanft (schiebbar), keine Gegensteigung über 4 Einheiten.
import path from 'path'; import { fileURLToPath } from 'url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { generateWorldData } = await import(`${base}/src/engine/utils.js`);
const { CAMPAIGN_LEVELS, MASSIFS } = await import(`${base}/src/constants/campaign.js`);
let bad = 0;
for (const L of CAMPAIGN_LEVELS) {
  const G = L.gridSize; const w = generateWorldData(G, { ...(L.terrain||{}), theme: L.theme, massif: MASSIFS[L.id] });
  const hm = w.heightmap, lc = w.landcover; const M = 4;
  let sx=0, sy=0, hMax=-1e9; for (let y=8;y<G-8;y++) for (let x=8;x<G-8;x++) { const h=hm[y*G+x]; if (h>hMax){hMax=h;sx=x;sy=y;} }
  const sl=(x,y)=>{const i=y*G+x,z=hm[i];return Math.max(Math.abs(z-hm[i-1]),Math.abs(z-hm[i+1]),Math.abs(z-hm[i-G]),Math.abs(z-hm[i+G]));};
  let bx=M,by=M,hMin=1e18; const c=(x,y)=>{ if(lc[y*G+x]===2||sl(x,y)>8) return; const h=hm[y*G+x]; if(h<hMin){hMin=h;bx=x;by=y;} };
  for(let x=M;x<G-M;x++){c(x,M);c(x,G-1-M);} for(let y=M;y<G-M;y++){c(M,y);c(G-1-M,y);}
  const n=60; let dipMax=0, run=hm[by*G+bx], firstQ=[];
  for(let k=0;k<=n;k++){ const t=k/n; const x=Math.round(bx+(sx-bx)*t), y=Math.round(by+(sy-by)*t); const h=hm[y*G+x]; if(lc[y*G+x]===2) continue; /* Flussbett zählt nicht */ if(t<=0.75 && h<run-4) dipMax=Math.max(dipMax, run-h); run=Math.max(run,h); if(t<=0.3) firstQ.push(h); }
  const rise30 = firstQ[firstQ.length-1]-firstQ[0]; const len30 = Math.hypot(sx-bx,sy-by)*0.3;
  const grade = rise30/len30;
  const ok = dipMax < 25 && grade < 3.2;   // unteres 3/4: kein Tal (>25 Einheiten), unten schiebbar
  console.log(L.id.padEnd(14), 'Dorf', hMin.toFixed(0).padStart(4), '→ Gipfel', hMax.toFixed(0), '| max. Gegengefälle', dipMax.toFixed(1), '| Steigung unteres Drittel', grade.toFixed(2), '/Kachel', ok?'':'✗');
  if (!ok) bad++;
}
console.log(bad ? bad + ' Fehler' : 'Basis-Hang OK'); process.exit(bad?1:0);
