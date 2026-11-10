import { useEffect, useState } from 'react';

export function useHtmlDark(): boolean {
  const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setDark(read());
    return () => mo.disconnect();
  }, []);
  return dark;
}
