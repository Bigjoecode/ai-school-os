import { Controller, Get, Module, Param, Post, Query, Req, Res, UploadedFile as Upload, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { UploadedFile } from '@aischool/shared';
import { Public, RequirePermissions } from '../common/decorators';
import { currentContext } from '../common/request-context';
import { env } from '../config/env';
import { FilesService } from './files.service';

/** Multer's cap: the larger of the document and media limits (the service applies the right one per type). */
const maxBytes = () => Math.max(env().UPLOAD_MAX_MB, env().UPLOAD_MEDIA_MAX_MB) * 1024 * 1024;

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Uploads for the website (public files). Other uses can add their own permission later. */
  @Post('files')
  @RequirePermissions('website.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxBytes(), files: 1 } }))
  upload(@Upload() file: Express.Multer.File | undefined, @Query('public') isPublic?: string): Promise<UploadedFile> {
    return this.files.save(file, isPublic !== 'false');
  }

  /**
   * A private upload for anyone in the school: assignment submissions,
   * curriculum and scheme documents, report card samples. Only staff and
   * the uploader can open it directly.
   */
  @Post('files/private')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxBytes(), files: 1 } }))
  uploadPrivate(@Upload() file: Express.Multer.File | undefined): Promise<UploadedFile> {
    return this.files.save(file, false);
  }

  @Get('public/files/:id')
  @Public()
  async publicFile(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    this.send(res, await this.files.read(id, true), true, req);
  }

  /** Staff open any of the school's files; everyone else only what they uploaded. */
  @Get('files/:id')
  async privateFile(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const ctx = currentContext();
    const staff = ctx.permissions.has('school.read');
    this.send(res, await this.files.read(id, false, staff ? undefined : ctx.userId), false, req);
  }

  send(res: Response, f: { data: Buffer; mimeType: string; filename: string; inline: boolean }, cacheable: boolean, req?: Request) {
    res.setHeader('content-type', f.mimeType);
    res.setHeader('accept-ranges', 'bytes');
    // Video and audio players ask for byte ranges so they can seek.
    const range = req?.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
    if (range && f.data.length) {
      const size = f.data.length;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.status(416).setHeader('content-range', `bytes */${size}`);
        res.end();
        return;
      }
      res.status(206).setHeader('content-range', `bytes ${start}-${end}/${size}`);
      f = { ...f, data: f.data.subarray(start, end + 1) };
    }
    res.setHeader('content-length', String(f.data.length));
    res.setHeader('x-content-type-options', 'nosniff');
    // A file opened directly can't run anything.
    res.setHeader('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('cache-control', cacheable ? 'public, max-age=31536000, immutable' : 'private, max-age=300');
    res.setHeader('cross-origin-resource-policy', 'cross-origin');
    res.setHeader('content-disposition', `${f.inline ? 'inline' : 'attachment'}; filename="${f.filename.replace(/"/g, '')}"`);
    res.end(f.data);
  }
}

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
