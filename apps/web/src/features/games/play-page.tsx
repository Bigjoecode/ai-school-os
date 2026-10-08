import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router';
import { useGamesHub } from './api';
import { type GameMeta, metaBySlug } from './meta';
import { useGameMode } from './mode';
import { GameFrame, Loading, Problem } from './ui';

/** Each game is its own small download, fetched when it is opened (and kept by the app for offline play). */
const QuizRound = lazy(() => import('./quiz-round'));
const MathsSprint = lazy(() => import('./maths-sprint'));
const WordGame = lazy(() => import('./word-games'));
const MatchUp = lazy(() => import('./match-up'));
const TrueFalseBlitz = lazy(() => import('./tf-blitz'));
const EarlyGame = lazy(() => import('./early-games'));
const WordSearch = lazy(() => import('./word-search'));
const Crossword = lazy(() => import('./crossword'));

function Game({ meta }: { meta: GameMeta }) {
  switch (meta.kind) {
    case 'QUIZ_RUSH':
    case 'DAILY':
      return <QuizRound meta={meta} />;
    case 'MATHS_SPRINT':
      return <MathsSprint meta={meta} />;
    case 'SPELLING_BEE':
    case 'WORD_SCRAMBLE':
      return <WordGame meta={meta} />;
    case 'MATCH_UP':
      return <MatchUp meta={meta} />;
    case 'TF_BLITZ':
      return <TrueFalseBlitz meta={meta} />;
    case 'COUNT_TAP':
    case 'SHAPES':
    case 'LETTER_SOUNDS':
    case 'TELL_TIME':
    case 'NAIRA_SHOP':
      return <EarlyGame meta={meta} />;
    case 'WORD_SEARCH':
      return <WordSearch meta={meta} />;
    case 'CROSSWORD':
      return <Crossword meta={meta} />;
  }
}

export default function PlayPage() {
  const { game } = useParams();
  const meta = metaBySlug(game);
  const hub = useGamesHub();
  const mode = useGameMode();
  if (!meta) return <Navigate to="/games" replace />;
  // Each class has its own set of games (picture games for the youngest, crosswords from Primary 1…).
  if (meta.kind !== 'DAILY' && !mode.games.includes(meta.kind)) {
    return (
      <GameFrame meta={meta}>
        <Problem message={`${meta.name} is for ${['COUNT_TAP', 'SHAPES', 'LETTER_SOUNDS', 'TELL_TIME', 'NAIRA_SHOP'].includes(meta.kind) ? 'younger' : 'older'} classes. Pick another game from your games page.`} />
      </GameFrame>
    );
  }
  // Closed by the school (off, or lesson time). Offline, the hub can't be checked: device games still play and the server decides later.
  if (hub.data && !hub.data.access.open) {
    return (
      <GameFrame meta={meta}>
        <Problem message={hub.data.access.message ?? 'Games are closed right now.'} />
      </GameFrame>
    );
  }
  if (!hub.data && !hub.error && !meta.offline) return <GameFrame meta={meta}><Loading label="Loading…" /></GameFrame>;
  if (!hub.data && hub.error && !meta.offline) {
    return (
      <GameFrame meta={meta}>
        <Problem message={`${meta.name} needs a connection. The other games work offline.`} onRetry={() => void hub.refetch()} />
      </GameFrame>
    );
  }
  return (
    <Suspense fallback={<GameFrame meta={meta}><Loading label="Loading the game…" /></GameFrame>}>
      <Game key={meta.slug} meta={meta} />
    </Suspense>
  );
}
