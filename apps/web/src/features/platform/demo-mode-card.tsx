import type { DemoModeInput, DemoModeStatus } from '@aischool/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { queryClient } from '@/lib/query-client';

const key = ['platform', 'demo-mode'] as const;

/**
 * The demo schools' switch (super admins): advertise the demo logins on the
 * sign-in page, and allow signing in to the demo schools at all. The data is
 * kept either way; DEMO_LOGINS=off on the server overrides it.
 */
export function DemoModeCard() {
  const status = useQuery({ queryKey: key, queryFn: ({ signal }) => api.get<DemoModeStatus>('/platform/demo-mode', undefined, signal) });
  const save = useMutation({
    mutationFn: (body: DemoModeInput) => api.put<DemoModeStatus>('/platform/demo-mode', body),
    onSuccess: (s) => {
      queryClient.setQueryData(key, s);
      toast.success(s.effective.loginsEnabled ? 'Demo schools updated' : 'Demo logins are off — the demo schools keep their data');
      void queryClient.invalidateQueries({ queryKey: ['public-config'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const s = status.data;
  if (!s) return null;
  const set = (patch: Partial<DemoModeInput>) => save.mutate({ ...s.saved, ...patch });
  const names = s.schools.map((x) => `${x.name} (${x.slug})`).join(', ') || 'none loaded';

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-[15px]">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> Demo schools
            <Badge variant={s.effective.loginsEnabled ? 'warning' : 'success'} dot>
              {s.effective.loginsEnabled ? 'Demo logins on' : 'Demo logins off'}
            </Badge>
          </CardTitle>
          <CardDescription>
            {names}. Before real schools join, hide the demo logins; turn them back on for a sales demo. Nothing is deleted. Platform staff can always open these schools.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {s.envLocked && (
          <p role="status" className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning">
            DEMO_LOGINS=off is set on the server, so demo logins and hints stay off whatever is saved here.
          </p>
        )}
        <Row
          id="demo-logins"
          title="Allow sign-in to the demo schools"
          text="Off: every demo account (admin, teacher, parent, student…) is refused with a neutral message, and open demo sessions end."
          checked={s.saved.loginsEnabled}
          disabled={save.isPending || s.envLocked}
          onChange={(v) => set({ loginsEnabled: v })}
        />
        <Row
          id="demo-hints"
          title="Show the demo logins publicly"
          text="The demo accounts box on the sign-in page and the demo schools’ public websites. Hidden whenever sign-in is off."
          checked={s.saved.publicHints}
          disabled={save.isPending || s.envLocked}
          onChange={(v) => set({ publicHints: v })}
        />
        {s.updatedAt && (
          <p className="text-[12px] text-muted-foreground">
            Last changed {formatRelative(s.updatedAt)}
            {s.updatedBy ? ` by ${s.updatedBy}` : ''}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ id, title, text, checked, disabled, onChange }: { id: string; title: string; text: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="block text-[12.5px] text-muted-foreground">{text}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}
