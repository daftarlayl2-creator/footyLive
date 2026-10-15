'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // The server always paints dark. Only a saved light preference overrides it.
    let savedTheme = 'dark';
    try {
      if (localStorage.getItem('theme') === 'light') savedTheme = 'light';
    } catch (_) {
      /* storage unavailable; keep the default */
    }
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem('theme', nextTheme);
    } catch (_) {
      /* storage unavailable; this session can still switch */
    }
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  if (!mounted) {
    return <div className="h-8 w-8 rounded-lg border border-navy-750 bg-navy-900/60 animate-pulse" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-navy-200 bg-white text-lime-700 shadow-sm transition-all hover:scale-110 hover:border-lime-500/50 hover:bg-lime-500/10 active:scale-95 dark:border-navy-750 dark:bg-navy-900 dark:text-lime-500"
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
