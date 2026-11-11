// Fliegende Gäste aufspüren: kein sichtbarer Gast darf (außer im Lift/Heli)
// deutlich über dem Gelände hängen oder schneller als erlaubt springen.
const { api } = await import('./run.mjs');
const D = api.__dbg();
let t = 0; const frame = (dt = 0.05) => { t += dt; global.__simT = t; global.__raf(t * 1000); };
for (let i = 0; i < 60; i++) frame();
const prev = new Map();
let airborne = 0, jumps = 0, samples = 0; const offenders = new Map();
for (let i = 0; i < 2400; i++) {
    frame();
    const pool = [...D.guestPool, ...(D.walkers || []).map(w => ({ mesh: w.mesh, state: 'arrive' }))];
    for (const g of pool) {
        if (!g.mesh.visible) { prev.delete(g); continue; }
        const p = g.mesh.position; const gp = D.worldToGrid(p.x, p.z);
        const ground = D.worldPosSmooth(gp.gx, gp.gy).y;
        const st = g.state;
        const inAir = st !== 'lift' && !g.carried && p.y - ground > 2.5;
        const q = prev.get(g);
        let jump = false;
        if (q && q.state === st && st !== 'lift') {
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            const vmax = st === 'piste' ? 12 : 3.4;
            if (d > vmax * 0.05 * 1.6 + 0.05) jump = true;
        }
        samples++;
        if (inAir) { airborne++; offenders.set(st + '/air', (offenders.get(st + '/air') || 0) + 1); }
        if (jump) { jumps++; offenders.set(st + '/jump', (offenders.get(st + '/jump') || 0) + 1); }
        prev.set(g, { x: p.x, z: p.z, state: st });
    }
}
console.log('Stichproben', samples, '| in der Luft', airborne, '| Sprünge', jumps);
if (airborne || jumps) { console.log('  Verursacher:', JSON.stringify([...offenders])); console.log('✗ Gäste fliegen/springen'); process.exit(1); }
console.log('Gäste bleiben am Boden OK');
