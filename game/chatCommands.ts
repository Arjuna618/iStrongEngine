import type { GameState, EnemyTank, LibraryItem } from '../types';
import type { ChatRecord } from './chat';
import { plainName, plainHas } from '../utils/plainName';
import { SMALL_FIX } from './smallFixSwitch';

function wholeName(name: string, typed: string, p: string): boolean {
  const np = plainName(name);
  if (p.length > 0) return np === p;
  const t = typed.trim().toLowerCase();
  return t.length > 0 && np.length === 0 && name.trim().toLowerCase() === t;
}

export interface ChatHost {
  state: GameState;
  chat: ChatRecord;
  tankDying: boolean;
  gameNow(): number;
  pushMessage(msg: string, at?: number): void;
  debugAccess(): boolean;
  getPlayerDisplayName(): string;
  _chatWave(args: readonly string[]): string;
  _chatEvent(args: readonly string[]): string;
  _chatEntity(args: readonly string[]): string;
  _chatTimeSkip(args: readonly string[]): string;
  _chatAi(args: readonly string[]): string;
  _chatAreaCount(): number;
  _chatAreaName(i: number): string;
  _chatPlayerArea(): number;
  _chatPlayerGrid(out: { x: number; y: number }): void;
  _chatGridInArea(i: number, gx: number, gy: number): boolean;
  _chatTpPlayerToArea(i: number): void;
  _chatTpPlayerToGrid(i: number, gx: number, gy: number): void;
  _chatTpToTank(mover: EnemyTank | null, target: EnemyTank | null): boolean;
  _chatNamedBots(): readonly EnemyTank[];
  _chatBossNames(): readonly string[];
  _chatBossesAlive(): number;
  _chatRoomLimit(): number;
  _chatSetRoomLimit(n: number): void;
  _chatBotsAlive(): number;
  _chatTanksNamed(name: string, raw?: string): LibraryItem[];
  _chatSpawnBots(item: LibraryItem, amount: number, team: string, dist: number, gx: number, gy: number, atSpot: boolean): number;
  _chatTeams(): readonly (readonly [string, number])[];
  _chatTeamRefusal(team: string): string;
  _chatFfaRefusal(word: string): string;
  _chatArenaTeams(n: number): string;
  _chatSetBotTeam(e: EnemyTank, team: string): void;
  _chatResetBotTeam(e: EnemyTank): boolean;
  _chatTeamNameOf(e: EnemyTank): string;
  _chatArenaClose(): void;
  _chatArenaSize(w: number, h: number): string;
}

export const CMD_UNKNOWN = 'Unknown command.';
export const CMD_NO_ACCESS = 'You do not have access to this command.';
export const CMD_BAD_ARGS = 'Invalid arguments.';
export const CMD_SANDBOX_ONLY = 'This command is only available on sandbox.';
export const CMD_UNKNOWN_SUB = 'Unknown subcommand.';
export const CMD_EVEN = 'Arena size must be even.';
export const CMD_VISITOR = 'A visitor is coming.';
export const CMD_SPAM: readonly (readonly [number, string])[] = [
  [6, 'Have you considered using $ help?'],
  [11, 'Just use $ help...'],
  [21, "Ok, now you're doing this on purpose."],
  [31, 'Do you have nothing better to do?'],
  [41, "I've heard Assault is enjoyable to play, maybe play that instead?"],
  [51, 'But I guess you want to continue to fail at using commands...'],
  [61, 'Why are you like this?'],
  [71, 'There are so many better things to do than this you know...'],
  [81, 'What is your reason for repeatedly failing commands? What do you have to gain from this at all?'],
  [91, 'Just cut it out already!'],
  [101, 'Stop!'],
  [151, 'You know what? Fine. Since you are sooo insistent on wasting YOUR time on failing commands, I will not accept ANY further commands from you.'],
];
export const CMD_REFUSED = "Go ahead and spam all you want, you've already failed at sending commands 100 times now. It's not like there's a reward at 1000000...";

export const CHAT_TEAM_CODE: Readonly<Record<string, number>> = Object.freeze({
  Blue: 1, Green: 2, Red: 3, Purple: 4, Neutral: 5, Rogues: 6, Bosses: 7, Dreadnoughts: 8,
});
export const CMD_BOSS_MAX = 6;
export const CMD_WAVE_MAX = 999;
export const CMD_ROOM_MIN = 1, CMD_ROOM_MAX = 600;
export const CMD_BOSS_LEAD_S = 10;
export const CMD_BOSS_LEAD_MAX_S = 600;
export const CMD_BOT_NEAR = 300;

const FREE = new Set(['help', 'id', 'identity', 'i', 'areainfo', 'location', 'teamsinfo', 'team']);
const KNOWN = new Set(['help', 'id', 'identity', 'i', 'areainfo', 'location', 'arena', 'spawnboss', 'botspawn', 'tp',
  'teleport', 'roomlimit', 'teamsinfo', 'team', 'wave', 'event', 'entity', 'time', 'ai']);

const RE_NUM = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const RE_INT = /^\d+$/;
const num = (s: string): number => (RE_NUM.test(s) ? parseFloat(s) : NaN);

export function helpLines(conductor: boolean): string {
  const l = ['Help menu:',
    '- $ help: Show this help menu.',
    '- $ id or $ identity or $ i, Show your ID and access level.',
    '- $ areainfo: Show every area and its number.',
    '- $ location: Show your coordinates.',
    '- $ teamsinfo: Show every team and its number.',
    '- $ team: Show the team help.'];
  if (conductor) l.push(
    '- $ arena: Show the arena help.',
    '- $ spawnboss [boss] [seconds] - Summon a boss.',
    '- $ botspawn <tank> <amount> <team> [distance or x y], Spawn bots.',
    '- $ tp area <name or number> [x y], Teleport to an area.',
    '- $ tp player <name> [name], Teleport to a player, or one player to another.',
    '- $ roomlimit <number>: Set how many bots the arena holds.',
    '- $ wave [skip, set <number>, stop, go], The wave of a match with Map Events (set: the next wave not yet announced).',
    '- $ event [list, fire <name>], Its Map Events.',
    '- $ entity kill <name>, Its Map Entities.',
    '- $ time skip <minutes>, The bots grow as if that much time had passed. Waves, bosses and what a wave brings stay as they are.',
    '- $ ai off or $ ai on, Every bot stands still and does nothing, or thinks again.');
  return l.join('\n');
}

export const ARENA_HELP = 'Help menu:\n'
  + '- $ arena size <width> <height>, Set the size of the arena\n'
  + '- $ arena team <team>, Set the number of teams, from 0 (FFA) to 4 (4TDM)\n'
  + '- $ arena close: Close the arena';

export function gridText(v: number): string { return (Math.round(v * 100) / 100).toFixed(2); }

export class ChatCommands {
  constructor(private h: ChatHost) {}

  conductor(): boolean { return this.h.state.debugMode === true && this.h.debugAccess(); }

  private _rawLine = '';
  run(line: string, now: number): void {
    this._rawLine = line;
    const h = this.h, rec = h.chat;
    if (rec.commandsRefused) { h.pushMessage(CMD_REFUSED, now); return; }
    const args = line.trim().split(/\s+/).filter((s) => s.length > 0);
    const word = (args.shift() || '').toLowerCase();
    if (!KNOWN.has(word)) { this._unknown(now); return; }
    if (!FREE.has(word) && !this.conductor()) { h.pushMessage(CMD_NO_ACCESS, now); return; }
    try {
      switch (word) {
        case 'help': h.pushMessage(helpLines(this.conductor()), now); return;
        case 'id': case 'identity': case 'i':
          h.pushMessage(`ID: ${h.getPlayerDisplayName()}\nAccess Level: ${this.conductor() ? 'Arena Conductor' : 'Player'}`, now);
          return;
        case 'areainfo': this._areaInfo(now); return;
        case 'location': this._location(now); return;
        case 'teamsinfo': this._teamsInfo(now); return;
        case 'team': this._teamCmd(args, now); return;
        case 'arena': this._arena(args, now); return;
        case 'spawnboss': this._spawnBoss(args, now); return;
        case 'botspawn': this._botSpawn(args, now); return;
        case 'tp': case 'teleport': this._tp(args, now); return;
        case 'roomlimit': this._roomLimit(args, now); return;
        case 'wave': h.pushMessage(h._chatWave(args), now); return;
        case 'event': h.pushMessage(h._chatEvent(args), now); return;
        case 'entity': h.pushMessage(h._chatEntity(args), now); return;
        case 'time': h.pushMessage(h._chatTimeSkip(args), now); return;
        case 'ai': h.pushMessage(h._chatAi(args), now); return;
      }
    } catch (e) {
      console.error(e);
      h.pushMessage('An error occurred while running this command.', now);
    }
  }

  private _unknown(now: number): void {
    const rec = this.h.chat;
    rec.unknownInARow++;
    let line = CMD_UNKNOWN;
    for (const [n, s] of CMD_SPAM) if (rec.unknownInARow === n) line = s;
    if (rec.unknownInARow >= 151) rec.commandsRefused = true;
    this.h.pushMessage(line, now);
  }

  private _areaInfo(now: number): void {
    const h = this.h, n = h._chatAreaCount();
    const l = ['Areas:'];
    for (let i = 0; i < n; i++) l.push(`${h._chatAreaName(i)}: ${i + 1}`);
    h.pushMessage(l.join('\n'), now);
  }

  private _location(now: number): void {
    const h = this.h, p = { x: 0, y: 0 };
    h._chatPlayerGrid(p);
    const c = `Coordinates: (${gridText(p.x)}, ${gridText(p.y)})`;
    if (h._chatAreaCount() > 1) {
      const a = h._chatPlayerArea();
      h.pushMessage(`Area: ${h._chatAreaName(a)} (${a + 1})\n${c}`, now);
    } else h.pushMessage(c, now);
  }

  private _teamsInfo(now: number): void {
    const t = this.h._chatTeams();
    const l = ['Teams:'];
    for (const [name, code] of t) l.push(`${name}: ${code}`);
    this.h.pushMessage(l.join('\n'), now);
  }

  private _teamHelp(): string {
    return 'Help menu:\n'
      + '- $ teamsinfo: Show every team and its number\n'
      + '- $ team set <bot> <team>, Move a bot to a team\n'
      + '- $ team reset <bot>, Put a bot back in its own team\n'
      + '- $ botspawn <tank> <amount> <team>, The team is a name or a number of $ teamsinfo';
  }

  private _teamCmd(args: string[], now: number): void {
    const h = this.h;
    if (args.length === 0) { h.pushMessage(this._teamHelp(), now); return; }
    const sub = args.shift()!.toLowerCase();
    if (sub !== 'set' && sub !== 'reset') { h.pushMessage(CMD_UNKNOWN_SUB, now); return; }
    if (!this.conductor()) { h.pushMessage(CMD_NO_ACCESS, now); return; }
    if (sub === 'reset') {
      if (args.length === 0) { h.pushMessage(`${CMD_BAD_ARGS}\nUsage: $ team reset <bot>`, now); return; }
      const e = this._oneBot(args.join(' '), now);
      if (!e) return;
      if (!h._chatResetBotTeam(e)) { h.pushMessage(`${e.displayName} has no team of its own to go back to.`, now); return; }
      h.pushMessage(`${e.displayName} is back in the ${h._chatTeamNameOf(e)} team.`, now);
      return;
    }
    if (args.length < 2) { h.pushMessage(`${CMD_BAD_ARGS}\nUsage: $ team set <bot> <team>`, now); return; }
    const teamWord = args.pop()!;
    const ffaNo = h._chatFfaRefusal(teamWord);
    if (ffaNo) { h.pushMessage(ffaNo, now); return; }
    const team = this._team(teamWord);
    if (team === null) { h.pushMessage(this._teamOptions(teamWord), now); return; }
    const refusal = h._chatTeamRefusal(team);
    if (refusal) { h.pushMessage(refusal, now); return; }
    const e = this._oneBot(args.join(' '), now);
    if (!e) return;
    h._chatSetBotTeam(e, team);
    h.pushMessage(`${e.displayName} is now in the ${team} team.`, now);
  }

  private _oneBot(typed: string, now: number): EnemyTank | null {
    const p = plainName(typed);
    const bots = this.h._chatNamedBots(), hits: EnemyTank[] = [];
    if (p.length < 2) {
      if (SMALL_FIX.R755 !== 0) for (let i = 0; i < bots.length; i++) if (wholeName(bots[i].displayName, typed, p)) hits.push(bots[i]);
      if (hits.length === 0) { this.h.pushMessage('Type at least 2 letters of the name.', now); return null; }
    } else for (let i = 0; i < bots.length; i++) if (plainHas(bots[i].displayName, p)) hits.push(bots[i]);
    if (hits.length === 1) return hits[0];
    if (SMALL_FIX.G646 !== 0 && hits.length > 1) { let whole: EnemyTank | null = null, k = 0; for (const e of hits) if (wholeName(e.displayName, typed, p)) { whole = e; k++; } if (k === 1) return whole; }
    this.h.pushMessage(hits.length === 0 ? `No bot is called "${typed}".` : `More than one bot is called "${typed}". Specify more of the name.`, now);
    return null;
  }

  private _arena(args: string[], now: number): void {
    const h = this.h;
    if (args.length === 0) { h.pushMessage(ARENA_HELP, now); return; }
    const sub = args[0].toLowerCase();
    if (sub === 'size') {
      if (args.length < 3 || !RE_INT.test(args[1]) || !RE_INT.test(args[2])) { h.pushMessage(CMD_BAD_ARGS, now); return; }
      const w = parseInt(args[1], 10), hh = parseInt(args[2], 10);
      if (w % 2 !== 0 || hh % 2 !== 0) { h.pushMessage(CMD_EVEN, now); return; }
      if (w < 2 || hh < 2 || w > 1024 || hh > 1024) { h.pushMessage('Arena size must be from 2 to 1024.', now); return; }
      const said = h._chatArenaSize(w, hh);
      if (said) h.pushMessage(said, now);
      return;
    }
    if (sub === 'team') {
      if (h.state.gameModeConfig.mode !== 'sandbox') { h.pushMessage(CMD_SANDBOX_ONLY, now); return; }
      if (args.length < 2 || !RE_INT.test(args[1]) || parseInt(args[1], 10) > 4) { h.pushMessage('Invalid argument.', now); return; }
      h.pushMessage(h._chatArenaTeams(parseInt(args[1], 10)), now);
      return;
    }
    if (sub === 'close') { h._chatArenaClose(); return; }
    h.pushMessage(CMD_UNKNOWN_SUB, now);
  }

  readonly pendingBosses: { at: number; name: string }[] = [];

  private _spawnBoss(args: string[], now: number): void {
    const h = this.h;
    let secs = CMD_BOSS_LEAD_S;
    if (args.length > 0 && RE_NUM.test(args[args.length - 1])) {
      secs = num(args.pop()!);
      if (!(secs >= 0) || secs > CMD_BOSS_LEAD_MAX_S) { h.pushMessage(`The wait must be from 0 to ${CMD_BOSS_LEAD_MAX_S} seconds.`, now); return; }
    }
    let name = '';
    if (args.length > 0) {
      const typed = args.join(' ').toLowerCase();
      const names = h._chatBossNames();
      for (let i = 0; i < names.length; i++) if (names[i].toLowerCase() === typed) { name = names[i]; break; }
      if (!name) { h.pushMessage(`No boss is called "${args.join(' ')}".`, now); return; }
    }
    if (h._chatBossesAlive() + this.pendingBosses.length >= CMD_BOSS_MAX) {
      h.pushMessage(`There can be at most ${CMD_BOSS_MAX} bosses at once.`, now);
      return;
    }
    this.pendingBosses.push({ at: now + secs * 1000, name });
    h.pushMessage(CMD_VISITOR, now);
  }

  private _roomLimit(args: string[], now: number): void {
    const h = this.h;
    if (args.length === 0) { h.pushMessage(`The arena holds at most ${h._chatRoomLimit()} bots.`, now); return; }
    if (args.length !== 1 || !RE_INT.test(args[0])) { h.pushMessage(CMD_BAD_ARGS, now); return; }
    const n = parseInt(args[0], 10);
    if (n < CMD_ROOM_MIN || n > CMD_ROOM_MAX) { h.pushMessage(`The room limit must be from ${CMD_ROOM_MIN} to ${CMD_ROOM_MAX}.`, now); return; }
    h._chatSetRoomLimit(n);
    h.pushMessage(`The arena now holds at most ${n} bots.`, now);
  }

  private _botSpawn(args: string[], now: number): void {
    const h = this.h;
    const USAGE = 'Usage: $ botspawn <tank> <amount> <team> [distance or x y]';
    if (args.length < 3) { h.pushMessage(`${CMD_BAD_ARGS}\n${USAGE}`, now); return; }
    let best = -1, items: LibraryItem[] = [];
    for (let k = args.length - 2; k >= 1; k--) {
      const rest = args.length - k;
      if (rest < 2 || rest > 4 || !RE_INT.test(args[k])) continue;
      let raw: string | undefined;
      if (SMALL_FIX.G698 !== 0) { raw = this._rawLine.trim().replace(/^\S+\s*/, ''); for (let q = 0; q < rest; q++) raw = raw.replace(/\s*\S+\s*$/, ''); }
      const found = h._chatTanksNamed(args.slice(0, k).join(' '), raw);
      if (found.length > 0) { best = k; items = found; break; }
    }
    if (best < 0) {
      let k = args.length - 2; while (k > 1 && !RE_INT.test(args[k])) k--;
      const typed = args.slice(0, Math.max(1, k)).join(' ');
      h.pushMessage(RE_INT.test(args[k]) ? `No tank is called "${typed}".` : `${CMD_BAD_ARGS}\n${USAGE}`, now);
      return;
    }
    if (items.length > 1) {
      h.pushMessage(`There is more than one tank called "${items[0].name}". Give each of those tanks a name of its own first.`, now);
      return;
    }
    const amount = parseInt(args[best], 10);
    if (amount < 1) { h.pushMessage('The amount must be at least 1.', now); return; }
    const teamWord = args[best + 1];
    const ffaNo = h._chatFfaRefusal(teamWord);
    if (ffaNo) { h.pushMessage(ffaNo, now); return; }
    const team = this._team(teamWord);
    if (team === null) { h.pushMessage(this._teamOptions(teamWord), now); return; }
    const refusal = h._chatTeamRefusal(team);
    if (refusal) { h.pushMessage(refusal, now); return; }
    const tail = args.slice(best + 2);
    let dist = CMD_BOT_NEAR, gx = 0, gy = 0, atSpot = false;
    if (tail.length === 1) {
      dist = num(tail[0]);
      if (!(dist >= 0)) { h.pushMessage(`${CMD_BAD_ARGS}\n${USAGE}`, now); return; }
      dist *= 30;
    } else if (tail.length === 2) {
      gx = num(tail[0]); gy = num(tail[1]);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) { h.pushMessage(`${CMD_BAD_ARGS}\n${USAGE}`, now); return; }
      if (!h._chatGridInArea(h._chatPlayerArea(), gx, gy)) { h.pushMessage('Those coordinates are outside the area.', now); return; }
      atSpot = true;
    }
    const room = h._chatRoomLimit(), have = h._chatBotsAlive();
    if (have + amount > room) {
      h.pushMessage(`The arena holds at most ${room} bots (${have} now). Use $ roomlimit to raise the limit first.`, now);
      return;
    }
    const came = h._chatSpawnBots(items[0], amount, team, dist, gx, gy, atSpot);
    if (came <= 0) h.pushMessage(`No ${items[0].name} could be spawned there.`, now);
    else h.pushMessage(came === 1 ? `Spawned 1 ${items[0].name}.` : `Spawned ${came} ${items[0].name}.`, now);
  }

  private _team(word: string): string | null {
    const t = this.h._chatTeams();
    if (RE_INT.test(word)) { const c = parseInt(word, 10); for (const [n, code] of t) if (code === c) return n; return null; }
    const p = plainName(word);
    if (p.length < 2) return null;
    let hit: string | null = null;
    for (const [n] of t) { if (plainName(n) === p) return n; if (plainName(n).startsWith(p)) { if (hit !== null) return null; hit = n; } }
    return hit;
  }

  private _teamOptions(word: string): string {
    const t = this.h._chatTeams();
    return `"${word}" is not a team here. Choose one of: ${t.map(([n, c]) => `${n} (${c})`).join(', ')}.`;
  }

  private _tp(args: string[], now: number): void {
    const h = this.h;
    const USAGE = 'Usage: $ tp area <name or number> [x y] or $ tp player <name> [name]';
    if (h.tankDying) { h.pushMessage('You cannot teleport while dead.', now); return; }
    const kind = (args.shift() || '').toLowerCase();
    if (kind === 'area') { this._tpArea(args, now, USAGE); return; }
    if (kind === 'player') { this._tpPlayer(args, now, USAGE); return; }
    h.pushMessage(`${CMD_BAD_ARGS}\n${USAGE}`, now);
  }

  private _areasFor(typed: string): { hits: number[]; short: boolean } {
    const h = this.h, n = h._chatAreaCount();
    if (RE_INT.test(typed)) { const k = parseInt(typed, 10) - 1; return { hits: k >= 0 && k < n ? [k] : [], short: false }; }
    const p = plainName(typed);
    if (p.length < 2) return { hits: [], short: true };
    const hits: number[] = [];
    for (let i = 0; i < n; i++) if (plainHas(h._chatAreaName(i), p)) hits.push(i);
    return { hits, short: false };
  }

  private _wholeAreaOf(typed: string): number {
    const h = this.h, n = h._chatAreaCount(), p = plainName(typed);
    let hit = -1, k = 0;
    for (let i = 0; i < n; i++) if (wholeName(h._chatAreaName(i), typed, p)) { hit = i; k++; }
    return k === 1 ? hit : -1;
  }
  private _tpArea(args: string[], now: number, USAGE: string): void {
    const h = this.h;
    if (args.length === 0) { h.pushMessage(`${CMD_BAD_ARGS}\n${USAGE}`, now); return; }
    let gx = NaN, gy = NaN;
    const whole = SMALL_FIX.G670 !== 0 && args.length >= 3 ? this._wholeAreaOf(args.join(' ')) : -1;
    if (whole < 0 && args.length >= 3 && RE_NUM.test(args[args.length - 1]) && RE_NUM.test(args[args.length - 2])) {
      gy = num(args.pop()!); gx = num(args.pop()!);
    }
    const typed = args.join(' ');
    const { hits, short } = whole >= 0 ? { hits: [whole], short: false } : this._areasFor(typed);
    if (short) { h.pushMessage('Type at least 2 letters of the name.', now); return; }
    if (hits.length === 0) { h.pushMessage(RE_INT.test(typed) ? `There is no area ${typed}. Use $ areainfo to see the areas.` : `No area is called "${typed}".`, now); return; }
    if (hits.length > 1) { h.pushMessage('There is more than one area with that name. Use $ areainfo and teleport using the area number instead.', now); return; }
    const a = hits[0];
    if (gx === gx) {
      if (!h._chatGridInArea(a, gx, gy)) { h.pushMessage(`Those coordinates are outside ${h._chatAreaName(a)}.`, now); return; }
      h._chatTpPlayerToGrid(a, gx, gy);
      h.pushMessage(`Teleported to ${h._chatAreaName(a)} (${gridText(gx)}, ${gridText(gy)}).`, now);
      return;
    }
    h._chatTpPlayerToArea(a);
    h.pushMessage(`Teleported to ${h._chatAreaName(a)}.`, now);
  }

  private _playersFor(typed: string): { hits: (EnemyTank | null)[]; short: boolean } {
    const h = this.h;
    const p = plainName(typed);
    if (p.length < 2) {
      const sh: (EnemyTank | null)[] = [];
      if (SMALL_FIX.R755 !== 0) {
        if (wholeName(h.getPlayerDisplayName(), typed, p)) sh.push(null);
        const bs = h._chatNamedBots();
        for (let i = 0; i < bs.length; i++) if (wholeName(bs[i].displayName, typed, p)) sh.push(bs[i]);
      }
      return { hits: sh, short: sh.length === 0 };
    }
    const hits: (EnemyTank | null)[] = [];
    if (plainHas(h.getPlayerDisplayName(), p)) hits.push(null);
    const bots = h._chatNamedBots();
    for (let i = 0; i < bots.length; i++) if (plainHas(bots[i].displayName, p)) hits.push(bots[i]);
    if (SMALL_FIX.G646 !== 0 && hits.length > 1) {
      let whole: EnemyTank | null = null, k = 0;
      for (const e of hits) if (wholeName(e === null ? h.getPlayerDisplayName() : e.displayName, typed, p)) { whole = e; k++; }
      if (k === 1) return { hits: [whole], short: false };
    }
    return { hits, short: false };
  }

  private _nameOf(t: EnemyTank | null): string { return t === null ? this.h.getPlayerDisplayName() : t.displayName; }

  private _onePlayer(typed: string, now: number, say: boolean): EnemyTank | null | undefined {
    const { hits, short } = this._playersFor(typed);
    if (hits.length === 1) return hits[0];
    if (say) {
      if (short) this.h.pushMessage('Type at least 2 letters of the name.', now);
      else if (hits.length === 0) this.h.pushMessage(`No player is called "${typed}".`, now);
      else this.h.pushMessage(`More than one player is called "${typed}". Specify more of the name.`, now);
    }
    return undefined;
  }

  private _tpPlayer(args: string[], now: number, USAGE: string): void {
    const h = this.h;
    if (args.length === 0) { h.pushMessage(`${CMD_BAD_ARGS}\n${USAGE}`, now); return; }
    const whole = this._onePlayer(args.join(' '), now, args.length === 1);
    let mover: EnemyTank | null | undefined = undefined, target: EnemyTank | null | undefined = undefined;
    if (whole !== undefined) { mover = null; target = whole; }
    else if (args.length >= 2) {
      for (let k = 1; k < args.length && target === undefined; k++) {
        const a = this._onePlayer(args.slice(0, k).join(' '), now, false);
        const b = a === undefined ? undefined : this._onePlayer(args.slice(k).join(' '), now, false);
        if (a !== undefined && b !== undefined) { mover = a; target = b; }
      }
      if (target === undefined) {
        const a = this._onePlayer(args[0], now, true);
        if (a !== undefined) this._onePlayer(args.slice(1).join(' '), now, true);
        return;
      }
    }
    if (target === undefined || mover === undefined) return;
    if (mover === target) { h.pushMessage(mover === null ? 'You are already there.' : 'That is the same player.', now); return; }
    if (!h._chatTpToTank(mover, target)) { h.pushMessage(`There is no room near ${this._nameOf(target)}.`, now); return; }
    h.pushMessage(mover === null ? `Teleported to ${this._nameOf(target)}.` : `Teleported ${this._nameOf(mover)} to ${this._nameOf(target)}.`, now);
  }
}
