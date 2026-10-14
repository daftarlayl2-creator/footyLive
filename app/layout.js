import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';
import { Database, Radio } from 'lucide-react';

export const metadata = {
  title: 'EVIV Live — Real-Time Football Scores & Live Streams',
  description:
    'EVIV Live tracks every football match of the day with real-time scores, live match statistics and premium ad-free streams.',
  applicationName: 'EVIV Live',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a192f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0a192f" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('theme');
                if (saved === 'light' || (!saved && window.matchMedia('(prefers-color-scheme: light)').matches)) {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            `
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.error('SW registration failed:', err);
                  });
                });
              }
            `
          }}
        />
      </head>
      <body className="antialiased min-h-screen relative bg-navy-50 text-navy-900 dark:bg-navy-950 dark:text-zinc-100 flex flex-col items-center transition-colors duration-300 w-full" suppressHydrationWarning>
        {/* Ambient brand glows */}
        <div className="glow-orb glow-orb-lime w-[600px] h-[600px] -top-[200px] -left-[150px] opacity-[0.06] dark:opacity-20 transition-opacity duration-300" />
        <div className="glow-orb glow-orb-navy w-[500px] h-[500px] top-[40%] -right-[150px] opacity-10 dark:opacity-30 transition-opacity duration-300" />
        <div className="glow-orb glow-orb-lime w-[600px] h-[600px] -bottom-[220px] left-[10%] opacity-[0.05] dark:opacity-[0.14] transition-opacity duration-300" />

        {/* Sticky Glassmorphic Header */}
        <header className="sticky top-0 z-50 border-b border-navy-200/70 bg-white/75 dark:border-navy-800 dark:bg-navy-950/80 backdrop-blur-md transition-colors duration-300 flex justify-center w-full">
          <div className="flex min-h-16 w-full max-w-6xl mx-auto items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
            {/* Brand lockup: eagle glyph stacked above the EVIV Live wordmark */}
            <a href="/" className="flex flex-col items-center group transition-all leading-none">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-navy-700 via-navy-850 to-navy-950 ring-1 ring-lime-500/35 shadow-[0_0_14px_-4px_rgba(50,205,50,0.55)] group-hover:ring-lime-400/70 group-hover:shadow-[0_0_22px_-2px_rgba(50,205,50,0.75)] group-hover:scale-105 transition-all duration-300">
                <BrandLogo className="h-6 w-6" />
              </span>
              <span className="mt-1 text-[15px] font-extrabold tracking-tight text-navy-900 dark:text-white group-hover:text-lime-500 dark:group-hover:text-lime-400 transition-colors">
                EVIV <span className="brand-gradient-text">Live</span>
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-navy-400 dark:text-navy-300/80">
                Real&nbsp;·&nbsp;Live&nbsp;·&nbsp;Football
              </span>
            </a>

            <div className="flex items-center gap-2 sm:gap-3.5">
              <a
                href="/channels"
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-navy-200 dark:border-navy-750 text-navy-600 dark:text-zinc-300 hover:text-lime-600 dark:hover:text-lime-400 hover:border-lime-500/40 hover:bg-lime-500/5 transition-all"
              >
                <Radio className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Live Channels</span>
                <span className="sm:hidden">Channels</span>
              </a>
              <a
                href="/multistream"
                className="text-xs font-bold px-3.5 py-1.5 rounded-lg lime-cta tracking-wide"
              >
                Multi-View
              </a>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content wrapper */}
        <main className="relative z-10 w-full flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 flex-1">
          <div className="w-full max-w-6xl mx-auto flex flex-col items-stretch">
            {children}
          </div>
        </main>

        {/* Beautiful Simple Footer */}
        <footer className="relative z-10 border-t border-navy-200/70 dark:border-navy-800 py-8 px-4 bg-white/60 dark:bg-navy-950/90 transition-all duration-300 flex justify-center w-full">
          <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left text-xs text-navy-500 dark:text-zinc-500 px-4">
            <p className="flex items-center gap-2">
              <BrandLogo className="h-4 w-4 shrink-0" />
              <span>
                © {new Date().getFullYear()} EVIV Live. Live fixtures and statistics are fetched from public sports data
                providers; all streaming sources are aggregated from third-party networks.
              </span>
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href="/api-hub"
                className="font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 dark:border-navy-800 bg-navy-50/60 dark:bg-navy-900/40 text-navy-600 dark:text-zinc-400 hover:text-lime-600 dark:hover:text-lime-400 hover:border-lime-500/40 hover:bg-lime-500/5 active:scale-95 transition-all"
              >
                <Database className="h-3.5 w-3.5" />
                <span>API Developer Hub</span>
              </a>
              <a
                href="https://github.com/daftarlayl2-creator/footyLive"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 dark:border-navy-800 bg-navy-50/60 dark:bg-navy-900/40 text-navy-600 dark:text-zinc-400 hover:text-lime-600 dark:hover:text-lime-400 hover:border-lime-500/40 hover:bg-lime-500/5 active:scale-95 transition-all"
              >
                <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.82 1.102.82 2.222v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
