/** Official IPTV EPG identifiers. Do not confuse a regional edition with a channel name. */
export const MENA_BEIN_IDS = Object.freeze(Array.from({ length: 8 }, (_, index) => `beINSports${index + 1}.qa@MENA`));
const ids = new Set(MENA_BEIN_IDS);
export const isMenaBeinId = (id?: string): boolean => Boolean(id && ids.has(id));
const asciiDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x06f0 : 0x0660)));

/** Reported broadcast hints only — no invented league-rights mapping. */
export function menaTargets(hints: string[]): string[] {
  const found = new Set<string>();
  for (const hint of hints) {
    const text = asciiDigits(hint);
    for (const id of MENA_BEIN_IDS) if (text.includes(id)) found.add(id);
    if (/english|french|france|australia|indonesia|turk|tür|\.(?:fr|us|au|tr|id)\b/i.test(text)) continue;
    const match = /(?:be\s*in\s*sports?|بي\s*[إا]?ن\s*سبورتس?)\s*([1-8])(?!\d)/i.exec(text);
    if (match) found.add(`beINSports${match[1]}.qa@MENA`);
  }
  return [...found];
}
export function regionalMetadata(tvgId?: string): { tvgId: string; language: 'ar'; region: 'MENA' } | Record<string, never> {
  return tvgId && isMenaBeinId(tvgId) ? { tvgId, language: 'ar', region: 'MENA' } : {};
}
