import { FLUENT_FE0F, FLUENT_MISSING } from './fluent3d.generated';

/** Emoji categories (Unicode groups, minus skin-tone components). */
export const EMOJI_GROUPS = [
  'smileys',
  'people',
  'animals',
  'food',
  'travel',
  'activities',
  'objects',
  'symbols',
  'flags',
] as const;
export type EmojiGroup = (typeof EMOJI_GROUPS)[number];

/** emojibase `group` number → our category. 2 = skin-tone components (not offered). */
const GROUP_BY_NUMBER: Record<number, EmojiGroup> = {
  0: 'smileys',
  1: 'people',
  3: 'animals',
  4: 'food',
  5: 'travel',
  6: 'activities',
  7: 'objects',
  8: 'symbols',
  9: 'flags',
};

export interface EmojiEntry {
  emoji: string;
  /** English name, e.g. "grinning face". */
  label: string;
  group: EmojiGroup;
  /** Lower-case words of the name and tags, for search. */
  words: readonly string[];
  /** emojibase hexcode, lower case, e.g. "1f600". */
  hex: string;
}

/** Pinned so the sticker files never change under an app. */
export const DEFAULT_STICKER_LIBRARY_URL =
  'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@1.1.0/assets/';

let pending: Promise<EmojiEntry[]> | null = null;

/**
 * The full Unicode emoji list (emojibase, MIT), loaded the first time it's needed — it's ~0.5 MB,
 * so it isn't part of the editor's main bundle.
 */
export function loadEmoji(): Promise<EmojiEntry[]> {
  pending ??= import('emojibase-data/en/compact.json').then((mod) => {
    const list = (mod as { default: CompactEmoji[] }).default;
    const out: EmojiEntry[] = [];
    for (const e of list) {
      const group = e.group === undefined ? undefined : GROUP_BY_NUMBER[e.group];
      if (!group) continue;
      out.push({
        emoji: e.unicode,
        label: e.label,
        group,
        words: `${e.label} ${(e.tags ?? []).join(' ')}`.toLowerCase().split(/[\s:,]+/),
        hex: e.hexcode.toLowerCase(),
      });
    }
    return out;
  });
  return pending;
}

/** The emoji's 3D sticker image in the Fluent Emoji library, or `null` if it has none. */
export function stickerUrl(entry: EmojiEntry, baseUrl: string): string | null {
  if (FLUENT_MISSING.has(entry.hex)) return null;
  const file = FLUENT_FE0F.has(entry.hex) ? `${entry.hex}-fe0f` : entry.hex;
  return `${baseUrl.replace(/\/?$/, '/')}${file}.webp`;
}

/**
 * Entries where every word of `query` starts a word of the name or tags ("cat" finds cats, not
 * "delicate"), or the whole `group` when the query is empty.
 */
export function filterEmoji(
  list: readonly EmojiEntry[],
  group: EmojiGroup,
  query: string,
): EmojiEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list.filter((e) => e.group === group);
  return list.filter((e) => words.every((w) => e.words.some((word) => word.startsWith(w))));
}

/** The fields we read from emojibase's compact data. */
interface CompactEmoji {
  unicode: string;
  label: string;
  hexcode: string;
  group?: number;
  tags?: string[];
}
