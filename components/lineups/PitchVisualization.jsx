'use client';

import { useState } from 'react';

/**
 * Pitch Visualization - renders a visual SVG pitch with formation and starting XI.
 *
 * Supported formations: 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2, etc.
 * Players are positioned according to their role (GK, DEF, MID, FWD).
 */

const LINE_COLOUR = '#d69cae'; // navy-300
const LINE_SHADOW = '#280713'; // navy-900

const DEFAULT_PLAYERS_BY_FORMATION = {
  '4-3-3': [
    { name: 'GK', role: 'GK' },
    { name: 'LB', role: 'DEF' },
    { name: 'LCB', role: 'DEF' },
    { name: 'RCB', role: 'DEF' },
    { name: 'RB', role: 'DEF' },
    { name: 'LCM', role: 'MID' },
    { name: 'CDM', role: 'MID' },
    { name: 'RCM', role: 'MID' },
    { name: 'LW', role: 'FWD' },
    { name: 'ST', role: 'FWD' },
    { name: 'RW', role: 'FWD' },
  ],
  '4-4-2': [
    { name: 'GK', role: 'GK' },
    { name: 'LB', role: 'DEF' },
    { name: 'LCB', role: 'DEF' },
    { name: 'RCB', role: 'DEF' },
    { name: 'RB', role: 'DEF' },
    { name: 'LM', role: 'MID' },
    { name: 'LCM', role: 'MID' },
    { name: 'RCM', role: 'MID' },
    { name: 'RM', role: 'MID' },
    { name: 'LS', role: 'FWD' },
    { name: 'RS', role: 'FWD' },
  ],
};

const POSITIONS = {
  '4-3-3': {
    gk: { x: 50, y: 12 },
    defenders: [
      { x: 15, y: 30 },
      { x: 38, y: 28 },
      { x: 62, y: 28 },
      { x: 85, y: 30 },
    ],
    mids: [
      { x: 28, y: 54 },
      { x: 50, y: 48 },
      { x: 72, y: 54 },
    ],
    forwards: [
      { x: 25, y: 76 },
      { x: 50, y: 82 },
      { x: 75, y: 76 },
    ],
  },
  '4-4-2': {
    gk: { x: 50, y: 12 },
    defenders: [
      { x: 15, y: 30 },
      { x: 38, y: 28 },
      { x: 62, y: 28 },
      { x: 85, y: 30 },
    ],
    mids: [
      { x: 18, y: 52 },
      { x: 40, y: 52 },
      { x: 60, y: 52 },
      { x: 82, y: 52 },
    ],
    forwards: [
      { x: 36, y: 78 },
      { x: 64, y: 78 },
    ],
  },
  '4-2-3-1': {
    gk: { x: 50, y: 12 },
    defenders: [
      { x: 15, y: 30 },
      { x: 38, y: 28 },
      { x: 62, y: 28 },
      { x: 85, y: 30 },
    ],
    mids: [
      { x: 38, y: 46 },
      { x: 62, y: 46 },
      { x: 22, y: 64 },
      { x: 50, y: 64 },
      { x: 78, y: 64 },
    ],
    forwards: [{ x: 50, y: 82 }],
  },
  '3-5-2': {
    gk: { x: 50, y: 12 },
    defenders: [
      { x: 26, y: 28 },
      { x: 50, y: 26 },
      { x: 74, y: 28 },
    ],
    mids: [
      { x: 14, y: 52 },
      { x: 32, y: 52 },
      { x: 50, y: 48 },
      { x: 68, y: 52 },
      { x: 86, y: 52 },
    ],
    forwards: [
      { x: 36, y: 78 },
      { x: 64, y: 78 },
    ],
  },
  '5-3-2': {
    gk: { x: 50, y: 12 },
    defenders: [
      { x: 12, y: 32 },
      { x: 30, y: 28 },
      { x: 50, y: 26 },
      { x: 70, y: 28 },
      { x: 88, y: 32 },
    ],
    mids: [
      { x: 28, y: 54 },
      { x: 50, y: 50 },
      { x: 72, y: 54 },
    ],
    forwards: [
      { x: 36, y: 78 },
      { x: 64, y: 78 },
    ],
  },
};

export default function PitchVisualization({ formation = '4-3-3', players, teamName }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const formationPos = POSITIONS[formation] || POSITIONS['4-3-3'];
  const activePlayers =
    Array.isArray(players) && players.length > 0
      ? players
      : DEFAULT_PLAYERS_BY_FORMATION[formation] || DEFAULT_PLAYERS_BY_FORMATION['4-3-3'];

  // Slot each shirt into its row: GK takes the keeper spot, DEF/MID/FWD fill
  // their row in order. Unknown roles are skipped rather than drawn off-pitch.
  const rowFor = { DEF: 'defenders', MID: 'mids', FWD: 'forwards' };
  const used = { DEF: 0, MID: 0, FWD: 0 };
  const placed = activePlayers
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
      {teamName && (
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-100">{teamName}</span>
          <span className="rounded-md border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-400">
            {formation}
          </span>
        </div>
      )}

      <svg className="w-full h-64" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="pitchGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#280713" />
            <stop offset="1" stopColor="#18030a" />
          </linearGradient>
        </defs>

        {/* Pitch background */}
        <rect width="100" height="100" fill="url(#pitchGradient)" />

        {/* Outer boundary & goal areas */}
        <rect x="5" y="6" width="90" height="88" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />
        <rect x="25" y="6" width="50" height="14" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />
        <rect x="25" y="80" width="50" height="14" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />

        {/* Center circle */}
        <circle cx="50" cy="50" r="9" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />

        {/* Halfway line */}
        <line x1="5" y1="50" x2="95" y2="50" stroke={LINE_COLOUR} strokeWidth="0.8" />

        {/* Player positions */}
        {placed.map(({ player, pos }, idx) => {
          const color = player.role === 'GK' ? '#C6FF00' : '#E4FF66';

          return (
            <g key={`${player.name || 'p'}-${idx}`}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="3.2"
                fill={color}
                stroke={LINE_SHADOW}
                strokeWidth="0.6"
                onClick={() => setSelectedPlayer(player)}
                className="transition-all duration-200 hover:scale-125 cursor-pointer"
              />
              <text
                x={pos.x}
                y={pos.y + 8}
                textAnchor="middle"
                fontSize="4.2"
                fill={color}
                fontWeight="bold"
              >
                {player.name?.substring(0, 8) || '?'}
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
          <span className="text-[9px] ml-2 text-zinc-300">({selectedPlayer.role})</span>
        </div>
      )}
    </div>
  );
}
