import { newId } from './hash';

const LOCK = 'istrong-project-writer';
const CHANNEL = 'istrong-tabs';
const LEASE_KEY = 'istrong-writer-lease';
const LEASE_MS = 6000;
const RENEW_MS = 2000;
const ASKED_POLL_MS = 100;

export interface TabLock {
  isWriter(): boolean;
  takeOver(): Promise<void>;
  setBeforeRelease(fn: () => Promise<unknown>): void;
  subscribe(fn: () => void): () => void;
}

interface LockManagerLike {
  request(name: string, opts: { ifAvailable?: boolean }, cb: (lock: unknown) => Promise<void> | void): Promise<unknown>;
}

export function startTabLock(): TabLock {
  const id = newId();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(f => f());
  let writer = false;
  let release: (() => void) | null = null;
  let beforeRelease: () => Promise<unknown> = async () => {};
  let waiting: Promise<void> | null = null;
  let asked = false;
  const channel = typeof BroadcastChannel !== 'undefined' ? (() => { try { return new BroadcastChannel(CHANNEL); } catch { return null; } })() : null;
  const locks = (typeof navigator !== 'undefined' ? (navigator as unknown as { locks?: LockManagerLike }).locks : undefined) ?? null;

  const letGo = async () => {
    if (!writer) return;
    try { await beforeRelease(); } catch { }
    writer = false;
    if (release) { const r = release; release = null; r(); }
    if (!locks) { try { const l = JSON.parse(localStorage.getItem(LEASE_KEY) || 'null'); if (l && l.id === id) localStorage.removeItem(LEASE_KEY); } catch { } }
    emit();
    if (locks) void queue(); else setTimeout(() => { void queue(); }, LEASE_MS);
  };

  if (channel) {
    channel.onmessage = (e: MessageEvent<{ t: string; from: string }>) => {
      if (e.data?.t === 'takeover' && e.data.from !== id && writer) void letGo();
    };
  }

  const holdWith = (lock: unknown): Promise<void> | void => {
    if (!lock) return;
    writer = true;
    emit();
    return new Promise<void>(res => { release = res; });
  };
  const queue = (): Promise<void> => {
    if (waiting) return waiting;
    if (locks) {
      waiting = new Promise<void>(resolve => {
        void locks.request(LOCK, {}, lock => { waiting = null; resolve(); return holdWith(lock); });
      });
      return waiting;
    }
    waiting = new Promise<void>(resolve => {
      const tryTake = (): void => {
        try {
          const l = JSON.parse(localStorage.getItem(LEASE_KEY) || 'null');
          if (!l || l.id === id || Date.now() - l.at > LEASE_MS) {
            localStorage.setItem(LEASE_KEY, JSON.stringify({ id, at: Date.now() }));
            writer = true; waiting = null; emit(); resolve();
            const renew = setInterval(() => {
              if (!writer) { clearInterval(renew); return; }
              try { localStorage.setItem(LEASE_KEY, JSON.stringify({ id, at: Date.now() })); } catch { }
            }, RENEW_MS);
            return;
          }
        } catch {
          writer = true; waiting = null; emit(); resolve(); return;
        }
        setTimeout(tryTake, asked ? ASKED_POLL_MS : RENEW_MS);
      };
      tryTake();
    });
    return waiting;
  };

  if (locks) {
    void locks.request(LOCK, { ifAvailable: true }, lock => {
      if (!lock) { emit(); void queue(); return; }
      return holdWith(lock);
    });
  } else {
    void queue();
  }

  return {
    isWriter: () => writer,
    async takeOver() {
      if (writer) return;
      asked = true;
      let told = false;
      try { if (channel) { channel.postMessage({ t: 'takeover', from: id }); told = true; } } catch { }
      if (!locks && !told) { try { localStorage.removeItem(LEASE_KEY); } catch { } }
      try { await queue(); } finally { asked = false; }
    },
    setBeforeRelease(fn) { beforeRelease = fn; },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
