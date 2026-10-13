import { describe, expect, it } from 'vitest';
import { PAINTED_ICONS, portraitUrl } from '../src/app/hud';
import { UNIT_CODE } from '../src/app/subgroups';

// Vorhandene Dateien unter public/ui (zur Bauzeit aufgelöst, ohne Node-Dateisystem)
const files = new Set(Object.keys(import.meta.glob('../public/ui/*')).map((p) => p.replace('../public/', '')));

describe('HUD-Grafiken', () => {
  it('hat für jeden Einheitentyp ein Porträt und für jedes gemalte Symbol eine Datei', () => {
    for (const defId of Object.keys(UNIT_CODE)) expect(files.has(portraitUrl(defId)), defId).toBe(true);
    for (const [name, file] of Object.entries(PAINTED_ICONS)) expect(files.has(file), name).toBe(true);
    for (const f of ['ui/frame-panel.png', 'ui/frame-minimap.png', 'ui/loading.jpg']) expect(files.has(f), f).toBe(true);
  });
});
