// Rettungs-Skidoo: rückt aus, holt den Verletzten, kehrt zurück, ist danach wieder frei.
const { api, world, GS } = await import('./run.mjs');
const D = api.__dbg();
let t = 0; const frame = (dt=0.05) => { t += dt; global.__simT = t; global.__raf(t*1000); };
// ein paar Frames, damit Gäste existieren
for (let i=0;i<40;i++) frame();
console.log('Gäste', D.guestPool.length, 'Gebäude', D.placedBuildings.map(b=>b.type).join(','));
// Sanitätsstation neben der Talstation "bauen"
const lift = D.placedBuildings.find(b=>b.type==='lift');
const mesh = { position: { x: lift.rec.x + 6, y: 0, z: lift.rec.z + 6 }, scale: { y: 1 }, userData: {}, visible: true };
D.placedBuildings.push({ mesh, cost: 0, rec: { x: lift.rec.x + 6, z: lift.rec.z + 6, r: 2.2 }, type: 'medical' });
// Gast verletzen, 20 Kacheln entfernt
const g = D.guestPool[0];
const st = D.worldToGrid(mesh.position.x, mesh.position.z);
D.startFall(g, { gx: st.gx + 14, gy: st.gy + 12 });
g.mesh.position.x = 0;
for (let i=0;i<80;i++) frame();
console.log('Flotte', D.sledFleet.length, 'busy', D.sledFleet.map(s=>s.busy).join(','), 'Einsätze', D.rescues.length, 'wartend', D.injured.length);
const sd = D.sledFleet[0];
let last = null;
let seenBack=0, visibleWhileCarried=0;
for (let i=0;i<1400;i++){ frame(); if (D.rescues[0]?.phase==='back'){ seenBack++; if (g.mesh.visible) visibleWhileCarried++; } if (i%100===0){ const p=sd.mesh.position; const gp=D.worldToGrid(p.x,p.z); console.log('t+'+(i*0.05).toFixed(1)+'s Skidoo', gp.gx.toFixed(1), gp.gy.toFixed(1), 'phase', D.rescues[0]?.phase, 'route', D.rescues[0]?._veh?._route ? 'ja' : 'nein', 'noRoute', D.rescues[0]?._veh?._noRoute); } }
if (seenBack===0 || visibleWhileCarried>0) { console.log('✗ Patient bleibt liegen: back-Frames', seenBack, 'sichtbar', visibleWhileCarried); process.exit(1); }
console.log('Patient während der Rückfahrt unsichtbar (' + seenBack + ' Frames)');
// zweiter Einsatz, weiter weg
const g2 = D.guestPool[1]; D.startFall(g2, { gx: st.gx - 25, gy: st.gy + 8 });
let done=false; for (let i=0;i<1600;i++){ frame(); if (!D.rescues.length && D.injured.length===0 && i>40) { done=true; console.log('2. Einsatz abgeschlossen nach', (i*0.05).toFixed(1), 's'); break; } }
if (!done) { console.log('✗ 2. Einsatz NICHT abgeschlossen', D.rescues[0]?.phase, D.injured.length); process.exit(1); }
console.log('Skidoo OK');
