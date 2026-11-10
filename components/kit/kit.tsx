import React, { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { isTouchScreen } from '../../utils/device';
import { EditableValue } from '../shared/EditableValue';
import { HelpTooltip } from '../shared/HelpTooltip';
import { Collapse, Fade, SwapText, SwapInPlace, useFoldHandle, type FoldHandle } from './Collapse';
import { FoldMemoryContext } from './motion';
import { TagTitle, InlineMotion, type TagItem } from './TagLine';
import { panelMemory, usePanelScope, usePanelsVersion } from './panelMemory';
import { cardStartsOpen } from './panelFolds';
import { CustomSelect, type SelectOption, type SelectGroup } from '../shared/CustomSelect';
import { sliderDomain, sliderFillStyle, type SliderStep } from '../shared/sliderMath';
import { NumberInput } from '../shared/NumberInput';
import { EMPTY_LINE, ChevronDown, ChevronRight, Search, X, Lock, type AppIcon } from '../ui/icons';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
const BTN_VARIANT: Record<ButtonVariant, string> = { primary: 'k-btn-primary', secondary: 'k-btn-secondary', ghost: 'k-btn-ghost', danger: 'k-btn-danger' };
const BTN_SIZE: Record<ButtonSize, string> = { sm: 'k-btn-sm', md: 'k-btn-md', lg: 'k-btn-lg' };
const ICON_BTN_SIZE = { sm: 'k-icon-btn-sm', md: 'k-icon-btn-md', lg: 'k-icon-btn-lg' } as const;
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  block?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, block, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={cx('k-btn', BTN_VARIANT[variant], BTN_SIZE[size], block && 'w-full', className)} {...rest}>
      {icon && <span className="k-btn-icon">{icon}</span>}
      {children != null && <span className="truncate">{children}</span>}
      {iconRight && <span className="k-btn-icon">{iconRight}</span>}
    </button>
  );
});

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx('k-icon-btn', ICON_BTN_SIZE[size], active && 'k-icon-btn-active', className)} {...rest}>
      {children}
    </button>
  );
});

interface GroupProps {
  title?: string;
  foldKey?: string;
  icon?: React.ReactNode;
  count?: string | number;
  right?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  level?: 2 | 3;
  flush?: boolean;
  hidden?: boolean;
  className?: string;
  boxRef?: React.Ref<HTMLElement>;
  handle?: React.MutableRefObject<FoldHandle | null>;
  inert?: boolean;
  children?: React.ReactNode;
}
const PanelFoldContext = React.createContext(false);
export const PanelFold: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => (
  <PanelFoldContext.Provider value={on}>{children}</PanelFoldContext.Provider>
);
export const CardNestContext = React.createContext(false);

export const Group: React.FC<GroupProps> = ({ title, foldKey, icon, count, right, collapsible: collapsibleProp, defaultOpen = true, open, onToggle, level = 2, flush, hidden, className, boxRef, handle, inert, children }: GroupProps) => {
  const panelFold = useContext(PanelFoldContext);
  const collapsible = collapsibleProp ?? (panelFold && title != null && title !== '');
  const foldMem = useContext(FoldMemoryContext);
  const memKey = foldKey ?? (typeof title === 'string' && title !== '' ? title : null);
  const scope = usePanelScope();
  const projKey = scope && memKey && collapsible ? scope + '/' + memKey : null;
  const nested = useContext(CardNestContext);
  const startOpen = (): boolean => (!nested && collapsible ? cardStartsOpen(scope, memKey) : undefined) ?? defaultOpen;
  const kept = (): boolean => {
    if (memKey && foldMem?.has(memKey)) return foldMem.get(memKey)!;
    const p = projKey ? panelMemory.fold(projKey) : undefined;
    return p ?? startOpen();
  };
  const [own, setOwn] = useState(kept);
  const pver = usePanelsVersion();
  const seenVer = useRef(pver);
  useEffect(() => { if (seenVer.current !== pver) { seenVer.current = pver; if (open === undefined) setOwn(kept()); } });
  const isOpen = open ?? own;
  const foldBusy = useRef(false);
  const toggle = () => { if (foldBusy.current) return; const n = !isOpen; if (open === undefined) { setOwn(n); if (memKey) foldMem?.set(memKey, n); if (projKey) panelMemory.setFold(projKey, n); } onToggle?.(n); };
  const selfEl = useRef<HTMLElement | null>(null);
  const boxRefNow = useRef(boxRef);
  boxRefNow.current = boxRef;
  const setBox = useCallback((n: HTMLElement | null) => {
    selfEl.current = n;
    const r = boxRefNow.current;
    if (typeof r === 'function') r(n); else if (r) (r as React.MutableRefObject<HTMLElement | null>).current = n;
  }, []);
  useFoldHandle(handle, selfEl, !collapsible || isOpen, toggle);
  const countMark = <Fade when={count != null} className="k-count">{() => <SwapText>{count}</SwapText>}</Fade>;
  const rightMark = <Fade when={right != null} className="flex items-center gap-2">{right}</Fade>;
  const head = title != null && (
    <div className="k-group-head">
      <span className="k-group-title">
        {icon && <span className="k-group-icon">{icon}</span>}
        <span className="truncate"><SwapText className="truncate">{title}</SwapText></span>
        {countMark}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {rightMark}
        {collapsible && <ChevronDown size={14} className={cx('k-chevron', isOpen && 'k-chevron-open')} />}
      </span>
    </div>
  );
  const barWithActions = collapsible && right !== undefined && title != null && (
    <div className="k-group-bar">
      <button type="button" className="k-group-hit" aria-expanded={isOpen} onClick={toggle}><span className="sr-only">{title}</span></button>
      <span className="k-group-title">
        {icon && <span className="k-group-icon">{icon}</span>}
        <span className="truncate"><SwapText className="truncate">{title}</SwapText></span>
        {countMark}
      </span>
      <span className="k-group-right">
        {rightMark}
        <ChevronDown size={14} className={cx('k-chevron', isOpen && 'k-chevron-open')} />
      </span>
    </div>
  );
  return (
    <section ref={setBox} inert={inert || undefined} className={cx('k-group', level === 3 ? 'k-l3' : 'k-l2', head && 'k-titled', hidden && 'hidden', className)} hidden={hidden || undefined}>
      {barWithActions || (head && (collapsible
        ? <button type="button" className="k-group-toggle" aria-expanded={isOpen} onClick={toggle}>{head}</button>
        : head))}
      {children != null && (collapsible
        ? <Collapse open={isOpen} onBusyChange={b => { foldBusy.current = b; }}><div className={cx('k-group-main', !flush && 'k-group-body')}><CardNestContext.Provider value={true}>{children}</CardNestContext.Provider></div></Collapse>
        : <div className={cx('k-group-main', !flush && 'k-group-body')}><CardNestContext.Provider value={true}>{children}</CardNestContext.Provider></div>)}
    </section>
  );
};

export function headerIcon(I: AppIcon): React.ReactNode { return <I size={12} strokeWidth={2.006} />; }

interface RowTextProps {
  label: React.ReactNode; description?: React.ReactNode; help?: string; icon?: React.ReactNode; hidden?: boolean;
  mark?: React.ReactNode;
  locked?: boolean;
  note?: React.ReactNode;
  why?: string;
}
const WhyOffContext = React.createContext<string | undefined>(undefined);
function withWhy(why: string | undefined, tip: React.ReactNode): React.ReactNode {
  if (!why) return tip;
  if (tip == null || tip === false || tip === '') return why;
  return typeof tip === 'string' ? `${why} ${tip}` : <>{why}<br />{tip}</>;
}
export function useWhyTip(tip: string | undefined, own?: string): string | undefined {
  const block = useContext(WhyOffContext);
  return withWhy(own || block, tip) as string | undefined;
}
export const Dim: React.FC<{ when: unknown; why?: string; className?: string; children?: React.ReactNode }> = ({ when, why, className, children }) => {
  const outer = useContext(WhyOffContext);
  const on = !!when;
  return (
    <div className={cx(className, on && 'k-row-disabled')}>
      <WhyOffContext.Provider value={on ? (why ?? outer) : outer}>{children}</WhyOffContext.Provider>
    </div>
  );
};
function joinTip(description: React.ReactNode, help?: string): React.ReactNode {
  if (description == null || description === false || description === '') return help;
  if (typeof description === 'string') {
    if (!help) return description;
    const d = description.trim();
    return /[.!?:]$/.test(d) ? `${d} ${help}` : `${d}. ${help}`;
  }
  return help ? <>{description}<br />{help}</> : description;
}
export const LOCK_MARK = <Lock size={14} />;
function RowText({ label, description, help, icon, mark, note, locked, why, off }: RowTextProps & { off?: boolean }) {
  const keepLine = !!icon && description != null && description !== false && description !== '';
  const blockWhy = useContext(WhyOffContext);
  const tip = withWhy((off && why) || blockWhy, keepLine ? help : joinTip(description, help));
  const lead = mark ?? (locked ? LOCK_MARK : undefined);
  return (
    <span className="k-row-text">
      <span className="k-row-label">
        {icon && <span className="k-row-icon">{icon}</span>}
        <Fade when={tip || lead} className="k-row-lead">{() => (tip ? <HelpTooltip text={tip} icon={lead} /> : lead)}</Fade>
        <span className="k-row-label-text">{label}</span>
      </span>
      {keepLine && <span className="k-row-desc">{description}</span>}
      <Collapse open={note != null && note !== false && note !== ''} reveal="none" className="k-row-note">
        <span className="k-row-desc block">{note}</span>
      </Collapse>
    </span>
  );
}

export function RowLabel({ label, help, className }: { label: React.ReactNode; help?: string; className?: string }) {
  const tip = useWhyTip(help);
  return (
    <span className={cx('k-row-label', className)}>
      <Fade when={tip} className="k-row-lead">{() => <HelpTooltip text={tip!} />}</Fade>
      <span className="k-row-label-text">{label}</span>
    </span>
  );
}

interface SwitchProps { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; mixed?: boolean; label?: string; id?: string }
export function Switch({ checked, onChange, disabled, mixed, label, id }: SwitchProps) {
  return (
    <span className={cx('toggle-ios k-switch', mixed && !checked && 'toggle-ios-mixed', disabled && 'opacity-50')}>
      <input id={id} type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-ios-track" />
      <span className="toggle-ios-knob" />
    </span>
  );
}

interface ToggleRowProps extends RowTextProps { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; mixed?: boolean }
export const ToggleRow: React.FC<ToggleRowProps> = ({ checked, onChange, disabled, mixed, hidden, ...text }: ToggleRowProps) => {
  return (
    <label className={cx('k-row k-row-click', text.locked ? 'k-row-locked' : disabled && 'k-row-disabled', hidden && 'hidden')} hidden={hidden || undefined}>
      <RowText {...text} off={disabled} />
      <Switch checked={checked} onChange={onChange} disabled={disabled || text.locked} mixed={mixed} label={typeof text.label === 'string' ? text.label : undefined} />
    </label>
  );
};

interface SliderRowProps extends RowTextProps {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: SliderStep;
  keepFraction?: boolean;
  disabled?: boolean; unit?: string; display?: string; minLabel?: string; maxLabel?: string;
  onCommit?: (v: number) => void;
  deferred?: boolean;
  format?: (v: number) => string;
  inputMin?: number;
  inputMax?: number;
  action?: React.ReactNode;
  logScale?: boolean;
}
export const SliderRow: React.FC<SliderRowProps> = ({ value, onChange, min, max, keepFraction, step = 1, disabled: off, unit, display, minLabel, maxLabel, onCommit, deferred, format, inputMin, inputMax, action, hidden, logScale, ...text }: SliderRowProps) => {
  const disabled = off || text.locked;
  const [drag, setDrag] = useState<number | null>(null);
  const dragging = useRef(false);
  const latest = useRef(value);
  const shown = deferred && drag !== null ? drag : value;
  const { lo, hi } = sliderDomain(min, max, shown, step);
  const tr = (x: number) => (logScale ? Math.log(Math.max(1e-9, x)) : x);
  const un = (x: number) => (logScale ? Math.exp(x) : x);
  const tStep: SliderStep = logScale ? 0.01 : step;
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const final = latest.current;
    setDrag(null);
    if (final !== value) onChange(final);
  };
  const shownText = format ? format(shown) : display;
  return (
    <div className={cx('k-slider-row', text.locked ? 'k-row-locked' : disabled && 'k-row-disabled', hidden && 'hidden')} hidden={hidden || undefined}>
      <div className="k-row">
        <RowText {...text} off={off} />
        <span className="k-value">
          <EditableValue value={shown} onChange={onCommit ? (v) => { onChange(v); onCommit(v); } : onChange} min={inputMin ?? lo} max={inputMax ?? hi} step={step} keepFraction={keepFraction} disabled={disabled} displayValue={shownText} className="k-value-field" />
          {unit && <span className="k-unit">{unit}</span>}
          {action}
        </span>
      </div>
      {deferred ? (
        <input type="range" min={tr(lo)} max={tr(hi)} step={tStep} value={tr(shown)} disabled={disabled}
          onPointerDown={() => { dragging.current = true; latest.current = value; setDrag(value); }}
          onChange={e => { const v = un(parseFloat(e.target.value)); if (dragging.current) { latest.current = v; setDrag(v); } else onChange(v); }}
          onPointerUp={endDrag} onLostPointerCapture={endDrag}
          style={sliderFillStyle(tr(shown), tr(lo), tr(hi))} className="w-full" />
      ) : (
        <input type="range" min={tr(lo)} max={tr(hi)} step={tStep} value={tr(value)} disabled={disabled}
          onChange={e => onChange(un(parseFloat(e.target.value)))}
          onPointerUp={onCommit ? (e) => onCommit(un(parseFloat((e.target as HTMLInputElement).value))) : undefined}
          onKeyUp={onCommit ? (e) => { if (/^(Arrow|Home|End|Page)/.test(e.key)) onCommit(un(parseFloat((e.target as HTMLInputElement).value))); } : undefined}
          style={sliderFillStyle(tr(value), tr(lo), tr(hi))} className="w-full" />
      )}
      {(minLabel || maxLabel) && <div className="k-slider-ends"><span>{minLabel}</span><span>{maxLabel}</span></div>}
    </div>
  );
};

interface SelectRowProps extends RowTextProps {
  value: string; onChange: (v: string) => void; options?: Record<string, string> | SelectOption[]; groups?: SelectGroup[]; disabled?: boolean;
}
export const SelectRow: React.FC<SelectRowProps> = ({ value, onChange, options, groups, disabled, hidden, ...text }: SelectRowProps) => {
  return (
    <div className={cx('k-row-stack', text.locked ? 'k-row-locked' : disabled && 'k-row-disabled', hidden && 'hidden')} hidden={hidden || undefined}>
      <RowText {...text} off={disabled} />
      <CustomSelect value={value} onChange={onChange} options={options} groups={groups} disabled={disabled || text.locked} className="w-full" />
    </div>
  );
};

interface SegmentedProps<T extends string> {
  value: T | null; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; title?: string }[]; disabled?: boolean; block?: boolean }
export function Segmented<T extends string>({ value, onChange, options, disabled, block }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" className={cx('k-seg', block && 'k-seg-block', disabled && 'k-row-disabled')}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title}
          disabled={disabled} onClick={() => onChange(o.value)} className={cx('k-seg-item', o.value === value && 'k-seg-on')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface FieldRowProps extends RowTextProps { children: React.ReactNode; stacked?: boolean }
export const FieldRow: React.FC<FieldRowProps> = ({ children, stacked, hidden, ...text }: FieldRowProps) => {
  return (
    <div className={cx(stacked ? 'k-row-stack' : 'k-row', hidden && 'hidden')} hidden={hidden || undefined}>
      <RowText {...text} />
      {children}
    </div>
  );
};

interface PickRowProps { title: React.ReactNode; meta?: React.ReactNode; selected?: boolean; onPick: () => void; actions?: React.ReactNode; icon?: React.ReactNode;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  tags?: TagItem[];
  onRename?: () => void;
  renaming?: React.ReactNode;
  facts?: { key: string; text: string }[] }
export const PickRow: React.FC<PickRowProps> = ({ title, meta, selected, onPick, actions, icon, onContextMenu, tags, onRename, renaming, facts }) => {
  return (
    <div role="button" tabIndex={0} aria-pressed={!!selected} className={cx('k-pick', selected && 'k-pick-on')} onClick={onPick} onContextMenu={onContextMenu}
      onDoubleClick={onRename ? (e => { if ((e.target as Element).closest('.k-pick-title')) onRename(); }) : undefined}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(); } }}>
      {icon && <span className="k-pick-icon">{icon}</span>}
      <span className="k-pick-text">
        <SwapInPlace swapKey={renaming != null} hold={false} className="min-w-0">
        {renaming ?? (tags
          ? <TagTitle title={title} tags={tags} />
          : <span className="k-pick-title">{title}</span>)}
        </SwapInPlace>
        {meta && <span className="k-pick-meta">{meta}</span>}
        {facts && <span className="k-pick-facts k-fade"><InlineMotion items={facts.map(f => ({ key: f.key, node: <Chip>{f.text}</Chip> }))} /></span>}
      </span>
      {actions && <span className="k-pick-actions" onClick={e => e.stopPropagation()}>{actions}</span>}
    </div>
  );
};

interface NumberFieldProps { id: string; label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; help?: string; min?: number; max?: number; step?: number; disabled?: boolean }
export const NumberField: React.FC<NumberFieldProps> = ({ id, label, value, onChange, help, min, max, step, disabled }: NumberFieldProps) => {
  const tip = useWhyTip(help);
  return (
    <div className="k-num">
      <label htmlFor={id} className="k-num-label">{tip && <HelpTooltip text={tip} />}{label}</label>
      <NumberInput id={id} value={value} onChange={onChange} min={min} max={max} step={step} disabled={disabled} className="k-field k-num-field" />
    </div>
  );
};

export function Crumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="k-crumbs">
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={12} className="k-crumb-sep" />}
          {c.onClick
            ? <button type="button" className="k-crumb" onClick={c.onClick}>{c.label}</button>
            : <span className="k-crumb-here" aria-current="page">{c.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> { value: string; onChange: (v: string) => void }
export function TextField({ value, onChange, className, ...rest }: TextFieldProps) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} className={cx('k-field', className)} {...rest} />;
}

interface SearchFieldProps { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }
export function SearchField({ value, onChange, placeholder = 'Search', className, autoFocus }: SearchFieldProps) {
  const id = useId();
  return (
    <div className={cx('k-search', className)}>
      <Search size={14} className="k-search-icon" />
      <input id={id} type="search" value={value} placeholder={placeholder} autoFocus={autoFocus && !isTouchScreen()} onChange={e => onChange(e.target.value)} className="k-field k-search-input" />
      <Fade when={value !== ''}><button type="button" className="k-search-clear" aria-label="Clear search" onClick={() => onChange('')}><X size={12} /></button></Fade>
    </div>
  );
}

export function SearchEnd({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <SwapInPlace swapKey={query !== ''} hold={false}>{query !== '' ? (
      <button onClick={onClear} className="k-ico absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--alpha-hover)] hover:text-[var(--text-primary)]" title="Clear search" aria-label="Clear search">
        <X size={14} />
      </button>
    ) : isTouchScreen() ? null : (
      <span className="kbd-chip absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">Ctrl K</span>
    )}</SwapInPlace>
  );
}

interface ChipProps {
  children: React.ReactNode; active?: boolean; onClick?: () => void; title?: string;
  unusable?: string;
}
export const Chip: React.FC<ChipProps> = ({ children, active, onClick, title, unusable }: ChipProps) => {
  if (onClick && unusable) {
    return <button type="button" data-tip={unusable} aria-disabled="true" className="k-chip k-chip-click">{children}</button>;
  }
  return onClick
    ? <button type="button" title={title} onClick={onClick} className={cx('k-chip k-chip-click', active && 'k-chip-on')}>{children}</button>
    : <span title={title} className={cx('k-chip', active && 'k-chip-on')}>{children}</span>;
};

export function Divider({ className }: { className?: string }) { return <div role="separator" className={cx('k-divider', className)} />; }

export function emptyArt(I: AppIcon): React.ReactNode { return <I size={58} strokeWidth={EMPTY_LINE} />; }

export function EmptyState({ icon, title, hint, action, words }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode; words?: boolean }) {
  return (
    <div className="k-empty" role={words || action ? undefined : 'img'} aria-label={words || action ? undefined : (hint ? `${title}. ${hint}` : title)}>
      {icon && <span className="k-empty-icon">{icon}</span>}
      {words && <span className="k-empty-title">{title}</span>}
      {words && hint && <span className="k-empty-hint">{hint}</span>}
      {action}
    </div>
  );
}

interface TabsProps<T extends string> { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number }[] }
export function Tabs<T extends string>({ value, onChange, tabs }: TabsProps<T>) {
  return (
    <div role="tablist" className="k-tabs">
      {tabs.map(t => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)} className={cx('k-tab', t.value === value && 'k-tab-on')}>
          {t.label}{t.count != null && <span className="k-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

interface SkeletonProps { w?: number | string; h?: number | string; r?: number | string; className?: string; style?: React.CSSProperties }
export const Skeleton: React.FC<SkeletonProps> = ({ w = '100%', h = 12, r = 6, className, style }) => (
  <span aria-hidden className={cx('skeleton-shimmer k-skel', className)} style={{ width: w, height: h, borderRadius: r, ...style }} />
);
export function SkeletonText({ lines = 1, lineHeight = 16, size = 10, lastWidth = '60%' }: { lines?: number; lineHeight?: number; size?: number; lastWidth?: number | string }) {
  return (
    <span aria-hidden className="flex flex-col" style={{ gap: lineHeight - size }}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={size} r={4} w={i === lines - 1 && lines > 1 ? lastWidth : '100%'} />)}
    </span>
  );
}
export function useLoadingAfter(loading: boolean, ms = 150): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!loading) { setHeld(false); return; }
    const t = window.setTimeout(() => setHeld(true), ms);
    return () => window.clearTimeout(t);
  }, [loading, ms]);
  return loading && held;
}
export function Loadable({ ready, skeleton, children, className }: { ready: boolean; skeleton: React.ReactNode; children: React.ReactNode; className?: string }) {
  return ready ? <div className={cx('k-fade-in', className)}>{children}</div> : <div className={className} aria-busy="true">{skeleton}</div>;
}
