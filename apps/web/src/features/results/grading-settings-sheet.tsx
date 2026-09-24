import { type AssessmentComponent, assessmentSettingsSchema, type GradeBand } from '@aischool/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAssessmentSettings, useSaveAssessmentSettings } from '../assessment/api';

export function GradingSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settings = useAssessmentSettings();
  const save = useSaveAssessmentSettings();
  const [components, setComponents] = useState<AssessmentComponent[]>([]);
  const [bands, setBands] = useState<GradeBand[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setComponents(settings.components.map((c) => ({ ...c })));
      setBands([...settings.gradingScale].sort((a, b) => b.min - a.min).map((b) => ({ ...b })));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings.data]);

  const total = components.reduce((n, c) => n + (Number(c.maxScore) || 0), 0);
  const setComp = (i: number, patch: Partial<AssessmentComponent>) => setComponents(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setBand = (i: number, patch: Partial<GradeBand>) => setBands(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const submit = () => {
    const parsed = assessmentSettingsSchema.safeParse({ components, gradingScale: [...bands].sort((a, b) => b.min - a.min) });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path[0] === 'components' ? 'Components' : first?.path[0] === 'gradingScale' ? 'Grading scale' : '';
      setError(`${where ? `${where}: ` : ''}${first?.message ?? 'Check the values'}`);
      return;
    }
    setError(null);
    save.mutate(parsed.data, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">Grading & assessment</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            How each subject is scored this school year, and the grade each percentage earns. Changes apply to every class.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-8">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display text-[14.5px] font-semibold">Assessment components</h3>
              <span className={cn('text-[12.5px] font-medium tabular', total === 100 ? 'text-success' : 'text-danger')}>Total {total} / 100</span>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_88px_72px_36px] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Name</span>
                <span>Key</span>
                <span>Max</span>
                <span />
              </div>
              {components.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_88px_72px_36px] gap-2">
                  <Input aria-label={`Component ${i + 1} name`} value={c.name} maxLength={30} onChange={(e) => setComp(i, { name: e.target.value })} />
                  <Input
                    aria-label={`Component ${i + 1} key`}
                    value={c.key}
                    maxLength={12}
                    className="font-mono text-[12.5px]"
                    onChange={(e) => setComp(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  />
                  <Input
                    aria-label={`Component ${i + 1} maximum`}
                    type="number"
                    min={1}
                    max={100}
                    value={c.maxScore}
                    onChange={(e) => setComp(i, { maxScore: Number(e.target.value) || 0 })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${c.name || 'component'}`}
                    disabled={components.length <= 1}
                    onClick={() => setComponents(components.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            {components.length < 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setComponents([...components, { key: `ca${components.length + 1}`, name: `CA ${components.length + 1}`, maxScore: 10 }])}
              >
                <Plus /> Add component
              </Button>
            )}
            <p className="mt-2 text-[12px] text-muted-foreground">Keys identify saved marks — changing a key detaches marks already entered under the old key.</p>
          </section>

          <section>
            <h3 className="mb-2 font-display text-[14.5px] font-semibold">Grading scale</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-[64px_72px_1fr_52px_36px] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Grade</span>
                <span>From %</span>
                <span>Remark</span>
                <span>Pass</span>
                <span />
              </div>
              {bands.map((b, i) => (
                <div key={i} className="grid grid-cols-[64px_72px_1fr_52px_36px] items-center gap-2">
                  <Input aria-label={`Band ${i + 1} grade`} value={b.grade} maxLength={4} onChange={(e) => setBand(i, { grade: e.target.value })} />
                  <Input
                    aria-label={`Band ${i + 1} minimum percent`}
                    type="number"
                    min={0}
                    max={100}
                    value={b.min}
                    onChange={(e) => setBand(i, { min: Number(e.target.value) || 0 })}
                  />
                  <Input aria-label={`Band ${i + 1} remark`} value={b.remark} maxLength={30} onChange={(e) => setBand(i, { remark: e.target.value })} />
                  <Switch aria-label={`${b.grade || 'Band'} is a pass`} checked={b.pass} onCheckedChange={(v) => setBand(i, { pass: v })} />
                  <Button variant="ghost" size="icon" aria-label={`Remove ${b.grade || 'band'}`} disabled={bands.length <= 2} onClick={() => setBands(bands.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            {bands.length < 12 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setBands([...bands, { grade: '', min: 0, remark: '', pass: false }])}>
                <Plus /> Add band
              </Button>
            )}
            <p className="mt-2 text-[12px] text-muted-foreground">A score gets the highest band whose “From %” it reaches. The lowest band must start at 0.</p>
          </section>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger">
              {error}
            </p>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save settings
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
