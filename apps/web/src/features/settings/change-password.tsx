import { PASSWORD_MIN_LENGTH } from '@aischool/shared';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { forwardRef, useState, type FormEvent } from 'react';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, type InputProps } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { useSignOut } from '../auth/session';
import { useChangePassword } from './security-api';

/** A password box with a show/hide button. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(({ className, ...props }, ref) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} className={`pr-10 ${className ?? ''}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...props} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

type Errors = Partial<Record<'currentPassword' | 'newPassword' | 'confirm', string>>;

/** Current password, new password twice. Checks the same rules as the API before sending. */
function ChangePasswordForm({ onDone, submitLabel = 'Change password' }: { onDone?: () => void; submitLabel?: string }) {
  const me = useMe();
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const serverError = (path: string) => (change.error instanceof ApiError ? change.error.errors.find((e) => e.path === path)?.message : undefined);
  const otherServerError = change.error && !serverError('currentPassword') && !serverError('newPassword') ? errorMessage(change.error) : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const email = me?.user.email.toLowerCase() ?? '';
    if (!currentPassword) next.currentPassword = 'Enter your current password';
    if (newPassword.length < PASSWORD_MIN_LENGTH) next.newPassword = `At least ${PASSWORD_MIN_LENGTH} characters`;
    else if (newPassword.length > 200) next.newPassword = 'At most 200 characters';
    else if (email && (newPassword.trim().toLowerCase() === email || newPassword.trim().toLowerCase() === email.split('@')[0])) next.newPassword = "Don't use your email address as the password";
    else if (newPassword === currentPassword) next.newPassword = 'Choose a password different from your current one';
    if (!next.newPassword && confirm !== newPassword) next.confirm = "The two new passwords don't match";
    setErrors(next);
    if (Object.keys(next).length) return;
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrent('');
          setNew('');
          setConfirm('');
          setErrors({});
          onDone?.();
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={me?.user.email ?? ''} readOnly hidden />
      <Field label="Current password" htmlFor="cp-current" error={errors.currentPassword ?? serverError('currentPassword')}>
        <PasswordInput
          id="cp-current"
          autoComplete="current-password"
          value={currentPassword}
          invalid={!!(errors.currentPassword ?? serverError('currentPassword'))}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="cp-new" error={errors.newPassword ?? serverError('newPassword')} hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`}>
          <PasswordInput
            id="cp-new"
            autoComplete="new-password"
            value={newPassword}
            invalid={!!(errors.newPassword ?? serverError('newPassword'))}
            onChange={(e) => setNew(e.target.value)}
          />
        </Field>
        <Field label="New password again" htmlFor="cp-confirm" error={errors.confirm}>
          <PasswordInput id="cp-confirm" autoComplete="new-password" value={confirm} invalid={!!errors.confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      {otherServerError && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {otherServerError}
        </p>
      )}
      <Button type="submit" loading={change.isPending} className="w-full sm:w-auto">
        <KeyRound /> {submitLabel}
      </Button>
    </form>
  );
}

/** Settings → Security: change my password. */
export function ChangePasswordCard() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change the password you sign in with. Your other phones and computers are signed out; this one stays signed in.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm />
      </CardContent>
    </Card>
  );
}

/** Full screen after an admin reset the password: choose your own before anything else (the API enforces the same). */
export function ForcedPasswordChange() {
  useDocumentTitle('Choose a new password');
  const me = useMe();
  const signOut = useSignOut();
  return (
    <div className="min-h-dvh bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-[15px] font-semibold tracking-tight">
              AI School <span className="text-ai-gradient">OS</span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
        <Card>
          <CardHeader>
            <div>
              <span className="mb-3 grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                <KeyRound className="size-5" />
              </span>
              <CardTitle className="text-[20px]">Choose a new password</CardTitle>
              <CardDescription>
                A school admin reset your password. Enter the password they gave you, then choose one only you know.
                {me?.user.email && <span className="mt-1 block">Signed in as {me.user.email}</span>}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm submitLabel="Save and continue" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
