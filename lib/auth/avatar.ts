/**
 * Profile pictures: brand presets, client-side downscaling of uploads and
 * data-URL → Blob conversion for Supabase Storage uploads.
 *
 * Expanded gallery: 100+ unique cyberpunk, golden lemon, football and beast
 * avatar presets, styled with vibrant dual-stop linear gradients.
 */

export interface AvatarPreset {
  id: string;
  label: string;
  emoji: string;
  from: string;
  to: string;
  category?: 'lemon' | 'cyberpunk' | 'football' | 'beast' | 'neon';
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  // --- 1. Limon & Citrus Core (20 presets) ---
  // Legacy id kept so existing avatars keep resolving; the label is the brand.
  { id: 'eagle', label: 'Limon Lime', emoji: '🍋', from: '#CCFF00', to: '#4e6900', category: 'lemon' },
  { id: 'lemon-gold', label: 'Golden Lemon', emoji: '🪙', from: '#FFE27A', to: '#C8901A', category: 'lemon' },
  { id: 'lemon-crown', label: 'Citrus Emperor', emoji: '👑', from: '#FFF08A', to: '#A16207', category: 'lemon' },
  { id: 'lemon-bot', label: 'Mecha Lemon', emoji: '🤖', from: '#D9F99D', to: '#3F6212', category: 'lemon' },
  { id: 'lemon-acid', label: 'Acid Lime', emoji: '🧪', from: '#A3E635', to: '#1E3A1A', category: 'lemon' },
  { id: 'lemon-zap', label: 'Voltage Citrus', emoji: '⚡', from: '#BEF264', to: '#365314', category: 'lemon' },
  { id: 'lemon-spark', label: 'Solar Lemon', emoji: '✨', from: '#FEF08A', to: '#854D0E', category: 'lemon' },
  { id: 'lemon-fire', label: 'Inferno Lime', emoji: '🔥', from: '#FACC15', to: '#991B1B', category: 'lemon' },
  { id: 'lemon-diamond', label: 'Diamond Zest', emoji: '💎', from: '#E0F2FE', to: '#65A30D', category: 'lemon' },
  { id: 'lemon-ninja', label: 'Lime Shinobi', emoji: '🥷', from: '#84CC16', to: '#142E07', category: 'lemon' },
  { id: 'lemon-star', label: 'Supernova Lemon', emoji: '⭐', from: '#FEF9C3', to: '#CA8A04', category: 'lemon' },
  { id: 'lemon-bubble', label: 'Bubble Crypto', emoji: '🫧', from: '#CCFF00', to: '#164E63', category: 'lemon' },
  { id: 'lemon-target', label: 'Precision Lime', emoji: '🎯', from: '#EAB308', to: '#713F12', category: 'lemon' },
  { id: 'lemon-rocket', label: 'Citrus Boost', emoji: '🚀', from: '#FDE047', to: '#EA580C', category: 'lemon' },
  { id: 'lemon-leaf', label: 'Fresh Sprout', emoji: '🌱', from: '#BBF7D0', to: '#15803D', category: 'lemon' },
  { id: 'lemon-guard', label: 'Lime Vanguard', emoji: '🛡️', from: '#D9F99D', to: '#166534', category: 'lemon' },
  { id: 'lemon-juice', label: 'High Voltage', emoji: '🍹', from: '#FEF08A', to: '#C2410C', category: 'lemon' },
  { id: 'lemon-sunglass', label: 'Cool Citrus', emoji: '😎', from: '#FACC15', to: '#1E293B', category: 'lemon' },
  { id: 'lemon-trophy', label: 'Lemon Champion', emoji: '🏆', from: '#FEF08A', to: '#B45309', category: 'lemon' },
  { id: 'lemon-matrix', label: 'Matrix Citrus', emoji: '🟩', from: '#86EFAC', to: '#064E3B', category: 'lemon' },

  // --- 2. Cyberpunk & Sci-Fi Legends (25 presets) ---
  { id: 'cyber-skull', label: 'Chrome Skull', emoji: '💀', from: '#E2E8F0', to: '#334155', category: 'cyberpunk' },
  { id: 'cyber-hacker', label: 'Netrunner', emoji: '💻', from: '#22D3EE', to: '#0F172A', category: 'cyberpunk' },
  { id: 'cyber-samurai', label: 'Cyber Samurai', emoji: '🗡️', from: '#F43F5E', to: '#4C0519', category: 'cyberpunk' },
  { id: 'cyber-cyborg', label: 'Android IX', emoji: '🦾', from: '#94A3B8', to: '#1E293B', category: 'cyberpunk' },
  { id: 'cyber-grid', label: 'Tron Vector', emoji: '🌐', from: '#38BDF8', to: '#0369A1', category: 'cyberpunk' },
  { id: 'cyber-pilot', label: 'Orbit Pilot', emoji: '🪂', from: '#67E8F9', to: '#155E75', category: 'cyberpunk' },
  { id: 'cyber-laser', label: 'Neon Laser', emoji: '🔦', from: '#F472B6', to: '#831843', category: 'cyberpunk' },
  { id: 'cyber-alien', label: 'Cyber Alien', emoji: '👽', from: '#A7F3D0', to: '#065F46', category: 'cyberpunk' },
  { id: 'cyber-ghost', label: 'Ghost Runner', emoji: '👻', from: '#DDD6FE', to: '#5B21B6', category: 'cyberpunk' },
  { id: 'cyber-synth', label: 'Synth 1984', emoji: '📻', from: '#FB7185', to: '#4C0519', category: 'cyberpunk' },
  { id: 'cyber-eye', label: 'Bionic Eye', emoji: '👁️', from: '#38BDF8', to: '#1E1B4B', category: 'cyberpunk' },
  { id: 'cyber-glitch', label: 'Glitch Core', emoji: '👾', from: '#C084FC', to: '#3B0764', category: 'cyberpunk' },
  { id: 'cyber-dna', label: 'Synthetic DNA', emoji: '🧬', from: '#6EE7B7', to: '#064E3B', category: 'cyberpunk' },
  { id: 'cyber-satellite', label: 'Sat Uplink', emoji: '🛰️', from: '#93C5FD', to: '#1E3A8A', category: 'cyberpunk' },
  { id: 'cyber-vortex', label: 'Quantum Warp', emoji: '🌀', from: '#818CF8', to: '#312E81', category: 'cyberpunk' },
  { id: 'cyber-battery', label: 'Hyper Cell', emoji: '🔋', from: '#4ADE80', to: '#14532D', category: 'cyberpunk' },
  { id: 'cyber-crystal', label: 'Tesseract', emoji: '🔮', from: '#E879F9', to: '#701A75', category: 'cyberpunk' },
  { id: 'cyber-radar', label: 'Sonar Array', emoji: '📡', from: '#38BDF8', to: '#0C4A6E', category: 'cyberpunk' },
  { id: 'cyber-chip', label: 'Quantum Core', emoji: '🖲️', from: '#F472B6', to: '#4A044E', category: 'cyberpunk' },
  { id: 'cyber-visor', label: 'VR Operator', emoji: '🥽', from: '#67E8F9', to: '#164E63', category: 'cyberpunk' },
  { id: 'cyber-gear', label: 'Mecha Gear', emoji: '⚙️', from: '#CBD5E1', to: '#475569', category: 'cyberpunk' },
  { id: 'cyber-hazard', label: 'Biohazard Neon', emoji: '☣️', from: '#FDE047', to: '#713F12', category: 'cyberpunk' },
  { id: 'cyber-portal', label: 'Star Gate', emoji: '🚪', from: '#A855F7', to: '#2E1065', category: 'cyberpunk' },
  { id: 'cyber-key', label: 'Crypto Key', emoji: '🗝️', from: '#FCD34D', to: '#78350F', category: 'cyberpunk' },
  { id: 'cyber-gamepad', label: 'Pro Arcade', emoji: '🕹️', from: '#FB7185', to: '#881337', category: 'cyberpunk' },

  // --- 3. Football Titans & Pitch Glory (25 presets) ---
  { id: 'striker', label: 'Striker', emoji: '⚽', from: '#38bdf8', to: '#1d4ed8', category: 'football' },
  { id: 'fire', label: 'On fire', emoji: '🔥', from: '#fb923c', to: '#b91c1c', category: 'football' },
  { id: 'trophy', label: 'Champion', emoji: '🏆', from: '#fde047', to: '#a16207', category: 'football' },
  { id: 'keeper', label: 'Keeper', emoji: '🧤', from: '#a78bfa', to: '#5b21b6', category: 'football' },
  { id: 'ultras', label: 'Ultras', emoji: '🥁', from: '#f472b6', to: '#9d174d', category: 'football' },
  { id: 'boot-gold', label: 'Golden Boot', emoji: '👟', from: '#FDE047', to: '#CA8A04', category: 'football' },
  { id: 'whistle-ref', label: 'Master Ref', emoji: '🟨', from: '#FEF08A', to: '#EAB308', category: 'football' },
  { id: 'red-card', label: 'Red Dismissal', emoji: '🟥', from: '#F87171', to: '#991B1B', category: 'football' },
  { id: 'tactics-board', label: 'Tactician', emoji: '📋', from: '#93C5FD', to: '#1E40AF', category: 'football' },
  { id: 'stadium-roar', label: 'Colosseum', emoji: '🏟️', from: '#A5B4FC', to: '#3730A3', category: 'football' },
  { id: 'derby-flare', label: 'Curva Pyro', emoji: '🧨', from: '#F87171', to: '#7F1D1D', category: 'football' },
  { id: 'corner-flag', label: 'Corner Arc', emoji: '🚩', from: '#FCA5A5', to: '#991B1B', category: 'football' },
  { id: 'header-goal', label: 'Aerial King', emoji: '🤾', from: '#38BDF8', to: '#0284C7', category: 'football' },
  { id: 'ball-fire', label: 'Meteor Shot', emoji: '☄️', from: '#FB923C', to: '#7C2D12', category: 'football' },
  { id: 'ball-lightning', label: 'Thunder Volley', emoji: '🌩️', from: '#FDE047', to: '#4338CA', category: 'football' },
  { id: 'ball-diamond', label: 'Diamond Ball', emoji: '💎', from: '#E0F2FE', to: '#0284C7', category: 'football' },
  { id: 'derby-scarf', label: 'Barra Brava', emoji: '🧣', from: '#F472B6', to: '#831843', category: 'football' },
  { id: 'megaphone-fan', label: 'Capo Fan', emoji: '📢', from: '#FB923C', to: '#9A3412', category: 'football' },
  { id: 'stopwatch-var', label: 'VAR Review', emoji: '⏱️', from: '#94A3B8', to: '#334155', category: 'football' },
  { id: 'shirt-number-10', label: 'Maestro 10', emoji: '🔟', from: '#38BDF8', to: '#1E3A8A', category: 'football' },
  { id: 'captain-armband', label: 'The Skipper', emoji: '©️', from: '#FDE047', to: '#B45309', category: 'football' },
  { id: 'bicycle-kick', label: 'Overhead Kick', emoji: '🤸', from: '#67E8F9', to: '#0E7490', category: 'football' },
  { id: 'clean-sheet', label: 'Wall Keeper', emoji: '🧱', from: '#F87171', to: '#7F1D1D', category: 'football' },
  { id: 'penalty-ice', label: 'Ice Panenka', emoji: '🧊', from: '#BAE6FD', to: '#0369A1', category: 'football' },
  { id: 'pitch-grass', label: 'Pitch Turf', emoji: '🌿', from: '#86EFAC', to: '#15803D', category: 'football' },

  // --- 4. Ultra Beasts & Mascots (20 presets) ---
  { id: 'beast-lion', label: 'Atlas Lion', emoji: '🦁', from: '#FDE047', to: '#B45309', category: 'beast' },
  { id: 'beast-panther', label: 'Shadow Panther', emoji: '🐆', from: '#94A3B8', to: '#0F172A', category: 'beast' },
  { id: 'beast-tiger', label: 'Cyber Tiger', emoji: '🐅', from: '#FB923C', to: '#9A3412', category: 'beast' },
  { id: 'beast-wolf', label: 'Lone Wolf', emoji: '🐺', from: '#CBD5E1', to: '#334155', category: 'beast' },
  { id: 'beast-hawk', label: 'War Hawk', emoji: '🦅', from: '#FDE047', to: '#78350F', category: 'beast' },
  { id: 'beast-dragon', label: 'Neon Dragon', emoji: '🐉', from: '#F472B6', to: '#1E1B4B', category: 'beast' },
  { id: 'beast-shark', label: 'Apex Shark', emoji: '🦈', from: '#38BDF8', to: '#0C4A6E', category: 'beast' },
  { id: 'beast-bear', label: 'Grizzly Titan', emoji: '🐻', from: '#D97706', to: '#451A03', category: 'beast' },
  { id: 'beast-bull', label: 'Raging Toro', emoji: '🐂', from: '#EF4444', to: '#450A0A', category: 'beast' },
  { id: 'beast-viper', label: 'Green Viper', emoji: '🐍', from: '#84CC16', to: '#14532D', category: 'beast' },
  { id: 'beast-gorilla', label: 'Silverback', emoji: '🦍', from: '#64748B', to: '#0F172A', category: 'beast' },
  { id: 'beast-rhino', label: 'Iron Rhino', emoji: '🦏', from: '#94A3B8', to: '#1E293B', category: 'beast' },
  { id: 'beast-fox', label: 'Sly Fox', emoji: '🦊', from: '#FB923C', to: '#C2410C', category: 'beast' },
  { id: 'beast-scorpion', label: 'Neon Stinger', emoji: '🦂', from: '#F43F5E', to: '#4C0519', category: 'beast' },
  { id: 'beast-cheetah', label: 'Mach Cheetah', emoji: '⚡', from: '#FACC15', to: '#CA8A04', category: 'beast' },
  { id: 'beast-octopus', label: 'Deep Kraken', emoji: '🐙', from: '#EC4899', to: '#500724', category: 'beast' },
  { id: 'beast-phoenix', label: 'Solar Phoenix', emoji: '🦚', from: '#F97316', to: '#7C2D12', category: 'beast' },
  { id: 'beast-bat', label: 'Midnight Bat', emoji: '🦇', from: '#A855F7', to: '#1E1B4B', category: 'beast' },
  { id: 'beast-horse', label: 'Stallion Ace', emoji: '🐎', from: '#CA8A04', to: '#451A03', category: 'beast' },
  { id: 'beast-mammoth', label: 'Ice Mammoth', emoji: '🦣', from: '#93C5FD', to: '#1E3A8A', category: 'beast' },

  // --- 5. Elemental & Neon Energy (18 presets) ---
  { id: 'neon-bolt', label: 'Arc Lightning', emoji: '⚡', from: '#FDE047', to: '#0284C7', category: 'neon' },
  { id: 'neon-plasma', label: 'Plasma Bomb', emoji: '💥', from: '#FB7185', to: '#9F1239', category: 'neon' },
  { id: 'neon-starburst', label: 'Starlight', emoji: '💫', from: '#FDE047', to: '#7E22CE', category: 'neon' },
  { id: 'neon-frost', label: 'Absolute Zero', emoji: '❄️', from: '#BAE6FD', to: '#0284C7', category: 'neon' },
  { id: 'neon-flame', label: 'Soul Fire', emoji: '🔥', from: '#38BDF8', to: '#1E1B4B', category: 'neon' },
  { id: 'neon-sun', label: 'Super Solar', emoji: '☀️', from: '#FDE047', to: '#D97706', category: 'neon' },
  { id: 'neon-moon', label: 'Blood Moon', emoji: '🌙', from: '#F87171', to: '#4C0519', category: 'neon' },
  { id: 'neon-diamond-gem', label: 'Royal Gem', emoji: '💎', from: '#A5F3FC', to: '#0369A1', category: 'neon' },
  { id: 'neon-prism', label: 'Spectrum Prism', emoji: '🌈', from: '#F472B6', to: '#06B6D4', category: 'neon' },
  { id: 'neon-blackhole', label: 'Singularity', emoji: '🕳️', from: '#A855F7', to: '#09090B', category: 'neon' },
  { id: 'neon-aurora', label: 'Borealis', emoji: '🌌', from: '#6EE7B7', to: '#3B82F6', category: 'neon' },
  { id: 'neon-shield-gold', label: 'Aegis Shield', emoji: '🛡️', from: '#FDE047', to: '#B45309', category: 'neon' },
  { id: 'neon-medal-one', label: 'Number One', emoji: '🥇', from: '#FEF08A', to: '#A16207', category: 'neon' },
  { id: 'neon-crown-king', label: 'Citadel Crown', emoji: '👑', from: '#FBBF24', to: '#831843', category: 'neon' },
  { id: 'neon-infinity', label: 'Eternal Loop', emoji: '♾️', from: '#CCFF00', to: '#2563EB', category: 'neon' },
  { id: 'neon-radioactive', label: 'Radio Active', emoji: '☢️', from: '#CCFF00', to: '#166534', category: 'neon' },
  { id: 'neon-target-lock', label: 'Laser Sight', emoji: '🎯', from: '#EF4444', to: '#450A0A', category: 'neon' },
  { id: 'neon-lucky-clover', label: 'Lucky Clover', emoji: '🍀', from: '#86EFAC', to: '#14532D', category: 'neon' },
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
