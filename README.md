# Freie Kompanie

Micro-Arena im Browser: Truppenführung in kurzen Gefechten üben und messen. Kiten, Focus-Fire,
Zurückziehen, Steinsalven ausweichen, Kontrollgruppen, dazu Sterne pro Szenario, eine tägliche
Herausforderung, Geisterläufe und Replays. Die Welt ist eine spätmittelalterliche Söldnerkompanie
im Grenzland (`docs/WELT.md`); alle Grafiken, Werte und Texte sind eigene (`CREDITS.md`).

## Starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver, dann http://localhost:5173 öffnen
```

Weitere Befehle:

```bash
npm test               # Unit-Tests der Simulation (Vitest, ohne Browser)
npm run typecheck      # TypeScript prüfen
npm run build          # Produktions-Build nach dist/ (statisch, keine Server-Komponente)
npm run preview        # Build lokal ansehen
npm run data:import    # Referenzprofil (Kalibrierprofil) neu importieren, siehe CREDITS.md
npm run data:unverified# Platzhalter des Referenzprofils auflisten
node scripts/write-own-units.mjs   # eigenes Werteprofil (Standard) aus der Tabelle im Skript schreiben
npm run assets:gen -- assets/prompts/<kategorie>/<name>.json   # Bild mit Nano Banana erzeugen (Schlüssel vom Proxy)
npm run assets:manifest                                         # assets/manifest.json für die Vorschauseite
```

Grafik-Vorschau: http://localhost:5173/assets-preview.html zeigt alle erzeugten Grafiken nach Kategorie,
Stilblatt in `ART_BIBLE.md`, Prompts unter `assets/prompts/`, Nachbearbeitung mit `scripts/img/tools.py`.
Figur-Vorschau: http://localhost:5173/figure-preview.html zeigt die geskinnte Figur mit allen Clips
(Zeit, Überblenden, Teamfarbe, Oberkörperdrehung).

### Geskinnte Figuren (Stufe 3, Pilot Bogenschütze)

Der Bogenschütze ist eine geskinnte Low-Poly-Figur (`src/app/render3d/skel/`): gemeinsames
Menschen-Skelett (`humanRig.ts`, 21 Knochen inkl. Requisiten), prozedural gebautes Modell mit weichen
Gelenkgewichten (`meshBuilder.ts`, `humanModels.ts`), Animationssatz als Posenfunktionen
(`animClips.ts`: Stehen, Bereit, Gehen, Rennen, Spannen, Lösen, Nachlauf, Treffer, drei Sterbe-
Varianten). Die Clips werden beim Start in eine Knochen-Textur gebacken (`animBake.ts`), das Skinning
läuft im Vertex-Shader eines InstancedMesh mit Überblenden zwischen zwei Clips und Oberkörperdrehung
zum Ziel (`skinnedUnits.ts`). Die Animationszeit kommt strikt aus der Simulation: Spannen = Windup-
Fortschritt, Lösen/Nachlauf = Recovery-Ticks, Laufphase = zurückgelegte Strecke, Treffer und Tod aus
den Ticks. Textur-Atlas: `python3 scripts/img/atlas.py src/data/atlas/archer.json public/textures/units/archer`
(Farbe plus Teamfarben-Maske; die Teamfarbe wird im Shader eingefärbt).

Alle acht Einheitentypen laufen über diesen Weg (`UNIT_SPECS` in `skinnedUnits.ts`): Fußtruppen mit je
einem Animationssatz pro Waffe (`humanClipSets.ts`: Bogen, Speer, Schwert mit Schild, Armbrust),
Kavallerie als Pferd (`horseRig.ts`, `horseClips.ts`: Schritt, Galopp, Sturmangriff, Treffer, drei
Sterbe-Varianten) plus aufgesetztem Reiter mit Sitzhaltung und einhändiger Waffe, Belagerung mit einem
kleinen Skelett aus Gestell und Wurfarm bzw. Schlitten (`siegeRig.ts`). Requisiten (Speer, Schwert,
Schild, Armbrust, Bogen) sind handgebaut und werden über die exakte Weltrotation ihres Knochens
ausgerichtet (`setWorldRotationFor`), damit Spitze und Klinge unabhängig von der Armhaltung stimmen.
`figure-preview.html?unit=knight` zeigt jede Einheit mit allen Clips.

### Erzeugte Figurmodelle (Bild → 3D)

Die Körper aller Einheiten (und Pferd, Mangonel, Springald) kommen aus KI-erzeugten 3D-Modellen, die
Waffen bleiben handgebaut. Ablauf am Beispiel des Bogenschützen:

1. Ansichtsblatt (Vorder-, Seiten-, Rückansicht in A-Pose, ohne Waffe) mit `scripts/gen-image.mjs`
   erzeugen und mit `scripts/img/views.py` in die drei Ansichten auf Weiß zerlegen
   (`assets/processed/units/archer-body-*.png`).
2. 3D-Modell rechnen: `NODE_USE_ENV_PROXY=1 node scripts/gen-model.mjs assets/prompts/models/archer-body-hunyuan-mv.json`
   (Hunyuan3D Multi-View über FAL; Ergebnis `assets/raw/models/*.glb`, Vorschau unter
   http://localhost:5173/model-preview.html).
3. Nachbearbeiten: `python3 -I scripts/mesh/process.py assets/raw/models/archer-body-hunyuan-mv.glb public/models/archer --faces 7000`
   verschweißt Texturnähte, reduziert auf ~7 000 Dreiecke, legt neue Texturkoordinaten an (xatlas) und
   backt die Originaltextur darauf neu; dazu Teamfarben-Maske per Farbton-Key (Blau).
   Benötigt `pip install trimesh fast-simplification xatlas scipy rtree pillow`.
   `scripts/mesh/measure.py` schätzt die Armhaltung eines Menschenmodells (A-Pose-Winkel).
4. Beim Laden wird das Modell automatisch auf das gemeinsame Skelett geskinnt (`autoSkin.ts`: Gewichte
   nach Abstand zu den Knochensegmenten in der A-Pose, dann Umrechnung in die Ruhepose) und mit denselben
   gebackenen Clips animiert; Einträge in `generatedModels.ts`. Bis das Modell geladen ist (oder falls es
   fehlt), zeigt die Anwendung den prozeduralen Körper. `figure-preview.html?gen=0` zeigt den Rückfall.

Qualitätsstufen (Einstellungen → Qualität): Niedrig ohne Schatten und mit Pixelverhältnis 1, Mittel mit
2048er-Schattenkarte, Hoch mit 4096er-Karte, weichen Schatten und voller Auflösung.

## Darstellung

Standard ist die 3D-Ansicht (Three.js): perspektivische Kamera schräg von oben (Neigung 45°,
Sichtfeld 35°), um 45° gedreht, sodass die
Karte als Raute erscheint. Der Standardabstand ergibt in Bildmitte etwa 74 px pro Tile bei
2560×1440; dieser Maßstab, die Kollisionsradien (Infanterie 0,22, Kavallerie 0,40 Tiles) und der
Formationsabstand (2·Radius + 0,2 Tiles) wurden in der Entwicklung an Videomaterial gemessen
(`docs/G0-INVENTUR.md`, Abschnitt 4b; das Material wird nicht ausgeliefert). Die Lage von Bäumen, Felsen, Büschen und
Gebäude-Kulisse ist prozedural (deterministisch aus dem Karten-Seed); Bäume und Felsen haben
Kollision (Einheiten laufen um sie herum), die Kampfzone in der Kartenmitte bleibt frei.

### Gelände, Landschaft und Effekte (Stufe 3, H4)

Der Boden mischt fünf erzeugte, kachelbare Texturen (`public/textures/terrain/`: Gras, sattes
Gras, trockenes Gras, Erde, Sand; Prompts unter `assets/prompts/terrain/`, Nahtkorrektur mit
`scripts/img/tools.py seam`) über eine Verteilungskarte aus dem Karten-Seed
(`src/app/render3d/terrain.ts`): weiche Flecken je Bodenart, eine zweite gedrehte Abtastung gegen
sichtbare Kachelwiederholung und eine großflächige Helligkeitsvariation. Bäume (Eiche, Kiefer),
Felsen, Büsche und Häuser sind erzeugte 3D-Modelle (`public/models/{oak,pine,boulder,bush,house}.glb`,
Bild → 3D wie bei den Figuren, Prompts unter `assets/prompts/scenery/` und `assets/prompts/models/`),
als Instanzen je Modell gezeichnet (`src/app/render3d/scenery.ts`); Laub wiegt leicht im Wind
(Vertex-Verschiebung im Shader, rein dekorativ). Laubkronen texturiert der Generator schlecht,
deshalb projiziert `scripts/mesh/process.py --project <bild.png>` das freigestellte Bild flach auf
das Netz (Eiche, Busch).

Effekte (`src/app/render3d/effects.ts`): Pfeile mit Schaft, Spitze und Befiederung; Staub und
Funken als weiche, zur Kamera gedrehte Flecken (erzeugte Textur, Deckkraft je Instanz);
Mangonel-Einschläge hinterlassen einen Krater-Aufkleber (`public/textures/effects/crater.png`,
erzeugt und freigestellt), der nach 40 s verblasst. `effects-preview.html` zeigt alle Effekte mit
synthetischen Ereignissen zur Sichtprüfung. Alle Zeitpunkte stammen aus Simulationsereignissen;
nichts davon beeinflusst die Simulation.

Bildqualität: »Mittel« und »Hoch« zeichnen über eine Nachbearbeitungskette mit MSAA-Ziel
(Kantenglättung), »Hoch« zusätzlich mit Umgebungsverdunklung (GTAO) und weicheren Schatten;
»Niedrig« zeichnet direkt ohne Schatten. `?scenario=<id>` und `?cam=x,y` in der URL
stellen Szenario und Kamerablick für Screenshots ein.

Figuren (G2) sind prozedural aus Grundkörpern mit Gelenken gebaut und pro Körperteil instanziert
(ein Draw-Call je Teil für alle Einheiten): Speerkämpfer mit Speer, Bogenschütze mit Bogen, Schwertkämpfer
mit Schwert und Schild, Reiter mit Speer, Ritter mit Lanze und Schild auf Pferden, Armbrustschütze,
Mangonel mit Wurfarm, Springald mit Bogenarmen. Teamfarbe auf Rumpf und Schild. Animationen kommen
strikt aus dem Simulationszustand: Laufen mit Schrittfrequenz aus der zurückgelegten Strecke,
Ausholen über genau die Windup-Zeit der Daten, Stoß/Hieb/Abschuss am Schadenszeitpunkt, Nachlauf,
Trefferreaktion, Umkippen beim Tod (Körper bleibt 2,5 s liegen), sichtbarer Abbruch beim Windup-
Cancel. Pfeile und Bolzen fliegen mit Bogenbahn und dem Tempo aus den Daten, Mangonel-Steine
hoch mit Einschlagzone am Boden und Staub, Ansturm-Staub, Trefferfunken, Klickmarker (grün Bewegen,
rot Angriff, gelb eingereiht). Ton synthetisch über Web Audio (Bogensehne, Treffer, Tod,
Befehlsbestätigung), in den Einstellungen abschaltbar.
Der Knopf "Ansicht" (oder Einstellungen → Ansicht) schaltet auf die bisherige 2D-Draufsicht als
Debug-Ansicht um; Auswahl, Befehle und Kamera funktionieren in beiden. Klicks treffen die Figur
(projizierte Fuß- bis Kopfposition), der Auswahlrahmen arbeitet im Bildschirmraum.

### HUD-Grafiken (Stufe 3, H5)

Alle Oberflächengrafiken sind erzeugt (Prompts unter `assets/prompts/ui/`, Dateien unter
`public/ui/`): ein Paneelrahmen als 9-teiliges Randbild (`frame-panel.png`, CSS `border-image`),
ein Zierring um die Minimap (`frame-minimap.png`, im Overlay-Canvas über die Scheibe gezeichnet),
gemalte Befehlssymbole für das Raster (`icon-*.png`; Zellen ohne Bild behalten das Strichsymbol),
Porträts je Einheitentyp (`portrait-*.jpg`) auf den Auswahlkarten und im Detailfeld sowie ein
Ladebildschirm (`loading.jpg`, Schlüsselbild des Stils), der bleibt, bis die erzeugten 3D-Modelle
geladen sind. Die Minimap-Scheibe ist jetzt 62 % des Feldes, damit der Ring hineinpasst; die
untere Leiste selbst lässt Klicks durch (vorher schluckte der leere Streifen über den Paneelen
Klicks auf die Karte).

### Leistung und verbleibende Schwächen (Stufe 3, H6)

Die FPS-Anzeige oben rechts (Einstellungen → FPS anzeigen) zeigt jetzt auch Zeichenaufrufe und
Dreiecke je Bild; `?perf=1` in der URL schreibt die Werte sekündlich in die Browser-Konsole.
Szenario 11 (`leistungstest`, 100 gegen 100) bei 1280×720, alle 200 Einheiten ausgewählt und im
Bild (hardwareunabhängige Werte, gemessen ohne Grafikkarte im Software-Renderer):

| Stufe   | Zeichenaufrufe | Dreiecke je Bild | Durchgänge                          |
|---------|---------------:|-----------------:|-------------------------------------|
| Niedrig |             16 |         1,25 Mio | Bild direkt, keine Schatten         |
| Mittel  |             31 |         2,67 Mio | + Schattenkarte, MSAA-Ziel          |
| Hoch    |             58 |         4,16 Mio | + Normalen-Durchgang für GTAO       |

Die Simulation braucht mit 200 Einheiten 1,8 ms je Tick (`tests/simPerf.test.ts`, Node). Die
Einheitenmodelle wurden dafür von 7000 auf 3500 Dreiecke reduziert (Pferd 4000, Belagerung 2500),
ohne sichtbaren Unterschied im Spielabstand. Bilder pro Sekunde auf echter Hardware lassen sich
hier nicht messen; Richtwert: 60 FPS auf »Hoch« brauchen eine Grafikkarte, die etwa 250 Mio
Dreiecke je Sekunde zeichnet (dedizierte Karten ab Mittelklasse), »Mittel« etwa die Hälfte,
»Niedrig« läuft auf integrierter Grafik.

Vorher-Nachher-Bilder (Stufe 2 → Stufe 3) liegen im Projektordner unter `grafik/h6-vorher-nachher-*.png`.

Verbleibende Schwächen:
- Laubkronen (Eiche, Busch) sind aus der Nähe kantig; der 3D-Generator texturiert Laub nicht, das
  Bild wird flach projiziert.
- Der Kartenrand ist als Helligkeitskante zum Außengelände sichtbar.
- Schild des Soldaten ist ein einfacher Block; Pferdebeine knicken im Galopp etwas eckig; Gesicht
  des Armbrustschützen ist weich.
- Schatten der wiegenden Bäume bewegen sich nicht mit (Tiefenmaterial ohne Windversatz).
- Keine Stufen-Umschaltung der Modelle nach Entfernung (LOD); bei sehr weitem Herauszoomen
  bleibt die Dreieckszahl gleich.
- Umgebungsverdunklung (GTAO) nutzt die ungeskinnte Figur für den Normalen-Durchgang; bei großer
  Nähe kann ein leichter Halo um Arme entstehen.

### HUD (G3)

Das Interface folgt dem klassischen Aufbau von Echtzeitstrategie-Spielen (eigene Grafik, keine fremden Icons):

- Oben links Szenario-Name, Ziel, Szenario-Auswahl, Tempo, Zufallsstart und runde Menü-Knöpfe
  (Einstellungen, Neustart, Pause, Editor, Ansicht 3D/2D, Vollbild). Oben Mitte Zeitalter und
  Spielzeit, oben rechts FPS (abschaltbar).
- Links Kontrollgruppen-Marken (Nummer, Typkürzel, Anzahl): Klick wählt die Gruppe, Doppelklick
  zentriert die Kamera.
- Unten links Zähler statt Ressourcen: ausgewählte, eigene und gegnerische Einheiten, Verluste
  und Ressourcenwert (verloren / vernichtet).
- Unten Mitte die Auswahl-Leiste und das Befehlsraster 5×3: Reihe 2 Angriffsbewegung, Stopp, Patrouille, Verschanzen (ohne Funktion),
  Reihe 3 Formation Linie / versetzt / aufgelockert, Stellung halten, Löschen. Die Beschriftung
  kommt aus der aktuellen Hotkey-Einstellung (A S D, Z X C V ENTF mit "Mein Layout"), Zellen sind
  klickbar, blitzen bei Taste oder Klick auf und zeigen beim Überfahren Name und Taste. Aktive
  Formation und Halten werden hervorgehoben.
- Unten rechts die Minimap als Raute (3D) mit Kamera-Trapez, als Rechteck in der 2D-Ansicht.
- UI-Größe in Prozent in den Einstellungen (60 bis 160 %).

Formationen: Linie = Block in Reihen nach Klasse (Nahkampf vorn, Schützen
dahinter, Kavallerie hinten), Keil = Reihen 1/3/5/… mit der Kavallerie an der Spitze, aufgelockert
= gleiche Ordnung mit doppeltem Abstand. Sie wirken beim nächsten Bewegungsbefehl; Löschen tötet
die Auswahl sofort und zählt als Verlust.

### Leistung (G5)

Szenario 11 ist der
Lasttest mit 200 Einheiten; die FPS-Anzeige oben rechts zeigt Bilder pro Sekunde, Simulationszeit
und Darstellungszeit (JS-Anteil) je Bild. Figuren sind pro Körperteil instanziert, die Simulation
braucht mit 200 Einheiten etwa 1 ms je Tick.

### Auswahl-Leiste und Untergruppen (G4)

Die Leiste zeigt "ALLE (n)" und eine Karte je Einheitentyp in fester Reihenfolge (Speerkämpfer,
Soldat, Bogenschütze, Armbrustschütze, Reiter, Ritter, Mangonel, Springald). Tab wählt die nächste
Untergruppe, Strg+Tab die vorige (Zyklus über "Alle"); die aktive Karte ist gold umrandet und alle
Befehle (Raster, Tasten, Rechtsklick) gehen nur an diese Einheiten. Klick auf eine Karte aktiviert
die Untergruppe, Shift-Klick entfernt den Typ aus der Auswahl, Strg-Klick behält nur ihn (in den
Einstellungen vertauschbar), Klick auf "ALLE" hebt die Untergruppe auf. Bei einem Typ oder aktiver Untergruppe erscheint die Einzelansicht
mit Porträt-Kachel, Name, Zeitalter, Lebenspunkten (Summe / Maximum), Angriff, Rüstung
Nahkampf/Fernkampf, Reichweite und Tempo; sie wird laufend aktualisiert. Stirbt der aktive Typ
vollständig, fällt die Auswahl auf "Alle" zurück; Kontrollgruppen behalten ihre Zusammensetzung.
Szenario 10 ist der Untergruppen-Drill: Ansagen wie "Alle auswählen, Untergruppe Bogenschützen
(Tab), Attack-Move auf den Marker"; ein Befehl zählt nur, wenn genau die verlangten Einheiten ihn
bekommen. Tests in `tests/subgroups.test.ts` (Tab-Reihenfolge, Typ entfernen, Sterben der aktiven
Untergruppe, Kontrollgruppen-Zusammensetzung, Drill-Schritte).

## Steuerung

| Eingabe | Wirkung |
| --- | --- |
| Linksklick | Einheit auswählen |
| Linksklick ziehen | Auswahlrahmen |
| Doppelklick auf Einheit | Alle sichtbaren Einheiten dieses Typs |
| Shift + Linksklick / Rahmen | Zur Auswahl hinzufügen bzw. entfernen |
| Rechtsklick | Bewegen; auf einen Gegner: angreifen (Befehl wird beim Drücken ausgelöst, nicht beim Loslassen) |
| Rechtsklick ziehen | Formation am Ziel in Zugrichtung ausrichten (Befehl wird beim Loslassen ersetzt) |
| Shift + Rechtsklick | Befehl einreihen (Wegpunkte); bei gehaltenem Shift werden die Wegpunkte angezeigt |
| A, dann Linksklick | Angriffsbewegung (Shift beim Klick = einreihen; Rechtsklick/Esc bricht ab) |
| S | Stopp |
| D, dann Linksklick | Patrouille zwischen Standort und Ziel |
| V | Position halten (Shift = einreihen) |
| Z / X / C | Formation Linie / versetzt / aufgelockert |
| ENTF | Ausgewählte eigene Einheiten löschen |
| Tab / Strg + Tab | Untergruppe (Einheitentyp) der Auswahl weiter / zurück; Befehle gehen dann nur an diese |
| Klick auf Typ-Karte | Untergruppe aktivieren; Shift + Klick: Typ aus der Auswahl entfernen; Strg + Klick: nur diesen Typ behalten |
| Strg + 0–9 | Kontrollgruppe auf die aktuelle Auswahl setzen (alle anderen fallen raus) |
| Shift + 0–9 | Auswahl zur Kontrollgruppe hinzufügen |
| Strg + Shift + 0–9 | Auswahl exklusiv in die Gruppe (aus allen anderen entfernen) |
| Strg + Alt + 0–9 | Auswahl aus der Gruppe entfernen; Strg + Backspace: aus allen |
| 0–9 | Kontrollgruppe auswählen; Doppeltipp zentriert die Kamera |
| Strg + Shift + C (oder A) | Alle Militäreinheiten auswählen |
| Strg + Komma / Komma | Alle untätigen / nächste untätige Militäreinheit |
| F5 / Backspace | Kamera auf Auswahl / Kamera zurücksetzen |
| F10 | Einstellungen (auch Hotkey-Menü) |
| Pfeiltasten, Bildschirmrand, mittlere Maustaste ziehen | Kamera |
| Mausrad | Zoom |
| Minimap Linksklick / ziehen | Kamera springt |
| Minimap Rechtsklick | Bewegungsbefehl dorthin |
| F4 | Szenario sofort neu starten |
| F3 | Pause |

Standard-Preset ist "Mein Layout", ein importiertes persönliches Hotkey-Profil
(`src/data/hotkeys/mein-layout.json`, Import mit `scripts/import-hotkeys.mjs`; die Quelldatei
liegt unter `reference/` und wird nicht ausgeliefert). Alle Tasten sind im Einstellungsmenü frei belegbar (Belegen, Entfernen,
Konflikte werden aufgelöst, Reset auf das Preset, Preset wechselbar). Tasten werden als physische Taste gespeichert, deutsche
Layouts funktionieren. Preset-Tasten, die nicht aus dem importierten Profil stammen, sind im
Menü orange markiert. Browser-Standardaktionen (Kontextmenü, Strg+Zahl, Leertaste, F-Tasten außer
F11/F12, Tab, Alt) werden im Spielfeld unterdrückt. Vollbild über den Button (mit Keyboard-Lock in
Chrome/Edge). Optional Pointer-Lock: der Mauszeiger bleibt im Spielfeld (eigener Zeiger), damit
Rand-Scrolling auch im Fenster funktioniert; Esc gibt ihn frei.

## Einstellungen und Kalibrierung

Der Button **Einstellungen** (pausiert das Spiel) öffnet:

- Anzeige: Lebensbalken (immer / bei Auswahl oder Schaden / nur Auswahl), Reichweitenring als
  Zoom-Kalibrierhilfe, Angriffs-Timing-Balken unter eigenen Einheiten (gelb = Ausholen, blau =
  Nachlauf, grau = Abklingzeit). Der Zoom wird gespeichert.
- Simulationsregeln: Abklingzeit beim Laufen, Auto-Angriffsreichweite, Verfolgungsgrenze,
  Nahkampf-Treffertoleranz, Belagerungsschaden vs. Rüstung, Blickwinkel-Toleranz, Gruppen-Tempo.
- Werteprofil: eigenes Profil (Standard) oder Kalibrierprofil mit den importierten Referenzwerten.
- Geisterlauf an/aus (siehe unten) und "Replay abspielen" zum Laden einer Replay-Datei.
- Kalibrierung (nur im Kalibrierprofil): jeder Wert mit `"verified": false` ist editierbar
  (Kollisionsradius, Beschleunigung, Drehrate, Projektiltempo, Mangonel-Radius, Ansturm,
  Abwehrstellung). Ein gesetzter Wert gilt als nachgemessen; leeres Feld stellt den Platzhalter
  wieder her. Werte pro Zeitalter werden gemeinsam gesetzt.
- Export/Import aller Einstellungen (Anzeige, Kalibrierung, Hotkeys, Verlauf, Daily-Versuche,
  Bestläufe) als JSON-Datei.

Alle Werte liegen in localStorage des Browsers (Schlüssel `kompanie.*`).

## Projektstruktur

```
src/sim/            Simulation, reine Logik ohne Browser (fester Takt 60 Ticks/s, deterministisch)
  math.ts           Vektoren und Winkel
  rng.ts            Seed-basierter Zufall (kein Math.random in der Simulation)
  unitDefs.ts       Typen und Lader für die Einheitendaten
  types.ts          Welt, Einheiten, Befehle, Regeln
  world.ts          Welt anlegen, Einheiten spawnen
  formation.ts      Lockere Blockformation für Gruppenbefehle
  commands.ts       Befehle anwenden (Bewegen, Angreifen, Attack-Move, Halten, Stopp, Einreihen)
  movement.ts       Beschleunigung, Drehen, Ankunft, Kollision, Blockade-Erkennung
  combat.ts         Zielerfassung, Angriffsablauf (Windup/Treffer/Recovery/Cooldown), Ansturm, Abwehrstellung
  damage.ts         Schadensformel (Angriff + Bonus - Rüstung, Resistenz, mindestens 1)
  projectiles.ts    Pfeile (zielsuchend) und Mangonel-Geschosse (Bodenpunkt, Flächenschaden)
  ai.ts             Gegner-KI (M2: Stufe leicht)
  step.ts           Ein Tick
  scenario.ts       Szenario-Datei -> Welt
  hash.ts           Zustands-Hash für Determinismus-Tests
  replay.ts         Replay-Format: Befehlsliste mit Tick-Nummern, Aufzeichnung, Wiedergabe, Prüfung
  stars.ts          Sterne (Bronze/Silber/Gold) aus den Kennzahlen einer Runde
src/app/            Browser-Seite: Kamera, Eingabe, Darstellung (3D und Canvas 2D), Hotkeys,
                    Einstellungen/Kalibrierung, Rundenauswertung
  daily.ts          Daily Challenge: Tages-Seed, Szenariowahl, lokale Rangliste
  ghosts.ts         Bestläufe pro Szenario für den Geisterlauf
src/data/units/     Eigenes Werteprofil (JSON, scripts/write-own-units.mjs); reference/ = Kalibrierprofil
src/data/scenarios/ Szenarien (JSON)
scripts/            Datenimport und Prüfskripte
tests/              Vitest-Tests
docs/PLAN.md        Meilensteinplan und offene Rückfragen
ASSUMPTIONS.md      Alle Annahmen der Simulation, die unsicher sind
```

Die Darstellung interpoliert zwischen zwei Simulationsticks; Befehle werden im nächsten Tick
(spätestens 16 ms) wirksam.

## Szenarien

| Nr. | Szenario | Aufstellung | KI |
| --- | --- | --- | --- |
| 1 | Kiten Grundlagen | 10 Bogen gegen 6 Speer (II) | leicht |
| 2 | Kiten unter Druck | 8 Bogen + 4 Speer gegen 6 Reiter (II) | schwer |
| 3 | Focus-Fire | 8 Bogen gegen 8 Bogen (II); Variante 3b: Armbrust (III) | mittel |
| 4 | Angeschlagene zurückziehen | 8 Soldaten gegen 8 Soldaten (III) | mittel |
| 5 | Mangonel ausweichen / splitten | 10 Bogen gegen 2 Mangonel + 4 Speer (III) | schwer |
| 6 | Ritter-Dive abwehren | 8 Bogen + 6 Speer gegen 5 Ritter (III) | schwer |
| 7 | Springald-Snipe | 2 Springald + 4 Reiter gegen 2 Mangonel + 6 Speer (III) | mittel |
| 8 | Zwei-Gruppen-Micro | 8 Bogen + 4 Reiter gegen 6 Speer + 4 Bogen (II) | mittel |
| 9 | Hotkey-Drill (ohne Kampf) | 3 vorbelegte Kontrollgruppen, 20 Ansagen auf Zeit | keine |
| 10 | Untergruppen-Drill (ohne Kampf) | Gemischte Truppe, Ansagen mit Tab-Untergruppen und Karten-Klicks auf Zeit | keine |
| 11 | Leistungstest 100 gegen 100 | Je 100 Einheiten, zum Prüfen der Bildrate (FPS-Anzeige mit Sim- und Bildzeit) | schwer |
| – | Sandbox | 10 Bogen + 4 Reiter gegen 6 passive Speer | keine |
| – | Editor | frei: Einheiten, Zeitalter, Anzahl, Upgrades, KI, Abstand | wählbar |

Szenarien liegen als JSON in `src/data/scenarios/` (Gruppen mit Einheit, Zeitalter, Anzahl,
Mittelpunkt, Blickrichtung; KI-Stufe und Reaktionszeit; `dependsOnUnverified` für den Hinweis
auf unbestätigte Werte). Jedes Szenario: Neustart per F4, Tempo 50/75/100 %, Zufallsstart.

KI-Stufen (alle nur über normale Befehle, Reaktionszeit einstellbar pro Szenario):

- leicht: Attack-Move auf die Spielertruppe.
- mittel: Konter-Ziele zuerst, fokussiert angeschlagene Ziele, Mangonels zielen auf Gruppen,
  zieht nie zurück.
- schwer: zusätzlich kiten mit Schützen, angeschlagene Einheiten zurückziehen, Mangonel-
  Geschossen ausweichen, Kavallerie umgeht Speerkämpfer Richtung Schützen.

## Auswertung nach jeder Runde

- Ergebnis, Dauer, Verluste und Überlebende beider Seiten mit Ressourcenwert.
- APM (alle Eingaben pro Minute: Befehle, Auswahl, Kontrollgruppen) und effektive APM (nur
  Befehle, unmittelbare Wiederholungen ausgenommen); Befehle pro Typ.
- Kite-Effizienz: abgegebene Fernkampfangriffe geteilt durch mögliche (Zeit, in der ein Gegner in
  Reichweite war, geteilt durch die Angriffsperiode); erlittener Nahkampfschaden.
- Focus-Qualität: Overkill-Schaden (Schaden über den Tod hinaus plus Projektile, deren Ziel vor dem
  Einschlag starb) und durchschnittliche Zahl gleichzeitig beschossener Ziele.
- Idle-Zeit eigener Einheiten ab dem ersten Treffer; abgebrochene Ausholzeiten; Nahkampf-Fehlschläge.
- Vergleichslauf "nur Attack-Move": dieselbe Ausgangslage (gleicher Seed) wird mit der leichten KI
  statt deiner Steuerung simuliert, damit du siehst, was dein Micro bringt.
- Bestwert und Verlauf der letzten 20 Versuche pro Szenario als Diagramm (localStorage).
  Der Verlauf ist im JSON-Export enthalten.
- Sterne: jedes Szenario hat Schwellen für Bronze, Silber und Gold (in der Szenario-JSON unter
  `stars`, z. B. höchstens so viele Verluste, mindestens so viel Kite-Effizienz, höchstens so viel
  Overkill oder Zeit; Drills nutzen Fehler und Reaktionszeit). Die Auswertung zeigt die erreichten
  Sterne und was zum nächsten Stern fehlt; die Szenario-Auswahl zeigt die besten Sterne.
- "Replay speichern" lädt den gerade gespielten Lauf als Datei herunter.

## Daily Challenge

Der Menüpunkt **Daily** wählt aus dem Datum einen Seed und damit ein Szenario des Tages (nur
Kampfszenarien mit Sternen). Drei Versuche pro Tag, der beste zählt. Die Punkte: 10000 minus
5 je verlorenem Ressourcenpunkt minus 2 je Sekunde, nur bei Sieg. Die Rangliste der eigenen
Versuche liegt im Browser (localStorage) und ist im Einstellungs-Export enthalten.

## Geisterlauf

Jeder Lauf wird als Befehlsliste mit Tick-Nummern aufgezeichnet. Der beste Lauf pro Szenario
(und pro Daily-Tag) wird gespeichert. Beim nächsten Versuch läuft er als halbtransparente
Geister-Einheiten in der 3D-Ansicht (und als Umrisse in 2D) mit, damit du dich mit dir selbst
vergleichen kannst. Abschaltbar in den Einstellungen.

## Replay

Ein Replay ist eine JSON-Datei (`kompanie-replay`) mit Version, Szenario, Seed, Werteprofil,
Regeln, Befehlsliste und dem Zustands-Hash am Ende. Export über die Auswertung, Import über
Einstellungen → "Replay abspielen": der Lauf wird abgespielt und am Ende wird geprüft, ob der
Hash mit dem aufgezeichneten übereinstimmt (Determinismus). Ein Test in `tests/replay.test.ts`
sichert ab, dass derselbe Lauf immer denselben Hash ergibt und ein anderer Seed einen anderen.

## Hotkey-Drill und Editor

Szenario 9 belegt Gruppen 1 bis 3 vor und gibt 20 Ansagen ("Gruppe 2 auswählen, Attack-Move auf
den Marker", "Stopp", "Position halten", "Patrouille", "Alle Militäreinheiten"). Gemessen werden die
Reaktionszeit von Ansage bis Erfüllung und Fehlgriffe (Befehle oder Gruppenaktionen, die den
aktuellen Schritt nicht erfüllen; Ziel muss höchstens 3 Tiles vom Marker entfernt sein).

Der Editor (Button oder "Editor öffnen …" im Szenario-Menü) legt beide Seiten mit Einheiten,
Zeitalter, Anzahl und Schmiede-Upgrades (je Kategorie Stufe 0–3, +1 pro Stufe: Fernkampf-Angriff,
Nahkampf-Angriff, Nahkampf-Rüstung, Fernkampf-Rüstung; Belagerung erhält keine) fest, dazu
KI-Stufe, Reaktionszeit, Startabstand und Zufallsstart. Das Szenario wird gespeichert und erscheint
als "Editor: …" in der Liste.

## Einheitendaten

Auslieferungsstandard ist das **eigene Werteprofil** in `src/data/units/<einheit>.json`, erzeugt
aus der Tabelle in `scripts/write-own-units.mjs`: eigene, gerundete Zahlen für Lebenspunkte,
Schaden, Rüstung, Reichweite, Tempo, Angriffs-Timing und Kosten, mit vier Ausbildungsstufen
(Rekrut, Söldner, Veteran, Garde) statt Zeitaltern. Die Schadensformel (Angriff + Bonus gegen
Klasse − Rüstung, dann prozentuale Resistenz, mindestens 1) und das Prinzip aus Reichweite,
Ausholzeit, Abklingzeit und Kontern gelten für beide Profile.

Das **Referenzprofil** in `src/data/units/reference/` ist aus offenen Daten importiert
(`npm run data:import`, Quelle in `CREDITS.md`) und nur als Kalibrierprofil in den Einstellungen
wählbar; dort sind seine Platzhalter (`"verified": false`) editierbar und `npm run data:unverified`
listet sie auf. Es ist bewusst nicht der Standard. `tests/unitDefs.test.ts` prüft, dass das eigene
Profil in jedem Wert höchstens 25 % vom Referenzprofil abweicht und über die Hälfte der Werte
tatsächlich verschoben ist.

Angriffs-Timing pro Waffe (Sekunden ab Angriffsbeginn, siehe `ASSUMPTIONS.md` zur Deutung):

- `windup` – Ausholzeit; ein Bewegungsbefehl in dieser Phase bricht ab, kein Schaden
- `hit` – Zeitpunkt des Schadens bzw. Projektilabschusses
- `recovery` – Nachlaufanimation nach dem Treffer, Bewegung sofort erlaubt
- `cooldown` – Restzeit bis zum nächsten Angriff
- `period` – Gesamtzeit zwischen zwei Angriffen (= windup + recovery + cooldown)

## Meilensteine

- [x] M1: Projektgerüst, Simulationskern mit Tests, Karte, Kamera, Auswahl, Bewegen, Datenimport
- [x] M2: Kampfmodell (Windup/Cooldown, Projektile, Flächenschaden, Auto-Angriff, Ansturm,
      Abwehrstellung), leichte KI, Kalibrierungsmenü, Szenario 1 spielbar
- [x] M3: Kontrollgruppen, Befehlsketten, Attack-Move/Stopp/Halten/Patrouille, Formation ausrichten,
      Hotkey-Menü mit Presets, Pointer-Lock
- [x] M4: Gegner-KI in 3 Stufen, Szenarien 2 bis 8
- [x] M5: Auswertung, Verlauf mit Diagramm, Vergleichslauf, Hotkey-Drill, Editor, Schmiede-Upgrades
- [x] G0: Inventur, Hotkey-Import aus dem persönlichen Profil (`docs/G0-INVENTUR.md`)
- [x] G1: Three.js-Renderer mit geneigter Kamera, Gelände, Deko mit Kollision, Raycast-Eingabe, 2D-Debug-Ansicht
- [x] G2: Prozedurale Figuren mit Gelenken, sim-gesteuerte Animationen, Projektile, Effekte, Ton
- [x] G3: HUD (Paneele, Befehlsraster mit Tastenbeschriftung, Gruppen-Marken, Minimap-Raute, Formationen, Löschen)
- [x] G4: Auswahl-Leiste mit Untergruppen (Tab/Strg+Tab, Karten-Klicks, Einzelansicht), Untergruppen-Drill, Tests
- [x] G5: Formationen, HUD-Maße, Lasttest 100 gegen 100, Vergleich in `docs/G5-VERGLEICH.md`
