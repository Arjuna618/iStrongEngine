import { MODE_DRAWINGS, type ModeDrawing, type DrawnSite } from './modeDrawings.generated';
import { MISSING_MODES } from './missingModesSwitch';

export type { ModeDrawing, DrawnSite } from './modeDrawings.generated';

const BY_KEY: ReadonlyMap<string, ModeDrawing> = new Map(MODE_DRAWINGS.map(d => [d.key, d]));

export function drawingOf(key: string | undefined): ModeDrawing | undefined {
  return MISSING_MODES.ON !== 0 && key ? BY_KEY.get(key) : undefined;
}

export function drawnLayoutWord(key: string): `drawn:${string}` { return `drawn:${key}`; }

export function drawnLayoutOf(word: string | undefined): ModeDrawing | undefined {
  if (!word || word.length < 7 || !word.startsWith('drawn:')) return undefined;
  return drawingOf(word.slice(6));
}

export function drawingSites(d: ModeDrawing, teams: number): DrawnSite[] {
  const out: DrawnSite[] = [];
  for (const s of d.sites) {
    if (s.forTeams && !s.forTeams.includes(teams)) continue;
    if (!s.forTeams && (s.side ?? 0) > Math.max(2, teams)) continue;
    out.push(s);
  }
  return out;
}
