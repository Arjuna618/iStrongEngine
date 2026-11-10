import React from 'react';
import { useGameDark } from '../../utils/useGameTheme';
import { cmHex, CM, CM_USE } from '../../utils/colorMap';

export function gameGridLine(dark: boolean): string {
  const n = parseInt(cmHex(CM.GRID, dark, CM_USE.GENERAL).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${dark ? 0.07 : 0.09})`;
}

export const GameFloor: React.FC<{ className?: string; style?: React.CSSProperties; cell?: number; children?: React.ReactNode }> = ({ className, style, cell = 14, children }) => {
  const dark = useGameDark();
  const floor = cmHex(CM.BACKGROUND, dark, CM_USE.GENERAL);
  const line = gameGridLine(dark);
  return (
    <div className={className} style={{
      backgroundColor: floor,
      backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      backgroundSize: `${cell}px ${cell}px`, backgroundPosition: 'center center', ...style,
    }}>
      {children}
    </div>
  );
};
