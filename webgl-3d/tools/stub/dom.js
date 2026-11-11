// Minimaler DOM-/Canvas-Stub. Zeichenmethoden sind No-ops, ABER fillStyle
// und measureText verhalten sich echt genug, damit Farb- und Layoutfehler
// im Test auffallen (z.B. das doppelte '#' in Farbwerten).
const ctx2d = () => {
  const state = { width: 10, fillStyle: '#000000', strokeStyle: '#000000',
                  font: '10px sans-serif', shadowColor: '#000', shadowBlur: 0,
                  globalAlpha: 1, lineWidth: 1, badColors: [] };
  const isColor = (v) => typeof v === 'string' &&
    (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v) || /^[a-z]+$/i.test(v));
  return new Proxy(state, {
    get(t, k) {
      if (k === 'measureText') return (s2) => ({ width: String(s2).length * (parseInt(t.font) || 10) * 0.55 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'canvas') return { width: 256, height: 128 };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      if ((k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') && !isColor(v)) {
        t.badColors.push(k + '=' + v);
      }
      t[k] = v; return true;
    }
  });
};
const contexts = [];
global.__canvasContexts = contexts;
global.document = { createElement: () => ({ width: 0, height: 0,
  getContext: () => { const c = ctx2d(); contexts.push(c); return c; } }) };
