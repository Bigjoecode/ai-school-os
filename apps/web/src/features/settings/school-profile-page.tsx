import { updateSchoolSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Globe2, Save } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { SchoolLogo } from '@/components/layout/tenant-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAuthStore, useCan } from '@/lib/auth-store';
import { formatMoney } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { qk, queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';

export interface SchoolProfile {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  motto: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  country: string;
}

type Values = z.input<typeof updateSchoolSchema>;
type Output = z.output<typeof updateSchoolSchema>;

const SWATCHES = ['#4f46e5', '#7c3aed', '#0891b2', '#059669', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#0f172a'];

export default function SchoolProfilePage() {
  const canManage = useCan('school.manage');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.school,
    queryFn: ({ signal }) => api.get<SchoolProfile>('/school', undefined, signal),
  });

  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(updateSchoolSchema) });
  const { register, control, formState, reset, watch } = form;
  const e = formState.errors;

  useEffect(() => {
    if (data) {
      reset({
        name: data.name,
        shortName: data.shortName ?? '',
        motto: data.motto ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        address: data.address ?? '',
        primaryColor: data.primaryColor ?? '#4f46e5',
      });
    }
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (input: Output) => api.patch<SchoolProfile>('/school', input),
    meta: { silent: true },
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.school, updated);
      void queryClient.invalidateQueries({ queryKey: qk.overview });
      // Keep the sidebar branding in sync without a round-trip.
      const { me, setMe } = useAuthStore.getState();
      if (me?.tenant && updated) {
        const patch = { name: updated.name, shortName: updated.shortName, primaryColor: updated.primaryColor, motto: updated.motto };
        setMe({
          ...me,
          tenant: { ...me.tenant, ...patch },
          memberships: me.memberships.map((m) => (m.id === me.tenant?.id ? { ...m, ...patch } : m)),
        });
      }
      toast.success('School profile saved');
    },
    onError: (err) => {
      if (!applyServerErrors(err, form.setError)) toast.error(err.message);
    },
  });

  if (error && !data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const color = watch('primaryColor') || '#4f46e5';
  const name = watch('name') || data.name;
  const shortName = watch('shortName');

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>School profile</CardTitle>
            <CardDescription>How your school appears across the OS, reports and parent portal.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" htmlFor="sc-name" error={e.name?.message} className="sm:col-span-2">
              <Input id="sc-name" invalid={!!e.name} {...register('name')} />
            </Field>
            <Field label="Short name" htmlFor="sc-short" optional error={e.shortName?.message}>
              <Input id="sc-short" placeholder="GIS" {...register('shortName')} />
            </Field>
            <Field label="Motto" htmlFor="sc-motto" optional error={e.motto?.message}>
              <Input id="sc-motto" {...register('motto')} />
            </Field>
            <Field label="Email" htmlFor="sc-email" optional error={e.email?.message}>
              <Input id="sc-email" type="email" invalid={!!e.email} {...register('email')} />
            </Field>
            <Field label="Phone" htmlFor="sc-phone" optional error={e.phone?.message}>
              <Input id="sc-phone" type="tel" {...register('phone')} />
            </Field>
            <Field label="Address" htmlFor="sc-address" optional className="sm:col-span-2" error={e.address?.message}>
              <Textarea id="sc-address" rows={2} className="min-h-[64px]" {...register('address')} />
            </Field>
            <Field label="Brand colour" htmlFor="sc-color" className="sm:col-span-2" error={e.primaryColor?.message}>
              <Controller
                control={control}
                name="primaryColor"
                render={({ field }) => (
                  <div className="flex flex-wrap items-center gap-3">
                    <Input id="sc-color" type="color" value={field.value ?? '#4f46e5'} onChange={(ev) => field.onChange(ev.target.value)} aria-label="Pick brand colour" />
                    <Input
                      value={field.value ?? ''}
                      onChange={(ev) => field.onChange(ev.target.value)}
                      className="w-28 font-mono uppercase"
                      maxLength={7}
                      aria-label="Brand colour hex value"
                      invalid={!!e.primaryColor}
                    />
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Preset colours">
                      {SWATCHES.map((s) => {
                        const on = field.value?.toLowerCase() === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={s}
                            onClick={() => field.onChange(s)}
                            className={cn(
                              'grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110',
                              on && 'ring-2 ring-foreground/40',
                            )}
                            style={{ background: s }}
                          >
                            {on && <Check className="size-3.5 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              />
            </Field>
          </fieldset>
        </CardContent>
        {canManage && (
          <CardFooter className="justify-end">
            <Button type="button" variant="ghost" disabled={!formState.isDirty} onClick={() => reset()}>
              Discard
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
              <Save /> Save changes
            </Button>
          </CardFooter>
        )}
      </Card>

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="h-20" style={{ background: `linear-gradient(120deg, ${color}, color-mix(in oklab, ${color} 45%, #0b1330))` }} />
          <div className="-mt-7 px-5 pb-5">
            <SchoolLogo tenant={{ name, shortName: shortName || null, logoUrl: data.logoUrl, primaryColor: color }} className="size-14 rounded-2xl text-base ring-4 ring-card" />
            <p className="mt-3 font-display text-lg font-semibold tracking-tight">{name}</p>
            {watch('motto') && <p className="text-[13px] italic text-muted-foreground">“{watch('motto')}”</p>}
            <p className="mt-3 text-[12px] text-muted-foreground">Live preview</p>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Regional settings</CardTitle>
              <CardDescription>Set when your school was created.</CardDescription>
            </div>
            <Globe2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-[13.5px]">
              {[
                ['School ID', <span key="s" className="font-mono">{data.slug}</span>],
                ['Country', data.country],
                ['Currency', `${data.currency} · ${formatMoney(1250000, data.currency, { maximumFractionDigits: 0 })}`],
                ['Timezone', data.timezone],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
