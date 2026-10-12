import type { ScenarioDef } from '../../sim/scenario';
import kiten from './01-kiten-grundlagen.json';
import sandbox from './sandbox.json';

export const SCENARIOS: readonly ScenarioDef[] = [kiten as ScenarioDef, sandbox as ScenarioDef];
