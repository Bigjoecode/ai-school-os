import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router';
import { useGamesHub } from './api';
import { type GameMeta, metaBySlug } from './meta';
import { GameFrame, Loading, Problem } from './ui';

/** Each game is its own small download, fetched when it is opened (and kept by the app for offline play). */
const QuizRound = lazy(() => import('./quiz-round'));
const MathsSprint = lazy(() => import('./maths-sprint'));
const WordGame = lazy(() => import('./word-games'));
const MatchUp = lazy(() => import('./match-up'));
const TrueFalseBlitz = lazy(() => import('./tf-blitz'));

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
  }
}

export default function PlayPage() {
  const { game } = useParams();
  const meta = metaBySlug(game);
  const hub = useGamesHub();
  if (!meta) return <Navigate to="/games" replace />;
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
        <Problem message={`${meta.name} needs a connection. Maths Sprint, the word games, Match Up and True or False work offline.`} onRetry={() => void hub.refetch()} />
      </GameFrame>
    );
  }
  return (
    <Suspense fallback={<GameFrame meta={meta}><Loading label="Loading the game…" /></GameFrame>}>
      <Game key={meta.slug} meta={meta} />
    </Suspense>
  );
}
