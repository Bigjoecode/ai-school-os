import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface FocusOptions {
  /** Off: nothing is counted (a practical that isn't an exam, or already handed in). */
  enabled?: boolean;
  /** While handing in, leaving doesn't count. */
  ignore: () => boolean;
  /** The count went up (keep it, and send it with the next save). */
  onLost: () => void;
  /** The student is back: a good moment to save. */
  onBack: () => void;
}

/**
 * Counts the times a student leaves an exam (tab or app switch), for online
 * exams and practical exams. A signal for the teacher: it never penalises or
 * hands in. `away` counts this visit's losses, to show the student a reminder.
 */
export function useFocusLosses(initial: number, options: FocusOptions) {
  const count = useRef(initial);
  const [away, setAway] = useState(0);
  const o = useRef(options);
  o.current = options;
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    // A reload or closing the page also fires "hidden": that isn't leaving to look something up.
    let unloading = false;
    const pagehide = () => void (unloading = true);
    const pageshow = () => void (unloading = false);
    const lost = () => {
      if (unloading || o.current.ignore()) return;
      const t = Date.now();
      if (t - last < 1500) return; // blur and visibilitychange fire together
      last = t;
      count.current += 1;
      o.current.onLost();
      setAway((n) => n + 1);
    };
    const back = () => o.current.onBack();
    const vis = () => (document.visibilityState === 'hidden' ? lost() : back());
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', lost);
    window.addEventListener('focus', back);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('blur', lost);
      window.removeEventListener('focus', back);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
    };
  }, [enabled]);

  return { count, away, clearAway: () => setAway(0) };
}

/** The reminder shown when the student comes back. */
export function AwayNotice({ what, onClose, className }: { what: string; onClose: () => void; className?: string }) {
  return (
    <div role="status" className={className}>
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="flex-1">You left the {what}. Please stay on this page until you hand in — your teacher can see how often this happens.</span>
        <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
