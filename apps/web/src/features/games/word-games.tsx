import { blankedSentence, markLocalRound, normaliseWord, seededShuffle, WORD_ROUND, wordsFor, type GameLevel, type GameRoundResult, type GameWord, type LocalScoreInput } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Delete, Ear, Lightbulb, Star, Turtle } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gk, newClientId, rememberedLevel, submitScore, useGamesHub } from './api';
import type { GameMeta } from './meta';
import { buzz, play } from './sound';
import { Feedback, GameFrame, Hud, Intro, ResultView } from './ui';

// ------------------------------------------------------------------ the browser's own voice (free, works offline on most phones)

const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function voice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  return all.find((v) => v.lang === 'en-NG') ?? all.find((v) => v.lang === 'en-GB') ?? all.find((v) => v.lang.startsWith('en-GB')) ?? all.find((v) => v.lang.startsWith('en')) ?? null;
}

function speak(parts: string[], rate = 0.9) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const v = voice();
  for (const text of parts) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = v?.lang ?? 'en-GB';
    if (v) u.voice = v;
    u.rate = rate;
    synth.speak(u);
  }
}

const random = () => Math.random();

/** A scramble that isn't the word itself. */
function scramble(word: string): string[] {
  const letters = word.split('');
  for (let k = 0; k < 8; k++) {
    const s = seededShuffle(letters, random);
    if (s.join('') !== word) return s;
  }
  return [...letters].reverse();
}

/** Spelling Bee (hear it, spell it) and Word Scramble (unjumble it from the clue): curated lists, playable offline. */
export default function WordGame({ meta }: { meta: GameMeta }) {
  const scrambleMode = meta.kind === 'WORD_SCRAMBLE';
  const hub = useGamesHub();
  const qc = useQueryClient();
  const known = hub.data ? { level: hub.data.student.level } : rememberedLevel();
  const level: GameLevel = known?.level ?? 'JUNIOR';
  const [round, setRound] = useState<GameWord[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [typed, setTyped] = useState('');
  const [tiles, setTiles] = useState<{ ch: string; used: boolean }[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [done, setDone] = useState<{ id: string; typed: string; ms: number }[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<{ result?: GameRoundResult; queued?: boolean; rejected?: string } | null>(null);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const speaks = useMemo(canSpeak, []);
  const w = round[i];

  function begin() {
    const list = seededShuffle(wordsFor(level), random).slice(0, WORD_ROUND.words);
    setRound(list);
    setI(0);
    setDone([]);
    setOutcome(null);
    setPhase('play');
    startedAt.current = Date.now();
  }

  // Each new word: reset the answer, read it out (spelling) or deal the tiles (scramble).
  useEffect(() => {
    if (phase !== 'play' || !w) return;
    setTyped('');
    setChecked(null);
    setPicked([]);
    shownAt.current = Date.now();
    if (scrambleMode) setTiles(scramble(w.word.toLowerCase()).map((ch) => ({ ch, used: false })));
    else {
      speak([w.word, w.sentence, w.word]);
      input.current?.focus();
    }
  }, [phase, w, scrambleMode]);

  useEffect(() => () => void (canSpeak() && window.speechSynthesis.cancel()), []);

  const answer = scrambleMode ? picked.map((k) => tiles[k]!.ch).join('') : typed;

  function check(e?: FormEvent) {
    e?.preventDefault();
    if (!w || checked !== null) return;
    const ok = normaliseWord(answer) === normaliseWord(w.word);
    setChecked(ok);
    play(ok ? 'right' : 'wrong');
    if (!ok) buzz();
    setDone((d) => [...d, { id: w.word, typed: answer.slice(0, 60), ms: Date.now() - shownAt.current }]);
  }

  async function next() {
    if (i + 1 < round.length) return setI(i + 1);
    setPhase('result');
    const words = done;
    const input: LocalScoreInput = { game: scrambleMode ? 'WORD_SCRAMBLE' : 'SPELLING_BEE', clientId: newClientId(), playedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.current, words };
    const out = await submitScore(input);
    if (out.kind === 'saved') {
      setOutcome({ result: out.result });
      void qc.invalidateQueries({ queryKey: gk.hub });
    } else if (out.kind === 'queued') setOutcome({ queued: true });
    else setOutcome({ rejected: out.message });
  }

  function tap(k: number) {
    if (checked !== null || tiles[k]!.used) return;
    play('tap');
    setTiles((t) => t.map((x, j) => (j === k ? { ...x, used: true } : x)));
    setPicked((p) => [...p, k]);
  }
  function undo() {
    const last = picked.at(-1);
    if (last === undefined || checked !== null) return;
    setTiles((t) => t.map((x, j) => (j === last ? { ...x, used: false } : x)));
    setPicked((p) => p.slice(0, -1));
  }

  // Scramble: letters can be typed as well as tapped; Backspace takes one back.
  useEffect(() => {
    if (!scrambleMode || phase !== 'play') return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (checked === null) check();
        else void next();
        return;
      }
      if (e.key === 'Backspace') return void undo();
      if (e.key.length === 1 && checked === null) {
        const k = tiles.findIndex((t) => !t.used && t.ch === e.key.toLowerCase());
        if (k >= 0) tap(k);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  if (phase === 'intro') {
    return (
      <GameFrame meta={meta}>
        <Intro
          meta={meta}
          onStart={begin}
          rules={
            scrambleMode
              ? [`${WORD_ROUND.words} words: words students often misspell, and subject vocabulary.`, 'Tap the letters (or type them) to unjumble the word from its clue.', 'Works offline.']
              : [`${WORD_ROUND.words} words, read aloud with an example sentence.`, 'Type the spelling. British spelling, as in WAEC and BECE.', speaks ? 'Tap “Hear again” as often as you like. Works offline.' : 'Your phone can’t read aloud, so you’ll see the meaning and the sentence instead.']
          }
        />
      </GameFrame>
    );
  }
  if (phase === 'result') {
    const words = done;
    const mark = markLocalRound({ game: scrambleMode ? 'WORD_SCRAMBLE' : 'SPELLING_BEE', clientId: 'x', playedAt: new Date().toISOString(), durationMs: 600_000, words });
    return (
      <GameFrame meta={meta}>
        <ResultView
          meta={meta}
          correct={mark.correct}
          total={mark.total}
          result={outcome?.result}
          queued={outcome?.queued}
          rejected={outcome?.rejected}
          onAgain={begin}
          extra={
            <ul className="mt-4 grid grid-cols-2 gap-1.5 text-left text-[13px]">
              {round.map((x, k) => {
                const ok = normaliseWord(words[k]?.typed ?? '') === normaliseWord(x.word);
                return (
                  <li key={x.word} className={cn('truncate rounded-lg px-2 py-1', ok ? 'bg-success-soft' : 'bg-danger-soft')}>
                    {ok ? '✓' : '✗'} {x.word}
                  </li>
                );
              })}
            </ul>
          }
        />
      </GameFrame>
    );
  }
  if (!w) return null;
  const correctSoFar = done.filter((d, k) => normaliseWord(d.typed) === normaliseWord(round[k]!.word)).length;

  return (
    <GameFrame meta={meta}>
      <Hud
        items={[
          { label: 'Word', value: `${i + 1}/${round.length}` },
          { label: 'Right', value: correctSoFar, icon: <Star className="size-3.5 text-warning" aria-hidden /> },
        ]}
      />
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="flex items-start gap-2 text-[14px]">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            <span className="text-muted-foreground">Meaning: </span>
            {w.meaning}
            {w.subject && <span className="text-muted-foreground"> ({w.subject})</span>}
          </span>
        </p>

        {!scrambleMode && (
          <>
            {speaks && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => speak([w.word, w.sentence, w.word])}>
                  <Ear /> Hear again
                </Button>
                <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => speak([w.word], 0.55)}>
                  <Turtle /> Slowly
                </Button>
              </div>
            )}
            {(!speaks || checked !== null) && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-[14px] italic">“{checked !== null ? w.sentence : blankedSentence(w)}”</p>}
            {!speaks && <p className="mt-1 text-[12px] text-muted-foreground">{w.word.length} letters</p>}
            <form onSubmit={check} className="mt-4">
              <label htmlFor="spell" className="mb-1.5 block text-[13px] font-medium">
                Your spelling
              </label>
              <input
                id="spell"
                ref={input}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                readOnly={checked !== null}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                className="h-14 w-full rounded-2xl border-2 border-input bg-background px-4 text-xl font-semibold tracking-wide focus:border-ring focus:outline-none"
              />
              {checked === null && (
                <Button type="submit" size="lg" variant="brand" className="mt-3 h-12 w-full" disabled={!typed.trim()}>
                  Check
                </Button>
              )}
            </form>
          </>
        )}

        {scrambleMode && (
          <>
            <div className="mt-4 flex min-h-14 flex-wrap items-center gap-1.5 rounded-2xl border-2 border-dashed border-border p-2" aria-live="polite" aria-label={`Your word: ${answer || 'empty'}`}>
              {picked.map((k, n) => (
                <span key={n} className="grid size-10 place-items-center rounded-lg bg-brand-soft text-lg font-semibold uppercase text-brand">
                  {tiles[k]!.ch}
                </span>
              ))}
              {!picked.length && <span className="px-2 text-[13px] text-muted-foreground">Tap the letters below</span>}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {tiles.map((t, k) => (
                <button
                  key={k}
                  type="button"
                  disabled={t.used || checked !== null}
                  onClick={() => tap(k)}
                  aria-label={`Letter ${t.ch}`}
                  className="grid size-12 place-items-center rounded-xl border-2 border-border bg-card text-xl font-semibold uppercase transition-opacity hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-25"
                >
                  {t.ch}
                </button>
              ))}
            </div>
            {checked === null && (
              <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
                <Button type="button" variant="outline" size="lg" className="h-12" onClick={undo} disabled={!picked.length} aria-label="Take back a letter">
                  <Delete />
                </Button>
                <Button type="button" variant="brand" size="lg" className="h-12" onClick={() => check()} disabled={picked.length !== tiles.length}>
                  Check
                </Button>
              </div>
            )}
          </>
        )}

        {checked !== null && (
          <>
            <Feedback correct={checked} text={checked ? null : `It’s spelt “${w.word}”.`} />
            <Button size="lg" className="mt-3 h-12 w-full" onClick={() => void next()} autoFocus>
              {i + 1 < round.length ? 'Next word' : 'See your score'}
            </Button>
          </>
        )}
        {checked === null && (
          <button type="button" className="mt-3 w-full text-center text-[13px] text-muted-foreground underline-offset-4 hover:underline" onClick={() => check()}>
            I don’t know: skip
          </button>
        )}
      </div>
    </GameFrame>
  );
}
