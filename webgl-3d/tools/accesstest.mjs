// Zufahrtsplanung auf synthetischen Karten durchspielen.
// Prüft für viele Konstellationen: Straße erreicht den Ortsrand, läuft nicht
// durch belegtes Land, Parkplatz liegt außerhalb des Ortes und nicht auf der
// Straße, Stich verbindet beide, Haltestelle liegt frei.
import { planVillageAccess } from '../src/webgl/AccessPlanner.js';

let bad = 0, runs = 0;
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { bad++; console.log('  ✗ ' + m); };

const mkWorld = (seed) => {
    const GS = 160;
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const grid = new Uint8Array(GS * GS);              // 1 = belegt
    const rock = new Uint8Array(GS * GS);              // 1 = nicht bebaubar
    // Ort irgendwo, nicht zu nah am Rand
    const vgx = 30 + Math.floor(rnd() * 100), vgy = 30 + Math.floor(rnd() * 100);
    const vRad = 9 + Math.floor(rnd() * 11);
    for (let y = -vRad; y <= vRad; y++) for (let x = -vRad; x <= vRad; x++)
        if (x * x + y * y <= vRad * vRad) grid[(vgy + y) * GS + (vgx + x)] = 1;
    // Talstation 7x7 in der Nähe
    const lx = vgx + Math.round((rnd() - 0.5) * 30), ly = vgy + Math.round((rnd() - 0.5) * 30);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        const X = lx + x, Y = ly + y;
        if (X > 0 && Y > 0 && X < GS && Y < GS) grid[Y * GS + X] = 1;
    }
    // Ein paar Felsflecken
    for (let k = 0; k < 8; k++) {
        const cx = Math.floor(rnd() * GS), cy = Math.floor(rnd() * GS), r = 2 + Math.floor(rnd() * 5);
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            const X = cx + x, Y = cy + y;
            if (X > 0 && Y > 0 && X < GS && Y < GS && x * x + y * y <= r * r) rock[Y * GS + X] = 1;
        }
    }
    // Eine Piste als Linie vom Lift bergauf
    const piste = new Set();
    for (let i = 0; i < 60; i++) {
        const X = lx + Math.round(i * 0.6), Y = ly - i;
        if (X > 0 && Y > 0 && X < GS && Y < GS) for (let w = -2; w <= 2; w++) piste.add((X + w) + ',' + Y);
    }
    return {
        gridSize: GS, vgx, vgy, vRad,
        blocked: (x, y) => grid[y * GS + x] === 1,
        buildable: (x, y) => rock[y * GS + x] !== 1,
        avoid: (x, y) => piste.has(x + ',' + y),
        anchorX: lx, anchorY: ly, wantBusStop: true,
        _grid: grid, _rock: rock, _piste: piste, _lift: { x: lx, y: ly }
    };
};

console.log('Zufahrtsplanung auf 60 Zufallskarten:');
let statStrasse = 0, statLot = 0, statBus = 0, statLen = 0;
for (let seed = 1; seed <= 60; seed++) {
    const w = mkWorld(seed * 7919);
    const plan = planVillageAccess(w);
    runs++;
    const GS = w.gridSize;
    const inOrt = (x, y) => Math.hypot(x - w.vgx, y - w.vgy) <= w.vRad;
    // 1) Straße erreicht den Ortsrand und die Kante
    const first = plan.chain[0], last = plan.chain[plan.chain.length - 1];
    const dEntry = Math.hypot(first.gx - plan.entry.x, first.gy - plan.entry.y);
    const atEdge = last.gx <= 2 || last.gy <= 2 || last.gx >= GS - 3 || last.gy >= GS - 3;
    if (dEntry > 1.5) fail('Karte ' + seed + ': Straße beginnt nicht am Ortseingang (' + dEntry.toFixed(1) + ')');
    else if (!atEdge) fail('Karte ' + seed + ': Straße erreicht die Kartenkante nicht');
    else statStrasse++;
    // 2) Straße läuft nicht durch belegtes Land (außer die Zielkachel am Ort)
    let durch = 0;
    for (let i = 1; i < plan.chain.length; i++) {
        const c = plan.chain[i];
        if (w.blocked(c.gx, c.gy) || !w.buildable(c.gx, c.gy)) durch++;
    }
    if (durch > 0) fail('Karte ' + seed + ': ' + durch + ' Straßenkacheln in Bauland/Fels');
    statLen += plan.chain.length;
    // 3) Parkplatz: vorhanden, außerhalb des Ortes, frei, nicht auf der Straße
    if (!plan.lot) fail('Karte ' + seed + ': kein Parkplatz gefunden');
    else {
        const L = plan.lot;
        let imOrt = false, belegt = false, aufStrasse = false;
        for (let y = L.oy; y < L.oy + L.n; y++) for (let x = L.ox; x < L.ox + L.n; x++) {
            if (inOrt(x, y)) imOrt = true;
            if (w.blocked(x, y) || !w.buildable(x, y)) belegt = true;
            for (const c of plan.chain) if (Math.round(c.gx) === x && Math.round(c.gy) === y) aufStrasse = true;
        }
        if (imOrt) fail('Karte ' + seed + ': Parkplatz ragt in den Ort');
        else if (belegt) fail('Karte ' + seed + ': Parkplatz auf belegtem Grund');
        else if (aufStrasse) fail('Karte ' + seed + ': Straße läuft über den Parkplatz');
        else statLot++;
        // 4) Stich verbindet Padkante und Straße
        const s0 = plan.stub[0], s1 = plan.stub[plan.stub.length - 1];
        const dJ = Math.hypot(s1.gx - plan.junction.gx, s1.gy - plan.junction.gy);
        const dE = Math.hypot(s0.gx - L.gx, s0.gy - L.gy);
        if (dJ > 0.6) fail('Karte ' + seed + ': Stich endet nicht an der Straße');
        if (Math.abs(dE - (L.n - 1) / 2) > 0.6) fail('Karte ' + seed + ': Stich beginnt nicht an der Padkante (' + dE.toFixed(1) + ')');
    }
    // 5) Haltestelle frei und außerhalb
    if (plan.busStop) {
        const B = plan.busStop;
        if (inOrt(B.gx, B.gy)) fail('Karte ' + seed + ': Haltestelle im Ort');
        else if (w.blocked(B.gx, B.gy)) fail('Karte ' + seed + ': Haltestelle auf Bauland');
        else statBus++;
    }
}
ok(statStrasse + '/' + runs + ' Straßen laufen vom Ortseingang bis zur Kante');
ok(statLot + '/' + runs + ' Parkplätze außerhalb des Ortes, frei, nicht auf der Straße');
ok(statBus + '/' + runs + ' Haltestellen gesetzt');
ok('mittlere Straßenlänge ' + (statLen / runs).toFixed(0) + ' Kacheln');

// ---- Der ursprüngliche Fehlerfall: Start im belegten Ortsmittelpunkt ----
console.log('Regressionsfall (Ortsmittelpunkt belegt):');
{
    const w = mkWorld(4242);
    const plan = planVillageAccess(w);
    const startsInside = w.blocked(plan.chain[0].gx, plan.chain[0].gy);
    startsInside ? fail('Straße beginnt im belegten Ort') : ok('Straße beginnt am Ortsrand, nicht im belegten Zentrum');
    plan.chain.length > 5 ? ok('Weg gefunden (' + plan.chain.length + ' Kacheln), kein Notweg')
                          : fail('nur Notweg');
}

console.log(bad ? `\n${bad} Fehler` : '\nZufahrtsplanung OK');
process.exit(bad ? 1 : 0);
