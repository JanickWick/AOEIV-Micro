# Plan und Rückfragen

## Antworten (Stand nach M1)

1. Zeitalter II für Speer/Bogen/Reiter/Soldat/Ritter, III für Armbrust/Mangonel/Springald.
   Szenario 3 in Zeitalter II (Bogen gegen Bogen) plus Variante III mit Armbrustschützen.
2. Abklingzeit läuft beim Laufen weiter (nicht nachgemessen, in ASSUMPTIONS geführt).
3. Schaden am Ende der Ausholzeit; Bewegungsbefehl davor bricht ab, danach nicht mehr.
4. Platzhalter bleiben, alle im Kalibrierungsmenü einstellbar. Messreihenfolge: Pfeilflugzeit,
   Kollisionsabstand, Mangonel (Flugzeit, Radius), Auto-Angriffsreichweite, Ansturm, Abwehrstellung.
   Szenarien 5 und 6 zeigen einen Hinweis, solange Werte unbestätigt sind.
5. Reine Draufsicht; Standard ca. 40 Tiles quer bei 1920 px; Zoom stufenlos und gespeichert;
   Reichweitenring als Kalibrierhilfe.
6. Rechtsklick beim Drücken; Rechtsklick-Ziehen zum Ausrichten in M3 (niedrige Priorität).
7. Gruppen-Tempo bei Bewegungsbefehlen (abschaltbar); bei Angriffsbefehlen eigenes Tempo.
8. Grid-Standardlayout zuerst, unsichere Tasten markieren; Screenshots folgen vor M3.
9. Lebensbalken: immer / bei Auswahl oder Schaden / nur Auswahl, Standard immer.
10. Export/Import als JSON inkl. Hotkeys und Kalibrierung.
11. Nur lokal; GitHub-Pages-Fähigkeit beibehalten.

## Ursprüngliche Rückfragen

1. **Zeitalter pro Szenario.** Ich nehme Zeitalter II für Speer/Bogen/Reiter/Soldat/Ritter und
   Zeitalter III für Armbrust/Mangonel/Springald (sie existieren erst dort). Jede Szenario-Gruppe
   legt ihr Zeitalter selbst fest. Soll "gleich starke Gruppen" (Szenario 3) in II oder III sein?
2. **Cooldown beim Kiten.** Läuft im Spiel die Nachladezeit eines Bogenschützen weiter, während
   er läuft, oder beginnt sie bei Stillstand von vorn? (Siehe ASSUMPTIONS 3; das entscheidet,
   wie "kostenlos" Stutter-Step ist.) Falls du es messen kannst: Zeit zwischen zwei Schüssen mit
   kurzem Laufen dazwischen gegenüber ohne Laufen.
3. **Schadenszeitpunkt.** Fällt der Schaden am Anfang oder Ende der kurzen "attack"-Phase (0,125 s)
   an? Ich setze ihn ans Ende der Ausholzeit. Messbar an der Mindestzeit zwischen Angriffsbeginn
   und HP-Abzug beim Spearman (erwartet 0,25 s).
4. **Nachzumessende Werte** (Platzhalter in den JSON-Dateien): Kollisionsabstand zweier
   Infanteristen, Pfeilflugzeit auf 5 Tiles, Mangonel-Flugzeit auf 8 Tiles und Splash-Radius,
   Ritter-Ansturm (Bonus, Anlaufstrecke, Abklingzeit), Speer-Abwehrstellung (Bonus, Auslöseabstand),
   Auto-Angriffsreichweite untätiger Einheiten. `npm run data:unverified` zeigt die komplette Liste.
5. **Kamera.** Wie viele Tiles sollen bei deiner Auflösung quer sichtbar sein (jetzt ca. 27 bei
   1280 px)? Soll die Kamera wie im Spiel leicht gekippt sein, oder reicht reine Draufsicht?
6. **Rechtsklick beim Drücken statt Loslassen** – passt das für dich? Brauchst du Rechtsklick-Ziehen
   zum Ausrichten der Formation?
7. **Gruppen-Tempo.** Im Spiel laufen gemischte Gruppen in Formation mit der langsamsten Einheit.
   Soll das so bleiben (abschaltbar), oder sollen Reiter immer volles Tempo laufen?
8. **Hotkey-Preset.** Für M3 brauche ich deine Belegung: Schick mir am besten Screenshots deiner
   AoE4-Hotkey-Seiten (Einheitenbefehle, Auswahl, Kamera, Kontrollgruppen). Ohne das baue ich das
   Grid-Standardlayout nach bestem Wissen und markiere unsichere Tasten.
9. **Lebensbalken** immer anzeigen oder nur bei Auswahl/Schaden (wie jetzt)?
10. **Auswertung / Speicherung.** localStorage pro Browser ist vorgesehen. Brauchst du Export/Import
    der Statistiken als Datei?
11. **Bereitstellung.** Soll der Build auf GitHub Pages laufen (relative Pfade sind bereits gesetzt)?

## Meilensteine

### M1 – erledigt
- Vite + TypeScript + Vitest, Simulation strikt getrennt vom Rendering, 60 Ticks/s, deterministisch
  (Seed-RNG, Zustands-Hash-Test), Darstellung interpoliert.
- Datenimport von aoe4world mit `verified:false`-Markierung fehlender Werte (40 Werte, siehe
  `npm run data:unverified`).
- Karte in Tiles, Kamera (Rand, Pfeiltasten, mittlere Maustaste, Zoom, Minimap), Auswahl (Klick,
  Rahmen, Doppelklick, Shift), Bewegen mit Formation, Befehlsketten per Shift, Stopp, Neustart,
  Tempo 50/75/100 %, zufällige Startpositionen, Vollbild.
- 26 Tests: Daten, Bewegung, Formation, Kollision, Warteschlange, Auswahl, Determinismus.

### M2 – erledigt
- Angriffsbefehl (Rechtsklick auf Gegner), Zustandsautomat: Annähern -> Windup -> Treffer/
  Projektil -> Recovery -> Cooldown; Bewegungsbefehl im Windup bricht ohne Schaden ab; Abklingzeit
  läuft beim Laufen weiter (Regel). Nahkampf verfehlt bei entkommenem Ziel.
- Schaden = Angriff + Bonus - Rüstung, Resistenz, mindestens 1. Pfeile zielsuchend mit Flugzeit,
  Mangonel-Geschosse auf Bodenpunkt mit Flächenschaden (Burst 3), ausweichbar.
- Auto-Angriff untätiger Einheiten mit Verfolgungsgrenze; Attack-Move und Position halten in der
  Simulation (Hotkeys dafür in M3); kein Overkill-Schutz.
- Ritter-Ansturm und Speer-Abwehrstellung mit Platzhalterwerten.
- KI-Stufe leicht; Szenario 1 (10 Bogen gegen 6 Speer) mit Sieg/Niederlage und Kurzauswertung
  (Verluste, Ressourcenwert, Schaden, Windup-Abbrüche, Fehlschläge).
- Einstellungsmenü: Anzeige, Simulationsregeln, Kalibrierung aller unbestätigten Werte,
  Export/Import als JSON. Zoom gespeichert, Reichweitenring, Timing-Balken.
- 47 Tests, u. a. "Bewegungsbefehl im Windup verursacht keinen Schaden", "Speer gegen Reiter
  erhält Bonus", "Rüstung senkt Schaden, Minimum 1", "Pfeil trifft nach Flugzeit", "Mangonel
  trifft Fläche, ausgewichenes Ziel nicht", "Ansturm", "Abwehrstellung", "Szenario 1 deterministisch".

### M3 – erledigt
- Angriffsbewegung (A + Klick), Stopp (S), Position halten (H), Patrouille (P + Klick); Shift reiht
  alle Befehle ein; Rechtsklick-Ziehen richtet die Formation aus.
- Kontrollgruppen: Strg+Zahl setzen (ersetzt), Shift+Zahl hinzufügen, Zahl auswählen, Doppeltipp
  zentriert; Gruppennummern an den Einheiten. "Alle Militäreinheiten", "alle dieses Typs",
  Kamera auf Auswahl (unbelegt).
- Hotkey-Menü: alle Aktionen belegbar, Konflikte werden aufgelöst, AoE4-Preset mit Markierung
  unsicherer Tasten, Anzeige im Browser-Tastaturlayout. Pointer-Lock mit eigenem Zeiger.
- Offen: Scroll-Geschwindigkeit als Einstellung (kommt mit M5-Einstellungen), deine Hotkey-
  Screenshots einarbeiten.

### M4 – erledigt
- KI-Stufen leicht/mittel/schwer mit einstellbarer Reaktionszeit, nur über normale Befehle:
  Zielwahl (Konter, Fokus), Kiten, Rückzug angeschlagener Einheiten, Ausweichen vor
  Mangonel-Geschossen, Kavallerie umgeht Speere.
- Szenarien 2 bis 8 (plus 3b Armbrust) als JSON mit Siegbedingung und Hinweis auf unbestätigte
  Werte (5, 6, 7). Alle laufen ohne Spielereingriff deterministisch bis zum Ende (Test).
- Wertung je Szenario (gerettete Einheiten, Kite-Effizienz usw.) kommt mit M5.

### M5 – erledigt
- Kampfstatistik (Verluste, Ressourcenwert, APM/eAPM, Befehle pro Typ, Kite-Effizienz,
  Nahkampfschaden, Overkill, gleichzeitige Ziele, Idle-Zeit, Windup-Abbrüche, Fehlschläge),
  Bestwert, Verlauf der letzten 20 Versuche als Diagramm, Vergleichslauf "nur Attack-Move".
- Hotkey-Drill (Szenario 9) mit Reaktionszeit und Fehlgriffen, eigener Verlauf.
- Freier Editor mit Schmiede-Upgrades pro Seite; Verlauf im JSON-Export enthalten.

### Offen / Ideen nach M5
- Deine Hotkey-Belegung als Preset einarbeiten (Screenshots).
- Nachgemessene Werte eintragen (Kalibrierungsmenü), danach Szenarien 5 bis 7 neu bewerten.
- Setup/Teardown der Belagerung, Wegfindung um stehende Blöcke, weitere Formationen.


## Nächste Stufe (3D, Figuren, AoE4-Interface)

### G0 – erledigt
- Inventur: nur die Hotkey-Datei (zweimal) und zwei Screenshots im Chat; keine Einheitendaten, keine
  Videos. Siehe `docs/G0-INVENTUR.md`.
- Hotkey-Import (`scripts/import-hotkeys.mjs`) → Preset "Mein Layout", Standard. Neue Aktionen:
  exklusiv zu Gruppe, aus Gruppe entfernen, aus allen entfernen, Gruppe 0, untätige Einheiten,
  Kamera zurücksetzen; Formationen und Löschen seit G3, Untergruppen folgen in G4.

### Rückfragen vor G1
1. Position halten = V (Spieldatei), nicht F. Einverstanden?
2. Formationstaste "Z" der Spieldatei = Taste links neben X (bei dir mit Y beschriftet)?
   Welche Taste drückst du im Spiel für die Linienformation?
3. Screenshots bitte unter `reference/screenshots/` hochladen (Originalauflösung 2560×1440), damit
   G1 und G5 sie als Maß nehmen können. Nützlich wäre zusätzlich ein Screenshot mit gewählten
   Bogenschützen und sichtbarem Reichweitenring, oder einem Gebäude bekannter Größe.
4. Aufnahmen: Kannst du ein Video (60 fps, Standardzoom) aufnehmen: 10 Bogenschützen im Stand
   gegen Speerkämpfer, dann dasselbe mit Kiten; danach Ritter gegen Speerkämpfer? Damit messe ich
   Formationsabstand, Schussabstand mit/ohne Laufen, Ansturm.
5. Ton: Welche Lautstärke/Quellen sind erlaubt? Ich plane synthetische Klänge (Web Audio), keine
   Samples, damit keine Lizenzfrage entsteht.
6. 3D-Figuren: Ich versuche zuerst CC0-Modelle (Quaternius/Kenney, glTF mit Animationen). Falls
   die Silhouetten nicht ausreichen, prozedural. Einverstanden mit beidem?

### G1 – erledigt
- Three.js-Szene parallel zur 2D-Ansicht, umschaltbar (Knopf "Ansicht", Einstellung). Kamera
  Neigung 45°, Sichtfeld 35°, Drehung 45°, Standardabstand nach Screenshot-Maß; Mausrad-Zoom am
  Zeiger, Rand/Pfeiltasten/mittlere Maustaste, Backspace setzt zurück.
- Raycast auf die Bodenebene, Auswahlrahmen und Figur-Klick im Bildschirmraum (Tests).
- Gelände mit prozeduraler Textur, Bäume/Felsen/Büsche/Gebäude als Instanzen, Schatten, warmes
  Licht; Bäume und Felsen als Hindernisse in der Simulation (Tests).
- Einheiten als Platzhalter-Instanzen mit Teamfarbe, Auswahlring am Boden, Lebensbalken in
  Teamfarbe über dem Kopf; Minimap zeigt das Kamera-Trapez.
- Antworten: V = Halten; Formationstaste Z ist die obere Z-Taste (Import mit `--qwertz-chars`);
  Videos bitte als Datei (mp4, ≤ 100 MB) unter `reference/videos/` hochladen, YouTube kann ich hier
  nicht abrufen.

### G1b – Videoauswertung (nachgereicht)
- Maßstab 55,6 px/Tile (1080p) aus Clip 5; Kollisionsradien 0,22 / 0,40, Formationsabstand +0,2,
  Kameraabstand 31, Figurgrößen 0,6 / 0,8 Tiles. Timing-Werte nicht messbar (siehe Inventur 4b).

### G1 – ursprünglicher Plan
- Three.js-Szene parallel zum 2D-Canvas, umschaltbar (Einstellung "Ansicht: 3D / 2D-Debug").
- Perspektivische Kamera, Neigung ca. 50–55°, Sichtfeld und Zoom nach Screenshot-Maß (Gruppe
  von 19 Einheiten ≈ 320×210 px bei 2560×1440). Mausrad-Zoom stufenlos, Bewegung wie bisher.
- Raycast auf die Bodenebene für Klicks; Auswahlrahmen im Bildschirmraum über projizierte
  Positionen; Klick auf Figur über Hit-Radius am projizierten Punkt.
- Gelände mit Textur und Farbvariation, Bäume/Büsche/Felsen als instanzierte Deko, Gebäude-
  Kulisse am Rand, Schatten, warmes Licht. Kollision mit Bäumen/Felsen in der Simulation als
  statische Hindernisse (neuer, optionaler Teil der Welt; Logik-Tests bleiben unverändert).
- Einheiten als Platzhalter (Kapseln mit Teamfarbe), Auswahlring am Boden, Lebensbalken.

### G2 – erledigt
- Weg: prozedurale Figuren aus Grundkörpern mit Gelenken, instanziert pro Körperteil (keine
  CC0-Modelle: Lizenzprüfung und Rig-Anpassung aus dem Container nicht zuverlässig möglich, und
  Instancing mit Gelenken ist mit eigenem Rig einfacher; 200 Einheiten ≈ 25 Draw-Calls).
- Animationen aus Tick-Zustand (Laufen, Ausholen = Windup-Zeit, Treffer, Nachlauf, Abbruch,
  Trefferreaktion, Tod), Pferde mit Reitern, Mangonel-Wurfarm, Springald-Bolzen.
- Projektile mit Bogenbahn, Einschlagzone, Staub, Funken, Ansturm-Staub, Klickmarker im Boden,
  synthetischer Ton. Tests: Posen ändern sich mit dem Windup-Fortschritt, Abbruch blendet.
- Offen: Figur-Proportionen gegen Zoom-Clips prüfen (G5), Leichen-Dauer, Formationsanimation.

### G2 – ursprünglicher Plan
- Low-Poly-Menschen und Pferde pro Typ (Waffe, Silhouette), Instancing, Teamfarbe.
- Animationen aus dem Simulationszustand: Stehen, Laufen (Schrittfrequenz ∝ Tempo), Angriff mit
  Ausholphase = Windup-Dauer, Treffer, Sterben (Körper bleibt 1 s liegen), sichtbarer Abbruch.
- Projektile mit Bogenbahn, Mangonel-Einschlag mit Staub und Bodenmarkierung, Ansturm-Staub,
  Trefferfunken, Klickmarker grün/rot. Synthetischer Ton, abschaltbar.

### G3 – erledigt
- HUD als HTML/CSS-Ebene (`src/app/hud.ts`, `src/style.css`): Paneele dunkelblau mit Goldakzent,
  UI-Größe in Prozent (Einstellungen), eigene SVG-Icons.
- Oben links Szenario + Menü-Knöpfe, oben Mitte Zeitalter/Spielzeit, links Gruppen-Marken (Klick
  wählt, Doppelklick zentriert), unten links Zähler, unten Mitte Auswahl-Leiste (vorläufig, G4) und
  Befehlsraster 5×3 mit Tastenbeschriftung aus der Hotkey-Einstellung (klickbar, Aufblitzen,
  Tooltip, aktive Formation/Halten), unten rechts Minimap-Raute mit Kamera-Trapez
  (`src/app/minimap.ts`, Tests).
- Simulation: Befehle `formation` (Linie/versetzt/aufgelockert, Abstand in der Formationsberechnung)
  und `delete`; Timestep und Kampfmodell unverändert, alle bisherigen Tests grün.
- Offen: echte Formationsabstände des Spiels (nicht gemessen), Verschanzen ohne Funktion, Y/Z-
  Beschriftung ohne Keyboard-API nur per Sprach-Heuristik.

### G4 – erledigt
- `src/app/subgroups.ts` (rein, getestet): Typ-Karten in fester Reihenfolge, Tab/Strg+Tab-Zyklus
  über "Alle", Befehlsziele = aktive Untergruppe, nur Typ / Typ entfernen, Rückfall auf "Alle".
- HUD: aktive Karte hervorgehoben, Klick = nur Typ, Shift/Strg-Klick = entfernen (Taste in den
  Einstellungen), Einzelansicht mit Porträt-Kachel und Werten (laufend aktualisiert).
- Drill-Schritte `subgroup`, `removeType`, Befehle mit `onlyType`; Szenario 10 Untergruppen-Drill.
- Tests: Tab-Reihenfolge, Typ entfernen, Sterben der aktiven Untergruppe, Kontrollgruppen behalten
  die Zusammensetzung, Drill-Schritte (richtige/falsche Untergruppe).
- Offen: Formationsabstände nicht kalibrierbar im Menü (Spielwerte unbekannt), Reihenfolge der
  Typ-Karten im Spiel nicht belegt.

### G5 – erledigt
- Formationen nach Clips 8–10: Linie (Reihen nach Klasse, Kavallerie hinten), Keil (1/3/5/…),
  aufgelockert (Faktor 2); Tests in `tests/minimap.test.ts`.
- HUD nach Clip 6: Kartenreihenfolge Reiter/Bogen/Speer, Gruppenmarken (Anzahl, Klassenwappen,
  Gruppennummer), Minimap-Scheibe mit Ring und "N", Zeitalter-Ring, Maße der unteren Paneele,
  Einzelansicht nur bei einer Einheit, Halten-Symbol Stiefel.
- Leistung: Szenario 11 (100 gegen 100), FPS-Anzeige mit Sim- und Bild-ms, Simulation ≈ 1 ms/Tick
  bei 200 Einheiten; Bildrate auf Grafikhardware vom Nutzer zu prüfen.
- Vergleich: `docs/G5-VERGLEICH.md` mit Bildern in `docs/vergleich/` und Abweichungsliste.
- Offen (siehe Abweichungsliste): Gelände/Deko-Detail, Figuren-Detail, Spiel-Icons, Ressourcen-
  und Bevölkerungsanzeige (bewusst ersetzt), Porträts, Minimap-Symbole.
