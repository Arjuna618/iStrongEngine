export const PROJECTS = { ON: true };

export function projectsEnabled(): boolean {
  if (!PROJECTS.ON) return false;
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return false;
  const q = window.location?.search ?? '';
  if (q.includes('noprojects') || q.includes('__harness')) return false;
  return true;
}
