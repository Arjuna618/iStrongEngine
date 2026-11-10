import React, { useState, useCallback, useRef, useLayoutEffect, useEffect, useReducer } from 'react';
import { GameLogic } from '../game/GameLogic';
import { ScrollArea } from './ui/ScrollArea';
import { getUiSizeSetting, setUiSizeSetting, UI_SIZE_MIN, UI_SIZE_MAX } from '../utils/useMenuScale';
import { getCumulativeZoom } from '../utils/zoomCompensation';
import { getTipsEnabled, setTipsEnabled, fireTip } from '../utils/tips';
import { Collapse, Reveal } from './kit/Collapse';
import { Group, ToggleRow, SliderRow, SelectRow, headerIcon } from './kit/kit';
import { HdAppWindow, HdImage03, HdListSetting, HdDeveloper } from './ui/icons';
import {
  RENDER_QUALITY_LEVELS, getRenderQualitySetting, setRenderQualitySetting,
  subscribeRenderQuality, getAutoChosenScale, type RenderQualitySetting,
} from '../utils/renderQuality';
import { GAME_THEMES, gameThemeId, gameThemeSync, setGameThemeSync, setGameThemePick, borderBlend, setBorderBlend, THEME_SYNC_LOCKED } from '../utils/gameTheme';
import { useGameThemeVersion } from '../utils/useGameTheme';
import { toggleTheme } from '../utils/theme';

const QUALITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  ...RENDER_QUALITY_LEVELS.map(l => ({ value: String(l), label: `${Math.round(l * 100)}%` })),
];

const GAME_THEME_OPTIONS: { value: string; label: string }[] = GAME_THEMES.map(t => ({ value: t.id, label: t.label }));


interface Props {
  logic: GameLogic | null;
  onUpdate: () => void;
  className?: string;
  developer?: boolean;
}

export const SandboxSettingsUI: React.FC<Props> = ({ logic, onUpdate, className, developer = false }) => {
  if (!logic) return null;
  const s = logic.state;

  const [uiSizeDraft, setUiSizeDraft] = useState<number>(() => Math.round(getUiSizeSetting() * 100));
  const uiSizeNow = Math.round(getUiSizeSetting() * 100);
  const uiSizeSeen = useRef(uiSizeNow);
  if (uiSizeSeen.current !== uiSizeNow) { uiSizeSeen.current = uiSizeNow; if (uiSizeDraft !== uiSizeNow) setUiSizeDraft(uiSizeNow); }
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const uiSizeRowRef = useRef<HTMLDivElement>(null);
  const uiSizeAnchorRef = useRef<{ scroller: HTMLElement; contentTop: number; frac: number } | null>(null);
  const commitUiSize = useCallback((v: number) => {
    const row = uiSizeRowRef.current;
    const scroller = row ? (row.closest('.tool-scrollbar') as HTMLElement | null) : null;
    if (row && scroller && scroller.clientHeight > 0) {
      const z = getCumulativeZoom(scroller) || 1;
      const localDelta = (row.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / z;
      uiSizeAnchorRef.current = {
        scroller,
        contentTop: scroller.scrollTop + localDelta,
        frac: localDelta / scroller.clientHeight,
      };
    }
    setUiSizeSetting(v / 100);
    setUiSizeDraft(Math.round(getUiSizeSetting() * 100));
  }, []);
  useLayoutEffect(() => {
    const a = uiSizeAnchorRef.current;
    if (!a) return;
    uiSizeAnchorRef.current = null;
    a.scroller.scrollTop = a.contentTop - a.frac * a.scroller.clientHeight;
  });

  const handleChange = useCallback((key: string, val: any) => {
    logic.updateState({ [key]: val });
    onUpdate();
  }, [logic, onUpdate]);

  const tipsOn = getTipsEnabled();
  const handleTipsToggle = useCallback((v: boolean) => {
    setTipsEnabled(v);
    bump();
  }, []);

  const [quality, setQuality] = useState<RenderQualitySetting>(() => getRenderQualitySetting());
  const [autoScale, setAutoScale] = useState<number>(() => getAutoChosenScale());
  useEffect(() => subscribeRenderQuality(() => {
    setQuality(getRenderQualitySetting());
    setAutoScale(getAutoChosenScale());
  }), []);
  const handleQualityChange = useCallback((v: string) => {
    setRenderQualitySetting(v === 'auto' ? 'auto' : parseFloat(v));
  }, []);

  useGameThemeVersion();
  const themeSync = gameThemeSync();
  const handleGameTheme = useCallback((v: string) => {
    const id = v === 'dark' ? 'dark' : 'light';
    if (!gameThemeSync()) { setGameThemePick(id); return; }
    if ((id === 'dark') !== document.documentElement.classList.contains('dark')) toggleTheme();
  }, []);
  const handleThemeSync = useCallback((v: boolean) => { setGameThemeSync(v); }, []);
  const handleBlend = useCallback((v: number) => { setBorderBlend(v / 100); }, []);

  return (
    <ScrollArea className={className} contentClassName="p-4 space-y-3 overflow-x-hidden">
      <div ref={uiSizeRowRef}>
        <Group title="Interface" icon={headerIcon(HdAppWindow)}>
          <SliderRow label="UI Size" value={uiSizeDraft}
            onChange={setUiSizeDraft}
            onCommit={commitUiSize}
            min={Math.round(UI_SIZE_MIN * 100)} max={Math.round(UI_SIZE_MAX * 100)}
            display={`${uiSizeDraft}%`}
            minLabel="Compact" maxLabel="Large"
            help="Scales the editor panels, menus and popups. Applies when you release the slider. Browser zoom (Ctrl+wheel) no longer resizes the app, use this instead. Saved across sessions. The in game HUD and canvas are unaffected." />
          <ToggleRow label="Show Tips" description="Short hints while you edit." checked={tipsOn} onChange={handleTipsToggle} />
        </Group>
      </div>

      <Group title="Graphics" icon={headerIcon(HdImage03)}>
        <SelectRow label="Game Theme" description="Colours of the game and its HUD."
          help={THEME_SYNC_LOCKED
            ? "The look of everything inside the game: the map, the tanks, the shapes and the in game HUD, and every picture of a tank, a shape or a map in the app. The game and the app share one theme, so picking one here changes the app's too, as the sun and moon button does."
            : "The look of everything inside the game: the map, the tanks, the shapes and the in game HUD, and every picture of a tank, a shape or a map in the app. The app's own windows keep the theme of the sun and moon button."}
          value={gameThemeId()} onChange={handleGameTheme} options={GAME_THEME_OPTIONS} />
        {!THEME_SYNC_LOCKED && <ToggleRow label="Sync Theme" description="The game and the app share one theme."
          help="On: the game always shows the app's theme, and changing either one changes both. Off: any game theme goes with any app theme."
          checked={themeSync} onChange={handleThemeSync} />}
        <SliderRow label="Border Blend" deferred value={Math.round(borderBlend() * 100)}
          onChange={handleBlend} min={0} max={100} format={(v) => `${Math.round(v)}%`}
          minLabel="Fill" maxLabel="Border"
          help="How far every outline in the game is mixed from its fill colour toward the border colour. Each theme has its own (Light 60%, Dark 100%), and picking a theme puts it back." />
        <SelectRow label="Render Quality"
          description="World resolution. Lower runs faster."
          note={quality === 'auto' ? <span className="k-note-one">Auto at {Math.round(autoScale * 100)}% now.</span> : undefined}
          help="Draws the world at a lower resolution for more speed on weaker machines. The HUD, minimap and text always stay sharp. Auto lowers quality only while the game struggles, and raises it back when it can."
          value={String(quality)} onChange={handleQualityChange} options={QUALITY_OPTIONS} />
      </Group>

      <Group title="In Match" icon={headerIcon(HdListSetting)}>
        <ToggleRow label="Show HP Bars" description="Health bars above every entity." checked={s.showHPBars} onChange={v => handleChange('showHPBars', v)} />
        <ToggleRow label="Show Player Names" description="Each tank's name above it." checked={s.showPlayerNames} onChange={v => handleChange('showPlayerNames', v)} />
        <ToggleRow label="Show Player Scores" description="Each tank's score under its name." checked={s.showPlayerScores} onChange={v => handleChange('showPlayerScores', v)} />
        <ToggleRow label="Show Kills Bar" description="The kills bar above your XP bar." checked={s.showKillsBar} onChange={v => handleChange('showKillsBar', v)} />
      </Group>

      <Collapse open={developer && logic.debugAccess()} gapInside reveal="self" ownAct>
        <Group title="Developer" icon={headerIcon(HdDeveloper)}>
          <ToggleRow label="Debug Mode" description="Debug tools in the pause menu." checked={s.debugMode} onChange={v => { if (!logic.debugAccess()) return; if (!v) { logic._debugPowersOff(); onUpdate(); return; } handleChange('debugMode', v); fireTip('debugEnabled'); }} />
          <Reveal when={s.debugMode && logic.debugAccess()}>
            <ToggleRow label="Show All Minimap" description="Reveals everything on the minimap."
              checked={s.showAllMinimap} onChange={v => handleChange('showAllMinimap', v)} />
          </Reveal>
        </Group>
      </Collapse>
    </ScrollArea>
  );
};
