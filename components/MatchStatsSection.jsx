'use client';

import { useState } from 'react';
import { BarChart3, MessageSquare, Users, ChevronDown, ChevronUp } from 'lucide-react';
import PitchVisualization from '@/components/lineups/PitchVisualization';
import ErrorBoundary from '@/components/ErrorBoundary';
import ClubLink from '@/components/clubs/ClubLink';
import CrestDrop from '@/components/clubs/CrestDrop';

function normalizeRole(rawPos) {
  const pos = String(rawPos || '').toUpperCase();
  if (!pos) return null;
  if (pos === 'G' || pos === 'GK' || pos.includes('GOAL')) return 'GK';
  if (pos === 'D' || pos === 'DEF' || pos.includes('BACK') || ['CB', 'LB', 'RB', 'WB', 'LWB', 'RWB', 'CD'].includes(pos)) {
    return 'DEF';
  }
  if (pos === 'M' || pos === 'MID' || pos.includes('MID') || ['CM', 'CDM', 'CAM', 'LM', 'RM', 'DM', 'AM'].includes(pos)) {
    return 'MID';
  }
  if (pos === 'F' || pos === 'FW' || pos === 'FWD' || pos.includes('FORW') || pos.includes('STRIK') || ['ST', 'CF', 'LW', 'RW', 'LF', 'RF'].includes(pos)) {
    return 'FWD';
  }
  return null;
}

function extractTeamLineup(rosterEntry) {
  if (!rosterEntry || typeof rosterEntry !== 'object') {
    return { formation: null, players: undefined };
  }
  // Only the upstream-published formation is ever labelled as such; when the
  // source omits it, the pitch still lays players out by role but says the
  // formation was not published instead of asserting a default.
  const formation = rosterEntry.formation || null;
  const rawList = Array.isArray(rosterEntry.players)
    ? rosterEntry.players
    : Array.isArray(rosterEntry.roster)
      ? rosterEntry.roster.filter((r) => r?.starter !== false)
      : Array.isArray(rosterEntry.lineup)
        ? rosterEntry.lineup
        : [];

  const players = rawList
    .map((item) => {
      const name =
        item?.name ||
        item?.playerName ||
        item?.athlete?.shortName ||
        item?.athlete?.displayName ||
        '';
      const role = normalizeRole(
        item?.role ||
          item?.position?.abbreviation ||
          item?.position?.name ||
          item?.position
      );
      if (!name || !role) return null;
      return { name, role };
    })
    .filter(Boolean)
    .slice(0, 11);

  return {
    formation,
    players: players.length > 0 ? players : undefined,
  };
}

export default function MatchStatsSection({ teamStats = [], commentary = [], rosters = null, homeTeam, awayTeam }) {
  const [showStats, setShowStats] = useState(true);
  const [showLineups, setShowLineups] = useState(true);
  const [showCommentary, setShowCommentary] = useState(false);

  const hasTeamContext = Boolean(homeTeam?.name || awayTeam?.name);
  if (!teamStats.length && !commentary.length && !rosters && !hasTeamContext) return null;

  const rosterArray = Array.isArray(rosters) ? rosters : [];
  const homeRosterRaw =
    rosterArray.find((r) => String(r?.homeAway || '').toLowerCase() === 'home') ||
    rosters?.home ||
    rosterArray[0];
  const awayRosterRaw =
    rosterArray.find((r) => String(r?.homeAway || '').toLowerCase() === 'away') ||
    rosters?.away ||
    rosterArray[1];

  const homeLineup = extractTeamLineup(homeRosterRaw, '4-3-3');
  const awayLineup = extractTeamLineup(awayRosterRaw, '4-4-2');

  return (
    <div className="space-y-5">
      {/* Match Statistics panel */}
      {teamStats.length > 0 && (
        <div className="rounded-2xl border border-navy-750/80 bg-navy-950/80 overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => setShowStats(!showStats)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-bold text-zinc-400 hover:text-white transition-colors border-b border-navy-750 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-500/10 border border-lime-500/20">
                <BarChart3 className="h-4 w-4 text-lime-400" />
              </div>
              <span>Match Statistics</span>
            </span>
            {showStats ? (
              <ChevronUp className="h-4 w-4 text-zinc-300" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-300" />
            )}
          </button>

          {showStats && (
            <div className="px-6 py-6 space-y-5">
              {/* Teams Header row */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                <div className="flex items-center gap-2.5">
                  <CrestDrop src={homeTeam?.badge} name={homeTeam?.name} size="sm" tone="dark" />
                  <ClubLink team={homeTeam} className="text-xs font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:text-lime-400">{homeTeam?.name || 'Home'}</ClubLink>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">Comparison</span>
                <div className="flex items-center gap-2.5">
                  <ClubLink team={awayTeam} className="text-xs font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:text-lime-400">{awayTeam?.name || 'Away'}</ClubLink>
                  <CrestDrop src={awayTeam?.badge} name={awayTeam?.name} size="sm" tone="dark" />
                </div>
              </div>

              {/* Stats Rows */}
              {teamStats[0]?.statistics?.map((stat, idx) => {
                const homeVal = teamStats[0]?.statistics?.[idx]?.displayValue || '-';
                const awayVal = teamStats[1]?.statistics?.[idx]?.displayValue || '-';
                const homePct = teamStats[0]?.statistics?.[idx]?.percentage || 50;
                const awayPct = teamStats[1]?.statistics?.[idx]?.percentage || 50;

                const homeNum = parseFloat(homeVal) || 0;
                const awayNum = parseFloat(awayVal) || 0;
                const homeLeads = homeNum > awayNum;
                const awayLeads = awayNum > homeNum;

                return (
                  <div key={`${stat.name || 'stat'}-${idx}`} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-bold tabular-nums min-w-[3ch] text-left ${homeLeads ? 'text-lime-400' : 'text-zinc-300'}`}>
                        {homeVal}
                      </span>
                      <span className="text-zinc-300 text-[11px] font-bold uppercase tracking-wider">
                        {stat.label || stat.name}
                      </span>
                      <span className={`font-bold tabular-nums min-w-[3ch] text-right ${awayLeads ? 'text-sky-400' : 'text-zinc-300'}`}>
                        {awayVal}
                      </span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-navy-900/80 border border-navy-750 gap-0.5">
                      <div
                        className={`rounded-l-full transition-all duration-700 ease-out ${
                          homeLeads
                            ? 'bg-gradient-to-r from-lime-500 to-lime-400 shadow-[0_0_8px_rgba(198,255,0,0.3)]'
                            : 'bg-gradient-to-r from-lime-500/50 to-lime-400/40'
                        }`}
                        style={{ width: `${homePct}%` }}
                      />
                      <div
                        className={`rounded-r-full transition-all duration-700 ease-out ml-auto ${
                          awayLeads
                            ? 'bg-gradient-to-r from-sky-500 to-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                            : 'bg-gradient-to-r from-sky-500/40 to-sky-400/30'
                        }`}
                        style={{ width: `${awayPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 pt-3 border-t border-navy-750">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-lime-500 to-lime-400" />
                  <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">{homeTeam?.name || 'Home'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-sky-500 to-sky-400" />
                  <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">{awayTeam?.name || 'Away'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tactical Lineups & Pitch Visualization panel */}
      {hasTeamContext && (
        <div className="rounded-2xl border border-navy-750/80 bg-navy-950/80 overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => setShowLineups(!showLineups)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-bold text-zinc-400 hover:text-white transition-colors border-b border-navy-750 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-500/10 border border-lime-500/20">
                <Users className="h-4 w-4 text-lime-400" />
              </div>
              <span>Tactical Lineups &amp; Pitch</span>
            </span>
            {showLineups ? (
              <ChevronUp className="h-4 w-4 text-zinc-300" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-300" />
            )}
          </button>

          {showLineups && (
            <ErrorBoundary name="lineup-field" title="Lineup field hit a snag" message="The tactical pitch could not be drawn from the line-up feed. Statistics and commentary below are unaffected.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                <PitchVisualization
                  teamName={homeTeam?.name || 'Home'}
                  formation={homeLineup.formation || '4-3-3'}
                  formationKnown={Boolean(homeLineup.formation)}
                  players={homeLineup.players}
                />
                <PitchVisualization
                  teamName={awayTeam?.name || 'Away'}
                  formation={awayLineup.formation || '4-3-3'}
                  formationKnown={Boolean(awayLineup.formation)}
                  players={awayLineup.players}
                />
              </div>
            </ErrorBoundary>
          )}
        </div>
      )}

      {/* Commentary log panel */}
      {commentary.length > 0 && (
        <div className="rounded-2xl border border-navy-750/80 bg-navy-950/80 overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => setShowCommentary(!showCommentary)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-bold text-zinc-400 hover:text-white transition-colors border-b border-navy-750 cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-500/10 border border-lime-500/20">
                <MessageSquare className="h-4 w-4 text-lime-400" />
              </div>
              <span>Live Play-by-Play Logs</span>
              <span className="text-[10px] font-bold text-zinc-400 bg-navy-900 border border-navy-750 px-2 py-0.5 rounded-full">
                {commentary.length}
              </span>
            </span>
            {showCommentary ? (
              <ChevronUp className="h-4 w-4 text-zinc-300" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-300" />
            )}
          </button>

          {showCommentary && (
            <div className="px-5 py-4 space-y-0 max-h-80 overflow-y-auto divide-y divide-navy-800/80">
              {commentary.slice(0, 30).map((item, idx) => {
                const eventType = (item.type || '').toLowerCase();
                const isGoal = eventType.includes('goal');
                const isCard = eventType.includes('card') || eventType.includes('yellow') || eventType.includes('red');
                const isSub = eventType.includes('sub');

                let timeBg = 'bg-lime-950/40 border-lime-900/60 text-lime-400';
                if (isGoal) timeBg = 'bg-lime-950/40 border-lime-900/60 text-lime-400';
                else if (isCard) timeBg = 'bg-amber-950/40 border-amber-900/60 text-amber-400';
                else if (isSub) timeBg = 'bg-sky-950/40 border-sky-900/60 text-sky-400';

                return (
                  <div key={idx} className="flex gap-4 text-xs py-3.5 items-start">
                    <span className={`shrink-0 font-mono font-bold w-14 text-center border px-2 py-0.5 rounded-md text-[11px] ${timeBg}`}>
                      {item.time?.displayValue || 'KO'}
                    </span>

                    <div className="space-y-1 flex-1">
                      <p className={`font-medium leading-relaxed ${isGoal ? 'text-lime-300 font-bold' : 'text-zinc-300'}`}>
                        {isGoal && '⚽ '}{isCard && '🟨 '}{isSub && '🔄 '}{item.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
