import type { TeamId, AIBehavior } from '../types';

export function shouldSkipTeamCollision(
  teamA: TeamId, behaviorA: AIBehavior | null, groupA: number,
  teamB: TeamId, behaviorB: AIBehavior | null, groupB: number,
): boolean {
  if (groupA !== 0 && groupA === groupB) return true;
  if (behaviorA === 'FFA' || behaviorB === 'FFA') return false;
  if (behaviorA === 'Neutral' || behaviorB === 'Neutral') return false;
  return teamA === teamB;
}
