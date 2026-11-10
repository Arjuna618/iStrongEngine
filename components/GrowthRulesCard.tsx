import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, HdAnalyticsUp } from './ui/icons';
import { Group, FieldRow, Button, IconButton, headerIcon } from './kit/kit';
import { NumberBox } from './kit/NumberBox';
import { Reveal, MotionList, Fade } from './kit/Collapse';
import { DropMenu, useDropMenu, menuOpen } from './kit/DropMenu';
import { Facts, factsFrom } from './mapEvents/fields';
import { useToast } from './ui/Toast';
import { sameProjectUndo } from './shared/sameProjectUndo';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { STAT_COLORS } from '../utils/gameColors';
import {
  GROWTH_STATS, GROWTH_LIMITS, growthBonus, newGrowthStatRule, newPointRun, pointRunsOf,
  type GrowthRules, type GrowthStatRule, type GrowthStat, type GrowthCurveKind, type GrowthSkillPointsRule, type GrowthPointRun,
} from '../game/growthRules';

const OFFERED = GROWTH_STATS.filter(s => s.wired !== false);
const labelOf = (s: GrowthStat): string => GROWTH_STATS.find(x => x.stat === s)?.label ?? s;
const colorOf = (s: GrowthStat): string =>
  s === 'size' ? 'var(--text-primary)' : s === 'view' ? 'var(--text-secondary)' : (STAT_COLORS as Record<string, string>)[s] ?? 'var(--text-secondary)';
const factorOf = (r: GrowthStatRule, level: number): number => Math.max(GROWTH_LIMITS.FACTOR_MIN, 1 + growthBonus(r, level) / 100);
const fmtK = (k: number): string => '×' + (Math.round(k * 100) / 100).toString();

export const RuleNum: React.FC<{ value: number; min: number; max: number; step?: number; unit?: string; label: string; onChange: (v: number) => void }> = ({ value, min, max, step, unit, label, onChange }) => {
  const [text, setText] = useState<string | null>(null);
  const box = (
    <NumberBox className="k-field k-ev-num" value={text !== null ? text : String(value)} min={min} max={max} step={step} aria-label={label}
      onFocus={() => setText(String(value))}
      onChange={e => { const t = e.target.value; setText(t); const v = Number(t.trim()); if (t.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }}
      onBlur={() => setText(null)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
  return unit ? <span className="k-ev-numbox">{box}<span className="k-unit">{unit}</span></span> : box;
};

const StatPick: React.FC<{ value: GrowthStat; onPick: (s: GrowthStat) => void }> = ({ value, onPick }) => {
  const menu = useDropMenu({ align: 'start', estimatedHeight: 300 });
  return (
    <>
      <button type="button" aria-haspopup="listbox" aria-expanded={menuOpen(menu)} ref={menu.triggerRef as React.RefObject<HTMLButtonElement>}
        onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}
        className="k-field flex items-center gap-2 min-w-0 flex-1 text-left">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(value) }} />
        <span className="min-w-0 flex-1 truncate">{labelOf(value)}</span>
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 ${menuOpen(menu) ? 'rotate-180' : ''}`} />
      </button>
      <DropMenu menu={menu} role="listbox" label="Stat" matchTriggerWidth
        className="p-1 max-h-[300px] overflow-y-auto popup-scrollbar rounded-xl border border-[var(--alpha-card-border)] k-drop-glass">
        {OFFERED.map(s => {
          const on = s.stat === value;
          return (
            <button key={s.stat} type="button" role="option" aria-selected={on} onClick={() => { onPick(s.stat); menu.close(); }}
              className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-left text-[12px] text-[var(--text-primary)] transition-colors ${on ? 'bg-[var(--control-alpha)]' : 'hover:bg-[var(--alpha-hover)]'}`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(s.stat) }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
            </button>
          );
        })}
      </DropMenu>
    </>
  );
};

const KINDS: readonly [GrowthCurveKind, string, string][] = [
  ['line', 'Straight', 'The same gain every level, from the start level to the stop level.'],
  ['log', 'Logarithm', 'Fast gains first, then slower and slower: the gain a level starts at Per Level and bends over the Bend levels.'],
  ['points', 'Your Points', 'Your own curve: drag its points on the graph, double click the graph to add one, double click a point to take it off.'],
  ['score', 'Level and Score', 'A gain at the start, a gain every level and a gain for the score each level asks, so it speeds up as you grow (the growth modes grow size this way).'],
];

const CurvePick: React.FC<{ value: GrowthCurveKind; onPick: (k: GrowthCurveKind) => void }> = ({ value, onPick }) => {
  const menu = useDropMenu({ align: 'start', estimatedHeight: 160 });
  const cur = KINDS.find(k => k[0] === value) ?? KINDS[0];
  return (
    <>
      <button type="button" aria-haspopup="listbox" aria-expanded={menuOpen(menu)} ref={menu.triggerRef as React.RefObject<HTMLButtonElement>}
        onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}
        className="k-field flex items-center gap-2 min-w-0 flex-1 text-left">
        <span className="min-w-0 flex-1 truncate">{cur[1]}</span>
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 ${menuOpen(menu) ? 'rotate-180' : ''}`} />
      </button>
      <DropMenu menu={menu} role="listbox" label="Curve" matchTriggerWidth
        className="p-1 max-h-[300px] overflow-y-auto popup-scrollbar rounded-xl border border-[var(--alpha-card-border)] k-drop-glass">
        {KINDS.map(([k, label, title]) => {
          const on = k === value;
          return (
            <button key={k} type="button" role="option" aria-selected={on} title={title} onClick={() => { onPick(k); menu.close(); }}
              className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-left text-[12px] text-[var(--text-primary)] transition-colors ${on ? 'bg-[var(--control-alpha)]' : 'hover:bg-[var(--alpha-hover)]'}`}>
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          );
        })}
      </DropMenu>
    </>
  );
};

const GW = 320, GH = 160, PL = 34, PR = 10, PT = 10, PB = 20;

const READ_ROW = 22, READ_GAP = 4;
const GraphReadout: React.FC<{ level: number | null; rows: readonly GrowthStatRule[] }> = ({ level, rows }) => {
  const n = Math.ceil((rows.length + 1) / 2);
  return (
    <div className="k-gr-read" style={{ height: n * READ_ROW + (n - 1) * READ_GAP }}>
      <Fade when={level === null} className="k-gr-layer k-gr-hint">{() => <span className="k-chip">Point at the graph to read a level</span>}</Fade>
      <Fade when={level !== null} className="k-gr-layer k-gr-vals">{() => (<>
        <span className="k-chip k-gr-cell"><span className="truncate">Level</span><span className="k-gr-num">{level}</span></span>
        {rows.map(r => (
          <span key={r.id} className="k-chip k-gr-cell">
            <span className="k-gr-dot" style={{ background: colorOf(r.stat) }} />
            <span className="truncate">{labelOf(r.stat)}</span><span className="k-gr-num">{fmtK(factorOf(r, level ?? 0))}</span>
          </span>
        ))}
      </>)}</Fade>
    </div>
  );
};

const GrowthGraph: React.FC<{ rules: GrowthRules; picked: string | null; onPoints: (id: string, pts: [number, number][]) => void }> = ({ rules, picked, onPoints }) => {
  const shown = rules.stats.filter(r => r.on);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frozen = useRef<{ xMax: number; yMax: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; i: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const leaveT = useRef(0);
  const leave = () => { window.clearTimeout(leaveT.current); leaveT.current = window.setTimeout(() => setHover(null), 180); };
  useEffect(() => () => window.clearTimeout(leaveT.current), []);
  let xMax = 300;
  for (const r of shown) if (r.stop < GROWTH_LIMITS.LEVEL_MAX) xMax = Math.max(xMax, Math.ceil(r.stop * 1.25 / 50) * 50);
  xMax = Math.min(GROWTH_LIMITS.LEVEL_MAX, xMax);
  let yMax = 1.5;
  for (const r of shown) for (let i = 0; i <= 40; i++) yMax = Math.max(yMax, factorOf(r, (i / 40) * xMax));
  yMax = Math.ceil(yMax * 2) / 2;
  if (frozen.current) { xMax = frozen.current.xMax; yMax = frozen.current.yMax; }
  const sx = (l: number) => PL + (l / xMax) * (GW - PL - PR);
  const sy = (k: number) => PT + (1 - (k - 1) / (yMax - 1)) * (GH - PT - PB);
  const toWorld = (e: React.PointerEvent | React.MouseEvent): { l: number; k: number } | null => {
    const svg = svgRef.current; const m = svg?.getScreenCTM(); if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { l: ((p.x - PL) / (GW - PL - PR)) * xMax, k: 1 + (1 - (p.y - PT) / (GH - PT - PB)) * (yMax - 1) };
  };
  const pickedRule = shown.find(r => r.id === picked && r.kind === 'points') ?? null;
  const yStep = yMax <= 3 ? 0.5 : yMax <= 6 ? 1 : yMax <= 15 ? 2 : 5;
  const yTicks: number[] = []; for (let k = 1; k <= yMax + 1e-9; k += yStep) yTicks.push(k);
  const xStep = xMax <= 300 ? 50 : xMax <= 600 ? 100 : 200;
  const xTicks: number[] = []; for (let l = 0; l <= xMax; l += xStep) xTicks.push(l);
  const move = (e: React.PointerEvent) => {
    const w = toWorld(e); if (!w) return;
    window.clearTimeout(leaveT.current);
    setHover(Math.max(0, Math.min(xMax, Math.round(w.l))));
    if (!drag || !pickedRule) return;
    const pts = pickedRule.points.map(p => [p[0], p[1]] as [number, number]);
    const lo = drag.i > 0 ? pts[drag.i - 1][0] : 0, hi = drag.i < pts.length - 1 ? pts[drag.i + 1][0] : GROWTH_LIMITS.LEVEL_MAX;
    pts[drag.i] = [Math.round(Math.min(hi, Math.max(lo, w.l - pickedRule.start))), Math.round(Math.min(GROWTH_LIMITS.BONUS_MAX, Math.max(GROWTH_LIMITS.BONUS_MIN, (w.k - 1) * 100)))];
    onPoints(pickedRule.id, pts);
  };
  const atLevel = hover ?? null;
  return (
    <div className="k-stack">
      <svg ref={svgRef} viewBox={`0 0 ${GW} ${GH}`} className="w-full select-none touch-none" role="img" aria-label="Growth by level"
        onPointerMove={move} onPointerLeave={() => { if (!drag) leave(); }}
        onPointerUp={() => { setDrag(null); frozen.current = null; }}
        onDoubleClick={e => {
          if (!pickedRule) return; const w = toWorld(e); if (!w) return;
          const n = Math.round(w.l - pickedRule.start); if (n <= 0) return;
          const pts = pickedRule.points.filter(p => p[0] !== n).concat([[n, Math.round((w.k - 1) * 100)] as [number, number]]).sort((a, b) => a[0] - b[0]);
          if (pts.length <= GROWTH_LIMITS.POINTS_MAX) onPoints(pickedRule.id, pts);
        }}>
        {yTicks.map(k => (
          <g key={'y' + k}>
            <line x1={PL} x2={GW - PR} y1={sy(k)} y2={sy(k)} stroke="var(--alpha-divider)" strokeWidth={1} />
            <text x={PL - 4} y={sy(k) + 3} textAnchor="end" fontSize={9} fill="var(--text-tertiary)">{fmtK(k)}</text>
          </g>
        ))}
        {xTicks.map(l => <text key={'x' + l} x={sx(l)} y={GH - 6} textAnchor="middle" fontSize={9} fill="var(--text-tertiary)">{l}</text>)}
        {atLevel !== null && <line x1={sx(atLevel)} x2={sx(atLevel)} y1={PT} y2={GH - PB} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="2 3" />} { }
        {shown.map(r => {
          const pts: string[] = [];
          for (let i = 0; i <= 64; i++) { const l = (i / 64) * xMax; pts.push(sx(l).toFixed(1) + ',' + sy(factorOf(r, l)).toFixed(1)); }
          const stopL = Math.min(r.stop, xMax);
          return (
            <g key={r.id}>
              <polyline points={pts.join(' ')} fill="none" stroke={colorOf(r.stat)} strokeWidth={r.id === picked ? 2.5 : 1.5} strokeLinejoin="round" />
              {r.stop < GROWTH_LIMITS.LEVEL_MAX && <circle cx={sx(stopL)} cy={sy(factorOf(r, stopL))} r={2.5} fill={colorOf(r.stat)} />} { }
            </g>
          );
        })}
        {pickedRule && pickedRule.points.map((p, i) => (
          <circle key={i} cx={sx(pickedRule.start + p[0])} cy={sy(1 + p[1] / 100)} r={5} fill="var(--k-field)" stroke={colorOf(pickedRule.stat)} strokeWidth={2}
            className="cursor-grab"
            onPointerDown={e => { e.stopPropagation(); (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); frozen.current = { xMax, yMax }; setDrag({ id: pickedRule.id, i }); }}
            onDoubleClick={e => { e.stopPropagation(); if (pickedRule.points.length > 1) onPoints(pickedRule.id, pickedRule.points.filter((_, j) => j !== i)); }} />
        ))}
      </svg>
      <GraphReadout level={atLevel} rows={shown} />
    </div>
  );
};

export const GrowthRulesCard: React.FC<{ rules: GrowthRules; onChange: (rules: GrowthRules) => void; logic?: { projectEpoch: number } }> = ({ rules, onChange, logic }) => {
  const { showToast } = useToast();
  const [picked, setPicked] = useState<string | null>(rules.stats[0]?.id ?? null);
  const latest = useRef({ rules, onChange }); latest.current = { rules, onChange };
  const patch = (id: string, p: Partial<GrowthStatRule>) => onChange({ ...rules, stats: rules.stats.map(r => (r.id === id ? { ...r, ...p } : r)) });
  const remove = (r: GrowthStatRule) => {
    const at = rules.stats.indexOf(r);
    onChange({ ...rules, stats: rules.stats.filter(x => x.id !== r.id) });
    const back = () => {
      const { rules: cur, onChange: set } = latest.current;
      if (cur.stats.some(x => x.id === r.id)) return;
      const i = Math.min(at, cur.stats.length);
      set({ ...cur, stats: [...cur.stats.slice(0, i), r, ...cur.stats.slice(i)] });
    };
    showToast('info', `${labelOf(r.stat)} rule removed`, { label: 'Undo', run: SMALL_FIX.R908 !== 0 ? sameProjectUndo(logic, showToast, back) : back });
  };
  const add = () => {
    const used = new Set(rules.stats.map(r => r.stat));
    const r = newGrowthStatRule(OFFERED.find(s => !used.has(s.stat))?.stat ?? 'maxHealth');
    onChange({ ...rules, stats: [...rules.stats, r] }); setPicked(r.id);
  };
  return (
    <Group title="Growth Rules" icon={headerIcon(HdAnalyticsUp)}>
      <GrowthGraph rules={rules} picked={picked} onPoints={(id, points) => patch(id, { points })} />
      <MotionList gap={12} empty={<p className="text-[12px] text-[var(--text-tertiary)]">No stat grows yet.</p>}>
        {rules.stats.map(r => (
          <div key={r.id} className="k-stack" onPointerDownCapture={() => setPicked(r.id)}>
            <div className="flex items-center gap-2 min-w-0">
              <StatPick value={r.stat} onPick={stat => patch(r.id, { stat })} />
              <IconButton size="sm" label={`Remove the ${labelOf(r.stat)} rule`} onClick={() => remove(r)}><Trash2 size={13} /></IconButton>
            </div>
            <FieldRow label="Curve" help="Straight: the same gain every level. Logarithm: fast first, then slower. Your Points: your own shape, dragged on the graph. Level and Score: a gain every level plus a gain for the score each level asks, so it speeds up as you grow.">
              <CurvePick value={r.kind} onPick={kind => patch(r.id, { kind })} />
            </FieldRow>
            <Reveal when={r.kind === 'score'}>
              <FieldRow label="At Start" help={`What ${labelOf(r.stat)} already gets at the start level, in %. Growth modes' size: 1.5544 % (recorded: a growth life starts at 24.5 where the Basic is 24.125).`}>
                <RuleNum value={r.atStart} min={GROWTH_LIMITS.BONUS_MIN} max={GROWTH_LIMITS.BONUS_MAX} step={0.01} unit="%" label={`${labelOf(r.stat)} at start`} onChange={atStart => patch(r.id, { atStart })} />
              </FieldRow>
            </Reveal>
            <Reveal when={r.kind !== 'points'}>
              <FieldRow label="Per Level" help={`How much ${labelOf(r.stat)} grows each level, in % of what it is at the start level. Old Dreadnoughts' size: 0.5725 %, growth modes' size: 1.1411 % (recorded).`}>
                <RuleNum value={r.rate} min={GROWTH_LIMITS.RATE_MIN} max={GROWTH_LIMITS.RATE_MAX} step={0.01} unit="%" label={`${labelOf(r.stat)} per level`} onChange={rate => patch(r.id, { rate })} />
              </FieldRow>
            </Reveal>
            <Reveal when={r.kind === 'score'}>
              <FieldRow label="Per Million Score" help={`How much ${labelOf(r.stat)} grows for every million score its levels ask, in % of what it is at the start level. Higher levels ask more score, so the gain a level keeps rising. Growth modes' size: 55.569 % (recorded).`}>
                <RuleNum value={r.scoreRate} min={GROWTH_LIMITS.SCORE_RATE_MIN} max={GROWTH_LIMITS.SCORE_RATE_MAX} step={0.01} unit="%" label={`${labelOf(r.stat)} per million score`} onChange={scoreRate => patch(r.id, { scoreRate })} />
              </FieldRow>
            </Reveal>
            <Reveal when={r.kind === 'log'}>
              <FieldRow label="Bend" help="Over how many levels the gain slows down. Small: it flattens soon. Large: it stays almost straight.">
                <RuleNum value={r.scale} min={GROWTH_LIMITS.SCALE_MIN} max={GROWTH_LIMITS.SCALE_MAX} step={1} unit="levels" label={`${labelOf(r.stat)} bend`} onChange={scale => patch(r.id, { scale })} />
              </FieldRow>
            </Reveal>
            <FieldRow label="Start Level" help="The level this stat starts growing at. Your level 0 is the classic level 45, where every tank starts.">
              <RuleNum value={r.start} min={0} max={GROWTH_LIMITS.LEVEL_MAX} step={1} label={`${labelOf(r.stat)} start level`} onChange={start => patch(r.id, { start, stop: Math.max(start, r.stop) })} />
            </FieldRow>
            <FieldRow label="Stop Level" help={`The level ${labelOf(r.stat)} stops growing at; it keeps that value after. ${GROWTH_LIMITS.LEVEL_MAX} = never stops. Old Dreadnoughts' health stops at 155 (the classic level 200, recorded).`}>
              <RuleNum value={r.stop} min={r.start} max={GROWTH_LIMITS.LEVEL_MAX} step={1} label={`${labelOf(r.stat)} stop level`} onChange={stop => patch(r.id, { stop })} />
            </FieldRow>
          </div>
        ))}
      </MotionList>
      <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={add} disabled={rules.stats.length >= OFFERED.length * 2}>Add a Stat</Button>
    </Group>
  );
};

const runFacts = (r: GrowthPointRun): string[] => {
  const n = r.stop >= r.start ? Math.floor((r.stop - r.start) / Math.max(1, r.every)) + 1 : 0;
  if (n === 0) return ['No points'];
  const last = r.start + (n - 1) * Math.max(1, r.every);
  return [`${n} ${n === 1 ? 'point' : 'points'}`, n === 1 ? `Level ${r.start}` : `Levels ${r.start} to ${last}`];
};

export const SkillPointRuns: React.FC<{ rule: GrowthSkillPointsRule; onChange: (rule: GrowthSkillPointsRule) => void; logic?: { projectEpoch: number } }> = ({ rule, onChange, logic }) => {
  const { showToast } = useToast();
  const runs = pointRunsOf(rule);
  const latest = useRef({ rule, onChange }); latest.current = { rule, onChange };
  const patch = (id: string, p: Partial<GrowthPointRun>) => onChange({ ...rule, runs: runs.map(r => (r.id === id ? { ...r, ...p } : r)) });
  const remove = (r: GrowthPointRun) => {
    const at = runs.indexOf(r);
    onChange({ ...rule, runs: runs.filter(x => x.id !== r.id) });
    const back = () => {
      const { rule: cur, onChange: set } = latest.current;
      const now = pointRunsOf(cur);
      if (now.some(x => x.id === r.id)) return;
      const i = Math.min(at, now.length);
      set({ ...cur, runs: [...now.slice(0, i), r, ...now.slice(i)] });
    };
    showToast('info', 'Skill point run removed', { label: 'Undo', run: SMALL_FIX.R908 !== 0 ? sameProjectUndo(logic, showToast, back) : back });
  };
  return (
    <>
      <MotionList gap={12} empty={<p className="text-[12px] text-[var(--text-tertiary)]">No skill points from levels.</p>}>
        {runs.map(r => (
          <div key={r.id} className="k-stack">
            <div className="flex items-center gap-2 min-w-0">
              <span className="min-w-0 flex-1"><Facts items={factsFrom(runFacts(r))} /></span>
              <IconButton size="sm" label="Remove this skill point run" onClick={() => remove(r)}><Trash2 size={13} /></IconButton>
            </div>
            <FieldRow label="First Level" help="The level of this run's first skill point. Your level 0 is the classic level 45, so 2 is the classic 47.">
              <RuleNum value={r.start} min={1} max={GROWTH_LIMITS.LEVEL_MAX} step={1} label="First skill point level" onChange={start => patch(r.id, { start: Math.round(start), stop: Math.max(Math.round(start), r.stop) })} />
            </FieldRow>
            <FieldRow label="Every" help="How many levels between two skill points of this run.">
              <RuleNum value={r.every} min={GROWTH_LIMITS.EVERY_MIN} max={GROWTH_LIMITS.EVERY_MAX} step={1} unit="levels" label="Levels per skill point" onChange={every => patch(r.id, { every: Math.round(every) })} />
            </FieldRow>
            <FieldRow label="Last Level" help={`No skill point of this run past this level. ${GROWTH_LIMITS.LEVEL_MAX} = it never stops.`}>
              <RuleNum value={r.stop} min={r.start} max={GROWTH_LIMITS.LEVEL_MAX} step={1} label="Last skill point level" onChange={stop => patch(r.id, { stop: Math.round(stop) })} />
            </FieldRow>
          </div>
        ))}
      </MotionList>
      <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => onChange({ ...rule, runs: [...runs, newPointRun()] })} disabled={runs.length >= GROWTH_LIMITS.RUNS_MAX}>Add a Run</Button>
    </>
  );
};
