import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { CodeInput } from './code-input';
import { useCompleteTwoFactor } from './session';

interface TwoFactorStepProps {
  challenge: string;
  /** Epoch ms when the challenge stops working (5 minutes after the password step). */
  expiresAt: number;
  email: string;
  onDone: () => void;
  onBack: () => void;
}

/** The second sign-in step: a code from the authenticator app, or one recovery code. */
export function TwoFactorStep({ challenge, expiresAt, email, onDone, onBack }: TwoFactorStepProps) {
  const complete = useCompleteTwoFactor();
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [expiresAt]);

  const submit = (value?: string) => {
    if (complete.isPending || expired) return;
    setError(null);
    const input = mode === 'code' ? { challenge, code: value ?? code } : { challenge, recoveryCode: recovery };
    if (mode === 'code' && (value ?? code).length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (mode === 'recovery' && recovery.replace(/[\s-]/g, '').length !== 10) {
      setError('Recovery codes look like abcde-fghjk.');
      return;
    }
    complete.mutate(input, {
      onSuccess: onDone,
      onError: (err) => {
        setCode('');
        const msg = errorMessage(err);
        if (err instanceof ApiError && err.status === 401 && /password again|expired|already been used/i.test(msg)) setExpired(true);
        setError(err instanceof ApiError && err.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : msg);
      },
    });
  };

  return (
    <div>
      <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
        <ShieldCheck className="size-5" />
      </span>
      <h2 className="mt-4 font-display text-[26px] font-semibold tracking-tight">Two-step sign-in</h2>
      <p className="mt-1.5 text-[14px] text-muted-foreground">
        {mode === 'code'
          ? 'Open your authenticator app and enter the 6-digit code for AI School OS.'
          : 'Enter one of the recovery codes you saved when you set up two-step sign-in. Each code works once.'}
        <span className="mt-1 block truncate text-[12.5px]">{email}</span>
      </p>

      {expired ? (
        <div className="mt-6 space-y-4">
          <p role="alert" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] font-medium text-warning">
            This sign-in attempt has expired. Enter your password again to get a new one.
          </p>
          <Button size="lg" className="w-full" onClick={onBack}>
            <ArrowLeft /> Back to sign in
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {mode === 'code' ? (
            <Field label="Authentication code" htmlFor="totp-code">
              <CodeInput id="totp-code" value={code} onChange={setCode} onComplete={(v) => submit(v)} invalid={!!error} autoFocus disabled={complete.isPending} />
            </Field>
          ) : (
            <Field label="Recovery code" htmlFor="recovery-code">
              <Input
                id="recovery-code"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="abcde-fghjk"
                autoFocus
                invalid={!!error}
                className="h-12 text-center font-mono text-[18px] tracking-widest"
              />
            </Field>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={complete.isPending}>
            Verify <ArrowRight />
          </Button>

          <div className="flex items-center justify-between gap-3 text-[13px]">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'code' ? 'recovery' : 'code'));
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
            >
              <KeyRound className="size-3.5" />
              {mode === 'code' ? 'Use a recovery code' : 'Use the code from my app'}
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">Lost your phone and your recovery codes? Ask your school admin to reset two-step sign-in for you.</p>
        </form>
      )}
    </div>
  );
}
