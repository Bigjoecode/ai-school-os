import { motion } from 'framer-motion';
import { BrandMark } from './brand';

export function BootLoader({ label = 'Loading your school…' }: { label?: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-background" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ai-1/15 blur-[100px]" />
        <div className="absolute left-[55%] top-[45%] size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ai-3/10 blur-[80px]" />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col items-center gap-5"
      >
        <div className="relative">
          <motion.div
            aria-hidden
            className="absolute -inset-3 rounded-[22px] bg-ai-gradient opacity-40 blur-xl"
            animate={{ opacity: [0.25, 0.55, 0.25] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <BrandMark className="relative size-14" />
        </div>
        <div className="text-center">
          <p className="font-display text-lg font-semibold tracking-tight">
            AI School <span className="text-ai-gradient">OS</span>
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{label}</p>
        </div>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full w-1/3 rounded-full bg-ai-gradient"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>
    </div>
  );
}

/** Lightweight in-shell loader for lazy route chunks. */
export function RouteLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Loading">
      <div className="h-0.5 w-32 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full w-1/3 rounded-full bg-ai-gradient"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
