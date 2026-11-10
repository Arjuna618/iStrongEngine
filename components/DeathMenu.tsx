import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLeave } from './kit/presence';
import { Fade } from './kit/Collapse';
import { RotateCcw, House, GameEngine, HdCaduceus } from './ui/icons';
import { GameLogic } from '../game/GameLogic';
import { TankPreview } from './TankPreview';
import { GameFloor } from './shared/GameFloor';
import { teamOverrideColor, RESPAWN_COOLDOWN_MS } from '../types';
import { GameMenuCard, GAME_MENU_W } from './shell/GameMenu';
import { useGameDark } from '../utils/useGameTheme';
import { anyForcedTeamLayer } from '../game/teamColourSwitch';
import { isTouchScreen } from '../utils/device';
import { useMenuScale, useModalMaxHeight, useModalMaxWidth } from '../utils/useMenuScale';

const DEATH_WIDE_W = 600;
const DEATH_WIDE_RATIO = 1.15;

interface Props {
  logic: GameLogic;
  isDark: boolean;
  fitScale: number;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onRespawn: () => void;
  onExit: () => void;
  fromPlayMenu: boolean;
  leaving?: boolean;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}

function shortDuration(ms: number): { parts: [number, string][]; hides: boolean } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const all: [number, string][] = [
    [Math.floor(total / 86400), 'd'], [Math.floor((total % 86400) / 3600), 'h'],
    [Math.floor((total % 3600) / 60), 'm'], [total % 60, 's'],
  ];
  let first = all.findIndex(([n]) => n > 0);
  if (first < 0) first = 3;
  const parts = all.slice(first, first + 2).filter(([n], i) => i === 0 || n > 0);
  return { parts, hides: all.slice(first + 2).some(([n]) => n > 0) };
}

function hasCause(kind: '' | 'tank' | 'shape' | 'zone' | 'area', name: string): boolean {
  return kind === 'zone' || kind === 'area' || ((kind === 'tank' || kind === 'shape') && !!name);
}

const StatTile: React.FC<{ label: string; tip?: string; children: React.ReactNode }> = ({ label, tip, children }) => (
  <div className="k-death-stat" data-tip={tip}>
    <span className="k-death-num">{children}</span>
    <span className="k-death-label">{label}</span>
  </div>
);

const CauseLine: React.FC<{ kind: '' | 'tank' | 'shape' | 'zone' | 'area'; name: string }> = ({ kind, name }) => {
  if (kind === 'area') return <>Destroyed in a <strong>Damaging Area</strong></>;
  if (kind === 'zone') {
    return <>Destroyed in <strong>enemy territory</strong></>;
  }
  return (
    <>
      {`Succumbed to ${/^[aeiou]/i.test(name) ? 'an' : 'a'} `}
      <strong>{name}</strong>
    </>
  );
};

export const DeathMenu: React.FC<Props> = ({
  logic, isDark, fitScale, cardRef, onRespawn, onExit, fromPlayMenu, leaving = false,
}) => {
  const s = logic.state;
  const scrimRef = useRef<HTMLDivElement>(null);
  useLeave(scrimRef, leaving, 'fade');
  useLeave(cardRef, leaving, 'pop');
  const respawnLevel = logic.respawnLevelNow();
  const [tickN, _tick] = useState(0);
  const cooldownMs = logic.respawnCooldownRemainingMs();
  const respawnHeld = cooldownMs > 0;
  useEffect(() => {
    if (!respawnHeld) return;
    const left = logic.respawnCooldownRemainingMs();
    const t = window.setTimeout(() => _tick(n => n + 1), (left % 1000 || 1000) + 5);
    return () => window.clearTimeout(t);
  }, [respawnHeld, tickN, logic]);
  const cooldownSecs = Math.ceil(cooldownMs / 1000);
  const closedForGood = logic.matchClosedForGood();
  const endTitle = logic.matchEndTitle();
  const refused = closedForGood ? '' : logic.respawnRefusedWhy();
  const rulesRun = logic.mapEventsRunning() && !closedForGood;
  useEffect(() => {
    if (!rulesRun) return;
    const t = window.setTimeout(() => _tick(n => n + 1), 1000);
    return () => window.clearTimeout(t);
  }, [rulesRun, tickN]);
  const [holdElapsedAtOpen] = useState(() => Math.max(0, RESPAWN_COOLDOWN_MS - cooldownMs));

  const deadTankConfig = useMemo(
    () => logic.getTankExportData(),
    [logic, s.currentTankFileName, s.playerDead],
  );
  const tankTypeName = logic.playerTankDisplayName() ?? logic.resolveTankDisplayName(null);
  const gameDarkNow = useGameDark();
  const deathColorOverride = teamOverrideColor(s.deathColorTeamIndex, gameDarkNow);
  const deathLayerTeam = deathColorOverride === undefined && anyForcedTeamLayer(deadTankConfig.bodyLayers) ? teamOverrideColor(logic.playerLayerTeamIndex(), gameDarkNow) : undefined;
  const showCause = hasCause(s.deathCauseKind, s.deathCauseName);
  const survived = shortDuration(s.deathSurvivalMs);
  const touch = isTouchScreen();
  const menuScale = useMenuScale();
  const maxW = useModalMaxWidth();
  const maxH = useModalMaxHeight();
  const wide = touch && maxW > maxH * DEATH_WIDE_RATIO;
  const [touchFit, setTouchFit] = useState(1);
  useLayoutEffect(() => {
    if (!touch) return;
    const el = cardRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (w <= 0 || h <= 0) return;
      const f = Math.min(1, maxW / w, maxH / h);
      setTouchFit(prev => (Math.abs(prev - f) < 0.004 ? prev : f));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [touch, maxW, maxH, wide, cardRef]);

  return (
    <div ref={scrimRef} className={`absolute inset-0 k-glass flex items-center justify-center z-50 animate-fadeIn ${leaving ? 'pointer-events-none' : 'pointer-events-auto'}`}>
      <div style={touch ? { zoom: menuScale * touchFit } : { transform: `scale(${fitScale})`, transformOrigin: 'center center', willChange: 'transform' }}>
        <GameMenuCard ref={cardRef} className={wide ? 'animate-scaleUp k-death-wide' : 'animate-scaleUp'} fitted={touch} width={touch ? Math.min(wide ? DEATH_WIDE_W : GAME_MENU_W, maxW) : GAME_MENU_W}
          icon={<HdCaduceus size={18} absoluteStrokeWidth />} title={endTitle !== '' ? endTitle : 'You Died'}
          subtitle={showCause ? <CauseLine kind={s.deathCauseKind} name={s.deathCauseName} /> : undefined}
          footer={<>
            <button type="button" className={`k-btn ${closedForGood ? 'k-btn-primary' : 'k-btn-secondary'} k-btn-lg`} onClick={onExit}>
              {fromPlayMenu
                ? <><House size={16} /> Main Menu</>
                : <><GameEngine size={16} /> Game Engine</>}
            </button>
            <Fade when={!closedForGood} className="k-death-respawn"><button type="button" className="k-btn k-btn-primary k-btn-lg k-hold" onClick={onRespawn} disabled={respawnHeld || refused !== ''}
              aria-label={respawnHeld ? `Respawn in ${cooldownSecs}` : 'Respawn'}>
              {respawnHeld && <span className="k-hold-fill" aria-hidden
                style={{ animationDuration: `${RESPAWN_COOLDOWN_MS}ms`, animationDelay: `-${holdElapsedAtOpen}ms` }} />}
              <RotateCcw size={16} />
              <span className="tabular-nums">{respawnHeld ? `Respawn in ${cooldownSecs}` : 'Respawn'}</span>
            </button></Fade>
          </>}>
          <div className="k-gm-card k-gm-info k-death-card">
            <GameFloor className="k-death-portrait" cell={16}>
              <TankPreview tankConfig={deadTankConfig} size={120} animate boundsFit={0.6} colorOverride={deathColorOverride} layerTeamColor={deathLayerTeam} />
            </GameFloor>
            <div className="k-death-who">
              <span className="k-death-name truncate">{logic.getPlayerDisplayName()}</span>
              <span className="k-death-meta">
                <span className="k-death-tank truncate">{tankTypeName}</span>
                <span className="k-count">Level {s.deathLevel}</span>
                {logic.mevWaveReached() > 0 ? <span className="k-count">Wave {logic.mevWaveReached()}</span> : null}
              </span>
            </div>
            <div className="k-death-stats">
              <StatTile label="Kills">{s.deathKills}</StatTile>
              <StatTile label="Shapes destroyed">{s.deathFoodKills}</StatTile>
              <StatTile label="Survived" tip={survived.hides ? formatDuration(s.deathSurvivalMs) : undefined}>
                {survived.parts.map(([n, u], i) => (
                  <React.Fragment key={u}>{i > 0 ? ' ' : ''}{n}<span className="k-death-unit">{u}</span></React.Fragment>
                ))}
              </StatTile>
            </div>
          </div>

          <p className="k-hint text-center">
            {closedForGood ? <>The arena is closed.</> : refused !== '' ? <>{refused}</> : respawnLevel > 0
              ? <>You keep enough progress to return at <span className="font-medium text-[var(--text-primary)]">level {respawnLevel}</span>.</>
              : <>Too early to keep progress: you start again at level 0.</>}
          </p>
        </GameMenuCard>
      </div>
    </div>
  );
};
