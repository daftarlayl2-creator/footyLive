import { describe, expect, it } from 'vitest';
import { MAX_CREATIVE_BYTES, sniffCreativeFormat, validateCreative } from './creativeValidation';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new TextEncoder().encode('RIFFxxxxWEBPVP8 ');
const SVG = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
const HTML = new TextEncoder().encode('<!doctype html><script>1</script>');
const GIF = new TextEncoder().encode('GIF89a');

describe('creative magic-byte validation (Phase 6)', () => {
  it('accepts PNG/JPEG/WEBP by magic bytes, not by name', () => {
    expect(sniffCreativeFormat(PNG)).toBe('png');
    expect(sniffCreativeFormat(JPEG)).toBe('jpeg');
    expect(sniffCreativeFormat(WEBP)).toBe('webp');
    expect(validateCreative(PNG).ok).toBe(true);
  });

  it('rejects scriptable / unsupported formats masquerading as images', () => {
    for (const bytes of [SVG, HTML, GIF]) {
      expect(validateCreative(bytes)).toMatchObject({ ok: false, reason: 'unsupported-format' });
    }
  });

  it('fails closed on empty and oversized payloads', () => {
    expect(validateCreative(new Uint8Array())).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateCreative(null)).toMatchObject({ ok: false, reason: 'empty' });
    const big = new Uint8Array(MAX_CREATIVE_BYTES + 1);
    big.set(PNG);
    expect(validateCreative(big)).toMatchObject({ ok: false, reason: 'too-large' });
  });
});
