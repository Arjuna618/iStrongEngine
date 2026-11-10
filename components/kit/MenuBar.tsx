import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuBox, type MenuEntry, type MenuItem } from '../shell/ContextMenu';
import { useEscapeOwner } from '../shared/escapeStack';
import { getCumulativeZoom } from '../../utils/zoomCompensation';

export interface MenuDef {
  id: string;
  label: string;
  entries: () => MenuEntry[];
}

const LEAVE_MS = 110;

export const MenuBar: React.FC<{ menus: readonly MenuDef[]; enabled: boolean; label?: string }> = ({ menus, enabled, label = 'Menu' }) => {
  const [open, setOpen] = useState<{ i: number; entries: MenuEntry[]; x: number; y: number; zoom: number; instant: boolean; key: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const titles = useRef<(HTMLButtonElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const keyRef = useRef(0);
  const leaveTimer = useRef(0);
  const openRef = useRef(open); openRef.current = open;
  const leavingRef = useRef(leaving); leavingRef.current = leaving;

  const openAt = useCallback((i: number, instant: boolean) => {
    const el = titles.current[i];
    if (!el) return;
    const zoom = getCumulativeZoom(el) || 1;
    const r = el.getBoundingClientRect();
    window.clearTimeout(leaveTimer.current);
    setLeaving(false);
    setOpen({ i, entries: menus[i].entries(), x: r.left / zoom, y: (r.bottom + 4) / zoom, zoom, instant, key: ++keyRef.current });
  }, [menus]);

  const close = useCallback(() => {
    if (!openRef.current || leavingRef.current) return;
    setLeaving(true);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => { setOpen(null); setLeaving(false); }, LEAVE_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  useEffect(() => { if (!enabled && openRef.current) { setOpen(null); setLeaving(false); } }, [enabled]);

  useEscapeOwner(() => { close(); const i = openRef.current?.i; if (i !== undefined) titles.current[i]?.focus({ preventScroll: true }); }, !!open && !leaving);

  useEffect(() => {
    if (!open || leaving) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && (t.closest('.k-ctx') || bar.current?.contains(t))) return;
      close();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open, leaving, close]);

  const side = (dir: 1 | -1) => {
    const o = openRef.current;
    if (!o) return;
    const n = menus.length;
    const next = (o.i + dir + n) % n;
    openAt(next, true);
    titles.current[next]?.focus({ preventScroll: true });
  };

  const pick = (it: MenuItem) => { close(); it.onSelect?.(); };

  return (
    <div ref={bar} className="k-mb" role="menubar" aria-label={label}>
      {menus.map((m, i) => {
        const on = !!open && open.i === i && !leaving;
        return (
          <button key={m.id} ref={el => { titles.current[i] = el; }} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={on}
            disabled={!enabled}
            className={`k-mb-title${on ? ' k-mb-title-on' : ''}`}
            onPointerDown={e => {
              if (e.button !== 0) return;
              e.preventDefault();
              if (open && open.i === i && !leaving) close(); else openAt(i, false);
            }}
            onClick={e => { if (e.detail === 0) { if (open && open.i === i) close(); else openAt(i, false); } }}
            onPointerEnter={() => { if (open && !leaving && open.i !== i) openAt(i, true); }}
            onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openAt(i, false); } }}>
            {m.label}
          </button>
        );
      })}
      {open && createPortal(
        <div className="k-mb-pop">
          <MenuBox key={open.key} entries={open.entries} x={open.x} y={open.y} zoom={open.zoom} leaving={leaving} depth={0}
            onPick={pick} activeKeys={!leaving} instant={open.instant} onSide={side} />
        </div>,
        document.body,
      )}
    </div>
  );
};
