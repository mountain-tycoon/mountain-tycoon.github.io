// ============================================================
// ZUFAHRTSPLANUNG FÜR ORTSCHAFTEN — reine Logik, kein Three.js.
//
// Plant für einen Ort die komplette Erschließung:
//   - Ortseingang (Punkt am Ortsrand, der zur Kartenkante zeigt)
//   - Hauptstraße von der Kartenkante zum Ortseingang, um Hindernisse herum
//   - Parkplatz seitlich der Straße, AUSSERHALB des Ortes
//   - Einfahrtsstich vom Parkplatz zur Straße
//   - Bushaltestelle an der Straße auf der Gegenseite
//
// Bewusst von Scene3D getrennt: dort hängt alles an einer riesigen Closure
// und ließ sich nie isoliert prüfen. Genau deshalb sind die Fehler lange
// unbemerkt geblieben — die Straße "verschwand", weil die Wegsuche im
// belegten Ortsmittelpunkt startete, und der Parkplatz landete im Ort, weil
// die Suche im belegten Bereich begann und der Notnagel nichts prüfte.
// ============================================================

/**
 * @typedef {object} PlanInput
 * @property {number} gridSize
 * @property {number} vgx  Ortsmittelpunkt (Kachel)
 * @property {number} vgy
 * @property {number} vRad Ortsradius in Kacheln (belegte Fläche)
 * @property {(x:number,y:number)=>boolean} blocked   Kachel belegt (Bauland)?
 * @property {(x:number,y:number)=>boolean} buildable Kachel bebaubar (kein Wasser/Fels/zu steil)?
 * @property {(x:number,y:number)=>boolean} [avoid]   zusätzlich zu meidende Kacheln (Piste, Lift)
 * @property {number} [lotSize]   Kantenlänge der Parkplatz-Parzelle (Kacheln), Standard 7
 * @property {number} [anchorX]   Bezugspunkt für "möglichst nah" (z.B. Talstation)
 * @property {number} [anchorY]
 * @property {boolean} [wantBusStop]
 */

/** Breitensuche über passierbare Kacheln; 8 Richtungen. */
export function findPath(A, B, passable, gridSize, maxSteps = 60000) {
    const key = (x, y) => x + ',' + y;
    const prev = new Map();
    const seen = new Set([key(A.x, A.y)]);
    let queue = [A], ziel = null, guard = 0;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (queue.length && !ziel && guard++ < maxSteps) {
        const next = [];
        for (const c of queue) {
            if (Math.abs(c.x - B.x) <= 1 && Math.abs(c.y - B.y) <= 1) { ziel = c; break; }
            for (const [dx, dy] of DIRS) {
                const nx = c.x + dx, ny = c.y + dy;
                if (nx < 1 || ny < 1 || nx >= gridSize - 1 || ny >= gridSize - 1) continue;
                const k = key(nx, ny);
                if (seen.has(k)) continue;
                const nahZiel = Math.abs(nx - B.x) <= 1 && Math.abs(ny - B.y) <= 1;
                if (!nahZiel && !passable(nx, ny)) continue;
                seen.add(k); prev.set(k, c); next.push({ x: nx, y: ny });
            }
        }
        if (ziel) break;
        queue = next;
    }
    if (!ziel) return null;
    const chain = [];
    for (let c = ziel; c; c = prev.get(key(c.x, c.y))) {
        chain.push({ gx: c.x, gy: c.y });
        if (c.x === A.x && c.y === A.y) break;
    }
    chain.reverse();
    if (chain[chain.length - 1].gx !== B.x || chain[chain.length - 1].gy !== B.y) chain.push({ gx: B.x, gy: B.y });
    return chain;
}

/** Pfad ausdünnen und glätten — aber keinen Punkt auf belegten Grund schieben. */
export function smoothPath(chain, passable, every = 5) {
    if (!chain || chain.length < 2) return chain || [];
    const pts = [chain[0]];
    for (let i = every; i < chain.length - 1; i += every) pts.push(chain[i]);
    pts.push(chain[chain.length - 1]);
    for (let r = 0; r < 2; r++) {
        for (let i = 1; i < pts.length - 1; i++) {
            const gx = (pts[i - 1].gx + pts[i].gx * 2 + pts[i + 1].gx) / 4;
            const gy = (pts[i - 1].gy + pts[i].gy * 2 + pts[i + 1].gy) / 4;
            // Glätten darf den Punkt nicht in ein Gebäude ziehen
            if (passable(Math.round(gx), Math.round(gy))) pts[i] = { gx, gy };
        }
    }
    return pts;
}

/** Nächstgelegene freie Parzelle (Kantenlänge n) rings um einen Punkt. */
function freeParcelNear(cx, cy, n, isFree, maxR) {
    let best = null, bd = Infinity;
    for (let dy = -maxR; dy <= maxR; dy++) for (let dx = -maxR; dx <= maxR; dx++) {
        const x = cx + dx, y = cy + dy;
        const ox = Math.round(x - (n - 1) / 2), oy = Math.round(y - (n - 1) / 2);
        if (!isFree(ox, oy, n)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { gx: x, gy: y, ox, oy }; }
    }
    return best;
}

/**
 * Komplette Erschließung eines Ortes planen.
 * @param {PlanInput} inp
 */
export function planVillageAccess(inp) {
    const { gridSize, vgx, vgy, vRad } = inp;
    const blocked = inp.blocked, buildable = inp.buildable;
    const avoid = inp.avoid || (() => false);
    const lotN = inp.lotSize || 7;
    const anchorX = inp.anchorX ?? vgx, anchorY = inp.anchorY ?? vgy;

    // ---- 1) Zufahrtsrichtung: die nächste Kartenkante ----
    const dxE = Math.min(vgx, gridSize - 1 - vgx);
    const dyE = Math.min(vgy, gridSize - 1 - vgy);
    const toX = dxE <= dyE;
    const sgn = toX ? (vgx < gridSize / 2 ? -1 : 1) : (vgy < gridSize / 2 ? -1 : 1);
    const dirX = toX ? sgn : 0, dirY = toX ? 0 : sgn;

    // ---- 2) Ortseingang: am Ortsrand, zur Kante hin ----
    // Der Ortsmittelpunkt ist belegt — von dort kann keine Wegsuche
    // starten. Die Straße endet deshalb am RAND des Ortes.
    const passable = (x, y) => x >= 1 && y >= 1 && x < gridSize - 1 && y < gridSize - 1
        && !blocked(x, y) && buildable(x, y) && !avoid(x, y);
    // Der ideale Eingang liegt genau in Zufahrtsrichtung. Steht dort aber
    // schon etwas (typisch: die Talstation direkt am Ortsrand), wird am
    // Ortsrand entlang nach dem nächsten FREIEN Punkt gesucht — winkelweise
    // nach beiden Seiten, notfalls ein paar Kacheln weiter draußen.
    const ideal = Math.atan2(dirY, dirX);
    let entry = null;
    outer: for (let rr = vRad + 1; rr <= vRad + 5 && !entry; rr++) {
        for (let k = 0; k <= 24; k++) {
            for (const sg of (k === 0 ? [1] : [1, -1])) {
                const a = ideal + sg * k * (Math.PI / 24);
                const x = Math.round(vgx + Math.cos(a) * rr), y = Math.round(vgy + Math.sin(a) * rr);
                // frei UND ein Schritt nach außen ebenfalls frei
                if (passable(x, y) && passable(x + Math.round(Math.cos(a)), y + Math.round(Math.sin(a)))) {
                    entry = { x, y }; break outer;
                }
            }
        }
    }
    if (!entry) entry = { x: Math.round(vgx + dirX * (vRad + 1)), y: Math.round(vgy + dirY * (vRad + 1)) };

    // Kantenkachel: die Wegsuche darf ihr Ziel zwar auch in belegtes Land
    // legen (Ausnahme für die letzte Kachel) — an der Kante darf das aber
    // nicht passieren, sonst endet die Straße im Fels. Liegt die direkte
    // Kantenkachel nicht frei, rutscht das Ziel an der Kante entlang zur
    // nächsten freien Stelle.
    let edge = { x: toX ? (sgn < 0 ? 1 : gridSize - 2) : entry.x,
                 y: toX ? entry.y : (sgn < 0 ? 1 : gridSize - 2) };
    if (!passable(edge.x, edge.y)) {
        for (let d = 1; d < gridSize; d++) {
            const cands = toX ? [{ x: edge.x, y: edge.y + d }, { x: edge.x, y: edge.y - d }]
                              : [{ x: edge.x + d, y: edge.y }, { x: edge.x - d, y: edge.y }];
            const hit = cands.find(c => c.x >= 1 && c.y >= 1 && c.x < gridSize - 1 && c.y < gridSize - 1
                                        && passable(c.x, c.y) && passable(c.x - dirX, c.y - dirY));
            if (hit) { edge = hit; break; }
        }
    }
    const parcelFree = (ox, oy, n) => {
        for (let y = oy; y < oy + n; y++) for (let x = ox; x < ox + n; x++) {
            if (x < 2 || y < 2 || x >= gridSize - 2 || y >= gridSize - 2) return false;
            if (blocked(x, y) || !buildable(x, y) || avoid(x, y)) return false;
        }
        return true;
    };

    // ---- 3) Hauptstraße: Ortseingang -> Kante ----
    let chain = findPath(entry, edge, passable, gridSize);
    if (!chain) {
        // Notweg: gerade Linie, aber nur Kacheln außerhalb des Ortes
        chain = [];
        const n = Math.max(2, Math.round(Math.hypot(edge.x - entry.x, edge.y - entry.y)));
        for (let i = 0; i <= n; i++) {
            chain.push({ gx: Math.round(entry.x + (edge.x - entry.x) * i / n),
                         gy: Math.round(entry.y + (edge.y - entry.y) * i / n) });
        }
    }
    const mainWay = smoothPath(chain, passable);

    // ---- 4) Parkplatz: seitlich der Straße, AUSSERHALB des Ortes ----
    // Kandidaten entlang der geplanten Straße, mindestens (vRad + lotN/2 + 2)
    // vom Ortsmittelpunkt entfernt, damit die Parzelle sicher außerhalb liegt.
    const minOrt = vRad + Math.ceil(lotN / 2) + 2;
    let lot = null, jIdx = -1, jSide = 1, bestLot = Infinity;
    for (let si = 0; si < chain.length; si++) {
        const m = chain[si];
        const dOrt = Math.hypot(m.gx - vgx, m.gy - vgy);
        if (dOrt < minOrt || dOrt > minOrt + 22) continue;
        const m2 = chain[Math.min(chain.length - 1, si + 3)];
        const m1 = chain[Math.max(0, si - 3)];
        let tx = m2.gx - m1.gx, ty = m2.gy - m1.gy;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        for (const side of [1, -1]) {
            const off = Math.ceil(lotN / 2) + 3;             // Pad + Stichlänge
            const cx = Math.round(m.gx + nx * side * off);
            const cy = Math.round(m.gy + ny * side * off);
            const ox = Math.round(cx - (lotN - 1) / 2), oy = Math.round(cy - (lotN - 1) / 2);
            if (!parcelFree(ox, oy, lotN)) continue;
            // Parzelle darf die Straße nicht berühren
            let touches = false;
            for (const c of chain) {
                if (c.gx >= ox - 1 && c.gx < ox + lotN + 1 && c.gy >= oy - 1 && c.gy < oy + lotN + 1) { touches = true; break; }
            }
            if (touches) continue;
            const d = Math.hypot(cx - anchorX, cy - anchorY);
            if (d < bestLot) { bestLot = d; lot = { gx: cx, gy: cy, ox, oy, n: lotN }; jIdx = si; jSide = side; }
        }
    }
    if (!lot) {
        // Kein Platz direkt an der Straße: nächstgelegene freie Parzelle
        // außerhalb des Ortes, dann Stich zur nächsten Straßenkachel.
        const seed = chain[Math.min(chain.length - 1, Math.round(chain.length * 0.35))];
        const f = freeParcelNear(seed.gx, seed.gy, lotN, parcelFree, 18);
        if (f) {
            lot = { gx: f.gx, gy: f.gy, ox: f.ox, oy: f.oy, n: lotN };
            let bd = Infinity;
            for (let si = 0; si < chain.length; si++) {
                const d = Math.hypot(chain[si].gx - f.gx, chain[si].gy - f.gy);
                if (d < bd) { bd = d; jIdx = si; }
            }
        }
    }
    let junction = null, stub = null, lotEntry = null, yaw = 0;
    if (lot) {
        junction = chain[jIdx];
        const ddx = junction.gx - lot.gx, ddy = junction.gy - lot.gy;
        const dl = Math.hypot(ddx, ddy) || 1;
        const ex = ddx / dl, ey = ddy / dl;
        // Einfahrt beginnt an der Padkante
        const edgeOff = (lotN - 1) / 2;
        lotEntry = { gx: lot.gx + ex * edgeOff, gy: lot.gy + ey * edgeOff };
        stub = [];
        const n = Math.max(2, Math.round(dl - edgeOff));
        for (let i = 0; i <= n; i++) {
            stub.push({ gx: lotEntry.gx + (junction.gx - lotEntry.gx) * i / n,
                        gy: lotEntry.gy + (junction.gy - lotEntry.gy) * i / n });
        }
        // Blickrichtung geparkter Autos: auf 90° gerastet, Einfahrt zur Straße
        yaw = Math.round(Math.atan2(ex, ey) / (Math.PI / 2)) * (Math.PI / 2);
    }

    // ---- 5) Bushaltestelle: Gegenseite der Straße, kurz vor dem Ort ----
    let busStop = null;
    if (inp.wantBusStop) {
        for (let si = 0; si < chain.length && !busStop; si++) {
            const m = chain[si];
            const dOrt = Math.hypot(m.gx - vgx, m.gy - vgy);
            if (dOrt < vRad + 3 || dOrt > vRad + 18) continue;
            const m2 = chain[Math.min(chain.length - 1, si + 3)];
            const m1 = chain[Math.max(0, si - 3)];
            let tx = m2.gx - m1.gx, ty = m2.gy - m1.gy;
            const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const nx = -ty, ny = tx;
            const side = -jSide;
            const bsx = Math.round(m.gx + nx * side * 4), bsy = Math.round(m.gy + ny * side * 4);
            const ox = bsx - 1, oy = bsy - 1;
            if (!parcelFree(ox, oy, 3)) continue;
            // nicht in der Parkplatzparzelle
            if (lot && bsx >= lot.ox - 1 && bsx < lot.ox + lot.n + 1 && bsy >= lot.oy - 1 && bsy < lot.oy + lot.n + 1) continue;
            busStop = { gx: bsx, gy: bsy, ox, oy, n: 3,
                        stopAt: { gx: m.gx, gy: m.gy }, stopIdx: si,
                        // Häuschen schaut zur Straße
                        yaw: Math.round(Math.atan2(-nx * side, -ny * side) / (Math.PI / 2)) * (Math.PI / 2) };
        }
    }

    return { dirX, dirY, entry, edge, chain, mainWay, lot, junction, stub, lotEntry, yaw, busStop, jIdx };
}
