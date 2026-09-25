import type { KioskToken } from '@aischool/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, LogIn, LogOut, Maximize2, Minimize2, ScanLine, Smartphone, WifiOff } from 'lucide-react';
import QRCode from 'qrcode';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useKiosk } from './api';
import { clockTime, schoolTimeZone } from './ui';

/** How often the code on screen changes. Tokens live ~90s, so a scan mid-swap still works. */
const ROTATE_MS = 60_000;

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

export default function KioskPage() {
  useDocumentTitle('Check-in kiosk');
  const kiosk = useKiosk();
  const now = useNow();
  const [shown, setShown] = useState<{ url: string; expiresAt: number; at: number } | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const data: KioskToken | undefined = kiosk.data;

  // Swap to a fresh code once a minute (or sooner if the shown one is about to expire).
  useEffect(() => {
    if (!data) return;
    const exp = new Date(data.expiresAt).getTime();
    setShown((prev) => {
      if (!prev || Date.now() - prev.at >= ROTATE_MS || prev.expiresAt - Date.now() < 15_000) return { url: data.url, expiresAt: exp, at: Date.now() };
      return prev;
    });
  }, [data, now]);

  const shownUrl = shown?.url;
  useEffect(() => {
    if (!shownUrl) return;
    let alive = true;
    void QRCode.toString(shownUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0a1024', light: '#ffffff' } }).then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [shownUrl]);

  // Keep the screen awake where supported.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = () =>
      nav.wakeLock
        ?.request('screen')
        .then((l) => {
          lock = l;
        })
        .catch(() => undefined);
    void request();
    const onVis = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const remaining = shown ? Math.max(0, ROTATE_MS - (now - shown.at)) : ROTATE_MS;
  const progress = remaining / ROTATE_MS;
  const offline = kiosk.isError && (!shown || shown.expiresAt < now);
  const date = new Date(now);

  return (
    <div className="dark">
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#050814] text-foreground">
        {/* ambience */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-orb absolute -left-40 -top-40 size-[560px] rounded-full bg-[#6366f1]/25 blur-[120px]" />
          <div className="animate-orb absolute -bottom-48 -right-32 size-[520px] rounded-full bg-[#06b6d4]/15 blur-[120px]" style={{ animationDelay: '-9s' }} />
          <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        </div>

        {/* top bar */}
        <header className="relative flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-display text-[17px] font-semibold tracking-tight sm:text-xl">{data?.schoolName ?? 'Staff check-in'}</p>
              <p className="text-[12px] text-white/50">Staff check-in</p>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <Link
              to="/attendance?tab=staff"
              className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Back to attendance"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        </header>

        <main className="relative grid flex-1 items-center gap-10 px-6 pb-10 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          {/* clock + QR */}
          <section className="flex flex-col items-center gap-8 text-center lg:items-start lg:text-left">
            <div>
              <p className="font-display text-[64px] font-semibold leading-none tracking-[-0.04em] tabular sm:text-[96px]" aria-live="off">
                {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: schoolTimeZone() }).format(date)}
                <span className="ml-2 align-top text-[24px] font-medium text-white/40 sm:text-[32px]">
                  {String(date.getSeconds()).padStart(2, '0')}
                </span>
              </p>
              <p className="mt-2 text-[17px] text-white/60">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: schoolTimeZone() }).format(date)}</p>
            </div>

            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <div className="relative">
                <div aria-hidden className="absolute -inset-4 rounded-[36px] bg-ai-gradient opacity-40 blur-2xl" />
                <div className="relative rounded-[28px] bg-white p-5 shadow-[0_30px_80px_-20px_rgba(99,102,241,0.6)] sm:p-6">
                  <div className="size-[240px] sm:size-[300px]">
                    <AnimatePresence mode="wait">
                      {svg && !offline ? (
                        <motion.img
                          key={shownUrl}
                          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                          alt="Check-in QR code"
                          className="size-full"
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.35 }}
                        />
                      ) : (
                        <motion.div key="wait" className="grid size-full place-items-center text-[#0a1024]/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          {offline ? (
                            <div className="flex flex-col items-center gap-2 text-center text-[14px]">
                              <WifiOff className="size-8" />
                              Reconnecting…
                            </div>
                          ) : (
                            <div className="size-full animate-pulse rounded-xl bg-[#0a1024]/5" />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <CountdownRing progress={progress} seconds={Math.ceil(remaining / 1000)} />
              </div>

              <div className="max-w-xs space-y-4 text-left">
                <p className="font-display text-[26px] font-semibold leading-tight tracking-tight">
                  Scan with your <span className="text-ai-gradient">phone camera</span> to check in or out
                </p>
                <ol className="space-y-2.5 text-[14px] text-white/65">
                  <li className="flex items-center gap-3">
                    <Step n={1} icon={<Smartphone className="size-4" />} /> Open your camera
                  </li>
                  <li className="flex items-center gap-3">
                    <Step n={2} icon={<ScanLine className="size-4" />} /> Point it at the code
                  </li>
                  <li className="flex items-center gap-3">
                    <Step n={3} icon={<LogIn className="size-4" />} /> Tap the link — you’re in
                  </li>
                </ol>
                <p className="text-[12.5px] text-white/40">Scan again at the end of the day to check out. The code changes every minute.</p>
              </div>
            </div>
          </section>

          {/* live feed */}
          <section aria-label="Recent check-ins" className="w-full self-stretch lg:self-center">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-[15px] font-semibold">Today’s check-ins</h2>
                <span className="inline-flex items-center gap-2 text-[12px] text-white/50">
                  <span className="relative flex size-2" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
              </div>
              {!data?.recent.length ? (
                <p className="py-12 text-center text-[14px] text-white/40">No one has checked in yet today.</p>
              ) : (
                <ul className="space-y-2" aria-live="polite">
                  <AnimatePresence initial={false}>
                    {data.recent.map((r) => (
                      <motion.li
                        key={`${r.name}-${r.action}-${r.at}`}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3"
                      >
                        <span
                          className={cn(
                            'grid size-9 shrink-0 place-items-center rounded-xl',
                            r.action === 'out' ? 'bg-sky-400/15 text-sky-300' : r.late ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300',
                          )}
                        >
                          {r.action === 'out' ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{r.name}</span>
                          <span className="text-[12.5px] text-white/50">
                            {r.action === 'out' ? 'Checked out' : r.late ? 'Checked in · late' : 'Checked in'}
                          </span>
                        </span>
                        <span className="font-display text-[15px] font-medium tabular text-white/80">{clockTime(r.at)}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Step({ n, icon }: { n: number; icon: ReactNode }) {
  return (
    <span className="relative grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/80">
      {icon}
      <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-ai-gradient text-[9px] font-bold text-white">{n}</span>
    </span>
  );
}

function CountdownRing({ progress, seconds }: { progress: number; seconds: number }) {
  const size = 44;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="absolute -bottom-3 -right-3 grid place-items-center rounded-full bg-[#0b1122] shadow-lg ring-1 ring-white/10"
      style={{ width: size + 8, height: size + 8 }}
      role="timer"
      aria-label={`New code in ${seconds} seconds`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#kiosk-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
        <defs>
          <linearGradient id="kiosk-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-[11px] font-semibold tabular text-white/80">{seconds}</span>
    </div>
  );
}
