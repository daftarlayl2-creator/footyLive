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
        // Set default equal distribution
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
      // Mock: just update local state
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
        username: 'EVIVUser', // In production, get from auth
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
  const drawPct = totalVotes > 0 ? Math.round((votes.draw / totalVotes) * 100) : 33;
  const awayPct = totalVotes > 0 ? Math.round((votes.away / totalVotes) * 100) : 33;

  return (
    <div className="prediction-bar border-b border-navy-700 pb-3 mb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-zinc-300 text-sm font-bold">
            ⚽ {homeTeam?.name || 'Home'} vs {awayTeam?.name || 'Away'}
          </span>
        </div>
        
        {/* Vote buttons */}
        <div className="flex gap-3">
          {/* Home */}
          <button
            onClick={() => handleVote('home')}
            className={`flex-1 rounded-lg border border-lime-500/30 bg-lime-500/10 text-lime-400 text-xs font-bold uppercase tracking-wider transition-all hover:bg-lime-500/20 hover:text-lime-300 ${myVote === 'home' ? 'border-lime-500 bg-lime-600/10' : ''} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isLoading}
          >
            <span>{homeTeam?.name || 'Home'}</span>
            <span className="font-bold">{votes.home}</span>
          </button>
          
          {/* Draw */}
          <button
            onClick={() => handleVote('draw')}
            className={`flex-1 rounded-lg border border-lime-500/30 bg-lime-500/10 text-lime-400 text-xs font-bold uppercase tracking-wider transition-all hover:bg-lime-500/20 hover:text-lime-300 ${myVote === 'draw' ? 'border-lime-500 bg-lime-600/10' : ''} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isLoading}
          >
            <span>Draw</span>
            <span className="font-bold">{votes.draw}</span>
          </button>
          
          {/* Away */}
          <button
            onClick={() => handleVote('away')}
            className={`flex-1 rounded-lg border border-lime-500/30 bg-lime-500/10 text-lime-400 text-xs font-bold uppercase tracking-wider transition-all hover:bg-lime-500/20 hover:text-lime-300 ${myVote === 'away' ? 'border-lime-500 bg-lime-600/10' : ''} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isLoading}
          >
            <span>{awayTeam?.name || 'Away'}</span>
            <span className="font-bold">{votes.away}</span>
          </button>
        </div>

        {/* Percentage bars */}
        <div className="flex gap-2 mt-2">
          <div className="flex-1 rounded-full bg-navy-800/50 overflow-hidden">
            <div
              style={{ width: `${homePct}%` }}
              className={`h-2 rounded-full transition-all duration-500 ease-out ${myVote === 'home' ? 'bg-lime-500' : 'bg-lime-500/30' }`}
            ></div>
          </div>
          <div className="flex-1 rounded-full bg-navy-800/50 overflow-hidden">
            <div
              style={{ width: `${drawPct}%` }}
              className={`h-2 rounded-full transition-all duration-500 ease-out ${myVote === 'draw' ? 'bg-lime-500' : 'bg-lime-500/30' }`}
            ></div>
          </div>
          <div className="flex-1 rounded-full bg-navy-800/50 overflow-hidden">
            <div
              style={{ width: `${awayPct}%` }}
              className={`h-2 rounded-full transition-all duration-500 ease-out ${myVote === 'away' ? 'bg-lime-500' : 'bg-lime-500/30' }`}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}