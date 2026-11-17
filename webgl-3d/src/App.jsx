import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import MainMenu from './components/menu/MainMenu';
import LoadingScreen from './components/menu/LoadingScreen.jsx';
import World3D from './webgl/World3D';
import AuthGate from './auth/AuthGate.jsx';
import AccountBar from './auth/AccountBar.jsx';
import { api, authEnabled, getSession, clearSession } from './auth/authClient';
import { syncProgress, installProgressSync } from './auth/progressSync';
import { canSave, loadBestSave, discardSave } from './savegames';
import { checkForNewBuild } from './buildInfo';
import { CAMPAIGN_LEVELS } from './constants/campaign';

// ============================================================
// APP ROOT — Anmeldung → Hauptmenü ↔ Spiel
// ============================================================
const App = () => {
  const [activeLevel, setActiveLevel] = useState(null);
  // Level wartet auf den Ladebildschirm, bevor die Welt gebaut wird
  const [pendingLevel, setPendingLevel] = useState(null);
  const [sessionKey, setSessionKey] = useState(0);
  // Anmeldung (nur wenn ein Anmeldeserver eingetragen ist – siehe auth/authClient.js)
  const [account, setAccount] = useState(() => (authEnabled() ? getSession() : null));
  const [menuKey, setMenuKey] = useState(0);
  // Spielstand des gestarteten Levels (3D): wird während des Ladebildschirms geholt
  const [activeSave, setActiveSave] = useState(null);
  const pendingSave = useRef(null);

  // Beim Seitenstart: neue Fassung online? Dann einmal frisch laden.
  useEffect(() => { checkForNewBuild(); }, []);
  // Nur beim Entwickeln: ?level=<id> startet ein Kampagnen-Level direkt in 3D (ohne Menü und Ladebildschirm).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = new URLSearchParams(window.location.search).get('level');
    const lv = id && CAMPAIGN_LEVELS.find(l => l.id === id);
    if (lv) setActiveLevel(lv);
  }, []);
  // Jeden neuen Kampagnen-Fortschritt ans Konto melden.
  useEffect(() => installProgressSync(), []);
  // Anmeldung prüfen und den Fortschritt mit dem Konto abgleichen.
  useEffect(() => {
    if (!authEnabled() || !account) return undefined;
    let alive = true;
    (async () => {
      try { await api.me(); }
      catch (e) {
        // Abgelaufen, gesperrt oder entfernt → zurück zur Anmeldung. Ohne Netz bleibt man drin.
        if (e.status === 401 && alive) { clearSession(); setAccount(null); setActiveLevel(null); setPendingLevel(null); }
        return;
      }
      try { if ((await syncProgress()) && alive) setMenuKey(k => k + 1); }
      catch { /* offline: der lokale Stand bleibt */ }
    })();
    return () => { alive = false; };
  }, [account]);

  const handleLogout = () => {
    api.logout().catch(() => { /* Token läuft sonst von selbst ab */ });
    clearSession();
    setAccount(null);
    setActiveLevel(null);
    setPendingLevel(null);
  };

  // Beim Levelstart erst den Ladebildschirm zeigen, dann die Welt aufbauen.
  // opts.fresh: „Neu beginnen" – ein vorhandener Spielstand wird verworfen.
  const handleStartLevel = (level, opts = {}) => {
    pendingSave.current = null;
    if (canSave(level)) {
      if (opts.fresh) discardSave(level.id);
      else pendingSave.current = loadBestSave(level.id).catch(() => null);   // läuft, während der Ladebildschirm steht
    }
    setPendingLevel({ level });
  };
  const finishLoading = async () => {
    if (!pendingLevel) return;
    const next = pendingLevel;
    let save = null;
    try { save = await pendingSave.current; } catch { save = null; }
    setActiveSave(save || null);
    setSessionKey(k => k + 1);
    setActiveLevel(next.level);
    setPendingLevel(null);
  };

  const handleExitToMenu = () => {
    setActiveLevel(null);
    setActiveSave(null);
    setMenuKey(k => k + 1);     // Menü frisch aufbauen: es zeigt dann den eben gesicherten Spielstand
  };

  if (authEnabled() && !account) {
    return <AuthGate onSignedIn={setAccount} />;
  }

  if (pendingLevel) {
    return <LoadingScreen level={pendingLevel.level} onDone={finishLoading} />;
  }

  if (!activeLevel) {
    return (
      <>
        <MainMenu key={menuKey} onStartLevel={handleStartLevel} />
        {authEnabled() && account && <AccountBar session={account} onLogout={handleLogout} />}
      </>
    );
  }

  return (
    <World3D
      key={`3d-${activeLevel.id}-${sessionKey}`}
      level={activeLevel}
      initialSave={activeSave}
      onExit={handleExitToMenu}
    />
  );
};

export default App;
