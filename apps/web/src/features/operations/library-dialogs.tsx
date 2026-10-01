import { BOOK_CATEGORIES, BOOK_CATEGORY_LABELS, type BookCategory, type BookRow, bookSchema, type LoanRow } from '@aischool/shared';
import { AlertTriangle, BookOpen, BookPlus, BookUp, Library, Undo2 } from 'lucide-react';
import { type BaseSyntheticEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormDialog, SwitchRow } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth-store';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { addDaysIso, koboToInput, money, MoneyInput, parseNaira, schoolDate, schoolToday, useCurrency } from '../finance/ui';
import { useBooks, useIssueLoan, useLoans, useReturnLoan, useSaveBook } from './api';
import { apiFieldErrors, Combo, dateInput, FormError, PersonPicker, type PickedPerson, plural, zodErrors } from './ui';

// ------------------------------------------------------------------ add / edit book

const emptyBook = { title: '', author: '', isbn: '', category: 'FICTION' as BookCategory, publisher: '', publishedYear: '', shelf: '', subject: '', level: '', copies: '1', summary: '' };

export function BookFormSheet({ open, onOpenChange, book }: { open: boolean; onOpenChange: (o: boolean) => void; book: BookRow | null }) {
  const save = useSaveBook(book?.id);
  const [v, setV] = useState(emptyBook);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      book
        ? {
            title: book.title,
            author: book.author,
            isbn: book.isbn ?? '',
            category: book.category,
            publisher: book.publisher ?? '',
            publishedYear: book.publishedYear ? String(book.publishedYear) : '',
            shelf: book.shelf ?? '',
            subject: book.subject ?? '',
            level: book.level ?? '',
            copies: String(book.copies),
            summary: book.summary ?? '',
          }
        : emptyBook,
    );
  }, [open, book]);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = bookSchema.safeParse({ ...v, publishedYear: v.publishedYear ? Number(v.publishedYear) : null, copies: Number(v.copies) });
    if (!parsed.success) {
      const errs = zodErrors(parsed.error.issues);
      if (errs.copies) errs.copies = '1–1000 copies';
      if (errs.publishedYear) errs.publishedYear = 'A year like 2019';
      if (errs.title) errs.title = 'Enter the title';
      if (errs.author) errs.author = 'Enter the author';
      setErrors(errs);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{book ? `Edit “${book.title}”` : 'Add a book'}</SheetTitle>
          <SheetDescription className="text-[13px] text-muted-foreground">
            {book ? `${plural(book.onLoan, 'copy', 'copies')} out on loan right now.` : 'One entry per title — set how many copies the library holds.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="book-form" onSubmit={submit} noValidate className="grid gap-4">
            <Field label="Title" htmlFor="bk-title" error={errors.title}>
              <Input id="bk-title" value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} invalid={!!errors.title} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Author" htmlFor="bk-author" error={errors.author}>
                <Input id="bk-author" value={v.author} onChange={(e) => set({ author: e.target.value })} maxLength={160} invalid={!!errors.author} />
              </Field>
              <Field label="Category" htmlFor="bk-cat">
                <Select value={v.category} onValueChange={(c) => set({ category: c as BookCategory })}>
                  <SelectTrigger id="bk-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {BOOK_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Copies" htmlFor="bk-copies" error={errors.copies}>
                <Input id="bk-copies" inputMode="numeric" value={v.copies} onChange={(e) => set({ copies: e.target.value.replace(/\D/g, '').slice(0, 4) })} invalid={!!errors.copies} className="tabular" />
              </Field>
              <Field label="Shelf" htmlFor="bk-shelf" optional>
                <Input id="bk-shelf" value={v.shelf} onChange={(e) => set({ shelf: e.target.value })} maxLength={30} placeholder="e.g. F-3" />
              </Field>
              <Field label="ISBN" htmlFor="bk-isbn" optional error={errors.isbn}>
                <Input id="bk-isbn" value={v.isbn} onChange={(e) => set({ isbn: e.target.value })} maxLength={20} className="font-mono" />
              </Field>
              <Field label="Reading level" htmlFor="bk-level" optional>
                <Input id="bk-level" value={v.level} onChange={(e) => set({ level: e.target.value })} maxLength={40} placeholder="e.g. JSS 1–3" />
              </Field>
              <Field label="Subject" htmlFor="bk-subject" optional>
                <Input id="bk-subject" value={v.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={80} placeholder="e.g. Biology" />
              </Field>
              <Field label="Publisher" htmlFor="bk-pub" optional>
                <Input id="bk-pub" value={v.publisher} onChange={(e) => set({ publisher: e.target.value })} maxLength={120} />
              </Field>
              <Field label="Year published" htmlFor="bk-year" optional error={errors.publishedYear}>
                <Input id="bk-year" inputMode="numeric" value={v.publishedYear} onChange={(e) => set({ publishedYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} invalid={!!errors.publishedYear} className="tabular" />
              </Field>
            </div>
            <Field label="Summary" htmlFor="bk-summary" optional hint="A line or two — it helps the AI recommend the right books.">
              <Textarea id="bk-summary" rows={3} value={v.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={1000} />
            </Field>
            <FormError message={errors.form} />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="book-form" loading={save.isPending}>
            {book ? 'Save changes' : 'Add book'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ issue a book

function bookOption(b: BookRow): PickedPerson {
  return { id: b.id, name: b.title, detail: `${b.author} · ${b.available} of ${b.copies} on the shelf` };
}

export function IssueBookDialog({ open, onOpenChange, book, loanDays }: { open: boolean; onOpenChange: (o: boolean) => void; book?: BookRow | null; loanDays: number }) {
  const issue = useIssueLoan();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const books = useBooks({ q: q || undefined, available: 'true', pageSize: 20 }, open);
  const [picked, setPicked] = useState<PickedPerson | null>(null);
  const [kind, setKind] = useState<'STUDENT' | 'STAFF'>('STUDENT');
  const [borrower, setBorrower] = useState<PickedPerson | null>(null);
  const [dueOn, setDueOn] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const today = schoolToday();

  useEffect(() => {
    if (!open) return;
    setPicked(book ? bookOption(book) : null);
    setBorrower(null);
    setDueOn(addDaysIso(schoolToday(), loanDays));
    setNote('');
    setErrors({});
  }, [open, book, loanDays]);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    if (!picked) next.bookId = 'Choose a book';
    if (!borrower) next.borrower = 'Choose who is borrowing it';
    if (!dueOn || dueOn <= today) next.dueOn = 'The due date must be after today';
    setErrors(next);
    if (Object.keys(next).length || !picked || !borrower) return;
    issue.mutate(
      { bookId: picked.id, ...(kind === 'STUDENT' ? { studentId: borrower.id } : { staffId: borrower.id }), dueOn, note: note.trim() || null },
      { onSuccess: () => onOpenChange(false), onError: (err) => setErrors(apiFieldErrors(err)) },
    );
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Issue a book" description="Lend a copy to a student or member of staff." icon={<BookUp />} submitLabel="Issue book" pending={issue.isPending} onSubmit={submit}>
      <div className="grid gap-4">
        <Field label="Book" htmlFor="ib-book" error={errors.bookId} hint={!errors.bookId ? 'Only titles with a copy on the shelf are listed.' : undefined}>
          <Combo
            id="ib-book"
            value={picked}
            onChange={setPicked}
            options={(books.data?.items ?? []).map(bookOption)}
            loading={books.isFetching}
            onSearch={setSearch}
            placeholder="Search the catalogue…"
            searchPlaceholder="Title, author or ISBN…"
            emptyText="No available copies match."
            invalid={!!errors.bookId}
            icon={<BookOpen />}
          />
        </Field>
        <Field label="Borrower" htmlFor="ib-who" error={errors.borrower}>
          <PersonPicker id="ib-who" kind={kind} onKind={setKind} value={borrower} onChange={setBorrower} invalid={!!errors.borrower} />
        </Field>
        <Field label="Due back" htmlFor="ib-due" error={errors.dueOn} hint={!errors.dueOn ? `The usual loan is ${loanDays} days.` : undefined}>
          <Input id="ib-due" type="date" value={dueOn} min={addDaysIso(today, 1)} onChange={(e) => setDueOn(e.target.value)} className={dateInput} invalid={!!errors.dueOn} />
        </Field>
        <Field label="Note" htmlFor="ib-note" optional>
          <Input id="ib-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Cover slightly torn" />
        </Field>
        <FormError message={errors.form} />
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ return

export function ReturnLoanDialog({ loan, onOpenChange, currency }: { loan: LoanRow | null; onOpenChange: (o: boolean) => void; currency: string }) {
  const ret = useReturnLoan();
  const [charge, setCharge] = useState('');
  const [paid, setPaid] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const open = !!loan;
  const accrued = loan?.fineKobo ?? 0;

  useEffect(() => {
    if (!loan) return;
    setCharge(loan.fineKobo ? koboToInput(loan.fineKobo) : '');
    setPaid(false);
    setNote('');
    setError(undefined);
  }, [loan]);

  const chargeKobo = useMemo(() => Math.round((parseNaira(charge) ?? 0) * 100), [charge]);
  if (!loan) return null;
  const waived = Math.max(0, accrued - chargeKobo);

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    if (accrued > 0 && chargeKobo > accrued) {
      setError(`The fine can’t be more than the ${money(accrued, currency)} accrued`);
      return;
    }
    ret.mutate(
      { id: loan.id, ...(accrued > 0 ? { fineKobo: chargeKobo } : {}), finePaid: accrued > 0 && chargeKobo > 0 ? paid : false, note: note.trim() || null },
      { onSuccess: () => onOpenChange(false), onError: (err) => setError(err.message) },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Return “${loan.book.title}”`}
      description={`${loan.borrower.name} · borrowed ${schoolDate(loan.issuedOn)}, due ${schoolDate(loan.dueOn)}`}
      icon={<Undo2 />}
      submitLabel="Mark returned"
      pending={ret.isPending}
      onSubmit={submit}
      size="sm"
    >
      <div className="grid gap-4">
        {accrued > 0 ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 px-3.5 py-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>
                {plural(loan.daysOverdue, 'day')} late — a fine of <span className="font-semibold tabular">{money(accrued, currency)}</span> has built up.
              </p>
            </div>
            <Field label="Fine to charge" htmlFor="rl-fine" error={error} hint={waived > 0 ? `${money(waived, currency)} waived` : 'Lower it to waive part or all of the fine.'}>
              <MoneyInput id="rl-fine" value={charge} onChange={setCharge} currency={currency} invalid={!!error} />
            </Field>
            {chargeKobo > 0 && (
              <SwitchRow label="Paid now" description="Turn off if the fine will be settled later.">
                <Switch checked={paid} onCheckedChange={setPaid} aria-label="Fine paid now" />
              </SwitchRow>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-border bg-success-soft/40 px-3.5 py-3 text-[13px]">Back on time — no fine.</p>
        )}
        <Field label="Note" htmlFor="rl-note" optional>
          <Input id="rl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Returned with a damaged spine" />
        </Field>
        {accrued === 0 && error && <FormError message={error} />}
      </div>
    </FormDialog>
  );
}

// ------------------------------------------------------------------ book detail

export function BookDetailSheet({ book, onOpenChange, onEdit, onIssue }: { book: BookRow | null; onOpenChange: (o: boolean) => void; onEdit: (b: BookRow) => void; onIssue: (b: BookRow) => void }) {
  const canManage = useCan('library.manage');
  const currency = useCurrency();
  const loans = useLoans({ bookId: book?.id, status: 'ALL' }, !!book);
  return (
    <Sheet open={!!book} onOpenChange={onOpenChange}>
      <SheetContent>
        {book && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display text-lg font-semibold tracking-tight">{book.title}</SheetTitle>
              <SheetDescription className="text-[13px] text-muted-foreground">
                {book.author}
                {book.publishedYear && ` · ${book.publishedYear}`}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="brand">{BOOK_CATEGORY_LABELS[book.category]}</Badge>
                {book.level && <Badge variant="outline">{book.level}</Badge>}
                {book.subject && <Badge variant="outline">{book.subject}</Badge>}
              </div>
              <dl className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['On the shelf', `${book.available} of ${book.copies}`, book.available === 0 ? 'text-danger' : ''],
                    ['On loan', String(book.onLoan), ''],
                    ['Times borrowed', String(book.timesBorrowed), ''],
                  ] as const
                ).map(([k, val, cls]) => (
                  <div key={k} className="min-w-0 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                    <dt className="truncate text-[11.5px] text-muted-foreground">{k}</dt>
                    <dd className={cn('mt-0.5 font-display text-[17px] font-semibold tabular', cls)}>{val}</dd>
                  </div>
                ))}
              </dl>
              {book.summary && <p className="text-[13.5px] leading-relaxed text-foreground/90">{book.summary}</p>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] [&>*]:min-w-0">
                {(
                  [
                    ['Shelf', book.shelf],
                    ['ISBN', book.isbn],
                    ['Publisher', book.publisher],
                  ] as const
                ).map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className={cn('mt-0.5 break-words', k === 'ISBN' && 'font-mono text-[12.5px]')}>{val ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              <section aria-labelledby="book-loans">
                <h3 id="book-loans" className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                  <Library className="size-4 text-muted-foreground" aria-hidden /> Loan history
                </h3>
                {!loans.data ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : loans.data.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">Never borrowed yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {loans.data.slice(0, 20).map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.borrower.name}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {schoolDate(l.issuedOn)} → {l.returnedOn ? schoolDate(l.returnedOn) : `due ${schoolDate(l.dueOn)}`}
                          </span>
                        </span>
                        {!l.returnedOn ? (
                          l.daysOverdue > 0 ? <Badge variant="danger" dot>Overdue</Badge> : <Badge variant="info" dot>Out</Badge>
                        ) : l.fineKobo > 0 ? (
                          <Badge variant={l.finePaid ? 'outline' : 'warning'}>{money(l.fineKobo, currency)} {l.finePaid ? 'paid' : 'owed'}</Badge>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">Returned</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </SheetBody>
            {canManage && (
              <SheetFooter>
                <Button variant="outline" onClick={() => onEdit(book)}>
                  <BookPlus /> Edit book
                </Button>
                <Button onClick={() => onIssue(book)} disabled={book.available === 0}>
                  <BookUp /> {book.available === 0 ? 'All copies out' : 'Issue a copy'}
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ status

export function LoanStatus({ l, currency }: { l: LoanRow; currency: string }) {
  if (l.returnedOn) {
    if (l.fineKobo > 0)
      return (
        <Badge variant={l.finePaid ? 'outline' : 'warning'} dot={!l.finePaid}>
          {money(l.fineKobo, currency)} fine {l.finePaid ? 'paid' : 'owed'}
        </Badge>
      );
    return <Badge variant="outline">Returned {schoolDate(l.returnedOn)}</Badge>;
  }
  if (l.daysOverdue > 0)
    return (
      <Badge variant="danger" dot>
        {plural(l.daysOverdue, 'day')} overdue
      </Badge>
    );
  return (
    <Badge variant="info" dot>
      Due {schoolDate(l.dueOn)}
    </Badge>
  );
}
