
export const COLORS = {
    SNOW: '#ffffff',
    SNOW_SHADOW: '#e2e8f0',
    PISTE_BLUE: '#3b82f6',
    PISTE_RED: '#ef4444',
    PISTE_BLACK: '#1a1a1a',
    TREELINE: '#166534',
    ROCK: '#4b5563',
    UI_GLASS: 'rgba(255, 255, 255, 0.1)',
    UI_TEXT: '#f8fafc',
    MONEY: '#10b981'
};

export const TILE_SIZE = 32;
export const GRID_SIZE = 128;

export const LIFT_TYPES = {
    CARPET: {
        name: 'Magic Carpet', capacity: 1, speed: 1, cost: 700, costPer10m: 100,
        maxSlope: 10, maxLength: 20
    },
    TOW_T: {
        name: 'T-Bar Lift', capacity: 2, speed: 3, cost: 2700, costPer10m: 300,
        maxSlope: 35, maxLength: 150
    },
    TOW_P: {
        name: 'Platter Lift', capacity: 1, speed: 3, cost: 1500, costPer10m: 200,
        maxSlope: 30, maxLength: 120
    },
    CHAIR_2: {
        name: '2-Seater Chairlift', capacity: 2, speed: 3, cost: 7700, costPer10m: 800,
        maxSlope: 60, maxLength: 300
    },
    CHAIR_4: {
        name: '4-Seater Chairlift', capacity: 4, speed: 4, cost: 15400, costPer10m: 1000,
        maxSlope: 70, maxLength: 500
    },
    CHAIR_6: {
        name: '6-Seater Chairlift', capacity: 6, speed: 5, cost: 25200, costPer10m: 1300,
        maxSlope: 80, maxLength: 800
    },
    CHAIR_8: {
        name: '8-Seater Chairlift', capacity: 8, speed: 5, cost: 40600, costPer10m: 1500,
        maxSlope: 85, maxLength: 1200
    },
    GONDOLA_8: {
        name: '8-Person Gondola', capacity: 8, speed: 6, cost: 73500, costPer10m: 2100,
        maxSlope: 90, maxLength: 1500
    },
    GONDOLA_12: {
        name: '12-Person Gondola', capacity: 12, speed: 6, cost: 122500, costPer10m: 2700,
        maxSlope: 95, maxLength: 2000
    },
    TRAM_50: {
        name: '50-Person Aerial Tramway', capacity: 50, speed: 8, cost: 392000, costPer10m: 5200,
        maxSlope: 100, maxLength: 3500
    },
    TRAM_100: {
        name: '100-Person Aerial Tramway', capacity: 100, speed: 8, cost: 735000, costPer10m: 7700,
        maxSlope: 100, maxLength: 6000
    },
    COG_RAIL: {
        name: 'Cog Railway', capacity: 150, speed: 8, cost: 1225000, costPer10m: 10500,
        maxSlope: 100, maxLength: 10000
    }
};
