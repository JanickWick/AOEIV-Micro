# G0 – Inventur des Referenzmaterials und Datenabgleich

Stand: 2026-10-12. Quelle: Branch `claude/sweet-meitner-kjrzte`, Commit "Add files via upload",
sowie zwei Screenshots aus dem Chat.

## 1. Dateien

| Datei | Einordnung | Lesbar? | Gewinn |
| --- | --- | --- | --- |
| `Dorfzenter.rkp` (Wurzel, 416 065 Byte) | Hotkey-Profil aus `Documents/My Games/Age of Empires IV/<Profil>/keyBindingProfiles` | Ja, Textformat (Lua-ähnlich, CRLF), 27 906 Zeilen | Vollständige Tastenbelegung: 112 Bindungsgruppen, u. a. Kamera, Kontrollgruppen, Auswahl, Einheitenbefehle, Formationen. Daraus erzeugt: Preset "Mein Layout". |
| `keyBindingProfiles/Dorfzenter.rkp` | identische Kopie (gleicher MD5) | Ja | nichts Zusätzliches; Datei liegt jetzt einmal unter `reference/hotkeys/Dorfzenter.rkp`, die Wurzel-Kopie ist entfernt |
| Screenshot 1 (Chat, 1456×816 skaliert) | Vollbild im Spiel, Zeitalter IV, Armee mit 19 Einheiten, Gebäude rechts | Ja (Bild) | Kamera-Perspektive, HUD-Aufbau, Größenverhältnis Einheit/Bildschirm, Minimap-Raute |
| Screenshot 2 (Chat, 1503×406) | Ausschnitt der unteren Leiste | Ja (Bild) | Auswahl-Leiste, Befehlsraster mit Tastenbeschriftung, Ressourcenfeld |

Nicht vorhanden: Einheiten-/Waffendaten aus dem Content Editor, Videos, weitere Screenshots.
Die Screenshots liegen nur im Chat; ich kann Bilder nicht aus dem Chat in das Repository
übernehmen. Wenn du sie als Referenz im Projekt haben willst, lade sie unter `reference/screenshots/`
hoch (für G5 "Seite an Seite" nötig).

## 2. Einheiten- und Waffendaten

Keine Spieldateien vorhanden, daher **keine Änderung** an `src/data/units/*.json`. Tabelle alt/neu: leer.
Die 40 Platzhalter (Kollisionsradius, Beschleunigung, Drehrate, Projektiltempo, Mangonel-Radius,
Ansturm, Abwehrstellung) bleiben `verified: false`. Die Annahmen zu Kiten (Nachladen läuft beim
Laufen weiter) und zum Schadenszeitpunkt (Ende der Ausholzeit) bleiben unverändert und unbestätigt.

Was sie bestätigen würde (Rangfolge: Spieldatei vor aoe4world vor Angaben vor Annahmen):
- Content-Editor-Export der Einheiten (`ebps`/`sbps`-Attribute als XML/JSON): liefert Kollisionsradius
  (`collision_radius`), Drehrate, Beschleunigung, Sichtweite, Erfassungsreichweite (`leash`/`auto_target`).
- Waffen-Attribute (`weapon`-Blueprints): Aim/Windup/Attack/Winddown/Reload/Cooldown (bereits über
  aoe4world vorhanden), Projektilgeschwindigkeit, Flächenschaden-Radius und -Abnahme, Burst, Streuung.
- Fähigkeiten-Blueprints für Ansturm (Ritter) und Abwehrstellung (Speer): Bonusschaden, Anlauf, Abklingzeit.
- Video (60 fps, Zoom bekannt): Formationsabstand, Schussabstand mit/ohne Laufen, Dreh-/Anlaufverhalten.

## 3. Hotkey-Datei → Preset "Mein Layout"

`scripts/import-hotkeys.mjs reference/hotkeys/Dorfzenter.rkp` erzeugt `src/data/hotkeys/mein-layout.json`.
Das Preset ist jetzt Standard (Einstellungen → Hotkeys → Preset). 72 Aktionen belegt.

| Aktion im Tool | Spieldatei (Gruppe.Befehl) | Taste(n) | Status |
| --- | --- | --- | --- |
| Kamera hoch/runter/links/rechts | camera.pan_* | Pfeiltasten, Alt+W/S/A/D | aktiv |
| Kamera zurücksetzen | camera.default | Backspace | aktiv |
| Kamera auf Auswahl | hud_selection_orders.focus_selected | F5 | aktiv |
| Einstellungen (Menü) | hud_game.pause_menu | F10 | aktiv |
| Angriffsbewegung | abilities.squad_order_attack_move | A | aktiv |
| Stopp | abilities.squad_order_stop | S | aktiv |
| Patrouille | abilities.squad_order_patrol | D | aktiv |
| Position halten | abilities.general_toggle_stand_ground | **V** | aktiv |
| Einheit löschen | abilities.general_delete | Entf | ab G3 |
| Formation Linie / versetzt / aufgelockert | abilities.toggle_formation_line/wedge/spread | Z / X / C | ab G4 |
| Alle Militäreinheiten | hud_selection_orders.pick_all_military, select_all | Strg+Shift+C, Strg+Shift+A | aktiv |
| Alle untätigen Militäreinheiten | pick_all_idle_military | Strg+Komma | aktiv (neu) |
| Nächste untätige Militäreinheit | pick_next_idle_military | Komma | aktiv (neu) |
| Untergruppe nächster / voriger Typ | subselect_next / subselect_previous | Tab / **Strg+Tab** | ab G4 |
| Kontrollgruppe 0–9 auswählen (Doppeltipp zentriert) | hkgroup_select / hkgroup_focus | Zahl, Numpad | aktiv |
| Kontrollgruppe setzen | hkgroup_set | Strg+Zahl | aktiv |
| Zu Gruppe hinzufügen | hkgroup_add | Shift+Zahl | aktiv |
| Exklusiv zu Gruppe (aus anderen entfernen) | hkgroup_add_exclusively | Strg+Shift+Zahl | aktiv (neu) |
| Aus Gruppe entfernen | hkgroup_remove | Strg+Alt+Zahl | aktiv (neu) |
| Aus allen Gruppen entfernen | hkgroup_remove_all | Strg+Backspace | aktiv (neu) |
| Neustart / Pause | nicht im Spiel | F4 / F3 | eigene Wahl, orange markiert |

Nicht zuordenbar oder ohne Entsprechung:
- `select.allOfType` ("alle dieses Typs"): im Spiel `pick_all_of_current_types`, bei dir unbelegt → im Tool unbelegt.
- `hkgroup_add_exclusively0`: in der Datei unbelegt.
- Maus-Bindungen (`pan = MouseMiddle`, Zoom = Mausrad, `orbit = Alt`) sind fest eingebaut.
- Nicht relevant für das Tool: Produktion, Gebäude, Replay, Chat/Pings (F1–F4, H, Y, Space usw.).

Widerspruch zur Spezifikation (Abschnitt 2): dort steht "F Position halten, V Gangart". Die Spieldatei
sagt **V = Stellung halten (stand ground), F = Verschanzen (garrison)**. Die Icons im Screenshot passen
dazu (F: Pfeil ins Gebäude, V: Stiefel = Standhalten-Schalter). Umgesetzt ist die Spieldatei: V = Halten.
Bitte bestätigen.

Tastennamen: Die Relic-Engine benennt physische Tasten mit US-Namen. "Z" in der Datei ist damit die
Taste links neben X, auf deiner QWERTZ-Tastatur mit **Y** beschriftet. So ist es eingebaut
(`KeyZ` = physisch). Falls du im Spiel tatsächlich die obere Z-Taste drückst, sag Bescheid, dann
importiere ich mit `--qwertz-chars`.

## 4. Screenshots: erkannte UI-Elemente und Positionen (Bezug 2560×1440, aus 1456×816 hochgerechnet)

- Kamera: Blick schräg von oben, Karte erscheint als Raute; Einheiten-Gruppe von 19 Einheiten belegt
  etwa 180×120 px bei 1456 px Breite, also etwa 320×210 px bei 2560 px. Eine Einheit ist etwa 25–30 px
  hoch (bei 2560). Das sind die Zielwerte für Neigung/Sichtfeld in G1.
- Oben links (x≈45, y 45–200): vier runde Menü-Knöpfe untereinander.
- Oben Mitte (y≈65): Zeitalter-Ornament "IV"; darunter (y≈150) Spielzeit "00:52" in dunklem Kästchen.
- Oben rechts (x≈2490, y≈40): kleines Paneel mit Icon (Spielerliste/Diplomatie).
- Links am Rand (x≈60, y≈550/620/690): Kontrollgruppen-Marken: kleine Gruppennummer (1, 2, 3), Icon
  des Typs, Anzahl (5, 6, 7), vertikal gestapelt.
- Unten links: Feld mit Held/Sondereinheit (Elefant, "1") bei y≈1075; darunter Bevölkerung "26/40" und
  Dorfbewohner-Icon "6"; darunter vier Ressourcenzeilen (Nahrung, Holz, Gold, Stein) je mit Arbeiterzahl.
  Im Tool ersetzt durch eigene Einheiten / gegnerische Einheiten / Verluste.
- Unten Mitte (x≈280–830, y≈1200–1440): Auswahl-Leiste auf dunkelblauem Paneel mit feinem Rahmen:
  links Knopf "ALLE (19)" (hervorgehoben), daneben fünf Typ-Karten (Bild, Anzahl oben links: 4, 3, 3,
  5, 4), über den Karten kleine Veteranen-Marken.
- Unten Mitte rechts (x≈830–1200): Befehlsraster 5×3, nur Reihe 2 und 3 belegt: A Schwert
  (Angriffsbewegung), S Hand (Stopp), D Pfeil (Patrouille), F Pfeil-ins-Haus (Verschanzen);
  Z Linie, X Keil, C aufgelockert, V Stiefel (Stellung halten), ENTF Totenkopf (löschen). Jede Taste
  als Beschriftung unten rechts im Knopf, goldene Icons auf dunklem Grund.
- Unten rechts daneben (x≈1200–1450): Zahnrad-Paneel "Y" mit Produktions-/Bauknöpfen.
- Unten rechts (x≈2090–2500, y≈950–1400): Minimap als Raute in rundem Rahmen, Kamera-Trapez weiß,
  Einheiten als Punkte in Teamfarbe, Icons für Ressourcen/Reliquien; rechts daneben vertikale Leiste
  mit kleinen Knöpfen; ganz unten rechts Richtungs-Knöpfe.
- Farben: Paneele dunkelblau (#0e1b2d bis #142a44), Rahmen fein hell, Akzente gold (#c9a24d),
  Teamfarbe lila; Schrift hell serifenlos.

## 5. Weiterhin unbestätigt

| Wert | Woher die Klärung kommt |
| --- | --- |
| Kollisionsradius pro Einheit | Content-Editor (`collision_radius`) oder Video der Formation (Abstand Mitte zu Mitte) |
| Beschleunigung, Drehrate | Content-Editor (`acceleration`, `rotation_rate`) oder Video Anlauf/Drehen |
| Pfeil-/Bolzen-/Geschosstempo | Waffen-Blueprint (`projectile speed`) oder Video: Abschuss bis Treffer bei maximaler Reichweite |
| Mangonel-Flächenradius und -Abnahme | Waffen-Blueprint (`area_of_effect`) |
| Ansturm (Bonus, Anlauf, Abklingzeit), Abwehrstellung | Fähigkeiten-Blueprints oder Video Ritter gegen Speer |
| Auto-Angriffsreichweite, Verfolgungsgrenze | `leash`/`auto_target` im Content-Editor oder Video mit untätigen Einheiten |
| Nachladen beim Laufen, Schadenszeitpunkt | Video 60 fps: Zeit zwischen Schüssen mit/ohne Laufen; Speerstoß gegen weglaufendes Ziel |
| Formationsabstände Linie / versetzt / aufgelockert | Video oder Formations-Blueprint |
| Zoomstufen, Neigung, Sichtfeld der Kamera | weiterer Screenshot mit bekannter Entfernung (z. B. Bogenschütze mit Reichweitenring) |

## 6. Plan G1 bis G5

Siehe `docs/PLAN.md`, Abschnitt "Nächste Stufe".
