'use client';

import { useState } from 'react';

/**
 * Pitch Visualization - renders a visual SVG pitch with formation and starting XI.
 * 
 * Supported formations: 4-3-3, 4-4-2, 3-5-2, 5-3-2, etc.
 * Players are positioned according to their role (GK, DEF, MID, FWD).
 */

const LINE_COLOUR = '#d69cae'; // navy-300
const LINE_SHADOW = '#280713'; // navy-900

export default function PitchVisualization({ formation = '4-3-3', players }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Position players based on formation
  const positions = {
    '4-3-3': {
      gk: { x: 50, y: 5 },
      defenders: [
        { x: 15, y: 20 }, { x: 35, y: 20 }, { x: 65, y: 20 }, { x: 85, y: 20 }
      ],
      mids: [
        { x: 50, y: 45 }, { x: 30, y: 55 }, { x: 70, y: 55 }
      ],
      forwards: [
        { x: 35, y: 75 }, { x: 50, y: 85 }, { x: 65, y: 75 }
      ]
    },
    '4-4-2': {
      gk: { x: 50, y: 5 },
      defenders: [
        { x: 15, y: 20 }, { x: 35, y: 20 }, { x: 65, y: 20 }, { x: 85, y: 20 }
      ],
      mids: [
        { x: 25, y: 40 }, { x: 50, y: 40 }, { x: 75, y: 40 }, { x: 50, y: 60 }
      ],
      forwards: [
        { x: 35, y: 70 }, { x: 65, y: 70 }
      ]
    }
  };

  const formationPos = positions[formation] || positions['4-3-3'];

  // Slot each shirt into its row: GK takes the keeper spot, DEF/MID/FWD fill
  // their row in order. Unknown roles are skipped rather than drawn off-pitch.
  const rowFor = { DEF: 'defenders', MID: 'mids', FWD: 'forwards' };
  const used = { DEF: 0, MID: 0, FWD: 0 };
  const placed = (players || [])
    .map((player) => {
      const role = String(player?.role || '').toUpperCase();
      if (role === 'GK') return { player, pos: formationPos.gk };
      const row = formationPos[rowFor[role]];
      if (!row || !row.length) return { player, pos: null };
      const pos = row[used[role] % row.length];
      used[role] += 1;
      return { player, pos };
    })
    .filter((entry) => entry.pos);

  return (
    <div className="pitch-container rounded-2xl border border-navy-700 bg-navy-950/90 p-4 backdrop-blur-md">
      <svg className="w-full h-64" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {/* Pitch background gradient */}
        <defs>
          <linearGradient id="pitchGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#280713" />
            <stop offset="1" stopColor="#18030a" />
          </linearGradient>
        </defs>

        {/* Pitch background */}
        <rect width="100" height="100" fill="url(#pitchGradient)" />

        {/* Goal areas */}
        <rect x="5" y="10" width="90" height="20" fill="none" stroke={LINE_COLOUR} strokeWidth="1" />
        <rect x="5" y="80" width="90" height="20" fill="none" stroke={LINE_COLOUR} strokeWidth="1" />

        {/* Center circle */}
        <circle cx="50" cy="50" r="8" fill="none" stroke={LINE_COLOUR} strokeWidth="1" />

        {/* Center line */}
        <line x1="50" y1="10" x2="50" y2="90" stroke={LINE_COLOUR} strokeWidth="1" />

        {/* Player positions */}
        {placed.map(({ player, pos }, idx) => {
          const color = player.role === 'GK' ? '#C6FF00' : '#E4FF66';

          return (
            <g key={player.name || idx}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="3"
                fill={color}
                stroke={LINE_SHADOW}
                strokeWidth="0.5"
                onClick={() => setSelectedPlayer(player)}
                className="transition-all duration-200 hover:scale-125 cursor-pointer"
              />
              <text
                x={pos.x}
                y={pos.y + 12}
                textAnchor="middle"
                fontSize="6"
                fill={color}
              >
                {player.name?.substring(0, 4) || '?'}
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Formation label */}
      <p className="mt-2 text-xs text-zinc-400 text-center font-bold uppercase tracking-wider">
        {formation}
      </p>
      
      {/* Selected player info */}
      {selectedPlayer && (
        <div className="mt-2 p-2 rounded bg-lime-500/10 border border-lime-500/30">
          <span className="font-medium text-lime-400">{selectedPlayer.name}</span>
          <span className="text-[9px] ml-2">({selectedPlayer.role})</span>
        </div>
      )}
    </div>
  );
}
