export const BROWSER_KEYS_OLD: boolean = typeof location !== 'undefined' && /[?&]oldbrowserkeys(?:[=&]|$)/.test(location.search);

export function browserActsOnKey(code: string, ctrlOrMeta: boolean): boolean {
  if (ctrlOrMeta) return code === 'KeyF' || code === 'KeyG' || code === 'KeyK' || code === 'KeyE';
  return code === 'Slash' || code === 'Quote' || code === 'AltLeft' || code === 'AltRight'
    || code === 'F1' || code === 'F3' || code === 'F7' || code === 'F10';
}
