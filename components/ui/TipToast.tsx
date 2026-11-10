import React, { useEffect } from 'react';
import { TIP_DISPLAY_MS, dismissTip, registerTipToastHost } from '../../utils/tips';
import { showTipToast, clearTipToasts, setToastArea } from './Toast';

const LEFT_RAIL_W = 60;
const RIGHT_PANEL_W = 323;
const EDITOR_GAP = 52;

export const TipToastHost: React.FC = () => {
  useEffect(() => {
    setToastArea({ left: LEFT_RAIL_W, right: RIGHT_PANEL_W, gap: EDITOR_GAP });
    const unregister = registerTipToastHost(
      (tip) => showTipToast(tip.text, TIP_DISPLAY_MS, () => dismissTip(tip.id)),
      clearTipToasts,
    );
    return () => {
      unregister();
      clearTipToasts();
      setToastArea(null);
    };
  }, []);
  return null;
};
