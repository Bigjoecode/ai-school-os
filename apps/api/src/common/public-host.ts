import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Server-side requests to an address an admin typed (BigBlueButton server, school SMTP host)
 * must not reach the API's own network: loopback, private, link-local (cloud metadata),
 * carrier-grade NAT, multicast and other reserved ranges are refused, after resolving the
 * name, so a hostname that points inside is refused too.
 */
export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number) as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this network, private, loopback, multicast/reserved
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF, TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
    const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPublicIp(mapped[1]!);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) {
      const [hi, lo] = s.slice(7).split(':').map((h) => parseInt(h, 16)) as [number, number];
      return isPublicIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (s === '::' || s === '::1') return false;
    const first = parseInt(s.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
    if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if (s.startsWith('64:ff9b:')) return false; // NAT64 to anything
    if (first === 0x2001 && /^2001:0*db8:/.test(s)) return false; // documentation
    if (first === 0) return false; // other ::/16 forms
    return true;
  }
  return false;
}

export class PrivateHostError extends Error {
  constructor() {
    super('not a public address');
  }
}

/** The addresses a host name resolves to, all public; otherwise PrivateHostError (also when it doesn't resolve). */
export async function resolvePublicHost(host: string, resolve: typeof lookup = lookup): Promise<string[]> {
  const h = host.trim().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h || h.toLowerCase() === 'localhost' || h.toLowerCase().endsWith('.localhost')) throw new PrivateHostError();
  let addrs: string[];
  if (isIP(h)) addrs = [h];
  else {
    try {
      addrs = (await resolve(h, { all: true, verbatim: true })).map((r) => r.address);
    } catch {
      throw new PrivateHostError();
    }
  }
  if (!addrs.length || !addrs.every(isPublicIp)) throw new PrivateHostError();
  return addrs;
}

/** For a URL: its host must resolve only to public addresses, over http(s). */
export async function assertPublicUrl(url: string, resolve: typeof lookup = lookup): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new PrivateHostError();
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new PrivateHostError();
  await resolvePublicHost(u.hostname, resolve);
}
