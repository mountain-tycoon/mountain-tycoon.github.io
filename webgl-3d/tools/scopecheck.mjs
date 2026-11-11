// Statischer Scope-Prüfer: findet Bezeichner, die verwendet, aber in keinem
// umgebenden Scope deklariert sind ("X is not defined").
// Aufruf: node tools/scopecheck.mjs <datei.js>
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const jsx = (() => { try { return require('acorn-jsx'); } catch { return null; } })();
const file = process.argv[2];
const P = jsx && /\.jsx$/.test(file) ? acorn.Parser.extend(jsx()) : acorn.Parser;
const ast = P.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2022, sourceType: 'module', locations: true });

const GLOBALS = new Set(['window','document','console','Math','JSON','Date','Object','Array','String','Number','Boolean','Promise','Set','Map','WeakMap','Symbol','Error','RegExp','Float32Array','Uint8Array','Uint16Array','Uint32Array','Int32Array','ArrayBuffer','parseInt','parseFloat','isNaN','isFinite','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','setInterval','clearInterval','performance','navigator','localStorage','fetch','undefined','NaN','Infinity','globalThis','structuredClone','Intl','arguments','this','React','process','Image','URL','Blob','CustomEvent','Event','devicePixelRatio','innerWidth','innerHeight','alert','crypto','TextEncoder','AbortController']);
const scopes = [{ vars: new Set(GLOBALS) }];
const uses = [];
const declare = (n) => { if (n) scopes[scopes.length-1].vars.add(n); };
const declareAt = (n, d) => { if (n) scopes[d].vars.add(n); };
function names(p, out=[]) {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(x => names(x.value || x.argument, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => names(e, out));
  else if (p.type === 'AssignmentPattern') names(p.left, out);
  else if (p.type === 'RestElement') names(p.argument, out);
  return out;
}
function hoist(node, depth) {
  for (const k in node) {
    if (['type','loc','start','end'].includes(k)) continue;
    for (const ch of (Array.isArray(node[k]) ? node[k] : [node[k]])) {
      if (!ch || typeof ch.type !== 'string') continue;
      if (ch.type === 'FunctionDeclaration') { declareAt(ch.id?.name, depth); continue; }
      if (/Function|ArrowFunction|ClassDeclaration/.test(ch.type)) continue;
      hoist(ch, depth);
    }
  }
}
function lex(s) {
  if (!s) return;
  if (s.type === 'VariableDeclaration') s.declarations.forEach(d => names(d.id).forEach(declare));
  if (s.type === 'ClassDeclaration' || s.type === 'FunctionDeclaration') declare(s.id?.name);
  if (s.type === 'ImportDeclaration') s.specifiers.forEach(sp => declare(sp.local?.name));
}
function visit(node) {
  if (!node || typeof node.type !== 'string') return;
  const t = node.type;
  if (/Function(Declaration|Expression)|ArrowFunctionExpression/.test(t)) {
    if (t === 'FunctionDeclaration') declare(node.id?.name);
    scopes.push({ vars: new Set() });
    if (t === 'FunctionExpression' && node.id) declare(node.id.name);
    node.params.forEach(p => names(p).forEach(declare));
    if (node.body.type === 'BlockStatement') {
      hoist(node.body, scopes.length-1);
      node.body.body.forEach(lex); node.body.body.forEach(visit);
    } else visit(node.body);
    scopes.pop(); return;
  }
  if (['BlockStatement','ForStatement','ForOfStatement','ForInStatement','Program'].includes(t)) {
    scopes.push({ vars: new Set() });
    if (t === 'Program') hoist(node, scopes.length-1);
    if (t === 'ForStatement') visit(node.init);
    if (t === 'ForOfStatement' || t === 'ForInStatement') { visit(node.left); visit(node.right); }
    const body = Array.isArray(node.body) ? node.body : [node.body];
    body.forEach(lex); body.forEach(visit);
    if (t === 'ForStatement') { visit(node.test); visit(node.update); }
    scopes.pop(); return;
  }
  if (t === 'VariableDeclaration') { node.declarations.forEach(d => { visit(d.init); names(d.id).forEach(declare); }); return; }
  if (t === 'CatchClause') {           // catch (e) — Parameter gilt im Block
    scopes.push({ vars: new Set() });
    if (node.param) names(node.param).forEach(declare);
    visit(node.body);
    scopes.pop(); return;
  }
  if (t === 'ClassDeclaration') declare(node.id?.name);
  if (t === 'MemberExpression') { visit(node.object); if (node.computed) visit(node.property); return; }
  if (t === 'Property' && !node.computed) { visit(node.value); return; }
  if (t === 'JSXAttribute') { visit(node.value); return; }
  // import { A as B } — 'A' ist der EXPORTNAME der anderen Datei, keine
  // lokale Verwendung. Nur der lokale Name zählt (der ist bereits deklariert).
  if (t === 'ImportSpecifier' || t === 'ExportSpecifier') return;
  if (t === 'JSXIdentifier') return;
  if (t === 'Identifier') {
    if (!scopes.some(s => s.vars.has(node.name))) uses.push({ name: node.name, line: node.loc.start.line });
    return;
  }
  for (const k in node) {
    if (['type','loc','start','end'].includes(k)) continue;
    for (const ch of (Array.isArray(node[k]) ? node[k] : [node[k]])) if (ch && typeof ch.type === 'string') visit(ch);
  }
}
ast.body.forEach(lex); hoist(ast, 0);
scopes.push({ vars: new Set() }); ast.body.forEach(lex); ast.body.forEach(visit);
const seen = new Map();
for (const u of uses) if (!seen.has(u.name)) seen.set(u.name, u.line);
if (!seen.size) console.log('✓ Keine undefinierten Bezeichner');
else { console.log('⚠ Möglicherweise undefiniert:'); for (const [n,l] of seen) console.log(`   ${n}  (Zeile ${l})`); }
