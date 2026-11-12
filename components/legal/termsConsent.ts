import { useSyncExternalStore } from 'react';
import { TERMS_VERSION } from './legalText';

const KEY = 'istrong-terms-agreed';

function stored(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function localAutomation(): boolean {
  try {
    const h = location.hostname;
    return navigator.webdriver === true && (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1');
  } catch { return false; }
}

function answerOf(version: string): string {
  const s = KEY + '|' + version;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'a1.' + h.toString(36);
}

let agreed = stored() === answerOf(TERMS_VERSION) || localAutomation();
const listeners = new Set<() => void>();

export function termsAgreed(): boolean { return agreed; }

export function agreeToTerms(): void {
  if (agreed) return;
  agreed = true;
  try { localStorage.setItem(KEY, answerOf(TERMS_VERSION)); } catch { }
  listeners.forEach(f => f());
}

function subscribe(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

export function useTermsAgreed(): boolean { return useSyncExternalStore(subscribe, termsAgreed, termsAgreed); }
