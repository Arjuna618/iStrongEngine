import React, { useSyncExternalStore } from 'react';
import type { GameLogic } from '../game/GameLogic';
import { crashGuardStore } from '../game/crashGuard';
import { Modal } from './kit/Modal';
import { ShieldAlert } from './ui/icons';

export const CrashGuardPopup: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  const shown = useSyncExternalStore(crashGuardStore.subscribe, crashGuardStore.get, crashGuardStore.get);
  if (!shown) return null;
  return (
    <Modal title="The game almost crashed" icon={<ShieldAlert size={18} />} size="sm" z={80} closeLabel="Continue"
      onClose={() => { logic.crashGuardContinue(); }}
      footer={close => (
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close()}>Continue</button>
      )}>
      <p className="k-modal-text">The game was about to freeze because of what was spawned, and the crash guard stopped it in time. Continue removes everything the debug tools spawned, and the food shapes, and the game goes on. The map and the mode's own tanks stay.</p>
    </Modal>
  );
};
