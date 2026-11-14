// Spielstände des 3D-Spiels: je Spieler und Level.
//
// Der Stand liegt sofort auf dem Gerät (localStorage) und – wenn man angemeldet ist – zusätzlich am
// Konto. So geht es auf jedem Gerät dort weiter, wo man aufgehört hat. Es gilt immer der jüngere Stand.
// Was genau gespeichert wird, bestimmt die Szene (getSave / loadSave in webgl/Scene3D.js).
import { api, authEnabled, getSession, SERVER_SAVES } from './auth/authClient';

const PREFIX = 'mt.save.';
const MIN_UPLOAD_GAP = 90 * 1000;     // so oft höchstens ans Konto – schont das Schreibkontingent des Servers
const LOCAL_EVERY = 20 * 1000;        // so oft mindestens aufs Gerät (Kontostand ändert sich laufend)

const session = () => (authEnabled() ? getSession() : null);
/** Wem die Spielstände auf diesem Gerät gehören (ohne Anmeldung: „lokal"). */
const owner = () => { const s = session(); return s ? `${s.role}:${s.email || s.name}`.toLowerCase() : 'lokal'; };
const keyFor = (levelId) => `${PREFIX}${owner()}.${levelId}`;
const isSave = (s) => !!s && s.v === 1 && Array.isArray(s.log) && Number.isFinite(s.t);
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('Zeit abgelaufen')), ms))]);

/** Levels mit eigenem Spielstand: die Kampagne. Die Sandbox würfelt ihr Gelände jedes Mal neu. */
export const canSave = (level) => !!level && !!level.id && !level.isSandbox;

// ---- auf dem Gerät ---------------------------------------------------------------------------
function readEntry(levelId) {
    try { return JSON.parse(localStorage.getItem(keyFor(levelId)) || 'null'); } catch { return null; }
}
export function readLocalSave(levelId) { const s = readEntry(levelId); return isSave(s) ? s : null; }
export function writeLocalSave(levelId, save) {
    try { localStorage.setItem(keyFor(levelId), JSON.stringify(save)); return true; } catch { return false; }
}
/** Übersicht fürs Menü: {levelId: {t, sum}} */
export function localSaveIndex() {
    const out = {};
    const prefix = `${PREFIX}${owner()}.`;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(prefix)) continue;
            const s = readLocalSave(k.slice(prefix.length));
            if (s) out[k.slice(prefix.length)] = { t: s.t, sum: { ...s.sum, money: s.money, played: s.played } };
        }
    } catch { /* Speicher nicht verfügbar */ }
    return out;
}

// ---- am Konto --------------------------------------------------------------------------------
/**
 * Kann der Anmeldeserver Spielstände aufnehmen? Ein älterer Server kennt die Schnittstelle noch
 * nicht – dann bleiben die Stände auf dem Gerät, ohne dass ständig vergeblich angefragt wird.
 * Die Antwort gilt, bis die Seite neu geladen wird; ohne Netz wird später erneut gefragt.
 */
let cloudCheck = null;
function cloudReady() {
    if (!session()) return Promise.resolve(false);
    if (!cloudCheck) {
        cloudCheck = withTimeout(api.version(), 6000)
            .then((j) => (j.v || 0) >= SERVER_SAVES)
            .catch(() => { cloudCheck = null; return false; });
    }
    return cloudCheck;
}

/** Übersicht vom Konto: {levelId: {t, sum}} – leer ohne Anmeldung oder ohne Netz. */
export async function remoteSaveIndex() {
    if (!(await cloudReady())) return {};
    try { const r = await withTimeout(api.listSaves(), 6000); return (r && r.saves) || {}; } catch { return {}; }
}

/**
 * Den jüngsten Stand eines Levels holen (Gerät oder Konto) und beide Seiten angleichen.
 * @returns {Promise<object|null>}
 */
export async function loadBestSave(levelId) {
    let local = readLocalSave(levelId);
    const localEntry = readEntry(levelId);                     // kann auch ein Löschvermerk sein
    if (!(await cloudReady())) return local;
    let remote = null;
    try { remote = await withTimeout(api.getSave(levelId), 6000); } catch { return local; }   // ohne Netz: der Stand vom Gerät
    if (remote && remote.deleted) {
        // woanders neu begonnen – ein älterer Stand auf diesem Gerät gilt nicht mehr
        if (local && local.t > (remote.t || 0)) { pushSave(levelId, local); return local; }
        try { localStorage.removeItem(keyFor(levelId)); } catch { /* egal */ }
        return null;
    }
    const cloud = remote && isSave(remote.save) ? remote.save : null;
    const localT = (localEntry && localEntry.t) || 0;
    if (cloud && cloud.t > localT) { writeLocalSave(levelId, cloud); return cloud; }
    if (local && (!cloud || local.t > cloud.t)) pushSave(levelId, local);       // Konto nachziehen
    if (!local && localEntry && localEntry.deleted && cloud) pushDeleted(levelId, localEntry.t);
    return local;
}

function pushSave(levelId, save, keepalive = false) {
    return cloudReady().then((ok) => (ok ? api.putSave(levelId, save, keepalive).then((r) => !!(r && r.ok)) : false)).catch(() => false);
}
function pushDeleted(levelId, t) {
    return cloudReady().then((ok) => (ok ? api.putSave(levelId, { deleted: true, t }).then(() => true) : false)).catch(() => false);
}

/** „Neu beginnen": den Stand eines Levels überall verwerfen. */
export function discardSave(levelId) {
    const t = Date.now();
    // Der Löschvermerk bleibt auf dem Gerät stehen, bis das Konto ihn hat (auch ohne Netz).
    try { localStorage.setItem(keyFor(levelId), JSON.stringify({ v: 1, deleted: true, t })); } catch { /* egal */ }
    return pushDeleted(levelId, t);
}

/**
 * Laufende Sicherung für ein gestartetes Level.
 * @param {string} levelId
 * @param {() => object} snapshot liefert den aktuellen Spielstand
 * @returns {{changed: () => void, flush: (leaving?: boolean) => void, dispose: () => void}}
 */
export function createAutosave(levelId, snapshot) {
    let dirty = false, lastUpload = 0, lastSaved = null, soon = null;

    const saveLocal = () => {
        let save = null;
        try { save = snapshot(); } catch { save = null; }
        if (!isSave(save)) return null;
        writeLocalSave(levelId, save);
        lastSaved = save;
        return save;
    };
    const upload = (keepalive = false) => {
        const save = saveLocal() || lastSaved;
        if (!save || !session()) { dirty = false; return; }
        dirty = false; lastUpload = Date.now();
        // keepalive-Anfragen dürfen nur klein sein; größere Stände gehen beim nächsten Start ans Konto.
        const small = JSON.stringify(save).length < 60000;
        pushSave(levelId, save, keepalive && small).then((ok) => { if (!ok) dirty = true; });
    };
    /** Es gibt etwas Neues (gebaut, abgerissen, Preis geändert). */
    const changed = () => {
        dirty = true;
        clearTimeout(soon);
        soon = setTimeout(() => {
            saveLocal();
            if (Date.now() - lastUpload >= MIN_UPLOAD_GAP) upload();
        }, 1200);
    };
    /** Sofort sichern – beim Verlassen des Levels oder wenn die Seite in den Hintergrund geht. */
    const flush = (leaving = false) => {
        clearTimeout(soon);
        if (dirty || Date.now() - lastUpload >= 30000) upload(leaving); else saveLocal();
    };
    const tick = setInterval(() => {
        saveLocal();
        if (dirty && Date.now() - lastUpload >= MIN_UPLOAD_GAP) upload();
    }, LOCAL_EVERY);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    return {
        changed,
        flush,
        dispose() {
            clearInterval(tick); clearTimeout(soon);
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
        },
    };
}

/** „vor 5 Min." – für die Anzeige im Menü. */
export function agoText(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return 'gerade eben';
    if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
    if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
    const d = Math.round(s / 86400);
    return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
