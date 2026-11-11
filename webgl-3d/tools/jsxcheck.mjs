// ECHTER JSX-Parser statt Klammerzählerei: acorn + acorn-jsx.
// Ein selbstgebauter Zähler stolperte über Apostrophe in deutschem
// JSX-Text und über Template-Interpolationen — der richtige Parser
// findet dagegen exakt die Stelle eines Syntaxfehlers.
import fs from 'node:fs';
import * as acorn from 'acorn';
import jsx from 'acorn-jsx';

const Parser = acorn.Parser.extend(jsx());
let bad = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  try {
    Parser.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    console.log('  ✓', file);
  } catch (e) {
    bad++;
    console.log('  ✗', file + ':' + (e.loc ? e.loc.line + ':' + e.loc.column : '?'), e.message);
  }
}
console.log(bad ? `\n${bad} Datei(en) mit Syntaxfehler` : '\n✓ JSX ok');
if (bad) process.exitCode = 1;
