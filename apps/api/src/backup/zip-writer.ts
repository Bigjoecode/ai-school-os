import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'node:zlib';

/**
 * A small streaming ZIP writer (deflate, data descriptors, UTF-8 names).
 * Entries are compressed as they are produced and written straight to the
 * response, so a large school's export never sits in memory or on disk.
 * No dependency: shared hosting can't `npm install` native or extra packages.
 * Limits (fine for a school export): under 4 GB and 65,535 files.
 */

let crcTable: Uint32Array | undefined;
function crc32Fallback(buf: Buffer, crc = 0): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// zlib.crc32 is native from Node 20.15 / 22.2; older Node falls back to the table.
const nativeCrc = (zlib as unknown as { crc32?: (data: Buffer, value?: number) => number }).crc32;
const crc32 = (buf: Buffer, crc = 0): number => (nativeCrc ? nativeCrc(buf, crc) >>> 0 : crc32Fallback(buf, crc));

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface CentralEntry {
  name: Buffer;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const FLAGS = 0x0808; // bit 3: sizes follow the data; bit 11: UTF-8 file names

export class ZipWriter {
  private offset = 0;
  private readonly entries: CentralEntry[] = [];
  private readonly when = dosDateTime(new Date());

  constructor(private readonly out: Writable) {}

  /** Bytes written so far. */
  get bytes(): number {
    return this.offset;
  }

  private async write(buf: Buffer): Promise<void> {
    if (this.out.destroyed || this.out.writableEnded) throw new Error('The download was cancelled');
    this.offset += buf.length;
    if (!this.out.write(buf)) {
      // Wait for the client to catch up, or give up if it disconnects.
      const out = this.out;
      await new Promise<void>((resolve, reject) => {
        const done = (err?: Error) => {
          out.off('drain', onDrain);
          out.off('close', onClose);
          if (err) reject(err);
          else resolve();
        };
        const onDrain = () => done();
        const onClose = () => done(new Error('The download was cancelled'));
        out.on('drain', onDrain);
        out.on('close', onClose);
      });
    }
  }

  /** Adds one file, compressing chunks as the source yields them. */
  async addFile(name: string, source: AsyncIterable<string | Buffer> | Iterable<string | Buffer>): Promise<void> {
    if (this.entries.length >= 65_535) throw new Error('Too many files for a ZIP');
    const nameBuf = Buffer.from(name, 'utf8');
    const offset = this.offset;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(FLAGS, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(this.when.time, 10);
    header.writeUInt16LE(this.when.date, 12);
    // crc and sizes (14..25) stay zero: they follow in the data descriptor.
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    await this.write(Buffer.concat([header, nameBuf]));

    let crc = 0;
    let size = 0;
    let compressed = 0;
    async function* counted() {
      for await (const chunk of source) {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        if (!buf.length) continue;
        crc = crc32(buf, crc);
        size += buf.length;
        yield buf;
      }
    }
    await pipeline(Readable.from(counted()), zlib.createDeflateRaw({ level: 6 }), async (deflated: AsyncIterable<Buffer>) => {
      for await (const piece of deflated) {
        compressed += piece.length;
        await this.write(piece);
      }
    });
    if (size > 0xffffffff || compressed > 0xffffffff || this.offset > 0xffffffff) {
      throw new Error('The export is larger than 4 GB');
    }

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeUInt32LE(compressed, 8);
    descriptor.writeUInt32LE(size, 12);
    await this.write(descriptor);
    this.entries.push({ name: nameBuf, crc: crc >>> 0, compressed, size, offset, ...this.when });
  }

  /** Writes the central directory. The caller ends the stream. */
  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4); // made by: MS-DOS / v2.0
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(FLAGS, 8);
      h.writeUInt16LE(8, 10);
      h.writeUInt16LE(e.time, 12);
      h.writeUInt16LE(e.date, 14);
      h.writeUInt32LE(e.crc, 16);
      h.writeUInt32LE(e.compressed, 20);
      h.writeUInt32LE(e.size, 24);
      h.writeUInt16LE(e.name.length, 28);
      // extra, comment, disk, internal attributes, external attributes: zero
      h.writeUInt32LE(e.offset, 42);
      await this.write(Buffer.concat([h, e.name]));
    }
    const size = this.offset - start;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
  }
}
