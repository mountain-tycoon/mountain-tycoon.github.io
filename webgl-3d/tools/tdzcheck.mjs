// TDZ-Prüfer: findet let/const, die im selben Funktionskörper VOR ihrer
// Deklaration benutzt werden ("Cannot access X before initialization").
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const jsx = (() => { try { return require('acorn-jsx'); } catch { return null; } })();
const file = process.argv[2];
const P = jsx && /\.jsx$/.test(file) ? acorn.Parser.extend(jsx()) : acorn.Parser;
const ast = P.parse(fs.readFileSync(file,'utf8'), { ecmaVersion:2022, sourceType:'module', locations:true });
const out = [];
const isFn = t => /Function(Declaration|Expression)|ArrowFunctionExpression/.test(t);
function scan(body) {
  const decls = new Map(), uses = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (isFn(n.type)) { scan(n.body); return; }
    if (n.type === 'VariableDeclaration' && n.kind !== 'var') {
      for (const d of n.declarations) {
        if (d.id.type === 'Identifier' && !decls.has(d.id.name)) decls.set(d.id.name, d.id.loc.start.line);
        if (d.init) walk(d.init);
      }
      return;
    }
    if (n.type === 'MemberExpression') { walk(n.object); if (n.computed) walk(n.property); return; }
    if (n.type === 'Property' && !n.computed) { walk(n.value); return; }
    if (n.type === 'Identifier') { uses.push({ name: n.name, line: n.loc.start.line }); return; }
    for (const k in n) {
      if (['type','loc','start','end'].includes(k)) continue;
      for (const ch of (Array.isArray(n[k]) ? n[k] : [n[k]])) if (ch && typeof ch.type === 'string') walk(ch);
    }
  })(body);
  for (const u of uses) { const d = decls.get(u.name); if (d != null && u.line < d) out.push({ ...u, decl: d }); }
}
scan(ast);
if (!out.length) console.log('✓ Keine TDZ-Verstöße');
else { console.log('⚠ TDZ — Zugriff vor Deklaration:'); for (const f of out) console.log(`   ${f.name}: benutzt Zeile ${f.line}, deklariert Zeile ${f.decl}`); }
