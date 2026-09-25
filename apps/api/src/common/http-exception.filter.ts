import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

/**
 * Every error leaves the API in one shape:
 *   { statusCode, message, errors?: [{ path, message }] }
 * Database constraint errors become readable 404/409s; anything unexpected is
 * logged and returned as a generic 500 without internals.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: Record<string, unknown> } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        const message = Array.isArray(r.message) ? r.message.join(', ') : r.message;
        // Pass through any extra detail (e.g. timetable `conflicts`).
        const { message: _m, statusCode: _s, error: _e, ...extra } = r;
        return { status, body: { statusCode: status, message: message ?? exception.message, ...extra } };
      }
      return { status, body: { statusCode: status, message: String(response) } };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const fields = uniqueFields(exception.meta).filter((f) => f !== 'tenantId');
        return {
          status: HttpStatus.CONFLICT,
          body: {
            statusCode: HttpStatus.CONFLICT,
            message: `That ${fields.join(', ') || 'record'} is already in use`,
            errors: fields.map((path) => ({ path, message: 'Already in use' })),
          },
        };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { statusCode: 404, message: 'Not found' } };
      }
      if (exception.code === 'P2003') {
        return {
          status: 409,
          body: { statusCode: 409, message: 'This record is still referenced by other records' },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { statusCode: 500, message: 'Something went wrong on our side' },
    };
  }
}

/**
 * Columns behind a unique-constraint violation. With the pg driver adapter
 * Prisma reports the index name (`subjects_tenantId_code_key`) rather than a
 * `target` list, so the columns are read back out of it.
 */
function uniqueFields(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.target;
  if (Array.isArray(target)) return target as string[];
  const cause = (meta?.driverAdapterError as { cause?: { table?: string; constraint?: { index?: string } } })?.cause;
  const index = cause?.constraint?.index;
  if (!index || !cause?.table) return [];
  return index
    .replace(new RegExp(`^${cause.table}_`), '')
    .replace(/_key$/, '')
    .split('_');
}
