// Spielt alle Abläufe des Anmeldeservers gegen eine laufende Instanz durch.
//
//   Terminal 1:  cd webgl-3d/worker && npx wrangler dev --port 8787
//   Terminal 2:  node webgl-3d/tools/authtest.mjs            (oder: … authtest.mjs http://localhost:8787)
//
// Die Admin-Zugangsdaten kommen aus worker/.dev.vars (lokale Testwerte, nicht eingecheckt).
// Jeder Lauf benutzt frische Test-Adressen und räumt am Ende wieder auf.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const EP = (process.argv[2] || process.env.AUTH_ENDPOINT || 'http://localhost:8787').replace(/\/+$/, '');
const ORIGIN = process.env.TEST_ORIGIN || 'http://localhost:5180';

const vars = {};
try {
    for (const line of fs.readFileSync(path.join(here, '..', 'worker', '.dev.vars'), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m) vars[m[1]] = m[2];
    }
} catch { /* dann eben über die Umgebung */ }
const ADMIN = (process.env.ADMIN_EMAILS || vars.ADMIN_EMAILS || '').split(',')[0].trim();
const ADMIN_PW = process.env.ADMIN_PASSWORD || vars.ADMIN_PASSWORD || '';
if (!ADMIN || !ADMIN_PW) { console.error('ADMIN_EMAILS / ADMIN_PASSWORD fehlen (worker/.dev.vars)'); process.exit(2); }

let failed = 0, passed = 0;
function check(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FEHLER ${name}${detail ? ' → ' + detail : ''}`); }
}
async function call(method, p, { body, token, origin = ORIGIN } = {}) {
    const headers = { origin };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers['x-token'] = token;
    const res = await fetch(EP + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { /* leer */ }
    return { status: res.status, data, headers: res.headers };
}

const run = Date.now().toString(36);
const anna = { first: 'Anna', last: 'Test', email: `anna-${run}@example.test`, password: `pw-anna-${run}-A` };
const ben = { first: 'Ben', last: 'Probe', email: `ben-${run}@example.test`, password: `pw-ben-${run}-B` };

console.log(`Anmeldeserver: ${EP}\n`);

console.log('Grundlagen');
let r = await call('GET', '/version');
check('/version meldet Stand und App', r.status === 200 && r.data.v >= 1 && r.data.app === 'mountain-tycoon', JSON.stringify(r.data));
r = await call('OPTIONS', '/auth');
check('Preflight erlaubt die Spielseite', r.status === 204 && r.headers.get('access-control-allow-origin') === ORIGIN, r.headers.get('access-control-allow-origin'));
r = await call('GET', '/version', { origin: 'https://fremde-seite.example' });
check('fremde Seiten bekommen keine Freigabe', r.headers.get('access-control-allow-origin') !== 'https://fremde-seite.example');
r = await call('GET', '/gibtsnicht');
check('unbekannter Pfad → 404', r.status === 404);

console.log('\nRegistrierung');
r = await call('POST', '/register', { body: { ...anna, first: '' } });
check('ohne Vorname abgelehnt', r.status === 400);
r = await call('POST', '/register', { body: { ...anna, email: 'keine-adresse' } });
check('ungültige E-Mail abgelehnt', r.status === 400);
r = await call('POST', '/register', { body: { ...anna, password: 'kurz' } });
check('zu kurzes Passwort abgelehnt', r.status === 400);
r = await call('POST', '/register', { body: anna });
check('Registrierung wartet auf Freischaltung', r.status === 200 && r.data.status === 'pending' && !!r.data.ticket && !r.data.token, JSON.stringify(r.data));
const ticket = r.data.ticket;
r = await call('GET', '/regstatus?ticket=' + encodeURIComponent(ticket));
check('Ticket meldet „pending"', r.data.status === 'pending');
r = await call('GET', '/regstatus?ticket=erfunden');
check('erfundenes Ticket verrät nichts', r.data.status === 'unknown');
r = await call('POST', '/register', { body: { ...anna, password: 'ein-ganz-anderes-passwort' } });
check('zweite Registrierung mit fremdem Passwort abgelehnt', r.status === 409);
r = await call('POST', '/register', { body: anna });
check('gleiche Registrierung erneut → neues Ticket', r.status === 200 && r.data.status === 'pending' && !!r.data.ticket);

console.log('\nAnmeldung vor der Freischaltung');
r = await call('POST', '/auth', { body: { email: anna.email, password: anna.password } });
check('richtiges Passwort, aber noch nicht freigeschaltet → 403 pending', r.status === 403 && r.data.status === 'pending');
r = await call('POST', '/auth', { body: { email: anna.email, password: 'falsch-falsch' } });
check('falsches Passwort → 403 ohne Hinweis aufs Konto', r.status === 403 && !r.data.status);
r = await call('POST', '/auth', { body: { email: `niemand-${run}@example.test`, password: 'irgendwas-123' } });
check('unbekanntes Konto → gleiche Meldung', r.status === 403 && !r.data.status);

console.log('\nAdmin');
r = await call('POST', '/auth', { body: { email: ADMIN, password: 'nicht-das-admin-passwort' } });
check('Admin mit falschem Passwort abgelehnt', r.status === 403);
r = await call('POST', '/auth', { body: { email: ADMIN.toUpperCase(), password: ADMIN_PW } });
check('Admin-Anmeldung (Groß-/Kleinschreibung egal)', r.status === 200 && r.data.role === 'admin' && !!r.data.token, JSON.stringify({ ...r.data, token: r.data.token ? '…' : '' }));
const adminToken = r.data.token;
r = await call('GET', '/admin/accounts');
check('Verwaltung ohne Anmeldung → 401', r.status === 401);
r = await call('GET', '/admin/accounts', { token: adminToken });
const listed = (r.data.accounts || []).find((a) => a.email === anna.email);
check('Verwaltung zeigt die wartende Registrierung', r.status === 200 && listed && listed.status === 'pending', JSON.stringify(listed));
check('Verwaltung gibt keine Passwort-Hashes heraus', !JSON.stringify(r.data).includes('hash') && !JSON.stringify(r.data).includes('salt'));
check('wartende Konten stehen oben', (r.data.accounts || [])[0]?.status === 'pending');
r = await call('PUT', '/admin/accounts', { token: adminToken, body: { email: anna.email, status: 'quatsch' } });
check('unbekannter Status abgelehnt', r.status === 400);
r = await call('PUT', '/admin/accounts', { token: adminToken, body: { email: anna.email, status: 'approved' } });
check('Freischalten', r.status === 200 && (r.data.accounts || []).find((a) => a.email === anna.email)?.status === 'approved');
r = await call('GET', '/regstatus?ticket=' + encodeURIComponent(ticket));
check('Ticket meldet jetzt „approved"', r.data.status === 'approved');

console.log('\nSpieler');
r = await call('POST', '/register', { body: anna });
check('freigeschaltete Adresse kann sich nicht noch einmal registrieren', r.status === 409);
r = await call('POST', '/auth', { body: { email: anna.email, password: anna.password, build: '20261111180000' } });
check('Anmeldung nach der Freischaltung', r.status === 200 && r.data.role === 'user' && r.data.name === 'Anna Test' && !r.data.mustChange, JSON.stringify({ ...r.data, token: '…' }));
let userToken = r.data.token;
r = await call('GET', '/me', { token: userToken });
check('/me kennt den Spieler', r.status === 200 && r.data.name === 'Anna Test' && r.data.role === 'user');
r = await call('GET', '/me', { token: 'erfundenes-token' });
check('/me mit erfundenem Token → 401', r.status === 401);
r = await call('GET', '/admin/accounts', { token: userToken });
check('Spieler kommt nicht in die Verwaltung → 403', r.status === 403);
r = await call('POST', '/admin/reset', { token: userToken, body: { email: anna.email } });
check('Spieler kann keine Passwörter zurücksetzen → 403', r.status === 403);

console.log('\nFortschritt');
r = await call('GET', '/progress', { token: userToken });
check('anfangs leer', r.status === 200 && Array.isArray(r.data.completed) && r.data.completed.length === 0);
r = await call('PUT', '/progress', { token: userToken, body: { completed: ['mittelgebirge', 'alpen'] } });
check('zwei Level gespeichert', r.data.completed?.length === 2);
r = await call('PUT', '/progress', { token: userToken, body: { completed: ['alpen', 'japan'] } });
check('zweites Gerät: Stände werden vereinigt', r.data.completed?.length === 3 && ['mittelgebirge', 'alpen', 'japan'].every((x) => r.data.completed.includes(x)), JSON.stringify(r.data.completed));
r = await call('PUT', '/progress', { token: userToken, body: { completed: [] } });
check('leerer Stand löscht nichts', r.data.completed?.length === 3);
r = await call('GET', '/progress');
check('Fortschritt ohne Anmeldung → 401', r.status === 401);
r = await call('GET', '/admin/accounts', { token: adminToken });
check('Verwaltung zeigt die Zahl der geschafften Level', (r.data.accounts || []).find((a) => a.email === anna.email)?.levels === 3);

console.log('\nPasswort');
r = await call('POST', '/password', { token: userToken, body: { old: 'falsches-altes', password: 'neues-passwort-1' } });
check('Ändern mit falschem alten Passwort abgelehnt', r.status === 403);
r = await call('POST', '/password', { token: userToken, body: { old: anna.password, password: 'kurz' } });
check('zu kurzes neues Passwort abgelehnt', r.status === 400);
const annaPw2 = `pw2-anna-${run}-C`;
r = await call('POST', '/password', { token: userToken, body: { old: anna.password, password: annaPw2 } });
check('Passwort geändert', r.status === 200 && r.data.ok);
r = await call('POST', '/auth', { body: { email: anna.email, password: anna.password } });
check('altes Passwort gilt nicht mehr', r.status === 403);
r = await call('POST', '/auth', { body: { email: anna.email, password: annaPw2 } });
check('neues Passwort gilt', r.status === 200);

console.log('\nPasswort vergessen (Einmalcode)');
r = await call('POST', '/admin/reset', { token: adminToken, body: { email: anna.email } });
check('Admin erzeugt Einmalcode', r.status === 200 && /^[A-Z2-9]{8}$/.test(r.data.code || ''), r.data.code ? 'Format' : JSON.stringify(r.data));
const code = r.data.code;
r = await call('POST', '/auth', { body: { email: anna.email, password: annaPw2 } });
check('bisheriges Passwort gilt nach dem Reset nicht mehr', r.status === 403);
r = await call('POST', '/auth', { body: { email: anna.email, password: code } });
check('Anmeldung mit Einmalcode verlangt neues Passwort', r.status === 200 && r.data.mustChange === true);
const codeToken = r.data.token;
const annaPw3 = `pw3-anna-${run}-D`;
r = await call('POST', '/password', { token: codeToken, body: { password: annaPw3 } });
check('eigenes Passwort ohne altes festlegen', r.status === 200);
r = await call('GET', '/me', { token: codeToken });
check('danach kein Zwang mehr', r.status === 200 && r.data.mustChange === false);
r = await call('POST', '/auth', { body: { email: anna.email, password: code } });
check('Einmalcode ist verbraucht', r.status === 403);
r = await call('POST', '/auth', { body: { email: anna.email, password: annaPw3 } });
check('Anmeldung mit dem neuen Passwort', r.status === 200);
userToken = r.data.token;

console.log('\nAbmelden, Sperren, Entfernen');
r = await call('POST', '/logout', { token: codeToken });
r = await call('GET', '/me', { token: codeToken });
check('abgemeldetes Token gilt nicht mehr', r.status === 401);
r = await call('PUT', '/admin/accounts', { token: adminToken, body: { email: anna.email, status: 'declined' } });
r = await call('GET', '/me', { token: userToken });
check('gesperrtes Konto fliegt sofort raus', r.status === 401);
r = await call('POST', '/auth', { body: { email: anna.email, password: annaPw3 } });
check('gesperrtes Konto kann sich nicht anmelden', r.status === 403 && r.data.status === 'declined');
r = await call('PUT', '/admin/accounts', { token: adminToken, body: { email: anna.email, status: 'removed' } });
check('Entfernen', r.status === 200 && !(r.data.accounts || []).some((a) => a.email === anna.email));
r = await call('PUT', '/admin/accounts', { token: adminToken, body: { email: anna.email, status: 'approved' } });
check('entferntes Konto ist weg → 404', r.status === 404);
r = await call('GET', '/admin/logins', { token: adminToken });
check('Anmeldeprotokoll nennt Spieler, aber keine Admins', Array.isArray(r.data) && r.data.some((x) => x.name === 'Anna Test') && !r.data.some((x) => String(x.name).toLowerCase() === ADMIN.toLowerCase()));

console.log('\nBremse gegen Passwort-Raten');
r = await call('POST', '/register', { body: ben });
r = await call('PUT', '/admin/accounts', { token: adminToken, body: { email: ben.email, status: 'approved' } });
let last = 0;
for (let i = 0; i < 8; i++) last = (await call('POST', '/auth', { body: { email: ben.email, password: `falsch-${i}-xxxx` } })).status;
check('acht Fehlversuche werden einzeln abgelehnt', last === 403);
r = await call('POST', '/auth', { body: { email: ben.email, password: ben.password } });
check('danach ist die Adresse eine Viertelstunde gesperrt → 429', r.status === 429);
await call('PUT', '/admin/accounts', { token: adminToken, body: { email: ben.email, status: 'removed' } });
await call('POST', '/logout', { token: adminToken });

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
