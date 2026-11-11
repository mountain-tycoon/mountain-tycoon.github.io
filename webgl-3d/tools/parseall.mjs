import fs from 'fs'; import path from 'path';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const acorn = require('acorn'); const jsx = require('acorn-jsx');
const P = acorn.Parser.extend(jsx());
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f)) { try { P.parse(fs.readFileSync(p, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { console.log('✗', p.replace(process.cwd() + '/', ''), e.message); } } } };
walk('src'); console.log('Parse-Durchlauf fertig');
