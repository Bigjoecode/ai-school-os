/** `Date` (from a DATE column) → `YYYY-MM-DD`, or null. */
export function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** `YYYY-MM-DD` → Date at UTC midnight, for DATE columns. */
export function parseDate(s: string): Date;
export function parseDate(s: string | undefined): Date | undefined;
export function parseDate(s: string | undefined): Date | undefined {
  return s ? new Date(`${s}T00:00:00.000Z`) : undefined;
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
