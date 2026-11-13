// Mountain Tycoon – Anmeldung und Verwaltung. Ein Cloudflare Worker mit KV (kostenloses Kontingent).
// Gleiches Prinzip wie der Anmeldeserver von Interventional Lab.
//
// Rollen
//   Admin   – meldet sich mit einer Adresse aus ADMIN_EMAILS und dem Secret ADMIN_PASSWORD an,
//             schaltet Konten frei, setzt Passwörter per Einmalcode zurück, sieht die Anmeldungen.
//   Spieler – registriert sich mit Vorname, Nachname, E-Mail und eigenem Passwort; nach der
//             Freischaltung meldet er sich mit E-Mail und Passwort an. Gespeichert wird nur ein
//             PBKDF2-Hash. Der Kampagnen-Fortschritt und die Spielstände (das gebaute Skigebiet je
//             Level) hängen am Konto und wandern so von Gerät zu Gerät.
//
// GET  /version                                           → {v, app}
// POST /register        {first, last, email, password}    → {ok, status, ticket | token, name, role}
// GET  /regstatus?ticket=…                                → {status}
// POST /auth            {email, password, build}          → {ok, token, role, name, mustChange}
// GET  /me              (x-token)                         → {ok, role, name, mustChange}
// POST /logout          (x-token)                         → {ok}
// POST /password        (x-token) {old, password}         → {ok}   (nach einem Einmalcode ohne old)
// GET  /progress        (x-token)                         → {completed: [levelId], t}
// PUT  /progress        (x-token) {completed: [levelId]}  → {completed, t}   (Vereinigung beider Stände)
// GET  /saves           (x-token)                         → {saves: {levelId: {t, sum}}}
// GET  /save?level=…    (x-token)                         → {save} | {none: true} | {deleted: true, t}
// PUT  /save?level=…    (x-token) Spielstand | {deleted, t} → {ok, t} | {ok: false, stale: true, t}
// GET  /admin/accounts  (Admin)                           → {accounts: […]}
// PUT  /admin/accounts  (Admin) {email, status}           → {ok, accounts}   approved|declined|pending|removed
// POST /admin/reset     (Admin) {email}                   → {ok, code, accounts}
// GET  /admin/logins    (Admin)                           → [{name, t, build}]
//
// KV-Schlüssel: acc:<email> (Konto, öffentliche Felder zusätzlich als Metadaten), tok:<token>,
// reg:<ticket>, progress:<konto>, save:<konto>:<level> (Spielstand, Kurzfassung als Metadaten),
// rows (Anmeldeprotokoll), fail:<kennung>:<ip>, regs:<tag>.

const SERVER_V = 2;
const MAX_SAVE_BYTES = 400000;            // ein Spielstand ist ein paar Kilobyte groß – das ist reichlich Luft
const TOKEN_TTL = 60 * 60 * 24 * 60;      // eine Anmeldung gilt 60 Tage
const TICKET_TTL = 60 * 60 * 24 * 30;     // so lange fragt die Seite nach der Freischaltung
const MAX_FAILS = 8, FAIL_TTL = 15 * 60;  // Fehlversuche je Kennung und Absender
const MAX_REGS_PER_DAY = 200;             // schützt das kostenlose Schreibkontingent

const norm = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fullName = (a) => `${a.first} ${a.last}`.trim();
const pwRule = (p) => (p.length < 8 ? 'Das Passwort braucht mindestens 8 Zeichen' : (p.length > 200 ? 'Das Passwort ist zu lang' : ''));
const randomId = () => crypto.randomUUID() + crypto.randomUUID().slice(0, 8);

// Passwörter nur als PBKDF2-Hash mit Salz (100 000 Runden – mehr lässt Workers nicht zu).
async function hashPw(password, salt) {
  salt = salt || hex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return { salt, hash: hex(bits) };
}
async function checkPw(password, pw) { return !!(pw && pw.hash) && (await hashPw(password, pw.salt)).hash === pw.hash; }
// Vergleich ohne Zeitunterschied (für das Admin-Passwort)
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = (await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))])).map((h) => new Uint8Array(h));
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
// Einmalcode für den Reset durch den Admin: gut vorzulesen, ohne 0/O/1/I.
function tempCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => a[b % a.length]).join(''); }

export default {
  async fetch(req, env) {
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('origin') || '';
    const headers = {
      'access-control-allow-origin': allowed.includes(origin) ? origin : (allowed[0] || 'null'),
      'access-control-allow-headers': 'content-type, x-token',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-max-age': '86400',
      'vary': 'origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    try { return await route(req, env, send); }
    catch { return send({ error: 'Serverfehler – bitte später noch einmal versuchen' }, 500); }
  },
};

async function route(req, env, send) {
  const kv = env.KV;
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  const getJSON = async (key, fallback) => { const v = await kv.get(key); if (!v) return fallback; try { return JSON.parse(v); } catch { return fallback; } };
  const body = async () => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };
  const admins = String(env.ADMIN_EMAILS || '').split(',').map(norm).filter(Boolean);

  // ---- Konten: je Konto ein Schlüssel; die öffentlichen Felder stehen zusätzlich in den Metadaten,
  //      damit die Verwaltung alle Konten mit einem einzigen list() bekommt.
  const publicAccount = (a) => ({ first: a.first, last: a.last, email: a.email, status: a.status, t: a.t, decided: a.decided || 0, mustChange: !!a.mustChange });
  const getAcc = (email) => getJSON('acc:' + norm(email), null);
  const putAcc = (a) => kv.put('acc:' + norm(a.email), JSON.stringify(a), { metadata: publicAccount(a) });
  const listAll = async (prefix) => { const keys = []; let cursor; do { const page = await kv.list({ prefix, cursor }); keys.push(...page.keys); cursor = page.list_complete ? undefined : page.cursor; } while (cursor); return keys; };
  // patch: ein gerade geändertes Konto (list() hinkt ein paar Sekunden hinterher); gone: gerade entfernt
  async function listAccounts(patch, gone) {
    const byKey = {};
    for (const k of await listAll('acc:')) if (k.metadata) byKey[k.name.slice(4)] = k.metadata;
    if (patch) byKey[norm(patch.email)] = publicAccount(patch);
    if (gone) delete byKey[norm(gone)];
    const levels = {};
    for (const k of await listAll('progress:')) levels[k.name.slice(9)] = (k.metadata && k.metadata.n) || 0;
    const rank = (a) => (a.status === 'pending' ? 0 : 1);
    return Object.entries(byKey).map(([key, a]) => ({ ...a, levels: levels[key] || 0 })).sort((a, b) => rank(a) - rank(b) || b.t - a.t);
  }

  // ---- Anmeldungen (Token) und Protokoll
  const issue = async (session) => { const token = randomId(); await kv.put('tok:' + token, JSON.stringify(session), { expirationTtl: TOKEN_TTL }); return token; };
  const addRow = async (row) => { const rows = await getJSON('rows', []); rows.push(row); while (rows.length > 1000) rows.shift(); await kv.put('rows', JSON.stringify(rows)); };
  const newTicket = async (email) => { const ticket = randomId(); await kv.put('reg:' + ticket, norm(email), { expirationTtl: TICKET_TTL }); return ticket; };

  // ---- Bremse gegen Passwort-Raten: Fehlversuche je Kennung und Absender
  const ip = req.headers.get('cf-connecting-ip') || 'lokal';
  const failKey = (ident) => 'fail:' + norm(ident).slice(0, 80) + ':' + ip;
  const fails = async (ident) => +(await kv.get(failKey(ident))) || 0;
  const addFail = async (ident) => kv.put(failKey(ident), String((await fails(ident)) + 1), { expirationTtl: FAIL_TTL });
  const clearFails = async (ident) => { if (await fails(ident)) await kv.delete(failKey(ident)); };

  // Die Seite prüft damit, ob der Anmeldeserver zu ihr passt.
  if (m === 'GET' && (path === '/version' || path === '/')) return send({ v: SERVER_V, app: 'mountain-tycoon' });

  // ---- Registrierung: wartet in der Verwaltung, bis der Admin freischaltet (oder AUTO_APPROVE = "1").
  if (m === 'POST' && path === '/register') {
    const b = await body();
    const first = clean(b.first, 40), last = clean(b.last, 40), email = clean(b.email, 80), build = clean(b.build, 20);
    if (!first || !last) return send({ error: 'Vor- und Nachname eingeben' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send({ error: 'Bitte eine gültige E-Mail-Adresse eingeben' }, 400);
    const password = String(b.password || ''); const bad = pwRule(password);
    if (bad) return send({ error: bad }, 400);
    const old = await getAcc(email);
    if (old && old.status === 'approved') return send({ error: 'Diese E-Mail ist schon freigeschaltet – bitte anmelden' }, 409);
    if (old && old.status === 'pending') {
      // Nur wer das Passwort der offenen Registrierung kennt, darf wieder nach dem Stand fragen.
      if (await checkPw(password, old.pw)) return send({ ok: true, status: 'pending', ticket: await newTicket(email), note: 'Die Registrierung wartet noch auf die Freischaltung' });
      return send({ error: 'Für diese E-Mail liegt schon eine Registrierung vor, die auf die Freischaltung wartet' }, 409);
    }
    const day = 'regs:' + new Date().toISOString().slice(0, 10);
    const count = +(await kv.get(day)) || 0;
    if (count >= MAX_REGS_PER_DAY) return send({ error: 'Heute sind keine weiteren Registrierungen möglich – bitte morgen noch einmal versuchen' }, 429);
    await kv.put(day, String(count + 1), { expirationTtl: 60 * 60 * 48 });
    const auto = String(env.AUTO_APPROVE || '') === '1';
    const acc = { first, last, email, status: auto ? 'approved' : 'pending', t: Date.now(), pw: await hashPw(password) };
    if (auto) acc.decided = acc.t;
    await putAcc(acc);
    if (auto) {
      const name = fullName(acc);
      const token = await issue({ role: 'user', name, key: norm(email) });
      await addRow({ name, t: Date.now(), build });
      return send({ ok: true, status: 'approved', token, role: 'user', name });
    }
    return send({ ok: true, status: 'pending', ticket: await newTicket(email) });
  }

  // Stand einer Registrierung – nur mit dem Ticket, das die Registrierung zurückgegeben hat.
  if (m === 'GET' && path === '/regstatus') {
    const ticket = clean(url.searchParams.get('ticket'), 80);
    const key = ticket ? await kv.get('reg:' + ticket) : null;
    if (!key) return send({ status: 'unknown' });
    const acc = await getJSON('acc:' + key, null);
    return send({ status: acc ? acc.status : 'removed' });
  }

  if (m === 'POST' && path === '/auth') {
    const b = await body();
    const ident = clean(b.email || b.name, 80), password = String(b.password || ''), build = clean(b.build, 20);
    if (!ident) return send({ error: 'Bitte die E-Mail-Adresse eingeben' }, 400);
    if (!password) return send({ error: 'Bitte das Passwort eingeben' }, 400);
    if ((await fails(ident)) >= MAX_FAILS) return send({ error: 'Zu viele Fehlversuche – bitte in einer Viertelstunde noch einmal versuchen' }, 429);
    if (admins.includes(norm(ident)) && env.ADMIN_PASSWORD && (await safeEqual(password, env.ADMIN_PASSWORD))) {
      await clearFails(ident);
      // Admin-Anmeldungen landen nicht im Protokoll – dort stehen nur die Spieler.
      const token = await issue({ role: 'admin', name: ident, key: 'admin:' + norm(ident) });
      return send({ ok: true, token, role: 'admin', name: ident });
    }
    const acc = await getAcc(ident);
    if (!acc || !(await checkPw(password, acc.pw))) { await addFail(ident); return send({ error: 'E-Mail oder Passwort stimmt nicht' }, 403); }
    if (acc.status === 'pending') return send({ error: 'Dein Konto wartet noch auf die Freischaltung', status: 'pending' }, 403);
    if (acc.status !== 'approved') return send({ error: 'Dieses Konto ist nicht freigeschaltet – bitte beim Admin melden', status: acc.status }, 403);
    await clearFails(ident);
    const name = fullName(acc);
    const token = await issue({ role: 'user', name, key: norm(acc.email) });
    await addRow({ name, t: Date.now(), build });
    // Nach einem Einmalcode lässt die Seite erst ein eigenes Passwort festlegen.
    return send({ ok: true, token, role: 'user', name, mustChange: !!acc.mustChange });
  }

  // ---- ab hier nur mit gültiger Anmeldung
  const token = clean(req.headers.get('x-token'), 100);
  let s = token ? await getJSON('tok:' + token, null) : null;
  let myAcc = null;
  if (s && s.role === 'user') { myAcc = await getJSON('acc:' + s.key, null); if (!myAcc || myAcc.status !== 'approved') s = null; }   // entfernt oder gesperrt
  if (s && s.role === 'admin' && !admins.includes(String(s.key).slice(6))) s = null;                                                 // nicht mehr in ADMIN_EMAILS
  const need = () => send({ error: 'nicht angemeldet' }, 401);

  if (m === 'GET' && path === '/me') return s ? send({ ok: true, role: s.role, name: s.name, mustChange: !!(myAcc && myAcc.mustChange) }) : need();
  if (m === 'POST' && path === '/logout') { if (token) await kv.delete('tok:' + token); return send({ ok: true }); }

  if (m === 'POST' && path === '/password') {
    if (!s || s.role !== 'user') return need();
    const b = await body();
    if (!myAcc.mustChange && !(await checkPw(String(b.old || ''), myAcc.pw))) return send({ error: 'Bisheriges Passwort falsch' }, 403);
    const password = String(b.password || ''); const bad = pwRule(password);
    if (bad) return send({ error: bad }, 400);
    myAcc.pw = await hashPw(password); delete myAcc.mustChange;
    await putAcc(myAcc);
    return send({ ok: true });
  }

  // Kampagnen-Fortschritt je Konto. Geschrieben wird die Vereinigung – so geht auf keinem Gerät etwas verloren.
  if (path === '/progress' && (m === 'GET' || m === 'PUT')) {
    if (!s) return need();
    const key = 'progress:' + s.key;
    const cur = await getJSON(key, { completed: [], t: 0 });
    if (!Array.isArray(cur.completed)) cur.completed = [];
    if (m === 'GET') return send(cur);
    const b = await body();
    const incoming = (Array.isArray(b.completed) ? b.completed : []).slice(0, 100).map((x) => clean(x, 40)).filter(Boolean);
    const merged = [...new Set([...cur.completed, ...incoming])].slice(0, 200);
    if (merged.length === cur.completed.length) return send(cur);
    const next = { completed: merged, t: Date.now() };
    await kv.put(key, JSON.stringify(next), { metadata: { n: merged.length, t: next.t } });
    return send(next);
  }

  // Spielstände je Konto und Level. Es gilt der jüngere Stand: ein Gerät mit veraltetem Stand
  // überschreibt nichts Neueres. „Neu beginnen" hinterlässt einen Löschvermerk, damit ein anderes
  // Gerät seinen alten Stand nicht wieder hochlädt.
  if (path === '/saves' && m === 'GET') {
    if (!s) return need();
    const saves = {};
    const prefix = 'save:' + s.key + ':';
    for (const k of await listAll(prefix)) {
      const md = k.metadata || {};
      if (!md.deleted) saves[k.name.slice(prefix.length)] = { t: md.t || 0, sum: md.sum || null };
    }
    return send({ saves });
  }
  if (path === '/save' && (m === 'GET' || m === 'PUT')) {
    if (!s) return need();
    const levelId = clean(url.searchParams.get('level'), 40);
    if (!/^[a-z0-9_-]+$/i.test(levelId)) return send({ error: 'Level fehlt' }, 400);
    const key = 'save:' + s.key + ':' + levelId;
    if (m === 'GET') {
      const cur = await getJSON(key, null);
      if (!cur) return send({ none: true });
      return cur.deleted ? send({ deleted: true, t: cur.t || 0 }) : send({ save: cur });
    }
    const raw = await req.text();
    if (raw.length > MAX_SAVE_BYTES) return send({ error: 'Spielstand zu groß' }, 413);
    let b = null;
    try { b = JSON.parse(raw); } catch { b = null; }
    if (!b || typeof b !== 'object' || !Number.isFinite(b.t)) return send({ error: 'ungültiger Spielstand' }, 400);
    const t = Math.min(b.t, Date.now() + 60000);                       // keine Stände „aus der Zukunft"
    const { metadata: old } = await kv.getWithMetadata(key);
    if (old && old.t > t) return send({ ok: false, stale: true, t: old.t });
    if (b.deleted) {
      await kv.put(key, JSON.stringify({ v: 1, deleted: true, t }), { metadata: { t, deleted: true } });
      return send({ ok: true, t });
    }
    if (b.v !== 1 || !Array.isArray(b.log)) return send({ error: 'ungültiger Spielstand' }, 400);
    const q = b.sum && typeof b.sum === 'object' ? b.sum : {};
    const num = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
    const sum = { lifts: num(q.lifts), buildings: num(q.buildings), km: num(q.km), revenue: num(q.revenue), money: num(b.money), played: num(b.played) };
    await kv.put(key, JSON.stringify({ ...b, t, level: levelId }), { metadata: { t, sum } });
    return send({ ok: true, t });
  }

  // ---- Verwaltung
  if (!path.startsWith('/admin/')) return send({ error: 'unbekannt' }, 404);
  if (!s || s.role !== 'admin') return send({ error: 'nur für den Admin' }, s ? 403 : 401);

  if (m === 'GET' && path === '/admin/accounts') return send({ accounts: await listAccounts() });
  if (m === 'PUT' && path === '/admin/accounts') {
    const b = await body();
    const acc = await getAcc(b.email);
    if (!acc) return send({ error: 'Konto nicht gefunden' }, 404);
    const status = String(b.status || '');
    if (status === 'removed') {
      await kv.delete('acc:' + norm(acc.email)); await kv.delete('progress:' + norm(acc.email));
      for (const k of await listAll('save:' + norm(acc.email) + ':')) await kv.delete(k.name);   // Spielstände gehen mit
      return send({ ok: true, accounts: await listAccounts(null, acc.email) });
    }
    if (status !== 'approved' && status !== 'declined' && status !== 'pending') return send({ error: 'unbekannter Status' }, 400);
    acc.status = status; acc.decided = Date.now();
    await putAcc(acc);
    return send({ ok: true, accounts: await listAccounts(acc) });
  }
  // Passwort vergessen: der Admin erzeugt einen Einmalcode und gibt ihn weiter; damit meldet sich
  // der Spieler an und legt sofort ein neues Passwort fest.
  if (m === 'POST' && path === '/admin/reset') {
    const b = await body();
    const acc = await getAcc(b.email);
    if (!acc) return send({ error: 'Konto nicht gefunden' }, 404);
    const code = tempCode();
    acc.pw = await hashPw(code); acc.mustChange = true;
    await putAcc(acc);
    return send({ ok: true, code, accounts: await listAccounts(acc) });
  }
  if (m === 'GET' && path === '/admin/logins') return send(await getJSON('rows', []));
  return send({ error: 'unbekannt' }, 404);
}
