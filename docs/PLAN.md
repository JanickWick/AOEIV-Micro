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
