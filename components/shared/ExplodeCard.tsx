import { findTankByNameOrKey } from '../../game/tankByName';
import React, { useState, useRef } from 'react';
import { Trash2, Info, ChevronRight, Plus } from '../ui/icons';
import type { ExplodeConfig, ExplodeRing, Turret, LibraryItem } from '../../types';
import {
  EXPLODE_MAX_COUNT, EXPLODE_MAX_RINGS, EXPLODE_MAX_DEPTH, EXPLODE_MAX_PIECES_PER_SHOT,
  explodeCount, explodeActive, explodeTotalPieces, roundNeverAges, piecesPileUp, fragmentLabel,
} from '../../game/explode';
import { explodeSeedFits } from '../../game/roundLayers';
import { EXPLODE_LABEL, EXPLODE_DESCRIPTION, LAYER_CAP_HELP, withLayerCapReason } from './labels';
import { renderSlider, renderToggle } from './uiHelpers';
import { Reveal, MotionList, SwapInPlace } from '../kit/Collapse';
import { Switch } from '../kit/kit';
import { ExplodeRingPreview } from './ExplodeRingPreview';

const ROW_BUTTON = 'k-btn k-btn-secondary k-btn-sm w-full';
const ROW_BUTTON_DISABLED = 'k-btn k-btn-secondary k-btn-sm w-full';

function fmt(v: unknown): string {
  return typeof v === 'number' && isFinite(v) ? String(Math.round(v * 100) / 100) : '0';
}

function finiteOr(v: unknown, d: number): number {
  return typeof v === 'number' && isFinite(v) ? v : d;
}

function summaryText(rings: readonly ExplodeRing[]): string {
  const nr = rings.length < EXPLODE_MAX_RINGS ? rings.length : EXPLODE_MAX_RINGS;
  if (nr > 1) {
    let pieces = 0;
    for (let i = 0; i < nr; i++) pieces += explodeCount(rings[i]?.count);
    return `${nr} rings, ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`;
  }
  const r = rings[0];
  const n = explodeCount(r?.count);
  if (n === 0) return 'No pieces';
  const start = finiteOr(r.startDeg, 0);
  const arc = finiteOr(r.arcDeg, 360);
  if (n === 1) return start === 0 ? '1 piece, straight ahead' : `1 piece, at ${fmt(start)} degrees`;
  if (arc >= 360) return `${n} pieces, one every ${fmt(360 / n)} degrees`;
  return `${n} pieces in a ${fmt(arc)} degree fan`;
}

function tankInLibrary(name: string, lib: readonly LibraryItem[]): boolean {
  return findTankByNameOrKey(lib as LibraryItem[], name) !== null;
}

interface ExplodeCardProps {
  explode: ExplodeConfig;
  onChange: (ex: ExplodeConfig | undefined) => void;
  onAddRing?: () => void;
  onEditFragment?: (ringIndex: number) => void;
  level: number;
  roundLayer: number;
  bombTurret?: Turret;
  tankLibrary?: LibraryItem[];
}

export const ExplodeCard: React.FC<ExplodeCardProps> = ({
  explode, onChange, onAddRing, onEditFragment, level, roundLayer, bombTurret, tankLibrary,
}) => {
  const [confirmFor, setConfirmFor] = useState<ExplodeConfig | null>(null);
  const confirming = confirmFor === explode;

  const ex = explode;
  const rings = Array.isArray(ex.rings) ? ex.rings : [];
  const multi = rings.length > 1;
  const ringKeys = useRef<number[]>([]);
  const nextRingKey = useRef(0);
  while (ringKeys.current.length < rings.length) ringKeys.current.push(nextRingKey.current++);
  if (ringKeys.current.length > rings.length) ringKeys.current.length = rings.length;

  const setEx = (updates: Partial<ExplodeConfig>) => onChange({ ...ex, ...updates });
  const setRing = (i: number, updates: Partial<ExplodeRing>) => {
    const next = rings.slice();
    next[i] = { ...rings[i], ...updates };
    onChange({ ...ex, rings: next });
  };
  const removeRing = (i: number) => {
    if (rings.length < 2) return;
    ringKeys.current.splice(i, 1);
    onChange({ ...ex, rings: rings.filter((_, j) => j !== i) });
  };

  const tooDeep = level > EXPLODE_MAX_DEPTH;
  const neverAges = !ex.anyDeath && !!bombTurret && roundNeverAges(bombTurret);
  let nested = false;
  for (let i = 0; i < rings.length; i++) {
    if (explodeActive(rings[i]?.fragment?.explode)) { nested = true; break; }
  }
  const total = explodeTotalPieces(ex, level);
  const showTotal = !tooDeep && (multi || nested);
  const ringSeedBlocked = rings.length === 0 && (!bombTurret || !explodeSeedFits(roundLayer, bombTurret));

  return (
    <div className="k-group k-l3 k-card">
      <div className="k-card-head">
        <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
          <Switch checked={ex.enabled === true} onChange={v => setEx({ enabled: v })} label={EXPLODE_LABEL} />
          <span className={`k-card-title truncate ${ex.enabled ? '' : 'k-card-title-off'}`}>
            {EXPLODE_LABEL}
          </span>
        </label>
        <SwapInPlace swapKey={confirming} className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="k-hint k-hint-strong">Remove?</span>
            <button
              onClick={() => setConfirmFor(null)}
              className="k-btn k-btn-secondary k-btn-sm"
            >
              Keep
            </button>
            <button
              onClick={() => { setConfirmFor(null); onChange(undefined); }}
              className="k-btn k-btn-primary k-btn-sm"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmFor(explode)}
            aria-label="Remove Explode" title="Remove Explode"
            className="k-icon-btn k-icon-btn-sm"
          >
            <Trash2 size={14} />
          </button>
        )}
        </SwapInPlace>
      </div>

      <p className="k-row-desc">{EXPLODE_DESCRIPTION}</p>

      <Reveal when={ex.enabled}>
        <div className="k-stack">
          <div className="flex items-center gap-3">
            <ExplodeRingPreview rings={rings} size={64} />
            <p className="k-row-desc min-w-0">{summaryText(rings)}</p>
          </div>

          <Reveal when={tooDeep}>
            <p className="k-hint k-hint-strong">
              This is deeper than {EXPLODE_MAX_DEPTH} levels, so it will not explode.
            </p>
          </Reveal>

          {renderToggle(
            'Explode on any death',
            !!ex.anyDeath,
            v => setEx({ anyDeath: v }),
            'When destroyed by anything',
          )}

          <Reveal when={neverAges}>
            <div className="flex items-center gap-1.5 k-hint">
              <Info size={12} className="shrink-0" />
              <span>This projectile never dies of old age, so it will not explode. Set a Lifetime Override or turn on Explode on any death.</span>
            </div>
          </Reveal>

          <MotionList gap={8}>
          {rings.map((ring, i) => {
            const frag = ring?.fragment;
            const pt = frag?.projectileType;
            const life = pt && pt.lifetime > 0 ? pt.lifetime : frag?.bulletLifetime;
            const tank = pt?.tankAsProjectile;
            const missingTank = !!tank && !!tankLibrary && !tankInLibrary(tank, tankLibrary);
            return (
              <div key={`ring-${ringKeys.current[i]}`} className="k-group k-l2 k-card">
                <Reveal when={multi}>
                  <div className="k-card-head">
                    <span className="k-card-title">Ring {i + 1}</span>
                    <button
                      onClick={() => removeRing(i)}
                      aria-label={`Remove Ring ${i + 1}`} title={`Remove Ring ${i + 1}`}
                      className="k-icon-btn k-icon-btn-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Reveal>
                {renderSlider('Pieces', ring.count, v => setRing(i, { count: Math.round(v) }), 1, EXPLODE_MAX_COUNT, 1, false,
                  'How many pieces this ring throws when the projectile breaks.')}
                {renderSlider('Start Angle', ring.startDeg, v => setRing(i, { startDeg: v }), -180, 180, 1, false,
                  'Where the ring starts, in degrees from the way the projectile points. 0 is straight ahead. A full ring places its first piece here, a fan is centred on it.')}
                {renderSlider('Ring Width', ring.arcDeg, v => setRing(i, { arcDeg: v }), 1, 360, 1, false,
                  'How wide the ring of pieces is, in degrees. 360 throws pieces all the way round. Less makes a fan centred on the start angle. How random each piece flies is set on the piece itself (Spread and Shudder).')}

                {frag && (
                  <div className="k-stack pt-2 border-t border-[var(--alpha-divider)]">
                    <div className="space-y-1.5 min-w-0">
                      <p className="k-card-title truncate">{fragmentLabel(frag)}</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([['Damage', frag.bulletDamage], ['Speed', frag.speed], ['Life', life]] as const).map(([k, v]) => (
                          <div key={k} className="min-w-0 rounded-md bg-[var(--layer-3)] border border-[var(--alpha-card-border)] px-1.5 py-1 text-center">
                            <p className="text-[10px] text-[var(--text-tertiary)] truncate">{k}</p>
                            <p className="text-[11px] tabular-nums text-[var(--text-primary)] truncate">{fmt(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Reveal when={missingTank}>
                      <p className="k-hint k-hint-strong">Not in the library, nothing will spawn</p>
                    </Reveal>
                    <Reveal when={!!pt && pt.maxAlive > 0}>{() => (
                      <p className="k-hint">
                        At most {pt.maxAlive} of these alive at once
                      </p>
                    )}</Reveal>
                    <Reveal when={piecesPileUp(frag)}>
                      <div className="flex items-center gap-1.5 k-hint">
                        <Info size={12} className="shrink-0" />
                        <span>These pieces never expire and have no Max Alive, so every bomb adds more. Set their Lifetime Override or Max Alive with Edit Fragment.</span>
                      </div>
                    </Reveal>
                    {onEditFragment && (
                      <button onClick={() => onEditFragment(i)} className={ROW_BUTTON}>
                        Edit Fragment
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </MotionList>

          <Reveal when={!!onAddRing && rings.length < EXPLODE_MAX_RINGS}>
          {(ringSeedBlocked ? (
            <button disabled title={LAYER_CAP_HELP} className={ROW_BUTTON_DISABLED}>
              <Plus size={14} />
              {withLayerCapReason('Add Ring')}
            </button>
          ) : (
            <button onClick={onAddRing} className={ROW_BUTTON}>
              <Plus size={14} />
              Add Ring
            </button>
          ))}
          </Reveal>

          <Reveal when={showTotal && total > 0}>
            <p className="k-hint">
              Up to {total} pieces from one shot
              {total > EXPLODE_MAX_PIECES_PER_SHOT && (
                <span className="font-medium text-[var(--text-primary)]"> (limited to {EXPLODE_MAX_PIECES_PER_SHOT})</span>
              )}
            </p>
          </Reveal>
        </div>
      </Reveal>
    </div>
  );
};
