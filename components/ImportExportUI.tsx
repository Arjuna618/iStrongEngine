import React, { useState, useRef, useEffect } from 'react';
import { GameLogic } from '../game/GameLogic';
import { DataRegistry } from '../game/DataRegistry';
import { importChangedNotice } from './shared/labels';
import { Download, ExternalLink, HdArtificialIntelligence07, HdFileAttachment, HdAiSwap } from './ui/icons';
import { useToast } from './ui/Toast';
import { ExportFile, TurretPreset, CustomProjectileDesign, LibraryItem, FoodShapeDesign } from '../types';
import { makeUserShapeId } from '../game/ShapeRegistry';
import { type SelectOption } from './shared/CustomSelect';
import { Group, SelectRow, FieldRow, TextField, Button, headerIcon } from './kit/kit';
import { Reveal, SwapInPlace, SwapText, revealFold, type FoldHandle } from './kit/Collapse';
import { ImportButton } from './shared/ImportButton';
import { ScrollArea } from './ui/ScrollArea';
import { fireTip } from '../utils/tips';
import { keepExportCopy, routeProjectFiles, isProjectFileName, APP_FILE_ACCEPT } from './project/projectActions';
import { usePanelMemory, isText, isOneOf } from './kit/panelMemory';
import { exportKindDoor, whenToolShown, type ExportKind } from './shell/doors';

interface Props {
  logic: GameLogic | null;
  dataRegistry?: DataRegistry;
  className?: string;
}

type ExportMode = ExportKind;

const EXPORT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'tank',          label: 'Tank' },
  { value: 'turret-preset', label: 'Turret' },
  { value: 'projectile',    label: 'Projectile' },
  { value: 'food-shape',    label: 'Food Shape' },
];

const INVALID_FILE_MSG = 'Invalid file: Could not determine file type.';

const DEFAULT_EXPORT_NAME: Record<ExportMode, string> = {
  tank: 'MyTank',
  'turret-preset': 'MyTurret',
  projectile: 'MyProjectile',
  'food-shape': 'MyShape',
};

function rejectMessage(): string {
  const reason = DataRegistry.lastRejectReason;
  DataRegistry.lastRejectReason = null;
  return reason ?? INVALID_FILE_MSG;
}


export const ImportExportUI: React.FC<Props> = ({ logic, dataRegistry, className }) => {
  const [exportName, setExportName] = usePanelMemory<string>('importExport.name', DEFAULT_EXPORT_NAME.tank, isText(200));
  const nameBeforeShapeRef = useRef<{ mode: ExportMode; name: string } | null>(null);
  const [exportMode, setExportMode] = usePanelMemory<ExportMode>('importExport.mode', 'tank', isOneOf(['tank', 'turret-preset', 'projectile', 'food-shape']));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (logic) {
      logic.showTurretsOnly = exportMode === 'turret-preset';
    }
    return () => {
      if (logic) {
        logic.showTurretsOnly = false;
      }
    };
  }, [logic, exportMode]);

  const loadedShape = logic ? logic.state.editingShape : null;
  const shapeLoaded = !!logic && logic.state.canvasEntityKind === 'shape' && loadedShape !== null;
  useEffect(() => {
    if (shapeLoaded && exportMode !== 'food-shape') {
      nameBeforeShapeRef.current = { mode: exportMode, name: exportName };
      setExportMode('food-shape');
    }
    if (!shapeLoaded && exportMode === 'food-shape') {
      const saved = nameBeforeShapeRef.current;
      setExportMode(saved?.mode ?? 'tank');
      setExportName(saved?.name ?? DEFAULT_EXPORT_NAME[saved?.mode ?? 'tank']);
      nameBeforeShapeRef.current = null;
    }
  }, [shapeLoaded, exportMode]);
  const loadedShapeId = shapeLoaded ? loadedShape!.shapeId : null;
  const loadedShapeName = shapeLoaded ? loadedShape!.name : null;
  useEffect(() => {
    if (shapeLoaded) setExportName(loadedShapeName || DEFAULT_EXPORT_NAME['food-shape']);
  }, [shapeLoaded, loadedShapeId, loadedShapeName]);
  const exportTypeOptions = shapeLoaded ? EXPORT_TYPE_OPTIONS : EXPORT_TYPE_OPTIONS.filter(o => o.value !== 'food-shape');

  const exportCard = useRef<FoldHandle | null>(null);
  const pickKind = useRef<(kind: ExportMode) => void>(() => {});
  useEffect(() => {
    exportKindDoor.set(kind => {
      requestAnimationFrame(() => pickKind.current(kind));
      void whenToolShown('import-export').then(ok => { if (ok && exportCard.current) void revealFold(exportCard.current); });
    });
    return () => exportKindDoor.set(null);
  }, []);

  if (!logic) return null;

  const filePrefix = exportMode === 'projectile' ? 'projectile' : exportMode === 'turret-preset' ? 'turret' : exportMode === 'food-shape' ? 'shape' : 'tank';
  const fullFileName = `${filePrefix}-${exportName.replace(/[^a-zA-Z0-9-_]/g, '')}.json`;
  const canExportPreset = logic.state.turrets.length > 0;
  const hasEditingShape = !logic.state.isTestMode && logic.state.editingShape !== null;

  const handleExport = async () => {
    let fileContent: ExportFile;

    if (exportMode === 'food-shape') {
      if (!hasEditingShape) {
        showToast('error', 'Load a food shape in the Canvas Tool first.');
        return;
      }
      if (exportName.trim() === '') {
        showToast('error', 'Give the shape a name first.');
        return;
      }
      const targetId = makeUserShapeId(exportName);
      const clash = logic.state.tankLibrary.find(l => l.id === 'shape-' + targetId && l.fileData.type === 'FoodShape');
      if (clash && (clash.fileData.data as FoodShapeDesign).name !== exportName.trim()) {
        showToast('error', 'Another saved shape already uses this name. Pick a different name.');
        return;
      }
      const design = logic.exportFoodShapeDesign(exportName);
      logic.updateEditingShape({ name: exportName });
      fileContent = {
        version: '1.0.0',
        type: 'FoodShape',
        name: exportName,
        timestamp: Date.now(),
        data: design,
      };
      logic.addToLibrary({
        id: 'shape-' + design.shapeId,
        name: exportName,
        fileData: fileContent,
        loadedAt: Date.now(),
        source: 'manual-import',
      });
    } else if (exportMode === 'projectile') {
      if (exportName.trim() === '') {
        showToast('error', 'Give the projectile a name first.');
        return;
      }
      const design = logic.exportProjectileDesign(exportName);
      logic.addProjectileDesign(design);
      fileContent = {
        version: '1.0.0',
        type: 'CustomProjectile',
        name: exportName,
        timestamp: Date.now(),
        data: design,
      };
    } else if (exportMode === 'turret-preset') {
      const preset = logic.exportTurretPreset(exportName);
      fileContent = {
        version: '1.0.0',
        type: 'TurretPreset',
        name: exportName,
        timestamp: Date.now(),
        data: preset,
      };
    } else {
      const data = logic.getTankExportData();
      fileContent = {
        version: '1.0.0',
        type: 'Tank',
        name: exportName,
        timestamp: Date.now(),
        data: data,
      };
    }

    if (dataRegistry) {
      const saveResult = await dataRegistry.smartExport(fileContent, fullFileName);
      if (saveResult === 'saved') {
        showToast('success', `Exported "${fullFileName}"`);
        keepExportCopy(fileContent);
        return;
      }
      if (saveResult === 'cancelled') return;
    }

    const blob = new Blob([JSON.stringify(fileContent, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', `Downloaded "${fullFileName}"`);
    keepExportCopy(fileContent);
  };

  const handleImportClick = async () => {
      if (dataRegistry) {
          const result = await dataRegistry.smartImport(file => { routeProjectFiles([{ file, path: file.name }]); });
          if (result === false) { fileInputRef.current?.click(); return; }
          if (result === 'cancelled' || result === 'routed') return;
          if (result === 'invalid') { showToast('error', rejectMessage()); return; }
          const newItem: LibraryItem = {
              id: DataRegistry.libraryIdFor(result),
              name: result.name || 'Imported',
              fileData: result,
              loadedAt: Date.now(),
              source: 'manual-import',
          };
          logic.addToLibrary(newItem);
          const changed = importChangedNotice(newItem.name, result);
          if (changed) showToast('info', changed);
          else showToast('success', `Imported "${newItem.name}"`);
          if (result.type === 'TurretPreset') {
              logic.addTurretPreset(result.data as TurretPreset);
          } else if (result.type === 'CustomProjectile') {
              logic.addProjectileDesign(result.data as CustomProjectileDesign);
          }
          return;
      }
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !logic) return;
      if (isProjectFileName(file.name)) { e.target.value = ''; routeProjectFiles([{ file, path: file.name }]); return; }

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);

              const validated = DataRegistry.validateImport(json);
              if (!validated) {
                  showToast('error', rejectMessage());
                  return;
              }

              const newItem: LibraryItem = {
                  id: DataRegistry.libraryIdFor(validated),
                  name: validated.name || file.name.replace('.json', ''),
                  fileData: validated,
                  loadedAt: Date.now(),
                  source: 'manual-import',
              };

              logic.addToLibrary(newItem);
              const changed = importChangedNotice(newItem.name, validated);
              if (changed) showToast('info', changed);
              else showToast('success', `Imported "${newItem.name}"`);

              if (validated.type === 'TurretPreset') {
                  logic.addTurretPreset(validated.data as TurretPreset);
              } else if (validated.type === 'CustomProjectile') {
                  logic.addProjectileDesign(validated.data as CustomProjectileDesign);
              }
          } catch (err) {
              showToast('error', 'Failed to parse JSON file.');
              console.error(err);
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const getNameLabel = () => {
    switch (exportMode) {
      case 'projectile': return 'Projectile Name';
      case 'turret-preset': return 'Preset Name';
      case 'food-shape': return 'Shape Name';
      default: return 'Configuration Name';
    }
  };

  const getNamePlaceholder = () => {
    switch (exportMode) {
      case 'projectile': return 'e.g. Hive Drone';
      case 'turret-preset': return 'e.g. Penta Shot';
      case 'food-shape': return 'e.g. Golden Pentagon';
      default: return 'e.g. Minigun';
    }
  };

  const handleExportModeChange = (v: string) => {
    const mode = v as ExportMode;
    if (mode === exportMode) return;
    setExportMode(mode);
    setExportName(DEFAULT_EXPORT_NAME[mode]);
    if (mode === 'turret-preset') fireTip('turretExportSelected');
  };
  pickKind.current = (kind) => { if ((kind === 'food-shape') === shapeLoaded) handleExportModeChange(kind); };

  const isExportDisabled = exportMode === 'turret-preset' && !canExportPreset;

  return (
    <ScrollArea className={className} contentClassName="p-4 space-y-3 overflow-x-hidden">

        <Group title="Export Configuration" icon={headerIcon(HdArtificialIntelligence07)} handle={exportCard}>
            <SelectRow label="Export Type" help="What the file holds. Tank: the whole tank. Turret: only the placed turrets, as a preset. Projectile: the whole tank as a projectile design other tanks can fire. Food Shape: the shape on the canvas, offered only while one is loaded." value={exportMode} onChange={handleExportModeChange} options={exportTypeOptions} disabled={shapeLoaded}
              why="Locked while a food shape is on the canvas." />

            <FieldRow label={<SwapText>{getNameLabel()}</SwapText>} stacked help="The name saved in the file. The file is named after it too, as the Output line shows.">
                <TextField value={exportName} onChange={setExportName} placeholder={getNamePlaceholder()} />
            </FieldRow>

            <SwapInPlace swapKey={exportMode} hold={false}><p className="k-hint font-mono text-center">Output: {fullFileName}</p></SwapInPlace>

            <Button variant="primary" block icon={<Download size={16} />} onClick={handleExport} disabled={isExportDisabled}>
                Export to File
            </Button>
            <Reveal when={exportMode === 'turret-preset' && !canExportPreset}>
              <p className="k-hint text-center">No turrets to export. Place turrets first.</p>
            </Reveal>
            <Reveal when={exportMode === 'food-shape' && !hasEditingShape}>
              <p className="k-hint text-center">Load a food shape in the Canvas Tool first.</p>
            </Reveal>
        </Group>

        <Group title="Import from File" icon={headerIcon(HdFileAttachment)}>
            <input
                type="file"
                ref={fileInputRef}
                hidden
                className="hidden"
                accept={APP_FILE_ACCEPT}
                onChange={handleFileChange}
            />

            <p className="k-hint">
                Tank, turret, projectile and food shape files. Each one goes to <strong className="text-[var(--text-secondary)]">User Custom</strong> in the Content Library.
            </p>

            <ImportButton logic={logic} label="Import File" block onImportFile={() => { void handleImportClick(); }} />
        </Group>

        <Group title="Nexum Converter" icon={headerIcon(HdAiSwap)} count="Web Tool">
            <p className="k-hint">
                A free converter that moves designs both ways between iStrongEngine and Open Source Arras.
            </p>

            <a
                href="https://istrongnexum.pages.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="k-btn k-btn-primary k-btn-md w-full no-underline"
            >
                <span className="k-btn-icon"><ExternalLink size={16} /></span>
                <span className="truncate">Open Nexum Converter</span>
            </a>
        </Group>

    </ScrollArea>
  );
};
