import React from 'react';
import { HdLibrary } from '../ui/icons';

export const MapLibraryButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}> = ({ onClick, disabled, className, label = 'Map Library' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`k-btn k-btn-secondary k-btn-md w-full ${className ?? ''}`}
  >
    <HdLibrary size={15} className="shrink-0" />
    <span className="truncate">{label}</span>
  </button>
);
