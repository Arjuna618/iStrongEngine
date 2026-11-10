import React from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { renderSlider } from './uiHelpers';
import {
  presetXformShown, presetXformWithDistance, presetXformWithTurn, presetXformClean,
  PRESET_SIZE_MIN, PRESET_SIZE_MAX, type PresetXform,
} from '../../utils/presetGroupXform';

export const PresetGroupControls: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  const xf = presetXformClean(logic.state.presetPreviewXform);
  const v = presetXformShown(xf);
  const set = (p: Partial<PresetXform>) => logic.setPresetPreviewXform(p);
  const span = (n: number) => Math.max(2, Math.ceil(Math.abs(n)));
  const name = logic.presetPreviewName;
  return (
    <>
      <p className="k-hint">{name ? `${name}: ` : ''}These move, turn and size all its parts together until you place it.</p>
      {renderSlider('X Offset', v.x, (x) => set({ x }), -span(v.x), span(v.x), 'any', false, 'Moves the whole custom turret along its own direction.')}
      {renderSlider('Y Offset', v.y, (y) => set({ y }), -span(v.y), span(v.y), 'any', false, 'Moves the whole custom turret sideways.')}
      {renderSlider('Distance From Center', v.distance, (d) => logic.setPresetPreviewXform(presetXformWithDistance(xf, d)), 0, span(v.distance), 'any', false,
        'Moves the whole custom turret out from the center of the body, along the way it is turned.')}
      {renderSlider('Turret Orientation', v.turnDeg, (deg) => logic.setPresetPreviewXform(presetXformWithTurn(xf, deg)), 0, 360, 1, false,
        'Turns the whole custom turret around the body (degrees). Its parts keep their places on it.')}
      {renderSlider('Size', v.size, (size) => set({ size }), PRESET_SIZE_MIN, PRESET_SIZE_MAX, 'any', false,
        'Makes all its parts bigger or smaller together, so it keeps its look. 1 is the size it was made at.')}
    </>
  );
};
