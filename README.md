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

## Selbst fahren

Im 3D-Modus kann man das eigene Skigebiet abfahren: „Fahren" in der Werkzeugleiste wählen und die Stelle
anklicken oder antippen, an der es losgehen soll. Am Rechner lenken A/D oder die Pfeiltasten, W ist Schuss
(im Stand und bergauf: gehen), S bremst. Am Handy lenken zwei große Tasten links und rechts, beide zugleich
bremsen, und wer das Bild gedrückt hält, fährt Schuss oder geht. Unten an einer Talstation steigt man per Knopf
in die nächste Kabine und kann sich während der Bergfahrt umsehen. Kicker, Funpark und Halfpipe lassen sich
selbst befahren (Sprünge mit Drehung), auf der Rennstrecke läuft die Zeit mit, und an einer Hütte kann man
einkehren (E) und die Aussicht genießen. Dazu gibt es Fahrgeräusche – abschaltbar über „Ton an/aus". „Beenden" (oder Esc) führt zurück zum Bauen.

## Spielstand

Das Spiel sichert von selbst: nach jedem Bauen, regelmäßig zwischendurch und beim Verlassen. Der Stand
liegt auf dem Gerät und zusätzlich am Konto – wer sich auf einem anderen Gerät anmeldet, findet sein
Skigebiet im Menü unter „Fortsetzen" wieder. (Fürs Konto muss der Anmeldeserver auf dem Stand dieses Repos
laufen, siehe `webgl-3d/worker/README.md`; sonst bleibt der Stand auf dem Gerät.) „Neu beginnen" verwirft den
Stand eines Levels (mit Rückfrage). Ändert sich die Landschaft eines Levels durch ein Update, beginnt das
Level neu.

## Landschaft

Jedes Level ist ein Ausschnitt aus einem größeren Gebirge: Hinter dem Rand des Baugebiets geht dieselbe
Landschaft weiter – Hänge, Täler, Wald, Seen, an der Küste das Meer – bis sie im Dunst verschwindet. Die
Schneegrenze wandert mit dem Wetter; Sonnenhänge apern früher aus, an Steilflanken schaut der Fels heraus.

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
