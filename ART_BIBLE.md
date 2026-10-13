# Stilblatt (Art Bible) – Freie Kompanie, Grafik-Stufe 3

Stand: Schritt A (H1), wartet auf Freigabe. Beispielbilder unter `assets/raw/style/` (roh) und
`assets/processed/style/` (nachbearbeitet), Prompts unter `assets/prompts/style/`, Übersicht auf der
Vorschauseite `assets-preview.html` (`npm run dev`, dann http://localhost:5173/assets-preview.html).

## 1. Leitidee

Realistisch-mittelalterlich, gemalt mit scharfem Detail ("painterly realism"), warmes Licht eines
späten Sommernachmittags. Stimmung wie die Referenz-Screenshots: trockenes, goldenes Gras,
staubige Oliventöne, lange weiche Schatten, leichter Dunst in der Ferne. Keine Fantasy-Übertreibung,
keine Comic-Konturen, keine Grafik anderer Spiele nachzeichnen.

Jedes neue Bild bekommt das Schlüsselbild `assets/style/ref-battlefield.jpg` (oder ein passendes
Bild aus diesem Stilblatt) als Referenz und den Stilblock aus Abschnitt 7 im Prompt.

## 2. Farbpalette

| Zweck | Farbe | Hinweis |
| --- | --- | --- |
| Sonnenlicht | `#F2D58A` | warm, von oben links |
| Himmel / Dunst | `#D9C9A3` | Fernsicht wird dahin aufgehellt |
| Gras trocken | `#A89659` | Grundton Boden |
| Gras olive | `#6F7A3C` | Flecken, Büsche, Bäume |
| Erde hell | `#B08A5A` | Wege, offene Stellen |
| Erde dunkel | `#6E5236` | Schatten, Abdrücke |
| Fels | `#8F8678` | kühles Grau mit warmem Stich |
| Holz | `#7A4F2A` | Schäfte, Schilde, Gebäude |
| Leder | `#6A4528` | Kappen, Gürtel, Köcher |
| Stahl | `#9AA3AD` | Helme, Klingen, matt |
| Paneel | `#141A24` | Interface-Grund, blauschwarz |
| Gold | `#C9A24F` | Rahmen, Hervorhebung, aktive Knöpfe |

Sättigung insgesamt gedämpft; die gesättigten Farben sind den Teamfarben vorbehalten.

## 3. Teamfarben (farbenblind-tauglich)

| Team | Farbe | Lesbarkeit |
| --- | --- | --- |
| Spieler | Blau `#1F5FBF` | dunkel, kühl |
| Gegner | Rot `#E0452B` | hell, warm |

Blau/Rot unterscheiden sich auch bei Rot-Grün-Schwäche (Protanopie/Deuteranopie) deutlich, da sie
sich zusätzlich in Helligkeit (Blau dunkler) und Wärme trennen. Regeln:

- Teamfarbe liegt auf großen Flächen (Wappenrock, Schild, Pferdedecke), nicht nur auf Details.
- Auswahlring, Lebensbalken und Minimap-Punkt nutzen dieselben zwei Werte.
- Im Shader ist die Teamfarbe eine eigene Maske (Textur-Kanal), damit Blau und Rot aus einer
  Textur kommen und spätere Farbschemata möglich sind.

## 4. Materialien

- **Stoff**: gestepptes Gambeson in Olive, Wappenrock in Teamfarbe mit leichter Abnutzung.
- **Leder**: matt, abgewetzte Kanten, Nähte sichtbar.
- **Stahl**: matt gebürstet, keine Spiegelungen, leichte Rost- und Kratzspuren.
- **Holz**: warmes Braun mit Maserung, Metallbeschläge.
- **Pferd**: Braun/Fuchs, Decke in Teamfarbe.
- **Boden**: trockenes Gras über sandiger Erde, kleine helle Steine, weiche Übergänge.

## 5. Licht und Detailgrad

- Hauptlicht von oben links, warm; Schatten lang, weich, leicht kühl.
- Gelände-Texturen werden **ohne** Richtungsschatten erzeugt (Licht kommt später aus der Szene).
- Figuren-Texturen ebenfalls ohne eingebrannte Schatten, Ansichtsblätter mit flachem Licht.
- Detailgrad: lesbar aus der Spielkamera. Große Formen und Farbblöcke zuerst (Helm, Wappenrock,
  Waffe), feine Details nur, wo sie die Silhouette nicht verrauschen.
- Lesbarkeitsregel: Typ, Team und Blickrichtung bei maximalem Zoom-out in unter einer Sekunde.

## 6. Interface

- Dunkle blauschwarze Paneele mit dünnen Goldlinien, gefasten Kanten und kleinen genieteten
  Eckbeschlägen, dezentes Wappenrelief als Flächenschmuck.
- Knopfzustände: normal (dunkles Holz), gedrückt/aktiv (Gold, leuchtend), inaktiv (grau).
- Icons: ein Motiv, goldene/stählerne Zeichnung, starke Silhouette, auf Paneelgrund `#141A24`.
- Porträts: Brustbild, Dreiviertelansicht, dunkler warmer Hintergrund, Teamfarbe am Wappenrock.

## 7. Prompt-Baustein (an jeden Prompt anhängen)

```
Style: realistic medieval strategy-game art, painterly realism with crisp detail, warm
late-afternoon sunlight from the upper left, golden-ochre and olive tones, muted dusty greens,
soft long shadows, slight atmospheric haze. Match the attached reference image exactly in
palette, lighting and brushwork. No text, no watermark, no logos.
```

Für freizustellende Grafiken zusätzlich: `The entire background is one flat, uniform, pure
chroma-key green #00FF00 with no scenery, no gradient, no shadows.` Danach
`python3 scripts/img/tools.py key`.

## 8. Was das Werkzeug kann (Ergebnis des Tests, Schritt A)

| Frage | Ergebnis |
| --- | --- |
| Modelle | `fal-ai/nano-banana` (schnell, 1024 px) und `fal-ai/nano-banana-pro` (1K/2K/4K); beide mit `/edit` für Referenzbilder |
| Maximale Auflösung | Pro: 4096×4096 (1:1), 2752×1536 (16:9, 2K); Basis: 1024×1024 bzw. 1344×768 |
| Referenzbilder für gleichbleibenden Stil | Ja, über den `/edit`-Endpunkt mit `image_urls` (lokale Dateien als Data-URI). Stil, Figur und Palette werden gut übernommen. Achtung: Landschafts-Referenzen "bluten" in Freisteller-Bilder hinein; dafür ein Porträt oder Objekt als Referenz nehmen |
| Echte Transparenz | Nein. "Transparent background" erzeugt ein aufgemaltes Schachbrett. Lösung: flacher Chroma-Grün-Hintergrund `#00FF00` (kommt sauber und flach, Randabweichung < 2) und Freistellen per Skript |
| Kachelbare Texturen | Fast: der Prompt liefert gleichmäßige Texturen mit leichter Naht (Kantendifferenz 27 gegenüber 3,5 im Inneren). `tools.py seam` blendet die Naht aus (danach 3,5). Leichte Helligkeitsverläufe müssen in Schritt B zusätzlich ausgeglichen werden |
| Dauer | 10–40 s je Bild, mehrere parallel möglich |
| Schlüssel | Vom Proxy injiziert; `FAL_KEY` nur aus der Umgebung, nie in Dateien |

## 9. Beispielbilder dieses Stilblatts

| Datei | Zeigt |
| --- | --- |
| `key-battlefield` | Schlüsselbild: Palette, Licht, Pinselduktus (Referenz für alles Weitere) |
| `portrait-archer-blue` | Porträt-Stil, Team Blau |
| `portrait-spearman-red` | Porträt-Stil, Team Rot, gleiche Beleuchtung |
| `ui-panel-sample` | Paneel-Material, Goldrand, drei Knopfzustände (freigestellt) |
| `icon-attack` | Icon-Stil für das Befehlsraster |
| `terrain-grass` | Bodentextur 2K, nahtlos nach Nachbearbeitung |
| `unit-sheet-archer` | Ansichtsblatt vorn/Seite/hinten als Vorlage für Modell und Textur (freigestellt) |
