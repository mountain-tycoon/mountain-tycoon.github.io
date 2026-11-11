# Mountain Tycoon – Hinweise für Claude-Sitzungen

Skigebiets-Simulation im Browser (React 19 + Vite; 2D auf Canvas, 3D mit three.js).
Live: https://mountain-tycoon.github.io/ · Antworten an den Nutzer auf Deutsch.

## Aufbau
- `webgl-3d/` – **das aktuelle Spiel** (enthält den 2D- und den 3D-Modus). Hier wird entwickelt.
  - `src/App.jsx` – App-Wurzel (Anmeldung → Hauptmenü ↔ Spiel), das 2D-Spiel (`Game`) und sein HUD
  - `src/engine/SkiResortManager.js` – Simulation: Gäste-KI, Lifte, Pisten, Fahrzeuge, Wirtschaft
  - `src/components/game/` – 2D-Renderer (`WorldCanvas.jsx`, `DrawingUtils.js`)
  - `src/webgl/` – 3D-Renderer (`World3D.jsx`, `Scene3D.js`, `TerrainMesh.js`, `Buildings3D.js`, `Vehicles3D.js`, `Sky3D.js`)
  - `src/components/menu/` – Hauptmenü und Ladebildschirm
  - `src/constants/` – Gebäude, Gäste, Lifte, Pisten, Kampagne (`campaign.js`: Level, Aufgaben, Fortschritt)
  - `src/auth/` – Anmeldung: Anmeldeseite, Konto-Leiste, Verwaltung, Fortschritts-Abgleich
  - `worker/` – Anmeldeserver (Cloudflare Worker + KV), siehe `worker/README.md`
  - `tools/` – Prüf- und Simulationsskripte für Node, u. a. `authtest.mjs` für den Anmeldeserver
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

## Veröffentlichen
- Jeder Push auf `main` baut `webgl-3d` und veröffentlicht es über GitHub Actions auf GitHub Pages
  (`.github/workflows/deploy.yml`); nach ein bis zwei Minuten ist es live. Pull Requests werden nur gebaut.
- Prüfen, was online ist: https://mountain-tycoon.github.io/version.txt – der Build-Stempel
  (JJJJMMTTHHMMSS, deutsche Zeit) steht auch im Spiel unten links. Nach einem Deploy kurz gegenprüfen.
- Der **Anmeldeserver** wird nicht automatisch veröffentlicht. Nach Änderungen an `webgl-3d/worker/worker.js`:
  `cd webgl-3d/worker && npx wrangler deploy` – das geht nur auf dem Mac des Nutzers, dort ist Wrangler angemeldet.
  In einer Cloud-Sitzung: Änderung committen und dem Nutzer ausdrücklich sagen, dass der Worker neu deployt
  werden muss. Ändert sich die Schnittstelle, `SERVER_V` in `worker/worker.js` und `src/auth/authClient.js`
  gemeinsam erhöhen – die Seite warnt dann, solange der alte Worker läuft.

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
