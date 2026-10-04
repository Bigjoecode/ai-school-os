import QRCode from 'qrcode';
import { Check, Copy, Download, Printer, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage } from '@/lib/api';
import { CodeInput } from '../auth/code-input';
import { refreshTwoFactorStatus, useEnableTwoFactor, useStartTwoFactorSetup } from './security-api';

/** "JBSW Y3DP EHPK 3PXP" — easier to type into an app by hand. */
const groupSecret = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

function Qr({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a1024', light: '#ffffff' } }).then((s) => {
      if (live) setSvg(s);
    });
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label="QR code for your authenticator app"
      className="size-44 shrink-0 overflow-hidden rounded-xl border border-border bg-white p-2 [&_svg]:size-full"
      // Generated locally from the otpauth link; never from user input.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/** Recovery codes, shown once: copy, download or print, then confirm they're saved. */
export function RecoveryCodesPanel({ codes, onDone, doneLabel = 'Done' }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const text = `AI School OS recovery codes\nCreated ${new Date().toLocaleString('en-GB')}\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-school-os-recovery-codes.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.write(`<pre style="font:16px/1.6 monospace;padding:24px">${text.replace(/</g, '&lt;')}</pre>`);
    w.document.close();
    w.print();
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
        <strong className="font-semibold">Save these recovery codes now.</strong> If you lose your phone, each one lets you sign in once. You won’t see them
        again.
      </div>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-4 font-mono text-[14.5px] sm:grid-cols-2">
        {codes.map((c) => (
          <li key={c} className="rounded-md bg-card px-2 py-1 text-center shadow-xs">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard.writeText(codes.join('\n')).then(
              () => toast.success('Recovery codes copied'),
              () => toast.error('Could not copy. Download them instead.'),
            )
          }
        >
          <Copy /> Copy
        </Button>
        <Button variant="outline" size="sm" onClick={download}>
          <Download /> Download
        </Button>
        <Button variant="outline" size="sm" onClick={print}>
          <Printer /> Print
        </Button>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
        <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        I have saved my recovery codes somewhere safe
      </label>
      <Button onClick={onDone} disabled={!saved}>
        <Check /> {doneLabel}
      </Button>
    </div>
  );
}

/**
 * Set-up flow: start → scan the QR code (or type the key) → confirm a code →
 * save recovery codes. Used on Settings → Security and on the forced set-up screen.
 */
export function TwoFactorSetup({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const start = useStartTwoFactorSetup();
  const enable = useEnableTwoFactor();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  // Start exactly once when the flow opens (a second call would replace the secret behind the QR code).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.mutate();
  }, [start]);

  const confirm = (value = code) => {
    if (value.length !== 6 || enable.isPending) return;
    setError(null);
    enable.mutate(value, {
      onSuccess: (r) => setCodes(r.recoveryCodes),
      onError: (err) => {
        setCode('');
        setError(err instanceof ApiError && err.errors.length ? err.message : errorMessage(err));
      },
    });
  };

  if (codes) {
    return (
      <RecoveryCodesPanel
        codes={codes}
        doneLabel="Finish"
        onDone={() => {
          void refreshTwoFactorStatus();
          toast.success('Two-step sign-in is on');
          onDone();
        }}
      />
    );
  }

  if (start.isError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-[13px] font-medium text-danger">
          {errorMessage(start.error)}
        </p>
        <Button variant="outline" onClick={() => start.mutate()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = start.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {data ? <Qr value={data.otpauthUrl} /> : <div className="size-44 shrink-0 animate-pulse rounded-xl bg-muted" />}
        <div className="min-w-0 space-y-3 text-[13.5px]">
          <p className="flex items-start gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              <strong className="font-semibold">1. Scan the QR code</strong> with an authenticator app such as Google Authenticator, Microsoft Authenticator or
              Authy.
            </span>
          </p>
          <div>
            <p className="text-muted-foreground">Can’t scan it? Enter this key in the app instead (time-based):</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 break-all rounded-md bg-muted px-2 py-1 font-mono text-[13px] tracking-wide">
                {data ? groupSecret(data.secret) : '…'}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!data}
                aria-label="Copy key"
                onClick={() =>
                  data &&
                  void navigator.clipboard.writeText(data.secret).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
        className="max-w-xs space-y-3"
      >
        <Field label="2. Enter the 6-digit code the app shows" htmlFor="setup-code" error={error ?? undefined}>
          <CodeInput id="setup-code" value={code} onChange={setCode} onComplete={confirm} invalid={!!error} disabled={!data || enable.isPending} autoFocus />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={enable.isPending} disabled={!data || code.length !== 6}>
            Turn on
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
