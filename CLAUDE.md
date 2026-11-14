# Mountain Tycoon – Hinweise für Claude-Sitzungen

Skigebiets-Simulation im Browser (React 19 + Vite; 2D auf Canvas, 3D mit three.js).
Live: https://mountain-tycoon.github.io/ · Antworten an den Nutzer auf Deutsch.

## Aufbau
- `webgl-3d/` – **das aktuelle Spiel** (enthält den 2D- und den 3D-Modus). Hier wird entwickelt.
  - `src/App.jsx` – App-Wurzel (Anmeldung → Hauptmenü ↔ Spiel), das 2D-Spiel (`Game`) und sein HUD
  - `src/engine/SkiResortManager.js` – Simulation: Gäste-KI, Lifte, Pisten, Fahrzeuge, Wirtschaft
  - `src/engine/terrainGen.js` – Landschaftserzeugung (Spielfeld samt Umland), siehe „Landschaft" unten
  - `src/components/game/` – 2D-Renderer (`WorldCanvas.jsx`, `DrawingUtils.js`)
  - `src/webgl/` – 3D-Renderer (`World3D.jsx`, `Scene3D.js`, `TerrainMesh.js`, `SnowSurface.js`, `Surround3D.js`,
    `Water3D.js`, `Buildings3D.js`, `Vehicles3D.js`, `Sky3D.js`)
  - `src/savegames.js` – Spielstände des 3D-Spiels (Gerät + Konto), siehe „Spielstände" unten
  - `src/components/menu/` – Hauptmenü und Ladebildschirm
  - `src/constants/` – Gebäude, Gäste, Lifte, Pisten, Kampagne (`campaign.js`: Level, Aufgaben, Fortschritt)
  - `src/auth/` – Anmeldung: Anmeldeseite, Konto-Leiste, Verwaltung, Fortschritts-Abgleich
  - `worker/` – Anmeldeserver (Cloudflare Worker + KV), siehe `worker/README.md`
  - `tools/` – Prüfskripte für Node: `authtest.mjs` (Anmeldeserver), `relief.mjs` (Landschaft als Bild +
    Kennzahlen), `terrainstat.mjs`, `baseslope.mjs`, `accesstest.mjs`, `gridtest.mjs`. Die Szenen-Attrappen
    `runtest.mjs` und `sim/` laufen seit dem Umbau von Wasser, Gondeln und Gelände nicht mehr durch (sie
    ersetzen three.js durch Platzhalter, denen die neuen Bausteine fehlen) – vor Gebrauch nachziehen.
  - `public/` – Bilder: Menü-Fotos (`bg/`), Level-Grafiken (`levels/`), Ladebilder (`loading/`), Icons
- Projektwurzel (`src/`, `package.json`, …) – **ältere 2D-Fassung** (Stand August 2026), nur noch Archiv.
  Nicht weiterentwickeln, außer es wird ausdrücklich gewünscht.

## Entwickeln
```bash
cd webgl-3d
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci   # Electron wird für die Web-Fassung nicht gebraucht
npm run dev                              # http://localhost:5180 – ohne Anmeldung
npm run build                            # muss fehlerfrei durchlaufen, bevor etwas nach main geht
```
- Neue Dateien sollen `npx eslint <datei>` bestehen. Die großen alten Dateien haben Altlasten – dort nichts
  „aufräumen", was nicht zur Aufgabe gehört.
- Anmeldung lokal ausprobieren: `worker/README.md` (Abschnitt „Lokal testen"), Server-Tests mit
  `node tools/authtest.mjs`.

## 3D-Modus: Bedienung, Handy, Grafik
- **Eingabe** (`attachOrbit` in `Scene3D.js`, Pointer Events): Maus – links drehen, rechts/Shift verschieben, Rad zoomen.
  Finger – einer verschiebt (der berührte Punkt bleibt unter dem Finger), zwei zoomen/drehen, beide gemeinsam
  hoch/runter neigen.
- **Finger bauen nie direkt:** Antippen merkt die Aktion nur vor (`setPending`), das HUD zeigt die
  Bestätigen-Leiste (`ConfirmBar` in `World3D.jsx`), erst `confirmPending()` führt aus. Mit der Maus bleibt es
  beim sofortigen Klick. Wer ein Werkzeug ergänzt, muss in `onUp` beide Wege bedienen (`needConfirm`).
- **Handy-Layout** in `World3D.jsx`: `useViewport()` liefert `compact` (kleiner Bildschirm → Leiste unten, Felder
  als Karten von unten) und `coarse` (Finger → andere Hinweistexte). Nichts darf nur per Drüberfahren
  erreichbar sein. Eigene Kamera-Knöpfe gibt es bewusst nicht – die Gesten genügen.
- **Bildqualität** regelt sich selbst: Stufen `QUALITY` (0–4, Auflösung/Schatten/Glühen/Glättung) und
  Messung `qualityFrame` in `Scene3D.js` (Stand je Gerät in `localStorage['mt.quality']`). Gerechnet wird in der
  Anzeige-Auflösung, die Farbstufe schärft leicht nach. Neue teure Effekte dort an eine Stufe hängen.
- **Wasser** (`Water3D.js`): `prepareWater` gräbt Seebecken und Bachbetten ein (vor dem Geländenetz),
  `buildWater` legt eine Shader-Fläche darüber (Tiefe, Wellen, Spiegelung, Strömung). Wasserpunkte sind
  `landcover === 2`; die Bodenfarbe darunter kommt aus `waterBedColor`.
- **Gondelkabinen** der 4er-/6er-/8er-Bahnen kommen aus `makeCabinKit` in `Buildings3D.js`: Form einmal je
  Bahn, jede Kabine nur vier Teile. Teile, die sich ein Material teilen, tragen ihre Farbe als Eckfarbe.
- **Farben:** Die Bildaufbereitung (Composer) gibt die Werte ohne Tonwert-/Farbraumstufe aus; das Bild ist darauf
  abgestimmt. Nicht nebenbei auf den direkten Renderpfad oder eine Ausgabestufe umstellen.
- **Fallstrick:** `vertexColors: true` nur setzen, wenn die Geometrie ein Farbattribut hat – sonst wird das
  Material schwarz. Farben je Instanz (`setColorAt`) brauchen den Schalter nicht.
- **Bäume** stehen zu Zehntausenden: Geometrie sparsam halten (`coneGeo` in `TerrainMesh.js`, offene Stämme,
  Hauben ohne Unterseite). Standorte sind gewürfelt und in der Zelle versetzt (`treeCell`, `treeJitter`) –
  kein Raster, keine Reihen.
- **Ausprobieren:** nur bei `npm run dev` gibt es `window.__mtCam` (Kamera stellen: `orbit.setState`,
  Tageszeit: `clock`/`CYCLE`, Qualitätsstufe: `quality.set`, Wetter: `weather`, Geländepunkt unter einem
  Bildpunkt: `raycastTerrain`) und den Direktstart `http://localhost:5180/?level=<id>` (z. B. `schweiz`).
  Die Uhr dabei nur vorwärts stellen.
- App-Symbole neu erzeugen: `python3 tools/make-app-icons.py public/bg/logo.png public/pwa` (in `webgl-3d/`).

## Landschaft, Umland, Schnee
- **Erzeugung** (`engine/terrainGen.js`): kein Aufaddieren breiter Kuppeln mehr (das ergab in jedem Level einen
  runden Klumpen in der Kartenmitte), sondern ein **Gratnetz**: Gipfel aus der Vorlage des Levels (`MASSIFS`),
  Kämme mit Sätteln dazwischen, Seitengrate, ein Haupttal vom Kartenrand Richtung höchstem Gipfel, Nachbarberge
  rings um das Spielfeld. Alles wird weich vereinigt und durch ein Rauschfeld verzogen. Danach Glätten,
  Wald (zusammenhängende Bestände über einen Rang, Anteil je Level), Meer, Bäche, Seen, Startlinie.
  `TERRAIN_GEN` hochzählen, sobald sich das Ergebnis ändert – Spielstände hängen an der Landschaft.
- **Umland:** `buildLevelWorld()` erzeugt ein größeres Stück Gebirge (`OUTER_MARGIN` Kacheln je Seite); das
  Spielfeld ist dessen Mitte. `world.outer` = ganzes Gebiet (das Spielfeld liegt bei `offset`), `world.far` =
  dieselbe Landschaft als Formel für die Ferne. Die Szene gräbt Gewässer im ganzen Gebiet ein und schreibt
  Änderungen am Spielfeld zurück (`syncOuter`).
- **Zeichnen des Umlands** (`Surround3D.js`): ein Ringnetz von der Spielfeldkante bis in den Horizontdunst,
  an der Kante Punkt für Punkt deckungsgleich (Höhe, Farbe, Normale – `recomputeTerrainNormals` in der Szene
  gibt den Randpunkten des Spielfelds dieselbe Normale). Wald: bis `BELT_END` hinter der Kante dieselben Bäume
  wie innen (`forestBelt`), dahinter einfachere, weiter draußen zeichnet das Material die Kronen in den Boden.
  `surround.userData.heightAt` ist die gezeichnete Höhe (Kamera, Bäume). Es gibt keine Schürze und keine
  Ringkulisse mehr – nichts davon wieder einführen.
- **Schnee** (`SnowSurface.js`): Die Eckfarbe des Geländes ist nur der **Untergrund** (`groundColor`); ob Schnee
  liegt und wie er aussieht, rechnet das Material je Bildpunkt (fleckige Schneegrenze, Sonnenhänge apern
  früher, Fels an Steilflanken, blaue Schatten, Windrippen, Glitzern). Eingaben: `snowU` (Schneegrenze,
  Sonne …), je Rasterpunkt `aSnow` (Neu-/Kunstschnee aus `SNOW_BASE`) und `aMark` (Anlagen-Einfärbung,
  Kronendach). `repaintSnowCover` lädt nur noch diese Werte hoch; das Umland liest den Neuschnee aus einer
  Tabelle je Höhenstufe (`uFresh`). Wer etwas Weißes neben den Schnee stellt, gibt ihm mit `matchSnowLook`
  denselben Schattenton und Dunst (`SOFT_FOG`).
- **Startpunkt:** Talstation = tiefste Randkachel, von dort mindestens `BASE_IN` Kacheln ins Gebiet (sonst
  klemmt das Dorf am Rand und die Zufahrt findet keinen Weg). Bäche und Seen meiden die Linie Dorf–Gipfel.
- **Prüfen ohne Spiel:** `node tools/relief.mjs <ordner> [level …]` zeichnet die Landschaft als Reliefbild
  (mit Umland, Spielfeld als Rahmen) und druckt Hangneigung, Wald-, Wasser- und Eisanteil.

## Spielstände (3D)
- Gespeichert wird nicht die Szene, sondern **was der Spieler getan hat**: jede Bauaktion der Reihe nach
  (`logAction` in `Scene3D.js`), dazu Kontostand und Kennzahlen. `getSave()` liefert das als schlichtes Objekt,
  `loadSave()` baut die Aktionen auf dem frisch erzeugten Gelände nach – ohne Bauzeit und Kosten.
  **Wer eine neue Bauaktion ergänzt, muss sie vormerken und in `loadSave` nachspielen**, sonst fehlt sie nach
  dem Laden. Das Gelände eines Levels muss dafür bei jedem Start gleich entstehen (kein `Math.random()` für
  Dinge, die das Bauen beeinflussen). Ein Stand gilt nur für die Fassung der Landschaft, auf der er entstand
  (`gen` im Stand = `TERRAIN_GEN`); ältere werden ignoriert und beim nächsten Sichern überschrieben.
- `src/savegames.js`: Stand sofort aufs Gerät (`localStorage`, je Spieler und Level), zusätzlich ans Konto
  (`GET/PUT /save`, Übersicht `GET /saves`). Es gilt der jüngere Stand; „Neu beginnen" hinterlässt einen
  Löschvermerk. Hochgeladen wird höchstens alle 90 s und beim Verlassen – das schont das Schreibkontingent.
- Im Menü: „Fortsetzen" / „Neu beginnen" (`MainMenu.jsx`); geladen wird während des Ladebildschirms (`App.jsx`).
- Die Sandbox und der 2D-Modus haben keinen Spielstand.

## Veröffentlichen
- Jeder Push auf `main` baut `webgl-3d` und veröffentlicht es über GitHub Actions auf GitHub Pages
  (`.github/workflows/deploy.yml`); nach ein bis zwei Minuten ist es live. Pull Requests werden nur gebaut.
- Prüfen, was online ist: https://mountain-tycoon.github.io/version.txt – der Build-Stempel
  (JJJJMMTTHHMMSS, deutsche Zeit) steht auch im Spiel unten links. Nach einem Deploy kurz gegenprüfen.
- Der **Anmeldeserver** wird nicht automatisch veröffentlicht. Nach Änderungen an `webgl-3d/worker/worker.js`:
  `cd webgl-3d/worker && npx wrangler deploy` – das geht nur auf dem Mac des Nutzers, dort ist Wrangler angemeldet.
  In einer Cloud-Sitzung: Änderung committen und dem Nutzer ausdrücklich sagen, dass der Worker neu deployt
  werden muss. Ändert sich die Schnittstelle, `SERVER_V` in `worker/worker.js` erhöhen. In
  `src/auth/authClient.js` steht, was die Seite braucht: `SERVER_MIN` (darunter warnt der Anmeldebildschirm)
  und `SERVER_SAVES` (darunter bleiben Spielstände nur auf dem Gerät). Neue Fähigkeiten so einbauen, dass die
  Seite auch mit dem älteren Worker läuft – dann ist die Reihenfolge der beiden Veröffentlichungen egal.

## Regeln
- Das Repo ist öffentlich: **keine Geheimnisse** (Passwörter, Tokens, `.dev.vars`) und **keine persönlichen
  Angaben** (Namen, E-Mail-Adressen, Pfade wie `/Users/…`) in Dateien oder Commit-Nachrichten.
  `ADMIN_EMAILS` und `ADMIN_PASSWORD` sind Secrets des Workers.
- Die Anmeldung darf beim Entwickeln nicht im Weg stehen: ohne `VITE_AUTH_ENDPOINT` läuft das Spiel ohne
  Login (so ist es bei `npm run dev`). Die Adresse für die veröffentlichte Seite steht in `webgl-3d/.env.production`.
- Gestaltung wie im Hauptmenü: dunkel und ruhig, Foto-Hintergründe, helle Schrift (`#e8eef6`), gesperrte Versalien
  für kleine Beschriftungen, flache Flächen – kein Leuchten, keine bunten Verläufe auf Bedienelementen.
  Im Spiel-HUD Glas-Optik (`App.css`). Texte im Spiel auf Deutsch.
- Große Dateien (`App.jsx`, `SkiResortManager.js`, `Scene3D.js`) gezielt ändern, nicht neu schreiben.
- Keine Sicherungskopien wie `datei.js.bak` anlegen – dafür gibt es git.
