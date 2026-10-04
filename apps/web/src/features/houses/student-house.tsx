import { Shield } from 'lucide-react';
import { toast } from 'sonner';
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/lib/auth-store';
import { errorMessage } from '@/lib/api';
import { useSetStudentHouse, useStudentHouse } from './api';
import { HouseBadge } from './ui';

/** The student sheet's house line: a badge, and a picker for staff who manage houses. */
export function StudentHouseRow({ studentId }: { studentId: string }) {
  const canRead = useCan('school.read');
  const q = useStudentHouse(canRead ? studentId : null);
  const set = useSetStudentHouse(studentId);
  const d = q.data;
  if (!canRead || !d || (!d.houses.length && !d.house)) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <Shield className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-[12.5px] text-muted-foreground">House</span>
      {d.canChange ? (
        <Select
          value={d.house?.id ?? NONE}
          disabled={set.isPending}
          onValueChange={(v) =>
            set.mutate(v === NONE ? null : v, {
              onSuccess: (r) => toast.success(r.house ? `Moved to ${r.house.name}` : 'Taken out of their house'),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          <SelectTrigger aria-label="House" className="ml-auto h-8 w-auto min-w-40 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No house</SelectItem>
            {d.houses.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: h.colour }} aria-hidden />
                  {h.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : d.house ? (
        <HouseBadge house={d.house} size="md" className="ml-auto" />
      ) : (
        <span className="ml-auto text-[13px] text-muted-foreground">Not in a house</span>
      )}
    </div>
  );
}
