import { GraduationCap } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyServerErrors } from '@/lib/forms';
import { useCreateStudent } from './api';
import { StudentFields, studentDefaults, useStudentForm } from './student-form';

export function AdmitStudentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useStudentForm(studentDefaults());
  const create = useCreateStudent();

  useEffect(() => {
    if (open) form.reset(studentDefaults());
  }, [open, form]);

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (s) => {
        toast.success(`${s.firstName} ${s.lastName} admitted`, { description: `Admission no. ${s.admissionNumber}` });
        onOpenChange(false);
      },
      onError: (err) => {
        if (!applyServerErrors(err, form.setError)) toast.error(err.message);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <GraduationCap className="size-5" />
            </div>
            <DialogTitle>Admit a student</DialogTitle>
            <DialogDescription>Create the student record. You can link parents afterwards.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <StudentFields form={form} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Admit student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
