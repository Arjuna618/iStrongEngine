import React from 'react';
import { toggleTheme } from '../../utils/theme';
import { useHtmlDark } from '../library/useHtmlDark';
import { Moon, Sun } from '../ui/icons';
import { IconButton } from './kit';

export const ThemeSwitch: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const dark = useHtmlDark();
  return (
    <IconButton size={size} label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => toggleTheme()}>
      {dark ? <Moon size={18} /> : <Sun size={18} />}
    </IconButton>
  );
};
