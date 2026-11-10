import { gameThemeUiChanged } from './gameTheme';

const THEME_KEY = 'istrong-theme';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function storedPick(): 'light' | 'dark' | null {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { }
  return null;
}

function systemTheme(): 'light' | 'dark' {
  try {
    return window.matchMedia(SYSTEM_DARK).matches ? 'dark' : 'light';
  } catch { }
  return 'light';
}

export function getStoredTheme(): 'light' | 'dark' {
  return storedPick() ?? systemTheme();
}

export function applyTheme(theme: 'light' | 'dark', remember = true): void {
  const html = document.documentElement;

  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.appendChild(style);

  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  gameThemeUiChanged();

  html.offsetHeight;
  document.head.removeChild(style);

  if (!remember) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { }
}

export function startTheme(): void {
  applyTheme(getStoredTheme(), false);
  if (storedPick() !== null) return;
  try {
    window.matchMedia(SYSTEM_DARK).addEventListener('change', (e) => {
      if (storedPick() === null) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  } catch { }
}

export function toggleTheme(): 'light' | 'dark' {
  const isDark = document.documentElement.classList.contains('dark');
  const newTheme: 'light' | 'dark' = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  return newTheme;
}
