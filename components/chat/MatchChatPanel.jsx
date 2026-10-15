'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase';

/** 
 * Match Chat Panel - persistent real-time chat via Supabase.
 * 
 * Messages are stored in the `match_messages` table and persist across refreshes.
 * Emoji reactions trigger floating animations up the side of the player canvas.
 */
export default function MatchChatPanel({ matchId, userName = 'EVIVUser', userAvatar }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [reactionAnimations, setReactionAnimations] = useState([]);

  const { supabase, isMockMode } = useSupabase();

  // Trigger reaction animation (declared before the effect that subscribes to realtime inserts)
  function triggerReactionAnimation(type) {
    setReactionAnimations((prev) => {
      const newAnim = getReactionAnimation(type);
      return [...prev.filter((a) => a.id !== newAnim.id), newAnim];
    });
  }

  // Generate reaction animation based on emoji type
  function getReactionAnimation(type) {
    const animations = {
      '⚽': { id: 'ball', color: '#C6FF00', icon: '⚽' },
      '🔥': { id: 'fire', color: '#ff6b6b', icon: '🔥' },
      '😱': { id: 'shock', color: '#ff6b6b', icon: '😱' },
      '🟥': { id: 'red', color: '#ff4757', icon: '🟥' },
      '👏': { id: 'clap', color: '#4ecdc4', icon: '👏' },
    };

    return animations[type] || { id: 'generic', color: '#C6FF00', icon: '⚽' };
  }

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
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            // Initial load is ordered oldest-first, so append to keep one order.
            return [...prev, newMessage].slice(-100); // Keep last 100
          });
          // Trigger reaction animation
          triggerReactionAnimation('message');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId]);

  // Send new message
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !supabase || isMockMode) return;

    try {
      const { error } = await supabase.from('match_messages').insert({
        match_id: matchId,
        username: userName,
        avatar: userAvatar || '/placeholder-avater.png',
        message: input.trim(),
        created_at: new Date().toISOString(),
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
    // In a full implementation, would also send to Supabase
  };

  // Clear old animations
  useEffect(() => {
    const timer = setTimeout(() => {
      setReactionAnimations([]);
    }, 3000);
    return () => clearTimeout(timer);
  }, [reactionAnimations]);

  return (
    <div className="chat-panel fixed right-0 top-0 bottom-0 w-72 border-l border-navy-750 bg-navy-950/95 backdrop-blur-md padding-6 shadow-2xl z-40">
      <div className="h-full flex flex-col">
        {/* Chat header */}
        <div className="border-b border-navy-700 pb-3 mb-3">
          <h3 className="font-bold text-zinc-100 text-sm">
            Match Chat · {matchId}
          </h3>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto flex-1 space-y-2 flex-1 pr-2">
          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 max-w-xs px-2 py-1 rounded-lg bg-navy-900/50 text-zinc-300 text-xs${
                idx === messages.length - 1 ? 'border-t border-lime-500/30' : ''
              }`}
            >
              <img
                src={msg.avatar}
                alt={msg.username}
                className="h-5 w-5 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{msg.username}</p>
                <p className="mt-0.5 line-clamp-2">{msg.message}</p>
              </div>
            </div>
          ))}

          {messages.length === 0 && (
            <p className="text-zinc-500 text-xs py-4 text-center">
              No messages yet. Be the first to chat!
            </p>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-navy-700 p-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-lg bg-navy-900 border border-navy-700 px-3 py-1.5 text-zinc-300 focus:outline-none focus:ring-lime-500/30"
              disabled={!isConnected}
              aria-label="Chat message"
            />
            <button
              type="submit"
              disabled={!isConnected || !input.trim()}
              className="rounded-lg bg-lime-500 px-3 py-1.5 text-[10px] font-bold text-navy-900 hover:bg-lime-400 transition-colors"
              aria-label="Send message"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Reaction bar below chat */}
      <div className="mt-4 flex gap-2 padded-bottom">
        <button
          onClick={() => handleReaction('⚽')}
          className={`p-1.5 rounded-md hover:bg-lime-500/20 transition-colors cursor-pointer${
            reactionAnimations.some((a) => a.id === 'ball') ? 'border-lime-500' : ''
          }`}
          title="Celebrate goal"
        >
          ⚽
        </button>
        <button
          onClick={() => handleReaction('🔥')}
          className={`p-1.5 rounded-md hover:bg-lime-500/20 transition-colors cursor-pointer${
            reactionAnimations.some((a) => a.id === 'fire') ? 'border-lime-500' : ''
          }`}
          title="Highlight moment"
        >
          🔥
        </button>
        <button
          onClick={() => handleReaction('🟥')}
          className={`p-1.5 rounded-md hover:bg-lime-500/20 transition-colors cursor-pointer${
            reactionAnimations.some((a) => a.id === 'red') ? 'border-lime-500' : ''
          }`}
          title="Red card"
        >
          🟥
        </button>
        <button
          onClick={() => handleReaction('👏')}
          className={`p-1.5 rounded-md hover:bg-lime-500/20 transition-colors cursor-pointer${
            reactionAnimations.some((a) => a.id === 'clap') ? 'border-lime-500' : ''
          }`}
          title="Great play"
        >
          👏
        </button>
      </div>
    </div>
  );
}