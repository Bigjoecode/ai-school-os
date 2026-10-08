import { gamesFor, type GameKind, type GameLevel } from '@aischool/shared';
import { rememberedLevel, useGamesHub } from './api';

export interface GameMode {
  level: GameLevel;
  year: number;
  /** Nursery, KG, creche… (Primary 1 content, the simplest questions). */
  early: boolean;
  /** Young mode (early years to Primary 3): big buttons, read-aloud, no lives or clocks, stars. Set by the class. */
  young: boolean;
  /** Read-aloud buttons are offered (all primary classes). */
  readAloud: boolean;
  /** The games that suit the student. */
  games: GameKind[];
}

/** The student's stage, year and mode: from the hub, or (offline) from the last hub visit on this phone. */
export function useGameMode(): GameMode {
  const hub = useGamesHub();
  const s = hub.data?.student;
  const known = s ? { level: s.level, year: s.year, early: s.early, young: s.young } : rememberedLevel();
  const level: GameLevel = known?.level ?? 'JUNIOR';
  const year = known?.year ?? 1;
  const early = known?.early ?? false;
  const young = known?.young ?? false;
  return { level, year, early, young, readAloud: level === 'PRIMARY', games: s?.games ?? gamesFor({ level, year, early }) };
}
