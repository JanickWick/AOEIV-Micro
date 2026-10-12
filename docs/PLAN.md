# Plan und Rückfragen

## Rückfragen (bitte beantworten, M1 läuft solange mit den genannten Annahmen)

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

### M2 – Kampfmodell, Szenario 1
- Zielwahl/Angriffsbefehl (Rechtsklick auf Gegner), Zustandsautomat: Annähern -> Windup -> Treffer/
  Projektil -> Recovery -> Cooldown; Bewegungsbefehl im Windup bricht ohne Schaden ab.
- Schaden = Angriff + Bonus - Rüstung, mindestens 1. Projektile mit Flugzeit; Pfeile zielsuchend,
  Mangonel-Geschoss auf Bodenpunkt mit Flächenschaden (Burst 3), ausweichbar.
- Auto-Angriff untätiger Einheiten mit begrenzter Verfolgung; kein Overkill-Schutz.
- Ritter-Ansturm und Speer-Abwehrstellung (Platzhalterwerte).
- Szenario 1 (10 Bogen gegen 6 Speer) mit einfacher Gegner-Steuerung (Attack-Move), Sieg/Niederlage.
- Tests: "Bewegungsbefehl im Windup verursacht keinen Schaden", "Speer gegen Reiter erhält Bonus",
  "Rüstung senkt Schaden, Minimum 1", "Projektil trifft nach Flugzeit", "Mangonel verfehlt bewegtes Ziel".

### M3 – Befehle und Hotkeys
- Attack-Move, Stopp, Position halten, Patrouille; Shift-Ketten für alle Befehle.
- Kontrollgruppen (Strg/Shift/Zahl, Doppeltipp zentriert), "alle Militäreinheiten",
  "alle dieses Typs".
- Einstellungsmenü für alle Hotkeys mit AoE4-Preset, Vollbild mit Keyboard-/Pointer-Lock,
  Scroll-Geschwindigkeit.

### M4 – KI und Szenarien 2 bis 8
- KI-Stufen Leicht/Mittel/Schwer mit einstellbarer Reaktionszeit, nur über normale Befehle.
- Szenarien als JSON mit Siegbedingungen und Wertung.

### M5 – Auswertung, Drill, Editor
- Kampfstatistik (Verluste, Ressourcenwert, APM/eAPM, Kite-Effizienz, Overkill, Idle-Zeit,
  Windup-Abbrüche), Verlauf der letzten 20 Versuche, Vergleichslauf "nur Attack-Move".
- Hotkey-Drill, freier Editor.
