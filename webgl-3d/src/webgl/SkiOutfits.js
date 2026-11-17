// ============================================================
// GARDEROBE DES FAHRERS: Outfits von Retro bis modern.
// Jedes Outfit ist nur ein Satz Farben und ein paar Formschalter –
// die Figur selbst baut SkiFigure.js daraus.
//   head   'helmet' | 'beanie' | 'bobble' (Bommelmütze) | 'headband' | 'cap' (Schirmmütze)
//   eyes   'goggles' | 'shades' (Sonnenbrille) | 'none'
//   torso  'jacket' | 'sweater' (ohne Schulterpolster, mit Bündchen) | 'suit' (Einteiler, eng)
//   bands  Zahl der Querstreifen auf der Brust (0–3)
// Die Wahl liegt je Gerät in localStorage['mt.outfit'].
// ============================================================
const KEY = 'mt.outfit';

export const OUTFITS = [
    { id: 'modern', name: 'Pistenprofi', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 1, pack: true,
      jacket: 0xd9482b, panel: 0x1d2530, trim: 0xf3efe6, pants: 0x222c3a, knee: 0x151b25, boot: 0xe9e6df, bootDark: 0x1d2128, glove: 0x15181d,
      headCol: 0x20252d, headTrim: 0xd9482b, lens: 0xf7a21b, strap: 0xf3efe6, ski: 0x1f5fbf, skiTop: 0xf3efe6, pole: 0x9aa3ad, packCol: 0x2a3442, hair: 0x3b2a1e },
    { id: 'freeride', name: 'Freerider', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 0, pack: true,
      jacket: 0x1f8a8a, panel: 0x12343a, trim: 0xe8b23a, pants: 0xd9a129, knee: 0xb07f17, boot: 0x23272e, bootDark: 0x101216, glove: 0x23272e,
      headCol: 0xf2efe8, headTrim: 0x1f8a8a, lens: 0x58d0e6, strap: 0x12343a, ski: 0xe8b23a, skiTop: 0x12343a, pole: 0x23272e, packCol: 0x12343a, hair: 0x5a3a22 },
    { id: 'white', name: 'Alpin Chic', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 1, pack: false,
      jacket: 0xf2f1ec, panel: 0xb9bcc2, trim: 0x16191e, pants: 0x16191e, knee: 0x0c0e11, boot: 0xf2f1ec, bootDark: 0x16191e, glove: 0xf2f1ec,
      headCol: 0xf2f1ec, headTrim: 0xc9a227, lens: 0xc9a227, strap: 0x16191e, ski: 0x16191e, skiTop: 0xc9a227, pole: 0xc9a227, packCol: 0x16191e, hair: 0xd8b77a },
    { id: 'night', name: 'Nachtschicht', era: 'Heute', head: 'helmet', eyes: 'goggles', torso: 'jacket', bands: 2, pack: true,
      jacket: 0x14171c, panel: 0x0b0d10, trim: 0x9be53a, pants: 0x14171c, knee: 0x0b0d10, boot: 0x14171c, bootDark: 0x9be53a, glove: 0x9be53a,
      headCol: 0x14171c, headTrim: 0x9be53a, lens: 0x9be53a, strap: 0x9be53a, ski: 0x9be53a, skiTop: 0x14171c, pole: 0x9be53a, packCol: 0x0b0d10, hair: 0x14171c },
    { id: 'park', name: 'Snowpark', era: '2005', head: 'beanie', eyes: 'goggles', torso: 'jacket', bands: 0, pack: false, baggy: true,
      jacket: 0x6b7a3a, panel: 0x4b5628, trim: 0xf08a24, pants: 0x8a6a4a, knee: 0x6f553a, boot: 0x2b2b2b, bootDark: 0x151515, glove: 0xf08a24,
      headCol: 0xf08a24, headTrim: 0x2b2b2b, lens: 0xe0409a, strap: 0x2b2b2b, ski: 0xf08a24, skiTop: 0x2b2b2b, pole: 0x2b2b2b, packCol: 0x2b2b2b, hair: 0x2a1c12 },
    { id: 'racer', name: 'Rennläufer', era: '1992', head: 'helmet', eyes: 'goggles', torso: 'suit', bands: 3, pack: false,
      jacket: 0xd41f2d, panel: 0xd41f2d, trim: 0xffffff, pants: 0xd41f2d, knee: 0xffffff, boot: 0xf4d21f, bootDark: 0x1a1a1a, glove: 0x1a1a1a,
      headCol: 0xffffff, headTrim: 0xd41f2d, lens: 0x2e6bd6, strap: 0xd41f2d, ski: 0xf4d21f, skiTop: 0xd41f2d, pole: 0xd41f2d, packCol: 0x1a1a1a, hair: 0x3b2a1e },
    { id: 'neon', name: 'Neon-Einteiler', era: '1986', head: 'headband', eyes: 'shades', torso: 'suit', bands: 2, pack: false,
      jacket: 0xff3ea5, panel: 0x18c8c8, trim: 0xf6ef2e, pants: 0xff3ea5, knee: 0x18c8c8, boot: 0xf6ef2e, bootDark: 0x8a2be2, glove: 0x18c8c8,
      headCol: 0xf6ef2e, headTrim: 0x18c8c8, lens: 0x30e0ff, strap: 0x18c8c8, ski: 0xf6ef2e, skiTop: 0xff3ea5, pole: 0x18c8c8, packCol: 0x8a2be2, hair: 0xe8c25a },
    { id: 'seventies', name: 'Skilehrer', era: '1975', head: 'bobble', eyes: 'shades', torso: 'jacket', bands: 2, pack: false,
      jacket: 0xc8371f, panel: 0xc8371f, trim: 0xf4e9c8, pants: 0x1f2f55, knee: 0x1f2f55, boot: 0xb3261a, bootDark: 0x2a1a14, glove: 0x4a2c18,
      headCol: 0xc8371f, headTrim: 0xf4e9c8, lens: 0x2a2018, strap: 0x2a2018, ski: 0xf4e9c8, skiTop: 0xc8371f, pole: 0xc9cdd2, packCol: 0x4a2c18, hair: 0x6a4424 },
    { id: 'sixties', name: 'Wirtschaftswunder', era: '1962', head: 'headband', eyes: 'shades', torso: 'sweater', bands: 3, pack: false,
      jacket: 0x1d3f73, panel: 0x1d3f73, trim: 0xf2ead8, pants: 0x1a1c22, knee: 0x1a1c22, boot: 0x1a1c22, bootDark: 0x0e0f12, glove: 0xf2ead8,
      headCol: 0xf2ead8, headTrim: 0xc8371f, lens: 0x16130f, strap: 0x16130f, ski: 0x9c2f22, skiTop: 0xf2ead8, pole: 0xb9a16a, packCol: 0x4a2c18, hair: 0x2a1a10 },
    { id: 'pioneer', name: 'Skipionier', era: '1935', head: 'cap', eyes: 'none', torso: 'sweater', bands: 2, pack: true,
      jacket: 0xd9cdb0, panel: 0x7a5a3a, trim: 0x8a2f24, pants: 0x5a4632, knee: 0x9a8a6a, boot: 0x4a3222, bootDark: 0x2a1c12, glove: 0x7a5a3a,
      headCol: 0x5a4632, headTrim: 0x3a2c1e, lens: 0x16130f, strap: 0x3a2c1e, ski: 0x9a6a3a, skiTop: 0x7a4f26, pole: 0x8a6a3e, packCol: 0x6a5234, hair: 0x4a3222 }
];

export function getOutfitId() {
    try { const id = localStorage.getItem(KEY); if (OUTFITS.some(o => o.id === id)) return id; } catch { /* privater Modus */ }
    return OUTFITS[0].id;
}
export function setOutfitId(id) {
    try { localStorage.setItem(KEY, id); } catch { /* privater Modus */ }
}
export const outfitById = (id) => OUTFITS.find(o => o.id === id) || OUTFITS[0];
