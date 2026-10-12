/** Einstellungs- und Kalibrierungsmenü (HTML). Änderungen werden sofort gespeichert und übernommen. */
import { listCalibrationEntries, RULE_ENTRIES, ruleDefault, saveCalibration, type CalibrationState } from './calibration';
import { ACTIONS, describeBinding, type HotkeyMap } from './hotkeys';
import { exportBundle, saveSettings, type DisplaySettings, type HealthBarMode } from './settings';

export interface SettingsPanelDeps {
  root: HTMLElement;
  settings: DisplaySettings;
  calibration: CalibrationState;
  hotkeys: HotkeyMap;
  /** Nach Änderungen an Daten/Regeln: Einheitenbibliothek neu bauen und Szenario neu starten. */
  onCalibrationChanged: () => void;
  onDisplayChanged: () => void;
  onImport: (json: string) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

export function buildSettingsPanel(d: SettingsPanelDeps): void {
  const root = d.root;
  root.replaceChildren();

  // -------- Anzeige
  root.append(el('h3', { text: 'Anzeige' }));
  const hb = el('select', { id: 'set-healthbars' });
  const modes: [HealthBarMode, string][] = [
    ['always', 'immer'],
    ['selectedOrDamaged', 'bei Auswahl oder Schaden'],
    ['selected', 'nur bei Auswahl'],
  ];
  for (const [v, label] of modes) hb.append(el('option', { value: v, text: label }));
  hb.value = d.settings.healthBars;
  hb.addEventListener('change', () => {
    d.settings.healthBars = hb.value as HealthBarMode;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const ring = el('input', { type: 'checkbox', id: 'set-rangering' });
  ring.checked = d.settings.rangeRing;
  ring.addEventListener('change', () => {
    d.settings.rangeRing = ring.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  const timing = el('input', { type: 'checkbox', id: 'set-timingbars' });
  timing.checked = d.settings.showTimingBars;
  timing.addEventListener('change', () => {
    d.settings.showTimingBars = timing.checked;
    saveSettings(d.settings);
    d.onDisplayChanged();
  });
  root.append(
    el('div', { class: 'row' }, [
      el('label', {}, ['Lebensbalken ', hb]),
      el('label', {}, [ring, ' Reichweitenring (Kalibrierhilfe: Zoom so einstellen, dass der Ring so groß wirkt wie im Spiel)']),
    ]),
    el('div', { class: 'row' }, [el('label', {}, [timing, ' Angriffs-Timing unter eigenen Einheiten (gelb = Ausholen, blau = Nachlauf, grau = Abklingzeit)'])]),
    el('div', { class: 'note', text: `Aktueller Zoom: ${d.settings.zoom.toFixed(1)} px/Tile (wird gespeichert). Standard 48 = ca. 40 Tiles Breite bei 1920 px.` }),
  );

  // -------- Regeln
  root.append(el('h3', { text: 'Simulationsregeln' }));
  const rt = el('table');
  rt.append(el('tr', {}, [el('th', { text: 'Regel' }), el('th', { text: 'Wert' }), el('th', { text: 'Hinweis' })]));
  for (const r of RULE_ENTRIES) {
    const current = d.calibration.rules[r.key] ?? ruleDefault(r.key);
    let input: HTMLInputElement;
    if (r.type === 'boolean') {
      input = el('input', { type: 'checkbox' });
      input.checked = current === true;
      input.addEventListener('change', () => {
        (d.calibration.rules as Record<string, unknown>)[r.key] = input.checked;
        saveCalibration(d.calibration);
        d.onCalibrationChanged();
      });
    } else {
      input = el('input', { type: 'number', step: String(r.step ?? 0.1) });
      input.value = String(current);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        (d.calibration.rules as Record<string, unknown>)[r.key] = v;
        saveCalibration(d.calibration);
        d.onCalibrationChanged();
      });
    }
    const isDefault = d.calibration.rules[r.key] === undefined;
    rt.append(
      el('tr', {}, [
        el('td', { text: r.label }),
        el('td', {}, [input, ' ', el('span', { class: 'note', text: isDefault ? '' : `(Standard ${String(ruleDefault(r.key))})` })]),
        el('td', { class: 'note', text: r.note }),
      ]),
    );
  }
  root.append(rt);

  // -------- Kalibrierung der Einheitenwerte
  root.append(
    el('h3', { text: 'Kalibrierung: nicht bestätigte Einheitenwerte' }),
    el('div', { class: 'note', text: 'Alle Werte, die aoe4world nicht liefert. Platzhalter sind orange markiert; ein von dir gesetzter Wert gilt als nachgemessen. Leeres Feld = Platzhalter wiederherstellen.' }),
  );
  const ct = el('table');
  ct.append(el('tr', {}, [el('th', { text: 'Einheit' }), el('th', { text: 'Wert' }), el('th', { text: 'Eingabe' }), el('th', { text: 'Hinweis' })]));
  // Werte, die pro Zeitalter vorliegen (z. B. Projektiltempo), werden einmal angezeigt und für alle Zeitalter gesetzt.
  const groups = new Map<string, { unitId: string; unitName: string; label: string; paths: string[]; defaultValue: number; note: string }>();
  for (const e of listCalibrationEntries()) {
    const label = e.path.replace(/^ages\.\d+\./, 'ages.*.');
    const key = `${e.unitId}|${label}`;
    const g = groups.get(key);
    if (g) g.paths.push(e.path);
    else groups.set(key, { unitId: e.unitId, unitName: e.unitName, label, paths: [e.path], defaultValue: e.defaultValue, note: e.note });
  }
  for (const g of groups.values()) {
    const override = d.calibration.units[g.unitId]?.[g.paths[0]!];
    const input = el('input', { type: 'number', step: '0.05' });
    input.value = String(override ?? g.defaultValue);
    const badge = el('span', { class: `badge ${override === undefined ? 'unverified' : 'set'}`, text: override === undefined ? 'Platzhalter' : 'gesetzt' });
    input.addEventListener('change', () => {
      const units = (d.calibration.units[g.unitId] ??= {});
      if (input.value.trim() === '') {
        for (const p of g.paths) delete units[p];
        input.value = String(g.defaultValue);
      } else {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        for (const p of g.paths) units[p] = v;
      }
      const set = units[g.paths[0]!] !== undefined;
      badge.className = `badge ${set ? 'set' : 'unverified'}`;
      badge.textContent = set ? 'gesetzt' : 'Platzhalter';
      saveCalibration(d.calibration);
      d.onCalibrationChanged();
    });
    ct.append(
      el('tr', {}, [
        el('td', { text: g.unitName }),
        el('td', {}, [el('code', { text: g.label }), ' ', badge]),
        el('td', {}, [input]),
        el('td', { class: 'note', text: g.note + (g.paths.length > 1 ? ' Gilt für alle Zeitalter.' : '') }),
      ]),
    );
  }
  root.append(ct);

  // -------- Hotkeys (Übersicht; frei belegbar ab M3)
  root.append(el('h3', { text: 'Hotkeys (Belegung ab M3 änderbar)' }));
  const ht = el('table');
  for (const a of ACTIONS) {
    ht.append(el('tr', {}, [el('td', { text: a.label }), el('td', { text: d.hotkeys.get(a.id).map(describeBinding).join(', ') })]));
  }
  root.append(ht);

  // -------- Export / Import
  root.append(el('h3', { text: 'Export / Import' }));
  const exportBtn = el('button', { text: 'Einstellungen als JSON speichern' });
  exportBtn.addEventListener('click', () => {
    const json = JSON.stringify(exportBundle(d.settings, d.calibration, d.hotkeys), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `aoe4micro-einstellungen-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const importInput = el('input', { type: 'file', accept: 'application/json,.json' });
  importInput.addEventListener('change', async () => {
    const f = importInput.files?.[0];
    if (!f) return;
    d.onImport(await f.text());
    importInput.value = '';
  });
  const resetBtn = el('button', { text: 'Kalibrierung zurücksetzen' });
  resetBtn.addEventListener('click', () => {
    d.calibration.units = {};
    d.calibration.rules = {};
    saveCalibration(d.calibration);
    d.onCalibrationChanged();
    buildSettingsPanel(d);
  });
  root.append(el('div', { class: 'row' }, [exportBtn, el('label', {}, ['Importieren: ', importInput]), resetBtn]));
}
