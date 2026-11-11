/**
 * Guest Categories for Ski Resort
 * Each category has different preferences and spending behavior
 */

export const GUEST_CATEGORIES = {
    LOW_BUDGET: {
        id: 'low_budget',
        name: 'Sparfüchse',
        icon: '💰',
        color: '#22c55e',
        description: 'Preisbewusste Urlauber auf der Suche nach Schnäppchen',
        // Preference weights 0-1 for specific buildings
        preferences: {
            // Gastronomy
            huette: 0.95,
            bergrestaurant: 0.4,
            gourmet_restaurant: 0.05,
            cafe: 0.7,
            apres_ski_bar: 0.85,
            // Hotels
            pension: 0.95,
            mittelklasse_hotel: 0.3,
            luxushotel: 0.02,
            // Tourism
            sauna: 0.25,
            therme: 0.1,
            eislaufbahn: 0.75,
            diskothek: 0.9,
            // Shops
            skiverleih: 0.95,
            sportshop: 0.35,
            souvenirshop: 0.5
        },
        priceMultiplier: 0.7,   // Expect 30% lower prices than base
        spendingPower: 0.5,     // Spend 50% of average
        basePercentage: 35      // 35% of guests without intervention
    },

    FAMILY: {
        id: 'family',
        name: 'Familien',
        icon: '👨‍👩‍👧‍👦',
        color: '#3b82f6',
        description: 'Familien mit Kindern suchen kinderfreundliche Angebote',
        preferences: {
            // Gastronomy
            huette: 0.8,
            bergrestaurant: 0.7,
            gourmet_restaurant: 0.2,
            cafe: 0.85,
            apres_ski_bar: 0.3,
            // Hotels
            pension: 0.6,
            mittelklasse_hotel: 0.9,
            luxushotel: 0.3,
            // Tourism
            sauna: 0.4,
            therme: 0.85,
            eislaufbahn: 0.95,
            diskothek: 0.15,
            // Shops
            skiverleih: 0.9,
            sportshop: 0.7,
            souvenirshop: 0.85
        },
        priceMultiplier: 0.9,
        spendingPower: 0.75,
        basePercentage: 30
    },

    MIDDLE_CLASS: {
        id: 'middle_class',
        name: 'Mittelklasse',
        icon: '🏠',
        color: '#f59e0b',
        description: 'Qualitätsbewusste Urlauber mit normalem Budget',
        preferences: {
            // Gastronomy
            huette: 0.6,
            bergrestaurant: 0.85,
            gourmet_restaurant: 0.5,
            cafe: 0.75,
            apres_ski_bar: 0.7,
            // Hotels
            pension: 0.3,
            mittelklasse_hotel: 0.95,
            luxushotel: 0.4,
            // Tourism
            sauna: 0.75,
            therme: 0.8,
            eislaufbahn: 0.6,
            diskothek: 0.65,
            // Shops
            skiverleih: 0.7,
            sportshop: 0.85,
            souvenirshop: 0.7
        },
        priceMultiplier: 1.0,
        spendingPower: 1.0,
        basePercentage: 20
    },

    PREMIUM: {
        id: 'premium',
        name: 'Premium-Gäste',
        icon: '🥈',
        color: '#94a3b8',
        description: 'Gehobene Klasse, die Wert auf Komfort legt und weniger preissensibel ist',
        preferences: {
            // Gastronomy
            huette: 0.4,
            bergrestaurant: 0.9,
            gourmet_restaurant: 0.75,
            cafe: 0.8,
            apres_ski_bar: 0.6,
            // Hotels
            pension: 0.1,
            mittelklasse_hotel: 0.7,
            luxushotel: 0.85,
            // Tourism
            sauna: 0.85,
            therme: 0.9,
            eislaufbahn: 0.5,
            diskothek: 0.5,
            // Shops
            skiverleih: 0.6,
            sportshop: 0.95,
            souvenirshop: 0.8
        },
        priceMultiplier: 1.3,   // 30% tolerance above base
        spendingPower: 1.8,     // Higher spending power
        basePercentage: 15
    },

    LUXURY: {
        id: 'luxury',
        name: 'Luxusurlauber',
        icon: '💎',
        color: '#a855f7',
        description: 'Anspruchsvolle Gäste die das Beste erwarten',
        preferences: {
            // Gastronomy
            huette: 0.2,
            bergrestaurant: 0.5,
            gourmet_restaurant: 0.98,
            cafe: 0.6,
            apres_ski_bar: 0.4,
            // Hotels
            pension: 0.05,
            mittelklasse_hotel: 0.2,
            luxushotel: 0.98,
            // Tourism
            sauna: 0.9,
            therme: 0.95,
            eislaufbahn: 0.3,
            diskothek: 0.5,
            // Shops
            skiverleih: 0.4,
            sportshop: 0.7,
            souvenirshop: 0.5
        },
        priceMultiplier: 1.5,
        spendingPower: 2.5,
        basePercentage: 10
    }
};

// Helper to get preference for a building
export function getGuestPreference(guestCategory, buildingId) {
    const category = GUEST_CATEGORIES[guestCategory];
    if (!category) return 0.5;
    return category.preferences[buildingId] || 0.5;
}

// Calculate overall building appeal for all guest types
export function calculateBuildingAppeal(buildingId) {
    const appeal = {};
    for (const [key, category] of Object.entries(GUEST_CATEGORIES)) {
        appeal[key] = category.preferences[buildingId] || 0.5;
    }
    return appeal;
}

// Get all guest categories as array
export function getGuestCategoriesArray() {
    return Object.values(GUEST_CATEGORIES);
}
