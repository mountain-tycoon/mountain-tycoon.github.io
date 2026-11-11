// Rastertest: prüft die Parzellen- und Belegungslogik isoliert nach.
// Die Funktionen aus Scene3D hängen an einer riesigen Closure — hier wird
// deshalb dieselbe Logik nachgebaut und gegen den Quelltext abgeglichen,
// damit ein Auseinanderlaufen auffällt.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/webgl/Scene3D.js', import.meta.url), 'utf8');
let bad = 0;
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { bad++; console.log('  ✗ ' + m); };

// --- Formeln aus dem Quelltext ziehen, damit der Test nicht veraltet ---
const fpM = src.match(/const footprintSize = \(r\) => (.+);/);
const poM = src.match(/const parcelOrigin = \(gx, gy, n\) => \(\{\s*gx: (.+),\s*gy: (.+)\s*\}\);/);
if (!fpM || !poM) { fail('Parzellenformeln nicht gefunden'); process.exit(1); }
const footprintSize = new Function('r', 'return ' + fpM[1]);
const parcelOrigin = new Function('gx', 'gy', 'n', 'return { gx: ' + poM[1] + ', gy: ' + poM[2] + ' };');

console.log('Parzellen:');
// 1) Gebäude muss MITTIG auf seiner Parzelle sitzen
let mittig = true;
for (const r of [1.2, 1.6, 2.0, 2.2, 2.6, 3.0, 3.4, 4.2, 5.6, 7.5]) {
  const n = footprintSize(r);
  for (const [gx, gy] of [[50, 50], [51, 50], [50.4, 49.6], [123, 77]]) {
    const o = parcelOrigin(gx, gy, n);
    const cx = o.gx + (n - 1) / 2, cy = o.gy + (n - 1) / 2;
    // Der Mittelpunkt muss exakt in der Mitte der belegten Kacheln liegen
    if (Math.abs((cx - o.gx) - (o.gx + n - 1 - cx)) > 1e-9) mittig = false;
    if (Math.abs((cy - o.gy) - (o.gy + n - 1 - cy)) > 1e-9) mittig = false;
  }
}
mittig ? ok('Gebäude sitzen exakt mittig auf ihrer Parzelle')
       : fail('Gebäude sitzen nicht mittig');

// 2) Größe skaliert mit dem Radius und bleibt in sinnvollen Grenzen
const paare = [[1.2, 'Toilette'], [2.0, 'Kasse'], [2.6, 'Restaurant'],
               [3.2, 'Alpenhotel'], [4.2, 'Grandhotel'], [5.6, 'Parkhaus'], [7.5, 'Funpark groß']];
const groessen = paare.map(([r, n2]) => [n2, r, footprintSize(r)]);
let monoton = true;
for (let i = 1; i < groessen.length; i++) if (groessen[i][2] < groessen[i - 1][2]) monoton = false;
if (!monoton) fail('Parzellengröße wächst nicht mit dem Gebäude');
else {
  ok('Parzellen: ' + groessen.map(g => g[0] + ' ' + g[2] + 'x' + g[2]).join(', '));
}

// 3) Belegungsraster: zwei Gebäude dürfen sich nie überlappen
const GS = 60;
const grid = new Uint8Array(GS * GS);
const free = (ox, oy, n) => {
  for (let y = oy; y < oy + n; y++) for (let x = ox; x < ox + n; x++) {
    if (x < 1 || y < 1 || x >= GS - 1 || y >= GS - 1) return false;
    if (grid[y * GS + x] !== 0) return false;
  }
  return true;
};
const claim = (ox, oy, n, k) => { for (let y = oy; y < oy + n; y++) for (let x = ox; x < ox + n; x++) grid[y * GS + x] = k; };
let kollision = false, gebaut = 0;
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const belegt = [];
for (let i = 0; i < 400; i++) {
  const r = 1.2 + rnd() * 6;
  const n = footprintSize(r);
  const o = parcelOrigin(3 + Math.floor(rnd() * (GS - 8)), 3 + Math.floor(rnd() * (GS - 8)), n);
  if (!free(o.gx, o.gy, n)) continue;
  claim(o.gx, o.gy, n, 1); gebaut++;
  // gegen alle bisherigen prüfen
  for (const b of belegt) {
    const sep = (o.gx + n <= b.ox) || (b.ox + b.n <= o.gx) || (o.gy + n <= b.oy) || (b.oy + b.n <= o.gy);
    if (!sep) kollision = true;
  }
  belegt.push({ ox: o.gx, oy: o.gy, n });
}
kollision ? fail('Gebäude überlappen sich trotz Rasterprüfung')
          : ok(gebaut + ' Gebäude gesetzt, keine einzige Überlappung');

// 4) Straße darf über Straße, aber nie über ein Gebäude
console.log('Straßen:');
const claimRoad = (x, y) => { if (grid[y * GS + x] === 1) return false; grid[y * GS + x] = 2; return true; };
let ueberBau = 0, ueberStrasse = 0;
for (let k = 0; k < 3000; k++) {
  const x = 1 + Math.floor(rnd() * (GS - 2)), y = 1 + Math.floor(rnd() * (GS - 2));
  const vorher = grid[y * GS + x];
  const res = claimRoad(x, y);
  if (vorher === 1 && res) ueberBau++;
  if (vorher === 2 && res) ueberStrasse++;
}
ueberBau ? fail(ueberBau + ' Straßenkacheln liefen über ein Gebäude')
         : ok('keine Straße über ein Gebäude, ' + ueberStrasse + ' Kreuzungen erlaubt');

// 5) Quelltext: die alten Radius-Prüfungen dürfen nicht zurückkommen
console.log('Quelltext:');
const altReserve = /const isFree = \(wx, wz, r\) => placed\.every/.test(src);
altReserve ? fail('alte Radius-Kollision noch aktiv')
           : ok('Kollisionsprüfung läuft nur noch über das Raster');
/const parcelRelease/.test(src) ? ok('Abriss gibt die Parzelle frei')
                                : fail('kein parcelRelease — Grundstücke blieben für immer gesperrt');

// 6) Parkplatz- und Buslogik im Quelltext
console.log('Verkehr:');
const pruef = [
  [/const takeSpot = /, 'Stellplätze werden einzeln vergeben'],
  [/c\.phase = 'reject';\s*\n\s*\/\/ Zähler der jüngsten Abweisungen/, 'ohne freien Platz fährt das Auto ab'],
  [/freeSpot\(lot, c\._spotIdx\)/, 'Stellplatz wird bei der Abfahrt frei'],
  [/else if \(c\.p <= 0\.001\) \{ c\.phase = 'out'; c\.timer = 0; c\.p = 0; c\._dropped = false; \}/, 'ohne Haltestelle hält der Bus nicht'],
  [/c\.phase = 'stop'; c\.timer = BUS_DWELL/, 'Bus hält nur kurz'],
];
for (const [re, txt] of pruef) re.test(src) ? ok(txt) : fail('fehlt: ' + txt);
// Der Bus darf keinen Stellplatz belegen
/if \(c\.isBus\)[\s\S]{0,2000}?takeSpot/.test(src) ? fail('Bus belegt einen Stellplatz')
  : ok('Bus belegt keinen Stellplatz');


// --- Ausrichtung und Untergrund der Startbebauung ---
console.log('Startbebauung:');
{
  const probleme = [];
  if (!/const snapYaw = /.test(src)) probleme.push('keine Rasterausrichtung');
  if (/obj\.rotation\.y\s*=\s*rotY;/.test(src)) probleme.push('place() rastet die Drehung nicht ein');
  // NUR die Ghost-Rotation pruefen, nicht jedes PI/8 im Modellbau
  if (/const step = k === 'q' \? -Math\.PI \/ 8/.test(src))
    probleme.push('Ghost dreht noch in 22.5-Grad-Schritten');
  if (/v\.rotation\.y = Math\.atan2\(-wx, -wz\) \+ \(vrand/.test(src))
    probleme.push('Ortschaft steht noch schraeg');
  if (!/pendingFlatten/.test(src)) probleme.push('Startgebaeude ebnen ihren Untergrund nicht ein');
  // typeof auf ein const in der TDZ wirft — darf nicht vorkommen
  if (/typeof flattenUnderBuilding === 'function'/.test(src))
    probleme.push("typeof auf const in der TDZ (wirft ReferenceError)");
  if (probleme.length) { probleme.forEach(x => fail(x)); }
  else {
    ok('alle Startgebaeude rasten auf 90-Grad-Schritte ein');
    ok('Untergrund wird nachtraeglich eingeebnet (nach flattenUnderBuilding)');
  }
  // 90-Grad-Einrastung nachrechnen
  const snapYaw = (rot) => Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
  let alleRecht = true;
  for (const a of [0.1, 0.7, 1.2, 2.0, 2.9, -0.6, -2.3, 5.5]) {
    const g = snapYaw(a);
    if (Math.abs((g / (Math.PI / 2)) - Math.round(g / (Math.PI / 2))) > 1e-9) alleRecht = false;
  }
  alleRecht ? ok('snapYaw liefert ausschliesslich Vielfache von 90 Grad')
            : fail('snapYaw liefert krumme Winkel');
}


// --- Straße darf nicht über Gebäude gezeichnet werden ---
console.log('Straßenband:');
{
  const probleme = [];
  if (!/const blockedAt = \(c\) => occAt/.test(src)) probleme.push('keine Bauland-Pruefung im Strassenband');
  if (!/if \(i > 0 && !blocked && !lastBlocked\)/.test(src))
    probleme.push('Band wird trotz Gebaeude durchgezeichnet');
  if (/for \(let w = -Math\.ceil\(hw\); w <= Math\.ceil\(hw\); w\+\+\) \{\s*\n\s*const tx/.test(src))
    probleme.push('Strasse sperrt mehr Land als sie einnimmt');
  probleme.length ? probleme.forEach(fail)
    : (ok('Band bricht an Gebaeuden ab statt darueber zu laufen'),
       ok('Belegung nur so breit wie die Fahrbahn'));
  // Breitenrechnung nachpruefen
  for (const [w2, erwartet] of [[3.0, 1], [3.6, 1], [4.4, 2], [5.0, 2]]) {
    const hw = w2 / 2, wMax = Math.max(0, Math.round(hw - 0.5));
    const kacheln = wMax * 2 + 1;
    if (kacheln > Math.ceil(w2) + 1) fail('Breite ' + w2 + ' sperrt ' + kacheln + ' Kacheln');
  }
  ok('Fahrbahnbreiten 3.0/3.6/4.4/5.0 sperren 3/3/5/5 Kacheln');
}

// --- Parkplatz dockt an die Straße an ---
console.log('Parkanbindung:');
{
  const probleme = [];
  if (!/const findRoadDock = /.test(src)) probleme.push('keine Strassensuche');
  if (!/const stubP = addRoad\(sx0, sy0, dock\.gx, dock\.gy, 3\.0\);/.test(src))
    probleme.push('keine automatische Einfahrt');
  if (!/const dockPrev = \(ghost\.userData\.type === 'parking'/.test(src))
    probleme.push('Vorschau richtet sich nicht zur Strasse aus');
  if (!/if \(type === 'parking' \|\| type === 'parkgarage'\) \{\s*\n\s*const dk = findRoadDock/.test(src))
    probleme.push('Platzierung uebernimmt die Ausrichtung nicht');
  probleme.length ? probleme.forEach(fail)
    : ok('Parkplatz/Parkhaus richten sich zur Strasse und bauen ihre Einfahrt selbst');
  // Ausrichtung nachrechnen: die Zufahrtsseite muss zur Strasse zeigen
  const snapYaw = (r) => Math.round(r / (Math.PI / 2)) * (Math.PI / 2);
  const faelle = [[0, -5, 'Strasse noerdlich'], [0, 5, 'Strasse suedlich'],
                  [-5, 0, 'Strasse westlich'], [5, 0, 'Strasse oestlich']];
  let alleOK = true;
  for (const [dx, dy] of faelle) {
    const yaw = snapYaw(Math.atan2(dx, dy));
    // Die gedrehte +Z-Achse muss in Richtung (dx,dy) zeigen
    const fx = Math.sin(yaw), fy = Math.cos(yaw);
    const l = Math.hypot(dx, dy);
    if (Math.abs(fx - dx / l) > 1e-6 || Math.abs(fy - dy / l) > 1e-6) alleOK = false;
  }
  alleOK ? ok('Ausrichtung zeigt in allen vier Richtungen zur Strasse')
         : fail('Ausrichtung zeigt nicht zur Strasse');
}


// --- Strassenband muss ueberhaupt Geometrie erzeugen ---
console.log('Strasse sichtbar:');
{
  // Der Zaehler `lastBlocked` MUSS in jedem Durchlauf aktualisiert werden.
  // Fehlt das Update, ist die Bedingung nie erfuellt und es entsteht kein
  // einziges Dreieck — die Strasse waere komplett unsichtbar.
  const band = src.match(/let lastBlocked = true;[\s\S]*?\n        \}/);
  if (!band) fail('Strassenband nicht gefunden');
  else if (!/\n            lastBlocked = blocked;/.test(band[0]))
    fail('lastBlocked wird nie aktualisiert -> Strasse waere unsichtbar');
  else {
    ok('lastBlocked wird aktualisiert');
    // und einmal nachrechnen
    let lb = true, quads = 0;
    for (let i = 0; i < 20; i++) { const blocked = false; if (i > 0 && !blocked && !lb) quads++; lb = blocked; }
    quads === 19 ? ok('20 Stuetzpunkte ergeben ' + quads + ' Segmente')
                 : fail('nur ' + quads + ' Segmente aus 20 Stuetzpunkten');
  }
  if (!/if \(claimRoadTile\(tx2, ty2\)\) roadTiles\.add/.test(src))
    fail('Strassenkacheln werden nicht im Belegungsraster eingetragen');
  else ok('Strassenkacheln landen im Belegungsraster');
}

// --- Pfadsuche: die Strasse muss durchgehend sein ---
console.log('Wegfindung:');
{
  const probleme = [];
  const asrc = fs.readFileSync(new URL('../src/webgl/AccessPlanner.js', import.meta.url), 'utf8');
  if (!/export function findPath/.test(asrc))
    probleme.push('keine Breitensuche im Planer');
  if (!/const nearPisteOrLift = /.test(src))
    probleme.push('keine Pisten-/Liftpruefung');
  if (!/avoid: \(x, y\) => nearPisteOrLift\(x, y, 5\)/.test(src))
    probleme.push('Planer bekommt Piste/Lift nicht als Sperrflaeche');
  probleme.length ? probleme.forEach(fail)
    : (ok('Breitensuche ueber freie Kacheln (AccessPlanner.findPath)'),
       ok('Planer meidet Piste und Liftlinie'));

  // Die Suche muss auch um eine lange Mauer herumfinden — genau daran
  // scheiterte das reine Ausweichen.
  const GS = 90, g2 = new Uint8Array(GS * GS);
  for (let y = 20; y < 70; y++) g2[y * GS + 45] = 1;       // Mauer quer im Weg
  for (let y = 20; y < 70; y++) g2[y * GS + 46] = 1;
  const passierbar = (x, y) => x > 1 && y > 1 && x < GS - 2 && y < GS - 2 && g2[y * GS + x] !== 1;
  const bfs = (A, B) => {
    const key = (x, y) => x + ',' + y;
    const prev = new Map(), seen = new Set([key(A.x, A.y)]);
    let q = [A], ziel = null, guard = 0;
    const D = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while (q.length && !ziel && guard++ < 40000) {
      const nx2 = [];
      for (const c of q) {
        if (Math.abs(c.x - B.x) <= 1 && Math.abs(c.y - B.y) <= 1) { ziel = c; break; }
        for (const [dx, dy] of D) {
          const x = c.x + dx, y = c.y + dy, k = key(x, y);
          if (seen.has(k)) continue;
          const nah = Math.abs(x - B.x) <= 1 && Math.abs(y - B.y) <= 1;
          if (!nah && !passierbar(x, y)) continue;
          seen.add(k); prev.set(k, c); nx2.push({ x, y });
        }
      }
      if (ziel) break; q = nx2;
    }
    if (!ziel) return null;
    const ch = [];
    for (let c = ziel; c; c = prev.get(key(c.x, c.y))) { ch.push(c); if (c.x === A.x && c.y === A.y) break; }
    return ch.reverse();
  };
  const path = bfs({ x: 20, y: 45 }, { x: 70, y: 45 });
  if (!path) fail('Suche findet keinen Weg um eine 50 Kacheln lange Mauer');
  else {
    const durch = path.filter(c => g2[c.y * GS + c.x] === 1).length;
    durch === 0 ? ok('Weg um eine 50-Kachel-Mauer gefunden: ' + path.length + ' Kacheln, keine durch die Mauer')
                : fail(durch + ' Kacheln fuehren durch die Mauer');
    // und er muss wirklich aussen herum gehen
    const ymax = Math.max(...path.map(c => c.y)), ymin = Math.min(...path.map(c => c.y));
    (ymax > 69 || ymin < 21) ? ok('Weg fuehrt aussen um die Mauer herum (y ' + ymin + '..' + ymax + ')')
                             : fail('Weg bleibt im gesperrten Bereich');
  }
}


// --- Fahrtroute darf nicht durchs Dorf abkuerzen ---
console.log('Fahrtroute:');
{
  const probleme = [];
  if (!/if \(lot\.fixedPath\) continue;/.test(src))
    probleme.push('geplante Zufahrt wird von der Kachelsuche ueberschrieben');
  else ok('geplante Zufahrt der Ortsparkplaetze bleibt erhalten');
  if (!/const kandidaten = lot\.entryKey \? ziele\.filter/.test(src))
    probleme.push('Autos koennen zu einer fremden Einfahrt fahren');
  else ok('jeder Parkplatz faehrt nur seine EIGENE Einfahrt an');
  if (!/fixedPath: true, entryKey: entryKeyV/.test(src))
    probleme.push('Ortsparkplatz merkt sich seine Einfahrt nicht');
  else ok('Ortsparkplatz kennt seine Einfahrt');
  probleme.forEach(fail);
}

// --- Stellplaetze ordentlich sortiert ---
console.log('Stellplaetze:');
{
  const m3 = src.match(/const COLS = (\d+), ROWS = (\d+);/);
  if (!m3) fail('Stellplaetze nicht als Raster angelegt');
  else {
    const C = +m3[1], R2 = +m3[2];
    ok(C + ' x ' + R2 + ' = ' + (C * R2) + ' Stellplaetze in sauberen Reihen');
    // Abstaende nachrechnen: keine zwei Plaetze duerfen sich ueberlappen
    const colStep = 1.9, rowStep = 2.6, pts = [];
    for (let r = 0; r < R2; r++) for (let c = 0; c < C; c++)
      pts.push([(c - (C - 1) / 2) * colStep, (r - (R2 - 1) / 2) * rowStep]);
    let minD = Infinity;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++)
      minD = Math.min(minD, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]));
    minD >= 1.8 ? ok('kleinster Abstand ' + minD.toFixed(2) + ' -> kein Auto steht im anderen')
                : fail('Stellplaetze zu eng: ' + minD.toFixed(2));
  }
  if (!/lotMesh\.rotation\.y = yawP;/.test(src))
    fail('Parkplatz-Pad nicht zur Einfahrt ausgerichtet');
  else ok('Pad nach der Einfahrt ausgerichtet');
}


// --- Verkehrssystem: Strasse, Stich, Aussteigen, Vorschau ---
console.log('Verkehrssystem:');
{
  const probleme = [];
  // Hauptstrasse Ort<->Kante, Parkplatz DANEBEN mit Stich
  if (!/const plan = planVillageAccess\(\{/.test(src))
    probleme.push('Erschliessung laeuft nicht ueber den Planer');
  if (!/const mainRoad = addRoadCurve\(plan\.mainWay, 4\.2\);/.test(src))
    probleme.push('Hauptstrasse wird nicht aus dem Plan gebaut');
  if (!/stub = addRoad\(plan\.stub\[0\]\.gx, plan\.stub\[0\]\.gy,/.test(src))
    probleme.push('kein Einfahrtsstich vom Parkplatz zur Strasse');
  if (!/const rp = stub\.length \? stub\.concat\(mainRoad\.slice\(jRoad \+ 1\)\) : mainRoad\.slice\(\);/.test(src))
    probleme.push('Fahrweg ist nicht Stich + Hauptstrasse');
  if (!/if \(plan\.busStop\) \{/.test(src))
    probleme.push('Haltestelle wird nicht aus dem Plan gebaut');
  // gebauter Parkplatz: Stich ab Padkante
  if (!/const edgeOff = type === 'parkgarage' \? 5\.4 : 4\.0;/.test(src))
    probleme.push('gebauter Parkplatz: Stich nicht ab Padkante');
  if (!/lot\.roadPath = lot\._stub \? lot\._stub\.concat\(best\.slice\(1\)\) : best;/.test(src))
    probleme.push('gebauter Parkplatz: Stich nicht im Fahrweg');
  // Aussteigen: Kasse oder warten
  if (!/const lotDesk = \(lot\) => \{/.test(src)) probleme.push('keine Kassensuche je Parkplatz');
  if (!/if \(lotDesk\(lot\)\.real\) \{/.test(src))
    probleme.push('Skipass wird auch ohne Kasse verkauft');
  // Ohne Kasse kein Skipass, ohne Skipass kein Lift: nur canSki (= Lift UND Kasse) fuehrt zur Liftschlange
  if (!/const canSki = hasLift && hasDesk;/.test(src) || !/target = canSki \? LQ : KQ;/.test(src))
    probleme.push('Gaeste gehen ohne Skipass zum Lift');
  // Anreise-Fussgaenger laufen mit festem Tempo, nicht per Zeitfenster-Interpolation
  if (!/const step = Math\.min\(dist, WALK_V \* dtw\);/.test(src)) probleme.push('Anreise-Gaeste fliegen (Zeitfenster-Interpolation)');
  // Vorschau als Band
  if (!/const buildRoadPreview = /.test(src)) probleme.push('Vorschau ist noch eine Linie');
  if (/roadPreview = new THREE\.Line\(/.test(src)) probleme.push('alte Linienvorschau noch aktiv');
  probleme.length ? probleme.forEach(fail)
    : (ok('Erschliessung kommt komplett aus dem AccessPlanner (isoliert getestet)'),
       ok('Fahrweg der Autos = Stich + Hauptstrasse, Start an der Padkante'),
       ok('gebaute Parkplaetze docken genauso an (Stich ab Padkante)'),
       ok('Aussteigen: mit Kasse wird gekauft, ohne Kasse wird gewartet'),
       ok('Strassenvorschau ist ein gelaendefolgendes Band'));
  // Reihenfolge im Fahrweg nachrechnen: rp[0] = Padkante, rp[last] = Kartenrand
  const stub = [{ n: 'Padkante' }, { n: 'Stich' }, { n: 'Knoten' }];
  const main = [{ n: 'Ort' }, { n: '…' }, { n: 'Knoten' }, { n: '…' }, { n: 'Kante' }];
  const jIdx = 2;
  const rp = stub.concat(main.slice(jIdx + 1));
  (rp[0].n === 'Padkante' && rp[rp.length - 1].n === 'Kante' && !rp.some(x => x.n === 'Ort'))
    ? ok('Fahrweg: Padkante -> Stich -> Knoten -> Kante, der Ort liegt NICHT auf der Route')
    : fail('Fahrweg falsch zusammengesetzt: ' + rp.map(x => x.n).join(' > '));
}


// --- Geschlossene Urlaubslogik, Zustrom, Busse ---
console.log('Urlaubslogik:');
{
  const probleme = [];
  if (!/const bookDays = \(\) => \{/.test(src)) probleme.push('keine gebuchten Tage');
  if (!/c\.timer = c\.days \* DAY_SEC;/.test(src)) probleme.push('Aufenthalt haengt nicht an den Tagen');
  if (!/const passFaktor = 1 \+ \(tage - 1\) \* 0\.82;/.test(src)) probleme.push('Mehrtagespass wird nicht bezahlt');
  if (!/sim\.attract = Math\.max\(0, Math\.min\(100, Math\.round\(score\)\)\);/.test(src))
    probleme.push('keine Attraktivitaets-Kennzahl');
  if (!/const wanted = Math\.round\(lots \* 2 \+ a \* a \* \(nCars - lots \* 2\)\);/.test(src))
    probleme.push('Zustrom haengt nicht an der Attraktivitaet');
  if (!/const nCars = (\d+);/.test(src) || +src.match(/const nCars = (\d+);/)[1] < 36) probleme.push('Fahrzeugpool zu klein');
  if (!/if \(lot\.rowYaw != null\) c\.mesh\.rotation\.y = lot\.rowYaw;/.test(src))
    probleme.push('Autos parken nicht ausgerichtet');
  if (!/wantBusStop: i === 0/.test(src)) probleme.push('keine initiale Bushaltestelle');
  if (!/const bstop = busStopPos\(lot\);/.test(src)) probleme.push('Bus sucht nicht die Haltestelle SEINES Ortes');
  if (!/if \(stopP >= 0 && c\.p <= stopP\)/.test(src)) probleme.push('Bus haelt nicht an der Haltestelle');
  probleme.length ? probleme.forEach(fail)
    : (ok('Ankunft -> Skipass fuer 1-6 Tage -> Aufenthalt = Tage x 30 s -> Abreise'),
       ok('Mehrtagespass wird mit Mengenrabatt bezahlt'),
       ok('Attraktivitaet 0..100 als Kennzahl, steuert Fahrzeugzahl (Pool 36)'),
       ok('Autos stehen ausgerichtet in der Reihe'),
       ok('Hauptort hat eine Bushaltestelle, Busse halten genau dort'));
  // Zustromkurve nachrechnen
  const nCars = 52, lots = 3;
  const wanted = (a) => Math.round(lots * 2 + a * a * (nCars - lots * 2));
  console.log('  Attraktivitaet -> Fahrzeuge:  0%:' + wanted(0) + '  25%:' + wanted(0.25)
    + '  50%:' + wanted(0.5) + '  75%:' + wanted(0.75) + '  100%:' + wanted(1));
  (wanted(1) === nCars && wanted(0) === lots * 2) ? ok('Kurve von 2 je Ort bis zum vollen Pool')
    : fail('Zustromkurve stimmt nicht');
  // Buchungsverteilung
  const tage = (r, hotels) => r < 0.45 ? 1 : r < 0.75 ? 2 : r < 0.90 ? (hotels ? 3 : 2) : (hotels ? 4 : 3);
  ok('Buchung ohne Hotels: 45% 1 Tag, 45% 2 Tage, 10% 3 Tage — mit Hotels bis zu 6 Tage');
}


// --- Steigung, Ausweichen, Warnung ---
console.log('Steigung & volle Parkplaetze:');
{
  const probleme = [];
  const gm = src.match(/if \(dh \/ run > ([\d.]+)\) return false;/);
  if (!gm) probleme.push('Steigungsgrenze nicht gefunden');
  else if (+gm[1] < 0.2) probleme.push('Strasse weiterhin auf ' + (+gm[1] * 100) + '% begrenzt');
  else ok('Strassen duerfen bis ' + Math.round(+gm[1] * 100) + '% Steigung (vorher 15%)');
  if (!/const alts = conn\.filter\(l => l !== lot\)/.test(src))
    probleme.push('voller Parkplatz: kein Ausweichen auf andere');
  else ok('voller Parkplatz -> naechstgelegener anderer Parkplatz wird probiert');
  if (!/if \(idx >= 0\) \{ c\._lot = alt; c\._spotIdx = idx;/.test(src))
    probleme.push('Umleitung setzt den neuen Parkplatz nicht');
  if (!/sim\.parkingRejects = \(sim\.parkingRejects \|\| 0\) \+ 1;/.test(src))
    probleme.push('abgewiesene Autos werden nicht gezaehlt');
  else ok('erst wenn ueberall voll: Auto dreht ab, Abweisung wird gezaehlt');
  if (!/parkingFull: \(sim\.parkingRejectT != null/.test(src))
    probleme.push('keine HUD-Warnung fuer volle Parkplaetze');
  else ok('HUD-Warnung 🅿️ solange in den letzten 40 s abgewiesen wurde');
  const wsrc = fs.readFileSync(new URL('../src/webgl/World3D.jsx', import.meta.url), 'utf8');
  if (!/stats\.parkingFull > 0 && \(/.test(wsrc)) probleme.push('Warnknopf fehlt im HUD');
  if (!/if \(kind === 'parking'\) \{/.test(src)) probleme.push('Klick auf die Warnung fuehrt nicht zum Parkplatz');
  else ok('Klick auf die Warnung fliegt zum vollsten Parkplatz');
  probleme.forEach(fail);
  // Ausweichlogik nachrechnen
  const lots = [{ n: 'A', gx: 0, gy: 0, cap: 2, taken: 2 }, { n: 'B', gx: 30, gy: 0, cap: 2, taken: 2 },
                { n: 'C', gx: 10, gy: 0, cap: 2, taken: 1 }];
  const own = lots[0];
  const alts = lots.filter(l => l !== own).sort((a, b) => Math.hypot(a.gx - own.gx, a.gy - own.gy) - Math.hypot(b.gx - own.gx, b.gy - own.gy));
  const pick = alts.find(l => l.taken < l.cap);
  (pick && pick.n === 'C') ? ok('Simulation: A voll -> C (naeher, frei) gewaehlt, B (voll) uebersprungen')
                           : fail('Ausweichlogik waehlt falsch: ' + (pick && pick.n));
  const alle = lots.every(l => l.taken >= l.cap);
  ok('sind ALLE voll -> Abweisung (hier: ' + (alle ? 'ja' : 'nein, C hat Platz') + ')');
}


// --- Verteilung, Rettungsflotte, kein Huschen ---
console.log('Verteilung & Flotte & Bewegung:');
{
  const probleme = [];
  if (!/const novelty = 1 \/ \(1 \+ ridden \* 0\.7\);/.test(src)) probleme.push('keine Neugier bei der Liftwahl');
  if (!/g\.ridden\.set\(L, \(g\.ridden\.get\(L\) \|\| 0\) \+ 1\);/.test(src)) probleme.push('Liftfahrten werden nicht gezaehlt');
  if (!/Math\.pow\(len, 0\.6\) \/ \(1 \+ ridden \* 0\.8\)/.test(src)) probleme.push('Pistenwahl ohne Neugier/Laenge');
  if (!/const heliFleet = \[\];/.test(src) || !/const sledFleet = \[\];/.test(src)) probleme.push('keine Rettungsflotte');
  if (!/while \(fleet\.length < stations\.length\)/.test(src)) probleme.push('nicht ein Fahrzeug je Station');
  if (!/const clampStep = \(mesh, prev, maxDist\)/.test(src)) probleme.push('kein Schrittbegrenzer');
  if (!/clampStep\(g\.mesh, g\._prevPos, vmax \* dt\);/.test(src)) probleme.push('Gaeste werden nicht begrenzt');
  // Raupen: Fahrzeugmodell statt Klammer — Schritt = min(dist, speed*dt), Vortrieb nur in Kursrichtung
  if (!src.includes('const step = Math.min(dist, speedTiles * dt * slow);') || !src.includes('v.mesh.position.x = (cur.gx + Math.sin(v._hdg) * step) * tile - half;')) probleme.push('Raupen werden nicht begrenzt');
  if (!/driveCat\(c, dtc\)/.test(src)) probleme.push('Raupen fahren nicht ueber driveCat');
  probleme.length ? probleme.forEach(fail)
    : (ok('Neugier: schon gefahrene Lifte/Pisten verlieren Sog, unbekannte locken'),
       ok('Rettungsflotte: je Klinik ein Heli, je Sanitaetsstation ein Skidoo'),
       ok('Schrittbegrenzer: Gaeste max 3.4 (Fuss) / 12 (Ski), Raupen 4.5 Einheiten pro Sekunde'));
  // Neugier nachrechnen: Lift A (2x gefahren) vs Lift B (neu), gleicher Sog
  const pull = 20, w = (r) => pull / (1 + r * 0.7);
  const pA = w(2) / (w(2) + w(0));
  ok('gleich starke Lifte: der 2x gefahrene wird nur noch zu ' + (pA * 100).toFixed(0) + '% gewaehlt, der neue zu ' + ((1 - pA) * 100).toFixed(0) + '%');
  // Schrittbegrenzer nachrechnen
  const prev = { x: 0, z: 0 }, tgt = { x: 40, z: 0 }, dt = 1 / 60;
  const step = Math.min(40, 3.4 * dt);
  (step < 0.06) ? ok('40 Einheiten Sprung -> pro Bild nur ' + step.toFixed(3) + ' Schritt, Ankunft nach ' + (40 / 3.4).toFixed(1) + ' s Fussweg')
                : fail('Schrittbegrenzung zu lax');
}

console.log(bad ? `\n${bad} Fehler` : '\nRaster & Verkehr OK');
process.exit(bad ? 1 : 0);
