import type { MyBirthday } from '@aischool/shared';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Gamepad2, PartyPopper, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { gk } from '../games/api';
import { canSpeak, speak } from '../games/speech';
import { useMyBirthday } from './api';

const CONFETTI_COLOURS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];

/** Confetti falling once over the page. Not drawn at all when the device asks for reduced motion. */
export function Confetti({ pieces = 70, onDone }: { pieces?: number; onDone?: () => void }) {
  const reduce = usePrefersReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 6,
        rotate: (Math.random() - 0.5) * 720,
        drift: (Math.random() - 0.5) * 120,
        colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]!,
        round: i % 3 === 0,
      })),
    [pieces],
  );
  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => onDone?.(), 4200);
    return () => window.clearTimeout(t);
  }, [reduce, onDone]);
  if (reduce) return null;
  return (
    <div aria-hidden data-confetti className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className={cn('absolute top-0 block', b.round ? 'rounded-full' : 'rounded-[2px]')}
          style={{ left: `${b.left}%`, width: b.size, height: b.round ? b.size : b.size * 0.45, background: b.colour }}
          initial={{ y: '-5vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: b.drift, rotate: b.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: b.duration, delay: b.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

/** Once per birthday per device (a remembered key); every time a preview opens. */
function useConfettiOnce(key: string | null, remember: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!key) return;
    if (remember) {
      try {
        if (window.localStorage.getItem(key)) return;
        window.localStorage.setItem(key, '1');
      } catch {
        // Private window or blocked storage: still celebrate once on this visit.
      }
    }
    setShow(true);
  }, [key, remember]);
  return [show, () => setShow(false)] as const;
}

/**
 * The card itself, used on the student's dashboard and as the admin preview.
 * Young mode (nursery to Primary 3) is simpler and picture-heavy, with a
 * read-aloud button. No age and no date are shown.
 */
export function BirthdayCardView({ b, preview, onClose, className }: { b: Pick<MyBirthday, 'firstName' | 'message' | 'school' | 'young' | 'bonusXp'>; preview?: boolean; onClose?: () => void; className?: string }) {
  const title = `Happy birthday, ${b.firstName}!`;
  const close = onClose && (
    <button type="button" onClick={onClose} aria-label="Close the preview" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
      <X className="size-4" aria-hidden />
    </button>
  );
  const previewTag = preview && <span className="mb-2 inline-block rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Preview</span>;

  if (b.young) {
    return (
      <section
        aria-label={title}
        data-birthday-card="young"
        className={cn('relative overflow-hidden rounded-3xl p-5 text-center text-white shadow-soft sm:p-7', className)}
        style={{ background: 'linear-gradient(160deg, #f97316, #ec4899 55%, #8b5cf6)' }}
      >
        {close}
        {previewTag}
        <div aria-hidden className="flex items-end justify-center gap-2 text-[44px] leading-none sm:text-[56px]">
          <span>🎈</span>
          <span className="text-[72px] sm:text-[88px]">🎂</span>
          <span>🎁</span>
        </div>
        <h2 className="mt-3 font-display text-[28px] font-bold leading-tight sm:text-[34px]">
          {title} <span aria-hidden>🎉</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[17px] font-medium leading-snug text-white/95">Everyone at school says hooray for you today!</p>
        <div aria-hidden className="mt-3 flex justify-center gap-1.5 text-[30px]">
          <span>⭐</span>
          <span>🥳</span>
          <span>⭐</span>
        </div>
        {b.bonusXp ? (
          <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-[15px] font-semibold">
            <span aria-hidden>🏅</span> You got a Birthday star badge in games!
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {canSpeak() && (
            <Button type="button" size="lg" className="h-12 rounded-full bg-white px-5 text-[15px] text-[#7c2d12] hover:bg-white/90" onClick={() => speak([`${title}`, 'Everyone at school says hooray for you today!', b.message])}>
              <Volume2 /> Hear it
            </Button>
          )}
          {b.bonusXp ? (
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/60 bg-transparent px-5 text-[15px] text-white hover:bg-white/15">
              <Link to="/games">
                <Gamepad2 /> Play
              </Link>
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={title}
      data-birthday-card="standard"
      className={cn('relative overflow-hidden rounded-2xl p-5 text-white shadow-soft sm:p-6', className)}
      style={{ background: 'linear-gradient(125deg, #db2777, #f97316 60%, #f59e0b)' }}
    >
      <div aria-hidden className="absolute -right-6 -top-6 text-[96px] leading-none opacity-25 sm:text-[120px]">
        🎂
      </div>
      {close}
      <div className="relative">
        {previewTag}
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-white/85">
          <PartyPopper className="size-4" aria-hidden /> A message from {b.school}
        </p>
        <h2 className="mt-1 font-display text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">
          {title} <span aria-hidden>🎉</span>
        </h2>
        <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-white/95">{b.message}</p>
        {b.bonusXp ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-medium">
              <span aria-hidden>🏅</span> Birthday star badge and +{b.bonusXp} bonus XP in EduGames
            </p>
            <Button asChild size="sm" className="w-fit bg-white text-[#9a3412] hover:bg-white/90">
              <Link to="/games">
                <Gamepad2 /> Play a game
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * On the student's own dashboard: the birthday card on their birthday (when
 * the school greets students), with confetti once. In the demo school a small
 * "preview" button shows the card on any day, without changing anyone's date
 * of birth (?birthday=preview).
 */
export function StudentBirthdayCard() {
  const [params, setParams] = useSearchParams();
  const wantsPreview = params.get('birthday') === 'preview';
  const real = useMyBirthday(false);
  const preview = useMyBirthday(true, wantsPreview && !!real.data?.demoPreview);
  const showPreview = wantsPreview && !!real.data?.demoPreview && !!preview.data?.today;
  const b = real.data?.today ? real.data : showPreview ? preview.data : undefined;
  const [confetti, stopConfetti] = useConfettiOnce(
    real.data?.today ? `ais:birthday-confetti:${real.data.firstName}:${new Date().getFullYear()}` : showPreview ? 'preview' : null,
    !!real.data?.today,
  );
  const setPreview = (on: boolean) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        if (on) q.set('birthday', 'preview');
        else q.delete('birthday');
        return q;
      },
      { replace: true },
    );

  if (!real.data) return null;
  if (!b) {
    if (!real.data.demoPreview) return null;
    return (
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="text-[12px] text-muted-foreground" onClick={() => setPreview(true)}>
          <PartyPopper /> Demo: preview my birthday card
        </Button>
      </div>
    );
  }
  return (
    <>
      {confetti && <Confetti onDone={stopConfetti} />}
      <BirthdayCardView b={b} preview={!real.data.today} onClose={!real.data.today ? () => setPreview(false) : undefined} />
    </>
  );
}

/** EduGames: a small birthday line on the student's birthday, with the badge and bonus XP. */
export function BirthdayGamesBanner() {
  const q = useMyBirthday(false);
  const qc = useQueryClient();
  const b = q.data;
  const bonus = !!b?.today && !!b.bonusXp;
  // The bonus is given when the birthday is first looked up: refresh the hub so the XP and badge show.
  useEffect(() => {
    if (bonus) void qc.invalidateQueries({ queryKey: gk.hub });
  }, [bonus, qc]);
  if (!b?.today) return null;
  return (
    <p data-birthday-games className="mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[14px] font-medium text-white shadow-soft" style={{ background: 'linear-gradient(125deg, #db2777, #f97316)' }}>
      <span aria-hidden className="text-[22px] leading-none">
        🎂
      </span>
      <span className="min-w-0">
        Happy birthday, {b.firstName}!{bonus ? ` You’ve earned the Birthday star badge and +${b.bonusXp} bonus XP.` : ''}
      </span>
    </p>
  );
}
