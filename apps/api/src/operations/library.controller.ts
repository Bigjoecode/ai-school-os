import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  BOOK_CATEGORY_LABELS,
  aiReadingListSchema,
  bookListQuerySchema,
  bookSchema,
  issueLoanSchema,
  loanListQuerySchema,
  readingListRequestSchema,
  returnLoanSchema,
  type BookCategory,
  type BookInput,
  type BookRow,
  type IssueLoanInput,
  type LibraryOverview,
  type LoanRow,
  type Paginated,
  type ReadingList,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequireFeature, RequirePermissions } from '../common/decorators';
import { dateOnly, fullName, paginate, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService, addDays, daysBetween, staffRef, studentRef, studentWithArm } from './operations.service';
import { readingListPrompt } from './prompts';

const loanInclude = {
  book: { select: { id: true, title: true, author: true } },
  student: studentWithArm,
  staff: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
} satisfies Prisma.LibraryLoanInclude;
type LoanWithRefs = Prisma.LibraryLoanGetPayload<{ include: typeof loanInclude }>;

@Controller('library')
@RequireFeature('library')
export class LibraryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  private loanRow(l: LoanWithRefs, today: string, finePerDay: number): LoanRow {
    const due = dateOnly(l.dueOn)!;
    const returned = dateOnly(l.returnedOn);
    const daysOverdue = Math.max(0, daysBetween(due, returned ?? today));
    return {
      id: l.id,
      book: l.book,
      borrower: l.student ? studentRef(l.student) : staffRef(l.staff!),
      issuedOn: dateOnly(l.issuedOn)!,
      dueOn: due,
      returnedOn: returned,
      daysOverdue,
      fineKobo: returned ? l.fineKobo : daysOverdue * finePerDay,
      finePaid: l.finePaid,
      note: l.note,
    };
  }

  /** Copies out and times borrowed, per book. */
  private async loanCounts(bookIds: string[]) {
    const [open, all] = await Promise.all([
      this.prisma.db.libraryLoan.groupBy({ by: ['bookId'], where: { bookId: { in: bookIds }, returnedOn: null }, _count: { _all: true } }),
      this.prisma.db.libraryLoan.groupBy({ by: ['bookId'], where: { bookId: { in: bookIds } }, _count: { _all: true } }),
    ]);
    return {
      open: new Map(open.map((o) => [o.bookId, o._count._all])),
      all: new Map(all.map((o) => [o.bookId, o._count._all])),
    };
  }

  private bookRow(b: Prisma.LibraryBookGetPayload<object>, open: number, total: number): BookRow {
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      category: b.category as BookCategory,
      publisher: b.publisher,
      publishedYear: b.publishedYear,
      shelf: b.shelf,
      subject: b.subject,
      level: b.level,
      copies: b.copies,
      onLoan: open,
      available: Math.max(0, b.copies - open),
      timesBorrowed: total,
      summary: b.summary,
    };
  }

  // ---------------------------------------------------------- overview

  @Get('overview')
  @RequirePermissions('library.read')
  async overview(): Promise<LibraryOverview> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const today = school.today;
    const yearAgo = parseDate(addDays(today, -365));
    const [books, open, recent, unpaidFines] = await Promise.all([
      db.libraryBook.findMany({ select: { id: true, title: true, author: true, category: true, copies: true } }),
      db.libraryLoan.findMany({ where: { returnedOn: null }, select: { dueOn: true } }),
      db.libraryLoan.findMany({ where: { issuedOn: { gte: yearAgo } }, include: loanInclude }),
      db.libraryLoan.aggregate({ where: { returnedOn: { not: null }, finePaid: false, fineKobo: { gt: 0 } }, _sum: { fineKobo: true } }),
    ]);
    const overdue = open.filter((l) => dateOnly(l.dueOn)! < today);
    const accrued = overdue.reduce((n, l) => n + daysBetween(dateOnly(l.dueOn)!, today) * school.settings.libraryFinePerDayKobo, 0);

    const cat = new Map<string, { titles: number; copies: number }>();
    for (const b of books) {
      const c = cat.get(b.category) ?? { titles: 0, copies: 0 };
      c.titles++;
      c.copies += b.copies;
      cat.set(b.category, c);
    }
    const byBook = new Map<string, number>();
    const byReader = new Map<string, { loan: LoanWithRefs; n: number }>();
    const byMonth = new Map<string, number>();
    for (const l of recent) {
      byBook.set(l.bookId, (byBook.get(l.bookId) ?? 0) + 1);
      const key = l.studentId ?? l.staffId!;
      byReader.set(key, { loan: l, n: (byReader.get(key)?.n ?? 0) + 1 });
      const m = dateOnly(l.issuedOn)!.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    }
    const bookById = new Map(books.map((b) => [b.id, b]));
    const months: { month: string; loans: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - i);
      const m = d.toISOString().slice(0, 7);
      months.push({ month: m, loans: byMonth.get(m) ?? 0 });
    }
    return {
      currency: school.currency,
      titles: books.length,
      copies: books.reduce((n, b) => n + b.copies, 0),
      onLoan: open.length,
      overdue: overdue.length,
      finesOutstandingKobo: (unpaidFines._sum.fineKobo ?? 0) + accrued,
      loansThisMonth: byMonth.get(today.slice(0, 7)) ?? 0,
      byCategory: [...cat].map(([category, c]) => ({ category: category as BookCategory, ...c })).sort((a, b) => b.copies - a.copies),
      popular: [...byBook]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, loans]) => ({ id, title: bookById.get(id)?.title ?? '', author: bookById.get(id)?.author ?? '', loans })),
      topReaders: [...byReader.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, 8)
        .map(({ loan, n }) => ({ borrower: loan.student ? studentRef(loan.student) : staffRef(loan.staff!), loans: n })),
      loansByMonth: months,
      settings: school.settings,
    };
  }

  // ---------------------------------------------------------- books

  @Get('books')
  @RequirePermissions('library.read')
  async books(@Query(new ZodPipe(bookListQuerySchema)) q: z.infer<typeof bookListQuerySchema>): Promise<Paginated<BookRow>> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.LibraryBookWhereInput = {
      ...(q.category ? { category: q.category } : {}),
      AND: terms.map((t) => ({
        OR: [
          { title: { contains: t, mode: 'insensitive' } },
          { author: { contains: t, mode: 'insensitive' } },
          { isbn: { contains: t, mode: 'insensitive' } },
          { subject: { contains: t, mode: 'insensitive' } },
        ],
      })),
    };
    if (q.available) {
      // Availability depends on open loans, so filter after counting.
      const all = await this.prisma.db.libraryBook.findMany({ where, orderBy: { title: 'asc' } });
      const counts = await this.loanCounts(all.map((b) => b.id));
      const rows = all
        .map((b) => this.bookRow(b, counts.open.get(b.id) ?? 0, counts.all.get(b.id) ?? 0))
        .filter((b) => (q.available === 'true' ? b.available > 0 : b.available === 0));
      const { skip, take } = paginate(q.page, q.pageSize);
      return { items: rows.slice(skip, skip + take), total: rows.length, page: q.page, pageSize: q.pageSize };
    }
    const [rows, total] = await Promise.all([
      this.prisma.db.libraryBook.findMany({ where, orderBy: { title: 'asc' }, ...paginate(q.page, q.pageSize) }),
      this.prisma.db.libraryBook.count({ where }),
    ]);
    const counts = await this.loanCounts(rows.map((b) => b.id));
    return { items: rows.map((b) => this.bookRow(b, counts.open.get(b.id) ?? 0, counts.all.get(b.id) ?? 0)), total, page: q.page, pageSize: q.pageSize };
  }

  @Post('books')
  @RequirePermissions('library.manage')
  async createBook(@Body(new ZodPipe(bookSchema)) body: BookInput): Promise<BookRow> {
    const b = await this.prisma.db.libraryBook.create({ data: { ...body, tenantId: currentTenantId() } });
    await this.audit.log({ action: 'library.book_added', entityType: 'LibraryBook', entityId: b.id, summary: `Added "${b.title}" by ${b.author} (${b.copies} cop${b.copies === 1 ? 'y' : 'ies'})` });
    return this.bookRow(b, 0, 0);
  }

  @Put('books/:id')
  @RequirePermissions('library.manage')
  async updateBook(@Param('id') id: string, @Body(new ZodPipe(bookSchema)) body: BookInput): Promise<BookRow> {
    const counts = await this.loanCounts([id]);
    const out = counts.open.get(id) ?? 0;
    if (body.copies < out) throw new BadRequestException(`${out} copies are out on loan — you can't have fewer copies than that`);
    const b = await this.prisma.db.libraryBook.update({ where: { id }, data: body });
    return this.bookRow(b, out, counts.all.get(id) ?? 0);
  }

  @Delete('books/:id')
  @HttpCode(204)
  @RequirePermissions('library.manage')
  async deleteBook(@Param('id') id: string) {
    const b = await this.prisma.db.libraryBook.findUniqueOrThrow({ where: { id } });
    if (await this.prisma.db.libraryLoan.count({ where: { bookId: id, returnedOn: null } })) throw new BadRequestException('Copies of this book are still out on loan');
    await this.prisma.db.libraryBook.delete({ where: { id } });
    await this.audit.log({ action: 'library.book_removed', entityType: 'LibraryBook', entityId: id, summary: `Removed "${b.title}" from the catalogue` });
  }

  // ---------------------------------------------------------- loans

  @Get('loans')
  @RequirePermissions('library.read')
  async loans(@Query(new ZodPipe(loanListQuerySchema)) q: z.infer<typeof loanListQuerySchema>): Promise<LoanRow[]> {
    const school = await this.ops.school();
    const today = parseDate(school.today);
    const rows = await this.prisma.db.libraryLoan.findMany({
      where: {
        ...(q.status === 'OUT' ? { returnedOn: null } : q.status === 'OVERDUE' ? { returnedOn: null, dueOn: { lt: today } } : q.status === 'RETURNED' ? { returnedOn: { not: null } } : {}),
        ...(q.studentId ? { studentId: q.studentId } : {}),
        ...(q.staffId ? { staffId: q.staffId } : {}),
        ...(q.bookId ? { bookId: q.bookId } : {}),
      },
      include: loanInclude,
      orderBy: q.status === 'RETURNED' || q.status === 'ALL' ? { issuedOn: 'desc' } : { dueOn: 'asc' },
      take: 500,
    });
    return rows.map((l) => this.loanRow(l, school.today, school.settings.libraryFinePerDayKobo));
  }

  @Post('loans')
  @RequirePermissions('library.manage')
  async issue(@Body(new ZodPipe(issueLoanSchema)) body: IssueLoanInput): Promise<LoanRow> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const s = school.settings;
    const book = await db.libraryBook.findUniqueOrThrow({ where: { id: body.bookId } });
    const borrower = body.studentId
      ? await db.student.findUniqueOrThrow({ where: { id: body.studentId } })
      : await db.staff.findUniqueOrThrow({ where: { id: body.staffId! } });
    if (borrower.status !== 'ACTIVE' && borrower.status !== 'ON_LEAVE') throw new BadRequestException(`${fullName(borrower)} is no longer at the school`);
    const mine = await db.libraryLoan.findMany({ where: { returnedOn: null, ...(body.studentId ? { studentId: body.studentId } : { staffId: body.staffId }) } });
    if (mine.some((l) => dateOnly(l.dueOn)! < school.today)) throw new BadRequestException(`${fullName(borrower)} has an overdue book — it must come back first`);
    if (mine.some((l) => l.bookId === book.id)) throw new BadRequestException(`${fullName(borrower)} already has a copy of this book`);
    const max = body.studentId ? s.libraryStudentMaxLoans : s.libraryStaffMaxLoans;
    if (mine.length >= max) throw new BadRequestException(`${fullName(borrower)} already has ${mine.length} books out (the limit is ${max})`);
    const dueOn = body.dueOn ?? addDays(school.today, s.libraryLoanDays);
    if (dueOn <= school.today) throw new BadRequestException('The due date must be after today');

    // Check-and-lend in one transaction so two desks can't lend the last copy twice.
    const loan = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM library_books WHERE id = ${book.id} FOR UPDATE`;
      const out = await tx.libraryLoan.count({ where: { bookId: book.id, returnedOn: null } });
      if (out >= book.copies) throw new BadRequestException(`All ${book.copies} cop${book.copies === 1 ? 'y is' : 'ies are'} out on loan`);
      return tx.libraryLoan.create({
        data: {
          tenantId: currentTenantId(),
          bookId: book.id,
          studentId: body.studentId ?? null,
          staffId: body.staffId ?? null,
          issuedOn: parseDate(school.today),
          dueOn: parseDate(dueOn),
          note: body.note,
          issuedById: currentContext().userId,
        },
        include: loanInclude,
      });
    });
    await this.audit.log({ action: 'library.issued', entityType: 'LibraryLoan', entityId: loan.id, summary: `Lent "${book.title}" to ${fullName(borrower)}, due ${dueOn}` });
    return this.loanRow(loan, school.today, s.libraryFinePerDayKobo);
  }

  @Post('loans/:id/return')
  @HttpCode(200)
  @RequirePermissions('library.manage')
  async return(@Param('id') id: string, @Body(new ZodPipe(returnLoanSchema)) body: z.infer<typeof returnLoanSchema>): Promise<LoanRow> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const loan = await db.libraryLoan.findUniqueOrThrow({ where: { id }, include: loanInclude });
    if (loan.returnedOn) throw new BadRequestException('This book has already been returned');
    const accrued = Math.max(0, daysBetween(dateOnly(loan.dueOn)!, school.today)) * school.settings.libraryFinePerDayKobo;
    const fine = body.fineKobo === undefined ? accrued : Math.min(body.fineKobo, accrued);
    const done = await db.libraryLoan.updateMany({
      where: { id, returnedOn: null },
      data: { returnedOn: parseDate(school.today), fineKobo: fine, finePaid: fine === 0 ? false : body.finePaid, note: body.note ?? loan.note },
    });
    if (!done.count) throw new BadRequestException('This book has already been returned');
    const who = loan.student ? fullName(loan.student) : fullName(loan.staff!);
    await this.audit.log({
      action: 'library.returned',
      entityType: 'LibraryLoan',
      entityId: id,
      summary: `${who} returned "${loan.book.title}"${fine ? ` — fine ${fine / 100}${body.finePaid ? ' paid' : ' owed'}${fine < accrued ? ` (${(accrued - fine) / 100} waived)` : ''}` : ''}`,
    });
    return this.loanRow(await db.libraryLoan.findUniqueOrThrow({ where: { id }, include: loanInclude }), school.today, school.settings.libraryFinePerDayKobo);
  }

  @Post('loans/:id/renew')
  @HttpCode(200)
  @RequirePermissions('library.manage')
  async renew(@Param('id') id: string): Promise<LoanRow> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const loan = await db.libraryLoan.findUniqueOrThrow({ where: { id }, include: loanInclude });
    if (loan.returnedOn) throw new BadRequestException('This book has been returned');
    if (dateOnly(loan.dueOn)! < school.today) throw new BadRequestException('This loan is overdue — return it (and settle any fine) before lending it again');
    const dueOn = addDays(school.today, school.settings.libraryLoanDays);
    await db.libraryLoan.update({ where: { id }, data: { dueOn: parseDate(dueOn) } });
    await this.audit.log({ action: 'library.renewed', entityType: 'LibraryLoan', entityId: id, summary: `Renewed "${loan.book.title}" until ${dueOn}` });
    return this.loanRow({ ...loan, dueOn: parseDate(dueOn) }, school.today, school.settings.libraryFinePerDayKobo);
  }

  @Post('loans/:id/fine-paid')
  @HttpCode(200)
  @RequirePermissions('library.manage')
  async finePaid(@Param('id') id: string): Promise<LoanRow> {
    const school = await this.ops.school();
    const loan = await this.prisma.db.libraryLoan.findUniqueOrThrow({ where: { id }, include: loanInclude });
    if (!loan.returnedOn || !loan.fineKobo) throw new BadRequestException('There is no fine to settle on this loan');
    await this.prisma.db.libraryLoan.update({ where: { id }, data: { finePaid: true } });
    await this.audit.log({ action: 'library.fine_paid', entityType: 'LibraryLoan', entityId: id, summary: `Fine of ${loan.fineKobo / 100} paid for "${loan.book.title}"` });
    return this.loanRow({ ...loan, finePaid: true }, school.today, school.settings.libraryFinePerDayKobo);
  }

  // ---------------------------------------------------------- AI

  /** A reading list chosen from the school's own catalogue. */
  @Post('reading-list')
  @HttpCode(200)
  @RequirePermissions('library.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async readingList(@Body(new ZodPipe(readingListRequestSchema)) body: z.infer<typeof readingListRequestSchema>): Promise<ReadingList> {
    const books = await this.prisma.db.libraryBook.findMany({ where: { category: { not: 'MAGAZINE' } }, orderBy: { title: 'asc' }, take: 400 });
    if (!books.length) throw new BadRequestException('Add books to the catalogue first');
    const counts = await this.loanCounts(books.map((b) => b.id));
    const rows = new Map(books.map((b) => [b.id, this.bookRow(b, counts.open.get(b.id) ?? 0, counts.all.get(b.id) ?? 0)]));
    const catalogue = [...rows.values()]
      .map((b) => `${b.id} | ${b.title} | ${b.author} | ${BOOK_CATEGORY_LABELS[b.category]} | ${b.level ?? '-'} | ${b.subject ?? '-'} | ${b.available} | ${(b.summary ?? '').slice(0, 140)}`)
      .join('\n');
    const school = await this.ops.school();
    const { system, user } = readingListPrompt(
      school.name,
      catalogue,
      `Readers: ${body.audience}.${body.topic ? ` Topic or theme: ${body.topic}.` : ''} Suggest up to ${body.count} books.`,
    );
    const r = await this.gateway.generateJson({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, aiReadingListSchema, 'reading-list');
    const seen = new Set<string>();
    const picks = r.data.picks
      .filter((p) => rows.has(p.bookId) && !seen.has(p.bookId) && seen.add(p.bookId))
      .slice(0, body.count)
      .map((p) => ({ book: rows.get(p.bookId)!, why: p.why }));
    return { intro: r.data.intro, picks, text: r.data.intro, provider: r.provider, model: r.model };
  }
}
