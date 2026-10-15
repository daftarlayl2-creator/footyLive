'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

const emptySubscribe = () => () => {};

function readInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function ThemeToggle() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem('theme', nextTheme);
    } catch {
      /* storage unavailable; this session can still switch */
    }
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  if (!mounted) {
    return <div className="h-9 w-9 rounded-xl border border-navy-750 bg-navy-900/60 animate-pulse" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-sound="toggle"
      className="tactile group flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-navy-750 bg-navy-900 text-lime-500 shadow-sm hover:border-lime-500/50 hover:bg-lime-500/10"
      title={theme === 'dark' ? 'Activate Light Mode' : 'Activate Dark Mode'}
      aria-label={theme === 'dark' ? 'Activate Light Mode' : 'Activate Dark Mode'}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 transition-transform duration-500 group-hover:rotate-90" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-500 group-hover:-rotate-45" aria-hidden="true" />
      )}
    </button>
  );
}
