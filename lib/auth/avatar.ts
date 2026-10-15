/**
 * Profile pictures: brand presets, client-side downscaling of uploads and
 * data-URL → Blob conversion for Supabase Storage uploads.
 */

export interface AvatarPreset {
  id: string;
  label: string;
  emoji: string;
  from: string;
  to: string;
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'eagle', label: 'EVIV Eagle', emoji: '🦅', from: '#C6FF00', to: '#4e6900' },
  { id: 'striker', label: 'Striker', emoji: '⚽', from: '#38bdf8', to: '#1d4ed8' },
  { id: 'fire', label: 'On fire', emoji: '🔥', from: '#fb923c', to: '#b91c1c' },
  { id: 'trophy', label: 'Champion', emoji: '🏆', from: '#fde047', to: '#a16207' },
  { id: 'keeper', label: 'Keeper', emoji: '🧤', from: '#a78bfa', to: '#5b21b6' },
  { id: 'ultras', label: 'Ultras', emoji: '🥁', from: '#f472b6', to: '#9d174d' },
] as const;

export const AVATAR_SIZE_PX = 192;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function presetFor(avatarUrl: string | null | undefined): AvatarPreset | null {
  if (!avatarUrl || !avatarUrl.startsWith('preset:')) return null;
  return AVATAR_PRESETS.find((p) => `preset:${p.id}` === avatarUrl) ?? null;
}

/** True for avatars that render as an <img> (http(s) or data: URLs). */
export function isImageAvatar(avatarUrl: string | null | undefined): avatarUrl is string {
  return Boolean(avatarUrl && (/^https?:\/\//i.test(avatarUrl) || avatarUrl.startsWith('data:image/')));
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Not a base64 data URL');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Centre-crops an uploaded image to a square and downsizes it to
 * `size`×`size` WebP (JPEG where WebP encoding is unsupported). Browser only.
 */
export async function resizeImageToDataUrl(file: Blob | null | undefined, size = AVATAR_SIZE_PX): Promise<string> {
  if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is larger than 8 MB. Choose a smaller one.');
  const image = await decode(file);
  try {
    const side = Math.min(image.width, image.height);
    if (!side) throw new Error('That image could not be read.');
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is not supported in this browser.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
    const webp = canvas.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    image.close?.();
  }
}
