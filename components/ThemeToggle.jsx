'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Detect theme on initial mount
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);

    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (!mounted) {
    return (
      <div className="h-8 w-8 rounded-lg bg-navy-900/40 border border-navy-750 animate-pulse" />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 dark:border-navy-750/80 dark:bg-navy-900/60 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/70 transition-all duration-300 hover:scale-110 active:scale-95 shadow-sm group cursor-pointer"
      title={theme === 'dark' ? 'Activate Light Mode' : 'Activate Dark Mode'}
    >
      <span className="sr-only">Toggle Theme</span>
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 text-amber-500 transition-transform duration-500 group-hover:rotate-90 group-hover:scale-110" />
      ) : (
        <Moon className="h-4 w-4 text-lime-600 transition-transform duration-500 group-hover:-rotate-45 group-hover:scale-110" />
      )}
    </button>
  );
}
