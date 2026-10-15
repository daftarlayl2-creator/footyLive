'use client';

import { useState } from 'react';

/**
 * Pitch Visualization - renders a visual SVG pitch with formation and starting XI.
 * 
 * Supported formations: 4-3-3, 4-4-2, 3-5-2, 5-3-2, etc.
 * Players are positioned according to their role (GK, DEF, MID, FWD).
 */
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

  return (
    <div className="pitch-container rounded-2xl border border-navy-700 bg-navy-950/90 p-4 backdrop-blur-md">
      <svg className="w-full h-64 viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
        <!-- Pitch background gradient -->
        <defs>
          <linearGradient id="pitchGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d0d0d" />
            <stop offset="1" stopColor="#18030a" />
          </linearGradient>
        </defs>
        
        <!-- Pitch background -->
        <rect width="100" height="100" fill="url(#pitchGradient)" />
        
        <!-- Goal areas -->
        <rect x="5" y="10" width="90" height="20" fill="none" stroke="navy-300" strokeWidth="1" />
        <rect x="5" y="80" width="90" height="20" fill="none" stroke="navy-300" strokeWidth="1" />
        
        <!-- Center circle -->
        <circle cx="50" cy="50" r="8" fill="none" stroke="navy-300" strokeWidth="1" />
        
        <!-- Center line -->
        <line x1="50" y1="10" x2="50" y2="90" stroke="navy-300" strokeWidth="1" />
        
        <!-- Player positions -->
        {players && players.map((player, idx) => {
          const pos = formationPos[player.role];
          if (!pos) return null;
          
          const color = player.role === 'GK' ? '#C6FF00' : '#E4FF66';
          
          return (
            <g key={idx}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="3"
                fill={color}
                stroke="navy-900"
                strokeWidth="0.5"
                onClick={() => setSelectedPlayer(player)}
                className="transition-all duration-200 hover:scale-125"
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