import { X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The small pieces of the simulated computer's apps: light, like a real screen, whatever the site's theme. */

export function Tb({ on, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button type="button" aria-pressed={on} {...p} className={cn('inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded border border-slate-200 bg-white px-1.5 text-[12px] text-slate-800 hover:bg-slate-100 disabled:opacity-40', on && 'border-blue-500 bg-blue-100', className)}>
      {children}
    </button>
  );
}
/** A row of tools that scrolls sideways on a phone. */
export const Tools = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-1 [scrollbar-width:thin]', className)}>{children}</div>;
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex shrink-0 gap-0.5 overflow-x-auto bg-slate-200 px-1 pt-1 text-[12px]" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn('shrink-0 rounded-t px-2.5 py-1 text-slate-700', value === t.id && 'bg-slate-50 font-semibold text-slate-900')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
/** A dialog inside the app window. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:items-center" role="dialog" aria-label={title}>
      <div className={cn('w-full rounded-lg bg-white text-slate-900 shadow-xl', wide ? 'max-w-2xl' : 'max-w-sm')}>
        <div className="flex items-center justify-between rounded-t-lg bg-slate-100 px-3 py-1.5">
          <p className="text-[13px] font-semibold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded hover:bg-slate-200">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-2 p-3 text-[13px]">{children}</div>
      </div>
    </div>
  );
}
export const inputCls = 'h-9 w-full rounded border border-slate-300 bg-white px-2 text-[13px] text-slate-900 outline-none focus:border-blue-500';
export const Lbl = ({ text, children }: { text: string; children: ReactNode }) => (
  <label className="block text-[12px] text-slate-600">
    {text}
    <div className="mt-0.5">{children}</div>
  </label>
);
export const Pri = ({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={cn('inline-flex h-9 items-center justify-center rounded bg-blue-600 px-3 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-40', className)} />;
export const Sec = ({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...p} className={cn('inline-flex h-9 items-center justify-center rounded border border-slate-300 bg-white px-3 text-[13px] text-slate-800 hover:bg-slate-100 disabled:opacity-40', className)} />;
export const Note = ({ tone = 'info', children }: { tone?: 'info' | 'bad' | 'good'; children: ReactNode }) => <p role="status" className={cn('rounded px-2 py-1 text-[12px]', tone === 'bad' ? 'bg-red-100 text-red-800' : tone === 'good' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-800')}>{children}</p>;
