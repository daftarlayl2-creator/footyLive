'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase';

/**
 * Prediction Voting Bar - appears above the StreamPlayer on /watch.
 *
 * "Who will win?" [Home] | [Draw] | [Away].
 *
 * Percentages are animated dynamically. Votes are persisted in Supabase table
 * `match_predictions`.
 */
export default function VotingBar({ matchId, homeTeam, awayTeam }) {
  const [votes, setVotes] = useState({ home: 0, draw: 0, away: 0 });
  /** @type {['home' | 'draw' | 'away' | null, (v: 'home' | 'draw' | 'away' | null) => void]} */
  const [myVote, setMyVote] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { supabase, isMockMode } = useSupabase();

  // Load vote counts from Supabase on mount
  useEffect(() => {
    if (!supabase) return;

    const loadVotes = async () => {
      try {
        const { data, error } = await supabase
          .from('match_predictions')
          .select('prediction')
          .eq('match_id', matchId);

        if (error) throw error;

        // Tally one row per cast prediction (`match_predictions` stores no count column).
        const counts = { home: 0, draw: 0, away: 0 };
        for (const row of data || []) {
          if (row?.prediction in counts) counts[row.prediction] += 1;
        }
        setVotes(counts);
      } catch (err) {
        console.error('Failed to load predictions:', err);
        setVotes({ home: 0, draw: 0, away: 0 });
      }
    };

    loadVotes();

    // Set up real-time subscription for new votes
    const channel = supabase
      .channel(`match-predictions-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_predictions',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const newVote = payload.new;
          setVotes((prev) => {
            const key = newVote?.prediction;
            if (!(key in prev)) return prev;
            return { ...prev, [key]: prev[key] + 1 };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId]);

  // Cast a vote
  const handleVote = async (prediction) => {
    if (!supabase || isMockMode) {
      setMyVote(prediction);
      setVotes((prev) => {
        if (!(prediction in prev)) return prev;
        return { ...prev, [prediction]: prev[prediction] + 1 };
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('match_predictions').insert({
        match_id: matchId,
        prediction,
        username: 'EVIVUser',
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      setMyVote(prediction);
    } catch (err) {
      console.error('Failed to cast vote:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalVotes = votes.home + votes.draw + votes.away;
  const homePct = totalVotes > 0 ? Math.round((votes.home / totalVotes) * 100) : 33;
  const drawPct = totalVotes > 0 ? Math.round((votes.draw / totalVotes) * 100) : 34;
  const awayPct = totalVotes > 0 ? Math.max(0, 100 - homePct - drawPct) : 33;

  return (
    <div className="prediction-bar rounded-xl border border-navy-750 bg-navy-950/80 p-4 shadow-md space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-zinc-200 text-xs font-extrabold uppercase tracking-wider">
          ⚽ Who will win? · {homeTeam?.name || 'Home'} vs {awayTeam?.name || 'Away'}
        </span>
        <span className="text-[11px] font-semibold text-zinc-400">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      {/* Vote buttons */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => handleVote('home')}
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            myVote === 'home'
              ? 'border-lime-400 bg-lime-500/20 text-lime-300'
              : 'border-lime-500/30 bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 hover:text-lime-300'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isLoading}
        >
          <span className="truncate">{homeTeam?.name || 'Home'}</span>
          <span className="font-mono font-extrabold shrink-0">{homePct}% ({votes.home})</span>
        </button>

        <button
          type="button"
          onClick={() => handleVote('draw')}
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            myVote === 'draw'
              ? 'border-lime-400 bg-lime-500/20 text-lime-300'
              : 'border-lime-500/30 bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 hover:text-lime-300'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isLoading}
        >
          <span>Draw</span>
          <span className="font-mono font-extrabold shrink-0">{drawPct}% ({votes.draw})</span>
        </button>

        <button
          type="button"
          onClick={() => handleVote('away')}
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            myVote === 'away'
              ? 'border-lime-400 bg-lime-500/20 text-lime-300'
              : 'border-lime-500/30 bg-lime-500/10 text-lime-400 hover:bg-lime-500/20 hover:text-lime-300'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={isLoading}
        >
          <span className="truncate">{awayTeam?.name || 'Away'}</span>
          <span className="font-mono font-extrabold shrink-0">{awayPct}% ({votes.away})</span>
        </button>
      </div>

      {/* Percentage bars */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-full bg-navy-800/50 overflow-hidden">
          <div
            style={{ width: `${homePct}%` }}
            className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
              myVote === 'home' ? 'bg-lime-500' : 'bg-lime-500/40'
            }`}
          />
        </div>
        <div className="rounded-full bg-navy-800/50 overflow-hidden">
          <div
            style={{ width: `${drawPct}%` }}
            className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
              myVote === 'draw' ? 'bg-lime-500' : 'bg-lime-500/40'
            }`}
          />
        </div>
        <div className="rounded-full bg-navy-800/50 overflow-hidden">
          <div
            style={{ width: `${awayPct}%` }}
            className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
              myVote === 'away' ? 'bg-lime-500' : 'bg-lime-500/40'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
