import type { ProjectStore } from './projectStore';
import { newId } from './hash';

const LS_ID = 'istrong-install-id';
const LS_DISMISS = 'istrong-storage-warning-dismissed';

export interface StorageFacts {
  storage: boolean;
  protected: boolean;
  wiped: boolean;
  risky: boolean;
  usage: number;
  quota: number;
}

export async function checkStorage(store: ProjectStore | null): Promise<StorageFacts> {
  const facts: StorageFacts = { storage: !!store, protected: false, wiped: false, risky: false, usage: 0, quota: 0 };
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  try { if (sm?.persisted) facts.protected = await sm.persisted(); } catch { }
  try { if (sm?.estimate) { const e = await sm.estimate(); facts.usage = e.usage ?? 0; facts.quota = e.quota ?? 0; } } catch { }
  let lsId: string | null = null;
  try { lsId = localStorage.getItem(LS_ID); } catch { lsId = null; }
  if (store) {
    let dbId: string | undefined;
    try { dbId = await store.getMeta<string>('installId'); } catch { dbId = undefined; }
    if (dbId && lsId && dbId !== lsId) facts.wiped = true;
    if (!dbId && lsId) facts.wiped = true;
    const id = dbId ?? lsId ?? newId();
    try { if (!dbId) await store.setMeta('installId', id); } catch { }
    try { if (lsId !== id) localStorage.setItem(LS_ID, id); } catch { }
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const webkitOnly = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Brave)\//.test(ua);
  const tinyQuota = facts.quota > 0 && facts.quota < 200 * 1024 * 1024;
  facts.risky = !facts.protected && (webkitOnly || tinyQuota);
  return facts;
}

export async function askToKeep(): Promise<boolean> {
  try { return !!(await navigator.storage?.persist?.()); } catch { return false; }
}

export function warningDismissed(): boolean {
  try { return localStorage.getItem(LS_DISMISS) === '1'; } catch { return false; }
}
export function dismissWarning(): void {
  try { localStorage.setItem(LS_DISMISS, '1'); } catch { }
}

export function needsWarning(f: StorageFacts): boolean {
  return !f.storage || f.wiped || f.risky;
}
