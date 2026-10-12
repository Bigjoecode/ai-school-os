import type { PilotPublic } from '@aischool/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gift } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PILOT_PATH } from './config';

/**
 * The live free-pilot offer (GET /api/signup/pilot): places left and the one
 * line of terms. Hidden while loading, on error, and when the pilot is full
 * or closed, so printed brochures never promise places that are gone.
 */
export function usePilotOffer() {
  const q = useQuery({
    queryKey: ['public', 'pilot'],
    queryFn: ({ signal }) => api.get<PilotPublic>('/signup/pilot', undefined, signal),
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });
  return q.data?.open ? q.data : null;
}

export function PilotOffer({ className, compact }: { className?: string; compact?: boolean }) {
  const offer = usePilotOffer();
  if (!offer) return null;
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border border-success/30 bg-success-soft/50 p-4 sm:flex-row sm:items-center print:border-border print:bg-white print:p-2', className)}>
      <Gift className="size-6 shrink-0 text-success print:size-4" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground print:text-[10.5pt]">{offer.termsText}</p>
        {!compact && <p className="mt-0.5 text-[13px] text-muted-foreground print:text-[9pt]">{offer.detail}</p>}
        <p className="mt-0.5 hidden text-[9pt] print:block">
          Apply: {typeof window !== 'undefined' ? window.location.host : ''}
          {offer.applyPath}
        </p>
      </div>
      <Button asChild variant="brand" className="print:hidden">
        <Link to={offer.applyPath || PILOT_PATH}>
          Apply for the free pilot <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
