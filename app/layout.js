import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';
import AdSlot from '@/components/ads/AdSlot';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import { Layers, Play, Radio } from 'lucide-react';

export const metadata = {
  title: 'EVIV Live — Real-Time Football Scores & Live Streams',
  description:
    'EVIV Live tracks every football match of the day with real-time scores, live match statistics and reliable live streams.',
  applicationName: 'EVIV Live',
  icons: { icon: '/icon.svg' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#18030A',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Always paint dark first; only an explicit preference opts into light mode.
              try {
                if (localStorage.getItem('theme') === 'light') {
                  document.documentElement.classList.remove('dark');
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
      <body className="antialiased min-h-screen relative bg-navy-50 text-navy-900 dark:bg-navy-950 dark:text-zinc-100 flex flex-col items-center transition-colors duration-300 w-full max-w-full overflow-x-hidden" suppressHydrationWarning>
        {/* Ambient brand glows */}
        <div className="glow-orb glow-orb-lime w-[600px] h-[600px] -top-[200px] -left-[150px] opacity-[0.06] dark:opacity-20 transition-opacity duration-300" />
        <div className="glow-orb glow-orb-navy w-[500px] h-[500px] top-[40%] -right-[150px] opacity-10 dark:opacity-30 transition-opacity duration-300" />
        <div className="glow-orb glow-orb-lime w-[600px] h-[600px] -bottom-[220px] left-[10%] opacity-[0.05] dark:opacity-[0.14] transition-opacity duration-300" />

        {/* The complete SVG lockup stays legible at mobile and desktop sizes. */}
        <header className="sticky top-0 z-50 flex w-full justify-center border-b border-navy-750 bg-navy-950/90 backdrop-blur-md">
          <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 py-1 sm:px-6 lg:px-8">
            <a href="/" aria-label="EVIV Live — home" className="group shrink-0">
              <BrandLogo className="block h-auto w-[106px] transition-transform duration-300 group-hover:scale-105 sm:w-36" />
            </a>

            <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <a
                href="/channels"
                aria-label="Live Channels"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-navy-750 px-2 text-zinc-300 transition-all hover:border-lime-500/50 hover:bg-lime-500/5 hover:text-lime-400 sm:px-3 sm:text-xs sm:font-bold"
              >
                <Radio className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Live Channels</span>
              </a>
              <a
                href="/highlights"
                aria-label="Highlights"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-navy-750 px-2 text-zinc-300 transition-all hover:border-lime-500/50 hover:bg-lime-500/5 hover:text-lime-400 sm:px-3 sm:text-xs sm:font-bold"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Highlights</span>
              </a>
              <a
                href="/multistream"
                aria-label="Multi-View"
                className="lime-cta inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold sm:px-3.5"
              >
                <Layers className="h-4 w-4 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Multi-View</span>
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>

        {/* Content wrapper */}
        <main className="relative z-10 w-full max-w-full flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 flex-1 overflow-x-hidden">
          <div className="w-full max-w-6xl mx-auto flex flex-col items-stretch">
            {children}
          </div>
        </main>

        <footer className="relative z-10 flex w-full justify-center border-t border-navy-750 bg-navy-950/90 px-4 py-8 text-zinc-400">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 text-center text-xs md:flex-row md:text-left">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:text-left">
              <BrandLogo className="block h-auto w-28 shrink-0" />
              <p className="max-w-lg leading-relaxed">
                © {new Date().getFullYear()} EVIV Live. Live fixtures and statistics come from public sports data;
                streams are aggregated from third-party networks.
              </p>
            </div>

          </div>
        </footer>

        {/* Mobile sticky footer banner (320x50) — the fixed bar reserves its space via body padding */}
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex w-full justify-center overflow-hidden border-t border-navy-750 bg-navy-950/95 py-1 backdrop-blur-md md:hidden"
          data-ad-slot-wrapper="mobile-sticky-footer"
        >
          <AdSlot variant="banner" banner={AD_PLACEMENTS.mobileStickyFooter} label="Advertisement" />
        </div>

        {/* Adsterra Social Bar — page-level overlay, injected once after hydration */}
        <AdSlot variant="social" />
      </body>
    </html>
  );
}
