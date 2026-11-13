# Mountain Tycoon

Skigebiets-Simulation im Browser: Lifte und Pisten planen, Hütten und Hotels bauen, Gäste glücklich
machen – als Kampagne durch neun Länder oder frei im Sandbox-Modus, wahlweise in 2D oder 3D.

**Spielen:** https://mountain-tycoon.github.io/ (mit Konto – registrieren, freischalten lassen, anmelden)

## Am Handy spielen

Der 3D-Modus läuft auch auf dem Handy und dem Tablet:

- **Ein Finger** verschiebt die Karte, **zwei Finger** zoomen und drehen, beide gemeinsam hoch oder runter
  neigt den Blick.
- **Bauen:** Werkzeug wählen, Stelle antippen – es erscheint die Vorschau mit Preis. Gebaut wird erst mit dem Haken.
- Über „Zum Home-Bildschirm" (Teilen-Menü im Browser) startet das Spiel wie eine App im Vollbild.
- Die Bildqualität passt sich von selbst an das Gerät an.

## Spielstand

Das Spiel sichert von selbst: nach jedem Bauen, regelmäßig zwischendurch und beim Verlassen. Der Stand
gehört zum Konto – wer sich auf einem anderen Gerät anmeldet, findet sein Skigebiet im Menü unter
„Fortsetzen" wieder. „Neu beginnen" verwirft den Stand eines Levels (mit Rückfrage).

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
„Verwaltung" frei. Der Kampagnen-Fortschritt und die Spielstände (das gebaute Skigebiet je Level)
hängen am Konto und wandern so von Gerät zu Gerät.
Einrichtung und Pflege des Anmeldeservers: `webgl-3d/worker/README.md`.

## Mit Claude weiterbauen

`CLAUDE.md` erklärt Aufbau, Befehle und Regeln für Claude-Sitzungen – am Rechner wie am Handy.
