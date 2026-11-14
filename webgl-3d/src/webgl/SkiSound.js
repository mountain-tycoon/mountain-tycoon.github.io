// ============================================================
// TON BEIM SELBSTFAHREN – ohne Tondateien, alles aus Rauschen und
// zwei Summern erzeugt (Web Audio):
//   Fahrtwind      Rauschen, mit dem Tempo lauter und heller
//   Kanten/Schnee  kratziges Band, in der Kurve und beim Bremsen
//   Lift           tiefes Surren während der Bergfahrt, in der Kabine gedämpft
//   Landung        kurzer dumpfer Schlag
// Der Ton startet erst nach einer Eingabe des Spielers (Browser-Regel)
// und lässt sich abschalten; die Wahl bleibt je Gerät gespeichert.
// ============================================================

const KEY = 'mt.skiSound';

export function skiSoundWanted() {
    try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function createSkiSound() {
    let ctx = null, master = null, parts = null;
    let wanted = skiSoundWanted();

    const noiseBuffer = (c) => {
        const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.55 + last * 6; }   // weiß + etwas braun
        return buf;
    };
    const build = () => {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
        const buf = noiseBuffer(ctx);
        const band = (type, freq, q) => {
            const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
            const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
            const g = ctx.createGain(); g.gain.value = 0;
            src.connect(f); f.connect(g); g.connect(master); src.start();
            return { f, g };
        };
        const hum = (freq) => {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
            const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
            const g = ctx.createGain(); g.gain.value = 0;
            o.connect(f); f.connect(g); g.connect(master); o.start();
            return { o, f, g };
        };
        parts = { wind: band('lowpass', 400, 0.4), edge: band('bandpass', 2600, 0.9), lift: hum(58), lift2: hum(87.5) };
        return true;
    };
    const to = (param, value, t = 0.12) => { param.setTargetAtTime(value, ctx.currentTime, t); };

    return {
        wanted: () => wanted,
        /** Ein- oder ausschalten (bleibt gespeichert). */
        setWanted(v) {
            wanted = !!v;
            try { localStorage.setItem(KEY, wanted ? '1' : '0'); } catch { /* privater Modus */ }
            if (ctx) to(master.gain, wanted ? 0.9 : 0, 0.08);
        },
        /** Beim Losfahren aufrufen – aus einer Eingabe des Spielers heraus. */
        start() {
            try {
                if (!ctx && !build()) return;
                if (ctx.state === 'suspended') ctx.resume();
                to(master.gain, wanted ? 0.9 : 0, 0.3);
            } catch { ctx = null; }
        },
        stop() {
            if (!ctx) return;
            to(master.gain, 0, 0.15);
            for (const k of ['wind', 'edge', 'lift', 'lift2']) to(parts[k].g.gain, 0, 0.1);
        },
        /**
         * Je Bild: v Tempo, carve 0…1 (Kurve/Bremsen), air in der Luft, snow Schnee unter den Ski,
         * ride Bergfahrt, cabin in der Kabine (alles gedämpft).
         */
        update(s) {
            if (!ctx || !wanted) return;
            const sp = Math.min(1, s.v / 20);
            const muffle = s.cabin ? 0.3 : 1;
            to(parts.wind.g.gain, (s.ride ? 0.05 : 0.015 + sp * sp * 0.36) * muffle + (s.air ? 0.05 : 0));
            to(parts.wind.f.frequency, s.cabin ? 260 : 320 + sp * 1500);
            const grip = s.ride || s.air || !s.snow ? 0 : Math.min(1, s.carve) * (0.1 + sp * 0.5) + sp * 0.035;
            to(parts.edge.g.gain, grip * 0.5, 0.06);
            to(parts.edge.f.frequency, 1700 + sp * 2200);
            const lift = s.ride ? (s.cabin ? 0.05 : 0.03) : 0;
            to(parts.lift.g.gain, lift, 0.4); to(parts.lift2.g.gain, lift * 0.6, 0.4);
        },
        /** Dumpfer Schlag bei der Landung (strength 0…1). */
        thump(strength) {
            if (!ctx || !wanted) return;
            const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
            o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + 0.4 * Math.min(1, strength), t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
        },
        dispose() { try { ctx?.close(); } catch { /* schon zu */ } ctx = null; }
    };
}
