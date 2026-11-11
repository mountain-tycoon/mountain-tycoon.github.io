import React, { useState, useEffect } from 'react';
import {
    CAMPAIGN_LEVELS,
    SANDBOX_DEFAULTS,
    loadProgress,
    isLevelUnlocked,
    objectiveLabel
} from '../../constants/campaign';
import './MainMenu.css';

const BASE = import.meta.env.BASE_URL || '/';
/** Hintergrund-Fotos des Hauptmenues - wechseln alle 5 Sekunden. */
const BG_IMAGES = Array.from({ length: 9 }, (_, i) => `${BASE}bg/bg${i + 1}.jpg`);
const LOGO = `${BASE}bg/logo.png`;
/** Hero-Grafik je Level (public/levels/<id>.png). */
const heroFor = (level) => `${BASE}levels/${level.id}.png`;

/**
 * MOTTOBILDER — handgebaute SVG-Szenen je Level.
 * Jedes Land bekommt seine eigene kleine Postkarte: Farbwelt aus dem
 * Level-Theme, charakteristische Silhouetten (Matterhorn, Fjord, Vulkan …).
 */
const LevelArt = ({ level, height = 96 }) => {
    const t = level.theme || {};
    const sky1 = `rgb(${(t.skyTop || [80, 136, 205]).join(',')})`;
    const sky2 = `rgb(${(t.skyBottom || [178, 208, 238]).join(',')})`;
    const gid = `sky-${level.id}`;

    const common = (
        <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sky1} />
                <stop offset="100%" stopColor={sky2} />
            </linearGradient>
        </defs>
    );

    const scenes = {
        mittelgebirge: (
            <>
                <circle cx="160" cy="24" r="11" fill="#fde68a" opacity="0.9" />
                <path d="M0 70 Q40 42 80 62 T200 58 V100 H0 Z" fill="#334d38" />
                <path d="M0 80 Q50 58 110 74 T200 72 V100 H0 Z" fill="#3f5f45" />
                <path d="M0 88 Q60 74 200 84 V100 H0 Z" fill="#dbe7dd" />
                {[30, 55, 85, 120, 150, 175].map((x, i) => (
                    <path key={i} d={`M${x} ${76 - (i % 3) * 4} l4 9 h-8 Z`} fill="#1e3a2a" />
                ))}
            </>
        ),
        alpen: (
            <>
                <circle cx="42" cy="22" r="10" fill="#fef3c7" opacity="0.9" />
                <path d="M0 78 L45 34 L78 66 L112 26 L150 62 L178 42 L200 70 V100 H0 Z" fill="#64748b" />
                <path d="M45 34 L57 46 L45 50 L36 44 Z M112 26 L124 40 L112 44 L102 38 Z" fill="#f8fafc" />
                <path d="M0 86 Q60 72 130 84 T200 82 V100 H0 Z" fill="#eef2f7" />
                <rect x="92" y="74" width="10" height="7" fill="#7c4a24" />
                <path d="M90 74 L97 68 L104 74 Z" fill="#9a3412" />
            </>
        ),
        schweiz: (
            <>
                <path d="M0 82 L36 52 L60 72 L96 18 L118 44 L112 48 L140 74 L172 52 L200 76 V100 H0 Z" fill="#556275" />
                <path d="M96 18 L108 34 L96 40 L88 32 Z" fill="#ffffff" />
                <path d="M60 72 Q100 62 140 74 L128 84 Q95 76 68 82 Z" fill="#bfdbfe" opacity="0.85" />
                <path d="M0 88 Q70 78 200 86 V100 H0 Z" fill="#f1f5f9" />
            </>
        ),
        frankreich: (
            <>
                <circle cx="170" cy="20" r="9" fill="#fde68a" opacity="0.85" />
                <path d="M0 74 L30 44 L58 64 L92 32 L126 60 L160 38 L200 66 V100 H0 Z" fill="#5b6b80" />
                <path d="M92 32 L102 44 L92 48 L84 42 Z M30 44 L38 52 L28 54 Z" fill="#f8fafc" />
                <path d="M0 84 Q50 74 100 82 T200 80 V100 H0 Z" fill="#eef2f8" />
                <path d="M20 84 L26 78 L32 84 M140 82 L146 76 L152 82" stroke="#1e40af" strokeWidth="2" fill="none" />
            </>
        ),
        norwegen: (
            <>
                <path d="M0 30 Q50 20 90 34 T200 26 V0 H0 Z" fill="#86efac" opacity="0.16" />
                <path d="M0 60 L40 22 L64 58 L60 62 L60 100 H0 Z" fill="#475569" />
                <path d="M200 56 L156 20 L128 54 L134 60 L134 100 H200 Z" fill="#526073" />
                <rect x="58" y="58" width="80" height="42" fill="#1d4e6b" />
                <path d="M58 58 H138 M58 66 H138" stroke="#7dd3fc" strokeWidth="1.4" opacity="0.5" />
                <path d="M40 22 L48 32 L38 36 Z M156 20 L164 30 L154 34 Z" fill="#f8fafc" />
            </>
        ),
        rockies: (
            <>
                <path d="M0 80 L28 40 L52 66 L84 16 L120 58 L152 30 L200 74 V100 H0 Z" fill="#57534e" />
                <path d="M84 16 L98 36 L82 42 L74 32 Z M152 30 L162 42 L150 46 Z" fill="#fafaf9" />
                <path d="M0 88 Q60 76 130 86 T200 84 V100 H0 Z" fill="#f5f5f4" />
                {[26, 44, 168, 184].map((x, i) => (
                    <path key={i} d={`M${x} ${80 - (i % 2) * 4} l4 10 h-8 Z`} fill="#264a33" />
                ))}
            </>
        ),
        kanada: (
            <>
                <path d="M0 66 L44 30 L82 60 L128 24 L170 58 L200 44 V100 H0 Z" fill="#4b5d6e" />
                <path d="M44 30 L54 42 L42 46 Z M128 24 L138 38 L126 42 Z" fill="#f8fafc" />
                <ellipse cx="100" cy="88" rx="70" ry="10" fill="#7fb2d9" opacity="0.75" />
                {[20, 40, 62, 140, 162, 182].map((x, i) => (
                    <g key={i}>
                        <path d={`M${x} ${68 - (i % 3) * 3} l6 14 h-12 Z`} fill="#14532d" />
                        <rect x={x - 1} y={80 - (i % 3) * 3} width="2" height="4" fill="#5b3a25" />
                    </g>
                ))}
            </>
        ),
        anden: (
            <>
                <path d="M0 84 L34 30 L48 56 L70 12 L92 50 L110 24 L134 60 L164 20 L200 72 V100 H0 Z" fill="#57606f" />
                <path d="M70 12 L80 28 L66 32 Z M164 20 L172 34 L158 36 Z" fill="#f8fafc" />
                <path d="M0 90 Q80 80 200 88 V100 H0 Z" fill="#e7e5e4" />
                <path d="M120 26 q6 -5 12 0 q-6 2 -12 0" fill="#1c1917" />
            </>
        ),
        japan: (
            <>
                <circle cx="150" cy="26" r="13" fill="#f87171" opacity="0.9" />
                <path d="M30 90 L100 20 L170 90 Z" fill="#64748b" />
                <path d="M84 36 Q100 28 116 36 L108 48 Q100 44 92 48 Z" fill="#f8fafc" />
                <path d="M0 92 Q60 84 200 90 V100 H0 Z" fill="#f1f5f9" />
                <path d="M28 78 h16 M30 78 v12 M42 78 v12 M26 74 h20" stroke="#b91c1c" strokeWidth="2.4" fill="none" />
            </>
        )
    };

    return (
        <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
            {common}
            <rect width="200" height="100" fill={`url(#${gid})`} />
            {scenes[level.id] || scenes.alpen}
        </svg>
    );
};

/**
 * Hauptmenü: Kampagnen-Levelauswahl (9 Länder) + Sandbox-Modus
 * mit frei einstellbarem Landschaftsgenerator.
 */
const MainMenu = ({ onStartLevel }) => {
    const [tab, setTab] = useState('campaign'); // 'campaign' | 'sandbox'
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [hoveredLevel, setHoveredLevel] = useState(null);
    const [progress] = useState(() => loadProgress());
    // Hintergrundbild alle 5 Sekunden weiterschalten
    const [bgIndex, setBgIndex] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setBgIndex(i => (i + 1) % BG_IMAGES.length), 5000);
        return () => clearInterval(id);
    }, []);

    // Sandbox-Einstellungen
    const [sandbox, setSandbox] = useState(() => ({
        gridSize: SANDBOX_DEFAULTS.gridSize,
        startingMoney: SANDBOX_DEFAULTS.startingMoney,
        ...SANDBOX_DEFAULTS.terrain
    }));

    const updateSandbox = (key, value) => setSandbox(prev => ({ ...prev, [key]: value }));

    const startSandbox = () => {
        onStartLevel({
            id: 'sandbox',
            name: 'Sandbox',
            country: 'Freies Spiel',
            flag: '🏔️',
            isSandbox: true,
            gridSize: sandbox.gridSize,
            startingMoney: sandbox.startingMoney,
            terrain: {
                seed: sandbox.seed,
                peakCount: sandbox.peakCount,
                peakHeight: sandbox.peakHeight,
                outerHills: sandbox.outerHills,
                ridges: sandbox.ridges,
                ruggedness: sandbox.ruggedness,
                valleyDepth: sandbox.valleyDepth,
                treeLine: sandbox.treeLine,
                snowLine: sandbox.snowLine,
                glacierLine: sandbox.glacierLine,
                forestDensity: sandbox.forestDensity,
                forestMix: sandbox.forestMix,
                riverCount: sandbox.riverCount,
                riverWidth: sandbox.riverWidth,
                lakeCount: sandbox.lakeCount
            },
            theme: SANDBOX_DEFAULTS.theme,
            objectives: []
        });
    };

    const slider = (label, key, min, max, step = 1, format = (v) => v) => (
        <div className="mm-slider-row" key={key}>
            <div className="mm-slider-label">
                <span>{label}</span>
                <span className="mm-slider-value">{format(sandbox[key])}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step}
                value={sandbox[key] ?? min}
                onChange={(e) => updateSandbox(key, Number(e.target.value))}
            />
        </div>
    );

    return (
        <div className="mm-root">
            {/* ===== HINTERGRUND: Fotos im 5-Sekunden-Takt, weich überblendet ===== */}
            <div className="mm-bgstack" aria-hidden="true">
                {BG_IMAGES.map((src, i) => (
                    <div
                        key={src}
                        className={`mm-bgimg ${i === bgIndex ? 'on' : ''}`}
                        style={{ backgroundImage: `url("${src}")` }}
                    />
                ))}
                <div className="mm-bgveil" />
            </div>

            {/* Logo immer oben links */}
            <img className="mm-logo" src={LOGO} alt="Mountain Tycoon" />

            {/* Moduswahl dezent oben rechts */}
            <div className="mm-modes">
                <button className={`mm-mode ${tab === 'campaign' ? 'on' : ''}`} onClick={() => setTab('campaign')}>Kampagne</button>
                <button className={`mm-mode ${tab === 'sandbox' ? 'on' : ''}`} onClick={() => setTab('sandbox')}>Sandbox</button>
            </div>

            {tab === 'campaign' && (
                <div className="mm-stage">
                    {/* ===== LEVEL-SCROLLER: Hero-Grafiken untereinander, mittig ===== */}
                    <div className="mm-scroller">
                        {CAMPAIGN_LEVELS.map((level) => {
                            const unlocked = isLevelUnlocked(level.index, progress);
                            const completed = progress.completed.includes(level.id);
                            const selected = selectedLevel?.id === level.id;
                            return (
                                <button
                                    key={level.id}
                                    className={`mm-hero ${unlocked ? '' : 'locked'} ${selected ? 'on' : ''}`}
                                    onClick={() => unlocked && setSelectedLevel(selected ? null : level)}
                                    disabled={!unlocked}
                                >
                                    {/* Nummer, Name und Land sind bereits Teil der Grafik */}
                                    <img src={heroFor(level)} alt={level.name} loading="lazy" />
                                    {!unlocked && <span className="mm-hero-lock">Gesperrt</span>}
                                    {completed && unlocked && <span className="mm-hero-done">Geschafft</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* ===== LIFTSCHILD: Infos zum gewaehlten Level ===== */}
                    {selectedLevel && (() => {
                        const base = selectedLevel.terrain.baseAltitude || 0;
                        const summit = base + selectedLevel.terrain.peakHeight;
                        return (
                            <aside className="mm-sign" key={selectedLevel.id}>
                                <div className="mm-sign-hang"><i /><i /></div>
                                <div className="mm-sign-plate">
                                    <button className="mm-sign-close" onClick={() => setSelectedLevel(null)} aria-label="Schliessen">x</button>
                                    <div className="mm-sign-head">
                                        <span className="mm-sign-no">Level {selectedLevel.index + 1}</span>
                                        <h2>{selectedLevel.name}</h2>
                                        <span className="mm-sign-country">{selectedLevel.flag} {selectedLevel.country}</span>
                                    </div>
                                    <p className="mm-sign-tag">{selectedLevel.tagline}</p>
                                    <dl className="mm-sign-facts">
                                        <div><dt>Tal</dt><dd>{base.toLocaleString('de-DE')} m</dd></div>
                                        <div><dt>Gipfel</dt><dd>{summit.toLocaleString('de-DE')} m</dd></div>
                                        <div><dt>Karte</dt><dd>{selectedLevel.gridSize}x{selectedLevel.gridSize}</dd></div>
                                        <div><dt>Kapital</dt><dd>{(selectedLevel.startingMoney / 1e6).toFixed(1)} Mio.</dd></div>
                                    </dl>
                                    <div className="mm-sign-goals">
                                        <h3>Aufgaben</h3>
                                        <ul>
                                            {selectedLevel.objectives.map((obj, i) => (
                                                <li key={i}>{objectiveLabel(obj)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="mm-sign-actions">
                                        <button className="mm-go" onClick={() => onStartLevel(selectedLevel, '3d')}>Starten</button>
                                        <button className="mm-go alt" onClick={() => onStartLevel(selectedLevel, '2d')}>2D</button>
                                    </div>
                                </div>
                            </aside>
                        );
                    })()}
                </div>
            )}

            {tab === 'sandbox' && (
                <div className="mm-sandbox-wrap">
                    <div className="mm-sandbox-inner">
                    <div className="mm-sandbox">
                        <div className="mm-sandbox-col">
                            <h3>🏔️ Berge & Gelände</h3>
                            {slider('Kartengröße', 'gridSize', 128, 384, 16, (v) => `${v}×${v}`)}
                            {slider('Anzahl Gipfel', 'peakCount', 1, 8)}
                            {slider('Gipfelhöhe', 'peakHeight', 200, 1600, 50, (v) => `${v} m`)}
                            {slider('Hügel außen', 'outerHills', 0, 6)}
                            {slider('Bergrücken', 'ridges', 0, 6)}
                            {slider('Schroffheit', 'ruggedness', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
                        </div>
                        <div className="mm-sandbox-col">
                            <h3>🌲 Vegetation & Wasser</h3>
                            {slider('Baumgrenze', 'treeLine', 80, 500, 10, (v) => `${v} m`)}
                            {slider('Schneegrenze', 'snowLine', 0, 200, 5, (v) => v === 0 ? 'überall Schnee' : `${v} m`)}
                            {slider('Walddichte', 'forestDensity', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
                            <div className="mm-slider-row">
                                <div className="mm-slider-label"><span>Waldtyp</span></div>
                                <div className="mm-forest-buttons">
                                    {[['conifer', 'Nadelwald'], ['mixed', 'Mischwald'], ['winter', 'Winterwald']].map(([val, name]) => (
                                        <button
                                            key={val}
                                            className={`mm-mini-btn ${sandbox.forestMix === val ? 'active' : ''}`}
                                            onClick={() => updateSandbox('forestMix', val)}
                                        >{name}</button>
                                    ))}
                                </div>
                            </div>
                            {slider('Flüsse', 'riverCount', 0, 3)}
                            {slider('Flussbreite', 'riverWidth', 1, 5, 0.2, (v) => `${v.toFixed(1)}`)}
                            {slider('Seen', 'lakeCount', 0, 5)}
                            <div className="mm-slider-row">
                                <div className="mm-slider-label">
                                    <span>Gletscher</span>
                                    <span className="mm-slider-value">{sandbox.glacierLine === null ? 'aus' : `ab ${sandbox.glacierLine} m`}</span>
                                </div>
                                <div className="mm-forest-buttons">
                                    <button
                                        className={`mm-mini-btn ${sandbox.glacierLine === null ? 'active' : ''}`}
                                        onClick={() => updateSandbox('glacierLine', null)}
                                    >Aus</button>
                                    <button
                                        className={`mm-mini-btn ${sandbox.glacierLine !== null ? 'active' : ''}`}
                                        onClick={() => updateSandbox('glacierLine', Math.round(sandbox.peakHeight * 0.8))}
                                    >An</button>
                                </div>
                            </div>
                        </div>
                        <div className="mm-sandbox-col">
                            <h3>🎲 Welt & Start</h3>
                            <div className="mm-slider-row">
                                <div className="mm-slider-label">
                                    <span>Seed</span>
                                    <span className="mm-slider-value">{sandbox.seed}</span>
                                </div>
                                <div className="mm-forest-buttons">
                                    <button
                                        className="mm-mini-btn"
                                        onClick={() => updateSandbox('seed', Math.floor(Math.random() * 99999))}
                                    >🎲 Zufällig</button>
                                </div>
                            </div>
                            {slider('Startkapital', 'startingMoney', 250000, 5000000, 250000, (v) => `€${v.toLocaleString()}`)}
                            <div className="mm-sandbox-info">
                                <p>Im Sandbox-Modus gibt es keine Aufgaben — baue frei dein Traum-Skigebiet in deiner selbst generierten Landschaft.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="mm-start-btn" style={{ flex: 2 }} onClick={() => startSandbox('2d')}>
                                    ▶ Spielen
                                </button>
                                <button className="mm-start-btn" style={{ flex: 1, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 6px 24px rgba(168,85,247,0.35)' }} onClick={() => startSandbox('3d')}>
                                    🧊 3D
                                </button>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MainMenu;
