/**
 * Animationssatz des menschlichen Skeletts (Bogenstil, Pilot). Die Sätze aller Waffenstile
 * liegen in humanClipSets.ts; dieser Export bleibt für Vorschau und Tests.
 */
import { makeHumanClips } from './humanClipSets';
import type { ClipDef, ClipName } from './rig';

export type { ClipDef, ClipName };
export const HUMAN_CLIPS: readonly ClipDef[] = makeHumanClips('bow');
