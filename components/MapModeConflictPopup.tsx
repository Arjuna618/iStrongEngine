import React from 'react';
import { TriangleAlert } from './ui/icons';
import { Modal } from './kit/Modal';

interface Props {
  modeName: string;
  forceReplace: boolean;
  handWork?: boolean;
  menuScale?: number;
  onKeep: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

export const MapModeConflictPopup: React.FC<Props> = ({ modeName, forceReplace, handWork, onKeep, onReplace, onCancel }) => {
  const title = forceReplace ? 'Map Not Supported' : `Which Map For ${modeName}?`;
  const body = forceReplace
    ? `${modeName} builds its own world, so it cannot run on your map.`
    : `Play ${modeName} on your map, or on its own map?`;
  const note = handWork ? 'Its own map takes the place of your Map Events and Custom Areas. Save them as a file first to keep them.' : 'Your custom map is kept either way.';
  return (
    <Modal title={title} icon={<TriangleAlert size={18} />} size="sm" z={120} onClose={onCancel}
      footer={close => <>
        {forceReplace
          ? <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close()}>Cancel</button>
          : <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close(onKeep)}>Use My Map</button>}
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close(onReplace)}>Use Its Own Map</button>
      </>}>
      <p className="k-modal-text">{body}</p>
      <p className="k-modal-text">{note}</p>
    </Modal>
  );
};
