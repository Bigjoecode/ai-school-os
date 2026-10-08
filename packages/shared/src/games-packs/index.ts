import type { CuratedQuestion, GameWord, MatchPack, TrueFalseFact } from '../games-content';
import { JUNIOR_SECONDARY_FACTS, JUNIOR_SECONDARY_MATCH_PACKS, JUNIOR_SECONDARY_QUESTIONS, JUNIOR_SECONDARY_WORDS } from './junior-secondary';
import { LOWER_PRIMARY_FACTS, LOWER_PRIMARY_MATCH_PACKS, LOWER_PRIMARY_QUESTIONS, LOWER_PRIMARY_WORDS } from './lower-primary';
import { SENIOR_SECONDARY_FACTS, SENIOR_SECONDARY_MATCH_PACKS, SENIOR_SECONDARY_QUESTIONS, SENIOR_SECONDARY_WORDS } from './senior-secondary';
import { UPPER_PRIMARY_FACTS, UPPER_PRIMARY_MATCH_PACKS, UPPER_PRIMARY_QUESTIONS, UPPER_PRIMARY_WORDS } from './upper-primary';

/**
 * The year-group content packs (lower primary, upper primary, junior and
 * senior secondary), merged into the curated lists in games-content.ts.
 * Pack files import only types from games-content (never values), so there
 * is no load-order cycle. Ids are prefixed by pack (lp-, up-, js-, ss-) and
 * must stay stable: offline scores are marked by id.
 */

export const ALL_PACK_MATCH_PACKS: MatchPack[] = [...LOWER_PRIMARY_MATCH_PACKS, ...UPPER_PRIMARY_MATCH_PACKS, ...JUNIOR_SECONDARY_MATCH_PACKS, ...SENIOR_SECONDARY_MATCH_PACKS];
export const ALL_PACK_FACTS: TrueFalseFact[] = [...LOWER_PRIMARY_FACTS, ...UPPER_PRIMARY_FACTS, ...JUNIOR_SECONDARY_FACTS, ...SENIOR_SECONDARY_FACTS];
export const ALL_PACK_QUESTIONS: CuratedQuestion[] = [...LOWER_PRIMARY_QUESTIONS, ...UPPER_PRIMARY_QUESTIONS, ...JUNIOR_SECONDARY_QUESTIONS, ...SENIOR_SECONDARY_QUESTIONS];
export const ALL_PACK_WORDS: GameWord[] = [...LOWER_PRIMARY_WORDS, ...UPPER_PRIMARY_WORDS, ...JUNIOR_SECONDARY_WORDS, ...SENIOR_SECONDARY_WORDS];
