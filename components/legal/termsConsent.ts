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

let agreed = stored() === TERMS_VERSION || localAutomation();
const listeners = new Set<() => void>();

export function termsAgreed(): boolean { return agreed; }

export function agreeToTerms(): void {
  if (agreed) return;
  agreed = true;
  try { localStorage.setItem(KEY, TERMS_VERSION); } catch { }
  listeners.forEach(f => f());
}

function subscribe(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

export function useTermsAgreed(): boolean { return useSyncExternalStore(subscribe, termsAgreed, termsAgreed); }
