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

## 4b. Videos (nachgereicht)

Fünf Clips unter `reference/videos/` (1920×1080, nominell 59,94 fps, tatsächlich ≈ 26–29 Bilder/s
durch ausgelassene Bilder; Zeitstempel sind erhalten, Messunsicherheit je Zeitpunkt ±1 Bild ≈ ±40 ms).

| Clip | Dauer | Inhalt | Nutzbar für |
| --- | --- | --- | --- |
| clip1 | 8,1 s | Lanzenreiter (Ritter, Zeitalter III: 230 HP, 24 Angriff, 4/4 Rüstung, Tempo 1,62) im Nahkampf, Kamera schwenkt | Werte im Infofeld |
| clip2 | 10,8 s | 8 Lanzenreiter in Keilformation, Anlauf und Ansturm auf Speerkämpfer | Formationsabstand Kavallerie, Ansturm sichtbar |
| clip3 | 9,4 s | Stehende Formation, Kamera fährt | wenig (Einheiten am Bildrand) |
| clip4 | 8,4 s | Bogenschützen laufen und kämpfen | Bewegung |
| clip5 | 10,3 s | 15 Bogenschützen ziehen sich vor Speerkämpfern zurück, Kamera 3,0–5,0 s statisch | Maßstab, Formationsabstand Infanterie |
| clip6 | 17,3 s | Vollständiges HUD bei gemischter Auswahl (5 Reiter, 5 Bogen, 5 Speer): Typ-Karten, Tab-Untergruppe (weißer Rahmen), Gruppenmarken 4/5/6, Minimap-Scheibe | HUD-Vergleich (G5), Kartenreihenfolge |
| clip7 | 10,1 s | Karten-Klicks: Shift+Klick entfernt den Typ (15 → 10), Strg+Klick behält nur ihn (→ 5) | Auswahl-Leiste (G4) |
| clip8 | 12,3 s | Formation Linie (Z): Block 3 Reihen zu 5 nach Klasse, Bewegung und Neuordnung | Formationen (G5) |
| clip9 | 10,2 s | Formation Keil (X): Reihen 1 / 3 / 5 / 6 von hinten, Reiter an der Spitze | Formationen (G5) |
| clip10 | 11,3 s | Formation aufgelockert (C): gleiche Ordnung mit ≈ doppeltem Abstand | Formationen (G5) |

**Formationen (Clips 8–10, 1080p, 55,6 px/Tile).** Linie: Reiter in der hintersten Reihe, Bogenschützen
in der Mitte, Speerkämpfer vorn (vorn = Richtung der letzten Bewegung, in Clip 8 nach unten links).
Spaltenabstand im Block ≈ 50 px Infanterie, ≈ 55 px Reiter (0,9 bzw. 1,0 Tiles), Reihenabstand ≈ 1 Tile.
Keil: Reihenbreiten 1, 3, 5 und Rest (6) von der Spitze (hinten, Reiter) nach vorn. Aufgelockert:
Reiter ≈ 120 px, Infanterie ≈ 90–95 px Spaltenabstand, Reihen ≈ 90 px, also etwa Faktor 2.
Die Rasterzelle der gewählten Formation blitzt beim Drücken kurz auf (Clip 8 bei Z, Clip 10 bei C).

**Maßstab (Pixel pro Tile).** In Clip 5 ist die Kamera zwischen 3,0 und 5,0 s unbewegt (Differenzbild
des Hintergrunds dunkel). Der Schwerpunkt der pinken Bogenschützen wandert von (1084, 407) nach
(1201, 354) Pixel, gleichmäßig in beiden Sekunden (72 und 66 px/s), also durchgehendes Laufen mit
1,25 Tiles/s = 2,5 Tiles. Mit Neigung 45° (vertikale Bildkomponente durch sin 45° geteilt) ergibt
das **55,6 px/Tile** bei 1080p. Gegenprobe: Lanzenreiter in Clip 2, Bild 0–12 bei stehender Kamera,
1,62 Tiles/s → 50,5 px/Tile. Unsicherheit etwa ±15 % (Annahme "läuft durchgehend", Ablesung ±10 px).

**Abgeleitete Werte** (alle "aus Video", `verified` bleibt false):

| Größe | Messung | Tiles | Bisher | Neu im Tool |
| --- | --- | --- | --- | --- |
| Bogenschütze, Abstand Mitte–Mitte in Formation | 36 px | 0,65 | 1,0 (2·0,25 + 0,5) | 0,64 (2·0,22 + 0,2) |
| Bogenschütze, Auswahlring-Durchmesser | 25 px | 0,45 | – | Kollisionsradius 0,22 (vorher 0,25) |
| Lanzenreiter, Abstand in Formation | 52 px | 0,93 | 1,2 (2·0,35 + 0,5) | 1,0 (2·0,40 + 0,2) |
| Lanzenreiter, Auswahlring-Durchmesser | 55 px | 0,99 | – | Kollisionsradius 0,40 (vorher 0,35) |
| Figurhöhe Infanterie (Bildhöhe) | 25 px | 0,45 | Platzhalter 1,6 | 0,6 (Kavallerie 0,8) |
| Zoom der Aufnahmen | 55,6 px/Tile (1080p) | ≈ 74 px/Tile bei 1440p | Kameraabstand 52 (44 px/Tile) | Kameraabstand 31 |

Der Zoom der Clips und des Screenshots stimmen nach den Einheitenabständen in etwa überein
(Screenshot ≈ 68 px/Tile bei 2560 hochgerechnet); die frühere Annahme "Abstand = 1 Tile" war der
Grund für den zu großen Kameraabstand.

**Nicht messbar aus diesen Clips** (Einheiten ≈ 25 px, Pfeile wenige Pixel, Kameraschwenks,
26 Bilder/s): Zeit zwischen Schüssen mit/ohne Laufen, Ausholzeit, Schadenszeitpunkt,
Projektilgeschwindigkeit, Drehrate, Beschleunigung, Ansturm-Bonus/Anlaufstrecke. Der Ansturm der
Lanzenreiter ist in Clip 2 sichtbar (Staub/Streifen etwa 2,0–3,0 s, ≈ 1 s, danach Normaltempo),
Zahlen dazu bleiben Platzhalter. Die Annahmen zu Kiten (Nachladen läuft beim Laufen weiter) und zum
Schadenszeitpunkt bleiben unverändert und unbestätigt.

**Was es für die offenen Werte bräuchte:** Clips mit maximalem Zoom (Kamera nah) auf 2–3 Einheiten,
Kamera unbewegt, Aufnahme mit konstanten 60 fps (OBS: "Bildrate 60 fest", kein variabler Modus):
(a) ein Bogenschütze schießt dreimal stehend; (b) derselbe schießt, läuft 1 s, schießt wieder;
(c) ein Speerkämpfer stößt zu, während das Ziel wegläuft; (d) ein Ritter läuft 10 Tiles an und
trifft; (e) eine Mangonel schießt auf 8 Tiles Entfernung.

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
