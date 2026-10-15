'use client';

import { RefreshCw, Trophy } from 'lucide-react';
import useLiveMatch from '@/lib/hooks/useLiveMatch';
import ClubLink from '@/components/clubs/ClubLink';
import CrestDrop from '@/components/clubs/CrestDrop';
import BallIcon from '@/components/ui/BallIcon';
import { clockLabel, describePeriod, formatGoalMinutes, scorersBySide } from '@/lib/match/scoreboard';
import LiveMinute from './LiveMinute';

const SIDE_LABEL = { home: 'Home', away: 'Away' };

/** Yellow / red card chips for one team. */
function CardChips({ cards, teamName }) {
  const yellow = cards?.yellow || 0;
  const red = cards?.red || 0;
  if (!yellow && !red) return null;
  const label = [yellow && `${yellow} yellow`, red && `${red} red`].filter(Boolean).join(', ');
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${teamName}: ${label} card${yellow + red > 1 ? 's' : ''}`}>
      {Array.from({ length: Math.min(yellow, 3) }).map((_, i) => (
        <span key={`y${i}`} className="h-3.5 w-2.5 rounded-[2px] bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.45)]" />
      ))}
      {Array.from({ length: Math.min(red, 3) }).map((_, i) => (
        <span key={`r${i}`} className="h-3.5 w-2.5 rounded-[2px] bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
      ))}
    </span>
  );
}

/** Crest drop + name, linked to the club page. */
function TeamIdentity({ side, team, className }) {
  return (
    <div className={`flex min-w-0 flex-col items-center gap-2 text-center ${className}`} data-team={side}>
      <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.2em] text-zinc-300">
        {SIDE_LABEL[side]}
      </span>
      <ClubLink team={{ id: team.id, name: team.name }} className="tactile group/club flex min-w-0 max-w-full flex-col items-center gap-2 rounded-2xl">
        <CrestDrop src={team.badge} name={team.name} size="lg" tone="dark" priority />
        {/* Fixed two-line height keeps both scores on one baseline. */}
        <span className="line-clamp-2 min-h-[2.5em] max-w-full break-words text-sm font-extrabold leading-tight text-white transition-colors group-hover/club:text-lime-300 sm:text-lg">
          {team.name}
        </span>
      </ClubLink>
    </div>
  );
}

/** The team's own score, directly under its crest and name. */
function TeamScore({ side, team, score, lead, className }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`} data-score={side}>
      <span
        className={`score-number glass-dark-tile min-w-[2ch] rounded-2xl px-3 py-0.5 text-center text-4xl font-black leading-tight tabular-nums tracking-tight sm:px-4 sm:text-6xl ${
          lead > 0 ? 'text-lime-300 shadow-[0_0_28px_-6px_rgba(198,255,0,0.45)]' : 'text-white'
        }`}
        aria-label={`${team.name} ${score ?? 0}`}
      >
        {score ?? 0}
      </span>
      <CardChips cards={team.cards} teamName={team.name} />
    </div>
  );
}

/** Scorers grouped per player ("Alphadjo Cissè 15', 32'"), anchored under their own team. */
function ScorerList({ side, teamName, groups, className }) {
  if (!groups.length) return <div className={className} data-scorers={side} />;
  return (
    <ul className={`flex min-w-0 flex-col items-center gap-1.5 text-center ${className}`} data-scorers={side} aria-label={`${teamName} goalscorers`}>
      {groups.map((group, index) => (
        <li key={`${group.player}-${index}`} className="flex max-w-full items-start justify-center gap-1.5 text-[11.5px] leading-snug sm:text-[13px]">
          <BallIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-100" />
          <span className="min-w-0 break-words">
            <span className="font-bold text-zinc-50">{group.player || 'Goal'}</span>{' '}
            <span className="whitespace-nowrap font-semibold tabular-nums text-lime-300">{formatGoalMinutes(group.goals)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Centre divider: status badge, live minute (with DVR), period and competition chip. */
function CenterStatus({ data, className }) {
  const isLive = data.status === 'live';
  const isHalfTime = isLive && String(data.currentMinute || '').toUpperCase() === 'HT';
  const period = describePeriod(data);
  const clock = clockLabel(data);

  return (
    <div className={`flex min-w-[88px] flex-col items-center justify-center gap-2 sm:min-w-[150px] ${className}`} data-scoreboard-center="">
      <span className="h-5 w-px bg-gradient-to-b from-transparent to-white/25 sm:h-8" aria-hidden="true" />

      {isLive && !isHalfTime ? (
        <LiveMinute apiMinute={data.currentMinute} apiMinuteNumber={data.currentMinuteNumber} compact />
      ) : (
        <span
          className={`rounded-full border px-3 py-1 font-mono text-lg font-black tabular-nums sm:text-xl ${
            isHalfTime ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-white/15 bg-white/[0.06] text-zinc-100'
          }`}
        >
          {clock || 'FT'}
        </span>
      )}

      {period && (
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-zinc-300" data-period="">
          {period}
        </span>
      )}

      {data.tournament && (
        <span
          className="inline-flex max-w-[108px] items-center gap-1.5 rounded-full border border-lime-500/25 bg-lime-500/10 px-2 py-1 text-[10px] font-bold text-lime-200 sm:max-w-[180px] sm:px-2.5"
          title={data.tournament}
          data-competition=""
        >
          {data.leagueLogo ? (
            <img src={data.leagueLogo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" loading="lazy" />
          ) : (
            <Trophy className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{data.tournament}</span>
        </span>
      )}

      <span className="h-5 w-px bg-gradient-to-b from-white/25 to-transparent sm:h-8" aria-hidden="true" />
    </div>
  );
}

/**
 * Match-centre scoreboard. Home (crest drop, name, score, scorers, cards) and
 * Away are separate columns on every screen size — never stacked — with the
 * live minute, period and competition in a centre divider. Scorers are
 * grouped per player and anchored under the team they scored for.
 */
export default function LiveScoreboard({ matchId, initial }) {
  const { data, refresh, loading } = useLiveMatch(matchId, initial);
  const groups = scorersBySide({ goals: data.goals, scorers: data.scorers });
  const homeScore = data.homeScore ?? 0;
  const awayScore = data.awayScore ?? 0;

  const home = { id: data.homeId, name: data.homeName || 'Home', badge: data.homeBadge, cards: data.cards?.home };
  const away = { id: data.awayId, name: data.awayName || 'Away', badge: data.awayBadge, cards: data.cards?.away };
  const clock = clockLabel(data);

  return (
    <section
      aria-label={`Scoreboard: ${home.name} ${homeScore}, ${away.name} ${awayScore}${clock ? ` · ${clock}` : ''}`}
      className="glass-dark relative overflow-hidden rounded-3xl px-3 pb-4 pt-5 shadow-[0_0_50px_rgba(198,255,0,0.08)] sm:px-6 sm:pb-6 sm:pt-6"
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-lime-500/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-navy-600/25 blur-3xl" aria-hidden="true" />

      <button
        type="button"
        onClick={refresh}
        className="tactile absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 text-lime-300 backdrop-blur-md transition-colors hover:border-lime-500/40 hover:text-lime-200"
        title="Refresh live data"
        aria-label="Refresh live data"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>

      <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2 gap-y-3 sm:gap-x-6">
        <TeamIdentity side="home" team={home} className="col-start-1 row-start-1" />
        <TeamIdentity side="away" team={away} className="col-start-3 row-start-1" />

        <TeamScore side="home" team={home} score={homeScore} lead={homeScore - awayScore} className="col-start-1 row-start-2" />
        <TeamScore side="away" team={away} score={awayScore} lead={awayScore - homeScore} className="col-start-3 row-start-2" />

        <CenterStatus data={data} className="col-start-2 row-span-2 row-start-1 self-stretch" />

        <ScorerList side="home" teamName={home.name} groups={groups.home} className="col-start-1 row-start-3" />
        <ScorerList side="away" teamName={away.name} groups={groups.away} className="col-start-3 row-start-3" />
      </div>

      {/* Info footer */}
      <div className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-4 text-xs font-semibold text-zinc-300">
        {(data.dateStr || data.timeStr) && (
          <span className="glass-dark-tile rounded-full px-3 py-1">
            {[data.dateStr, data.timeStr].filter(Boolean).join(' · ')}
          </span>
        )}
        {data.venue && data.venue !== 'N/A' && <span className="glass-dark-tile rounded-full px-3 py-1">🏟️ {data.venue}</span>}
        {data.status === 'live' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-500/25 bg-lime-500/10 px-3 py-1 font-bold text-lime-300">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500" />
            Live data · refreshed every 20s
          </span>
        )}
        {data.note && (
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-amber-300">{data.note}</span>
        )}
      </div>
    </section>
  );
}
