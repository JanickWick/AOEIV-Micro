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
| D, dann Linksklick | Patrouille zwischen Standort und Ziel |
| V | Position halten (Shift = einreihen) |
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
