import type { StudentRow } from '@aischool/shared';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounced } from '@/lib/hooks';
import { cn, fullName, initials } from '@/lib/utils';
import { useStudents } from './api';

export interface PickedStudent {
  id: string;
  name: string;
  admissionNumber: string;
}

interface StudentPickerProps {
  value: PickedStudent[];
  onChange: (value: PickedStudent[]) => void;
  id?: string;
}

/** Searchable multi-select of students, backed by GET /students?q=. */
export function StudentPicker({ value, onChange, id }: StudentPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const list = useStudents({ q: q || undefined, page: 1, pageSize: 20 }, open);
  const selectedIds = new Set(value.map((v) => v.id));

  const toggle = (s: StudentRow) => {
    if (selectedIds.has(s.id)) onChange(value.filter((v) => v.id !== s.id));
    else onChange([...value, { id: s.id, name: fullName(s), admissionNumber: s.admissionNumber }]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:border-border-strong focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            {value.length ? `${value.length} student${value.length === 1 ? '' : 's'} selected` : 'Search and select students…'}
            <ChevronsUpDown className="size-4 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
          <Command shouldFilter={false} label="Students">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Type a name or admission no…"
                className="h-10 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
              />
              {list.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <Command.List className="scrollbar-thin max-h-64 overflow-y-auto p-1.5">
              {!list.isFetching && (
                <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">No students found.</Command.Empty>
              )}
              {list.data?.items.map((s) => {
                const on = selectedIds.has(s.id);
                return (
                  <Command.Item
                    key={s.id}
                    value={s.id}
                    onSelect={() => toggle(s)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-muted"
                  >
                    <Avatar name={fullName(s)} initials={initials(s.firstName, s.lastName)} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{fullName(s)}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {s.admissionNumber}
                        {s.classArm && ` · ${s.classArm.classLevel.name} ${s.classArm.name}`}
                      </span>
                    </span>
                    <Check className={cn('size-4 text-brand', on ? 'opacity-100' : 'opacity-0')} />
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-[12px]">
              {s.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== s.id))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-border hover:text-foreground"
                aria-label={`Remove ${s.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
