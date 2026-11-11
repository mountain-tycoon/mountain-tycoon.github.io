# Mountain Tycoon

Skigebiets-Simulation im Browser: Lifte und Pisten planen, Hütten und Hotels bauen, Gäste glücklich
machen – als Kampagne durch neun Länder oder frei im Sandbox-Modus, wahlweise in 2D oder 3D.

**Spielen:** https://mountain-tycoon.github.io/ (mit Konto – registrieren, freischalten lassen, anmelden)

## Was wo liegt

| Ordner | Inhalt |
| --- | --- |
| `webgl-3d/` | Das aktuelle Spiel (React + Vite + three.js), inklusive Anmeldung (`src/auth/`) und Anmeldeserver (`worker/`) |
| Projektwurzel (`src/` …) | Ältere 2D-Fassung, nur noch Archiv |
| `.github/workflows/` | Automatisches Bauen und Veröffentlichen |

## Lokal starten

```bash
cd webgl-3d
npm install
npm run dev        # http://localhost:5180
```

Lokal läuft das Spiel ohne Anmeldung. Mehr dazu in `webgl-3d/SPIEL STARTEN.txt`.

## Veröffentlichen

Jede Änderung, die auf dem Zweig `main` landet, wird automatisch gebaut und ist nach ein bis zwei
Minuten unter der Adresse oben online. Welche Fassung gerade läuft, zeigt der Build-Stempel im Spiel
unten links (und `/version.txt`).

## Anmeldung

Spieler registrieren sich mit Name, E-Mail und eigenem Passwort; der Admin schaltet sie in der
„Verwaltung" frei. Der Kampagnen-Fortschritt hängt am Konto und wandert so von Gerät zu Gerät.
Einrichtung und Pflege des Anmeldeservers: `webgl-3d/worker/README.md`.

## Mit Claude weiterbauen

`CLAUDE.md` erklärt Aufbau, Befehle und Regeln für Claude-Sitzungen – am Rechner wie am Handy.
