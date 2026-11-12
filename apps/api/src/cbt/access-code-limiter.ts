import { HttpException, HttpStatus } from '@nestjs/common';
import { AttemptLimiter } from '../auth/attempt-limiter';

/** Wrong exam/practical access codes, per exam per pupil: 10 wrong in 10 minutes locks that pupil out of that exam for the rest of the 10 minutes. */
export const accessCodeLimiter = new AttemptLimiter(10, 10 * 60_000);

export function accessCodeKey(kind: 'cbt' | 'practical', examId: string, studentId: string): string {
  return `${kind}|${examId}|${studentId}`;
}

/** Refuses before the code is even compared while the pupil is locked out. */
export function assertNotLockedOut(key: string): void {
  const wait = accessCodeLimiter.blockedFor(key);
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60_000);
    throw new HttpException({ statusCode: 429, message: `Too many wrong access codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask your invigilator.`, errors: [{ path: 'accessCode', message: 'Too many wrong codes' }] }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
