# G5 – Vergleich mit dem Spiel und verbleibende Abweichungen

Bezug: Clip 6 (`reference/videos/clip6-…mp4`, 1920×1080, Bild bei 6 s) gegen den Trainer bei
1920×1080 und UI-Größe 100 % (Szenario 10, alle Einheiten ausgewählt, Gruppen 4–6 belegt).
Bilder in `docs/vergleich/` (erzeugt mit Playwright im Software-Renderer, daher Schatten und
Kantenglättung schwächer als im Browser mit Grafikkarte).

| Bild | Inhalt |
| --- | --- |
| `hud-gesamt.png` | Gesamtbild nebeneinander |
| `leiste.png` | Untere Leiste: Zähler, Auswahl-Leiste, Befehlsraster |
| `minimap.png` | Minimap unten rechts |
| `gruppen.png` | Kontrollgruppen-Marken links |
| `kopf.png` | Zeitalter und Spielzeit oben Mitte |
| `formation-linie.png`, `formation-keil.png`, `formation-aufgelockert.png` | Formationen im Spiel (Clips 8–10), Vorlage für `src/sim/formation.ts` |

## Übereinstimmungen

- Aufteilung: Menü oben links, Zeitalter-Ring und Zeit oben Mitte, Gruppenmarken links,
  Zähler unten links, Auswahl-Leiste und Befehlsraster unten Mitte, Minimap-Scheibe unten rechts.
- Auswahl-Leiste: "ALLE (n)" blau, Typ-Karten mit Anzahl oben links, Reihenfolge Reiter, Bogen,
  Speer; aktive Untergruppe mit hellem Rahmen; Shift-Klick entfernt, Strg-Klick behält nur den Typ.
- Befehlsraster 5×3 mit denselben Positionen und Tasten (A S D F / Z X C V ENTF), Aufblitzen
  beim Drücken, Formationen mit den Reihenbildern Linie / versetzt / aufgelockert, Stiefel für
  Halten, Totenkopf für Löschen.
- Gruppenmarken: Anzahl klein oben links, Wappen mit Klassensymbol, große Gruppennummer.
- Minimap: runde Scheibe mit Goldring und "N", Karte als Raute, Kamera-Trapez weiß.
- Formationen: Linie als Block nach Klasse, Keil 1/3/5/…, aufgelockert mit doppeltem Abstand.

## Verbleibende sichtbare Abweichungen

1. **Gelände und Deko.** Das Spiel hat Texturen, Gras, Steine, Wege, Felsgruppen; der Trainer
   hat prozedurale Flecken, Low-Poly-Bäume, Felsen und Büsche. Bewusst, keine Spielgrafik.
2. **Figuren.** Spielfiguren haben Rüstung, Kleidung, Waffen mit Detail und Animationsübergänge;
   der Trainer nutzt prozedurale Gelenkfiguren mit Teamfarbe. Proportionen und Laufschritt sind
   aus den Clips angenähert (ASSUMPTIONS 64–68).
3. **Icons und Porträts.** Alle Symbole (Raster, Karten, Wappen, Menü) sind eigene Strichzeichnungen
   statt der gemalten Spiel-Icons; Typ-Karten zeigen Kürzel (H, A, S) statt Porträts.
4. **Zähler statt Ressourcen.** Das Spiel zeigt Bevölkerung, untätige Dorfbewohner und vier
   Ressourcen; der Trainer zeigt dort Auswahl, eigene, Gegner, Verluste und Ressourcenwert
   (Vorgabe aus der Aufgabenstellung).
5. **Paneel-Optik.** Spiel: dunkle Paneele mit Wappenrelief, Goldkanten und Schrägen; Trainer:
   flacher Verlauf mit Goldrand. Maße (Höhe ≈ 240 px, Breite ≈ 700 px, Minimap ≈ 380 px bei
   1080p) sind übernommen, Rundungen und Ornamente nicht.
6. **Fähigkeiten-Reihe (Q).** Im Spiel liegt in Reihe 1 eine Fähigkeit (violett); der Trainer hat
   keine Fähigkeiten, Reihe 1 bleibt leer. Verschanzen (F) ist ohne Funktion.
7. **Minimap-Inhalt.** Spiel: Geländefarben, Symbole für Ressourcen, Gebäude und Relikte, Einheiten
   als Punkte; Trainer: Gelände einfarbig mit Deko-Punkten und Einheitenpunkten. Die Seitenknöpfe
   (Warnung, Lupe, Drehung) fehlen.
8. **Oben rechts.** Spiel: Menü/Hilfe-Knopf; Trainer: FPS-Anzeige (abschaltbar).
9. **Schrift.** Spiel nutzt eine eigene Serifen-/Kapitälchen-Schrift; Trainer die Systemschrift
   (nur der Zeitalter-Ring in Serifen).
10. **Lebensbalken.** Spiel: rot (eigene) mit Rand, eingeblendet bei Auswahl; Trainer: blau/rot nach
    Spieler, Modus einstellbar.
11. **Marker und Mauszeiger.** Spiel-Klickmarker und Zeiger sind Spielgrafik; Trainer zeichnet
    eigene Ringe und einen einfachen Zeiger im Pointer-Lock.

## Leistung

- Simulation: 200 Einheiten (Szenario 11) ≈ 1,0 ms je Tick in Node (Vitest-Messung über 1800
  Ticks, schlechtester Tick 16 ms beim ersten Gruppenbefehl mit 100 Einheiten).
- Darstellung: Figuren pro Körperteil instanziert (≈ 25 Draw-Calls für alle Einheiten), Overlay
  im 2D-Canvas. Im Software-Renderer des Containers ≈ 5 ms JS-Zeit je Bild bei 1080p.
- Zu prüfen auf dem Zielrechner: Szenario 11 starten, Strg+Shift+C, A und auf den Gegner klicken;
  oben rechts FPS, Sim-ms und Bild-ms ablesen. Ziel: 60 FPS bei 200 Einheiten. Falls darunter:
  Schatten abschalten (Einstellungen), dann Lebensbalken auf "nur bei Auswahl".
