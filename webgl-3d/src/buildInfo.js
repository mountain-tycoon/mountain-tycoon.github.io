/* global __BUILD__ */
// Build-Stempel aus vite.config.js (JJJJMMTTHHMMSS, deutsche Zeit) – beim Entwickeln 'dev'.
// Nach einem Deploy zeigt er im Spiel, welche Fassung gerade online ist.
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

const STAMP = /^\d{12,14}$/;

export function buildLabel() {
    if (!STAMP.test(BUILD)) return 'Build lokal';
    return `Build ${BUILD.slice(0, 4)}-${BUILD.slice(4, 6)}-${BUILD.slice(6, 8)} ${BUILD.slice(8, 10)}:${BUILD.slice(10, 12)}`;
}

/**
 * Neue Fassung veröffentlicht? Dann einmal frisch laden, statt mit alten Skripten weiterzumachen.
 * Nur beim Seitenstart aufrufen – nie mitten im Spiel.
 */
export async function checkForNewBuild() {
    if (!STAMP.test(BUILD)) return;
    try {
        const base = import.meta.env.BASE_URL || '/';
        const res = await fetch(`${base}version.txt?x=${Date.now()}`, { cache: 'no-store' });
        const live = (await res.text()).trim();
        if (!res.ok || !STAMP.test(live) || live === BUILD) return;
        if (sessionStorage.getItem('mt.reloaded') === live) return;   // schon versucht
        sessionStorage.setItem('mt.reloaded', live);
        try { await fetch(location.pathname || '/', { cache: 'reload' }); } catch { /* offline */ }
        location.reload();
    } catch { /* offline oder lokale Vorschau ohne version.txt */ }
}
