// Durchfahrts-Anlage auf einer neu gebauten extrabreiten Piste: bauen, Form im
// Gelände prüfen, Gast fährt hindurch und macht seinen Trick.
const { api } = await import('./run.mjs');
const D = api.__dbg();
let bad = 0; const ok = (m) => console.log('  ✓ ' + m); const fail = (m) => { bad++; console.log('  ✗ ' + m); };
let t = 0; const frame = (dt = 0.05) => { t += dt; global.__simT = t; global.__raf(t * 1000); };
const G = 300; let hi = null, lo = null, hmax = -1e9, hmin = 1e9;
for (let y = 60; y < G - 60; y += 4) for (let x = 60; x < G - 60; x += 4) { const h = D.yAtSmooth(x, y); if (h > hmax) { hmax = h; hi = { x, y }; } if (h < hmin) { hmin = h; lo = { x, y }; } }
D.setPisteWidth('xwide'); D.setMoney(5e7);
const mkPiste = (off) => { const raw = []; for (let k = 0; k <= 12; k++) raw.push({ gx: hi.x + off + (lo.x - hi.x) * k / 12, gy: hi.y + (lo.y - hi.y) * k / 12 }); D.buildPistePath(raw); return D.guestRoutes[D.guestRoutes.length - 1]; };
for (const [type, expectDip, off] of [['halfpipe', -2.5, 0], ['kicker', 0.8, 24], ['funpark_l', 0.8, -24]]) {
    const rt = mkPiste(off);
    rt.width === 'xwide' ? ok('Piste (' + off + ') als extrabreit gebaut') : fail('Pistenbreite ' + rt.width);
    // Stelle wählen, an der die Piste wirklich bergab läuft (kein Schlittschuhschritt)
    const L = { halfpipe: 20, kicker: 8, funpark_l: 14 }[type];
    let mid = rt.path[Math.floor(rt.path.length * 0.5)], r = null;
    for (const fr of [0.5, 0.4, 0.6, 0.3, 0.7, 0.35, 0.65]) {
        const p = rt.path[Math.floor(rt.path.length * fr)];
        const cand = D.pisteRunAt(p.gx + 2, p.gy + 1, L);
        if (!cand) continue;
        const drop = D.yAtSmooth(cand.gx - cand.dx * L * 0.5, cand.gy - cand.dy * L * 0.5) - D.yAtSmooth(cand.gx + cand.dx * L * 0.5, cand.gy + cand.dy * L * 0.5);
        if (drop > L * 0.12) { mid = p; r = cand; break; }
    }
    if (!r) { fail(type + ': keine Stelle gefunden'); continue; }
    const probe = type === 'halfpipe' ? { gx: r.gx, gy: r.gy } : type === 'kicker' ? { gx: r.gx, gy: r.gy } : { gx: r.gx - r.dx * 0.35, gy: r.gy - r.dy * 0.35 };
    const before = D.yAtSmooth(probe.gx, probe.gy);
    for (let i = 0; i < 3; i++) frame();
    const built = D.placeBuildingAt(type, { gx: mid.gx + 2, gy: mid.gy + 1 });
    const delta = D.yAtSmooth(probe.gx, probe.gy) - before;
    built ? ok(type + ' gebaut, Geländeänderung ' + delta.toFixed(2) + ' m') : fail(type + ' nicht gebaut');
    (expectDip < 0 ? delta < expectDip : delta > expectDip) ? ok(type + ': Form im Gelände') : fail(type + ': Form fehlt (' + delta.toFixed(2) + ')');
    const b = D.placedBuildings[D.placedBuildings.length - 1];
    const strip0 = (rt) => rt.runs[rt.runs.length - 1].strip;
    if (type === 'halfpipe') {
        // Schneedecke darf nirgends durch die Schale ragen: Gelände (bilinear)
        // gegen Schalenfläche über dem gesamten Schalen-Grundriss vergleichen
        const shell = b.mesh.children.find(c => c.userData?.pipeR);
        const R = shell.userData.pipeR, pitch = strip0(rt).pitch, roll = strip0(rt).roll;
        const strip = rt.runs[rt.runs.length - 1].strip;
        const baseY = strip.midY + 0.05 - R + 0.10;                     // Pipe-Boden-Ebene an der Mitte (Stub speichert position.set nicht)
        const shellY = (x) => x <= 1.4 ? 0 : x >= 4.7 ? R : R - Math.sqrt(Math.max(0, R * R - (x - 1.4) * (x - 1.4)));
        if (process.env.DBG) console.log('DBG shell', 'group.y', b.mesh.position.y.toFixed(2), 'shell.y', shell.position.y.toFixed(2), 'pitch', pitch.toFixed(3), 'roll', roll.toFixed(3), 'terrain Mitte', D.yAtSmooth(r.gx, r.gy).toFixed(2), 'rot.y', b.mesh.rotation.y.toFixed(2), 'r.rot', r.rot.toFixed(2));
        let worst = -1e9, where = '';
        for (let al = -7.5; al <= 7.5; al += 0.5) for (let ac = -5.9; ac <= 5.9; ac += 0.25) {
            const gx = r.gx + r.dx * al - r.dy * ac, gy = r.gy + r.dy * al + r.dx * ac;
            const ySurf = baseY - Math.tan(pitch) * al + Math.tan(roll) * ac + shellY(Math.abs(ac));
            const pen = D.yAtSmooth(gx, gy) - ySurf;
            if (pen > worst) { worst = pen; where = 'al=' + al + ' ac=' + ac.toFixed(2); }
        }
        if (process.env.DBG) { let prof=''; for (let ac=-6; ac<=6; ac+=0.5){ const al=1; const gx = r.gx + r.dx * al - r.dy * ac, gy = r.gy + r.dy * al + r.dx * ac; prof += ac.toFixed(1)+':'+(D.yAtSmooth(gx,gy)-baseY+Math.tan(pitch)*al-Math.tan(roll)*ac).toFixed(2)+'/'+shellY(Math.abs(ac)).toFixed(2)+' '; } console.log('DBG Profil terrain/shell', prof); }
        if (process.env.DBG) { let line=''; for (let ac=-5.5; ac<=5.5; ac+=1) { let w=-1e9; for (let al=-7.5; al<=7.5; al+=0.5){ const gx = r.gx + r.dx * al - r.dy * ac, gy = r.gy + r.dy * al + r.dx * ac; const ySurf = baseY - Math.tan(pitch) * al + Math.tan(roll) * ac + shellY(Math.abs(ac)); w=Math.max(w, D.yAtSmooth(gx, gy) - ySurf);} line += ac.toFixed(1)+':'+w.toFixed(2)+' '; } console.log('DBG pen je ac', line); }
        worst <= 0.02 ? ok('Halfpipe: Schnee liegt überall unter der Schale (max. ' + worst.toFixed(2) + ' m)') : fail('Halfpipe: Schnee ragt ' + worst.toFixed(2) + ' m durch die Schale (' + where + ')');
    }
    let floods = 0, flags = 0; b.mesh.traverse((c) => { if (c.userData?.isFlood) floods++; if (c.userData?.isFlag) flags++; });
    if (type !== 'kicker') { floods >= 4 && flags >= 4 ? ok(type + ': ' + floods + ' Strahler, ' + flags + ' Fahnen') : fail(type + ' ohne Strahler/Fahnen (' + floods + '/' + flags + ')'); }
    // Gast durchschicken
    const g0 = D.guestPool[0]; g0.state = 'piste'; g0.route = rt; g0.prog = Math.max(0, (r.s0 - 6) / (rt.cum ? rt.cum[rt.cum.length - 1] : 200)); g0.hasTicket = true; g0.mesh.visible = true; g0._usedRun = null; g0.uphill = false;
    let used = false, maxAir = 0;
    let total = 0; for (let k = 1; k < rt.path.length; k++) total += Math.hypot(rt.path[k].gx - rt.path[k - 1].gx, rt.path[k].gy - rt.path[k - 1].gy);
    if (process.env.DBG) console.log('DBG', type, 'runs', rt.runs?.map(x => x.type + ':' + x.s0.toFixed(0) + '-' + x.s1.toFixed(0)).join(','), 'r.s0', r.s0.toFixed(0), 'total', total.toFixed(0));
    for (let i = 0; i < 400; i++) { g0.state = 'piste'; g0.route = rt; g0.uphill = false; g0.prog = (r.s0 - 2 + (r.s1 - r.s0 + 4) * (i / 400)) / total; frame(); if (g0._run) { used = true; maxAir = Math.max(maxAir, g0._run.air || 0); } }
    (used && maxAir > 0.5) ? ok(type + ': Gast fährt hindurch und springt (Flugphase ' + maxAir.toFixed(2) + ')') : fail(type + ': Gast nutzt die Anlage nicht / kein Sprung (' + used + ', ' + maxAir.toFixed(2) + ')');
}
{   // Band über der Halfpipe bleibt versteckt, auch wenn danach ein Kicker auf derselben Piste gebaut wird
    const rt = D.guestRoutes.find(r => r.runs && r.runs.some(x => x.type === 'halfpipe'));
    const hp = rt.runs.find(x => x.type === 'halfpipe');
    const countHidden = () => { const pa = rt.bed.geo.attributes.position, grid = rt.bed.grid; let n = 0, hid = 0; for (let i = 0, gi = 0; i < pa.count; i++, gi += 2) { const s0 = (() => { let acc = 0; return acc; })(); const gx = grid[gi], gy = grid[gi + 1]; const al = Math.abs((gx - hp.mesh.position.x) * 0 + 0); void al; void s0; const y = pa.getY(i); const t = D.yAtSmooth(gx, gy); if (y < t - 5) hid++; n++; } return hid; };
    const hiddenSet = () => { const pa = rt.bed.geo.attributes.position, grid = rt.bed.grid; const set = new Set(); for (let i = 0, gi = 0; i < pa.count; i++, gi += 2) { if (pa.getY(i) < D.yAtSmooth(grid[gi], grid[gi+1]) - 5) set.add(i); } return set; };
    const hs0 = hiddenSet();
    const before = countHidden();
    const pKick = rt.path[Math.floor(rt.path.length * 0.5)];
    // Kicker weiter unten auf derselben Piste (pisteRunAt weicht der Pipe aus)
    const rk = D.pisteRunAt(pKick.gx + 2, pKick.gy + 1, 8);
    const okK = rk ? D.placeBuildingAt('kicker', { gx: pKick.gx + 2, gy: pKick.gy + 1 }) : false;
    const after = countHidden();
    if (process.env.DBG) { const hs1 = hiddenSet(); const lost = [...hs0].filter(i => !hs1.has(i)); const pa = rt.bed.geo.attributes.position, grid = rt.bed.grid; console.log('DBG verlorene versteckte Punkte', lost.length, lost.slice(0,5).map(i => 'i=' + i + ' y=' + pa.getY(i).toFixed(1) + ' t=' + D.yAtSmooth(grid[i*2], grid[i*2+1]).toFixed(1) + ' inHidden=' + rt.bed.hidden.has(i)).join(' | ')); }
    { const pa = rt.bed.geo.attributes.position, grid = rt.bed.grid; let up = 0; for (const i of rt.bed.hidden) if (pa.getY(i) > D.yAtSmooth(grid[i*2], grid[i*2+1]) - 5) up++;
      (okK && rt.bed.hidden.size > 0 && up === 0) ? ok('Pipe-Band bleibt nach Kicker-Bau versteckt (' + rt.bed.hidden.size + ' Punkte, 0 wieder oben)') : fail('Pipe-Band nach Kicker-Bau wieder sichtbar (' + up + ' von ' + rt.bed.hidden.size + ', Kicker ' + okK + ')'); }
}
{   // Abriss: Registrierung weg, Gelände zurück, Band wieder oben, Neubau an derselben Stelle möglich
    const rt = D.guestRoutes.find(r => r.runs && r.runs.some(x => x.type === 'halfpipe'));
    const hp = rt.runs.find(x => x.type === 'halfpipe');
    const bi = D.placedBuildings.findIndex(b => b.mesh === hp.mesh);
    const cy0 = D.yAtSmooth(hp.gx, hp.gy);
    D.demolishIndex(bi);
    const still = rt.runs.some(x => x.type === 'halfpipe');
    const cy1 = D.yAtSmooth(hp.gx, hp.gy);
    (!still && cy1 > cy0 + 3) ? ok('Abriss: Registrierung gelöst, Gelände zurück (' + cy0.toFixed(1) + ' → ' + cy1.toFixed(1) + ')') : fail('Abriss unvollständig (run ' + still + ', Höhe ' + cy0.toFixed(1) + ' → ' + cy1.toFixed(1) + ')');
    const r2 = D.pisteRunAt(hp.gx, hp.gy, 20);
    (r2 && Math.abs(r2.sMid - hp.sMid) < 2) ? ok('Neubau an derselben Stelle wieder möglich') : fail('Neubau an derselben Stelle nicht möglich (' + (r2 ? r2.sMid.toFixed(0) + ' vs ' + hp.sMid.toFixed(0) : 'null') + ')');
}
console.log(bad ? bad + ' Fehler' : 'Anlagen-Bau OK'); process.exit(bad ? 1 : 0);
