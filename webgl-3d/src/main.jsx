import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Nur im Dev: Brücke zum Speichern von Icon-Bildern (siehe devIconBridge.js)
if (import.meta.env.DEV) {
  import('./devIconBridge.js').then((m) => m.installIconBridge());
}

// Die Skripte sind geladen – der Notfall-Neustart aus index.html darf beim nächsten Mal wieder greifen.
try { sessionStorage.removeItem('mt.assetReload'); } catch { /* Speicher nicht verfügbar */ }

console.log("🚀 [Main] App starting...");

// GLOBAL ERROR HANDLER
window.onerror = function (message, source, lineno, colno, error) {
  console.error("🔥 [CRITICAL CRASH]", { message, source, lineno, error });
  document.body.innerHTML = `<div style="color: white; background: #991b1b; padding: 40px; font-size: 20px; font-family: sans-serif; height: 100vh;">
    <h1 style="font-size: 40px; margin-bottom: 20px;">🚨 GAME CRASHED</h1>
    <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 8px;">
      <p><strong>Error:</strong> ${message}</p>
      <p><strong>File:</strong> ${source}:${lineno}</p>
      <pre style="background: #450a0a; padding: 15px; overflow: auto; border: 1px solid #dc2626; margin-top: 20px;">${error?.stack || 'No stack trace'}</pre>
    </div>
    <button onclick="location.reload()" style="margin-top: 20px; padding: 12px 24px; background: white; color: #991b1b; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Spiel neu laden</button>
  </div>`;
};

try {
  console.log("🛠️ [Main] Mounting React root...");
  const root = document.getElementById('root');
  if (!root) throw new Error("Root element not found!");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log("✅ [Main] Render triggered");
} catch (e) {
  window.onerror(e.message, 'main.jsx', 0, 0, e);
}
