'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleX, Coins, Handshake, Loader2, Lock, ShieldCheck, Trophy, Users, Vote } from 'lucide-react';
import { createRowId, getLocalSupabase, useSupabase } from '@/lib/supabase';
import EvivCoin from '@/components/coins/EvivCoin';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';
import { cacheBalance, notifyWalletUpdated } from '@/lib/hooks/useWallet';
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
  const voterName = (auth.status === 'authenticated' && auth.user?.displayName) || nickname || 'Limon fan';

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
  /**
   * Server-authoritative prediction state (/api/predictions/{id}).
   *
   * The backend owns the single-vote-per-user rule, the kick-off lock and the
   * coin settlement, so the tally it returns wins over anything this browser
   * remembers: a tampered localStorage entry never unlocks a locked match and
   * never invents a taller tally.
   */
  const [server, setServer] = useState(null);
  const [serverTally, setServerTally] = useState(null);
  const [awarded, setAwarded] = useState(0);

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

  // Server tally when it has answered; the local store is the offline fallback.
  const counts = useMemo(() => {
    if (serverTally && serverTally.total >= 0) return { home: serverTally.home, draw: serverTally.draw, away: serverTally.away };
    return tallyVotes(rows, myVote);
  }, [serverTally, rows, myVote]);
  const pct = useMemo(() => toPercentages(counts), [counts]);
  const total = counts.home + counts.draw + counts.away;

  const loadServerState = useCallback(async () => {
    try {
      const response = await fetch(`/api/predictions/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || typeof data.total !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    loadServerState().then((data) => {
      if (cancelled || !data) return;
      setServer(data);
      setServerTally({
        home: Number(data.counts?.home) || 0,
        draw: Number(data.counts?.draw) || 0,
        away: Number(data.counts?.away) || 0,
        total: Number(data.total) || 0,
      });
      // The backend's record of this fan's pick is authoritative — a
      // hand-edited localStorage entry is corrected, never trusted.
      if (isPrediction(data.mine) && data.mine !== myVote?.prediction) {
        writeLocal(voteStorageKey(id), JSON.stringify({
          id: myVote?.id || `server-${id}`,
          prediction: data.mine,
          at: Date.now(),
        }));
      }
      if (Number(data.credited) > 0) setAwarded(Number(data.credited));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadServerState]);

  /** Locked by the backend (kick-off passed) — even if this device disagrees. */
  const serverLocked = Boolean(server?.locked);
  const serverReward = Number(server?.reward) || REWARD_CORRECT_PREDICTION;

  const options = [
    { key: 'home', label: homeTeam?.name || 'Home', team: homeTeam },
    { key: 'draw', label: 'Draw', team: null },
    { key: 'away', label: awayTeam?.name || 'Away', team: awayTeam },
  ];
  const labelFor = (key) => options.find((o) => o.key === key)?.label || key;

  const castVote = async (prediction) => {
    const stamp = timestamp();
    if (votingClosed || serverLocked) {
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

    // 1) The server decides first: it enforces one vote per user+match, the
    //    kick-off lock and the coin payout. A refusal (409) overrides the
    //    optimistic local vote — the backend always wins.
    let serverAccepted = false;
    try {
      const response = await fetch(`/api/predictions/${encodeURIComponent(id)}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prediction, username: voterName }),
      });
      const data = await response.json().catch(() => null);
      if (data && typeof data.total === 'number') {
        setServer(data);
        setServerTally({
          home: Number(data.counts?.home) || 0,
          draw: Number(data.counts?.draw) || 0,
          away: Number(data.counts?.away) || 0,
          total: Number(data.total) || 0,
        });
        if (isPrediction(data.mine) && data.mine !== prediction) {
          // The refused vote never counted: restore the server's record.
          writeLocal(voteStorageKey(id), JSON.stringify({ id: voteId, prediction: data.mine, at: stamp }));
        }
      }
      if (!response.ok) {
        setSync('server');
        playSound('error');
        if (response.status === 409) setServer((prev) => ({ ...(prev || {}), locked: Boolean(data?.locked ?? true) }));
        return;
      }
      const credited = Number(data?.credited) || 0;
      if (credited > 0) {
        // Mirror the server-confirmed credit in the header wallet (display only).
        setAwarded(credited);
        try {
          const walletResponse = await fetch('/api/wallet', { cache: 'no-store' });
          if (walletResponse.ok) {
            const wallet = await walletResponse.json();
            if (typeof wallet?.balance === 'number') cacheBalance(wallet.balance);
          }
        } catch { /* header refresh stays best-effort */ }
        notifyWalletUpdated({ credited });
      }
      serverAccepted = true;
    } catch {
      // Offline: the local vote stands, and the fan is told it is device-only.
      serverAccepted = false;
    }

    // 2) Shared chat/prediction store (Supabase when configured, local otherwise).
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
      setSync(serverAccepted ? 'saved' : 'device');
      return;
    }
    setRows((prev) => {
      const next = new Map(prev);
      next.set(voteId, prediction);
      return next;
    });
    setSync(serverAccepted ? 'saved' : 'device');
  };

  const locked = votingClosed || serverLocked;
  const rewardCopy = `${serverReward.toLocaleString('en-US')} EVIV Coins if you are right`;
  const subtitle = votingClosed
    ? 'Voting closed at full time'
    : serverLocked
      ? 'Locked at kick-off — predictions are closed for this match'
      : myVote
        ? `Your pick: ${labelFor(myVote.prediction)} · tap another option to change`
        : total === 0
          ? `Be the first to call it — ${rewardCopy}`
          : `Tap a result to cast your vote — ${rewardCopy}`;

  const callWasRight = Boolean(finalOutcome && myVote && myVote.prediction === finalOutcome);

  return (
    <section aria-label="Match prediction" data-sound="none" className="glass-dark relative overflow-hidden rounded-3xl p-4 sm:p-5">
      <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-lime-500/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-lime-500/15 text-lime-300">
            {locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Vote className="h-4.5 w-4.5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold tracking-tight text-white">Who will win?</h2>
            <p className="truncate text-[11px] font-semibold text-zinc-300">{subtitle}</p>
          </div>
        </div>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <span
            className="glass-dark-tile inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-eviv-lime"
            title={`Server-verified reward: ${serverReward.toLocaleString('en-US')} Limon Coins per correct full-time prediction`}
            data-prediction-reward={serverReward}
          >
            <EvivCoin size={16} spin={false} />
            +{serverReward.toLocaleString('en-US')}
          </span>
          <span className="glass-dark-tile inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-zinc-100">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {total} {total === 1 ? 'vote' : 'votes'}
          </span>
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
              aria-disabled={locked ? 'true' : undefined}
              aria-label={`${option.key === 'draw' ? 'Draw' : `${option.label} to win`} — ${pct[option.key]}%`}
              className={`tactile relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center ${
                locked ? 'cursor-default' : 'cursor-pointer'
              } ${
                selected
                  ? 'border-lime-500 bg-lime-500/15 shadow-glow-lime'
                  : `glass-dark-tile ${locked ? '' : 'glass-dark-tile-hover'}`
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
            ? `You called it! ${labelFor(finalOutcome)}${finalOutcome === 'draw' ? '' : ' won'} ${live.homeScore}–${live.awayScore} · +${serverReward.toLocaleString('en-US')} EVIV Coins`
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
            {sync === 'saved' && <span className="inline-flex items-center gap-1 font-semibold text-zinc-300">· <ShieldCheck className="h-3 w-3" aria-hidden="true" /> verified on the server</span>}
            {sync === 'device' && <span className="font-semibold text-zinc-300">· saved on this device</span>}
            {sync === 'server' && <span className="font-semibold text-amber-200">· refused by the server (locked or already counted)</span>}
          </span>
        )}
        {awarded > 0 && (
          <span key={`credit-${awarded}`} className="animate-slide-up flex items-center gap-1.5 text-eviv-lime">
            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
            +{awarded.toLocaleString('en-US')} EVIV Coins credited to your wallet
          </span>
        )}
      </p>
    </section>
  );
}
