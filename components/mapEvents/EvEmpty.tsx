import React from 'react';
import { emptyArt } from '../kit/kit';
import type { AppIcon } from '../ui/icons';

export interface EmptyHint { label: string; onClick?: () => void }

export const EvEmpty: React.FC<{ icon: AppIcon; name: string; hints?: readonly EmptyHint[] }> = ({ icon, name, hints = [] }) => (
  <div className="k-ev-empty" role="group" aria-label={name}>
    <div className="k-hub-empty">
      <span className="k-empty-icon">{emptyArt(icon)}</span>
      {hints.length > 0 ? (
        <div className="k-hub-hints k-ev-hints">
          {hints.map(h => (h.onClick
            ? <button key={h.label} type="button" className="k-hub-hint" onClick={h.onClick}>{h.label}</button>
            : <span key={h.label} className="k-hub-hint">{h.label}</span>))}
        </div>
      ) : null}
    </div>
  </div>
);

export function pressDoor(box: React.RefObject<HTMLElement | null>): void {
  box.current?.querySelector('button')?.click();
}
