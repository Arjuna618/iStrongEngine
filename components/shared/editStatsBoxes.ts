import type { GameModeConfig, UpgradeStat } from '../../types';
import { debugLevelSpDelta, DEBUG_SKILL_POINTS_MAX } from '../../game/GameLogic';
import type { EditStatsBoxes, EditStatsPreview } from '../../game/GameLogic';

export interface EditStatsTyped {
  level?: number;
  skillPoints?: number;
  stats: Partial<Record<UpgradeStat, number>>;
}

export const noTypedEdits = (): EditStatsTyped => ({ stats: {} });

export function boxesOf(p: EditStatsPreview, t: EditStatsTyped, gm: GameModeConfig): EditStatsBoxes {
  const upgrades = { ...p.upgrades };
  let spent = 0;
  for (const k in upgrades) {
    const stat = k as UpgradeStat;
    const v = t.stats[stat];
    if (v !== undefined) upgrades[stat] = Math.max(0, Math.min(p.skillCaps[stat], v));
    spent += upgrades[stat];
  }
  const level = t.level ?? p.level;
  const skillPoints = t.skillPoints ?? Math.max(0, p.skillPoints + debugLevelSpDelta(p.level, level, gm,
    p.maxSkillPoints, p.bonusSkillPoints, spent + p.skillPoints, p.canEarnSkillPoints));
  return { level, skillPoints, upgrades };
}

export function typeLevel(p: EditStatsPreview, t: EditStatsTyped, level: number): EditStatsTyped {
  return { ...t, level: level === p.level ? undefined : level };
}

export function typeSkillPoints(p: EditStatsPreview, t: EditStatsTyped, v: number, gm: GameModeConfig): EditStatsTyped {
  const points = Math.max(0, Math.min(DEBUG_SKILL_POINTS_MAX, Math.floor(v)));
  const follows = boxesOf(p, { ...t, skillPoints: undefined }, gm).skillPoints;
  return { ...t, skillPoints: points === follows ? undefined : points };
}

export function typeStat(p: EditStatsPreview, t: EditStatsTyped, stat: UpgradeStat, v: number): EditStatsTyped {
  const value = Math.max(0, Math.min(p.skillCaps[stat], v));
  const stats = { ...t.stats };
  if (value === p.upgrades[stat]) delete stats[stat];
  else stats[stat] = value;
  return { ...t, stats };
}
