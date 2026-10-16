/**
 * Inbox receipts: the words the platform uses when something happens to a fan.
 *
 * Kept in one module so a Rewards Store purchase, an admin coin adjustment and a
 * moderation ban all read as part of the same product: an English line, an
 * Arabic line, a reference id and the rows of numbers the fan can audit.
 */
import { referenceFor, type InboxKind, type InboxSenderId } from '@/lib/inbox';
import type { RewardDefinition } from '@/lib/rewards/catalog';
import type { CoinGrant, WalletState } from '@/lib/coins/server';

export interface ReceiptDraft {
  from: InboxSenderId;
  kind: InboxKind;
  subject: string;
  subjectAr: string;
  body: string;
  bodyAr: string;
  priority?: 'normal' | 'high' | 'urgent';
  lines?: Array<{ label: string; value: string }>;
  action?: { href: string; label: string };
  replyWithinMinutes?: number;
  ticketRef?: string;
  reference?: string;
}

const coins = (value: number) => `${Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString('en-US')}`;
const date = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateAr = (ms: number) =>
  new Date(ms).toLocaleDateString('ar-MA', { day: '2-digit', month: 'long', year: 'numeric' });

/** A Rewards Store purchase: what was bought, what was paid, what is now live. */
export function redemptionReceipt(reward: RewardDefinition, grant: CoinGrant | undefined, wallet: WalletState): ReceiptDraft {
  const reference = referenceFor('RCPT', grant?.id ?? reward.id);
  const lines = [
    { label: 'Reward', value: reward.title },
    { label: 'Coins spent', value: `−${coins(reward.cost)}` },
    { label: 'New balance', value: coins(wallet.balance) },
  ];
  if (reward.kind === 'vip' && grant) lines.push({ label: 'Valid until', value: date(grant.expiresAt) });
  if (reward.kind === 'boost') lines.push({ label: 'Charges armed', value: `×${reward.multiplier ?? 2} · ${reward.charges ?? 1} match(es)` });
  if (reward.kind === 'badge') lines.push({ label: 'Flair', value: 'Live on chat + profile' });

  return {
    from: 'platform',
    kind: 'receipt',
    reference,
    subject: `${reward.title} unlocked — ${coins(reward.cost)} Limon Coins spent`,
    subjectAr: `تم تفعيل ${reward.titleAr} · دُفع ${coins(reward.cost)} عملة ليمون`,
    body:
      reward.kind === 'vip'
        ? `Payment confirmed and your balance was deducted instantly. Your ${reward.title} is live now${grant ? ` and runs until ${date(grant.expiresAt)}` : ''}, with the same entitlements as a paid pass: ad-free FHD/4K where the source offers it, low-latency playback and Multi-View.`
        : reward.kind === 'boost'
          ? `Payment confirmed. Your next ${reward.charges ?? 1} correct full-time prediction${(reward.charges ?? 1) > 1 ? 's' : ''} pay out at ×${reward.multiplier ?? 2}. The boost is consumed automatically by the server the moment a reward is credited.`
          : `Payment confirmed. The flair is permanent — it appears next to your name in match chat and on your profile within a few seconds.`,
    bodyAr:
      reward.kind === 'vip'
        ? `تم تأكيد الدفع وخصم الرصيد فوراً. بطاقتك «${reward.titleAr}» نشطة الآن${grant ? ` حتى ${dateAr(grant.expiresAt)}` : ''} وبنفس امتيازات الاشتراك المدفوع: بدون إعلانات، جودة عالية وتشغيل فوري.`
        : reward.kind === 'boost'
          ? `تم تأكيد الدفع. مضاعفة ×${reward.multiplier ?? 2} سارية على أول ${reward.charges ?? 1} توقعات صحيحة، ويسقطها الخادم تلقائياً بعد كل جائزة.`
          : `تم تأكيد الدفع. الشارة دائمة وستظهر بجانب اسمك في الدردشة وفي ملفك الشخصي خلال ثوانٍ.`,
    lines,
    action: reward.kind === 'vip' ? { href: '/pricing', label: 'See my VIP status' } : { href: '/profile#rewards', label: 'Back to the store' },
  };
}

/** A free grant (welcome bonus, support goodwill) credited to the wallet. */
export function coinGrantReceipt(amount: number, wallet: WalletState, note: string): ReceiptDraft {
  return {
    from: 'platform',
    kind: 'coins',
    reference: referenceFor('COIN', `${amount}-${note}`),
    subject: `${amount > 0 ? '+' : '−'}${coins(Math.abs(amount))} Limon Coins applied to your wallet`,
    subjectAr: `تمت ${amount > 0 ? 'إضافة' : 'خصم'} ${coins(Math.abs(amount))} عملة ليمون إلى محفظتك`,
    body: `${note} Your balance is ${coins(wallet.balance)} Limon Coins.`,
    bodyAr: `${note} — أصبح رصيدك ${coins(wallet.balance)} عملة ليمون.`,
    lines: [
      { label: 'Movement', value: `${amount > 0 ? '+' : '−'}${coins(Math.abs(amount))}` },
      { label: 'New balance', value: coins(wallet.balance) },
    ],
    action: { href: '/profile#rewards', label: 'Spend them in the store' },
  };
}

/** VIP status handed out by an operator from /mounadel (or a redeemed pass). */
export function vipGrantReceipt(tier: { label: string; labelAr?: string }, expiresAt: number, note = ''): ReceiptDraft {
  return {
    from: 'admin',
    kind: 'vip',
    priority: 'high',
    reference: referenceFor('VIP', `${tier.label}-${expiresAt}`),
    subject: `${tier.label} unlocked — your account is upgraded`,
    subjectAr: `تم تفعيل ${tier.labelAr ?? tier.label} · تم ترقية حسابك`,
    body: `${note || 'The admin desk applied the tier directly to your account.'} It stays active until ${date(expiresAt)}, and every VIP surface — ad-free playback, FHD/4K sources and Multi-View — is live for you now.${expiresAt <= Date.now() ? ' (This window has already ended.)' : ''}`,
    bodyAr: `${note || 'قام فريق الإدارة بتفعيل الفئة مباشرة على حسابك.'} تبقى فعالة حتى ${dateAr(expiresAt)}، وكل مزايا VIP متاحة لك الآن.`,
    lines: [
      { label: 'Tier', value: tier.label },
      { label: 'Valid until', value: date(expiresAt) },
    ],
    action: { href: '/pricing', label: 'View tier benefits' },
  };
}

export function banReceipt(reason: string): ReceiptDraft {
  return {
    from: 'platform',
    kind: 'moderation',
    priority: 'urgent',
    reference: referenceFor('MOD', reason || 'ban'),
    subject: 'Your fan account has been suspended',
    subjectAr: 'تم تعليق حسابك مؤقتاً',
    body: `Reason on file: ${reason || 'not specified'}. While the account is suspended you cannot vote, earn coins or redeem rewards — your balance is preserved untouched. Appeal from your profile and the support desk answers in minutes.`,
    bodyAr: `السبب المسجل: ${reason || 'غير محدد'.toString()}. أثناء التعليق لا يمكنك التصويت أو جمع العملات أو استبدال الهدايا، مع احتفاظك بكامل رصيدك. يمكنك تقديم تظلم من ملفك وسيرد الدعم خلال دقائق.`,
    action: { href: '/inbox?sender=support', label: 'Appeal to support' },
  };
}

export function unbanReceipt(): ReceiptDraft {
  return {
    from: 'platform',
    kind: 'moderation',
    subject: 'Your account is back online',
    subjectAr: 'حسابك عاد للعمل',
    body: 'The suspension was lifted by the management desk. Predictions, coins and the Rewards Store are available again — nothing was deducted from your balance.',
    bodyAr: 'رفعت الإدارة التعليق عن حسابك. التوقعات والعملات ومتجر الهدايا متاحة من جديد، ولم يُخصم أي مبلغ من رصيدك.',
    action: { href: '/', label: 'Back to the matches' },
  };
}

/** Admin DM / broadcast body from /mounadel. */
export function adminBroadcast(from: InboxSenderId, subject: string, body: string, subjectAr = ''): ReceiptDraft {
  return {
    from,
    kind: from === 'support' ? 'ticket' : 'announcement',
    subject,
    subjectAr,
    body,
    bodyAr: from === 'support' ? body : '',
    ...(from === 'support' ? { replyWithinMinutes: 15, ticketRef: referenceFor('TCK', subject) } : {}),
  };
}
