// ============================================================
// GARDEROBE DES FAHRERS: Outfits von Retro bis modern.
// Jedes Outfit ist nur ein Satz Farben und ein paar Formschalter –
// die Figur selbst baut SkiFigure.js daraus.
//   head   'helmet' | 'beanie' | 'bobble' (Bommelmütze) | 'headband' | 'cap' (Schirmmütze)
//   eyes   'goggles' | 'shades' (Sonnenbrille) | 'none'
//   torso  'jacket' | 'sweater' (ohne Schulterpolster, mit Bündchen) | 'suit' (Einteiler, eng)
//   bands  Zahl der Querstreifen auf der Brust (0–3)
//   fit    'loose' | 'tight' | (ohne Angabe: normal) – weite Kleidung flattert im Fahrtwind, ein Rennanzug gar nicht
// Die Wahl liegt je Gerät und Konto in localStorage (siehe key()).
// ============================================================
// Je Konto eine eigene Auswahl (wie bei den Spielständen): ein neu angemeldeter Spieler kleidet seine Figur selbst
// ein, auch wenn auf dem Gerät schon jemand anders gespielt hat. Ohne Anmeldung gilt der gemeinsame Schlüssel.
const BASE_KEY = 'mt.outfit';
const key = () => {
    try { const u = localStorage.getItem('mt.user'); return u ? `${BASE_KEY}:${u}` : BASE_KEY; } catch { return BASE_KEY; }
};

export const OUTFITS = [
    { id: 'modern', name: 'Pistenprofi', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 1, pack: true,
      jacket: 0xd9482b, panel: 0x1d2530, trim: 0xf3efe6, pants: 0x222c3a, knee: 0x151b25, boot: 0xe9e6df, bootDark: 0x1d2128, glove: 0x15181d,
      headCol: 0x20252d, headTrim: 0xd9482b, lens: 0xf7a21b, strap: 0xf3efe6, ski: 0x1f5fbf, skiTop: 0xf3efe6, pole: 0x9aa3ad, packCol: 0x2a3442, hair: 0x3b2a1e },
    { id: 'freeride', name: 'Freerider', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 0, pack: true, fit: 'loose',
      jacket: 0x1f8a8a, panel: 0x12343a, trim: 0xe8b23a, pants: 0xd9a129, knee: 0xb07f17, boot: 0x23272e, bootDark: 0x101216, glove: 0x23272e,
      headCol: 0xf2efe8, headTrim: 0x1f8a8a, lens: 0x58d0e6, strap: 0x12343a, ski: 0xe8b23a, skiTop: 0x12343a, pole: 0x23272e, packCol: 0x12343a, hair: 0x5a3a22 },
    { id: 'white', name: 'Alpin Chic', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 1, pack: false,
      jacket: 0xf2f1ec, panel: 0xb9bcc2, trim: 0x16191e, pants: 0x16191e, knee: 0x0c0e11, boot: 0xf2f1ec, bootDark: 0x16191e, glove: 0xf2f1ec,
      headCol: 0xf2f1ec, headTrim: 0xc9a227, lens: 0xc9a227, strap: 0x16191e, ski: 0x16191e, skiTop: 0xc9a227, pole: 0xc9a227, packCol: 0x16191e, hair: 0xd8b77a },
    { id: 'night', name: 'Nachtschicht', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 2, pack: true,
      jacket: 0x14171c, panel: 0x0b0d10, trim: 0x9be53a, pants: 0x14171c, knee: 0x0b0d10, boot: 0x14171c, bootDark: 0x9be53a, glove: 0x9be53a,
      headCol: 0x14171c, headTrim: 0x9be53a, lens: 0x9be53a, strap: 0x9be53a, ski: 0x9be53a, skiTop: 0x14171c, pole: 0x9be53a, packCol: 0x0b0d10, hair: 0x14171c },
    { id: 'park', name: 'Snowpark', era: '2005', head: 'beanie', eyes: 'goggles', torso: 'jacket', bands: 0, pack: false, fit: 'loose',
      jacket: 0x6b7a3a, panel: 0x4b5628, trim: 0xf08a24, pants: 0x8a6a4a, knee: 0x6f553a, boot: 0x2b2b2b, bootDark: 0x151515, glove: 0xf08a24,
      headCol: 0xf08a24, headTrim: 0x2b2b2b, lens: 0xe0409a, strap: 0x2b2b2b, ski: 0xf08a24, skiTop: 0x2b2b2b, pole: 0x2b2b2b, packCol: 0x2b2b2b, hair: 0x2a1c12 },
    { id: 'racer', name: 'Rennläufer', era: '1992', head: 'helmet', eyes: 'goggles', torso: 'suit', bands: 3, pack: false, fit: 'tight',
      jacket: 0xd41f2d, panel: 0xd41f2d, trim: 0xffffff, pants: 0xd41f2d, knee: 0xffffff, boot: 0xf4d21f, bootDark: 0x1a1a1a, glove: 0x1a1a1a,
      headCol: 0xffffff, headTrim: 0xd41f2d, lens: 0x2e6bd6, strap: 0xd41f2d, ski: 0xf4d21f, skiTop: 0xd41f2d, pole: 0xd41f2d, packCol: 0x1a1a1a, hair: 0x3b2a1e },
    { id: 'neon', name: 'Neon-Einteiler', era: '1986', head: 'headband', eyes: 'shades', torso: 'suit', bands: 2, pack: false, fit: 'tight',
      jacket: 0xff3ea5, panel: 0x18c8c8, trim: 0xf6ef2e, pants: 0xff3ea5, knee: 0x18c8c8, boot: 0xf6ef2e, bootDark: 0x8a2be2, glove: 0x18c8c8,
      headCol: 0xf6ef2e, headTrim: 0x18c8c8, lens: 0x30e0ff, strap: 0x18c8c8, ski: 0xf6ef2e, skiTop: 0xff3ea5, pole: 0x18c8c8, packCol: 0x8a2be2, hair: 0xe8c25a },
    { id: 'seventies', name: 'Skilehrer', era: '1975', head: 'bobble', eyes: 'shades', torso: 'jacket', bands: 2, pack: false,
      jacket: 0xc8371f, panel: 0xc8371f, trim: 0xf4e9c8, pants: 0x1f2f55, knee: 0x1f2f55, boot: 0xb3261a, bootDark: 0x2a1a14, glove: 0x4a2c18,
      headCol: 0xc8371f, headTrim: 0xf4e9c8, lens: 0x2a2018, strap: 0x2a2018, ski: 0xf4e9c8, skiTop: 0xc8371f, pole: 0xc9cdd2, packCol: 0x4a2c18, hair: 0x6a4424 },
    { id: 'sixties', name: 'Wirtschaftswunder', era: '1962', head: 'headband', eyes: 'shades', torso: 'sweater', bands: 3, pack: false,
      jacket: 0x1d3f73, panel: 0x1d3f73, trim: 0xf2ead8, pants: 0x1a1c22, knee: 0x1a1c22, boot: 0x1a1c22, bootDark: 0x0e0f12, glove: 0xf2ead8,
      headCol: 0xf2ead8, headTrim: 0xc8371f, lens: 0x16130f, strap: 0x16130f, ski: 0x9c2f22, skiTop: 0xf2ead8, pole: 0xb9a16a, packCol: 0x4a2c18, hair: 0x2a1a10 },
    { id: 'pioneer', name: 'Skipionier', era: '1935', head: 'cap', eyes: 'none', torso: 'sweater', bands: 2, pack: true, fit: 'loose',
      jacket: 0xd9cdb0, panel: 0x7a5a3a, trim: 0x8a2f24, pants: 0x5a4632, knee: 0x9a8a6a, boot: 0x4a3222, bootDark: 0x2a1c12, glove: 0x7a5a3a,
      headCol: 0x5a4632, headTrim: 0x3a2c1e, lens: 0x16130f, strap: 0x3a2c1e, ski: 0x9a6a3a, skiTop: 0x7a4f26, pole: 0x8a6a3e, packCol: 0x6a5234, hair: 0x4a3222 }
];

// ===== SPORTARTEN =====
// Alpin ist die frei kombinierbare Garderobe oben. Für die anderen Sportarten gibt es je eine Handvoll
// ganzer Ausrüstungen – mit dem, was dazugehört: schmale Ski und lange Stöcke beim Langlauf (ohne Helm),
// Gewehr beim Biathlon, Helm mit Gitter und Trikot beim Eishockey, Helm und Gurtzeug am Gleitschirm.
//   gear   'nordic' | 'hockey' | 'glider'   – stellt in SkiFigure.js Ski, Stöcke und Zubehör um
//   rifle  Biathlongewehr auf dem Rücken      eyes 'cage' = Gitter vor dem Gesicht
export const SPORTS = [
    { id: 'alpin', name: 'Alpin', hint: 'Piste, Park und Tiefschnee – jedes Teil frei kombinierbar.' },
    { id: 'nordic', name: 'Langlauf', hint: 'Auf der Loipe und am Schießstand: schmale Ski, lange Stöcke, kein Helm.' },
    { id: 'hockey', name: 'Eishockey', hint: 'Auf der Eisbahn: Schlittschuhe, Schläger, Helm.' },
    { id: 'glider', name: 'Gleitschirm', hint: 'Am Startplatz: Helm und Gurtzeug, die Ski bleiben dran.' }
];
const NORDIC = { gear: 'nordic', pack: false, boot: 0x1b1e24, bootDark: 0x0e1014, hair: 0x4a3222 };
const HOCKEY = { gear: 'hockey', head: 'helmet', torso: 'sweater', pack: false, fit: 'loose', boot: 0x15171b, bootDark: 0x0b0c0f, hair: 0x3b2a1e,
    ski: 0x15171b, skiTop: 0xf2f2f0, pole: 0x8a8f96, packCol: 0x15171b };
const GLIDER = { gear: 'glider', head: 'helmet', eyes: 'goggles', torso: 'jacket', pack: true, hair: 0x3b2a1e };
export const SPORT_OUTFITS = {
    nordic: [
        { ...NORDIC, id: 'n_race', name: 'Rennanzug', era: 'Heute', head: 'headband', eyes: 'shades', torso: 'suit', bands: 2, fit: 'tight',
          jacket: 0xd3202c, panel: 0x12305e, trim: 0xf4f4f2, pants: 0x12305e, knee: 0xd3202c, glove: 0x15171b,
          headCol: 0xd3202c, headTrim: 0xf4f4f2, lens: 0xf2a21b, strap: 0x15171b, ski: 0xf2d21a, skiTop: 0x15171b, pole: 0x15171b, packCol: 0x15171b },
        { ...NORDIC, id: 'n_biathlon', name: 'Biathlet', era: 'Heute', head: 'beanie', eyes: 'shades', torso: 'suit', bands: 1, fit: 'tight', rifle: true,
          jacket: 0xf2f2f0, panel: 0x16181c, trim: 0xf2b01e, pants: 0x16181c, knee: 0xf2b01e, glove: 0x16181c,
          headCol: 0x16181c, headTrim: 0xf2b01e, lens: 0x2e6bd6, strap: 0x16181c, ski: 0xe8452c, skiTop: 0xf2f2f0, pole: 0x16181c, packCol: 0x16181c },
        { ...NORDIC, id: 'n_tour', name: 'Genussläufer', era: 'Heute', head: 'bobble', eyes: 'shades', torso: 'jacket', bands: 0,
          jacket: 0x1f8a6a, panel: 0x14483a, trim: 0xf2ead8, pants: 0x1c2430, knee: 0x14181f, glove: 0x1c2430,
          headCol: 0xf2ead8, headTrim: 0x1f8a6a, lens: 0x2a2018, strap: 0x2a2018, ski: 0x1b62b8, skiTop: 0xf4f4f2, pole: 0x8a8f96, packCol: 0x14483a },
        { ...NORDIC, id: 'n_retro', name: 'Loipenklassiker', era: '1978', head: 'bobble', eyes: 'none', torso: 'sweater', bands: 3, hair: 0x6a4424,
          jacket: 0x1d3f73, panel: 0x1d3f73, trim: 0xf2ead8, pants: 0x7a1f1f, knee: 0xf2ead8, glove: 0xf2ead8, boot: 0x3a2618, bootDark: 0x21160e,
          headCol: 0xc8371f, headTrim: 0xf2ead8, lens: 0x16130f, strap: 0x16130f, ski: 0x9a6a3a, skiTop: 0x7a4f26, pole: 0xb9a16a, packCol: 0x4a2c18 },
        { ...NORDIC, id: 'n_gold', name: 'Weltcup-Gold', era: '★ 3', unlock: 3, head: 'headband', eyes: 'shades', torso: 'suit', bands: 3, fit: 'tight', rifle: true,
          jacket: 0xd9a520, panel: 0x16181c, trim: 0xfaf6e6, pants: 0x16181c, knee: 0xd9a520, glove: 0xfaf6e6,
          headCol: 0xd9a520, headTrim: 0xfaf6e6, lens: 0x2e6bd6, strap: 0x16181c, ski: 0xfaf6e6, skiTop: 0xd9a520, pole: 0xd9a520, packCol: 0x16181c }
    ],
    hockey: [
        { ...HOCKEY, id: 'h_home', name: 'Heimtrikot', era: 'Heute', eyes: 'cage', bands: 2,
          jacket: 0x1f4fb5, panel: 0x12305e, trim: 0xf4f4f2, pants: 0x12305e, knee: 0xf4f4f2, glove: 0x12305e,
          headCol: 0x1f4fb5, headTrim: 0xf4f4f2, lens: 0x9aa3ad, strap: 0xc9ced4 },
        { ...HOCKEY, id: 'h_away', name: 'Auswärtstrikot', era: 'Heute', eyes: 'cage', bands: 2,
          jacket: 0xf2f2f0, panel: 0xc8222c, trim: 0xc8222c, pants: 0x16181c, knee: 0xc8222c, glove: 0xc8222c,
          headCol: 0xf2f2f0, headTrim: 0xc8222c, lens: 0x9aa3ad, strap: 0xc9ced4 },
        { ...HOCKEY, id: 'h_pond', name: 'Teichhockey', era: '1965', head: 'bobble', eyes: 'none', bands: 3, fit: undefined, hair: 0x6a4424,
          jacket: 0x7a1f1f, panel: 0x7a1f1f, trim: 0xf2ead8, pants: 0x3a3226, knee: 0x3a3226, glove: 0x6a4a2a, boot: 0x3a2618, bootDark: 0x21160e,
          headCol: 0xf2ead8, headTrim: 0x7a1f1f, lens: 0x16130f, strap: 0x16130f }
    ],
    glider: [
        { ...GLIDER, id: 'g_pilot', name: 'Streckenpilot', era: 'Heute', bands: 0,
          jacket: 0x2a6fd0, panel: 0x16305a, trim: 0xf2f2f0, pants: 0x1c2430, knee: 0x14181f, boot: 0xe9e6df, bootDark: 0x1d2128, glove: 0x15181d,
          headCol: 0xf2f2f0, headTrim: 0x2a6fd0, lens: 0x58d0e6, strap: 0x16305a, ski: 0xf2f2f0, skiTop: 0x2a6fd0, pole: 0x9aa3ad, packCol: 0xe8452c },
        { ...GLIDER, id: 'g_speed', name: 'Speedrider', era: 'Heute', bands: 1, fit: 'tight',
          jacket: 0x16181c, panel: 0x0b0d10, trim: 0xf2b01e, pants: 0x16181c, knee: 0xf2b01e, boot: 0x16181c, bootDark: 0xf2b01e, glove: 0xf2b01e,
          headCol: 0x16181c, headTrim: 0xf2b01e, lens: 0xf2b01e, strap: 0xf2b01e, ski: 0xf2b01e, skiTop: 0x16181c, pole: 0x16181c, packCol: 0xf2b01e },
        { ...GLIDER, id: 'g_acro', name: 'Acro-Pilotin', era: 'Heute', bands: 0, fit: 'loose', hair: 0xd8b77a,
          jacket: 0xe0409a, panel: 0x7a1f5a, trim: 0x58d0e6, pants: 0x1f8a8a, knee: 0x12343a, boot: 0xf2f2f0, bootDark: 0x1d2128, glove: 0x58d0e6,
          headCol: 0x58d0e6, headTrim: 0xe0409a, lens: 0xe0409a, strap: 0x7a1f5a, ski: 0xe0409a, skiTop: 0x58d0e6, pole: 0x58d0e6, packCol: 0x7a1f5a },
        { ...GLIDER, id: 'g_legend', name: 'Fluglegende', era: '★ 6', unlock: 6, bands: 2,
          jacket: 0xf2f2f0, panel: 0xd9a520, trim: 0xd9a520, pants: 0x16181c, knee: 0xd9a520, boot: 0xf2f2f0, bootDark: 0x16181c, glove: 0xd9a520,
          headCol: 0xd9a520, headTrim: 0xf2f2f0, lens: 0x58d0e6, strap: 0x16181c, ski: 0xd9a520, skiTop: 0xf2f2f0, pole: 0x16181c, packCol: 0x16181c }
    ]
};

// ===== BELOHNUNGEN =====
// Manche Stücke gibt es erst für geschaffte Kampagnen-Level: `unlock` = so viele Level müssen geschafft sein.
// Alles ohne `unlock` ist von Anfang an da. Beim Entwickeln und für Admins ist nichts gesperrt.
export const REWARD_OUTFITS = [
    { id: 'patrol', name: 'Bergrettung', era: '★ 2', unlock: 2, head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 2, pack: true,
      jacket: 0xd3202c, panel: 0x16181c, trim: 0xf4d21f, pants: 0x16181c, knee: 0xf4d21f, boot: 0x16181c, bootDark: 0xd3202c, glove: 0xf4d21f,
      headCol: 0xf4f4f2, headTrim: 0xd3202c, lens: 0xf2a21b, strap: 0xd3202c, ski: 0xd3202c, skiTop: 0xf4f4f2, pole: 0xf4d21f, packCol: 0xd3202c, hair: 0x3b2a1e },
    { id: 'groomer', name: 'Pistenchef', era: '★ 4', unlock: 4, head: 'beanie', eyes: 'shades', torso: 'jacket', bands: 1, pack: false, fit: 'loose',
      jacket: 0xf07a1c, panel: 0x2a2e36, trim: 0xe9eef2, pants: 0x2a2e36, knee: 0x1a1d23, boot: 0x2a2018, bootDark: 0x15100c, glove: 0x2a2e36,
      headCol: 0x2a2e36, headTrim: 0xf07a1c, lens: 0x2a2018, strap: 0x2a2018, ski: 0xf07a1c, skiTop: 0x2a2e36, pole: 0x8a8f96, packCol: 0x2a2e36, hair: 0x6a4424 },
    { id: 'champion', name: 'Gesamtsieger', era: '★ 7', unlock: 7, head: 'helmet', eyes: 'goggles', torso: 'suit', bands: 3, pack: false, fit: 'tight',
      jacket: 0xd9a520, panel: 0xb07f17, trim: 0xfaf6e6, pants: 0xd9a520, knee: 0xfaf6e6, boot: 0xfaf6e6, bootDark: 0xb07f17, glove: 0xfaf6e6,
      headCol: 0xd9a520, headTrim: 0xfaf6e6, lens: 0x2e6bd6, strap: 0xfaf6e6, ski: 0xfaf6e6, skiTop: 0xd9a520, pole: 0xd9a520, packCol: 0xb07f17, hair: 0x3b2a1e }
];
// Gleitschirme: Farben der Kappe von Spitze zu Spitze
export const CANOPIES = [
    { id: 'c_classic', name: 'Klassik', cols: [0xe8452c, 0xf2f4f7, 0xf2b01e, 0xf2f4f7, 0xe8452c] },
    { id: 'c_ocean', name: 'Ozean', cols: [0x1f4fb5, 0x58d0e6, 0xf2f4f7, 0x58d0e6, 0x1f4fb5] },
    { id: 'c_forest', name: 'Bergwald', cols: [0x14483a, 0x1f8a6a, 0xf2ead8, 0x1f8a6a, 0x14483a] },
    { id: 'c_rainbow', name: 'Regenbogen', unlock: 1, cols: [0xd3202c, 0xf07a1c, 0xf2d21a, 0x2fa64a, 0x1f6fd0, 0x7a3fc4] },
    { id: 'c_night', name: 'Nachtflug', unlock: 5, cols: [0x16181c, 0x9be53a, 0x16181c, 0x9be53a, 0x16181c] },
    { id: 'c_gold', name: 'Gold', unlock: 9, cols: [0xfaf6e6, 0xd9a520, 0xb07f17, 0xd9a520, 0xfaf6e6] }
];
/** Was wird mit dem n-ten geschafften Level frei? (für die Meldung nach dem Levelende) */
export const rewardsAt = (n) => [...REWARD_OUTFITS, ...Object.values(SPORT_OUTFITS).flat(), ...CANOPIES].filter(o => o.unlock === n).map(o => o.name);
/** Ist dieses Stück schon freigespielt? `done` = Zahl der geschafften Level. */
export const isUnlocked = (o, done) => !o.unlock || done >= o.unlock;

// ===== SKIMARKEN =====
// Ski bekannter Hersteller, in deren typischen Farben. Nur der Name als Schrift – keine Logos, keine
// nachgebauten Dekore. (Öffentliches Fanprojekt: die Namen gehören den jeweiligen Herstellern.)
export const SKI_BRANDS = [
    { id: 'ski_atomic',    name: 'Atomic',    ski: 0xd8232a, skiTop: 0xf4f4f2, pole: 0xd8232a },
    { id: 'ski_head',      name: 'Head',      ski: 0x16181c, skiTop: 0xf4f4f2, pole: 0xe2e4e8 },
    { id: 'ski_rossignol', name: 'Rossignol', ski: 0xf2f2f0, skiTop: 0xd21f2b, pole: 0x1f3f8f },
    { id: 'ski_fischer',   name: 'Fischer',   ski: 0xf2d21a, skiTop: 0x15171a, pole: 0x15171a },
    { id: 'ski_voelkl',    name: 'Völkl',     ski: 0x1a1c20, skiTop: 0xf2d21a, pole: 0xf2d21a },
    { id: 'ski_salomon',   name: 'Salomon',   ski: 0x1b62b8, skiTop: 0xf4f4f2, pole: 0x15171a },
    { id: 'ski_blizzard',  name: 'Blizzard',  ski: 0xf06a1c, skiTop: 0x15171a, pole: 0xf06a1c },
    { id: 'ski_nordica',   name: 'Nordica',   ski: 0xc81e28, skiTop: 0x15171a, pole: 0x8a8f96 },
    { id: 'ski_elan',      name: 'Elan',      ski: 0x2fa64a, skiTop: 0x15171a, pole: 0x2fa64a },
    { id: 'ski_k2',        name: 'K2',        ski: 0x15171a, skiTop: 0xd8232a, pole: 0xd8232a },
    { id: 'ski_stoeckli',  name: 'Stöckli',   ski: 0xc9ced4, skiTop: 0x1f4f9f, pole: 0x1f4f9f },
    { id: 'ski_dynastar',  name: 'Dynastar',  ski: 0x1f4fb5, skiTop: 0xf2d21a, pole: 0xf2d21a }
];
OUTFITS.push(...REWARD_OUTFITS);
const partById = (id) => SKI_BRANDS.find(b => b.id === id) || OUTFITS.find(o => o.id === id) || null;

// ===== EINZELTEILE =====
// Jedes Teil lässt sich einzeln aus einem der Outfits nehmen. Ein Teil = die Felder, die es mitbringt.
export const SLOTS = [
    { key: 'head',  label: 'Kopf',     fields: ['head', 'headCol', 'headTrim', 'hair', 'eyes', 'lens', 'strap'] },
    { key: 'top',   label: 'Oberteil', fields: ['torso', 'jacket', 'panel', 'trim', 'bands', 'pack', 'packCol', 'glove'], fit: 'topFit' },
    { key: 'pants', label: 'Hose',     fields: ['pants', 'knee'], fit: 'pantsFit' },
    { key: 'boots', label: 'Schuhe',   fields: ['boot', 'bootDark'] },
    { key: 'ski',   label: 'Ski',      fields: ['ski', 'skiTop', 'pole'] }
];
export const outfitById = (id) => OUTFITS.find(o => o.id === id) || OUTFITS[0];

/** Gespeicherte Auswahl: je Teil die Id des Outfits, aus dem es stammt. */
export function getSelection() {
    const sel = {};
    let raw = null;
    try { raw = localStorage.getItem(key()); } catch { /* privater Modus */ }
    let data = null;
    if (raw && raw[0] === '{') { try { data = JSON.parse(raw); } catch { data = null; } }
    for (const sl of SLOTS) {
        const id = data ? data[sl.key] : raw;                 // früher stand hier nur die Id eines ganzen Outfits
        const ok = OUTFITS.some(o => o.id === id) || (sl.key === 'ski' && SKI_BRANDS.some(b => b.id === id));
        sel[sl.key] = ok ? id : OUTFITS[0].id;
    }
    return sel;
}
const readStore = () => {
    try { const raw = localStorage.getItem(key()); return raw && raw[0] === '{' ? JSON.parse(raw) : {}; } catch { return {}; }
};
export function setSelection(sel) {
    // die Wahl der anderen Sportarten (sport_…) bleibt daneben erhalten
    try { localStorage.setItem(key(), JSON.stringify({ ...readStore(), ...sel })); } catch { /* privater Modus */ }
}
/** Gewählte Ausrüstung einer Sportart (Id aus SPORT_OUTFITS) – ohne Wahl die erste. */
export function getSportChoice(sport) {
    const list = SPORT_OUTFITS[sport] || [], id = readStore()['sport_' + sport];
    return (list.find(o => o.id === id) || list[0] || {}).id || '';
}
/** Farben des gewählten Gleitschirms. */
export function canopyColors() {
    const id = readStore().sport_canopy;
    return (CANOPIES.find(c => c.id === id) || CANOPIES[0]).cols;
}
export const getCanopyChoice = () => (CANOPIES.find(c => c.id === readStore().sport_canopy) || CANOPIES[0]).id;
export function setSportChoice(sport, id) {
    try { localStorage.setItem(key(), JSON.stringify({ ...getSelection(), ...readStore(), ['sport_' + sport]: id })); } catch { /* privater Modus */ }
}
/** Auswahl für alle Teile aus einem Outfit. */
export const presetSelection = (id) => Object.fromEntries(SLOTS.map(sl => [sl.key, id]));
/** Aus der Auswahl das Outfit zusammensetzen, das SkiFigure baut. */
export function composeOutfit(sel = getSelection(), sport = 'alpin', sportId = null) {
    if (sport !== 'alpin' && SPORT_OUTFITS[sport]) {
        const id = sportId || getSportChoice(sport), src = SPORT_OUTFITS[sport].find(o => o.id === id) || SPORT_OUTFITS[sport][0];
        return { ...src, topFit: src.fit || 'normal', pantsFit: src.fit || 'normal' };
    }
    const out = {};
    for (const sl of SLOTS) {
        const src = (sl.key === 'ski' && partById(sel[sl.key])) || outfitById(sel[sl.key]);
        for (const f of sl.fields) out[f] = src[f];
        if (sl.fit) out[sl.fit] = src.fit || 'normal';
    }
    return out;
}
/** Kurzer Schlüssel der Auswahl (ändert er sich, wird die Figur neu gebaut). */
export const selectionKey = (sel = getSelection(), sport = 'alpin') => (sport !== 'alpin' && SPORT_OUTFITS[sport] ? getSportChoice(sport) : SLOTS.map(sl => sel[sl.key]).join('|'));

/** Hat dieser Spieler seine Figur schon einmal eingekleidet? (Sonst zeigt das Spiel beim ersten Start die Garderobe.) */
export function hasChosenOutfit() {
    try { return !!localStorage.getItem(key()); } catch { return true; }
}
