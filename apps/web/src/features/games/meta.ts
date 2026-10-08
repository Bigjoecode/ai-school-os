import type { GameKind } from '@aischool/shared';
import { Brain, Calculator, CalendarCheck2, Puzzle, Shuffle, SpellCheck, ToggleLeft, type LucideIcon } from 'lucide-react';

/** How each game looks on the hub: slug in the URL, icon, accent colour (a chart token, so it works in dark mode). */
export interface GameMeta {
  kind: GameKind;
  slug: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  accent: string;
  minutes: string;
  /** Playable with no connection (generated or curated on the phone). */
  offline: boolean;
}

export const GAME_META: GameMeta[] = [
  { kind: 'QUIZ_RUSH', slug: 'quiz-rush', name: 'Quiz Rush', tagline: 'Beat the clock on your subjects. Three lives.', icon: Brain, accent: 'var(--chart-1)', minutes: '3 min', offline: false },
  { kind: 'MATHS_SPRINT', slug: 'maths-sprint', name: 'Maths Sprint', tagline: 'As many sums as you can in 60 seconds.', icon: Calculator, accent: 'var(--chart-4)', minutes: '1 min', offline: true },
  { kind: 'SPELLING_BEE', slug: 'spelling-bee', name: 'Spelling Bee', tagline: 'Hear the word, spell it right.', icon: SpellCheck, accent: 'var(--chart-5)', minutes: '2 min', offline: true },
  { kind: 'WORD_SCRAMBLE', slug: 'word-scramble', name: 'Word Scramble', tagline: 'Unjumble the letters from the clue.', icon: Shuffle, accent: 'var(--chart-3)', minutes: '2 min', offline: true },
  { kind: 'MATCH_UP', slug: 'match-up', name: 'Match Up', tagline: 'Find the pairs: states, elements, terms.', icon: Puzzle, accent: 'var(--chart-2)', minutes: '2 min', offline: true },
  { kind: 'TF_BLITZ', slug: 'true-or-false', name: 'True or False', tagline: 'Twenty quick facts. Trust your gut.', icon: ToggleLeft, accent: 'var(--danger)', minutes: '1 min', offline: true },
  { kind: 'DAILY', slug: 'daily', name: 'Daily Challenge', tagline: 'Same questions for your whole class today.', icon: CalendarCheck2, accent: 'var(--brand)', minutes: '3 min', offline: false },
];

export const metaOf = (kind: GameKind) => GAME_META.find((g) => g.kind === kind)!;
export const metaBySlug = (slug: string | undefined) => GAME_META.find((g) => g.slug === slug) ?? null;

/** A soft tint of an accent colour for backgrounds (works in light and dark). */
export const tint = (accent: string, pct = 14) => `color-mix(in oklab, ${accent} ${pct}%, transparent)`;
