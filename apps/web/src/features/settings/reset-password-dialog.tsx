import { PASSWORD_MIN_LENGTH, type UserRow } from '@aischool/shared';
import { Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PasswordInput } from './change-password';
import { useAdminResetPassword } from './security-api';

type Mode = 'generate' | 'type';

/**
 * Users → Reset password. The member is signed out everywhere and must choose
 * their own password at their next sign-in. A generated password is shown once.
 */
export function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const reset = useAdminResetPassword();
  const [mode, setMode] = useState<Mode>('generate');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [generated, setGenerated] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const name = user ? `${user.firstName} ${user.lastName}` : '';

  const close = () => {
    onClose();
    setTimeout(() => {
      setMode('generate');
      setPassword('');
      setLocalError(undefined);
      setGenerated(null);
      setDone(false);
      reset.reset();
    }, 200);
  };

  const serverField = reset.error instanceof ApiError ? reset.error.errors.find((e) => e.path === 'password')?.message : undefined;
  const submit = () => {
    if (!user) return;
    if (mode === 'type' && password.length < PASSWORD_MIN_LENGTH) {
      setLocalError(`At least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    setLocalError(undefined);
    reset.mutate(
      { membershipId: user.membershipId, ...(mode === 'type' ? { password } : {}) },
      {
        onSuccess: (r) => {
          setGenerated(r.generatedPassword);
          setDone(true);
          setPassword('');
        },
      },
    );
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy. Select the password and copy it by hand.');
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{done ? `New password for ${name}` : `Reset password for ${name}?`}</DialogTitle>
          {!done && (
            <DialogDescription>
              Only when they can’t sign in and you are sure it is really them asking. They will be signed out everywhere and must choose their own password the next time they sign in.
            </DialogDescription>
          )}
        </DialogHeader>
        {done ? (
          <DialogBody className="space-y-4">
            {generated ? (
              <>
                <p className="text-[13.5px]">Give them this password in person or by phone. It is shown only once.</p>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <code className="min-w-0 flex-1 select-all break-all font-mono text-[15px] tracking-wide" data-testid="generated-password">
                    {generated}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => void copy(generated)}>
                    <Copy /> Copy
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[13.5px]">The password you typed is set. Give it to them in person or by phone.</p>
            )}
            <p className="text-[12.5px] text-muted-foreground">They have been signed out on every device and will be asked to choose a new password when they sign in.</p>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </DialogBody>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogBody className="space-y-4">
              <div role="radiogroup" aria-label="New password" className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['generate', 'Make one for me', 'A strong password, shown once'],
                    ['type', 'I’ll type one', `At least ${PASSWORD_MIN_LENGTH} characters`],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={cn(
                      'rounded-xl border px-3.5 py-3 text-left transition-colors',
                      mode === value ? 'border-brand bg-brand-soft' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <span className="block text-[13.5px] font-medium">{label}</span>
                    <span className="block text-[12px] text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
              {mode === 'type' && (
                <Field label="New password" htmlFor="rp-password" error={localError ?? serverField}>
                  <PasswordInput
                    id="rp-password"
                    autoComplete="new-password"
                    value={password}
                    invalid={!!(localError ?? serverField)}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                </Field>
              )}
              {reset.error && !serverField && (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {errorMessage(reset.error)}
                </p>
              )}
            </DialogBody>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={reset.isPending}>
                <KeyRound /> Reset password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
