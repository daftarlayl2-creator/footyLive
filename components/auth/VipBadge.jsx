'use client';

import { useId } from 'react';
import { tierForPlan, vipTierRank } from '@/lib/vip/tiers';

/**
 * Tiered animated VIP badge (Bronze / Silver / Gold Trophy / Diamond).
 *
 * A colour-coded SVG emblem sized like the verified seal, so it sits next to
 * names in chat, on profiles and on pricing cards without layout jumps:
 *   bronze → medal  · weekly-silver → shield · monthly-gold → trophy ·
 *   annual-diamond → gem. A soft halo breathes behind the emblem and a shine
 *   sweeps across it; both freeze under prefers-reduced-motion (globals.css).
 */
/** planId back-map for callers that pass a tier id string (tierForPlan is plan-keyed). */
const PLAN_OF_TIER = { bronze: 'match', silver: 'weekly', gold: 'monthly', diamond: 'annual' };

export default function VipBadge({ tier, planId, size = 16, className = '', title, withLabel = false }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const def =
    (tier && typeof tier === 'object' && tier.emblem ? tier : null) ||
    (typeof tier === 'string' && PLAN_OF_TIER[tier] ? tierForPlan(PLAN_OF_TIER[tier]) : null) ||
    (vipTierRank(tier) >= 0 ? tierForPlan(PLAN_OF_TIER[tier]) : null) ||
    tierForPlan(planId);
  const gradId = `vip-badge-grad-${id}`;
  if (!def) return null;
  const px = Math.max(10, Math.min(80, Math.round(Number(size) || 16)));
  const label = title || `${def.label} supporter`;
  return (
    <span
      role="img"
      aria-label={label}
      className={`vip-badge vip-badge--${def.id} ${withLabel ? 'vip-badge--labelled' : ''} ${className}`.trim()}
      style={{ '--vip-badge-size': `${px}px`, '--vip-glow': def.glow }}
      data-vip-badge={def.id}
      title={label}
    >
      <span className="vip-badge__glow" aria-hidden="true" />
      <svg viewBox="0 0 24 24" width={px} height={px} aria-hidden="true" focusable="false" className="vip-badge__seal">
        <title>{label}</title>
        <defs>
          <linearGradient id={gradId} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor={def.face} />
            <stop offset="1" stopColor={def.deep} />
          </linearGradient>
        </defs>
        {def.emblem === 'medal' && (
          <g className="vip-badge__art">
            <path d="M8.4 2.6h2.9l1.4 4.6-1.8 1.5zM15.6 2.6h-2.9l-1.4 4.6 1.8 1.5z" fill={def.deep} opacity="0.9" />
            <circle cx="12" cy="14.4" r="6.6" fill={`url(#${gradId})`} stroke={def.edge} strokeWidth="1.15" />
            <circle cx="12" cy="14.4" r="3.4" fill="none" stroke={def.edge} strokeOpacity="0.75" strokeWidth="0.9" />
            <path d="M12 11.4l.95 2.05 2.2.28-1.62 1.5.42 2.17-1.95-1.08-1.95 1.08.42-2.17-1.62-1.5 2.2-.28z" fill={def.ink} opacity="0.85" />
          </g>
        )}
        {def.emblem === 'shield' && (
          <g className="vip-badge__art">
            <path d="M12 2.4l7.2 2.7v6.1c0 4.6-3 8-7.2 10.4-4.2-2.4-7.2-5.8-7.2-10.4V5.1z" fill={`url(#${gradId})`} stroke={def.edge} strokeWidth="1.15" strokeLinejoin="round" />
            <path d="M12 4.6l4.9 1.9v4.6c0 3.2-2 5.7-4.9 7.5-2.9-1.8-4.9-4.3-4.9-7.5V6.5z" fill="none" stroke={def.ink} strokeOpacity="0.35" strokeWidth="0.9" />
            <path d="M8.6 11.6l2.3 2.3 4.5-4.7" fill="none" stroke={def.ink} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          </g>
        )}
        {def.emblem === 'trophy' && (
          <g className="vip-badge__art">
            <path d="M7.8 4.2h8.4v6.1a4.2 4.2 0 0 1-8.4 0z" fill={`url(#${gradId})`} stroke={def.edge} strokeWidth="1.05" strokeLinejoin="round" />
            <path d="M7.6 5.2H4.9v1.9a3.1 3.1 0 0 0 3 3.2M16.4 5.2h2.7v1.9a3.1 3.1 0 0 1-3 3.2" fill="none" stroke={def.edge} strokeWidth="1.4" strokeLinecap="round" />
            <path d="M12 14.4v2.2M8.9 19.4h6.2M10.2 16.9h3.6l.6 2.5H9.6z" fill={def.deep} stroke={def.edge} strokeWidth="0.9" strokeLinejoin="round" />
            <path d="M10.7 7.2l1.3 1.25 2.2-3.4" fill="none" stroke={def.ink} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
          </g>
        )}
        {def.emblem === 'gem' && (
          <g className="vip-badge__art">
            <path d="M12 2.8L20.4 9l-8.4 12.2L3.6 9z" fill={`url(#${gradId})`} stroke={def.edge} strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M12 5.2l2.1 3.8L12 20.4 9.9 9zM3.6 9h16.8M12 2.8L9.9 9M12 2.8L14.1 9" fill="none" stroke={def.edge} strokeOpacity="0.8" strokeWidth="0.8" />
            <circle cx="12" cy="9" r="1.1" fill={def.ink} opacity="0.8" />
          </g>
        )}
      </svg>
      {withLabel && <span className="vip-badge__label">{def.short}</span>}
    </span>
  );
}
