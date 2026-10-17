/**
 * Community match / source submissions (Phase 12).
 *
 * Fans can suggest a missing fixture or an additional (rights-cleared) source.
 * These live in their OWN moderation queue and are **strictly separate from
 * the verified match pipeline**: nothing here can create, edit, score, or
 * change the status of a match, and approving a submission only marks it for
 * human follow-up against an authoritative source — a submission is never
 * promoted to verified data on its own say-so.
 *
 * Storage mirrors the advertiser-enquiry desk: the shared cache manager
 * (Upstash Redis when configured, in-process memory otherwise) with an
 * in-process copy, so the feature works before durable storage is provisioned
 * and never silently pretends to be more durable than it is.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';

const KEY = 'community_submissions_v1';
const TTL_S = 180 * 24 * 60 * 60;
const MAX_SUBMISSIONS = 500;

export type SubmissionKind = 'missing-match' | 'source-suggestion';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export interface CommunitySubmission {
  id: string;
  kind: SubmissionKind;
  title: string;
  detail: string;
  /** Optional related match id (must look like one of ours; unchecked beyond shape). */
  matchId?: string;
  /** Optional source URL — validated http/https, public hosts only. */
  url?: string;
  reporter?: string;
  status: SubmissionStatus;
  /** How many fans flagged this entry (moderation signal only). */
  reports: number;
  at: number;
  updatedAt: number;
}

export interface SubmissionInput {
  kind?: unknown;
  title?: unknown;
  detail?: unknown;
  matchId?: unknown;
  url?: unknown;
  reporter?: unknown;
}

export type SubmissionResult =
  | { ok: true; submission: CommunitySubmission }
  | { ok: false; error: string; field: string };

const KINDS: SubmissionKind[] = ['missing-match', 'source-suggestion'];
const STATUSES: SubmissionStatus[] = ['pending', 'approved', 'rejected', 'removed'];

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.\d+\.\d+\.\d+|::1|\[::1\])$/i;

/** http/https URLs to public hosts only — no credentials, no local/private targets. */
export function isValidSubmissionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    if (!url.hostname || PRIVATE_HOST.test(url.hostname)) return false;
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

const memory: { items: CommunitySubmission[] } = { items: [] };

function isSubmission(row: unknown): row is CommunitySubmission {
  if (!row || typeof row !== 'object') return false;
  const value = row as CommunitySubmission;
  return typeof value.id === 'string' && typeof value.title === 'string' && KINDS.includes(value.kind) && STATUSES.includes(value.status);
}

async function readStore(): Promise<CommunitySubmission[]> {
  try {
    const stored = await getCacheManager().get<{ items?: unknown[] }>(KEY);
    if (stored && Array.isArray(stored.items)) {
      memory.items = stored.items.filter(isSubmission);
      return memory.items;
    }
  } catch (err) {
    logger.warn('Community submission store read failed; using the in-process queue', { error: String(err) });
  }
  return memory.items;
}

async function writeStore(items: CommunitySubmission[]): Promise<void> {
  memory.items = items.slice(0, MAX_SUBMISSIONS);
  try {
    await getCacheManager().set(KEY, { items: memory.items }, TTL_S);
  } catch (err) {
    logger.warn('Community submission store write failed; kept in process', { error: String(err) });
  }
}

export async function listSubmissions(status?: SubmissionStatus): Promise<CommunitySubmission[]> {
  const items = (await readStore()).slice().sort((a, b) => b.at - a.at);
  return status ? items.filter((item) => item.status === status) : items;
}

export async function submitCommunityItem(input: SubmissionInput, now = Date.now()): Promise<SubmissionResult> {
  const kind = KINDS.includes(input?.kind as SubmissionKind) ? (input.kind as SubmissionKind) : null;
  const title = clean(input?.title, 120);
  const detail = clean(input?.detail, 600);
  const reporter = clean(input?.reporter, 60) || undefined;
  const rawUrl = clean(input?.url, 500);
  const rawMatchId = clean(input?.matchId, 80);

  if (!kind) return { ok: false, error: 'Choose what you are submitting.', field: 'kind' };
  if (title.length < 5) return { ok: false, error: 'Give your submission a short title (5+ characters).', field: 'title' };
  if (detail.length < 10) return { ok: false, error: 'Add a little detail so moderators can verify it (10+ characters).', field: 'detail' };
  if (kind === 'source-suggestion' && !rawUrl) return { ok: false, error: 'A source suggestion needs a link.', field: 'url' };
  if (rawUrl && !isValidSubmissionUrl(rawUrl)) return { ok: false, error: 'That link is not a valid public web address.', field: 'url' };
  if (rawMatchId && !/^[\w:.-]{3,80}$/.test(rawMatchId)) return { ok: false, error: 'That match reference looks invalid.', field: 'matchId' };

  const submission: CommunitySubmission = {
    id: `sub_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    detail,
    ...(rawMatchId ? { matchId: rawMatchId } : {}),
    ...(rawUrl ? { url: rawUrl } : {}),
    ...(reporter ? { reporter } : {}),
    status: 'pending',
    reports: 0,
    at: now,
    updatedAt: now,
  };

  const items = await readStore();
  await writeStore([submission, ...items]);
  return { ok: true, submission };
}

/** Staff moderation: approve (for human follow-up), reject, or remove. Never touches match data. */
export async function moderateSubmission(id: unknown, status: unknown, now = Date.now()): Promise<{ ok: boolean; submission?: CommunitySubmission; error?: string }> {
  if (typeof id !== 'string' || !STATUSES.includes(status as SubmissionStatus)) {
    return { ok: false, error: 'Invalid moderation request.' };
  }
  const items = await readStore();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Submission not found.' };
  const updated = { ...items[index], status: status as SubmissionStatus, updatedAt: now };
  const next = items.slice();
  next[index] = updated;
  await writeStore(next);
  return { ok: true, submission: updated };
}

/** Public flag: increments the report count moderators triage by. */
export async function reportSubmission(id: unknown, now = Date.now()): Promise<boolean> {
  if (typeof id !== 'string') return false;
  const items = await readStore();
  const index = items.findIndex((item) => item.id === id && item.status !== 'removed');
  if (index < 0) return false;
  const next = items.slice();
  next[index] = { ...next[index], reports: (next[index].reports || 0) + 1, updatedAt: now };
  await writeStore(next);
  return true;
}

export function resetSubmissionMemory(): void {
  memory.items = [];
}
