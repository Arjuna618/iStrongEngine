import React, { useRef, useCallback } from 'react';

export function useBackdropClose(onClose: () => void) {
  const downOnBackdropRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    downOnBackdropRef.current = e.target === e.currentTarget;
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (downOnBackdropRef.current && e.target === e.currentTarget) {
      onClose();
    }
    downOnBackdropRef.current = false;
  }, [onClose]);

  return { onMouseDown, onMouseUp };
}
