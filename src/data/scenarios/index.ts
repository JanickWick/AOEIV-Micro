import type { ScenarioDef } from '../../sim/scenario';
import s01 from './01-kiten-grundlagen.json';
import s02 from './02-kiten-unter-druck.json';
import s03 from './03-focus-fire.json';
import s03b from './03b-focus-fire-armbrust.json';
import s04 from './04-zurueckziehen.json';
import s05 from './05-mangonel-ausweichen.json';
import s06 from './06-ritter-dive.json';
import s07 from './07-springald-snipe.json';
import s08 from './08-zwei-gruppen.json';
import s09 from './09-hotkey-drill.json';
import s10 from './10-untergruppen-drill.json';
import sandbox from './sandbox.json';

export const SCENARIOS: readonly ScenarioDef[] = [s01, s02, s03, s03b, s04, s05, s06, s07, s08, s09, s10, sandbox] as ScenarioDef[];
