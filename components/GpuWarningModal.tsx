import React from 'react';
import { TriangleAlert } from './ui/icons';
import { Modal } from './kit/Modal';
import { SMALL_FIX } from '../game/smallFixSwitch';

interface Props {
  status: 'software' | 'unavailable';
  renderer: string;
  onDismiss: () => void;
}

export const GpuWarningModal: React.FC<Props> = ({ status, renderer, onDismiss }) => (
  <Modal title={status === 'software' ? 'Software Rendering Detected' : 'GPU Acceleration Unavailable'}
    icon={<TriangleAlert size={18} />} size="sm" width={420} closeLabel="Dismiss" onClose={onDismiss}
    footer={(close) => <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={close}>I Understand, Continue Anyway</button>}>
    <div className="k-stack">
      <p className="k-modal-text">
        {status === 'software'
          ? 'Your browser is using software rendering instead of your GPU. This causes severe performance issues (low FPS, stuttering).'
          : SMALL_FIX.R742 !== 0
            ? 'Your browser cannot use WebGL 2, which the game needs to draw a match. The menus and the editor open, but a match will show no tanks or shapes.'
            : 'Your browser does not support WebGL, which is required for GPU accelerated rendering. Performance will be severely degraded.'}
      </p>
      <span className="k-subhead">How to fix:</span>
      {status === 'software' ? (
        <ol className="k-modal-text list-decimal list-inside space-y-1.5">
          <li>Close all browser windows and reopen the browser</li>
          <li>
            If the issue persists, enable hardware acceleration:
            <div className="mt-1 ml-5 space-y-0.5 text-[var(--text-tertiary)]">
              <div><span className="font-medium text-[var(--text-secondary)]">Chrome/Brave:</span> Settings &gt; System &gt; Use hardware acceleration</div>
              <div><span className="font-medium text-[var(--text-secondary)]">Edge:</span> Settings &gt; System &gt; Use hardware acceleration</div>
              <div><span className="font-medium text-[var(--text-secondary)]">Firefox:</span> Settings &gt; Performance &gt; Use hardware acceleration</div>
            </div>
          </li>
          <li>After enabling, restart the browser completely</li>
        </ol>
      ) : (
        <ul className="k-modal-text list-disc list-inside space-y-1.5">
          <li>Use a modern browser (Chrome, Edge, or Firefox)</li>
          <li>Ensure hardware acceleration is enabled in browser settings</li>
          <li>Update your graphics drivers</li>
        </ul>
      )}
      {renderer && (
        <div>
          <span className="text-xs text-[var(--text-tertiary)]">Detected renderer: </span>
          <code className="text-[11px] bg-[var(--surface-inset)] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded font-mono">{renderer}</code>
        </div>
      )}
    </div>
  </Modal>
);
