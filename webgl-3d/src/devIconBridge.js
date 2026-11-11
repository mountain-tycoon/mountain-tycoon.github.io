/**
 * Dev-Hilfe: nimmt Icon-Bilder per postMessage entgegen und speichert sie
 * über den Vite-Endpunkt /__save-icon in `public/icons/`.
 *
 * Wird nur im Entwicklungsmodus geladen. So bleibt die Brücke auch nach einem
 * Reload aktiv und Bilder können aus einem anderen Tab herübergeschickt werden:
 *   otherWindow.postMessage({ kind:'icon', name:'hotel_lux', dataUrl:'data:image/png;base64,...' }, 'http://localhost:5180')
 */
export function installIconBridge() {
    if (typeof window === 'undefined' || window.__iconBridgeReady) return;
    window.__iconBridgeReady = true;
    window.__saved = [];
    window.addEventListener('message', async (e) => {
        const d = e.data;
        if (!d || d.kind !== 'icon' || !d.name || !d.dataUrl) return;
        try {
            const r = await fetch('/__save-icon', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: d.name, dataUrl: d.dataUrl, dir: d.dir })
            }).then((x) => x.json());
            window.__saved.push(d.name + (r.ok ? '' : ' FEHLER'));
        } catch (err) {
            window.__saved.push(d.name + ' FEHLER');
        }
    });
}
