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
```

## Steuerung (Stand M1)

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
| H | Position halten (Shift = einreihen) |
| P, dann Linksklick | Patrouille zwischen Standort und Ziel |
| Strg + 1–9 | Kontrollgruppe auf die aktuelle Auswahl setzen (alle anderen fallen raus) |
| Shift + 1–9 | Auswahl zur Kontrollgruppe hinzufügen |
| 1–9 | Kontrollgruppe auswählen; Doppeltipp zentriert die Kamera |
| Strg + Shift + M | Alle Militäreinheiten auswählen |
| Strg + Shift + T | Alle eigenen Einheiten des ausgewählten Typs auswählen |
| F10 | Einstellungen (auch Hotkey-Menü) |
| Pfeiltasten, Bildschirmrand, mittlere Maustaste ziehen | Kamera |
| Mausrad | Zoom |
| Minimap Linksklick / ziehen | Kamera springt |
| Minimap Rechtsklick | Bewegungsbefehl dorthin |
| F4 | Szenario sofort neu starten |
| F3 | Pause |

Alle Tasten sind im Einstellungsmenü frei belegbar (Belegen, Entfernen, Konflikte werden
aufgelöst, Reset auf das AoE4-Preset). Tasten werden als physische Taste gespeichert, deutsche
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
- [ ] M4: Gegner-KI in 3 Stufen, Szenarien 2 bis 8
- [ ] M5: Auswertung, Verlauf, Hotkey-Drill, Editor
