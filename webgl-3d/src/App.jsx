import React, { useState, useEffect, useCallback, useRef } from 'react';
import WorldCanvas from './components/game/WorldCanvas';
import { SkiResortManager, Lift } from './engine/SkiResortManager';
import './App.css';
import { COLORS, LIFT_TYPES } from './constants/game';
import { BUILDINGS, BUILDING_CATEGORIES, getBuildingsByCategory } from './constants/buildings';
import { GUEST_CATEGORIES } from './constants/guests';
import { generateWorldData, screenToIso } from './engine/utils';
import { PISTE_WIDTHS } from './constants/pistes';
import PisteDetailModal from './components/ui/PisteDetailModal';
import MainMenu from './components/menu/MainMenu';
import LoadingScreen from './components/menu/LoadingScreen.jsx';
import World3D from './webgl/World3D';
import AuthGate from './auth/AuthGate.jsx';
import AccountBar from './auth/AccountBar.jsx';
import { api, authEnabled, getSession, clearSession } from './auth/authClient';
import { syncProgress, installProgressSync } from './auth/progressSync';
import { checkForNewBuild } from './buildInfo';
import {
  evaluateObjective,
  objectiveLabel,
  formatObjectiveValue,
  markLevelCompleted,
  CAMPAIGN_LEVELS, MASSIFS } from './constants/campaign';

const DAY_DURATION_MS = 5 * 60 * 1000;
const DUSK_DURATION_MS = 5000;

// Internal Error Boundary to catch Component Crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: 20, background: 'white' }}>
          <h2>Component Error (WorldCanvas)</h2>
          <pre>{this.state.error.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const normalizeGuestDifficulty = (pref) => (pref === 'GREEN' ? 'BLUE' : pref || 'RED');

const getBuildAdvice = (resortManager) => {
  const buildings = resortManager?.buildings || [];
  const guests = (resortManager?.guests || []).filter(g => g && !g.shouldRemove);
  const paidGuests = guests.filter(g => g.hasLiftPass);
  const lifts = resortManager?.lifts || [];
  const pistes = resortManager?.pistes || [];

  const hasTicketOffice = buildings.some(b => b.type?.id === 'ticket_office');
  if (!hasTicketOffice) {
    return {
      title: BUILDINGS.TICKET_OFFICE.name,
      detail: 'Ohne Kasse kauft niemand einen Skipass.'
    };
  }

  if (!lifts.length) {
    return {
      title: 'Ersten Lift bauen',
      detail: 'Nach dem Ticket wollen die meisten Gaeste direkt auf den Berg.'
    };
  }

  if (!pistes.length) {
    return {
      title: 'Erste Piste bauen',
      detail: 'Neue Gaeste werden erst beim Skifahren wirklich zufrieden.'
    };
  }

  const multiDayGuests = paidGuests.filter(g => (g.passDaysRemaining || 0) > 1);
  const multiDayWithoutHotel = multiDayGuests.filter(g => !g.hotelBuildingId).length;
  const hotelCapacity = buildings
    .filter(b => b.type?.category === 'hotel')
    .reduce((sum, b) => sum + Math.max(0, b.type?.capacity || 0), 0);
  if (multiDayGuests.length >= 4 && (multiDayWithoutHotel >= 2 || hotelCapacity < Math.ceil(multiDayGuests.length * 0.8))) {
    return {
      title: 'Hotelbetten bauen',
      detail: `${multiDayWithoutHotel} Mehrtagesgaeste haben noch keinen Schlafplatz.`
    };
  }

  const urgentToilet = paidGuests.filter(g => (g.bladder || 0) >= 70).length;
  const toiletCount = buildings.filter(b => b.type?.id === 'toilettenhauschen').length;
  if (urgentToilet >= Math.max(3, Math.ceil(paidGuests.length * 0.18)) || (!toiletCount && paidGuests.length >= 8)) {
    return {
      title: BUILDINGS.TOILETTENHAUSCHEN.name,
      detail: 'Toilettenmangel zieht die Stimmung sehr schnell runter.'
    };
  }

  const gastroCount = buildings.filter(b => b.type?.category === 'gastronomy').length;
  const hungryGuests = paidGuests.filter(g => (g.hunger || 0) >= 58 || (g.thirst || 0) >= 52).length;
  if (hungryGuests >= Math.max(4, Math.ceil(paidGuests.length * 0.2)) || (!gastroCount && paidGuests.length >= 10)) {
    return {
      title: 'Gastronomie bauen',
      detail: 'Hungrige und durstige Gaeste geben dort Geld aus und werden wieder entspannter.'
    };
  }

  const avgLiftQueue = lifts.length
    ? lifts.reduce((sum, lift) => sum + (lift.guestQueue?.length || 0), 0) / lifts.length
    : 0;
  if (paidGuests.length >= 12 && avgLiftQueue >= 5.5) {
    return {
      title: 'Mehr Liftkapazitaet',
      detail: 'Die Warteschlangen sind lang. Ein neuer Lift oder mehr Speed hilft sofort.'
    };
  }

  const supply = pistes.reduce((acc, piste) => {
    const key = piste?.avgDifficulty || 'BLUE';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { BLUE: 0, RED: 0, BLACK: 0 });
  const demand = paidGuests.reduce((acc, guest) => {
    const key = normalizeGuestDifficulty(guest.slopePreference);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { BLUE: 0, RED: 0, BLACK: 0 });

  const shortageCandidates = ['BLUE', 'RED', 'BLACK'].map((key) => ({
    key,
    score: (demand[key] || 0) - (supply[key] || 0) * 2.2
  })).sort((a, b) => b.score - a.score);

  if ((shortageCandidates[0]?.score || 0) > 1.5) {
    const label = shortageCandidates[0].key === 'BLUE'
      ? 'leichte Piste'
      : shortageCandidates[0].key === 'RED'
        ? 'rote Piste'
        : 'schwarze Piste';
    return {
      title: `Neue ${label}`,
      detail: 'Neue Abfahrten im Lieblingsniveau machen die Gaeste besonders gluecklich.'
    };
  }

  return {
    title: 'Mehr Abwechslung bauen',
    detail: 'Neue Lifte und frische Pisten verteilen die Gaeste besser im ganzen Gebiet.'
  };
};

const HudIcon = ({ name, muted = false }) => {
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  };

  switch (name) {
    case 'money':
      return (
        <svg {...commonProps}>
          <ellipse cx="12" cy="6.5" rx="6.5" ry="2.75" />
          <path d="M5.5 6.5v5c0 1.52 2.9 2.75 6.5 2.75s6.5-1.23 6.5-2.75v-5" />
          <path d="M5.5 11.5v5c0 1.52 2.9 2.75 6.5 2.75s6.5-1.23 6.5-2.75v-5" />
        </svg>
      );
    case 'day':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="4.75" />
          <path d="M12 3.5v2.25M12 18.25v2.25M20.5 12h-2.25M5.75 12H3.5M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5l-1.6-1.6" />
        </svg>
      );
    case 'guests':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="2.75" />
          <path d="M6.25 18c.55-2.5 2.9-4.25 5.75-4.25S17.2 15.5 17.75 18" />
          <path d="M5.75 9.5a2.1 2.1 0 1 1 0-.01M18.25 9.5a2.1 2.1 0 1 1 0-.01" />
        </svg>
      );
    case 'mood':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9 10h.01M15 10h.01" />
          <path d="M8.5 14.25c.9 1.4 2.08 2.1 3.5 2.1s2.6-.7 3.5-2.1" />
        </svg>
      );
    case 'energy':
      return (
        <svg {...commonProps}>
          <path d="M13.25 2.75 6.5 13h4.5l-.25 8.25L17.5 11H13l.25-8.25Z" />
        </svg>
      );
    case 'weather':
      return (
        <svg {...commonProps}>
          <path d="M7 17.5h9.5a3.5 3.5 0 0 0 .1-7 5.5 5.5 0 0 0-10.72 1.5A3 3 0 0 0 7 17.5Z" />
          <path d="m9.25 20 .5-.9M12 20.75l.5-.9M14.75 20l.5-.9" />
        </svg>
      );
    case 'bed':
      return (
        <svg {...commonProps}>
          <path d="M4 16.5v-6.25h16v6.25" />
          <path d="M4 13.25h16" />
          <path d="M7.25 10.25V8.5a1.75 1.75 0 0 1 1.75-1.75h2.5a1.75 1.75 0 0 1 1.75 1.75v1.75" />
          <path d="M4 18.5v-2M20 18.5v-2" />
        </svg>
      );
    case 'advice':
      return (
        <svg {...commonProps}>
          <path d="M12 3.5v17" />
          <path d="M12 5.5c2.4 0 3.7-1.25 6-1.25v7c-2.3 0-3.6 1.25-6 1.25S8.3 11.25 6 11.25v-7c2.3 0 3.6 1.25 6 1.25Z" />
        </svg>
      );
    case 'audio':
      return muted ? (
        <svg {...commonProps}>
          <path d="M5.5 10.25h3.25L13 6.75v10.5l-4.25-3.5H5.5z" />
          <path d="m16 9 4 6M20 9l-4 6" />
        </svg>
      ) : (
        <svg {...commonProps}>
          <path d="M5.5 10.25h3.25L13 6.75v10.5l-4.25-3.5H5.5z" />
          <path d="M16.25 10.25a3.25 3.25 0 0 1 0 3.5" />
          <path d="M18.5 8a6 6 0 0 1 0 8" />
        </svg>
      );
    case 'build':
      return (
        <svg {...commonProps}>
          <path d="M4.5 20.5h15" />
          <path d="M7.5 20.5v-7.75l4.5-2.5 4.5 2.5v7.75" />
          <path d="M10 20.5v-4.25h4v4.25" />
          <path d="M12 3.5v4.25" />
          <path d="M9 5.75h6" />
        </svg>
      );
    case 'lift':
      return (
        <svg {...commonProps}>
          <path d="M4 8h16" />
          <path d="M7 8v2.5a5 5 0 0 0 10 0V8" />
          <path d="M9 18.5h6" />
          <path d="M10 13.5v5M14 13.5v5" />
        </svg>
      );
    case 'slope':
      return (
        <svg {...commonProps}>
          <path d="M5 18.5 11 7l8 11.5" />
          <path d="M8.25 18.5 12 13.25 15.75 18.5" />
          <path d="M6.25 6.25h.01M17.75 7.25h.01" />
        </svg>
      );
    case 'rotate':
      return (
        <svg {...commonProps}>
          <path d="M8 7.5H4.5V4" />
          <path d="M4.75 7.25A8 8 0 1 1 7 18.5" />
        </svg>
      );
    case 'zoom-in':
      return (
        <svg {...commonProps}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M10.5 8v5M8 10.5h5" />
          <path d="m15 15 4.25 4.25" />
        </svg>
      );
    case 'zoom-out':
      return (
        <svg {...commonProps}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M8 10.5h5" />
          <path d="m15 15 4.25 4.25" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...commonProps}>
          <path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h15" />
        </svg>
      );
    case 'target':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.25" />
        </svg>
      );
    default:
      return null;
  }
};

const Game = ({ level, onExitToMenu }) => {
  console.log("📦 [Game] Rendering component...", level?.id);

  // Level-abhängige Kartengröße (Kampagne: 144 → 288)
  const GRID_SIZE = level?.gridSize || 256;

  // World Generation State (nutzt den Landschaftsgenerator mit Level-Config)
  const [worldData, setWorldData] = useState(() => {
    console.log("🌍 [Game] Initializing world data...", level?.terrain);
    try {
      const data = generateWorldData(GRID_SIZE, { ...(level?.terrain || {}), theme: level?.theme,
        massif: MASSIFS[level?.id] });
      console.log("✨ [Game] World data generated successfully", { size: GRID_SIZE });
      return data;
    } catch (e) {
      console.error('❌ [Game] World generation error:', e);
      return null;
    }
  });



  const [gameState, setGameState] = useState({
    money: level?.startingMoney ?? 150000, // Synced from resortManager.money
    day: 1,
    guests: 0,
    satisfaction: 80,
    energy: 0
  });

  // Missions-System
  const [missionResults, setMissionResults] = useState([]);
  const [missionPanelOpen, setMissionPanelOpen] = useState(false);
  const [missionAnchor, setMissionAnchor] = useState(null);
  const [levelCompleted, setLevelCompleted] = useState(false);
  const [completionDismissed, setCompletionDismissed] = useState(false);

  const [activeMenu, setActiveMenu] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [targetRotation, setTargetRotation] = useState(0);

  // Viewport State lifted from WorldCanvas
  const [offset, setOffset] = useState({ x: window.innerWidth / 2, y: -200 });
  const [scale, setScale] = useState(0.4);

  // Lift System State
  const [placementMode, setPlacementMode] = useState(null);
  const [selectedLiftType, setSelectedLiftType] = useState(null);
  const [liftStartPoint, setLiftStartPoint] = useState(null);
  const [placedLifts, setPlacedLifts] = useState([]);
  const [liftPreviewValidation, setLiftPreviewValidation] = useState(null);
  const [buildingValidation, setBuildingValidation] = useState(null);

  // ... (existing code)



  // Piste System State
  const [pistePlacementMode, setPistePlacementMode] = useState(null);
  const [currentPiste, setCurrentPiste] = useState(null);
  const [hoveredTile, setHoveredTile] = useState(null);
  const [pisteListOpen, setPisteListOpen] = useState(true);

  // Building System State
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [buildingCategory, setBuildingCategory] = useState(null);
  const [selectedToolType, setSelectedToolType] = useState(null); // For terrain tool two-step selection
  const [buildingRotation, setBuildingRotation] = useState(0); // 0, 90, 180, 270
  const [clickedBuilding, setClickedBuilding] = useState(null); // For info panel
  const [clickedLift, setClickedLift] = useState(null); // Lift info panel
  const [selectedGuest, setSelectedGuest] = useState(null); // Guest info panel
  const [showStats, setShowStats] = useState(false); // Statistics modal state
  const [selectedPiste, setSelectedPiste] = useState(null); // Currently viewed piste detail
  const [duskProgress, setDuskProgress] = useState(0);
  const [musicEnabled, setMusicEnabled] = useState(false); // Musik default aus — per Sound-Button aktivierbar
  const [buildAdviceHovered, setBuildAdviceHovered] = useState(false);
  const [weatherHud, setWeatherHud] = useState({
    current: 'INIT',
    next: 'CLEAR',
    remainingSec: 0
  });
  const musicRef = useRef({
    ctx: null,
    master: null,
    musicTimer: null,
    spatialTimer: null,
    shoutTimer: null,
    unlocked: false,
    started: false,
    nodes: null,
    levels: { lift: 0, diesel: 0, ski: 0 }
  });
  const audioSceneRef = useRef({ offset, scale, rotation, worldData });

  // Resort Manager (Startkapital + Basis-Höhenlage aus dem Level)
  const [resortManager] = useState(() => {
    const m = new SkiResortManager();
    m.money = level?.startingMoney ?? 150000;
    m.baseAltitude = level?.terrain?.baseAltitude ?? 1000; // Meereshöhe der Talstation
    return m;
  });

  // GENERATE INITIAL ACCESS ROAD + ANKUNFTSPLATZ (Runs once)
  useEffect(() => {
    if (resortManager.buildings.length === 0 && worldData) {
      const moneyBefore = resortManager.money;
      const startX = 0;
      const endX = 34; // Straße führt durch den ganzen Ankunftsplatz
      const roadY = 10;

      for (let x = startX; x <= endX; x++) {
        resortManager.placeBuilding(
          x,
          roadY,
          BUILDINGS.ROAD,
          worldData.heightmap,
          GRID_SIZE,
          worldData.landcover
        );
      }

      // Kostenloser Start-Parkplatz + Busparkplatz — Einfahrten liegen
      // DIREKT an der Straße (obere Kante bei y=11, Straße bei y=10),
      // damit Autos & Busse wirklich einparken können.
      resortManager.placeBuilding(
        17,
        11,
        BUILDINGS.PARKING_LOT,
        worldData.heightmap,
        GRID_SIZE,
        worldData.landcover
      );
      resortManager.placeBuilding(
        27,
        11,
        BUILDINGS.BUS_STOP,
        worldData.heightmap,
        GRID_SIZE,
        worldData.landcover
      );

      // POIs platzieren: Gipfelkreuz (höchster Punkt), Talkreuz (fernes Tal),
      // Bergsee-Panorama — Ziele, die weiträumige Erschließung belohnen.
      resortManager.initPois(worldData.heightmap, GRID_SIZE, worldData.landcover);

      // The initial access road + arrival parking are mandatory infrastructure
      // the player can't opt out of -> provide them free.
      resortManager.money = moneyBefore;
      resortManager.totalExpenses = 0;
      setGameState(prev => ({ ...prev, money: resortManager.money }));
    }
  }, [resortManager, worldData]);



  // Validate Building Placement on Hover
  useEffect(() => {
    if (selectedBuilding && hoveredTile && !pistePlacementMode && !placementMode?.startsWith('lift')) {
      // Don't validate for tools (Forest, Terrain, Water) - they have their own logic or remain blue
      if (selectedBuilding.isTerrainTool || selectedBuilding.isForestTool || selectedBuilding.isWaterTool) {
        setBuildingValidation(null);
        return;
      }

      const validation = resortManager.validateBuildingPlacement(
        hoveredTile.x,
        hoveredTile.y,
        selectedBuilding,
        worldData?.heightmap,
        GRID_SIZE,
        worldData?.landcover
      );
      setBuildingValidation(validation);
    } else {
      setBuildingValidation(null);
    }
  }, [selectedBuilding, hoveredTile, worldData, resortManager, pistePlacementMode, placementMode]);

  // ===== KAMERA: Rotation mit Blickpunkt-Erhalt =====
  // Beim Drehen bleibt die Kachel in der Bildschirmmitte in der Mitte —
  // kein "Wegspringen" der Ansicht mehr.
  const TILE_SIZE_PX = 32;

  const rotateTo = useCallback((dir) => {
    // dir: +90 (im Uhrzeigersinn) oder -90
    const newRotation = ((rotation + dir) % 360 + 360) % 360;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    let newOffset = null;
    if (worldData?.heightmap) {
      // 1. Welche Daten-Kachel liegt aktuell in der Bildschirmmitte?
      const center = screenToIso(cx, cy, scale, offset.x, offset.y, rotation, GRID_SIZE, worldData.heightmap);
      const dx = Math.max(0, Math.min(GRID_SIZE - 1, center.x));
      const dy = Math.max(0, Math.min(GRID_SIZE - 1, center.y));
      const z = worldData.heightmap[dy * GRID_SIZE + dx] || 0;

      // 2. Visuelle Koordinaten dieser Kachel unter der NEUEN Rotation
      let vi = dx, vj = dy;
      if (newRotation === 90) { vi = dy; vj = GRID_SIZE - 1 - dx; }
      else if (newRotation === 180) { vi = GRID_SIZE - 1 - dx; vj = GRID_SIZE - 1 - dy; }
      else if (newRotation === 270) { vi = GRID_SIZE - 1 - dy; vj = dx; }

      // 3. Offset so setzen, dass die Kachel wieder in der Mitte liegt
      newOffset = {
        x: cx - (vi - vj) * (TILE_SIZE_PX / 2) * scale,
        y: cy - ((vi + vj) * (TILE_SIZE_PX / 4) * scale - z * scale)
      };
    }

    setRotation(newRotation);
    setTargetRotation(newRotation);
    if (newOffset) setOffset(newOffset);
  }, [rotation, scale, offset, worldData, GRID_SIZE]);

  const rotate = useCallback(() => rotateTo(90), [rotateTo]);
  const rotateCCW = useCallback(() => rotateTo(-90), [rotateTo]);

  // ===== KAMERA: Zoom zur Bildschirmmitte (Buttons / Tasten) =====
  const zoomAroundCenter = useCallback((factor) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setScale(prev => {
      const next = Math.max(0.08, Math.min(4, prev * factor));
      const ratio = next / prev;
      setOffset(o => ({
        x: cx - (cx - o.x) * ratio,
        y: cy - (cy - o.y) * ratio
      }));
      return next;
    });
  }, []);

  const zoomIn = useCallback(() => zoomAroundCenter(1.25), [zoomAroundCenter]);
  const zoomOut = useCallback(() => zoomAroundCenter(1 / 1.25), [zoomAroundCenter]);

  // ===== KAMERA: Tastatursteuerung (Q/E drehen, +/- zoomen) =====
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'q' || e.key === 'Q') { rotateCCW(); }
      else if (e.key === 'e' || e.key === 'E') { rotate(); }
      else if (e.key === 'z' || e.key === 'Z') { setMissionPanelOpen(v => !v); }
      else if (e.key === '+' || e.key === '=') { zoomIn(); }
      else if (e.key === '-' || e.key === '_') { zoomOut(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rotate, rotateCCW, zoomIn, zoomOut]);

  // MAIN GAME TIMER (5 min day + 5 sec dusk, then next day)
  useEffect(() => {
    let dayTimer = null;
    let duskRaf = null;
    let cancelled = false;

    const startDusk = () => {
      let duskStart = 0;
      const step = (ts) => {
        if (cancelled) return;
        if (!duskStart) duskStart = ts;
        const p = Math.max(0, Math.min(1, (ts - duskStart) / DUSK_DURATION_MS));
        setDuskProgress(p);
        if (p < 1) {
          duskRaf = requestAnimationFrame(step);
          return;
        }

        resortManager.stepDay();
        setGameState(prev => ({
          ...prev,
          day: prev.day + 1,
          money: resortManager.money,
          guests: resortManager.getPaidGuestCount(),
          satisfaction: resortManager.getAverageGuestSatisfaction(),
          energy: resortManager.getTotalEnergyUsage()
        }));
        setDuskProgress(0);
        runCycle();
      };
      duskRaf = requestAnimationFrame(step);
    };

    const runCycle = () => {
      dayTimer = setTimeout(() => {
        if (cancelled) return;
        startDusk();
      }, DAY_DURATION_MS);
    };

    runCycle();

    return () => {
      cancelled = true;
      if (dayTimer) clearTimeout(dayTimer);
      if (duskRaf) cancelAnimationFrame(duskRaf);
    };
  }, [resortManager]);

  // Live HUD refresh (money / paid guests / satisfaction) + Missions-Check
  useEffect(() => {
    const objectives = level?.objectives || [];
    const hudTimer = setInterval(() => {
      setGameState(prev => ({
        ...prev,
        money: resortManager.money,
        guests: resortManager.getPaidGuestCount(),
        satisfaction: resortManager.getAverageGuestSatisfaction(),
        energy: resortManager.getTotalEnergyUsage()
      }));

      // Missions-Fortschritt auswerten
      if (objectives.length > 0) {
        const stats = resortManager.getMissionStats();
        const results = objectives.map(obj => ({ obj, ...evaluateObjective(obj, stats) }));
        setMissionResults(results);

        const allDone = results.length > 0 && results.every(r => r.done);
        if (allDone) {
          setLevelCompleted(prev => {
            if (!prev && level?.id && !level.isSandbox) {
              markLevelCompleted(level.id);
            }
            return true;
          });
        }
      }
    }, 1000);

    return () => clearInterval(hudTimer);
  }, [resortManager, level]);

  // Keep latest camera/world snapshot for spatial audio updates.
  useEffect(() => {
    audioSceneRef.current = { offset, scale, rotation, worldData };
  }, [offset, scale, rotation, worldData]);

  // Spatial audio: cheerful music + lift hum + diesel rumble + skier shouts.
  useEffect(() => {
    const state = musicRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;

    const clearAll = () => {
      if (state.musicTimer) clearInterval(state.musicTimer);
      if (state.spatialTimer) clearInterval(state.spatialTimer);
      if (state.shoutTimer) clearInterval(state.shoutTimer);
      state.musicTimer = null;
      state.spatialTimer = null;
      state.shoutTimer = null;

      if (state.nodes) {
        const nodeList = Object.values(state.nodes).filter(Boolean);
        nodeList.forEach((node) => {
          if (typeof node.stop === 'function') {
            try { node.stop(); } catch (_) { /* ignore */ }
          }
          if (typeof node.disconnect === 'function') {
            try { node.disconnect(); } catch (_) { /* ignore */ }
          }
        });
      }
      state.nodes = null;
      if (state.master) {
        try { state.master.disconnect(); } catch (_) { /* ignore */ }
        state.master = null;
      }
      if (state.ctx) {
        try { state.ctx.close(); } catch (_) { /* ignore */ }
        state.ctx = null;
      }
      state.started = false;
      state.levels = { lift: 0, diesel: 0, ski: 0 };
    };

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
    const distance2D = (ax, ay, bx, by) => {
      const dx = ax - bx;
      const dy = ay - by;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const distanceToSegment = (px, py, ax, ay, bx, by) => {
      const abx = bx - ax;
      const aby = by - ay;
      const apx = px - ax;
      const apy = py - ay;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq <= 0.0001) return distance2D(px, py, ax, ay);
      const t = clamp01((apx * abx + apy * aby) / abLenSq);
      return distance2D(px, py, ax + abx * t, ay + aby * t);
    };
    const attenuation = (distance, near = 3.5, far = 42) => {
      if (!Number.isFinite(distance)) return 0;
      if (distance <= near) return 1;
      if (distance >= far) return 0;
      const t = 1 - ((distance - near) / (far - near));
      return Math.pow(clamp01(t), 2.8);
    };

    const playMusicTone = (ctx, bus, midi, durationSec, type = 'triangle', peak = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      osc.type = type;
      osc.frequency.value = midiToFreq(midi);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(bus);

      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
      osc.start(t0);
      osc.stop(t0 + durationSec + 0.03);
    };

    const playSkierShout = (ctx, shoutBus, intensity = 0.35) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 7;
      bp.frequency.value = 1100 + Math.random() * 700;
      osc.type = 'triangle';
      const base = 450 + Math.random() * 340;
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(180, base * 0.62), now + 0.24);

      osc.connect(bp);
      bp.connect(gain);
      gain.connect(shoutBus);

      const peak = 0.006 + intensity * 0.018;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.31);
    };

    const getCameraWorld = () => {
      const scene = audioSceneRef.current;
      const hm = scene.worldData?.heightmap || null;
      const snappedRot = ((((Math.round((scene.rotation || 0) / 90) * 90) % 360) + 360) % 360);
      const center = screenToIso(
        window.innerWidth * 0.5,
        window.innerHeight * 0.5,
        scene.scale || 1,
        scene.offset?.x || 0,
        scene.offset?.y || 0,
        snappedRot,
        GRID_SIZE,
        hm
      );
      return {
        x: Math.max(0, Math.min(GRID_SIZE - 1, center?.x ?? 0)),
        y: Math.max(0, Math.min(GRID_SIZE - 1, center?.y ?? 0))
      };
    };

    const updateSpatialMix = () => {
      if (!state.started || !state.ctx || !state.nodes) return;
      const cam = getCameraWorld();
      const now = state.ctx.currentTime;

      let liftRaw = 0;
      for (const lift of resortManager?.lifts || []) {
        const start = lift?.startTile || lift?.start;
        const end = lift?.endTile || lift?.end;
        if (!start || !end) continue;
        const dist = distanceToSegment(cam.x, cam.y, start.x + 0.5, start.y + 0.5, end.x + 0.5, end.y + 0.5);
        const a = attenuation(dist, 2.5, 34);
        if (a <= 0) continue;
        const capFactor = Math.min(1.4, Math.sqrt(Math.max(1, lift?.type?.capacity || 1)) / 4);
        const speedFactor = Math.max(0.7, Math.min(2.0, lift?.speedMultiplier || 1));
        liftRaw += a * capFactor * speedFactor;
      }
      const liftTarget = clamp01(1 - Math.exp(-liftRaw * 0.4));
      state.levels.lift = state.levels.lift * 0.72 + liftTarget * 0.28;

      let dieselRaw = 0;
      for (const bully of resortManager?.pistenbullies || []) {
        if (!bully || bully.state === 'GARAGE') continue;
        const dist = distance2D(cam.x, cam.y, bully.x || 0, bully.y || 0);
        const a = attenuation(dist, 2.5, 28);
        if (a <= 0) continue;
        const activeBoost = bully.state === 'GROOMING' ? 1.25 : 0.9;
        dieselRaw += a * activeBoost;
      }
      const dieselTarget = clamp01(1 - Math.exp(-dieselRaw * 0.5));
      state.levels.diesel = state.levels.diesel * 0.68 + dieselTarget * 0.32;

      let skiRaw = 0;
      for (const guest of resortManager?.guests || []) {
        if (!guest || guest.shouldRemove || guest.state !== 'SKIING') continue;
        const dist = distance2D(cam.x, cam.y, guest.x || 0, guest.y || 0);
        const a = attenuation(dist, 2.2, 22);
        if (a <= 0) continue;
        const speed = Math.max(0.7, Math.min(3, (guest.skiSpeed || 1.5) / 1.6));
        skiRaw += a * speed;
      }
      const skiTarget = clamp01(1 - Math.exp(-skiRaw * 0.22));
      state.levels.ski = state.levels.ski * 0.7 + skiTarget * 0.3;

      const liftLevel = state.levels.lift;
      const dieselLevel = state.levels.diesel;

      state.nodes.liftGain.gain.setTargetAtTime(0.0003 + liftLevel * 0.028, now, 0.2);
      state.nodes.liftHarmGain.gain.setTargetAtTime(0.0002 + liftLevel * 0.014, now, 0.23);
      state.nodes.liftOsc.frequency.setTargetAtTime(62 + liftLevel * 26 + Math.sin(now * 1.4) * 2.2, now, 0.25);
      state.nodes.liftHarm.frequency.setTargetAtTime(124 + liftLevel * 44 + Math.sin(now * 0.9) * 3.8, now, 0.28);

      state.nodes.dieselGain.gain.setTargetAtTime(0.00025 + dieselLevel * 0.035, now, 0.16);
      state.nodes.dieselHarmGain.gain.setTargetAtTime(0.0002 + dieselLevel * 0.018, now, 0.2);
      state.nodes.dieselNoiseGain.gain.setTargetAtTime(0.0001 + dieselLevel * 0.012, now, 0.16);
      const dieselBase = 38 + dieselLevel * 18 + Math.sin(now * 2.1) * 1.6;
      state.nodes.dieselOsc.frequency.setTargetAtTime(dieselBase, now, 0.22);
      state.nodes.dieselHarm.frequency.setTargetAtTime(dieselBase * 2, now, 0.22);
    };

    const startAudio = () => {
      if (!musicEnabled || state.started || !AudioCtx) return;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = 0.13;
      master.connect(ctx.destination);

      const musicBus = ctx.createGain();
      const liftBus = ctx.createGain();
      const dieselBus = ctx.createGain();
      const shoutBus = ctx.createGain();
      musicBus.gain.value = 0.15; // generative Musik klar hörbar
      liftBus.gain.value = 0.22;   // Liftsummen dezenter
      dieselBus.gain.value = 0.2;  // Diesel dezenter
      shoutBus.gain.value = 0.55;  // Jubelschreie präsent
      musicBus.connect(master);
      liftBus.connect(master);
      dieselBus.connect(master);
      shoutBus.connect(master);

      const liftOsc = ctx.createOscillator();
      const liftHarm = ctx.createOscillator();
      const liftGain = ctx.createGain();
      const liftHarmGain = ctx.createGain();
      const liftFilter = ctx.createBiquadFilter();
      liftFilter.type = 'lowpass';
      liftFilter.frequency.value = 950;
      liftOsc.type = 'sine';
      liftHarm.type = 'triangle';
      liftOsc.frequency.value = 62;
      liftHarm.frequency.value = 124;
      liftGain.gain.value = 0.001;
      liftHarmGain.gain.value = 0.001;
      liftOsc.connect(liftGain);
      liftHarm.connect(liftHarmGain);
      liftGain.connect(liftFilter);
      liftHarmGain.connect(liftFilter);
      liftFilter.connect(liftBus);
      liftOsc.start();
      liftHarm.start();

      const dieselOsc = ctx.createOscillator();
      const dieselHarm = ctx.createOscillator();
      const dieselGain = ctx.createGain();
      const dieselHarmGain = ctx.createGain();
      const dieselNoiseGain = ctx.createGain();
      const dieselFilter = ctx.createBiquadFilter();
      const noiseFilter = ctx.createBiquadFilter();
      dieselFilter.type = 'lowpass';
      dieselFilter.frequency.value = 380;
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 210;
      dieselOsc.type = 'sawtooth';
      dieselHarm.type = 'square';
      dieselOsc.frequency.value = 40;
      dieselHarm.frequency.value = 80;
      dieselGain.gain.value = 0.001;
      dieselHarmGain.gain.value = 0.001;
      dieselNoiseGain.gain.value = 0.001;

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * 0.55;
      const dieselNoise = ctx.createBufferSource();
      dieselNoise.buffer = noiseBuffer;
      dieselNoise.loop = true;

      dieselOsc.connect(dieselGain);
      dieselHarm.connect(dieselHarmGain);
      dieselGain.connect(dieselFilter);
      dieselHarmGain.connect(dieselFilter);
      dieselNoise.connect(noiseFilter);
      noiseFilter.connect(dieselNoiseGain);
      dieselFilter.connect(dieselBus);
      dieselNoiseGain.connect(dieselBus);
      dieselOsc.start();
      dieselHarm.start();
      dieselNoise.start();

      state.ctx = ctx;
      state.master = master;
      state.nodes = {
        musicBus,
        shoutBus,
        liftOsc,
        liftHarm,
        liftGain,
        liftHarmGain,
        dieselOsc,
        dieselHarm,
        dieselGain,
        dieselHarmGain,
        dieselNoise,
        dieselNoiseGain
      };
      state.started = true;

      // ===== GENERATIVE AMBIENT-ENGINE (nie repetitiv) =====
      // Statt eines festen Loops: ein Zufallssystem im Stil generativer
      // Ambient-Musik (Brian Eno). Drei unabhängige Ebenen mit zufälligen,
      // sich überlagernden Zeitfenstern — die Kombination wiederholt sich
      // praktisch nie:
      //  1. Akkord-Wanderung: Random Walk durch den Quintenzirkel,
      //     jeder Akkord hält 9–20 Sekunden, weiche Pad-Flächen.
      //  2. Verstreute "Klavier"-Töne aus der Pentatonik des Akkords,
      //     zufällige Abstände (3–11 s), zufällige Oktave & Lautstärke.
      //  3. Tiefer Bordun-Bass, selten und lang.
      let chordRoot = 48;                 // Startakkord: C
      let chordIsMinor = false;
      let nextChordAt = 0;
      let nextNoteAt = 2000;
      let nextBassAt = 500;
      let lastNote = -1;

      const musicTick = () => {
        if (!state.ctx || !state.nodes?.musicBus) return;
        const now = performance.now();
        const bus = state.nodes.musicBus;

        // 1. AKKORDWECHSEL (Random Walk, ±Quinte/Terz)
        if (now >= nextChordAt) {
          const moves = [7, -7, 5, -5, 4, -4, 3, -3];
          const move = moves[Math.floor(Math.random() * moves.length)];
          // Im Bereich C3..C4 halten
          let next = chordRoot + move;
          if (next < 45) next += 12;
          if (next > 57) next -= 12;
          chordRoot = next;
          chordIsMinor = Math.random() < 0.38;

          const third = chordIsMinor ? 3 : 4;
          const dur = 14 + Math.random() * 8;
          // Weite, weiche Fläche: Grundton, Quinte, Terz+Oktave (leicht versetzt)
          playMusicTone(state.ctx, bus, chordRoot, dur, 'sine', 0.055);
          setTimeout(() => {
            if (state.nodes?.musicBus) playMusicTone(state.ctx, state.nodes.musicBus, chordRoot + 7, dur * 0.85, 'sine', 0.04);
          }, 900 + Math.random() * 1500);
          setTimeout(() => {
            if (state.nodes?.musicBus) playMusicTone(state.ctx, state.nodes.musicBus, chordRoot + 12 + third, dur * 0.7, 'sine', 0.03);
          }, 2200 + Math.random() * 2500);

          nextChordAt = now + 9000 + Math.random() * 11000;
        }

        // 2. VERSTREUTE TÖNE (Pentatonik des aktuellen Akkords)
        if (now >= nextNoteAt) {
          const penta = chordIsMinor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
          let pick;
          do {
            pick = penta[Math.floor(Math.random() * penta.length)];
          } while (pick === lastNote && Math.random() < 0.7);
          lastNote = pick;
          const octave = Math.random() < 0.3 ? 24 : 12;
          const midi = chordRoot + octave + pick;
          playMusicTone(state.ctx, bus, midi, 3 + Math.random() * 3.5, 'triangle', 0.022 + Math.random() * 0.02);
          // Gelegentliches leises Echo eine Quinte höher
          if (Math.random() < 0.25) {
            setTimeout(() => {
              if (state.nodes?.musicBus) playMusicTone(state.ctx, state.nodes.musicBus, midi + 7, 2.5, 'triangle', 0.012);
            }, 700 + Math.random() * 900);
          }
          nextNoteAt = now + 3000 + Math.random() * 8000;
        }

        // 3. BORDUN-BASS (selten, sehr tief & leise)
        if (now >= nextBassAt) {
          playMusicTone(state.ctx, bus, chordRoot - 12, 12 + Math.random() * 6, 'sine', 0.06);
          nextBassAt = now + 13000 + Math.random() * 10000;
        }
      };

      musicTick();
      state.musicTimer = setInterval(musicTick, 400);
      state.spatialTimer = setInterval(updateSpatialMix, 180);
      state.shoutTimer = setInterval(() => {
        if (!state.ctx || !state.nodes?.shoutBus) return;
        const skiLevel = state.levels.ski || 0;
        if (skiLevel <= 0.08) return;
        const probability = Math.min(0.72, 0.12 + skiLevel * 0.58);
        if (Math.random() < probability) {
          playSkierShout(state.ctx, state.nodes.shoutBus, skiLevel);
        }
      }, 360);
      updateSpatialMix();
    };

    const unlockAndStart = () => {
      state.unlocked = true;
      startAudio();
    };

    if (!musicEnabled) {
      clearAll();
      return;
    }

    if (state.unlocked) {
      startAudio();
    } else {
      window.addEventListener('pointerdown', unlockAndStart, { once: true });
    }

    return () => {
      window.removeEventListener('pointerdown', unlockAndStart);
      if (!musicEnabled) clearAll();
    };
  }, [musicEnabled, resortManager]);

  useEffect(() => {
    return () => {
      const state = musicRef.current;
      if (state.musicTimer) clearInterval(state.musicTimer);
      if (state.spatialTimer) clearInterval(state.spatialTimer);
      if (state.shoutTimer) clearInterval(state.shoutTimer);
      state.musicTimer = null;
      state.spatialTimer = null;
      state.shoutTimer = null;
      if (state.nodes) {
        Object.values(state.nodes).forEach((node) => {
          if (!node) return;
          if (typeof node.stop === 'function') {
            try { node.stop(); } catch (_) { /* ignore */ }
          }
          if (typeof node.disconnect === 'function') {
            try { node.disconnect(); } catch (_) { /* ignore */ }
          }
        });
      }
      state.nodes = null;
      if (state.master) {
        try { state.master.disconnect(); } catch (_) { /* ignore */ }
      }
      state.master = null;
      if (state.ctx) {
        try { state.ctx.close(); } catch (_) { /* ignore */ }
      }
      state.ctx = null;
      state.started = false;
      state.levels = { lift: 0, diesel: 0, ski: 0 };
    };
  }, []);

  // Building rotation control (R key)
  React.useEffect(() => {
    const handleKeyPress = (e) => {
      // Rotation (R)
      if (e.key === 'r' || e.key === 'R') {
        if (selectedBuilding && placementMode === 'building_placing') {
          setBuildingRotation(prev => (prev + 90) % 360);
          console.log('🔄 Building rotated:', (buildingRotation + 90) % 360);
        }
      }

      // Cancellation (ESC)
      if (e.key === 'Escape') {
        console.log('🛑 Operation cancelled by user');
        // Cancel Building
        setSelectedBuilding(null);
        setPlacementMode(null);
        setBuildingRotation(0);

        // Cancel Piste
        setPistePlacementMode(null);
        setCurrentPiste(null);

        // Cancel Lift
        setSelectedLiftType(null);
        setLiftStartPoint(null);

        // Close menus
        setActiveMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedBuilding, placementMode, buildingRotation, pistePlacementMode, currentPiste, selectedLiftType, liftStartPoint]);

  // Lift Validation Helper
  const validateLiftPlacement = useCallback((startPoint, endPoint, liftType) => {
    if (!startPoint || !endPoint || !liftType) {
      return { valid: false, reason: 'Missing data' };
    }

    // Check uphill requirement
    if (endPoint.z <= startPoint.z) {
      return { valid: false, reason: 'Lift muss bergauf führen!' };
    }

    // Calculate lift statistics
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const horizontalDist = Math.sqrt(dx * dx + dy * dy);
    const totalLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const lengthInMeters = totalLength * 20;
    const avgSlope = (dz / (horizontalDist * 20)) * 100; // Convert to percentage

    // Calculate cost (with safety)
    const baseCost = liftType?.cost || 0;
    const costPerTenMeters = liftType?.costPer10m || 0;
    const totalCost = baseCost + Math.ceil(lengthInMeters / 10) * costPerTenMeters;

    // Validate slope constraint
    if (liftType.maxSlope && avgSlope > liftType.maxSlope) {
      return { valid: false, reason: `Zu steil! ${avgSlope.toFixed(1)}% > ${liftType.maxSlope}%`, lengthInMeters, totalCost };
    }

    // Validate length constraint
    if (liftType.maxLength && totalLength > liftType.maxLength) {
      return { valid: false, reason: `Zu lang! ${totalLength.toFixed(0)}m > ${liftType.maxLength}m`, lengthInMeters, totalCost };
    }

    return { valid: true, lengthInMeters, totalCost };
  }, []);

  // Keep manager lift list in sync with rendered lifts (important for older sessions/lifts).
  useEffect(() => {
    const known = new Set((resortManager.lifts || []).map(l => l.id));
    const missing = placedLifts.filter(l => !known.has(l.id));
    if (missing.length > 0) {
      missing.forEach(l => {
        const managerLift = new Lift(l.id, l.type, l.start, l.end);
        managerLift.speedMultiplier = l.speedMultiplier || 1;
        resortManager.lifts.push(managerLift);
      });
    }
    for (const l of placedLifts) {
      const managerLift = resortManager.lifts.find(ml => ml.id === l.id);
      if (managerLift) {
        managerLift.speedMultiplier = l.speedMultiplier || 1;
      }
    }
    resortManager.recalculateEnergyUsage();
  }, [placedLifts, resortManager]);

  // BÄUME RODEN: Wald unter einer neu gebauten Piste entfernen
  const clearForestForPiste = useCallback((piste) => {
    if (!piste?.segments?.length || !worldData) return;
    const radiusTiles = Math.max(1, Math.round((piste.width?.width || 40) / 40) + 1);
    const newLandcover = new Uint8Array(worldData.landcover);
    let cleared = 0;

    const clearAt = (cx, cy) => {
      for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
        for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
          if (dx * dx + dy * dy > radiusTiles * radiusTiles) continue;
          const tx = Math.round(cx) + dx;
          const ty = Math.round(cy) + dy;
          if (tx < 0 || ty < 0 || tx >= GRID_SIZE || ty >= GRID_SIZE) continue;
          const idx = ty * GRID_SIZE + tx;
          const lc = newLandcover[idx];
          if (lc === 1 || lc === 5 || lc === 6) { // Wald-Typen
            newLandcover[idx] = 0; // → Schnee
            cleared++;
          }
        }
      }
    };

    for (let i = 0; i < piste.segments.length; i++) {
      const a = piste.segments[i];
      clearAt(a.x, a.y);
      const b = piste.segments[i + 1];
      if (b) {
        // Zwischenpunkte entlang des Segments
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.ceil(dist);
        for (let sIdx = 1; sIdx < steps; sIdx++) {
          const t = sIdx / steps;
          clearAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        }
      }
    }

    if (cleared > 0) {
      setWorldData(prev => ({ ...prev, landcover: newLandcover }));
      console.log(`🪓 Piste gerodet: ${cleared} Waldkacheln entfernt`);
    }
  }, [worldData, GRID_SIZE]);

  const handlePisteDoubleClick = useCallback(() => {
    if (pistePlacementMode && currentPiste) {
      if (resortManager.completePiste(currentPiste)) {
        clearForestForPiste(currentPiste);
        setGameState(prev => ({ ...prev, money: resortManager.money }));
        setCurrentPiste(null);
        setPistePlacementMode(null);
      } else {
        alert('Nicht genug Geld zum Fertigstellen!');
      }
    }
  }, [pistePlacementMode, currentPiste, resortManager, clearForestForPiste]);

  const handleDeletePiste = useCallback((pisteId) => {
    const piste = resortManager.pistes.find((item) => item.id === pisteId);
    if (!piste) return;
    const ok = window.confirm(`Piste #${piste.number} wirklich abreissen?`);
    if (!ok) return;

    resortManager.removePiste(pisteId);
    if (selectedPiste?.id === pisteId) setSelectedPiste(null);
    setGameState(prev => ({
      ...prev,
      money: resortManager.money,
      satisfaction: resortManager.getAverageGuestSatisfaction()
    }));
  }, [resortManager, selectedPiste]);

  const handleSellLift = useCallback((liftId) => {
    const lift = resortManager.lifts.find((item) => item.id === liftId);
    if (!lift) return;
    const refund = resortManager.getLiftSellValue(liftId);
    const ok = window.confirm(`${lift.type?.name || 'Lift'} wirklich fuer €${refund.toLocaleString()} verkaufen?`);
    if (!ok) return;

    resortManager.sellLift(liftId);
    setPlacedLifts(prev => prev.filter(item => item.id !== liftId));
    setClickedLift(prev => prev?.id === liftId ? null : prev);
    setGameState(prev => ({
      ...prev,
      money: resortManager.money,
      energy: resortManager.getTotalEnergyUsage(),
      satisfaction: resortManager.getAverageGuestSatisfaction()
    }));
  }, [resortManager]);

  const handleSellBuilding = useCallback((buildingId) => {
    const building = resortManager.buildings.find((item) => item.id === buildingId);
    if (!building) return;
    const refund = resortManager.getBuildingSellValue(buildingId);
    const ok = window.confirm(`${building.type?.name || 'Gebaeude'} wirklich fuer €${refund.toLocaleString()} verkaufen?`);
    if (!ok) return;

    resortManager.sellBuilding(buildingId);
    setClickedBuilding(prev => prev?.id === buildingId ? null : prev);
    setGameState(prev => ({
      ...prev,
      money: resortManager.money,
      satisfaction: resortManager.getAverageGuestSatisfaction()
    }));
  }, [resortManager]);

  const handleSelectTile = useCallback((x, y) => {
    if (!worldData) return;
    if (selectedGuest) setSelectedGuest(null);
    const { heightmap } = worldData;
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return;

    const z = heightmap[y * GRID_SIZE + x];

    // WATER TOOL MODE
    if (selectedBuilding?.isWaterTool) {
      if (!resortManager.canAfford(selectedBuilding.cost)) {
        alert(`Nicht genug Geld! Benötigt: €${selectedBuilding.cost.toLocaleString()}`);
        return;
      }

      // 1. Lower terrain by 2m for the 2x2 water body
      // 2. Set Landcover to 2 (Water)
      // 3. Smooth surrounding tiles
      const newHeightmap = new Float32Array(heightmap);
      const newLandcover = new Uint8Array(worldData.landcover);

      const width = selectedBuilding.size.width; // 2
      const height = selectedBuilding.size.height; // 2
      const depth = 4.0;

      let targetZ;
      // Calculate average height of selection to determine target water level
      // If clicking near water, snap to it.
      let existingWaterZ = null;
      let sumLandZ = 0;
      let countLand = 0;
      let minZ = Infinity;
      let maxZ = -Infinity;

      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
            const idx = ty * GRID_SIZE + tx;
            if (worldData.landcover[idx] === 2) {
              existingWaterZ = heightmap[idx];
            } else {
              sumLandZ += heightmap[idx];
              countLand++;
            }
            if (heightmap[idx] < minZ) minZ = heightmap[idx];
            if (heightmap[idx] > maxZ) maxZ = heightmap[idx];
          }
        }
      }

      // Slope Check: 5% tolerance (approx 0.8 units difference across 2 tiles)
      if (maxZ - minZ > 0.8 && existingWaterZ === null) {
        alert("Zu steil für Wasser! Bitte flacheres Gelände suchen (Max 5% Gefälle).");
        return;
      }

      if (existingWaterZ !== null) {
        targetZ = existingWaterZ;
      } else if (countLand > 0) {
        targetZ = (sumLandZ / countLand) - depth;
      } else {
        targetZ = heightmap[y * GRID_SIZE + x] - depth;
      }

      // Center modification loop
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
            const idx = ty * GRID_SIZE + tx;
            newHeightmap[idx] = targetZ; // Flatten to target level
            newLandcover[idx] = 2;      // Water type
          }
        }
      }

      // Smoothing Pass (Radius 3 around the water)
      // We want to create slopes towards the water
      const smoothRadius = 1;
      for (let pass = 0; pass < 2; pass++) { // 2 Passes for better results
        const tempHeightmap = new Float32Array(newHeightmap);

        for (let dy = -smoothRadius; dy < height + smoothRadius; dy++) {
          for (let dx = -smoothRadius; dx < width + smoothRadius; dx++) {
            // Skip the water itself (don't smooth the bottom up yet, keep it deep)
            if (dx >= 0 && dx < width && dy >= 0 && dy < height) continue;

            const tx = x + dx;
            const ty = y + dy;

            if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
              const idx = ty * GRID_SIZE + tx;
              // Simple average with neighbors
              let sum = 0;
              let count = 0;
              for (let ny = -1; ny <= 1; ny++) {
                for (let nx = -1; nx <= 1; nx++) {
                  const ntx = tx + nx;
                  const nty = ty + ny;
                  if (ntx >= 0 && ntx < GRID_SIZE && nty >= 0 && nty < GRID_SIZE) {
                    sum += tempHeightmap[nty * GRID_SIZE + ntx];
                    count++;
                  }
                }
              }
              newHeightmap[idx] = sum / count;

              // Force Rock texture on the bank (Shore)
              if (newLandcover[idx] !== 2) {
                newLandcover[idx] = 3; // Rock ID
                // Add rugged noise for detail (only on pass 1)
                if (pass === 1) {
                  newHeightmap[idx] += (Math.random() - 0.5) * 0.8;
                }
              }
            }
          }
        }
      }

      setWorldData({ ...worldData, heightmap: newHeightmap, landcover: newLandcover });
      resortManager.spend(selectedBuilding.cost);
      setGameState(prev => ({ ...prev, money: resortManager.money }));
      return;
    }

    // FOREST TOOL MODE
    if (selectedBuilding?.isForestTool) {
      if (!resortManager.canAfford(selectedBuilding.cost)) {
        alert(`Nicht genug Geld! Benötigt: €${selectedBuilding.cost.toLocaleString()}`);
        return;
      }

      const forestType = selectedBuilding.forestType || 1;
      const brushSize = selectedBuilding.size.width || 3;
      const radius = brushSize / 2;
      const newLandcover = new Uint8Array(worldData.landcover);

      let treesPlanted = 0;

      for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
        for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
          const tx = x + dx;
          const ty = y + dy;

          if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
              const idx = ty * GRID_SIZE + tx;
              // Only plant if not already this type? Or overwrite? Overwrite is fine.
              // Avoid planting on water? (If landcover 2 is water, need to check).
              // Assuming landcover 0 is empty/snow. 
              newLandcover[idx] = forestType;
              treesPlanted++;
            }
          }
        }
      }

      setWorldData({ ...worldData, landcover: newLandcover });
      resortManager.spend(selectedBuilding.cost);
      setGameState(prev => ({ ...prev, money: resortManager.money }));
      console.log(`🌲 Forest planted: Type ${forestType}, ${treesPlanted} trees`);
      return;
    }

    // TERRAIN TOOL MODE - Handle separately (no slope validation)
    if (selectedBuilding?.isTerrainTool) {
      const toolType = selectedBuilding.toolType;
      const toolSize = selectedBuilding.toolSize;
      const coreRadius = toolSize / 2; // Core becomes perfectly flat
      const smoothRadius = coreRadius + 10; // Large smoothing ring for very smooth transitions

      // Check money
      if (!resortManager.canAfford(selectedBuilding.cost)) {
        alert(`Nicht genug Geld! Benötigt: €${selectedBuilding.cost.toLocaleString()}`);
        return;
      }

      const newHeightmap = new Float32Array(heightmap);
      const centerHeight = heightmap[y * GRID_SIZE + x];

      // Calculate target height based on tool type
      let targetHeight;
      if (toolType === 'flatten') {
        targetHeight = centerHeight;
      } else if (toolType === 'dig') {
        targetHeight = centerHeight - 2; // Lower by 2 units
      } else if (toolType === 'raise') {
        targetHeight = centerHeight + 2; // Raise by 2 units
      } else if (toolType === 'smooth') {
        // Smoothing: average surrounding heights to preserve slope but remove roughness
        const radius = toolSize / 2;
        const newHeightmap = new Float32Array(heightmap);

        // Multi-pass smoothing for better results
        for (let pass = 0; pass < 3; pass++) {
          const tempMap = new Float32Array(newHeightmap);
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const tx = x + dx;
              const ty = y + dy;
              if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                  // Average with neighbors
                  let sum = 0;
                  let count = 0;
                  for (let ndy = -1; ndy <= 1; ndy++) {
                    for (let ndx = -1; ndx <= 1; ndx++) {
                      const ntx = tx + ndx;
                      const nty = ty + ndy;
                      if (ntx >= 0 && ntx < GRID_SIZE && nty >= 0 && nty < GRID_SIZE) {
                        sum += tempMap[nty * GRID_SIZE + ntx];
                        count++;
                      }
                    }
                  }
                  newHeightmap[ty * GRID_SIZE + tx] = sum / count;
                }
              }
            }
          }
        }

        setWorldData({ ...worldData, heightmap: newHeightmap });
        resortManager.spend(selectedBuilding.cost);
      setGameState(prev => ({ ...prev, money: resortManager.money }));
        console.log(`〰️ Terrain smoothed: ${toolSize}x${toolSize}`);
        return;
      } else if (toolType === 'pull') {
        // Pull: Gradually raise terrain towards center point
        const radius = toolSize / 2;
        const pullStrength = 3; // How much to raise at center
        const newHeightmap = new Float32Array(heightmap);

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= radius) {
                // Smooth falloff from center to edge (higher exponent = softer edges)
                const normalizedDist = dist / radius;
                const weight = Math.exp(-6 * normalizedDist * normalizedDist);
                const idx = ty * GRID_SIZE + tx;
                newHeightmap[idx] = heightmap[idx] + (pullStrength * weight);
              }
            }
          }
        }

        setWorldData({ ...worldData, heightmap: newHeightmap });
        resortManager.spend(selectedBuilding.cost);
      setGameState(prev => ({ ...prev, money: resortManager.money }));
        console.log(`📈 Terrain pulled up: ${toolSize}x${toolSize}`);
        return;
      } else if (toolType === 'push') {
        // Push: Gradually lower terrain from center point
        const radius = toolSize / 2;
        const pushStrength = -3; // Negative to lower
        const newHeightmap = new Float32Array(heightmap);

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= radius) {
                const normalizedDist = dist / radius;
                const weight = Math.exp(-6 * normalizedDist * normalizedDist);
                const idx = ty * GRID_SIZE + tx;
                newHeightmap[idx] = heightmap[idx] + (pushStrength * weight);
              }
            }
          }
        }

        setWorldData({ ...worldData, heightmap: newHeightmap });
        resortManager.spend(selectedBuilding.cost);
      setGameState(prev => ({ ...prev, money: resortManager.money }));
        console.log(`📉 Terrain pushed down: ${toolSize}x${toolSize}`);
        return;
      }

      // Apply in two phases: core (flat) + smoothing ring
      for (let dy = -smoothRadius; dy <= smoothRadius; dy++) {
        for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            const idx = ty * GRID_SIZE + tx;

            if (dist <= coreRadius) {
              // CORE: Make completely flat
              newHeightmap[idx] = targetHeight;
            } else if (dist <= smoothRadius) {
              // SMOOTHING RING: Extra soft falloff for very smooth transitions
              const ringDist = dist - coreRadius;
              const ringWidth = smoothRadius - coreRadius;
              // Use exponent 6 for extremely gentle edges
              const normalizedDist = ringDist / ringWidth;
              const weight = Math.exp(-8 * normalizedDist * normalizedDist);
              newHeightmap[idx] = newHeightmap[idx] * (1 - weight) + targetHeight * weight;
            }
          }
        }
      }

      setWorldData({ ...worldData, heightmap: newHeightmap });
      resortManager.spend(selectedBuilding.cost);
      setGameState(prev => ({ ...prev, money: resortManager.money }));
      console.log(`⛏️ Terrain modified: ${toolType} (${toolSize}x${toolSize})`);
      return; // Exit - don't continue to building placement
    }

    // BUILDING PLACEMENT MODE
    if (selectedBuilding) {
      const result = resortManager.placeBuilding(x, y, selectedBuilding, worldData.heightmap, GRID_SIZE, worldData.landcover, buildingRotation);

      if (result && result.success) {
        console.log('✅ Building placed!', result.building);
        setGameState(prev => ({ ...prev, money: resortManager.money }));

        // CONTINUOUS MODE FOR ROADS: Keep road selected for multi-placement
        if (selectedBuilding.isRoad) {
          console.log('🛣️ Road mode: Continue placing roads');
          // Don't deselect - stay in road placement mode
        } else {
          // STANDARD BUILDING PLACEMENT (Applies to Stausee, Huts, Stations, Snow Cannons, etc.)

          // Check if building should flatten terrain (Default: true, except for Snow Cannons etc.)
          const shouldFlatten = selectedBuilding.autoFlatten !== false;

          let newHeightmap = null;

          if (shouldFlatten) {
            console.log('🏗️ Building placed: Auto-flattening terrain...');
            /* 1. AUTO-FLATTEN TERRAIN (Logic from Stausee) */
            const bRot = buildingRotation || 0;
            const isRotated = bRot === 90 || bRot === 270;
            const w = isRotated ? selectedBuilding.size.height : selectedBuilding.size.width;
            const h = isRotated ? selectedBuilding.size.width : selectedBuilding.size.height;

            // Calculate Max Height (To create a Plateau)
            let maxH = -9999;
            for (let dx = 0; dx < w; dx++) {
              for (let dy = 0; dy < h; dy++) {
                const idx = (y + dy) * GRID_SIZE + (x + dx);
                if (idx < worldData.heightmap.length) {
                  const hVal = worldData.heightmap[idx];
                  if (hVal > maxH) maxH = hVal;
                }
              }
            }
            const targetH = maxH > -9999 ? maxH : 0;

            newHeightmap = new Float32Array(worldData.heightmap);

            // Padding settings:
            const flatPadding = 1; // Pure flat ground
            const fadePadding = 2; // Smooth transition zone
            const totalPadding = flatPadding + fadePadding;

            // Flatten Core + Smoothing Ring
            for (let dx = -totalPadding; dx < w + totalPadding; dx++) {
              for (let dy = -totalPadding; dy < h + totalPadding; dy++) {
                const tx = x + dx;
                const ty = y + dy;

                if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
                  const idx = ty * GRID_SIZE + tx;

                  // Calculate distance to "Building Core Rectangle"
                  let distX = 0;
                  if (dx < 0) distX = -dx;
                  else if (dx >= w) distX = dx - (w - 1);

                  let distY = 0;
                  if (dy < 0) distY = -dy;
                  else if (dy >= h) distY = dy - (h - 1);

                  // Chebyshev distance
                  const dist = Math.max(distX, distY);

                  if (dist <= flatPadding) {
                    newHeightmap[idx] = targetH;
                  } else if (dist <= totalPadding) {
                    const t = (dist - flatPadding) / fadePadding; // 0..1
                    const originalH = worldData.heightmap[idx];
                    const smoothH = targetH * (1 - t) + originalH * t;
                    newHeightmap[idx] = smoothH;
                  }
                }
              }
            }
            setWorldData(prev => ({ ...prev, heightmap: newHeightmap }));
          } else {
            console.log('❄️ Building placed without flattening (Snow Cannon etc.)');
          }

          // 2. SNOW CANNON SPECIAL (Clear Forest)
          if (selectedBuilding.isSnowCannon) {
            const radius = selectedBuilding.snowRadius || 10;
            const newLandcover = new Uint8Array(worldData.landcover);
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dy = -radius; dy <= radius; dy++) {
                const tx = x + dx;
                const ty = y + dy;
                if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                  if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
                    const idx = ty * GRID_SIZE + tx;
                    if (newLandcover[idx] === 1) newLandcover[idx] = 0;
                  }
                }
              }
            }
            // If heightmap was also updated, we need to be careful with React state batching
            // It's safer to use a functional update that might receive the PREVIOUSLY queued heightmap update
            setWorldData(prev => ({ ...prev, landcover: newLandcover }));
            console.log(`❄️ Snow cannon placed! Cleared forest in radius ${radius}`);
          }

          // 3. EXIT PLACEMENT MODE
          setSelectedBuilding(null);
          setPlacementMode(null);
          setActiveMenu(null);
          setBuildingRotation(0);
        }

      } else {
        console.warn('❌ Cannot place building:', result.reason);
        alert(result.reason);
      }
      return;
    }

    // PISTE PLACEMENT MODE
    if (pistePlacementMode) {
      if (!currentPiste) {
        // Start new piste
        const newPiste = resortManager.createPiste(pistePlacementMode);
        const result = resortManager.addPisteSegment(newPiste, x + 0.5, y + 0.5, z, worldData.heightmap, GRID_SIZE);

        if (result && result.success) {
          setCurrentPiste(newPiste);
        } else {
          console.warn('❌ Cannot start piste here:', result?.reason || 'Unknown error');
          return;
        }

        // Clear forest at start point
        const clearRadius = Math.ceil(pistePlacementMode.width / 20);
        const newLandcover = new Uint8Array(worldData.landcover);
        for (let dx = -clearRadius; dx <= clearRadius; dx++) {
          for (let dy = -clearRadius; dy <= clearRadius; dy++) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
              const idx = ty * GRID_SIZE + tx;
              // FIXED: Forest is type 1, not type 3 (which is rock)
              if (newLandcover[idx] === 1) {
                newLandcover[idx] = 0;  // Change to snow
              }
            }
          }
        }
        setWorldData({ ...worldData, landcover: newLandcover });
      } else {
        // Add segment to current piste
        const lastSeg = currentPiste.segments[currentPiste.segments.length - 1];
        const distance = Math.sqrt((x + 0.5 - lastSeg.x) ** 2 + (y + 0.5 - lastSeg.y) ** 2);

        // Only add if moved ~1 tile distance
        if (distance >= 1) {
          const result = resortManager.addPisteSegment(currentPiste, x + 0.5, y + 0.5, z, worldData.heightmap, GRID_SIZE);
          if (result && result.success) {
            setCurrentPiste({ ...currentPiste }); // Force re-render
          } else {
            console.warn(result?.reason);
            return; // Don't proceed with forest clearing if segment failed
          }

          // Clear forest along entire path from last to current
          const clearRadius = Math.ceil(pistePlacementMode.width / 20);
          const steps = Math.ceil(distance);
          const newLandcover = new Uint8Array(worldData.landcover);

          for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            const ix = Math.round(lastSeg.x + (x - lastSeg.x) * t);
            const iy = Math.round(lastSeg.y + (y - lastSeg.y) * t);

            for (let dx = -clearRadius; dx <= clearRadius; dx++) {
              for (let dy = -clearRadius; dy <= clearRadius; dy++) {
                const tx = ix + dx;
                const ty = iy + dy;
                if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
                  const idx = ty * GRID_SIZE + tx;
                  // FIXED: Forest is type 1, not type 3 (which is rock)
                  if (newLandcover[idx] === 1) {
                    newLandcover[idx] = 0;  // Change to snow
                  }
                }
              }
            }
          }
          setWorldData({ ...worldData, landcover: newLandcover });
        }
      }
      return;
    }

    // Lift Placement Logic
    if (placementMode === 'lift_placing' && selectedLiftType) {
      console.log('🚡 Lift placement mode active', { liftStartPoint, x, y, z });

      if (!liftStartPoint) {
        // First click: set start point
        console.log('✅ Setting start point', { x, y, z });
        setLiftStartPoint({ x, y, z });
        return;
      } else {
        // Second click: create lift
        console.log('🎯 Creating lift', { start: liftStartPoint, end: { x, y, z } });
        const endPoint = { x, y, z };

        // Validate placement
        const validation = validateLiftPlacement(liftStartPoint, endPoint, selectedLiftType);
        if (!validation.valid) {
          console.warn('❌ Cannot place lift:', validation.reason);
          alert(validation.reason);
          return;
        }

        // Calculate cable length and total cost (with safety checks)
        const dx = endPoint.x - liftStartPoint.x;
        const dy = endPoint.y - liftStartPoint.y;
        const dz = endPoint.z - liftStartPoint.z;
        const cableLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const lengthInMeters = cableLength * 20; // Each tile = 20m

        // Safe cost calculation with fallback
        const baseCost = selectedLiftType?.cost || 0;
        const costPerTenMeters = selectedLiftType?.costPer10m || 0;
        const totalCost = baseCost + Math.ceil(lengthInMeters / 10) * costPerTenMeters;

        console.log(`💰 Lift: ${lengthInMeters.toFixed(0)}m = €${totalCost.toLocaleString()}`);

        // Check money
        if (!resortManager.canAfford(totalCost)) {
          console.warn('❌ Not enough money!');
          alert(`Nicht genug Geld! Benötigt: €${totalCost.toLocaleString()}`);
          return;
        }

        // Create lift
        const liftId = Date.now() + Math.floor(Math.random() * 1000);
        const newLift = {
          id: liftId,
          type: selectedLiftType,
          start: liftStartPoint,
          end: endPoint,
          speedMultiplier: 1
        };

        console.log('✅ Lift created!', newLift);
        setPlacedLifts(prev => [...prev, newLift]);
        const managerLift = new Lift(liftId, selectedLiftType, liftStartPoint, endPoint);
        managerLift.speedMultiplier = 1;
        resortManager.lifts.push(managerLift);
        resortManager.recalculateEnergyUsage();
        resortManager.spend(totalCost, true);
        setGameState(prev => ({ ...prev, money: resortManager.money }));

        // Reset placement
        setLiftStartPoint(null);
        setPlacementMode(null);
        setActiveMenu(null);
        setLiftPreviewValidation(null);
        return;
      }
    }
    const zR = x < GRID_SIZE - 1 ? heightmap[y * GRID_SIZE + (x + 1)] : z;
    const zL = x > 0 ? heightmap[y * GRID_SIZE + (x - 1)] : z;
    const zU = y > 0 ? heightmap[(y - 1) * GRID_SIZE + x] : z;
    const zD = y < GRID_SIZE - 1 ? heightmap[(y + 1) * GRID_SIZE + x] : z;

    const maxDelta = Math.max(Math.abs(z - zR), Math.abs(z - zL), Math.abs(z - zU), Math.abs(z - zD));
    const slopeValue = Math.round(maxDelta * 12);
    const heightValue = Math.round(z);

    const type = worldData.landcover[y * GRID_SIZE + x];

    // setSelectedTile({ x, y, z: heightValue, slope: slopeValue, type });
    console.log('Selected tile:', { x, y, z: heightValue, slope: slopeValue, type });
  }, [worldData, placementMode, selectedLiftType, liftStartPoint, gameState.money, pistePlacementMode, currentPiste, resortManager, selectedBuilding, buildingRotation, validateLiftPlacement, selectedGuest]);

  // Update lift preview validation when hovering during lift placement
  useEffect(() => {
    if (placementMode === 'lift_placing' && liftStartPoint && hoveredTile && selectedLiftType) {
      const endPoint = {
        x: hoveredTile.x,
        y: hoveredTile.y,
        z: hoveredTile.z
      };
      const validation = validateLiftPlacement(liftStartPoint, endPoint, selectedLiftType);
      setLiftPreviewValidation(validation);
    } else {
      setLiftPreviewValidation(null);
    }
  }, [placementMode, liftStartPoint, hoveredTile, selectedLiftType, validateLiftPlacement]);


  // Move early returns AFTER all hooks to follow React rules
  if (!worldData) {
    return (
      <div style={{ color: 'red', fontSize: 30, padding: 50 }}>
        <h1>WORLD GEN ERROR</h1>
        <p>Failed to generate world data</p>
      </div>
    );
  }

  const selectedGuestCategory = selectedGuest ? GUEST_CATEGORIES[selectedGuest.categoryKey] : null;
  const selectedGuestSkin = selectedGuest ? ['#f2d3b1', '#d9a37d', '#b97a56', '#8d5a3c'][selectedGuest.id % 4] : '#f2d3b1';
  const selectedGuestHair = selectedGuest ? ['#111827', '#7c2d12', '#92400e', '#374151'][selectedGuest.id % 4] : '#111827';
  const selectedGuestMood = selectedGuest ? Math.round(selectedGuest.satisfaction || 0) : 0;
  const guestSeed = selectedGuest ? selectedGuest.id : 0;
  const guestHasGlasses = (guestSeed % 3) === 0;
  const guestHasBeard = (guestSeed % 5) === 0;
  const guestMouthStyle = guestSeed % 4;
  const guestEyeStyle = guestSeed % 3;
  const guestHairStyle = guestSeed % 4;
  const guestAccessory = guestSeed % 6;
  const guestFaceShape = guestSeed % 3;
  const guestHelmetStyle = guestSeed % 5;
  const clickedLiftStats = clickedLift ? resortManager.getLiftLiveStats(clickedLift.id) : null;
  const buildAdvice = getBuildAdvice(resortManager);
  const hotelBedsNeeded = (resortManager.guests || []).filter((guest) =>
    guest &&
    !guest.shouldRemove &&
    guest.hasLiftPass &&
    Math.max(guest.passDaysRemaining || 0, guest.passDuration || 0) > 1
  ).length;
  const hotelBedsAvailable = (resortManager.buildings || [])
    .filter((building) => building.type?.category === 'hotel')
    .reduce((sum, building) => sum + Math.max(0, building.type?.capacity || 0), 0);
  const weatherName = (phase) => ({
    INIT: 'Start',
    CLEAR: 'Klar',
    SNOW: 'Schnee',
    FOG: 'Nebel',
    SUN: 'Sonne'
  }[phase] || phase);
  const hudStats = [
    { key: 'money', icon: 'money', label: 'Budget', value: `€${gameState.money.toLocaleString()}`, tone: 'money' },
    { key: 'day', icon: 'day', label: 'Tag', value: `${gameState.day}`, tone: 'day' },
    { key: 'guests', icon: 'guests', label: 'Gaeste', value: `${gameState.guests}`, tone: 'guests' },
    { key: 'mood', icon: 'mood', label: 'Stimmung', value: `${gameState.satisfaction}%`, tone: 'mood' },
    { key: 'energy', icon: 'energy', label: 'Energie', value: `${Math.round(gameState.energy || 0)} kW`, tone: 'energy' },
    { key: 'beds', icon: 'bed', label: 'Hotelbetten', value: `${hotelBedsNeeded} / ${hotelBedsAvailable}`, tone: 'hotel' },
    {
      key: 'weather',
      icon: 'weather',
      label: 'Vorhersage',
      value: `${weatherName(weatherHud.current)} > ${weatherName(weatherHud.next)}`,
      tone: 'weather'
    }
  ];
  const toolButtons = [
    { key: 'build', icon: 'build', label: 'Bauen', sublabel: 'Werkzeuge', active: activeMenu === 'build', onClick: () => setActiveMenu(activeMenu === 'build' ? null : 'build') },
    { key: 'lifts', icon: 'lift', label: 'Lifte', sublabel: 'Transport', active: activeMenu === 'lifts', onClick: () => setActiveMenu(activeMenu === 'lifts' ? null : 'lifts') },
    { key: 'slopes', icon: 'slope', label: 'Pisten', sublabel: 'Abfahrten', active: activeMenu === 'slopes', onClick: () => setActiveMenu(activeMenu === 'slopes' ? null : 'slopes') }
  ];
  const navButtons = [
    { key: 'rotate', icon: 'rotate', label: 'Drehen', sublabel: 'Q / E', onClick: rotate },
    { key: 'zoom-in', icon: 'zoom-in', label: 'Zoom', sublabel: 'Rein', onClick: zoomIn },
    { key: 'zoom-out', icon: 'zoom-out', label: 'Zoom', sublabel: 'Raus', onClick: zoomOut },
    { key: 'sound', icon: 'audio', label: 'Sound', sublabel: musicEnabled ? 'An' : 'Aus', onClick: () => setMusicEnabled(v => !v), muted: !musicEnabled },
    { key: 'menu', icon: 'menu', label: 'Menü', sublabel: level?.isSandbox ? 'Sandbox' : `Level ${(level?.index ?? 0) + 1}`, onClick: () => { if (window.confirm('Zurück zum Hauptmenü? Der Spielstand dieses Levels geht verloren.')) onExitToMenu(); } }
  ];

  return (
    <div className="app-container" style={{ width: '100vw', height: '100vh', background: '#0f172a' }}>

      <ErrorBoundary>
        <ErrorBoundary>
          <WorldCanvas
            gridSize={GRID_SIZE}
            onSelectTile={handleSelectTile}
            onDoubleClick={handlePisteDoubleClick}
            rotation={rotation}
            worldData={worldData}
            scale={scale}
            setScale={setScale}
            offset={offset}
            setOffset={setOffset}
            placementMode={placementMode}
            liftStartPoint={liftStartPoint}
            liftPreviewValidation={liftPreviewValidation}
            buildingValidation={buildingValidation}
            placedLifts={placedLifts}
            selectedLiftType={selectedLiftType}
            pistePlacementMode={pistePlacementMode}
            currentPiste={currentPiste}
            resort={resortManager}
            hoveredTile={hoveredTile}
            setHoveredTile={setHoveredTile}
            selectedBuilding={selectedBuilding}
            buildingRotation={buildingRotation}
            onSelectPiste={setSelectedPiste}
            onBuildingClick={(building) => {
              if (!selectedBuilding && !pistePlacementMode && !placementMode) {
                resortManager.updateBuildingEconomics(building);
                setSelectedGuest(null);
                setClickedLift(null);
                setClickedBuilding(building);
              }
            }}
            onLiftClick={(lift) => {
              if (!selectedBuilding && !pistePlacementMode && !placementMode) {
                setSelectedGuest(null);
                setClickedBuilding(null);
                const managerLift = resortManager.lifts.find(l => l.id === lift.id);
                const speedMultiplier = managerLift?.speedMultiplier || lift.speedMultiplier || 1;
                setClickedLift({ ...lift, speedMultiplier });
              }
            }}
            onGuestClick={(guest) => {
              if (!selectedBuilding && !pistePlacementMode && !placementMode) {
                setClickedBuilding(null);
                setClickedLift(null);
                setSelectedGuest(guest);
              }
            }}
            onWeatherUpdate={(weather) => {
              setWeatherHud(weather);
            }}
          />
        </ErrorBoundary>
      </ErrorBoundary>

      {/* UI Overlay */}
      <div className="game-ui">

        {/* ===== AUFGABEN-DROPDOWN (öffnet unter der HUD-Karte) ===== */}
        {(level?.objectives?.length > 0) && missionPanelOpen && (
          <div style={{
            position: 'fixed',
            left: `${Math.max(10, Math.min(window.innerWidth - 302, (missionAnchor?.x ?? window.innerWidth / 2) - 146))}px`,
            top: `${(missionAnchor?.y ?? 64) + 10}px`,
            zIndex: 1500,
            width: '292px',
            background: 'rgba(2, 6, 23, 0.95)',
            border: '1px solid rgba(148, 197, 253, 0.25)',
            borderRadius: '12px',
            color: '#e2e8f0',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            {(
              <div style={{ padding: '10px 13px 13px', maxHeight: '52vh', overflowY: 'auto' }}>
                {(missionResults.length > 0 ? missionResults : level.objectives.map(obj => ({ obj, current: 0, target: obj.target, done: false, pct: 0 }))).map((r, i) => (
                  <div key={i} style={{ marginBottom: '9px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      marginBottom: '3px',
                      color: r.done ? '#4ade80' : '#cbd5e1'
                    }}>
                      <span>{r.done ? '✓ ' : ''}{objectiveLabel(r.obj)}</span>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {formatObjectiveValue(r.obj, r.current)}
                      </span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.round(r.pct * 100)}%`,
                        height: '100%',
                        background: r.done
                          ? 'linear-gradient(90deg, #16a34a, #4ade80)'
                          : 'linear-gradient(90deg, #2563eb, #60a5fa)',
                        transition: 'width 0.6s'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== LEVEL GESCHAFFT OVERLAY ===== */}
        {levelCompleted && !completionDismissed && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 12, 25, 0.75)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              width: 'min(480px, 90vw)',
              background: 'linear-gradient(180deg, #10233d, #0a1626)',
              border: '1px solid rgba(74, 222, 128, 0.4)',
              borderRadius: '20px',
              padding: '36px',
              textAlign: 'center',
              color: '#fff',
              boxShadow: '0 20px 80px rgba(34, 197, 94, 0.25)'
            }}>
              <div style={{ fontSize: '56px', marginBottom: '8px' }}>🏆</div>
              <h1 style={{ margin: '0 0 6px', fontSize: '30px', letterSpacing: '2px' }}>LEVEL GESCHAFFT!</h1>
              <p style={{ color: '#93c5fd', margin: '0 0 4px', fontSize: '16px' }}>
                {level.flag} {level.name} · {level.country}
              </p>
              <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>
                Alle {level.objectives.length} Aufgaben erfüllt!
                {(level.index ?? 0) < CAMPAIGN_LEVELS.length - 1
                  ? ` Das nächste Land ist jetzt freigeschaltet: ${CAMPAIGN_LEVELS[(level.index ?? 0) + 1].flag} ${CAMPAIGN_LEVELS[(level.index ?? 0) + 1].name}.`
                  : ' Du hast die komplette Weltreise gemeistert — Glückwunsch!'}
              </p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => setCompletionDismissed(true)}
                  style={{
                    flex: 1,
                    padding: '13px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#e2e8f0',
                    fontSize: '15px',
                    cursor: 'pointer'
                  }}
                >Weiterspielen</button>
                <button
                  onClick={onExitToMenu}
                  style={{
                    flex: 1,
                    padding: '13px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >Zum Hauptmenü ▸</button>
              </div>
            </div>
          </div>
        )}

        {/* Building Info Panel */}
        {clickedBuilding && !clickedBuilding.type.isRoad && (
          <div className="building-info-panel glass" style={{
            position: 'fixed',
            left: '20px',
            top: '80px',
            width: '320px',
            padding: '20px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 1000,
            color: '#fff'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px' }}>{clickedBuilding.type.icon}</span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{clickedBuilding.type.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{clickedBuilding.type.category}</div>
                </div>
              </div>
              <button
                onClick={() => setClickedBuilding(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
              >✕</button>
            </div>

            {/* General Building Stats (Occupancy, Maintenance) - Hide for Ticket Office if confusing */}
            {/* General Building Stats (Occupancy, Maintenance) - Hide for Ticket Office if confusing */}
            {!clickedBuilding.type.isTicketOffice && !['parking_lot', 'parking_garage', 'bus_stop'].includes(clickedBuilding.type.id) && (
              <div style={{ marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Belegung:</span>
                  <span style={{ fontWeight: 'bold' }}>{clickedBuilding.currentOccupancy} / {clickedBuilding.type.capacity || 50}</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(clickedBuilding.currentOccupancy / (clickedBuilding.type.capacity || 50)) * 100}%`,
                    height: '100%',
                    background: '#3b82f6',
                    transition: 'width 0.3s'
                  }}></div>
                </div>
              </div>
            )}

            {/* Parking Lot Specific Info (Lots, Garages, Bus Stops) */}
            {['parking_lot', 'parking_garage', 'bus_stop'].includes(clickedBuilding.type.id) && (() => {
              const occupancy = resortManager.getParkingOccupancy(clickedBuilding);
              return occupancy && (
                <div style={{ marginBottom: '15px', background: 'rgba(59, 130, 246, 0.2)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🅿️ Parkplatz-Auslastung
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span>Belegte Plätze:</span>
                    <span style={{ fontWeight: 'bold' }}>{occupancy.occupied} / {occupancy.total}</span>
                  </div>
                  <div style={{ height: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{
                      width: `${occupancy.percentage}%`,
                      height: '100%',
                      background: occupancy.percentage > 80 ? '#ef4444' : occupancy.percentage > 50 ? '#f59e0b' : '#22c55e',
                      transition: 'width 0.3s, background 0.3s'
                    }}></div>
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.9, textAlign: 'center' }}>
                    {occupancy.percentage}% belegt
                  </div>
                </div>
              );
            })()}


            {/* Financials */}
            {/* Financials - Hide for Ticket Office to keep it clean */}
            {!clickedBuilding.type.isTicketOffice && (
              <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8' }}>🔧 Unterhaltskosten</span>
                  <span style={{ color: '#f87171' }}>-€{clickedBuilding.maintenanceCost.toLocaleString()}/Mo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8' }}>💵 Einnahmen</span>
                  <span style={{ color: '#4ade80' }}>+€{clickedBuilding.monthlyRevenue.toLocaleString()}/Mo</span>
                </div>
                <div style={{ borderTop: '1px solid #334155', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'bold' }}>📈 Gewinn</span>
                  <span style={{ fontWeight: 'bold', color: clickedBuilding.monthlyProfit >= 0 ? '#22c55e' : '#ef4444' }}>
                    {clickedBuilding.monthlyProfit >= 0 ? '+' : ''}€{clickedBuilding.monthlyProfit.toLocaleString()}/Mo
                  </span>
                </div>
              </div>
            )}

            {/* Price Slider - Hidden for PISTEN category except Ticket Office */}
            {!clickedBuilding.type.isTicketOffice && clickedBuilding.type.category !== 'pisten' && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>🏷️ {
                    clickedBuilding.type.category === 'gastronomy' ? 'Mittl. Speisenpreis' :
                      clickedBuilding.type.category === 'tourism' ? 'Eintrittspreis' :
                        clickedBuilding.type.category === 'hotel' ? 'Zimmerpreis/Nacht' :
                          clickedBuilding.type.id === 'ski_school' ? 'Kursgebühr' :
                            clickedBuilding.type.id === 'skiverleih' ? 'Leihgebühr/Tag' :
                              clickedBuilding.type.category === 'shop' ? 'Preisniveau' :
                                'Tagesparkschein'
                  }</span>
                  <span style={{ fontWeight: 'bold' }}>
                    €{(clickedBuilding.customPrice !== null ? clickedBuilding.customPrice : (clickedBuilding.type.basePrice || clickedBuilding.basePrice))}
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.round((clickedBuilding.type.basePrice || clickedBuilding.basePrice) * 0.5)}
                  max={Math.round((clickedBuilding.type.basePrice || clickedBuilding.basePrice) * 2)}
                  value={clickedBuilding.customPrice !== null ? clickedBuilding.customPrice : (clickedBuilding.type.basePrice || clickedBuilding.basePrice)}
                  onChange={(e) => {
                    const newPrice = parseInt(e.target.value);
                    resortManager.setBuildingPrice(clickedBuilding.id, newPrice);
                    setClickedBuilding({ ...clickedBuilding, customPrice: newPrice });
                  }}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.8 }}>
                  <span>€{Math.round((clickedBuilding.type.basePrice || clickedBuilding.basePrice) * 0.5)}</span>
                  <span>Normal</span>
                  <span>€{Math.round((clickedBuilding.type.basePrice || clickedBuilding.basePrice) * 2)}</span>
                </div>
              </div>
            )}

            {/* Guest Appeal - Dynamic based on price (Hidden for Ticket Office) */}
            {!clickedBuilding.type.isTicketOffice && (
              <div>
                <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>👥 Gäste-Attraktivität</div>
                {Object.entries(GUEST_CATEGORIES).map(([key, category]) => {
                  const baseAppeal = category.preferences[clickedBuilding.type.id] || 0.5;
                  const currentPrice = clickedBuilding.customPrice !== null ? clickedBuilding.customPrice : clickedBuilding.basePrice;
                  const priceRatio = currentPrice / clickedBuilding.basePrice;
                  // Adjust appeal based on price expectations
                  // Low-budget guests lose interest fast when prices rise
                  // Luxury guests don't care as much about price
                  const priceSensitivity = 1.5 - category.priceMultiplier; // 0.8 for low budget, 0 for luxury
                  const priceEffect = Math.max(0.3, Math.min(1.3, 1 - (priceRatio - 1) * priceSensitivity));
                  const adjustedAppeal = Math.min(1, baseAppeal * priceEffect);

                  return (
                    <div key={key} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                        <span>{category.icon} {category.name}</span>
                        <span style={{
                          color: adjustedAppeal > baseAppeal ? '#22c55e' : adjustedAppeal < baseAppeal ? '#f87171' : category.color
                        }}>
                          {Math.round(adjustedAppeal * 100)}%
                          {adjustedAppeal !== baseAppeal && (
                            <span style={{ fontSize: '10px', marginLeft: '4px' }}>
                              ({adjustedAppeal > baseAppeal ? '↑' : '↓'})
                            </span>
                          )}
                        </span>
                      </div>
                      <div style={{ background: '#1e293b', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${adjustedAppeal * 100}%`,
                          height: '100%',
                          background: adjustedAppeal > baseAppeal ? '#22c55e' : adjustedAppeal < baseAppeal ? '#f87171' : category.color,
                          transition: 'width 0.3s'
                        }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ticket Office - Ski Pass Pricing & Global Costs */}
            {clickedBuilding.type.isTicketOffice && (
              <div style={{
                marginTop: '15px',
                padding: '12px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                borderRadius: '8px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                  <span>🎿 Resort Finanzen & Skipass</span>
                  <button
                    onClick={() => setShowStats(true)}
                    style={{
                      background: '#3b82f6',
                      border: 'none',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    📊 Detail-Statistik
                  </button>
                </div>

                <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '15px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                  Hier kannst du den zentralen Skipass-Preis festlegen. Dieser beeinflusst massgeblich, welche Gästegruppen dein Skigebiet besuchen.
                </div>

                {/* Ski Pass Price Slider */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span>Skipass Tagespreis:</span>
                    <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
                      €{resortManager.getSkiPassPrice()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.round(resortManager.baseSkiPassPrice * 0.5)}
                    max={Math.round(resortManager.baseSkiPassPrice * 2)}
                    value={resortManager.getSkiPassPrice()}
                    onChange={(e) => {
                      const newPrice = parseInt(e.target.value);
                      resortManager.setSkiPassPrice(newPrice);
                      // Force re-render
                      setClickedBuilding({ ...clickedBuilding });
                    }}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.8 }}>
                    <span>€{Math.round(resortManager.baseSkiPassPrice * 0.5)}</span>
                    <span>€{resortManager.baseSkiPassPrice} (Standard)</span>
                    <span>€{Math.round(resortManager.baseSkiPassPrice * 2)}</span>
                  </div>
                </div>

                {/* Guest Appeal for Global Ski Pass - DYNAMIC */}
                <div>
                  <div style={{ marginBottom: '8px', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '10px' }}>
                    📈 Einfluss auf Gäste-Zustrom
                  </div>
                  {Object.entries(GUEST_CATEGORIES).map(([key, category]) => {
                    const passPrice = resortManager.getSkiPassPrice();
                    const basePassPrice = resortManager.baseSkiPassPrice;
                    const priceRatio = passPrice / basePassPrice;

                    // Guest reaction to global price
                    const priceSensitivity = (1.5 - category.priceMultiplier) * 1.5; // Multiply by 1.5 for stronger global effect
                    const attractivenessValue = Math.max(10, Math.min(100, (1 - (priceRatio - 1) * priceSensitivity) * 100));

                    return (
                      <div key={key} style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                          <span>{category.icon} {category.name}</span>
                          <span style={{
                            fontWeight: 'bold',
                            color: attractivenessValue > 80 ? '#4ade80' : attractivenessValue < 60 ? '#fca5a5' : '#fff'
                          }}>
                            {Math.round(attractivenessValue)}%
                          </span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '3px', height: '5px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${attractivenessValue}%`,
                            height: '100%',
                            background: attractivenessValue > 80 ? '#4ade80' : attractivenessValue < 60 ? '#fca5a5' : '#fff',
                            transition: 'width 0.3s'
                          }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Info */}
                <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '8px' }}>
                  ℹ️ Nur Besucher mit Skipass können Lifte nutzen
                </div>
              </div>
            )}

            {/* Satisfaction - Hide for Ticket Office to focus on price flow */}
            {!clickedBuilding.type.isTicketOffice && (
              <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>😊 Zufriedenheit:</span>
                <span style={{
                  fontWeight: 'bold',
                  color: clickedBuilding.satisfaction >= 70 ? '#22c55e' : clickedBuilding.satisfaction >= 40 ? '#f59e0b' : '#ef4444'
                }}>
                  {clickedBuilding.satisfaction}%
                </span>
              </div>
            )}

            <button
              onClick={() => handleSellBuilding(clickedBuilding.id)}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(248, 113, 113, 0.28)',
                background: 'rgba(127, 29, 29, 0.36)',
                color: '#fee2e2',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Verkaufen fuer ${resortManager.getBuildingSellValue(clickedBuilding.id).toLocaleString()}
            </button>
          </div>
        )}

        {clickedLift && (
          <div className="lift-info-panel glass" style={{
            position: 'fixed',
            left: '20px',
            top: '80px',
            width: '320px',
            padding: '20px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 1000,
            color: '#fff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>🚠 {clickedLift.type?.name || 'Lift'}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>ID: {clickedLift.id}</div>
              </div>
              <button
                onClick={() => setClickedLift(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Auslastung:</span>
                <span style={{ fontWeight: 'bold' }}>{clickedLiftStats?.utilizationPct || 0}%</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, clickedLiftStats?.utilizationPct || 0))}%`,
                  height: '100%',
                  background: '#22c55e'
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>Warteschlange:</span>
                <span>{clickedLiftStats?.queueLength || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>Ø Wartezeit:</span>
                <span>{((clickedLiftStats?.avgWaitSec || 0) / 60).toFixed(1)} min</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                <span>Transport / h:</span>
                <span>{clickedLiftStats?.transportPerHour || 0} Pers.</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>Transport / Tag:</span>
                <span>{clickedLiftStats?.transportPerDay || 0} Pers.</span>
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>Lift-Speed</span>
                <span style={{ fontWeight: 'bold' }}>{Math.round((clickedLift.speedMultiplier || 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={220}
                value={Math.round((clickedLift.speedMultiplier || 1) * 100)}
                onChange={(e) => {
                  const mult = Math.max(0.6, Math.min(2.2, Number(e.target.value) / 100));
                  setPlacedLifts(prev => prev.map(l => l.id === clickedLift.id ? { ...l, speedMultiplier: mult } : l));
                  resortManager.setLiftSpeedMultiplier(clickedLift.id, mult);
                  setClickedLift(prev => prev ? { ...prev, speedMultiplier: mult } : prev);
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.8 }}>
                <span>60%</span>
                <span>100%</span>
                <span>220%</span>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Höhere Speed erhöht Förderleistung, aber auch globalen Energieverbrauch.
            </div>
            <button
              onClick={() => handleSellLift(clickedLift.id)}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(248, 113, 113, 0.28)',
                background: 'rgba(127, 29, 29, 0.36)',
                color: '#fee2e2',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Verkaufen fuer ${resortManager.getLiftSellValue(clickedLift.id).toLocaleString()}
            </button>
          </div>
        )}

        {/* Guest Info Panel */}
        {selectedGuest && (
          <div className="guest-info-panel glass" style={{
            position: 'fixed',
            right: '20px',
            top: '80px',
            width: '320px',
            padding: '20px',
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 1000,
            color: '#fff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '76px',
                  height: '76px',
                  borderRadius: '14px',
                  background: 'linear-gradient(180deg, #1f2937, #111827)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <svg viewBox="0 0 100 100" width="76" height="76" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id={`bgGrad-${guestSeed}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#334155" />
                        <stop offset="100%" stopColor="#0f172a" />
                      </linearGradient>
                      <linearGradient id={`jacketGrad-${guestSeed}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={selectedGuest.jacketColor || '#64748b'} />
                        <stop offset="100%" stopColor="#111827" />
                      </linearGradient>
                      <linearGradient id={`helmetGrad-${guestSeed}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={selectedGuest.helmetColor || '#94a3b8'} />
                        <stop offset="100%" stopColor="#334155" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="100" height="100" fill={`url(#bgGrad-${guestSeed})`} />
                    <path d="M0 84 Q50 70 100 84 L100 100 L0 100 Z" fill={selectedGuest.pantsColor || '#475569'} opacity="0.7" />
                    <path d="M20 68 Q50 56 80 68 L78 100 L22 100 Z" fill={`url(#jacketGrad-${guestSeed})`} />
                    <path d="M34 70 Q50 60 66 70" stroke="#e2e8f0" strokeWidth="1.4" opacity="0.5" />
                    <ellipse cx="50" cy="38" rx={guestFaceShape === 0 ? 16 : guestFaceShape === 1 ? 18 : 14} ry={guestFaceShape === 0 ? 20 : guestFaceShape === 1 ? 18 : 22} fill={selectedGuestSkin} />
                    <ellipse cx="35" cy="42" rx="2.2" ry="4.5" fill={selectedGuestSkin} opacity="0.9" />
                    <ellipse cx="65" cy="42" rx="2.2" ry="4.5" fill={selectedGuestSkin} opacity="0.9" />
                    {guestHelmetStyle === 0 && <path d="M30 28 Q50 12 70 28 L67 36 Q50 30 33 36 Z" fill={`url(#helmetGrad-${guestSeed})`} />}
                    {guestHelmetStyle === 1 && <path d="M28 30 Q50 10 72 30 L68 38 Q50 32 32 38 Z" fill={`url(#helmetGrad-${guestSeed})`} />}
                    {guestHelmetStyle === 2 && <path d="M31 24 Q50 16 69 24 L72 34 Q50 30 28 34 Z" fill={selectedGuestHair} />}
                    {guestHelmetStyle === 3 && <path d="M30 26 Q50 14 70 26 L70 34 Q50 28 30 34 Z" fill={`url(#helmetGrad-${guestSeed})`} />}
                    {guestHelmetStyle === 4 && <path d="M32 30 Q50 8 68 30 L64 36 Q50 31 36 36 Z" fill={selectedGuestHair} />}
                    {guestHelmetStyle <= 3 && <rect x="33" y="32" width="34" height="4" rx="2" fill="#0f172a" opacity="0.45" />}
                    {guestHairStyle === 0 && <path d="M33 34 Q50 24 67 34 L64 38 Q50 34 36 38 Z" fill={selectedGuestHair} />}
                    {guestHairStyle === 1 && <path d="M32 36 Q50 22 68 36 L64 40 Q50 35 36 40 Z" fill={selectedGuestHair} />}
                    {guestHairStyle === 2 && <path d="M35 33 Q50 27 65 33 L62 38 Q50 34 38 38 Z" fill={selectedGuestHair} />}
                    {guestHairStyle === 3 && <path d="M34 35 Q50 25 66 35 L63 39 Q50 35 37 39 Z" fill={selectedGuestHair} />}
                    <ellipse cx="43" cy="44" rx={guestEyeStyle === 0 ? 2.6 : 2.1} ry="2.4" fill="#0f172a" />
                    <ellipse cx="57" cy="44" rx={guestEyeStyle === 1 ? 2.7 : 2.1} ry="2.4" fill="#0f172a" />
                    <circle cx="42.4" cy="43.4" r="0.8" fill="#f8fafc" />
                    <circle cx="56.4" cy="43.4" r="0.8" fill="#f8fafc" />
                    {guestEyeStyle === 2 && <path d="M39 41 L47 41 M53 41 L61 41" stroke="#0f172a" strokeWidth="1.6" />}
                    {guestHasGlasses && (
                      <>
                        <rect x="36" y="40" width="12" height="9" rx="2" fill="none" stroke="#111827" strokeWidth="1.3" />
                        <rect x="52" y="40" width="12" height="9" rx="2" fill="none" stroke="#111827" strokeWidth="1.3" />
                        <line x1="48" y1="44.5" x2="52" y2="44.5" stroke="#111827" strokeWidth="1.1" />
                      </>
                    )}
                    <path d="M49 47 L51 47 L50 52 Z" fill="#7c4a2b" opacity="0.6" />
                    <ellipse cx="41" cy="50" rx="2.8" ry="1.2" fill="#fca5a5" opacity="0.35" />
                    <ellipse cx="59" cy="50" rx="2.8" ry="1.2" fill="#fca5a5" opacity="0.35" />
                    <path d={guestMouthStyle === 0 ? "M42 57 Q50 63 58 57" : guestMouthStyle === 1 ? "M42 58 Q50 54 58 58" : guestMouthStyle === 2 ? "M44 58 L56 58" : "M44 56 Q50 60 56 56"} stroke={selectedGuestMood > 55 ? '#7f1d1d' : '#111827'} strokeWidth="2" fill="none" />
                    {guestHasBeard && <path d="M37 60 Q50 72 63 60 Q61 71 50 76 Q39 71 37 60 Z" fill="#374151" opacity="0.9" />}
                    {guestAccessory === 1 && <circle cx="66" cy="57" r="4" fill="#f59e0b" />}
                    {guestAccessory === 2 && <rect x="22" y="30" width="8" height="20" rx="2" fill={selectedGuest.helmetColor || '#94a3b8'} />}
                    {guestAccessory === 3 && <path d="M26 27 L74 27 L67 34 L33 34 Z" fill={selectedGuest.helmetColor || '#94a3b8'} />}
                    {guestAccessory === 4 && <circle cx="34" cy="58" r="3" fill="#ef4444" />}
                    {guestAccessory === 5 && <rect x="63" y="64" width="8" height="12" rx="2" fill="#16a34a" />}
                    <path d="M23 72 L77 72" stroke="#0f172a" strokeWidth="1.4" opacity="0.25" />
                    <path d="M23 79 L77 79" stroke="#0f172a" strokeWidth="1.2" opacity="0.2" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{selectedGuest.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{selectedGuestCategory?.name || 'Gast'}</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedGuest(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ marginBottom: '12px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Geld:</span>
                <span style={{ fontWeight: 'bold' }}>€{selectedGuest.money?.toLocaleString() || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Zufriedenheit:</span>
                <span style={{ fontWeight: 'bold', color: selectedGuest.satisfaction >= 70 ? '#22c55e' : selectedGuest.satisfaction >= 40 ? '#f59e0b' : '#ef4444' }}>
                  {Math.round(selectedGuest.satisfaction || 0)}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>Liftpass:</span>
                <span style={{ fontWeight: 'bold', color: selectedGuest.hasLiftPass ? '#22c55e' : '#f87171' }}>
                  {selectedGuest.hasLiftPass ? 'Ja' : 'Nein'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Passdauer:</span>
                <span style={{ fontWeight: 'bold' }}>{selectedGuest.passDuration} Tage</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span>Resttage:</span>
                <span style={{ fontWeight: 'bold' }}>{selectedGuest.passDaysRemaining ?? selectedGuest.passDuration}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span>Hotel:</span>
                <span style={{ fontWeight: 'bold', color: selectedGuest.hotelBuildingId ? '#22c55e' : '#94a3b8' }}>
                  {selectedGuest.hotelBuildingId ? 'Gebucht' : 'Keins'}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '12px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '12px', marginBottom: '6px' }}>Hunger {Math.round(selectedGuest.hunger || 0)}%</div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, selectedGuest.hunger || 0))}%`,
                  height: '100%',
                  background: (selectedGuest.hunger || 0) > 70 ? '#ef4444' : (selectedGuest.hunger || 0) > 45 ? '#f59e0b' : '#22c55e'
                }} />
              </div>
              <div style={{ fontSize: '12px', marginBottom: '6px' }}>Durst {Math.round(selectedGuest.thirst || 0)}%</div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, selectedGuest.thirst || 0))}%`,
                  height: '100%',
                  background: (selectedGuest.thirst || 0) > 70 ? '#ef4444' : (selectedGuest.thirst || 0) > 45 ? '#f59e0b' : '#22c55e'
                }} />
              </div>
              <div style={{ fontSize: '12px', marginBottom: '6px' }}>Toilette {Math.round(selectedGuest.bladder || 0)}%</div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, selectedGuest.bladder || 0))}%`,
                  height: '100%',
                  background: (selectedGuest.bladder || 0) > 70 ? '#ef4444' : (selectedGuest.bladder || 0) > 45 ? '#f59e0b' : '#22c55e'
                }} />
              </div>
            </div>

            <div style={{ marginBottom: '12px', background: 'rgba(16, 185, 129, 0.12)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Nächste Aktion</div>
              <div style={{ fontSize: '13px' }}>{selectedGuest.nextAction || 'Unbekannt'}</div>
            </div>

            <div style={{ marginBottom: '12px', background: 'rgba(59, 130, 246, 0.12)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Wünsche</div>
              <div style={{ fontSize: '12px', marginBottom: '6px', color: '#e2e8f0' }}>
                Pistenwunsch: {selectedGuest.slopePreference === 'GREEN' ? 'Grün (leicht)' : selectedGuest.slopePreference === 'RED' ? 'Rot (mittel)' : 'Schwarz (schwer)'}
              </div>
              {(selectedGuest.wishes || []).length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>Keine besonderen Wünsche</div>
              )}
              {(selectedGuest.wishes || []).map((wish) => {
                const wishName = BUILDINGS[wish]?.name || wish;
                const done = (selectedGuest.completedWishes || []).includes(wish);
                return (
                  <div key={wish} style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: done ? '#22c55e' : '#e2e8f0' }}>
                      {done ? '✓' : '•'} {wishName}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Status: {selectedGuest.state}
            </div>
          </div>
        )}

        {/* Top HUD */}
        <div className="hud-top glass">
          {hudStats.map((item) => (
            <div key={item.key} className={`hud-stat-card hud-tone-${item.tone}`}>
              <div className="hud-stat-icon">
                <HudIcon name={item.icon} />
              </div>
              <div className="hud-stat-value">{item.value}</div>
              <div className="hud-stat-label">{item.subvalue || item.label}</div>
            </div>
          ))}
          {(level?.objectives?.length > 0) && (
            <button
              className={`hud-stat-card hud-tone-mission${missionPanelOpen ? ' is-open' : ''}`}
              style={{ cursor: 'pointer', border: missionPanelOpen ? '1px solid rgba(96,165,250,0.55)' : undefined }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMissionAnchor({ x: r.left + r.width / 2, y: r.bottom });
                setMissionPanelOpen(v => !v);
              }}
              title="Aufgaben anzeigen (Taste Z)"
            >
              <div className="hud-stat-icon" style={{ color: missionResults.length > 0 && missionResults.every(r => r.done) ? '#4ade80' : '#93c5fd' }}>
                <HudIcon name="target" />
              </div>
              <div className="hud-stat-value">{missionResults.filter(r => r.done).length}/{level.objectives.length}</div>
              <div className="hud-stat-label">Aufgaben {missionPanelOpen ? '▴' : '▾'}</div>
            </button>
          )}

          <div
            onMouseEnter={() => setBuildAdviceHovered(true)}
            onMouseLeave={() => setBuildAdviceHovered(false)}
            title={`${buildAdvice.title} - ${buildAdvice.detail}`}
            className="hud-advice-card"
          >
            <div className="hud-advice-icon">
              <HudIcon name="advice" />
            </div>
            <div style={{ fontSize: '8px', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.66, marginBottom: '1px' }}>
              Naechstes Projekt
            </div>
            <div style={{ fontSize: '10px', fontWeight: 700, marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {buildAdvice.title}
            </div>
            {buildAdviceHovered && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '240px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  background: 'rgba(2, 6, 23, 0.96)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
                  textAlign: 'left',
                  zIndex: 30,
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#f8fafc' }}>
                  {buildAdvice.title}
                </div>
                <div style={{ fontSize: '10px', lineHeight: 1.35, color: 'rgba(255,255,255,0.82)' }}>
                  {buildAdvice.detail}
                </div>
              </div>
            )}
          </div>
        </div>

        {duskProgress > 0 && (
          <div style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 900,
            opacity: Math.sin(Math.PI * duskProgress) * 0.95,
            background: 'linear-gradient(180deg, rgba(251,146,60,0.18) 0%, rgba(15,23,42,0.5) 70%, rgba(2,6,23,0.66) 100%)'
          }} />
        )}

        {/* Bottom Bar - Tools */}
        <div className="hud-bottom-bar glass">
          {toolButtons.map((button) => (
            <button
              key={button.key}
              className={`hud-action-btn${button.active ? ' is-active' : ''}`}
              onClick={button.onClick}
            >
              <div className="hud-stat-icon">
                <HudIcon name={button.icon} />
              </div>
              <div className="hud-stat-value">{button.label}</div>
              <div className="hud-stat-label">{button.sublabel}</div>
            </button>
          ))}
        </div>

        {/* Camera Controls - Right Edge Centered */}
        <div className="camera-hud">
          {navButtons.map((button, index) => (
            <React.Fragment key={button.key}>
              {index === 1 && <div className="divider" />}
              <button
                className={`hud-action-btn hud-control-btn${button.key === 'sound' && !musicEnabled ? ' is-active' : ''}`}
                onClick={button.onClick}
              >
                <div className="hud-stat-icon">
                  <HudIcon name={button.icon} muted={button.muted} />
                </div>
                <div className="hud-stat-value">{button.label}</div>
                <div className="hud-stat-label">{button.sublabel}</div>
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Lift Menu */}
        {
          activeMenu === 'lifts' && (
            <div className="side-panel glass">
              <header>
                <h3>🚠 Lifte</h3>
                <button
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}
                  onClick={() => setActiveMenu(null)}
                >×</button>
              </header>
              <div className="scroll-content">
                {Object.values(LIFT_TYPES).map(lift => {
                  const canAfford = gameState.money >= lift.cost;
                  return (
                    <div key={lift.name} className="menu-item-card" style={{ opacity: canAfford ? 1 : 0.5 }}>
                      <div className="info">
                        <strong>{lift.name}</strong>
                        <span>💰 ${lift.cost.toLocaleString()}</span>
                        <span>👥 {lift.capacity} | ⚡ {lift.speed}</span>
                      </div>
                      <button
                        className="build-btn"
                        disabled={!canAfford}
                        onClick={() => {
                          setSelectedLiftType(lift);
                          setPlacementMode('lift_placing');
                        }}
                      >
                        Platzieren
                      </button>
                    </div>
                  );
                })}

                {placedLifts.length > 0 && (
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Gebaute Lifte (Speed)</div>
                    {placedLifts.map((lift) => (
                      <div key={lift.id} className="menu-item-card">
                        <div className="info">
                          <strong>{lift.type?.name || 'Lift'} #{lift.id}</strong>
                          <span>{Math.round((lift.speedMultiplier || 1) * 100)}%</span>
                          <input
                            type="range"
                            min={60}
                            max={220}
                            value={Math.round((lift.speedMultiplier || 1) * 100)}
                            onChange={(e) => {
                              const mult = Math.max(0.6, Math.min(2.2, Number(e.target.value) / 100));
                              setPlacedLifts(prev => prev.map(item => item.id === lift.id ? { ...item, speedMultiplier: mult } : item));
                              resortManager.setLiftSpeedMultiplier(lift.id, mult);
                              if (clickedLift?.id === lift.id) {
                                setClickedLift(prev => prev ? { ...prev, speedMultiplier: mult } : prev);
                              }
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* Building Menu */}
        {
          activeMenu === 'build' && (
            <div className="side-panel glass">
              <header>
                <h3>🏗️ Bauen</h3>
                <button
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}
                  onClick={() => {
                    setActiveMenu(null);
                    setBuildingCategory(null);
                    setSelectedToolType(null);
                  }}
                >×</button>
              </header>

              {/* Category Selection */}
              {!buildingCategory && (
                <div className="scroll-content">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#6366f1' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.INFRASTRUCTURE)}
                    >
                      🏗️ Infrastruktur
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#8b5cf6' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.HOTEL)}
                    >
                      🏨 Hotels & Unterkünfte
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#ec4899' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.GASTRONOMY)}
                    >
                      🍽️ Gastronomie
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#f59e0b' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.SHOP)}
                    >
                      🛍️ Shops
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#14b8a6' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.TOURISM)}
                    >
                      🎢 Tourismus & Wellness
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#334155' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.PISTEN)}
                    >
                      🚜 Pisten-Infrastruktur
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#78716c' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.TERRAFORMING)}
                    >
                      ⛏️ Geländearbeiten
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#15803d' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.FOREST)}
                    >
                      🌲 Wald
                    </button>
                    <button
                      className="build-btn"
                      style={{ padding: '16px', fontSize: '1.1rem', background: '#3b82f6' }}
                      onClick={() => setBuildingCategory(BUILDING_CATEGORIES.WATER)}
                    >
                      🌊 Wasser
                    </button>
                  </div>
                </div>
              )}

              {/* Buildings in Selected Category */}
              {buildingCategory && (
                <div className="scroll-content">
                  {/* Terraforming: Two-Step Selection */}
                  {buildingCategory === 'terraforming' ? (
                    <>
                      {!selectedToolType ? (
                        <>
                          <button className="build-btn" style={{ marginBottom: '12px', background: '#374151' }} onClick={() => { setBuildingCategory(null); setSelectedToolType(null); }}>← Zurück</button>
                          {[
                            { type: 'flatten', icon: '🟦', name: 'Ebnen' },
                            { type: 'dig', icon: '🟫', name: 'Graben' },
                            { type: 'raise', icon: '⬆️', name: 'Anheben' },
                            { type: 'smooth', icon: '〰️', name: 'Glätten' },
                            { type: 'pull', icon: '📈', name: 'Hochziehen' },
                            { type: 'push', icon: '📉', name: 'Runterziehen' }
                          ].map(({ type, icon, name }) => (
                            <div key={type} className="menu-item-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedToolType(type)}>
                              <div className="info">
                                <strong>{icon} {name}</strong>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <button className="build-btn" style={{ marginBottom: '12px', background: '#374151' }} onClick={() => setSelectedToolType(null)}>← Zurück</button>
                          {getBuildingsByCategory(buildingCategory).filter(b => b.toolType === selectedToolType).map(building => {
                            const canAfford = gameState.money >= building.cost;
                            const sizeLabels = { 4: 'Klein', 7: 'Mittel', 10: 'Groß', 25: 'Mittel', 50: 'Groß' };
                            return (
                              <div key={building.id} className="menu-item-card" style={{ opacity: canAfford ? 1 : 0.5 }}>
                                <div className="info">
                                  <strong>{building.icon} {sizeLabels[building.toolSize] || building.toolSize}</strong>
                                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{building.description}</span>
                                  <span>💰 €{building.cost.toLocaleString()}</span>
                                </div>
                                <button className="build-btn" disabled={!canAfford} onClick={() => { setSelectedBuilding(building); setPlacementMode('building_placing'); }}>Auswählen</button>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <button className="build-btn" style={{ marginBottom: '12px', background: '#374151' }} onClick={() => setBuildingCategory(null)}>← Kategorien</button>
                      {getBuildingsByCategory(buildingCategory).map(building => {
                        const canAfford = gameState.money >= building.cost;
                        return (
                          <div key={building.id} className="menu-item-card" style={{ opacity: canAfford ? 1 : 0.5 }}>
                            <div className="info">
                              <strong>{building.icon} {building.name}</strong>
                              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{building.description}</span>
                              <span>💰 ${building.cost.toLocaleString()}</span>
                              <span>📊 ${building.dailyRevenue.toLocaleString()}/Tag</span>
                              <span>👥 {building.capacity} | 📏 {building.size.width}x{building.size.height}</span>
                            </div>
                            <button
                              className="build-btn"
                              disabled={!canAfford}
                              onClick={() => {
                                setSelectedBuilding(building);
                                setPlacementMode('building_placing');
                              }}
                            >
                              Bauen
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        }

        {/* Piste Menu */}
        {
          activeMenu === 'slopes' && (
            <div className="side-panel glass">
              <header>
                <h2>⛷️ Pisten</h2>
                <button className="close-btn" onClick={() => setActiveMenu(null)}>✕</button>
              </header>
              <div className="scroll-content" style={{ display: 'flex', flexDirection: 'column' }}>
                {Object.entries(PISTE_WIDTHS).map(([key, width]) => {
                  return (
                    <div key={key} className="menu-item-card">
                      <div className="info">
                        <strong>{width.name}</strong>
                        <span>💰 ${width.costPer50m}/50m</span>
                        <span>📏 {width.width}m breit</span>
                      </div>
                      <button
                        className="build-btn"
                        onClick={() => {
                          setPistePlacementMode(width);
                          // Don't close menu - let user see info while drawing
                        }}
                      >
                        Zeichnen
                      </button>
                    </div>
                  );
                })}
                {currentPiste && (
                  <div className="piste-info">
                    <p><strong>Aktuelle Piste:</strong></p>
                    <p>💰 Kosten: ${currentPiste.totalCost}</p>
                    <p>📏 Segmente: {currentPiste.segments.length}</p>

                    {/* DEBUG INFO */}
                    {currentPiste.segments.length > 0 && (
                      <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(255,255,0,0.1)', borderRadius: '4px' }}>
                        <p><strong>🐛 Debug:</strong></p>
                        {currentPiste.segments.slice(-3).map((seg, idx) => (
                          <p key={idx} style={{ fontSize: '12px' }}>
                            Seg {currentPiste.segments.length - 3 + idx}:
                            {seg.gradient?.toFixed(1)}% → {seg.difficulty}
                          </p>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        className="build-btn"
                        style={{ flex: 1, background: '#10b981' }}
                        onClick={() => {
                          if (resortManager.completePiste(currentPiste)) {
                            clearForestForPiste(currentPiste);
                            setGameState(prev => ({ ...prev, money: resortManager.money }));
                            setCurrentPiste(null);
                            setPistePlacementMode(null);
                          } else {
                            alert('Nicht genug Geld!');
                          }
                        }}
                      >
                        ✓ Fertig
                      </button>
                      <button
                        className="build-btn"
                        style={{ flex: 1, background: '#ef4444' }}
                        onClick={() => {
                          setCurrentPiste(null);
                          setPistePlacementMode(null);
                        }}
                      >
                        ✕ Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                {resortManager.pistes.length > 0 && (
                  <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px', textAlign: 'right' }}>Abriss bestehender Pisten</div>
                    {resortManager.pistes.map((piste) => (
                      <div key={piste.id} className="menu-item-card">
                        <div className="info">
                          <strong>Piste #{piste.number}</strong>
                          <span>{piste.avgDifficulty || 'BLUE'} | {piste.length || 0}m</span>
                          <span>Zustand {Math.round((piste.condition || 0) * 100)}%</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="build-btn"
                            style={{ background: '#475569' }}
                            onClick={() => setSelectedPiste(piste)}
                          >
                            Info
                          </button>
                          <button
                            className="build-btn"
                            style={{ background: '#b91c1c' }}
                            onClick={() => handleDeletePiste(piste.id)}
                          >
                            Abriss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* Live Terrain Info - Top Right Corner */}
        <div style={{
          position: 'fixed',
          top: '15px',
          right: '15px',
          background: 'rgba(15, 23, 42, 0.95)',
          padding: '10px 12px',
          borderRadius: '8px',
          minWidth: '140px',
          fontSize: '0.9rem',
          color: '#fff'
        }}>
          <p style={{ marginBottom: '8px', fontWeight: 'bold' }}>🗺️ Gelände</p>
          {(() => {
            if (!worldData) return <p>Lädt...</p>;

            const mx = Math.floor(worldData.heightmap.length / GRID_SIZE / 2);
            const my = Math.floor(worldData.heightmap.length / GRID_SIZE / 2);

            // Show center tile if no hover
            const tx = hoveredTile?.x ?? mx;
            const ty = hoveredTile?.y ?? my;

            if (tx < 0 || ty < 0 || tx >= GRID_SIZE || ty >= GRID_SIZE) {
              return <p>Außerhalb</p>;
            }

            const idx = ty * GRID_SIZE + tx;
            const z = worldData.heightmap[idx];

            // Calculate gradient
            const idxRight = tx < GRID_SIZE - 1 ? idx + 1 : idx;
            const idxDown = ty < GRID_SIZE - 1 ? idx + GRID_SIZE : idx;
            const zRight = worldData.heightmap[idxRight];
            const zDown = worldData.heightmap[idxDown];

            const gradientX = Math.abs(z - zRight);
            const gradientY = Math.abs(z - zDown);
            const maxGradient = Math.max(gradientX, gradientY);
            const gradientPercent = (maxGradient * 10) / 1.5;

            return (
              <>
                <p style={{ margin: '4px 0', color: '#fff' }}>⛰️ {Math.round((resortManager.baseAltitude || 0) + z).toLocaleString()} m ü. M.</p>
                <p style={{ margin: '4px 0', color: '#fff' }}>📊 {gradientPercent.toFixed(1)}%</p>
              </>
            );
          })()}
        </div>



        {/* Piste List - Bottom Right Collapsible */}
        {
          resortManager.pistes.length > 0 && (
            <div style={{
              position: 'fixed',
              bottom: '10px',
              right: '10px',
              background: 'rgba(15, 23, 42, 0.95)',
              borderRadius: '8px',
              minWidth: pisteListOpen ? '220px' : '50px',
              maxHeight: pisteListOpen ? '400px' : '50px',
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              color: '#fff'
            }}>
              <div
                onClick={() => setPisteListOpen(!pisteListOpen)}
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: pisteListOpen ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  color: '#fff'
                }}
              >
                <span>🎿 Pisten ({resortManager.pistes.length})</span>
                <span style={{ fontSize: '18px' }}>{pisteListOpen ? '▼' : '◀'}</span>
              </div>

              {pisteListOpen && (
                <div style={{
                  padding: '10px',
                  maxHeight: '350px',
                  overflowY: 'auto',
                  fontSize: '14px'
                }}>
                  {resortManager.pistes.map(piste => {
                    const diffColors = {
                      BLUE: '#6495ED',
                      RED: '#ff6464',
                      BLACK: '#333'
                    };
                    const color = diffColors[piste.avgDifficulty] || '#6495ED';

                    return (
                      <div key={piste.id} style={{
                        padding: '8px',
                        margin: '6px 0',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '4px',
                        borderLeft: `5px solid ${color}`
                      }}>
                        <div style={{ color, fontWeight: 'bold', marginBottom: '4px' }}>
                          #{piste.number} {piste.width.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#ddd' }}>
                          📏 {piste.length}m
                        </div>
                        <div style={{ fontSize: '12px', color: '#ddd' }}>
                          ⛰️ ⌀ {piste.avgGradient?.toFixed(1)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
        }

        {/* --- STATISTICS MODAL --- */}
        {showStats && (
          <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.8)', zIndex: 5000, display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}>
            <div className="stats-modal glass" style={{
              width: '500px', padding: '30px', borderRadius: '15px', color: '#fff',
              background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px' }}>
                <h2 style={{ margin: 0 }}>📊 Resort Statistik & Bilanz</h2>
                <button onClick={() => setShowStats(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>✕</button>
              </div>

              {(() => {
                const report = resortManager.getDetailedReport();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Financial Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ opacity: 0.7, fontSize: '12px', marginBottom: '5px' }}>Barmittel</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>€{report.balance.toLocaleString()}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px' }}>
                        <div style={{ opacity: 0.7, fontSize: '12px', marginBottom: '5px' }}>Einnahmen (Letzter Tag)</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#3b82f6' }}>+€{report.revenue.lastDay.toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Operational Costs Breakdown */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', pt: '15px', marginTop: '10px' }}>
                      <h4 style={{ marginBottom: '15px' }}>🔴 Betriebskosten (Monatlich)</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🚠 Liftsysteme</span>
                          <span style={{ color: '#fca5a5' }}>-€{report.costs.lifts.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🚜 Pisten-Infrastruktur</span>
                          <span style={{ color: '#fca5a5' }}>-€{report.costs.pisten.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>🏘️ Allg. Infrastruktur</span>
                          <span style={{ color: '#fca5a5' }}>-€{report.costs.infrastructure.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #334155', pt: '10px', marginTop: '5px' }}>
                          <span>SUMME KOSTEN</span>
                          <span style={{ color: '#ef4444' }}>-€{report.costs.total.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Projections */}
                    <div style={{ background: '#0f172a', padding: '15px', borderRadius: '8px' }}>
                      <h4 style={{ marginBottom: '10px', color: '#94a3b8' }}>💡 Wirtschaftliche Prognose</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span>Erwartete Einnahmen (Monat)</span>
                        <span style={{ color: '#4ade80' }}>+€{report.revenue.projectedMonthly.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>Netto-Ergebnis (Monat)</span>
                        <span style={{ color: (report.revenue.projectedMonthly - report.costs.total) >= 0 ? '#10b981' : '#ef4444' }}>
                          {(report.revenue.projectedMonthly - report.costs.total) >= 0 ? '+' : ''}€{(report.revenue.projectedMonthly - report.costs.total).toLocaleString()}
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>
          </div>
        )
        }
      </div >
      {/* NEW: Piste Detail Modal */}
      {selectedPiste && (
        <PisteDetailModal
          piste={selectedPiste}
          baseAltitude={resortManager.baseAltitude || 0}
          onClose={() => setSelectedPiste(null)}
        />
      )}
    </div >
  );
}

// ============================================================
// APP ROOT — Anmeldung → Hauptmenü ↔ Spiel
// ============================================================
const App = () => {
  const [activeLevel, setActiveLevel] = useState(null);
  // Level wartet auf den Ladebildschirm, bevor die Welt gebaut wird
  const [pendingLevel, setPendingLevel] = useState(null);
  const [viewMode, setViewMode] = useState('2d'); // '2d' | '3d'
  const [sessionKey, setSessionKey] = useState(0);
  // Anmeldung (nur wenn ein Anmeldeserver eingetragen ist – siehe auth/authClient.js)
  const [account, setAccount] = useState(() => (authEnabled() ? getSession() : null));
  const [menuKey, setMenuKey] = useState(0);

  // Beim Seitenstart: neue Fassung online? Dann einmal frisch laden.
  useEffect(() => { checkForNewBuild(); }, []);
  // Jeden neuen Kampagnen-Fortschritt ans Konto melden.
  useEffect(() => installProgressSync(), []);
  // Anmeldung prüfen und den Fortschritt mit dem Konto abgleichen.
  useEffect(() => {
    if (!authEnabled() || !account) return undefined;
    let alive = true;
    (async () => {
      try { await api.me(); }
      catch (e) {
        // Abgelaufen, gesperrt oder entfernt → zurück zur Anmeldung. Ohne Netz bleibt man drin.
        if (e.status === 401 && alive) { clearSession(); setAccount(null); setActiveLevel(null); setPendingLevel(null); }
        return;
      }
      try { if ((await syncProgress()) && alive) setMenuKey(k => k + 1); }
      catch { /* offline: der lokale Stand bleibt */ }
    })();
    return () => { alive = false; };
  }, [account]);

  const handleLogout = () => {
    api.logout().catch(() => { /* Token läuft sonst von selbst ab */ });
    clearSession();
    setAccount(null);
    setActiveLevel(null);
    setPendingLevel(null);
  };

  // Beim Levelstart erst den Ladebildschirm zeigen, dann die Welt aufbauen.
  const handleStartLevel = (level, mode = '2d') => {
    setPendingLevel({ level, mode });
  };
  const finishLoading = () => {
    if (!pendingLevel) return;
    setSessionKey(k => k + 1);
    setViewMode(pendingLevel.mode);
    setActiveLevel(pendingLevel.level);
    setPendingLevel(null);
  };

  const handleExitToMenu = () => {
    setActiveLevel(null);
  };

  if (authEnabled() && !account) {
    return <AuthGate onSignedIn={setAccount} />;
  }

  if (pendingLevel) {
    return <LoadingScreen level={pendingLevel.level} onDone={finishLoading} />;
  }

  if (!activeLevel) {
    return (
      <>
        <MainMenu key={menuKey} onStartLevel={handleStartLevel} />
        {authEnabled() && account && <AccountBar session={account} onLogout={handleLogout} />}
      </>
    );
  }

  if (viewMode === '3d') {
    return (
      <World3D
        key={`3d-${activeLevel.id}-${sessionKey}`}
        level={activeLevel}
        onExit={handleExitToMenu}
      />
    );
  }

  return (
    <Game
      key={`${activeLevel.id}-${sessionKey}`}
      level={activeLevel}
      onExitToMenu={handleExitToMenu}
    />
  );
};

export default App;
