# Annahmen und Abweichungen vom echten Spiel

Jede Zeile ist entweder eine bewusste Vereinfachung (V), eine Annahme ohne Beleg (A)
oder ein Wert, den du im Spiel nachmessen solltest (M). Nachgemessene Werte trägst du
direkt in `src/data/units/*.json` ein und setzt `"verified": true`.

## Daten

1. (A) "Standardwerte ohne Zivilisations-Boni" = die Variante einer Einheit, die von den
   meisten Zivilisationen geteilt wird. Für Man-at-Arms Zeitalter II existiert nur die
   englische/HRE-Variante (120 HP, 10 Schaden, 3/3 Rüstung); für Ritter Zeitalter II nur
   die der Rus (190 HP, 19 Schaden, 3/3). Diese werden als Standard verwendet.
2. (A) Deutung der aoe4world-Zeiten (`aim, windup, attack, winddown, reload, cooldown`):
   `windup = aim + windup`, Schaden/Abschuss am Ende des Windups, `recovery = attack + winddown`,
   `cooldown = reload + cooldown`. Die Summe entspricht der angegebenen Angriffsperiode.
   Ob der Schaden am Anfang oder Ende der 0,125 s "attack"-Phase anfällt, ist nicht belegt.
3. (A, M) Die Abklingzeit läuft weiter, während die Einheit nach dem Schuss läuft. Kiten kostet
   nur die Zeit über den Cooldown hinaus plus Anhalten/Drehen und die erneute Ausholzeit.
   Laut deiner Angabe so umgesetzt, aber noch nicht im Spiel nachgemessen. Regel
   `cooldownRunsWhileMoving` im Einstellungsmenü abschaltbar.
4. (V, M) `setup`/`teardown` (Mangonel 1,0 s Teardown, Springald 0,25 s) werden derzeit nicht
   simuliert; Belagerung fährt nach dem Schuss sofort los. Nachmessen, dann einbauen.
5. (M, aus Video) Kollisionsradius: Infanterie 0,22, Kavallerie 0,40 (Auswahlring-Durchmesser
   0,45 bzw. 0,99 Tiles in den Clips, ±15 %), Belagerung 0,6 geschätzt. `verified` bleibt false,
   da nicht aus einer Spieldatei. Siehe `docs/G0-INVENTUR.md`, Abschnitt 4b.
6. (A, M) Beschleunigung (10 / 5 / 2 Tiles/s²) und Drehrate (720 / 360 / 120 °/s) für
   Infanterie / Kavallerie / Belagerung sind Schätzungen.
7. (M) Projektile: Pfeil-/Bolzengeschwindigkeit 12 Tiles/s, Mangonel-Geschoss 6 Tiles/s und
   Flächenradius 1,0 Tile sind Platzhalter. Messvorschlag: Zeit vom Abschuss bis zum Treffer
   bei maximaler Reichweite (Bogen 5 Tiles, Mangonel 8 Tiles).
8. (M) Ritter-Ansturm (Bonus 10, Anlauf 3 Tiles, Tempo ×1,4, Abklingzeit 10 s) und
   Speer-Abwehrstellung (Bonus 20, Auslöseabstand 2 Tiles, Dauer 1,5 s) sind Platzhalter
   in `abilities`.
9. (A) Bonus-Schaden gilt, wenn das Ziel alle Tags einer Bonus-Gruppe trägt. Tags = aoe4world-
   Klassen plus die Wörter der Anzeigeklasse ("Light Melee Infantry" -> light, melee, infantry).
10. (V) Sichtweite (`sight.line`, z. B. 36) wird nicht für Nebel benutzt; die Auto-Angriffs-
    reichweite für untätige Einheiten wird in M2 als eigene Regel definiert (Vorschlag:
    Waffenreichweite + 6 Tiles, nachmessen).

## Kampf

23. (A) Bewegungsbefehl im Windup bricht den Angriff ohne Schaden ab; Neuwahl des Ziels ebenso.
    Nach dem Schadenszeitpunkt darf die Einheit sofort laufen (Recovery wird abgebrochen).
24. (A, M) Nahkampf verfehlt, wenn das Ziel beim Schadenszeitpunkt weiter als Reichweite + 0,15
    Tiles (Regel `meleeHitTolerance`) entfernt ist. Im Spiel: Läuft ein Speerstoß ins Leere, wenn
    der Schütze während der Ausholzeit wegläuft?
25. (A) Reichweite wird Rand zu Rand gemessen (Abstand der Mittelpunkte minus beide
    Kollisionsradien), für Nah- und Fernkampf.
26. (A) Schaden wird nach Resistenz auf ganze Zahlen gerundet, mindestens 1.
27. (A, M) Die 85-%-Fernkampf-Resistenz von Mangonel/Springald (aus aoe4world) gilt nicht für
    Angriffe von Belagerungseinheiten (Springald). Belagerungsschaden (Mangonel) ignoriert
    Rüstung (Regel `siegeIgnoresArmor`).
28. (A) Pfeile/Bolzen folgen dem Ziel und treffen immer; stirbt das Ziel vorher, verpufft der
    Pfeil. Mangonel: 3 Geschosse pro Schuss (Burst aus den Daten) auf die Zielposition zum
    Abschusszeitpunkt, zwei davon mit zufälliger Streuung bis 0,8 × Flächenradius; kein
    Eigenbeschuss; Flächenschaden ohne Abnahme (Platzhalter `splashFalloff` 0).
29. (A) Vor dem Angriff dreht sich die Einheit bis auf 15° zum Ziel (Regel `attackFacingTolerance`),
    mit ihrer Drehrate. Das ist der "Drehen"-Anteil der Kiting-Kosten.
30. (A, M) Untätige Einheiten erfassen den nächsten Gegner im Abstand max(Waffenreichweite, 8 Tiles)
    (Regel `autoAcquireRange`), verfolgen bis 12 Tiles von ihrer Ausgangsposition (`leashRange`) und
    bleiben dann stehen. Zielsuche alle 6 Ticks (0,1 s).
31. (A) Kein Overkill-Schutz: jede Einheit wählt ihr Ziel unabhängig; laufende Projektile zählen
    nicht als "schon tot".
32. (A, M) Ritter-Ansturm: nach 3 Tiles zusammenhängendem Anlauf auf ein Ziel wird die Einheit
    1,4× so schnell, der nächste Treffer erhält +10 Schaden, danach 10 s Abklingzeit. Alle Werte
    Platzhalter (kalibrierbar). Im Spiel ist der Ansturm an die Angriffsanimation gebunden; das
    Modell hier ist eine Näherung.
33. (A, M) Speer-Abwehrstellung: ein stehender Speerkämpfer stellt sich auf, wenn anstürmende
    Kavallerie bis auf 2 Tiles kommt; erreicht sie ihn, erleidet sie 20 Schaden, der Ansturm
    bricht ab. Platzhalter.
34. (V) Belagerungseinheiten (Mangonel) innerhalb der Mindestreichweite bleiben stehen statt
    zurückzuweichen.
35. (A) Gegner-KI "leicht": alle 0,5 s (einstellbare Reaktionszeit) Attack-Move der untätigen
    Einheiten auf den Schwerpunkt der Spielertruppe.
36. (A) Szenario 1 startet die Speerkämpfer ca. 9 Tiles vor den Schützen (knapp außerhalb der
    Reichweite), weil 10 Bogenschützen 6 Speerkämpfer aus großer Entfernung auch ohne Micro
    verlustfrei besiegen.

## Gegner-KI

42. (A) KI mittel/schwer bewertet Ziele nach Konter-Bonus, Anteil fehlender HP, bereits
    fokussierenden Verbündeten und Nähe; Kavallerie bevorzugt Schützen und meidet Speerkämpfer.
    Mangonels zielen auf die Einheit mit den meisten Gegnern im Flächenradius.
43. (A) KI schwer kitet, wenn ein Nahkämpfer näher als 60 % der Waffenreichweite + 1 Tile ist und
    die Abklingzeit noch länger als 0,3 s läuft; weicht 2,5 Tiles zurück.
44. (A) KI schwer zieht Einheiten unter 35 % HP zurück, wenn ein Nahkämpfer näher als 4,5 Tiles
    ist (7 Tiles weg vom Bedroher).
45. (A) KI schwer weicht Geschossen aus, sobald das Geschoss in der Luft ist (mittlerer
    Einschlagpunkt aller anfliegenden Geschosse, Flächenradius + 1,5 Tiles). Mit den
    Platzhalterwerten (6 Tiles/s) schafft das nur, wer mindestens ~1,2 s Flugzeit hat, also
    Kavallerie oder Ziele am Rand der Reichweite. Nach der Kalibrierung neu bewerten.
46. (A) Kavallerie der KI schwer legt einen Wegpunkt 4,5 Tiles seitlich an Speerkämpfern vorbei,
    die näher als 2,5 Tiles an der direkten Linie zum Ziel stehen; ohne Wegfindung bleibt das
    eine Näherung.
47. (A) Szenario-Aufstellungen (Anzahl, Abstände, Zeitalter) sind meine Wahl nach der
    Spezifikation; Szenario 5 und 7 geben Mangonels Speerkämpfer als Schutz, damit "splitten"
    und "an den Speeren vorbei" trainiert werden.

## Hotkey-Import

56. (A) Tastennamen in der .rkp-Datei sind US-Namen physischer Tasten; "Z" wird auf `KeyZ`
    abgebildet (auf QWERTZ die mit Y beschriftete Taste links neben X). Bestätigung offen.
57. (Spieldatei) Position halten = V, Patrouille = D, Verschanzen = F (hier ohne Funktion),
    Untergruppe vor = Tab, zurück = Strg+Tab, alle Militäreinheiten = Strg+Shift+C und Strg+Shift+A.
58. (A) Neustart F4 und Pause F3 haben keine Entsprechung im Spiel und bleiben eigene Wahl.

## 3D-Darstellung (G1)

59. (M) Kamera: Neigung 45°, vertikales Sichtfeld 35°, aus dem Minimap-Trapez des Screenshots
    (Breite fern/nah 1,94, Tiefe/nahe Breite 1,12) gelöst; ±3° bei der Neigung. Drehung 45° (Karte
    als Raute). Standardabstand 31 Tiles aus dem Video-Maßstab (55,6 px/Tile bei 1080p ≈ 74 px/Tile
    bei 1440p, ±15 %). Figurhöhe Infanterie ≈ 0,6 Tiles, Kavallerie ≈ 0,8 (Bildhöhe 25 px im Clip).
60. (A) Bildschirm-rechts entspricht der Weltrichtung (+x, +y)/√2, Bildschirm-oben (+x, −y)/√2.
    Spieler-Gruppen (kleines x) liegen damit links unten, Gegner rechts oben. Kamera-Drehung
    ([ ] im Spiel) ist nicht umgesetzt.
61. (A) Zoom ändert den Kameraabstand (18 bis 90 Tiles) bei festem Sichtfeld; das Spiel hat
    feste Zoomstufen, deren Werte nicht bekannt sind.
62. (A) Deko liegt nur im Randstreifen (10 Tiles) und mindestens 12 Tiles von Gruppenzentren
    entfernt; Bäume (Radius 0,6) und Felsen (0,9) kollidieren, Büsche nicht. Einheiten umlaufen
    Hindernisse tangential ohne Wegfindung. Die Kampfzone in der Mitte bleibt frei, damit Drills
    nicht von Hindernissen abhängen.
63. (A) Klick trifft die Figur, wenn der Zeiger höchstens max(10 px, Kollisionsradius) von der
    Strecke Fuß–Kopf (Höhe 1,6 / 1,9 / 1,3 Tiles für Infanterie / Kavallerie / Belagerung) entfernt ist.

## Figuren, Animation, Effekte (G2)

64. (V) Figuren prozedural (keine Fremdmodelle): Rig mit Hüfte, Knie, Schulter, Ellbogen, Rumpf, Kopf;
    Pferd mit vier Beinen, Hals, Kopf; Belagerung als Basis mit Rädern und Wurf-/Bogenarmen.
    Silhouetten je Typ über Waffe/Schild/Helm, nicht über Kleidung.
65. (A) Schrittlänge 0,42 Tiles (Infanterie), 0,9 (Pferd): Laufphase = Strecke / Schrittlänge; im
    Spiel nicht gemessen.
66. (A) Angriffsanimation: Ausholen läuft über die Windup-Zeit (Datenwert), der Hieb/Stoß/Abschuss
    liegt am Schadenszeitpunkt, der Nachlauf über die Recovery-Zeit. Ein Abbruch blendet in 0,2 s
    zur Ruhepose zurück (sichtbar, aber nicht an eine Spielanimation angelehnt).
67. (A) Trefferreaktion: Rumpf lehnt 8 Ticks nach dem Treffer zurück. Tod: Umkippen in 0,35 s,
    Körper bleibt bis 2,5 s liegen, versinkt bis 3,2 s. Im Spiel bleiben Leichen länger.
68. (A) Projektilbahn: Bodenpunkt aus der Simulation (Tempo aus den Daten), Höhe als Sinusbogen mit
    Scheitel 12 % der Flugstrecke (Pfeil/Bolzen) bzw. 35 % (Mangonel), mindestens 0,3 / 1,0 Tiles.
69. (V) Ton synthetisch (Web Audio), keine Spiel-Samples; Lautstärke und Schalter in den Einstellungen.
    Befehlsbestätigung nur bei eigenen Befehlen.

## Auswertung, Drill, Upgrades

48. (A) APM zählt jede Eingabe (Befehl, Auswahländerung, Kontrollgruppe) pro Minute Spielzeit;
    effektive APM zählt nur Befehle und ignoriert eine identische Wiederholung innerhalb von 0,5 s.
    Das Spiel zählt anders (Klicks/Tasten); die Werte sind untereinander, nicht mit dem Spiel vergleichbar.
49. (A) Kite-Effizienz = abgegebene Fernkampfangriffe / mögliche Angriffe; "möglich" = Summe der
    Ticks, in denen ein Gegner in Waffenreichweite stand, geteilt durch die Angriffsperiode.
    Ein Schütze, der ohne Laufen in Reichweite steht, erreicht knapp 100 %.
50. (A) Overkill = Schaden über die Rest-HP hinaus plus der Schaden aller zielsuchenden Projektile,
    deren Ziel vor dem Einschlag starb. Gleichzeitig beschossene Ziele = verschiedene Ziele je Tick
    (Einheiten im Windup plus Projektile in der Luft), gemittelt über Ticks mit mindestens einem.
51. (A) Idle-Zeit wird erst ab dem ersten Treffer gezählt: Einheit ohne Befehl und ohne Ziel.
52. (A) Vergleichslauf "nur Attack-Move": derselbe Seed, die leichte KI steuert deine Seite,
    Abbruch nach 180 s Spielzeit.
53. (A) Bestwert: Sieg vor Niederlage, dann geringster Verlustwert, dann kürzeste Dauer. Drill:
    mittlere Reaktionszeit plus 500 ms je Fehlgriff.
54. (A) Drill: Marker liegt bis 9 Tiles vom Schwerpunkt der Einheiten, Befehlsziel darf 3 Tiles
    abweichen; Pause zwischen Ansagen 0,9 bis 2,2 s; Zeit läuft in Echtzeit (nicht Spielzeit).
55. (A) Schmiede-Upgrades als vier Stufenwerte 0–3 (je +1): Fernkampf-Angriff für Fernkampf-
    Infanterie, Nahkampf-Angriff für Nahkämpfer, beide Rüstungen für Infanterie und Kavallerie;
    Belagerung erhält keines. Das entspricht den Schmiede-Upgrades des Spiels je Zeitalter
    (Feudal/Burg/Imperial), ohne Zivilisations-Besonderheiten.

## Bewegung und Formation

11. (A) Gemischte Gruppen laufen mit dem Tempo der langsamsten Einheit (Regel
    `formationSpeedMatching`, abschaltbar).
12. (A, M) Formation: breiter Block (Spalten ≈ √(2,5·n)), Nahkämpfer vorn, Schützen dahinter,
    Belagerung hinten; Platzabstand = 2·Radius + 0,2 Tiles (aus Video: Infanterie 0,65, Kavallerie
    0,93 Tiles Mitte zu Mitte); Block um den Zielpunkt zentriert. Linie/versetzt/aufgelockert folgen
    in G4.
13. (V) Keine Wegfindung, keine Hindernisse: offenes Feld, Einheiten laufen geradeaus und
    schieben sich weich auseinander. Blockierte Einheiten geben in Zielnähe nach 0,5 s auf.
14. (A) Ankunftstoleranz 0,06 Tiles; Einheiten bremsen mit ihrer Beschleunigung ab.
15. (V) Kein Terrain, keine Höhen, keine Gebäude.

## Steuerung und Darstellung

16. (A) Bewegungsbefehl wird beim Drücken der rechten Maustaste ausgelöst (minimale Latenz).
    Rechtsklick-Ziehen zum Ausrichten der Formation ist nicht umgesetzt.
17. (A) Doppelklick = alle eigenen Einheiten desselben Typs im sichtbaren Bildausschnitt;
    Zeitfenster 350 ms.
18. (V) Draufsicht (top-down) statt der Spielperspektive; Standardzoom 48 px/Tile, also
    etwa 27 Tiles Breite bei 1280 px, zoombar 28 bis 80 px/Tile.
19. (A) Rand-Scrolling bei ≤ 6 px zum Rand mit 1100 px/s, Pfeiltasten ebenso. Im Spiel ist die
    Geschwindigkeit einstellbar; folgt im Einstellungsmenü (M3).
20. (A) Lebensbalken standardmäßig immer sichtbar (einstellbar).
21. (A) Hotkeys werden als physische Taste (KeyboardEvent.code) gespeichert, damit Y/Z auf
    deutschem Layout stimmen. Im Preset sind nur Kamera (Pfeiltasten) und Kontrollgruppen
    (Strg/Shift/Zahl) sicher; A (Angriffsbewegung), S (Stopp), H (Halten), P (Patrouille),
    Strg+Shift+M/T (Auswahl), F3/F4/F10 sind Vorschläge und im Menü als "unsicher" markiert.
37. (A) Angriffsbewegung und Patrouille: Hotkey drücken, dann Linksklick auf das Ziel (wie im
    Spiel). Mit Shift beim Klick bleibt der Modus aktiv und der Befehl wird eingereiht.
38. (A) Rechtsklick-Ziehen richtet die Formation aus: der normale Bewegungsbefehl wird sofort beim
    Drücken erteilt und beim Loslassen (ab 14 px Ziehen) durch denselben Befehl mit Blickrichtung
    ersetzt. Nicht kombinierbar mit Shift-Einreihen.
39. (A) Patrouille pendelt zwischen Standort beim Befehl und Zielpunkt, greift unterwegs Gegner in
    Erfassungsreichweite an und läuft danach weiter; danach eingereihte Befehle werden nie erreicht.
40. (A) Position halten: Einheit verfolgt nicht, greift aber Gegner in Waffenreichweite an.
41. (V) Pointer-Lock zeichnet einen eigenen Mauszeiger; Browser geben ihn mit Esc frei, der
    nächste Klick ins Spielfeld sperrt wieder.
22. (V) Spieltempo 50/75/100 % skaliert die Simulationszeit, nicht den Takt.
