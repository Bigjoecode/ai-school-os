import type { HousePeriod } from '@aischool/shared';
import { motion } from 'framer-motion';
import { Crown, Maximize, Minimize, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { useMe } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { useStandings } from './api';
import { inkOn, ordinal, PERIOD_OPTIONS, tint } from './ui';

/**
 * The leaderboard for a projector or TV at assembly: full screen, big
 * type, house colours, refreshing itself every 30 seconds.
 */
export function DisplayMode({ open, onClose, period: initial }: { open: boolean; onClose: () => void; period: HousePeriod }) {
  const [period, setPeriod] = useState(initial);
  const q = useStandings({ period }, { refetchInterval: 30_000, enabled: open });
  const me = useMe();
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => setPeriod(initial), [initial]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && onClose();
    const onFs = () => setFull(!!document.fullscreenElement);
    const tick = window.setInterval(() => setNow(new Date()), 15_000);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      window.clearInterval(tick);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [open, onClose]);

  if (!open) return null;
  const d = q.data;
  const rows = d?.standings ?? [];
  const max = Math.max(1, ...rows.map((r) => r.total));
  const school = me?.tenant?.name ?? '';

  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-label="House standings" className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#070b18] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: rows.length ? `radial-gradient(60% 50% at 50% 0%, ${tint(rows[0]!.house.colour, 0.35)}, transparent 70%)` : undefined }} />
      <header className="relative flex flex-wrap items-center gap-x-6 gap-y-2 px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium uppercase tracking-[0.25em] text-white/60 sm:text-[15px]">{school}</p>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight sm:text-[52px]">House standings</h1>
          <p className="text-[14px] text-white/60 sm:text-[18px]">
            {d?.period.label ?? '…'} · {now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-white/10 p-1">
            {PERIOD_OPTIONS.map((o) => (
              <button key={o.value} type="button" onClick={() => setPeriod(o.value)} className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors', period === o.value ? 'bg-white text-[#070b18]' : 'text-white/70 hover:text-white')}>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => (full ? void document.exitFullscreen() : void root.current?.requestFullscreen?.())} className="grid size-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label={full ? 'Leave full screen' : 'Full screen'}>
            {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Close display mode">
            <X className="size-5" />
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-end gap-3 px-5 pb-6 pt-8 sm:gap-8 sm:px-10 sm:pb-10">
        {!d && <p className="m-auto text-[20px] text-white/60">Loading…</p>}
        {d && rows.length === 0 && <p className="m-auto text-[20px] text-white/60">No houses have been set up yet.</p>}
        {rows.map((r, i) => {
          const h = Math.max(6, (Math.max(0, r.total) / max) * 100);
          const ink = inkOn(r.house.colour);
          return (
            <div key={r.house.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <div className="mb-2 flex items-center gap-2 text-center sm:mb-4">
                {r.rank === 1 && r.total > 0 && <Crown className="size-6 text-amber-300 sm:size-10" aria-hidden />}
                <span className="font-display text-[34px] font-extrabold leading-none tabular sm:text-[72px]">
                  <AnimatedNumber value={r.total} />
                </span>
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 1.1, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex w-full max-w-[280px] flex-col items-center justify-start overflow-hidden rounded-t-3xl pt-3 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.6)] sm:pt-5"
                style={{ background: `linear-gradient(180deg, ${r.house.colour}, ${tint(r.house.colour, 0.75)})`, color: ink }}
              >
                <span className="font-display text-[18px] font-bold opacity-80 sm:text-[30px]">{ordinal(r.rank)}</span>
              </motion.div>
              <div className="mt-3 w-full max-w-[280px] text-center">
                <p className="truncate font-display text-[16px] font-bold sm:text-[28px]">{r.house.name}</p>
                {r.house.motto && <p className="hidden truncate text-[14px] italic text-white/55 sm:block">{r.house.motto}</p>}
              </div>
            </div>
          );
        })}
      </main>
      {d && d.topContributors.length > 0 && (
        <footer className="relative hidden border-t border-white/10 px-10 py-4 md:block">
          <p className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[16px] text-white/75">
            <span className="font-semibold uppercase tracking-[0.2em] text-white/50">Stars</span>
            {d.topContributors.slice(0, 5).map((c) => (
              <span key={c.student.id} className="inline-flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: c.house.colour }} aria-hidden />
                {c.student.name} <span className="font-semibold text-white">+{c.points}</span>
              </span>
            ))}
          </p>
        </footer>
      )}
    </div>,
    document.body,
  );
}
