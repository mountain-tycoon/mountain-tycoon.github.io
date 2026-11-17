import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { makePlayerSkier } from '../../webgl/SkiFigure.js';
import { OUTFITS, SLOTS, getSelection, setSelection, presetSelection, composeOutfit, selectionKey, outfitById } from '../../webgl/SkiOutfits.js';

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
const Wardrobe = () => {
    const canvasRef = useRef(null);
    const [sel, setSel] = useState(() => getSelection());
    const selRef = useRef(sel);

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
            const key = selectionKey(selRef.current);
            if (shown !== key) {
                shown = key;
                if (figure) { pivot.remove(figure); figure.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
                figure = makePlayerSkier(composeOutfit(selRef.current));
                pivot.add(figure);
            }
            const t = (performance.now() - t0) / 1000;
            pivot.rotation.y = 0.6 + t * 0.6;
            // leichtes Wippen in Fahrhaltung, dazu Fahrtwind in Böen – weite Kleidung flattert sichtbar
            const b = 0.32 + Math.sin(t * 1.6) * 0.06;
            figure.userData.setPose({ bendL: b, bendR: b, lean: 0.22, armX: -0.42, elbow: -0.65, armOut: 0.2, pole: 0.7 });
            figure.userData.setWind(0.55 + 0.4 * Math.sin(t * 0.9), t);
            renderer.render(scene, camera);
            raf = requestAnimationFrame(frame);
        };
        frame();
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); renderer.dispose(); };
    }, []);

    const apply = (next) => { selRef.current = next; setSel(next); setSelection(next); };
    const whole = OUTFITS.find(o => SLOTS.every(sl => sel[sl.key] === o.id)) || null;
    const eras = SLOTS.map(sl => outfitById(sel[sl.key]).era);
    const title = whole ? whole.name : 'Eigene Mischung';
    const sub = whole ? whole.era : [...new Set(eras)].join(' · ');

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
                <h3>Ganzes Outfit</h3>
                <div className="mm-wardrobe-grid">
                    {OUTFITS.map(o => (
                        <button key={o.id} className={`mm-outfit ${whole?.id === o.id ? 'on' : ''}`} onClick={() => apply(presetSelection(o.id))}>
                            <span className="mm-outfit-swatch">
                                <i style={{ background: hex(o.headCol) }} />
                                <i style={{ background: hex(o.jacket) }} />
                                <i style={{ background: hex(o.pants) }} />
                                <i style={{ background: hex(o.ski) }} />
                            </span>
                            <span className="mm-outfit-text">
                                <b>{o.name}</b>
                                <small>{o.era}</small>
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
                            {OUTFITS.map(o => {
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
            </div>
        </div>
        </div>
    );
};

export default Wardrobe;
