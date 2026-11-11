// AUFRUF-REIHENFOLGEN-PRÜFER
//
// Schließt die Lücke des reinen TDZ-Prüfers: Eine Funktion darf ein `const`
// aus dem umgebenden Scope benutzen, das WEITER UNTEN steht — aber nur, wenn
// sie erst später läuft. Wird sie dagegen SOFORT aufgerufen (z. B. animate()
// direkt nach der Definition), greift sie auf eine noch nicht initialisierte
// Bindung zu: "Cannot access X before initialization".
//
// Aufruf: node tools/callorder.mjs <datei.js>
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const jsx = (() => { try { return require('acorn-jsx'); } catch { return null; } })();
const file = process.argv[2];
const P = jsx && /\.jsx$/.test(file) ? acorn.Parser.extend(jsx()) : acorn.Parser;
const ast = P.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2022, sourceType: 'module', locations: true });

const findings = [];
const isFn = t => /Function(Declaration|Expression)|ArrowFunctionExpression/.test(t);

function analyseScope(bodyNode) {
  // 1) lexikalische Deklarationen dieses Scopes mit Zeile
  const decls = new Map();
  // 2) hier definierte Funktionen: Name -> {node, refs:Set}
  const fns = new Map();
  // 3) Aufrufe im direkten Scope: Name -> erste Aufrufzeile
  const calls = new Map();

  const stmts = Array.isArray(bodyNode.body) ? bodyNode.body : [bodyNode.body];
  (function walk(n, top) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        if (d.id.type === 'Identifier') {
          if (n.kind !== 'var' && !decls.has(d.id.name)) decls.set(d.id.name, d.id.loc.start.line);
          if (d.init && isFn(d.init.type)) fns.set(d.id.name, d.init);
        }
        if (d.init && !isFn(d.init.type)) walk(d.init, top);
      }
      return;
    }
    if (n.type === 'FunctionDeclaration') { if (n.id) fns.set(n.id.name, n); return; }
    if (isFn(n.type)) { analyseScope(n.body); return; }   // eigener Scope
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      if (!calls.has(n.callee.name)) calls.set(n.callee.name, n.loc.start.line);
    }
    if (n.type === 'MemberExpression') { walk(n.object, top); if (n.computed) walk(n.property, top); return; }
    for (const k in n) {
      if (['type','loc','start','end'].includes(k)) continue;
      for (const ch of (Array.isArray(n[k]) ? n[k] : [n[k]])) if (ch && typeof ch.type === 'string') walk(ch, top);
    }
  })(bodyNode, true);

  // FREIE Variablen einer Funktion: alle benutzten Namen MINUS alles, was sie
  // (oder eine ihrer inneren Funktionen) selbst deklariert. Ohne diesen Abzug
  // meldet der Prüfer massenhaft Schleifenvariablen als Fehler.
  const refsOf = (node) => {
    const used = new Set(), own = new Set();
    const addPat = (pt) => {
      if (!pt) return;
      if (pt.type === 'Identifier') own.add(pt.name);
      else if (pt.type === 'ObjectPattern') pt.properties.forEach(x => addPat(x.value || x.argument));
      else if (pt.type === 'ArrayPattern') pt.elements.forEach(addPat);
      else if (pt.type === 'AssignmentPattern') addPat(pt.left);
      else if (pt.type === 'RestElement') addPat(pt.argument);
    };
    (node.params || []).forEach(addPat);
    (function w(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'VariableDeclaration') { n.declarations.forEach(d => { addPat(d.id); w(d.init); }); return; }
      if (n.type === 'FunctionDeclaration' && n.id) own.add(n.id.name);
      if (isFn(n.type) && n !== node) { (n.params || []).forEach(addPat); }
      if (n.type === 'CatchClause') { addPat(n.param); w(n.body); return; }
      if (n.type === 'MemberExpression') { w(n.object); if (n.computed) w(n.property); return; }
      if (n.type === 'Property' && !n.computed) { w(n.value); return; }
      if (n.type === 'Identifier') { used.add(n.name); return; }
      for (const k in n) {
        if (['type','loc','start','end'].includes(k)) continue;
        for (const ch of (Array.isArray(n[k]) ? n[k] : [n[k]])) if (ch && typeof ch.type === 'string') w(ch);
      }
    })(node);
    for (const o of own) used.delete(o);
    return used;
  };

  for (const [name, fnNode] of fns) {
    const callLine = calls.get(name);
    if (callLine == null) continue;                 // wird hier nicht aufgerufen
    for (const ref of refsOf(fnNode)) {
      const declLine = decls.get(ref);
      if (declLine != null && callLine < declLine) {
        findings.push({ fn: name, call: callLine, ref, decl: declLine });
      }
    }
  }
  for (const fnNode of fns.values()) analyseScope(fnNode.body);
}
analyseScope(ast);

const seen = new Set();
const uniq = findings.filter(f => { const k = f.fn+'|'+f.ref; if (seen.has(k)) return false; seen.add(k); return true; });
if (!uniq.length) console.log('✓ Keine verfrühten Aufrufe');
else {
  console.log('⚠ Funktion wird aufgerufen, BEVOR eine benutzte Bindung existiert:');
  for (const f of uniq) console.log(`   ${f.fn}() @Zeile ${f.call} benutzt "${f.ref}", deklariert erst Zeile ${f.decl}`);
}
