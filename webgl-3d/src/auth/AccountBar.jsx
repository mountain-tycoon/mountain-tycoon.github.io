import React, { useEffect, useState } from 'react';
import { api } from './authClient';
import { buildLabel } from '../buildInfo';
import AdminPanel from './AdminPanel.jsx';
import { useEscape } from './useEscape';
import './AuthGate.css';

/** Eigenes Passwort ändern (bisheriges Passwort + neues, zweimal). */
const PasswordDialog = ({ onClose }) => {
    const [fields, setFields] = useState({ old: '', pw: '', pw2: '' });
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    useEscape(onClose);

    const field = (key) => ({ value: fields[key], onChange: (e) => setFields((f) => ({ ...f, [key]: e.target.value })) });
    const submit = async (e) => {
        e.preventDefault();
        if (!fields.old) { setErr('Bitte das bisherige Passwort eingeben'); return; }
        if (fields.pw.length < 8) { setErr('Das neue Passwort braucht mindestens 8 Zeichen'); return; }
        if (fields.pw !== fields.pw2) { setErr('Die Passwörter stimmen nicht überein'); return; }
        setErr(''); setBusy(true);
        try { await api.setPassword(fields.pw, fields.old); setDone(true); }
        catch (ex) { setErr(ex.message); }
        setBusy(false);
    };

    return (
        <div className="ag-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="ag-dialog small" role="dialog" aria-modal="true" aria-label="Passwort ändern">
                <div className="ag-dialog-head">
                    <h2>Passwort ändern</h2>
                    <button type="button" className="ag-close" onClick={onClose} aria-label="Schließen">×</button>
                </div>
                <div className="ag-dialog-body">
                    {done ? (
                        <>
                            <div className="ag-msg" role="status"><span className="ok">Dein neues Passwort ist gespeichert.</span></div>
                            <button type="button" className="ag-primary" style={{ width: '100%' }} onClick={onClose}>Fertig</button>
                        </>
                    ) : (
                        <form onSubmit={submit} noValidate>
                            <input type="password" name="current-password" autoComplete="current-password" placeholder="Bisheriges Passwort" aria-label="Bisheriges Passwort" autoFocus {...field('old')} />
                            <input type="password" name="new-password" autoComplete="new-password" placeholder="Neues Passwort (mind. 8 Zeichen)" aria-label="Neues Passwort" {...field('pw')} />
                            <input type="password" name="new-password-repeat" autoComplete="new-password" placeholder="Neues Passwort wiederholen" aria-label="Neues Passwort wiederholen" {...field('pw2')} />
                            <div className="ag-msg" role="alert">{err && <span className="err">{err}</span>}</div>
                            <button type="submit" className="ag-primary" disabled={busy}>{busy ? 'Einen Moment …' : 'Speichern'}</button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * Konto-Leiste im Hauptmenü: wer angemeldet ist, Abmelden, Passwort ändern –
 * und für den Admin die Verwaltung (mit Zähler der wartenden Registrierungen).
 */
const AccountBar = ({ session, onLogout }) => {
    const [panel, setPanel] = useState(null);   // 'admin' | 'password' | null
    const [pending, setPending] = useState(0);
    const isAdmin = session.role === 'admin';

    useEffect(() => {
        if (!isAdmin) return undefined;
        let alive = true;
        api.adminAccounts()
            .then((res) => { if (alive) setPending((res.accounts || []).filter((a) => a.status === 'pending').length); })
            .catch(() => { /* Zähler ist nur ein Hinweis */ });
        return () => { alive = false; };
    }, [isAdmin]);

    return (
        <>
            <div className="ag-account">
                <span className="ag-account-name" title={session.email || session.name}>{isAdmin ? 'Admin' : session.name}</span>
                {isAdmin && (
                    <button type="button" onClick={() => setPanel('admin')}>
                        Verwaltung{pending > 0 && <span className="ag-badge">{pending}</span>}
                    </button>
                )}
                {!isAdmin && <button type="button" onClick={() => setPanel('password')}>Passwort</button>}
                <button type="button" onClick={onLogout}>Abmelden</button>
                <span className="ag-account-build">{buildLabel()}</span>
            </div>
            {panel === 'admin' && <AdminPanel onClose={() => setPanel(null)} onPendingCount={setPending} />}
            {panel === 'password' && <PasswordDialog onClose={() => setPanel(null)} />}
        </>
    );
};

export default AccountBar;
