import type * as React from 'react';
import { Button } from './button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (e?: React.BaseSyntheticEvent) => void | Promise<void>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

/** Dialog with a form, a header, a scrollable body and a sticky footer. */
export function FormDialog({ open, onOpenChange, title, description, icon, submitLabel, pending, onSubmit, size = 'md', children }: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            {icon && <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">{icon}</div>}
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled switch row for boolean form fields. */
export function SwitchRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        {description && <span className="block text-[12px] text-muted-foreground">{description}</span>}
      </span>
      {children}
    </label>
  );
}
