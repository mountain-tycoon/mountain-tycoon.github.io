# Mountain Tycoon – Hinweise für Claude-Sitzungen

Skigebiets-Simulation im Browser (React 19 + Vite, 3D mit three.js). Den früheren 2D-Modus gibt es nicht mehr.
Live: https://mountain-tycoon.github.io/ · Antworten an den Nutzer auf Deutsch.

## Aufbau
- `webgl-3d/` – **das Spiel**. Hier wird entwickelt.
  - `src/App.jsx` – App-Wurzel (Anmeldung → Hauptmenü → Ladebildschirm → Spiel)
  - `src/engine/terrainGen.js` – Landschaftserzeugung (Spielfeld samt Umland), siehe „Landschaft" unten
  - `src/webgl/` – 3D-Renderer (`World3D.jsx`, `Scene3D.js`, `TerrainMesh.js`, `SnowSurface.js`, `Surround3D.js`,
    `Water3D.js`, `Buildings3D.js`, `Vehicles3D.js`, `Sky3D.js`, `SkiRun.js`, `SkiFigure.js`, `SkiOutfits.js`,
    `SkiSound.js`, `Loipe3D.js`, `Biathlon3D.js`, `IceRink3D.js`, `Paraglider3D.js`). Die ganze Simulation (Gäste, Lifte, Wirtschaft) steckt in `Scene3D.js`.
  - `src/savegames.js` – Spielstände des 3D-Spiels (Gerät + Konto), siehe „Spielstände" unten
  - `src/components/menu/` – Hauptmenü (Kampagne, Sandbox, Fahrer-Garderobe `Wardrobe.jsx`) und Ladebildschirm
  - `src/constants/campaign.js` – Level, Aufgaben, Fortschritt
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
- **Bildqualität** regelt sich selbst: Stufen `QUALITY` (0–6: Auflösung, Schatten, Glühen, Glättung) und Messung
  `qualityFrame` in `Scene3D.js` (Stand je Gerät in `localStorage['mt.quality2']`). Die beiden untersten Stufen sind
  für alte Geräte (gröber als der Bildschirm, zuletzt ohne Schatten). Schatten werden in JEDEM Bild neu gerechnet
  (`shEvery: 1`): sie nur jedes n-te Bild zu rechnen ergab abwechselnd kurze und lange Bilder – auf dem Tablet ein
  sichtbares Zittern. Nicht wieder einführen. Herunter geht es bei unter 30 Bildern/s
  oder vielen langen Einzelbildern, hinauf selten und auf Probe; eine Stufe, die zweimal nicht hielt, bleibt für
  die Sitzung gesperrt – jeder Wechsel ruckelt selbst. Neue teure Effekte an eine Stufe hängen.
  Gemessen (Nov. 2026): die Spiellogik braucht unter 2 ms je Bild; Ruckeln kommt von der Grafikseite.
  Messen: `__mtCam.noRender(true)` lässt das Zeichnen aus, dann zeigt ein CPU-Profil die reine Rechenzeit.
- **Schatten beim Selbstfahren:** `focusShadow` legt die Schattenkarte eng um die Figur (`SHADOW_NEAR`), der
  Ausschnitt springt in groben Schritten mit. Gleiche Auflösung auf kleiner Fläche = scharfe Schatten von Figur
  und Bäumen aus der Nähe; in der Übersicht gilt wieder die ganze Karte.
- **Wasser** (`Water3D.js`): `prepareWater` gräbt Seebecken und Bachbetten ein (vor dem Geländenetz),
  `buildWater` legt eine Shader-Fläche darüber (Tiefe, Wellen, Spiegelung, Strömung). Wasserpunkte sind
  `landcover === 2`; die Bodenfarbe darunter kommt aus `waterBedColor`.
- **Gondelkabinen** der 4er-/6er-/8er-Bahnen kommen aus `makeCabinKit` in `Buildings3D.js`: Form einmal je
  Bahn, jede Kabine nur vier Teile. Teile, die sich ein Material teilen, tragen ihre Farbe als Eckfarbe.
- **Farben:** Die Bildaufbereitung (Composer) gibt die Werte ohne Tonwert-/Farbraumstufe aus; das Bild ist darauf
  abgestimmt. Nicht nebenbei auf den direkten Renderpfad oder eine Ausgabestufe umstellen.
- **Fallstrick:** `vertexColors: true` nur setzen, wenn die Geometrie ein Farbattribut hat – sonst wird das
  Material schwarz. Farben je Instanz (`setColorAt`) brauchen den Schalter nicht.
- **Bäume** stehen zu Zehntausenden: Geometrie sparsam halten. Nadelbäume bestehen aus Stern-Kränzen
  (`treeTier` in `TerrainMesh.js`: lange, leicht hängende Astspitzen mit Einschnitten dazwischen – zackige
  Silhouette bei rund 50 Dreiecken je Fichte, Unterseite nur am untersten Kranz, Stamm dreikantig und offen).
  Eckfarben schattieren von innen (dunkel) nach außen (hell); deshalb trägt das Baum-Material jetzt
  `vertexColors` und ALLE drei Baumformen ein Farbattribut. Die Schneehauben sind dieselben Sterne, nur der
  obere Teil (`cap`). Das Umland nutzt `treeTier` ebenfalls. Standorte sind gewürfelt und in der Zelle versetzt
  (`treeCell`, `treeJitter`) – kein Raster, keine Reihen.
- **Ausprobieren:** nur bei `npm run dev` gibt es `window.__mtCam` (Kamera stellen: `orbit.setState`,
  Tageszeit: `clock`/`CYCLE`, Qualitätsstufe: `quality.set`, Wetter: `weather`, Geländepunkt unter einem
  Bildpunkt: `raycastTerrain`) und den Direktstart `http://localhost:5180/?level=<id>` (z. B. `schweiz`).
  Die Uhr dabei nur vorwärts stellen.
- App-Symbole neu erzeugen: `python3 tools/make-app-icons.py public/bg/logo.png public/pwa` (in `webgl-3d/`).

## Selbst fahren (3D)
- `src/webgl/SkiRun.js`: der Spieler steuert einen eigenen Skifahrer. „Fahren" in der Werkzeugleiste schaltet
  auf Startpunkt-Wahl (`pickSki`), der nächste Klick bzw. das nächste Antippen setzt die Figur dort ab (sie
  fällt aus kurzer Höhe; auf Wasser und Gebäuden geht es nicht). Die Simulation läuft weiter; gespeichert wird
  davon nichts.
- Die Szene schaltet dafür die Kamerasteuerung ab (`orbit.setEnabled`) und ruft im Bildtakt `skiRun.step`
  statt `orbit.step`; Bau-Eingaben sind solange gesperrt. Schnittstelle der Szene: `pickSki`, `stopSki`,
  `skiInput`, `skiTakeLift`, `setOnSki` (meldet dem HUD `{picking}` bzw. Tempo, Lift-Angebot, Hinweis).
- Bedienung: Tasten A/D/W/S; am Handy zwei große, zurückhaltende Lenktasten (`SteerPad` in `World3D.jsx`,
  beide zugleich = bremsen), das Bild gedrückt halten = Schuss bzw. gehen. Weitere Knöpfe sind nicht gewollt.
- Fahrmodell: Hangabtrieb entlang der Fahrtrichtung, Reibung je Untergrund (Piste, Tiefschnee, Wald). Wer steht
  oder bergauf will, geht mit „vorwärts" Schritt für Schritt weiter; auf aperer Wiese werden die Ski geschultert.
  Es blockieren Kartenrand, Gebäude sowie – nur abseits der Piste – Wasser und Felsblöcke (die Felsen sind bloß
  grob gerastert bekannt). Schneestaub: kleiner Punkte-Vorrat (`stepDust`), mehr in Kurve und beim Bremsen.
- Figur: `SkiFigure.js` (`makePlayerSkier`) – runde Gliedmaßen mit Knie- und Ellbogengelenk, Ski an den
  Füßen, Stöcke in den Händen. `userData.setPose({...})` stellt die ganze Haltung (Kniebeuge je Bein, Pflug,
  Oberkörper, Arme, `sit` für den Sessel) und hält dabei die Ski flach; `setCarry` schultert die Ski.
  `roll`/`twist` richten den Oberkörper gegen die Schräglage der Beine auf (Hüftknick in der Kurve). Aussehen:
  taillierte Jacke mit Schulterpolstern, dunkler Helm mit Zierstreifen, helle Skischuhe, kleiner Rucksack.
  Gliedmaßen verjüngen sich (`limb` mit `taper`), Jacke und Hose tragen eine erzeugte Normalenkarte (`fabricNormal`:
  Falten, nur ein Hauch Gewebe – kräftiger wirkt es wie ein Netz), das Gesicht hat Kinn, Nase, Mund, Ohren und –
  ohne Brille – Augen. Faltenringe an Knie und Ellbogen wurden ausprobiert und verworfen (sahen aus wie Schlaufen).
- Gäste (`makeSkier` in `Vehicles3D.js`): Oberschenkel, Rumpf, Arme und Schuhe sind geteilte Kapseln (`GUEST_GEO`)
  statt Kisten – gleiche Zahl an Netzen, nur runder.
- Outfits: `SkiOutfits.js` – je Outfit ein Satz Farben und Formschalter (Kopfbedeckung, Brille, Jacke/Pullover/
  Einteiler, Streifen, Rucksack, Passform `fit`), jedes mit Jahreszahl von heute bis 1935. Die Teile sind einzeln
  kombinierbar: `SLOTS` (Kopf, Oberteil, Hose, Schuhe, Ski) nennt je Teil die Felder, die es mitbringt;
  `composeOutfit(auswahl)` setzt daraus das Outfit zusammen, das `makePlayerSkier` baut. Gewählt wird im Hauptmenü
  unter „Fahrer" (`Wardrobe.jsx`: ganze Outfits und Einzelteile, drehende Vorschau), gespeichert als JSON in
  `localStorage['mt.outfit']` bzw. je Konto `mt.outfit:<Name>`. Ein neues Outfit ist nur ein weiterer Eintrag in
  `OUTFITS`. Für die Ski gibt es zusätzlich `SKI_BRANDS` (bekannte Hersteller in ihren typischen Farben – nur der
  Name als Schrift, keine Logos oder nachgebauten Dekore).
- Sportarten: `SPORTS` und `SPORT_OUTFITS` in `SkiOutfits.js`. Alpin ist die frei kombinierbare Garderobe; für
  Langlauf, Eishockey und Gleitschirm gibt es je eine Handvoll ganzer Ausrüstungen (`gear`: schmale Ski und lange
  Stöcke, Gewehr `rifle`, Gitter `eyes: 'cage'`, Gurtzeug). Die Wahl je Sportart liegt im selben Speicher
  (`sport_<id>`, `getSportChoice`/`setSportChoice`); `composeOutfit(auswahl, sportart)` liefert das Outfit. Im Spiel
  zieht sich die Figur selbst um (`dress` in `SkiRun.js`): Loipe und Schießstand = Langlauf, Eisbahn = Eishockey,
  Flug = Gleitschirm, sonst Alpin – zurück zu Alpin erst nach gut zwei Sekunden, damit es am Loipenrand nicht flackert.
- Erster Besuch: hat das Konto noch keine Auswahl (`hasChosenOutfit`), zeigt das Hauptmenü zuerst nur die
  Garderobe mit Begrüßung; erst nach „los geht's" erscheinen die Reiter.
- Anleitung: `components/menu/Guide.jsx` – drei Blätter (Ablauf, Bedienung, Installation als App auf iPhone/iPad
  und Android; das eigene Gerät steht vorn). Beim allerersten Besuch kommt sie VOR der Garderobe (`hasSeenGuide`
  in `guideSeen.js`, gemerkt in `localStorage['mt.guideSeen']` bzw. je Konto), danach liegt sie im Menü unter
  „Anleitung" (am Handy „?"). Ändert sich Ablauf oder Bedienung, die Texte dort nachziehen.
- Stoff im Fahrtwind: `userData.setWind(tempo 0…1, t)` lässt weite Teile flattern (Maßstab von Jacke und
  Hosenbeinen, dazu ein Jackenschoß), normale leicht, enge (`fit: 'tight'`, Einteiler) gar nicht.
- Wer steht, bleibt stehen (auch am Hang) – los geht es erst mit „vorwärts".
- Fahrgefühl: Schräglage und Kniebeuge wachsen mit dem Tempo, beim Kantenwechsel entlastet die Figur kurz
  (`hop`), nach Sprüngen federt sie ab und wirft eine Schneewolke (`burstDust`). Die Kamera weitet mit dem Tempo
  den Bildwinkel, legt sich in die Kurve und rüttelt bei hoher Fahrt leicht. Hinter den Skiern bleiben Spuren
  (`stepTrail`, ein Band der letzten Meter).
- Anlagen (`skiRunAt` in der Szene liefert Art, Lage längs/quer und Achse): Kicker und Funpark stehen im Gelände,
  der Sprung ergibt sich aus der Fahrphysik. Halfpipe: gefahren wird auf der SCHALE (`skiSurfaceAt`, dieselbe
  Formel wie bei den Gästen), nicht in der tieferen Mulde; in der Rinne gibt es etwas Schwung dazu, an der Kante
  geht es hoch, die Fahrtrichtung wird an der Pipe-Achse gespiegelt, und die Figur treibt in der Luft zurück in
  die Wand und talwärts. Die Kamera steht dort über der Rinne und schaut sie hinunter (nie hinter dem
  Startbanner). Rennstrecke: Zeitnahme vom ersten bis zum letzten Tor, Bestzeit je Strecke (nur für die Sitzung).
  Anlagen belegen Bauplatz, blockieren den Fahrer aber nicht. Das Tempo `v` gilt entlang der Oberfläche
  (`hCos`), sonst stimmt am Steilhang nichts.
- Tricks (`takeOff`/`land`): in der Luft drehen links/rechts die Figur, „vorwärts" ist der Salto vorwärts,
  Bremsen der Salto rückwärts – frei mischbar, die Fahrtrichtung bleibt. Nur bei echten Sprüngen (auf einer
  Anlage oder mit kräftigem Absprung). Gelandet wird sauber, wenn auf halbe Drehungen bzw. ganze Salti
  ausgedreht ist – dann gibt es Namen und Punkte (Pipe ×1,5), sonst einen Sturz (`crashT`).
- Einkehr: nahe einem Gastro-Gebäude (`HUT_NAMES`) bietet das HUD „Einkehren" an (`toggleHut`): Ski geschultert,
  die Kamera kreist langsam um die Stelle, Blick durch Ziehen drehbar.
- Ton: `SkiSound.js` erzeugt alles aus Rauschen und Summern (Fahrtwind, Kanten, Liftsurren, Landung), keine
  Dateien. Start erst aus einer Eingabe heraus; „Ton an/aus" im HUD, gespeichert in `localStorage['mt.skiSound']`.
- Lift: nahe einer Talstation bietet das HUD die Bergfahrt an. Die Figur wartet auf das nächste Fahrzeug der
  Anlage (`model.carriers`, Platz über `model.seatPos` wie bei den Gästen) und fährt wirklich mit – aber nur
  in eine fahrende Anlage (im Bau stehen die Fahrzeuge still und sind gestaucht). `skiRun.step` läuft in der
  Szene NACH den Anlagen-Updates und rechnet mit `updateWorldMatrix`, sonst hängt man eine Bildlänge hinter
  der Kabine. Kabine: Kamera auf dem Platz vorn in der Mitte (Nahebene 0.05), Blick durch Ziehen drehbar;
  die Kabinen sind massiv, deshalb hängt `fitCabin` für die Fahrt Decke, Lichtband und Fensterrahmen hinein,
  und die Szene blendet die Mitfahrer dieser Kabine aus (`skiRun.cabinCar()`). Sessel: die
  Figur sitzt (`sit`), Kamera dicht dahinter, rundherum schwenkbar. Schlepp-/Tellerlift: die Figur steht im
  Schnee; `placeTow` zeichnet beim Schlepplift Bügel und Zugseil, beim Tellerlift Teller und Stange. Anlagen ohne Fahrzeuge oder im Bau: Ersatzfahrt am Hang
  entlang. Oben steht man neben der Bergstation (`arrive`) und entscheidet selbst, wohin es geht.
- Prüfen ohne flüssiges Bild: `window.__mtCam.ski()` liefert das Modul; `start(x, z)`, `setInput` und
  `step(1/60, t)` in einer Schleife spulen die Fahrt vor, `__state()` zeigt Ort und Tempo. `__mtCam.buildLift(art,
  ax, az, bx, bz)` stellt ohne Dialog und Bauzeit einen Lift hin, `__mtCam.place(art, gx, gy)` ein Gebäude oder
  eine Anlage (Anlagen brauchen eine extrabreite Piste: `route.width = 'xwide'`). Die Fahrzeuge bewegen sich nur in echten Bildern.

## Langlauf und Biathlon
- **Loipe** (`Loipe3D.js`, `buildLoipePath` in `Scene3D.js`): gebaut mit dem Pistenwerkzeug in der Breite `'loipe'`
  (Menü „Pisten", Spielstand-Aktion `p` mit `w: 'loipe'`). Sie wird NICHT bergab ausgerichtet, darf bis 9° steigen
  und fallen und auch eine Runde sein. Das Band ist ein Pistenband (`noWear`: verspurt nicht, keine Raupe nötig),
  dazu klassische Spuren an beiden Rändern. Loipen stehen nicht in `guestRoutes` – die Gäste-Logik kennt sie nicht.
  `createLoipen` verwaltet sie: `add`, `at(gx, gy)`, `dirAt`, `update(dt, tagsüber)`. Die Verwaltung wird früh
  angelegt (gleich nach `sim`), weil der Bildtakt schon während des Aufbaus der Szene läuft.
- **Langläufer:** eigene kleine Schar (höchstens `MAX_SKATERS`, je Läufer vier Netze, ein Material mit Eckfarben),
  Skatingschritt hin und zurück bzw. im Kreis, bergauf langsamer, bergab in der Hocke; nachts und ohne Schnee
  unsichtbar. Jede Ankunft am Loipenende bringt `LOIPE_FEE`.
- **Spielfigur:** auf der Loipe (`deps.loipeAt`) wird „vorwärts" zum Skatingschritt (`skating` in `SkiRun.js`,
  Haltung über `splay`/`outL`/`outR` in `setPose`). Beim Absetzen auf einer Loipe schaut die Figur in Laufrichtung.
- **Kraftregler statt Lenken** (`autoSk`, `power`): läuft man in Loipenrichtung los, lenkt die Figur selbst
  (`deps.loipeTrack` → `loipen.trackAt`, Zielpunkt ein Stück voraus auf der Achse, am Ende einer offenen Loipe
  wird gewendet, in der Wende nimmt sie Tempo heraus). Der Spieler stellt nur die Kraft: „vorwärts" bzw. rechte
  Taste mehr, „bremsen" bzw. linke Taste weniger; sie bleibt stehen, wo man sie lässt. A/D steigen aus der
  Selbstlenkung aus. Kraft bestimmt Tempo und Pulsziel; über 168 Schlägen füllt sich `spentAcc` (rund 5 s), dann
  ist die Figur `spent`: Kraft höchstens 0,22, bis der Puls unter 128 liegt. Das HUD zeigt Kraftbalken und Zustand.
- **Puls** (`stepPulse`): folgt träge der Anstrengung – Skating nach Tempo und Steigung, Gehen bergauf, Abfahren
  nur wenig; hinauf schnell, hinunter langsam. Das HUD zeigt ihn NUR auf der Loipe und am Schießstand – beim
  Abfahren, auf dem Eis und im Flug spielt er keine Rolle.
- **Schießstand** (`Biathlon3D.js`, Gebäude `biathlon`): drei Stände, geschossen wird auf dem mittleren
  (`userData.shoot`: Standpunkt, fünf Scheiben, `reset`, `hit`). Nahe am Stand bietet das HUD „anlegen" an
  (`toggleShoot`): Blick durchs Visier mit engem Bildwinkel, Ziehen richtet es aus, „Schuss"/Leertaste löst aus
  (`fire`). Es schwankt das ganze Bild – Grundunruhe, Atem und ein Ruck je Herzschlag, alles mit dem Puls
  stärker; im Anschlag sinkt der Puls langsam. Getroffen ist die Scheibe unter der Bildmitte im Augenblick des
  Schusses. Der Diopterring im HUD bekommt seine Größe aus der Szene (`shooting.ring`).
- **Flutlicht an Gebäuden:** Schießstand und Eisbahn haben `userData.setNight(dark)` (Strahler, Eigenlicht der
  angestrahlten Flächen, Lichtkegel nur als Hauch und erst bei Dunkelheit – kräftige Kegel wirken aus der Nähe
  wie gelbe Flächen). `placeBuildingAt` hängt jedes Gebäude mit `setNight` an `nightLit`.

## Gleitschirm mit Ski
- `Paraglider3D.js`: `makeGliderLaunch` (Gebäude `paraglide`, Menü „Extras": Rampe, Windsack, ausgelegter Schirm)
  und `makeCanopy` (Kappe mit Leinen; Ursprung am Gurtzeug). Nahe am Startplatz bietet das HUD den Start an
  (`launchGlider`, Taste G): die Figur hebt in Falllinie ab, `stepGlide` fliegt mit Gleitzahl rund 10
  (links/rechts lenkt, „vorwärts" schneller und steiler, Bremsen langsamer), am Kartenrand dreht sie zurück.
  Berührt sie den Boden, fällt der Schirm zusammen und es geht auf Ski weiter. Stöcke sind im Flug ausgeblendet
  (`setPoles`). Gebäude und Bäume halten den Flug nicht auf.
- Höhe: beim Start hebt der Schirm kräftig an, und wo das Gelände unter der Flugbahn steil abfällt, trägt
  Hangaufwind (bis rund 45 Einheiten über Grund) – sonst klebte der Flug am Hang und es bliebe keine Luft für Manöver.
- Manöver (`stepGlide`): **Steilspirale** – lange in eine Richtung ziehen (`holdT`), enger und steil hinunter, Punkte
  je Umdrehung. **Wingover** – im Takt links/rechts umlenken (`wing`, `swing`), Punkte je Wechsel. **Looping** – mit
  viel Fahrt („vorwärts") kräftig anbremsen, nur mit genug Höhe; Figur und Kappe drehen einmal über Kopf.

## Eisbahn (Eishockey)
- `IceRink3D.js` (`makeIceRink`, Gebäude `eisbahn`): Feld mit Linien, Bande mit Eingang vorn in der Mitte (lokal
  +z), zwei Tore, Torhüter, Puck. Das Spiel steckt in `userData.rink` (`step`, `touch`, `shoot`, `onGoal`), alles in
  Koordinaten der Bahn; `userData.update` treibt Puck und Torhüter auch ohne Spieler an.
- Szene: `rinkAt(wx, wz)` rechnet Weltpunkte in die Bahn um (`inside` = auf dem Eis, `zone` = Eis samt Vorplatz,
  dort darf die Spielfigur trotz Baufläche hin); `skiSurfaceAt` liefert auf dem Eis dessen Höhe. Die Gäste laufen
  ihre Ellipse jetzt in der Ausrichtung des Gebäudes.
- Spielfigur (`ice` in `SkiRun.js`): Schlittschuhe und Schläger statt Ski und Stöcken (`setIce` in `SkiFigure.js`),
  „vorwärts" läuft, ohne Eingabe gleitet sie aus. „Bremsen" ist am Puck der Schuss, in Fahrt ein kleiner Sprung
  (links/rechts dreht, anderthalbfache Drehrate, keine Salti – gewertet wie die anderen Tricks), im Stand die
  Bremse. Der Puck wird durch Berühren geführt. Aufs Eis und herunter geht es nur durch den Eingang; an der Bande
  prallt man ab.

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
- **Pisten:** Jede Piste (auch die Startabfahrt) hat ein Band knapp über dem Gelände (`buildPisteBand` in
  `Scene3D.js`, Material `makePisteMaterial` in `SnowSurface.js`). Der Zustand steht je Eckpunkt in `aState`
  (Schneedecke, Präparierzustand aus `bed.groom`) und wird in `repaintPisteBeds` fortgeschrieben: frisch gewalzt
  = Raupenbahnen und Rillen, verspurt = graue Fahrspuren, ausgeapert = Band blendet aus. Die Farbe der
  Schwierigkeit ist aus der Ferne ein Farbband, aus der Nähe nur ein Hauch und eine Randlinie. Sie richtet sich
  nach dem steilsten Fünftel der Strecke (`pisteDifficulty`: Stücke von sechs Kacheln, 80 %-Wert; ab 35 % rot,
  ab 55 % schwarz), nicht nach dem Mittel – sonst macht jeder flache Auslauf die Abfahrt blau.
  Kreuzungen: `refreshPisteJoins` trägt je Kachel ein, welche Pisten dort liegen, und gibt jedem Eckpunkt den
  Anteil `aJoin`; das Material blendet dort Randlinie, Farbband und Walzmuster aus, sodass die Flächen
  zusammenlaufen. Beginnt oder endet eine Piste auf einer anderen, weitet sich ihr Band dort zum Trichter. Wer Gelände
  unter einer Piste ändert, ruft `bed.reseat` (macht `flattenUnderBuilding` schon).
- **Startpunkt:** Talstation = tiefste Randkachel, von dort mindestens `BASE_IN` Kacheln ins Gebiet (sonst
  klemmt das Dorf am Rand und die Zufahrt findet keinen Weg). Bäche und Seen meiden die Linie Dorf–Gipfel.
  Liegt dieser Punkt schon im Anstieg, sucht die Szene im Umkreis eine flachere, nicht höhere Stelle (Abschnitt
  „Bauplatz für den Ort" in `Scene3D.js`) – sonst stünde der Ort auf einer aufgeschütteten Kuppe. Der Platz wird
  auf das untere Drittel der Höhen eingeebnet (abtragen statt aufschütten) und läuft umso breiter aus, je größer
  der Höhenunterschied ist. Die Startgebäude (Kasse) werden erst NACH den Ortschaften auf Höhe gesetzt.
- **Prüfen ohne Spiel:** `node tools/relief.mjs <ordner> [level …]` zeichnet die Landschaft als Reliefbild
  (mit Umland, Spielfeld als Rahmen) und druckt Hangneigung, Wald-, Wasser- und Eisanteil.

## Start eines Gebiets und Liftlängen
- Ein Gebiet beginnt **leer**: Ort und Zufahrt stehen; Bahn, Piste und Kasse baut der Spieler selbst (`START_EMPTY` in
  `createScene3D`). Die frühere Startanlage (Gondel Basis–Gipfel samt Abfahrt) gibt es nur noch für Spielstände
  ohne `st` im Stand (`legacyStart`, in `World3D.jsx` aus dem geladenen Stand abgeleitet) – ihnen fehlte sonst
  der Hauptlift. Code, der Lifte oder Pisten voraussetzt, muss mit leeren Listen zurechtkommen.
- Kasse: Gäste ohne Skipass gehen zur nächsten Kasse – bevorzugt in kurzer Gehweite, sonst bis `TICKET_WALK_FAR`
  (110 Kacheln; `nearestTicketDesk`, `sendWalk`, `lotDesk`). Ein schmaler Bach hält sie dabei nicht auf, ein See
  schon. Orte ohne Kasse in dieser Reichweite warten, bis der Spieler dort eine baut.
- Gäste und der Schrittbegrenzer (`clampStep` am Ende von `updateGuests`): er bremst jede Figur auf Gehtempo. Wer
  eine Figur an einen entfernten Ort versetzt, muss sie deshalb SETZEN (Position und `_prevPos`), sonst zieht der
  Begrenzer sie in gerader Linie dorthin – Leute, die über die Karte schweben. Neue Gäste werden beim Einsatz an
  ihren Startpunkt gesetzt; zur Station gehen sie (`queueAt` in `planNext`), statt sich aus bis zu `R_LINK`
  Kacheln Entfernung direkt anzustellen. Prüfen: `__mtCam.fastForward(n, dt, each)` spult Gäste und Anlagen vor,
  `__mtCam.guests()` liefert die Figuren.
- Gäste am Berg: oben an einer Bergstation steigt ein Teil in eine Anschlussbahn um, wenn eine weiter hinaufführt
  (`planNext`, „Umsteigen"). Wer am Ende einer Abfahrt steht und keinen Anschluss in der Nähe hat, geht zur
  nächsten Talstation bis `WALK_HARD_MAX_LIFT` (Schritt 7b) – die Regel „nie zu Fuß in einen fremden Ort" gilt nur
  für Gäste, die selbst in einem Ort stehen.
- Freischaltung: `UNLOCK` in `World3D.jsx` nennt je Werkzeug den Index des Kampagnen-Levels, ab dem es wählbar ist
  (`lockedUntil`); gesperrte Einträge zeigen im Baumenü das Level. Die Sandbox hat alles. Nur das Menü sperrt –
  Spielstände bauen weiterhin alles nach. Neue Werkzeuge dort einsortieren und prüfen, dass die Aufgaben des
  Levels erfüllbar bleiben. Startgeld je Level: `startingMoney` in `constants/campaign.js`.
- Level-Sperre (`isLevelUnlocked`): offen ist alles bis zum Level nach dem weitesten geschafften; ein Level mit
  eigenem Spielstand bleibt spielbar. Beim Entwickeln (`npm run dev`) und für Admins ist alles frei.
- Kampagne: die Reihenfolge im Feld `CAMPAIGN_LEVELS` ist die Reihenfolge der Level (`index` wird daraus gesetzt):
  Schwarzwald, Alpenvorland (`vorland`), Wallis, Savoyen, Tirol (`alpen`), Dolomiten … Die Ids bleiben, Spielstände
  und Fortschritt hängen daran. Ein neues Level braucht Einträge in `MASSIFS`, den Tabellen je Level-Id
  (`ROCK_STYLES`, `VSTYLE`, `VNAMES`, `VILL_RANK` in `Scene3D.js`, `PeakNames.js`, `FOREST_MIX_TABLE`), in
  `LOADING_LEVELS` und zwei Bilder: `public/levels/<id>.png` (Nummer, Name, Land sind Teil der Grafik) und
  `public/loading/<id>.png`. `python3 tools/make-level-cards.py` baut beide aus einem Bildschirmfoto und schreibt
  nach dem Umstellen der Reihenfolge die Nummern auf den Karten neu.
- Pistenraupen: drei Klassen – PB 300, PB 500, PB 600 Winde (`garage…`, `garage5_…`, `garage6_…`; `makeSnowcat`
  in `Vehicles3D.js`, Modell '300' | '500' | '600'). Größere Klassen präparieren mehr (`groomRate`). Am Ende von
  `makeSnowcat` werden alle festen Teile je Material zu einem Netz verschmolzen (rund 30 statt 200 Zeichenaufrufe
  je Raupe) – neue Teile davor anfügen; was sich bewegt oder ein-/ausgeblendet wird, als Gruppe oder mit eigenem
  Material anlegen. Für andere Fahrzeuge mit vielen Einzelteilen gilt dasselbe Rezept.
- Jede Liftart hat eine Höchstlänge (`max` in `LIFT_PARAMS`, in Kacheln; angezeigt in Metern, 30 Kacheln ≙ 100 m):
  Förderband 100 m, Tellerlift 200 m, Schlepplift 300 m, Sessel 450–800 m, Kabinenbahnen 900–1800 m, Pendelbahnen
  2500 bzw. 3000 m. Geprüft
  wird beim Bauen (`liftTooLong`: Vorschau rot, Hinweis im HUD), nicht beim Nachbauen eines Spielstands.
- Bodenlifte (Förderband, Teller-, Schlepplift) roden beim Bau den Wald entlang der Trasse und beschneien sie
  (`constructLift`). Gerodet werden die Bäume selbst (`clearForestAlongPath`), die Bodenart bleibt.

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
- Die Sandbox hat keinen Spielstand.

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
  Im Spiel-HUD Glas-Optik. Texte im Spiel auf Deutsch.
- Große Dateien (`Scene3D.js`, `Buildings3D.js`, `World3D.jsx`) gezielt ändern, nicht neu schreiben.
- Keine Sicherungskopien wie `datei.js.bak` anlegen – dafür gibt es git.
