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
5. (A, M) Kollisionsradius: Infanterie 0,25, Kavallerie 0,35, Belagerung 0,6 Tiles. Nicht in
   der Quelle. Messvorschlag: Abstand zweier stehender Speerkämpfer in Formation (Mitte zu Mitte).
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

## Bewegung und Formation

11. (A) Gemischte Gruppen laufen mit dem Tempo der langsamsten Einheit (Regel
    `formationSpeedMatching`, abschaltbar).
12. (A) Formation: breiter Block (Spalten ≈ √(2,5·n)), Nahkämpfer vorn, Schützen dahinter,
    Belagerung hinten; Platzabstand = 2·Radius + 0,5 Tiles; Block um den Zielpunkt zentriert.
    Das echte Spiel hat mehrere wählbare Formationen; hier nur diese eine.
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
