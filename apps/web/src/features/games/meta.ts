import type { GameKind } from '@aischool/shared';
import { Banknote, Brain, Calculator, CalendarCheck2, Clock3, Grid3x3, Hash, Puzzle, Search, Shapes, Shuffle, SpellCheck, ToggleLeft, Type, type LucideIcon } from 'lucide-react';

/** How each game looks on the hub: slug in the URL, icon, accent colour (a chart token, so it works in dark mode). */
export interface GameMeta {
  kind: GameKind;
  slug: string;
  name: string;
  tagline: string;
  /** The tagline for young mode (said aloud on the big tiles). */
  youngTagline: string;
  icon: LucideIcon;
  /** The picture on a young-mode tile. */
  emoji: string;
  accent: string;
  minutes: string;
  /** Playable with no connection (generated or curated on the phone). */
  offline: boolean;
}

export const GAME_META: GameMeta[] = [
  { kind: 'COUNT_TAP', slug: 'count-and-tap', name: 'Count and Tap', tagline: 'Count the pictures and tap the number.', youngTagline: 'Count the pictures!', icon: Hash, emoji: '🥭', accent: 'var(--chart-4)', minutes: '2 min', offline: true },
  { kind: 'SHAPES', slug: 'shapes', name: 'Shapes', tagline: 'Circles, squares, triangles and stars.', youngTagline: 'Find the shapes!', icon: Shapes, emoji: '🔺', accent: 'var(--chart-2)', minutes: '2 min', offline: true },
  { kind: 'LETTER_SOUNDS', slug: 'letter-sounds', name: 'Letter Sounds', tagline: 'Which word starts with that sound?', youngTagline: 'Hear the sounds!', icon: Type, emoji: '🔤', accent: 'var(--chart-5)', minutes: '2 min', offline: true },
  { kind: 'TELL_TIME', slug: 'tell-the-time', name: 'Tell the Time', tagline: 'Read the clock: o’clock, half past, quarter to.', youngTagline: 'Read the clock!', icon: Clock3, emoji: '🕒', accent: 'var(--chart-3)', minutes: '2 min', offline: true },
  { kind: 'NAIRA_SHOP', slug: 'naira-shop', name: 'Naira Shop', tagline: 'Add up prices and work out the change.', youngTagline: 'Go shopping!', icon: Banknote, emoji: '🛒', accent: 'var(--success)', minutes: '2 min', offline: true },
  { kind: 'QUIZ_RUSH', slug: 'quiz-rush', name: 'Quiz Rush', tagline: 'Beat the clock on your subjects. Three lives.', youngTagline: 'Answer quiz questions!', icon: Brain, emoji: '🧠', accent: 'var(--chart-1)', minutes: '3 min', offline: false },
  { kind: 'MATHS_SPRINT', slug: 'maths-sprint', name: 'Maths Sprint', tagline: 'As many sums as you can in 60 seconds.', youngTagline: 'Do some sums!', icon: Calculator, emoji: '➕', accent: 'var(--chart-4)', minutes: '1 min', offline: true },
  { kind: 'SPELLING_BEE', slug: 'spelling-bee', name: 'Spelling Bee', tagline: 'Hear the word, spell it right.', youngTagline: 'Spell the word!', icon: SpellCheck, emoji: '🐝', accent: 'var(--chart-5)', minutes: '2 min', offline: true },
  { kind: 'WORD_SCRAMBLE', slug: 'word-scramble', name: 'Word Scramble', tagline: 'Unjumble the letters from the clue.', youngTagline: 'Fix the jumbled word!', icon: Shuffle, emoji: '🔀', accent: 'var(--chart-3)', minutes: '2 min', offline: true },
  { kind: 'MATCH_UP', slug: 'match-up', name: 'Match Up', tagline: 'Find the pairs: states, elements, terms.', youngTagline: 'Find the pairs!', icon: Puzzle, emoji: '🃏', accent: 'var(--chart-2)', minutes: '2 min', offline: true },
  { kind: 'TF_BLITZ', slug: 'true-or-false', name: 'True or False', tagline: 'Twenty quick facts. Trust your gut.', youngTagline: 'True or false?', icon: ToggleLeft, emoji: '✅', accent: 'var(--danger)', minutes: '1 min', offline: true },
  { kind: 'WORD_SEARCH', slug: 'word-search', name: 'Word Search', tagline: 'Find the hidden subject words in the grid.', youngTagline: 'Find the hidden words!', icon: Search, emoji: '🔎', accent: 'var(--chart-1)', minutes: '3 min', offline: true },
  { kind: 'CROSSWORD', slug: 'crossword', name: 'Crossword', tagline: 'A quick crossword from your subjects’ words.', youngTagline: 'Fill in the crossword!', icon: Grid3x3, emoji: '✏️', accent: 'var(--chart-3)', minutes: '5 min', offline: true },
  { kind: 'DAILY', slug: 'daily', name: 'Daily Challenge', tagline: 'Same questions for your whole class today.', youngTagline: 'Today’s challenge!', icon: CalendarCheck2, emoji: '🌟', accent: 'var(--brand)', minutes: '3 min', offline: false },
];

export const metaOf = (kind: GameKind) => GAME_META.find((g) => g.kind === kind)!;
export const metaBySlug = (slug: string | undefined) => GAME_META.find((g) => g.slug === slug) ?? null;

/** A soft tint of an accent colour for backgrounds (works in light and dark). */
export const tint = (accent: string, pct = 14) => `color-mix(in oklab, ${accent} ${pct}%, transparent)`;
