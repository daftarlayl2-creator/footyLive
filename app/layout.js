import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';
import AdSlot from '@/components/ads/AdSlot';
import HeaderNav from '@/components/nav/HeaderNav';
import AccountButton from '@/components/auth/AccountButton';
import WalletBadge from '@/components/coins/WalletBadge';
import NotificationTray from '@/components/inbox/NotificationTray';
import MobileBottomNav from '@/components/nav/MobileBottomNav';
import SoundEffects from '@/components/ui/SoundEffects';
import SoundToggle from '@/components/ui/SoundToggle';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import Link from 'next/link';
import SubscriptionProvider from '@/components/subscription/SubscriptionProvider';
import AdFreeBoundary from '@/components/subscription/AdFreeBoundary';
import AnalyticsBeacon from '@/components/analytics/AnalyticsBeacon';
import { getServerSubscription } from '@/lib/subscription/server';
import { siteUrl } from '@/lib/seo/site';
import { subscriptionAccess } from '@/lib/subscription/plans';

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'Limon Live — Real-Time Football Scores & Live Streams',
  description:
    'Limon Live tracks every football match of the day with real-time scores, live match statistics and reliable live streams.',
  applicationName: 'Limon Live',
  icons: { icon: '/icon.svg' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Draw edge-to-edge; the header and bottom tab bar pad themselves with the safe-area insets.
  viewportFit: 'cover',
  themeColor: '#18030A',
};

export default async function RootLayout({ children }) {
  const subscription = await getServerSubscription();
  return (
    <html lang="en" className="dark scroll-smooth" data-vip-ad-free={String(subscriptionAccess(subscription.grants).adFree)} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Always paint dark mode as default; light mode can be opted into.
              try {
                const stored = localStorage.getItem('theme');
                if (stored === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  // Force dark by default (no 'dark' class = dark mode via color-scheme)
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('color-scheme', 'dark');
                }
              } catch (_) {
                document.documentElement.classList.add('dark');
                document.documentElement.setAttribute('color-scheme', 'dark');
              }
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
        <SubscriptionProvider initial={subscription}>
          {/* Ambient brand glows */}
          <div className="glow-orb glow-orb-lime w-[600px] h-[600px] -top-[200px] -left-[150px] opacity-[0.06] dark:opacity-20 transition-opacity duration-300" />
          <div className="glow-orb glow-orb-navy w-[500px] h-[500px] top-[40%] -right-[150px] opacity-10 dark:opacity-30 transition-opacity duration-300" />
          <div className="glow-orb glow-orb-lime w-[600px] h-[600px] -bottom-[220px] left-[10%] opacity-[0.05] dark:opacity-[0.14] transition-opacity duration-300" />

          {/* The complete SVG lockup stays legible at mobile and desktop sizes. */}
          <header className="sticky top-0 z-50 flex w-full justify-center border-b border-navy-750 bg-navy-950/85 pt-[env(safe-area-inset-top)] text-zinc-100 backdrop-blur-xl backdrop-saturate-150">
            <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 py-1 sm:px-6 lg:px-8">
              <Link href="/" aria-label="Limon Live — home" className="tactile group shrink-0">
                <BrandLogo className="block h-auto w-[106px] transition-transform duration-300 group-hover:scale-105 sm:w-36" />
              </Link>

              <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <HeaderNav />
                {/* Message centre: receipts, payouts and platform notices. */}
                <NotificationTray />
                {/* Desktop/tablet wallet chip; phones get the tab-bar wallet. */}
                <span className="hidden sm:flex">
                  <WalletBadge />
                </span>
                <AccountButton />
                <SoundToggle />
                <ThemeToggle />
              </nav>
            </div>
          </header>

          {/* Content wrapper */}
          <main className="relative z-10 w-full max-w-full flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 flex-1 overflow-x-clip">
            <div className="w-full max-w-6xl mx-auto flex flex-col items-stretch">
              {children}
            </div>
          </main>

          <footer className="relative z-10 flex w-full justify-center border-t border-navy-750 bg-navy-950/90 px-4 py-8 text-zinc-400">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 text-center text-xs md:flex-row md:text-left">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:text-left">
                <BrandLogo className="block h-auto w-28 shrink-0" />
                <p className="max-w-lg leading-relaxed">
                  © {new Date().getFullYear()} Limon Live. Live fixtures and statistics come from public sports data;
                  streams are aggregated from third-party networks.
                </p>
              </div>
              <Link href="/pricing" className="tactile rounded-xl border border-eviv-lime/30 px-4 py-2 font-bold text-eviv-lime">VIP passes · from 3 MAD</Link>
            </div>
          </footer>

          {/* Mobile sticky footer banner (320x50), docked just above the bottom tab bar.
              Body padding (globals.css) reserves room for both so neither covers content. */}
          <AdFreeBoundary><div
            className="mobile-ad-dock fixed inset-x-0 z-[60] flex w-full justify-center overflow-hidden border-t border-navy-750 bg-navy-950/95 py-1 backdrop-blur-md md:hidden"
            data-ad-slot-wrapper="mobile-sticky-footer"
          >
            <AdSlot variant="banner" banner={AD_PLACEMENTS.mobileStickyFooter} label="Advertisement" />
          </div></AdFreeBoundary>

          {/* Native-style bottom tab bar (phones only) */}
          <MobileBottomNav />

          {/* App-wide tap / tab sounds + haptics */}
          <SoundEffects />

          {/* First-party analytics beacon (live visitors, ad stats for /mounadel) */}
          <AnalyticsBeacon />

          {/* Isolated social advertisement — fully unmounted for VIP */}
          <AdSlot variant="social" />
        </SubscriptionProvider>
      </body>
    </html>
  );
}
