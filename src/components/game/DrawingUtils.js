import { TILE_SIZE } from '../../constants/game';

// Helper for color darkening
const darkenColor = (color, percent) => {
    if (!color || !color.startsWith('#')) return color;
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(255 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
};

// Helper: Fill polygon with style
// ===== CHALET-WÄNDE =====
// Wände bekommen Alpen-Chalet-Charakter: Farbverlauf, horizontale
// Holzbohlen-Fugen und ein Natursteinsockel am Boden.
// points = [bottomA, bottomB, topB, topA]
const fillWithStyle = (ctx, color, points, shadeFactor, depth) => {
    const grad = ctx.createLinearGradient(points[0].x, points[0].y, points[0].x, points[0].y + depth);
    grad.addColorStop(0, color);
    grad.addColorStop(1, darkenColor(color, 0.2));
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();

    if (shadeFactor < 1.0) {
        ctx.fillStyle = `rgba(0,0,0,${1.0 - shadeFactor * 0.5})`;
        ctx.fill();
    }

    // Chalet-Textur nur bei ausreichendem Zoom (depth ~ Wandhöhe in px)
    if (points.length === 4 && depth > 16) {
        const [bA, bB, tB, tA] = points;
        const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

        // Holzbohlen-Fugen (zwischen Boden- und Oberkante interpoliert)
        ctx.strokeStyle = 'rgba(30, 20, 10, 0.16)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (const t of [0.3, 0.5, 0.7, 0.88]) {
            const l = lerp(bA, tA, t);
            const r = lerp(bB, tB, t);
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(r.x, r.y);
        }
        ctx.stroke();

        // Natursteinsockel (unterste ~16% der Wand)
        const sL = lerp(bA, tA, 0.16);
        const sR = lerp(bB, tB, 0.16);
        ctx.fillStyle = 'rgba(120, 124, 130, 0.55)';
        ctx.beginPath();
        ctx.moveTo(bA.x, bA.y);
        ctx.lineTo(bB.x, bB.y);
        ctx.lineTo(sR.x, sR.y);
        ctx.lineTo(sL.x, sL.y);
        ctx.closePath();
        ctx.fill();
        // Steinfugen
        ctx.strokeStyle = 'rgba(50, 54, 60, 0.35)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (const t of [0.33, 0.66]) {
            const a = { x: bA.x + (bB.x - bA.x) * t, y: bA.y + (bB.y - bA.y) * t };
            const b = { x: sL.x + (sR.x - sL.x) * t, y: sL.y + (sR.y - sL.y) * t };
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
    }

    // Wand-Umriss (Pfad neu aufbauen, da Textur-Pfade dazwischen lagen)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
};



export const drawSteam = (ctx, x, y, width, height, time) => {
    const steamTime = time ? (time / 1500) : (Date.now() / 1500);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 0; i < 6; i++) {
        const phase = (steamTime + i * 0.2) % 1;
        const sX = x + (Math.sin(i * 13 + steamTime) * 0.4) * width;
        const sY = y - phase * 15;
        const sSize = (2 + phase * 5);
        ctx.beginPath();
        ctx.arc(sX, sY, sSize, 0, Math.PI * 2);
        ctx.fill();
    }
};

export const drawChimney = (ctx, x, y, scale, time) => {
    // Draw small stone chimney
    ctx.fillStyle = '#57534e';
    ctx.fillRect(x - 2 * scale, y - 8 * scale, 4 * scale, 8 * scale);
    ctx.fillStyle = '#292524'; // dark top
    ctx.fillRect(x - 2 * scale, y - 9 * scale, 4 * scale, 2 * scale);
    // Smoke
    drawSteam(ctx, x, y - 10 * scale, 3 * scale, 4 * scale, time);
};

export const drawTree = (ctx, x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - w, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + w, y);
    ctx.fill();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath(); ctx.ellipse(x, y + w * 0.2, w, w * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + w * 0.2, w, w * 0.5, 0, 0, Math.PI * 2); ctx.fill();
};

export const drawHedge = (ctx, points, scale, time) => {
    // Draw a green hedge connecting the points
    ctx.strokeStyle = '#15803d'; // Dark green
    ctx.lineWidth = 8 * scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.stroke();

    // Lighter foliage texture
    ctx.strokeStyle = '#4ade80'; // Lighter green
    ctx.lineWidth = 3 * scale;
    ctx.setLineDash([3 * scale, 3 * scale]);
    ctx.stroke();
    ctx.setLineDash([]);
};

const drawIsometricGarageDoor = (ctx, wallPts, scale, openRatio) => {
    // wallPts: [bottom-left, bottom-right, top-right, top-left]
    const pBL = wallPts[0];
    const pBR = wallPts[1];
    const pTR = wallPts[2];
    const pTL = wallPts[3];

    // Helper to interpolate on the wall face
    const lerp2D = (tx, ty) => {
        const x = pBL.x * (1 - tx) * (1 - ty) + pBR.x * tx * (1 - ty) + pTR.x * tx * ty + pTL.x * (1 - tx) * ty;
        const y = pBL.y * (1 - tx) * (1 - ty) + pBR.y * tx * (1 - ty) + pTR.y * tx * ty + pTL.y * (1 - tx) * ty;
        return { x, y };
    };

    // Door occupies central bottom part of the wall (e.g., 10% padding sides, 80% width, 70% height)
    // pBL is (0,0), pBR is (1,0), pTR is (1,1), pTL is (0,1) in UV space?
    // Actually typically U goes 0->1 (Left->Right), V goes 0->1 (Bottom->Top or Top->Bottom)
    // Let's assume standard UV: (0,0)=BL, (1,0)=BR, (1,1)=TR, (0,1)=TL

    const doorW = 0.85; // 85% of wall width (wider)
    const doorH = 0.8; // 80% of wall height
    const padX = (1 - doorW) / 2;

    // Closed Door Vertices (UV)
    const u1 = padX; const v1 = 0; // Bottom Left
    const u2 = padX + doorW; const v2 = 0; // Bottom Right
    const u3 = padX + doorW; const v3 = doorH; // Top Right
    const u4 = padX; const v4 = doorH; // Top Left

    // Project to Screen
    const d1 = lerp2D(u1, v1);
    const d2 = lerp2D(u2, v2);
    const d3 = lerp2D(u3, v3);
    const d4 = lerp2D(u4, v4);

    // Current Door Height (Animation)
    // When openRatio is 0, door is fully down (at v1/v2).
    // Wait, openRatio 1 means OPEN (door rolled up).
    // Rolled up means the bottom edge moves UP.

    const currentH = doorH * (1 - openRatio * 0.9); // Keeps 10% visible when fully open
    // Visual bottom edge moves up
    const vBottom = doorH - currentH; // 0 when closed, increasing when open

    const b1 = lerp2D(u1, vBottom);
    const b2 = lerp2D(u2, vBottom);
    // Top stays same
    const b3 = d3;
    const b4 = d4;

    // Draw Interior (Dark Void behind door)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.moveTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.lineTo(d3.x, d3.y); ctx.lineTo(d4.x, d4.y); ctx.fill();

    // Draw Door Panel
    ctx.fillStyle = '#9ca3af'; // Metal
    ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.lineTo(b4.x, b4.y); ctx.fill();

    // Slat Lines (Horizontal in UV space)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    const numSlats = 8;
    for (let i = 1; i < numSlats; i++) {
        const sltV = vBottom + (currentH / numSlats) * i;
        const sl1 = lerp2D(u1, sltV);
        const sl2 = lerp2D(u2, sltV);
        ctx.beginPath(); ctx.moveTo(sl1.x, sl1.y); ctx.lineTo(sl2.x, sl2.y); ctx.stroke();
    }

    // Frame
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(d1.x, d1.y); ctx.lineTo(d4.x, d4.y); ctx.lineTo(d3.x, d3.y); ctx.lineTo(d2.x, d2.y); ctx.stroke();
};

export const drawWindowOnFace = (ctx, wallPts, u, v, w, h, scale, style = 'standard') => {
    const pBL = wallPts[0];
    const pBR = wallPts[1];
    const pTR = wallPts[2];
    const pTL = wallPts[3];

    const lerp2D = (tx, ty) => {
        const x = pBL.x * (1 - tx) * (1 - ty) + pBR.x * tx * (1 - ty) + pTR.x * tx * ty + pTL.x * (1 - tx) * ty;
        const y = pBL.y * (1 - tx) * (1 - ty) + pBR.y * tx * (1 - ty) + pTR.y * tx * ty + pTL.y * (1 - tx) * ty;
        return { x, y };
    };

    const w1 = lerp2D(u - w / 2, v - h / 2);
    const w2 = lerp2D(u + w / 2, v - h / 2);
    const w3 = lerp2D(u + w / 2, v + h / 2);
    const w4 = lerp2D(u - w / 2, v + h / 2);

    let glassColor = '#f6e05e';
    if (style === 'party') {
        glassColor = (Math.random() > 0.5) ? ['#ff00ff', '#00ffff', '#ffff00'][Math.floor(Math.random() * 3)] : '#444';
    } else if (style === 'luxury') {
        glassColor = '#ecc94b';
    } else if (style === 'rustic') {
        glassColor = '#f6ad55';
    }

    // PERFORMANCE: Gradienten sind teuer — Glow & Glasverlauf nur bei
    // hohem Zoom, sonst günstige Flachfarben.
    const cx = (w1.x + w3.x) / 2;
    const cy = (w1.y + w3.y) / 2;
    const detailed = scale > 0.55;

    if (detailed) {
        // Warmer Lichtschein hinter dem Fenster (gemütliches Chalet-Leuchten)
        const glowR = Math.max(3, Math.abs(w2.x - w1.x)) * 1.4;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glow.addColorStop(0, 'rgba(255, 200, 90, 0.35)');
        glow.addColorStop(1, 'rgba(255, 200, 90, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = glassColor;
    ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(w2.x, w2.y); ctx.lineTo(w3.x, w3.y); ctx.lineTo(w4.x, w4.y); ctx.fill();
    ctx.strokeStyle = (style === 'luxury') ? '#d69e2e' : '#1a202c';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Fensterkreuz (Sprossen) nur bei hohem Zoom
    if (detailed) {
        ctx.strokeStyle = 'rgba(40, 30, 20, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo((w1.x + w4.x) / 2, (w1.y + w4.y) / 2);
        ctx.lineTo((w2.x + w3.x) / 2, (w2.y + w3.y) / 2);
        ctx.moveTo((w1.x + w2.x) / 2, (w1.y + w2.y) / 2);
        ctx.lineTo((w4.x + w3.x) / 2, (w4.y + w3.y) / 2);
        ctx.stroke();
    }

    if (style === 'rustic') {
        ctx.fillStyle = '#c05621'; // Wood box
        ctx.beginPath();
        // Just a simple box at bottom of window
        // Approx based on w1..w2
        const boxH = 4 * scale;

        ctx.beginPath();
        ctx.moveTo(w1.x - 2, w1.y);
        ctx.lineTo(w2.x + 2, w2.y);
        ctx.lineTo(w2.x + 2, w2.y + boxH);
        ctx.lineTo(w1.x - 2, w1.y + boxH);
        ctx.fill();

        // Flowers (dots)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(w1.x + (w2.x - w1.x) * 0.3, w1.y + boxH / 2, 2 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eab308';
        ctx.beginPath(); ctx.arc(w1.x + (w2.x - w1.x) * 0.7, w1.y + boxH / 2, 2 * scale, 0, Math.PI * 2); ctx.fill();
    }
};

export const drawGridOverlay = (ctx, gridSize, scale, isoX, isoY, heightmap, rotation = 0) => {
    // Darker, stronger grid for visibility on snow
    ctx.strokeStyle = 'rgba(20, 30, 50, 0.4)';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();

    const getRotatedIdx = (vi, vj) => {
        let dx = vi, dy = vj;
        if (rotation === 90) { dx = gridSize - 1 - vj; dy = vi; }
        else if (rotation === 180) { dx = gridSize - 1 - vi; dy = gridSize - 1 - vj; }
        else if (rotation === 270) { dx = vj; dy = gridSize - 1 - vi; }
        if (dx < 0 || dx >= gridSize || dy < 0 || dy >= gridSize) return -1;
        return dy * gridSize + dx;
    };

    for (let y = 0; y <= gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const idx1 = getRotatedIdx(x, y);
            const idx2 = getRotatedIdx(x + 1, y);
            if (idx1 === -1 || idx2 === -1) continue;

            const z1 = heightmap[idx1];
            const z2 = heightmap[idx2];
            if (x === gridSize - 1) continue;

            const p1 = { x: isoX(x, y, z1), y: isoY(x, y, z1) };
            const p2 = { x: isoX(x + 1, y, z2), y: isoY(x + 1, y, z2) };

            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
    }

    for (let x = 0; x <= gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            const idx1 = getRotatedIdx(x, y);
            const idx2 = getRotatedIdx(x, y + 1);
            if (idx1 === -1 || idx2 === -1) continue;

            const z1 = heightmap[idx1];
            const z2 = heightmap[idx2];
            if (y === gridSize - 1) continue;

            const p1 = { x: isoX(x, y, z1), y: isoY(x, y, z1) };
            const p2 = { x: isoX(x, y + 1, z2), y: isoY(x, y + 1, z2) };

            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
    }
    ctx.stroke();
};

// 3D Box Helper
const projectPoint = (lX, lY, lZ, cX, cY, cZ, rot, isoX, isoY) => {
    // 1. Rotate local point around center
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rX = lX * cos - lY * sin;
    const rY = lX * sin + lY * cos;

    // 2. Add to World Position
    const wX = cX + rX;
    const wY = cY + rY;
    const wZ = cZ + lZ;

    // 3. Project to Screen
    return { x: isoX(wX, wY, wZ), y: isoY(wX, wY, wZ) };
};

export const drawPistenbully = (ctx, v, scale, rotation, gridSize, isoX, isoY, time) => {
    // Hide entirely when parked inside garage
    if (v.state === 'GARAGE') return;

    // Convert world to visual coordinates
    const toVisual = (dx, dy) => {
        let vi = dx, vj = dy;
        if (rotation === 90) { vi = dy; vj = gridSize - 1 - dx; }
        else if (rotation === 180) { vi = gridSize - 1 - dx; vj = gridSize - 1 - dy; }
        else if (rotation === 270) { vi = gridSize - 1 - dy; vj = dx; }
        return { i: vi, j: vj };
    };

    const { i: vX, j: vY } = toVisual(v.x, v.y);
    const z = v.z + 0.8; // Increased from 0.5 to prevent terrain clipping on slopes

    // Calculate direction vectors for isometric projection
    const p1 = { x: isoX(vX, vY, z), y: isoY(vX, vY, z) };
    const p2 = { x: isoX(vX + 1, vY, z), y: isoY(vX + 1, vY, z) };
    const p4 = { x: isoX(vX, vY + 1, z), y: isoY(vX, vY + 1, z) };

    const uDirX = p2.x - p1.x;
    const uDirY = p2.y - p1.y;
    const vDirX = p4.x - p1.x;
    const vDirY = p4.y - p1.y;

    // Vehicle's forward direction in VISUAL space
    const worldAngle = v.rotation;
    let visualAngle = worldAngle;
    if (rotation === 90) visualAngle = worldAngle - Math.PI / 2;
    else if (rotation === 180) visualAngle = worldAngle - Math.PI;
    else if (rotation === 270) visualAngle = worldAngle - 3 * Math.PI / 2;

    const forwardI = Math.cos(visualAngle) * 0.7;
    const forwardJ = Math.sin(visualAngle) * 0.7;

    // Helper: Darken color for shading
    const darken = (col, amt) => {
        const num = parseInt(col.replace("#", ""), 16);
        const r = Math.max(0, ((num >> 16) & 0xff) - amt);
        const g = Math.max(0, ((num >> 8) & 0xff) - amt);
        const b = Math.max(0, (num & 0xff) - amt);
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    };

    // Helper: Draw a 3D box with CONSISTENT orientation
    const draw3DBox = (offsetI, offsetJ, offsetZ, width, depth, height, color, strongShading = false) => {
        const cx = p1.x + uDirX * offsetI + vDirX * offsetJ;
        const cy = p1.y + uDirY * offsetI + vDirY * offsetJ - offsetZ * scale;

        const hw = width * 0.5;
        const hd = depth * 0.5;

        // 4 floor corners in CONSISTENT order
        const corners = [
            { x: cx - uDirX * hw - vDirX * hd, y: cy - uDirY * hw - vDirY * hd }, // 0: back-left
            { x: cx + uDirX * hw - vDirX * hd, y: cy + uDirY * hw - vDirY * hd }, // 1: back-right
            { x: cx + uDirX * hw + vDirX * hd, y: cy + uDirY * hw + vDirY * hd }, // 2: front-right
            { x: cx - uDirX * hw + vDirX * hd, y: cy - uDirY * hw + vDirY * hd }  // 3: front-left
        ];

        // Find front corner (highest Y = most forward)
        let frontIdx = 0;
        for (let i = 1; i < 4; i++) {
            if (corners[i].y > corners[frontIdx].y) frontIdx = i;
        }

        const h = height * scale;

        // Shading amounts - stronger for better 3D effect
        const darkAmount = strongShading ? 60 : 40;
        const lightAmount = strongShading ? 25 : 30;

        // Draw two visible walls (connected to front corner)
        const leftIdx = (frontIdx + 3) % 4;  // Counter-clockwise from front
        const rightIdx = (frontIdx + 1) % 4; // Clockwise from front

        const front = corners[frontIdx];
        const left = corners[leftIdx];
        const right = corners[rightIdx];

        // LEFT wall (lighter)
        ctx.fillStyle = darken(color, lightAmount);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(front.x, front.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(left.x, left.y - h);
        ctx.lineTo(front.x, front.y - h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // RIGHT wall (darker)
        ctx.fillStyle = darken(color, darkAmount);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(front.x, front.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(right.x, right.y - h);
        ctx.lineTo(front.x, front.y - h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // TOP face (brightest)
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        corners.forEach((c, i) => {
            if (i === 0) ctx.moveTo(c.x, c.y - h);
            else ctx.lineTo(c.x, c.y - h);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        return { cx, cy, front, left, right, corners, h, frontIdx };
    };

    // DRAW PISTENBULLY - Dynamic drawing order based on viewing perspective

    // Calculate blade and tiller positions based on TRAVEL DIRECTION
    const bladeI = forwardI * 1.0;  // Verkleinert von 1.2
    const bladeJ = forwardJ * 1.0;
    // Tiller sollte mittig, aber 1.3 nach hinten und 0.15 nach links
    const leftI = -forwardJ;
    const leftJ = forwardI;
    const tillerI = -forwardI * 1.3 + leftI * 0.15;  // Verkleinert von 1.6 / 0.2
    const tillerJ = -forwardJ * 1.3 + leftJ * 0.15;

    // Determine Y positions for proper depth sorting
    // WICHTIG: Screen-Y berücksichtigt SOWOHL horizontale Position ALS AUCH Z-Höhe!
    // In Iso-Ansicht: höheres Z = weiter oben am Bildschirm = niedrigeres Screen-Y

    // Blade: vorne, niedrig (offsetZ ≈ 2, Mitte bei etwa 7)
    const bladeScreenY = p1.y + uDirY * bladeI + vDirY * bladeJ - 7 * scale;

    // Tiller: hinten, niedrig (offsetZ ≈ 2, Mitte bei etwa 4)
    const tillerScreenY = p1.y + uDirY * tillerI + vDirY * tillerJ - 4 * scale;

    // Chassis: Mitte, HOCH (offsetZ = 6 statt 8)
    const chassisScreenY = p1.y - 10 * scale;

    const chassisY = p1.y; // Keep for reference

    // Helper to draw tiller
    const drawTiller = () => {
        // Tiller should be orthogonal (perpendicular) to travel direction
        const normalizedAngle = ((visualAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const isVerticalTravel = (normalizedAngle > Math.PI / 4 && normalizedAngle < 3 * Math.PI / 4) ||
            (normalizedAngle > 5 * Math.PI / 4 && normalizedAngle < 7 * Math.PI / 4);

        // Invertiert: 90 Grad gedreht
        const tillerWidth = isVerticalTravel ? 1.5 : 0.18;
        const tillerDepth = isVerticalTravel ? 0.18 : 1.5;

        draw3DBox(tillerI, tillerJ, 2, tillerWidth, tillerDepth, 5, '#f59e0b', true);

        // Animated tiller teeth
        const tillerCx = p1.x + uDirX * tillerI + vDirX * tillerJ;
        const tillerCy = p1.y + uDirY * tillerI + vDirY * tillerJ - 5 * scale;
        const tillerTime = time * 0.012;

        for (let i = 0; i < 10; i++) {
            const angle = tillerTime + (i * Math.PI / 5);
            const toothR = 0.35;
            const toothX = tillerCx + Math.cos(angle) * toothR * (uDirX + vDirX) * 0.5;
            const toothY = tillerCy + Math.cos(angle) * toothR * (uDirY + vDirY) * 0.5 - Math.sin(angle) * toothR * 10 * scale;

            ctx.fillStyle = Math.sin(angle) > 0 ? '#d97706' : '#b45309';
            ctx.beginPath();
            ctx.arc(toothX, toothY, 2.5 * scale, 0, Math.PI * 2);
            ctx.fill();
        }

        // STAUB-EFFEKT hinter dem Tiller (VIEL Schneestaub!)
        if (v.state === 'GROOMING' || v.state === 'DRIVING' || v.state === 'RETURNING') {
            const dustParticles = 40;  // Viel mehr Partikel!
            for (let i = 0; i < dustParticles; i++) {
                const dustT = (time * 0.002 + i / dustParticles) % 1;
                const dustDist = dustT * 5 * scale;  // Länge: 5
                const dustSpread = dustT * 70 * scale;  // Breite: 70

                // Position ENTGEGEN der Fahrtrichtung
                const dustX = tillerCx - forwardI * uDirX * dustDist - forwardJ * vDirX * dustDist + (Math.sin(i * 7) * dustSpread);
                const dustY = tillerCy - forwardI * uDirY * dustDist - forwardJ * vDirY * dustDist + (Math.cos(i * 5) * dustSpread * 0.5) + dustT * 5 * scale;

                // Großvolumiger Schneestaub (größere Partikel)
                const dustSize = (3 + dustT * 6) * scale;  // Größer: 3-9 statt 2-6
                const dustAlpha = 0.4 - dustT * 0.4;

                ctx.fillStyle = `rgba(240, 245, 250, ${dustAlpha})`;
                ctx.beginPath();
                ctx.arc(dustX, dustY, dustSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    // Helper to draw blade
    const drawBlade = () => {
        // Blade should be orthogonal (perpendicular) to travel direction
        // Adjust width/depth based on travel angle to keep it orthogonal
        const normalizedAngle = ((visualAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const isVerticalTravel = (normalizedAngle > Math.PI / 4 && normalizedAngle < 3 * Math.PI / 4) ||
            (normalizedAngle > 5 * Math.PI / 4 && normalizedAngle < 7 * Math.PI / 4);

        // Invertiert: 90 Grad gedreht
        const bladeWidth = isVerticalTravel ? 0.7 : 0.1;
        const bladeDepth = isVerticalTravel ? 0.1 : 0.7;

        draw3DBox(bladeI, bladeJ, 2, bladeWidth, bladeDepth, 10, '#2a2a2a', true);
    };

    // Helper to draw chassis and main body
    const drawChassis = () => {
        // 1. TRACKS - Wide caterpillar base (verkleinert)
        const tracks = draw3DBox(0, 0, 0, 1.0, 1.0, 8, '#333333', true);

        // Animated track treads (moving lines)
        if (v.state === 'GROOMING' || v.state === 'DRIVING') {
            const trackTime = time * 0.003;
            const numTreads = 8;

            for (let i = 0; i < numTreads; i++) {
                const treadT = (trackTime + i / numTreads) % 1;

                // Left track
                const leftTrackCornerIdx = (tracks.frontIdx + 3) % 4;
                const leftCorner = tracks.corners[leftTrackCornerIdx];
                const leftFront = tracks.corners[tracks.frontIdx];

                const treadX1 = leftCorner.x + (leftFront.x - leftCorner.x) * treadT;
                const treadY1 = leftCorner.y + (leftFront.y - leftCorner.y) * treadT;

                ctx.strokeStyle = '#444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(treadX1 - 3, treadY1);
                ctx.lineTo(treadX1 + 3, treadY1);
                ctx.stroke();

                // Right track
                const rightTrackCornerIdx = (tracks.frontIdx + 1) % 4;
                const rightCorner = tracks.corners[rightTrackCornerIdx];

                const treadX2 = rightCorner.x + (leftFront.x - rightCorner.x) * treadT;
                const treadY2 = rightCorner.y + (leftFront.y - rightCorner.y) * treadT;

                ctx.beginPath();
                ctx.moveTo(treadX2 - 3, treadY2);
                ctx.lineTo(treadX2 + 3, treadY2);
                ctx.stroke();
            }
        }

        // 2. CHASSIS - Main red body (verkleinert)
        const chassis = draw3DBox(0, 0, 6, 0.6, 0.9, 6, '#dc2626', true);

        // 3. ENGINE BLOCK
        draw3DBox(-forwardI * 0.1, -forwardJ * 0.1, 18, 0.4, 0.35, 5, '#b91c1c', true);

        // 4. CABIN
        const cabin = draw3DBox(forwardI * 0.3, forwardJ * 0.3, 16, 0.4, 0.3, 5, '#ef4444', true);

        // Windshield
        const winW = Math.abs(cabin.right.x - cabin.front.x) * 1.3;
        const winH = cabin.h * 0.65;
        const winX = cabin.front.x;
        const winY = cabin.front.y - cabin.h * 0.7;

        const gradient = ctx.createLinearGradient(winX - winW / 2, winY, winX + winW / 2, winY + winH);
        gradient.addColorStop(0, 'rgba(160, 210, 255, 0.75)');
        gradient.addColorStop(0.5, 'rgba(200, 230, 255, 0.85)');
        gradient.addColorStop(1, 'rgba(140, 190, 230, 0.7)');

        ctx.fillStyle = gradient;
        ctx.strokeStyle = 'rgba(60, 100, 140, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(winX - winW * 0.5, winY, winW, winH);
        ctx.strokeRect(winX - winW * 0.5, winY, winW, winH);

        ctx.strokeStyle = 'rgba(40, 60, 80, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(winX, winY);
        ctx.lineTo(winX, winY + winH);
        ctx.stroke();

        // DIESEL-RAUCH aus dem Chassis (feiner, aber mehr)
        if (v.state === 'GROOMING' || v.state === 'DRIVING' || v.state === 'RETURNING') {
            const exhaustParticles = 12;  // Mehr Partikel (war 8)
            for (let i = 0; i < exhaustParticles; i++) {
                const exhaustT = (time * 0.001 + i / exhaustParticles) % 1;
                const exhaustRise = exhaustT * 30 * scale;  // Steigt nach oben
                const exhaustSpread = Math.sin(exhaustT * Math.PI) * 8 * scale;  // Breitet sich aus

                // Position oben auf dem Chassis
                const exhaustX = p1.x + Math.sin(i * 3) * exhaustSpread;
                const exhaustY = p1.y - 18 * scale - exhaustRise;  // Verringert von 22*scale

                // Feiner Dieselrauch (kleinere Partikel)
                const exhaustSize = (0.5 + exhaustT * 2) * scale;  // Feiner: 0.5-2.5 statt 1-4
                const exhaustAlpha = 0.4 - exhaustT * 0.4;  // Verblasst nach oben

                // Dunkler Dieselrauch (grau-schwarz)
                ctx.fillStyle = `rgba(40, 40, 40, ${exhaustAlpha})`;
                ctx.beginPath();
                ctx.arc(exhaustX, exhaustY, exhaustSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    // Helper to draw entire vehicle (blade, tiller, chassis as ONE unit)
    const drawVehicle = () => {
        // RICHTIG: Niedrigeres Screen-Y = weiter weg = ZUERST zeichnen
        //          Höheres Screen-Y = näher dran = ZULETZT zeichnen (überdeckt andere)
        const vehicleParts = [
            { y: bladeScreenY, draw: drawBlade, name: 'blade' },
            { y: tillerScreenY, draw: drawTiller, name: 'tiller' },
            { y: chassisScreenY, draw: drawChassis, name: 'chassis' }
        ].sort((a, b) => a.y - b.y);  // AUFSTEIGEND: niedrigstes Y zuerst!

        vehicleParts.forEach(part => part.draw());
    };

    // Helper to draw warning light
    const drawWarningLight = () => {
        const lightI = forwardI * 0.3;
        const lightJ = forwardJ * 0.3;
        const lightX = p1.x + uDirX * lightI + vDirX * lightJ;
        const lightY = p1.y + uDirY * lightI + vDirY * lightJ - 26 * scale;  // Verringert von 34*scale
        const lightPulse = 0.5 + Math.sin(time * 0.008) * 0.5;

        ctx.fillStyle = `rgba(255, 140, 0, ${0.15 + lightPulse * 0.25})`;
        ctx.beginPath();
        ctx.arc(lightX, lightY, 10 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 180, 0, ${0.35 + lightPulse * 0.35})`;
        ctx.beginPath();
        ctx.arc(lightX, lightY, 6 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 220, 0, ${0.7 + lightPulse * 0.25})`;
        ctx.beginPath();
        ctx.arc(lightX, lightY, 3.5 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffee00';
        ctx.beginPath();
        ctx.arc(lightX, lightY, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
    };

    // Helper to draw headlights
    const drawHeadlights = () => {
        const hlI = forwardI * 0.7;
        const hlJ = forwardJ * 0.7;
        const hlBase = 18 * scale;  // Verringert von 24*scale

        const hl1X = p1.x + uDirX * (hlI - 0.12) + vDirX * hlJ;
        const hl1Y = p1.y + uDirY * (hlI - 0.12) + vDirY * hlJ - hlBase;
        const hl2X = p1.x + uDirX * (hlI + 0.12) + vDirX * hlJ;
        const hl2Y = p1.y + uDirY * (hlI + 0.12) + vDirY * hlJ - hlBase;

        const beamLength = 60 * scale;
        const beamSpread = 35 * scale;

        const beamGradient = ctx.createRadialGradient(
            hl1X + forwardI * uDirX * 5, hl1Y + forwardI * uDirY * 5, 5 * scale,
            hl1X + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength,
            hl1Y + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength,
            beamSpread
        );
        beamGradient.addColorStop(0, 'rgba(255, 255, 200, 0.4)');
        beamGradient.addColorStop(0.5, 'rgba(255, 255, 220, 0.15)');
        beamGradient.addColorStop(1, 'rgba(255, 255, 240, 0)');

        ctx.fillStyle = beamGradient;
        ctx.beginPath();
        ctx.moveTo(hl1X, hl1Y);
        ctx.lineTo(hl1X + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength - beamSpread * (uDirX * 0.5),
            hl1Y + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength - beamSpread * (uDirY * 0.5));
        ctx.lineTo(hl1X + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength + beamSpread * (uDirX * 0.5),
            hl1Y + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength + beamSpread * (uDirY * 0.5));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = beamGradient;
        ctx.beginPath();
        ctx.moveTo(hl2X, hl2Y);
        ctx.lineTo(hl2X + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength - beamSpread * (uDirX * 0.5),
            hl2Y + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength - beamSpread * (uDirY * 0.5));
        ctx.lineTo(hl2X + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength + beamSpread * (uDirX * 0.5),
            hl2Y + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength + beamSpread * (uDirY * 0.5));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 200, 0.7)';
        ctx.beginPath();
        ctx.arc(hl1X, hl1Y, 5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hl2X, hl2Y, 5 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 240, 0.95)';
        ctx.beginPath();
        ctx.arc(hl1X, hl1Y, 2.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hl2X, hl2Y, 2.5 * scale, 0, Math.PI * 2);
        ctx.fill();
    };

    // Calculate Y positions for lights
    const warningLightY = p1.y + uDirY * (forwardI * 0.3) + vDirY * (forwardJ * 0.3);
    const headlightsY = p1.y + uDirY * (forwardI * 0.7) + vDirY * (forwardJ * 0.7);
    const vehicleY = chassisY; // Use chassis Y as vehicle reference

    // Sort vehicle and lights
    const components = [
        { y: vehicleY, draw: drawVehicle },
        { y: warningLightY, draw: drawWarningLight },
        { y: headlightsY, draw: drawHeadlights }
    ].sort((a, b) => b.y - a.y);

    components.forEach(comp => comp.draw());
};

// ============================================
// DRAW SKI-DOO (Medical Patrol)
// ============================================
// Helper to darken color
const darken = (col, amt) => {
    const num = parseInt(col.replace("#", ""), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - amt);
    const g = Math.max(0, ((num >> 8) & 0xff) - amt);
    const b = Math.max(0, (num & 0xff) - amt);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

// Common Projection Helper
const getSkiDooProjection = (v, globalScale, rotation, gridSize, isoX, isoY) => {
    const scale = globalScale * 0.55;
    const toVisual = (dx, dy) => {
        let vi = dx, vj = dy;
        if (rotation === 90) { vi = dy; vj = gridSize - 1 - dx; }
        else if (rotation === 180) { vi = gridSize - 1 - dx; vj = gridSize - 1 - dy; }
        else if (rotation === 270) { vi = gridSize - 1 - dy; vj = dx; }
        return { i: vi, j: vj };
    };
    return { scale, toVisual };
};

// --- DRAW VEHICLE ONLY ---
export const drawSkiDooVehicle = (ctx, v, globalScale, rotation, gridSize, isoX, isoY, time) => {
    if (!v || v.state === 'GARAGE') return;
    const { scale, toVisual } = getSkiDooProjection(v, globalScale, rotation, gridSize, isoX, isoY);

    const { i: vX, j: vY } = toVisual(v.x, v.y);
    const z = (v.z || 0) + 0.5;

    // Projection Basis
    const p1 = { x: isoX(vX, vY, z), y: isoY(vX, vY, z) };
    const p2 = { x: isoX(vX + 1, vY, z), y: isoY(vX + 1, vY, z) };
    const p4 = { x: isoX(vX, vY + 1, z), y: isoY(vX, vY + 1, z) };
    const uDirX = p2.x - p1.x; const uDirY = p2.y - p1.y;
    const vDirX = p4.x - p1.x; const vDirY = p4.y - p1.y;

    // Visual Rotation
    const worldAngle = v.rotation;
    let visualAngle = worldAngle;
    if (rotation === 90) visualAngle = worldAngle - Math.PI / 2;
    else if (rotation === 180) visualAngle = worldAngle - Math.PI;
    else if (rotation === 270) visualAngle = worldAngle - 3 * Math.PI / 2;

    const forwardI = Math.cos(visualAngle) * 0.7;
    const forwardJ = Math.sin(visualAngle) * 0.7;

    // DrawBox Helper (Scoped)
    const draw3DBox = (offsetI, offsetJ, offsetZ, width, depth, height, color, strongShading = false) => {
        const cx = p1.x + uDirX * offsetI + vDirX * offsetJ;
        const cy = p1.y + uDirY * offsetI + vDirY * offsetJ - offsetZ * scale;
        const hw = width * 0.5; const hd = depth * 0.5;
        const corners = [
            { x: cx - uDirX * hw - vDirX * hd, y: cy - uDirY * hw - vDirY * hd },
            { x: cx + uDirX * hw - vDirX * hd, y: cy + uDirY * hw - vDirY * hd },
            { x: cx + uDirX * hw + vDirX * hd, y: cy + uDirY * hw + vDirY * hd },
            { x: cx - uDirX * hw + vDirX * hd, y: cy - uDirY * hw + vDirY * hd }
        ];
        let frontIdx = 0;
        for (let i = 1; i < 4; i++) { if (corners[i].y > corners[frontIdx].y) frontIdx = i; }
        const h = height * scale;
        const darkAmount = strongShading ? 60 : 40;
        const lightAmount = strongShading ? 25 : 30;
        const leftIdx = (frontIdx + 3) % 4;
        const rightIdx = (frontIdx + 1) % 4;
        const front = corners[frontIdx]; const left = corners[leftIdx]; const right = corners[rightIdx];

        // Draw Sides
        ctx.fillStyle = darken(color, lightAmount); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(front.x, front.y); ctx.lineTo(left.x, left.y); ctx.lineTo(left.x, left.y - h); ctx.lineTo(front.x, front.y - h); ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.fillStyle = darken(color, darkAmount);
        ctx.beginPath(); ctx.moveTo(front.x, front.y); ctx.lineTo(right.x, right.y); ctx.lineTo(right.x, right.y - h); ctx.lineTo(front.x, front.y - h); ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        corners.forEach((c, i) => { if (i === 0) ctx.moveTo(c.x, c.y - h); else ctx.lineTo(c.x, c.y - h); });
        ctx.closePath(); ctx.fill(); ctx.stroke();
        return { cx, cy, h };
    };

    // Tracks
    draw3DBox(0, 0, 0, 0.5, 0.7, 5, '#1f293b', true);
    // Skis
    draw3DBox(forwardI * 0.8, forwardJ * 0.8, 0, 0.6, 0.15, 1.5, '#1f293b', true);
    // Body
    const chassis = draw3DBox(forwardI * 0.2, forwardJ * 0.2, 3, 0.4, 0.8, 4, '#f8fafc', true);
    // Nose
    draw3DBox(forwardI * 0.6, forwardJ * 0.6, 3.5, 0.35, 0.4, 3, '#dc2626', true);

    // Handlebars
    const barX = chassis.cx + uDirX * forwardI * 0.3 + vDirX * forwardJ * 0.3;
    const barY = chassis.cy - chassis.h - 2 * scale;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(barX - 4 * scale, barY); ctx.lineTo(barX + 4 * scale, barY); ctx.stroke();

    // Driver
    const torso = draw3DBox(0, 0, 7, 0.3, 0.3, 2.5, '#1e293b', true);
    // Arms
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.moveTo(torso.cx - 2 * scale, torso.cy - torso.h * 0.8); ctx.lineTo(barX - 3 * scale, barY);
    ctx.moveTo(torso.cx + 2 * scale, torso.cy - torso.h * 0.8); ctx.lineTo(barX + 3 * scale, barY); ctx.stroke();
    // Head
    const headX = torso.cx; const headY = torso.cy - torso.h - 1.5 * scale;
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(headX, headY, 1.8 * scale, 0, Math.PI * 2); ctx.fill();
    // Visor
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(headX + forwardI, headY, 1 * scale, 0, Math.PI * 2); ctx.fill();
    // Windshield
    const winX = barX + forwardI * 2 * scale; const winY = barY - 4 * scale;
    ctx.fillStyle = 'rgba(147, 197, 253, 0.5)';
    ctx.beginPath(); ctx.moveTo(winX - 5 * scale, winY + 5 * scale); ctx.lineTo(winX + 5 * scale, winY + 5 * scale); ctx.lineTo(winX + 4 * scale, winY - 4 * scale); ctx.lineTo(winX - 4 * scale, winY - 4 * scale); ctx.fill();

    // Snow Dust (Only if moving)
    if (v.state === 'DRIVING' || v.state === 'RETURNING' || v.state === 'PATROLLING') {
        const dustCx = p1.x + uDirX * (-forwardI * 0.8) + vDirX * (-forwardJ * 0.8);
        const dustCy = p1.y + uDirY * (-forwardI * 0.8) + vDirY * (-forwardJ * 0.8);
        for (let i = 0; i < 5; i++) {
            const dustT = (time * 0.003 + i / 5) % 1;
            const size = (2 + dustT * 4) * scale;
            const alpha = 0.5 - dustT * 0.5;
            ctx.fillStyle = `rgba(240, 245, 255, ${alpha})`;
            ctx.beginPath(); ctx.arc(dustCx, dustCy - dustT * 10 * scale, size, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Light
    const lightPulse = 0.5 + Math.sin(time * 0.015) * 0.5;
    const lightI = -forwardI * 0.5; const lightJ = -forwardJ * 0.5;
    const lightX = p1.x + uDirX * lightI + vDirX * lightJ;
    const lightY = p1.y + uDirY * lightI + vDirY * lightJ - 12 * scale;
    ctx.fillStyle = `rgba(59, 130, 246, ${0.2 + lightPulse * 0.4})`; ctx.beginPath(); ctx.arc(lightX, lightY, 10 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(37, 99, 235, ${0.6 + lightPulse * 0.4})`; ctx.beginPath(); ctx.arc(lightX, lightY, 3 * scale, 0, Math.PI * 2); ctx.fill();

    // Headlights
    const hlI = forwardI * 0.6;
    const hlJ = forwardJ * 0.6;
    const hlBase = 7 * scale;

    const hlX = p1.x + uDirX * hlI + vDirX * hlJ;
    const hlY = p1.y + uDirY * hlI + vDirY * hlJ - hlBase;

    const beamLength = 40 * scale;
    const beamSpread = 15 * scale;

    const beamGradient = ctx.createRadialGradient(
        hlX + forwardI * uDirX * 5, hlY + forwardI * uDirY * 5, 2 * scale,
        hlX + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength,
        hlY + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength,
        beamSpread
    );
    beamGradient.addColorStop(0, 'rgba(255, 255, 220, 0.4)');
    beamGradient.addColorStop(1, 'rgba(255, 255, 240, 0)');

    ctx.fillStyle = beamGradient;
    ctx.beginPath();
    ctx.moveTo(hlX, hlY);
    ctx.lineTo(hlX + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength - beamSpread * (uDirX * 0.5),
        hlY + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength - beamSpread * (uDirY * 0.5));
    ctx.lineTo(hlX + forwardI * uDirX * beamLength + forwardJ * vDirX * beamLength + beamSpread * (uDirX * 0.5),
        hlY + forwardI * uDirY * beamLength + forwardJ * vDirY * beamLength + beamSpread * (uDirY * 0.5));
    ctx.closePath();
    ctx.fill();
};

// --- DRAW SLED ONLY ---



export const drawSkiDooSled = (ctx, v, globalScale, rotation, gridSize, isoX, isoY) => {
    if (!v || v.state === 'GARAGE') return;
    const { scale, toVisual } = getSkiDooProjection(v, globalScale, rotation, gridSize, isoX, isoY);

    // 1. Calculate Sled Projection
    const { i: sX, j: sY } = toVisual(v.sledX || v.x, v.sledY || v.y);
    const sZ = (v.sledZ || v.z) + 0.5; // Max-Z + clearance already in v.sledZ
    const sP1 = { x: isoX(sX, sY, sZ), y: isoY(sX, sY, sZ) };
    const sP2 = { x: isoX(sX + 1, sY, sZ), y: isoY(sX + 1, sY, sZ) };
    const sP4 = { x: isoX(sX, sY + 1, sZ), y: isoY(sX, sY + 1, sZ) };
    const uDirX = sP2.x - sP1.x; const uDirY = sP2.y - sP1.y;
    const vDirX = sP4.x - sP1.x; const vDirY = sP4.y - sP1.y;

    // Sled Rotation
    const sledWorldAngle = v.sledRotation || v.rotation;
    let sledVisualAngle = sledWorldAngle;
    if (rotation === 90) sledVisualAngle = sledWorldAngle - Math.PI / 2;
    else if (rotation === 180) sledVisualAngle = sledWorldAngle - Math.PI;
    else if (rotation === 270) sledVisualAngle = sledWorldAngle - 3 * Math.PI / 2;

    const sFwdI = Math.cos(sledVisualAngle) * 0.7;
    const sFwdJ = Math.sin(sledVisualAngle) * 0.7;

    // Draw Sled Box Helper
    // Draw Sled Box Helper (Rotated)
    const drawSledBox = (offsetI, offsetJ, offsetZ, width, length, height, color) => {
        // Calculate Rotated Axes
        const cA = Math.cos(sledVisualAngle);
        const sA = Math.sin(sledVisualAngle);

        // Forward Vector in Screen Space (along length)
        const fX = uDirX * cA + vDirX * sA;
        const fY = uDirY * cA + vDirY * sA;

        // Right Vector in Screen Space (along width)
        // Perpendicular (Rotate -90 or +90)
        // Right = (sinA, -cosA) relative to grid?
        // Let's standardise: Right is -90 deg from Forward.
        const rX = uDirX * sA - vDirX * cA;
        const rY = uDirY * sA - vDirY * cA;

        const cx = sP1.x + uDirX * offsetI + vDirX * offsetJ;
        const cy = sP1.y + uDirY * offsetI + vDirY * offsetJ - offsetZ * scale;

        const hw = width * 0.5;
        const hl = length * 0.5;

        // Corners based on Rotated Axes
        // Front-Right, Front-Left, Back-Left, Back-Right
        const corners = [
            { x: cx + fX * hl + rX * hw, y: cy + fY * hl + rY * hw },
            { x: cx + fX * hl - rX * hw, y: cy + fY * hl - rY * hw },
            { x: cx - fX * hl - rX * hw, y: cy - fY * hl - rY * hw },
            { x: cx - fX * hl + rX * hw, y: cy - fY * hl + rY * hw }
        ];

        let fIdx = 0; for (let i = 1; i < 4; i++) { if (corners[i].y > corners[fIdx].y) fIdx = i; }
        const h = height * scale;
        const leftIdx = (fIdx + 3) % 4; const rightIdx = (fIdx + 1) % 4;
        const front = corners[fIdx]; const left = corners[leftIdx]; const right = corners[rightIdx];

        ctx.fillStyle = darken(color, 20); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(front.x, front.y); ctx.lineTo(left.x, left.y); ctx.lineTo(left.x, left.y - h); ctx.lineTo(front.x, front.y - h); ctx.fill(); ctx.stroke();
        ctx.fillStyle = darken(color, 40);
        ctx.beginPath(); ctx.moveTo(front.x, front.y); ctx.lineTo(right.x, right.y); ctx.lineTo(right.x, right.y - h); ctx.lineTo(front.x, front.y - h); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); corners.forEach((c, i) => { if (i === 0) ctx.moveTo(c.x, c.y - h); else ctx.lineTo(c.x, c.y - h); }); ctx.fill(); ctx.stroke();
    };

    // Draw Sled Body & Cover
    // Note: Dimensions swapped relative to axis-aligned?
    // Prior: width=0.6, depth(length)=1.4
    // New: width=0.6, length=1.4
    drawSledBox(0, 0, 1.5, 0.6, 1.4, 2.5, '#dc2626'); // Red
    drawSledBox(0, 0, 4.0, 0.55, 1.1, 1.5, '#e2e8f0'); // Cover

    // 2. Draw Tow Line (From Sled Nose to Vehicle Hitch)
    // Need Vehicle Position for Hitch
    const { i: vX, j: vY } = toVisual(v.x, v.y);
    const vZ = (v.z || 0) + 0.5;
    const vp1 = { x: isoX(vX, vY, vZ), y: isoY(vX, vY, vZ) };
    const vp2 = { x: isoX(vX + 1, vY, vZ), y: isoY(vX + 1, vY, vZ) };
    const vp4 = { x: isoX(vX, vY + 1, vZ), y: isoY(vX, vY + 1, vZ) };
    const vuDirX = vp2.x - vp1.x; const vuDirY = vp2.y - vp1.y;
    const vvDirX = vp4.x - vp1.x; const vvDirY = vp4.y - vp1.y;

    const vWorldAngle = v.rotation;
    let vVisualAngle = vWorldAngle;
    if (rotation === 90) vVisualAngle = vWorldAngle - Math.PI / 2;
    else if (rotation === 180) vVisualAngle = vWorldAngle - Math.PI;
    else if (rotation === 270) vVisualAngle = vWorldAngle - 3 * Math.PI / 2;
    const vFwdI = Math.cos(vVisualAngle) * 0.7;
    const vFwdJ = Math.sin(vVisualAngle) * 0.7;

    const hitchX = vp1.x + vuDirX * (-vFwdI * 0.8) + vvDirX * (-vFwdJ * 0.8);
    const hitchY = vp1.y + vuDirY * (-vFwdI * 0.8) + vvDirY * (-vFwdJ * 0.8) - 2 * scale;

    const sledNoseX = sP1.x + uDirX * (sFwdI * 0.5) + vDirX * (sFwdJ * 0.5);
    const sledNoseY = sP1.y + uDirY * (sFwdI * 0.5) + vDirY * (sFwdJ * 0.5) - 2 * scale;

    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hitchX, hitchY); ctx.lineTo(sledNoseX, sledNoseY); ctx.stroke();
};

export const drawSkiDoo = (ctx, v, globalScale, rotation, gridSize, isoX, isoY, time) => {
    drawSkiDooVehicle(ctx, v, globalScale, rotation, gridSize, isoX, isoY, time);
    drawSkiDooSled(ctx, v, globalScale, rotation, gridSize, isoX, isoY);
};

export const drawBuildingPreview = (ctx, selectedBuilding, hoveredTile, buildingRotation, rotation, gridSize, heightmap, scale, isoX, isoY, sprites, validation) => {
    const { x, y } = hoveredTile;
    const z = heightmap ? (heightmap[y * gridSize + x] || 0) : 0;

    // Determine validation status color
    const isValid = validation?.valid !== false; // Default true (e.g. tools)

    let baseColor = null;
    let strokeColor = null;

    if (!isValid) {
        // Invalid (Red Tint)
        baseColor = '#ef4444';
        strokeColor = '#b91c1c';
    } else {
        // Valid (Default - pass null to let drawPlacedBuilding use natural colors)
        baseColor = null;
        strokeColor = null;
    }

    ctx.save();
    // Ghost Transparency
    ctx.globalAlpha = 0.6;

    // Delegate to unified renderer
    drawPlacedBuilding(ctx, {
        type: selectedBuilding,
        x, y,
        rotation: buildingRotation, // Building's own rotation
        isGhost: true,
        previewColor: baseColor,
        previewStroke: strokeColor
    }, rotation, gridSize, heightmap, isoX, isoY, scale, null, sprites, Date.now());

    ctx.restore();

    // If INVALID, draw explicit warning overlay
    if (!isValid && validation?.reason) {
        const cx = isoX(x + 0.5, y + 0.5, z);
        const cy = isoY(x + 0.5, y + 0.5, z);

        ctx.save();
        // Warning Icon
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${24 * scale}px sans - serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText('⛔', cx, cy - 40 * scale);

        // Reason Text
        ctx.font = `bold ${14 * scale}px sans - serif`;
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText(validation.reason, cx, cy - 60 * scale);
        ctx.fillText(validation.reason, cx, cy - 60 * scale);

        ctx.restore();
    }
};

const drawTerrace = (ctx, p1, p2, p3, p4, scale, type) => {
    // Wooden deck
    ctx.fillStyle = '#d97706'; // Wood
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.fill();

    // Planks details
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        const r = i / 6;
        ctx.beginPath();
        ctx.moveTo(p1.x + (p2.x - p1.x) * r, p1.y + (p2.y - p1.y) * r);
        ctx.lineTo(p4.x + (p3.x - p4.x) * r, p4.y + (p3.y - p4.y) * r);
        ctx.stroke();
    }

    // Railing (simple low fence)
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(p4.x, p4.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
    ctx.stroke();

    // Posts
    ctx.fillStyle = '#78350f';
    [p1, p2, p3, p4].forEach(p => {
        ctx.fillRect(p.x - 2 * scale, p.y - 5 * scale, 4 * scale, 5 * scale);
    });

    // Furniture (Tables + Parasols)
    if (type.hasOutdoorTerrace && scale > 0.3) {
        // Pseudo-random placement based on coordinates
        const seed = (p1.x + p1.y) * 123;
        const numTables = 2 + (seed % 3); // 2 to 4 tables

        for (let i = 0; i < numTables; i++) {
            const t = 0.2 + (i / numTables) * 0.6; // Distribute 20% to 80%
            const tx = p1.x + (p3.x - p1.x) * t + (Math.sin(seed + i) * 10 * scale);
            const ty = p1.y + (p3.y - p1.y) * t + (Math.cos(seed + i) * 5 * scale);

            // Draw Table (Round, Isometric)
            ctx.fillStyle = '#a8a29e'; // Stone/Plastic Table
            ctx.beginPath();
            ctx.ellipse(tx, ty, 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
            ctx.fill();

            // Draw Parasol (Umbrella)
            // Pole
            ctx.strokeStyle = '#57534e';
            ctx.lineWidth = 1.5 * scale;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 15 * scale); ctx.stroke();

            // Canopy (Conical/Pyramid)
            const umbrellaColor = (i % 2 === 0) ? '#ef4444' : '#f59e0b'; // Red or Amber
            ctx.fillStyle = umbrellaColor;

            // Draw as a low cone
            const uW = 10 * scale;
            const uH = 6 * scale; // Height of cone
            const baseH = ty - 12 * scale; // Bottom of canopy

            ctx.beginPath();
            // Isometric circle for base of canopy points?
            // Simpler: Triangle fan or just paths.
            // Left, Right, Top
            // Perspective correct: Ellipse at bottom, point at top.
            ctx.ellipse(tx, baseH, uW, uW * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Shading for lighter top?
            // Let's draw triangle parts to make it look peaked
            ctx.beginPath();
            ctx.moveTo(tx - uW, baseH);
            ctx.lineTo(tx + uW, baseH);
            ctx.lineTo(tx, baseH - uH); // Peak
            ctx.fill();
            // Side curve approximation
            ctx.beginPath();
            ctx.ellipse(tx, baseH, uW, uW * 0.5, 0, 0, Math.PI, false); // Bottom half arc
            ctx.lineTo(tx, baseH - uH); // To peak
            ctx.fill();
        }
    }
};

const drawRoofDetails = (ctx, t1, t2, peakX, peakY, scale, type) => {
    // Snow on ridges
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; // Reduce opacity
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t1.x, t1.y); ctx.lineTo(peakX, peakY);
    ctx.moveTo(t2.x, t2.y); ctx.lineTo(peakX, peakY);
    ctx.stroke();

    // Dormer Window (if wide enough)
    const dist = Math.abs(t2.x - t1.x); // approx width
    if (dist > 40 * scale && (type.rusticStyle || type.category === 'hotel')) {
        const mx = (t1.x + t2.x) * 0.5;
        const my = (t1.y + t2.y) * 0.5;
        const dx = (mx + peakX) * 0.5;
        const dy = (my + peakY) * 0.5;
        return { x: dx, y: dy }; // Return pos for further decoration if needed
    }
    return null;
};

// Start of 3D Sauna Refactor

const drawIsoHut = (ctx, cx, cy, w, d, h, scale, color, time, seed, uDirX, uDirY, vDirX, vDirY) => {
    // 3D Isometric Hut with Dynamic Face Culling - REFACTORED
    // cx, cy is the CENTER of the FLOOR
    // uDirX/Y is the vector for ONE unit of world space (1 tile) projected to screen
    // w, d are dimensions in PIXELS (approximate relative size)

    // Normalize direction vectors to get "Unit Screen Vectors"
    const uLen = Math.sqrt(uDirX * uDirX + uDirY * uDirY);
    const vLen = Math.sqrt(vDirX * vDirX + vDirY * vDirY);
    const ux = (uDirX / uLen);
    const uy = (uDirY / uLen);
    const vx = (vDirX / vLen);
    const vy = (vDirY / vLen);

    // Half-dimensions relative to center
    const hw = w * 0.5;
    const hd = d * 0.5;

    // Floor Corners relative to Center
    // Top (-hw, -hd), Right (+hw, -hd), Bottom (+hw, +hd), Left (-hw, +hd)
    // We project these local coords onto screen vectors ux/uy and vx/vy
    const corners = [
        { id: 0, x: cx - ux * hw - vx * hd, y: cy - uy * hw - vy * hd }, // Top (Back)
        { id: 1, x: cx + ux * hw - vx * hd, y: cy + uy * hw - vy * hd }, // Right
        { id: 2, x: cx + ux * hw + vx * hd, y: cy + uy * hw + vy * hd }, // Bottom (Front)
        { id: 3, x: cx - ux * hw + vx * hd, y: cy - uy * hw + vy * hd }  // Left
    ];

    // Find the corner with the highest Y value (The "Front" corner visually)
    let frontCornerIdx = 0;
    let maxY = corners[0].y;
    for (let i = 1; i < 4; i++) {
        if (corners[i].y > maxY) {
            maxY = corners[i].y;
            frontCornerIdx = i;
        }
    }

    // Identify visible walls
    // The two walls connected to the "Front" corner are always visible in isometric view.
    // If front is corner 2 (Bottom), visible walls are 2->1 (Right Face) and 2->3 (Left Face).
    // Indices wrap: (front), (front+1)%4, (front-1+4)%4

    const cFront = corners[frontCornerIdx];
    const cRight = corners[(frontCornerIdx + 1) % 4]; // Counter-clockwise or Clockwise? Let's assume order 0->1->2->3 is CW or CCW.
    // Order 0(Top)->1(Right)->2(Bottom)->3(Left) is standard Clockwise in screen space (usually).
    // Let's rely on Y-sorting.
    // The visual "Right" wall connects Front to Right-ish corner.
    // The visual "Left" wall connects Front to Left-ish corner.

    // Let's just define the two neighbors.
    const neighbors = [
        corners[(frontCornerIdx + 1) % 4],
        corners[(frontCornerIdx + 3) % 4]
    ];

    // Sort neighbors by X to distinguish Left vs Right visually?
    // Actually, usually we just draw both faces connected to Front.
    // Face 1: Front -> Neighbor 1
    // Face 2: Front -> Neighbor 2

    // Wall Height
    const wallH = h * 0.6;
    const roofH = h * 0.4;

    // Build polygons for walls
    // Draw "Back" faces first? No, we only draw visible ones.
    // 3D volume requires we might see inside if open? No, closed hut.

    // Sort faces by depth? With painter's algorithm on a convex hut, drawing order of visible faces strictly doesn't matter much unless transparent.
    // But let's be consistent: Darker for "Right" side, Lighter for "Left" side usually, or based on light source.
    // Light usually comes from Top-Left. So faces facing Left are bright, faces facing Right are dark.

    neighbors.forEach(n => {
        // Determine brightness based on normal approximation or just X position relative to center?
        // If neighbor.x > front.x, it's a "Right" facing wall (facing South-East). Darker.
        // If neighbor.x < front.x, it's a "Left" facing wall (facing South-West). Lighter.
        const isRight = n.x > cFront.x;
        const shade = isRight ? darkenColor(color, 0.15) : color;

        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(cFront.x, cFront.y);
        ctx.lineTo(n.x, n.y);
        ctx.lineTo(n.x, n.y - wallH);
        ctx.lineTo(cFront.x, cFront.y - wallH);
        ctx.closePath();
        ctx.fill();

        // Window?
        if ((Math.abs(Math.sin(seed * 999)) % 1) > 0.3) {
            ctx.fillStyle = '#4a3b32'; // Frame
            const mx = (cFront.x + n.x) / 2;
            const my = (cFront.y + n.y) / 2 - wallH * 0.5;
            ctx.fillRect(mx - scale, my - scale, 2 * scale, 2 * scale);
        }
    });

    // ROOF
    // Simple Pyramid to center
    const topCenter = { x: cx, y: cy - wallH - roofH }; // Peak
    // Roof eaves extend slightly?
    // Let's just draw roof triangles connecting Peak to corners[visible].
    // Actually, roof covers all corners.
    // Visible roof faces correspond to the visible wall faces.

    // Roof Face 1 (Front -> Neighbor 1 -> Peak)
    const shadeRoof = darkenColor(color, 0.3); // Darker roof
    neighbors.forEach(n => {
        const isRight = n.x > cFront.x;
        ctx.fillStyle = isRight ? darkenColor(shadeRoof, 0.1) : shadeRoof;
        ctx.beginPath();
        ctx.moveTo(cFront.x, cFront.y - wallH);
        ctx.lineTo(n.x, n.y - wallH);
        ctx.lineTo(topCenter.x, topCenter.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // Optional Door on the "Front-most" wall?
    // Let's place it on the lighter wall (Left side usually)
    // corners[3] is Left, corners[2] is Front (usually). Wall 2-3.
    // Dynamic: Find the neighbor with x < cFront.x
    const leftNeighbor = neighbors.find(n => n.x < cFront.x);
    if (leftNeighbor) {
        ctx.fillStyle = '#4a3b32';
        const doorW = w * 0.25;
        const doorH = wallH * 0.7;
        const dx = (cFront.x + leftNeighbor.x) / 2;
        const dy = (cFront.y + leftNeighbor.y) / 2;
        // Project down to floor
        const fx = dx;
        const fy = dy; // Floor point
        const tx = dx;
        const ty = fy - doorH;

        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx, ty);
        ctx.lineWidth = 3 * scale;
        ctx.strokeStyle = '#27201b';
        ctx.stroke();
        // A simple line is enough for a door at this scale
    }
};


export const drawSaunaComplex = (ctx, x, y, gridSize, heightmap, isoX, isoY, scale, rotation, time, type) => {
    // Shared Logic for Sauna Complex
    // Used by both drawPlacedBuilding and drawBuildingPreview

    const worldWidth = (rotation === 90 || rotation === 270) ? type.size.height : type.size.width;
    const worldHeight = (rotation === 90 || rotation === 270) ? type.size.width : type.size.height;

    let visualX = x; let visualY = y;
    let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };

    if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
    else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
    else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }

    const idx = y * gridSize + x;
    const z = heightmap ? (heightmap[idx] || 0) : 0;

    // Base Footprint Corners
    const fullP1 = { x: isoX(visualX, visualY, z), y: isoY(visualX, visualY, z) };
    const fullP2 = { x: isoX(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z), y: isoY(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z) };
    const fullP3 = { x: isoX(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z), y: isoY(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z) };
    const fullP4 = { x: isoX(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z), y: isoY(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z) };

    // Directions for details
    // uDir is vector for 1 unit along "Width" axis
    const uDirX = (fullP2.x - fullP1.x) / worldWidth;
    const uDirY = (fullP2.y - fullP1.y) / worldWidth;
    // vDir is vector for 1 unit along "Height" axis
    const vDirX = (fullP4.x - fullP1.x) / worldHeight;
    const vDirY = (fullP4.y - fullP1.y) / worldHeight;

    // Draw Base Platform (Stone/Snow)
    ctx.fillStyle = '#d6d3d1';
    ctx.beginPath(); ctx.moveTo(fullP1.x, fullP1.y); ctx.lineTo(fullP2.x, fullP2.y); ctx.lineTo(fullP3.x, fullP3.y); ctx.lineTo(fullP4.x, fullP4.y); ctx.fill();
    // ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 1; ctx.stroke(); 

    // Perimeter Hedge
    ctx.fillStyle = '#166534'; // Dark green
    const hedgeH = 6 * scale;
    const stepsW = worldWidth * 2; // Density
    const stepsH = worldHeight * 2;

    // Helper to draw single hedge bush
    const drawBush = (bx, by) => {
        ctx.beginPath();
        // Shift up by hedgeH to float on ground, + jitter?
        ctx.arc(bx, by - hedgeH * 0.5, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
    };

    // Draw hedges along 4 sides
    for (let i = 0; i < stepsW; i++) {
        const t = i / stepsW;
        drawBush(fullP1.x + (fullP2.x - fullP1.x) * t, fullP1.y + (fullP2.y - fullP1.y) * t);
    }
    for (let i = 0; i < stepsH; i++) {
        const t = i / stepsH;
        drawBush(fullP2.x + (fullP3.x - fullP2.x) * t, fullP2.y + (fullP3.y - fullP2.y) * t);
    }
    for (let i = 0; i < stepsW; i++) {
        const t = i / stepsW;
        drawBush(fullP4.x + (fullP3.x - fullP4.x) * t, fullP4.y + (fullP3.y - fullP4.y) * t);
    }
    for (let i = 0; i < stepsH; i++) {
        const t = i / stepsH;
        drawBush(fullP1.x + (fullP4.x - fullP1.x) * t, fullP1.y + (fullP4.y - fullP1.y) * t);
    }

    // Center Logic (based on footprint)
    const cx = (fullP1.x + fullP3.x) / 2;
    const cy = (fullP1.y + fullP3.y) / 2;

    // Draw Pool (Center)
    drawIsoPool(ctx, cx, cy + 5 * scale, 15 * scale, 10 * scale, '#38bdf8', uDirX, uDirY, vDirX, vDirY);
    drawSteam(ctx, cx, cy, 10 * scale, 10 * scale, time);

    // Draw Huts (3D)
    // Adjust offsets to use TILE UNITS (uDirX is 1 tile vector).
    // Sauna 4x4. Center is at (2,2) tiles relative to corner.
    // Hut 1: Back-Left (-0.8 tiles u, -0.8 tiles v)
    // Hut 2: Back-Right (+0.8 tiles u, -0.5 tiles v)
    // Hut 3: Front-Right (+0.5 tiles u, +0.8 tiles v)
    // Note: uDir, vDir are ALREADY vectors for 1 tile.

    // Hut 1: Main (Left-Back)
    const baseSeed = x * 713 + y * 657;
    drawIsoHut(ctx,
        cx - uDirX * 0.8 - vDirX * 0.8,
        cy - uDirY * 0.8 - vDirY * 0.8,
        10 * scale, 8 * scale, 25 * scale, scale, '#78350f', time, baseSeed + 1, uDirX, uDirY, vDirX, vDirY);

    // Hut 2: Bio (Right-Back)
    drawIsoHut(ctx,
        cx + uDirX * 0.8 - vDirX * 0.5,
        cy + uDirY * 0.8 - vDirY * 0.5,
        8 * scale, 8 * scale, 20 * scale, scale, '#92400e', time, baseSeed + 2, uDirX, uDirY, vDirX, vDirY);

    // Hut 3: Relax (Front-Right)
    drawIsoHut(ctx,
        cx + uDirX * 0.5 + vDirX * 0.8,
        cy + uDirY * 0.5 + vDirY * 0.8,
        7 * scale, 7 * scale, 15 * scale, scale, '#b45309', time, baseSeed + 3, uDirX, uDirY, vDirX, vDirY);
};

// Helper to draw specific Snow Cannons
const drawSnowCannon = (ctx, cx, cy, type, scale, time, rotation = 0) => {
    const isSmall = type.id === 'snow_cannon_small';
    const isMedium = type.id === 'snow_cannon_medium';
    const isLarge = type.id === 'snow_cannon_large'; // Lance

    // Map Game Rotation (0,90,180,270) to Canvas Rotation (Radians)
    const rotRad = (rotation * Math.PI) / 180;

    // Common Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isLarge) {
        // SNOW LANCE (Turm - Stick Gun)
        const poleH = 40 * scale;
        const poleW = 2 * scale;

        // Base Unit (Compressor/Valve)
        ctx.fillStyle = '#475569'; // Slate 600
        ctx.fillRect(cx - 3 * scale, cy - 6 * scale, 6 * scale, 6 * scale);
        ctx.fillStyle = '#cbd5e1'; // Slate 300 - Top
        ctx.beginPath(); ctx.moveTo(cx - 3 * scale, cy - 6 * scale); ctx.lineTo(cx + 3 * scale, cy - 6 * scale); ctx.lineTo(cx, cy - 8 * scale); ctx.fill();

        // Pole (Long, thin aluminum)
        ctx.fillStyle = '#cbd5e1'; // Slate 300
        ctx.fillRect(cx - poleW / 2, cy - poleH, poleW, poleH);

        // Head (Nozzle array - Rotatable)
        const headY = cy - poleH;
        ctx.save();
        ctx.translate(cx, headY);
        ctx.rotate(rotRad); // Rotate Head direction
        ctx.rotate(-Math.PI / 6); // Angled Up (Pitch) of the head physically

        ctx.fillStyle = '#64748b'; // Slate 500
        ctx.beginPath();
        ctx.rect(-2 * scale, -8 * scale, 4 * scale, 10 * scale); // Main Head (Vertical-ish)
        ctx.fill();

        // Nozzles (Facing Right in Local Space)
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(2 * scale, -6 * scale, 2 * scale, 2 * scale);
        ctx.fillRect(2 * scale, -2 * scale, 2 * scale, 2 * scale);

        // Mist Effect (Dense Cone)
        if (time) {
            const mistOp = 0.3 + Math.sin(time / 200) * 0.1;
            ctx.fillStyle = `rgba(224, 242, 254, ${mistOp})`;
            ctx.beginPath();
            // Mist flows OUT (Local X+)
            ctx.moveTo(4 * scale, -5 * scale);
            ctx.arc(25 * scale, -5 * scale, 15 * scale, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            for (let i = 0; i < 15; i++) {
                const pT = (time / 200 + i / 15) % 1;
                const spread = pT * 20 * scale;
                // Move in +X direction (Local)
                const px = 4 * scale + pT * 30 * scale;
                const py = -5 * scale + (Math.sin(i * 13) * spread);
                const pSize = (2 + pT * 6) * scale;
                ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();

    } else if (isMedium) {
        // TOWER FAN (Propeller on pole)
        const poleH = 25 * scale;
        const poleW = 3 * scale;

        // Pole
        ctx.fillStyle = '#334155'; // Slate 700
        ctx.fillRect(cx - poleW / 2, cy - poleH, poleW, poleH);

        // Fan Housing (Rotatable)
        const fanY = cy - poleH;
        const fanR = 9 * scale;

        ctx.save();
        ctx.translate(cx, fanY);
        ctx.rotate(rotRad); // Rotate to face direction

        // Draw Fan facing RIGHT (+X)
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 0, fanR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1 * scale; ctx.stroke();
        ctx.fillStyle = '#171717'; ctx.beginPath(); ctx.arc(0, 0, fanR * 0.7, 0, Math.PI * 2); ctx.fill();

        // Spinner Animation
        if (time) {
            ctx.save();
            ctx.rotate(time / 50); // Fast spin
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(-fanR * 0.6, -1 * scale, fanR * 1.2, 2 * scale);
            ctx.fillRect(-1 * scale, -fanR * 0.6, 2 * scale, fanR * 1.2);
            ctx.restore();
        }

        // Snow Jet (Horizontal Cone)
        if (time) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            for (let i = 0; i < 20; i++) {
                const pT = (time / 150 + i / 20) % 1;
                // Cone Direction: Right (0 radians)
                const dist = pT * 50 * scale;
                const spread = pT * 15 * scale;
                const angle = (Math.sin(i * 99) * 0.3); // Jitter

                const px = fanR + dist;
                const py = angle * spread;
                const pSize = (2 + pT * 5) * scale;

                ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();

    } else {
        // MOBILE FAN (Small - Carriage)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotRad);

        // Wheels
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-6 * scale, -4 * scale, 2 * scale, 4 * scale);
        ctx.fillRect(4 * scale, -4 * scale, 2 * scale, 4 * scale);

        // Body (Angled Cylinder)
        ctx.save();
        ctx.translate(0, -6 * scale);
        ctx.rotate(-Math.PI / 8);

        ctx.fillStyle = '#f59e0b'; // Amber 500
        ctx.fillRect(-5 * scale, -6 * scale, 10 * scale, 12 * scale);
        ctx.fillStyle = '#d97706';
        ctx.beginPath(); ctx.ellipse(0, -6 * scale, 5 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#171717'; // Front Output
        ctx.beginPath(); ctx.ellipse(0, 6 * scale, 5 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();

        // Snow Jet from Small Cannon (Down/Right Cone)
        if (time) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            for (let i = 0; i < 15; i++) {
                const pT = (time / 180 + i / 15) % 1;
                const spread = pT * 10 * scale;
                const angle = Math.sin(i * 12) * 0.5;

                const px = 0 + pT * 40 * scale;
                const py = 6 * scale + pT * 20 * scale + (angle * spread);
                const pSize = (3 + pT * 4) * scale;
                ctx.beginPath(); ctx.arc(px, py, pSize, 0, Math.PI * 2); ctx.fill();
            }
        }

        ctx.restore();
        ctx.restore();
    }
};
export const drawPlacedBuilding = (ctx, building, rotation, gridSize, heightmap, isoX, isoY, scale, resort, sprites, time) => {
    const bRot = building.rotation || 0;
    const { x, y, type, previewColor, previewStroke, isGhost } = building;

    // KARTENROTATIONS-Projektion für Renderer, die mit Daten-Koordinaten
    // arbeiten (Parkplatz, Bushaltestelle): Daten → visuell → Bildschirm.
    const isoXR = (wx, wy, wz) => {
        let vi = wx, vj = wy;
        if (rotation === 90) { vi = wy; vj = gridSize - 1 - wx; }
        else if (rotation === 180) { vi = gridSize - 1 - wx; vj = gridSize - 1 - wy; }
        else if (rotation === 270) { vi = gridSize - 1 - wy; vj = wx; }
        return isoX(vi, vj, wz);
    };
    const isoYR = (wx, wy, wz) => {
        let vi = wx, vj = wy;
        if (rotation === 90) { vi = wy; vj = gridSize - 1 - wx; }
        else if (rotation === 180) { vi = gridSize - 1 - wx; vj = gridSize - 1 - wy; }
        else if (rotation === 270) { vi = gridSize - 1 - wy; vj = wx; }
        return isoY(vi, vj, wz);
    };

    // Helper to apply preview styles
    const getStyle = (defaultColor) => previewColor || defaultColor;
    const getStroke = (defaultStroke) => previewStroke || defaultStroke;

    // Override fillStyle if previewColor is present
    const originalFillStyle = ctx.fillStyle;
    const originalStrokeStyle = ctx.strokeStyle;

    // We need to inject this logic into sub-renderers or apply it globally where possible.
    // For many drawing ops, we just use the colors.
    // Let's pass 'building' down if sub-functions need it, or handle it here.

    // === PRIORITY RENDERERS (Override Sprites) ===

    // FUNPARK / SNOWPARK — Kicker, Rail, Airbag & bunte Fahnen
    if (type.isFunPark) {
        const w = type.size.width, h = type.size.height;
        const zOf = (wx, wy) => {
            const ti = Math.max(0, Math.min(gridSize - 1, Math.floor(wx)));
            const tj = Math.max(0, Math.min(gridSize - 1, Math.floor(wy)));
            return (heightmap && heightmap[tj * gridSize + ti]) || 0;
        };
        const pt = (wx, wy, dz = 0) => ({ x: isoXR(wx, wy, zOf(wx, wy) + dz), y: isoYR(wx, wy, zOf(wx, wy) + dz) });

        // Präparierte Fläche (helle Schneedecke mit Rand)
        const c1 = pt(x, y), c2 = pt(x + w, y), c3 = pt(x + w, y + h), c4 = pt(x, y + h);
        ctx.fillStyle = 'rgba(240, 246, 255, 0.85)';
        ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.7)';
        ctx.lineWidth = 1.4 * scale;
        ctx.setLineDash([5 * scale, 4 * scale]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zwei KICKER (Schanzen) als Schneekeile mit Schattenseite
        for (const [kx, ky] of [[x + w * 0.3, y + h * 0.3], [x + w * 0.7, y + h * 0.55]]) {
            const base = pt(kx, ky);
            const lip = pt(kx, ky - 1.1, 9);
            ctx.fillStyle = '#e8eefb';
            ctx.beginPath();
            ctx.moveTo(base.x - 7 * scale, base.y);
            ctx.lineTo(lip.x - 4 * scale, lip.y);
            ctx.lineTo(lip.x + 4 * scale, lip.y);
            ctx.lineTo(base.x + 7 * scale, base.y);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.beginPath();
            ctx.moveTo(lip.x - 4 * scale, lip.y);
            ctx.lineTo(lip.x + 4 * scale, lip.y);
            ctx.lineTo(base.x + 7 * scale, base.y);
            ctx.lineTo(base.x + 2 * scale, base.y);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
            ctx.lineWidth = 0.7 * scale;
            ctx.stroke();
        }

        // RAIL (Stange auf Stützen)
        {
            const rA = pt(x + w * 0.25, y + h * 0.75, 4);
            const rB = pt(x + w * 0.6, y + h * 0.85, 4);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.8 * scale;
            ctx.beginPath(); ctx.moveTo(rA.x, rA.y); ctx.lineTo(rB.x, rB.y); ctx.stroke();
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.2 * scale;
            for (const rp of [rA, rB]) {
                ctx.beginPath(); ctx.moveTo(rp.x, rp.y); ctx.lineTo(rp.x, rp.y + 5 * scale); ctx.stroke();
            }
        }

        // AIRBAG (großes rotes Luftkissen)
        {
            const ab = pt(x + w * 0.75, y + h * 0.2);
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.ellipse(ab.x, ab.y - 2 * scale, 8 * scale, 4 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath();
            ctx.ellipse(ab.x - 2 * scale, ab.y - 3.4 * scale, 3.5 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Bunte FAHNEN am Rand (animiert wehend)
        if (scale > 0.3) {
            const flagColors = ['#f97316', '#22c55e', '#3b82f6', '#eab308'];
            for (let fIdx = 0; fIdx < 4; fIdx++) {
                const fx = x + (fIdx % 2 === 0 ? 0.5 : w - 0.5);
                const fy = y + (fIdx < 2 ? 0.5 : h - 0.5);
                const fp2 = pt(fx, fy);
                ctx.strokeStyle = '#64748b';
                ctx.lineWidth = 1 * scale;
                ctx.beginPath(); ctx.moveTo(fp2.x, fp2.y); ctx.lineTo(fp2.x, fp2.y - 11 * scale); ctx.stroke();
                const wave = Math.sin((time || 0) / 300 + fIdx * 1.7) * 1.6 * scale;
                ctx.fillStyle = flagColors[fIdx];
                ctx.beginPath();
                ctx.moveTo(fp2.x, fp2.y - 11 * scale);
                ctx.lineTo(fp2.x + 5.5 * scale, fp2.y - 9.6 * scale + wave);
                ctx.lineTo(fp2.x, fp2.y - 8.2 * scale);
                ctx.closePath(); ctx.fill();
            }
        }
        return;
    }

    // SAUNA COMPLEX (Shared Renderer)
    if (type.isSaunaComplex) {
        drawSaunaComplex(ctx, x, y, gridSize, heightmap, isoX, isoY, scale, rotation, time, type);
        return;
    }

    // SNOW CANNONS (Shared Renderer)
    if (type.isSnowCannon) {
        // Calculate visual coordinates based on map rotation
        let visualX = x; let visualY = y;
        if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; }
        else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; }
        else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; }

        const idx = y * gridSize + x;
        const z = heightmap ? (heightmap[idx] || 0) : 0;

        const cx = isoX(visualX + 0.5, visualY + 0.5, z);
        const cy = isoY(visualX + 0.5, visualY + 0.5, z);
        drawSnowCannon(ctx, cx, cy, type, scale, time, building.rotation || 0);
        return;
    }

    // RESERVOIR (Stausee - Custom Renderer)
    if (type.isReservoir) {
        const bRot = building.rotation || 0;
        const isRotated = bRot === 90 || bRot === 270;
        const worldWidth = isRotated ? type.size.height : type.size.width;
        const worldHeight = isRotated ? type.size.width : type.size.height;

        let visualX = x; let visualY = y;
        let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
        if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
        else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
        else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }

        const idx = y * gridSize + x;
        // const z = heightmap ? (heightmap[idx] || 0) : 0; // OLD: Ground Z at top-left

        // NEW: Scan footprint for Max Z to prevent burial
        let localMinZ = 99999;
        let localMaxZ = -99999;
        if (heightmap) {
            for (let dx = 0; dx < worldWidth; dx++) {
                for (let dy = 0; dy < worldHeight; dy++) {
                    const tIdx = (y + dy) * gridSize + (x + dx);
                    const h = heightmap[tIdx];
                    if (h < localMinZ) localMinZ = h;
                    if (h > localMaxZ) localMaxZ = h;
                }
            }
        } else {
            localMinZ = 0; localMaxZ = 0;
        }

        const drawZ = localMaxZ; // Sit on top of the highest point

        // 4 Corners of the footprint (at DRAW Z level)
        const p1 = { x: isoX(visualX, visualY, drawZ), y: isoY(visualX, visualY, drawZ) };
        const p2 = { x: isoX(visualX + u.x * worldWidth, visualY + u.y * worldWidth, drawZ), y: isoY(visualX + u.x * worldWidth, visualY + u.y * worldWidth, drawZ) };
        const p3 = { x: isoX(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, drawZ), y: isoY(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, drawZ) };
        const p4 = { x: isoX(visualX + v.x * worldHeight, visualY + v.y * worldHeight, drawZ), y: isoY(visualX + v.x * worldHeight, visualY + v.y * worldHeight, drawZ) };

        const center = {
            x: (p1.x + p3.x) / 2,
            y: (p1.y + p3.y) / 2
        };

        // CONCRETE BASIN (Round/Oval shape fitting footprint)
        // Use an ellipse that fits the 8x8 area approx
        // Isometric Circle is an ellipse with 2:1 ratio (roughly, dependent on projection)
        // Since we are 8x8, it's a circle in world space.

        // Radius in pixels
        // Dimensions
        const sizePx = Math.abs(p2.x - p1.x);
        const rOuter = sizePx * 0.45;
        const rInner = rOuter * 0.85;

        // Vertical Configuration
        const rimHeight = 3 * scale; // Low rim above ground (0.15m)
        const poolDepth = 20 * scale; // Deep hole (1m)

        const yGround = center.y;
        const yRim = center.y - rimHeight;
        const yWater = center.y - rimHeight + poolDepth; // Visual Y position of water (Projected Z down)


        const foundationDepth = (localMaxZ - localMinZ) * 15 * scale;
        if (foundationDepth > 1) {
            ctx.fillStyle = '#475569';
            ctx.beginPath();
            ctx.ellipse(center.x, yGround, rOuter, rOuter * 0.5, 0, 0, Math.PI, false);
            ctx.lineTo(center.x + rOuter, yGround + foundationDepth);
            ctx.ellipse(center.x, yGround + foundationDepth, rOuter, rOuter * 0.5, 0, 0, Math.PI, false);
            ctx.lineTo(center.x - rOuter, yGround);
            ctx.fill();
        }

        // 2. OUTER WALL / RIM SIDE
        ctx.fillStyle = '#64748b'; // Slate 500
        ctx.beginPath();
        ctx.ellipse(center.x, yGround, rOuter, rOuter * 0.5, 0, 0, Math.PI * 2); // Bottom
        ctx.lineTo(center.x + rOuter, yRim);
        ctx.ellipse(center.x, yRim, rOuter, rOuter * 0.5, 0, 0, Math.PI * 2); // Top
        ctx.lineTo(center.x - rOuter, yGround);
        ctx.fill();

        // 3. TOP RIM SURFACE
        ctx.fillStyle = '#94a3b8'; // Light Slate
        ctx.beginPath();
        ctx.ellipse(center.x, yRim, rOuter, rOuter * 0.5, 0, 0, Math.PI * 2); // Outer edge
        ctx.ellipse(center.x, yRim, rInner, rInner * 0.5, 0, 0, Math.PI * 2, true); // Inner hole (counter-clockwise)
        ctx.fill();

        // 4. INNER BASIN (HOLE) - Uses Clipping!
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(center.x, yRim, rInner, rInner * 0.5, 0, 0, Math.PI * 2);
        ctx.clip(); // Mask everything outside the hole

        // 4a. Inner Walls (Dark Shadow)
        ctx.fillStyle = '#334155'; // Dark Slate
        ctx.beginPath();
        ctx.ellipse(center.x, yRim, rInner, rInner * 0.5, 0, 0, Math.PI * 2); // Top rim
        // Extend downward large amount to cover depth
        const deepY = yWater + 100 * scale;
        ctx.lineTo(center.x + rInner, deepY);
        ctx.ellipse(center.x, deepY, rInner, rInner * 0.5, 0, 0, Math.PI * 2); // Bottom fill
        ctx.lineTo(center.x - rInner, yRim);
        ctx.fill();

        // 4b. Water Surface
        ctx.fillStyle = '#0ea5e9'; // Water Blue
        ctx.beginPath();
        ctx.ellipse(center.x, yWater, rInner, rInner * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 4c. Water Ripples
        const numRipples = 15;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5 * scale;
        const t = time || Date.now();
        for (let i = 0; i < numRipples; i++) {
            // Random position within the ellipse
            const angle = (i * 137.5) + t * 0.001;
            const dist = ((i * 19) % 100) / 100 * rInner * 0.8;

            // Convert polar to cartesian
            const rx = Math.cos(angle) * dist;
            const ry = Math.sin(angle) * dist * 0.5;

            const ripX = center.x + rx;
            const ripY = yWater + ry;

            ctx.beginPath();
            ctx.moveTo(ripX - 5 * scale, ripY);
            ctx.lineTo(ripX + 5 * scale, ripY);
            ctx.stroke();
        }

        ctx.restore(); // End Clipping



        return;
    }

    // Therme Complex
    if (type.isThermeComplex) {
        // These p1-p4 variables are not defined here, they are defined later in the procedural rendering section.
        // This block needs to be self-contained or rely on the same setup.
        // Let's define them based on the full footprint for custom renderers.
        const bRot = building.rotation || 0;
        const isRotated = bRot === 90 || bRot === 270;
        const worldWidth = isRotated ? type.size.height : type.size.width;
        const worldHeight = isRotated ? type.size.width : type.size.height;
        let visualX = x; let visualY = y;
        let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
        if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
        else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
        else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }
        const idx = y * gridSize + x;
        const z = (heightmap && heightmap[idx]) || 0;

        const fullP1 = { x: isoX(visualX, visualY, z), y: isoY(visualX, visualY, z) };
        const fullP2 = { x: isoX(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z), y: isoY(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z) };
        const fullP3 = { x: isoX(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z), y: isoY(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z) };
        const fullP4 = { x: isoX(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z), y: isoY(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z) };

        // Isometric vectors for drawing details
        const uDirX = (fullP2.x - fullP1.x) / worldWidth;
        const uDirY = (fullP2.y - fullP1.y) / worldWidth;
        const vDirX = (fullP4.x - fullP1.x) / worldHeight;
        const vDirY = (fullP4.y - fullP1.y) / worldHeight;
        const shrunkWidth = worldWidth * TILE_SIZE * scale * 0.6; // Use 60% of width for main dome building

        // Stone Deck (Full Resort Grounds)
        ctx.fillStyle = '#e5e5e5'; // Lighter stone
        ctx.beginPath(); ctx.moveTo(fullP1.x, fullP1.y); ctx.lineTo(fullP2.x, fullP2.y); ctx.lineTo(fullP3.x, fullP3.y); ctx.lineTo(fullP4.x, fullP4.y); ctx.fill();
        ctx.strokeStyle = '#a3a3a3'; ctx.lineWidth = 1; ctx.stroke();

        // HEDGE PERIMETER
        const hedgeSize = 5 * scale;
        const hedgeColor = '#166534';
        const numHedge = Math.floor(worldWidth * 1.5) + Math.floor(worldHeight * 1.5);
        for (let i = 0; i < numHedge; i++) {
            const r = i / numHedge;
            // Draw along P1->P2, P2->P3, P3->P4, P4->P1?
            // Actually just the perimeter.
            // Let's draw dots along the perimeter.
            // P1-P2
            drawTree(ctx, fullP1.x + (fullP2.x - fullP1.x) * r, fullP1.y + (fullP2.y - fullP1.y) * r, hedgeSize, hedgeSize * 1.5, hedgeColor);
            drawTree(ctx, fullP2.x + (fullP3.x - fullP2.x) * r, fullP2.y + (fullP3.y - fullP2.y) * r, hedgeSize, hedgeSize * 1.5, hedgeColor);
            drawTree(ctx, fullP3.x + (fullP4.x - fullP3.x) * r, fullP3.y + (fullP4.y - fullP3.y) * r, hedgeSize, hedgeSize * 1.5, hedgeColor);
            drawTree(ctx, fullP4.x + (fullP1.x - fullP4.x) * r, fullP4.y + (fullP1.y - fullP4.y) * r, hedgeSize, hedgeSize * 1.5, hedgeColor);
        }

        // Green Areas (Park-like)
        ctx.fillStyle = '#dcfce7'; // Very light green
        const parkMargin = 30 * scale;

        // Redesign: Large Round Steaming Pool (No Dome)
        const poolCX = fullP1.x + (fullP2.x - fullP1.x) * 0.5 + (fullP4.x - fullP1.x) * 0.5;
        const poolCY = fullP1.y + (fullP2.y - fullP1.y) * 0.5 + (fullP4.y - fullP1.y) * 0.5;
        const poolR = shrunkWidth * 0.45;

        // Pool Water
        ctx.fillStyle = '#0ea5e9'; // Warm Blue
        ctx.beginPath();
        // Isometric Circle (Ellipse) 2:1 ratio
        ctx.ellipse(poolCX, poolCY, poolR, poolR * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pool Rim
        ctx.strokeStyle = '#e5e5e5'; // Stone rim
        ctx.lineWidth = 4 * scale;
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8'; // Water edge highlight
        ctx.lineWidth = 2 * scale;
        ctx.stroke();

        // Steam!
        drawSteam(ctx, poolCX, poolCY - 10 * scale, poolR * 0.8, poolR * 0.4, time);

        // === ADDITIONAL POOLS ===
        // Large outdoor warm pool (Front Right)
        const pPool1X = fullP1.x + (fullP2.x - fullP1.x) * 0.8 + (fullP4.x - fullP1.x) * 0.2;
        const pPool1Y = fullP1.y + (fullP2.y - fullP1.y) * 0.8 + (fullP4.y - fullP1.y) * 0.2;
        drawIsoPool(ctx, pPool1X, pPool1Y, 35 * scale, 25 * scale, '#0ea5e9', uDirX, uDirY, vDirX, vDirY);
        drawSteam(ctx, pPool1X, pPool1Y, 20 * scale, 15 * scale, time);

        // Kids pool? (Back Left)
        const pPool2X = fullP1.x + (fullP2.x - fullP1.x) * 0.2 + (fullP4.x - fullP1.x) * 0.8;
        const pPool2Y = fullP1.y + (fullP2.y - fullP1.y) * 0.2 + (fullP4.y - fullP1.y) * 0.8;
        drawIsoPool(ctx, pPool2X, pPool2Y, 20 * scale, 20 * scale, '#67e8f9', uDirX, uDirY, vDirX, vDirY);

        // === SMALL HUTS / SAUNAS ===
        // Sauna 1 (Back Right Corner)
        const hut1CX = fullP1.x + (fullP2.x - fullP1.x) * 0.85 + (fullP4.x - fullP1.x) * 0.85;
        const hut1CY = fullP1.y + (fullP2.y - fullP1.y) * 0.85 + (fullP4.y - fullP1.y) * 0.85;
        drawIsoHut(ctx, hut1CX, hut1CY, 10 * scale, 8 * scale, 18 * scale, scale, '#78350f', time, 123, uDirX, uDirY, vDirX, vDirY);

        // Sauna 2 (Front Left Corner)
        const hut2CX = fullP1.x + (fullP2.x - fullP1.x) * 0.15 + (fullP4.x - fullP1.x) * 0.15;
        const hut2CY = fullP1.y + (fullP2.y - fullP1.y) * 0.15 + (fullP4.y - fullP1.y) * 0.15;
        drawIsoHut(ctx, hut2CX, hut2CY, 8 * scale, 8 * scale, 15 * scale, scale, '#92400e', time, 456, uDirX, uDirY, vDirX, vDirY);

        // === TREES / VEGETATION ===
        ctx.fillStyle = '#166534'; // Tree green
        // Safe locations avoiding 0.8/0.2 (Pool 1) and 0.2/0.8 (Pool 2)
        const treeLocs = [
            { u: 0.1, v: 0.4 }, { u: 0.05, v: 0.5 }, { u: 0.2, v: 0.5 }, // Left Side (near hut2 but safe)
            { u: 0.9, v: 0.6 }, { u: 0.95, v: 0.5 }, { u: 0.8, v: 0.5 }, // Right Side
            { u: 0.4, v: 0.1 }, { u: 0.5, v: 0.1 },                      // Top Side
            { u: 0.4, v: 0.9 }, { u: 0.5, v: 0.9 }                       // Bottom Side
        ];

        treeLocs.forEach(tl => {
            const tx = fullP1.x + (fullP2.x - fullP1.x) * tl.u + (fullP4.x - fullP1.x) * tl.v;
            const ty = fullP1.y + (fullP2.y - fullP1.y) * tl.u + (fullP4.y - fullP1.y) * tl.v;
            // Simple Cone Tree
            const treeW = 8 * scale;
            const treeH = 20 * scale;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx - treeW, ty);
            ctx.lineTo(tx, ty - treeH);
            ctx.lineTo(tx + treeW, ty);
            ctx.fill();
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.beginPath(); ctx.ellipse(tx, ty + 2 * scale, treeW, treeW * 0.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#166534'; // Reset
        });

        return;
    }

    // Ice Rink
    if (type.isOutdoorRink) {
        // These p1-p4 variables are not defined here, they are defined later in the procedural rendering section.
        // This block needs to be self-contained or rely on the same setup.
        // Let's define them based on the full footprint for custom renderers.
        const bRot = building.rotation || 0;
        const isRotated = bRot === 90 || bRot === 270;
        const worldWidth = isRotated ? type.size.height : type.size.width;
        const worldHeight = isRotated ? type.size.width : type.size.height;
        let visualX = x; let visualY = y;
        let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
        if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
        else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
        else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }
        const idx = y * gridSize + x;
        const z = (heightmap && heightmap[idx]) || 0;

        const fullP1 = { x: isoX(visualX, visualY, z), y: isoY(visualX, visualY, z) };
        const fullP2 = { x: isoX(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z), y: isoY(visualX + u.y * worldWidth, visualY + u.y * worldWidth, z) };
        const fullP3 = { x: isoX(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z), y: isoY(visualX + u.y * worldWidth + v.y * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z) };
        const fullP4 = { x: isoX(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z), y: isoY(visualX + v.y * worldHeight, visualY + v.y * worldHeight, z) };
        const shrunkWidth = worldWidth * TILE_SIZE * scale * 0.8; // Use 80% of width for main building/rink

        // Isometric vectors for drawing details
        const uDirX = (fullP2.x - fullP1.x) / worldWidth;
        const uDirY = (fullP2.y - fullP1.y) / worldWidth;
        const vDirX = (fullP4.x - fullP1.x) / worldHeight;
        const vDirY = (fullP4.y - fullP1.y) / worldHeight;

        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath(); ctx.moveTo(fullP1.x, fullP1.y); ctx.lineTo(fullP2.x, fullP2.y); ctx.lineTo(fullP3.x, fullP3.y); ctx.lineTo(fullP4.x, fullP4.y); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
            const ratio = i / 6;
            ctx.beginPath();
            ctx.moveTo(fullP1.x + (fullP2.x - fullP1.x) * ratio, fullP1.y + (fullP2.y - fullP1.y) * ratio);
            ctx.lineTo(fullP4.x + (fullP3.x - fullP4.x) * ratio, fullP4.y + (fullP3.y - fullP4.y) * ratio);
            ctx.stroke();
        }
        const rinkCX = (fullP1.x + fullP3.x) / 2; const rinkCY = (fullP1.y + fullP3.y) / 2;
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        // Isometric Circle (Ellipse)
        ctx.ellipse(rinkCX, rinkCY, shrunkWidth * 0.15, shrunkWidth * 0.15 * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 4 * scale; ctx.beginPath();
        ctx.moveTo(fullP1.x, fullP1.y); ctx.lineTo(fullP2.x, fullP2.y); ctx.lineTo(fullP3.x, fullP3.y); ctx.lineTo(fullP4.x, fullP4.y); ctx.closePath(); ctx.stroke();

        // RENTAL HUT
        // Place on the side (e.g., top-left corner relative to rink)
        const hutCX = fullP1.x + (fullP2.x - fullP1.x) * 0.15 + (fullP4.x - fullP1.x) * 0.15;
        const hutCY = fullP1.y + (fullP2.y - fullP1.y) * 0.15 + (fullP4.y - fullP1.y) * 0.15;
        const rinkSeed = building.x * 234 + building.y * 345;
        drawIsoHut(ctx, hutCX, hutCY, 10 * scale, 8 * scale, 15 * scale, scale, '#78350f', time, rinkSeed, uDirX, uDirY, vDirX, vDirY);

        return;
    }

    // SPRITE RENDERING
    // Calculate effective sprite rotation based on building orientation and camera view
    // Calculate effective sprite rotation based on building orientation and camera view
    const spriteRot = (bRot + (rotation || 0)) % 360;

    if (sprites && sprites[type.id] && sprites[type.id][spriteRot]) {
        const sprite = sprites[type.id][spriteRot];

        // Sizing logic
        const isRotated = bRot === 90 || bRot === 270;
        const w = isRotated ? type.size.height : type.size.width;
        const h = isRotated ? type.size.width : type.size.height;

        // Scan footprint for Max Z (Plateau Level)
        let footprintMaxZ = -9999;
        if (heightmap) {
            for (let dx = 0; dx < w; dx++) {
                for (let dy = 0; dy < h; dy++) {
                    const tIdx = (y + dy) * gridSize + (x + dx);
                    if (tIdx < heightmap.length) {
                        const val = heightmap[tIdx];
                        if (val > footprintMaxZ) footprintMaxZ = val;
                    }
                }
            }
        }
        // Use Max Z for drawing, plus a small lift to avoid z-fighting with the flat ground itself
        const z = (footprintMaxZ > -9999 ? footprintMaxZ : ((heightmap && heightmap[y * gridSize + x]) || 0)) + 2.0;

        // Calculate screen position for the building's anchor tile
        let visualX = x; let visualY = y;
        if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; }
        else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; }
        else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; }

        // This factor needs tuning based on the generated sprites 'padding'
        const sizeMult = Math.max(w, h);
        const renderSize = 64 * scale * sizeMult * 1.2;

        // Center calculation
        const p1x = isoX(visualX, visualY, z);
        const p1y = isoY(visualX, visualY, z);

        let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
        if (rotation === 90) { u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
        else if (rotation === 180) { u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
        else if (rotation === 270) { u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }

        const centerTileX = visualX + (u.x * w + v.x * h) / 2;
        const centerTileY = visualY + (u.y * w + v.y * h) / 2;

        const centerX = isoX(centerTileX, centerTileY, z);
        const centerY = isoY(centerTileX, centerTileY, z);

        ctx.drawImage(sprite, centerX - renderSize / 2, centerY - renderSize * 0.75, renderSize, renderSize);

        return; // Skip procedural drawing
    }
    let visualX = x; let visualY = y;
    let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };

    if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
    else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
    else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }

    const idx = y * gridSize + x;
    const z = (heightmap && heightmap[idx]) || 0;

    // FORCE TICKET OFFICE PROPS
    if (type.id === 'ticket_office') {
        type.hasOutdoorTerrace = true;
        type.flatRoof = false;
    }


    const isRotated = bRot === 90 || bRot === 270;
    // Helper to draw a box at World Coordinates (Moved to top scope)
    const drawLocalBox = (wx, wy, wz, w, l, h, color, angle) => {
        const corners = [
            { x: l / 2, y: -w / 2 }, { x: l / 2, y: w / 2 },
            { x: -l / 2, y: w / 2 }, { x: -l / 2, y: -w / 2 }
        ];
        const worldCorners = corners.map(c => {
            const rx = c.x * Math.cos(angle) - c.y * Math.sin(angle);
            const ry = c.x * Math.sin(angle) + c.y * Math.cos(angle);
            return { x: wx + rx, y: wy + ry };
        });
        const top = worldCorners.map(c => ({ x: isoX(c.x, c.y, wz + h), y: isoY(c.x, c.y, wz + h) }));
        const bot = worldCorners.map(c => ({ x: isoX(c.x, c.y, wz), y: isoY(c.x, c.y, wz) }));

        // Simple Box Draw
        ctx.fillStyle = adjustColor(color, -20);
        for (let i = 0; i < 4; i++) {
            const n = (i + 1) % 4;
            ctx.beginPath(); ctx.moveTo(top[i].x, top[i].y); ctx.lineTo(top[n].x, top[n].y);
            ctx.lineTo(bot[n].x, bot[n].y); ctx.lineTo(bot[i].x, bot[i].y); ctx.fill();
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y); ctx.lineTo(top[1].x, top[1].y);
        ctx.lineTo(top[2].x, top[2].y); ctx.lineTo(top[3].x, top[3].y); ctx.fill();
    };

    const worldWidth = isRotated ? type.size.height : type.size.width;
    const worldHeight = isRotated ? type.size.width : type.size.height;

    const hasOutdoor = type.hasOutdoorTerrace || type.hasOutdoorBar || type.hasOutdoorPool;
    const buildingScale = hasOutdoor ? 0.5 : 1.0;
    const shrunkWidth = worldWidth * buildingScale;
    const shrunkHeight = worldHeight * buildingScale;

    // Full Footprint (for outdoor areas)
    const fullP1 = { x: isoX(visualX, visualY, z), y: isoY(visualX, visualY, z) };
    const fullP2 = { x: isoX(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z), y: isoY(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z) };
    const fullP3 = { x: isoX(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z), y: isoY(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z) };
    const fullP4 = { x: isoX(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z), y: isoY(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z) };

    // Shrunk Footprint (for building)
    const c1 = { x: visualX, y: visualY };
    const c2 = { x: visualX + u.x * shrunkWidth, y: visualY + u.y * shrunkWidth };
    const c3 = { x: visualX + u.x * shrunkWidth + v.x * shrunkHeight, y: visualY + u.y * shrunkWidth + v.y * shrunkHeight };
    const c4 = { x: visualX + v.x * shrunkHeight, y: visualY + v.y * shrunkHeight };

    const p1 = { x: isoX(c1.x, c1.y, z), y: isoY(c1.x, c1.y, z) };
    const p2 = { x: isoX(c2.x, c2.y, z), y: isoY(c2.x, c2.y, z) };
    const p3 = { x: isoX(c3.x, c3.y, z), y: isoY(c3.x, c3.y, z) };
    const p4 = { x: isoX(c4.x, c4.y, z), y: isoY(c4.x, c4.y, z) };

    // Isometric vectors for drawing details
    const uDirX = (fullP2.x - fullP1.x) / worldWidth;
    const uDirY = (fullP2.y - fullP1.y) / worldWidth;
    const vDirX = (fullP4.x - fullP1.x) / worldHeight;
    const vDirY = (fullP4.y - fullP1.y) / worldHeight;

    // PARKING LOT (8x8) - Flat
    if (type.id === 'parking_lot') {
        const dimW = type.size.width;
        const dimH = type.size.height;

        for (let lx = 0; lx < dimW; lx++) {
            for (let ly = 0; ly < dimH; ly++) {
                // DATEN-Koordinaten der Kachel (Parkplatz ist quadratisch,
                // Gebäude-Rotation ändert nur die Markierungs-Ausrichtung)
                const wX = x + lx;
                const wY = y + ly;
                const idx = Math.floor(wY) * gridSize + Math.floor(wX);
                const tZ = (heightmap && heightmap[idx]) || 0;

                // Draw Tile (Asphalt) — Projektion MIT Kartenrotation
                const tileP1 = { x: isoXR(wX, wY, tZ), y: isoYR(wX, wY, tZ) };
                const tileP2 = { x: isoXR(wX + 1, wY, tZ), y: isoYR(wX + 1, wY, tZ) };
                const tileP3 = { x: isoXR(wX + 1, wY + 1, tZ), y: isoYR(wX + 1, wY + 1, tZ) };
                const tileP4 = { x: isoXR(wX, wY + 1, tZ), y: isoYR(wX, wY + 1, tZ) };

                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(tileP1.x, tileP1.y); ctx.lineTo(tileP2.x, tileP2.y);
                ctx.lineTo(tileP3.x, tileP3.y); ctx.lineTo(tileP4.x, tileP4.y);
                ctx.fill();

                // Grid
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Markings
                if (lx === 3 || lx === 4) continue; // Aisles

                ctx.strokeStyle = '#ffffff60';
                ctx.lineWidth = 1 * scale;
                ctx.beginPath();
                ctx.moveTo(tileP1.x, tileP1.y); ctx.lineTo(tileP2.x, tileP2.y);
                ctx.stroke();
            }
        }
        return;
    }

    // PARKING GARAGE (High Rise)
    if (type.id === 'parking_garage') {
        const dimW = type.size.width;
        const dimH = type.size.height;
        // Adjust for rotation? No, the loop lx/ly covers the *Logical* footprint.
        // We iterate Logical 0..W, 0..H.
        // We just need to map logical (lx, ly) to correct world coords if Rotated.

        let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
        let startX = x; let startY = y;

        // Rotation Transforms (Logic Grid -> World Grid)
        if (rotation === 90) { startX = y; startY = gridSize - 1 - x; u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
        else if (rotation === 180) { startX = gridSize - 1 - x; startY = gridSize - 1 - y; u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
        else if (rotation === 270) { startX = gridSize - 1 - y; startY = x; u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }

        // Determine "World" Dimensions based on rotation for boundary checks (optional)
        // Note: The loop below iterates in "Local Building Space" (lx, ly).
        // (x,y) passed to function is the Top-Left of the building in Logic Grid.
        // But if rotated, (x,y) is the anchor.
        // Wait, standard `drawPlacedBuilding` logic maps logic loop to world?
        // Let's stick to the manual transform we setup.

        const bRot = building.rotation || 0;
        const bRad = bRot * Math.PI / 180;



        const pseudoRandom = (seed) => { const s = Math.sin(seed) * 10000; return s - Math.floor(s); };
        const carColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#6b7280', '#fff', '#000'];

        // ITERATE TILES
        for (let lx = 0; lx < dimW; lx++) {
            for (let ly = 0; ly < dimH; ly++) {
                // Calculate World Grid Coord for this tile
                // If Building is rotated 90, its "Width" axis extends along World Y (or -Y).
                // `startX` is the anchor.
                // We use simple transform:
                // If Rot 0: wx = x + lx, wy = y + ly.
                // If Rot 90: building W is World H? 
                // The `u,v` vectors handle view rotation.
                // But we must also handle `building.rotation` affecting dimensions?
                // `type.size` is static {8,8}. Square. So dimensions swap is irrelevant.
                // BUT the layout logic (rows of cars) depends on consistent Local Space.

                // Let's trust `u, v` to map "Screen Right/Down" from the anchor.
                // Wait, `u,v` depend on VIEW rotation.
                // Building rotation is separate.

                // Actually: `drawPlacedBuilding` is called with logic grid x,y.
                // For a 8x8 square, we just iterate logic x+0..7, y+0..7.
                // The `isoX` handles View Rotation implicitly? 
                // NO. `isoX` handles ISOMETRIC PROJECTION. 
                // The View Rotation (90, 180...) transforms the INPUT (Grid) Coords passed to isoX.
                // So if View is 90, we must supply transformed coords.
                // My `startX` and `u, v` setup handles this View Transform.

                const wX = startX + u.x * lx + v.x * ly;
                const wY = startY + u.y * lx + v.y * ly;

                const idx = Math.floor(wY) * gridSize + Math.floor(wX);
                const tZ = (heightmap && heightmap[idx]) || 0;

                // DRAW TILE (Asphalt)
                const tileP1 = { x: isoX(wX, wY, tZ), y: isoY(wX, wY, tZ) };
                const tileP2 = { x: isoX(wX + 1, wY, tZ), y: isoY(wX + 1, wY, tZ) };
                const tileP3 = { x: isoX(wX + 1, wY + 1, tZ), y: isoY(wX + 1, wY + 1, tZ) };
                const tileP4 = { x: isoX(wX, wY + 1, tZ), y: isoY(wX, wY + 1, tZ) };

                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(tileP1.x, tileP1.y); ctx.lineTo(tileP2.x, tileP2.y);
                ctx.lineTo(tileP3.x, tileP3.y); ctx.lineTo(tileP4.x, tileP4.y);
                ctx.fill();

                // Stroke Grid (Planungstiles)
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.stroke();

                // MARKINGS (White Lines for Spots)
                // Left Block (lx=0..2), Right Block (lx=5..7). Aisles at lx=3,4.
                // Rows ly=0..7.

                // Skip Aisles
                if (lx === 3 || lx === 4) continue;
                // Skip entry/exit edges if needed?
                // Let's draw markings for all potential spots.

                // Helper to draw spot line (e.g. top edge of tile)
                // Actually, if we just draw the grid (above), that's often enough for "Planungstiles".
                // But user wanted "Markings".
                // Let's paint white lines on the sides of the spots.

                // If Left Block (0,1,2): Cars face Right. So lines at Top/Bottom of tile?
                // Yes, divider lines between spots in a row.
                // Divider is the Horizontal Grid Line (Top/Bottom edges of tile).

                ctx.strokeStyle = '#ffffff60';
                ctx.lineWidth = 1 * scale;

                // Draw Top Edge of tile as white line (Entry line?)
                // No, divider lines run parallel to car. 
                // If car faces Right (along X), dividers are along X.
                // The Grid Stroke covers the tile edges.
                // Let's add a customized "Parking Bay" u-shape or just side lines.
                // Side lines: Top and Bottom edges of the tile.

                ctx.beginPath();
                ctx.moveTo(tileP1.x, tileP1.y); ctx.lineTo(tileP2.x, tileP2.y); // Top Edge
                ctx.stroke();

                // Don't draw Bottom edge (it's the Top edge of next tile).
                // Except last row.
            }
        }

        // Draw Garage Structure (Multi-story)
        // Center of 8x8 building


        const garageRad = (building.rotation || 0) * Math.PI / 180;

        // Adjust center for rotation
        // Logic:
        // 0: cx=4, cy=4
        // 90: cx=-4, cy=4 (relative to anchor x,y?)
        // This is tricky. Let's use a simpler approach:
        // Calculate 4 corners of the footprint in World Space from the Tile Loop boundaries
        // (x,y) to (x+8, y+8) in Logic Space.
        // Map logic (4,4) to World.

        let uG = { x: 1, y: 0 }; let vG = { x: 0, y: 1 };
        if (building.rotation === 90) { uG = { x: 0, y: -1 }; vG = { x: 1, y: 0 }; }
        else if (building.rotation === 180) { uG = { x: -1, y: 0 }; vG = { x: 0, y: -1 }; }
        else if (building.rotation === 270) { uG = { x: 0, y: 1 }; vG = { x: -1, y: 0 }; }

        // Logic Center (4, 4) relative to Anchor
        // But we need the Anchor World Pos.
        // Wait, `startX` and `startY` from lines 2118-2123 ARE the World Anchor.

        const cwX = startX + uG.x * 4 + vG.x * 4;
        const cwY = startY + uG.y * 4 + vG.y * 4;

        // Base Height (Z)
        const idxC = Math.floor(cwY) * gridSize + Math.floor(cwX);
        const baseZ = (heightmap && heightmap[idxC]) || 0;

        // Draw Box
        // Open Parking Garage style: Slabs
        const slabH = 2; // Thickness
        const floors = 4;
        const floorDist = 12; // Distance between floors

        for (let f = 0; f < floors; f++) {
            const fz = baseZ + f * floorDist;

            // 1. Black Border (slightly larger) for visual distinctness
            drawLocalBox(
                cwX, cwY, fz,
                7.7, 7.7, slabH,
                '#000000',
                garageRad
            );

            // 2. Floor Slab
            drawLocalBox(
                cwX, cwY, fz,
                7.5, 7.5, slabH, // w, l, h
                '#cbd5e1', // Lighter Gray
                garageRad // Rotation
            );

            // If not top floor, draw pillars & core
            if (f < floors - 1) {
                // CENTRAL CORE (Block Transparency) - MASSIVE
                drawLocalBox(
                    cwX, cwY, fz + slabH,
                    7.0, 7.0, floorDist - slabH,
                    '#111827', // Almost Black Core
                    garageRad
                );

                // 4 Corner Pillars
                const pillarW = 0.8;
                const pillarOffset = 3.2; // From center

                // Helper for Pillar
                const drawPillar = (px, py) => {
                    // Rotate offset
                    const rpx = px * Math.cos(garageRad) - py * Math.sin(garageRad);
                    const rpy = px * Math.sin(garageRad) + py * Math.cos(garageRad);

                    // Draw Pillar
                    drawLocalBox(
                        cwX + rpx, cwY + rpy, fz + slabH,
                        pillarW, pillarW, floorDist - slabH,
                        '#0f172a', // Almost black for high contrast pillars
                        garageRad
                    );
                };

                drawPillar(pillarOffset, pillarOffset);
                drawPillar(-pillarOffset, pillarOffset);
                drawPillar(pillarOffset, -pillarOffset);
                drawPillar(-pillarOffset, -pillarOffset);
            }
        }

        // 3. Entrance / Barrier (Ground Floor)
        const entOffY = -3.8; // Front edge
        const rEx = 0 * Math.cos(garageRad) - entOffY * Math.sin(garageRad);
        const rEy = 0 * Math.sin(garageRad) + entOffY * Math.cos(garageRad);

        drawLocalBox(
            cwX + rEx, cwY + rEy, baseZ,
            3, 1, 2.5, // w, l, h
            '#f59e0b', // Amber/Yellow Gate
            garageRad
        );
        return;
    }

    // BUS STOP (Simplified for Stability)
    if (type.id === 'bus_stop') {
        const dimW = type.size.width;
        const dimH = type.size.height;

        for (let lx = 0; lx < dimW; lx++) {
            for (let ly = 0; ly < dimH; ly++) {
                // Simple positioning for 4x8 bus stop
                const wX = x + lx;
                const wY = y + ly;
                const idx = wY * gridSize + wX;
                const tZ = (heightmap && heightmap[idx]) || 0;

                // Draw Asphalt — Projektion MIT Kartenrotation
                const tileP1 = { x: isoXR(wX, wY, tZ), y: isoYR(wX, wY, tZ) };
                const tileP2 = { x: isoXR(wX + 1, wY, tZ), y: isoYR(wX + 1, wY, tZ) };
                const tileP3 = { x: isoXR(wX + 1, wY + 1, tZ), y: isoYR(wX + 1, wY + 1, tZ) };
                const tileP4 = { x: isoXR(wX, wY + 1, tZ), y: isoYR(wX, wY + 1, tZ) };

                ctx.fillStyle = '#555';
                ctx.beginPath();
                ctx.moveTo(tileP1.x, tileP1.y); ctx.lineTo(tileP2.x, tileP2.y);
                ctx.lineTo(tileP3.x, tileP3.y); ctx.lineTo(tileP4.x, tileP4.y);
                ctx.fill();

                // Grid lines
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.stroke();

                // White parking lines (dividers between spots)
                if (lx < dimW - 1) {
                    ctx.strokeStyle = '#ffffff60';
                    ctx.lineWidth = 1 * scale;
                    ctx.beginPath();
                    ctx.moveTo(tileP2.x, tileP2.y);
                    ctx.lineTo(tileP3.x, tileP3.y);
                    ctx.stroke();
                }

                // Yellow warning stripes on edges
                if (ly === 0 || ly === dimH - 1) {
                    ctx.strokeStyle = '#fbbf24';
                    ctx.lineWidth = 3 * scale;
                    ctx.beginPath();
                    ctx.moveTo(tileP1.x, tileP1.y);
                    ctx.lineTo(tileP2.x, tileP2.y);
                    ctx.stroke();
                }

                // Bus stop sign at street edge (first row)
                if (lx === Math.floor(dimW / 2) && ly === 0) {
                    // Sign post
                    const signX = (tileP1.x + tileP2.x + tileP3.x + tileP4.x) / 4;
                    const signY = (tileP1.y + tileP2.y + tileP3.y + tileP4.y) / 4;

                    // Post shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath();
                    ctx.ellipse(signX, signY, 2 * scale, 1 * scale, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Post
                    ctx.fillStyle = '#666';
                    ctx.fillRect(signX - 1 * scale, signY - 15 * scale, 2 * scale, 15 * scale);

                    // Sign (yellow circle with bus icon)
                    ctx.fillStyle = '#fbbf24';
                    ctx.beginPath();
                    ctx.arc(signX, signY - 15 * scale, 5 * scale, 0, Math.PI * 2);
                    ctx.fill();

                    // Sign border
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1 * scale;
                    ctx.stroke();

                    // Simple bus icon (H shape)
                    ctx.fillStyle = '#000';
                    ctx.fillRect(signX - 3 * scale, signY - 16 * scale, 1 * scale, 2 * scale);
                    ctx.fillRect(signX + 2 * scale, signY - 16 * scale, 1 * scale, 2 * scale);
                    ctx.fillRect(signX - 2 * scale, signY - 15.5 * scale, 4 * scale, 1 * scale);
                }
            }
        }
        return;
    }

    if (type.isRoad) {
        const neighbors = (resort && resort.getRoadNeighbors) ? resort.getRoadNeighbors(x, y, gridSize) : 0;
        ctx.fillStyle = type.color || '#555';

        const hasNorth = (neighbors & 1) !== 0; const hasEast = (neighbors & 2) !== 0;
        const hasSouth = (neighbors & 4) !== 0; const hasWest = (neighbors & 8) !== 0;
        const neighborCount = (hasNorth ? 1 : 0) + (hasEast ? 1 : 0) + (hasSouth ? 1 : 0) + (hasWest ? 1 : 0);
        const isStraight = (hasNorth && hasSouth && !hasEast && !hasWest) || (hasEast && hasWest && !hasNorth && !hasSouth);

        const mN = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const mE = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        const mS = { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 };
        const mW = { x: (p4.x + p1.x) / 2, y: (p4.y + p1.y) / 2 };
        const center = { x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 };

        // 1. Draw Full Pavement (Like Initial)
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.fill();

        // 2. Draw White Center Line
        ctx.beginPath();
        ctx.lineWidth = 2 * scale; // Reduced back to normal
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.setLineDash([5 * scale, 5 * scale]); // Dashed markings

        const isVertical = hasNorth && hasSouth;
        const isHorizontal = hasEast && hasWest;

        // Helper to get smoother curve control points
        const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

        if (isVertical && isHorizontal) {
            // CROSS (+)
            ctx.moveTo(mN.x, mN.y); ctx.lineTo(mS.x, mS.y);
            ctx.moveTo(mE.x, mE.y); ctx.lineTo(mW.x, mW.y);
        } else if (isVertical) {
            // VERTICAL (N-S)
            // Wide Road Logic: Merge with parallel neighbors
            const wideLeft = hasWest; // Neighbor to the West (Left)
            const wideRight = hasEast; // Neighbor to the East (Right)

            if (wideLeft || wideRight) {
                // It's a wide road part. Suppress center line.
                // If I am the Right Lane (have West neighbor), draw the Divider on my Left Edge (p1-p4).
                // (Drawn here because I am drawn AFTER the Left Lane)
                if (wideLeft) {
                    ctx.setLineDash([]); // Solid Divider
                    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p4.x, p4.y);
                }
            } else {
                // Standard Single Road
                ctx.setLineDash([5 * scale, 5 * scale]);
                ctx.moveTo(mN.x, mN.y); ctx.lineTo(mS.x, mS.y);
            }
        } else if (isHorizontal) {
            // HORIZONTAL (E-W)
            const wideTop = hasNorth; // Neighbor to the North (Top)
            const wideBottom = hasSouth; // Neighbor to the South (Bottom)

            if (wideTop || wideBottom) {
                // Wide Road part. Suppress center line.
                // If I am the Bottom Lane (have North neighbor), draw Divider on my Top Edge (p1-p2).
                // (Drawn here because I am drawn AFTER the Top Lane)
                if (wideTop) {
                    ctx.setLineDash([]); // Solid Divider
                    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                }
            } else {
                // Standard Single Road
                ctx.setLineDash([5 * scale, 5 * scale]);
                ctx.moveTo(mE.x, mE.y); ctx.lineTo(mW.x, mW.y);
            }
        } else if (neighborCount === 2 && !((hasNorth && hasSouth) || (hasEast && hasWest))) {
            // CURVE
            ctx.setLineDash([]); // Solid curves
            let start, end, corner;
            if (hasNorth && hasEast) { start = mN; end = mE; corner = p2; }
            else if (hasEast && hasSouth) { start = mE; end = mS; corner = p3; }
            else if (hasSouth && hasWest) { start = mS; end = mW; corner = p4; }
            else if (hasWest && hasNorth) { start = mW; end = mN; corner = p1; }

            // Wide turn (Control Point at Center)
            const control = lerp(corner, center, 1.0);

            ctx.moveTo(start.x, start.y);
            ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);

        } else {
            // DEAD ENDS or UNMERGED T-STUBS
            // E.g. "North only" or "North + East (+West/South missing)"
            // This catches the tips of parallel roads
            ctx.setLineDash([]);

            if (hasNorth) { ctx.moveTo(mN.x, mN.y); ctx.lineTo(center.x, center.y); }
            if (hasEast) { ctx.moveTo(mE.x, mE.y); ctx.lineTo(center.x, center.y); }
            if (hasSouth) { ctx.moveTo(mS.x, mS.y); ctx.lineTo(center.x, center.y); }
            if (hasWest) { ctx.moveTo(mW.x, mW.y); ctx.lineTo(center.x, center.y); }

            if (neighborCount === 0) {
                ctx.moveTo(center.x - 2 * scale, center.y); ctx.lineTo(center.x + 2 * scale, center.y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        return;
    }

    // === OUTDOOR FEATURES (Pools, Ice Rink, etc.) ===

    // Generic Outdoor (Terrace/Pool) for standard buildings
    if (hasOutdoor) {
        // Draw Terrace Ground on the 'rest' of the tile
        // We simply restart and draw the FULL ground, but the building will be drawn ON TOP of the top-left part.
        // Wait, building is top-left 50%. Free space is L-shape.
        // Simpler: Draw full wooden deck, then building on top.

        // Draw Terrace Ground or Garden
        // Generic Outdoor (Terrace/Pool) for standard buildings
        const isLuxuryHotel = type.id === 'luxushotel';
        const hasTerrace = (type.hasOutdoorTerrace || type.hasOutdoorBar || type.id.includes('huette') || type.id === 'luxus_chalet' || type.id === 'ticket_office') && !isLuxuryHotel;

        // If it's a terrace building, we will shrink the building footprint later to reveal this deck. (Moved logic below)

        ctx.fillStyle = isLuxuryHotel ? '#166534' : (type.id === 'ticket_office' ? '#52525b' : '#d97706'); // Green=Hotel, Grey=Ticket, Wood=Others
        ctx.beginPath(); ctx.moveTo(fullP1.x, fullP1.y); ctx.lineTo(fullP2.x, fullP2.y); ctx.lineTo(fullP3.x, fullP3.y); ctx.lineTo(fullP4.x, fullP4.y); ctx.fill();

        if (!isLuxuryHotel && type.id !== 'ticket_office') {
            ctx.strokeStyle = '#92400e';
            // Planks for wood decks
            for (let i = 0; i < 8; i++) {
                const r = i / 8;
                ctx.beginPath();
                ctx.moveTo(fullP1.x + (fullP2.x - fullP1.x) * r, fullP1.y + (fullP2.y - fullP1.y) * r);
                ctx.lineTo(fullP4.x + (fullP3.x - fullP4.x) * r, fullP4.y + (fullP3.y - fullP4.y) * r);
                ctx.stroke();
            }

            // Draw Terrace Furniture (Tables/Parasols) if this is a terrace building
            // Allow Ticket Office to enter this block (for queue/signs), but skip parasols
            if (hasTerrace && scale > 0.1) {
                // Use stable seed from grid coordinates
                const seed = (x * 937 + y * 563);
                const rnd = (i) => {
                    const val = Math.sin(seed + i * 456);
                    return val - Math.floor(val); // 0..1
                };

                const numProps = 5;
                const vec12 = { x: fullP2.x - fullP1.x, y: fullP2.y - fullP1.y };
                const vec14 = { x: fullP4.x - fullP1.x, y: fullP4.y - fullP1.y };
                for (let i = 0; i < numProps; i++) {
                    // Interpolate near p3 (South) area
                    const u = 0.5 + 0.4 * rnd(i);
                    const v = 0.5 + 0.4 * rnd(i + 5);

                    // Helper: Stable bilinear interpolation

                    // We want points where u > 0.6 OR v > 0.6 (Outer rim)
                    // Re-roll logic deterministic?
                    let ru = rnd(i); let rv = rnd(i + 10);
                    if (ru < 0.7 && rv < 0.7) {
                        if (ru < rv) ru += 0.4; else rv += 0.4;
                    }

                    const tx = fullP1.x + vec12.x * ru + vec14.x * rv;
                    const ty = fullP1.y + vec12.y * ru + vec14.y * rv;

                    // Draw Table/Parasol
                    // Exclude Ticket Office from generic parasols/tables
                    const isTable = rnd(i + 99) > 0.3 && type.id !== 'ticket_office';

                    if (isTable) {
                        ctx.fillStyle = '#a8a29e'; // Table
                        ctx.beginPath(); ctx.ellipse(tx, ty, 5 * scale, 2.5 * scale, 0, 0, Math.PI * 2); ctx.fill();

                        // Parasol
                        const isSterne = type.id === 'sternekueche';
                        const isPanorama = type.id === 'panorama_restaurant';

                        let pCol = (rnd(i + 3) > 0.5 ? '#ef4444' : '#f59e0b');
                        if (isSterne) pCol = '#f8fafc'; // White
                        else if (isPanorama) pCol = '#171717'; // Black

                        ctx.strokeStyle = '#57534e'; ctx.lineWidth = 1.5 * scale;
                        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 14 * scale); ctx.stroke();
                        ctx.fillStyle = pCol;
                        ctx.beginPath();
                        ctx.moveTo(tx - 9 * scale, ty - 11 * scale);
                        ctx.lineTo(tx + 9 * scale, ty - 11 * scale);
                        ctx.lineTo(tx, ty - 18 * scale);
                        ctx.fill();
                    }
                }

                // Sterneküche Fence/Wall & Panorama Railing
                if (type.id === 'sternekueche' || type.id === 'panorama_restaurant') {
                    // Draw low wall/railing along South-East and South-West edges of the TILE
                    // Edges: P2-P3 and P3-P4
                    // Wall Height ~ 6 * scale
                    const isSterne = type.id === 'sternekueche';
                    const wH = isSterne ? 6 * scale : 4 * scale;
                    // Color: Sterne=Stone, Panorama=Dark Metal/Wood
                    ctx.fillStyle = isSterne ? '#d6d3d1' : '#4a3b32';

                    // Helper for wall segment
                    const drawWallSeg = (start, end) => {
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.lineTo(end.x, end.y - wH);
                        ctx.lineTo(start.x, start.y - wH);
                        ctx.fill();
                        // Cap
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y - wH);
                        ctx.lineTo(end.x, end.y - wH);
                        ctx.lineWidth = 2 * scale;
                        ctx.strokeStyle = isSterne ? '#a8a29e' : '#27201b';
                        ctx.stroke();
                    };

                    // P2 -> P3
                    drawWallSeg(fullP2, fullP3);
                    // P4 -> P3
                    drawWallSeg(fullP4, fullP3);
                }


            }
            // Luxus Chalet Terrace Pool
            if (type.id === 'luxus_chalet') {
                // Draw Pool on the terrace (near P3)
                // Center of terrace approx: (0.5*(P2+P3) + 0.5*(P4+P3)) / 2 ?
                // Basically near P3.
                // Interpolate 80% towards P3 from P1?
                // P1 is far corner. P3 is near corner.
                const px = fullP1.x + (fullP3.x - fullP1.x) * 0.75;
                const py = fullP1.y + (fullP3.y - fullP1.y) * 0.75;

                // Helper dirs
                const vecW = { x: (fullP2.x - fullP1.x), y: (fullP2.y - fullP1.y) }; // "Width" vector (Screen space)
                const vecH = { x: (fullP4.x - fullP1.x), y: (fullP4.y - fullP1.y) }; // "Height" vector
                // Normalize for drawIsoPool direction args?
                // drawIsoPool takes "unit vectors" derived from world width? 
                // We can pass crude vectors or recalculate.
                // Reuse `isoX` logic? We don't have uDirX handy in this scope without recalculating.
                // Recalculate basic iso dirs:
                const lenW = Math.hypot(vecW.x, vecW.y);
                const lenH = Math.hypot(vecH.x, vecH.y);
                const uDx = vecW.x / lenW; const uDy = vecW.y / lenW;
                const vDx = vecH.x / lenH; const vDy = vecH.y / lenH;

                drawIsoPool(ctx, px, py, 15 * scale, 10 * scale, '#38bdf8', uDx, uDy, vDx, vDy);
                drawSteam(ctx, px, py - 5 * scale, 10 * scale, 8 * scale, time);
            }
        }
    } else {
        // Garden Texture (Noise/Speckles) for hotel
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        const seed = (x * 123 + y * 321);
        const rnd = (i) => { const v = Math.sin(seed + i * 11); return v - Math.floor(v); };

        for (let i = 0; i < 10; i++) {
            // Stable random positions
            const rV = 0.1 + 0.8 * rnd(i + 20);
            const rU = 0.1 + 0.8 * rnd(i + 40);

            // Lerp fullP
            const lx = fullP1.x + (fullP2.x - fullP1.x) * rU + (fullP4.x - fullP1.x) * rV; // Simple parallelogram lerp approximation
            const ly = fullP1.y + (fullP2.y - fullP1.y) * rU + (fullP4.y - fullP1.y) * rV;

            ctx.beginPath(); ctx.arc(lx, ly, 2 * scale, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Add Pool if it has one (and not handled by specific logic like Luxus Chalet)
    if (type.hasOutdoorPool && type.id !== 'luxus_chalet') {
        const cx = (fullP1.x + fullP3.x) / 2 + 20 * scale;
        const cy = (fullP1.y + fullP3.y) / 2 + 20 * scale;
        drawIsoPool(ctx, cx, cy, 12 * scale, 8 * scale, '#38bdf8', uDirX, uDirY, vDirX, vDirY);
    }

    const numFloors = type.floors || 1;
    const floorHeight = 25 * scale;
    const buildingDepth3D = floorHeight * numFloors;

    // SHRINK FOOTPRINT for Terrace Buildings
    let hasTerraceFn = (type.hasOutdoorTerrace || type.hasOutdoorBar || type.id.includes('huette') || type.id === 'luxus_chalet' || type.id === 'ticket_office') && type.id !== 'luxushotel';
    if (type.id === 'ticket_office') hasTerraceFn = true; // FORCE check
    let bP1 = p1; let bP2 = p2; let bP3 = p3; let bP4 = p4;

    if (hasTerraceFn) {
        let shrink = 0.75; // Default: Building is 75% of tile size
        if (type.id === 'sternekueche') shrink = 0.85; // Less terrace, bigger house
        if (type.id === 'luxus_chalet') shrink = 0.70; // More terrace for pool
        if (type.id === 'ticket_office') shrink = 0.60; // Larger Hut (60%)

        const lerpShrink = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        // Shrink towards P1
        bP2 = lerpShrink(p1, p2, shrink);
        bP4 = lerpShrink(p1, p4, shrink);
        bP3 = lerpShrink(p1, p3, shrink); // Diagonal
    }

    // BRUTE FORCE TICKET OFFICE SHRINK
    if (type.id === 'ticket_office') {
        const shrink = 0.60; // Increased to 60%
        const lerpBrute = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        bP2 = lerpBrute(p1, p2, shrink);
        bP4 = lerpBrute(p1, p4, shrink);
        bP3 = lerpBrute(p1, p3, shrink);
    }

    // Building coordinates (using shrunk p1-p4)
    const t1 = { x: bP1.x, y: bP1.y - buildingDepth3D };
    const t2 = { x: bP2.x, y: bP2.y - buildingDepth3D };
    const t3 = { x: bP3.x, y: bP3.y - buildingDepth3D };
    const t4 = { x: bP4.x, y: bP4.y - buildingDepth3D };

    const walls = [
        { name: 'West', pts: [bP4, bP1, t1, t4], center: { x: (bP4.x + bP1.x + t1.x + t4.x) / 4, y: (bP4.y + bP1.y + t1.y + t4.y) / 4 }, shade: 0.6 },
        { name: 'North', pts: [bP1, bP2, t2, t1], center: { x: (bP1.x + bP2.x + t2.x + t1.x) / 4, y: (bP1.y + bP2.y + t2.y + t1.y) / 4 }, shade: 0.4 },
        { name: 'East', pts: [bP2, bP3, t3, t2], center: { x: (bP2.x + bP3.x + t3.x + t2.x) / 4, y: (bP2.y + bP3.y + t3.y + t2.y) / 4 }, shade: 0.8 },
        { name: 'South', pts: [bP3, bP4, t4, t3], center: { x: (bP3.x + bP4.x + t4.x + t3.x) / 4, y: (bP3.y + bP4.y + t4.y + t3.y) / 4 }, shade: 1.0 }
    ];
    // Remove walls that shouldn't be drawn if there's a roof terrace? No, walls always exist.
    // Logic for Roof Terrace: It makes the roof flat and maybe adds a railing on top.

    // LUXURY HOTEL GARDEN (Stable Trees + Hedge) - Draw BEFORE walls to avoid clipping top of roof
    if (type.id === 'luxushotel') {
        const seed = (x * 13 + y * 7); // Deterministic seed base
        const rand = (i) => Math.abs(Math.sin(seed + i * 123));

        let u = { x: 1, y: 0 }; let v = { x: 0, y: 1 };
        if (rotation === 90) { u = { x: 0, y: -1 }; v = { x: 1, y: 0 }; }
        else if (rotation === 180) { u = { x: -1, y: 0 }; v = { x: 0, y: -1 }; }
        else if (rotation === 270) { u = { x: 0, y: 1 }; v = { x: -1, y: 0 }; }
        // Full Tile Footprint (ground level)
        const fp1 = { x: isoX(visualX, visualY, z), y: isoY(visualX, visualY, z) };
        const fp2 = { x: isoX(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z), y: isoY(visualX + u.x * worldWidth, visualY + u.y * worldWidth, z) };
        const fp3 = { x: isoX(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z), y: isoY(visualX + u.x * worldWidth + v.x * worldHeight, visualY + u.y * worldWidth + v.y * worldHeight, z) };
        const fp4 = { x: isoX(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z), y: isoY(visualX + v.x * worldHeight, visualY + v.y * worldHeight, z) };

        // Draw Hedge
        const hedgePts = [fp1, fp2, fp3, fp4];
        drawHedge(ctx, hedgePts, scale, time);

        // Place Stable Trees (Garden)
        const numTrees = 5;
        for (let i = 0; i < numTrees; i++) {
            const r1 = rand(i);
            const r2 = rand(i + 10);
            let tu = r1;
            if (tu > 0.3 && tu < 0.7) tu = tu < 0.5 ? 0.2 : 0.8;
            const tv = r2;

            const tx = fp1.x + (fp2.x - fp1.x) * tu + (fp4.x - fp1.x) * tv;
            const ty = fp1.y + (fp2.y - fp1.y) * tu + (fp4.y - fp1.y) * tv;

            drawTree(ctx, tx, ty, 6 * scale, 15 * scale + (r1 * 5) * scale, '#15803d');
        }
    }

    walls.sort((a, b) => (a.center.y - b.center.y) || (a.center.x - b.center.x));

    walls.forEach((wall, index) => {
        let wCol = previewColor || type.color || '#ccc';
        fillWithStyle(ctx, wCol, wall.pts, wall.shade, buildingDepth3D);

        // TICKET OFFICE SALES COUNTER (Desk) - 3D Perspective
        if (type.id === 'ticket_office' && wall.name === 'South') {
            // Desk Geometry
            const cntW = 10 * scale;
            const cntD = 5 * scale;
            const cntH = 8 * scale; // Desk Height

            // South Wall Base Center
            const lerpWall = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            const baseCenter = lerpWall(wall.pts[0], wall.pts[1], 0.5);
            const cx = baseCenter.x; const cy = baseCenter.y; // Ground level at wall
            const tBack = { x: cx, y: cy - cntH }; // Back edge center (on wall)

            // Projection vectors (approximate for South Wall)
            // Forward is down-left or down-right?
            // South wall faces usually down-right?
            // Actually, let's just project "Out" (down) and "Up" (up)
            // Face 1: Front (Towards viewer)
            // Face 2: Top (Flat)
            // Face 3: Side?

            // Top Surface
            // We need 4 points for the top.
            // Back edge is on the wall. Front edge is extruded OUT.
            // Wall vector (BL to BR)
            const vWall = { x: wall.pts[1].x - wall.pts[0].x, y: wall.pts[1].y - wall.pts[0].y };
            // Out vector? Perpendicular to wall?
            // In iso, if wall is West-East, out is South-East?
            // Let's use the building's main axes `u` and `v` stored earlier if possible, or derive.
            // South wall is typically aligned with `u` axis (going Right-Down).
            // Normal would be `v` axis (going Left-Down).
            // Let's approximate: Normal is perpendicular to vWall in screen space (y-up)? No.
            // Let's use a fixed offset that looks good for "South" facing.
            // South wall faces "Forward" (positive Y, neutral X).
            const vOut = { x: 0, y: 1 }; // Straight down in screen space?
            // No, Isometric "Out" is usually (minus x, plus y) or (plus x, plus y).
            // Let's check wall name. 'South'.
            // South faces (approx) P3-P4 direction.
            // Let's use (P3-P2) or similar?
            // Simpler: Just add Y to simulate "Out/Down" in screen space, it roughly works for South.
            // But user said "Perspective wrong".
            // Let's calculate true normal.
            const len = Math.hypot(vWall.x, vWall.y);
            // Rotate 90 deg?
            // If wall is (dx, dy), normal is (-dy, dx) or (dy, -dx).
            const vNorm = { x: -vWall.y / len, y: vWall.x / len };
            // Scale by depth
            const dx = vNorm.x * cntD;
            const dy = vNorm.y * cntD;

            const tBL = { x: tBack.x - cntW / 2, y: tBack.y };
            const tBR = { x: tBack.x + cntW / 2, y: tBack.y };
            const tFL = { x: tBL.x + dx, y: tBL.y + dy };
            const tFR = { x: tBR.x + dx, y: tBR.y + dy };

            ctx.fillStyle = '#78350f'; // Wood Top
            ctx.beginPath();
            ctx.moveTo(tBL.x, tBL.y);
            ctx.lineTo(tBR.x, tBR.y);
            ctx.lineTo(tFR.x, tFR.y);
            ctx.lineTo(tFL.x, tFL.y);
            ctx.fill();

            // Front Face
            ctx.fillStyle = '#451a03';
            ctx.beginPath();
            ctx.moveTo(tFL.x, tFL.y);
            ctx.lineTo(tFR.x, tFR.y);
            ctx.lineTo(tFR.x, tFR.y + cntH);
            ctx.lineTo(tFL.x, tFL.y + cntH);
            ctx.fill();

            // Side Face (Right) - if dx > 0
            if (dx > 0) { // Visible left or right?
                ctx.fillStyle = '#552508';
                ctx.beginPath();
                ctx.moveTo(tFR.x, tFR.y); // Top Front Right
                ctx.lineTo(tBR.x, tBR.y); // Top Back Right
                ctx.lineTo(tBR.x, tBR.y + cntH); // Bottom Back Right
                ctx.lineTo(tFR.x, tFR.y + cntH); // Bottom Front Right
                ctx.fill();
            } else {
                // Left side visible
                ctx.fillStyle = '#552508';
                ctx.beginPath();
                ctx.moveTo(tFL.x, tFL.y);
                ctx.lineTo(tBL.x, tBL.y);
                ctx.lineTo(tBL.x, tBL.y + cntH);
                ctx.lineTo(tFL.x, tFL.y + cntH);
                ctx.fill();
            }
        }

        // GENERIC DOOR on Front Wall (Fixed: Bind to South Wall to prevent flickering)
        // Previously relied on sort order (isFrontWall), which was unstable.
        if (wall.name === 'South' && !type.isGarage && !type.isThermeComplex && !type.isOutdoorRink && !type.isRoad && !type.hasOutdoorTerrace) {
            // Draw a simple door at bottom center
            // u=0.5, v=1.0 (bottom)
            // Door size approx 15% width, 60% height of floor?? No, fixed size.
            // Let's use drawWindowOnFace but styled as door? Or custom.
            // Wall pts: Bottom-Left, Bottom-Right, Top-Right, Top-Left

            // Interpolate center bottom
            const pBL = wall.pts[0];
            const pBR = wall.pts[1];
            const pTR = wall.pts[2];
            const pTL = wall.pts[3];

            // Door dims
            const dW = 0.2; // 20% of wall width
            const dH = 0.6; // 60% of wall height (relative to floorHeight?)
            // floorHeight is 25 * scale. Building height is floorHeight * numFloors.
            // We want door to be ~ 15 * scale height.
            const doorPixelHeight = 18 * scale;
            const wallPixelHeight = buildingDepth3D;
            const dH_ratio = Math.min(0.8, doorPixelHeight / wallPixelHeight);

            // Center U = 0.5
            // Bottom V = 0 ? In our UV for window, v goes 0..1 (top to bottom?? or bottom to top?)
            // drawWindowOnFace uses centered U,V.
            // Let's implement simple door manually on the face.

            const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            const baseMid = lerp(pBL, pBR, 0.5);
            const topMid = lerp(pTL, pTR, 0.5); // Top of wall

            // Vector UP the wall
            const upVec = { x: topMid.x - baseMid.x, y: topMid.y - baseMid.y };

            const dLeft = lerp(pBL, pBR, 0.5 - dW / 2);
            const dRight = lerp(pBL, pBR, 0.5 + dW / 2);

            // Door Top points (project up)
            const dTopLeft = { x: dLeft.x + upVec.x * dH_ratio, y: dLeft.y + upVec.y * dH_ratio };
            const dTopRight = { x: dRight.x + upVec.x * dH_ratio, y: dRight.y + upVec.y * dH_ratio };

            // Door Frame/Hole (Darker Background)
            ctx.fillStyle = '#27201b';
            ctx.beginPath();
            ctx.moveTo(dLeft.x, dLeft.y); ctx.lineTo(dRight.x, dRight.y);
            ctx.lineTo(dTopRight.x, dTopRight.y); ctx.lineTo(dTopLeft.x, dTopLeft.y);
            ctx.fill();

            // Door Panel (Lighter Wood, inset slightly)
            // Inset by 1px scale
            const inset = 1 * scale;
            // Approximate inset in screen space? Just shrink fill area slightly or draw separate rect.

            ctx.fillStyle = '#78350f'; // Visible Wood Color
            ctx.beginPath();
            ctx.moveTo(dLeft.x, dLeft.y - inset); // Keep bottom flush? No, floor.
            ctx.lineTo(dRight.x, dRight.y - inset);
            ctx.lineTo(dTopRight.x, dTopRight.y + inset); // Y goes down, so +inset is DOWN (smaller)
            ctx.lineTo(dTopLeft.x, dTopLeft.y + inset);
            ctx.fill();

            // Frame outline
            ctx.strokeStyle = '#4a3b32'; ctx.lineWidth = 1.5 * scale; ctx.stroke();

            // Door Handle (Gold/Silver knob)
            // Position: Right side (dRight), mid height
            const handleHeight = 0.5; // mid
            const handleX = dLeft.x + (dRight.x - dLeft.x) * 0.8 + (dTopLeft.x - dLeft.x) * handleHeight;
            const handleY = dLeft.y + (dRight.y - dLeft.y) * 0.8 + (dTopLeft.y - dLeft.y) * handleHeight;

            ctx.fillStyle = '#fcd34d'; // Gold
            ctx.beginPath(); ctx.arc(handleX, handleY, 1.5 * scale, 0, Math.PI * 2); ctx.fill();
        }

        const buildingWidth = type.size.width * TILE_SIZE * scale;
        if (buildingWidth > 30 * scale && !type.id.includes('garage') && !type.isThermeComplex) {
            let style = 'standard';
            if (type.flickeringLights) style = 'party';
            else if (type.rusticStyle) style = 'rustic';
            else if (type.id === 'luxushotel') style = 'luxury';
            const rows = type.floors || 1;
            const cols = Math.floor(buildingWidth / (25 * scale));
            for (let r = 0; r < rows; r++) {
                const vW = rows === 1 ? 0.5 : (0.35 + r * 0.4);
                for (let c = 0; c < cols; c++) {
                    const uW = (c + 0.5) / cols;
                    // Avoid drawing window over door
                    // Door is at u=0.5, width 0.2 -> range 0.4 to 0.6
                    // Window uW is center. Window width 0.15.
                    // If window center is overlapping door range...
                    if (wall.name === 'South' && r === 0) {
                        // Strict check: if uW is between 0.35 and 0.65, skip
                        if (uW > 0.35 && uW < 0.65) continue;
                    }

                    drawWindowOnFace(ctx, wall.pts, uW, vW, 0.15, 0.25, scale, style);
                }
            }
        }
    });

    // LUXUS CHALET TWIN TOWERS
    if (type.id === 'luxus_chalet') {
        const tw = 12 * scale; // Slightly wider towers
        const td = 12 * scale;
        const th = buildingDepth3D + 35 * scale; // Majestic height

        // Stable seed
        const tSeed = x * 881 + y * 113;

        // Helper to draw a tower at a base point
        const drawTower = (basePt, seedOffset) => {
            // Center of the tower should be the basePt
            // Reuse global iso vectors uDx/vDx? We need to recalc them or store them.
            // We can recalc from bP2-bP1 (Width) and bP4-bP1 (Depth)
            const vecW = { x: bP2.x - bP1.x, y: bP2.y - bP1.y };
            const vecD = { x: bP4.x - bP1.x, y: bP4.y - bP1.y };
            const lenW = Math.hypot(vecW.x, vecW.y) || 1;
            const lenD = Math.hypot(vecD.x, vecD.y) || 1;

            const ux = vecW.x / lenW; const uy = vecW.y / lenW;
            const vx = vecD.x / lenD; const vy = vecD.y / lenD;

            // Draw
            drawIsoHut(ctx, basePt.x, basePt.y, tw, td, th, scale, '#b45309', time, tSeed + seedOffset, ux, uy, vx, vy);
        };

        // Tower 1: West Wing (At bP4)
        drawTower(bP4, 0);

        // Tower 2: East Wing (At bP2)
        drawTower(bP2, 100);
    }

    // TICKET OFFICE ROTATING SIGN
    if (type.id === 'ticket_office') {
        // Center of the shrunk hut is roughly mid-way between bP1 and center of shrunk rect?
        // bP1 is North corner.
        // Roof Top Center:
        // Main building uses `center` but that's for the full tile.
        // The shrunk building is defined by bP1, bP2, bP3, bP4.
        // Let's find center of the shrunk roof.
        // Height of building = floorHeight * floors + roofHeight.
        // Default floors=1.
        // Height of building = floorHeight * floors + roofHeight.
        // Revised for pointed roof: buildingDepth3D + peakHeight (1.5 * depth)
        const peakH = buildingDepth3D * 1.5;
        const roofH = buildingDepth3D + peakH + 5 * scale; // Peak + small gap
        const cx = (bP1.x + bP3.x) / 2;
        const cy = (bP1.y + bP3.y) / 2; // Floor center
        const roofY = cy - roofH; // Screen Y goes Up

        // Animated Rotation
        const rot = time * 0.002;
        const wMax = 40 * scale;
        // We draw a "Board" that rotates.
        // Projected width varies with sin(rot)
        const curW = wMax * Math.cos(rot);
        const isFront = Math.sin(rot) > 0; // facing front or back

        ctx.save();
        ctx.translate(cx, roofY - 10 * scale); // Float above roof

        // Pole
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(-2 * scale, 0, 4 * scale, 10 * scale);

        // Sign Box
        ctx.fillStyle = '#dc2626'; // Red
        ctx.strokeStyle = '#991b1b'; // Dark Red Border
        ctx.lineWidth = 2 * scale;

        // Draw "3D" Box approximation? Just a flat board that scales.
        // Height fixed.
        const sH = 12 * scale;
        ctx.beginPath();
        ctx.rect(-Math.abs(curW) / 2, -sH, Math.abs(curW), sH);
        ctx.fill();
        ctx.stroke();

        // TEXT
        // Only draw text if width is sufficient to see it
        if (Math.abs(curW) > 10 * scale) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${8 * scale}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Stretch text to match width? Or just clip?
            // Let's scale the context horizontally
            ctx.save();
            // Scale X by current width ratio (avoid div by zero)
            const ratio = curW / wMax;
            // If isFront, ratio is positive? Math.cos goes -1 to 1.
            // We want text to readable. Always scale positive X?
            // If we rotate, the text should "flip"? 
            // True 3D rotation means when back is shown, text is reversed or hidden.
            // If Math.sin(rot) < 0 (Backside), maybe hide text or show darker color?

            // Simple approach: Always readable, just stretch.
            ctx.scale(ratio, 1);
            ctx.fillText("TICKETS", 0, -sH / 2);
            ctx.restore();
        }

        ctx.restore();
    }



    // === ROOF RENDERING ===
    const roofBaseColor = previewColor || (type.id === 'huette' ? '#8B4513' : (type.id === 'luxushotel' ? '#2d3748' : (type.id === 'ticket_office' ? '#a16207' : '#888')));

    if (type.hasRoofTerrace) {
        // Flat roof with terrace details
        drawTerrace(ctx, t1, t2, t3, t4, scale, type);
    }
    else if ((type.category === 'hotel' || type.category === 'gastronomy' || type.id === 'huette' || type.id === 'ticket_office') && !type.flatRoof && !type.isThermeComplex) {
        // ===== CHALET-DACH: Schneedecke, Licht/Schatten, Eiszapfen, Kamin =====
        let peakHeight = buildingDepth3D * 0.5;
        if (type.id === 'ticket_office') peakHeight = buildingDepth3D * 1.5; // Taller peak for tiny hut!
        const peakX = (t1.x + t3.x) / 2;
        const peakY = (t1.y + t3.y) / 2 - peakHeight;

        const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const roofFaces = [[t4, t1], [t1, t2], [t2, t3], [t3, t4]];

        const roofDetailed = scale > 0.4; // Gradienten nur bei hohem Zoom
        roofFaces.forEach(([a, b], fIdx) => {
            // Dachfläche mit Licht (links) / Schatten (rechts)
            const lit = fIdx === 0 || fIdx === 1;
            if (roofDetailed) {
                const faceGrad = ctx.createLinearGradient(a.x, a.y, peakX, peakY);
                faceGrad.addColorStop(0, lit ? roofBaseColor : darkenColor(roofBaseColor, 0.25));
                faceGrad.addColorStop(1, lit ? darkenColor(roofBaseColor, 0.1) : darkenColor(roofBaseColor, 0.35));
                ctx.fillStyle = faceGrad;
            } else {
                ctx.fillStyle = lit ? roofBaseColor : darkenColor(roofBaseColor, 0.25);
            }
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(peakX, peakY); ctx.fill();

            // SCHNEEDECKE: obere ~55% der Dachfläche, mit welligem Rand
            const sA = lerpP(a, { x: peakX, y: peakY }, 0.42);
            const sB = lerpP(b, { x: peakX, y: peakY }, 0.42);
            const mid = lerpP(sA, sB, 0.5);
            ctx.fillStyle = lit ? 'rgba(245, 249, 255, 0.96)' : 'rgba(214, 226, 242, 0.94)';
            ctx.beginPath();
            ctx.moveTo(sA.x, sA.y);
            ctx.quadraticCurveTo(mid.x, mid.y + 3 * scale, sB.x, sB.y); // welliger Schneerand
            ctx.lineTo(peakX, peakY);
            ctx.closePath();
            ctx.fill();
        });

        // Firstlinie leicht verschneit
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.arc(peakX, peakY, 1.4 * scale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(peakX, peakY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t2.x, t2.y); ctx.lineTo(peakX, peakY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t3.x, t3.y); ctx.lineTo(peakX, peakY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t4.x, t4.y); ctx.lineTo(peakX, peakY); ctx.stroke();

        // EISZAPFEN an der vorderen Traufkante (ab mittlerem Zoom)
        if (scale > 0.35) {
            ctx.fillStyle = 'rgba(210, 232, 250, 0.85)';
            const eaves = [[t3, t4], [t4, t1]];
            for (const [ea, eb] of eaves) {
                for (const t of [0.25, 0.5, 0.75]) {
                    const p = lerpP(ea, eb, t);
                    const len = (2.5 + ((x * 7 + y * 13 + t * 100) % 3)) * scale;
                    ctx.beginPath();
                    ctx.moveTo(p.x - 0.8 * scale, p.y);
                    ctx.lineTo(p.x, p.y + len);
                    ctx.lineTo(p.x + 0.8 * scale, p.y);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }

        // KAMIN mit Rauch (Gastro & Hütten — es wird eingeheizt!)
        if (type.category === 'gastronomy' || type.id === 'huette' || type.category === 'hotel') {
            const chX = lerpP(lerpP(t1, t3, 0.32), { x: peakX, y: peakY }, 0.35);
            const chW = 2.6 * scale;
            const chH = 6 * scale;
            // Kaminkörper (Stein)
            ctx.fillStyle = '#6b7280';
            ctx.fillRect(chX.x - chW / 2, chX.y - chH, chW, chH);
            ctx.fillStyle = '#4b5563';
            ctx.fillRect(chX.x - chW / 2, chX.y - chH, chW * 0.4, chH);
            // Schneekappe
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(chX.x - chW / 2 - 0.4 * scale, chX.y - chH - 1.2 * scale, chW + 0.8 * scale, 1.4 * scale);
            // Rauch (animiert, aufsteigend)
            if (time) {
                ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
                for (let sIdx = 0; sIdx < 3; sIdx++) {
                    const phase = ((time / 1400) + sIdx * 0.33) % 1;
                    const sx2 = chX.x + Math.sin(phase * 6 + sIdx) * 2.2 * scale;
                    const sy2 = chX.y - chH - 2 * scale - phase * 14 * scale;
                    ctx.beginPath();
                    ctx.arc(sx2, sy2, (1.2 + phase * 2.4) * scale, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        drawRoofDetails(ctx, t1, t2, peakX, peakY, scale, type);
        drawRoofDetails(ctx, t2, t3, peakX, peakY, scale, type);
        drawRoofDetails(ctx, t3, t4, peakX, peakY, scale, type);
        drawRoofDetails(ctx, t4, t1, peakX, peakY, scale, type);

    } else if (!type.isThermeComplex) {
        // Standard Flat Roof
        ctx.fillStyle = roofBaseColor;
        ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y); ctx.fill();

        // HOSPITAL HELIPAD
        if (type.id === 'hospital') {
            const cx = (t1.x + t3.x) / 2;
            const cy = (t1.y + t3.y) / 2;
            // Draw Circle
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2 * scale;
            ctx.beginPath();
            // Project circle to iso (ellipse)
            ctx.ellipse(cx, cy, 12 * scale, 6 * scale, 0, 0, Math.PI * 2); // 12/6 ratio
            ctx.stroke();

            // Draw H
            ctx.fillStyle = '#ffffff';
            const hS = 6 * scale; // H Size
            const hW = 2 * scale; // Bar Width
            // H is drawn flat in iso (squashed)
            // Left Bar
            ctx.beginPath();
            ctx.moveTo(cx - hS, cy - hS / 2); ctx.lineTo(cx - hS + hW, cy - hS / 2);
            ctx.lineTo(cx - hS + hW, cy + hS / 2); ctx.lineTo(cx - hS, cy + hS / 2);
            ctx.fill();
            // Right Bar
            ctx.beginPath();
            ctx.moveTo(cx + hS - hW, cy - hS / 2); ctx.lineTo(cx + hS, cy - hS / 2);
            ctx.lineTo(cx + hS, cy + hS / 2); ctx.lineTo(cx + hS - hW, cy + hS / 2);
            ctx.fill();
            // Cross Bar
            ctx.beginPath();
            ctx.moveTo(cx - hS, cy - hW / 2); ctx.lineTo(cx + hS, cy - hW / 2);
            ctx.lineTo(cx + hS, cy + hW / 2); ctx.lineTo(cx - hS, cy + hW / 2);
            ctx.fill();
        } else {
            // Add minimal detail (gravel/snow) for others
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath(); ctx.arc((t1.x + t3.x) / 2, (t1.y + t3.y) / 2, 5 * scale, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Add Details based on type
    // CHIMNEYS for Rustic buildings
    if (type.rusticStyle || type.id.includes('huette') || type.id.includes('chalet') || type.id.includes('gastronomy')) {
        // Determine position for chimney (usually on roof peak or side)
        const chimneyX = (t1.x + t3.x) / 2 + (Math.random() * 10 - 5) * scale; // Slight randomization to look natural (fixed per render? No, this jitters) 
        // Need deterministic position:
        const seed = (x * 123 + y * 456);
        const offX = ((seed % 20) - 10) * scale;
        const peakY = (t1.y + t3.y) / 2 - buildingDepth3D * 0.5; // Approx peak

        drawChimney(ctx, (t1.x + t3.x) / 2 + offX, peakY + 5 * scale, scale, time);
    }

    // Custom Garage Doors for Pisten Garages
    if (type.isGarage) {
        // Find the South wall segment (index 3 in our walls array)
        const southWall = walls.find(w => w.name === 'South');
        if (southWall) {
            const cycle = (time / 5000) % 2;
            const isOpen = type.id.includes('garage') ? (cycle < 1 ? 0 : 0.8) : 0;
            drawIsometricGarageDoor(ctx, southWall.pts, scale, isOpen);
        }
    }

    // START RESTORED ICONS
    // Draw Icon above building
    if (type.icon && scale > 0.4 && type.id !== 'ticket_office' && !type.isGarage && type.id !== 'hospital') {
        // Find top center
        const topCenterX = (t1.x + t3.x) / 2;
        const topCenterY = (t1.y + t3.y) / 2 - buildingDepth3D * 0.2; // Float above roof

        ctx.fillStyle = '#fff';
        ctx.font = `${24 * scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Shadow/Outline for visibility
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeText(type.icon, topCenterX, topCenterY);
        ctx.fillText(type.icon, topCenterX, topCenterY);
    }
    // END RESTORED ICONS

    // TICKET OFFICE PROPS (Top-Level Overlay)
    if (type.id === 'ticket_office') {
        const tStart = 0.4;
        const tEnd = 0.9;
        const lerpQueue = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        const midStart = lerpQueue(fullP1, fullP3, tStart);
        const midEnd = lerpQueue(fullP1, fullP3, tEnd);
        const dirW = { x: fullP2.x - fullP4.x, y: fullP2.y - fullP4.y };
        const wRatio = 0.25;

        // Fence Posts
        const cP1 = { x: midStart.x - dirW.x * wRatio, y: midStart.y - dirW.y * wRatio };
        const cP2 = { x: midStart.x + dirW.x * wRatio, y: midStart.y + dirW.y * wRatio };
        const cP3 = { x: midEnd.x + dirW.x * wRatio, y: midEnd.y + dirW.y * wRatio };
        const cP4 = { x: midEnd.x - dirW.x * wRatio, y: midEnd.y - dirW.y * wRatio };

        const pH = 8 * scale;
        ctx.fillStyle = '#451a03';
        [cP1, cP2, cP3, cP4].forEach(p => ctx.fillRect(p.x - 1 * scale, p.y - pH, 2 * scale, pH));

        // Ropes
        ctx.strokeStyle = '#374151'; ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(cP1.x, cP1.y - pH + 2 * scale); ctx.lineTo(cP4.x, cP4.y - pH + 2 * scale);
        ctx.moveTo(cP2.x, cP2.y - pH + 2 * scale); ctx.lineTo(cP3.x, cP3.y - pH + 2 * scale);
        ctx.moveTo(cP1.x, cP1.y - pH / 2); ctx.lineTo(cP4.x, cP4.y - pH / 2);
        ctx.moveTo(cP2.x, cP2.y - pH / 2); ctx.lineTo(cP3.x, cP3.y - pH / 2);
        ctx.stroke();

        // Signs
        const drawSign = (pos) => {
            const sx = pos.x; const sy = pos.y;
            const sh = 12 * scale;
            ctx.fillStyle = '#1f2937'; ctx.fillRect(sx - 1 * scale, sy - sh, 2 * scale, sh);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 3 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fef3c7'; ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 1 * scale;
            ctx.beginPath(); ctx.rect(sx - 4 * scale, sy - sh, 8 * scale, 6 * scale); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#000'; ctx.fillRect(sx - 3 * scale, sy - sh + 2 * scale, 6 * scale, 0.5 * scale); ctx.fillRect(sx - 3 * scale, sy - sh + 3.5 * scale, 4 * scale, 0.5 * scale);
        };
        drawSign(lerpQueue(fullP4, fullP3, 0.2));
        drawSign(lerpQueue(fullP1, fullP4, 0.8));

        // Lamps
        const drawLamp = (pos) => {
            const sx = pos.x; const sy = pos.y;
            const lh = 16 * scale;
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 3 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1e293b'; ctx.fillRect(sx - 1 * scale, sy - lh, 2 * scale, lh);
            ctx.shadowColor = '#fef08a'; ctx.shadowBlur = 15; ctx.fillStyle = '#fef08a';
            ctx.beginPath(); ctx.arc(sx, sy - lh, 4 * scale, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        };
        const lCenter = midEnd;
        const lSpread = { x: dirW.x * 0.20, y: dirW.y * 0.20 };
        drawLamp({ x: lCenter.x - lSpread.x, y: lCenter.y - lSpread.y });
        drawLamp({ x: lCenter.x + lSpread.x, y: lCenter.y + lSpread.y });
    }


}

// Helper to draw snow coverage overlay for ALL placed cannons (e.g. during piste building)
export const drawSnowCoverageOverlay = (ctx, buildings, gridSize, heightmap, isoX, isoY, scale, rotation) => {
    if (!buildings || buildings.length === 0) return;

    // Shared Overlay Style
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)'; // Softer Cyan
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * scale;

    const coneAngle = Math.PI / 3; // 60 degrees

    buildings.forEach(building => {
        if (!building.type.isSnowCannon) return;

        const { x, y } = building;
        const bRot = building.rotation || 0;
        const radius = building.type.snowRadius || 10;

        // Map rotation affects visualization
        let visualX = x;
        let visualY = y;
        if (rotation === 90) { visualX = y; visualY = gridSize - 1 - x; }
        else if (rotation === 180) { visualX = gridSize - 1 - x; visualY = gridSize - 1 - y; }
        else if (rotation === 270) { visualX = gridSize - 1 - y; visualY = x; }

        let targetAngle = 0; // Default Right (+X)
        if (bRot === 90) targetAngle = Math.PI / 2;
        else if (bRot === 180) targetAngle = Math.PI;
        else if (bRot === 270) targetAngle = -Math.PI / 2;

        // Loop range
        const range = Math.ceil(radius);
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius || dist < 1) continue;

                const angle = Math.atan2(dy, dx);
                let diff = angle - targetAngle;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;

                if (Math.abs(diff) < coneAngle / 2) {
                    const tx = visualX + dx;
                    const ty = visualY + dy;
                    if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) continue;

                    const idx = ty * gridSize + tx;
                    const z = heightmap ? (heightmap[idx] || 0) : 0;

                    const p1 = { x: isoX(tx, ty, z), y: isoY(tx, ty, z) };
                    const p2 = { x: isoX(tx + 1, ty, z), y: isoY(tx + 1, ty, z) };
                    const p3 = { x: isoX(tx + 1, ty + 1, z), y: isoY(tx + 1, ty + 1, z) };
                    const p4 = { x: isoX(tx, ty + 1, z), y: isoY(tx, ty + 1, z) };

                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.lineTo(p3.x, p3.y);
                    ctx.lineTo(p4.x, p4.y);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
    });
};



export const drawLiftPylon = (ctx, x, y, z, scale, isoX, isoY) => {
    const cx = isoX(x, y, z);
    const cy = isoY(x, y, z);
    const s = scale;

    const baseW = 4 * s;
    const topW = 2 * s;
    const height = 40 * s;
    const crossWidth = 12 * s;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 6 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beton-Fundament
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(cx - baseW * 1.2, cy - 1.5 * s, baseW * 2.4, 3 * s);
    ctx.strokeStyle = 'rgba(31, 41, 55, 0.5)';
    ctx.lineWidth = 0.6 * s;
    ctx.strokeRect(cx - baseW * 1.2, cy - 1.5 * s, baseW * 2.4, 3 * s);

    // Tower (Tapered, mit Licht-/Schattenseite)
    const grad = ctx.createLinearGradient(cx - baseW, cy, cx + baseW, cy);
    grad.addColorStop(0, '#a8b3c2');
    grad.addColorStop(0.45, '#8a97a8');
    grad.addColorStop(1, '#5b6b7d');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(cx - baseW, cy);
    ctx.lineTo(cx + baseW, cy);
    ctx.lineTo(cx + topW, cy - height);
    ctx.lineTo(cx - topW, cy - height);
    ctx.fill();
    ctx.strokeStyle = 'rgba(31, 41, 55, 0.55)';
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();

    // Querstreben (Gittermast-Detail ab mittlerem Zoom)
    if (s > 0.3) {
        ctx.strokeStyle = 'rgba(55, 65, 81, 0.55)';
        ctx.lineWidth = 0.6 * s;
        ctx.beginPath();
        for (let i = 1; i <= 3; i++) {
            const t = i / 4;
            const yLev = cy - height * t;
            const wLev = baseW + (topW - baseW) * t;
            ctx.moveTo(cx - wLev, yLev);
            ctx.lineTo(cx + wLev, yLev);
        }
        ctx.stroke();
    }

    // Cross-arm (Support for cables)
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - crossWidth, cy - height - 2 * s, crossWidth * 2, 4 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(cx - crossWidth, cy - height - 2 * s, crossWidth * 2, 1.2 * s);

    // Seilrollen-Batterien an den Enden
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - crossWidth - 2 * s, cy - height - 3 * s, 4 * s, 6 * s);
    ctx.fillRect(cx + crossWidth - 2 * s, cy - height - 3 * s, 4 * s, 6 * s);
    if (s > 0.35) {
        ctx.fillStyle = '#111827';
        for (const side of [-1, 1]) {
            const bx = cx + side * crossWidth;
            ctx.beginPath();
            ctx.arc(bx - 1.2 * s, cy - height + 3.4 * s, 0.8 * s, 0, Math.PI * 2);
            ctx.arc(bx + 1.2 * s, cy - height + 3.4 * s, 0.8 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Rote Gipfel-Markierung (Luftfahrt-Look)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - topW, cy - height - 0.5 * s, topW * 2, 1.6 * s);
};

export const drawLiftCarrier = (ctx, lift, sx, sy, scale, isGoingUp, isCogRailway, time = 0, passengers = null) => {
    const type = lift?.type || {};
    const n = (type.name || '').toLowerCase();
    const isGondola = n.includes('gondola') || n.includes('aerial');
    const isDrag = n.includes('t-bar') || n.includes('platter') || n.includes('carpet');
    const pax = Array.isArray(passengers) ? passengers : (passengers ? [passengers] : []);
    const s = Math.max(0.35, scale * 1.28);
    const swing = isCogRailway ? 0 : Math.sin((time / 280) + (sx * 0.02)) * 1.2 * s;
    const drawX = sx + swing;
    const drawY = sy;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(drawX + 1.0 * s, drawY + 16 * s, 5.5 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isCogRailway) {
        // Small mountain rail car
        const w = 14 * s;
        const h = 8 * s;
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(drawX - w / 2, drawY + 5 * s, w, h);
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(drawX - w / 2 + 2 * s, drawY + 6.5 * s, w - 4 * s, 2.5 * s);
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1 * s;
        ctx.strokeRect(drawX - w / 2, drawY + 5 * s, w, h);
        // Wheels
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(drawX - 4 * s, drawY + 14 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.arc(drawX + 4 * s, drawY + 14 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    // Hanger (common)
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(drawX, drawY);
    ctx.lineTo(drawX, drawY + 8 * s);
    ctx.stroke();

    if (isGondola) {
        // ===== GONDEL — abgerundete Kabine mit Verlauf, Dach & Glasreflex =====
        const gondolaScale = 1.08; // slightly larger than chairs
        const gw = 10 * s * gondolaScale;
        const gh = 9 * s * gondolaScale;
        const gx = drawX - gw / 2;
        const gy = drawY + 8.5 * s;
        const rr = Math.min(2.2 * s, gw * 0.22); // Eckenradius

        // Laufwerk (Klemme) auf dem Seil
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(drawX - 1.6 * s, drawY - 1.2 * s, 3.2 * s, 2.2 * s);

        // Clamp + arm
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.3 * s;
        ctx.beginPath();
        ctx.moveTo(drawX, drawY + 8 * s);
        ctx.lineTo(drawX - 1.5 * s, gy);
        ctx.lineTo(drawX + 1.5 * s, gy);
        ctx.stroke();

        // Kabinenkörper (abgerundet, horizontaler Farbverlauf für 3D-Look)
        const bodyGrad = ctx.createLinearGradient(gx, gy, gx + gw, gy);
        bodyGrad.addColorStop(0, '#f87171');
        bodyGrad.addColorStop(0.45, '#ef4444');
        bodyGrad.addColorStop(1, '#b91c1c');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(gx, gy, gw, gh, rr); else ctx.rect(gx, gy, gw, gh);
        ctx.fill();

        // Dachleiste
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(gx, gy, gw, 1.6 * s, [rr, rr, 0, 0]); else ctx.rect(gx, gy, gw, 1.6 * s);
        ctx.fill();

        // Lower trim
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(gx + 0.4 * s, gy + gh - 1.4 * s, gw - 0.8 * s, 1.4 * s);

        // Panoramafenster mit Verlauf + Steg
        const winY = gy + 2.0 * s;
        const winH = gh * 0.42;
        const winGrad = ctx.createLinearGradient(gx, winY, gx, winY + winH);
        winGrad.addColorStop(0, '#bae6fd');
        winGrad.addColorStop(1, '#38bdf8');
        ctx.fillStyle = winGrad;
        ctx.fillRect(gx + 1.2 * s, winY, gw - 2.4 * s, winH);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
        ctx.lineWidth = 0.6 * s;
        ctx.beginPath();
        ctx.moveTo(drawX, winY);
        ctx.lineTo(drawX, winY + winH);
        ctx.stroke();

        // Diagonaler Glasreflex
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(gx + 1.6 * s, winY);
        ctx.lineTo(gx + 3.6 * s, winY);
        ctx.lineTo(gx + 2.2 * s, winY + winH);
        ctx.lineTo(gx + 1.2 * s, winY + winH);
        ctx.closePath();
        ctx.fill();

        // Passagier-Silhouetten hinter dem Glas
        if (pax.length > 0) {
            const drawCount = Math.min(3, pax.length);
            for (let i = 0; i < drawCount; i++) {
                const px = gx + gw * (0.25 + i * 0.25);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
                ctx.beginPath();
                ctx.arc(px, winY + winH * 0.55, 1.1 * s, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Frame outline
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(gx, gy, gw, gh, rr); else ctx.rect(gx, gy, gw, gh);
        ctx.stroke();
        return;
    }

    if (isDrag) {
        // Drag lift: hanger + T-bar / platter
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.3 * s;
        ctx.beginPath();
        ctx.moveTo(drawX, drawY + 8 * s);
        ctx.lineTo(drawX, drawY + 15 * s);
        ctx.stroke();

        if (n.includes('platter')) {
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            ctx.arc(drawX, drawY + 16.5 * s, 2.1 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 0.8 * s;
            ctx.stroke();
        } else {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.8 * s;
            ctx.beginPath();
            ctx.moveTo(drawX - 4 * s, drawY + 16 * s);
            ctx.lineTo(drawX + 4 * s, drawY + 16 * s);
            ctx.stroke();
        }

        if (pax.length > 0) {
            const drawCount = Math.min(2, pax.length);
            for (let i = 0; i < drawCount; i++) {
                const passenger = pax[i];
                const side = drawCount === 1 ? 0 : (i === 0 ? -1 : 1);
                const headX = drawX + side * 2.1 * s + 0.8 * s;
                const headY = drawY + 18.8 * s;
                const bodyY = drawY + 22.8 * s;
                const jacket = passenger.jacketColor || '#1d4ed8';
                const pants = passenger.pantsColor || '#1f2937';
                const helmet = passenger.helmetColor || '#f8fafc';
                // Tow rope to guest
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = 1.2 * s;
                ctx.beginPath();
                ctx.moveTo(drawX + side * 1.6 * s, drawY + 16.2 * s);
                ctx.lineTo(headX, headY + 1.5 * s);
                ctx.stroke();
                // Guest silhouette
                ctx.fillStyle = helmet;
                ctx.beginPath();
                ctx.arc(headX, headY, 1.4 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = jacket;
                ctx.lineWidth = 2.2 * s;
                ctx.beginPath();
                ctx.moveTo(headX, headY + 1.6 * s);
                ctx.lineTo(headX - 0.8 * s, bodyY);
                ctx.stroke();
                ctx.strokeStyle = pants;
                ctx.lineWidth = 1.8 * s;
                ctx.beginPath();
                ctx.moveTo(headX - 0.8 * s, bodyY);
                ctx.lineTo(headX - 2.6 * s, bodyY + 2.8 * s);
                ctx.moveTo(headX - 0.8 * s, bodyY);
                ctx.lineTo(headX + 1.4 * s, bodyY + 2.6 * s);
                ctx.stroke();
            }
        }
        return;
    }

    // Chairlift (default)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.3 * s;
    ctx.beginPath();
    ctx.moveTo(drawX, drawY + 8 * s);
    ctx.lineTo(drawX - 3 * s, drawY + 11.5 * s);
    ctx.stroke();

    // Safety bar / frame
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.moveTo(drawX - 5.5 * s, drawY + 9.8 * s);
    ctx.lineTo(drawX + 5.5 * s, drawY + 9.8 * s);
    ctx.lineTo(drawX + 4.5 * s, drawY + 12.2 * s);
    ctx.lineTo(drawX - 4.5 * s, drawY + 12.2 * s);
    ctx.closePath();
    ctx.stroke();

    // Seat + backrest with gradient shading & gepolsterter Sitzfläche
    const backGrad = ctx.createLinearGradient(drawX - 6 * s, drawY + 9 * s, drawX + 6 * s, drawY + 9 * s);
    backGrad.addColorStop(0, '#64748b');
    backGrad.addColorStop(0.5, '#475569');
    backGrad.addColorStop(1, '#334155');
    ctx.fillStyle = backGrad;
    ctx.fillRect(drawX - 6 * s, drawY + 9 * s, 12 * s, 3.2 * s);
    // Sitzpolster (leicht farbig für freundlicheren Look)
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(drawX - 6 * s, drawY + 12 * s, 12 * s, 2.3 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(drawX - 6 * s, drawY + 12 * s, 12 * s, 0.7 * s);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.8 * s;
    ctx.strokeRect(drawX - 6 * s, drawY + 9 * s, 12 * s, 5.3 * s);

    // Seated passenger (only if assigned)
    if (pax.length > 0) {
        const drawCount = Math.min(8, pax.length);
        const spacing = drawCount <= 1 ? 0 : (10 / Math.max(1, drawCount - 1));
        for (let i = 0; i < drawCount; i++) {
            const passenger = pax[i];
            const jacket = passenger.jacketColor || '#1d4ed8';
            const pants = passenger.pantsColor || '#1f2937';
            const helmet = passenger.helmetColor || '#f8fafc';
            const px = drawX - 5 * s + (spacing * i) * s;
            const py = drawY + 10.8 * s;
            ctx.fillStyle = helmet;
            ctx.beginPath();
            ctx.arc(px, py, 1.0 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = jacket;
            ctx.lineWidth = 1.8 * s;
            ctx.beginPath();
            ctx.moveTo(px, py + 1.0 * s);
            ctx.lineTo(px, py + 3.3 * s);
            ctx.stroke();
            ctx.strokeStyle = pants;
            ctx.lineWidth = 1.4 * s;
            ctx.beginPath();
            ctx.moveTo(px, py + 3.3 * s);
            ctx.lineTo(px - 1.3 * s, py + 4.8 * s);
            ctx.moveTo(px, py + 3.3 * s);
            ctx.lineTo(px + 1.3 * s, py + 4.8 * s);
            ctx.stroke();
        }
        // Ski line under seat row
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 0.9 * s;
        ctx.beginPath();
        ctx.moveTo(drawX - 6.0 * s, drawY + 16.0 * s);
        ctx.lineTo(drawX + 6.0 * s, drawY + 15.5 * s);
        ctx.stroke();
    }
};

// Enhanced 3D Lift Station with Perspective-Correct Windows
export const drawLiftStation = (ctx, x, y, width, depth, height, scale, color, liftType) => {
    const w = width * scale;
    const d = depth * scale;
    const h = height * scale;
    const n = (liftType?.name || '').toLowerCase();
    const isGondola = n.includes('gondola') || n.includes('aerial');
    const isCog = n.includes('cog');
    const isDrag = n.includes('t-bar') || n.includes('platter') || n.includes('carpet');

    const darken = (rgb, m) => rgb.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/, (_, r, g, b) =>
        `rgb(${Math.max(0, Math.round(+r * m))}, ${Math.max(0, Math.round(+g * m))}, ${Math.max(0, Math.round(+b * m))})`);
    const lighten = (rgb, add) => rgb.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/, (_, r, g, b) =>
        `rgb(${Math.min(255, +r + add)}, ${Math.min(255, +g + add)}, ${Math.min(255, +b + add)})`);

    const frontWall = [{ x, y: y + h }, { x: x - w / 2, y: y + w / 4 + h }, { x: x - w / 2, y: y + w / 4 }, { x, y }];
    const rightWall = [{ x, y: y + h }, { x: x + d / 2, y: y + d / 4 + h }, { x: x + d / 2, y: y + d / 4 }, { x, y }];
    const roofFace = [
        { x, y },
        { x: x - w / 2, y: y + w / 4 },
        { x: x + d / 2 - w / 2, y: y + w / 4 + d / 4 },
        { x: x + d / 2, y: y + d / 4 }
    ];

    // Base platform
    const baseInset = 7 * scale;
    ctx.fillStyle = 'rgba(71, 85, 105, 0.55)';
    ctx.beginPath();
    ctx.moveTo(frontWall[0].x, frontWall[0].y + baseInset);
    ctx.lineTo(frontWall[1].x, frontWall[1].y + baseInset);
    ctx.lineTo(rightWall[1].x, rightWall[1].y + baseInset);
    ctx.lineTo(rightWall[0].x, rightWall[0].y + baseInset);
    ctx.closePath();
    ctx.fill();

    // Walls
    ctx.fillStyle = color;
    ctx.beginPath();
    frontWall.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = darken(color, 0.72);
    ctx.beginPath();
    rightWall.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();

    // Roof
    if (isGondola || isCog) {
        ctx.fillStyle = lighten(color, 22);
        ctx.beginPath();
        roofFace.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        // Mechanical bullwheel housing
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(x - 10 * scale, y - 6 * scale, 20 * scale, 6 * scale);
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath();
        ctx.arc(x, y - 3 * scale, 3.2 * scale, 0, Math.PI * 2);
        ctx.fill();
    } else {
        const rh = 15 * scale;
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y + w / 4);
        ctx.lineTo(x, y - rh);
        ctx.lineTo(x + d / 2, y + d / 4 - rh);
        ctx.lineTo(x + d / 2 - w / 2, y + w / 4 + d / 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(x + d / 2 - w / 2, y + w / 4 + d / 4);
        ctx.lineTo(x, y - rh);
        ctx.lineTo(x + d / 2, y + d / 4 - rh);
        ctx.closePath();
        ctx.fill();
        // Ridge
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y - rh);
        ctx.lineTo(x + d / 2, y + d / 4 - rh);
        ctx.stroke();
        if (scale > 0.3 && !isDrag) {
            drawChimney(ctx, x + d / 4, y + d / 8 - rh, scale, Date.now());
        }
    }

    // Glazing bands
    const winType = isGondola ? 'modern' : 'standard';
    const numWin = Math.max(2, Math.floor(width / 18));
    for (let i = 0; i < numWin; i++) {
        drawWindowOnFace(ctx, frontWall, 0.15 + i * 0.7 / Math.max(1, (numWin - 1)), 0.42, 0.09, 0.16, scale, winType);
    }
    if (width > 24) {
        for (let i = 0; i < Math.max(1, numWin - 1); i++) {
            drawWindowOnFace(ctx, rightWall, 0.18 + i * 0.65 / Math.max(1, (numWin - 2)), 0.44, 0.08, 0.15, scale, winType);
        }
    }

    // Entrance + canopy on front wall
    const doorW = Math.max(8 * scale, w * 0.12);
    const doorH = Math.max(12 * scale, h * 0.26);
    const doorX = x - doorW * 0.5;
    const doorY = y + h - doorH;
    ctx.fillStyle = '#111827';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.8 * scale;
    ctx.strokeRect(doorX, doorY, doorW, doorH);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(doorX + doorW - 1.5 * scale, doorY + doorH * 0.55, 1 * scale, 1 * scale);

    // Station sign
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(x - 12 * scale, y + h * 0.08, 24 * scale, 6 * scale);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `${4.8 * scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isGondola ? 'GONDOLA' : isCog ? 'COG' : 'LIFT', x, y + h * 0.08 + 3 * scale);

    // Railings / machinery details
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(frontWall[0].x - 10 * scale, frontWall[0].y + 2 * scale);
    ctx.lineTo(frontWall[0].x + 10 * scale, frontWall[0].y + 2 * scale);
    ctx.stroke();
    if (isDrag) {
        ctx.fillStyle = '#374151';
        ctx.fillRect(x + d / 2 - 12 * scale, y + d / 4 - 4 * scale, 10 * scale, 4 * scale);
    }
};


// Helper for helicopter parts
const drawHeliBox = (ctx, x, y, z, w, l, h, color, scale, isoX, isoY) => {
    // Simple 3D box drawing in isometric
    // Points: 0:FLB, 1:FRB, 2:FRT, 3:FLT, 4:BLB, 5:BRB, 6:BRT, 7:BLT
    // We only draw visible faces assuming simplified view (top-right-ish)

    // Convert center x,y,z to corners
    const hw = w / 2; const hl = l / 2; const hh = h; // z is bottom

    // Top Face
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(isoX(x - hw, y - hl, z + hh), isoY(x - hw, y - hl, z + hh));
    ctx.lineTo(isoX(x + hw, y - hl, z + hh), isoY(x + hw, y - hl, z + hh));
    ctx.lineTo(isoX(x + hw, y + hl, z + hh), isoY(x + hw, y + hl, z + hh));
    ctx.lineTo(isoX(x - hw, y + hl, z + hh), isoY(x - hw, y + hl, z + hh));
    ctx.fill();
    ctx.stroke();

    // Right Face (if visible)
    ctx.fillStyle = adjustColor(color, -20);
    ctx.beginPath();
    ctx.moveTo(isoX(x + hw, y - hl, z + hh), isoY(x + hw, y - hl, z + hh));
    ctx.lineTo(isoX(x + hw, y + hl, z + hh), isoY(x + hw, y + hl, z + hh));
    ctx.lineTo(isoX(x + hw, y + hl, z), isoY(x + hw, y + hl, z));
    ctx.lineTo(isoX(x + hw, y - hl, z), isoY(x + hw, y - hl, z));
    ctx.fill();
    ctx.stroke();

    // Front Face (if visible) 
    ctx.fillStyle = adjustColor(color, -40);
    ctx.beginPath();
    ctx.moveTo(isoX(x - hw, y + hl, z + hh), isoY(x - hw, y + hl, z + hh));
    ctx.lineTo(isoX(x + hw, y + hl, z + hh), isoY(x + hw, y + hl, z + hh));
    ctx.lineTo(isoX(x + hw, y + hl, z), isoY(x + hw, y + hl, z));
    ctx.lineTo(isoX(x - hw, y + hl, z), isoY(x - hw, y + hl, z));
    ctx.fill();
    ctx.stroke();
};

// Helper color darken
const adjustColor = (hex, percent) => {
    // Simple hex darken (not robust but fine for this)
    return hex; // Skip for now to assume base color is fine or manually pick
};

export const drawHelicopter = (ctx, h, scale, gridSize, isoX, isoY, time) => {
    // User Request: Make 0.2 bigger (Apply consistently to geometry)
    const s = 1.2; // Scaling factor for the model size

    const { x, y, z, rotation } = h;

    // Shadow
    const shadowZ = h.baseZ || (z - 5);
    const sx = isoX(x, y, shadowZ);
    const sy = isoY(x, y, shadowZ);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 12 * scale * s, 6 * scale * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Internal Helper for Rotated Boxes
    const drawRotatedBox = (ox, oy, oz, w, l, ht, color) => {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        // Center of the box in world space
        // ox, oy are offsets in LOCAL space
        const rx = ox * cos - oy * sin;
        const ry = ox * sin + oy * cos;
        const wx = x + rx;
        const wy = y + ry;
        const wz = z + oz;

        // Corners for projection
        const halfW = w / 2; const halfL = l / 2;
        const corners = [
            { x: -halfW, y: -halfL, z: 0 },
            { x: halfW, y: -halfL, z: 0 },
            { x: halfW, y: halfL, z: 0 },
            { x: -halfW, y: halfL, z: 0 },
            { x: -halfW, y: -halfL, z: ht },
            { x: halfW, y: -halfL, z: ht },
            { x: halfW, y: halfL, z: ht },
            { x: -halfW, y: halfL, z: ht }
        ];

        const projected = corners.map(p => {
            const cRx = p.x * cos - p.y * sin;
            const cRy = p.x * sin + p.y * cos;
            const fX = wx + cRx;
            const fY = wy + cRy;
            const fZ = wz + p.z;
            return { x: isoX(fX, fY, fZ), y: isoY(fX, fY, fZ) };
        });

        // Draw
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';

        // Bottom
        ctx.beginPath(); ctx.moveTo(projected[0].x, projected[0].y); ctx.lineTo(projected[1].x, projected[1].y); ctx.lineTo(projected[2].x, projected[2].y); ctx.lineTo(projected[3].x, projected[3].y); ctx.fill();
        // Sides
        ctx.beginPath();
        [0, 1, 2, 3].forEach((i) => {
            const next = (i + 1) % 4;
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[next].x, projected[next].y);
            ctx.lineTo(projected[next + 4].x, projected[next + 4].y);
            ctx.lineTo(projected[i + 4].x, projected[i + 4].y);
            ctx.lineTo(projected[i].x, projected[i].y);
        });
        ctx.fill(); ctx.stroke();
        // Top
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(projected[4].x, projected[4].y); ctx.lineTo(projected[5].x, projected[5].y); ctx.lineTo(projected[6].x, projected[6].y); ctx.lineTo(projected[7].x, projected[7].y); ctx.fill(); ctx.stroke();
    };

    // --- REALISTIC TYPE II (Yellow/Orange, Large) ---
    // User Request: "More Yellow/Orange", "Larger", "Longer"
    const ms = s * 1.4; // Multiplier for size boost (Total ~1.68x original)

    // 1. LANDING SKIDS (Dark Grey) - Shortened (1.4 -> 1.3)
    // Left
    drawRotatedBox(0, -0.25 * ms, -0.15 * ms, 1.3 * ms, 0.08 * ms, 0.08 * ms, '#333');
    // Right
    drawRotatedBox(0, 0.25 * ms, -0.15 * ms, 1.3 * ms, 0.08 * ms, 0.08 * ms, '#333');
    // Struts
    drawRotatedBox(0.3 * ms, 0, -0.05 * ms, 0.1 * ms, 0.6 * ms, 0.1 * ms, '#333');
    drawRotatedBox(-0.3 * ms, 0, -0.05 * ms, 0.1 * ms, 0.6 * ms, 0.1 * ms, '#333');

    // 2. MAIN CABIN (Amber/Yellow-Orange)
    // Shortened (1.0 -> 0.9)
    drawRotatedBox(-0.1 * ms, 0, 0.25 * ms, 0.9 * ms, 0.7 * ms, 0.7 * ms, '#FFB300');

    // 3. COCKPIT NOSE (Glass Blue)
    drawRotatedBox(0.5 * ms, 0, 0.2 * ms, 0.5 * ms, 0.5 * ms, 0.6 * ms, '#60a5fa');

    // 4. TAIL BOOM (Amber/Yellow-Orange)
    // Shortened (1.0 -> 0.85), Shifted (-0.9 -> -0.8)
    drawRotatedBox(-0.8 * ms, 0, 0.4 * ms, 0.85 * ms, 0.25 * ms, 0.3 * ms, '#FFB300');

    // 5. TAIL FIN (Red)
    // Shifted (-1.5 -> -1.35)
    drawRotatedBox(-1.35 * ms, 0, 0.6 * ms, 0.35 * ms, 0.1 * ms, 0.7 * ms, '#ef4444');

    // 6. ROTOR MAST
    drawRotatedBox(-0.1 * ms, 0, 0.9 * ms, 0.15 * ms, 0.15 * ms, 0.3 * ms, '#ccc');

    // 7. TAIL ROTOR (Spinning)
    ctx.save();
    const trX = -1.35 * ms;
    const trY = 0.1 * ms; // Side
    const trZ = 0.8 * ms; // Up
    const trWX = x + (trX * Math.cos(rotation) - trY * Math.sin(rotation));
    const trWY = y + (trX * Math.sin(rotation) + trY * Math.cos(rotation));
    const trWZ = z + trZ;
    const trx = isoX(trWX, trWY, trWZ);
    const try_ = isoY(trWX, trWY, trWZ);
    ctx.translate(trx, try_);
    const tRotorSpeed = (h.rotorSpeed > 1) ? (time / 20) : 0;
    ctx.rotate(tRotorSpeed);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 2 * scale;
    const tl = 12 * scale * ms;
    ctx.beginPath(); ctx.moveTo(-tl, 0); ctx.lineTo(tl, 0); ctx.moveTo(0, -tl); ctx.lineTo(0, tl); ctx.stroke();
    // Blur
    if (h.rotorSpeed > 15) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath(); ctx.arc(0, 0, tl, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 8. BLINKING BEACON (Red)
    // Top of Fin
    const bcolor = (Math.floor(time / 200) % 2 === 0) ? '#ff0000' : '#500000';
    const bcX = -1.35 * ms;
    const bcZ = 1.0 * ms; // Top of fin
    const bcWX = x + (bcX * Math.cos(rotation));
    const bcWY = y + (bcX * Math.sin(rotation));
    const bcWZ = z + bcZ;
    const bcSx = isoX(bcWX, bcWY, bcWZ);
    const bcSy = isoY(bcWX, bcWY, bcWZ);

    // Draw Beacon Glow
    if (Math.floor(time / 200) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.beginPath(); ctx.arc(bcSx, bcSy, 8 * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = bcolor;
    ctx.beginPath(); ctx.arc(bcSx, bcSy, 3 * scale, 0, Math.PI * 2); ctx.fill();

    // Main Rotor
    ctx.save();

    // Position on top of mast
    // Center is -0.1 * ms relative to pivot
    const rotorCenterX = x + (-0.1 * ms * Math.cos(rotation));
    const rotorCenterY = y + (-0.1 * ms * Math.sin(rotation));
    const rotorH = z + (1.1 * ms); // Top of mast

    const rx = isoX(rotorCenterX, rotorCenterY, rotorH);
    const ry = isoY(rotorCenterX, rotorCenterY, rotorH);

    ctx.translate(rx, ry);

    // Rotor spin
    const spin = h.rotorAngle || (time / 100);
    ctx.scale(1, 0.57);
    ctx.rotate(spin);

    // Blur Disc (High speed only)
    if (h.rotorSpeed > 15) {
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.beginPath(); ctx.arc(0, 0, 55 * scale * ms, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath(); ctx.arc(0, 0, 52 * scale * ms, 0, Math.PI * 2); ctx.stroke();
    }

    // Blades
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 6 * scale;
    const bL = 55 * scale * ms; // Very long blades
    ctx.beginPath();
    ctx.moveTo(-bL, 0); ctx.lineTo(bL, 0);
    ctx.moveTo(0, -bL); ctx.lineTo(0, bL);
    ctx.stroke();

    ctx.restore();

    // Winch Rope
    if (h.isWinching) {
        const ropeStart = { x: isoX(x, y, z), y: isoY(x, y, z) };
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ropeStart.x, ropeStart.y);
        const sway = Math.sin(time / 300) * 5 * scale * s;
        ctx.lineTo(ropeStart.x + sway, ropeStart.y + 50 * scale * s);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(ropeStart.x + sway - 3 * scale, ropeStart.y + 50 * scale, 6 * scale, 6 * scale);
    }
};

// ===============================================
// TRAFFIC VEHICLE DRAWING
// ===============================================
export const drawTrafficVehicle = (ctx, vehicle, scale, gridSize, isoX, isoY, dt) => {
    // ============================================================
    // FAHRZEUGE — komplett überarbeitet:
    //  * korrekte Bodenhöhe (Räder stehen AUF der Straße, nichts versinkt)
    //  * echte 3D-Extrusion mit Licht-/Schattenseiten
    //  * Räder, Scheiben mit Reflex, Scheinwerfer & Rücklichter
    // ============================================================
    const { x, y, z, color, type, subtype } = vehicle;

    // GUARD: rotation kann beim Spawn noch undefined sein → NaN würde die
    // gesamte Karosserie unsichtbar machen ("schwarze Kreise"-Bug).
    const rotation = Number.isFinite(vehicle.rotation) ? vehicle.rotation : 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    const sx = isoX(x, y, z);
    const sy = isoY(x, y, z);

    // Bildschirm-Basisvektoren der Fahrzeugachsen (Vorwärts F, Rechts R)
    const F = { x: isoX(x + cosR, y + sinR, z) - sx, y: isoY(x + cosR, y + sinR, z) - sy };
    const R = { x: isoX(x - sinR, y + cosR, z) - sx, y: isoY(x - sinR, y + cosR, z) - sy };

    // Lokaler Punkt (u: vor/zurück, v: rechts/links, hPx: Höhe in Pixeln)
    const P = (u, v, hPx) => ({
        x: sx + u * F.x + v * R.x,
        y: sy + u * F.y + v * R.y - hPx
    });

    const poly = (pts, fill, stroke = null, lw = 1) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    };

    // Einfacher Farb-Shader (hex → abgedunkelt/aufgehellt)
    const shade = (hex, f) => {
        const n = parseInt((hex || '#888888').replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f));
        const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f));
        const b = Math.max(0, Math.min(255, (n & 255) * f));
        return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    };

    // Quader zeichnen: Grundriss (u1..u2, v1..v2), von hBot bis hTop Pixel Höhe
    const box = (u1, u2, halfW, hBot, hTop, baseColor, outline = true) => {
        const b = [P(u2, -halfW, hBot), P(u2, halfW, hBot), P(u1, halfW, hBot), P(u1, -halfW, hBot)];
        const t = [P(u2, -halfW, hTop), P(u2, halfW, hTop), P(u1, halfW, hTop), P(u1, -halfW, hTop)];
        // Sichtbare Seitenflächen (einfach: alle 4, Painter sortiert grob über y)
        const faces = [0, 1, 2, 3].map(i => {
            const nx = (i + 1) % 4;
            const midY = (b[i].y + b[nx].y) / 2;
            return { pts: [b[i], b[nx], t[nx], t[i]], midY, i };
        }).sort((a, bb) => a.midY - bb.midY);
        for (const f of faces) {
            // Licht: Flächen Richtung unten-links hell, unten-rechts dunkler
            const lightF = f.i % 2 === 0 ? 0.82 : 0.62;
            poly(f.pts, shade(baseColor, lightF), outline ? 'rgba(15,23,42,0.65)' : null, Math.max(0.7, 0.8 * scale));
        }
        // Dachfläche (am hellsten — Licht von oben)
        poly(t, shade(baseColor, 1.12), outline ? 'rgba(15,23,42,0.65)' : null, Math.max(0.7, 0.8 * scale));
        return { b, t };
    };

    const S = scale; // Kürzel

    if (type === 'car') {
        const halfW = 6.5 * S;         // halbe Breite in px
        const len = 15 * S;            // halbe Länge
        const rideH = 2.2 * S;         // Bodenfreiheit — Räder tragen das Auto
        const bodyH = rideH + 6.5 * S; // Oberkante Karosserie

        // Weicher Schatten (feste, dezente Größe — kein Riesenfleck mehr)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 0.5 * S, 15 * S, 7 * S, 0, 0, Math.PI * 2);
        ctx.fill();

        // Räder (dunkle Ellipsen, VOR der Karosserie — stehen sichtbar auf dem Boden)
        ctx.fillStyle = '#111827';
        for (const [wu, wv] of [[0.55, -1], [0.55, 1], [-0.55, -1], [-0.55, 1]]) {
            const wx = sx + (wu * len) / Math.max(0.001, Math.hypot(F.x, F.y)) * F.x + (wv * halfW * 0.92) / Math.max(0.001, Math.hypot(R.x, R.y)) * R.x;
            const wy = sy + (wu * len) / Math.max(0.001, Math.hypot(F.x, F.y)) * F.y + (wv * halfW * 0.92) / Math.max(0.001, Math.hypot(R.x, R.y)) * R.y;
            ctx.beginPath();
            ctx.ellipse(wx, wy - 1.2 * S, 2.1 * S, 1.5 * S, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Skalenfaktoren: u/v-Einheiten für P sind "Weltkacheln" — wir rechnen in px um
        const fLen = Math.max(0.001, Math.hypot(F.x, F.y));
        const fWid = Math.max(0.001, Math.hypot(R.x, R.y));
        const U = (px) => px / fLen; // px → u
        const V = (px) => px / fWid; // px → v

        // Karosserie
        box(U(-len), U(len), V(halfW), rideH, bodyH, color);

        // Kabine (kürzer, leicht nach hinten versetzt) + Scheiben
        const cabU1 = U(-len * 0.45), cabU2 = U(len * 0.35);
        const cabTop = bodyH + 5 * S;
        const cab = box(cabU1, cabU2, V(halfW * 0.82), bodyH, cabTop, subtype === 2 ? color : '#e2e8f0');

        // Windschutzscheibe (vorn, Verlauf + Reflex)
        const wsGrad = ctx.createLinearGradient(sx, cabTop > bodyH ? sy - cabTop : sy, sx, sy - bodyH);
        wsGrad.addColorStop(0, '#bfe3f7');
        wsGrad.addColorStop(1, '#5db6e8');
        poly([P(cabU2, -V(halfW * 0.75), cabTop - 0.5 * S), P(cabU2, V(halfW * 0.75), cabTop - 0.5 * S),
              P(U(len * 0.5), V(halfW * 0.7), bodyH), P(U(len * 0.5), -V(halfW * 0.7), bodyH)], wsGrad, 'rgba(15,23,42,0.5)', 0.7);

        // Seitenfenster
        poly([P(cabU1, V(halfW * 0.82), cabTop - 1 * S), P(cabU2 - U(1 * S), V(halfW * 0.82), cabTop - 1 * S),
              P(cabU2 - U(1 * S), V(halfW * 0.82), bodyH + 1 * S), P(cabU1, V(halfW * 0.82), bodyH + 1 * S)], 'rgba(93, 182, 232, 0.9)');

        // Scheinwerfer (vorn) & Rücklichter (hinten)
        ctx.fillStyle = '#fef9c3';
        for (const vSide of [-0.7, 0.7]) {
            const hp = P(U(len), V(halfW) * vSide, rideH + 3 * S);
            ctx.beginPath(); ctx.arc(hp.x, hp.y, 1.1 * S, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ef4444';
        for (const vSide of [-0.7, 0.7]) {
            const tp = P(U(-len), V(halfW) * vSide, rideH + 3 * S);
            ctx.beginPath(); ctx.arc(tp.x, tp.y, 0.9 * S, 0, Math.PI * 2); ctx.fill();
        }

        // Skibox auf dem Dach (SUV-Subtyp)
        if (subtype === 2) {
            box(U(-len * 0.35), U(len * 0.2), V(halfW * 0.45), cabTop, cabTop + 2.2 * S, '#1f2937', false);
        }
    } else {
        // ===== BUS / REISEBUS =====
        const halfW = 7.5 * S;
        const len = subtype === 0 ? 24 * S : 19 * S;
        const rideH = 2.4 * S;
        const bodyH = rideH + 13 * S;

        const fLen = Math.max(0.001, Math.hypot(F.x, F.y));
        const fWid = Math.max(0.001, Math.hypot(R.x, R.y));
        const U = (px) => px / fLen;
        const V = (px) => px / fWid;

        // Schatten (feste, dezente Größe)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 0.5 * S, 24 * S, 9 * S, 0, 0, Math.PI * 2);
        ctx.fill();

        // Räder
        ctx.fillStyle = '#111827';
        for (const [wu, wv] of [[0.6, -1], [0.6, 1], [-0.6, -1], [-0.6, 1]]) {
            const wx = sx + (wu * len / fLen) * F.x + (wv * halfW * 0.9 / fWid) * R.x;
            const wy = sy + (wu * len / fLen) * F.y + (wv * halfW * 0.9 / fWid) * R.y;
            ctx.beginPath();
            ctx.ellipse(wx, wy - 1.3 * S, 2.6 * S, 1.8 * S, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Karosserie
        box(U(-len), U(len), V(halfW), rideH, bodyH, color);

        // Fensterband rundum (hell mit Reflex)
        const winBot = rideH + 6.5 * S;
        const winTop = bodyH - 1.5 * S;
        poly([P(U(-len * 0.9), V(halfW), winTop), P(U(len * 0.75), V(halfW), winTop),
              P(U(len * 0.75), V(halfW), winBot), P(U(-len * 0.9), V(halfW), winBot)], 'rgba(125, 211, 252, 0.95)', 'rgba(15,23,42,0.4)', 0.6);
        poly([P(U(-len * 0.9), -V(halfW), winTop), P(U(len * 0.75), -V(halfW), winTop),
              P(U(len * 0.75), -V(halfW), winBot), P(U(-len * 0.9), -V(halfW), winBot)], 'rgba(96, 165, 210, 0.9)');
        // Frontscheibe
        poly([P(U(len), -V(halfW * 0.85), winTop), P(U(len), V(halfW * 0.85), winTop),
              P(U(len), V(halfW * 0.85), winBot), P(U(len), -V(halfW * 0.85), winBot)], '#a5d8f5', 'rgba(15,23,42,0.5)', 0.7);

        // Dachaufbau (Klima) + Zierstreifen
        box(U(-len * 0.5), U(len * 0.3), V(halfW * 0.5), bodyH, bodyH + 1.8 * S, '#cbd5e1', false);
        poly([P(U(-len), V(halfW), rideH + 4.5 * S), P(U(len), V(halfW), rideH + 4.5 * S),
              P(U(len), V(halfW), rideH + 3 * S), P(U(-len), V(halfW), rideH + 3 * S)], 'rgba(255,255,255,0.35)');

        // Scheinwerfer & Rücklichter
        ctx.fillStyle = '#fef9c3';
        for (const vSide of [-0.65, 0.65]) {
            const hp = P(U(len), V(halfW) * vSide, rideH + 2.5 * S);
            ctx.beginPath(); ctx.arc(hp.x, hp.y, 1.3 * S, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ef4444';
        for (const vSide of [-0.65, 0.65]) {
            const tp = P(U(-len), V(halfW) * vSide, rideH + 2.5 * S);
            ctx.beginPath(); ctx.arc(tp.x, tp.y, 1.1 * S, 0, Math.PI * 2); ctx.fill();
        }
    }
};

export const drawTrafficBubble = (ctx, vehicle, scale, isoX, isoY, dt) => {
    if (vehicle.bubble) {
        const sx = isoX(vehicle.x, vehicle.y, vehicle.z + 2.5); // Floating above
        const sy = isoY(vehicle.x, vehicle.y, vehicle.z + 2.5);

        ctx.font = `bold ${Math.max(12, 14 * scale)}px Arial`;
        const text = vehicle.bubble.text;
        const metrics = ctx.measureText(text);
        const p = 8 * scale;
        const w = metrics.width + p * 2;
        const h = 24 * scale;

        // Bubble
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx - w / 2, sy - h, w, h, 6 * scale);
        else ctx.rect(sx - w / 2, sy - h, w, h); // Fallback
        ctx.fill();
        ctx.stroke();

        // Pointer
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 4 * scale, sy - 8 * scale); // overlapped by bubble
        ctx.lineTo(sx + 4 * scale, sy - 8 * scale);
        ctx.fill();

        // Text
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, sx, sy - h / 2);

        // Timer Logic
        if (dt) {
            vehicle.bubble.timer -= dt / 1000;
            if (vehicle.bubble.timer <= 0) vehicle.bubble = null;
        }
    }
};

// ===============================================
// GUEST RENDERING
// ===============================================
export const drawGuest = (ctx, guest, scale, isoX, isoY) => {
    const { x, y, z, jacketColor, pantsColor, helmetColor, state, hasSkis, walkPhase } = guest;

    const sx = isoX(x, y, z);
    const sy = isoY(x, y, z);

    // Guest scale (0.5x = half size, more visible)
    const s = scale * 0.5;
    const bob = state === 'WALKING' || state === 'QUEUE' || state === 'SKIING' ? Math.sin((walkPhase || 0) * 2) * 1.2 * s : 0;

    // Kopf mit Helm + verspiegelter Skibrille (gemeinsamer Helfer)
    const drawHead = (hx, hy, r) => {
        ctx.fillStyle = helmetColor;
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = Math.max(0.8, 0.5 * s);
        ctx.stroke();
        // Skibrille: dunkles Band + türkiser Glasreflex
        if (s > 0.14) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(hx - r * 0.9, hy - r * 0.15, r * 1.8, r * 0.75);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(hx - r * 0.7, hy - r * 0.05, r * 1.4, r * 0.5);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(hx - r * 0.55, hy, r * 0.45, r * 0.2);
        }
    };

    // Shadow (weicher, doppellagig)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 7 * s * 0.6, 7 * s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5 * s * 0.6, 5 * s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (state === 'SKIING') {
        const lean = Math.max(-1, Math.min(1, guest.skiLean || 0));
        // Schneestaub hinter dem Skifahrer (dezent, deterministisch)
        if (s > 0.12) {
            const spray = Math.abs(lean) * 0.5 + 0.3;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * spray})`;
            ctx.beginPath();
            ctx.arc(sx - 6 * s, sy + 1 * s, 2.4 * s * spray, 0, Math.PI * 2);
            ctx.arc(sx - 8.5 * s, sy + 1.8 * s, 1.6 * s * spray, 0, Math.PI * 2);
            ctx.fill();
        }
        // Skis (rot mit dunkler Kante)
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 6 * s + lean * 1.4 * s, sy + 0.3 * s);
        ctx.lineTo(sx + 4 * s + lean * 1.4 * s, sy - 0.9 * s);
        ctx.moveTo(sx - 5.3 * s - lean * 0.8 * s, sy + 1.7 * s);
        ctx.lineTo(sx + 4.7 * s - lean * 0.8 * s, sy + 0.4 * s);
        ctx.stroke();

        // Legs + body (forward ski posture)
        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 1.6 * s, sy - 0.4 * s);
        ctx.lineTo(sx - 0.5 * s, sy - 5.1 * s);
        ctx.moveTo(sx + 1.2 * s, sy - 0.8 * s);
        ctx.lineTo(sx + 0.1 * s, sy - 5.4 * s);
        ctx.stroke();

        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 3.2 * s;
        ctx.beginPath();
        ctx.moveTo(sx + lean * 1.2 * s, sy - 5.2 * s - bob * 0.3);
        ctx.lineTo(sx + lean * 2.2 * s, sy - 9.6 * s - bob * 0.3);
        ctx.stroke();

        // Ski poles
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 2.8 * s, sy - 7.8 * s);
        ctx.lineTo(sx - 4.6 * s, sy + 0.8 * s);
        ctx.moveTo(sx + 2.7 * s, sy - 7.6 * s);
        ctx.lineTo(sx + 4.2 * s, sy + 0.2 * s);
        ctx.stroke();

        drawHead(sx + lean * 2.3 * s, sy - 11.4 * s - bob * 0.2, 2.3 * s);
    } else if (state === 'WALKING' || state === 'QUEUE') {
        const legSwing = Math.sin(walkPhase || 0) * 2.2 * s;
        const armSwing = Math.sin((walkPhase || 0) + Math.PI) * 1.6 * s;
        // Legs
        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 2 * s - legSwing, sy);
        ctx.lineTo(sx - 2 * s - legSwing * 0.4, sy - 6 * s);
        ctx.moveTo(sx + 2 * s + legSwing, sy);
        ctx.lineTo(sx + 2 * s + legSwing * 0.4, sy - 6 * s);
        ctx.stroke();

        // Body (Umriss + Jacke mit hellerem Oberteil = zweifarbig)
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
        ctx.lineWidth = 4.8 * s;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 5.7 * s - bob);
        ctx.lineTo(sx, sy - 10.2 * s - bob);
        ctx.stroke();
        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 6 * s - bob);
        ctx.lineTo(sx, sy - 10 * s - bob);
        ctx.stroke();
        // Helle Schulter-Partie (Licht von oben)
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 9 * s - bob);
        ctx.lineTo(sx, sy - 10 * s - bob);
        ctx.stroke();

        // Arms
        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 3 * s - armSwing, sy - 8 * s - bob);
        ctx.lineTo(sx + 3 * s + armSwing, sy - 8 * s - bob);
        ctx.stroke();

        // Head
        drawHead(sx, sy - 12 * s - bob, 2.5 * s);

        // Skis on shoulder (mit Bindung)
        if (hasSkis) {
            ctx.strokeStyle = '#b91c1c';
            ctx.lineWidth = 2 * s;
            ctx.beginPath();
            ctx.moveTo(sx - 4 * s, sy - 13.5 * s);
            ctx.lineTo(sx + 4 * s, sy - 7.5 * s);
            ctx.stroke();
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(sx - 0.8 * s, sy - 11 * s, 1.6 * s, 1.2 * s);
        }
    } else if (state === 'QUEUE' || state === 'WAITING') {
        // Queue/Waiting: Same as walking (standing still)

        // Legs
        ctx.strokeStyle = pantsColor;
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 2 * s, sy);
        ctx.lineTo(sx - 2 * s, sy - 6 * s);
        ctx.moveTo(sx + 2 * s, sy);
        ctx.lineTo(sx + 2 * s, sy - 6 * s);
        ctx.stroke();

        // Body (mit Umriss)
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
        ctx.lineWidth = 4.8 * s;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 5.7 * s);
        ctx.lineTo(sx, sy - 10.2 * s);
        ctx.stroke();
        ctx.strokeStyle = jacketColor;
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 6 * s);
        ctx.lineTo(sx, sy - 10 * s);
        ctx.stroke();

        // Arms
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 3 * s, sy - 8 * s);
        ctx.lineTo(sx + 3 * s, sy - 8 * s);
        ctx.stroke();

        // Head
        drawHead(sx, sy - 12 * s, 2.5 * s);
    } else {
        // Default dot (for unknown states)
        ctx.fillStyle = jacketColor;
        ctx.beginPath();
        ctx.arc(sx, sy - 6 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

};
