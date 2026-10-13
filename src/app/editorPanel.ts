/** Editor-Dialog (HTML) für den freien Szenario-Editor. */
import type { AiLevel } from '../sim/ai';
import type { Upgrades } from '../sim/types';
import type { UnitDefLibrary } from '../sim/unitDefs';
import { saveEditorState, type EditorRow, type EditorState } from './editor';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

const UPGRADE_LABELS: [keyof Upgrades, string][] = [
  ['rangedAttack', 'Fernkampf-Angriff'],
  ['meleeAttack', 'Nahkampf-Angriff'],
  ['meleeArmor', 'Nahkampf-Rüstung'],
  ['rangedArmor', 'Fernkampf-Rüstung'],
];

export function buildEditorPanel(root: HTMLElement, state: EditorState, defs: UnitDefLibrary, onStart: (s: EditorState) => void): void {
  root.replaceChildren();
  const nameInput = el('input', { type: 'text', value: state.name, id: 'ed-name' });
  nameInput.addEventListener('change', () => (state.name = nameInput.value));
  root.append(el('div', { class: 'row' }, [el('label', {}, ['Name ', nameInput])]));

  const side = (title: string, rows: EditorRow[], upgrades: Upgrades, prefix: string) => {
    const box = el('div', { class: 'editor-side' });
    box.append(el('h3', { text: title }));
    const table = el('table');
    const render = () => {
      table.replaceChildren(el('tr', {}, [el('th', { text: 'Einheit' }), el('th', { text: 'Stufe' }), el('th', { text: 'Anzahl' }), el('th', { text: '' })]));
      rows.forEach((r, i) => {
        const unit = el('select');
        for (const id of defs.ids()) unit.append(el('option', { value: id, text: defs.get(id).name }));
        unit.value = r.unit;
        const age = el('select');
        const fillAges = () => {
          age.replaceChildren();
          for (const a of defs.availableAges(unit.value)) age.append(el('option', { value: String(a), text: `Stufe ${a}` }));
          if (!defs.availableAges(unit.value).includes(r.age)) r.age = defs.availableAges(unit.value)[0]!;
          age.value = String(r.age);
        };
        fillAges();
        unit.addEventListener('change', () => {
          r.unit = unit.value;
          fillAges();
          r.age = Number(age.value);
        });
        age.addEventListener('change', () => (r.age = Number(age.value)));
        const count = el('input', { type: 'number', min: '1', max: '60', value: String(r.count) });
        count.addEventListener('change', () => (r.count = Number(count.value)));
        const del = el('button', { text: '×', title: 'Zeile entfernen' });
        del.addEventListener('click', () => {
          rows.splice(i, 1);
          render();
        });
        table.append(el('tr', {}, [el('td', {}, [unit]), el('td', {}, [age]), el('td', {}, [count]), el('td', {}, [del])]));
      });
    };
    render();
    const add = el('button', { text: '+ Einheit' });
    add.addEventListener('click', () => {
      if (rows.length >= 6) return;
      rows.push({ unit: 'archer', age: 2, count: 5 });
      render();
    });
    box.append(table, el('div', { class: 'row' }, [add]));
    box.append(el('div', { class: 'note', text: 'Schmiede-Upgrades (Stufen 0–3, je +1):' }));
    const ur = el('div', { class: 'row' });
    for (const [key, label] of UPGRADE_LABELS) {
      const inp = el('input', { type: 'number', min: '0', max: '3', value: String(upgrades[key]), id: `${prefix}-${key}` });
      inp.addEventListener('change', () => (upgrades[key] = Math.max(0, Math.min(3, Number(inp.value)))));
      ur.append(el('label', {}, [`${label} `, inp]));
    }
    box.append(ur);
    return box;
  };
  root.append(el('div', { class: 'editor-sides' }, [side('Deine Seite', state.mine, state.upgradesMine, 'me'), side('Gegner', state.theirs, state.upgradesTheirs, 'ai')]));

  const ai = el('select', { id: 'ed-ai' });
  const levels: [AiLevel, string][] = [
    ['none', 'keine (passiv)'],
    ['easy', 'leicht'],
    ['medium', 'mittel'],
    ['hard', 'schwer'],
  ];
  for (const [v, l] of levels) ai.append(el('option', { value: v, text: l }));
  ai.value = state.aiLevel;
  ai.addEventListener('change', () => (state.aiLevel = ai.value as AiLevel));
  const reaction = el('input', { type: 'number', min: '50', max: '5000', step: '50', value: String(state.reactionMs), id: 'ed-reaction' });
  reaction.addEventListener('change', () => (state.reactionMs = Number(reaction.value)));
  const distance = el('input', { type: 'number', min: '4', max: '50', step: '1', value: String(state.distance), id: 'ed-distance' });
  distance.addEventListener('change', () => (state.distance = Number(distance.value)));
  const random = el('input', { type: 'checkbox', id: 'ed-random' });
  random.checked = state.randomStart;
  random.addEventListener('change', () => (state.randomStart = random.checked));
  root.append(
    el('h3', { text: 'Gefecht' }),
    el('div', { class: 'row' }, [
      el('label', {}, ['KI-Stufe ', ai]),
      el('label', {}, ['Reaktionszeit (ms) ', reaction]),
      el('label', {}, ['Startabstand (Tiles) ', distance]),
      el('label', {}, [random, ' Zufällige Startpositionen']),
    ]),
  );
  const start = el('button', { text: 'Speichern und starten', id: 'ed-start' });
  start.addEventListener('click', () => {
    saveEditorState(state);
    onStart(state);
  });
  root.append(el('div', { class: 'row' }, [start]));
}
