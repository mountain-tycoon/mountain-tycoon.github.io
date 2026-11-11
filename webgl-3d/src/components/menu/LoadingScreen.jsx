// ============================================================
// LADEBILDSCHIRM zwischen Hauptmenü und Level
// Zeigt die Hero-Grafik des gewählten Levels, einen animierten
// Ski-Strichmännchen-Läufer, der Tricks springt, und einen
// Fortschrittsbalken mit wechselnden Ladetexten.
// ============================================================
import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

const BASE = import.meta.env.BASE_URL || '/';

/**
 * Hintergrund je Level: eigens gestaltete Ladebilder unter public/loading/.
 * Dateiname = Level-ID. Alle zehn Kampagnenlevel haben ein eigenes Bild;
 * für alles Weitere greift der Fallback auf ein Menü-Foto zurück.
 */
const LOADING_LEVELS = new Set([
    'mittelgebirge', 'alpen', 'schweiz', 'frankreich', 'italien',
    'norwegen', 'rockies', 'kanada', 'anden', 'japan'
]);
const FALLBACK_BG = {};

const bgFor = (level) => {
    const id = level?.id;
    if (id && LOADING_LEVELS.has(id)) return `${BASE}loading/${id}.png`;
    return `${BASE}bg/${FALLBACK_BG[id] || 'bg1'}.jpg`;
};

/** Ladetexte — bewusst mit Augenzwinkern, wechseln im Sekundentakt. */
const TIPS = [
    'Pistenraupen werden angeworfen …',
    'Schneekanonen richten sich aus …',
    'Liftbügel werden entwirrt …',
    'Der Hüttenwirt zapft schon mal an …',
    'Gäste schnallen die Ski an …',
    'Die Bergrettung poliert den Heli …',
    'Neuschnee wird ausgerollt …',
    'Der Kassierer sucht das Wechselgeld …'
];

export default function LoadingScreen({ level, onDone, duration = 10000 }) {
    const [pct, setPct] = useState(0);
    const [tip, setTip] = useState(0);

    useEffect(() => {
        const t0 = performance.now();
        let raf;
        const step = () => {
            const f = Math.min(1, (performance.now() - t0) / duration);
            // leicht ungleichmäßig, damit es "echt" wirkt
            setPct(Math.round((f < 0.85 ? f * 0.92 : 0.78 + (f - 0.85) * 1.47) * 100));
            if (f < 1) raf = requestAnimationFrame(step);
            else onDone && onDone();
        };
        raf = requestAnimationFrame(step);
        const ti = setInterval(() => setTip(i => (i + 1) % TIPS.length), 1800);
        return () => { cancelAnimationFrame(raf); clearInterval(ti); };
    }, [duration, onDone]);

    const hero = bgFor(level);

    return (
        <div className="ls-root">
            {hero && <div className="ls-bg" style={{ backgroundImage: `url(${hero})` }} />}
            <div className="ls-veil" />
            <div className="ls-content">
                <div className="ls-flag">{level?.flag || '⛷️'}</div>
                <h1 className="ls-title">{level?.name || 'Skigebiet'}</h1>
                <div className="ls-sub">{level?.country || level?.region || ''}</div>
                <div className="ls-barwrap">
                    <div className="ls-bar" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="ls-tip">{TIPS[tip]}</div>
            </div>
        </div>
    );
}
