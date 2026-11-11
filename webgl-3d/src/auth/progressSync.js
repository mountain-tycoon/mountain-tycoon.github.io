// Kampagnen-Fortschritt am Konto: so geht es auf jedem Gerät dort weiter, wo man aufgehört hat.
import { loadProgress, saveProgress } from '../constants/campaign';
import { api, authEnabled, getSession } from './authClient';

const OWNER_KEY = 'mt.progressOwner';   // wem der lokal gespeicherte Stand gehört

const sameList = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Gleicht den lokalen Fortschritt mit dem Konto ab.
 * - derselbe Spieler wie zuletzt auf diesem Gerät: beide Stände werden vereinigt
 * - ein anderer Spieler: der lokale Stand wird durch den des Kontos ersetzt
 * @returns {Promise<boolean>} true, wenn sich der lokale Stand geändert hat
 */
export async function syncProgress() {
    const session = authEnabled() ? getSession() : null;
    if (!session) return false;
    const owner = `${session.role}:${session.email || session.name}`.toLowerCase();
    let previous = '';
    try { previous = localStorage.getItem(OWNER_KEY) || ''; } catch { /* Speicher nicht verfügbar */ }

    const local = loadProgress();
    const mine = !previous || previous === owner;
    const remote = mine ? await api.putProgress(local.completed) : await api.getProgress();
    const merged = Array.isArray(remote.completed) ? remote.completed : [];

    try { localStorage.setItem(OWNER_KEY, owner); } catch { /* Speicher nicht verfügbar */ }
    if (sameList(merged, local.completed)) return false;
    saveProgress({ completed: merged }, { silent: true });
    return true;
}

/** Lädt jeden neuen Fortschritt hoch, sobald das Spiel ihn speichert. */
export function installProgressSync() {
    if (!authEnabled() || typeof window === 'undefined') return () => {};
    let timer = null;
    const onChange = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { syncProgress().catch(() => { /* offline: beim nächsten Start */ }); }, 400);
    };
    window.addEventListener('mt:progress', onChange);
    return () => { clearTimeout(timer); window.removeEventListener('mt:progress', onChange); };
}
