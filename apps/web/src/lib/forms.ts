import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Map server-side validation errors (`errors: [{ path, message }]`) onto
 * react-hook-form fields. Returns true when at least one field was mapped.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError) || error.errors.length === 0) return false;
  let mapped = false;
  for (const e of error.errors) {
    if (!e.path) continue;
    setError(e.path as Path<T>, { type: 'server', message: e.message }, { shouldFocus: !mapped });
    mapped = true;
  }
  return mapped;
}

/** For register(): empty inputs become undefined so optional zod fields pass. */
export const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const toOptionalNumber = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

export const toNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
