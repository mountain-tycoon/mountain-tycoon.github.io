// Verbindung zum Anmeldeserver (Cloudflare Worker, siehe worker/README.md).
// Ohne Adresse – beim Entwickeln mit `npm run dev` oder in der Electron-App – läuft das Spiel
// ohne Anmeldung.
import { BUILD } from '../buildInfo';

/** Schnittstellen-Stand, den diese Seite vom Server braucht (SERVER_V in worker/worker.js). */
export const SERVER_V = 1;

const RAW = String(import.meta.env.VITE_AUTH_ENDPOINT || '').trim().replace(/\/+$/, '');
const IS_FILE = typeof location !== 'undefined' && location.protocol === 'file:';
export const AUTH_ENDPOINT = IS_FILE ? '' : RAW;
export const authEnabled = () => !!AUTH_ENDPOINT;

// ---- Anmeldung im Browser merken -------------------------------------------------------------
const K = { token: 'mt.token', user: 'mt.user', role: 'mt.role', email: 'mt.email', pending: 'mt.pending' };
const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* Speicher nicht verfügbar */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* Speicher nicht verfügbar */ } },
};

/** @returns {{token: string, name: string, role: 'user'|'admin', email: string} | null} */
export function getSession() {
    const token = store.get(K.token), name = store.get(K.user);
    if (!token || !name) return null;
    return { token, name, role: store.get(K.role) === 'admin' ? 'admin' : 'user', email: store.get(K.email) };
}
export function storeSession(auth, email) {
    store.set(K.token, auth.token);
    store.set(K.user, auth.name);
    store.set(K.role, auth.role === 'admin' ? 'admin' : 'user');
    if (email) store.set(K.email, String(email).trim().toLowerCase());
    return getSession();
}
/** Meldet auf diesem Gerät ab; die zuletzt benutzte E-Mail bleibt als Vorbelegung stehen. */
export function clearSession() { store.del(K.token); store.del(K.user); store.del(K.role); }
export const lastEmail = () => store.get(K.email);

/** Offene Registrierung (wartet auf die Freischaltung) – übersteht ein Neuladen der Seite. */
export function getPendingRegistration() {
    try { const p = JSON.parse(store.get(K.pending) || 'null'); return p && p.ticket ? p : null; } catch { return null; }
}
export function setPendingRegistration(p) {
    if (p) store.set(K.pending, JSON.stringify({ ticket: p.ticket, email: p.email })); else store.del(K.pending);
}

// ---- Anfragen --------------------------------------------------------------------------------
export class AuthError extends Error {
    constructor(message, status = 0, data = {}) { super(message); this.name = 'AuthError'; this.status = status; this.data = data; }
}

/** @param {{method?: string, body?: object, auth?: boolean|string}} [opt] auth: true = gemerktes Token, string = dieses Token */
async function call(path, { method = 'GET', body, auth = false } = {}) {
    if (!AUTH_ENDPOINT) throw new AuthError('Anmeldeserver nicht eingerichtet');
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) headers['x-token'] = typeof auth === 'string' ? auth : store.get(K.token);
    let res;
    try {
        res = await fetch(AUTH_ENDPOINT + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch {
        throw new AuthError('Anmeldeserver nicht erreichbar – bitte die Internetverbindung prüfen');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError(data.error || 'Anfrage fehlgeschlagen', res.status, data);
    return data;
}

export const api = {
    version: () => call('/version'),
    register: (fields) => call('/register', { method: 'POST', body: { ...fields, build: BUILD } }),
    regStatus: (ticket) => call('/regstatus?ticket=' + encodeURIComponent(ticket)),
    login: (email, password) => call('/auth', { method: 'POST', body: { email, password, build: BUILD } }),
    me: () => call('/me', { auth: true }),
    logout: () => call('/logout', { method: 'POST', auth: true }),
    /** token: für die Anmeldung mit Einmalcode, die noch nicht gemerkt ist */
    setPassword: (password, old, token) => call('/password', { method: 'POST', auth: token || true, body: { password, old } }),
    getProgress: () => call('/progress', { auth: true }),
    putProgress: (completed) => call('/progress', { method: 'PUT', auth: true, body: { completed } }),
    adminAccounts: () => call('/admin/accounts', { auth: true }),
    adminSetStatus: (email, status) => call('/admin/accounts', { method: 'PUT', auth: true, body: { email, status } }),
    adminReset: (email) => call('/admin/reset', { method: 'POST', auth: true, body: { email } }),
    adminLogins: () => call('/admin/logins', { auth: true }),
};
