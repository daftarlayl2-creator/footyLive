'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase';

const REACTION_MAP = {
  '⚽': { id: 'ball', color: '#C6FF00', icon: '⚽' },
  '🔥': { id: 'fire', color: '#ff6b6b', icon: '🔥' },
  '😱': { id: 'shock', color: '#ff6b6b', icon: '😱' },
  '🟥': { id: 'red', color: '#ff4757', icon: '🟥' },
  '👏': { id: 'clap', color: '#4ecdc4', icon: '👏' },
};

function getReactionAnimation(type) {
  return REACTION_MAP[type] || { id: 'generic', color: '#C6FF00', icon: '⚽' };
}

/**
 * Match Chat Panel - persistent real-time chat via Supabase (with local fallback in mock mode).
 *
 * Messages are stored in the `match_messages` table and persist across refreshes.
 * Emoji reactions trigger floating animations inside the panel.
 */
export default function MatchChatPanel({ matchId, userName = 'EVIVUser', userAvatar }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [reactionAnimations, setReactionAnimations] = useState([]);

  const { supabase, isMockMode } = useSupabase();

  const triggerReactionAnimation = useCallback((type) => {
    setReactionAnimations((prev) => {
      const newAnim = getReactionAnimation(type);
      return [...prev.filter((a) => a.id !== newAnim.id), newAnim];
    });
  }, []);

  // Load existing messages from Supabase on mount
  useEffect(() => {
    if (!supabase) return;

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('match_messages')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
        setIsConnected(true);
      } catch (err) {
        console.error('Failed to load chat messages:', err);
        setIsConnected(false);
      }
    };

    loadMessages();

    // Set up real-time subscription for new messages
    const channel = supabase
      .channel(`match-chat-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const newMessage = payload.new;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage].slice(-100);
          });
          triggerReactionAnimation('message');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId, triggerReactionAnimation]);

  // Send new message
  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !supabase) return;

    const record = {
      id: `msg-${Date.now()}`,
      match_id: matchId,
      username: userName,
      avatar: userAvatar || '/icon.svg',
      message: text,
      created_at: new Date().toISOString(),
    };

    if (isMockMode) {
      setMessages((prev) => [...prev, record].slice(-100));
      setInput('');
      triggerReactionAnimation('⚽');
      return;
    }

    try {
      const { error } = await supabase.from('match_messages').insert({
        match_id: record.match_id,
        username: record.username,
        avatar: record.avatar,
        message: record.message,
        created_at: record.created_at,
      });

      if (error) throw error;
      setInput('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle emoji reaction
  const handleReaction = (emoji) => {
    triggerReactionAnimation(emoji);
  };

  // Clear old animations
  useEffect(() => {
    if (reactionAnimations.length === 0) return undefined;
    const timer = setTimeout(() => {
      setReactionAnimations([]);
    }, 3000);
    return () => clearTimeout(timer);
  }, [reactionAnimations]);

  return (
    <div className="chat-panel relative flex h-[400px] w-full flex-col rounded-2xl border border-navy-750 bg-navy-950/90 p-4 backdrop-blur-md shadow-xl">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-navy-750 pb-3 mb-3">
        <h3 className="font-extrabold text-zinc-100 text-xs uppercase tracking-wider">
          Live Match Chat
        </h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-lime-400">
          <span className="h-1.5 w-1.5 rounded-full bg-lime-500 live-dot" />
          Online
        </span>
      </div>

      {/* Floating reaction badges */}
      {reactionAnimations.length > 0 && (
        <div className="pointer-events-none absolute right-4 bottom-24 z-20 flex flex-col gap-1.5">
          {reactionAnimations.map((anim) => (
            <span
              key={anim.id}
              className="animate-bounce rounded-full border border-lime-500/40 bg-navy-900/90 px-2 py-1 text-sm shadow-lg"
            >
              {anim.icon}
            </span>
          ))}
        </div>
      )}

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.map((msg, idx) => (
          <div
            key={msg.id || idx}
            className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg bg-navy-900/60 text-zinc-300 text-xs ${
              idx === messages.length - 1 ? 'border border-lime-500/30' : 'border border-navy-800/60'
            }`}
          >
            <img
              src={msg.avatar || '/icon.svg'}
              alt={msg.username || 'User'}
              className="h-5 w-5 rounded-full object-cover shrink-0 bg-navy-950"
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lime-400 text-[11px]">{msg.username}</p>
              <p className="mt-0.5 break-words text-zinc-200">{msg.message}</p>
            </div>
          </div>
        ))}

        {messages.length === 0 && (
          <p className="text-zinc-500 text-xs py-8 text-center">
            No messages yet. Be the first to chat!
          </p>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-navy-750 pt-3 mt-3">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="min-w-0 flex-1 rounded-lg bg-navy-900 border border-navy-750 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
            disabled={!isConnected}
            aria-label="Chat message"
          />
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            className="rounded-lg bg-lime-500 px-3 py-1.5 text-xs font-bold text-navy-950 hover:bg-lime-400 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Send message"
          >
            Send
          </button>
        </form>
      </div>

      {/* Reaction bar below chat */}
      <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-navy-800/60">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">React</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => handleReaction('⚽')}
            className={`px-2 py-1 rounded-md border border-transparent hover:bg-lime-500/20 transition-colors cursor-pointer ${
              reactionAnimations.some((a) => a.id === 'ball') ? 'border-lime-500 bg-lime-500/10' : ''
            }`}
            title="Celebrate goal"
          >
            ⚽
          </button>
          <button
            type="button"
            onClick={() => handleReaction('🔥')}
            className={`px-2 py-1 rounded-md border border-transparent hover:bg-lime-500/20 transition-colors cursor-pointer ${
              reactionAnimations.some((a) => a.id === 'fire') ? 'border-lime-500 bg-lime-500/10' : ''
            }`}
            title="Highlight moment"
          >
            🔥
          </button>
          <button
            type="button"
            onClick={() => handleReaction('🟥')}
            className={`px-2 py-1 rounded-md border border-transparent hover:bg-lime-500/20 transition-colors cursor-pointer ${
              reactionAnimations.some((a) => a.id === 'red') ? 'border-lime-500 bg-lime-500/10' : ''
            }`}
            title="Red card"
          >
            🟥
          </button>
          <button
            type="button"
            onClick={() => handleReaction('👏')}
            className={`px-2 py-1 rounded-md border border-transparent hover:bg-lime-500/20 transition-colors cursor-pointer ${
              reactionAnimations.some((a) => a.id === 'clap') ? 'border-lime-500 bg-lime-500/10' : ''
            }`}
            title="Great play"
          >
            👏
          </button>
        </div>
      </div>
    </div>
  );
}
