# AoE4 Micro Trainer

Browser-Tool, um Micro-Mechaniken aus Age of Empires IV (1v1) isoliert und wiederholbar
zu üben: Kiten, Focus-Fire, Zurückziehen, Mangonel-Ausweichen, Kontrollgruppen.
Kein Spiel-Klon – es geht um Steuerung, Timing und Einheitenverhalten.

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
npm run data:import    # Einheitendaten neu von aoe4world importieren
npm run data:unverified# Alle Werte mit "verified": false auflisten
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
   fehlt), zeigt das Spiel den prozeduralen Körper. `figure-preview.html?gen=0` zeigt den Rückfall.

Qualitätsstufen (Einstellungen → Qualität): Niedrig ohne Schatten und mit Pixelverhältnis 1, Mittel mit
2048er-Schattenkarte, Hoch mit 4096er-Karte, weichen Schatten und voller Auflösung.

## Darstellung

Standard ist die 3D-Ansicht (Three.js): perspektivische Kamera schräg von oben (Neigung 45°,
Sichtfeld 35°, aus dem Minimap-Trapez des Spiel-Screenshots berechnet), um 45° gedreht, sodass die
Karte als Raute erscheint. Der Standardabstand ergibt in Bildmitte etwa 74 px pro Tile bei
2560×1440; dieser Maßstab, die Kollisionsradien (Infanterie 0,22, Kavallerie 0,40 Tiles) und der
Formationsabstand (2·Radius + 0,2 Tiles) stammen aus den Videoclips unter `reference/videos/`
(Messung in `docs/G0-INVENTUR.md`, Abschnitt 4b). Gelände, Bäume, Felsen, Büsche und Gebäude-Kulisse sind prozedural
erzeugt; Bäume und Felsen haben Kollision (Einheiten laufen um sie herum), die Kampfzone in der
Kartenmitte bleibt frei.

Figuren (G2) sind prozedural aus Grundkörpern mit Gelenken gebaut und pro Körperteil instanziert
(ein Draw-Call je Teil für alle Einheiten): Speerkämpfer mit Speer, Bogenschütze mit Bogen, Soldat
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

### HUD (G3)

Das Interface folgt dem Vollbild-Screenshot des Spiels (eigene Grafik, keine Spiel-Icons):

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
- UI-Größe in Prozent in den Einstellungen (60 bis 160 %), wie die UI-Skalierung im Spiel.

Formationen (nach den Clips 8–10): Linie = Block in Reihen nach Klasse (Nahkampf vorn, Schützen
dahinter, Kavallerie hinten), Keil = Reihen 1/3/5/… mit der Kavallerie an der Spitze, aufgelockert
= gleiche Ordnung mit doppeltem Abstand. Sie wirken beim nächsten Bewegungsbefehl; Löschen tötet
die Auswahl sofort und zählt als Verlust.

### Vergleich mit dem Spiel und Leistung (G5)

`docs/G5-VERGLEICH.md` stellt Trainer und Spiel (Clip 6, 1920×1080) nebeneinander
(`docs/vergleich/`) und listet die verbleibenden sichtbaren Abweichungen. Szenario 11 ist der
Lasttest mit 200 Einheiten; die FPS-Anzeige oben rechts zeigt Bilder pro Sekunde, Simulationszeit
und Darstellungszeit (JS-Anteil) je Bild. Figuren sind pro Körperteil instanziert, die Simulation
braucht mit 200 Einheiten etwa 1 ms je Tick.

### Auswahl-Leiste und Untergruppen (G4)

Die Leiste zeigt "ALLE (n)" und eine Karte je Einheitentyp in fester Reihenfolge (Speerkämpfer,
Soldat, Bogenschütze, Armbrustschütze, Reiter, Ritter, Mangonel, Springald). Tab wählt die nächste
Untergruppe, Strg+Tab die vorige (Zyklus über "Alle"); die aktive Karte ist gold umrandet und alle
Befehle (Raster, Tasten, Rechtsklick) gehen nur an diese Einheiten. Klick auf eine Karte aktiviert
die Untergruppe, Shift-Klick entfernt den Typ aus der Auswahl, Strg-Klick behält nur ihn (wie im
Spiel; in den Einstellungen vertauschbar), Klick auf "ALLE" hebt die Untergruppe auf. Bei einem Typ oder aktiver Untergruppe erscheint die Einzelansicht
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

Standard-Preset ist "Mein Layout", erzeugt aus der Spieldatei `reference/hotkeys/Dorfzenter.rkp`
mit `node scripts/import-hotkeys.mjs reference/hotkeys/Dorfzenter.rkp` (Zuordnung in
`docs/G0-INVENTUR.md`). Alle Tasten sind im Einstellungsmenü frei belegbar (Belegen, Entfernen,
Konflikte werden aufgelöst, Reset auf das Preset, Preset wechselbar). Tasten werden als physische Taste gespeichert, deutsche
Layouts funktionieren. Preset-Tasten, deren Standard im Spiel nicht sicher bekannt ist, sind im
Menü orange markiert. Browser-Standardaktionen (Kontextmenü, Strg+Zahl, Leertaste, F-Tasten außer
F11/F12, Tab, Alt) werden im Spiel unterdrückt. Vollbild über den Button (mit Keyboard-Lock in
Chrome/Edge). Optional Pointer-Lock: der Mauszeiger bleibt im Spielfeld (eigener Zeiger), damit
Rand-Scrolling auch im Fenster funktioniert; Esc gibt ihn frei.

## Einstellungen und Kalibrierung

Der Button **Einstellungen** (pausiert das Spiel) öffnet:

- Anzeige: Lebensbalken (immer / bei Auswahl oder Schaden / nur Auswahl), Reichweitenring als
  Zoom-Kalibrierhilfe, Angriffs-Timing-Balken unter eigenen Einheiten (gelb = Ausholen, blau =
  Nachlauf, grau = Abklingzeit). Der Zoom wird gespeichert.
- Simulationsregeln: Abklingzeit beim Laufen, Auto-Angriffsreichweite, Verfolgungsgrenze,
  Nahkampf-Treffertoleranz, Belagerungsschaden vs. Rüstung, Blickwinkel-Toleranz, Gruppen-Tempo.
- Kalibrierung: jeder Wert mit `"verified": false` aus den Einheitendaten ist editierbar
  (Kollisionsradius, Beschleunigung, Drehrate, Projektiltempo, Mangonel-Radius, Ansturm,
  Abwehrstellung). Ein gesetzter Wert gilt als nachgemessen; leeres Feld stellt den Platzhalter
  wieder her. Werte pro Zeitalter werden gemeinsam gesetzt.
- Export/Import aller Einstellungen (Anzeige, Kalibrierung, Hotkeys) als JSON-Datei.

Alle Werte liegen in localStorage des Browsers.

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
src/app/            Browser-Seite: Kamera, Eingabe, Darstellung (Canvas 2D), Hotkeys,
                    Einstellungen/Kalibrierung, Rundenauswertung
src/data/units/     Einheitendaten (JSON), erzeugt von scripts/import-units.mjs
src/data/scenarios/ Szenarien (JSON)
scripts/            Datenimport und Prüfskripte
tests/              Vitest-Tests
docs/PLAN.md        Meilensteinplan und offene Rückfragen
ASSUMPTIONS.md      Alle Annahmen, bei denen das Tool vom echten Spiel abweicht oder unsicher ist
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

Alle Werte stammen aus den offenen Daten von aoe4world (`https://data.aoe4world.com/units/all.json`).
`npm run data:import` wählt pro Einheit und Zeitalter die Variante, die von den meisten
Zivilisationen geteilt wird (Standardwerte ohne Civ-Boni), und schreibt
`src/data/units/<einheit>.json`. Werte, die die Quelle nicht liefert, stehen als
`{ "value": …, "verified": false, "note": "…" }` in der Datei; `npm run data:unverified`
listet sie auf. Nachgemessene Werte bleiben bei erneutem Import erhalten.

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
      Hotkey-Menü mit AoE4-Preset, Pointer-Lock
- [x] M4: Gegner-KI in 3 Stufen, Szenarien 2 bis 8
- [x] M5: Auswertung, Verlauf mit Diagramm, Vergleichslauf, Hotkey-Drill, Editor, Schmiede-Upgrades
- [x] G0: Inventur, Hotkey-Import aus der Spieldatei (`docs/G0-INVENTUR.md`)
- [x] G1: Three.js-Renderer mit geneigter Kamera, Gelände, Deko mit Kollision, Raycast-Eingabe, 2D-Debug-Ansicht
- [x] G2: Prozedurale Figuren mit Gelenken, sim-gesteuerte Animationen, Projektile, Effekte, Ton
- [x] G3: HUD nach AoE4-Vorbild (Paneele, Befehlsraster mit Tastenbeschriftung, Gruppen-Marken, Minimap-Raute, Formationen, Löschen)
- [x] G4: Auswahl-Leiste mit Untergruppen (Tab/Strg+Tab, Karten-Klicks, Einzelansicht), Untergruppen-Drill, Tests
- [x] G5: Formationen nach Clips, HUD-Maße nach Clip 6, Lasttest 100 gegen 100, Vergleich in `docs/G5-VERGLEICH.md`
