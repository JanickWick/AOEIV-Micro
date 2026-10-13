# Credits und Lizenzen

Freie Kompanie verwendet keine Grafiken, Icons, Modelle, Klänge, Texte oder Datendateien aus
anderen Spielen. Alle Darstellungen sind entweder prozedural im Code erzeugt
(`src/app/render3d/`, `src/app/audio.ts`) oder KI-unterstützt erzeugt und von Hand nachbearbeitet
(siehe unten). Die Dateien unter `reference/` (persönliches Hotkey-Profil, Screenshots, Videos)
dienen nur als Mess- und Layoutquelle in der Entwicklung; sie werden nicht ausgeliefert
(`tests/brandFree.test.ts` prüft, dass nichts im Quellcode darauf verweist).

## Bibliotheken

| Paket | Lizenz | Verwendung |
| --- | --- | --- |
| three (0.186.1) | MIT | 3D-Darstellung |
| vite, vitest, typescript | MIT / Apache-2.0 | Build und Tests |

## KI-erzeugte Grafiken und Modelle

Konzeptbilder, Texturen, Oberflächengrafiken und die 3D-Rohmodelle der Figuren und
Landschaftsobjekte wurden mit KI-Modellen erzeugt und anschließend von Hand nachbearbeitet
(Freistellen, Nahtkorrektur, Reduktion, neue Texturkoordinaten, Teamfarben-Masken, Rigging und
Animation im Code). Keine KI läuft zur Laufzeit des Spiels.

| Zweck | Modell | Zugang | Dateien |
| --- | --- | --- | --- |
| Bilder (Konzepte, Texturen, Symbole, Porträts, Ladebild) | Nano Banana Pro (Google Gemini-Bildmodell) | über fal.ai (`scripts/gen-image.mjs`) | `assets/raw/`, `assets/processed/`, `public/textures/`, `public/ui/` |
| 3D-Rohmodelle (Figuren, Pferd, Belagerung, Bäume, Felsen, Busch, Haus) | Hunyuan3D 2 (Tencent) | über fal.ai (`scripts/gen-model.mjs`) | `assets/raw/models/`, nachbearbeitet in `public/models/` |

Die Prompts liegen unter `assets/prompts/`, die Nachbearbeitung in `scripts/img/` und
`scripts/mesh/`.

Lizenzhinweise (Stand Oktober 2026, vor einem Verkauf erneut prüfen und schriftlich festhalten):

- **Nano Banana (Google)**: Die Nutzung der Ausgaben richtet sich nach den Nutzungsbedingungen
  von Google für generative Modelle; kommerzielle Nutzung der Ausgaben ist danach erlaubt. Die
  Bilder tragen ein unsichtbares SynthID-Wasserzeichen.
- **Hunyuan3D 2 (Tencent)**: veröffentlicht unter der Tencent Hunyuan Community License, die
  Gebietsbeschränkungen für die Nutzung des Modells enthält (unter anderem EU und Großbritannien).
  Die Modelle wurden hier über den Dienst fal.ai gerechnet; maßgeblich für die Ausgaben sind
  deshalb die Nutzungsbedingungen von fal.ai. Vor einem Verkauf ist zu klären, was fal.ai für die
  Ausgaben zusichert, oder die Rohmodelle werden durch handgefertigte ersetzt.
- **fal.ai**: Nutzungsbedingungen des Dienstes für erzeugte Inhalte gelten für beide Modelle.
- **Urheberrecht**: An rein KI-erzeugten Ausgaben besteht in der EU voraussichtlich kein
  Urheberrecht; schützbar ist der menschliche Anteil (Nachbearbeitung, Rigging, Komposition).
- **Steam**: Die KI-Nutzung ist im Content-Fragebogen offenzulegen. Vorschlag für den Text:
  "Figuren-Konzepte, Texturen und 3D-Rohmodelle wurden KI-unterstützt erzeugt (Nano Banana,
  Hunyuan3D) und von Hand nachbearbeitet; zur Laufzeit wird keine KI verwendet."

## Daten

- Eigenes Werteprofil (Auslieferungsstandard): `src/data/units/*.json`, erzeugt von
  `scripts/write-own-units.mjs`. Eigene Zahlen, keine Spieldaten.
- Referenzprofil (nur als Kalibrierprofil wählbar, nicht Standard): `src/data/units/reference/`,
  importiert mit `scripts/import-units.mjs` aus den offenen Daten des Projekts aoe4world
  (https://data.aoe4world.com, Repo aoe4world/data). Zahlen und Fakten sind nicht
  urheberrechtlich geschützt; das Profil dient dem Abgleich und ist bewusst nicht der Standard.

Frei lizenzierte Assets (CC0), die später hinzukommen, werden hier mit Quelle und Lizenz
aufgeführt.
