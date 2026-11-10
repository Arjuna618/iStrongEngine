import React, { useCallback, useRef, useState } from 'react';

interface DirectionDialProps {
  value: number;
  onChange: (deg: number) => void;
  label: string;
  disabled?: boolean;
}

const SIZE = 56, R = SIZE / 2;
const norm = (d: number): number => ((Math.round(d) % 360) + 360) % 360;

export function DirectionDial({ value, onChange, label, disabled }: DirectionDialProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const box = useRef<SVGSVGElement | null>(null);
  const last = useRef(value);
  const shown = drag !== null ? drag : norm(value);

  const degAt = useCallback((e: React.PointerEvent, snap: boolean): number => {
    const r = box.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = norm((Math.atan2(dx, -dy) * 180) / Math.PI);
    return snap ? norm(Math.round(d / 15) * 15) : d;
  }, []);
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = degAt(e, e.shiftKey); last.current = d; setDrag(d);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const d = degAt(e, e.shiftKey); last.current = d; setDrag(d);
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    if (last.current !== norm(value)) onChange(last.current);
  };
  const key = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
    if (step === 0) return;
    e.preventDefault();
    onChange(norm(norm(value) + step));
  };

  const a = (shown * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a);
  const tip = R - 7, tx = R + ux * tip, ty = R + uy * tip;
  const bx = R + ux * (tip - 9), by = R + uy * (tip - 9);
  const px = -uy * 5, py = ux * 5;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <svg ref={box} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="slider" tabIndex={disabled ? -1 : 0}
        aria-label={label} aria-valuemin={0} aria-valuemax={359} aria-valuenow={shown} aria-disabled={disabled || undefined}
        className={disabled ? 'k-row-disabled' : undefined} style={{ cursor: disabled ? 'default' : 'pointer', touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
        <circle cx={R} cy={R} r={R - 1} fill="var(--k-field)" stroke="var(--k-input-border)" strokeWidth={1} />
        {[0, 90, 180, 270].map(t => {
          const ta = (t * Math.PI) / 180, sx = Math.sin(ta), sy = -Math.cos(ta);
          return <line key={t} x1={R + sx * (R - 4)} y1={R + sy * (R - 4)} x2={R + sx * (R - 8)} y2={R + sy * (R - 8)} stroke="var(--text-tertiary)" strokeWidth={1.5} strokeLinecap="round" />;
        })}
        <line x1={R} y1={R} x2={bx} y2={by} stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" />
        <polygon points={`${tx},${ty} ${bx + px},${by + py} ${bx - px},${by - py}`} fill="var(--accent)" />
        <circle cx={R} cy={R} r={3} fill="var(--accent)" />
      </svg>
      <span className="k-value-text tabular-nums w-9 text-right">{shown}&deg;</span>
    </div>
  );
}
