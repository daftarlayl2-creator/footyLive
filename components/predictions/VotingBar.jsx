'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleX, Handshake, Loader2, Lock, Trophy, Users, Vote } from 'lucide-react';
import { createRowId, getLocalSupabase, useSupabase } from '@/lib/supabase';
import { readLocal, useLocalValue, writeLocal } from '@/lib/hooks/useLocalValue';
import useLiveMatch from '@/lib/hooks/useLiveMatch';
import { NICKNAME_STORAGE_KEY } from '@/lib/chat';
import { useAuth } from '@/lib/auth';
import { RESULTS_STORAGE_KEY, mergeResult, outcomeOf, parseResultCache, serializeResultCache } from '@/lib/fanStats';
import { isPrediction, parseStoredVote, tallyVotes, toPercentages, voteStorageKey } from '@/lib/predictions';
import { playSound } from '@/lib/sound/uiSound';
import CrestDrop from '@/components/clubs/CrestDrop';

const TABLE = 'match_predictions';

/** Wall-clock stamp for vote records and animation keys (event handlers only). */
function timestamp() {
  return Date.now();
}

const BAR_COLORS = { home: 'bg-lime-500', draw: 'bg-zinc-300', away: 'bg-sky-400' };

/**
 * "Who will win?" prediction bar (above the player on /watch).
 *
 * One tap registers the vote instantly: the tally and percentages update
 * optimistically, a check mark pops in with a ring pulse, a confirmation chime
 * plays, and the vote is remembered per match on this device (tap another
 * option to change it). Votes sync through `match_predictions` and live
 * updates arrive over the realtime channel.
 */
export default function VotingBar({ matchId, homeTeam, awayTeam, status, homeScore, awayScore }) {
  const id = String(matchId);
  const { supabase } = useSupabase();
  const [offline, setOffline] = useState(false);
  const client = offline ? getLocalSupabase() : supabase;

  const storedVote = useLocalValue(voteStorageKey(id));
  const myVote = useMemo(() => parseStoredVote(storedVote), [storedVote]);
  const nickname = useLocalValue(NICKNAME_STORAGE_KEY);
  const auth = useAuth();
  const voterName = (auth.status === 'authenticated' && auth.user?.displayName) || nickname || 'EVIV fan';

  // Shares the scoreboard's polled match (no extra requests) to settle the vote at full time.
  const { data: live } = useLiveMatch(status ? id : null, { status, homeScore, awayScore });
  const finalOutcome = live.status === 'finished' ? outcomeOf(live.homeScore, live.awayScore) : null;
  const votingClosed = Boolean(finalOutcome);

  // Remember the final result for the profile's prediction accuracy.
  useEffect(() => {
    if (!finalOutcome) return;
    const cache = parseResultCache(readLocal(RESULTS_STORAGE_KEY));
    if (cache[id]?.status === 'finished') return;
    const result = {
      status: 'finished',
      homeScore: live.homeScore,
      awayScore: live.awayScore,
      homeName: homeTeam?.name,
      awayName: awayTeam?.name,
    };
    writeLocal(RESULTS_STORAGE_KEY, serializeResultCache(mergeResult(cache, id, result, Date.now())));
  }, [finalOutcome, id, live.homeScore, live.awayScore, homeTeam?.name, awayTeam?.name]);

  const [rows, setRows] = useState(() => new Map());
  const [confirmation, setConfirmation] = useState(null);
  const [sync, setSync] = useState('idle');

  useEffect(() => {
    let cancelled = false;

    const upsert = (row) => {
      if (!row || row.id === undefined || !isPrediction(row.prediction)) return;
      if (row.match_id !== undefined && String(row.match_id) !== id) return;
      setRows((prev) => {
        const key = String(row.id);
        if (prev.get(key) === row.prediction) return prev;
        const next = new Map(prev);
        next.set(key, row.prediction);
        return next;
      });
    };

    const load = async () => {
      const { data, error } = await client.from(TABLE).select('id,prediction').eq('match_id', id);
      if (cancelled) return;
      if (error) {
        // Shared backend unreachable: keep voting on this device instead of failing.
        if (client.mode === 'remote') setOffline(true);
        return;
      }
      const next = new Map();
      for (const row of data || []) {
        if (row && row.id !== undefined && isPrediction(row.prediction)) next.set(String(row.id), row.prediction);
      }
      setRows(next);
    };

    load();
    const filter = `match_id=eq.${id}`;
    const channel = client
      .channel(`match-predictions-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE, filter }, (payload) => upsert(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE, filter }, (payload) => upsert(payload.new))
      .subscribe();
    // Remote realtime delivers inserts only; re-tally periodically so switched votes show up too.
    const refresh = client.mode === 'remote' ? setInterval(load, 20000) : null;

    return () => {
      cancelled = true;
      client.removeChannel(channel);
      if (refresh) clearInterval(refresh);
    };
  }, [client, id]);

  const counts = useMemo(() => tallyVotes(rows, myVote), [rows, myVote]);
  const pct = useMemo(() => toPercentages(counts), [counts]);
  const total = counts.home + counts.draw + counts.away;

  const options = [
    { key: 'home', label: homeTeam?.name || 'Home', team: homeTeam },
    { key: 'draw', label: 'Draw', team: null },
    { key: 'away', label: awayTeam?.name || 'Away', team: awayTeam },
  ];
  const labelFor = (key) => options.find((o) => o.key === key)?.label || key;

  const castVote = async (prediction) => {
    const stamp = timestamp();
    if (votingClosed) {
      playSound('tap');
      return;
    }
    if (myVote?.prediction === prediction) {
      setConfirmation({ prediction, key: stamp });
      playSound('tap');
      return;
    }

    const voteId = myVote?.id || createRowId();
    const isChange = Boolean(myVote);

    // Optimistic: persisted locally first, so the tally, highlight and
    // confirmation update in the same frame as the tap.
    writeLocal(voteStorageKey(id), JSON.stringify({ id: voteId, prediction, at: stamp }));
    setConfirmation({ prediction, key: stamp });
    setSync('saving');
    playSound('vote');

    let result = null;
    if (isChange) {
      result = await client.from(TABLE).update({ prediction }).eq('id', voteId);
      // The original vote never reached the backend — insert it instead.
      if (!result.error && Array.isArray(result.data) && result.data.length === 0) result = null;
    }
    if (!result) {
      result = await client.from(TABLE).insert({
        id: voteId,
        match_id: id,
        username: voterName,
        prediction,
        created_at: new Date().toISOString(),
      });
    }

    if (result.error) {
      setSync('device');
      return;
    }
    setRows((prev) => {
      const next = new Map(prev);
      next.set(voteId, prediction);
      return next;
    });
    setSync('saved');
  };

  const subtitle = votingClosed
    ? 'Voting closed at full time'
    : myVote
      ? `Your pick: ${labelFor(myVote.prediction)} · tap another option to change`
      : total === 0
        ? 'Be the first to call it — one tap to vote'
        : 'Tap a result to cast your vote';

  const callWasRight = Boolean(finalOutcome && myVote && myVote.prediction === finalOutcome);

  return (
    <section aria-label="Match prediction" data-sound="none" className="glass-dark relative overflow-hidden rounded-3xl p-4 sm:p-5">
      <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-lime-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-lime-500/15 text-lime-300">
            {votingClosed ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Vote className="h-4.5 w-4.5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold tracking-tight text-white">Who will win?</h2>
            <p className="truncate text-[11px] font-semibold text-zinc-300">{subtitle}</p>
          </div>
        </div>
        <span className="glass-dark-tile inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-zinc-100">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {total} {total === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Pick the winner">
        {options.map((option) => {
          const selected = myVote?.prediction === option.key;
          const justConfirmed = selected && confirmation?.prediction === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => castVote(option.key)}
              aria-pressed={selected}
              aria-disabled={votingClosed ? 'true' : undefined}
              aria-label={`${option.key === 'draw' ? 'Draw' : `${option.label} to win`} — ${pct[option.key]}%`}
              className={`tactile relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center ${
                votingClosed ? 'cursor-default' : 'cursor-pointer'
              } ${
                selected
                  ? 'border-lime-500 bg-lime-500/15 shadow-glow-lime'
                  : `glass-dark-tile ${votingClosed ? '' : 'glass-dark-tile-hover'}`
              } ${finalOutcome === option.key ? 'ring-1 ring-lime-300/70' : ''}`}
            >
              {justConfirmed && (
                <span key={confirmation.key} className="animate-ring-pulse pointer-events-none absolute inset-0 rounded-2xl" />
              )}
              {selected && (
                <span
                  key={`check-${confirmation?.key ?? 'stored'}`}
                  className="animate-pop-in absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-lime-500 text-navy-950 shadow-glow-lime"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              {option.key === 'draw' ? (
                <span className="crest-drop crest-drop--md crest-drop--dark text-zinc-100" aria-hidden="true">
                  <Handshake className="crest-drop__img relative h-5 w-5" aria-hidden="true" />
                </span>
              ) : (
                <CrestDrop src={option.team?.badge} name={option.team?.name || option.label} size="md" tone="dark" />
              )}
              <span
                className={`w-full truncate text-[11px] font-extrabold uppercase tracking-wide ${
                  selected ? 'text-lime-200' : 'text-zinc-200'
                }`}
              >
                {option.label}
              </span>
              <span
                className={`text-lg font-black tabular-nums leading-none ${
                  selected ? 'text-white' : total ? 'text-zinc-50' : 'text-zinc-400'
                }`}
              >
                {pct[option.key]}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Segmented tally bar */}
      <div className="relative mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-black/35 ring-1 ring-white/5" aria-hidden="true">
        {['home', 'draw', 'away'].map((key) => (
          <span
            key={key}
            style={{ width: `${pct[key]}%` }}
            className={`h-full rounded-full transition-[width] duration-700 ease-out-expo ${BAR_COLORS[key]}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] font-bold tabular-nums text-zinc-300">
        <span>{counts.home} home</span>
        <span>{counts.draw} draw</span>
        <span>{counts.away} away</span>
      </div>

      {finalOutcome && myVote && (
        <p
          className={`relative mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-bold ${
            callWasRight ? 'border-lime-500/40 bg-lime-500/10 text-lime-200' : 'border-white/10 bg-white/5 text-zinc-200'
          }`}
          data-vote-outcome={callWasRight ? 'correct' : 'wrong'}
        >
          {callWasRight ? <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleX className="h-3.5 w-3.5" aria-hidden="true" />}
          {callWasRight
            ? `You called it! ${labelFor(finalOutcome)}${finalOutcome === 'draw' ? '' : ' won'} ${live.homeScore}–${live.awayScore}`
            : `Not this time · final score ${live.homeScore}–${live.awayScore}`}
        </p>
      )}

      <p aria-live="polite" className="min-h-[1.25rem] pt-2 text-[11.5px] font-bold">
        {confirmation && (
          <span key={confirmation.key} className="animate-slide-up inline-flex items-center gap-1.5 text-lime-300">
            {sync === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            )}
            Vote counted: {confirmation.prediction === 'draw' ? 'Draw' : `${labelFor(confirmation.prediction)} to win`}
            {sync === 'device' && <span className="font-semibold text-zinc-300">· saved on this device</span>}
          </span>
        )}
      </p>
    </section>
  );
}
