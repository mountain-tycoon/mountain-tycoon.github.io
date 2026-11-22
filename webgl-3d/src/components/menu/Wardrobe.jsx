import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { makePlayerSkier } from '../../webgl/SkiFigure.js';
import { OUTFITS, SLOTS, SKI_BRANDS, SPORTS, SPORT_OUTFITS, CANOPIES, getSelection, setSelection, presetSelection, composeOutfit, selectionKey, outfitById,
    getSportChoice, setSportChoice, getCanopyChoice, isUnlocked } from '../../webgl/SkiOutfits.js';
import { loadProgress } from '../../constants/campaign';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
/** Farbfelder, die ein Teil am besten zeigen. */
const SWATCH = {
    head: (o) => [o.headCol, o.headTrim], top: (o) => [o.jacket, o.trim], pants: (o) => [o.pants, o.knee],
    boots: (o) => [o.boot, o.bootDark], ski: (o) => [o.ski, o.skiTop]
};
const FIT = { loose: 'weit', tight: 'eng' };

/**
 * Garderobe: den eigenen Fahrer einkleiden (für „Selbst fahren").
 * Oben ganze Outfits von heute bis 1935, darunter jedes Teil einzeln – alles frei kombinierbar.
 * Links dreht sich die Figur; der Fahrtwind zeigt, wie weit die Kleidung sitzt.
 */
const Wardrobe = ({ welcome = false, onDone = null }) => {
    const canvasRef = useRef(null);
    const [sel, setSel] = useState(() => getSelection());
    const selRef = useRef(sel);
    // Sportart: Alpin ist frei kombinierbar, die anderen haben je eine Handvoll passender Ausrüstungen
    const [sport, setSport] = useState('alpin');
    const [choice, setChoice] = useState(() => Object.fromEntries(Object.keys(SPORT_OUTFITS).map(k => [k, getSportChoice(k)])));
    const viewRef = useRef({ sport: 'alpin', id: '' });
    // Belohnungen: manche Stücke gibt es erst für geschaffte Level (beim Entwickeln und für Admins ist alles frei)
    const [done] = useState(() => {
        let admin = false;
        try { admin = localStorage.getItem('mt.role') === 'admin'; } catch { admin = false; }
        return import.meta.env.DEV || admin ? 99 : loadProgress().completed.length;
    });
    const [canopy, setCanopy] = useState(() => getCanopyChoice());
    const lockNote = (o) => (o.unlock === 1 ? 'nach dem 1. Level' : `nach ${o.unlock} Leveln`);
    useEffect(() => { viewRef.current = { sport, id: choice[sport] || '' }; }, [sport, choice]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        let renderer;
        try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
        catch { return undefined; }                       // kein WebGL: die Auswahl geht auch ohne Vorschau
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7f99, 1.15));
        const sun = new THREE.DirectionalLight(0xfff1dc, 2.1); sun.position.set(-2.5, 5, 4); scene.add(sun);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.05, 40),
            new THREE.MeshStandardMaterial({ color: 0xeef3f9, roughness: 0.9 }));
        disc.position.y = -0.035; scene.add(disc);
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
        camera.position.set(0, 0.95, 3.6); camera.lookAt(0, 0.52, 0);
        const pivot = new THREE.Group(); scene.add(pivot);
        let shown = '', figure = null, raf = 0;
        const size = () => {
            const w = canvas.clientWidth || 300, h = canvas.clientHeight || 360;
            renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
        };
        size();
        window.addEventListener('resize', size);
        const t0 = performance.now();
        const frame = () => {
            const view = viewRef.current;
            const key = view.sport === 'alpin' ? selectionKey(selRef.current) : view.sport + ':' + view.id;
            if (shown !== key) {
                shown = key;
                if (figure) { pivot.remove(figure); figure.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
                figure = makePlayerSkier(composeOutfit(selRef.current, view.sport, view.id));
                figure.userData.setIce(view.sport === 'hockey');
                pivot.add(figure);
            }
            const t = (performance.now() - t0) / 1000;
            pivot.rotation.y = 0.6 + t * 0.6;
            // leichtes Wippen in Fahrhaltung, dazu Fahrtwind in Böen – weite Kleidung flattert sichtbar
            const b = 0.32 + Math.sin(t * 1.6) * 0.06;
            if (view.sport === 'nordic') {
                // Skatingschritt
                const sw = Math.sin(t * 3.2), pl = Math.max(0, sw), pr = Math.max(0, -sw), pol = 0.5 - 0.5 * Math.cos(t * 6.4);
                figure.userData.setPose({ bendL: 0.3 + pr * 0.25, bendR: 0.3 + pl * 0.25, swingL: -pl * 0.2, swingR: -pr * 0.2, outL: 0.13 + pl * 0.36, outR: 0.13 + pr * 0.36, splay: 0.9,
                    lean: 0.42 + pol * 0.2, armX: -1.0 + pol * 1.5, elbow: -0.55 + pol * 0.35, armOut: 0.16, pole: 0.5 + pol * 0.7, roll: -sw * 0.12 });
            } else if (view.sport === 'hockey') {
                figure.userData.setPose({ bendL: 0.36, bendR: 0.36, outL: 0.06, outR: 0.06, splay: 0.3, lean: 0.4, armX: -0.55, armXR: -0.7, elbow: -0.55, armOut: 0.1 });
            } else if (view.sport === 'glider') {
                figure.userData.setPose({ bendL: 0.5, bendR: 0.4, lean: -0.08, armX: -2.5, elbow: -0.45, armOut: 0.3 });
            } else figure.userData.setPose({ bendL: b, bendR: b, lean: 0.22, armX: -0.42, elbow: -0.65, armOut: 0.2, pole: 0.7 });
            figure.userData.setPoles(view.sport !== 'glider');
            figure.userData.setWind(view.sport === 'hockey' ? 0.15 : 0.55 + 0.4 * Math.sin(t * 0.9), t);
            renderer.render(scene, camera);
            raf = requestAnimationFrame(frame);
        };
        frame();
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); renderer.dispose(); };
    }, []);

    const apply = (next) => { selRef.current = next; setSel(next); setSelection(next); };
    const whole = OUTFITS.find(o => SLOTS.every(sl => sel[sl.key] === o.id)) || null;
    const brand = SKI_BRANDS.find(b => b.id === sel.ski) || null;
    const eras = SLOTS.filter(sl => !(sl.key === 'ski' && brand)).map(sl => outfitById(sel[sl.key]).era);
    const kit = sport === 'alpin' ? null : (SPORT_OUTFITS[sport].find(o => o.id === choice[sport]) || SPORT_OUTFITS[sport][0]);
    const sportInfo = SPORTS.find(s => s.id === sport);
    const title = kit ? kit.name : whole ? whole.name : 'Eigene Mischung';
    const sub = kit ? `${sportInfo.name} · ${kit.era}` : (whole ? whole.era : [...new Set(eras)].join(' · ')) + (brand ? ` · ${brand.name}` : '');
    const pickKit = (id) => { setChoice({ ...choice, [sport]: id }); setSportChoice(sport, id); };

    return (
        <div className="mm-wardrobe-wrap">
        <div className="mm-wardrobe">
            <div className="mm-wardrobe-stage">
                <canvas ref={canvasRef} />
                <div className="mm-wardrobe-name">
                    <span>{sub}</span>
                    <b>{title}</b>
                </div>
            </div>
            <div className="mm-wardrobe-list">
                {welcome && (
                    <div className="mm-wardrobe-welcome">
                        <b>Willkommen am Berg!</b>
                        <span>Kleide zuerst deinen Fahrer ein – mit ihm fährst du später selbst durch dein Skigebiet. Ändern kannst du das jederzeit im Menü unter „Fahrer".</span>
                    </div>
                )}
                <div className="mm-sports">
                    {SPORTS.map(s => (
                        <button key={s.id} className={`mm-sport ${sport === s.id ? 'on' : ''}`} onClick={() => setSport(s.id)}>{s.name}</button>
                    ))}
                </div>
                <p className="mm-sport-hint">{sportInfo.hint} Im Spiel legt die Figur die passende Ausrüstung von selbst an.</p>
                {kit && (
                    <div className="mm-wardrobe-grid">
                        {SPORT_OUTFITS[sport].map(o => (
                            <button key={o.id} className={`mm-outfit ${kit.id === o.id ? 'on' : ''} ${isUnlocked(o, done) ? '' : 'locked'}`}
                                    disabled={!isUnlocked(o, done)} onClick={() => pickKit(o.id)}>
                                <span className="mm-outfit-swatch">
                                    <i style={{ background: hex(o.headCol) }} />
                                    <i style={{ background: hex(o.jacket) }} />
                                    <i style={{ background: hex(o.pants) }} />
                                    <i style={{ background: hex(o.ski) }} />
                                </span>
                                <span className="mm-outfit-text">
                                    <b>{o.name}</b>
                                    <small>{isUnlocked(o, done) ? o.era : lockNote(o)}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {sport === 'glider' && (
                    <>
                        <h3 className="mm-wardrobe-h">Schirm</h3>
                        <div className="mm-wardrobe-grid">
                            {CANOPIES.map(c => (
                                <button key={c.id} className={`mm-outfit ${canopy === c.id ? 'on' : ''} ${isUnlocked(c, done) ? '' : 'locked'}`}
                                        disabled={!isUnlocked(c, done)} onClick={() => { setCanopy(c.id); setSportChoice('canopy', c.id); }}>
                                    <span className="mm-outfit-swatch">
                                        {c.cols.slice(0, 4).map((col, i) => <i key={i} style={{ background: hex(col) }} />)}
                                    </span>
                                    <span className="mm-outfit-text">
                                        <b>{c.name}</b>
                                        <small>{isUnlocked(c, done) ? 'Gleitschirm' : lockNote(c)}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
                {!kit && (<>
                <h3>Ganzes Outfit</h3>
                <div className="mm-wardrobe-grid">
                    {OUTFITS.map(o => (
                        <button key={o.id} className={`mm-outfit ${whole?.id === o.id ? 'on' : ''} ${isUnlocked(o, done) ? '' : 'locked'}`}
                                disabled={!isUnlocked(o, done)} onClick={() => apply(presetSelection(o.id))}>
                            <span className="mm-outfit-swatch">
                                <i style={{ background: hex(o.headCol) }} />
                                <i style={{ background: hex(o.jacket) }} />
                                <i style={{ background: hex(o.pants) }} />
                                <i style={{ background: hex(o.ski) }} />
                            </span>
                            <span className="mm-outfit-text">
                                <b>{o.name}</b>
                                <small>{isUnlocked(o, done) ? o.era : lockNote(o)}</small>
                            </span>
                        </button>
                    ))}
                </div>
                <h3 className="mm-wardrobe-h">Einzelteile</h3>
                <p>Jedes Teil lässt sich einzeln tauschen. Weite Kleidung flattert im Fahrtwind, enge nicht.</p>
                {SLOTS.map(sl => (
                    <div className="mm-slot" key={sl.key}>
                        <span className="mm-slot-label">{sl.label}</span>
                        <div className="mm-slot-row">
                            {OUTFITS.filter(o => isUnlocked(o, done)).map(o => {
                                const [c1, c2] = SWATCH[sl.key](o);
                                const fit = sl.fit && FIT[o.fit];
                                return (
                                    <button key={o.id} className={`mm-chip ${sel[sl.key] === o.id ? 'on' : ''}`}
                                            title={`${sl.label}: ${o.name} (${o.era})${fit ? ' · ' + fit : ''}`}
                                            onClick={() => apply({ ...sel, [sl.key]: o.id })}>
                                        <i style={{ background: `linear-gradient(135deg, ${hex(c1)} 0 58%, ${hex(c2)} 58% 100%)` }} />
                                        <small>{o.era}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
                <div className="mm-slot">
                    <span className="mm-slot-label">Skimarke</span>
                    <div className="mm-slot-row">
                        {SKI_BRANDS.map(b => (
                            <button key={b.id} className={`mm-chip wide ${sel.ski === b.id ? 'on' : ''}`} title={`Ski: ${b.name}`}
                                    onClick={() => apply({ ...sel, ski: b.id })}>
                                <i style={{ background: `linear-gradient(135deg, ${hex(b.ski)} 0 58%, ${hex(b.skiTop)} 58% 100%)` }} />
                                <small>{b.name}</small>
                            </button>
                        ))}
                    </div>
                </div>
                </>)}
                {welcome && (
                    <button className="mm-start-btn mm-wardrobe-go" onClick={() => { setSelection(selRef.current); onDone?.(); }}>
                        So fahre ich – los geht’s
                    </button>
                )}
            </div>
        </div>
        </div>
    );
};

export default Wardrobe;
