import React, { useCallback, useEffect, useState } from 'react';
import { api } from './authClient';
import { useEscape } from './useEscape';
import './AuthGate.css';

const STATUS_LABEL = { pending: 'Wartet', approved: 'Freigeschaltet', declined: 'Gesperrt' };
const REFRESH_MS = 60000;   // sparsam: jede Abfrage kostet KV-Kontingent
const when = (t) => (t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const buildDay = (b) => (/^\d{12,14}$/.test(b || '') ? `${b.slice(6, 8)}.${b.slice(4, 6)}. ${b.slice(8, 10)}:${b.slice(10, 12)}` : (b || ''));

/**
 * Verwaltung für den Admin: Konten freischalten, sperren, entfernen,
 * Passwörter per Einmalcode zurücksetzen und die Anmeldungen ansehen.
 */
const AdminPanel = ({ onClose, onPendingCount }) => {
    const [tab, setTab] = useState('accounts');    // 'accounts' | 'logins'
    const [accounts, setAccounts] = useState(null); // null = lädt
    const [logins, setLogins] = useState(null);
    const [err, setErr] = useState('');
    const [busyEmail, setBusyEmail] = useState('');
    const [codes, setCodes] = useState({});         // E-Mail → gerade erzeugter Einmalcode
    const [accountsTick, setAccountsTick] = useState(0);   // „Aktualisieren" zählt hoch
    const [loginsTick, setLoginsTick] = useState(0);
    useEscape(onClose);

    const apply = useCallback((list) => {
        setAccounts(list);
        if (onPendingCount) onPendingCount(list.filter((a) => a.status === 'pending').length);
    }, [onPendingCount]);

    // Konten laden – beim Öffnen, auf „Aktualisieren" und sparsam im Hintergrund.
    useEffect(() => {
        let alive = true;
        const fetchAccounts = () => api.adminAccounts()
            .then((res) => { if (alive) { apply(res.accounts || []); setErr(''); } })
            .catch((ex) => { if (alive) setErr(ex.message); });
        fetchAccounts();
        const id = setInterval(() => { if (!document.hidden) fetchAccounts(); }, REFRESH_MS);
        return () => { alive = false; clearInterval(id); };
    }, [apply, accountsTick]);

    // Anmeldungen laden, sobald der Reiter offen ist.
    useEffect(() => {
        if (tab !== 'logins') return undefined;
        let alive = true;
        api.adminLogins()
            .then((rows) => { if (alive) { setLogins([...rows].reverse()); setErr(''); } })
            .catch((ex) => { if (alive) setErr(ex.message); });
        return () => { alive = false; };
    }, [tab, loginsTick]);

    const act = async (email, request) => {
        setBusyEmail(email); setErr('');
        try {
            const res = await request();
            if (res.accounts) apply(res.accounts);
            return res;
        } catch (ex) { setErr(ex.message); return null; }
        finally { setBusyEmail(''); }
    };
    const setStatus = (a, status) => act(a.email, () => api.adminSetStatus(a.email, status));
    const remove = (a) => {
        if (!window.confirm(`Konto von ${a.first} ${a.last} wirklich entfernen? Der gespeicherte Fortschritt geht dabei verloren.`)) return;
        act(a.email, () => api.adminSetStatus(a.email, 'removed'));
    };
    const reset = async (a) => {
        if (!window.confirm(`Passwort von ${a.first} ${a.last} zurücksetzen? Das bisherige Passwort gilt dann nicht mehr.`)) return;
        const res = await act(a.email, () => api.adminReset(a.email));
        if (res && res.code) setCodes((c) => ({ ...c, [a.email]: res.code }));
    };

    const pending = accounts ? accounts.filter((a) => a.status === 'pending').length : 0;

    return (
        <div className="ag-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="ag-dialog" role="dialog" aria-modal="true" aria-label="Verwaltung">
                <div className="ag-dialog-head">
                    <h2>Verwaltung</h2>
                    <div className="ag-tabs" role="tablist">
                        <button type="button" role="tab" aria-selected={tab === 'accounts'} className={tab === 'accounts' ? 'on' : ''} onClick={() => setTab('accounts')}>
                            Konten{pending > 0 && <span className="ag-badge">{pending}</span>}
                        </button>
                        <button type="button" role="tab" aria-selected={tab === 'logins'} className={tab === 'logins' ? 'on' : ''} onClick={() => setTab('logins')}>Anmeldungen</button>
                    </div>
                    <button type="button" className="ag-close" onClick={onClose} aria-label="Schließen">×</button>
                </div>

                <div className="ag-dialog-body">
                    {err && <div className="ag-msg" role="alert"><span className="err">{err}</span></div>}

                    {tab === 'accounts' && (
                        <>
                            <div className="ag-dialog-tools">
                                <span>{accounts ? `${accounts.length} ${accounts.length === 1 ? 'Konto' : 'Konten'}${pending ? ` · ${pending} ${pending === 1 ? 'wartet' : 'warten'} auf die Freischaltung` : ''}` : 'Lädt …'}</span>
                                <button type="button" className="ag-btn" onClick={() => setAccountsTick((t) => t + 1)}>Aktualisieren</button>
                            </div>
                            {accounts && accounts.length === 0 && <div className="ag-empty">Noch keine Registrierungen.</div>}
                            <div className="ag-rows">
                                {(accounts || []).map((a) => {
                                    const busy = busyEmail === a.email;
                                    return (
                                        <div key={a.email} className={`ag-row ${a.status}`}>
                                            <div className="ag-row-main">
                                                <div className="ag-row-name">
                                                    {a.first} {a.last}
                                                    <span className={`ag-chip ${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
                                                </div>
                                                <div className="ag-row-meta" title={a.email}>
                                                    {a.email} · registriert {when(a.t)}
                                                    {a.levels ? ` · ${a.levels} Level geschafft` : ''}
                                                    {a.mustChange ? ' · Einmalcode noch nicht eingelöst' : ''}
                                                </div>
                                            </div>
                                            <div className="ag-row-actions">
                                                {a.status !== 'approved' && <button type="button" className="ag-btn go" disabled={busy} onClick={() => setStatus(a, 'approved')}>Freischalten</button>}
                                                {a.status === 'pending' && <button type="button" className="ag-btn" disabled={busy} onClick={() => setStatus(a, 'declined')}>Ablehnen</button>}
                                                {a.status === 'approved' && <button type="button" className="ag-btn" disabled={busy} onClick={() => reset(a)}>Passwort zurücksetzen</button>}
                                                {a.status === 'approved' && <button type="button" className="ag-btn" disabled={busy} onClick={() => setStatus(a, 'declined')}>Sperren</button>}
                                                <button type="button" className="ag-btn danger" disabled={busy} onClick={() => remove(a)}>Entfernen</button>
                                            </div>
                                            {codes[a.email] && (
                                                <div className="ag-code">
                                                    Einmalcode:<b>{codes[a.email]}</b>
                                                    An {a.first} weitergeben – damit anmelden und sofort ein eigenes Passwort festlegen.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {tab === 'logins' && (
                        <>
                            <div className="ag-dialog-tools">
                                <span>{logins ? `${logins.length} Anmeldungen (neueste zuerst)` : 'Lädt …'}</span>
                                <button type="button" className="ag-btn" onClick={() => setLoginsTick((t) => t + 1)}>Aktualisieren</button>
                            </div>
                            {logins && logins.length === 0 && <div className="ag-empty">Noch keine Anmeldungen.</div>}
                            {logins && logins.length > 0 && (
                                <table className="ag-logins">
                                    <tbody>
                                        {logins.slice(0, 300).map((row, i) => (
                                            <tr key={`${row.t}-${i}`}>
                                                <td>{row.name}</td>
                                                <td>{when(row.t)}</td>
                                                <td>{buildDay(row.build)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
