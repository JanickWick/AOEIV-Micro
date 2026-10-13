# Die Welt der Freien Kompanie

Arbeitstitel: **Freie Kompanie** (Namensvorschläge und Prüfhinweise unten).

## Die Welt in zwei Absätzen

Im Grenzland zwischen drei verfallenden Fürstentümern gibt es keine stehenden Heere mehr, nur
Söldnerkompanien, die sich für eine Saison verdingen. Die Freie Kompanie ist eine davon: ein
Hauptmann, ein Dutzend Veteranen und jedes Frühjahr neue Rekruten aus den Dörfern am Fluss.
Die Kompanie hat kein Land, kein Banner mit Geschichte und keinen Fürsten, der sie schützt. Was
sie hat, ist Ausbildung: Wer bei ihr dient, lernt, wann ein Schuss sitzt und wann ein Schritt
zurück mehr wert ist als ein Treffer. Das Grenzland ist spätmittelalterlich, ohne Schießpulver und
ohne Zauber: Speer, Bogen, Schwert, Pferd und die großen Wurfmaschinen der Belagerungsmeister.

Jede Übung im Spiel ist ein Gefecht aus dem Alltag der Kompanie: ein Hinterhalt am Furtweg, eine
Schützenlinie, die vor anrückenden Speeren zurückweicht, eine Patrouille, die in eine Steinsalve
gerät. Statt Zeitaltern gibt es **Ausbildungsstufen** der Kompanie: Rekrut (I), Söldner (II),
Veteran (III) und Garde (IV). Eine höhere Stufe bedeutet bessere Ausrüstung und mehr Erfahrung,
niemals neue Regeln. Die Gegner sind andere Kompanien desselben Grenzlandes mit denselben
Waffen; wer gewinnt, hat besser geführt, nicht mehr Gold gehabt.

## Einheiten der Kompanie

| Kennung (Code) | Name | Rolle |
| --- | --- | --- |
| spearman | Speerkämpfer | leichte Nahkampf-Infanterie, stark gegen Kavallerie, stellt sich gegen Ansturm |
| archer | Bogenschütze | leichte Fernkampf-Infanterie, stark gegen leichte Nahkämpfer |
| crossbowman | Armbrustschütze | langsamer Schuss, stark gegen schwere Rüstung |
| man-at-arms | Schwertkämpfer | schwere Nahkampf-Infanterie, Rüstung gegen Pfeile |
| horseman | Reiter | leichte Kavallerie, stark gegen Schützen und Belagerung |
| knight | Ritter | schwere Kavallerie mit Ansturm |
| mangonel | Mangonel | Wurfmaschine mit Flächenschaden, Mindestreichweite |
| springald | Springald | Bolzenwerfer, stark gegen Nahkampf-Infanterie und Belagerung |

Alle Namen sind historische Gattungsbegriffe. Die Werte stehen in `src/data/units/*.json`
(eigenes Profil, erzeugt von `scripts/write-own-units.mjs`); sie sind gerundet und gegenüber dem
importierten Referenzprofil leicht verschoben, die Schadensformel und das Prinzip aus Reichweite,
Ausholzeit, Abklingzeit und Kontern bleiben gleich.

## Namensvorschläge

Alle fünf sind frei erfunden beziehungsweise Gattungsbegriffe; vor der Nutzung sind sie im
Markenregister (DPMA, EUIPO) und in der Steam-Suche zu prüfen, dazu die Domain und die Namen auf
itch.io. Ein Treffer heißt nicht automatisch Aus, aber dann braucht es einen Zusatz.

1. **Freie Kompanie** (Arbeitstitel): beschreibt die Welt wörtlich, klingt nach Truppe statt nach
   Tool, und die englische Form "Free Company" ist ein historischer Begriff für Söldnerheere.
2. **Grenzmark**: kurz, ein Wort, benennt den Schauplatz und funktioniert international ohne
   Übersetzung.
3. **Söldnerstahl**: betont Kampf und Handwerk, hat Wucht im Titelbild, ist aber nur auf Deutsch
   griffig.
4. **Graue Kompanie**: eine konkrete Truppe mit Farbe als Erkennungszeichen, leicht als Banner und
   Logo umzusetzen.
5. **Feldmeister**: betont das Training (der Feldmeister bildet aus), passt zum Trainer-Erbe und
   bleibt kurz.

Wenn ein Name bleibt, werden Titel in `index.html`, `package.json`, die Ladebildschirm-Zeile und
das Präfix der Speicherschlüssel (`kompanie.*`) angepasst.
