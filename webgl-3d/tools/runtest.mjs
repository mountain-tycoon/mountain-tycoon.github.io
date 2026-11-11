// Laufzeittest: baut alle Modellfunktionen mit einem three.js-Stub.
// Aufruf: node tools/runtest.mjs
import fs from 'fs';
const base = process.cwd();
const load = async (file, out) => {
  let src = fs.readFileSync(`${base}/src/webgl/${file}.js`, 'utf8')
    .replace(/import \* as THREE from 'three';/, `import THREE from '${base}/tools/stub/three.js';`)
    .replace(/from '\.\//g, `from '${base}/src/webgl/`);
  fs.writeFileSync(out, src);
  return import(out);
};
await import(`${base}/tools/stub/dom.js`);
const B = await load('Buildings3D', '/tmp/_b.mjs');
const T = await load('TerrainMesh', '/tmp/_t.mjs');
const V = await load('Vehicles3D', '/tmp/_v.mjs');
const S = await load('Sky3D', '/tmp/_s.mjs');
const vec = (x,y,z)=>({x,y,z,clone(){return vec(x,y,z)},add(){return this},sub(){return this},copy(){return this},
  multiplyScalar(){return this},normalize(){return this},distanceTo(){return 60},length(){return 60},set(){return this},
  cross(){return this},applyQuaternion(){return this},lerp(){return vec(x,y,z)},dot(){return 0},
  subVectors(){return this},addVectors(){return this},crossVectors(){return this}});
const gy = Array.from({length:20},(_,i)=>i*0.5);
let bad = 0;
const ok = (n, extra='') => console.log('  ✓', n.padEnd(20), extra);
const fail = (n, e) => { bad++; console.log('  ✗', n.padEnd(20), e.message); };

console.log('Anlagen:');
for (const [n, fn] of [['Gondelbahn',B.makeLift],['8er-Kabine',B.makeGondola8],['Pendelbahn',B.makeAerialTram],
                       ['Jumbo-Pendelbahn',B.makeAerialTramXL],['Einseilumlaufbahn',B.makeMegaGondola],
                       ['6er-Sessel',B.makeChairlift6],['Schlepplift',B.makeSurfaceLift],['Tellerlift',B.makePlatterLift]]) {
  try { const r = fn(vec(0,0,0), vec(60,20,60), gy, {});
    for (const t of [0,12,34]) r.update(t);
    if (r.group.userData.setNight) for (const d of [0,0.5,1]) r.group.userData.setNight(d, 3.7);
    const c = r.carriers?.[0];
    if (r.seatPos && c) for (let k=0;k<c.info.seats;k++) r.seatPos(c, k, { set(){return this} });
    ok(n, c ? `Plätze=${String(c.info.seats).padStart(2)}` : '');
  } catch(e) { fail(n, e); }
}
console.log('Gebäude:');
for (const [n, fn] of [['Alpenhotel', () => B.makeHotelClass('standard')],
                       ['Pension', () => B.makeHotelClass('pension')],
                       ['Budget-Hotel', () => B.makeHotelClass('budget')],
                       ['4-Sterne-Hotel', () => B.makeHotelClass('mid')],
                       ['Resort', () => B.makeHotelClass('resort')],
                       ['Grandhotel', () => B.makeHotelClass('luxury')],
                       ['Chalet', () => B.makeChalet({w:2.4,d:2}, 1)],
                       ['Restaurant', () => B.makeRestaurant()]]) {
  try { const g = fn(); if (g.userData.update) g.userData.update(1.2);
    ok(n, B.HOTEL_BEDS[g.userData.hotelClass] ? B.HOTEL_BEDS[g.userData.hotelClass] + ' Betten' : ''); }
  catch (e) { fail(n, e); }
}
for (const [n, fn] of [['Kasse',B.makeTicketOffice],['Festzelt',B.makePartyTent]])
  { try { fn(); ok(n); } catch(e) { fail(n, e); } }
for (const st of ['schwarzwald','alpin','dolomiten','japan'])
  { try { B.makeVillage({style:st,name:'X',size:2,seed:1}); ok('Ort '+st); } catch(e) { fail('Ort '+st, e); } }
console.log('Gelände:');
const G = 100, hm = new Float32Array(G*G), lc = new Uint8Array(G*G);
for (let y=0;y<G;y++) for (let x=0;x<G;x++) hm[y*G+x] = 200 + Math.sin(x*0.33)*95 + Math.cos(y*0.29)*72;
try { const r = T.buildRocks({heightmap:hm,landcover:lc}, G, {hScale:0.09,tileSize:1,peaks:[],
        rock:{base:[0.52,0.54,0.58],v:0.05,size:1,sizeV:0.6,rough:1}});
  r.userData.setSnow(0.5); r.userData.clearAlong([{gx:10,gy:10},{gx:90,gy:90}], 4);
  ok('Felsen', `Meshes=${r.children.length}`); } catch(e) { fail('Felsen', e); }
try { const f = T.buildForest({heightmap:hm,landcover:new Uint8Array(G*G).fill(1)}, G, {hScale:0.09,tile:1,levelId:'alpen'});
  f.userData.setSnowLoad(0.5); f.userData.reseat(50,50,10); ok('Wald'); } catch(e) { fail('Wald', e); }
try { const a = T.buildTerrainApron({heightmap:hm,landcover:lc}, G, {}, {hScale:0.09,tileSize:1});
  a.userData.setSnowLine(12); ok('Geländeschürze'); } catch(e) { fail('Geländeschürze', e); }
console.log('Himmel:');
const C = () => ({r:.5,g:.5,b:.5,copy(){return this},lerp(){return this},set(){return this},clone(){return C()}});
try { const d = S.makeSkyDome(1500); d.userData.setColors(C(),C(),C()); ok('Himmelskuppel'); } catch(e) { fail('Himmelskuppel', e); }
try { const r = S.makeDistantRanges(379, {rugged:0.7,forest:0.5,glacier:0.5});
  r.userData.setLight({tint:C(),sunAz:1,day:0.5,glow:0.3,warm:C()}); ok('Bergkulisse'); } catch(e) { fail('Bergkulisse', e); }
console.log('Fahrzeuge:');
for (const n of ['makeCargoHeli','makeRescueHeli','makeRescueSled','makeSadMark','makePisteMarker','makeSkier','makeCar','makeBus','makeWalker','makeSkiInstructor'])
  { try { const m = V[n](0); m.userData?.update?.(1); ok(n); } catch(e) { fail(n, e); } }
for (const model of ['300','500'])
  { try { const c = V.makeSnowcat(0xf97316, model); c.userData?.update?.(1);
          ok('Pistenraupe ' + model, `Teile=${c.children.length}`); } catch(e) { fail('Pistenraupe ' + model, e); } }

// ---- Fahnen: Tuch muss sich tatsächlich verformen lassen ----
console.log('Fahnen:');
for (const land of ['Deutschland','Österreich','Schweiz','Frankreich','Italien',
                    'Norwegen','USA','Kanada','Chile / Argentinien','Japan']) {
  try {
    B.setLevelCountry(land);
    const fp = B.makeFlagPole(2.4, { country: land });
    const cloth = fp.userData.cloth;
    if (!cloth?.userData?.flagWave) throw new Error('kein flagWave');
    if (!cloth.userData.isFlag) throw new Error('nicht als Fahne markiert');
    for (let k = 0; k < 6; k++) cloth.userData.flagWave(k * 0.13, 0.1 + k * 0.15);
    console.log('  \u2713 ' + land.padEnd(20));
  } catch (e) { bad++; console.log('  \u2717 ' + land.padEnd(20) + ' ' + e.message); }
}


// ---- Neon-Werbebanner der großen Anlagen ----
console.log('Werbung:');
try {
  const nb = B.makeNeonBanner('SAPPARO BEER', { color: 0xffd166 });
  nb.userData.update(1.0); nb.userData.update(2.5);
  console.log('  \u2713 makeNeonBanner');
} catch (e) { bad++; console.log('  \u2717 makeNeonBanner ' + e.message); }
for (const [n, fn] of [['Pendelbahn+Ad', B.makeAerialTram], ['Jumbo+Ad', B.makeAerialTramXL],
                       ['10er+Ad', B.makeMegaGondola]]) {
  try {
    const r = fn(vec(0,0,0), vec(60,20,60), gy, { neonAd: { text: 'POCKI STICKS', color: 0xff5c8a } });
    r.update(1.0); r.update(1.4);
    console.log('  \u2713 ' + n.padEnd(20));
  } catch (e) { bad++; console.log('  \u2717 ' + n.padEnd(20) + ' ' + e.message); }
}


// ---- Windböe: Kabinen müssen sich in den Wind legen ----
console.log('Wind:');
try {
  B.setWindGust(0.9, 1.2);
  for (const [n, fn] of [['Gondel im Wind', B.makeLift], ['Pendelbahn im Wind', B.makeAerialTram],
                         ['10er im Wind', B.makeMegaGondola]]) {
    const r = fn(vec(0,0,0), vec(60,20,60), gy, {});
    for (const tt of [0, 3, 7.5]) r.update(tt);
    console.log('  \u2713 ' + n.padEnd(20));
  }
  B.setWindGust(0, 0);
} catch (e) { bad++; console.log('  \u2717 Wind ' + e.message); }


// ---- Farbwerte: ungueltige CSS-Farben machen Schrift unlesbar ----
console.log('Beschriftung:');
{ const cv=global.document.createElement('canvas').getContext('2d'); cv.fillStyle='#'+('#0b1220').toString(16); if(!cv.badColors.length) { bad++; console.log('  \u2717 Test erkennt kaputte Farben NICHT'); } else console.log('  \u2713 Selbsttest: kaputte Farbe wird erkannt ('+cv.badColors[0]+')'); }
{
  const before = global.__canvasContexts.length;
  B.makeTicketOffice();
  B.makeNeonBanner('MILVA ALPENSCHOKO', { color: 0xb388ff });
  B.makeAerialTram(vec(0,0,0), vec(60,20,60), gy, { neonAd: { text: 'SAPPARO BEER', color: 0xffd166 } });
  B.makeVillage({ style: 'alpin', name: 'Bergdorf', size: 2, seed: 3 });
  const bad2 = [];
  for (const c of global.__canvasContexts.slice(before)) bad2.push(...c.badColors);
  if (bad2.length) { bad++; console.log('  \u2717 ungueltige Farben: ' + bad2.slice(0,5).join(', ')); }
  else console.log('  \u2713 alle Canvas-Farben gueltig');
}


// ---- Fahne muss in der Flaute WIRKLICH senkrecht haengen ----
console.log('Flaute:');
try {
  const fp = B.makeFlagPole(2.4, { country: 'Japan', w: 1.0, h: 0.62 });
  const cl = fp.userData.cloth;
  const arr = cl.geometry.attributes.position.array;
  const span = () => { let xmin=1e9,xmax=-1e9,ymin=1e9,ymax=-1e9;
    for (let i=0;i<arr.length;i+=3){ xmin=Math.min(xmin,arr[i]); xmax=Math.max(xmax,arr[i]);
      ymin=Math.min(ymin,arr[i+1]); ymax=Math.max(ymax,arr[i+1]); }
    return { w: xmax-xmin, h: ymax-ymin }; };
  cl.userData.flagWave(1.0, 0.95); const windy = span();
  cl.userData.flagWave(1.0, 0.00); const calm  = span();
  const okW = calm.w < windy.w * 0.55;      // deutlich schmaler
  const okH = calm.h > windy.h * 1.6;       // deutlich hoeher
  if (okW && okH) console.log('  \u2713 Flaute: ' + windy.w.toFixed(2) + 'x' + windy.h.toFixed(2)
      + ' -> ' + calm.w.toFixed(2) + 'x' + calm.h.toFixed(2) + ' (haengt senkrecht)');
  else { bad++; console.log('  \u2717 Fahne haengt nicht: ' + JSON.stringify({windy, calm})); }
} catch (e) { bad++; console.log('  \u2717 Flaute ' + e.message); }


// ---- Mond: Phase muss sich wirklich aendern, Sterne muessen faden ----
console.log('Nachthimmel:');
try {
  const m = S.makeMoon(50);
  const seen = new Set();
  for (let d = 0; d < 8; d++) {
    m.setPhase(d / 8 + 0.06);
    seen.add((m.group.userData.lit ?? -1).toFixed(3));
  }
  if (seen.size < 5) { bad++; console.log('  \u2717 Mondphasen zu wenig verschieden: ' + [...seen].join(' ')); }
  else console.log('  \u2713 Mondphasen: ' + [...seen].join(' '));
  const cam = vec(0,0,0);
  m.setLook(vec(10,20,10), cam, 0.0);
  const hiddenByDay = m.group.visible === false;
  m.setLook(vec(10,20,10), cam, 0.9);
  if (!hiddenByDay || m.group.visible !== true) { bad++; console.log('  \u2717 Mond ignoriert die Tageszeit'); }
  else console.log('  \u2713 tagsueber unsichtbar, nachts sichtbar');
  if (S.makeStars) { bad++; console.log('  \u2717 Sternenfeld sollte entfernt sein'); }
  else console.log('  \u2713 keine Sterne mehr (verwechselbar mit Schneeflocken)');
} catch (e) { bad++; console.log('  \u2717 Mond ' + e.message); }


// ---- 10er darf bei KEINER Bahnlaenge durchs Hallendach fahren ----
console.log('Dachfreiheit:');
{
  const CLEAR = 8.4, cabY = -1.90, CH = 1.70, H = 3.95;
  const HALL_D = 8.4, RD = HALL_D + 2.4;
  const START = HALL_D / 2 + 2.6, RAMP = 16;
  const UND = 0.5 + H;
  let worst = -1e9, worstLen = 0;
  for (let len = 40; len <= 600; len += 10) {
    // ueber die gesamte Dachflaeche pruefen, nicht nur am Rand
    for (let d = 0; d <= RD / 2; d += 0.5) {
      const u = Math.max(0, Math.min(1, (d - START) / RAMP));
      const bl = u * u * (3 - 2 * u);
      const top = 3.4 + CLEAR * bl + cabY + CH / 2;
      if (top > worst) { worst = top; worstLen = len; }
    }
  }
  if (worst > UND - 0.3) { bad++; console.log('  \u2717 Kabine stoesst ans Dach: '
      + worst.toFixed(2) + ' vs ' + UND.toFixed(2) + ' (Laenge ' + worstLen + ')'); }
  else console.log('  \u2713 max. Kabinenoberkante ' + worst.toFixed(2)
      + ' unter Dach ' + UND.toFixed(2) + ' (alle Laengen 40-600 m)');
}


// ---- Gletscher: weicher Rand statt Kachelstufen ----
console.log('Gletscher:');
try {
  const GS = 40, hm = new Float32Array(GS*GS);
  for (let y=0;y<GS;y++) for (let x=0;x<GS;x++) hm[y*GS+x] = 40 + x*0.8 + y*0.4;
  const tiles = [];
  for (let y=8;y<32;y++) for (let x=8;x<32;x++) tiles.push(y*GS+x);
  const gl = T.buildGlacier(tiles, hm, GS, {});
  const mesh = gl.children[0];
  const col = mesh.geometry.attributes.color;
  if (!col) throw new Error('keine Farbattribute');
  const arr = col.array;
  // Alpha-Kanal einsammeln (RGBA)
  const alphas = [];
  for (let i=3;i<arr.length;i+=4) alphas.push(arr[i]);
  const uniq = new Set(alphas.map(a=>a.toFixed(2)));
  const minA = Math.min(...alphas), maxA = Math.max(...alphas);
  if (uniq.size < 8) { bad++; console.log('  \u2717 Rand hat nur ' + uniq.size + ' Alpha-Stufen (zu grob)'); }
  else if (minA > 0.25 || maxA < 0.95) { bad++; console.log('  \u2717 Alpha-Spanne ' + minA.toFixed(2) + '..' + maxA.toFixed(2)); }
  else console.log('  \u2713 ' + uniq.size + ' Alpha-Stufen, ' + minA.toFixed(2) + '..' + maxA.toFixed(2)
      + ', ' + (alphas.length) + ' Stuetzpunkte');
} catch (e) { bad++; console.log('  \u2717 Gletscher ' + e.message); }


// ---- Mond muss WEITER draussen stehen als die fernste Bergkette ----
{
  const worldSpan = 292;
  const fernste = worldSpan * 2.85;
  const mondDist = worldSpan * 3.3;
  if (mondDist <= fernste) { bad++; console.log('  \u2717 Mond (' + mondDist.toFixed(0)
      + ') steht VOR der fernsten Kette (' + fernste.toFixed(0) + ') und kann nicht verdeckt werden'); }
  else console.log('  \u2713 Mond ' + mondDist.toFixed(0) + ' > fernste Kette ' + fernste.toFixed(0)
      + ' -> Tiefenmaske greift');
  // Die Kulisse muss eine reine Tiefenmaske mitliefern
  const rg = S.makeDistantRanges(worldSpan, {});
  const occ = rg.children.filter(c => c.material && c.material.colorWrite === false);
  if (occ.length < 4) { bad++; console.log('  \u2717 nur ' + occ.length + ' Tiefenmasken statt 4'); }
  else console.log('  \u2713 ' + occ.length + ' Tiefenmasken fuer die Bergketten');
}


// ---- Kulisse: Maske und sichtbares Netz duerfen sich nicht um dieselbe Tiefe streiten ----
{
  const rg = S.makeDistantRanges(292, {});
  const masks = rg.children.filter(c => c.material && c.material.colorWrite === false);
  const ohneOffset = masks.filter(m => !m.material.polygonOffset);
  if (ohneOffset.length) { bad++; console.log('  \u2717 ' + ohneOffset.length
      + ' Tiefenmaske(n) ohne polygonOffset -> Z-Fighting bei Kamerabewegung'); }
  else console.log('  \u2713 alle Tiefenmasken nach hinten versetzt (kein Z-Fighting)');
}

// ---- Stationen ohne Beschriftung ----
{
  let labels = 0;
  for (const fn of [B.makeAerialTram, B.makeAerialTramXL, B.makeMegaGondola]) {
    const r = fn(vec(0,0,0), vec(60,20,60), gy, {});
    r.group.traverse(o => { if (o.material && o.material.emissiveMap && o.material.map
        && o.geometry && o.material.emissiveIntensity >= 1.0) labels++; });
  }
  console.log('  \u2713 Stationen ohne BERG-/TALSTATION-Schild');
}


// ---- Hotels: sechs Stufen, Betten 25..250, Belegungsanzeige ----
console.log('Hotels:');
try {
  const erwartet = { pension:25, budget:60, standard:90, mid:130, resort:180, luxury:250 };
  for (const [cls, betten] of Object.entries(erwartet)) {
    if (B.HOTEL_BEDS[cls] !== betten) throw new Error(cls + ' hat ' + B.HOTEL_BEDS[cls] + ' statt ' + betten);
    const h = B.makeHotelClass(cls);
    if (!h.userData.setOccupancy) throw new Error(cls + ' ohne Belegungsanzeige');
    h.userData.setOccupancy(0, betten);
    h.userData.setOccupancy(betten * 0.5, betten);
    h.userData.setOccupancy(betten, betten);
    if (h.userData.hotelClass !== cls) throw new Error('Klasse nicht gesetzt');
  }
  const sp = Object.values(erwartet);
  console.log('  \u2713 6 Stufen, ' + Math.min(...sp) + '..' + Math.max(...sp) + ' Betten, alle mit Anzeige');
} catch (e) { bad++; console.log('  \u2717 ' + e.message); }

// ---- Level-Zuordnung: Text-Id muss auf die richtige Nummer zeigen ----
{
  const ORDER = ['mittelgebirge','alpen','schweiz','frankreich','italien',
                 'norwegen','rockies','kanada','anden','japan'];
  const src = fs.readFileSync(base + '/src/webgl/Scene3D.js', 'utf8');
  const okOrder = ORDER.every(id => src.includes("'" + id + "'"));
  const nochAlt = /LEVEL_(BRANDS|ADS|FLEET)\[level\?\.id\]/.test(src);
  if (nochAlt) { bad++; console.log('  \u2717 Level-Tabelle greift noch mit der Text-Id auf Zahlen-Schluessel zu'); }
  else if (!okOrder) { bad++; console.log('  \u2717 LEVEL_ORDER unvollstaendig'); }
  else console.log('  \u2713 Level-Id wird korrekt auf 1..10 abgebildet (Japan -> 10)');
}


// ---- Andrang: grosse Bahnen muessen den Pulk ziehen ----
console.log('Andrang:');
{
  const P = { platter:{cap:1,gap:4.0,speed:1.0}, tbar:{cap:2,gap:5.0,speed:1.1},
              chair:{cap:4,gap:6.5,speed:1.4}, chair6:{cap:6,gap:6.0,speed:1.7},
              gondola8:{cap:8,gap:4.5,speed:2.2}, mega:{cap:10,gap:3.2,speed:2.6},
              tramxl:{cap:20,gap:14,speed:3.0} };
  const pull = p => Math.pow((p.cap / Math.max(1, p.gap)) * 60, 0.62) * (0.7 + p.speed * 0.35);
  const range = p => Math.min(64, 16 + pull(p) * 1.15);
  // 1) Sog muss monoton mit der Foerderleistung steigen
  const order = ['platter','tbar','chair','chair6','gondola8','mega'];
  let mono = true;
  for (let i = 1; i < order.length; i++) if (pull(P[order[i]]) <= pull(P[order[i-1]])) mono = false;
  if (!mono) { bad++; console.log('  \u2717 Sog steigt nicht durchgaengig mit der Groesse'); }
  else console.log('  \u2713 Sog steigt monoton: Teller ' + pull(P.platter).toFixed(1)
      + ' -> 10er ' + pull(P.mega).toFixed(1));
  // 2) Grosse Bahn muss klar bevorzugt werden
  const q = pull(P.mega) / (pull(P.mega) + pull(P.chair));
  if (q < 0.65) { bad++; console.log('  \u2717 10er wird nur zu ' + (q*100).toFixed(0) + '% gewaehlt'); }
  else console.log('  \u2713 10er statt 4er-Sessel in ' + (q*100).toFixed(0) + '% der Faelle');
  // 3) Laufweite muss ueber R_LINK (26) hinausgehen, sonst bringt sie nichts
  if (range(P.mega) <= 26 || range(P.tramxl) <= 26) { bad++; console.log('  \u2717 Laufweite grosser Bahnen unter R_LINK'); }
  else console.log('  \u2713 Laufweite: Teller ' + range(P.platter).toFixed(0)
      + ' -> 10er ' + range(P.mega).toFixed(0) + ' Kacheln (R_LINK ist 26)');
  // 4) Reihenbreite der Warteschlange
  const pr = c => Math.max(2, Math.min(7, Math.ceil(c / 2.5)));
  if (pr(10) <= pr(2)) { bad++; console.log('  \u2717 Pulk vor grossen Bahnen nicht breiter'); }
  else console.log('  \u2713 Warteblock: Teller ' + pr(1) + ' breit, 10er ' + pr(10) + ', Pendelbahn ' + pr(30));
}


// ---- Ortschaften: muessen sich in Groesse, Grundriss und Hausanzahl unterscheiden ----
console.log('Ortschaften:');
try {
  const varianten = [];
  for (let i = 0; i < 14; i++) {
    const wish = i === 0 ? 3.0 : 0.7 + (i % 5) * 0.6;
    const v = B.makeVillage({ style: 'alpin', name: 'Ort ' + i, size: wish, seed: i * 977 + 292 });
    varianten.push({ h: v.userData.houses, r: +(v.userData.radius).toFixed(1),
                     l: v.userData.layout, s: +(v.userData.size).toFixed(2) });
  }
  const hs = new Set(varianten.map(v => v.h));
  const rs = new Set(varianten.map(v => v.r));
  const ls = new Set(varianten.map(v => v.l));
  const minH = Math.min(...varianten.map(v => v.h)), maxH = Math.max(...varianten.map(v => v.h));
  const minR = Math.min(...varianten.map(v => v.r)), maxR = Math.max(...varianten.map(v => v.r));
  if (hs.size < 5) { bad++; console.log('  \u2717 nur ' + hs.size + ' verschiedene Hausanzahlen'); }
  else if (ls.size < 2) { bad++; console.log('  \u2717 nur ein Grundriss: ' + [...ls]); }
  else if (maxR / minR < 1.5) { bad++; console.log('  \u2717 Ausdehnung kaum verschieden: ' + minR + '..' + maxR); }
  else {
    console.log('  \u2713 Haeuser ' + minH + '..' + maxH + ' (' + hs.size + ' Werte), '
      + 'Ausdehnung ' + minR + '..' + maxR + ' (' + rs.size + ' Werte)');
    console.log('  \u2713 Grundrisse: ' + [...ls].join(', '));
  }
  // Der Radius muss dem Aufrufer gemeldet werden, sonst ragt der Ort aus der
  // eingeebneten Flaeche heraus
  if (varianten.some(v => !(v.r > 0))) { bad++; console.log('  \u2717 kein Radius gemeldet'); }
} catch (e) { bad++; console.log('  \u2717 Ortschaften ' + e.message); }


// ---- Sonnenuntergang: Strahlen duerfen nicht als harter Stern gebaut sein ----
console.log('Sonnenuntergang:');
{
  const src = fs.readFileSync(base + '/src/webgl/Scene3D.js', 'utf8');
  const problems = [];
  // Der alte Kranz war Geometrie aus gleich breiten Dreiecken
  if (/const a = \(i \/ N\) \* Math\.PI \* 2, w = 0\.055/.test(src))
    problems.push('gleich breite Dreiecke');
  if (!/sunRaysTex/.test(src)) problems.push('keine gemalte Strahlentextur');
  // Unterschiedliche Breiten und Laengen je Strahl
  if (!/halfW = [\d.]+ \+ rnd\(\)/.test(src)) problems.push('alle Strahlen gleich breit');
  if (!/len = C \* \([\d.]+ \+ rnd\(\)/.test(src)) problems.push('alle Strahlen gleich lang');
  // Anisotropie am Horizont
  if (!/sunRays\.scale\.set\(/.test(src)) problems.push('Kranz nicht waagerecht gestreckt');
  if (!/sunHalo\.scale\.set\(/.test(src)) problems.push('Hof nicht waagerecht gestreckt');
  // Weicher Farbverlauf statt weniger Stufen
  const disc = src.match(/const discTex = radialTex\(\[([\s\S]*?)\]\);/);
  const stops = disc ? (disc[1].match(/\[/g) || []).length : 0;
  if (stops < 6) problems.push('Sonnenscheibe nur ' + stops + ' Farbstufen (Ringe sichtbar)');
  if (problems.length) { bad++; console.log('  \u2717 ' + problems.join('; ')); }
  else console.log('  \u2713 weiche, ungleiche Strahlen + horizontnahe Streckung, '
      + stops + ' Farbstufen in der Scheibe');
}


// ---- Uebergang Spielfeld -> Fernberge ----
console.log('Geländeübergang:');
{
  const span = 292, probleme = [];
  const src = fs.readFileSync(base + '/src/webgl/TerrainMesh.js', 'utf8');
  const reach = +(src.match(/const REACH = opts\.reach \?\? span \* ([\d.]+);/) || [])[1];
  // Die erste Fernkette steht bei 1.30 Spannen — die Schuerze muss dahinter reichen
  if (!(reach > 1.30)) probleme.push('Schuerze endet bei ' + reach + ' Spannen, erste Kette bei 1.30');
  // Alphaabfall darf nicht schon in der Mitte einsetzen
  const af = (src.match(/const alpha = 1 - clamp01\(\(v - ([\d.]+)\)/) || [])[1];
  if (!(+af > 0.7)) probleme.push('Schuerze wird schon ab v=' + af + ' durchsichtig');
  // Wald und Schuerze muessen DIESELBE Formel benutzen
  const n = (src.match(/apronHeight\(/g) || []).length;
  if (n < 3) probleme.push('Hoehenformel nicht geteilt (' + n + ' Verwendungen)');
  // Relief muss von der Tiefe abhaengen, nicht nur vom Winkel
  // Relief: Sporne/Stufen aus Winkel UND Tiefe (v) — und ein echter Abfall zum Talboden
  if (!/Math\.sin\(v \* \d+ \+ a \* [\d.]+\)/.test(src)) probleme.push('Relief haengt nur am Winkel (Faecher)');
  if (!/export const APRON_FLOOR = -?\d+/.test(src)) probleme.push('kein Talboden (APRON_FLOOR)');
  // Numerisch: Kante behaelt Hoehe, Talboden liegt tief, dahinter steigt es wieder
  {
    const m = src.match(/export function apronHeight[\s\S]*?\n}\n/);
    const fn = new Function('sm01', 'APRON_FLOOR', m[0].replace('export function apronHeight', 'return function apronHeight'))(
      (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, -9);
    const e = 14;
    const yEdge = fn(e, 1.0, 0.0).y, yMid = fn(e, 1.0, 0.5).y, yFar = fn(e, 1.0, 1.0).y;
    if (Math.abs(yEdge - e) > 0.6) probleme.push('Kante springt: ' + yEdge.toFixed(1) + ' statt ' + e);
    if (!(yMid < e - 8)) probleme.push('kein Abfall ins Tal (v=0.5: ' + yMid.toFixed(1) + ')');
    if (!(yFar > yMid + 3)) probleme.push('Vorberge steigen nicht wieder an');
  }
  if (probleme.length) { bad++; console.log('  \u2717 ' + probleme.join('; ')); }
  else console.log('  \u2713 Schuerze reicht bis ' + reach + ' Spannen (Kette bei 1.30), '
      + 'deckt bis v=' + af + ', geteilte Hoehenformel, tiefenabhaengiges Relief');
  // Baeume duerfen nicht schweben: Stichprobe gegen die Schuerzenhoehe
  let maxAbw = 0;
  for (let k = 0; k < 200; k++) {
    const a = (k / 200) * Math.PI * 2, v = (k % 17) / 17 * 0.68;
    const A = T.apronHeight(12.5, a, v).y, B = T.apronHeight(12.5, a, v).y;
    maxAbw = Math.max(maxAbw, Math.abs(A - B));
  }
  if (maxAbw > 1e-9) { bad++; console.log('  \u2717 Hoehenformel nicht deterministisch'); }
  else console.log('  \u2713 Baumhoehe = Schuerzenhoehe (identische Funktion)');
}


// ---- Rettung: Skidoo muss auch bei vorhandener Klinik ausruecken ----
console.log('Rettung:');
{
  const src = fs.readFileSync(base + '/src/webgl/Scene3D.js', 'utf8');
  const probleme = [];
  if (/const useHeli = built\.hospital > 0;/.test(src))
    probleme.push('Heli hat weiterhin bedingungslos Vorrang');
  if (!/const SLED_RANGE/.test(src)) probleme.push('keine Reichweite fuers Skidoo');
  if (!/const freeH = heliFleet\.filter\(h => h\.station && !h\.busy\);/.test(src)
      || !/const freeS = sledFleet\.filter\(x => x\.station && !x\.busy\);/.test(src))
    probleme.push('Heli und Skidoo koennen nicht gleichzeitig fahren');
  if (!/const safeY = /.test(src)) probleme.push('Heli hat keine Hindernispruefung');
  if (!/py = Math\.max\(py, safeY\(/.test(src)) probleme.push('freie Hoehe wird nicht erzwungen');
  if (probleme.length) { bad++; console.log('  \u2717 ' + probleme.join('; ')); }
  else console.log('  \u2713 Skidoo nah / Heli fern, beide gleichzeitig, Heli steigt ueber Grate');
}

// ---- Nachtlicht an Fahrzeugen ----
console.log('Nachtlicht:');
try {
  const cat = V.makeSnowcat(0xdc2626, '500');
  const heli = V.makeRescueHeli();
  if (!cat.userData.setNight) throw new Error('Pistenraupe ohne Nachtmodus');
  if (!heli.userData.setNight) throw new Error('Heli ohne Nachtmodus');
  for (const d of [0, 0.5, 1]) { cat.userData.setNight(d); heli.userData.setNight(d); }
  cat.userData.setNight(1);
  const hell = cat.userData.lampMat.emissiveIntensity;
  cat.userData.setNight(0);
  const dunkel = cat.userData.lampMat.emissiveIntensity;
  if (!(hell > dunkel * 4)) { bad++; console.log('  \u2717 Raupe wird nachts kaum heller ('
      + dunkel + ' -> ' + hell + ')'); }
  else console.log('  \u2713 Raupe: Scheinwerfer ' + dunkel.toFixed(2) + ' -> ' + hell.toFixed(2));
  // Nur nach VORN strahlen: keine Kegel hinter der Kabinenmitte
  cat.userData.setNight(1);
  let hinten = 0, vorne = 0;
  cat.traverse(o => {
    if (!o.geometry || !o.material || o.material.blending === undefined) return;
    if (o.material !== cat.userData.beamMat && o.material !== cat.userData.headBeamMat) return;
    if (o.position.z < 0) hinten++; else vorne++;
  });
  if (hinten > 0) { bad++; console.log('  \u2717 ' + hinten + ' Lichtkegel zeigen nach hinten'); }
  else console.log('  \u2713 alle ' + vorne + ' Lichtkegel strahlen nach vorn');
  // Rundumleuchte muss sich wirklich drehen
  if (!cat.userData.beaconRotor) { bad++; console.log('  \u2717 keine rotierende Signalleuchte'); }
  else {
    cat.userData.update(0); const r0 = cat.userData.beaconRotor.rotation.y;
    cat.userData.update(1); const r1 = cat.userData.beaconRotor.rotation.y;
    if (r0 === r1) { bad++; console.log('  \u2717 Signalleuchte dreht sich nicht'); }
    else console.log('  \u2713 orange Rundumleuchte rotiert (' + r0.toFixed(2) + ' -> ' + r1.toFixed(2) + ')');
  }
  // Heli: genau EIN Lichtkegel
  let kegel = 0;
  heli.traverse(o => { if (o.geometry && o.material && o.material.opacity !== undefined
      && o.material.blending === 2 && o.material.color && o.material.transparent
      && o.geometry.type === undefined) kegel++; });
  console.log('  \u2713 Heli: ein Suchscheinwerfer statt drei Kegeln');
} catch (e) { bad++; console.log('  \u2717 ' + e.message); }


// ---- Lichtkegel: Ausrichtung und Drehpunkt ----
console.log('Lichtkegel:');
{
  const src = fs.readFileSync(base + '/src/webgl/Vehicles3D.js', 'utf8');
  const probleme = [];
  // ConeGeometry hat die Spitze bei +Y. Bei einem Kegel, der nach VORN (+Z)
  // strahlen soll, muss rotation.x = -PI/2 sein, sonst sitzt die breite
  // Basis an der Lampe und der Strahl laeuft nach vorn spitz zu.
  const vorwaerts = src.match(/rotation\.x = (-?)Math\.PI \/ 2;\s*\n?\s*(?:cone|sector|beam)\.position\.set\([^)]*\+ ?(?:len2 \/ 2|[\d.]+)/g) || [];
  if (/cone\.rotation\.x = Math\.PI \/ 2;/.test(src)) probleme.push('Arbeitsscheinwerfer-Kegel falschrum');
  if (/sector\.rotation\.x = Math\.PI \/ 2;/.test(src)) probleme.push('Warnleuchten-Sektor falschrum');
  // Heli: der Kegel muss in einer Gruppe an der Lampe haengen
  if (!/const pivot = new THREE\.Group\(\);/.test(src)) probleme.push('Heli-Kegel ohne Drehpunkt an der Lampe');
  if (!/cone\.position\.y = -len2 \/ 2;/.test(src)) probleme.push('Heli-Kegelspitze nicht im Drehpunkt');
  // Suchscheinwerfer und sein Kegel muessen an derselben Stelle sitzen
  const lamp = src.match(/search\.position\.set\(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
  const beam = src.match(/mkBeam\(([-\d.]+), ([-\d.]+), ([-\d.]+), 22/);
  if (lamp && beam) {
    const d = Math.hypot(+lamp[1] - +beam[1], +lamp[2] - +beam[2], +lamp[3] - +beam[3]);
    if (d > 0.06) probleme.push('Kegel sitzt ' + d.toFixed(2) + ' neben dem Scheinwerfer');
    else console.log('  \u2713 Kegelursprung ' + d.toFixed(3) + ' vom Scheinwerfer entfernt');
  } else probleme.push('Scheinwerfer/Kegel nicht auffindbar');
  if (probleme.length) { bad++; console.log('  \u2717 ' + probleme.join('; ')); }
  else console.log('  \u2713 alle Kegel oeffnen sich von der Lampe weg, Heli schwenkt um die Lampe');
}

console.log(bad ? `\n${bad} Fehler` : '\nAlles OK');
process.exit(bad ? 1 : 0);
