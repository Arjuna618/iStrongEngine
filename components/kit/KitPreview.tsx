import React, { useEffect, useState } from 'react';
import {
  Button, IconButton, Group, ToggleRow, SliderRow, SelectRow, Segmented, FieldRow, TextField, SearchField,
  Chip, Divider, EmptyState, emptyArt, Tabs, Skeleton, SkeletonText,
} from './kit';
import {
  Box, CanvasTool, Joystick, Bot, Map as MapIcon, House, FolderDown, Settings, Play, BookText, Moon, Plus, Trash2,
  Copy, Download, Upload, RotateCcw, Layers, Eye, Shapes, Search, Star, X, ChevronDown, Lightbulb, Bug,
} from '../ui/icons';

function Rail() {
  const top = [Box, CanvasTool, Joystick, Bot, MapIcon];
  const bottom = [House, FolderDown, Settings];
  return (
    <div className="flex flex-col items-center gap-2 py-3 w-14 shrink-0 bg-[var(--layer-1)] border-r border-[var(--alpha-divider)]">
      {top.map((I, i) => <IconButton key={i} label={`Tool ${i + 1}`} size="lg" active={i === 0}><I size={20} /></IconButton>)}
      <div className="flex-1" />
      <div className="w-6 h-px bg-[var(--alpha-divider)]" />
      {bottom.map((I, i) => <IconButton key={i} label={`App ${i + 1}`} size="lg"><I size={20} /></IconButton>)}
    </div>
  );
}

function Panel() {
  const [a, setA] = useState(true); const [b, setB] = useState(false); const [c, setC] = useState(true);
  const [sides, setSides] = useState(6); const [size, setSize] = useState(9); const [speed, setSpeed] = useState(3);
  const [sel, setSel] = useState('bullet'); const [seg, setSeg] = useState<'auto' | 'high' | 'low'>('auto');
  const [name, setName] = useState('My Tank'); const [q, setQ] = useState('');
  return (
    <div className="w-[340px] shrink-0 bg-[var(--layer-1)] border-l border-[var(--alpha-divider)] flex flex-col">
      <div className="h-12 px-4 flex items-center gap-2 border-b border-[var(--alpha-divider)]">
        <Box size={16} className="text-[var(--text-secondary)]" />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">Tank</span>
        <span className="flex-1" />
        <IconButton label="Reset" size="sm"><RotateCcw size={14} /></IconButton>
      </div>
      <div className="p-3 space-y-3 overflow-hidden">
        <Group title="Body" icon={<Shapes size={14} />}>
          <SliderRow label="Sides" help="0 makes a circle." value={sides} onChange={setSides} min={0} max={12} />
          <SliderRow label="Size" value={size} onChange={setSize} min={1} max={30} unit="units" />
          <SliderRow label="Move Speed" value={speed} onChange={setSpeed} min={0} max={10} step={0.1} />
        </Group>
        <Group title="Look" icon={<Eye size={14} />} count={3}>
          <ToggleRow label="Keep Own Color" description="Wears its own colors in team modes." checked={a} onChange={setA} />
          <ToggleRow label="Red Cross" description="A healing cross on the body." checked={b} onChange={setB} />
          <ToggleRow label="Health Bar" checked={c} onChange={setC} help="Off hides the health and shield bars." />
          <SelectRow label="Skill Labels" value={sel} onChange={setSel} options={{ bullet: 'Generic (Bullet)', drone: 'Drone', smasher: 'Smasher' }} />
        </Group>
        <Group title="Behaviour" icon={<Bot size={14} />} collapsible defaultOpen={false} count={2} />
        <Group title="Body Layers" icon={<Layers size={14} />} collapsible>
          <EmptyState icon={emptyArt(Layers)} title="No extra layers" action={<Button size="sm" icon={<Plus size={14} />}>Add Body Layer</Button>} />
        </Group>
        <Group title="Fields" collapsible defaultOpen>
          <FieldRow label="Name"><TextField value={name} onChange={setName} className="max-w-[160px]" /></FieldRow>
          <FieldRow label="Quality" stacked><Segmented block value={seg} onChange={setSeg} options={[{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]} /></FieldRow>
          <SearchField value={q} onChange={setQ} placeholder="Search shapes" />
        </Group>
      </div>
    </div>
  );
}

function Parts() {
  const [tab, setTab] = useState<'tanks' | 'turrets' | 'shapes'>('tanks');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Play size={16} />}>Play Sandbox</Button>
        <Button icon={<Download size={16} />}>Export File</Button>
        <Button variant="ghost" icon={<Upload size={16} />}>Import</Button>
        <Button variant="danger" icon={<Trash2 size={16} />}>Delete</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Copy size={14} />}>Small</Button>
        <Button size="lg" variant="primary">Large Primary</Button>
        <IconButton label="Docs"><BookText size={18} /></IconButton>
        <IconButton label="Theme"><Moon size={18} /></IconButton>
        <IconButton label="Star" active><Star size={18} /></IconButton>
        <IconButton label="Close" size="sm"><X size={14} /></IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip>Tier 1</Chip><Chip active>Drones</Chip><Chip onClick={() => {}}>Traps</Chip><Chip onClick={() => {}}>Smasher</Chip>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'tanks', label: 'Tanks', count: 2816 }, { value: 'turrets', label: 'Turrets', count: 640 }, { value: 'shapes', label: 'Food Shapes', count: 241 }]} />
      <Divider />
      <div className="text-[11px] font-medium text-[var(--text-tertiary)]">Skeletons (loading)</div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-[10px] p-2 bg-[var(--layer-2)] border border-[var(--alpha-card-border)] space-y-2">
            <Skeleton h={64} r={8} />
            <Skeleton h={10} w="70%" r={4} />
            <Skeleton h={8} w="40%" r={4} />
          </div>
        ))}
      </div>
      <div className="rounded-[12px] p-3 bg-[var(--layer-2)] border border-[var(--alpha-card-border)] space-y-3">
        <div className="flex items-center justify-between"><Skeleton w={110} h={10} r={4} /><Skeleton w={28} h={16} r={999} /></div>
        <SkeletonText lines={2} />
        <Skeleton h={4} r={999} />
      </div>
    </div>
  );
}

function ModalSample() {
  return (
    <div className="relative rounded-[14px] overflow-hidden h-[300px] bg-[var(--surface-canvas)]">
      <div className="absolute inset-0 p-4 grid grid-cols-3 gap-3 opacity-90">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="rounded-xl bg-[var(--layer-1)] border border-[var(--alpha-card-border)]"><div className="m-3 h-16 rounded-full w-16 mx-auto mt-6" style={{ background: 'var(--ig-kills)' }} /></div>)}
      </div>
      <div className="k-backdrop" style={{ position: 'absolute' }}>
        <div className="k-modal" style={{ width: 360 }}>
          <header className="k-modal-head">
            <span className="k-modal-icon"><Bug size={18} strokeWidth={1.5} absoluteStrokeWidth /></span>
            <div className="min-w-0 flex-1"><h2 className="k-modal-title">Debug Menu</h2><div className="k-modal-sub">Tools for testing a match</div></div>
            <IconButton label="Close"><X size={18} /></IconButton>
          </header>
          <div className="k-modal-body"><p className="k-modal-text">Every popup gets this frame: one title, one close button, a body that scrolls, and buttons at the bottom.</p></div>
          <footer className="k-modal-foot"><Button>Return</Button><Button variant="primary">Confirm</Button></footer>
        </div>
      </div>
    </div>
  );
}

function Column({ dark }: { dark: boolean }) {
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="bg-[var(--surface-canvas)] text-[var(--text-primary)] p-4 space-y-4" style={{ width: 1180 }}>
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Lightbulb size={16} /> {dark ? 'Dark mode' : 'Light mode'}</div>
        <div className="flex h-[860px] rounded-[14px] overflow-hidden border border-[var(--alpha-card-border)]">
          <Rail />
          <div className="flex-1 p-5 overflow-hidden bg-[var(--surface-canvas)] space-y-5">
            <Parts />
            <ModalSample />
          </div>
          <Panel />
        </div>
        <div className="flex items-center gap-1 text-[var(--text-tertiary)] text-[11px]"><ChevronDown size={12} /> Hugeicons, stroke 1.5 <Search size={12} /></div>
      </div>
    </div>
  );
}

export default function KitPreview() {
  useEffect(() => { document.documentElement.classList.remove('dark'); }, []);
  return (
    <div className="min-h-screen bg-[var(--surface-deep)] p-6 flex gap-6 items-start overflow-auto" data-uikit>
      <Column dark={false} />
      <Column dark />
    </div>
  );
}
