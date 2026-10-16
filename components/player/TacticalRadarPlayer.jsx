'use client';

import { useEffect, useRef, useState } from 'react';
import { Radar, Waves } from 'lucide-react';

/**
 * Interactive backup player — simulated tactical radar.
 *
 * When every live feed is offline (the failover chain is exhausted, or a
 * Multi-View tile cannot resolve a single server), the stage never degrades to
 * a black screen or a raw video error: it becomes a live tactical radar with
 * drifting player contacts, a moving ball, a sweeping scan and a slowly
 * evolving set of *simulated* match stats. It is clearly labelled as a
 * simulation, so it can never be mistaken for real fixture data.
 *
 * Everything is drawn on a canvas in `requestAnimationFrame` (with a slow
 * interval driving the stat drift), and every animation handle, interval and
 * listener is released on unmount — no leaks when a real stream takes over.
 * `prefers-reduced-motion` freezes the sweep and blips on a single static frame.
 */

/* Deterministic PRNG (mulberry32) seeded from the match id: the first painted
 * frame is identical on the server and the client, so hydration never sees a
 * mismatch even though the simulation itself is random-looking. */
function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First stats frame, computed from the seed alone (stable across SSR/CSR). */
export function initialSimulatedStats(seedText = 'limon') {
  const rand = mulberry32(hashSeed(`stats:${seedText}`));
  const possession = 44 + Math.floor(rand() * 13);
  return {
    label: 'SIMULATED',
    possession: { home: possession, away: 100 - possession },
    shots: { home: 4 + Math.floor(rand() * 5), away: 3 + Math.floor(rand() * 5) },
    onTarget: { home: 1 + Math.floor(rand() * 3), away: 1 + Math.floor(rand() * 2) },
    corners: { home: Math.floor(rand() * 5), away: Math.floor(rand() * 4) },
    fouls: { home: 3 + Math.floor(rand() * 5), away: 2 + Math.floor(rand() * 6) },
  };
}

/** Clamp + drift one team's stat so the panel always looks plausible. */
function driftStat(value, rand, { min, max, step = 1 }) {
  const move = Math.floor(rand() * (step + 1)) * (rand() > 0.55 ? 1 : 0);
  return Math.max(min, Math.min(max, value + move));
}

/** One stats tick: possession drifts, counting stats only ever creep upward. */
export function nextSimulatedStats(stats, seedText, tick) {
  const rand = mulberry32(hashSeed(`stats:${seedText}:${tick}`));
  const swing = rand() > 0.5 ? 1 : -1;
  const possessionHome = Math.max(35, Math.min(65, stats.possession.home + swing * (rand() > 0.6 ? 1 : 0)));
  return {
    ...stats,
    possession: { home: possessionHome, away: 100 - possessionHome },
    shots: {
      home: driftStat(stats.shots.home, rand, { min: 0, max: 24 }),
      away: driftStat(stats.shots.away, rand, { min: 0, max: 24 }),
    },
    onTarget: {
      home: Math.min(stats.shots.home, driftStat(stats.onTarget.home, rand, { min: 0, max: 12 })),
      away: Math.min(stats.shots.away, driftStat(stats.onTarget.away, rand, { min: 0, max: 12 })),
    },
    corners: {
      home: driftStat(stats.corners.home, rand, { min: 0, max: 15 }),
      away: driftStat(stats.corners.away, rand, { min: 0, max: 15 }),
    },
    fouls: {
      home: driftStat(stats.fouls.home, rand, { min: 0, max: 22 }),
      away: driftStat(stats.fouls.away, rand, { min: 0, max: 22 }),
    },
  };
}

function StatRow({ label, home, away }) {
  const total = home + away || 1;
  return (
    <div className="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 text-[11px]" data-sim-stat={label}>
      <span className="text-right font-black tabular-nums text-lime-300">{home}</span>
      <div>
        <div className="mb-1 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400">{label}</div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="rounded-full bg-lime-400/90" style={{ width: `${(home / total) * 100}%` }} />
          <div className="flex-1 rounded-full bg-sky-400/80" />
        </div>
      </div>
      <span className="font-black tabular-nums text-sky-300">{away}</span>
    </div>
  );
}

/**
 * The backup stage. `matchId` seeds the simulation; `title` is shown on the
 * radar header so viewers know which fixture this radar belongs to.
 */
export default function TacticalRadarPlayer({ matchId = 'limon', title = '', compact = false }) {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState(() => initialSimulatedStats(matchId));

  /* Slow simulated match evolution — one tick every 3.5 s while mounted. */
  useEffect(() => {
    let tick = 0;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      tick += 1;
      setStats((current) => nextSimulatedStats(current, matchId, tick));
    }, 3500);
    return () => clearInterval(id);
  }, [matchId]);

  /* Canvas radar: sweep, drifting contacts and a roaming ball. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduceMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rand = mulberry32(hashSeed(`radar:${matchId}`));
    const contacts = [];
    for (let i = 0; i < 20; i += 1) {
      contacts.push({
        side: i < 10 ? 'home' : 'away',
        x: 0.12 + rand() * 0.76,
        y: 0.12 + rand() * 0.76,
        vx: (rand() - 0.5) * 0.00035,
        vy: (rand() - 0.5) * 0.00035,
        pulse: rand() * Math.PI * 2,
      });
    }
    const ball = { x: 0.5, y: 0.5, target: contacts[Math.floor(rand() * contacts.length)], wait: 0 };

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time) => {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.46;

      ctx.clearRect(0, 0, width, height);

      /* Pitch-tinted backdrop */
      const bg = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.15);
      bg.addColorStop(0, 'rgba(20, 60, 25, 0.55)');
      bg.addColorStop(0.7, 'rgba(8, 32, 16, 0.75)');
      bg.addColorStop(1, 'rgba(6, 12, 8, 0.9)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      /* Rings + crosshair */
      ctx.strokeStyle = 'rgba(154, 255, 90, 0.16)';
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, (radius * ring) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      /* Radar sweep (or a frozen beam when motion is reduced) */
      const sweepAngle = reduceMotion ? -Math.PI / 2 : ((time || 0) / 2600) % (Math.PI * 2);
      const sweep = ctx.createConicGradient
        ? ctx.createConicGradient(sweepAngle, cx, cy)
        : null;
      if (sweep) {
        sweep.addColorStop(0, 'rgba(154, 255, 90, 0.32)');
        sweep.addColorStop(0.08, 'rgba(154, 255, 90, 0.05)');
        sweep.addColorStop(0.22, 'rgba(154, 255, 90, 0)');
        sweep.addColorStop(1, 'rgba(154, 255, 90, 0)');
        ctx.fillStyle = sweep;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(154, 255, 90, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius);
      ctx.stroke();

      /* Drifting player contacts */
      for (const contact of contacts) {
        if (!reduceMotion) {
          contact.x = Math.min(0.92, Math.max(0.08, contact.x + contact.vx));
          contact.y = Math.min(0.92, Math.max(0.08, contact.y + contact.vy));
          if (contact.x <= 0.08 || contact.x >= 0.92) contact.vx *= -1;
          if (contact.y <= 0.08 || contact.y >= 0.92) contact.vy *= -1;
          contact.pulse += 0.025;
        }
        const px = radius * 0.06 + contact.x * radius * 1.88;
        const py = radius * 0.06 + contact.y * radius * 1.88;
        const home = contact.side === 'home';
        const glow = 0.55 + Math.sin(contact.pulse) * 0.25;
        ctx.beginPath();
        ctx.fillStyle = home ? `rgba(154, 255, 90, ${glow})` : `rgba(86, 190, 255, ${glow})`;
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = home ? 'rgba(154, 255, 90, 0.22)' : 'rgba(86, 190, 255, 0.22)';
        ctx.arc(px, py, 7 + Math.sin(contact.pulse) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      /* Ball: hops between contacts */
      if (!reduceMotion) {
        if (ball.wait > 0) ball.wait -= 1;
        else {
          const dx = ball.target.x - ball.x;
          const dy = ball.target.y - ball.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.02) {
            ball.target = contacts[Math.floor(Math.random() * contacts.length)];
            ball.wait = 30 + Math.floor(Math.random() * 60);
          } else {
            ball.x += dx * 0.028;
            ball.y += dy * 0.028;
          }
        }
      }
      const bx = radius * 0.06 + ball.x * radius * 1.88;
      const by = radius * 0.06 + ball.y * radius * 1.88;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.stroke();

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    resize();
    // `draw` self-schedules the next frame unless motion is reduced.
    draw(0);

    const onResize = () => {
      resize();
      if (reduceMotion) draw(0);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [matchId]);

  return (
    <div
      className="relative overflow-hidden rounded-none bg-[#07130b]"
      data-tactical-radar=""
      data-tactical-radar-match={matchId}
    >
      <canvas ref={canvasRef} className={`w-full ${compact ? 'aspect-video' : 'aspect-video'}`} aria-hidden="true" />

      {/* Header chip */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-lime-400/30 bg-black/55 px-3 py-1.5 backdrop-blur-md">
        <Radar className="h-3.5 w-3.5 text-lime-300" aria-hidden="true" />
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-lime-300">Tactical Radar · Backup</span>
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">Simulated</span>
      </div>

      {title ? (
        <p className="pointer-events-none absolute left-3 top-12 max-w-[70%] truncate text-[11px] font-semibold text-zinc-200">
          {title}
        </p>
      ) : null}

      {/* Simulated stats dock */}
      <div className="absolute inset-x-0 bottom-0 border-t border-lime-400/15 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-300">
            <Waves className="h-3 w-3 text-lime-400" aria-hidden="true" />
            Simulated match stats
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">not live data</p>
        </div>
        <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          <StatRow label="Possession" home={`${stats.possession.home}%`} away={`${stats.possession.away}%`} />
          <StatRow label="Shots" home={stats.shots.home} away={stats.shots.away} />
          <StatRow label="On target" home={stats.onTarget.home} away={stats.onTarget.away} />
          <StatRow label="Corners" home={stats.corners.home} away={stats.corners.away} />
          <StatRow label="Fouls" home={stats.fouls.home} away={stats.fouls.away} />
        </div>
      </div>
    </div>
  );
}
