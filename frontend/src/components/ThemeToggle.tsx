import { useEffect, useState } from 'react';

export function initializeTheme() {
  // Every fresh launch opens in the presentation's light palette.
  applyTheme('light');
}

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121a17' : '#f4f5f0');
}

export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === 'dark');
    window.addEventListener('swarm-theme-change', sync);
    return () => window.removeEventListener('swarm-theme-change', sync);
  }, []);
  const toggle = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('swarm-theme', next); } catch { /* Preference remains for this visit. */ }
    window.dispatchEvent(new Event('swarm-theme-change'));
  };
  return <button className="theme-toggle" onClick={toggle} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={`Switch to ${dark ? 'light' : 'dark'} mode`}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" />}</svg></button>;
}
