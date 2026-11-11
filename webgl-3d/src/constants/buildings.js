// Building type constants for the ski resort
export const BUILDING_CATEGORIES = {
    INFRASTRUCTURE: 'infrastructure',
    HOTEL: 'hotel',
    GASTRONOMY: 'gastronomy',
    TOURISM: 'tourism',
    SHOP: 'shop',
    PISTEN: 'pisten',
    TERRAFORMING: 'terraforming',
    FOREST: 'forest',
    WATER: 'water'
};

export const BUILDINGS = {
    // ========================================
    // INFRASTRUCTURE
    // ========================================
    ROAD: {
        id: 'road',
        name: 'Straße',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 400,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 1, height: 1 },
        description: 'Baue Straßen Stück für Stück',
        color: '#4b5563',
        icon: '🛣️',
        isRoad: true
    },
    PARKING_LOT: {
        id: 'parking_lot',
        name: 'Parkplatz',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 12000,
        dailyRevenue: 0,
        basePrice: 10, // Parking Fee
        maintenanceCost: 0,
        capacity: 150,  // Maximum 150 vehicles
        size: { width: 8, height: 8 },
        description: 'Großer Parkplatz',
        color: '#555',
        icon: '🅿️'
    },
    BUS_STOP: {
        id: 'bus_stop',
        name: 'Bushaltestelle',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 3000,
        dailyRevenue: 0,
        maintenanceCost: 0,
        capacity: 12,
        size: { width: 4, height: 8 },
        description: 'Große Bushaltestelle (halber Parkplatz)',
        color: '#555',
        icon: '🚏'
    },
    PARKING_GARAGE: {
        id: 'parking_garage',
        name: 'Parkhaus',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 80000,
        dailyRevenue: 0,
        basePrice: 20, // Garage Fee
        maintenanceCost: 0,
        capacity: 1500,
        size: { width: 8, height: 8 },
        description: 'Mehrstöckiges Parkhaus mit hoher Kapazität',
        color: '#1f2937',
        icon: '🏢'
    },
    TICKET_OFFICE: {
        id: 'ticket_office',
        name: 'Liftkarten-Kasse',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 29200,
        dailyRevenue: 0,  // Revenue comes from ski pass sales
        capacity: 100,    // Queue capacity
        size: { width: 6, height: 6 },
        description: 'Verkauf von Skipässen für Lifte',
        color: '#0ea5e9',
        icon: '🎫',
        isTicketOffice: true
    },
    MEDICAL_STATION: {
        id: 'medical_station',
        name: 'Krankenstation',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 65000,
        dailyRevenue: 0,
        capacity: 20,
        size: { width: 2, height: 2 },
        description: 'Erste Hilfe & Rettung',
        color: '#DC143C',
        icon: '🏥',
        required: true,
        spawnsSkiDoo: true
    },
    TOILETTENHAUSCHEN: {
        id: 'toilettenhauschen',
        name: 'Toilettenhäuschen',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 3200,
        dailyRevenue: 50,
        capacity: 5,
        size: { width: 1, height: 1 },
        description: 'Wichtiges kleines Häuschen (max 30% Hang)',
        color: '#f3f4f6', // Light gray
        icon: '🚽',
        maxSlope: 30
    },
    SKI_SCHOOL: {
        id: 'ski_school',
        name: 'Skischule',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 78000,
        dailyRevenue: 2000,
        capacity: 80,
        size: { width: 3, height: 2 },
        description: 'Skikurse für alle',
        color: '#32CD32',
        icon: '⛷️'
    },
    WORKSHOP: {
        id: 'workshop',
        name: 'Werkstatt',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 80000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 3, height: 2 },
        description: 'Wartung für Fahrzeuge',
        color: '#b91c1c', // Dark red
        icon: '🔧',
        isWorkshop: true
    },
    SNOWCAT_GARAGE_1: {
        id: 'snowcat_garage_1',
        name: 'Garage (1 Pistenbully)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 32500,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 2, height: 2 },
        description: 'Kleine Pistenraupengarage',
        color: '#ea580c', // Orange
        icon: '🚜',
        isGarage: true,
        garageSize: 1
    },
    SNOWCAT_GARAGE_2: {
        id: 'snowcat_garage_2',
        name: 'Garage (2 Pistenbullis)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 58500,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 3, height: 2 },
        description: 'Mittlere Pistenraupengarage',
        color: '#c2410c',
        icon: '🚜',
        isGarage: true,
        garageSize: 2
    },
    SNOWCAT_GARAGE_4: {
        id: 'snowcat_garage_4',
        name: 'Garage (4 Pistenbullis)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 104000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 4, height: 3 },
        description: 'Große Pistenraupengarage',
        color: '#9a3412',
        icon: '🚜',
        isGarage: true,
        garageSize: 4
    },
    SNOW_CANNON_SMALL: {
        id: 'snow_cannon_small',
        name: 'Schneekanone (klein)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 9800,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 1, height: 1 },
        description: 'Neuschnee im Umkreis von 10 Feldern',
        color: '#38bdf8',
        icon: '❄️',
        isSnowCannon: true,
        snowRadius: 10,
        maxSlope: 100,
        autoFlatten: false
    },
    SNOW_CANNON_MEDIUM: {
        id: 'snow_cannon_medium',
        name: 'Schneekanone (mittel)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 29200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 1, height: 1 },
        description: 'Leistungsstarke Schneekanone',
        color: '#0ea5e9',
        icon: '❄️',
        isSnowCannon: true,
        snowRadius: 18,
        maxSlope: 100,
        autoFlatten: false
    },
    SNOW_CANNON_LARGE: {
        id: 'snow_cannon_large',
        name: 'Schnee-Lanze (Turm)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 55200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 1, height: 1 },
        description: 'Große Turm-Schneekanone für weite Flächen',
        color: '#0369a1',
        icon: '❄️',
        isSnowCannon: true,
        snowRadius: 25,
        maxSlope: 100,
        autoFlatten: false
    },
    FUNPARK: {
        id: 'funpark',
        name: 'Funpark / Snowpark',
        category: BUILDING_CATEGORIES.TOURISM,
        cost: 220000,
        dailyRevenue: 0,
        maintenanceCost: 500,
        capacity: 60,
        size: { width: 6, height: 10 },
        description: 'Kicker, Rails & Airbag — Stimmungs-Magnet neben der Piste',
        color: '#f97316',
        icon: '🏂',
        isFunPark: true,
        maxSlope: 30,
        autoFlatten: false
    },
    STAUSEE: {
        id: 'stausee',
        name: 'Wasserspeicher (Stausee)',
        category: BUILDING_CATEGORIES.PISTEN,
        cost: 97500,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 8, height: 8 },
        description: 'Großes Speicherbecken für Beschneiung',
        color: '#94a3b8',
        icon: '💧',
        isReservoir: true,
        maxSlope: 50 // Allow placement on steeper terrain (approx 20-25%)
    },
    HOSPITAL: {
        id: 'hospital',
        name: 'Krankenhaus',
        category: BUILDING_CATEGORIES.INFRASTRUCTURE,
        cost: 325000,
        dailyRevenue: 0,
        capacity: 50,
        size: { width: 5, height: 5 },
        description: 'Krankenhaus mit Helikopterlandeplatz',
        color: '#DC143C',
        icon: '🏥',
        floors: 2,
        flatRoof: true,
        hasHelipad: true,
        spawnsHelicopter: true
    },

    // ========================================
    // HOTELS & ACCOMMODATION
    // ========================================
    HUETTE: {
        id: 'huette',
        name: 'Berghütte',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 80000,
        dailyRevenue: 800,
        capacity: 15,
        size: { width: 2, height: 2 },
        description: 'Rustikale Berghütte',
        color: '#8B4513',
        icon: '🏚️'
    },
    BUDGET_HOTEL: {
        id: 'budget_hotel',
        name: 'Budget Hotel',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 97500,
        dailyRevenue: 1500,
        capacity: 30,
        size: { width: 3, height: 3 },
        description: 'Einfache Übernachtung',
        color: '#4682B4',
        icon: '🏨'
    },
    MITTELKLASSE_HOTEL: {
        id: 'mittelklasse_hotel',
        name: 'Mittelklasse Hotel',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 227500,
        dailyRevenue: 4000,
        capacity: 100,
        size: { width: 4, height: 4 },
        description: 'Komfortables Hotel (2-stöckig)',
        color: '#5F9EA0',
        icon: '🏨',
        floors: 2,
        flatRoof: true
    },
    LUXUSHOTEL: {
        id: 'luxushotel',
        name: 'Luxushotel',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 520000,
        dailyRevenue: 10000,
        capacity: 40,
        size: { width: 5, height: 4 },
        description: 'Exklusives 5-Sterne mit Pool',
        color: '#FFD700',
        icon: '⭐',
        hasOutdoorPool: true
    },
    KLEINES_CHALET: {
        id: 'kleines_chalet',
        name: 'Kleines Chalet',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 130000,
        dailyRevenue: 2500,
        capacity: 8,
        size: { width: 2, height: 2 },
        description: 'Gemütliches Chalet',
        color: '#A0522D',
        icon: '🏔️'
    },
    GROSSES_CHALET: {
        id: 'grosses_chalet',
        name: 'Großes Chalet',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 325000,
        dailyRevenue: 6000,
        capacity: 20,
        size: { width: 4, height: 3 },
        description: 'Exklusives Chalet mit Dachterrasse',
        color: '#CD853F',
        icon: '🏔️',
        hasRoofTerrace: true
    },
    LUXUS_CHALET: {
        id: 'luxus_chalet',
        name: 'Luxus Chalet',
        category: BUILDING_CATEGORIES.HOTEL,
        cost: 975000,
        dailyRevenue: 18000,
        capacity: 30,
        size: { width: 3, height: 3 },
        description: 'Top Luxus-Chalet mit Pool',
        color: '#DAA520',
        icon: '💎',
        hasOutdoorPool: true
    },

    // ========================================
    // GASTRONOMY
    // ========================================
    BERGHUETTE_GASTRO: {
        id: 'berghuette_gastro',
        name: 'Berghütte',
        category: BUILDING_CATEGORIES.GASTRONOMY,
        cost: 39000,
        dailyRevenue: 600,
        capacity: 25,
        size: { width: 2, height: 2 },
        description: 'Urige Berghütte mit Terrasse (max 30% Hang)',
        color: '#8B4513',
        icon: '🏠',
        floors: 1,
        flickeringLights: false,
        hasOutdoorTerrace: true,  // Tables and umbrellas
        rusticStyle: true,
        maxSlope: 30
    },
    APRES_SKI_BAR: {
        id: 'apres_ski_bar',
        name: 'Après-Ski Bar',
        category: BUILDING_CATEGORIES.GASTRONOMY,
        cost: 65000,
        dailyRevenue: 1800,
        capacity: 50,
        size: { width: 3, height: 2 },
        description: 'Party & Drinks mit Außenbar (max 30% Hang)',
        color: '#FF6347',
        icon: '🍺',
        floors: 1,
        flickeringLights: true,  // Party lights!
        hasOutdoorBar: true,  // Bar and standing tables
        maxSlope: 30
    },
    PARTYZELT: {
        id: 'partyzelt',
        name: 'Partyzelt',
        category: BUILDING_CATEGORIES.GASTRONOMY,
        cost: 16200,
        dailyRevenue: 500,
        capacity: 40,
        size: { width: 3, height: 3 },
        description: 'Après-Ski Zelt mit Musik (max 30% Hang)',
        color: '#be123c', // Red/Pink
        icon: '🎪',
        floors: 1,
        flickeringLights: true,
        maxSlope: 30
    },
    BERGRESTAURANT: {
        id: 'bergrestaurant',
        name: 'Bergrestaurant',
        category: BUILDING_CATEGORIES.GASTRONOMY,
        cost: 130000,
        dailyRevenue: 2500,
        capacity: 60,
        size: { width: 3, height: 3 },
        description: 'Gemütliches Restaurant mit Terrasse',
        color: '#A0522D',
        icon: '🍽️',
        floors: 1,
        flickeringLights: false,
        hasOutdoorTerrace: true,
        maxSlope: 30
    },
    PANORAMA_RESTAURANT: {
        id: 'panorama_restaurant',
        name: 'Panorama Hut', // Rename to help user identify
        category: BUILDING_CATEGORIES.GASTRONOMY,
        cost: 260000,
        dailyRevenue: 5000,
        capacity: 80,
        size: { width: 4, height: 3 },
        description: 'Gehobene Küche mit Aussicht (max 30% Hang)',
        color: '#CD853F',
        icon: '🏔️',
        floors: 1,
        flickeringLights: false,
        hasOutdoorTerrace: true,
        maxSlope: 30
    },
    STERNEKUECHE: {
        id: 'sternekueche',
        name: 'Sterneküche',
        category: BUILDING_CATEGORIES.GASTRONOMY,
        cost: 520000,
        dailyRevenue: 12000,
        capacity: 40,
        size: { width: 4, height: 4 },
        description: 'Gourmet-Restaurant mit Terrasse',
        color: '#FFD700',
        icon: '⭐',
        floors: 1,
        flickeringLights: false,
        hasOutdoorTerrace: true
    },

    // ========================================
    // SHOPS
    // ========================================
    SKI_RENTAL: {
        id: 'ski_rental',
        name: 'Skiverleih',
        category: BUILDING_CATEGORIES.SHOP,
        cost: 80000,
        dailyRevenue: 1200,
        capacity: 40,
        size: { width: 2, height: 2 },
        description: 'Ski & Board Verleih',
        color: '#4169E1',
        icon: '⛷️'
    },
    SPORTS_SHOP: {
        id: 'sports_shop',
        name: 'Sportgeschäft',
        category: BUILDING_CATEGORIES.SHOP,
        cost: 78000,
        dailyRevenue: 1500,
        capacity: 50,
        size: { width: 3, height: 2 },
        description: 'Sportausrüstung & Mode',
        color: '#FF6347',
        icon: '🎿'
    },
    SOUVENIR_SHOP: {
        id: 'souvenir_shop',
        name: 'Souvenir Shop',
        category: BUILDING_CATEGORIES.SHOP,
        cost: 39000,
        dailyRevenue: 800,
        capacity: 30,
        size: { width: 2, height: 2 },
        description: 'Andenken & Geschenke',
        color: '#FF8C00',
        icon: '🎁'
    },

    // ========================================
    // TOURISM & WELLNESS
    // ========================================
    SAUNA: {
        id: 'sauna',
        name: 'Sauna-Anlage',
        category: BUILDING_CATEGORIES.TOURISM,
        cost: 195000,
        dailyRevenue: 4000,
        capacity: 60,
        size: { width: 4, height: 4 },
        description: '3 Saunahütten mit Tauchbecken',
        color: '#c2410c',
        icon: '🧖',
        isSaunaComplex: true
    },
    THERME: {
        id: 'therme',
        name: 'Große Therme',
        category: BUILDING_CATEGORIES.TOURISM,
        cost: 2600000,
        dailyRevenue: 35000,
        capacity: 1500,
        size: { width: 12, height: 10 },
        description: 'Luxus-Therme mit Glaskuppel & Außenpools',
        color: '#0ea5e9',
        icon: '🏊',
        isThermeComplex: true
    },
    EISLAUFBAHN: {
        id: 'eislaufbahn',
        name: 'Eislaufbahn',
        category: BUILDING_CATEGORIES.TOURISM,
        cost: 975000,
        dailyRevenue: 12000,
        capacity: 300,
        size: { width: 12, height: 8 },
        description: 'Outdoor-Eislaufbahn mit Hütte',
        color: '#bae6fd',
        icon: '⛸️',
        isOutdoorRink: true
    },
    DISKOTHEK: {
        id: 'diskothek',
        name: 'Diskothek',
        category: BUILDING_CATEGORIES.TOURISM,
        cost: 325000,
        dailyRevenue: 6000,
        capacity: 250,
        size: { width: 4, height: 4 },
        description: 'Party-Chalet mit Alpen-Flair',
        color: '#a855f7',
        icon: '🩩',
        isPartyChalet: true,
        flickeringLights: true
    },

    // ========================================
    // TERRAIN EDITING (Geländearbeiten)
    // ========================================
    FLATTEN_SMALL: {
        id: 'flatten_small',
        name: 'Ebnen (Klein)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 3200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 4, height: 4 },
        description: 'Ebnet Gelände (4x4 Tiles)',
        color: '#3b82f6',
        icon: '🟦',
        isTerrainTool: true,
        toolType: 'flatten',
        toolSize: 4
    },
    FLATTEN_MEDIUM: {
        id: 'flatten_medium',
        name: 'Ebnen (Mittel)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 12000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 7, height: 7 },
        description: 'Ebnet Gelände (7x7 Tiles)',
        color: '#2563eb',
        icon: '🟦',
        isTerrainTool: true,
        toolType: 'flatten',
        toolSize: 7
    },
    FLATTEN_LARGE: {
        id: 'flatten_large',
        name: 'Ebnen (Groß)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 16200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 10, height: 10 },
        description: 'Ebnet Gelände (10x10 Tiles)',
        color: '#1e40af',
        icon: '🟦',
        isTerrainTool: true,
        toolType: 'flatten',
        toolSize: 10
    },
    DIG_SMALL: {
        id: 'dig_small',
        name: 'Graben (Klein)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 3200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 4, height: 4 },
        description: 'Senkt Gelände ab (4x4 Tiles)',
        color: '#a16207',
        icon: '🕳️',
        isTerrainTool: true,
        toolType: 'dig',
        toolSize: 4
    },
    DIG_MEDIUM: {
        id: 'dig_medium',
        name: 'Graben (Mittel)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 12000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 7, height: 7 },
        description: 'Senkt Gelände ab (7x7 Tiles)',
        color: '#854d0e',
        icon: '🕳️',
        isTerrainTool: true,
        toolType: 'dig',
        toolSize: 7
    },
    DIG_LARGE: {
        id: 'dig_large',
        name: 'Graben (Groß)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 16200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 10, height: 10 },
        description: 'Senkt Gelände ab (10x10 Tiles)',
        color: '#713f12',
        icon: '🕳️',
        isTerrainTool: true,
        toolType: 'dig',
        toolSize: 10
    },
    RAISE_SMALL: {
        id: 'raise_small',
        name: 'Anheben (Klein)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 3200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 4, height: 4 },
        description: 'Hebt Gelände an (4x4 Tiles)',
        color: '#16a34a',
        icon: '⬆️',
        isTerrainTool: true,
        toolType: 'raise',
        toolSize: 4
    },
    RAISE_MEDIUM: {
        id: 'raise_medium',
        name: 'Anheben (Mittel)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 12000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 7, height: 7 },
        description: 'Hebt Gelände an (7x7 Tiles)',
        color: '#15803d',
        icon: '⬆️',
        isTerrainTool: true,
        toolType: 'raise',
        toolSize: 7
    },
    RAISE_LARGE: {
        id: 'raise_large',
        name: 'Anheben (Groß)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 16200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 10, height: 10 },
        description: 'Hebt Gelände an (10x10 Tiles)',
        color: '#166534',
        icon: '⬆️',
        isTerrainTool: true,
        toolType: 'raise',
        toolSize: 10
    },
    SMOOTH_SMALL: {
        id: 'smooth_small',
        name: 'Glätten (Klein)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 3000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 10, height: 10 },
        description: 'Glättet Gelände (10x10 Tiles)',
        color: '#8b5cf6',
        icon: '〰️',
        isTerrainTool: true,
        toolType: 'smooth',
        toolSize: 10
    },
    SMOOTH_MEDIUM: {
        id: 'smooth_medium',
        name: 'Glätten (Mittel)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 5200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 25, height: 25 },
        description: 'Glättet Gelände (25x25 Tiles)',
        color: '#7c3aed',
        icon: '〰️',
        isTerrainTool: true,
        toolType: 'smooth',
        toolSize: 25
    },
    SMOOTH_LARGE: {
        id: 'smooth_large',
        name: 'Glätten (Groß)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 13000,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 50, height: 50 },
        description: 'Glättet Gelände (50x50 Tiles)',
        color: '#6d28d9',
        icon: '〰️',
        isTerrainTool: true,
        toolType: 'smooth',
        toolSize: 50
    },
    PULL_SMALL: {
        id: 'pull_small',
        name: 'Hochziehen (Klein)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 2600,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 10, height: 10 },
        description: 'Zieht Gelände sanft hoch (10x10)',
        color: '#f59e0b',
        icon: '📈',
        isTerrainTool: true,
        toolType: 'pull',
        toolSize: 10
    },
    PULL_MEDIUM: {
        id: 'pull_medium',
        name: 'Hochziehen (Mittel)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 6500,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 25, height: 25 },
        description: 'Zieht Gelände sanft hoch (25x25)',
        color: '#ea580c',
        icon: '📈',
        isTerrainTool: true,
        toolType: 'pull',
        toolSize: 25
    },
    PULL_LARGE: {
        id: 'pull_large',
        name: 'Hochziehen (Groß)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 16200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 50, height: 50 },
        description: 'Zieht Gelände sanft hoch (50x50)',
        color: '#c2410c',
        icon: '📈',
        isTerrainTool: true,
        toolType: 'pull',
        toolSize: 50
    },
    PUSH_SMALL: {
        id: 'push_small',
        name: 'Runterziehen (Klein)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 2600,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 10, height: 10 },
        description: 'Zieht Gelände sanft runter (10x10)',
        color: '#3b82f6',
        icon: '📉',
        isTerrainTool: true,
        toolType: 'push',
        toolSize: 10
    },
    PUSH_MEDIUM: {
        id: 'push_medium',
        name: 'Runterziehen (Mittel)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 6500,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 25, height: 25 },
        description: 'Zieht Gelände sanft runter (25x25)',
        color: '#2563eb',
        icon: '📉',
        isTerrainTool: true,
        toolType: 'push',
        toolSize: 25
    },
    PUSH_LARGE: {
        id: 'push_large',
        name: 'Runterziehen (Groß)',
        category: BUILDING_CATEGORIES.TERRAFORMING,
        cost: 16200,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 50, height: 50 },
        description: 'Zieht Gelände sanft runter (50x50)',
        color: '#1e40af',
        icon: '📉',
        isTerrainTool: true,
        toolType: 'push',
        toolSize: 50
    },

    // ========================================
    // FOREST (Aufforstung)
    // ========================================
    FOREST_CONIFER: {
        id: 'forest_conifer',
        name: 'Nadelwald',
        category: BUILDING_CATEGORIES.FOREST,
        cost: 100,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 3, height: 3 },
        description: 'Klassischer Nadelwald pflanzen',
        color: '#166534',
        icon: '🌲',
        isForestTool: true,
        forestType: 1 // Matches existing tree type
    },
    FOREST_MIXED: {
        id: 'forest_mixed',
        name: 'Mischwald',
        category: BUILDING_CATEGORIES.FOREST,
        cost: 100,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 3, height: 3 },
        description: 'Bunter Herbst-/Mischwald',
        color: '#ca8a04',
        icon: '🍂',
        isForestTool: true,
        forestType: 5 // New type
    },
    FOREST_WINTER: {
        id: 'forest_winter',
        name: 'Winterbäume',
        category: BUILDING_CATEGORIES.FOREST,
        cost: 100,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 3, height: 3 },
        description: 'Verschneite oder tote Bäume',
        color: '#94a3b8',
        icon: '❄️',
        isForestTool: true,
        forestType: 6 // New type
    },

    // ========================================
    // WATER (Gewässer)
    // ========================================
    WATER_TOOL: {
        id: 'water_tool',
        name: 'Wasser',
        category: BUILDING_CATEGORIES.WATER,
        cost: 300,
        dailyRevenue: 0,
        capacity: 0,
        size: { width: 2, height: 2 },
        description: 'Gewässer erstellen (2m Tiefe)',
        color: '#3b82f6',
        icon: '🌊',
        isWaterTool: true
    }
};

// Helper to get buildings by category
export const getBuildingsByCategory = (category) => {
    return Object.values(BUILDINGS).filter(b => b.category === category);
};

// Helper to get building by ID
export const getBuildingById = (id) => {
    return Object.values(BUILDINGS).find(b => b.id === id);
};
