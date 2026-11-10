import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal } from '../kit/Modal';
import { Switch } from '../kit/kit';
import { useHeld } from '../kit/presence';
import { HdFileBox, TriangleAlert, Download, type AppIcon } from '../ui/icons';

export interface ChoiceButton<T> { label: string; value: T; primary?: boolean }

type Spec =
  | { kind: 'choice'; title: string; message: React.ReactNode; buttons: ChoiceButton<string>[]; cancel: string; resolve: (v: string) => void; list?: string[]; icon?: AppIcon }
  | { kind: 'name'; title: string; label: string; initial: string; confirm: string; validate: (s: string) => string | null; resolve: (v: string | null) => void; icon?: AppIcon }
  | { kind: 'notice'; title: string; message: React.ReactNode; list?: string[]; dontShow?: boolean; extra?: { label: string; run: () => void }; resolve: (dontShow: boolean) => void; icon?: AppIcon };

let _spec: Spec | null = null;
const subs = new Set<() => void>();
const show = (s: Spec | null) => { _spec = s; subs.forEach(f => f()); };
const waiting: (() => void)[] = [];
function enqueue(open: () => void): void {
  if (_spec) waiting.push(open); else open();
}
function finish(): void {
  show(null);
  const next = waiting.shift();
  if (next) setTimeout(next, 0);
}
function once<T>(fn: (v: T) => void): (v: T) => void {
  let done = false;
  return (v: T) => { if (!done) { done = true; fn(v); } };
}

export function askChoice<T extends string>(title: string, message: React.ReactNode, buttons: ChoiceButton<T>[], cancel: T, list?: string[], icon?: AppIcon): Promise<T> {
  return new Promise(resolve => enqueue(() => show({ kind: 'choice', title, message, buttons, cancel, list, icon, resolve: once((v: string) => resolve(v as T)) })));
}

export function askName(title: string, label: string, initial: string, confirm: string, validate: (s: string) => string | null, icon?: AppIcon): Promise<string | null> {
  return new Promise(resolve => enqueue(() => show({ kind: 'name', title, label, initial, confirm, validate, icon, resolve: once(resolve) })));
}

export function showNotice(title: string, message: React.ReactNode, opts: { list?: string[]; dontShow?: boolean; extra?: { label: string; run: () => void }; icon?: AppIcon } = {}): Promise<boolean> {
  return new Promise(resolve => enqueue(() => show({ kind: 'notice', title, message, list: opts.list, dontShow: opts.dontShow, extra: opts.extra, icon: opts.icon, resolve: once(resolve) })));
}

export function dialogOpen(): boolean { return _spec !== null; }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const current = () => _spec;

function List({ items }: { items: string[] }) {
  return (
    <ul className="k-pd-list">
      {items.slice(0, 12).map((t, i) => <li key={i} dir="auto">{t}</li>)}
      {items.length > 12 && <li>and {items.length - 12} more</li>}
    </ul>
  );
}

function NameForm({ spec, handle, onDone }: { spec: Extract<Spec, { kind: 'name' }>; handle: React.MutableRefObject<(() => void) | null>; onDone: (v: string) => void }) {
  const [v, setV] = useState(spec.initial);
  const [err, setErr] = useState<string | null>(null);
  const shownErr = useHeld(err);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const submit = () => { const e = spec.validate(v); if (e) { setErr(e); return; } onDone(v.trim()); };
  handle.current = submit;
  return (
    <div className="space-y-1.5">
      <label className="k-pd-label" htmlFor="k-pd-name">{spec.label}</label>
      <input id="k-pd-name" ref={ref} dir="auto" className="k-text-in k-pd-input" value={v} maxLength={80}
        onChange={e => { setV(e.target.value); if (err) setErr(null); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      <p className={`k-pd-error${err ? '' : ' k-pd-error-off'}`} aria-live="polite">{shownErr ?? '\u00a0'}</p>
    </div>
  );
}

export const DIALOG_Z = 80;
const CHOICE3_W = 520;

export const ProjectDialogs: React.FC = () => {
  const spec = useSyncExternalStore(subscribe, current, current);
  const [dontShow, setDontShow] = useState(false);
  const submitRef = useRef<(() => void) | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  useEffect(() => { setDontShow(false); }, [spec]);
  if (!spec) return null;

  const ChoiceIcon = spec.icon ?? HdFileBox, NameIcon = spec.icon ?? HdFileBox, NoticeIcon = spec.icon ?? TriangleAlert;
  if (spec.kind === 'choice') {
    return (
      <Modal title={spec.title} icon={<ChoiceIcon size={18} />} size="sm" width={spec.buttons.length > 2 ? CHOICE3_W : undefined} z={DIALOG_Z} onClose={() => { spec.resolve(spec.cancel); finish(); }}
        footer={close => <>
          {spec.buttons.map(b => (
            <button key={b.value} type="button" className={`k-btn ${b.primary ? 'k-btn-primary' : 'k-btn-secondary'} k-btn-md flex-1`}
              onClick={() => { spec.resolve(b.value); close(); }}>{b.label}</button>
          ))}
        </>}>
        <div className="k-modal-text" dir="auto">{spec.message}</div>
        {spec.list && spec.list.length > 0 && <List items={spec.list} />}
      </Modal>
    );
  }

  if (spec.kind === 'name') {
    return (
      <Modal title={spec.title} icon={<NameIcon size={18} />} size="sm" z={DIALOG_Z} onClose={() => { spec.resolve(null); finish(); }}
        footer={close => { closeRef.current = close; return <>
          <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close()}>Cancel</button>
          <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => submitRef.current?.()}>{spec.confirm}</button>
        </>; }}>
        <NameForm spec={spec} handle={submitRef} onDone={v => { spec.resolve(v); closeRef.current?.(); }} />
      </Modal>
    );
  }

  return (
    <Modal title={spec.title} icon={<NoticeIcon size={18} />} size="sm" z={DIALOG_Z} onClose={() => { spec.resolve(dontShow); finish(); }}
      footer={close => <>
        {spec.extra && (
          <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => spec.extra!.run()}>
            <span className="k-btn-icon"><Download size={14} /></span><span className="truncate">{spec.extra.label}</span>
          </button>
        )}
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => { spec.resolve(dontShow); close(); }}>OK</button>
      </>}>
      <div className="k-modal-text" dir="auto">{spec.message}</div>
      {spec.list && spec.list.length > 0 && <List items={spec.list} />}
      {spec.dontShow && (
        <label className="k-pd-dontshow">
          <Switch checked={dontShow} onChange={setDontShow} label="Don't show this again" />
          <span>Don't show this again</span>
        </label>
      )}
    </Modal>
  );
};
