import React from 'react';
import { TriangleAlert } from './ui/icons';
import { Modal } from './kit/Modal';

interface Props {
  rockCount: number;
  portalCount: number;
  menuScale?: number;
  onRemove: () => void;
  onCancel: () => void;
}

export const MapScaleConflictPopup: React.FC<Props> = ({ rockCount, portalCount, onRemove, onCancel }) => {
  const parts: string[] = [];
  if (rockCount > 0) parts.push(countLabel(rockCount, 'rock', 'rocks'));
  if (portalCount > 0) parts.push(countLabel(portalCount, 'portal', 'portals'));
  const removalText = parts.join(' and ');
  return (
    <Modal title="Overlapping Entities" icon={<TriangleAlert size={18} />} size="sm" z={120} onClose={onCancel}
      footer={close => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close()}>Keep My Map</button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close(onRemove)}>Remove {removalText}</button>
      </>}>
      <p className="k-modal-text">At this map scale some portals would overlap other map entities. Portals have one fixed size, so they cannot shrink with the map. Everything else keeps its formation.</p>
    </Modal>
  );
};

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

