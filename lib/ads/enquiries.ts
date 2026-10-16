/**
 * Advertiser onboarding — the "Advertise With Us" desk.
 *
 * The top rotating banner used to point at `example.com` placeholders: a dead
 * link under a live ad. Every house creative now lands on `/advertise`, and this
 * module is the landing page's backend: the rate card the advertiser picks from,
 * a validating enquiry store, and the queue the staff portal works through.
 *
 * Storage goes through the shared cache manager (Upstash Redis when configured,
 * in-process memory otherwise) with an in-process copy, so a Redis blip never
 * loses a lead that the fan just submitted.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';

/** Leads are kept for a year; the queue itself is capped. */
const ENQUIRY_TTL_S = 365 * 24 * 60 * 60;
const MAX_ENQUIRIES = 400;

export type AdPackageId =
  | 'pitch-side'
  | 'half-time-takeover'
  | 'matchday-sponsor'
  | 'league-shelf'
  | 'multi-view-branded';

export interface AdPackage {
  id: AdPackageId;
  name: string;
  nameAr: string;
  /** Where the creative actually appears. */
  placement: string;
  placementAr: string;
  /** Monthly price in minor units (centimes) — MAD, the platform's currency. */
  priceMinor: number;
  /** Indicative monthly impressions the placement receives. */
  reach: string;
  blurb: string;
  blurbAr: string;
  featured?: boolean;
}

/** MAD prices, displayed as `1,800 MAD` style on the landing page. */
export const AD_PACKAGES: readonly AdPackage[] = [
  {
    id: 'pitch-side',
    name: 'Pitch-side slot',
    nameAr: 'لوحة جانب الملعب',
    placement: 'Top rotating banner (7s loop, every page)',
    placementAr: 'البانر الدوار أعلى كل الصفحات (كل 7 ثوان)',
    priceMinor: 180_000,
    reach: '~120k impressions / month',
    blurb: 'The first thing every fan sees on the home feed, with your own house creative — no third-party scripts.',
    blurbAr: 'أول ما يراه المشجع في الصفحة الرئيسية، بتصميم خاص بعلامتك وبدون سكربتات خارجية.',
    featured: true,
  },
  {
    id: 'half-time-takeover',
    name: 'Half-time takeover',
    nameAr: 'سيطرة شوط الاستراحة',
    placement: 'Match centre + live chat, 15 minutes per fixture',
    placementAr: 'مركز المباراة والدردشة المباشرة، 15 دقيقة لكل مباراة',
    priceMinor: 420_000,
    reach: '~35k live fans / matchday',
    blurb: 'Own the break: your brand on the scoreboard rail while every fan waits for the second half.',
    blurbAr: 'سيطر على الاستراحة: علامتك على شريط النتيجة بينما ينتظر الجميع انطلاق الشوط الثاني.',
  },
  {
    id: 'matchday-sponsor',
    name: 'Matchday sponsor',
    nameAr: 'راعي يوم المباراة',
    placement: 'Fixture card + goal alerts + handpicked preview',
    placementAr: 'بطاقة المباراة + تنبيهات الأهداف + معاينة المباراة',
    priceMinor: 750_000,
    reach: '~180k impressions / matchday',
    blurb: 'Your name rides every goal alert and the live countdown for one marquee fixture.',
    blurbAr: 'اسمك يرافق كل تنبيه هدف والعد التنازلي لمباراة قمة واحدة.',
  },
  {
    id: 'league-shelf',
    name: 'League shelf',
    nameAr: 'رف الدوري',
    placement: 'Leagues shelf + standings header',
    placementAr: 'رف الدوريات + رأس جدول الترتيب',
    priceMinor: 260_000,
    reach: '~90k impressions / month',
    blurb: 'A permanent branded row on the leagues carousel, visible from every competition page.',
    blurbAr: 'صف مخصص بعلامتك في شريط الدوريات، ظاهر من كل صفحة مسابقة.',
  },
  {
    id: 'multi-view-branded',
    name: 'Multi-View sponsor',
    nameAr: 'راعي الشاشات المتعددة',
    placement: 'Four-screen Multi-View frames + VIP paywall',
    placementAr: 'شاشات العرض الرباعي + بوابة VIP',
    priceMinor: 330_000,
    reach: '~60k impressions / month',
    blurb: 'Premium, ad-free fans see your mark between the streams — a rare, high-intent surface.',
    blurbAr: 'جمهور VIP بدون إعلانات يرى علامتك بين الشاشات — مساحة نادرة وعالية التفاعل.',
  },
] as const;

const PACKAGE_IDS: readonly string[] = AD_PACKAGES.map((row) => row.id);

export function findAdPackage(id: unknown): AdPackage | undefined {
  return typeof id === 'string' ? AD_PACKAGES.find((row) => row.id === id) : undefined;
}

export type AdEnquiryStatus = 'new' | 'contacted' | 'won' | 'lost';
export const AD_ENQUIRY_STATUSES: readonly AdEnquiryStatus[] = ['new', 'contacted', 'won', 'lost'];

export interface AdEnquiry {
  id: string;
  /** Human reference quoted in the confirmation ("LL-ADS-7F3K"). */
  reference: string;
  brand: string;
  contact: string;
  email: string;
  phone: string;
  packageId: AdPackageId;
  /** Free-form monthly budget, optional. */
  budget: string;
  message: string;
  /** Which house creative they clicked, when they arrived from the banner. */
  partner: string;
  status: AdEnquiryStatus;
  at: number;
  /** Auto-reply count so the desk can see whether the lead was acknowledged. */
  acknowledged: boolean;
}

export interface AdEnquiryStore {
  leads: AdEnquiry[];
  updatedAt: number;
}

const memory: { store: AdEnquiryStore | null } = { store: null };
const KEY = 'limon:ads:enquiries:v1';
let sequence = 0;

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '').trim() : '').slice(0, max);

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Deterministic-enough, collision-checked reference code. */
function referenceFor(now: number, salt: number): string {
  let code = '';
  let seed = (now % 2147483647) + salt * 7919;
  for (let index = 0; index < 4; index += 1) {
    seed = (seed * 48271) % 2147483647;
    code += REFERENCE_ALPHABET[seed % REFERENCE_ALPHABET.length];
  }
  return `LL-ADS-${code}`;
}

export interface EnquiryInput {
  brand?: unknown;
  contact?: unknown;
  email?: unknown;
  phone?: unknown;
  packageId?: unknown;
  budget?: unknown;
  message?: unknown;
  partner?: unknown;
}

export type EnquiryResult =
  | { ok: true; enquiry: AdEnquiry }
  | { ok: false; error: string; errorAr: string; field?: string };

/** RFC-lite email check: one @, a dot in the domain, no whitespace. */
export function isBusinessEmail(value: unknown): boolean {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim());
}

async function readStore(): Promise<AdEnquiryStore> {
  try {
    const stored = await getCacheManager().get<AdEnquiryStore>(KEY);
    if (stored && Array.isArray(stored.leads)) {
      const store: AdEnquiryStore = { leads: stored.leads.filter(isEnquiry), updatedAt: Number(stored.updatedAt) || 0 };
      memory.store = store;
      return store;
    }
  } catch (err) {
    logger.warn('Ad enquiry store read failed; using the in-process queue', { error: String(err) });
  }
  return memory.store ?? { leads: [], updatedAt: 0 };
}

function isEnquiry(row: unknown): row is AdEnquiry {
  if (!row || typeof row !== 'object') return false;
  const value = row as AdEnquiry;
  return typeof value.id === 'string' && typeof value.brand === 'string' && typeof value.email === 'string';
}

async function writeStore(store: AdEnquiryStore): Promise<AdEnquiryStore> {
  const clean: AdEnquiryStore = { leads: store.leads.slice(0, MAX_ENQUIRIES), updatedAt: Date.now() };
  memory.store = clean;
  try {
    await getCacheManager().set(KEY, clean, ENQUIRY_TTL_S);
  } catch (err) {
    logger.warn('Ad enquiry store write failed; kept in process', { error: String(err) });
  }
  return clean;
}

/** The rate card plus the queue summary, for the landing page + staff desk. */
export async function enquirySnapshot(): Promise<{ packages: readonly AdPackage[]; leads: AdEnquiry[]; counts: Record<AdEnquiryStatus, number> }> {
  const store = await readStore();
  const counts: Record<AdEnquiryStatus, number> = { new: 0, contacted: 0, won: 0, lost: 0 };
  for (const lead of store.leads) counts[lead.status] += 1;
  return { packages: AD_PACKAGES, leads: store.leads, counts };
}

/** Every lead, newest first (the staff portal's advertiser queue). */
export async function listEnquiries(): Promise<AdEnquiry[]> {
  return (await readStore()).leads.slice().sort((a, b) => b.at - a.at);
}

/**
 * Validates and files an advertiser enquiry. Nothing the browser sends is
 * trusted: the package must be on the rate card and every field is length-capped
 * and stripped of markup, so a lead can never carry a script into the portal.
 */
export async function submitEnquiry(input: EnquiryInput, now = Date.now()): Promise<EnquiryResult> {
  const brand = clean(input?.brand, 80);
  const contact = clean(input?.contact, 80);
  const email = clean(input?.email, 120).toLowerCase();
  const phone = clean(input?.phone, 40);
  const budget = clean(input?.budget, 40);
  const message = clean(input?.message, 900);
  const partner = clean(input?.partner, 40);
  const pkg = findAdPackage(input?.packageId) ?? AD_PACKAGES[0];

  if (brand.length < 2) {
    return { ok: false, field: 'brand', error: 'Tell us the brand or company name.', errorAr: 'اكتب اسم الشركة أو العلامة.' };
  }
  if (contact.length < 2) {
    return { ok: false, field: 'contact', error: 'Who should we reply to?', errorAr: 'من هو المسؤول للتواصل؟' };
  }
  if (!isBusinessEmail(email)) {
    return { ok: false, field: 'email', error: 'A valid business email is required.', errorAr: 'البريد الإلكتروني المهني مطلوب.' };
  }
  if (message.length < 10) {
    return { ok: false, field: 'message', error: 'Give us one line about the campaign (10 characters or more).', errorAr: 'اكتب سطراً عن الحملة (10 أحرف على الأقل).' };
  }

  const store = await readStore();
  sequence += 1;
  let reference = referenceFor(now, sequence);
  const taken = new Set(store.leads.map((lead) => lead.reference));
  let guard = 0;
  while (taken.has(reference) && guard < 20) {
    sequence += 1;
    guard += 1;
    reference = referenceFor(now, sequence);
  }

  const enquiry: AdEnquiry = {
    id: `ad-${now}-${sequence}`,
    reference,
    brand,
    contact,
    email,
    phone,
    packageId: pkg.id,
    budget,
    message,
    partner,
    status: 'new',
    at: now,
    acknowledged: false,
  };

  const next = await writeStore({ leads: [enquiry, ...store.leads], updatedAt: now });
  const saved = next.leads.find((lead) => lead.id === enquiry.id) ?? enquiry;
  return { ok: true, enquiry: saved };
}

export type EnquiryUpdate = { ok: true; enquiry: AdEnquiry } | { ok: false; error: string };

/** Moves a lead through the pipeline (staff desk: new → contacted → won/lost). */
export async function updateEnquiry(id: unknown, status: unknown, now = Date.now()): Promise<EnquiryUpdate> {
  if (typeof id !== 'string' || !id) return { ok: false, error: 'Missing enquiry id.' };
  if (typeof status !== 'string' || !(AD_ENQUIRY_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Unknown status.' };
  }
  const store = await readStore();
  const index = store.leads.findIndex((lead) => lead.id === id);
  if (index < 0) return { ok: false, error: 'That enquiry no longer exists.' };
  const enquiry: AdEnquiry = { ...store.leads[index], status: status as AdEnquiryStatus, acknowledged: true };
  const leads = [...store.leads];
  leads[index] = enquiry;
  await writeStore({ leads, updatedAt: now });
  return { ok: true, enquiry };
}

/** Test helper: clears the in-process queue. */
export function resetAdEnquiryMemory(): void {
  memory.store = null;
  sequence = 0;
}

/** Formats minor units (centimes) as a MAD price string. */
export function formatMad(priceMinor: number): string {
  const value = Math.max(0, Math.round(Number(priceMinor) || 0)) / 100;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} MAD`;
}

export { PACKAGE_IDS as AD_PACKAGE_IDS };
