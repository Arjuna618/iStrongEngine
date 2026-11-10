import React, { useMemo, useRef, useState } from 'react';
import { useSwapStage } from './kit/motion';
import { Reveal, SwapBox } from './kit/Collapse';
import type { BaseShapeConfig, ShapeSpawnConfig } from '../types';
import { DEFAULT_SHAPE_SPAWN_CONFIG } from '../types';
import { SHAPES_ARRAS, SHAPE_SPAWN_PLAN } from '../game/shapesSwitch';
import { applySpawnProfile, SPAWN_PROFILES, SPAWN_PROFILE_IDS } from '../game/spawnPlan';
import { Shapes, RotateCcw } from './ui/icons';
import { Modal } from './kit/Modal';
import { SliderRow, Switch, ToggleRow, SearchField, Group, IconButton, PickRow, Chip } from './kit/kit';
import { InlineMotion } from './kit/TagLine';
import {
  BASE_SHAPES, BASE_SHAPE_ORDER, SCALED_VARIANTS, SPECIAL_SHAPES,
  CRASHER_DEFS, POLYHEDRA_DEFS,
  RARITY_MULTIPLIERS, RARITY_LABELS, RARITY_COLORS, ALL_RARITIES,
  LABY_LABELS, categoryRateMultiplier,
  computeRarityTierProbabilities, RARITY_P_LEN,
  SHAPE_DEFINITIONS, SHAPE_DEFS_BY_CATEGORY,
  type BaseShape,
} from '../game/ShapeRegistry';

function nestedScore(baseKey: string, tier: number, fallback: number): number {
  const d = (SHAPE_DEFS_BY_CATEGORY.get('laby') ?? []).find((x) => x.rarity === 'normal' && x.baseShape === baseKey && x.labyLevel === tier);
  return d ? d.defaultXpValue : fallback;
}
import { SENTRY_TANK_CONFIGS, SENTINEL_TANK_CONFIGS } from '../game/SentryConfigs';
import { TankPreview } from './TankPreview';
import { GameFloor } from './shared/GameFloor';
import { ShapePreview, AnimatedShapePreview } from './shared/ShapePreviewComponents';
import { useModalMaxHeight } from '../utils/useMenuScale';
import { HelpTooltip } from './shared/HelpTooltip';

const BASE_SHAPE_LABELS: Record<string, string> = {
  egg: 'Egg (Circle)', triangle: 'Triangle', square: 'Square', pentagon: 'Pentagon', hexagon: 'Hexagon',
};
const SCALED_VARIANT_LABELS: Record<string, string> = {
  betaPentagon: 'Beta Pentagon', alphaPentagon: 'Alpha Pentagon',
  odHexagon: 'OD Hexagon', odSeptagon: 'OD Septagon', odOctagon: 'OD Octagon', odNonagon: 'OD Nonagon',
};
const SPECIAL_LABELS: Record<string, string> = { gem: 'Gem', jewel: 'Jewel' };
const CRASHER_LABELS: Record<string, string> = {
  crasherEgg: 'Crasher Egg', crasherTriangle: 'Crasher Triangle', crasherSquare: 'Crasher Square',
  crasherPentagon: 'Crasher Pentagon', crasherHexagon: 'Crasher Hexagon', crasher: 'Crasher', megaCrasher: 'Mega Crasher',
};
const SENTRY_LABELS: Record<string, string> = {
  sentrySwarm: 'Swarm Sentry', sentryGun: 'Gun Sentry', sentryTrap: 'Trap Sentry',
  sentinelSwarm: 'Swarm Sentinel', sentinelGun: 'Gun Sentinel', sentinelTrap: 'Trap Sentinel',
  shinySentrySwarm: 'Shiny Swarm Sentry', shinySentryGun: 'Shiny Gun Sentry', shinySentryTrap: 'Shiny Trap Sentry',
};
const SENTINEL_LABELS: Record<string, string> = {
  sentinelMinigun: 'Minigun Sentinel', sentinelLauncher: 'Missile Sentinel', sentinelCrossbow: 'Crossbow Sentinel',
};
const POLYHEDRA_LABELS: Record<string, string> = { cube: 'Cube', dodecahedron: 'Dodecahedron', icosahedron: 'Icosahedron' };
const RARE_KEYS = ALL_RARITIES.filter(r => r !== 'normal');
const LABY_TIERS = [1, 2, 3, 4, 5];

type CatId = 'profile' | 'base' | 'scaled' | 'rarities' | 'nested' | 'special' | 'crashers' | 'sentries' | 'sentinels' | 'polyhedra';
const CATEGORIES: readonly { id: CatId; title: string }[] = [
  ...(SHAPE_SPAWN_PLAN !== 0 ? [{ id: 'profile' as CatId, title: 'Spawn Profile' }] : []),
  { id: 'base', title: 'Base Shapes' }, { id: 'scaled', title: 'Scaled Variants' }, { id: 'rarities', title: 'Rarities' },
  { id: 'nested', title: 'Nested / Laby' }, { id: 'special', title: 'Special' }, { id: 'crashers', title: 'Crashers' },
  { id: 'sentries', title: 'Sentries' }, { id: 'sentinels', title: 'Sentinels' }, { id: 'polyhedra', title: 'Polyhedra' },
];

const SRow: React.FC<{
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
  suffix?: string; display?: string; leftLabel?: string; rightLabel?: string; tooltip?: string;
}> = ({ label, value, onChange, min, max, step = 1, suffix, display, leftLabel, rightLabel, tooltip }) => (
  <SliderRow label={label} value={value} onChange={onChange} min={min} max={max} step={step} help={tooltip}
    display={display ?? (suffix ? `${Math.round(value * 100) / 100}${suffix}` : String(Math.round(value * 100) / 100))}
    minLabel={leftLabel} maxLabel={rightLabel} />
);

const RateSlider: React.FC<{ label: string; level: number; onChange: (v: number) => void; tooltip?: string }> = ({ label, level, onChange, tooltip }) => {
  const multStr = parseFloat(categoryRateMultiplier(level).toFixed(4));
  return <SRow label={`${label} (${multStr}x)`} value={level} onChange={onChange} min={-10} max={10} step={1}
    leftLabel="10x less" rightLabel="10x more" tooltip={tooltip} />;
};

const _rarityOddsBuf = new Float64Array(RARITY_P_LEN);
const formatOdds = (p: number): string => {
  if (p <= 0) return 'off';
  const n = 1 / p;
  if (n < 1.05) return '1/1';
  const rounded = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return `1/${rounded.toLocaleString()}`;
};
const RarityOddsReadout: React.FC<{ cfg: ShapeSpawnConfig }> = ({ cfg }) => {
  const total = computeRarityTierProbabilities(cfg, _rarityOddsBuf);
  const p = _rarityOddsBuf;
  return (
    <div className="flex flex-wrap items-center gap-y-1.5 tabular-nums">
      <InlineMotion items={[
        { key: 'shiny', node: <Chip>Shiny {formatOdds(p[4])}</Chip> },
        { key: 'legendary', node: <Chip>Legendary {formatOdds(p[3])}</Chip> },
        { key: 'shadow', node: <Chip>Shadow {formatOdds(p[2])}</Chip> },
        { key: 'rainbow', node: <Chip>Rainbow {formatOdds(p[1])}</Chip> },
        { key: 'trans', node: <Chip>Trans {formatOdds(p[0])}</Chip> },
        ...(total >= 0.999 ? [{ key: 'all', node: <Chip>Every shape is rare</Chip> }] : []),
      ]} />
    </div>
  );
};

const Tile: React.FC<{
  label: string; preview: React.ReactNode;
  info?: string[];
  checked: boolean; onChange: (v: boolean) => void;
  selected?: boolean; onPick?: () => void; onReset?: () => void;
}> = ({ label, preview, info, checked, onChange, selected, onPick, onReset }) => (
  <div className={`k-shape-tile${selected ? ' k-shape-tile-on' : ''}${onPick ? ' cursor-pointer' : ''}`} onClick={onPick}
    role={onPick ? 'button' : undefined} aria-pressed={onPick ? !!selected : undefined}>
    <GameFloor className="k-shape-tile-art k-tank-floor">{preview}</GameFloor>
    <span className="min-w-0 flex-1">
      <span className="k-card-title truncate block">{label}</span>
      {info && <span className="k-shape-tile-tags">{info.map((t, i) => <Chip key={i}>{t}</Chip>)}</span>}
    </span>
    <span className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
      {onReset && <IconButton label="Reset to default" size="sm" onClick={onReset}><RotateCcw size={13} /></IconButton>}
      <Switch checked={checked} onChange={onChange} label={label} />
    </span>
  </div>
);

interface Props {
  cfg: ShapeSpawnConfig;
  updateSpawnCfg: (patch: Partial<ShapeSpawnConfig>) => void;
  areaName: string;
  onClose: () => void;
}

export const FarmableShapesWindow: React.FC<Props> = ({ cfg, updateSpawnCfg, areaName, onClose }) => {
  const [cat, setCat] = useState<CatId>('base');
  const [searchQuery, setSearchQuery] = useState('');
  const searchingNow = searchQuery.trim() !== '';
  const stage = useSwapStage<string>(searchingNow ? 'search' : cat);
  const shownSearching = stage.shown === 'search';
  const shownCat = (shownSearching ? cat : stage.shown) as CatId;
  const lastQ = useRef(searchQuery);
  if (searchingNow) lastQ.current = searchQuery;
  const shownQuery = shownSearching ? (searchingNow ? searchQuery : lastQ.current) : '';
  const [selectedBase, setSelectedBase] = useState<string>('egg');
  const maxH = useModalMaxHeight();
  const bodyH = Math.max(160, Math.min(780, maxH - 58));

  const updateBaseShape = (shape: string, field: keyof BaseShapeConfig, val: number | string | boolean) => {
    const newShapes = { ...cfg.baseShapes };
    newShapes[shape] = { ...newShapes[shape], [field]: val };
    updateSpawnCfg({ baseShapes: newShapes });
  };
  const resetBaseShape = (shape: string) => {
    const def = DEFAULT_SHAPE_SPAWN_CONFIG().baseShapes[shape];
    if (!def) return;
    const newShapes = { ...cfg.baseShapes };
    newShapes[shape] = { ...def };
    updateSpawnCfg({ baseShapes: newShapes });
  };
  const toggleScaled = (key: string, v: boolean) => {
    const newSV = { ...cfg.scaleVariants };
    newSV[key] = { ...newSV[key], enabled: v };
    updateSpawnCfg({ scaleVariants: newSV });
  };
  const toggleRarity = (rarity: string, enabled: boolean) => {
    updateSpawnCfg({ rarityEnabled: { ...cfg.rarityEnabled, [rarity]: enabled } });
  };
  const toggleLabyShape = (tier: number, baseShape: string, enabled: boolean) => {
    const newLaby = { ...cfg.labyEnabled };
    newLaby[tier] = { ...newLaby[tier], [baseShape]: enabled };
    updateSpawnCfg({ labyEnabled: newLaby });
  };
  const toggleLabyTier = (tier: number, enabled: boolean) => {
    const newLaby = { ...cfg.labyEnabled };
    const tierShapes: Record<string, boolean> = {};
    for (const key of BASE_SHAPE_ORDER) tierShapes[key] = enabled;
    newLaby[tier] = tierShapes;
    updateSpawnCfg({ labyEnabled: newLaby });
  };
  const pickProfile = (id: string) => { updateSpawnCfg(applySpawnProfile(structuredClone(cfg), id)); };
  const updatePlan = (patch: Partial<NonNullable<ShapeSpawnConfig['plan']>>) => { if (cfg.plan) updateSpawnCfg({ plan: { ...cfg.plan, ...patch } }); };
  const toggleSpecial = (key: string, enabled: boolean) => {
    updateSpawnCfg({ specialEnabled: { ...cfg.specialEnabled, [key]: enabled } });
  };

  const matchesSearch = (name: string) => !shownQuery || name.toLowerCase().includes(shownQuery.toLowerCase());

  const tilesOf = (id: CatId): React.ReactNode[] => {
    switch (id) {
      case 'profile': return SPAWN_PROFILE_IDS.filter(pid => matchesSearch(SPAWN_PROFILES[pid].label)).map(pid => {
        const p = SPAWN_PROFILES[pid];
        const tags = p.noFood ? ['No food'] : [p.nestSize > 0 ? 'Nest ' + p.nestSize + '%' : 'No nest', 'Shiny 1/' + p.shiny.toLocaleString()];
        return <Tile key={pid} label={p.label} checked={cfg.plan?.profile === pid} onChange={v => { if (v) pickProfile(pid); }}
          preview={<ShapePreview sides={5} color={BASE_SHAPES.pentagon.color} size={36} />} info={tags} onPick={() => pickProfile(pid)} selected={cfg.plan?.profile === pid} />;
      });
      case 'base': return BASE_SHAPE_ORDER.filter(shape => matchesSearch(BASE_SHAPE_LABELS[shape] || shape)).map(shape => {
        const bCfg = cfg.baseShapes[shape];
        if (!bCfg) return null;
        return <Tile key={shape} label={BASE_SHAPE_LABELS[shape]} checked={bCfg.enabled} onChange={v => updateBaseShape(shape, 'enabled', v)}
          preview={<ShapePreview sides={BASE_SHAPES[shape].sides} color={BASE_SHAPES[shape].color} size={36} />}
          info={[`HP ${Math.round(bCfg.hp)}`, `Size ${Math.round(bCfg.size)}`, `Spawn ${bCfg.spawnWeight === 0 ? 'Off' : bCfg.spawnWeight}`]}
          selected={shape === selectedBase} onPick={() => { setSelectedBase(shape); setCat('base'); }} onReset={() => resetBaseShape(shape)} />;
      });
      case 'scaled': return Object.entries(SCALED_VARIANTS).filter(([key]) => matchesSearch(SCALED_VARIANT_LABELS[key] || key)).map(([key, def]) => (
        <Tile key={key} label={SCALED_VARIANT_LABELS[key] || key} checked={cfg.scaleVariants[key]?.enabled ?? false} onChange={v => toggleScaled(key, v)}
          preview={<ShapePreview sides={def.sides} color={def.color} size={36} />} info={[`Size ${def.size}`]} />
      ));
      case 'rarities': return RARE_KEYS.filter(r => matchesSearch(RARITY_LABELS[r])).map(rarity => {
        const mult = RARITY_MULTIPLIERS[rarity];
        const isAnimated = rarity === 'rainbow' || rarity === 'trans';
        return <Tile key={rarity} label={RARITY_LABELS[rarity]} checked={cfg.rarityEnabled[rarity] ?? false} onChange={v => toggleRarity(rarity, v)}
          preview={isAnimated
            ? <AnimatedShapePreview sides={5} animationType={rarity as 'rainbow' | 'trans'} size={36} />
            : <ShapePreview sides={5} color={RARITY_COLORS[rarity] || '#888'} size={36} />}
          info={[`HP ${mult.hpMult}x`, `XP ${mult.xpMult}x`]} />;
      });
      case 'nested': return LABY_TIERS.map(tier => {
        const tierLabel = LABY_LABELS[tier] || `Tier ${tier}`;
        const tierShapes = BASE_SHAPE_ORDER.filter(k => matchesSearch(tierLabel) || matchesSearch(`${tierLabel} ${BASE_SHAPE_LABELS[k] || k}`));
        if (tierShapes.length === 0) return null;
        const tierRecord = cfg.labyEnabled[tier] ?? {};
        const allOn = BASE_SHAPE_ORDER.every(k => tierRecord[k]);
        return (
          <div key={tier} className="k-shape-tier">
            <label className="k-row k-row-click">
              <span className="k-row-text">
                <span className="k-row-label"><span className="k-row-lead"><HelpTooltip text={`Turns every ${tierLabel} shape on or off at once.`} /></span><span className="truncate [font-weight:var(--fw-head)]">Toggle All {tierLabel}</span></span>
                <span className="k-row-desc">{tier} inner {tier === 1 ? 'layer' : 'layers'}</span>
              </span>
              <Switch checked={allOn} onChange={v => toggleLabyTier(tier, v)} label={`Toggle All ${tierLabel}`} />
            </label>
            <div className="k-shape-grid">
              {tierShapes.map(baseKey => {
                const bs = BASE_SHAPES[baseKey as BaseShape];
                return <Tile key={`${tier}-${baseKey}`} label={`${tierLabel} ${BASE_SHAPE_LABELS[baseKey] || baseKey}`}
                  checked={tierRecord[baseKey] ?? false} onChange={v => toggleLabyShape(tier, baseKey, v)}
                  preview={<ShapePreview sides={bs.sides} color={bs.color} size={36} labyLevel={tier} />}
                  info={[`XP ${Math.round(nestedScore(baseKey, tier, bs.xpValue * Math.pow(5, tier)))}`]} />;
              })}
            </div>
          </div>
        );
      });
      case 'special': return Object.entries(SPECIAL_SHAPES).filter(([key]) => matchesSearch(SPECIAL_LABELS[key] || key)).map(([key, def]) => (
        <Tile key={key} label={SPECIAL_LABELS[key] || key} checked={cfg.specialEnabled[key] ?? false} onChange={v => toggleSpecial(key, v)}
          preview={<ShapePreview sides={def.sides} color={def.color} size={36} />} info={[`XP ${SHAPE_DEFINITIONS.get(key)?.defaultXpValue ?? def.xpValue}`]} />
      ));
      case 'crashers': return Object.entries(CRASHER_DEFS).filter(([key]) => matchesSearch(CRASHER_LABELS[key] || key)).map(([key, def]) => (
        <Tile key={key} label={CRASHER_LABELS[key] || key} checked={cfg.specialEnabled[key] ?? true} onChange={v => toggleSpecial(key, v)}
          preview={<ShapePreview sides={def.sides} color={def.color} size={36} />} />
      ));
      case 'sentries': return Object.entries(SENTRY_TANK_CONFIGS).filter(([key]) => matchesSearch(SENTRY_LABELS[key] || key)).map(([key, { label, tankConfig }]) => (
        <Tile key={key} label={SENTRY_LABELS[key] || label} checked={cfg.specialEnabled[key] ?? false} onChange={v => toggleSpecial(key, v)}
          preview={<TankPreview tankConfig={tankConfig} size={40} animate={false} boundsFit={0.6} />} />
      ));
      case 'sentinels': return Object.entries(SENTINEL_TANK_CONFIGS).filter(([key]) => matchesSearch(SENTINEL_LABELS[key] || key)).map(([key, { label, tankConfig }]) => (
        <Tile key={key} label={SENTINEL_LABELS[key] || label} checked={cfg.specialEnabled[key] ?? false} onChange={v => toggleSpecial(key, v)}
          preview={<TankPreview tankConfig={tankConfig} size={40} animate={false} boundsFit={0.6} />} />
      ));
      case 'polyhedra': return Object.entries(POLYHEDRA_DEFS).filter(([key]) => matchesSearch(POLYHEDRA_LABELS[key] || key)).map(([key, def]) => (
        <Tile key={key} label={POLYHEDRA_LABELS[key] || key} checked={cfg.specialEnabled[key] ?? false} onChange={v => toggleSpecial(key, v)}
          preview={<ShapePreview sides={0} color={def.color} size={36} isPolyhedron polyhedronType={key} />} info={[`HP ${def.hp.toLocaleString()}`]} />
      ));
    }
  };

  const counts = useMemo((): Record<CatId, string> => {
    const on = (keys: string[], read: (k: string) => boolean) => `${keys.filter(read).length}/${keys.length}`;
    let lOn = 0;
    for (const t of LABY_TIERS) for (const k of BASE_SHAPE_ORDER) if (cfg.labyEnabled[t]?.[k]) lOn++;
    return {
      profile: cfg.plan ? (SPAWN_PROFILES[cfg.plan.profile]?.label ?? cfg.plan.profile) : 'none',
      base: on([...BASE_SHAPE_ORDER], k => !!cfg.baseShapes[k]?.enabled),
      scaled: on(Object.keys(SCALED_VARIANTS), k => !!cfg.scaleVariants[k]?.enabled),
      rarities: on(RARE_KEYS, k => !!cfg.rarityEnabled[k]),
      nested: `${lOn}/${LABY_TIERS.length * BASE_SHAPE_ORDER.length}`,
      special: on(Object.keys(SPECIAL_SHAPES), k => !!cfg.specialEnabled[k]),
      crashers: on(Object.keys(CRASHER_DEFS), k => cfg.specialEnabled[k] ?? true),
      sentries: on(Object.keys(SENTRY_TANK_CONFIGS), k => !!cfg.specialEnabled[k]),
      sentinels: on(Object.keys(SENTINEL_TANK_CONFIGS), k => !!cfg.specialEnabled[k]),
      polyhedra: on(Object.keys(POLYHEDRA_DEFS), k => !!cfg.specialEnabled[k]),
    };
  }, [cfg]);

  const selectedCfg = cfg.baseShapes[selectedBase];
  const selectedSides = BASE_SHAPES[selectedBase as BaseShape]?.sides ?? 0;

  const settingsOf = (id: CatId): React.ReactNode => {
    switch (id) {
      case 'profile': return cfg.plan ? (<>
        <Group title="Where Shapes Are Born" level={3}>
          <SRow label="Nest Size" value={cfg.plan.nestSize} onChange={v => updatePlan({ nestSize: Math.round(v) })} min={0} max={100} suffix="%"
            display={cfg.plan.nestSize === 0 ? 'No nest' : `${cfg.plan.nestSize}%`} leftLabel="No nest" rightLabel="Whole map"
            tooltip="A hidden square in the middle of the area, this share of its width and height. Only the shapes picked for the nest are born in it, and nothing else." />
          <SRow label="Nest Pace" value={cfg.plan.nestPace ?? 0} onChange={v => updatePlan({ nestPace: Math.round(v * 100) / 100 })} min={0} max={20} step={0.01}
            display={(cfg.plan.nestPace ?? 0) > 0 ? `${cfg.plan.nestPace} a minute` : 'Off'} leftLabel="Off" rightLabel="Fast"
            tooltip="New shapes born in the nest each minute, for every 1,000 by 1,000 units of it, while no other tank stands near it. Off: the nest takes its Nest Share of the shapes born instead." />
          <Reveal when={!((cfg.plan.nestPace ?? 0) > 0)}>{() => (
            <SRow label="Nest Share" value={cfg.plan!.nestShare} onChange={v => updatePlan({ nestShare: Math.round(v) })} min={0} max={100} suffix="%"
              leftLabel="None" rightLabel="All"
              tooltip="How many of the shapes born go to the nest, in percent. The rest are born outside it." />
          )}</Reveal>
          <SRow label="Nest Cap" value={cfg.plan.nestCap} onChange={v => updatePlan({ nestCap: Math.round(v) })} min={0} max={100} step={1}
            leftLabel="None" rightLabel="Many"
            tooltip="The most shapes born in the nest that can be alive at once. They count inside the Food Cap too." />
          <SRow label="Food Cap" value={cfg.foodCap} onChange={v => updateSpawnCfg({ foodCap: Math.round(v) })} min={0} max={500} step={1}
            leftLabel="None" rightLabel="Many"
            tooltip="The most food shapes alive at once in this area: every shape born here, giants and crashers included." />
          <ToggleRow label="No Food" help="No food shapes are born in this area at all." checked={cfg.plan.noFood} onChange={v => updatePlan({ noFood: v })} />
        </Group>
        <Reveal when={(cfg.plan.nestPace ?? 0) > 0}>{() => {
          const c = cfg.plan!.crowd ?? { on: false, enemyFirst: 0, enemyNext: 0, enemyKeep: 0, teamFirst: 0, teamKeep: 0, margin: 0, kinds: {} };
          const setCrowd = (patch: Partial<typeof c>) => updatePlan({ crowd: { ...c, ...patch } });
          return (
            <Group title="Players Near The Nest" level={3}>
              <ToggleRow label="Players Near The Nest Boost It" checked={c.on} onChange={v => setCrowd({ on: v })}
                help="Tanks near the nest make it busier: shapes are born there faster, with more hexagons, more layers and more rare shapes. Bosses of the boss system never count." />
              <Reveal when={c.on}>{() => (<>
                <SRow label="First Enemy Pair" value={c.enemyFirst * 100} onChange={v => setCrowd({ enemyFirst: Math.round(v) / 100 })} min={0} max={300} step={1}
                  display={`+${Math.round(c.enemyFirst * 100)}%`} leftLabel="Nothing" rightLabel="Much more"
                  tooltip="Two tanks that are enemies of each other near the nest: the nest makes this much more, and its hexagons, layers and rare shapes are this much likelier." />
                <SRow label="Second Enemy Pair" value={c.enemyNext * 100} onChange={v => setCrowd({ enemyNext: Math.round(v * 10) / 1000 })} min={0} max={100} step={0.1}
                  display={`+${Math.round(c.enemyNext * 1000) / 10}%`} leftLabel="Nothing" rightLabel="Much more"
                  tooltip="What a second pair of enemies near the nest adds on top of the first." />
                <SRow label="Each Next Enemy Pair Keeps" value={c.enemyKeep * 100} onChange={v => setCrowd({ enemyKeep: Math.round(v) / 100 })} min={0} max={95} step={1}
                  suffix="%" leftLabel="Nothing" rightLabel="Almost all"
                  tooltip="Each pair after the second adds this share of what the pair before it added, so the first pairs matter most." />
                <SRow label="First Teammate" value={c.teamFirst * 100} onChange={v => setCrowd({ teamFirst: Math.round(v * 10) / 1000 })} min={0} max={100} step={0.1}
                  display={`+${Math.round(c.teamFirst * 1000) / 10}%`} leftLabel="Nothing" rightLabel="Much more"
                  tooltip="A tank near the nest on the same side as one already counted adds this." />
                <SRow label="Each Next Teammate Keeps" value={c.teamKeep * 100} onChange={v => setCrowd({ teamKeep: Math.round(v) / 100 })} min={0} max={95} step={1}
                  suffix="%" leftLabel="Nothing" rightLabel="Almost all"
                  tooltip="Each teammate after the first adds this share of what the one before added." />
                <SRow label="How Far Round The Nest Counts" value={c.margin} onChange={v => setCrowd({ margin: Math.round(v) })} min={0} max={200} step={1}
                  suffix="%" leftLabel="Only inside" rightLabel="Far"
                  tooltip="How far round the nest a tank still counts, as a share of half the nest's size." />
                <ToggleRow label="Hexagons Rise Most" checked={(c.kinds.hexagon ?? 0) > 0} onChange={v => setCrowd({ kinds: { ...c.kinds, hexagon: v ? 1 : 0 } })}
                  help="With players near the nest, hexagons get likelier still, on top of the faster births." />
              </>)}</Reveal>
            </Group>
          );
        }}</Reveal>
        <Group title="Layers" level={3}>
            <SRow label="Beta Chance (2 layers)" value={cfg.plan.tierOneIn[1]} onChange={v => updatePlan({ tierOneIn: cfg.plan!.tierOneIn.map((x, i) => i === 1 ? Math.round(v * 10) / 10 : x) })} min={0} max={1000} step={0.1} display={(cfg.plan.tierOneIn[1]) > 0 ? `1/${(cfg.plan.tierOneIn[1]).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born has a 1 in N chance to be a Beta shape, one shape inside another." />
            <SRow label="Alpha Chance (3 layers)" value={cfg.plan.tierOneIn[2]} onChange={v => updatePlan({ tierOneIn: cfg.plan!.tierOneIn.map((x, i) => i === 2 ? Math.round(v * 10) / 10 : x) })} min={0} max={10000} step={0.1} display={(cfg.plan.tierOneIn[2]) > 0 ? `1/${(cfg.plan.tierOneIn[2]).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born has a 1 in N chance to be an Alpha shape." />
            <SRow label="Omega Chance (4 layers)" value={cfg.plan.tierOneIn[3]} onChange={v => updatePlan({ tierOneIn: cfg.plan!.tierOneIn.map((x, i) => i === 3 ? Math.round(v) : x) })} min={0} max={10000000} step={10} display={(cfg.plan.tierOneIn[3]) > 0 ? `1/${(cfg.plan.tierOneIn[3]).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born has a 1 in N chance to be an Omega shape." />
            <SRow label="Gamma Chance (5 layers)" value={cfg.plan.tierOneIn[4]} onChange={v => updatePlan({ tierOneIn: cfg.plan!.tierOneIn.map((x, i) => i === 4 ? Math.round(v) : x) })} min={0} max={100000000} step={100} display={(cfg.plan.tierOneIn[4]) > 0 ? `1/${(cfg.plan.tierOneIn[4]).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born has a 1 in N chance to be a Gamma shape." />
            <SRow label="Delta Chance (6 layers)" value={cfg.plan.tierOneIn[5]} onChange={v => updatePlan({ tierOneIn: cfg.plan!.tierOneIn.map((x, i) => i === 5 ? Math.round(v) : x) })} min={0} max={1000000000} step={1000} display={(cfg.plan.tierOneIn[5]) > 0 ? `1/${(cfg.plan.tierOneIn[5]).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born has a 1 in N chance to be a Delta shape." />
        </Group>
        <Group title="Crashers, Giants And Gems" level={3}>
            <SRow label="Crasher Chance" value={cfg.plan.crasherOneIn} onChange={v => updatePlan({ crasherOneIn: Math.round(v) })} min={0} max={20000} step={1} display={(cfg.plan.crasherOneIn) > 0 ? `1/${(cfg.plan.crasherOneIn).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born outside the nest comes out as a crasher of its kind. It is never nested, but it can be rare." />
            <SRow label="Crasher Chance In The Nest" value={cfg.plan.nestCrasherOneIn} onChange={v => updatePlan({ nestCrasherOneIn: Math.round(v) })} min={0} max={20000} step={1} display={(cfg.plan.nestCrasherOneIn) > 0 ? `1/${(cfg.plan.nestCrasherOneIn).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born in the nest comes out as a crasher of its kind." />
            <SRow label="Giant Chance" value={cfg.plan.scaledOneIn} onChange={v => updatePlan({ scaledOneIn: Math.round(v * 100) / 100 })} min={0} max={2000000} step={0.05} display={(cfg.plan.scaledOneIn) > 0 ? `1/${(cfg.plan.scaledOneIn).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each pentagon born is a giant instead (the Scaled Variants that are on, by their weights)." />
            <SRow label="Gem Chance" value={cfg.plan.gemOneIn} onChange={v => updatePlan({ gemOneIn: Math.round(v) })} min={0} max={100000000} step={1000} display={(cfg.plan.gemOneIn) > 0 ? `1/${(cfg.plan.gemOneIn).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born is a Gem instead." />
            <SRow label="Jewel Chance" value={cfg.plan.jewelOneIn} onChange={v => updatePlan({ jewelOneIn: Math.round(v) })} min={0} max={1000000000} step={10000} display={(cfg.plan.jewelOneIn) > 0 ? `1/${(cfg.plan.jewelOneIn).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born is a Jewel instead." />
          <ToggleRow label="A Shiny Egg Is A Gem" help="A Shiny Egg born here is a Gem, a Legendary Egg a Jewel." checked={cfg.plan.eggToGem} onChange={v => updatePlan({ eggToGem: v })} />
            <SRow label="Relic Chance" value={cfg.plan.relicOneIn} onChange={v => updatePlan({ relicOneIn: Math.round(v) })} min={0} max={100000} step={1} display={(cfg.plan.relicOneIn) > 0 ? `1/${(cfg.plan.relicOneIn).toLocaleString()}` : 'Never'} leftLabel="Common" rightLabel="Rare"
              tooltip="1 in N: each shape born outside the nest is a Relic instead, with one of the six cores." />
        </Group>
      </>) : <p className="k-hint">This area has no spawn profile: pick one to use it.</p>;
      case 'base': return (<>
        <SwapBox swapKey={selectedBase}>
        {selectedCfg && (
          <Group title={`${BASE_SHAPE_LABELS[selectedBase]} Settings`} icon={<ShapePreview sides={selectedSides} color={BASE_SHAPES[selectedBase]?.color ?? '#e8ebf7'} size={20} />} level={3}>
            <SRow label="Spawn Rate" value={selectedCfg.spawnWeight}
              onChange={v => updateBaseShape(selectedBase, 'spawnWeight', Math.round(v))}
              min={0} max={100} display={selectedCfg.spawnWeight === 0 ? 'Off' : String(selectedCfg.spawnWeight)}
              leftLabel="Disabled" rightLabel="Common"
              tooltip="How often this shape is picked when a base shape spawns, weighed against the other base shapes that are on. 0 turns it off." />
            <Reveal when={!!cfg.plan && cfg.plan.nestSize > 0}>{() => (
              <SRow label="Spawn Rate In The Nest" value={cfg.plan?.nestWeights[selectedBase] ?? 0}
                onChange={v => updatePlan({ nestWeights: { ...cfg.plan!.nestWeights, [selectedBase]: Math.round(v) } })}
                min={0} max={100} display={(cfg.plan?.nestWeights[selectedBase] ?? 0) === 0 ? 'Off' : String(cfg.plan?.nestWeights[selectedBase])}
                leftLabel="Disabled" rightLabel="Common"
                tooltip="How often this shape is picked when a shape is born in the nest, weighed against the other nest shapes. 0 keeps it out of the nest." />
            )}</Reveal>
            <Reveal when={!cfg.plan}>{() => (
            <SRow label="Spawn Close To Center" value={selectedCfg.centerBias}
              onChange={v => updateBaseShape(selectedBase, 'centerBias', Math.round(v))}
              min={0} max={100} display={selectedCfg.centerBias === 0 ? 'Off' : String(selectedCfg.centerBias)}
              leftLabel="Anywhere" rightLabel="Center only"
              tooltip="Where this shape appears. At Off it can appear anywhere on the map; the higher the number, the closer to the middle it tends to spawn." />
            )}</Reveal>
            <SRow label="Base Size" value={selectedCfg.size}
              onChange={v => updateBaseShape(selectedBase, 'size', v)}
              min={3} max={200} step={0.5} leftLabel="Tiny" rightLabel="Large"
              tooltip="How big this shape is, before any Size Randomization." />
            <SRow label="Health (HP)" value={selectedCfg.hp}
              onChange={v => updateBaseShape(selectedBase, 'hp', Math.round(v))}
              min={1} max={SHAPES_ARRAS !== 0 ? 5000 : 500} leftLabel="Fragile" rightLabel="Tanky"
              tooltip="How much damage this shape takes before it breaks." />
            <SRow label="Body Damage" value={selectedCfg.bodyDamage}
              onChange={v => updateBaseShape(selectedBase, 'bodyDamage', Math.round(v))}
              min={0} max={100} leftLabel="None" rightLabel="Lethal"
              tooltip="The damage this shape deals to a tank that runs into it." />
            <SRow label="Shield" value={selectedCfg.shield}
              onChange={v => updateBaseShape(selectedBase, 'shield', Math.round(v))}
              min={0} max={100}
              tooltip="A shield on top of the shape's health. 0 means no shield." />
            <SRow label="Shield Regen" value={selectedCfg.shieldRegen}
              onChange={v => updateBaseShape(selectedBase, 'shieldRegen', Math.round(v))}
              min={0} max={20}
              tooltip="Above 0, a hurt shape fills its shield back up and then its health. At 0 a hurt shape stays hurt." />
            <SRow label="XP Value" value={selectedCfg.xpValue}
              onChange={v => updateBaseShape(selectedBase, 'xpValue', Math.round(v))}
              min={0} max={500} leftLabel="0 XP" rightLabel="500 XP"
              tooltip="The XP this shape gives when it breaks, shared by everyone who damaged it, each by their share of the damage." />
          </Group>
        )}
        </SwapBox>
        <Group title="Base Shapes" level={3}>
          <SRow label="Concurrent Cap" value={cfg.baseShapeCap ?? 0}
            onChange={v => updateSpawnCfg({ baseShapeCap: Math.round(v) })}
            min={0} max={150} step={1}
            display={(cfg.baseShapeCap ?? 0) === 0 ? 'Off' : String(cfg.baseShapeCap)}
            leftLabel="Off" rightLabel="Many"
            tooltip="Maximum REGULAR base shapes alive at once (eggs / triangles / squares / pentagons / hexagons that haven't been promoted to a variant). 0 = unlimited (only the global Food Cap applies). Use this to prevent base shapes from crowding out rare/laby variants when their rates are pushed high." />
          <RateSlider label="Category Spawn Rate" level={cfg.baseShapeRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ baseShapeRateLevel: v })}
            tooltip="Boost or suppress how often base shapes spawn. Multiplies the base food spawn loop's per frame chance. 0 = neutral (current behavior). Compounds with the global Shape Spawn Multiplier in Environment Config." />
        </Group>
      </>);
      case 'scaled': return (
        <Group title="Scaled Variants" level={3}>
          <Reveal when={!cfg.plan}>{() => (
          <SRow label="Center Zone %" value={cfg.scaledVariantCenterZone}
            onChange={v => updateSpawnCfg({ scaledVariantCenterZone: Math.round(v) })}
            min={0} max={100} suffix="%" leftLabel="Off" rightLabel="Full Map"
            tooltip="Restricts where scaled variants (alpha/beta pentagon + OD shapes) can spawn, they only appear within this fraction of the arena's radius around the center. 0 = variants disabled. 20 = inner 20% only (arras 'pentagon nest' feel). 100 = anywhere on the map. Nonvariant shapes (regular eggs/triangles/squares/etc.) ignore this and spawn anywhere." />
          )}</Reveal>
          <SRow label="Concurrent Variant Cap" value={cfg.scaledVariantCap ?? 15}
            onChange={v => updateSpawnCfg({ scaledVariantCap: Math.round(v) })}
            min={0} max={SHAPE_SPAWN_PLAN !== 0 ? 500 : 50} step={1} leftLabel="None" rightLabel="Many"
            tooltip="Maximum scaled variants alive on the map at once (alpha/beta pentagon + OD shapes share this pool). Default 15. Raise to give rarer variants (octagon/nonagon) room to coexist with common ones (hexagon). OD Main is set to 25 by default." />
          <RateSlider label="Category Spawn Rate" level={cfg.scaledVariantRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ scaledVariantRateLevel: v })}
            tooltip="Boost or suppress how often pentagons promote to a scaled variant (alpha/beta + OD shapes). Multiplies the 25% promotion gate (capped at 100%). 0 = neutral (current behavior). Within category proportions (e.g. odHexagon vs alphaPentagon) stay unchanged." />
        </Group>
      );
      case 'rarities': return (<>
        <Group title="Rarities" level={3}>
          <SRow label="Shiny Chance" value={cfg.shinyChance} onChange={v => updateSpawnCfg({ shinyChance: Math.round(v) })}
            min={SHAPE_SPAWN_PLAN !== 0 ? 1 : 100} max={SHAPE_SPAWN_PLAN !== 0 ? 1000000 : 200000} step={SHAPE_SPAWN_PLAN !== 0 ? 1 : 100} display={`1/${cfg.shinyChance.toLocaleString()}`} leftLabel="Common" rightLabel="Ultra Rare"
            tooltip="1 in N: each shape that spawns has a 1 in N chance to be shiny. A higher N makes it rarer." />
          <SRow label="Legendary Chance" value={cfg.legendaryChance} onChange={v => updateSpawnCfg({ legendaryChance: Math.round(v) })}
            min={SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000} max={SHAPE_SPAWN_PLAN !== 0 ? 50000000 : 5000000} step={SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000} display={`1/${cfg.legendaryChance.toLocaleString()}`} leftLabel="Uncommon" rightLabel="Mythical"
            tooltip="1 in N: each shape that spawns has a 1 in N chance to be legendary. A higher N makes it rarer." />
          <SRow label="Shadow Chance" value={cfg.shadowChance} onChange={v => updateSpawnCfg({ shadowChance: Math.round(v) })}
            min={SHAPE_SPAWN_PLAN !== 0 ? 1 : 10000} max={50000000} step={SHAPE_SPAWN_PLAN !== 0 ? 1 : 10000} display={`1/${cfg.shadowChance.toLocaleString()}`} leftLabel="Uncommon" rightLabel="Mythical"
            tooltip="1 in N: each shape that spawns has a 1 in N chance to be a shadow shape. A higher N makes it rarer." />
          <SRow label="Rainbow Chance" value={cfg.rainbowChance} onChange={v => updateSpawnCfg({ rainbowChance: Math.round(v) })}
            min={SHAPE_SPAWN_PLAN !== 0 ? 1 : 100000} max={500000000} step={SHAPE_SPAWN_PLAN !== 0 ? 1 : 100000} display={`1/${cfg.rainbowChance.toLocaleString()}`} leftLabel="Rare" rightLabel="Impossible"
            tooltip="1 in N: each shape that spawns has a 1 in N chance to be a rainbow shape. A higher N makes it rarer." />
          <SRow label="Trans Chance" value={cfg.transChance} onChange={v => updateSpawnCfg({ transChance: Math.round(v) })}
            min={SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000000} max={1000000000} step={SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000000} display={`1/${cfg.transChance.toLocaleString()}`} leftLabel="Very Rare" rightLabel="Impossible"
            tooltip="1 in N: each shape that spawns has a 1 in N chance to be a trans shape. A higher N makes it rarer." />
          <SRow label="Concurrent Cap" value={cfg.rarityCap ?? 0}
            onChange={v => updateSpawnCfg({ rarityCap: Math.round(v) })}
            min={0} max={100} step={1}
            display={(cfg.rarityCap ?? 0) === 0 ? 'Off' : String(cfg.rarityCap)}
            leftLabel="Off" rightLabel="Many"
            tooltip="Maximum rarity promoted shapes alive at once (shiny / legendary / shadow / rainbow / trans variants of base shapes, gem/jewel are tracked under Special). 0 = unlimited (only the global Food Cap applies)." />
          <RateSlider label="Category Spawn Rate" level={cfg.rarityRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ rarityRateLevel: v })}
            tooltip="Boost or suppress how often shapes are promoted to a rare tier (shiny / legendary / shadow / rainbow / trans). Multiplies all rarity tier chances. 0 = neutral (current behavior). Stacks with the debug Rarity Test Boost when both are above neutral." />
        </Group>
        <Group title="Rarity Test Boost" level={3} collapsible defaultOpen={cfg.rarityTestMultiplier > 1}
          count={cfg.rarityTestMultiplier > 1 ? `${cfg.rarityTestMultiplier.toLocaleString()}x` : 'Off'}>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 10, 100, 1000, 10000, 100000].map(v => (
              <button key={v} type="button" onClick={() => updateSpawnCfg({ rarityTestMultiplier: v })}
                aria-pressed={cfg.rarityTestMultiplier === v}
                className={`k-segbtn${cfg.rarityTestMultiplier === v ? ' k-segbtn-on' : ''}`}>
                {v === 1 ? 'Off' : `${v.toLocaleString()}x`}
              </button>
            ))}
          </div>
          <Reveal when={cfg.rarityTestMultiplier > 1 || (cfg.rarityRateLevel ?? 0) !== 0}>{() => <RarityOddsReadout cfg={cfg} />}</Reveal>
        </Group>
      </>);
      case 'nested': return (
        <Group title="Nested / Laby" level={3}>
          <SRow label="Concurrent Cap" value={cfg.labyCap ?? 0}
            onChange={v => updateSpawnCfg({ labyCap: Math.round(v) })}
            min={0} max={100} step={1}
            display={(cfg.labyCap ?? 0) === 0 ? 'Off' : String(cfg.labyCap)}
            leftLabel="Off" rightLabel="Many"
            tooltip="Maximum labyrinth/nested shapes alive at once (any base shape with a tier 1 to 5 promotion). 0 = unlimited (only the global Food Cap applies). Use this to keep the map from filling up with high tier laby shapes when boosting the laby spawn rate." />
          <RateSlider label="Category Spawn Rate" level={cfg.labyRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ labyRateLevel: v })}
            tooltip="Boost or suppress how often shapes are promoted to a labyrinth/nested tier. Scales the laby tiers' weight against the regular (nonlaby) weight. 0 = neutral (current behavior). Per tier ratios (5^tier) stay unchanged." />
        </Group>
      );
      case 'special': return (
        <Group title="Special" level={3}>
          <SRow label="Concurrent Cap" value={cfg.specialShapeCap ?? 0}
            onChange={v => updateSpawnCfg({ specialShapeCap: Math.round(v) })}
            min={0} max={50} step={1}
            display={(cfg.specialShapeCap ?? 0) === 0 ? 'Off' : String(cfg.specialShapeCap)}
            leftLabel="Off" rightLabel="Many"
            tooltip="Maximum special shapes (gem / jewel) alive at once. 0 = unlimited (only the global Food Cap applies). Gems/jewels are very rare even at default rates; this cap matters mostly when the Special Spawn Rate slider is pushed high." />
          <RateSlider label="Category Spawn Rate" level={cfg.specialShapeRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ specialShapeRateLevel: v })}
            tooltip="Boost or suppress how often special shapes (gem / jewel) appear within shiny/legendary tier rolls. Scales the gem/jewel weight relative to base shapes in those tiers. 0 = neutral (current behavior)." />
        </Group>
      );
      case 'crashers': return (
        <Group title="Crashers" level={3}>
          <SRow label="Crasher Cap" value={cfg.crasherCap} onChange={v => updateSpawnCfg({ crasherCap: Math.round(v) })}
            min={0} max={50} leftLabel="None" rightLabel="Lots"
            tooltip="The most crashers alive at once in this area." />
          <SRow label="Chase Range" value={cfg.crasherChaseRange} onChange={v => updateSpawnCfg({ crasherChaseRange: Math.round(v) })}
            min={100} max={2000} leftLabel="Short" rightLabel="Long"
            tooltip="How far a crasher will come after a tank. A crasher uses the Chase Range of the area it is standing in." />
          <RateSlider label="Category Spawn Rate" level={cfg.crasherRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ crasherRateLevel: v })}
            tooltip="Boost or suppress how often crashers spawn. Multiplies the per frame crasher spawn chance (capped at 100%). 0 = neutral (current behavior). Crasher Cap above is the maximum alive at once, independent of this rate." />
        </Group>
      );
      case 'sentries': return (
        <Group title="Sentries" level={3}>
          <SRow label="Sentry Cap" value={cfg.sentryCap} onChange={v => updateSpawnCfg({ sentryCap: Math.round(v) })}
            min={0} max={20} leftLabel="None" rightLabel="Lots"
            tooltip="The most sentries alive at once in this area." />
          <RateSlider label="Category Spawn Rate" level={cfg.sentryRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ sentryRateLevel: v })}
            tooltip="Boost or suppress how often sentries spawn. Divides the 3 to 8 minute spawn timer interval (for example +5 gives about 30s to 1.5min between attempts, and -5 about 17 to 43min). 0 = neutral (current behavior). Sentry Cap above is the maximum alive at once, independent of this rate." />
        </Group>
      );
      case 'sentinels': return (
        <Group title="Sentinels" level={3}>
          <SRow label="Sentinel Cap" value={cfg.sentinelCap} onChange={v => updateSpawnCfg({ sentinelCap: Math.round(v) })}
            min={0} max={10} leftLabel="None" rightLabel="Lots"
            tooltip="The most sentinels alive at once in this area." />
          <RateSlider label="Category Spawn Rate" level={cfg.sentinelRateLevel ?? 0}
            onChange={v => updateSpawnCfg({ sentinelRateLevel: v })}
            tooltip="Boost or suppress how often sentinels spawn. Divides the 5 to 12 minute spawn timer interval. 0 = neutral (current behavior). Sentinel Cap above is the maximum alive at once, independent of this rate." />
        </Group>
      );
      case 'polyhedra': return (
        <Group title="Polyhedra" level={3}>
          <SRow label="Polyhedra Chance" value={cfg.polyhedraChance} onChange={v => updateSpawnCfg({ polyhedraChance: Math.round(v) })}
            min={SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000} max={SHAPE_SPAWN_PLAN !== 0 ? 1000000000 : 5000000} step={SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000} display={`1/${cfg.polyhedraChance.toLocaleString()}`} leftLabel="Common" rightLabel="Ultra Rare"
            tooltip={cfg.plan ? "1 in N: each shape born here has a 1 in N chance to be one of the polyhedra that are on instead. A higher N makes them rarer." : "1 in N: each time this area spawns food there is a 1 in N chance that one of the polyhedra that are on appears. A higher N makes them rarer."} />
        </Group>
      );
    }
  };

  const searching = searchingNow;
  const catTitle = CATEGORIES.find(c => c.id === shownCat)?.title ?? '';
  const tileBlock = (id: CatId) => {
    const tiles = tilesOf(id).filter(Boolean);
    if (tiles.length === 0) return null;
    return id === 'nested' ? <div className="space-y-3">{tiles}</div> : <div className="k-shape-grid">{tiles}</div>;
  };

  return (
    <Modal title="Farmable Shapes" icon={<Shapes size={18} />} size="xl" onClose={onClose} fit surface="content" bodyClassName="k-modal-body-flush" waitHeight={bodyH}
      >
      <div className="flex min-h-0" style={{ height: bodyH }}>
        <aside className="k-lib-side w-[256px] shrink-0 border-r border-[var(--alpha-divider)] overflow-y-auto popup-scrollbar p-4 space-y-3">
          <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search shapes" />
          <div className="k-stack">
            {CATEGORIES.map(c => (
              <PickRow key={c.id} title={c.title} meta={c.id === 'profile' ? counts[c.id] : `${counts[c.id]} on`} selected={!searching && cat === c.id}
                onPick={() => { setCat(c.id); setSearchQuery(''); }} />
            ))}
          </div>
          {SHAPES_ARRAS !== 0 && (
            <Group title="Every Shape" level={3}>
              <SRow label="Size Randomization" value={cfg.sizeRandomization ?? 0}
                onChange={v => updateSpawnCfg({ sizeRandomization: Math.round(v) })}
                min={0} max={100} step={1}
                display={(cfg.sizeRandomization ?? 0) === 0 ? 'Off' : `${Math.round(cfg.sizeRandomization ?? 0)}%`}
                leftLabel="Off" rightLabel="100%"
                tooltip="Every shape of this map spawns up to this much bigger or smaller than its normal size. Off means each shape follows its own setting. Health does not change with the size." />
            </Group>
          )}
        </aside>

        <div className={`k-lib-content flex-1 min-w-0 overflow-y-auto popup-scrollbar p-4 space-y-4 ${stage.swapClass}`}>
          {shownSearching ? (() => {
            const blocks = CATEGORIES.map(c => ({ c, b: tileBlock(c.id) })).filter(x => x.b);
            return blocks.length === 0
              ? <p className="k-hint text-center py-10">No shape matches "{shownQuery}".</p>
              : blocks.map(({ c, b }) => (
                <section key={c.id} className="space-y-2">
                  <span className="k-subhead">{c.title}</span>
                  {b}
                </section>
              ));
          })() : (<>
            <div className="k-section-head"><span className="k-group-title">{catTitle}</span><span className="k-hint tabular-nums">{shownCat === 'profile' ? counts[shownCat] : `${counts[shownCat]} on`}</span></div>
            {tileBlock(shownCat)}
          </>)}
        </div>

        <aside className={`k-pop-pane w-[300px] shrink-0 border-l border-[var(--alpha-divider)] bg-[var(--layer-1)] overflow-y-auto popup-scrollbar p-4 space-y-3 ${stage.swapClass}`}>
          {settingsOf(shownCat)}
        </aside>
      </div>
    </Modal>
  );
};
