import { useEscapeOwner } from './escapeStack';

export function useEscapeClose(onClose: () => void, enabled: boolean = true): void {
  useEscapeOwner(onClose, enabled);
}
