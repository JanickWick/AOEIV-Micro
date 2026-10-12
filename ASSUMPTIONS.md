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
3. (A, M) Der Cooldown läuft weiter, während die Einheit nach dem Schuss läuft (Kiten kostet
   keine Angriffe, solange man rechtzeitig wieder in Reichweite ist). In M2 als Regel
   `cooldownRunsWhileMoving` schaltbar. Bitte im Spiel prüfen: Schießt ein Bogenschütze nach
   kurzem Laufen sofort wieder, oder beginnt die Nachladezeit von vorn?
4. (M) `setup`/`teardown` (Mangonel 1,0 s Teardown, Springald 0,25 s) werden ab M2 als
   Verzögerung vor dem Losfahren nach einem Schuss interpretiert. Nachmessen.
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
20. (A) Lebensbalken werden bei Auswahl oder Schaden gezeigt.
21. (A) Hotkeys werden als physische Taste (KeyboardEvent.code) gespeichert, damit Y/Z auf
    deutschem Layout stimmen. Neustart F4, Pause F3, Stopp S sind Vorschläge.
22. (V) Spieltempo 50/75/100 % skaliert die Simulationszeit, nicht den Takt.
