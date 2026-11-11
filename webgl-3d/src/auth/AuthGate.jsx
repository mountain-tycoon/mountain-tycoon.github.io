import React, { useEffect, useRef, useState } from 'react';
import {
    api, storeSession, lastEmail, SERVER_V,
    getPendingRegistration, setPendingRegistration
} from './authClient';
import { buildLabel } from '../buildInfo';
import './AuthGate.css';

const BASE = import.meta.env.BASE_URL || '/';
/** Dieselben Fotos wie im Hauptmenü – wechseln alle 5 Sekunden. */
const BG_IMAGES = Array.from({ length: 9 }, (_, i) => `${BASE}bg/bg${i + 1}.jpg`);
const LOGO = `${BASE}bg/logo.png`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POLL_MS = 8000;

/**
 * Anmeldeseite vor dem Hauptmenü – gleiches Prinzip wie bei Interventional Lab:
 * registrieren, vom Admin freischalten lassen, mit E-Mail und eigenem Passwort anmelden.
 * Nach einem Einmalcode (Passwort vergessen) wird zuerst ein neues Passwort festgelegt.
 */
const AuthGate = ({ onSignedIn }) => {
    // 'login' | 'register' | 'waiting' | 'password' – eine offene Registrierung von früher wartet weiter
    const [view, setView] = useState(() => (getPendingRegistration() ? 'waiting' : 'login'));
    const [waitingEmail, setWaitingEmail] = useState(() => getPendingRegistration()?.email || '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [info, setInfo] = useState('');
    const [serverNote, setServerNote] = useState('');
    const [bgIndex, setBgIndex] = useState(0);

    const [email, setEmail] = useState(() => lastEmail());
    const [password, setPassword] = useState('');
    const [reg, setReg] = useState({ first: '', last: '', email: '', pw: '', pw2: '' });
    const [newPw, setNewPw] = useState({ pw: '', pw2: '' });

    const pendingRef = useRef(null);   // {ticket, email, password?} – wartet auf die Freischaltung
    const heldRef = useRef(null);      // Anmeldung per Einmalcode, die erst ein eigenes Passwort braucht
    const pollRef = useRef(null);
    const signedInRef = useRef(onSignedIn);
    useEffect(() => { signedInRef.current = onSignedIn; }, [onSignedIn]);

    useEffect(() => {
        const id = setInterval(() => setBgIndex((i) => (i + 1) % BG_IMAGES.length), 5000);
        return () => clearInterval(id);
    }, []);

    // Passt der Anmeldeserver zur Seite? Sonst gehen Registrierung und Anmeldung ins Leere.
    useEffect(() => {
        let alive = true;
        api.version()
            .then((j) => { if (alive && (j.v || 0) < SERVER_V) setServerNote(`Anmeldeserver veraltet (Version ${j.v || 0}, die Seite braucht ${SERVER_V}) – bitte worker/worker.js neu deployen`); })
            .catch(() => { if (alive) setServerNote('Der Anmeldeserver ist gerade nicht erreichbar.'); });
        return () => { alive = false; };
    }, []);

    const stopPolling = () => { clearInterval(pollRef.current); pollRef.current = null; };
    const forgetPending = () => { stopPolling(); pendingRef.current = null; setPendingRegistration(null); };

    const checkPending = async () => {
        const p = pendingRef.current;
        if (!p) return;
        let status;
        try { status = (await api.regStatus(p.ticket)).status; } catch { return; }   // später noch einmal
        if (pendingRef.current !== p) return;
        if (status === 'approved') {
            forgetPending();
            if (p.password) {
                setInfo('Freigeschaltet – du wirst angemeldet …');
                try {
                    const auth = await api.login(p.email, p.password);
                    signedInRef.current(storeSession(auth, p.email));
                    return;
                } catch { /* dann eben von Hand */ }
            }
            setEmail(p.email); setErr(''); setView('login');
            setInfo('Dein Konto ist freigeschaltet – bitte jetzt anmelden.');
        } else if (status === 'declined' || status === 'removed') {
            forgetPending(); setInfo(''); setView('login');
            setErr('Die Registrierung wurde abgelehnt – bitte beim Admin melden.');
        } else if (status === 'unknown') {
            forgetPending(); setInfo(''); setView('login');
        }
    };
    const startPolling = () => { stopPolling(); pollRef.current = setInterval(checkPending, POLL_MS); };

    // Offene Registrierung von einem früheren Besuch: weiter auf die Freischaltung warten.
    useEffect(() => {
        const p = getPendingRegistration();
        if (p) { pendingRef.current = p; checkPending(); startPolling(); }
        return stopPolling;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const switchView = (next) => { setErr(''); setInfo(''); setView(next); };

    const doLogin = async (e) => {
        e.preventDefault();
        const mail = email.trim();
        if (!mail) { setErr('Bitte die E-Mail-Adresse eingeben'); return; }
        if (!password) { setErr('Bitte das Passwort eingeben'); return; }
        setErr(''); setInfo(''); setBusy(true);
        try {
            const auth = await api.login(mail, password);
            setPassword('');
            if (auth.mustChange) {
                // Erst nach dem neuen Passwort wird die Anmeldung gemerkt.
                heldRef.current = { auth, email: mail };
                setView('password');
            } else {
                forgetPending();
                onSignedIn(storeSession(auth, mail));
                return;
            }
        } catch (ex) { setErr(ex.message); }
        setBusy(false);
    };

    const doRegister = async (e) => {
        e.preventDefault();
        const fields = { first: reg.first.trim(), last: reg.last.trim(), email: reg.email.trim(), password: reg.pw };
        if (!fields.first || !fields.last) { setErr('Vor- und Nachname eingeben'); return; }
        if (!EMAIL_RE.test(fields.email)) { setErr('Bitte eine gültige E-Mail-Adresse eingeben'); return; }
        if (fields.password.length < 8) { setErr('Das Passwort braucht mindestens 8 Zeichen'); return; }
        if (fields.password !== reg.pw2) { setErr('Die Passwörter stimmen nicht überein'); return; }
        setErr(''); setInfo(''); setBusy(true);
        try {
            const res = await api.register(fields);
            if (res.token) { onSignedIn(storeSession(res, fields.email)); return; }   // sofort freigeschaltet
            pendingRef.current = { ticket: res.ticket, email: fields.email, password: fields.password };
            setPendingRegistration(pendingRef.current);
            setReg({ first: '', last: '', email: '', pw: '', pw2: '' });
            setEmail(fields.email);
            setWaitingEmail(fields.email);
            setView('waiting');
            startPolling();
        } catch (ex) { setErr(ex.message); }
        setBusy(false);
    };

    const doSetPassword = async (e) => {
        e.preventDefault();
        if (newPw.pw.length < 8) { setErr('Das Passwort braucht mindestens 8 Zeichen'); return; }
        if (newPw.pw !== newPw.pw2) { setErr('Die Passwörter stimmen nicht überein'); return; }
        const held = heldRef.current;
        if (!held) { switchView('login'); return; }
        setErr(''); setBusy(true);
        try {
            await api.setPassword(newPw.pw, undefined, held.auth.token);
            heldRef.current = null;
            onSignedIn(storeSession(held.auth, held.email));
            return;
        } catch (ex) { setErr(ex.message); }
        setBusy(false);
    };

    const regField = (key) => ({ value: reg[key], onChange: (e) => setReg((r) => ({ ...r, [key]: e.target.value })) });
    const showTabs = view === 'login' || view === 'register';

    return (
        <div className="ag-root">
            <div className="ag-bgstack" aria-hidden="true">
                {BG_IMAGES.map((src, i) => (
                    <div key={src} className={`ag-bgimg ${i === bgIndex ? 'on' : ''}`} style={{ backgroundImage: `url("${src}")` }} />
                ))}
                <div className="ag-veil" />
            </div>

            <div className="ag-wrap">
                <section className="ag-intro">
                    <img className="ag-logo" src={LOGO} alt="Mountain Tycoon" />
                    <h1>Dein Berg.<br /><span>Dein Skigebiet.</span></h1>
                    <p className="ag-lead">
                        Mountain Tycoon ist eine Skigebiets-Simulation im Browser: Lifte und Pisten planen,
                        Hütten und Hotels bauen, Gäste glücklich machen – in neun Ländern vom Mittelgebirge
                        bis Japan, wahlweise in 2D oder 3D.
                    </p>
                </section>

                <div className="ag-card">
                    {showTabs && (
                        <div className="ag-tabs" role="tablist">
                            <button type="button" role="tab" aria-selected={view === 'login'} className={view === 'login' ? 'on' : ''} onClick={() => switchView('login')}>Anmelden</button>
                            <button type="button" role="tab" aria-selected={view === 'register'} className={view === 'register' ? 'on' : ''} onClick={() => switchView('register')}>Registrieren</button>
                        </div>
                    )}

                    {view === 'login' && (
                        <form onSubmit={doLogin} noValidate>
                            <h2>Anmelden</h2>
                            <p className="ag-sub">E-Mail und dein Passwort</p>
                            <input type="email" name="email" autoComplete="username" placeholder="E-Mail" aria-label="E-Mail"
                                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!email} />
                            <input type="password" name="password" autoComplete="current-password" placeholder="Passwort" aria-label="Passwort"
                                value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!email} />
                            <div className="ag-msg" role="alert">{err && <span className="err">{err}</span>}{!err && info && <span className="ok">{info}</span>}</div>
                            <button className="ag-primary" type="submit" disabled={busy}>{busy ? 'Einen Moment …' : 'Öffnen'}</button>
                            <p className="ag-hint">Passwort vergessen? Der Admin gibt dir einen Einmalcode – damit meldest du dich an und legst ein neues fest.</p>
                        </form>
                    )}

                    {view === 'register' && (
                        <form onSubmit={doRegister} noValidate>
                            <h2>Registrieren</h2>
                            <p className="ag-sub">Mit E-Mail und eigenem Passwort. Der Admin schaltet dich frei – danach kannst du loslegen.</p>
                            <div className="ag-two">
                                <input type="text" name="given-name" autoComplete="given-name" placeholder="Vorname" aria-label="Vorname" maxLength={40} autoFocus {...regField('first')} />
                                <input type="text" name="family-name" autoComplete="family-name" placeholder="Nachname" aria-label="Nachname" maxLength={40} {...regField('last')} />
                            </div>
                            <input type="email" name="email" autoComplete="email" placeholder="E-Mail" aria-label="E-Mail" maxLength={80} {...regField('email')} />
                            <div className="ag-two">
                                <input type="password" name="new-password" autoComplete="new-password" placeholder="Passwort (mind. 8 Zeichen)" aria-label="Passwort" {...regField('pw')} />
                                <input type="password" name="new-password-repeat" autoComplete="new-password" placeholder="Passwort wiederholen" aria-label="Passwort wiederholen" {...regField('pw2')} />
                            </div>
                            <div className="ag-msg" role="alert">{err && <span className="err">{err}</span>}</div>
                            <button className="ag-primary" type="submit" disabled={busy}>{busy ? 'Einen Moment …' : 'Registrierung senden'}</button>
                        </form>
                    )}

                    {view === 'waiting' && (
                        <div className="ag-waiting">
                            <h2>Fast geschafft</h2>
                            <div className="ag-lift" aria-hidden="true"><i /><i /><i /></div>
                            <p className="ag-sub">
                                Deine Registrierung{waitingEmail ? <> für <b>{waitingEmail}</b></> : null} ist eingegangen
                                und wartet auf die Freischaltung. Diese Seite geht von selbst weiter, sobald dein Konto freigeschaltet ist.
                            </p>
                            <div className="ag-msg" role="status">{info && <span className="ok">{info}</span>}</div>
                            <button className="ag-secondary" type="button" onClick={() => switchView('login')}>Zur Anmeldung</button>
                        </div>
                    )}

                    {view === 'password' && (
                        <form onSubmit={doSetPassword} noValidate>
                            <h2>Eigenes Passwort festlegen</h2>
                            <p className="ag-sub">Du hast dich mit einem Einmalcode angemeldet. Leg jetzt dein eigenes Passwort fest – ab dann meldest du dich damit an.</p>
                            <input type="password" name="new-password" autoComplete="new-password" placeholder="Neues Passwort (mind. 8 Zeichen)" aria-label="Neues Passwort" autoFocus
                                value={newPw.pw} onChange={(e) => setNewPw((p) => ({ ...p, pw: e.target.value }))} />
                            <input type="password" name="new-password-repeat" autoComplete="new-password" placeholder="Passwort wiederholen" aria-label="Passwort wiederholen"
                                value={newPw.pw2} onChange={(e) => setNewPw((p) => ({ ...p, pw2: e.target.value }))} />
                            <div className="ag-msg" role="alert">{err && <span className="err">{err}</span>}</div>
                            <button className="ag-primary" type="submit" disabled={busy}>{busy ? 'Einen Moment …' : 'Speichern und öffnen'}</button>
                        </form>
                    )}
                </div>
            </div>

            {serverNote && <div className="ag-note">{serverNote}</div>}
            <span className="ag-build">{buildLabel()}</span>
        </div>
    );
};

export default AuthGate;
