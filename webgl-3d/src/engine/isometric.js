
/**
 * Isometric Engine Utilities
 * Converts between Cartesion (2D Screen) and Isometric (Grid) coordinates.
 */

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

/**
 * Converts grid (iso) coordinates to screen (cartesian) coordinates.
 * @param {number} x - Grid X
 * @param {number} y - Grid Y
 * @returns {{x: number, y: number}} Screen coordinates
 */
export function gridToScreen(x, y) {
    return {
        x: (x - y) * (TILE_WIDTH / 2),
        y: (x + y) * (TILE_HEIGHT / 2)
    };
}

/**
 * Converts screen (cartesian) coordinates to grid (iso) coordinates.
 * @param {number} x - Screen X
 * @param {number} y - Screen Y
 * @returns {{x: number, y: number}} Grid coordinates
 */
export function screenToGrid(x, y) {
    return {
        x: (x / (TILE_WIDTH / 2) + y / (TILE_HEIGHT / 2)) / 2,
        y: (y / (TILE_HEIGHT / 2) - x / (TILE_WIDTH / 2)) / 2
    };
}
