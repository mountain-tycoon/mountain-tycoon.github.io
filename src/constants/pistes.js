export const PISTE_WIDTHS = {
    NARROW: {
        name: 'Schmal',
        width: 25,
        costPer50m: 100
    },
    MEDIUM: {
        name: 'Mittel',
        width: 40,
        costPer50m: 150
    },
    WIDE: {
        name: 'Breit',
        width: 60,
        costPer50m: 200
    },
    EXTRA_WIDE: {
        name: 'Extra Breit',
        width: 90,
        costPer50m: 350
    }
};

export const PISTE_DIFFICULTIES = {
    BLUE: {
        name: 'Blau (Leicht)',
        maxGradient: 35,  // <35% → Blau
        color: { r: 140, g: 180, b: 255, alpha: 0.12 }
    },
    RED: {
        name: 'Rot (Mittel)',
        maxGradient: 55,  // 35-55% → Rot
        color: { r: 255, g: 160, b: 160, alpha: 0.12 }
    },
    BLACK: {
        name: 'Schwarz (Schwer)',
        maxGradient: Infinity,  // >55% → Schwarz
        color: { r: 80, g: 80, b: 80, alpha: 0.15 }
    }
};

export const SEGMENT_LENGTH = 50; // meters per segment
