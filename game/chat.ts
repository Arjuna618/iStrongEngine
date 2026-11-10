import { CHAT, CHAT_LIFE_MS, CHAT_MAX_LIVE, chatCut, chatIsBlank } from './chatRules';

export interface ChatLine {
  text: string;
  born: number;
}

export interface ChatSpeaker {
  id: string;
  lines: ChatLine[];
}

export const CHAT_PLAYER_ID = '#player';

export class ChatRecord {
  readonly speakers = new Map<string, ChatSpeaker>();

  boxOpen = false;
  boxSince = -1e9;
  unknownInARow = 0;
  commandsRefused = false;

  say(id: string, text: string, now: number): boolean {
    if (CHAT.ON === 0) return false;
    const t = chatCut(text);
    if (chatIsBlank(t)) return false;
    let sp = this.speakers.get(id);
    if (sp === undefined) { sp = { id, lines: [] }; this.speakers.set(id, sp); }
    this.prune(sp, now);
    if (sp.lines.length >= CHAT_MAX_LIVE) return false;
    sp.lines.push({ text: t, born: now });
    return true;
  }

  liveCount(id: string, now: number): number {
    const sp = this.speakers.get(id);
    if (sp === undefined) return 0;
    this.prune(sp, now);
    return sp.lines.length;
  }

  prune(sp: ChatSpeaker, now: number): void {
    let n = 0;
    while (n < sp.lines.length && now - sp.lines[n].born >= CHAT_LIFE_MS) n++;
    if (n > 0) sp.lines.splice(0, n);
  }

  drop(id: string): void { this.speakers.delete(id); }

  openBox(nowReal: number): void { if (!this.boxOpen) { this.boxOpen = true; this.boxSince = nowReal; this._notify(); } }
  closeBox(nowReal: number): void { if (this.boxOpen) { this.boxOpen = false; this.boxSince = nowReal; this._notify(); } }

  private _subs: (() => void)[] = [];
  readonly subscribe = (fn: () => void): (() => void) => {
    this._subs.push(fn);
    return () => { const i = this._subs.indexOf(fn); if (i >= 0) this._subs.splice(i, 1); };
  };
  readonly isOpen = (): boolean => this.boxOpen;
  private _notify(): void { const s = this._subs.slice(); for (let i = 0; i < s.length; i++) s[i](); }

  reset(): void {
    this.speakers.clear();
    const was = this.boxOpen;
    this.boxOpen = false;
    this.boxSince = -1e9;
    this.unknownInARow = 0;
    this.commandsRefused = false;
    if (was) this._notify();
  }
}
