// ============================================================
// CAMPAIGN — 7 Level in aufsteigender Größe & Schwierigkeit
// Jedes Level: eigenes Land, eigene Landschaft (Terrain-Config
// für den prozeduralen Generator), eigenes Farbthema und
// eigene Missions-Ziele.
// ============================================================

export const OBJECTIVE_TYPES = {
    guests_total:   { label: (t) => `${t.toLocaleString()} Besucher insgesamt`, unit: '' },
    current_guests: { label: (t) => `${t} Gäste gleichzeitig im Resort`, unit: '' },
    revenue_total:  { label: (t) => `€${t.toLocaleString()} Gesamtumsatz`, unit: '€' },
    money:          { label: (t) => `€${t.toLocaleString()} Kontostand`, unit: '€' },
    piste_km_total: { label: (t) => `${t} km Pisten gesamt`, unit: 'km' },
    piste_km_blue:  { label: (t) => `${t} km blaue Pisten`, unit: 'km' },
    piste_km_red:   { label: (t) => `${t} km rote Pisten`, unit: 'km' },
    piste_km_black: { label: (t) => `${t} km schwarze Pisten`, unit: 'km' },
    lift_count:     { label: (t) => `${t} Lifte bauen`, unit: '' },
    lift_capacity:  { label: (t) => `Lift mit ${t}+ Personen Kapazität`, unit: '' },
    satisfaction:   { label: (t) => `${t}% Gästezufriedenheit`, unit: '%' },
    hotel_beds:     { label: (t) => `${t} Hotelbetten`, unit: '' },
    gastro_count:   { label: (t) => `${t} Restaurants/Hütten`, unit: '' },
    shop_count:     { label: (t) => `${t} Geschäfte`, unit: '' },
    profit_day:     { label: (t) => `€${t.toLocaleString()} Gewinn an einem Tag`, unit: '€' },
    poi_summit:     { label: (t) => `${t} Gäste am Gipfelkreuz ✝`, unit: '' },
    poi_valley:     { label: (t) => `${t} Gäste am Talkreuz ✝`, unit: '' },
    poi_lake:       { label: (t) => `${t} Gäste am Bergsee-Panorama`, unit: '' }
};

/**
 * Evaluate one objective against manager.getMissionStats().
 * Returns { current, target, done, pct }
 */
export function evaluateObjective(obj, stats) {
    let current = 0;
    switch (obj.type) {
        case 'guests_total':   current = stats.totalGuestsServed; break;
        case 'current_guests': current = stats.currentGuests; break;
        case 'revenue_total':  current = stats.totalRevenue; break;
        case 'money':          current = stats.money; break;
        case 'piste_km_total': current = stats.pisteKmTotal; break;
        case 'piste_km_blue':  current = stats.pisteKmBlue; break;
        case 'piste_km_red':   current = stats.pisteKmRed; break;
        case 'piste_km_black': current = stats.pisteKmBlack; break;
        case 'lift_count':     current = stats.liftCount; break;
        case 'lift_capacity':  current = stats.maxLiftCapacity; break;
        case 'satisfaction':
            // Zufriedenheit zählt erst ab einer Mindestzahl an Gästen
            current = stats.currentGuests >= (obj.minGuests || 10) ? stats.satisfaction : 0;
            break;
        case 'hotel_beds':     current = stats.hotelBeds; break;
        case 'gastro_count':   current = stats.gastroCount; break;
        case 'shop_count':     current = stats.shopCount; break;
        case 'profit_day':     current = stats.bestDailyProfit; break;
        case 'poi_summit':     current = stats.poiSummit || 0; break;
        case 'poi_valley':     current = stats.poiValley || 0; break;
        case 'poi_lake':       current = stats.poiLake || 0; break;
        default: current = 0;
    }
    const target = obj.target;
    const done = current >= target;
    const pct = Math.max(0, Math.min(1, target > 0 ? current / target : 0));
    return { current, target, done, pct };
}

export function objectiveLabel(obj) {
    const def = OBJECTIVE_TYPES[obj.type];
    let label = def ? def.label(obj.target) : `${obj.target}`;
    if (obj.type === 'satisfaction' && obj.minGuests) {
        label += ` (ab ${obj.minGuests} Gästen)`;
    }
    return label;
}

export function formatObjectiveValue(obj, value) {
    if (obj.type.startsWith('piste_km')) return `${value.toFixed(1)} km`;
    if (obj.type === 'satisfaction') return `${Math.round(value)}%`;
    if (OBJECTIVE_TYPES[obj.type]?.unit === '€') return `€${Math.round(value).toLocaleString()}`;
    return `${Math.round(value).toLocaleString()}`;
}

// ------------------------------------------------------------
// LEVELS
// ------------------------------------------------------------

export const CAMPAIGN_LEVELS = [
    {
        id: 'mittelgebirge',
        index: 0,
        name: 'Schwarzwald',
        country: 'Deutschland',
        flag: '🇩🇪',
        tagline: 'Sanfte Mittelgebirgshänge — der perfekte Einstieg.',
        description: 'Baue dein erstes kleines Skigebiet zwischen bewaldeten Kuppen. Grüne Täler, ein Bach, viel Wald — und Gäste, die auf ihre erste Abfahrt warten.',
        gridSize: 192,
        startingMoney: 2000000,
        terrain: {
            seed: 20261,
            baseAltitude: 800,
            peakSpread: 0.3,
            peakCount: 3,
            peakHeight: 380,
            outerHills: 3,
            ridges: 2,
            ruggedness: 0.25,
            valleyDepth: 10,
            treeLine: 240,
            snowLine: 30,
            glacierLine: null,
            forestDensity: 0.85,
            forestMix: 'mixed',
            riverCount: 1,
            riverWidth: 1.6,
            lakeCount: 1
        },
        theme: {
            skyTop: [96, 148, 210], skyBottom: [186, 214, 240],
            snowWarmth: 0.35,
            grassLight: [140, 176, 96], grassDark: [96, 132, 70],
            hazeColor: [205, 220, 235]
        },
        objectives: [
            { type: 'poi_summit', target: 5 },
            { type: 'lift_count', target: 2 },
            { type: 'piste_km_total', target: 2 },
            { type: 'guests_total', target: 60 },
            { type: 'revenue_total', target: 30000 }
        ]
    },
    {
        id: 'alpen',
        index: 1,
        name: 'Tiroler Alpen',
        country: 'Österreich',
        flag: '🇦🇹',
        tagline: 'Das klassische Alpenpanorama.',
        description: 'Steilere Hänge, echte Gipfel und anspruchsvollere Gäste. Zeit für rote Pisten und die erste Hütte mit Kaiserschmarrn.',
        gridSize: 240,
        startingMoney: 3000000,
        terrain: {
            seed: 4711,
            baseAltitude: 1400,
            peakSpread: 0.38,
            peakCount: 4,
            peakHeight: 650,
            outerHills: 3,
            ridges: 3,
            ruggedness: 0.4,
            valleyDepth: 10,
            treeLine: 300,
            snowLine: 18,
            glacierLine: 520,
            forestDensity: 0.65,
            forestMix: 'conifer',
            riverCount: 1,
            riverWidth: 2.0,
            lakeCount: 1
        },
        theme: {
            skyTop: [80, 136, 205], skyBottom: [178, 208, 238],
            snowWarmth: 0.15,
            grassLight: [128, 165, 92], grassDark: [88, 124, 66],
            hazeColor: [200, 216, 236]
        },
        objectives: [
            { type: 'poi_summit', target: 10 },
            { type: 'piste_km_total', target: 5 },
            { type: 'piste_km_red', target: 1 },
            { type: 'guests_total', target: 150 },
            { type: 'gastro_count', target: 1 },
            { type: 'satisfaction', target: 70, minGuests: 15 },
            { type: 'revenue_total', target: 90000 }
        ]
    },
    {
        id: 'schweiz',
        index: 2,
        name: 'Walliser Alpen',
        country: 'Schweiz',
        flag: '🇨🇭',
        tagline: 'Viertausender und ewiges Eis.',
        description: 'Unter den höchsten Gipfeln der Alpen wartet ein gewaltiger Gletscher. Baue ein nobles Resort im Stil von Zermatt — mit Gletscherskigebiet und Panorama-Gondeln.',
        gridSize: 256,
        startingMoney: 3500000,
        terrain: {
            seed: 1291,
            baseAltitude: 1620,
            peakSpread: 0.4,
            peakCount: 5,
            peakHeight: 950,
            outerHills: 3,
            ridges: 4,
            ruggedness: 0.6,
            valleyDepth: 10,
            treeLine: 260,
            snowLine: 12,
            glacierLine: 540,
            forestDensity: 0.55,
            forestMix: 'conifer',
            riverCount: 1,
            riverWidth: 2.2,
            lakeCount: 1
        },
        theme: {
            skyTop: [70, 128, 200], skyBottom: [172, 204, 236],
            snowWarmth: -0.1,
            grassLight: [130, 168, 96], grassDark: [90, 126, 70],
            hazeColor: [198, 212, 234]
        },
        objectives: [
            { type: 'poi_summit', target: 15 },
            { type: 'poi_valley', target: 10 },
            { type: 'piste_km_total', target: 8 },
            { type: 'piste_km_red', target: 2 },
            { type: 'piste_km_black', target: 1 },
            { type: 'guests_total', target: 250 },
            { type: 'lift_capacity', target: 12 },
            { type: 'hotel_beds', target: 30 },
            { type: 'revenue_total', target: 250000 }
        ]
    },
    {
        id: 'frankreich',
        index: 3,
        name: 'Savoyer Alpen',
        country: 'Frankreich',
        flag: '🇫🇷',
        tagline: 'Das größte Skigebiet der Welt bauen.',
        description: 'Weite Hochtäler wie in Les Trois Vallées: verbinde mehrere Berge zu einem riesigen Liftverbund. Gletscher, endlose Grate und französische Gastronomie.',
        gridSize: 272,
        startingMoney: 4000000,
        terrain: {
            seed: 1789,
            baseAltitude: 1400,
            peakSpread: 0.46,
            peakCount: 6,
            peakHeight: 1000,
            outerHills: 4,
            ridges: 4,
            ruggedness: 0.5,
            valleyDepth: 10,
            treeLine: 280,
            snowLine: 10,
            glacierLine: 620,
            forestDensity: 0.6,
            forestMix: 'conifer',
            riverCount: 1,
            riverWidth: 2.0,
            lakeCount: 2
        },
        theme: {
            skyTop: [84, 138, 206], skyBottom: [180, 208, 238],
            snowWarmth: 0.05,
            grassLight: [134, 170, 98], grassDark: [92, 128, 72],
            hazeColor: [202, 214, 234]
        },
        objectives: [
            { type: 'poi_valley', target: 15 },
            { type: 'piste_km_total', target: 10 },
            { type: 'piste_km_red', target: 2 },
            { type: 'piste_km_black', target: 1 },
            { type: 'lift_count', target: 4 },
            { type: 'guests_total', target: 400 },
            { type: 'gastro_count', target: 2 },
            { type: 'satisfaction', target: 74, minGuests: 25 },
            { type: 'revenue_total', target: 400000 }
        ]
    },
    {
        id: 'norwegen',
        index: 4,
        name: 'Fjordland',
        country: 'Norwegen',
        flag: '🇳🇴',
        tagline: 'Schnee bis ans Wasser, Gletscher am Gipfel.',
        description: 'Hoch über den Fjorden: tiefer Schnee bis ins Tal, ein Gletscherfeld am Grat und lange, kalte Abfahrten. Deine Gäste bleiben über Nacht — baue Hotels.',
        gridSize: 288,
        startingMoney: 4500000,
        terrain: {
            seed: 8841,
            baseAltitude: 300,
            peakSpread: 0.42,
            peakCount: 4,
            peakHeight: 820,
            outerHills: 2,
            ridges: 3,
            ruggedness: 0.55,
            valleyDepth: 8,
            treeLine: 170,
            snowLine: 0,
            glacierLine: 560,
            forestDensity: 0.5,
            forestMix: 'winter',
            riverCount: 1,
            riverWidth: 3.2,
            lakeCount: 2
        },
        theme: {
            skyTop: [70, 110, 168], skyBottom: [160, 192, 226],
            snowWarmth: -0.35,
            grassLight: [120, 150, 110], grassDark: [84, 112, 82],
            hazeColor: [190, 208, 230]
        },
        objectives: [
            { type: 'poi_lake', target: 10 },
            { type: 'piste_km_total', target: 8 },
            { type: 'piste_km_red', target: 2 },
            { type: 'hotel_beds', target: 20 },
            { type: 'guests_total', target: 300 },
            { type: 'lift_capacity', target: 8 },
            { type: 'revenue_total', target: 180000 }
        ]
    },
    {
        id: 'rockies',
        index: 5,
        name: 'Rocky Mountains',
        country: 'USA',
        flag: '🇺🇸',
        tagline: 'Big Mountain Skiing — steil, hoch, wild.',
        description: 'Schroffe Grate, hohe Gipfel und die ersten schwarzen Abfahrten. Amerikanische Gäste erwarten großes Kino: lange Lifte und breite Bowls.',
        gridSize: 304,
        startingMoney: 5500000,
        terrain: {
            seed: 1776,
            baseAltitude: 2500,
            peakSpread: 0.45,
            peakCount: 5,
            peakHeight: 1000,
            outerHills: 3,
            ridges: 4,
            ruggedness: 0.7,
            valleyDepth: 10,
            treeLine: 340,
            snowLine: 0,
            glacierLine: 680,
            forestDensity: 0.55,
            forestMix: 'conifer',
            riverCount: 1,
            riverWidth: 2.2,
            lakeCount: 2
        },
        theme: {
            skyTop: [64, 124, 200], skyBottom: [172, 204, 236],
            snowWarmth: 0.0,
            grassLight: [150, 160, 100], grassDark: [104, 118, 74],
            hazeColor: [198, 212, 232]
        },
        objectives: [
            { type: 'poi_summit', target: 20 },
            { type: 'piste_km_total', target: 12 },
            { type: 'piste_km_black', target: 2 },
            { type: 'lift_count', target: 4 },
            { type: 'guests_total', target: 600 },
            { type: 'satisfaction', target: 75, minGuests: 25 },
            { type: 'revenue_total', target: 350000 }
        ]
    },
    {
        id: 'kanada',
        index: 6,
        name: 'British Columbia',
        country: 'Kanada',
        flag: '🇨🇦',
        tagline: 'Endlose Wälder, tiefverschneite Seen.',
        description: 'Powder ohne Ende zwischen riesigen Nadelwäldern und zugefrorenen Seen. Ein komplettes Resort mit Hotels, Gastronomie und Shopping ist gefragt.',
        gridSize: 320,
        startingMoney: 6500000,
        terrain: {
            seed: 1867,
            baseAltitude: 900,
            peakSpread: 0.48,
            peakCount: 5,
            peakHeight: 1150,
            outerHills: 4,
            ridges: 3,
            ruggedness: 0.6,
            valleyDepth: 8,
            treeLine: 300,
            snowLine: 0,
            glacierLine: 760,
            forestDensity: 0.9,
            forestMix: 'conifer',
            riverCount: 1,
            riverWidth: 2.6,
            lakeCount: 3
        },
        theme: {
            skyTop: [58, 112, 186], skyBottom: [164, 198, 232],
            snowWarmth: -0.15,
            grassLight: [126, 158, 104], grassDark: [86, 118, 74],
            hazeColor: [192, 208, 230]
        },
        objectives: [
            { type: 'poi_lake', target: 20 },
            { type: 'piste_km_total', target: 15 },
            { type: 'piste_km_red', target: 3 },
            { type: 'piste_km_black', target: 2 },
            { type: 'guests_total', target: 1000 },
            { type: 'hotel_beds', target: 60 },
            { type: 'gastro_count', target: 2 },
            { type: 'profit_day', target: 5000 }
        ]
    },
    {
        id: 'anden',
        index: 7,
        name: 'Patagonien',
        country: 'Chile / Argentinien',
        flag: '🇨🇱',
        tagline: 'Skifahren am Ende der Welt.',
        description: 'Karge Grate, gewaltige Gletscher und Wind aus der Ferne des Pazifiks. Kaum Wald, dafür extreme Höhen — hier trennt sich die Spreu vom Pulverschnee.',
        gridSize: 352,
        startingMoney: 8000000,
        terrain: {
            seed: 3333,
            baseAltitude: 1800,
            peakSpread: 0.5,
            peakCount: 6,
            peakHeight: 1400,
            outerHills: 3,
            ridges: 5,
            ruggedness: 0.85,
            valleyDepth: 10,
            treeLine: 140,
            snowLine: 0,
            glacierLine: 880,
            forestDensity: 0.3,
            forestMix: 'winter',
            riverCount: 2,
            riverWidth: 2.0,
            lakeCount: 2
        },
        theme: {
            skyTop: [76, 116, 178], skyBottom: [176, 200, 226],
            snowWarmth: -0.25,
            grassLight: [156, 152, 104], grassDark: [112, 112, 78],
            hazeColor: [196, 208, 226]
        },
        objectives: [
            { type: 'poi_summit', target: 25 },
            { type: 'poi_valley', target: 15 },
            { type: 'piste_km_total', target: 18 },
            { type: 'piste_km_black', target: 4 },
            { type: 'lift_count', target: 6 },
            { type: 'lift_capacity', target: 50 },
            { type: 'guests_total', target: 1500 },
            { type: 'satisfaction', target: 78, minGuests: 35 },
            { type: 'revenue_total', target: 1000000 }
        ]
    },
    {
        id: 'japan',
        index: 8,
        name: 'Hokkaidō',
        country: 'Japan',
        flag: '🇯🇵',
        tagline: 'Japow — der leichteste Schnee der Welt.',
        description: 'Ein perfekter Vulkankegel, Birkenwälder im Pulverschnee und Onsen im Tal. Das große Finale: ein Weltklasse-Resort mit allem, was dazugehört.',
        gridSize: 384,
        startingMoney: 10000000,
        terrain: {
            seed: 7227,
            baseAltitude: 500,
            peakSpread: 0.45,
            peakCount: 4,
            peakHeight: 1000,
            volcano: true,
            outerHills: 4,
            ridges: 3,
            ruggedness: 0.45,
            valleyDepth: 10,
            treeLine: 290,
            snowLine: 15,
            glacierLine: 820,
            forestDensity: 0.8,
            forestMix: 'mixed',
            riverCount: 1,
            riverWidth: 1.8,
            lakeCount: 2
        },
        theme: {
            skyTop: [110, 148, 200], skyBottom: [200, 216, 236],
            snowWarmth: 0.1,
            grassLight: [138, 168, 108], grassDark: [96, 128, 80],
            hazeColor: [212, 220, 234]
        },
        objectives: [
            { type: 'poi_summit', target: 30 },
            { type: 'poi_valley', target: 20 },
            { type: 'piste_km_total', target: 20 },
            { type: 'piste_km_blue', target: 5 },
            { type: 'piste_km_red', target: 5 },
            { type: 'piste_km_black', target: 3 },
            { type: 'guests_total', target: 2500 },
            { type: 'hotel_beds', target: 120 },
            { type: 'satisfaction', target: 80, minGuests: 50 },
            { type: 'profit_day', target: 15000 }
        ]
    }
];

// Sandbox-Standardwerte (frei einstellbar im Menü)
export const SANDBOX_DEFAULTS = {
    gridSize: 288,
    startingMoney: 5000000,
    terrain: {
        seed: 12345,
        baseAltitude: 1200,
        peakSpread: 0.42,
        peakCount: 4,
        peakHeight: 800,
        outerHills: 3,
        ridges: 3,
        ruggedness: 0.5,
        valleyDepth: 10,
        treeLine: 280,
        snowLine: 40,
        glacierLine: null,
        forestDensity: 0.7,
        forestMix: 'conifer',
        riverCount: 1,
        riverWidth: 2.0,
        lakeCount: 1
    },
    theme: {
        skyTop: [80, 136, 205], skyBottom: [178, 208, 238],
        snowWarmth: 0.1,
        grassLight: [130, 165, 95], grassDark: [90, 125, 68],
        hazeColor: [200, 216, 236]
    }
};

// ------------------------------------------------------------
// Fortschritt (localStorage)
// ------------------------------------------------------------
const PROGRESS_KEY = 'tycoon_campaign_progress_v1';

export function loadProgress() {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        if (!raw) return { completed: [] };
        const data = JSON.parse(raw);
        return { completed: Array.isArray(data.completed) ? data.completed : [] };
    } catch {
        return { completed: [] };
    }
}

export function saveProgress(progress) {
    try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch { /* storage unavailable */ }
}

export function markLevelCompleted(levelId) {
    const progress = loadProgress();
    if (!progress.completed.includes(levelId)) {
        progress.completed.push(levelId);
        saveProgress(progress);
    }
    return progress;
}

export function isLevelUnlocked(levelIndex, progress) {
    if (levelIndex === 0) return true;
    const prevLevel = CAMPAIGN_LEVELS[levelIndex - 1];
    return progress.completed.includes(prevLevel.id);
}
