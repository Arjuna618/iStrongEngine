import type { ExportFile } from '../types';
import { keepExportCopy } from './project/projectActions';

export type ExportPicker = (file: ExportFile, fileName: string) => Promise<'saved' | 'cancelled' | 'unsupported'>;

export async function writeExportFile(file: ExportFile, fileName: string, say: (variant: 'success', message: string) => void,
  picker: ExportPicker | null): Promise<'saved' | 'downloaded' | 'cancelled'> {
  if (picker) {
    const saveResult = await picker(file, fileName);
    if (saveResult === 'saved') {
      say('success', `Exported "${fileName}"`);
      keepExportCopy(file);
      return 'saved';
    }
    if (saveResult === 'cancelled') return 'cancelled';
  }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  say('success', `Downloaded "${fileName}"`);
  keepExportCopy(file);
  return 'downloaded';
}
