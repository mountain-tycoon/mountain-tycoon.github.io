// Durchfahrts-Anlagen: nur auf extrabreiter Piste, mittig, Richtung bergab entlang der Piste
const { api } = await import('./run.mjs');
const D = api.__dbg();
let bad = 0; const ok = (m) => console.log('  ✓ ' + m); const fail = (m) => { bad++; console.log('  ✗ ' + m); };
// synthetische Pisten: eine mittlere, eine extrabreite — schräg zur Falllinie
const mk = (x0, y0, x1, y1, width) => { const path = []; for (let k = 0; k <= 40; k++) path.push({ gx: x0 + (x1 - x0) * k / 40, gy: y0 + (y1 - y0) * k / 40 }); return { kind: 'piste', path, top: path[0], bottom: path[40], width, snowW: width === 'xwide' ? 5.6 : 2.6 }; };
// oben = höherer Punkt suchen
const G = 300; let hi = null, lo = null, hmax = -1e9, hmin = 1e9;
for (let y = 60; y < G - 60; y += 4) for (let x = 60; x < G - 60; x += 4) { const h = D.yAtSmooth(x, y); if (h > hmax) { hmax = h; hi = { x, y }; } if (h < hmin) { hmin = h; lo = { x, y }; } }
const med = mk(hi.x, hi.y, lo.x, lo.y, 'medium');
const xw = mk(hi.x + 30, hi.y, lo.x + 30, lo.y, 'xwide');
D.guestRoutes.push(med, xw);
const midM = med.path[20], midX = xw.path[20];
if (D.pisteRunAt(midM.gx, midM.gy, 20) === null) ok('mittlere Piste: keine Halfpipe erlaubt'); else fail('Halfpipe auf mittlerer Piste erlaubt');
const r = D.pisteRunAt(midX.gx + 3, midX.gy, 20);
if (r) ok('extrabreite Piste: baubar, Mitte eingerastet auf (' + r.gx.toFixed(1) + ',' + r.gy.toFixed(1) + ') statt Cursor ' + (midX.gx + 3).toFixed(1)); else fail('extrabreite Piste: nicht baubar');
if (r) {
    const dh = D.yAtSmooth(r.gx + r.dx * 5, r.gy + r.dy * 5) - D.yAtSmooth(r.gx, r.gy);
    dh < 0 ? ok('Fahrtrichtung zeigt bergab (Δh ' + dh.toFixed(2) + ')') : fail('Fahrtrichtung zeigt bergauf');
    const along = Math.abs(r.dx * (xw.bottom.gx - xw.top.gx) + r.dy * (xw.bottom.gy - xw.top.gy)) / Math.hypot(xw.bottom.gx - xw.top.gx, xw.bottom.gy - xw.top.gy);
    along > 0.98 ? ok('Richtung folgt der Pistenachse') : fail('Richtung weicht von der Piste ab (' + along.toFixed(2) + ')');
}
{   // am Pistenanfang: Anlage rutscht entlang der Piste nach innen, statt abgelehnt zu werden
    const r2 = D.pisteRunAt(xw.path[1].gx, xw.path[1].gy, 30);
    const dTop = r2 ? Math.hypot(r2.gx - xw.top.gx, r2.gy - xw.top.gy) : -1;
    (r2 && dTop >= 16 - 0.5) ? ok('am Pistenanfang rutscht die Rennstrecke nach innen (Mitte ' + dTop.toFixed(1) + ' Kacheln vom Start)') : fail('Rennstrecke ragt über das Pistenende (' + dTop.toFixed(1) + ')');
    const short = mk(hi.x - 30, hi.y, hi.x - 30 + 6, hi.y + 12, 'xwide');   // nur ~13 Kacheln lang
    D.guestRoutes.push(short);
    D.pisteRunAt(short.path[20].gx, short.path[20].gy, 30) === null ? ok('zu kurze Piste: Rennstrecke abgelehnt') : fail('Rennstrecke auf zu kurzer Piste');
    D.guestRoutes.pop();
}
if (D.pisteRunAt(midX.gx + 9, midX.gy, 8) === null) ok('9 Kacheln neben der Piste: nicht baubar'); else fail('neben der Piste baubar');
{   // keine Überlappung: mit einer registrierten Anlage in der Mitte weicht die zweite aus / wird abgelehnt
    const mid = xw.path[20];
    const r1 = D.pisteRunAt(mid.gx, mid.gy, 20);
    xw.runs = [{ type: 'halfpipe', s0: r1.s0, s1: r1.s1, sMid: r1.sMid }];
    const r2 = D.pisteRunAt(mid.gx, mid.gy, 8);
    if (!r2) ok('Kicker auf der Halfpipe: abgelehnt (' + 'überlappt' + ')');
    else if (r2.s0 >= r1.s1 + 2 || r2.s1 <= r1.s0 - 2) ok('Kicker weicht der Halfpipe aus (s ' + r2.s0.toFixed(0) + '–' + r2.s1.toFixed(0) + ' vs ' + r1.s0.toFixed(0) + '–' + r1.s1.toFixed(0) + ')');
    else fail('Anlagen überlappen');
    // mittige Platzierung bleibt in der Mitte (kein Abrutschen zu den Enden)
    xw.runs = [];
    const r3 = D.pisteRunAt(mid.gx + 1, mid.gy, 20);
    Math.abs(r3.sMid - r1.sMid) < 3 ? ok('Anlage bleibt an der Cursorstelle (Mitte)') : fail('Anlage rutscht weg: ' + r3.sMid.toFixed(0) + ' statt ' + r1.sMid.toFixed(0));
}
console.log(bad ? bad + ' Fehler' : 'Durchfahrts-Anlagen OK'); process.exit(bad ? 1 : 0);
