import React from 'react';
import { ContentLibraryIcon } from '../ui/icons';

export const ContentLibraryButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ onClick, disabled, className }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`k-btn k-btn-secondary k-btn-md w-full ${className ?? ''}`}
  >
    <ContentLibraryIcon size={15} className="shrink-0" />
    <span className="truncate">Content Library</span>
  </button>
);
