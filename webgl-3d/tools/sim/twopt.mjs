// Echte Spielsituation: Piste aus nur 2 Klick-Wegpunkten — Anlage muss dort einrasten, wo der Cursor steht
const { api } = await import('./run.mjs');
const D = api.__dbg();
const G = 300; let hi = null, lo = null, hmax = -1e9, hmin = 1e9;
for (let y = 60; y < G - 60; y += 4) for (let x = 60; x < G - 60; x += 4) { const h = D.yAtSmooth(x, y); if (h > hmax) { hmax = h; hi = { x, y }; } if (h < hmin) { hmin = h; lo = { x, y }; } }
const xw = { kind: 'piste', path: [{ gx: hi.x, gy: hi.y }, { gx: lo.x, gy: lo.y }], top: null, bottom: null, width: 'xwide', snowW: 5.6 };
xw.top = xw.path[0]; xw.bottom = xw.path[1]; D.guestRoutes.push(xw);
let bad = 0;
for (const f of [0.3, 0.5, 0.7]) {
    const r = D.pisteRunAt(hi.x + (lo.x - hi.x) * f, hi.y + (lo.y - hi.y) * f, 20);
    const total = Math.hypot(lo.x - hi.x, lo.y - hi.y), want = total * f;
    const okk = r && Math.abs(r.sMid - want) < 2.5;
    console.log((okk ? '  ✓ ' : '  ✗ ') + 'Cursor bei ' + Math.round(f * 100) + '% → sMid ' + (r ? r.sMid.toFixed(1) : 'null') + ' (erwartet ≈' + want.toFixed(1) + ')');
    if (!okk) bad++;
}
console.log(bad ? 'Zwei-Punkt-Piste FEHLER' : 'Zwei-Punkt-Piste OK'); process.exit(bad ? 1 : 0);
