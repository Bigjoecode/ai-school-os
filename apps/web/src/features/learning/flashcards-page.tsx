import type { FlashcardDeckRow } from '@aischool/shared';
import { ArrowLeft, Layers, PartyPopper, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatRelative, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { allowanceError, useDecks, useGenerateDeck, useLearnHome, useReviewCard } from './api';
import { PlusUpsell, UpgradeCard } from './components';

export default function FlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const decks = useDecks();
  const home = useLearnHome();
  const studyTools = home.data?.access.studyTools;
  const [creating, setCreating] = useState(false);
  const deck = decks.data?.find((d) => d.id === params.get('deck'));
  const totalDue = decks.data?.reduce((t, d) => t + d.due, 0) ?? 0;

  if (deck) return <Review deck={deck} onBack={() => setParams({})} />;

  return (
    <Page className="max-w-5xl">
      <PageHeader
        eyebrow="Learning"
        title="Flashcards"
        description={decks.data ? (totalDue ? `${totalDue} card${totalDue === 1 ? '' : 's'} ready for review today.` : 'All caught up — nice work. Cards come back when it’s time to remember them again.') : 'Short, spaced reviews that make things stick.'}
        actions={
          studyTools ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New deck
            </Button>
          ) : undefined
        }
      />
      {decks.error && !decks.data ? (
        <ErrorState error={decks.error} onRetry={() => void decks.refetch()} />
      ) : !decks.data || !home.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {studyTools === false && <PlusUpsell feature="Flashcards" />}
          {decks.data.length === 0
            ? studyTools && (
                <Card>
                  <EmptyState
                    icon={Layers}
                    title="No decks yet"
                    description="Pick a topic and your tutor will make a deck of cards to review a little each day."
                    action={
                      <Button onClick={() => setCreating(true)}>
                        <Sparkles /> Make a deck
                      </Button>
                    }
                  />
                </Card>
              )
            : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
                  {decks.data.map((d) => {
                    const learned = d.cards.filter((c) => c.box >= 4).length;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setParams({ deck: d.id })}
                        className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-border-strong"
                      >
                        <div aria-hidden className="absolute inset-x-5 -top-1.5 h-3 rounded-t-xl border border-b-0 border-border bg-card/70" />
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 font-display text-[15px] font-semibold tracking-tight">{d.title}</p>
                          {d.due > 0 ? <Badge variant="brand">{d.due} due</Badge> : <Badge variant="success">Caught up</Badge>}
                        </div>
                        <p className="text-[12.5px] text-muted-foreground">
                          {d.subject}
                          {d.topic && d.topic !== d.title ? ` · ${d.topic}` : ''} · {d.cards.length} cards
                        </p>
                        <div>
                          <Progress value={d.cards.length ? (learned / d.cards.length) * 100 : 0} barClassName="bg-success" label="Cards learned" />
                          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                            {learned} of {d.cards.length} well learned · made {formatRelative(d.createdAt)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
        </div>
      )}
      <NewDeckDialog open={creating} onOpenChange={setCreating} onCreated={(id) => setParams({ deck: id })} />
    </Page>
  );
}

function Review({ deck, onBack }: { deck: FlashcardDeckRow; onBack: () => void }) {
  const review = useReviewCard();
  const today = todayIso();
  // Freeze the queue when the session starts: due cards first, or the whole deck for extra practice.
  const [extra, setExtra] = useState(false);
  const queue = useMemo(() => {
    const due = deck.cards.filter((c) => c.dueAt <= today);
    return extra || due.length === 0 ? deck.cards : due;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.id, extra]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ AGAIN: 0, GOOD: 0, EASY: 0 });
  const card = queue[pos];
  const finished = pos >= queue.length;

  const answer = (result: 'AGAIN' | 'GOOD' | 'EASY') => {
    if (!card) return;
    review.mutate({ deckId: deck.id, cardId: card.id, result });
    setTally((t) => ({ ...t, [result]: t[result] + 1 }));
    setFlipped(false);
    setPos((p) => p + 1);
  };

  return (
    <Page className="max-w-2xl">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={onBack}>
        <ArrowLeft /> All decks
      </Button>
      <PageHeader title={deck.title} description={`${deck.subject}${deck.topic && deck.topic !== deck.title ? ` · ${deck.topic}` : ''}`} />
      {finished ? (
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
            <PartyPopper className="size-6" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">Session complete</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {queue.length} card{queue.length === 1 ? '' : 's'} reviewed · {tally.EASY} easy, {tally.GOOD} good, {tally.AGAIN} to try again soon
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              Back to decks
            </Button>
            <Button
              onClick={() => {
                setExtra(true);
                setPos(0);
                setTally({ AGAIN: 0, GOOD: 0, EASY: 0 });
              }}
            >
              <RotateCcw /> Practise the whole deck
            </Button>
          </div>
        </Card>
      ) : card ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Progress value={(pos / queue.length) * 100} className="flex-1" label="Session progress" />
            <span className="shrink-0 text-[12.5px] tabular text-muted-foreground">
              {pos + 1} / {queue.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="group block w-full [perspective:1200px]"
            aria-label={flipped ? 'Show the question' : 'Show the answer'}
          >
            <div className={cn('relative min-h-[260px] w-full transition-transform duration-500 [transform-style:preserve-3d] sm:min-h-[300px]', flipped && '[transform:rotateY(180deg)]')}>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-6 shadow-soft [backface-visibility:hidden]">
                <span className="absolute left-5 top-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Question</span>
                <p className="text-center font-display text-xl font-semibold tracking-tight sm:text-2xl">{card.front}</p>
                <span className="absolute bottom-4 text-[12px] text-muted-foreground">Tap to flip</span>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-ai-2/30 bg-card p-6 shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="absolute left-5 top-4 text-[11px] font-medium uppercase tracking-wider text-ai-2">Answer</span>
                <p className="text-center text-lg sm:text-xl">{card.back}</p>
              </div>
            </div>
          </button>
          {flipped ? (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-12 flex-col gap-0 border-danger/30 text-danger hover:bg-danger-soft" onClick={() => answer('AGAIN')}>
                Again <span className="text-[11px] font-normal text-muted-foreground">tomorrow</span>
              </Button>
              <Button variant="outline" className="h-12 flex-col gap-0" onClick={() => answer('GOOD')}>
                Good <span className="text-[11px] font-normal text-muted-foreground">a bit later</span>
              </Button>
              <Button variant="outline" className="h-12 flex-col gap-0 border-success/30 text-success hover:bg-success-soft" onClick={() => answer('EASY')}>
                Easy <span className="text-[11px] font-normal text-muted-foreground">much later</span>
              </Button>
            </div>
          ) : (
            <Button className="h-12 w-full" onClick={() => setFlipped(true)}>
              Show answer
            </Button>
          )}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Layers} title="This deck is empty" compact />
        </Card>
      )}
    </Page>
  );
}

function NewDeckDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const gen = useGenerateDeck();
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(12);
  const upgrade = allowanceError(gen.error);
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) gen.reset();
        onOpenChange(o);
      }}
      title="New flashcard deck"
      description="Your tutor writes the cards; you review a few each day."
      icon={<Layers />}
      submitLabel="Make my deck"
      pending={gen.isPending}
      onSubmit={(e) => {
        e?.preventDefault();
        if (subject.trim().length < 2 || topic.trim().length < 2) return;
        gen.mutate(
          { subject: subject.trim(), topic: topic.trim(), count },
          {
            onSuccess: (d) => {
              onOpenChange(false);
              setTopic('');
              onCreated(d.id);
            },
          },
        );
      }}
    >
      <div className="space-y-4">
        <Field label="Subject" htmlFor="deck-subject">
          <Input id="deck-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Basic Science" />
        </Field>
        <Field label="Topic" htmlFor="deck-topic">
          <Input id="deck-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Forms of energy" />
        </Field>
        <Field label="Cards">
          <div className="flex gap-2">
            {[8, 12, 20].map((n) => (
              <Button key={n} type="button" size="sm" variant={count === n ? 'default' : 'outline'} aria-pressed={count === n} onClick={() => setCount(n)}>
                {n}
              </Button>
            ))}
          </div>
        </Field>
        {upgrade ? <UpgradeCard error={upgrade} /> : gen.error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorMessage(gen.error)}</p> : null}
      </div>
    </FormDialog>
  );
}
