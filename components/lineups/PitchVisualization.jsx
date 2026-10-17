'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Hash, Info, Shirt, Star, UserRound } from 'lucide-react';
import { PITCH, cutoutUrl, formationLayout, placePlayers, rosterRows } from '@/lib/lineups/formations';

/**
 * Pitch Visualization — the tactical grid with interactive player cards.
 *
 * Geometry lives in `lib/lineups/formations.ts` (unit-tested): every outfield
 * line shares one `y`, nodes in a row are at least `PITCH.minNodeGap` apart, and
 * a label is truncated to the characters that fit its row gap. That is what
 * removed the old overlap bugs — nodes of one line used to sit at different
 * heights and long names bled into the neighbouring shirt.
 *
 * Interactions:
 *   • click/tap/Enter a shirt → the card below opens with the player's name,
 *     jersey number, rating and cutout (a branded silhouette stands in when the
 *     provider has no transparent PNG).
 *   • click an empty part of the pitch, press Escape, or click the same shirt
 *     again → closes the card.
 *   • keyboard arrow keys walk the line of players, so the pitch is navigable
 *     without a pointer.
 *
 * Supported formations: 4-3-3, 4-2-3-1, 3-4-3, 4-4-2, 3-5-2, 5-3-2, 4-1-4-1
 * (anything else falls back to 4-3-3).
 */

const LINE_COLOUR = '#d69cae';
const LINE_SHADOW = '#280713';
const KEEPER_COLOUR = '#CCFF00';
const PLAYER_COLOUR = '#E4FF66';

/** Branded silhouette — the honest fallback when there is no cutout. */
function PlayerSilhouette({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Player silhouette" data-player-silhouette="">
      <defs>
        <linearGradient id="lineup-silhouette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#CCFF00" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#6FA300" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="20" r="10" fill="url(#lineup-silhouette)" />
      <path d="M12 60c0-11 9-18 20-18s20 7 20 18z" fill="url(#lineup-silhouette)" />
    </svg>
  );
}

function PlayerPortrait({ player, alt }) {
  const [broken, setBroken] = useState(false);
  const url = cutoutUrl(player);
  if (!url || broken) return <PlayerSilhouette className="h-full w-full" />;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      data-player-cutout=""
      className="h-full w-full object-contain"
    />
  );
}

export default function PitchVisualization({ formation = '4-3-3', formationKnown = true, players, teamName }) {
  const layout = useMemo(() => formationLayout(formation), [formation]);
  const placed = useMemo(() => placePlayers(layout.id, players), [layout.id, players]);
  const roster = useMemo(() => rosterRows(placed), [placed]);
  const [selectedKey, setSelectedKey] = useState(null);

  const keyFor = (entry) => `${entry.rowKey}-${entry.slotIndex}-${entry.number}`;
  const selected = roster.find((entry) => keyFor(entry) === selectedKey) ?? null;

  const toggle = (entry) => setSelectedKey((current) => (current === keyFor(entry) ? null : keyFor(entry)));

  const step = (entry, direction) => {
    const index = roster.findIndex((row) => keyFor(row) === keyFor(entry));
    const next = roster[index + direction];
    if (!next) return;
    setSelectedKey(keyFor(next));
  };

  // No verified lineup from the source: say so instead of drawing
  // placeholder shirts that would read as a confirmed XI.
  if (!players?.length) {
    return (
      <div className="pitch-container rounded-2xl border border-navy-700 bg-navy-950/90 p-4 backdrop-blur-md" data-lineup-unavailable="">
        {teamName && (
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-100">{teamName}</span>
          </div>
        )}
        <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-navy-700 px-4 py-8 text-center">
          <UserRound className="h-6 w-6 text-zinc-500" aria-hidden="true" />
          <p className="text-sm font-bold text-zinc-200">Lineup not available</p>
          <p className="max-w-60 text-[11px] leading-relaxed text-zinc-400">
            The data source has not published a confirmed starting XI for this team yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pitch-container rounded-2xl border border-navy-700 bg-navy-950/90 p-4 backdrop-blur-md" data-pitch-formation={layout.id}>
      {teamName && (
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-100">{teamName}</span>
          {formationKnown ? (
            <span className="rounded-md border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-400">
              {layout.id}
            </span>
          ) : (
            <span className="rounded-md border border-navy-700 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
              Formation not published
            </span>
          )}
        </div>
      )}

      <svg
        className="h-72 w-full sm:h-80"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={`${teamName ? `${teamName} — ` : ''}${layout.id} lineup`}
        onClick={(event) => {
          // A click on the pitch itself (not on a node) closes the card.
          if (event.target === event.currentTarget) setSelectedKey(null);
        }}
      >
        <defs>
          <linearGradient id="pitchGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#280713" />
            <stop offset="1" stopColor="#18030a" />
          </linearGradient>
        </defs>

        {/* Pitch background */}
        <rect width="100" height="100" fill="url(#pitchGradient)" />

        {/* Outer boundary & goal areas */}
        <rect x="5" y="4" width="90" height="92" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />
        <rect x="25" y="4" width="50" height="14" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />
        <rect x="25" y="82" width="50" height="14" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />

        {/* Centre circle + halfway line */}
        <circle cx="50" cy="50" r="9" fill="none" stroke={LINE_COLOUR} strokeWidth="0.8" />
        <line x1="5" y1="50" x2="95" y2="50" stroke={LINE_COLOUR} strokeWidth="0.8" />

        {/* Row guides: one per line, so aligned rows are visually obvious. */}
        {layout.rows
          .filter((row) => row.role !== 'GK')
          .map((row) => (
            <line
              key={`guide-${row.key}`}
              x1={PITCH.minX - 4}
              x2={PITCH.maxX + 4}
              y1={row.y}
              y2={row.y}
              stroke={LINE_COLOUR}
              strokeWidth="0.25"
              strokeDasharray="2 3"
              opacity="0.35"
              data-pitch-row-guide={row.key}
            />
          ))}

        {/* Player nodes: badge with the shirt number + a fitted name label */}
        {roster.map((entry) => {
          const isSelected = keyFor(entry) === selectedKey;
          const colour = entry.role === 'GK' ? KEEPER_COLOUR : PLAYER_COLOUR;
          return (
            <g
              key={keyFor(entry)}
              data-pitch-player={entry.name}
              data-pitch-row={entry.rowKey}
              data-pitch-x={entry.x}
              data-pitch-y={entry.y}
              data-pitch-number={entry.number}
              data-pitch-selected={isSelected ? 'true' : 'false'}
              role="button"
              tabIndex={0}
              aria-label={`${entry.name}, number ${entry.number}, ${entry.role}`}
              onClick={(event) => {
                event.stopPropagation();
                toggle(entry);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(entry);
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  step(entry, 1);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  step(entry, -1);
                } else if (event.key === 'Escape') {
                  setSelectedKey(null);
                }
              }}
              className="cursor-pointer focus:outline-none"
            >
              {isSelected && <circle cx={entry.x} cy={entry.y} r={PITCH.nodeRadius + 2.4} fill={colour} opacity="0.18" />}
              <circle
                cx={entry.x}
                cy={entry.y}
                r={PITCH.nodeRadius}
                fill={colour}
                stroke={LINE_SHADOW}
                strokeWidth="0.7"
                className="transition-transform duration-200 hover:scale-110"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              />
              {/* Jersey number inside the badge — always centred, never collides. */}
              <text
                x={entry.x}
                y={entry.y + PITCH.labelSize * 0.5}
                textAnchor="middle"
                fontSize={PITCH.labelSize + 0.2}
                fontWeight="900"
                fill={LINE_SHADOW}
                pointerEvents="none"
              >
                {entry.number}
              </text>
              {/* Name label, pre-truncated to the row gap by the geometry module. */}
              <text
                x={entry.x}
                y={entry.y + PITCH.nodeRadius + PITCH.labelSize + 0.6}
                textAnchor="middle"
                fontSize={PITCH.labelSize}
                fill={colour}
                fontWeight="bold"
                pointerEvents="none"
                data-pitch-label={entry.label}
              >
                {entry.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Formation footer */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">{layout.id}</p>
        <p className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500">
          <Info className="h-3 w-3" aria-hidden="true" /> {layout.note}
        </p>
      </div>

      {/* Selected player card: name, shirt number, rating and a real cutout. */}
      {selected ? (
        <div className="pitch-player-card mt-3 flex items-center gap-3 rounded-2xl border border-lime-500/35 bg-lime-500/[0.07] p-3" data-pitch-player-card={selected.name}>
          <span className="h-16 w-14 shrink-0 overflow-hidden rounded-xl border border-lime-500/30 bg-navy-900/70">
            <PlayerPortrait player={selected.player} alt={`${selected.name} cutout`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-lime-300">{selected.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-zinc-300">
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3 w-3 text-lime-400" aria-hidden="true" /> {selected.number}
              </span>
              <span className="inline-flex items-center gap-1">
                <Shirt className="h-3 w-3 text-lime-400" aria-hidden="true" /> {selected.role}
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-300" aria-hidden="true" />
                {selected.rating ? `${selected.rating} rating` : 'Rating not reported'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            aria-label="Close the player card"
            className="tactile shrink-0 rounded-lg border border-white/15 p-1.5 text-zinc-300 hover:border-lime-500/40 hover:text-lime-300"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Tap a shirt for the player card
        </p>
      )}

      {/* Roster: the accessible, always-readable list behind the graphic. */}
      <ul role="list" className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3" data-pitch-roster="">
        {roster.map((entry) => (
          <li key={`roster-${keyFor(entry)}`} className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
            <span className="inline-flex h-4 w-5 shrink-0 items-center justify-center rounded bg-lime-500/15 text-[9px] font-black text-lime-300">
              {entry.number}
            </span>
            <span className="truncate">{entry.name}</span>
            <span className="shrink-0 text-[9px] font-black uppercase text-zinc-500">{entry.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
