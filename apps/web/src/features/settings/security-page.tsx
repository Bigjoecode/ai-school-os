import type { SecurityMemberRow } from '@aischool/shared';
import { KeyRound, RotateCcw, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ApiError, errorMessage } from '@/lib/api';
import { useCan, useMe } from '@/lib/auth-store';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { CodeInput } from '../auth/code-input';
import {
  useDisableTwoFactor,
  useRegenerateRecoveryCodes,
  useResetMemberTwoFactor,
  useSaveSecurityPolicy,
  useSecurityPolicy,
  useTwoFactorStatus,
} from './security-api';
import { RecoveryCodesPanel, TwoFactorSetup } from './two-factor-setup';

function NewRecoveryCodesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const regen = useRegenerateRecoveryCodes();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setCode('');
      setCodes(null);
      regen.reset();
    }, 200);
  };
  const submit = (value = code) => {
    if (value.length === 6) regen.mutate(value, { onSuccess: (r) => setCodes(r.recoveryCodes), onError: () => setCode('') });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{codes ? 'Your new recovery codes' : 'Make new recovery codes'}</DialogTitle>
          {!codes && <DialogDescription>Your old codes stop working straight away. Enter a code from your authenticator app to continue.</DialogDescription>}
        </DialogHeader>
        <DialogBody>
          {codes ? (
            <RecoveryCodesPanel codes={codes} onDone={close} />
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Field label="Code from your app" htmlFor="regen-code" error={regen.error ? errorMessage(regen.error) : undefined}>
                <CodeInput id="regen-code" value={code} onChange={setCode} onComplete={submit} invalid={!!regen.error} autoFocus />
              </Field>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" loading={regen.isPending} disabled={code.length !== 6}>
                  Make new codes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function TurnOffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const disable = useDisableTwoFactor();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const fieldError = (path: string) => (disable.error instanceof ApiError ? disable.error.errors.find((e) => e.path === path)?.message : undefined);
  const close = () => {
    onOpenChange(false);
    setPassword('');
    setCode('');
    disable.reset();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Turn off two-step sign-in?</DialogTitle>
          <DialogDescription>Anyone who learns your password could then sign in as you. Confirm with your password and a code.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate({ password, code: code.trim() }, { onSuccess: close });
          }}
        >
          <DialogBody className="space-y-4">
            <Field label="Password" htmlFor="off-password" error={fieldError('password')}>
              <Input id="off-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
            <Field label="Code from your app, or a recovery code" htmlFor="off-code" error={fieldError('code')}>
              <Input id="off-code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="font-mono" />
            </Field>
            {disable.error && !fieldError('password') && !fieldError('code') && (
              <p role="alert" className="text-[13px] font-medium text-danger">
                {errorMessage(disable.error)}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={disable.isPending} disabled={!password || code.trim().length < 6}>
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MyTwoFactorCard() {
  const status = useTwoFactorStatus();
  const [settingUp, setSettingUp] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [offOpen, setOffOpen] = useState(false);

  if (status.error && !status.data) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  if (!status.data) return <Skeleton className="h-56 rounded-2xl" />;
  const s = status.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Two-step sign-in
              {s.enabled ? (
                <Badge variant="success" dot>
                  On
                </Badge>
              ) : s.required ? (
                <Badge variant="danger">Required</Badge>
              ) : (
                <Badge variant="outline">Off</Badge>
              )}
            </CardTitle>
            <CardDescription>
              After your password, enter a 6-digit code from an authenticator app on your phone. A stolen password alone is then not enough to get in.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {s.reason && !s.enabled && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {s.reason}
          </p>
        )}

        {settingUp ? (
          <TwoFactorSetup onDone={() => setSettingUp(false)} onCancel={() => setSettingUp(false)} />
        ) : s.enabled ? (
          <>
            <dl className="grid gap-3 text-[13.5px] sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[12px] text-muted-foreground">Turned on</dt>
                <dd className="font-medium">{formatDate(s.enabledAt)}</dd>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[12px] text-muted-foreground">Recovery codes left</dt>
                <dd className={s.recoveryCodesLeft <= 3 ? 'font-medium text-warning' : 'font-medium'}>
                  {s.recoveryCodesLeft} of 10{s.recoveryCodesLeft <= 3 && ' — make new ones soon'}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setRegenOpen(true)}>
                <KeyRound /> Make new recovery codes
              </Button>
              {!s.required && (
                <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setOffOpen(true)}>
                  <ShieldOff /> Turn off
                </Button>
              )}
            </div>
            {s.required && <p className="text-[12.5px] text-muted-foreground">Required for your role, so it can’t be turned off. Lost your phone? Ask an admin to reset it.</p>}
            <NewRecoveryCodesDialog open={regenOpen} onOpenChange={setRegenOpen} />
            <TurnOffDialog open={offOpen} onOpenChange={setOffOpen} />
          </>
        ) : (
          <Button onClick={() => setSettingUp(true)}>
            <ShieldCheck /> Set up two-step sign-in
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({ m, canReset, selfId, onReset }: { m: SecurityMemberRow; canReset: boolean; selfId?: string; onReset: (m: SecurityMemberRow) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">
          {m.name}
          {m.powerful && (
            <Badge variant="brand" className="ml-2 align-middle">
              Powerful role
            </Badge>
          )}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {m.email} · {m.roles.join(', ') || 'No role'}
        </p>
      </div>
      {m.twoFactorEnabled ? (
        <Badge variant="success" dot>
          On since {formatDate(m.enabledAt)}
        </Badge>
      ) : (
        <Badge variant={m.powerful ? 'warning' : 'outline'}>Not set up</Badge>
      )}
      {canReset && m.twoFactorEnabled && m.userId !== selfId && !m.isPlatformStaff && (
        <Button size="sm" variant="ghost" onClick={() => onReset(m)}>
          <RotateCcw /> Reset
        </Button>
      )}
    </li>
  );
}

function SchoolPolicyCard() {
  const me = useMe();
  const canManage = useCan('school.manage');
  const canReset = useCan('users.manage');
  const q = useSecurityPolicy(true);
  const save = useSaveSecurityPolicy();
  const reset = useResetMemberTwoFactor();
  const [target, setTarget] = useState<SecurityMemberRow | null>(null);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-64 rounded-2xl" />;
  const { policy, members } = q.data;
  const powerful = members.filter((m) => m.powerful);
  const notSetUp = powerful.filter((m) => !m.twoFactorEnabled).length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>School policy</CardTitle>
          <CardDescription>
            Require two-step sign-in for school admins, principals, accountants and anyone who can manage users, roles, school settings or money.
            Parents, students and other staff can still choose to turn it on.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">Require two-step sign-in for powerful roles</span>
            <span className="block text-[12px] text-muted-foreground">
              {notSetUp
                ? `${notSetUp} of ${powerful.length} people in these roles haven’t set it up yet. When required, they’ll be asked to set it up before they can continue.`
                : `All ${powerful.length} people in these roles have it on.`}
            </span>
          </span>
          <Switch
            checked={policy.requireTwoFactorForPowerfulStaff}
            disabled={!canManage || save.isPending}
            onCheckedChange={(on) => save.mutate({ requireTwoFactorForPowerfulStaff: on })}
            aria-label="Require two-step sign-in for powerful roles"
          />
        </label>
        {!canManage && <p className="text-[12.5px] text-muted-foreground">Only people who can manage school settings can change this.</p>}

        <div>
          <h3 className="mb-2 text-[13px] font-semibold">Staff</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {members.map((m) => (
              <MemberRow key={m.userId} m={m} canReset={canReset} selfId={me?.user.id} onReset={setTarget} />
            ))}
            {!members.length && <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">No staff accounts yet.</li>}
          </ul>
        </div>
      </CardContent>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Reset two-step sign-in for ${target?.name ?? ''}?`}
        description="Only do this when they have lost their phone and their recovery codes, and you are sure it is really them asking. They will be signed out everywhere and must set it up again."
        confirmLabel="Reset"
        loading={reset.isPending}
        onConfirm={() => target && reset.mutate(target.userId, { onSuccess: () => setTarget(null) })}
      />
    </Card>
  );
}

export default function SecurityPage() {
  useDocumentTitle('Security');
  const me = useMe();
  const canSeePolicy = useCan('users.read');
  return (
    <div className="max-w-3xl space-y-6">
      <MyTwoFactorCard />
      {me?.tenant && canSeePolicy && <SchoolPolicyCard />}
    </div>
  );
}
