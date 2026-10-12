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
| Rechtsklick | Bewegen (Befehl wird beim Drücken ausgelöst, nicht beim Loslassen) |
| Shift + Rechtsklick | Befehl einreihen (Wegpunkte); bei gehaltenem Shift werden die Wegpunkte angezeigt |
| S | Stopp |
| Pfeiltasten, Bildschirmrand, mittlere Maustaste ziehen | Kamera |
| Mausrad | Zoom |
| Minimap Linksklick / ziehen | Kamera springt |
| Minimap Rechtsklick | Bewegungsbefehl dorthin |
| F4 | Szenario sofort neu starten |
| F3 | Pause |

Alle Tasten sind in `src/app/hotkeys.ts` als Preset hinterlegt und werden in M3 über ein
Einstellungsmenü frei belegbar. Browser-Standardaktionen (Kontextmenü, Strg+Zahl, Leertaste,
F-Tasten außer F11/F12, Tab, Alt) werden im Spiel unterdrückt. Vollbild über den Button
(mit Keyboard-Lock, sofern der Browser es unterstützt – Chrome/Edge).

## Projektstruktur

```
src/sim/            Simulation, reine Logik ohne Browser (fester Takt 60 Ticks/s, deterministisch)
  math.ts           Vektoren und Winkel
  rng.ts            Seed-basierter Zufall (kein Math.random in der Simulation)
  unitDefs.ts       Typen und Lader für die Einheitendaten
  types.ts          Welt, Einheiten, Befehle, Regeln
  world.ts          Welt anlegen, Einheiten spawnen
  formation.ts      Lockere Blockformation für Gruppenbefehle
  commands.ts       Befehle anwenden (Bewegen, Stopp, Einreihen)
  movement.ts       Beschleunigung, Drehen, Ankunft, Kollision, Blockade-Erkennung
  step.ts           Ein Tick
  scenario.ts       Szenario-Datei -> Welt
  hash.ts           Zustands-Hash für Determinismus-Tests
src/app/            Browser-Seite: Kamera, Eingabe, Darstellung (Canvas 2D), Hotkeys
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
- [ ] M2: Kampfmodell (Windup/Cooldown, Projektile, Flächenschaden), Szenario 1 spielbar
- [ ] M3: Kontrollgruppen, Befehlsketten, Attack-Move/Stopp/Halten/Patrouille, Hotkey-Menü, Vollbild
- [ ] M4: Gegner-KI in 3 Stufen, Szenarien 2 bis 8
- [ ] M5: Auswertung, Verlauf, Hotkey-Drill, Editor
