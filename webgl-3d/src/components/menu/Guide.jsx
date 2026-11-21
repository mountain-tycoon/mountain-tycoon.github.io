import React, { useState } from 'react';

// ============================================================
// ANLEITUNG – erscheint beim allerersten Besuch vor der Garderobe
// und bleibt danach im Hauptmenü unter „Anleitung" erreichbar.
// Drei Blätter: Ablauf des Spiels, Bedienung, Installation als App
// (iPhone/iPad und Android). Gemerkt wird je Gerät und Konto.
// ============================================================

/** Auf welchem Gerät läuft die Seite – und schon als App vom Startbildschirm? */
function device() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    let app = false;
    try {
        app = !!navigator.standalone || ['standalone', 'fullscreen'].some(m => window.matchMedia(`(display-mode: ${m})`).matches);
    } catch { app = false; }
    return { ios, android, app };
}

const FLOW = [
    ['Fahrer einkleiden', 'Such dir Outfit und Ski aus – mit dieser Figur fährst du später selbst durch dein Gebiet.'],
    ['Level wählen', 'Die Kampagne beginnt im Schwarzwald. Jedes Level hat Aufgaben; das nächste öffnet sich, sobald sie erfüllt sind.'],
    ['Kasse, Lift, Piste', 'Dein Gebiet ist anfangs leer – nur Ort und Zufahrt stehen. Bau eine Kasse beim Ort, einen Lift den Hang hinauf und eine Piste zurück ins Tal.'],
    ['Gäste und Geld', 'Gäste kaufen an der Kasse den Skipass und fahren los. Mit den Einnahmen baust du weiter: mehr Lifte und Pisten, Hütten, Beschneiung, Pistenraupen.'],
    ['Aufgaben erfüllen', 'Kontostand und Aufgaben hast du im Spiel immer im Blick. Sind alle erledigt, ist das Level geschafft. Der Stand wird von selbst gesichert.'],
    ['Selbst fahren', 'Tippe auf „Fahren" und setz deine Figur irgendwo im Gebiet ab: Pisten, Lifte, Funpark und Halfpipe gehören dir.']
];

const CONTROLS = [
    ['Finger', [
        ['Ein Finger', 'Karte verschieben'],
        ['Zwei Finger', 'zoomen und drehen, gemeinsam hoch/runter neigen'],
        ['Bauen', 'Stelle antippen, dann unten bestätigen']
    ]],
    ['Maus', [
        ['Linke Taste', 'drehen'],
        ['Rechte Taste', 'verschieben (oder Shift halten)'],
        ['Mausrad', 'zoomen'],
        ['Bauen', 'Klick baut sofort']
    ]],
    ['Selbst fahren', [
        ['Lenken', 'die zwei Tasten links/rechts – am Rechner A und D'],
        ['Bremsen', 'beide Tasten zugleich – am Rechner S'],
        ['Schuss / gehen', 'Bild gedrückt halten – am Rechner W'],
        ['In der Luft', 'Lenken dreht, vorwärts und bremsen sind die Salti'],
        ['Loipe', 'gelenkt wird von selbst – du gibst nur die Kraft vor: viel Kraft treibt den Puls hoch, zu lange macht müde'],
        ['Gleitschirm', 'am Startplatz abheben und ins Tal gleiten: lenken, schneller, bremsen'],
        ['Schießstand', 'ziehen = zielen, „Schuss" löst aus – hoher Puls lässt das Visier wackeln'],
        ['Eisbahn', 'durch den Eingang aufs Eis: laufen, mit „bremsen" springen – am Puck wird daraus der Schuss aufs Tor']
    ]]
];

const INSTALL = {
    ios: ['iPhone und iPad', [
        'Diese Seite in Safari öffnen.',
        'Unten (am iPad oben) auf „Teilen" tippen – das Viereck mit dem Pfeil nach oben.',
        'In der Liste „Zum Home-Bildschirm" wählen und mit „Hinzufügen" bestätigen.',
        'Mountain Tycoon vom Home-Bildschirm starten – es läuft dann im Vollbild, ohne Adressleiste.'
    ]],
    android: ['Android', [
        'Diese Seite in Chrome öffnen.',
        'Oben rechts auf das Menü mit den drei Punkten tippen.',
        '„App installieren" wählen (je nach Gerät „Zum Startbildschirm hinzufügen") und bestätigen.',
        'Mountain Tycoon über das neue Symbol starten – es läuft dann im Vollbild.'
    ]]
};

const PAGES = ['So läuft das Spiel', 'Bedienung', 'Als App aufs Handy'];

/**
 * @param {boolean} intro  erster Besuch: Blätter der Reihe nach, am Ende „weiter"
 * @param {Function} onDone  wird nach dem letzten Blatt aufgerufen (nur bei intro)
 */
const Guide = ({ intro = false, onDone = null }) => {
    const [page, setPage] = useState(0);
    const [dev] = useState(device);
    const last = page === PAGES.length - 1;
    // Das eigene Gerät steht vorn
    const order = dev.android ? ['android', 'ios'] : ['ios', 'android'];

    return (
        <div className="mm-guide-wrap">
            <div className="mm-guide">
                <div className="mm-guide-head">
                    <span>{intro ? 'Willkommen am Berg' : 'Anleitung'}</span>
                    <b>{PAGES[page]}</b>
                </div>
                <div className="mm-guide-tabs">
                    {PAGES.map((p, i) => (
                        <button key={p} className={`mm-guide-tab ${i === page ? 'on' : ''}`} onClick={() => setPage(i)}>
                            <i>{i + 1}</i>{p}
                        </button>
                    ))}
                </div>

                {page === 0 && (
                    <ol className="mm-guide-flow">
                        {FLOW.map(([title, text], i) => (
                            <li key={title}>
                                <i>{i + 1}</i>
                                <div><b>{title}</b><span>{text}</span></div>
                            </li>
                        ))}
                    </ol>
                )}

                {page === 1 && (
                    <div className="mm-guide-cols">
                        {CONTROLS.map(([title, rows]) => (
                            <section key={title} className="mm-guide-card">
                                <h3>{title}</h3>
                                {rows.map(([k, v]) => (
                                    <p key={k}><b>{k}</b><span>{v}</span></p>
                                ))}
                            </section>
                        ))}
                    </div>
                )}

                {page === 2 && (
                    <>
                        <p className="mm-guide-lead">
                            {dev.app
                                ? 'Du spielst bereits in der App vom Startbildschirm – hier ist nichts mehr zu tun.'
                                : 'Mountain Tycoon braucht keinen App-Store: Leg die Seite auf den Startbildschirm, dann startet sie wie eine App im Vollbild.'}
                        </p>
                        <div className="mm-guide-cols two">
                            {order.map(k => {
                                const [title, steps] = INSTALL[k];
                                const mine = (k === 'ios' && dev.ios) || (k === 'android' && dev.android);
                                return (
                                    <section key={k} className={`mm-guide-card ${mine ? 'mine' : ''}`}>
                                        <h3>{title}{mine && <em>dein Gerät</em>}</h3>
                                        <ol>{steps.map(s => <li key={s}>{s}</li>)}</ol>
                                    </section>
                                );
                            })}
                        </div>
                        <p className="mm-guide-note">
                            Mit Konto wandern die Spielstände mit – am Handy weiterspielen, was am Rechner begonnen wurde.
                            Quer gehalten ist am meisten zu sehen.
                        </p>
                    </>
                )}

                <div className="mm-guide-foot">
                    {page > 0 && <button className="mm-go alt" onClick={() => setPage(page - 1)}>Zurück</button>}
                    {!last && <button className="mm-go" onClick={() => setPage(page + 1)}>Weiter</button>}
                    {last && intro && <button className="mm-go" onClick={() => onDone && onDone()}>Verstanden – weiter</button>}
                    {intro && !last && <button className="mm-guide-skip" onClick={() => onDone && onDone()}>Überspringen</button>}
                </div>
            </div>
        </div>
    );
};

export default Guide;
