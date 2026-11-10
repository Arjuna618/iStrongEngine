export const CHAT = { ON: 1 };

export const CHAT_MAX_LEN = 60;
export const CHAT_MAX_LIVE = 3;
export const CHAT_MSG_SLOW_DOWN = 'Please slow down!';

export const CHAT_LIFE_MS = 10000;
export const CHAT_FADE_MS = 300;
export const CHAT_BUBBLE_ALPHA = 0.6;
export const CHAT_BUBBLE_MIX = 128;
export const CHAT_BUBBLE_R = 10;
export const CHAT_FONT = 14;
export const CHAT_ABOVE_R = 2.5;
export const CHAT_ABOVE_U = 10;
export const CHAT_SLOT_U = 26;
export const CHAT_GLIDE_MS = 300;

export const CHAT_BOX_SPAN = 260;
export const CHAT_BOX_R = 10;
export const CHAT_BOX_OUTLINE_R = 12.15;
export const CHAT_BOX_FONT = 14;
export const CHAT_BOX_LINE = 22.4;
export const CHAT_BOX_EASE_S = 0.7;

export function chatAbove(r: number): number { return CHAT_ABOVE_R * r + CHAT_ABOVE_U; }

export function chatBubbleFade(ageMs: number): number {
  if (!(ageMs >= 0)) return 0;
  if (ageMs >= CHAT_LIFE_MS) return 0;
  const a = ageMs < CHAT_FADE_MS ? ageMs / CHAT_FADE_MS : 1;
  const left = CHAT_LIFE_MS - ageMs;
  const b = left < CHAT_FADE_MS ? left / CHAT_FADE_MS : 1;
  return a < b ? a : b;
}

export function chatGlide(ms: number): number {
  if (!(ms > 0)) return 0;
  if (ms >= CHAT_GLIDE_MS) return 1;
  const t = ms / CHAT_GLIDE_MS;
  return t * t * (3 - 2 * t);
}

export function chatBoxEase(opening: boolean, sinceMs: number): number {
  let t = sinceMs / (CHAT_BOX_EASE_S * 1000);
  if (!(t > 0)) t = 0; else if (t > 1) t = 1;
  const q = 1 - t;
  const out = q * q * q * q * q;
  return opening ? 1 - out : out;
}

export function chatCut(text: string): string {
  if (text.length <= CHAT_MAX_LEN) return text;
  let n = CHAT_MAX_LEN;
  const c = text.charCodeAt(n - 1);
  if (c >= 0xd800 && c <= 0xdbff) n--;
  return text.slice(0, n);
}

export function chatIsBlank(text: string): boolean {
  return text.trim().length === 0;
}
