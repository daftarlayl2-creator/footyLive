/**
 * Advertiser creative upload validation (Phase 6).
 *
 * File extensions and browser-reported MIME types are NOT trusted: the
 * actual leading bytes decide. Only PNG, JPEG, and WEBP raster images are
 * accepted — SVG (scriptable), GIF, and anything else are rejected outright
 * so a "creative" can never become stored XSS on a public page.
 */

export type CreativeFormat = 'png' | 'jpeg' | 'webp';

export interface CreativeVerdict {
  ok: boolean;
  format: CreativeFormat | null;
  reason: 'empty' | 'too-large' | 'unsupported-format' | null;
}

/** Maximum creative payload (2 MiB) — banners must stay lightweight. */
export const MAX_CREATIVE_BYTES = 2 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function hasPrefix(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Sniff the real format from magic bytes; null when it is none of PNG/JPEG/WEBP. */
export function sniffCreativeFormat(bytes: Uint8Array): CreativeFormat | null {
  if (!bytes || bytes.length === 0) return null;
  if (hasPrefix(bytes, PNG_MAGIC)) return 'png';
  if (hasPrefix(bytes, JPEG_MAGIC)) return 'jpeg';
  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) return 'webp';
  return null;
}

/**
 * Validate an uploaded creative buffer. Accepts Buffer or any Uint8Array.
 * Never throws — malformed input simply fails closed.
 */
export function validateCreative(bytes: Uint8Array | null | undefined): CreativeVerdict {
  if (!bytes || bytes.length === 0) return { ok: false, format: null, reason: 'empty' };
  if (bytes.length > MAX_CREATIVE_BYTES) return { ok: false, format: null, reason: 'too-large' };
  const format = sniffCreativeFormat(bytes);
  if (!format) return { ok: false, format: null, reason: 'unsupported-format' };
  return { ok: true, format, reason: null };
}
