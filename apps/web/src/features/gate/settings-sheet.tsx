import { GATE_ALERT_CHANNELS, GATE_ALERT_KINDS, GATE_ALERT_LABELS, gateSettingsSchema, type GateAlertChannel, type GateSettings } from '@aischool/shared';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useGateSettings, useSaveGateSettings } from './api';

const CHANNEL_LABEL: Record<GateAlertChannel, string> = { IN_APP: 'In the app', PUSH: 'Push', SMS: 'SMS', WHATSAPP: 'WhatsApp' };
const time = 'tabular [color-scheme:light] dark:[color-scheme:dark]';

/** Late time, home time, the register rule and which alerts parents get on which channels. */
export function GateSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useGateSettings(open);
  const save = useSaveGateSettings();
  const [s, setS] = useState<GateSettings | null>(null);
  const [gates, setGates] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && q.data) {
      setS(q.data.settings);
      setGates(q.data.settings.gates.join(', '));
      setError(null);
    }
  }, [open, q.data]);
  const v = q.data;
  const set = (p: Partial<GateSettings>) => setS((x) => (x ? { ...x, ...p } : x));
  const toggle = (k: (typeof GATE_ALERT_KINDS)[number], c: GateAlertChannel) =>
    setS((x) => {
      if (!x) return x;
      const cur = x.alerts[k].channels;
      return { ...x, alerts: { ...x.alerts, [k]: { ...x.alerts[k], channels: cur.includes(c) ? cur.filter((y) => y !== c) : [...cur, c] } } };
    });

  // Rough SMS cost for the alerts as currently ticked (the server's estimate is for what's saved).
  const perDay = s ? (['ARRIVE', 'LEAVE', 'LATE', 'ABSENT'] as const).reduce((n, k) => n + (s.alerts[k].enabled && s.alerts[k].channels.includes('SMS') ? { ARRIVE: 1, LEAVE: 1, LATE: 0.1, ABSENT: 0.05 }[k] : 0), 0) : 0;
  const smsPerMonth = v ? Math.round(v.estimate.parentsWithPhone * perDay * 20) : 0;

  const submit = () => {
    if (!s) return;
    const parsed = gateSettingsSchema.safeParse({ ...s, gates: gates.split(',').map((g) => g.trim()).filter(Boolean) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the settings');
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setError(errorMessage(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold">Gate & pick-up settings</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">Arrival times and what parents are told, on which channels.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {!s || !v ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
                <Field label="Late after" htmlFor="gs-late">
                  <Input id="gs-late" type="time" value={s.studentLateAfter} onChange={(e) => set({ studentLateAfter: e.target.value })} className={time} />
                </Field>
                <Field label="Home time" htmlFor="gs-home">
                  <Input id="gs-home" type="time" value={s.homeTime} onChange={(e) => set({ homeTime: e.target.value })} className={time} />
                </Field>
                <Field label="Absence alert at" htmlFor="gs-abs">
                  <Input id="gs-abs" type="time" value={s.absentAlertAt} onChange={(e) => set({ absentAlertAt: e.target.value })} className={time} />
                </Field>
              </div>
              <SwitchRow label="The class register counts as arrival" description="A child marked present or late who wasn’t scanned at the gate counts as arrived.">
                <Switch checked={s.registerCountsAsArrival} onCheckedChange={(c) => set({ registerCountsAsArrival: c })} />
              </SwitchRow>
              <Field label="Gates" htmlFor="gs-gates" optional hint="Comma-separated, e.g. Main gate, Back gate.">
                <Input id="gs-gates" value={gates} onChange={(e) => setGates(e.target.value)} maxLength={300} />
              </Field>

              <div className="space-y-3">
                <h3 className="text-[13px] font-semibold">Alerts to parents</h3>
                {GATE_ALERT_KINDS.map((k) => (
                  <div key={k} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium">{GATE_ALERT_LABELS[k].title}</p>
                        <p className="text-[12px] text-muted-foreground">“{GATE_ALERT_LABELS[k].example}”</p>
                      </div>
                      <Switch aria-label={`${GATE_ALERT_LABELS[k].title} alerts`} checked={s.alerts[k].enabled} onCheckedChange={(c) => set({ alerts: { ...s.alerts, [k]: { ...s.alerts[k], enabled: c } } })} />
                    </div>
                    {s.alerts[k].enabled && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {GATE_ALERT_CHANNELS.map((c) => {
                          const on = s.alerts[k].channels.includes(c);
                          const off = (c === 'SMS' && !v.channels.sms) || (c === 'WHATSAPP' && !v.channels.whatsapp) || (c === 'PUSH' && !v.channels.push);
                          return (
                            <button
                              key={c}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggle(k, c)}
                              className={cn('h-7 rounded-full border px-3 text-[12.5px] font-medium transition-colors', on ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted')}
                              title={off ? 'Not set up yet — nothing is sent on this channel until it is' : undefined}
                            >
                              {CHANNEL_LABEL[c]}
                              {off ? ' (not set up)' : ''}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {ABSENCE_NOTE}
              </div>
              <SwitchRow label="Text pick-up codes to delegates" description="When a parent names someone else to collect, they get a one-time 6-digit code by SMS (one page each).">
                <Switch checked={s.delegateCodeSms} onCheckedChange={(c) => set({ delegateCodeSms: c })} />
              </SwitchRow>
              <div className="flex gap-2 rounded-xl bg-muted/50 p-3 text-[12.5px] text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  {smsPerMonth > 0 ? (
                    <>
                      SMS estimate: about <strong className="text-foreground">{formatNumber(smsPerMonth)} SMS a month</strong> (~{formatMoney(Math.round((smsPerMonth * v.smsPricePerUnitKobo) / 100), v.currency)} at {formatMoney(v.smsPricePerUnitKobo / 100, v.currency)} a page) for {formatNumber(v.estimate.parentsWithPhone)} parents with a phone, 20 school days, arrival and departure daily. Your SMS provider’s actual price applies.
                    </>
                  ) : (
                    <>In-app and push alerts are free. SMS costs per page (about {formatNumber(v.estimate.parentsWithPhone * 40)} a month if arrival and departure go by SMS to every parent). WhatsApp uses the school’s approved message template; Meta may charge per conversation.</>
                  )}{' '}
                  Parents who texted STOP get no SMS, and parents who haven’t accepted the privacy notice get no alerts.
                </p>
              </div>
              {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!s}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const ABSENCE_NOTE = (
  <p className="text-[12px] text-muted-foreground">
    Absence alerts go once, from the time above until home time, only for children marked absent on a register and not seen at the gate — classes whose register hasn’t been taken send nothing.
  </p>
);
