const SIGN_OF_PLACE: Readonly<Record<string, string>> = {
  BracketLeft: '[', BracketRight: ']', Slash: '/', Backslash: '\\', Minus: '-', Equal: '=', Comma: ',', Period: '.',
  Semicolon: ';', Quote: "'", Backquote: '`', NumpadAdd: '+', NumpadSubtract: '-',
};

function charOfPlace(code: string | undefined): string {
  if (!code) return '';
  if (code.length === 4 && code.startsWith('Key')) return code.charAt(3).toLowerCase();
  if (code.length === 6 && code.startsWith('Digit')) return code.charAt(5);
  return SIGN_OF_PLACE[code] ?? '';
}

export function shortcutKey(e: { key: string; code?: string }): string {
  const k = e.key ?? '';
  if (k.length === 1) {
    const c = k.charCodeAt(0);
    if (c >= 0x20 && c < 0x7f) return k.toLowerCase();
    return charOfPlace(e.code) || k.toLowerCase();
  }
  if (k === 'Dead' || k === 'Unidentified' || k === 'Process' || k === '') return charOfPlace(e.code) || k;
  return k;
}
