// Merkt je Gerät und Konto, ob die Anleitung (Guide.jsx) schon gezeigt wurde.

const seenKey = () => {
    let user = '';
    try { user = localStorage.getItem('mt.user') || ''; } catch { /* privater Modus */ }
    return user ? `mt.guideSeen:${user}` : 'mt.guideSeen';
};
/** Hat dieser Spieler die Anleitung schon einmal gesehen? */
export function hasSeenGuide() {
    try { return !!localStorage.getItem(seenKey()); } catch { return true; }
}
export function markGuideSeen() {
    try { localStorage.setItem(seenKey(), '1'); } catch { /* privater Modus */ }
}
