// Headless-Smoke-Run der KOMPLETTEN Szene (Stubs statt WebGL). Liefert die API
// plus __dbg() für Sim-Tests, z. B. tools/sim/sledtest.mjs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = '/tmp/skisim'; fs.mkdirSync(OUT, { recursive: true });
await import(`${base}/tools/stub/dom.js`);
for (const f of fs.readdirSync(`${base}/src/webgl`)) {
  if (!f.endsWith('.js')) continue;
  let s = fs.readFileSync(`${base}/src/webgl/${f}`, 'utf8');
  s = s.replace(/import \* as THREE from 'three';/, `import THREE from '${base}/tools/sim/three-permissive.js';`);
  s = s.replace(/from '\.\.\/(engine|constants)\//g, `from '${base}/src/$1/`);
  s = s.replace(/import \{ (\w+) \} from 'three\/examples\/jsm\/[^']+';/g, (m, n) => `const ${n} = function(){ const o = { passes: [], addPass(){}, render(){}, setSize(){}, uniforms: { uTime:{value:0}, uVignette:{value:0}, uContrast:{value:0}, uSat:{value:0} } }; return o; };`);
  fs.writeFileSync(`${OUT}/${f}`, s);
}
global.window = global.window || { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, addEventListener(){}, removeEventListener(){} };
global.requestAnimationFrame = (fn) => { global.__raf = fn; return 1; };
global.cancelAnimationFrame = () => {};
global.performance = global.performance || { now: () => Date.now() };
const { createScene3D } = await import(`${OUT}/Scene3D.js`);
const { generateWorldData, upsampleWorld } = await import(`${base}/src/engine/utils.js`);
const { CAMPAIGN_LEVELS, MASSIFS } = await import(`${base}/src/constants/campaign.js`);
const level = CAMPAIGN_LEVELS[+(process.env.LEVEL || 0)]; const BASE = level.gridSize || 192; const GS = Math.round(BASE * 1.75);
const t0 = Date.now();
const world = upsampleWorld(generateWorldData(BASE, { ...(level.terrain||{}), theme: level.theme, massif: MASSIFS[level.id] }), BASE, 1.75, { seed: level.terrain?.seed || 7 });
console.log('Welt', GS + 'x' + GS, 'in', Date.now() - t0, 'ms');
const canvas = { addEventListener(){}, removeEventListener(){}, getContext(){ return null; }, width: 1200, height: 800, clientWidth: 1200, clientHeight: 800, getBoundingClientRect(){ return {left:0,top:0,width:1200,height:800}; }, style: {} };
let api;
try { api = createScene3D(canvas, world, GS, level.theme || {}, level); }
catch (e) { console.log('createScene3D FEHLER:', e.stack.split('\n').slice(0,6).join('\n')); process.exit(1); }
console.log('Szene gebaut, API:', Object.keys(api).slice(0,12).join(' '));
export { api, world, GS };
