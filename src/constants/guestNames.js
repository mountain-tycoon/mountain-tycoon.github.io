// Fantasy name generator for guests
export const FIRST_NAMES_MALE = [
    'Max', 'Felix', 'Leon', 'Lukas', 'Jonas', 'Noah', 'Elias', 'Finn', 'Paul', 'Ben',
    'Luca', 'Tim', 'Tom', 'Nico', 'Jan', 'Simon', 'David', 'Moritz', 'Jakob', 'Fabian'
];

export const FIRST_NAMES_FEMALE = [
    'Emma', 'Mia', 'Hannah', 'Sophia', 'Anna', 'Lena', 'Lea', 'Marie', 'Laura', 'Sophie',
    'Lisa', 'Julia', 'Sarah', 'Lara', 'Nina', 'Clara', 'Elena', 'Amelie', 'Charlotte', 'Emilia'
];

export const LAST_NAMES = [
    'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
    'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf',
    'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Lange', 'Schmitt'
];

export function generateGuestName(gender) {
    const firstNames = gender === 'M' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return `${firstName} ${lastName}`;
}

export const JACKET_COLORS = [
    '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'
];

export const PANTS_COLORS = [
    '#1f2937', '#374151', '#111827', '#1e3a8a', '#7c2d12', '#4c1d95'
];

export const HELMET_COLORS = [
    '#ffffff', '#000000', '#ef4444', '#3b82f6', '#f59e0b', '#10b981'
];
