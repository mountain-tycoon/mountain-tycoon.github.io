import React, { useEffect, useRef, useState } from 'react';
import { buildLevelWorld } from '../engine/utils';
import { createScene3D } from './Scene3D.js';
import { evaluateObjective, objectiveLabel, formatObjectiveValue, markLevelCompleted, CAMPAIGN_LEVELS, MASSIFS } from '../constants/campaign';
import { canSave, createAutosave } from '../savegames';

// ===== BILDSCHIRM UND EINGABEART =====
// Steuert das kompakte Layout fürs Handy: Werkzeuge unten statt links, Bedienfelder
// als Karten von unten, alles dauerhaft sichtbar (ohne Maus gibt es kein „Drüberfahren").
const readViewport = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const coarse = !!window.matchMedia?.('(hover: none), (pointer: coarse)').matches
        || ((navigator.maxTouchPoints || 0) > 0 && Math.min(w, h) < 520);
    return { w, h, coarse, compact: w < 760 || h < 520, portrait: h >= w };
};
const useViewport = () => {
    const [vp, setVp] = useState(readViewport);
    useEffect(() => {
        const update = () => setVp(readViewport());
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update); };
    }, []);
    return vp;
};
/** Bedienfelder dauerhaft voll sichtbar? (Finger-Geräte und kleine Bildschirme) */
const hudAlwaysOn = () => { const v = readViewport(); return v.coarse || v.compact; };
// Abstand zu Notch und Home-Balken (wirkt mit viewport-fit=cover)
const SAFE_T = 'env(safe-area-inset-top, 0px)', SAFE_B = 'env(safe-area-inset-bottom, 0px)';
const SAFE_L = 'env(safe-area-inset-left, 0px)', SAFE_R = 'env(safe-area-inset-right, 0px)';
const BAR_H = 62;      // Höhe der unteren Werkzeugleiste im kompakten Layout

// ===== GLAS-OPTIK =====
// Halbtransparente Milchglasfläche mit weichem Rand und Innenlicht — wird
// von allen HUD-Elementen geteilt, damit die Oberfläche einheitlich wirkt.
const glass = {
    background: 'rgba(16,20,27,0.55)',
    border: '1px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(18px) saturate(1.25)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.25)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.10)'
};
// Warnknopf im HUD — führt die Kamera zum Problem
const warnBtn = (col) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', borderRadius: 10, cursor: 'pointer',
    background: col + '1f', border: '1px solid ' + col + '66',
    color: col, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap'
});


// Bau-Kategorien mit ihren Werkzeugen.
// `group` fasst Größenvarianten zusammen (Untermenü statt endloser Liste),
// `variant` ist das kurze Label innerhalb der Gruppe.
const CATEGORIES = [
    {
        key: 'lifte', label: 'Lifte', icon: '🚡',
        items: [
            { key: 'carpet', tool: 'lift', kind: 'carpet',  icon: '🟨', name: 'Magic Carpet', cost: 'ab €700' },
            { key: 'platter',tool: 'lift', kind: 'platter', icon: '🍽️', name: 'Tellerlift',   cost: 'ab €1.5k' },
            { key: 'tbar',  tool: 'lift', kind: 'tbar',    icon: '🎣', name: 'Schlepplift', cost: 'ab €4k' },
            { key: 'chair2',tool: 'lift', kind: 'chair2',  icon: '💺', name: 'Sessellift', group: 'Sessellift', variant: '2er', cost: 'ab €7.7k' },
            { key: 'chair', tool: 'lift', kind: 'chair',   icon: '🪑', name: 'Sessellift', group: 'Sessellift', variant: '4er', cost: 'ab €8k' },
            { key: 'chair6',tool: 'lift', kind: 'chair6',  icon: '🛋️', name: 'Sessellift', group: 'Sessellift', variant: '6er Haube', cost: 'ab €25k' },
            // Umlaufbahnen, aufsteigend nach Größe und Kapazität
            { key: 'lift4', tool: 'lift', kind: 'gondola4', icon: '🚡', name: 'Gondelbahn', group: 'Kabinenbahn', variant: '4er', cost: 'ab €19k' },
            { key: 'lift',  tool: 'lift', kind: 'gondola', icon: '🚡', name: 'Gondelbahn', group: 'Kabinenbahn', variant: '6er', cost: 'ab €15k' },
            { key: 'lift8',  tool: 'lift', kind: 'gondola8', icon: '🚠', name: 'Kabinenbahn', group: 'Kabinenbahn', variant: '8er', cost: 'ab €34k' },
            { key: 'liftmega', tool: 'lift', kind: 'mega', icon: '🚡', name: 'Einseilumlaufbahn', group: 'Kabinenbahn', variant: '10er XL', cost: 'ab €96k' },
            // Pendelbahnen zuletzt, ebenfalls klein -> groß
            { key: 'tram',  tool: 'lift', kind: 'tram',    icon: '🚠', name: 'Pendelbahn', group: 'Pendelbahn', variant: '12er', cost: 'ab €40k' },
            { key: 'lifttramxl', tool: 'lift', kind: 'tramxl', icon: '🚟', name: 'Pendelbahn', group: 'Pendelbahn', variant: '20er Jumbo', cost: 'ab €128k' }
        ]
    },
    {
        key: 'pisten', label: 'Pisten', icon: '🎿',
        items: [
            { key: 'piste_n', tool: 'piste', lit: false, width: 'narrow', icon: '🎿', name: 'Piste', group: 'Piste', variant: 'schmal', cost: 'ab €1.5k' },
            { key: 'piste',   tool: 'piste', lit: false, width: 'medium', icon: '🎿', name: 'Piste', group: 'Piste', variant: 'mittel', cost: 'ab €2k' },
            { key: 'piste_w', tool: 'piste', lit: false, width: 'wide',   icon: '🎿', name: 'Piste', group: 'Piste', variant: 'breit',  cost: 'ab €3k' },
            { key: 'piste_xw', tool: 'piste', lit: false, width: 'xwide', icon: '🎿', name: 'Piste', group: 'Piste', variant: 'extrabreit', cost: 'ab €4k' },
            { key: 'piste_lit', tool: 'piste', lit: true, width: 'medium', icon: '💡', name: 'Piste + Flutlicht', cost: 'ab €3k' }
        ]
    },
    {
        key: 'gastro', label: 'Gastro', icon: '🍽️',
        items: [
            { key: 'imbiss',     tool: 'build', icon: '🌭', name: 'Imbiss',     cost: 26000 },
            { key: 'huette',     tool: 'build', icon: '🛖', name: 'Berghütte',  cost: 39000 },
            { key: 'restaurant', tool: 'build', icon: '🍽️', name: 'Restaurant', group: 'Restaurant', variant: 'normal',   cost: 60000 },
            { key: 'bergrest',   tool: 'build', icon: '🍲', name: 'Restaurant', group: 'Restaurant', variant: 'Berg',     cost: 130000 },
            { key: 'panorama',   tool: 'build', icon: '🌄', name: 'Restaurant', group: 'Restaurant', variant: 'Panorama', cost: 260000 },
            { key: 'sterne',     tool: 'build', icon: '⭐', name: 'Restaurant', group: 'Restaurant', variant: 'Sterne',   cost: 520000 },
            { key: 'apres',      tool: 'build', icon: '🍻', name: 'Après-Ski-Bar', cost: 65000 },
            { key: 'partyzelt',  tool: 'build', icon: '⛺', name: 'Partyzelt',  cost: 16200 },
            { key: 'disco',      tool: 'build', icon: '🪩', name: 'Diskothek',  cost: 325000 }
        ]
    },
    {
        key: 'schlafen', label: 'Übernachten', short: 'Betten', icon: '🏨',
        items: [
            // Sechs Stufen, nach Bettenzahl sortiert (25 -> 250)
            { key: 'hotel_pension',tool: 'build', icon: '🏠', name: 'Hotel', group: 'Hotel', variant: 'Pension · 25 B', cost: 42000 },
            { key: 'hotel_budget', tool: 'build', icon: '🏨', name: 'Hotel', group: 'Hotel', variant: 'Budget · 60 B',  cost: 97500 },
            { key: 'hotel',        tool: 'build', icon: '🏨', name: 'Hotel', group: 'Hotel', variant: 'Alpen · 90 B',   cost: 180000 },
            { key: 'hotel_mid',    tool: 'build', icon: '🏨', name: 'Hotel', group: 'Hotel', variant: '4 Sterne · 130 B', cost: 227500 },
            { key: 'hotel_resort', tool: 'build', icon: '🏨', name: 'Hotel', group: 'Hotel', variant: 'Resort · 180 B',  cost: 380000 },
            { key: 'hotel_lux',    tool: 'build', icon: '🏩', name: 'Hotel', group: 'Hotel', variant: 'Grand · 250 B',   cost: 520000 },
            { key: 'chalet_s',     tool: 'build', icon: '🏡', name: 'Chalet', group: 'Chalet', variant: 'klein', cost: 130000 },
            { key: 'chalet_l',     tool: 'build', icon: '🏡', name: 'Chalet', group: 'Chalet', variant: 'groß',  cost: 325000 },
            { key: 'chalet_lux',   tool: 'build', icon: '🏰', name: 'Chalet', group: 'Chalet', variant: 'Luxus', cost: 975000 }
        ]
    },
    {
        key: 'wellness', label: 'Wellness', short: 'Spa', icon: '🧖',
        items: [
            { key: 'sauna',   tool: 'build', icon: '🧖', name: 'Sauna-Anlage', cost: 195000 },
            { key: 'eisbahn', tool: 'build', icon: '⛸️', name: 'Eislaufbahn',  cost: 975000 },
            { key: 'therme',  tool: 'build', icon: '♨️', name: 'Große Therme', cost: 2600000 }
        ]
    },
    {
        key: 'infra', label: 'Infrastruktur', short: 'Infra', icon: '🎫',
        items: [
            { key: 'road',       tool: 'road',  icon: '🛣️', name: 'Straße',      cost: 'ab €400' },
            { key: 'ticket',     tool: 'build', icon: '🎫', name: 'Kasse',       cost: 29200 },
            { key: 'parking',    tool: 'build', icon: '🅿️', name: 'Parken', group: 'Parken', variant: 'Platz',    cost: 12000 },
            { key: 'parkgarage', tool: 'build', icon: '🏢', name: 'Parken', group: 'Parken', variant: 'Parkhaus', cost: 95000 },
            { key: 'busstop',    tool: 'build', icon: '🚌', name: 'Bushaltestelle', cost: 15000 },
            { key: 'toilet',     tool: 'build', icon: '🚻', name: 'Toiletten',    cost: 18000 },
            { key: 'garage',     tool: 'build', icon: '🚜', name: 'Garage PB 300', group: 'Garage PB 300', variant: '1×', cost: 32500 },
            { key: 'garage2',    tool: 'build', icon: '🚜', name: 'Garage PB 300', group: 'Garage PB 300', variant: '2×', cost: 58000 },
            { key: 'garage4',    tool: 'build', icon: '🚜', name: 'Garage PB 300', group: 'Garage PB 300', variant: '4×', cost: 104000 },
            { key: 'garage5_1',  tool: 'build', icon: '🚛', name: 'Garage PB 500', group: 'Garage PB 500', variant: '1×', cost: 52000 },
            { key: 'garage5_2',  tool: 'build', icon: '🚛', name: 'Garage PB 500', group: 'Garage PB 500', variant: '2×', cost: 92000 },
            { key: 'garage5_4',  tool: 'build', icon: '🚛', name: 'Garage PB 500', group: 'Garage PB 500', variant: '4×', cost: 168000 },
            { key: 'workshop',   tool: 'build', icon: '🔧', name: 'Werkstatt',   cost: 80000 },
            { key: 'medical',    tool: 'build', icon: '⛑️', name: 'Medizin', group: 'Medizin', variant: 'Station', cost: 65000 },
            { key: 'hospital',   tool: 'build', icon: '🏥', name: 'Medizin', group: 'Medizin', variant: 'Klinik',  cost: 325000 },
            { key: 'cannon_s',   tool: 'build', icon: '❄️', name: 'Beschneiung', group: 'Beschneiung', variant: 'klein',  cost: 9800 },
            { key: 'snowcannon', tool: 'build', icon: '❄️', name: 'Beschneiung', group: 'Beschneiung', variant: 'mittel', cost: 29200 },
            { key: 'cannon_l',   tool: 'build', icon: '🗼', name: 'Beschneiung', group: 'Beschneiung', variant: 'Lanze',  cost: 55200 },
            { key: 'reservoir',   tool: 'build', icon: '💧', name: 'Wasser', group: 'Wasser', variant: 'Speicher', cost: 97500 },
            { key: 'reservoir_l', tool: 'build', icon: '🌊', name: 'Wasser', group: 'Wasser', variant: 'Stausee',  cost: 420000 }
        ]
    },
    {
        key: 'extra', label: 'Extras', icon: '🏂',
        items: [
            { key: 'funpark_s', tool: 'build', icon: '🏂', name: 'Funpark', group: 'Funpark', variant: 'klein',  cost: 90000 },
            { key: 'funpark',   tool: 'build', icon: '🏂', name: 'Funpark', group: 'Funpark', variant: 'mittel', cost: 220000 },
            { key: 'funpark_l', tool: 'build', icon: '🏂', name: 'Funpark', group: 'Funpark', variant: 'groß',   cost: 420000 },
            { key: 'kicker',     tool: 'build', icon: '⛷️', name: 'Kicker',      cost: 18500 },
            { key: 'halfpipe',   tool: 'build', icon: '🏂', name: 'Halfpipe',    cost: 186000 },
            { key: 'racecourse', tool: 'build', icon: '🏁', name: 'Rennstrecke', cost: 340000 },
            { key: 'skischool', tool: 'build', icon: '🎿', name: 'Skischule',  cost: 45000 },
            { key: 'skirental', tool: 'build', icon: '⛷️', name: 'Skiverleih', cost: 38000 },
            { key: 'shop',      tool: 'build', icon: '🛍️', name: 'Sport-Shop', cost: 52000 },
            { key: 'souvenir',  tool: 'build', icon: '🎁', name: 'Souvenir-Shop', cost: 39000 }
        ]
    }
];

/**
 * Menü-Icon: nutzt automatisch ein PNG aus `public/icons/<key>.png`,
 * sobald die Datei existiert — sonst bleibt das Emoji stehen.
 * Einfach die von ChatGPT erzeugten Icons unter diesem Namen ablegen.
 */
const BuildIcon = ({ itemKey, emoji, size = 26 }) => {
    const [ok, setOk] = useState(true);
    if (!ok) return <span style={{ fontSize: size }}>{emoji}</span>;
    return (
        <>
            <img
                src={`${import.meta.env.BASE_URL || '/'}icons/${itemKey}.png`}
                alt="" width={size * 1.5} height={size * 1.5}
                onError={() => setOk(false)}
                style={{ display: 'block', objectFit: 'contain', imageRendering: 'auto' }}
            />
        </>
    );
};

/**
 * Beschneiungs-Zentrale oben in der Mitte: zeigt auf einen Blick, wieviel
 * Wasser die Stauseen liefern und wieviel die Kanonen davon brauchen —
 * plus das aktuelle Wetter, das über die Schneegrenze entscheidet.
 */
/**
 * Betriebsanzeige oben in der Mitte — angelehnt an die Anzeigetafeln an
 * Talstationen: schmales Glaspanel mit Kennzahlen, das sich auf einen
 * Streifen einklappen lässt. Warnungen führen per Klick zur Kamera.
 */
/**
 * Minimalistische Strich-Symbole (24er-Raster, currentColor). Keine Emojis:
 * die wirken je nach System unterschiedlich und bunt; diese hier bleiben
 * einfarbig und passen sich der Textfarbe an.
 */
const ICON_PATHS = {
    sun:   'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
    cloud: 'M7 18h10a4 4 0 0 0 .5-8a5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z',
    snow:  'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4',
    wind:  'M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 13h14a2.5 2.5 0 1 1-2.5 2.5M3 18h7a2 2 0 1 1-2 2',
    fire:  'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-3s.5 2 2 2c0-3-1-5 2-9z',
    smile: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9 10h.01M15 10h.01M9 14.5c1.5 1.5 4.5 1.5 6 0',
    meh:   'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9 10h.01M15 10h.01M9 15h6',
    frown: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9 10h.01M15 10h.01M9 16c1.5-1.5 4.5-1.5 6 0',
    star:  'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z',
    drop:  'M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z',
    alert: 'M12 4L2.5 20h19zM12 10v4M12 17h.01',
    users: 'M9 12a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 5.5a3.5 3.5 0 0 1 0 6.6M17 14.5c2.5.4 4 2.3 4 5.5',
    trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    coin:  'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M14.5 9.5c-.4-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2 0 2.5 5 1.2 5 4 0 1.2-1 2-2.5 2-1.2 0-2.2-.6-2.6-1.6M12 6.5v1.5M12 16v1.5',
    target:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
    flag:  'M5 21V4M5 4h11l-2 3.5 2 3.5H5',
    mega:  'M3 10v4h3l7 4V6l-7 4zM17 9a4 4 0 0 1 0 6',
    back:  'M15 5l-7 7 7 7',
    // Bedienknöpfe (Handy): als Strichsymbole, weil Pfeil-Schriftzeichen je nach Gerät fehlen oder bunt ausfallen
    check: 'M5 12.5l4.5 4.5L19 7.5',
    close: 'M6 6l12 12M18 6L6 18',
    turnR: 'M21.5 4.5v6h-6M19.4 15a8.5 8.5 0 1 1-2-8.8l4.1 4.3',
    undo:  'M9 14L4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4',
    bed:   'M3 18V8M3 14h18v4M3 14V11h7v3M21 14v-2a2 2 0 0 0-2-2h-9'
};
const Ico = ({ name, size = 13, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
         style={{ flex: 'none', display: 'block', ...style }}>
        <path d={ICON_PATHS[name] || ''} />
    </svg>
);
const WEATHER_ICON = { heavy: 'snow', snow: 'snow', light: 'cloud', clear: 'sun', mild: 'sun', warm: 'fire', wind: 'wind' };

/**
 * Hover-Einblendung: Bedienfelder liegen im Ruhezustand nur schemenhaft über
 * der Szene und werden voll sichtbar, sobald die Maus darüber ist (oder das
 * Feld gerade in Benutzung ist, `force`).
 */
const useReveal = (force = false) => {
    const [hov, setHov] = useState(false);
    // Ohne Maus gibt es kein Drüberfahren: dort bleiben die Felder voll sichtbar.
    const on = hov || force || hudAlwaysOn();
    return {
        on,
        props: { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false) },
        style: { opacity: on ? 1 : 0.28, transition: 'opacity .22s ease' }
    };
};

/** Ein Wert in der Kopfleiste: kleines Kürzel, Zahl, Tooltip mit Bedeutung. */
const Stat = ({ icon, value, col, tip, dot, onClick, onTip }) => (
    <div title={tip} onClick={onClick || (onTip && tip ? () => onTip(tip) : undefined)}
         style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 'none', cursor: (onClick || onTip) ? 'pointer' : 'default', color: col }}>
        <Ico name={icon} size={13} style={{ opacity: 0.75 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{value}</span>
        {dot && <span style={{ width: 5, height: 5, borderRadius: 3, background: dot }} />}
    </div>
);

const StatusBoard = ({ stats, onFocus, money, level, fmt, compact }) => {
    // Standardmäßig eingeklappt: die Kopfzeile allein reicht für den Überblick,
    // Details holt man sich bei Bedarf dazu.
    const [open, setOpen] = useState(false);
    const rv = useReveal(open);
    // Handy: die Bedeutung eines Werts erscheint beim Antippen kurz unter der Leiste
    // (am Rechner zeigt sie der Tooltip beim Drüberfahren).
    const [tip, setTip] = useState('');
    const tipTimer = useRef(0);
    useEffect(() => () => clearTimeout(tipTimer.current), []);
    const showTip = compact ? (t) => {
        setTip(t);
        clearTimeout(tipTimer.current);
        tipTimer.current = setTimeout(() => setTip(''), 4000);
    } : null;
    const sup = stats.waterSupply || 0;
    const need = stats.waterNeed || 0;
    const short = need > 0 && sup < need;
    const fillPct = need === 0 ? (sup > 0 ? 100 : 0) : Math.min(100, (sup / need) * 100);
    const waterCol = short ? '#f87171' : sup > 0 ? '#7dd3fc' : '#6b7280';
    const alerts = (stats.stranded || 0) + (stats.injuredCount || 0) + (stats.grumpy || 0) + (stats.parkingFull || 0) + (stats.hotelFull > 0 ? 1 : 0);
    const bedsFull = stats.hotelBeds > 0 && stats.bedsUsed >= stats.hotelBeds - 0.5;
    // Gesamtlaune der Gäste: Farbe und Gesicht folgen dem Wert.
    const mood = stats.mood != null ? stats.mood : 100;
    // Attraktivität des Gebiets (0..100): steuert den Zustrom der Fahrzeuge
    const attr = stats.attractScore != null ? stats.attractScore : 0;
    const attrCol = attr >= 70 ? '#4ade80' : attr >= 45 ? '#a3e635' : attr >= 25 ? '#fbbf24' : '#f87171';
    const moodCol = mood >= 75 ? '#4ade80' : mood >= 55 ? '#a3e635' : mood >= 35 ? '#fbbf24' : '#f87171';
    const moodIco = mood >= 55 ? 'smile' : mood >= 35 ? 'meh' : 'frown';

    return (
        <div {...rv.props} style={compact ? {
            // Handy: schmaler Streifen zwischen Menü- und Aufgabenknopf, seitlich wischbar
            position: 'fixed', top: `calc(8px + ${SAFE_T})`, left: `calc(54px + ${SAFE_L})`, right: `calc(58px + ${SAFE_R})`, zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6, ...rv.style
        } : {
            position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...rv.style
        }}>
            {/* Kopfleiste: immer sichtbar, sehr schmal — kleine Strichsymbole mit
                Zahl; die Bedeutung erscheint beim Drüberfahren. */}
            <div className="mt-noscrollbar" style={{ ...glass, display: 'flex', alignItems: 'center', gap: compact ? 13 : 15,
                          padding: compact ? '9px 8px 9px 12px' : '7px 8px 7px 14px', borderRadius: 14, whiteSpace: 'nowrap',
                          ...(compact ? { overflowX: 'auto', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' } : null) }}>
                {!compact && <Stat onTip={showTip} icon="flag" value={level?.name || ''} col="#e8eaed" tip="Aktuelles Level" />}
                <Stat onTip={showTip} icon="coin" value={fmt(money)} col="#4ade80" tip="Kontostand" />
                <Stat onTip={showTip} icon="users" value={stats.currentGuests} col="#c3c8cf" tip="Gäste im Gebiet" />
                <Stat onTip={showTip} icon="trend" value={fmt(stats.totalRevenue)} col="#fbbf24" tip="Gesamtumsatz" />
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
                <Stat onTip={showTip} icon={WEATHER_ICON[stats.weatherKey] || 'cloud'} value={stats.weatherName || ''} col="#e8eaed"
                      tip={'Aktuelles Wetter' + (stats.forecastName ? ' · danach ' + stats.forecastName + ' in ' + (stats.forecastIn ?? 0) + 's' : '')} />
                <Stat onTip={showTip} icon={moodIco} value={mood + '%'} col={moodCol} tip="Durchschnittliche Laune aller Gäste" />
                <Stat onTip={showTip} icon="star" value={attr} col={attrCol}
                      tip={'Attraktivität des Skigebiets (0–100) — bestimmt, wie viele Gäste anreisen'
                           + ' · Ruf ' + (stats.reput ?? 0) + '% (wächst, wenn der Score lange über 60 bleibt)'
                           + (stats.adId ? ' · Werbung läuft: +' + stats.adBoostPct + '%' : '')}
                      dot={stats.adId ? '#7dd3fc' : null} />
                {stats.hotelBeds > 0 && <Stat onTip={showTip} icon="bed" value={stats.bedsUsed + '/' + stats.hotelBeds}
                      col={bedsFull ? '#f87171' : '#c3c8cf'}
                      tip={'Belegte Betten / Betten gesamt' + (bedsFull ? ' — alle Häuser voll, Gäste reisen ab' : '')} />}
                <Stat onTip={showTip} icon="drop" value={sup + '/' + need} col={waterCol}
                      tip="Beschneiung: Wasservorrat / Bedarf der Schneekanonen" />
                {alerts > 0 && <Stat onTip={showTip} icon="alert" value={alerts} col="#f87171"
                                     tip="Offene Probleme — anklicken für Details" onClick={() => setOpen(true)} />}
                <button onClick={() => setOpen(o => !o)} title={open ? 'Einklappen' : 'Ausklappen'}
                        style={{ marginLeft: 2, flex: 'none', width: compact ? 30 : 22, height: compact ? 30 : 22, borderRadius: 7, cursor: 'pointer',
                                 border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                                 color: '#9aa0a8', fontSize: compact ? 12 : 9, lineHeight: 1, display: 'flex',
                                 alignItems: 'center', justifyContent: 'center' }}>
                    {open ? '▴' : '▾'}
                </button>
            </div>
            {tip && !open && (
                <div style={{ ...glass, alignSelf: 'center', maxWidth: '100%', boxSizing: 'border-box', padding: '7px 11px',
                              borderRadius: 11, fontSize: 11.5, lineHeight: 1.35, color: '#e8eaed' }}>{tip}</div>
            )}

            {/* Ausgeklappter Teil: Details und Warnungen */}
            {open && (
                <div style={{ ...glass, padding: '11px 15px', borderRadius: 16,
                              display: 'flex', alignItems: 'center', gap: compact ? 10 : 14,
                              ...(compact ? { flexWrap: 'wrap', rowGap: 10 } : { whiteSpace: 'nowrap' }) }}>
                    {/* Beschneiung */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                            <strong style={{ color: waterCol, fontSize: 13 }}>{sup}</strong>
                            <span style={{ color: '#9aa0a8', fontSize: 10 }}>Vorrat</span>
                            <span style={{ color: '#4b5563' }}>/</span>
                            <strong style={{ fontSize: 13, color: '#e8eaed' }}>{need}</strong>
                            <span style={{ color: '#9aa0a8', fontSize: 10 }}>Bedarf</span>
                        </div>
                        <div style={{ width: 150, height: 4, borderRadius: 2,
                                      background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                            <div style={{ width: `${fillPct}%`, height: '100%', background: waterCol,
                                          transition: 'width .4s ease' }} />
                        </div>
                    </div>
                    <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.12)' }} />
                    {/* Wettervorhersage */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: 0.8 }} title="Wettervorhersage">
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                            <span style={{ fontSize: 11.5, color: '#e8eaed' }}>{stats.forecastName || ''}</span>
                            <span style={{ color: '#9aa0a8', fontSize: 9.5 }}>in {stats.forecastIn ?? 0}s</span>
                        </div>
                    </div>
                    {/* Warnungen — Klick führt die Kamera hin */}
                    {(stats.stranded > 0 || stats.injuredCount > 0 || stats.grumpy > 0 || stats.parkingFull > 0 || stats.hotelFull > 0) && (
                        <>
                            <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.12)' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                {stats.stranded > 0 && (
                                    <button onClick={() => onFocus && onFocus('stranded')}
                                            title="Anklicken: Kamera zur größten Gruppe"
                                            style={warnBtn('#fbbf24')}>Gestrandet {stats.stranded}</button>
                                )}
                                {stats.injuredCount > 0 && (
                                    <button onClick={() => onFocus && onFocus('injured')}
                                            title="Anklicken: Kamera zum Verletzten"
                                            style={warnBtn('#f87171')}>Verletzt {stats.injuredCount}</button>
                                )}
                                {stats.grumpy > 0 && (
                                    <button onClick={() => onFocus && onFocus('grumpy')}
                                            title="Verärgerte Gäste — anklicken für die Kamera"
                                            style={warnBtn('#fb923c')}>Verärgert {stats.grumpy}</button>
                                )}
                                {stats.hotelFull > 0 && (
                                    <button onClick={() => onFocus && onFocus('hotel')}
                                            title={'Alle Unterkünfte voll — ' + stats.hotelFull + ' Gäste finden kein Bett. Mehr Hotels bauen!'}
                                            style={warnBtn('#c084fc')}>Hotels voll {stats.hotelFull}</button>
                                )}
                                {stats.parkingFull > 0 && (
                                    <button onClick={() => onFocus && onFocus('parking')}
                                            title="Parkplätze voll — Autos mussten wieder abfahren. Mehr Parkplätze oder ein Parkhaus bauen!"
                                            style={warnBtn('#f472b6')}>Parken {stats.parkingFull}</button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

/** Kabinenfarben zur Auswahl — kräftige, gut unterscheidbare Lackierungen. */
const CABIN_COLORS = [
    { name: 'Rot',      hex: 0xe23b3b }, { name: 'Blau',    hex: 0x2f8fd6 },
    { name: 'Gelb',     hex: 0xf5b60a }, { name: 'Grün',    hex: 0x22a06b },
    { name: 'Orange',   hex: 0xf97316 }, { name: 'Violett', hex: 0x8b5cf6 },
    { name: 'Anthrazit',hex: 0x3f4652 }, { name: 'Weiß',    hex: 0xeef2f7 }
];
/** Bahnen, bei denen es überhaupt Kabinen zum Lackieren gibt. */
const COLORABLE = ['gondola', 'gondola4', 'gondola8', 'mega', 'tram', 'tramxl'];

/**
 * Kleines Baumenü, das VOR dem Ziehen der Trasse erscheint: hier legt der
 * Spieler den Anlagennamen fest und — bei Gondel- und Kabinenbahnen — die
 * Lackierung der Kabinen. Sessel- und Schlepplifte haben keine Farbwahl.
 */
const LiftSetup = ({ kind, suggestion, onConfirm, onCancel, touch }) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState(CABIN_COLORS[0].hex);
    const colorable = COLORABLE.includes(kind);
    const label = { gondola: 'Gondelbahn', gondola4: '4er-Gondelbahn', gondola8: '8er-Kabinenbahn', mega: 'Einseilumlaufbahn', tram: 'Pendelbahn', tramxl: 'Jumbo-Pendelbahn',
        chair: '4er-Sesselbahn', chair2: '2er-Sesselbahn', chair6: '6er-Sesselbahn',
        tbar: 'Schlepplift', platter: 'Tellerlift', carpet: 'Förderband' }[kind] || 'Lift';
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(4,6,10,0.5)', backdropFilter: 'blur(3px)' }}>
            <div style={{ ...glass, width: 'min(380px, calc(100vw - 24px))', maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
                          boxSizing: 'border-box', padding: '22px 24px', borderRadius: 20, color: '#e8eaed' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.22em',
                              textTransform: 'uppercase', color: '#9aa0a8' }}>Neue Anlage</div>
                <h3 style={{ margin: '6px 0 18px', fontSize: 20, fontWeight: 700 }}>{label}</h3>

                <label style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                                color: '#9aa0a8', display: 'block', marginBottom: 6 }}>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestion}
                       autoFocus={!touch}
                       onKeyDown={(e) => { if (e.key === 'Enter') onConfirm({ name: name.trim() || suggestion, color: colorable ? color : null }); }}
                       style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                                borderRadius: 10, background: 'rgba(255,255,255,0.07)',
                                border: '1px solid rgba(255,255,255,0.16)', color: '#e8eaed', userSelect: 'text', WebkitUserSelect: 'text',
                                // Handy: ab 16 px zoomt der Browser beim Antippen nicht in das Feld hinein
                                fontSize: touch ? 16 : 14, outline: 'none' }} />
                <div style={{ fontSize: 10.5, color: '#8b9098', marginTop: 6 }}>
                    Leer lassen für „{suggestion}"
                </div>

                {colorable && (
                    <>
                        <label style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                                        color: '#9aa0a8', display: 'block', margin: '18px 0 8px' }}>Kabinenfarbe</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {CABIN_COLORS.map(c => (
                                <button key={c.hex} onClick={() => setColor(c.hex)} title={c.name}
                                        style={{ width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
                                                 background: '#' + c.hex.toString(16).padStart(6, '0'),
                                                 border: color === c.hex ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                                                 boxShadow: color === c.hex ? '0 0 0 3px rgba(255,255,255,0.16)' : 'none' }} />
                            ))}
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', gap: 9, marginTop: 22 }}>
                    <button onClick={() => onConfirm({ name: name.trim() || suggestion, color: colorable ? color : null })}
                            style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 0, cursor: 'pointer',
                                     background: '#e8eaed', color: '#0b1220', fontSize: 12,
                                     fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                        Trasse ziehen
                    </button>
                    <button onClick={onCancel}
                            style={{ flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                                     background: 'transparent', border: '1px solid rgba(255,255,255,0.22)',
                                     color: '#c8ccd2', fontSize: 12, fontWeight: 600 }}>
                        Abbrechen
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * Gäste-Portrait: zeigt das gerenderte Avatarbild aus `public/icons/guest_*.png`,
 * fällt auf das prozedurale SVG-Gesicht zurück, solange kein Bild vorliegt.
 */
const GuestAvatar = ({ avatarKey, portrait }) => {
    const [ok, setOk] = useState(true);
    if (avatarKey && ok) {
        return (
            <img
                src={`${import.meta.env.BASE_URL || '/'}icons/${avatarKey}.png`}
                alt="" onError={() => setOk(false)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
        );
    }
    return <GuestPortrait p={portrait} />;
};

/** Prozedurales Gäste-Portrait — 1:1 nach dem 2D-Spiel (Seed steuert Gesicht/Frisur/Accessoires). */
const GuestPortrait = ({ p }) => {
    const s = p.seed;
    const skin = ['#f2d3b1', '#d9a37d', '#b97a56', '#8d5a3c'][s % 4];
    const hair = ['#111827', '#7c2d12', '#92400e', '#374151'][s % 4];
    const mouthStyle = s % 4, eyeStyle = s % 3, hairStyle = s % 4;
    const accessory = s % 6, faceShape = s % 3, helmetStyle = s % 5;
    const hasGlasses = s % 5 === 0, hasBeard = s % 7 === 0;
    return (
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
                <linearGradient id={`bgG-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#334155" /><stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
                <linearGradient id={`jkG-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.jacket} /><stop offset="100%" stopColor="#111827" />
                </linearGradient>
                <linearGradient id={`hmG-${s}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={p.helmet} /><stop offset="100%" stopColor="#334155" />
                </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="100" fill={`url(#bgG-${s})`} />
            <path d="M0 84 Q50 70 100 84 L100 100 L0 100 Z" fill={p.pants} opacity="0.7" />
            <path d="M20 68 Q50 56 80 68 L78 100 L22 100 Z" fill={`url(#jkG-${s})`} />
            <path d="M34 70 Q50 60 66 70" stroke="#e8eaed" strokeWidth="1.4" opacity="0.5" fill="none" />
            <ellipse cx="50" cy="38" rx={faceShape === 0 ? 16 : faceShape === 1 ? 18 : 14} ry={faceShape === 0 ? 20 : faceShape === 1 ? 18 : 22} fill={skin} />
            <ellipse cx="35" cy="42" rx="2.2" ry="4.5" fill={skin} opacity="0.9" />
            <ellipse cx="65" cy="42" rx="2.2" ry="4.5" fill={skin} opacity="0.9" />
            {helmetStyle === 0 && <path d="M30 28 Q50 12 70 28 L67 36 Q50 30 33 36 Z" fill={`url(#hmG-${s})`} />}
            {helmetStyle === 1 && <path d="M28 30 Q50 10 72 30 L68 38 Q50 32 32 38 Z" fill={`url(#hmG-${s})`} />}
            {helmetStyle === 2 && <path d="M31 24 Q50 16 69 24 L72 34 Q50 30 28 34 Z" fill={hair} />}
            {helmetStyle === 3 && <path d="M30 26 Q50 14 70 26 L70 34 Q50 28 30 34 Z" fill={`url(#hmG-${s})`} />}
            {helmetStyle === 4 && <path d="M32 30 Q50 8 68 30 L64 36 Q50 31 36 36 Z" fill={hair} />}
            {helmetStyle <= 3 && <rect x="33" y="32" width="34" height="4" rx="2" fill="#0f172a" opacity="0.45" />}
            {hairStyle === 0 && <path d="M33 34 Q50 24 67 34 L64 38 Q50 34 36 38 Z" fill={hair} />}
            {hairStyle === 1 && <path d="M32 36 Q50 22 68 36 L64 40 Q50 35 36 40 Z" fill={hair} />}
            {hairStyle === 2 && <path d="M35 33 Q50 27 65 33 L62 38 Q50 34 38 38 Z" fill={hair} />}
            {hairStyle === 3 && <path d="M34 35 Q50 25 66 35 L63 39 Q50 35 37 39 Z" fill={hair} />}
            <ellipse cx="43" cy="44" rx={eyeStyle === 0 ? 2.6 : 2.1} ry="2.4" fill="#0f172a" />
            <ellipse cx="57" cy="44" rx={eyeStyle === 1 ? 2.7 : 2.1} ry="2.4" fill="#0f172a" />
            <circle cx="42.4" cy="43.4" r="0.8" fill="#f8fafc" />
            <circle cx="56.4" cy="43.4" r="0.8" fill="#f8fafc" />
            {eyeStyle === 2 && <path d="M39 41 L47 41 M53 41 L61 41" stroke="#0f172a" strokeWidth="1.6" />}
            {hasGlasses && (<>
                <rect x="36" y="40" width="12" height="9" rx="2" fill="none" stroke="#111827" strokeWidth="1.3" />
                <rect x="52" y="40" width="12" height="9" rx="2" fill="none" stroke="#111827" strokeWidth="1.3" />
                <line x1="48" y1="44.5" x2="52" y2="44.5" stroke="#111827" strokeWidth="1.1" />
            </>)}
            <path d="M49 47 L51 47 L50 52 Z" fill="#7c4a2b" opacity="0.6" />
            <ellipse cx="41" cy="50" rx="2.8" ry="1.2" fill="#fca5a5" opacity="0.35" />
            <ellipse cx="59" cy="50" rx="2.8" ry="1.2" fill="#fca5a5" opacity="0.35" />
            <path d={mouthStyle === 0 ? 'M42 57 Q50 63 58 57' : mouthStyle === 1 ? 'M42 58 Q50 54 58 58' : mouthStyle === 2 ? 'M44 58 L56 58' : 'M44 56 Q50 60 56 56'}
                stroke={p.mood > 55 ? '#7f1d1d' : '#111827'} strokeWidth="2" fill="none" />
            {hasBeard && <path d="M37 60 Q50 72 63 60 Q61 71 50 76 Q39 71 37 60 Z" fill="#374151" opacity="0.9" />}
            {accessory === 1 && <circle cx="66" cy="57" r="4" fill="#f59e0b" />}
            {accessory === 2 && <rect x="22" y="30" width="8" height="20" rx="2" fill={p.helmet} />}
            {accessory === 3 && <path d="M26 27 L74 27 L67 34 L33 34 Z" fill={p.helmet} />}
            {accessory === 4 && <circle cx="34" cy="58" r="3" fill="#ef4444" />}
            {accessory === 5 && <rect x="63" y="64" width="8" height="12" rx="2" fill="#16a34a" />}
            <path d="M23 72 L77 72" stroke="#0f172a" strokeWidth="1.4" opacity="0.25" />
            <path d="M23 79 L77 79" stroke="#0f172a" strokeWidth="1.2" opacity="0.2" />
        </svg>
    );
};

/**
 * Bestätigen-Leiste (Finger). Mit der Maus sieht man die Vorschau schon beim
 * Bewegen; mit dem Finger setzt das Antippen erst die Vorschau samt Preis –
 * gebaut oder abgerissen wird erst mit dem Haken.
 */
const ConfirmBar = ({ p, fmt, onOk, onCancel, onRotate, onUndo }) => {
    // Zwischenschritt (erster Punkt gesetzt): nur Hinweis und Zurück, noch nichts zu bestätigen
    const step = p.kind === 'liftStart' || p.kind === 'roadStart';
    const title = { build: 'Hier bauen?', road: 'Straßenstück bauen?', lift: 'Lift so bauen?', piste: 'Piste bauen?',
                    demolish: 'Abreißen?', liftStart: 'Talstation gesetzt', roadStart: 'Startpunkt gesetzt' }[p.kind] || 'Ausführen?';
    let sub;
    if (p.kind === 'liftStart') sub = 'Jetzt die Bergstation antippen';
    else if (p.kind === 'roadStart') sub = 'Jetzt das Ende antippen';
    else if (p.kind === 'demolish') sub = 'Erstattung ' + fmt(Math.abs(p.cost || 0));
    else if (p.kind === 'piste') sub = p.count + (p.count === 1 ? ' Punkt' : ' Punkte') + (p.count >= 2 ? ' · ' + fmt(p.cost || 0) : '');
    else sub = fmt(p.cost || 0);
    const bad = !step && !p.ok;
    const round = { flex: 'none', width: 46, height: 46, borderRadius: 14, padding: 0, cursor: 'pointer',
                    fontSize: 20, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)', color: '#e8eaed' };
    return (
        <div style={{ ...glass, pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: 6,
                      borderRadius: 20, maxWidth: '100%', boxSizing: 'border-box', color: '#e8eaed' }}>
            <button onClick={onCancel} title="Verwerfen" style={round}><Ico name="close" size={19} /></button>
            {p.kind === 'build' && <button onClick={onRotate} title="Um 90° drehen" style={round}><Ico name="turnR" size={19} /></button>}
            {p.kind === 'piste' && <button onClick={onUndo} title="Letzten Punkt zurücknehmen" style={round}><Ico name="undo" size={19} /></button>}
            <div style={{ flex: '1 1 auto', minWidth: 0, padding: '0 6px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{title}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.3, color: bad ? '#fca5a5' : '#a8aeb6' }}>
                    {sub}{bad && p.why ? ' · ' + p.why : ''}
                </div>
            </div>
            {!step && (
                <button onClick={onOk} disabled={!p.ok} title="Bestätigen"
                        style={{ ...round, width: 60, cursor: p.ok ? 'pointer' : 'not-allowed',
                                 background: p.ok ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'rgba(255,255,255,0.05)',
                                 border: p.ok ? '1px solid rgba(134,239,172,0.7)' : '1px solid rgba(255,255,255,0.12)',
                                 color: p.ok ? '#fff' : '#6b7280' }}><Ico name="check" size={24} style={{ strokeWidth: 2.4 }} /></button>
            )}
        </div>
    );
};

const World3D = ({ level, onExit, initialSave = null }) => {
    const canvasRef = useRef(null);
    const apiRef = useRef(null);
    const wonRef = useRef(false);        // Level geschafft? Steht mit im Spielstand.
    const vp = useViewport();
    const compact = vp.compact;          // Handy-Layout: Werkzeuge unten, Felder als Karten von unten
    const touch = vp.coarse;             // Bedienung mit dem Finger
    const narrow = vp.w < 560;           // Hochkant-Handy: Karten über die ganze Breite
    const [pendingAct, setPendingAct] = useState(null);   // angetippte, noch nicht bestätigte Aktion
    // Einmaliger Hinweis auf die Finger-Gesten
    const [gestureHelp, setGestureHelp] = useState(() => {
        try { return !localStorage.getItem('mt.touchHelp'); } catch { return true; }
    });
    const dismissGestureHelp = () => {
        setGestureHelp(false);
        try { localStorage.setItem('mt.touchHelp', '1'); } catch { /* privater Modus */ }
    };
    const [money, setMoney] = useState(level?.startingMoney || 2000000);
    const [active, setActive] = useState(null);      // aktives Item-key
    const [openCat, setOpenCat] = useState(null);    // geöffnete Kategorie
    const [stats, setStats] = useState(null);
    const [won, setWon] = useState(false);
    const [wonDismissed, setWonDismissed] = useState(false);
    const [selInfo, setSelInfo] = useState(null);   // Infofeld für angeklicktes Objekt
    const [buildHint, setBuildHint] = useState('');  // Grund, warum es gerade nicht baubar ist
    const [toast, setToast] = useState('');           // kurze Meldung (Diagnose), verschwindet nach 25 s
    const rvMenu = useReveal(false);
    const rvBuild = useReveal(!!openCat || !!active);
    const rvGoals = useReveal(false);
    // Aufgaben starten eingeklappt — sie öffnen sich nur per Klick aufs Symbol
    const [goalsOpen, setGoalsOpen] = useState(false); // Aufgaben-Panel auf/zu

    useEffect(() => {
        if (!canvasRef.current) return;
        // ===== SPIELFELD UND UMLAND =====
        // Erzeugt wird ein größeres Stück Gebirge (Gipfelgerüst nach dem echten Vorbild des
        // Gebiets); das Spielfeld ist dessen Mitte, je Seite um den Faktor 1,75 hochgerechnet.
        // Das Umland drumherum (world.outer, world.far) zeichnet die Szene als Fortsetzung.
        const t0 = performance.now();
        const world = buildLevelWorld(level, MASSIFS[level?.id]);
        const gridSize = world.gridSize;
        const t1 = performance.now();
        const api = createScene3D(canvasRef.current, world, gridSize, level?.theme || {}, level || {});
        if (import.meta.env.DEV) console.info(`[Welt] Landschaft ${Math.round(t1 - t0)} ms, Szene ${Math.round(performance.now() - t1)} ms`);
        apiRef.current = api;
        setMoney(api.getMoney());
        api.setOnMoney((m) => setMoney(m));
        api.setOnBuildDone(() => setActive(null));
        api.setOnBuildHint?.((h) => setBuildHint(h || ''));
        api.setOnToast?.((m) => { setToast(m); clearTimeout(window.__toastT); window.__toastT = setTimeout(() => setToast(''), 25000); });
        api.setOnSelect?.((info) => setSelInfo(info));
        api.setOnPending?.((p) => setPendingAct(p));
        api.setOnStats((st) => {
            setStats(st);
            if ((level?.objectives?.length > 0) && level.objectives.every(o => evaluateObjective(o, st).done)) {
                wonRef.current = true;
                setWon(prev => { if (!prev && level?.id && !level.isSandbox) markLevelCompleted(level.id); return true; });
            }
        });
        // ===== SPIELSTAND =====
        // Fortsetzen: das gespeicherte Skigebiet wieder aufbauen. Danach sichert das Spiel von
        // selbst – nach jeder Bauaktion, regelmäßig und beim Verlassen (Gerät und Konto).
        const saving = canSave(level);
        if (saving && initialSave) {
            const res = api.loadSave(initialSave);
            if (res.ok && initialSave.won) { wonRef.current = true; setWon(true); setWonDismissed(true); }   // nicht bei jedem Fortsetzen neu gratulieren
            if (res.ok && res.skipped > 0) {
                setToast(res.skipped === 1 ? 'Ein Bauwerk ließ sich nicht wiederherstellen.' : `${res.skipped} Bauwerke ließen sich nicht wiederherstellen.`);
                clearTimeout(window.__toastT); window.__toastT = setTimeout(() => setToast(''), 12000);
            }
            setMoney(api.getMoney());
        }
        const saver = saving ? createAutosave(level.id, () => ({ ...api.getSave(), won: wonRef.current })) : null;
        if (saver) api.setOnSaveChange(() => saver.changed());
        setStats(api.getStats());
        return () => {
            if (saver) { saver.flush(true); saver.dispose(); }
            api.dispose(); apiRef.current = null;
        };
    }, [level, initialSave]);

    const applyTool = (item) => {
        const api = apiRef.current; if (!api) return;
        setBuildHint('');
        // alles zurücksetzen
        api.setBuild(null); api.setDemolish(false); api.setLift(false); api.setPiste(false); api.setRoad?.(false);
        if (item.tool === 'build') api.setBuild(item.key);
        else if (item.tool === 'lift') {
            // Nicht sofort bauen: erst Name und Lackierung abfragen
            setLiftSetup({ kind: item.kind, key: item.key,
                           suggestion: api.suggestLiftName?.(item.kind) || 'Lift' });
        }
        else if (item.tool === 'piste') api.setPiste(true, item.lit, item.width);
        else if (item.tool === 'road') api.setRoad?.(true);
    };
    // Vor dem Liftbau erscheint der Einrichtungsdialog
    const [liftSetup, setLiftSetup] = useState(null);
    /** Kamera zum gemeldeten Problem führen (Klick auf die HUD-Warnung). */
    const focusProblem = (kind) => { apiRef.current?.focusProblem?.(kind); };
    /** Aktives Werkzeug ganz beenden (× im Hinweis). */
    const clearTool = () => {
        const api = apiRef.current;
        setActive(null); setBuildHint('');
        if (!api) return;
        api.setBuild(null); api.setDemolish(false); api.setLift(false); api.setPiste(false); api.setRoad?.(false);
    };
    const selectItem = (item) => {
        if (active === item.key) { clearTool(); return; }
        setActive(item.key);
        applyTool(item);
        if (compact) setOpenCat(null);        // Handy: Karte wieder frei, gebaut wird im Gelände
    };
    const toggleDemolish = () => {
        const on = active !== 'demolish';
        setActive(on ? 'demolish' : null);
        apiRef.current?.setBuild(null); apiRef.current?.setLift(false); apiRef.current?.setPiste(false); apiRef.current?.setRoad?.(false);
        apiRef.current?.setDemolish(on);
        if (compact) setOpenCat(null);
    };
    /** Kategorie öffnen/schließen; am Handy teilt sie sich den Platz mit dem Infofeld. */
    const toggleCat = (key) => {
        const willOpen = openCat !== key;
        setOpenCat(willOpen ? key : null);
        if (willOpen && compact && selInfo) { apiRef.current?.deselect?.(); setSelInfo(null); }
    };

    const fmt = (n) => typeof n === 'number' ? '€' + Math.round(n).toLocaleString('de-DE') : n;
    // Welches Werkzeug ist aktiv – und aus welcher Kategorie stammt es?
    const activeCat = active && active !== 'demolish' ? CATEGORIES.find(c => c.items.some(i => i.key === active)) : null;
    const activeItem = activeCat ? activeCat.items.find(i => i.key === active) : null;
    const hint = () => {
        if (active === 'demolish') return touch
            ? 'Gebäude antippen, dann mit ✓ abreißen (60 % Erstattung)'
            : 'Klicke auf ein gebautes Gebäude zum Abreißen (60% Erstattung)';
        if (!activeItem) return null;
        if (activeItem.tool === 'lift') return touch
            ? 'Lift: erst die Talstation antippen, dann die Bergstation – mit ✓ bauen'
            : 'Lift ziehen: 1. Klick Talstation, 2. Klick Bergstation';
        if (activeItem.tool === 'piste') return touch
            ? 'Piste: Punkt für Punkt bergab antippen, dann mit ✓ bauen'
            : 'Piste zeichnen: pro Klick ein Kurvenpunkt · Doppelklick beendet · Schwierigkeit ergibt sich aus dem Gefälle';
        if (activeItem.tool === 'road') return touch
            ? 'Straße: Start antippen, dann das Ende – mit ✓ bauen, danach geht es am Endpunkt weiter'
            : 'Straße ziehen: 1. Klick Start, 2. Klick Ende · danach geht es am Endpunkt weiter';
        if (['funpark_s', 'funpark', 'funpark_l', 'kicker', 'halfpipe', 'racecourse'].includes(active))
            return (buildHint ? '⛔ ' + buildHint + ' · ' : '') + 'Nur auf EXTRABREITEN Pisten baubar · rastet mittig ein, Fahrtrichtung bergab';
        return touch
            ? 'Bauplatz antippen · grün = frei, rot = geht hier nicht · mit ✓ bauen'
            : 'Klicke aufs Gelände zum Platzieren · grün = frei, rot = belegt/zu steil/zu teuer';
    };
    const hintText = hint();
    // Unterkante für alles, was über der Werkzeugleiste des Handy-Layouts sitzt
    const aboveBar = `calc(${BAR_H + 8}px + ${SAFE_B})`;
    const sheetMaxH = Math.max(150, Math.round(narrow ? vp.h * 0.46 : vp.h - BAR_H - 96));

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#0b1a30', overflow: 'hidden',
                      // Die Seite selbst soll weder zoomen noch scrollen noch Text markieren – nur das Spiel reagiert.
                      touchAction: 'none', overscrollBehavior: 'none', userSelect: 'none', WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: active ? 'crosshair' : 'grab' }} />

            {/* Kopfzeile: nur der Rückweg ins Menü; alle Zahlen sitzen zentriert oben */}
            {compact ? (
                <div style={{ position: 'fixed', top: `calc(8px + ${SAFE_T})`, left: `calc(8px + ${SAFE_L})`, zIndex: 10 }}>
                    <button onClick={onExit} title="Zurück zum Hauptmenü"
                            style={{ ...glass, width: 40, height: 40, borderRadius: 13, padding: 0, cursor: 'pointer', color: '#e8eaed',
                                     display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ico name="back" size={16} />
                    </button>
                </div>
            ) : (
                <div {...rvMenu.props} style={{ position: 'fixed', top: 14, left: 14, zIndex: 10, ...rvMenu.style }}>
                    <button onClick={onExit} style={{ ...btn, display: 'flex', alignItems: 'center', gap: 6 }} title="Zurück zum Hauptmenü">
                        <Ico name="back" size={12} /> Menü
                    </button>
                </div>
            )}

            {/* Beschneiungs-Zentrale: Wasservorrat, Bedarf und aktuelles Wetter */}
            {stats && <StatusBoard stats={stats} onFocus={focusProblem} money={money} level={level} fmt={fmt} compact={compact} />}

            {compact ? (
                /* Handy: Werkzeugleiste unten – alle Kategorien nebeneinander, mit dem Daumen erreichbar */
                <div className="mt-noscrollbar" style={{
                    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 11, boxSizing: 'border-box',
                    height: `calc(${BAR_H}px + ${SAFE_B})`,
                    padding: `6px calc(6px + ${SAFE_R}) calc(6px + ${SAFE_B}) calc(6px + ${SAFE_L})`,
                    display: 'flex', alignItems: 'stretch', gap: 4, overflowX: 'auto', touchAction: 'pan-x',
                    background: 'rgba(16,20,27,0.72)', backdropFilter: glass.backdropFilter, WebkitBackdropFilter: glass.WebkitBackdropFilter,
                    borderTop: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 -6px 24px rgba(0,0,0,0.35)'
                }}>
                    {CATEGORIES.map(cat => {
                        const isOpen = openCat === cat.key;
                        const inUse = activeCat?.key === cat.key;      // hier steckt das aktive Werkzeug
                        return (
                            <button key={cat.key} title={cat.label} onClick={() => toggleCat(cat.key)} style={{
                                flex: '1 0 40px', minWidth: 40, padding: '2px 1px', borderRadius: 10, cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                                border: isOpen ? '1px solid rgba(255,255,255,0.85)' : inUse ? '1px solid rgba(252,211,77,0.85)' : '1px solid transparent',
                                background: isOpen ? 'rgba(255,255,255,0.16)' : inUse ? 'rgba(252,211,77,0.16)' : 'rgba(255,255,255,0.05)',
                                color: '#e8eaed'
                            }}>
                                <BuildIcon itemKey={'cat_' + cat.key} emoji={cat.icon} size={19} />
                                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', opacity: .85,
                                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.short || cat.label}</span>
                            </button>
                        );
                    })}
                    <button title="Abriss" onClick={toggleDemolish} style={{
                        flex: '1 0 40px', minWidth: 40, padding: '2px 1px', borderRadius: 10, cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                        border: active === 'demolish' ? '1px solid #f87171' : '1px solid transparent',
                        background: active === 'demolish' ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.05)', color: '#e8eaed'
                    }}>
                        <BuildIcon itemKey="demolish" emoji="🗑️" size={19} />
                        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', opacity: .85 }}>Abriss</span>
                    </button>
                </div>
            ) : (
            /* Bau-Seitenleiste links: Kategorien untereinander, Varianten als Untergruppe */
            <div {...rvBuild.props} style={{
                position: 'fixed', top: 66, left: 14, bottom: 16, zIndex: 11, width: 74,
                display: 'flex', flexDirection: 'column', gap: 6, padding: 7, borderRadius: 18, ...glass, ...rvBuild.style
            }}>
                {CATEGORIES.map(cat => {
                    const isOpen = openCat === cat.key;
                    return (
                        <button key={cat.key} title={cat.label} onClick={() => toggleCat(cat.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                            padding: '9px 4px', borderRadius: 3, cursor: 'pointer',
                            border: isOpen ? '1px solid rgba(255,255,255,0.85)' : '1px solid transparent',
                            background: isOpen ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
                            color: '#e8eaed', transition: 'all .12s'
                        }}>
                            <BuildIcon itemKey={'cat_' + cat.key} emoji={cat.icon} size={26} />
                            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: .8,
                                width: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label.split(' ')[0]}</span>
                        </button>
                    );
                })}
                <div style={{ flex: 1 }} />
                <button title="Abriss" onClick={toggleDemolish} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    padding: '9px 4px', borderRadius: 3, cursor: 'pointer',
                    border: active === 'demolish' ? '1px solid #f87171' : '1px solid transparent',
                    background: active === 'demolish' ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.05)', color: '#e8eaed'
                }}>
                    <BuildIcon itemKey="demolish" emoji="🗑️" size={26} />
                    <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: .8 }}>Abriss</span>
                </button>
            </div>
            )}

            {/* Ausklapp-Panel: am Rechner rechts neben der Leiste, am Handy als Karte über der Werkzeugleiste */}
            {openCat && (
                <div className={compact ? 'mt-noscrollbar' : undefined} style={compact ? {
                    position: 'fixed', zIndex: 12, left: `calc(8px + ${SAFE_L})`, bottom: aboveBar,
                    ...(narrow ? { right: `calc(8px + ${SAFE_R})` } : { width: 340 }),
                    maxHeight: sheetMaxH, overflowY: 'auto', touchAction: 'pan-y', overscrollBehavior: 'contain',
                    boxSizing: 'border-box', padding: 12, borderRadius: 18, ...glass, background: 'rgba(16,20,27,0.82)'
                } : {
                    position: 'fixed', top: 66, left: 96, zIndex: 11, width: 244,
                    maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
                    padding: 12, borderRadius: 18, ...glass
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#e8eaed', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                            {CATEGORIES.find(c => c.key === openCat).icon} {CATEGORIES.find(c => c.key === openCat).label}
                        </div>
                        <button onPointerDown={e => e.stopPropagation()} onClick={() => setOpenCat(null)} style={{ background: 'none', border: 'none', color: '#8b9098', fontSize: compact ? 24 : 17, padding: compact ? '2px 10px' : undefined, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    </div>
                    {(() => {
                        // Items nach `group` bündeln — Größenvarianten erscheinen als Zeile
                        const items = CATEGORIES.find(c => c.key === openCat).items;
                        const blocks = [];
                        for (const it of items) {
                            const last = blocks[blocks.length - 1];
                            if (it.group && last && last.group === it.group) last.items.push(it);
                            else blocks.push({ group: it.group || null, items: [it] });
                        }
                        return blocks.map((b, bi) => {
                            if (!b.group) {
                                const it = b.items[0];
                                const affordable = typeof it.cost !== 'number' || money >= it.cost;
                                const sel = active === it.key;
                                return (
                                    <button key={it.key} onClick={() => selectItem(it)} disabled={!affordable} style={{
                                        display: 'flex', alignItems: 'center', gap: 9, width: '100%', marginBottom: 6,
                                        padding: '8px 10px', borderRadius: 3, cursor: affordable ? 'pointer' : 'not-allowed',
                                        border: sel ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.1)',
                                        background: sel ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
                                        color: '#e8eaed', opacity: affordable ? 1 : 0.4, textAlign: 'left', transition: 'all .12s'
                                    }}>
                                        <BuildIcon itemKey={it.key} emoji={it.icon} size={25} />
                                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{it.name}</span>
                                        <span style={{ fontSize: 10, color: '#a8aeb6' }}>{fmt(it.cost)}</span>
                                    </button>
                                );
                            }
                            // Gruppe mit Größenvarianten
                            return (
                                <div key={'g' + bi} style={{ marginBottom: 8, padding: '7px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                        <BuildIcon itemKey={b.items[0].key} emoji={b.items[0].icon} size={23} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#d4d8dd' }}>{b.group}</span>
                                    </div>
                                    {/* Handy: mehr als drei Varianten brechen in eine zweite Reihe um, Knöpfe fingergroß */}
                                    <div style={{ display: 'flex', gap: 5, flexWrap: compact ? 'wrap' : 'nowrap' }}>
                                        {b.items.map(it => {
                                            const affordable = typeof it.cost !== 'number' || money >= it.cost;
                                            const sel = active === it.key;
                                            return (
                                                <button key={it.key} onClick={() => selectItem(it)} disabled={!affordable} style={{
                                                    flex: compact && b.items.length > 3 ? '1 0 30%' : 1,
                                                    padding: compact ? '10px 3px' : '6px 3px', borderRadius: 2, cursor: affordable ? 'pointer' : 'not-allowed',
                                                    border: sel ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.1)',
                                                    background: sel ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
                                                    color: '#e8eaed', opacity: affordable ? 1 : 0.4, transition: 'all .12s'
                                                }}>
                                                    <div style={{ fontSize: 10.5, fontWeight: 700 }}>{it.variant}</div>
                                                    <div style={{ fontSize: 9, color: '#a8aeb6', marginTop: 1 }}>{fmt(it.cost)}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            )}

            {/* Liftbau: erst Name und Farbe festlegen, dann Trasse ziehen */}
            {liftSetup && (
                <LiftSetup
                    kind={liftSetup.kind}
                    suggestion={liftSetup.suggestion}
                    touch={touch}
                    onCancel={() => { setLiftSetup(null); setActive(null); }}
                    onConfirm={(cfg) => {
                        apiRef.current?.setLift(true, liftSetup.kind, cfg);
                        setLiftSetup(null);
                    }}
                />
            )}

            {/* ===== AUFGABEN: nur ein Symbol, klappt bei Klick auf ===== */}
            {level?.objectives?.length > 0 && stats && (() => {
                const done = level.objectives.filter(o => evaluateObjective(o, stats).done).length;
                const all = level.objectives.length;
                return (
                    <div {...rvGoals.props} style={{ position: 'fixed', zIndex: 10,
                                  ...(compact ? { top: `calc(8px + ${SAFE_T})`, right: `calc(8px + ${SAFE_R})` } : { top: 58, right: 14 }),
                                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
                                  opacity: (rvGoals.on || goalsOpen) ? 1 : 0.28, transition: 'opacity .22s ease' }}>
                        <button onClick={() => setGoalsOpen(o => !o)} title="Aufgaben"
                                style={{ ...glass, width: compact ? 42 : 44, height: compact ? 40 : 44, borderRadius: 14, padding: 0,
                                         display: 'flex', flexDirection: 'column', alignItems: 'center',
                                         justifyContent: 'center', gap: 1, cursor: 'pointer',
                                         color: done === all ? '#4ade80' : '#e8eaed' }}>
                            <Ico name="target" size={15} />
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>{done}/{all}</span>
                        </button>
                        {goalsOpen && (
                            <div style={{ ...glass, width: 'min(268px, calc(100vw - 16px))', boxSizing: 'border-box',
                                          maxHeight: compact ? Math.max(140, vp.h - BAR_H - 80) : undefined, overflowY: compact ? 'auto' : undefined,
                                          touchAction: 'pan-y', padding: '13px 14px', borderRadius: 16, color: '#e8eaed',
                                          ...(compact ? { background: 'rgba(16,20,27,0.82)' } : null) }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.22em',
                                              textTransform: 'uppercase', color: '#9aa0a8', marginBottom: 10 }}>Aufgaben</div>
                                {level.objectives.map((obj, i) => {
                                    const r = evaluateObjective(obj, stats);
                                    return (
                                        <div key={i} style={{ marginBottom: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
                                                          marginBottom: 4, color: r.done ? '#4ade80' : '#d4d8dd' }}>
                                                <span>{r.done ? '✓ ' : ''}{objectiveLabel(obj)}</span>
                                                <span style={{ fontWeight: 600 }}>{formatObjectiveValue(obj, r.current)}</span>
                                            </div>
                                            <div style={{ height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.round(r.pct * 100)}%`, height: '100%',
                                                              background: r.done ? '#4ade80' : 'rgba(255,255,255,0.75)',
                                                              transition: 'width .4s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                <div style={{ fontSize: 10, color: '#8b9098', marginTop: 6 }}>Baue Kasse + Lift, damit Gäste kommen</div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Infofeld: angeklicktes Gebäude / Parkplatz */}
            {selInfo && (
                <div className={compact ? 'mt-noscrollbar' : undefined} style={{ position: 'fixed', zIndex: 14, overflowY: 'auto', padding: '12px 14px', borderRadius: 14, background: 'rgba(7,15,30,0.94)', border: '1px solid rgba(255,255,255,0.3)', color: '#e8eaed', boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                              ...(compact
                                  // Handy: Karte über der Werkzeugleiste (hochkant über die ganze Breite)
                                  ? { bottom: aboveBar, right: `calc(8px + ${SAFE_R})`, ...(narrow ? { left: `calc(8px + ${SAFE_L})` } : { width: 300 }),
                                      maxHeight: sheetMaxH, boxSizing: 'border-box', touchAction: 'pan-y', overscrollBehavior: 'contain' }
                                  : { bottom: 16, right: 14, width: 272, maxHeight: 'calc(100vh - 300px)' }) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {selInfo.iconKey
                                ? <BuildIcon itemKey={selInfo.iconKey} emoji={selInfo.icon} size={34} />
                                : <span style={{ fontSize: 17 }}>{selInfo.icon}</span>}
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8eaed' }}>{selInfo.name}</div>
                        </div>
                        <button onPointerDown={e => e.stopPropagation()} onClick={() => { apiRef.current?.deselect?.(); setSelInfo(null); }} style={{ background: 'none', border: 'none', color: '#8b9098', fontSize: compact ? 24 : 18, padding: compact ? '2px 10px' : undefined, cursor: 'pointer', lineHeight: 1 }}>×</button>
                    </div>
                    {/* Gäste-Portrait wie im 2D: prozedurales Gesicht aus dem Seed */}
                    {selInfo.portrait && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ width: 74, height: 74, borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0, background: 'linear-gradient(180deg,#334155,#0f172a)' }}>
                                {/* Echtes Avatarbild, falls vorhanden — sonst prozedurales Gesicht */}
                                <GuestAvatar avatarKey={selInfo.avatarKey} portrait={selInfo.portrait} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: '#8b9098', lineHeight: 1.35 }}>{selInfo.desc}</div>
                                <div style={{ marginTop: 6, fontSize: 11, color: '#d4d8dd' }}>Laune {selInfo.mood}% {selInfo.mood > 75 ? '😃' : selInfo.mood > 45 ? '🙂' : '😕'}</div>
                                <div style={{ height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden', marginTop: 3 }}>
                                    <div style={{ width: `${selInfo.mood}%`, height: '100%', background: selInfo.mood >= 70 ? '#22c55e' : selInfo.mood >= 40 ? '#f59e0b' : '#ef4444' }} />
                                </div>
                            </div>
                        </div>
                    )}
                    {selInfo.desc && !selInfo.portrait && <div style={{ fontSize: 11, color: '#8b9098', marginBottom: 8, lineHeight: 1.4 }}>{selInfo.desc}</div>}
                    {selInfo.lines?.map((l, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderTop: i === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                            <span style={{ color: '#8b9098' }}>{l.k}</span>
                            <span style={{ fontWeight: 600, color: '#e8eaed' }}>{l.v}</span>
                        </div>
                    ))}
                    {/* Bedürfnisse (2D: Hunger/Durst/Toilette) */}
                    {selInfo.needs && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            {selInfo.needs.map((n, i) => (
                                <div key={i} style={{ marginBottom: 5 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b9098' }}>
                                        <span>{n.k}</span><span>{n.v}%</span>
                                    </div>
                                    <div style={{ height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${n.v}%`, height: '100%', background: n.v > 70 ? '#ef4444' : n.v > 45 ? '#f59e0b' : '#22c55e' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Wünsche (2D: erfüllte Wünsche abgehakt) */}
                    {selInfo.wishes && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#c8ccd2', marginBottom: 4 }}>💭 Wünsche</div>
                            {selInfo.wishes.map((w, i) => (
                                <div key={i} style={{ fontSize: 11, padding: '2px 0', color: w.done ? '#4ade80' : '#d4d8dd' }}>
                                    {w.done ? '✓' : '○'} {w.label}
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Preis-Slider (Konzept aus dem 2D-Spiel: 50%..200% der Basis) */}
                    {selInfo.price && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span style={{ color: '#8b9098' }}>🏷️ {selInfo.price.label}</span>
                                <span style={{ fontWeight: 700, color: '#fbbf24' }}>€{selInfo.price.value}</span>
                            </div>
                            <input type="range" min={selInfo.price.min} max={selInfo.price.max} value={selInfo.price.value}
                                onChange={(e) => apiRef.current?.setSelectedPrice?.(parseInt(e.target.value))}
                                style={{ width: '100%', cursor: 'pointer', accentColor: '#fbbf24' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b' }}>
                                <span>€{selInfo.price.min}</span><span>€{selInfo.price.base} Normal</span><span>€{selInfo.price.max}</span>
                            </div>
                        </div>
                    )}
                    {/* Bettenbelegung — bei allen Unterkünften */}
                    {selInfo.occupancy && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span style={{ color: '#8b9098' }}>🛏️ Belegung</span>
                                <span style={{ fontWeight: 700, color: selInfo.occupancy.pct > 92 ? '#f87171'
                                    : selInfo.occupancy.pct > 65 ? '#fbbf24' : '#4ade80' }}>
                                    {selInfo.occupancy.used} / {selInfo.occupancy.cap} Betten
                                </span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{
                                    width: Math.min(100, selInfo.occupancy.pct) + '%', height: '100%',
                                    background: selInfo.occupancy.pct > 92 ? 'linear-gradient(90deg,#dc2626,#f87171)'
                                        : selInfo.occupancy.pct > 65 ? 'linear-gradient(90deg,#d97706,#fbbf24)'
                                        : 'linear-gradient(90deg,#16a34a,#4ade80)',
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 9.5, color: '#64748b', marginTop: 2 }}>
                                {selInfo.occupancy.pct}% ausgelastet
                            </div>
                        </div>
                    )}
                    {/* Werbekampagnen — nur an der Kasse */}
                    {selInfo.ads && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#c8ccd2' }}>📣 Werbung · 2 Monate</span>
                                {selInfo.ads.activeId && (
                                    <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>
                                        +{selInfo.ads.boostPct}% · {selInfo.ads.daysLeft} Tage
                                    </span>
                                )}
                            </div>
                            {selInfo.ads.packages.map((a) => {
                                const active = selInfo.ads.activeId === a.id;
                                const dis = !a.affordable && !active;
                                return (
                                    <button key={a.id}
                                        disabled={dis}
                                        onClick={() => apiRef.current?.bookAdPackage?.(a.id)}
                                        title={a.desc}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left',
                                            margin: '0 0 4px', padding: '6px 8px', borderRadius: 4,
                                            cursor: dis ? 'not-allowed' : 'pointer',
                                            background: active ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.04)',
                                            border: '1px solid ' + (active ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.08)'),
                                            color: dis ? '#5b636d' : '#e6e9ee',
                                            opacity: dis ? 0.55 : 1, font: 'inherit'
                                        }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                                            <span>{a.icon} {a.name}</span>
                                            <span style={{ color: active ? '#4ade80' : '#fbbf24' }}>
                                                {active ? 'aktiv' : '€' + a.cost.toLocaleString('de-DE')}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#8b9098', marginTop: 1 }}>
                                            <span>{a.desc}</span>
                                            <span style={{ color: '#7dd3fc', fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 6 }}>
                                                +{a.boostPct}% Gäste
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                            {selInfo.ads.activeId && (
                                <button onClick={() => apiRef.current?.cancelAdPackage?.()}
                                    style={{ width: '100%', padding: '4px 8px', marginTop: 2, borderRadius: 4,
                                        background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
                                        color: '#8b9098', fontSize: 10, cursor: 'pointer', font: 'inherit' }}>
                                    Kampagne beenden (keine Erstattung)
                                </button>
                            )}
                        </div>
                    )}
                    {/* Gäste-Attraktivität je Kategorie (wie im 2D) */}
                    {selInfo.appeal && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#c8ccd2', marginBottom: 4 }}>📈 Gäste-Zustrom</div>
                            {selInfo.appeal.map((a, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                                    <span style={{ color: '#d4d8dd' }}>{a.icon} {a.name}</span>
                                    <span style={{ fontWeight: 600, color: a.color }}>{a.pct}%</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Unterer Stapel: Meldung, Werkzeug-Hinweis und (Finger) die Bestätigen-Leiste.
                Der Stapel selbst fängt keine Berührungen ab – das Gelände dahinter bleibt bedienbar. */}
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: compact ? aboveBar : 20, zIndex: 13, boxSizing: 'border-box',
                          padding: `0 calc(8px + ${SAFE_R}) 0 calc(8px + ${SAFE_L})`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
                {toast && (
                    <div style={{ ...chip, pointerEvents: 'auto', color: '#e8eaed', fontSize: 12, maxWidth: 'min(90vw, 100%)', boxSizing: 'border-box',
                                  background: 'rgba(7,15,30,0.94)', border: '1px solid rgba(255,255,255,0.35)',
                                  userSelect: 'text', WebkitUserSelect: 'text' }}>
                        {toast}
                    </div>
                )}
                {/* Einmaliger Hinweis auf die Gesten, solange kein Werkzeug aktiv ist */}
                {touch && gestureHelp && !hintText && !pendingAct && !selInfo && !openCat && (
                    <div style={{ ...chip, pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%',
                                  boxSizing: 'border-box', color: '#e8eaed', fontSize: 11.5, lineHeight: 1.4, padding: '8px 6px 8px 13px' }}>
                        <span>1 Finger: verschieben · 2 Finger: zoomen und drehen · 2 Finger hoch/runter: neigen</span>
                        <button onClick={dismissGestureHelp} title="Verstanden"
                                style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, padding: 0, cursor: 'pointer',
                                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                                         background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#e8eaed' }}><Ico name="close" size={15} /></button>
                    </div>
                )}
                {hintText && !(compact && openCat) && (
                    <div style={{ ...chip, pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%',
                                  boxSizing: 'border-box', color: '#fcd34d', fontSize: 12, lineHeight: 1.4,
                                  ...(compact ? { padding: '7px 6px 7px 12px', fontSize: 11.5 } : { padding: '5px 6px 5px 14px' }) }}>
                        <span>{hintText}</span>
                        <button onClick={clearTool} title="Werkzeug beenden"
                                style={{ flex: 'none', width: compact ? 34 : 26, height: compact ? 34 : 26, borderRadius: 9, padding: 0, cursor: 'pointer',
                                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                                         background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#e8eaed' }}><Ico name="close" size={compact ? 15 : 12} /></button>
                    </div>
                )}
                {pendingAct && !(compact && openCat) && (
                    <ConfirmBar p={pendingAct} fmt={fmt}
                                onOk={() => apiRef.current?.confirmPending?.()}
                                onCancel={() => apiRef.current?.cancelPending?.()}
                                onRotate={() => apiRef.current?.rotateBuild?.()}
                                onUndo={() => apiRef.current?.undoPistePoint?.()} />
                )}
            </div>

            {/* Sieg-Overlay */}
            {won && !wonDismissed && (() => {
                const next = CAMPAIGN_LEVELS[(level?.index ?? 0) + 1];
                return (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,10,22,0.72)', backdropFilter: 'blur(4px)' }}>
                        <div style={{ width: 'min(460px,90vw)', padding: 34, borderRadius: 6, textAlign: 'center', color: '#fff', background: 'linear-gradient(180deg,#10233d,#0a1626)', border: '1px solid rgba(74,222,128,0.4)', boxShadow: '0 20px 80px rgba(34,197,94,0.25)' }}>
                            <div style={{ fontSize: 54, marginBottom: 6 }}>🏆</div>
                            <h1 style={{ margin: '0 0 6px', fontSize: 28, letterSpacing: 1 }}>LEVEL GESCHAFFT!</h1>
                            <p style={{ color: '#c8ccd2', margin: '0 0 4px', fontSize: 15 }}>{level?.flag} {level?.name} · {level?.country}</p>
                            <p style={{ color: '#8b9098', fontSize: 13, lineHeight: 1.5 }}>
                                Alle {level?.objectives?.length} Aufgaben erfüllt!
                                {next ? ` Freigeschaltet: ${next.flag} ${next.name}.` : ' Du hast die ganze Weltreise gemeistert!'}
                            </p>
                            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
                                <button onClick={() => setWonDismissed(true)} style={{ flex: 1, padding: 13, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#e8eaed', cursor: 'pointer', fontSize: 15 }}>Weiterbauen</button>
                                <button onClick={onExit} style={{ flex: 1, padding: 13, borderRadius: 3, border: 'none', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Zum Menü ▸</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

const btn = { ...glass, padding: '9px 16px', borderRadius: 12, color: '#e8eaed', cursor: 'pointer', fontWeight: 700, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase' };
const chip = { ...glass, padding: '9px 14px', borderRadius: 12, fontSize: 12.5, letterSpacing: '0.03em' };

export default World3D;
