import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAINTED_ICONS, portraitUrl } from '../src/app/hud';
import { UNIT_CODE } from '../src/app/subgroups';

describe('HUD-Grafiken', () => {
  it('hat für jeden Einheitentyp ein Porträt und für jedes gemalte Symbol eine Datei', () => {
    for (const defId of Object.keys(UNIT_CODE)) expect(existsSync(`public/${portraitUrl(defId)}`), defId).toBe(true);
    for (const [name, file] of Object.entries(PAINTED_ICONS)) expect(existsSync(`public/${file}`), name).toBe(true);
    for (const f of ['ui/frame-panel.png', 'ui/frame-minimap.png', 'ui/loading.jpg']) expect(existsSync(`public/${f}`), f).toBe(true);
  });
});
