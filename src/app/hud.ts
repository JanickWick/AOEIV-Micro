/**
 * HUD nach AoE4-Vorbild als HTML/CSS-Ebene: dunkelblaue Paneele mit feinem Rahmen und goldenen
 * Akzenten. Oben links Szenario und Menü, oben Mitte Spielzeit, links Kontrollgruppen-Marken,
 * unten links Zähler, unten Mitte Auswahl-Leiste und Befehlsraster mit Tastenbeschriftung,
 * unten rechts der Rahmen der Minimap (die Karte selbst zeichnet der Overlay-Canvas).
 */
import type { Formation } from '../sim/types';
import { describeBinding, type ActionId, type HotkeyMap } from './hotkeys';

export type MenuItem = 'settings' | 'restart' | 'pause' | 'editor' | 'view' | 'fullscreen';

export interface HudCallbacks {
  onAction(action: ActionId): void;
  /** Klick auf eine Typ-Karte der Auswahl-Leiste (mit gedrückten Zusatztasten). */
  onCardClick(defId: string, mods: { shift: boolean; ctrl: boolean }): void;
  /** Klick auf "ALLE": Untergruppe aufheben. */
  onAllClick(): void;
  onGroupClick(n: number, double: boolean): void;
  onMenu(item: MenuItem): void;
  onScenarioChange(id: string): void;
  onSpeedChange(v: number): void;
  onRandomChange(on: boolean): void;
}

export interface GridState {
  /** Auswahl vorhanden (sonst Raster abgedunkelt). */
  hasSelection: boolean;
  hold: boolean;
  formation: Formation | null;
}

export interface GroupMarker {
  n: number;
  count: number;
  code: string;
  label: string;
}

export interface SelectionCard {
  defId: string;
  code: string;
  name: string;
  count: number;
}

/** Einzelansicht eines Typs (bei nur einem Typ in der Auswahl oder aktiver Untergruppe). */
export interface UnitDetail {
  defId: string;
  code: string;
  name: string;
  count: number;
  age: number;
  hp: number;
  hpMax: number;
  damage: number;
  weaponType: string;
  armorMelee: number;
  armorRanged: number;
  rangeMin: number;
  rangeMax: number;
  speed: number;
}

export { UNIT_CODE } from './subgroups';

const ICONS: Record<string, string> = {
  attackMove: '<path d="M4 20 L17 7"/><path d="M14 4 L20 10"/><path d="M15 9 L13 11"/><path d="M4 20 L7 17"/>',
  stop: '<path d="M8 20 V9"/><path d="M8 9 V5"/><path d="M11 10 V4"/><path d="M14 10 V5"/><path d="M17 11 V7"/><path d="M8 20 C8 14 17 15 17 11"/>',
  patrol: '<path d="M5 15 C5 7 19 7 19 12"/><path d="M19 12 L16 9"/><path d="M19 12 L22 9"/><path d="M19 9 C19 17 5 17 5 12"/><path d="M5 12 L8 15"/><path d="M5 12 L2 15"/>',
  garrison: '<path d="M4 11 L12 4 L20 11"/><path d="M6 10 V20 H18 V10"/><path d="M12 20 V13"/><path d="M9 16 L12 13 L15 16"/>',
  line: '<circle cx="4" cy="12" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="20" cy="12" r="1.6"/>',
  wedge: '<circle cx="12" cy="6" r="1.6"/><circle cx="8" cy="11" r="1.6"/><circle cx="16" cy="11" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="12" cy="16" r="1.6"/><circle cx="20" cy="16" r="1.6"/>',
  spread: '<circle cx="5" cy="6" r="1.6"/><circle cx="14" cy="5" r="1.6"/><circle cx="20" cy="10" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="4" cy="18" r="1.6"/><circle cx="15" cy="17" r="1.6"/>',
  hold: '<path d="M6 4 V13 H4 V20 H11 V14 H9 V4 Z"/><path d="M15 4 V13 H13 V20 H20 V14 H18 V4 Z"/>',
  delete: '<circle cx="12" cy="10" r="6"/><circle cx="9.5" cy="9.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="9.5" r="1.2" fill="currentColor"/><path d="M9 16 V20 M12 16 V20 M15 16 V20"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"/>',
  restart: '<path d="M20 12 A8 8 0 1 1 14 4.3"/><path d="M14 2 L15 5 L12 6"/>',
  pause: '<path d="M8 5 V19"/><path d="M16 5 V19"/>',
  editor: '<path d="M4 20 L8 19 L19 8 L16 5 L5 16 Z"/><path d="M14 7 L17 10"/>',
  view: '<path d="M12 3 L21 8 V16 L12 21 L3 16 V8 Z"/><path d="M12 12 L21 8 M12 12 V21 M12 12 L3 8"/>',
  fullscreen: '<path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15"/>',
  hp: '<path d="M12 20 C5 14 3 10 5 7 C7 4 11 5 12 8 C13 5 17 4 19 7 C21 10 19 14 12 20 Z"/>',
  attack: '<path d="M5 19 L16 8"/><path d="M13 5 L19 11"/><path d="M4 16 L8 20"/><path d="M15 7 L17 9"/>',
  armor: '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z"/>',
  range: '<path d="M6 4 C12 8 12 16 6 20"/><path d="M6 4 L6 20"/><path d="M8 12 H20"/><path d="M17 9 L20 12 L17 15"/>',
  speed: '<path d="M4 12 H14"/><path d="M6 8 H16"/><path d="M6 16 H16"/><path d="M15 6 L20 12 L15 18"/>',
};

function svg(name: string, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
}

interface GridCell {
  action: ActionId | null;
  icon: string;
  label: string;
  disabled?: boolean;
  /** Fester Platz im Spiel ohne Funktion hier. */
  note?: string;
}

/** Befehlsraster 5×3 wie das Command-Card des Spiels (Reihe 1 leer, Reihe 2 A S D F, Reihe 3 Z X C V ENTF). */
const GRID: GridCell[][] = [
  [null, null, null, null, null].map(() => ({ action: null, icon: '', label: '' })),
  [
    { action: 'unit.attackMove', icon: 'attackMove', label: 'Angriffsbewegung' },
    { action: 'unit.stop', icon: 'stop', label: 'Stopp' },
    { action: 'unit.patrol', icon: 'patrol', label: 'Patrouille' },
    { action: null, icon: 'garrison', label: 'Verschanzen', disabled: true, note: 'im Trainer ohne Gebäude ohne Funktion' },
    { action: null, icon: '', label: '' },
  ],
  [
    { action: 'formation.line', icon: 'line', label: 'Formation: Linie' },
    { action: 'formation.wedge', icon: 'wedge', label: 'Formation: versetzt' },
    { action: 'formation.spread', icon: 'spread', label: 'Formation: aufgelockert' },
    { action: 'unit.hold', icon: 'hold', label: 'Stellung halten' },
    { action: 'unit.delete', icon: 'delete', label: 'Einheit löschen' },
  ],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class Hud {
  private root: HTMLElement;
  private scenarioName: HTMLElement;
  private scenarioGoal: HTMLElement;
  private hint: HTMLElement;
  private time: HTMLElement;
  private age: HTMLElement;
  private fps: HTMLElement;
  private groups: HTMLElement;
  private counts: Record<string, HTMLElement> = {};
  private selectionBar: HTMLElement;
  private selectionCards: HTMLElement;
  private selectionDetail: HTMLElement;
  private gridCells = new Map<ActionId, HTMLElement>();
  private gridRoot: HTMLElement;
  private modeInfo: HTMLElement;
  private drillPrompt: HTMLElement;
  private pauseBtn: HTMLElement;
  private viewBtn: HTMLElement;
  readonly scenarioSelect: HTMLSelectElement;
  readonly speedSelect: HTMLSelectElement;
  readonly randomStart: HTMLInputElement;
  readonly minimapFrame: HTMLElement;
  private keyboardLayout: Map<string, string> | undefined;
  private lastGroupClick = { n: -1, at: 0 };
  private groupsSig = '';
  private selectionSig = '';
  private detailSig = '';

  constructor(root: HTMLElement, private cb: HudCallbacks) {
    this.root = root;
    root.replaceChildren();

    // Oben links: Szenario, Menü-Knöpfe, Szenario-Steuerung
    const tl = el('div', 'hud-tl');
    this.scenarioName = el('div', 'hud-title');
    this.scenarioGoal = el('div', 'hud-goal');
    this.hint = el('div', 'hud-hint');
    this.hint.hidden = true;
    const menu = el('div', 'hud-menu');
    const mk = (item: MenuItem, icon: string, title: string) => {
      const b = el('button', 'round-btn', svg(icon, 18));
      b.title = title;
      b.addEventListener('click', () => cb.onMenu(item));
      menu.append(b);
      return b;
    };
    mk('settings', 'gear', 'Einstellungen (F10)');
    mk('restart', 'restart', 'Neustart (F4)');
    this.pauseBtn = mk('pause', 'pause', 'Pause (F3)');
    mk('editor', 'editor', 'Szenario-Editor');
    this.viewBtn = mk('view', 'view', 'Ansicht 3D / 2D-Debug');
    mk('fullscreen', 'fullscreen', 'Vollbild');
    const controls = el('div', 'hud-controls');
    this.scenarioSelect = el('select');
    this.scenarioSelect.title = 'Szenario';
    this.scenarioSelect.addEventListener('change', () => cb.onScenarioChange(this.scenarioSelect.value));
    this.speedSelect = el('select');
    this.speedSelect.title = 'Spieltempo';
    for (const [v, t] of [['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %']] as const) {
      const o = el('option');
      o.value = v;
      o.textContent = t;
      this.speedSelect.append(o);
    }
    this.speedSelect.addEventListener('change', () => cb.onSpeedChange(Number(this.speedSelect.value)));
    this.randomStart = el('input');
    this.randomStart.type = 'checkbox';
    const rl = el('label', 'hud-check');
    rl.append(this.randomStart, document.createTextNode(' Zufallsstart'));
    this.randomStart.addEventListener('change', () => cb.onRandomChange(this.randomStart.checked));
    controls.append(this.scenarioSelect, this.speedSelect, rl);
    tl.append(this.scenarioName, this.scenarioGoal, controls, this.hint);
    root.append(tl, menu);

    // Oben Mitte: Zeitalter-Ornament und Spielzeit
    const tc = el('div', 'hud-tc');
    this.age = el('div', 'hud-age', 'II');
    this.time = el('div', 'hud-time', '00:00');
    tc.append(this.age, this.time);
    root.append(tc);
    this.fps = el('div', 'hud-fps');
    root.append(this.fps);

    // Links: Kontrollgruppen
    this.groups = el('div', 'hud-groups');
    root.append(this.groups);

    // Unten: Zähler, Auswahl, Raster, Minimap
    const bottom = el('div', 'hud-bottom');
    const info = el('div', 'panel hud-info');
    const sel = el('div', 'hud-selcount');
    sel.innerHTML = `<span class="ico">${svg('line', 16)}</span><span id="hud-selected">0</span>`;
    info.append(sel);
    const rows = el('div', 'hud-count-rows');
    for (const [key, label, cls] of [
      ['mine', 'Eigene', 'me'],
      ['theirs', 'Gegner', 'enemy'],
      ['lost', 'Verluste', 'loss'],
      ['value', 'Wert verloren / getötet', 'value'],
    ] as const) {
      const r = el('div', `hud-count ${cls}`);
      r.innerHTML = `<span class="lbl">${label}</span><span class="val"></span>`;
      this.counts[key] = r.querySelector('.val') as HTMLElement;
      rows.append(r);
    }
    this.counts.selected = sel.querySelector('#hud-selected') as HTMLElement;
    info.append(rows);
    this.selectionBar = el('div', 'panel hud-selection');
    this.selectionCards = el('div', 'sel-cards');
    this.selectionDetail = el('div', 'sel-detail');
    this.selectionDetail.hidden = true;
    this.selectionBar.append(this.selectionCards, this.selectionDetail);
    this.gridRoot = el('div', 'panel hud-grid');
    for (const row of GRID) {
      for (const cell of row) {
        const b = el('button', 'grid-cell');
        if (!cell.action && !cell.icon) {
          b.classList.add('empty');
          b.disabled = true;
        } else {
          b.innerHTML = `<span class="gi">${svg(cell.icon)}</span><span class="key"></span>`;
          if (cell.disabled) {
            b.classList.add('disabled');
            b.title = `${cell.label} – ${cell.note ?? ''}`;
            b.disabled = true;
          } else if (cell.action) {
            const a = cell.action;
            b.dataset.action = a;
            b.addEventListener('click', () => cb.onAction(a));
            this.gridCells.set(a, b);
          }
        }
        this.gridRoot.append(b);
      }
    }
    this.minimapFrame = el('div', 'panel hud-minimap');
    bottom.append(info, this.selectionBar, this.gridRoot, this.minimapFrame);
    root.append(bottom);

    this.modeInfo = el('div', 'hud-banner mode');
    this.modeInfo.hidden = true;
    this.drillPrompt = el('div', 'hud-banner drill');
    this.drillPrompt.hidden = true;
    root.append(this.modeInfo, this.drillPrompt);
  }

  setKeyboardLayout(m: Map<string, string> | undefined): void {
    this.keyboardLayout = m;
  }

  setScale(percent: number): void {
    document.documentElement.style.setProperty('--ui', String(Math.max(50, Math.min(200, percent)) / 100));
  }

  setScenario(name: string, goal: string, hint: string): void {
    this.scenarioName.textContent = name;
    this.scenarioGoal.textContent = goal;
    this.hint.hidden = !hint;
    this.hint.textContent = hint;
  }

  fillScenarios(items: { id: string; name: string }[], current: string): void {
    this.scenarioSelect.replaceChildren();
    for (const it of items) {
      const o = el('option');
      o.value = it.id;
      o.textContent = it.name;
      this.scenarioSelect.append(o);
    }
    const edit = el('option');
    edit.value = '__editor__';
    edit.textContent = 'Editor öffnen …';
    this.scenarioSelect.append(edit);
    this.scenarioSelect.value = current;
  }

  setTime(seconds: number, age: number | null): void {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.time.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const roman = age === null ? '' : ['', 'I', 'II', 'III', 'IV'][age] ?? '';
    this.age.textContent = roman ? `Zeitalter ${roman}` : '';
  }

  setFps(text: string): void {
    this.fps.textContent = text;
    this.fps.hidden = !text;
  }

  setCounts(c: { mine: number; theirs: number; lostMine: number; lostTheirs: number; valueLost: number; valueKilled: number; selected: number }): void {
    this.counts.mine!.textContent = String(c.mine);
    this.counts.theirs!.textContent = String(c.theirs);
    this.counts.lost!.textContent = `${c.lostMine} / ${c.lostTheirs}`;
    this.counts.value!.textContent = `${c.valueLost} / ${c.valueKilled}`;
    this.counts.selected!.textContent = String(c.selected);
  }

  setPaused(paused: boolean): void {
    this.pauseBtn.classList.toggle('active', paused);
  }

  setView(view: '2d' | '3d'): void {
    this.viewBtn.title = view === '3d' ? 'Ansicht: 3D (klicken für 2D-Debug)' : 'Ansicht: 2D-Debug (klicken für 3D)';
    this.viewBtn.classList.toggle('active', view === '2d');
  }

  setGroups(groups: GroupMarker[]): void {
    // Nur neu aufbauen, wenn sich etwas geändert hat (sonst gehen Klicks auf gerade ersetzte Knöpfe verloren)
    const sig = groups.map((g) => `${g.n}:${g.count}:${g.code}:${g.label}`).join('|');
    if (sig === this.groupsSig) return;
    this.groupsSig = sig;
    this.groups.replaceChildren();
    for (const g of groups) {
      const b = el('button', 'group-marker');
      b.innerHTML = `<span class="gn">${g.n}</span><span class="gi">${g.code}</span><span class="gc">${g.count}</span>`;
      b.title = `Kontrollgruppe ${g.n}: ${g.count}× ${g.label} (Klick wählt, Doppelklick zentriert)`;
      b.addEventListener('click', () => {
        const now = performance.now();
        const dbl = this.lastGroupClick.n === g.n && now - this.lastGroupClick.at < 350;
        this.lastGroupClick = { n: g.n, at: now };
        this.cb.onGroupClick(g.n, dbl);
      });
      this.groups.append(b);
    }
  }

  setSelection(cards: SelectionCard[], total: number, active: string | null, detail: UnitDetail | null): void {
    const sig = `${total}|${active ?? ''}|${cards.map((c) => `${c.defId}:${c.count}`).join('|')}`;
    if (sig !== this.selectionSig) {
      this.selectionSig = sig;
      this.selectionCards.replaceChildren();
      if (total === 0) {
        this.selectionCards.append(el('div', 'sel-empty', 'Keine Auswahl'));
      } else {
        const all = el('button', `sel-all${active === null ? ' active' : ''}`, `ALLE (${total})`);
        all.title = 'Alle ausgewählten Einheiten (Tab wechselt die Untergruppe)';
        all.addEventListener('click', () => this.cb.onAllClick());
        this.selectionCards.append(all);
        for (const c of cards) {
          const card = el('button', `sel-card${active === c.defId ? ' active' : ''}`);
          card.innerHTML = `<span class="cnt">${c.count}</span><span class="code">${c.code}</span>`;
          card.title = `${c.count}× ${c.name} – Klick: nur diesen Typ, Shift/Strg+Klick: Typ entfernen`;
          card.addEventListener('click', (e) => this.cb.onCardClick(c.defId, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }));
          this.selectionCards.append(card);
        }
      }
    }
    this.selectionDetail.hidden = !detail;
    if (!detail) return;
    const d = detail;
    const sig2 = `${d.defId}:${d.count}:${d.age}:${d.damage}:${d.armorMelee}:${d.armorRanged}`;
    if (sig2 !== this.detailSig) {
      this.detailSig = sig2;
      this.selectionDetail.innerHTML = `
        <div class="portrait"><span class="code">${d.code}</span></div>
        <div class="dname"><span class="n"></span><span class="age">Zeitalter ${['', 'I', 'II', 'III', 'IV'][d.age] ?? d.age}</span></div>
        <div class="dstats">
          <span class="st hp" title="Lebenspunkte (Summe der Auswahl / Maximum)">${svg('hp', 14)}<b class="hp"></b></span>
          <span class="st" title="Angriff (${d.weaponType === 'melee' ? 'Nahkampf' : d.weaponType === 'ranged' ? 'Fernkampf' : 'Belagerung'})">${svg('attack', 14)}<b>${d.damage}</b></span>
          <span class="st" title="Rüstung Nahkampf / Fernkampf">${svg('armor', 14)}<b>${d.armorMelee} / ${d.armorRanged}</b></span>
          <span class="st" title="Reichweite (Tiles)">${svg('range', 14)}<b>${d.rangeMax.toFixed(1)}${d.rangeMin > 0 ? ` (min ${d.rangeMin.toFixed(1)})` : ''}</b></span>
          <span class="st" title="Tempo (Tiles/s)">${svg('speed', 14)}<b>${d.speed.toFixed(2)}</b></span>
        </div>`;
    }
    (this.selectionDetail.querySelector('.n') as HTMLElement).textContent = d.count > 1 ? `${d.count}× ${d.name}` : d.name;
    (this.selectionDetail.querySelector('b.hp') as HTMLElement).textContent = `${Math.ceil(d.hp)} / ${d.hpMax}`;
  }

  /** Tastenbeschriftung und Zustände des Rasters aus der aktuellen Hotkey-Einstellung. */
  setGrid(hotkeys: HotkeyMap, state: GridState): void {
    this.gridRoot.classList.toggle('inactive', !state.hasSelection);
    for (const [action, cell] of this.gridCells) {
      const binds = hotkeys.get(action);
      const key = cell.querySelector('.key') as HTMLElement;
      const keyText = binds.length ? describeBinding(binds[0]!, this.keyboardLayout).replace('Delete', 'ENTF') : '';
      key.textContent = keyText;
      const label = GRID.flat().find((g) => g.action === action)?.label ?? action;
      cell.title = keyText ? `${label} [${keyText}]` : `${label} (keine Taste)`;
      let active = false;
      if (action === 'unit.hold') active = state.hold;
      else if (action.startsWith('formation.')) active = state.formation === action.slice('formation.'.length);
      cell.classList.toggle('active', active);
    }
  }

  flash(action: ActionId): void {
    const cell = this.gridCells.get(action);
    if (!cell) return;
    cell.classList.remove('flash');
    void cell.offsetWidth;
    cell.classList.add('flash');
  }

  setMode(text: string | null): void {
    this.modeInfo.hidden = !text;
    this.modeInfo.textContent = text ?? '';
  }

  setDrill(text: string | null): void {
    this.drillPrompt.hidden = !text;
    this.drillPrompt.textContent = text ?? '';
  }

  /** Verfügbare Kantenlänge der Minimap in Pixeln (für den Overlay-Canvas). */
  minimapBox(): { box: number; margin: number } {
    const r = this.minimapFrame.getBoundingClientRect();
    const rootR = this.root.getBoundingClientRect();
    const size = Math.min(r.width, r.height) - 16;
    return { box: Math.max(60, size), margin: Math.max(0, rootR.right - r.right) + 8 };
  }
}
