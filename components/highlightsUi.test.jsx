/**
 * Server-render tests for the YouTube highlights overhaul: floating cards
 * (hover lift + neon lime glow + pulsing play button), the seamless in-page
 * player modal (clean YouTube embed inside a lime frame — never a redirect),
 * and the highlights grid with its woven-in native ad rows.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

const router = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
}));

vi.mock('@/lib/utils/favorites', () => ({
  isTeamFavorited: () => false,
  toggleFavoriteTeam: () => {},
  getFavoriteTeams: () => [],
}));

vi.mock('@/lib/utils/highlightsClient', () => ({
  fetchHighlightsSafely: async () => [],
}));

const { default: HighlightCard } = await import('./HighlightCard');
const { default: HighlightPlayerModal } = await import('./HighlightPlayerModal');
const { default: HighlightsGrid } = await import('./HighlightsGrid');
const { default: MatchGrid } = await import('./MatchGrid');

const HIGHLIGHT = {
  id: 'yt-abc123',
  videoId: 'abc123',
  title: 'Arsenal 2-1 Liverpool | Premier League Highlights',
  matchTitle: 'Arsenal 2-1 Liverpool',
  competition: 'Premier League',
  channel: 'Premier League',
  date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  thumbnail: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
  views: 1234567,
  url: 'https://www.youtube.com/watch?v=abc123',
  homeTeam: 'Arsenal',
  awayTeam: 'Liverpool',
};

describe('HighlightCard', () => {
  it('renders the high-res thumbnail with the pulsing lime play button', () => {
    const html = renderToStaticMarkup(
      <HighlightCard highlight={HIGHLIGHT} onPlay={() => {}} />
    );
    // High-res ytimg thumbnail straight from the video id.
    expect(html).toContain('https://i.ytimg.com/vi/abc123/maxresdefault.jpg');
    // Pulsing neon lime play overlay.
    expect(html).toMatch(/live-dot/);
    expect(html).toMatch(/bg-lime-500/);
    expect(html).toMatch(/shadow-\[0_0_28px_rgba\(198,255,0,0\.6\)\]/);
    // Match details.
    expect(html).toContain('Arsenal 2-1 Liverpool | Premier League Highlights');
    expect(html).toContain('Premier League');
    expect(html).toContain('2h ago');
    expect(html).toContain('1.2M'); // compact view count
  });

  it('floats on hover: -translate-y-2 lift with the neon lime glow shadow', () => {
    const html = renderToStaticMarkup(
      <HighlightCard highlight={HIGHLIGHT} onPlay={() => {}} />
    );
    expect(html).toContain('hover:-translate-y-2');
    expect(html).toContain('hover:shadow-[0_0_15px_#C6FF00]');
    expect(html).toContain('transition-all');
    expect(html).toContain('group-hover:scale-[1.06]');
  });

  it('plays through the click handler instead of linking out to YouTube', () => {
    const html = renderToStaticMarkup(
      <HighlightCard highlight={HIGHLIGHT} onPlay={() => {}} />
    );
    expect(html).toContain('type="button"');
    expect(html).not.toContain('href="https://www.youtube.com');
  });

  it('marks the featured (first) card to span two columns', () => {
    const html = renderToStaticMarkup(
      <HighlightCard highlight={HIGHLIGHT} onPlay={() => {}} featured />
    );
    expect(html).toContain('sm:col-span-2');
  });

  it('renders nothing for a missing highlight', () => {
    expect(renderToStaticMarkup(<HighlightCard highlight={null} onPlay={() => {}} />)).toBe('');
  });
});

describe('HighlightPlayerModal', () => {
  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<HighlightPlayerModal highlight={null} onClose={() => {}} />)).toBe('');
  });

  it('embeds a clean, unbranded YouTube player inside a neon lime frame', () => {
    const html = renderToStaticMarkup(
      <HighlightPlayerModal highlight={HIGHLIGHT} onClose={() => {}} />
    );
    // Clean iframe embed params, autoplay on.
    expect(html).toContain('src="https://www.youtube.com/embed/abc123?rel=0&amp;modestbranding=1&amp;controls=1&amp;autoplay=1"');
    expect(html).toMatch(/allowfullscreen/i);
    // Neon lime framed container — native to EVIV Live.
    expect(html).toMatch(/border-2 border-lime-500/);
    expect(html).toMatch(/shadow-\[0_0_40px_rgba\(198,255,0,0\.35\)\]/);
    // Accessible dialog semantics.
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Close player"');
    // Match details in the title bar.
    expect(html).toContain('Arsenal 2-1 Liverpool | Premier League Highlights');
    expect(html).toContain('Premier League');
  });

  it('falls back to raw embed code when no video id is available', () => {
    const html = renderToStaticMarkup(
      <HighlightPlayerModal
        highlight={{ ...HIGHLIGHT, videoId: '', embed: '<iframe src="https://www.youtube.com/embed/xyz"></iframe>' }}
        onClose={() => {}}
      />
    );
    expect(html).toContain('https://www.youtube.com/embed/xyz');
    expect(html).not.toContain('No video available');
  });
});

describe('HighlightsGrid', () => {
  it('renders one floating card per highlight plus a trailing native ad row', () => {
    const list = [1, 2, 3].map((n) => ({ ...HIGHLIGHT, id: `yt-v${n}`, videoId: `v${n}` }));
    const html = renderToStaticMarkup(<HighlightsGrid highlights={list} />);
    expect((html.match(/data-highlight-id=/g) || []).length).toBe(3);
    expect(html).toContain('data-ad-slot="native-banner"');
    expect(html).toContain('hover:-translate-y-2');
  });

  it('weaves a native ad row after every six cards', () => {
    const list = Array.from({ length: 7 }, (_, i) => ({
      ...HIGHLIGHT,
      id: `yt-v${i}`,
      videoId: `v${i}`,
    }));
    const html = renderToStaticMarkup(<HighlightsGrid highlights={list} />);
    // One row after card 6, one trailing row (7 % 6 !== 0).
    expect((html.match(/data-ad-slot="native-banner"/g) || []).length).toBe(2);
  });

  it('shows skeleton cards while loading', () => {
    const html = renderToStaticMarkup(<HighlightsGrid highlights={[]} loading />);
    expect(html).toContain('data-highlights-grid="loading"');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('data-highlight-id=');
  });

  it('shows the empty state (with its ad) when there is nothing to play', () => {
    const html = renderToStaticMarkup(<HighlightsGrid highlights={[]} loading={false} />);
    expect(html).toContain('data-highlights-grid="empty"');
    expect(html).toContain('No recent highlights');
    expect(html).toContain('data-ad-slot="native-banner"');
  });
});

describe('MatchGrid highlights tab', () => {
  it('still renders cleanly with the new card + modal wiring', () => {
    const html = renderToStaticMarkup(
      <MatchGrid matches={[]} defaultTab="highlights" />
    );
    expect(html).toContain('No recent highlights');
    expect(html).toContain('data-ad-slot="native-banner"');
  });
});
