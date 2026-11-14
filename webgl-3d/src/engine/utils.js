// Die Landschaftserzeugung liegt in terrainGen.js (Gratnetz, Umland, Hochrechnen).
export { generateWorldData, upsampleWorld, buildLevelWorld, TERRAIN_GEN, AREA_F, OUTER_MARGIN } from './terrainGen.js';

// ============================================================
// MAUS → KACHEL (höhen- & rotationsbewusst)
// RAYCAST statt Iteration: Wir laufen den Sichtstrahl von hinten
// nach vorne durch alle Kacheln und nehmen die VORDERSTE Fläche,
// die den Bildschirmpunkt schneidet. Konvergiert immer — auch auf
// steilen Hängen und in gedrehten Ansichten (90/180/270).
// ============================================================
export function screenToIso(screenX, screenY, scale, offsetX, offsetY, rotation = 0, gridSize = 256, heightmap = null) {
    const TILE_SIZE = 32;
    const dx = screenX - offsetX;
    const dy = screenY - offsetY;

    const tileHalfW = (TILE_SIZE / 2) * scale;
    const tileHalfH = (TILE_SIZE / 4) * scale;

    // Visuelle (i,j) → Daten-Koordinaten (identisch zur Render-Abbildung)
    const toData = (vi, vj) => {
        if (rotation === 90) return { x: gridSize - 1 - vj, y: vi };
        if (rotation === 180) return { x: gridSize - 1 - vi, y: gridSize - 1 - vj };
        if (rotation === 270) return { x: vj, y: gridSize - 1 - vi };
        return { x: vi, y: vj };
    };

    // Screen-x legt (i - j) fest; entlang des Strahls variiert s = i + j.
    const diff = dx / tileHalfW; // = i - j

    if (!heightmap) {
        const s = dy / tileHalfH;
        const vi = (s + diff) / 2;
        const vj = (s - diff) / 2;
        // WICHTIG: erst kontinuierlich spiegeln, DANN floorn —
        // sonst Off-by-one auf gespiegelten Achsen.
        const d = toData(vi, vj);
        return {
            x: Math.max(0, Math.min(gridSize - 1, Math.floor(d.x))),
            y: Math.max(0, Math.min(gridSize - 1, Math.floor(d.y))),
            z: 0
        };
    }

    const zScale = scale;
    // Eckhöhe wie im Renderer: Ecke (i,j) nutzt die Daten-Kachel toData(i,j)
    const cornerZ = (ci, cj) => {
        const ti = Math.max(0, Math.min(gridSize - 1, ci));
        const tj = Math.max(0, Math.min(gridSize - 1, cj));
        const d = toData(ti, tj);
        return heightmap[d.y * gridSize + d.x] || 0;
    };
    // Bilineare Interpolation über die vier Ecken — entspricht exakt der
    // gezeichneten Terrain-Oberfläche (keine Treppenstufen-Fehler mehr).
    const zAt = (vi, vj) => {
        const fi = Math.floor(vi), fj = Math.floor(vj);
        const tx = vi - fi, ty = vj - fj;
        const z00 = cornerZ(fi, fj), z10 = cornerZ(fi + 1, fj);
        const z01 = cornerZ(fi, fj + 1), z11 = cornerZ(fi + 1, fj + 1);
        return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
    };

    // f(s) = projizierte Bildschirm-y der Oberfläche bei Tiefe s, minus Ziel-y.
    // Nulldurchgänge = der Strahl trifft die Oberfläche. Der LETZTE (größte s)
    // ist die vorderste, sichtbare Fläche (Painter's Algorithm).
    const fAt = (s) => {
        const vi = (s + diff) / 2;
        const vj = (s - diff) / 2;
        return s * tileHalfH - zAt(vi, vj) * zScale - dy;
    };

    const sMax = 2 * gridSize;
    const step = 0.5; // halbe Kachel Auflösung, danach Verfeinerung
    let bestS = null;
    let prevS = 0;
    let prevF = fAt(0);

    for (let s = step; s <= sMax; s += step) {
        const f = fAt(s);
        if (prevF <= 0 && f >= 0) {
            // Aufwärts-Durchgang: Strahl trifft die Oberfläche von oben
            const t = Math.abs(prevF) + Math.abs(f) > 1e-6
                ? Math.abs(prevF) / (Math.abs(prevF) + Math.abs(f))
                : 0.5;
            bestS = prevS + t * step; // letzter Treffer gewinnt (vorderste Fläche)
        } else if (prevF >= 0 && f <= 0) {
            // Abwärts-Durchgang: aufsteigende Geländewand — sichtbar ist die
            // HÖHERE Kachel dahinter (Vorderseite der Wand)
            bestS = s;
        }
        prevS = s;
        prevF = f;
    }

    // Fallback: kein Schnitt (z. B. Klick in den Himmel) → flache Schätzung
    if (bestS === null) {
        bestS = dy / tileHalfH;
    }

    const vi = (bestS + diff) / 2;
    const vj = (bestS - diff) / 2;
    // WICHTIG: erst kontinuierlich spiegeln, DANN floorn —
    // sonst Off-by-one auf gespiegelten Achsen (90/180/270).
    const d = toData(vi, vj);
    const dataX = Math.max(0, Math.min(gridSize - 1, Math.floor(d.x)));
    const dataY = Math.max(0, Math.min(gridSize - 1, Math.floor(d.y)));
    const finalZ = heightmap[dataY * gridSize + dataX] || 0;

    return { x: dataX, y: dataY, z: finalZ };
}

export function isCliff(x, y, heightmap, gridSize) {
    if (!heightmap) return false;

    const idx = y * gridSize + x;
    const z = heightmap[idx];

    // Ensure we are within bounds
    if (x < 1 || y < 1 || x >= gridSize - 1 || y >= gridSize - 1) return false;

    // Get neighbor heights
    const zRight = heightmap[y * gridSize + (x + 1)];
    const zDown = (y + 1) * gridSize + x < heightmap.length ? heightmap[(y + 1) * gridSize + x] : z;
    const zLeft = heightmap[y * gridSize + (x - 1)];
    const zUp = (y - 1) * gridSize + x >= 0 ? heightmap[(y - 1) * gridSize + x] : z;

    // Calculate gradient magnitude (Central Differences)
    const gradX = (zRight - zLeft) / 2;
    const gradY = (zDown - zUp) / 2;
    const gradMagnitude = Math.sqrt(gradX * gradX + gradY * gradY);

    // Threshold matching WorldCanvas visual
    return gradMagnitude > 16.9;
}
