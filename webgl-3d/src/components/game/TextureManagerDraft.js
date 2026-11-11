
// Texture Generation System
const TextureManager = {
    cache: {},

    getPattern: (ctx, type, color) => {
        const key = `${type}_${color}`;
        if (TextureManager.cache[key]) return TextureManager.cache[key];

        const cvs = document.createElement('canvas');
        const size = 64;
        cvs.width = size; cvs.height = size;
        const c = cvs.getContext('2d');

        // Fill Base
        c.fillStyle = color;
        c.fillRect(0, 0, size, size);

        // Noise Helper
        const noise = (factor = 0.1) => (Math.random() - 0.5) * factor * 255;

        if (type === 'wood') {
            // Wood Grain
            c.fillStyle = 'rgba(0,0,0,0.15)';
            for (let i = 0; i < size; i += 2) {
                if (Math.random() > 0.3) continue;
                c.fillRect(i, 0, 1, size); // Vertical lines
                // Wobble
                if (Math.random() > 0.8) c.clearRect(i, Math.random() * size, 1, 5);
            }
            // Knots
            for (let k = 0; k < 3; k++) {
                c.beginPath();
                c.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 0, Math.PI * 2);
                c.fillStyle = 'rgba(60,40,20,0.3)';
                c.fill();
            }
        } else if (type === 'stone') {
            // Noise
            for (let i = 0; i < size * size / 4; i++) {
                c.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
                c.fillRect(Math.random() * size, Math.random() * size, 2, 2);
            }
        } else if (type === 'snow') {
            // Sparkle/Roughness
            c.fillStyle = 'rgba(255,255,255,0.3)';
            for (let i = 0; i < size * size / 2; i++) {
                c.fillRect(Math.random() * size, Math.random() * size, 1, 1);
            }
            c.fillStyle = 'rgba(200,220,255,0.1)';
            for (let i = 0; i < 20; i++) {
                c.beginPath(); c.arc(Math.random() * size, Math.random() * size, 2, 0, Math.PI * 2); c.fill();
            }
        } else if (type === 'concrete') {
            c.fillStyle = 'rgba(0,0,0,0.05)';
            for (let i = 0; i < size * size / 8; i++) {
                c.fillRect(Math.random() * size, Math.random() * size, 2, 1);
            }
        }

        const pattern = ctx.createPattern(cvs, 'repeat');
        TextureManager.cache[key] = pattern;
        return pattern;
    }
};
