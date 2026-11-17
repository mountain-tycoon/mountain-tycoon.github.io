import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { makePlayerSkier } from '../../webgl/SkiFigure.js';
import { OUTFITS, getOutfitId, setOutfitId, outfitById } from '../../webgl/SkiOutfits.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/**
 * Garderobe: Outfit des eigenen Fahrers wählen (für „Selbst fahren").
 * Links dreht sich die Figur im gewählten Outfit, rechts stehen die Outfits von heute bis 1935.
 */
const Wardrobe = () => {
    const canvasRef = useRef(null);
    const [sel, setSel] = useState(() => getOutfitId());
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
            if (shown !== selRef.current) {
                shown = selRef.current;
                if (figure) { pivot.remove(figure); figure.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
                figure = makePlayerSkier(outfitById(shown));
                pivot.add(figure);
            }
            const t = (performance.now() - t0) / 1000;
            pivot.rotation.y = 0.6 + t * 0.6;
            // leichtes Wippen in Fahrhaltung – die Figur steht nicht steif da
            const b = 0.32 + Math.sin(t * 1.6) * 0.06;
            figure.userData.setPose({ bendL: b, bendR: b, lean: 0.22, armX: -0.42, elbow: -0.65, armOut: 0.2, pole: 0.7 });
            renderer.render(scene, camera);
            raf = requestAnimationFrame(frame);
        };
        frame();
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); renderer.dispose(); };
    }, []);

    const choose = (id) => { selRef.current = id; setSel(id); setOutfitId(id); };
    const cur = outfitById(sel);

    return (
        <div className="mm-wardrobe-wrap">
        <div className="mm-wardrobe">
            <div className="mm-wardrobe-stage">
                <canvas ref={canvasRef} />
                <div className="mm-wardrobe-name">
                    <span>{cur.era}</span>
                    <b>{cur.name}</b>
                </div>
            </div>
            <div className="mm-wardrobe-list">
                <h3>Dein Fahrer</h3>
                <p>So bist du unterwegs, wenn du im Spiel auf „Fahren" gehst.</p>
                <div className="mm-wardrobe-grid">
                    {OUTFITS.map(o => (
                        <button key={o.id} className={`mm-outfit ${o.id === sel ? 'on' : ''}`} onClick={() => choose(o.id)}>
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
            </div>
        </div>
        </div>
    );
};

export default Wardrobe;
