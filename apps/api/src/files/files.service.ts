import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { UploadedFile } from '@aischool/shared';
import { currentContext, currentTenantId } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

interface Kind {
  ext: string;
  mime: string;
  /** Video or audio: a larger size limit applies. */
  media?: boolean;
}

const OFFICE: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Recognise a file by its first bytes, never by what the browser claims. SVG and HTML are refused. */
function sniff(buf: Buffer, filename: string): Kind | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  // Office files are zip containers; the extension decides only among these.
  if (buf[0] === 0x50 && buf[1] === 0x4b && OFFICE[ext]) return { ext, mime: OFFICE[ext]! };
  // Video and audio (assignments, projects, recordings).
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand === 'qt  ') return { ext: 'mov', mime: 'video/quicktime', media: true };
    if (brand.startsWith('M4A')) return { ext: 'm4a', mime: 'audio/mp4', media: true };
    if (/^(3gp|3g2)/.test(brand)) return { ext: '3gp', mime: 'video/3gpp', media: true };
    return { ext: 'mp4', mime: 'video/mp4', media: true };
  }
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { ext: 'webm', mime: 'video/webm', media: true };
  if (buf.subarray(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg', media: true };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return { ext: 'wav', mime: 'audio/wav', media: true };
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') return { ext: 'ogg', mime: 'audio/ogg', media: true };
  return null;
}

export function uploadRoot(): string {
  return resolve(env().UPLOAD_DIR || resolve(process.cwd(), 'uploads'));
}

/** Files on the server's disk, recorded per school. Website files are public; others need sign-in. */
@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async save(file: { buffer: Buffer; originalname: string; size: number } | undefined, isPublic: boolean): Promise<UploadedFile> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload');
    const kind = sniff(file.buffer, file.originalname);
    if (!kind) throw new BadRequestException('Upload an image (JPG, PNG, WebP, GIF), a PDF, a Word, Excel or PowerPoint file, a video (MP4, MOV, WebM) or audio (MP3, M4A, WAV)');
    const limit = kind.media ? env().UPLOAD_MEDIA_MAX_MB : env().UPLOAD_MAX_MB;
    if (file.size > limit * 1024 * 1024) throw new BadRequestException(`${kind.media ? 'Videos and audio' : 'Files'} can be up to ${limit} MB${kind.media ? '. For longer videos, share a YouTube or Google Drive link instead.' : ''}`);
    const tenantId = currentTenantId();
    const storageKey = `${tenantId}/${randomBytes(16).toString('hex')}.${kind.ext}`;
    const path = resolve(uploadRoot(), storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer);
    const filename = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 150) || `file.${kind.ext}`;
    const row = await this.prisma.db.fileObject.create({
      data: { tenantId, storageKey, filename, mimeType: kind.mime, sizeBytes: file.size, uploadedById: currentContext().userId, isPublic },
    });
    return { id: row.id, url: `/api/${isPublic ? 'public/' : ''}files/${row.id}`, filename, mimeType: kind.mime, sizeBytes: file.size };
  }

  /**
   * Reads a file. Public files need no sign-in; private ones must belong to
   * the caller's school, and when `onlyUploader` is given, to that user
   * (students and parents only see their own uploads here; assignment
   * files reach them through the assignment's own checks).
   */
  async read(id: string, requirePublic: boolean, onlyUploader?: string) {
    const row = requirePublic ? await this.prisma.root.fileObject.findUnique({ where: { id } }) : await this.prisma.db.fileObject.findUnique({ where: { id } });
    if (!row || (requirePublic && !row.isPublic) || (onlyUploader && row.uploadedById !== onlyUploader)) throw new NotFoundException('File not found');
    const data = await readFile(resolve(uploadRoot(), row.storageKey)).catch(() => null);
    if (!data) throw new NotFoundException('File not found');
    const inline = /^(image|video|audio)\//.test(row.mimeType) || row.mimeType === 'application/pdf';
    return { data, mimeType: row.mimeType, filename: row.filename, inline };
  }

  /** Size of an uploaded public file, from its URL (for download listings). */
  async sizeOf(url: string): Promise<number | null> {
    const id = /\/files\/([a-z0-9]+)$/.exec(url)?.[1];
    if (!id) return null;
    const row = await this.prisma.root.fileObject.findUnique({ where: { id }, select: { sizeBytes: true } });
    return row?.sizeBytes ?? null;
  }
}
