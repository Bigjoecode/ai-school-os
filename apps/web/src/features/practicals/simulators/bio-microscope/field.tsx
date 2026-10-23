import {
  MICRO_BRIGHT_RANGE,
  MICRO_FOCUS_TOL,
  labBetween,
  labRandom,
  microBrightness,
  microIsStained,
  type BioMicroscopeVariant,
  type MicroMedium,
  type MicroObjective,
  type MicroScope,
} from '@aischool/shared';
import { memo, useId, useMemo } from 'react';

/**
 * The field of view: the specimen drawn in micrometres (seeded, consistent
 * with the hidden values the grader uses), scaled to the objective, blurred by
 * how far the stage is from focus, dimmed or washed out by the lamp and
 * diaphragm. The view is a circle of radius 150 units centred on 0, 0.
 */

export const VIEW_R = 150;
export const viewScale = (v: BioMicroscopeVariant, o: MicroObjective) => VIEW_R / ((v.fov[o] * 1000) / 2);

const f1 = (x: number) => Math.round(x * 10) / 10;
const ell = (x: number, y: number, rx: number, ry: number) => `M${f1(x - rx)} ${f1(y)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(rx * 2)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-rx * 2)} 0Z`;
const rect = (x0: number, y0: number, x1: number, y1: number) => `M${f1(x0)} ${f1(y0)}H${f1(x1)}V${f1(y1)}H${f1(x0)}Z`;
/** A rounded rectangle path. */
const rrect = (x0: number, y0: number, x1: number, y1: number, r: number) => {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return `M${f1(x0 + rr)} ${f1(y0)}H${f1(x1 - rr)}Q${f1(x1)} ${f1(y0)} ${f1(x1)} ${f1(y0 + rr)}V${f1(y1 - rr)}Q${f1(x1)} ${f1(y1)} ${f1(x1 - rr)} ${f1(y1)}H${f1(x0 + rr)}Q${f1(x0)} ${f1(y1)} ${f1(x0)} ${f1(y1 - rr)}V${f1(y0 + rr)}Q${f1(x0)} ${f1(y0)} ${f1(x0 + rr)} ${f1(y0)}Z`;
};
/** A smooth closed path through points (Catmull-Rom). */
function smooth(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  let d = `M${f1(pts[0]!.x)} ${f1(pts[0]!.y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    d += `C${f1(p1.x + (p2.x - p0.x) / 6)} ${f1(p1.y + (p2.y - p0.y) / 6)} ${f1(p2.x - (p3.x - p1.x) / 6)} ${f1(p2.y - (p3.y - p1.y) / 6)} ${f1(p2.x)} ${f1(p2.y)}`;
  }
  return `${d}Z`;
}

interface Look {
  wall: string;
  cyto: string;
  vac: string;
  nucleus: string;
}
function look(v: BioMicroscopeVariant, medium: MicroMedium | null): Look {
  if (v.slide === 'ONION') return medium === 'IODINE' ? { wall: '#8b6b2e', cyto: '#ecd68f', vac: '#faf3d8', nucleus: '#7a4512' } : medium === 'METHYLENE_BLUE' ? { wall: '#5b7fae', cyto: '#d6e3f2', vac: '#f1f5fa', nucleus: '#36589a' } : { wall: '#b9bdb7', cyto: '#eeefea', vac: '#f6f6f2', nucleus: '#d7d8d2' };
  if (v.slide === 'CHEEK') return medium === 'METHYLENE_BLUE' ? { wall: '#4f79b8', cyto: '#cfdff2', vac: '#cfdff2', nucleus: '#23458f' } : medium === 'IODINE' ? { wall: '#b09550', cyto: '#f1e7c3', vac: '#f1e7c3', nucleus: '#97773a' } : { wall: '#c4c8c3', cyto: '#eef0ec', vac: '#eef0ec', nucleus: '#d3d6d1' };
  return { wall: '#7c6f74', cyto: '#e9dfe3', vac: '#f5f1f2', nucleus: '#8f8a8c' };
}

function onionLike(v: BioMicroscopeVariant, medium: MicroMedium | null, R: number, detail: boolean, px: number) {
  const Rmax = ((v.fov[4] * 1000) / 2) * 1.02;
  const r = labRandom(v.seed, `web-rows-${v.slide}`);
  const w = v.cellWidth;
  const L = (v.row[v.row.length - 1]! - v.row[0]!) / (v.row.length - 1);
  const plasmo = v.slide === 'PLASMOLYSIS';
  const shrink = plasmo && medium === 'SALT';
  const lk = look(v, medium);
  let walls = '';
  let vac = '';
  let nuc = '';
  let proto = '';
  const rows = Math.ceil(Rmax / w) + 1;
  for (let j = -rows; j <= rows; j++) {
    const yt = j * w - w / 2;
    const yb = yt + w;
    let bounds: number[];
    if (j === 0) bounds = v.row;
    else {
      bounds = [];
      let x = -Rmax - labBetween(r, 0, 1, 3) * L;
      bounds.push(x);
      while (x < Rmax) {
        x += L * labBetween(r, 0.85, 1.15, 3);
        bounds.push(x);
      }
    }
    // Seeded per-cell values are drawn for every cell (visible or not) so the layout is the same at every objective.
    const cellRand = bounds.map(() => [r(), r(), r(), r(), r()]);
    const rowVisible = yb > -R && yt < R;
    if (rowVisible) walls += `M${f1(-R)} ${f1(yt)}H${f1(R)}`;
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i]!;
      const b = bounds[i + 1]!;
      const cr = cellRand[i]!;
      if (!rowVisible || b < -R || a > R) continue;
      walls += `M${f1(a)} ${f1(yt)}V${f1(yb)}`;
      const central = j === 0 && a <= 0 && b > 0;
      if (plasmo) {
        const ins = central ? v.inset : { l: 0.08 + cr[0]! * 0.16, r: 0.08 + cr[1]! * 0.14, t: 0.12 + cr[2]! * 0.14, b: 0.12 + cr[3]! * 0.12 };
        const cl = b - a;
        const g = shrink ? ins : { l: 1.5 / cl, r: 1.5 / cl, t: 1.5 / w, b: 1.5 / w };
        const x0 = a + g.l * cl;
        const x1 = b - g.r * cl;
        const y0 = yt + g.t * w;
        const y1 = yb - g.b * w;
        proto += detail ? rrect(x0, y0, x1, y1, shrink ? Math.min(x1 - x0, y1 - y0) * 0.45 : 2) : rect(x0, y0, x1, y1);
        if (detail) {
          const nx = central ? v.nucleus.x : x0 + (x1 - x0) * (0.25 + cr[4]! * 0.5);
          const ny = central ? v.nucleus.y : y0 + 6;
          nuc += ell(nx, ny, 7, 5);
        }
      } else {
        vac += rect(a + 4.5, yt + 4.5, b - 4.5, yb - 4.5);
        const nx = central ? v.nucleus.x : a + 14 + (b - a - 28) * cr[0]!;
        const ny = central ? v.nucleus.y : yt + 13 + (w - 26) * cr[1]!;
        if (detail) nuc += ell(nx, ny, 11, 8.5);
      }
    }
  }
  const sw = Math.max(3, 0.9 * px);
  return (
    <g>
      <rect x={-R} y={-R} width={2 * R} height={2 * R} fill={plasmo ? lk.vac : lk.cyto} />
      {plasmo ? <path d={proto} fill={shrink ? '#6d2370' : '#93408f'} stroke={shrink ? '#4f1752' : '#7a2f78'} strokeWidth={1.5} /> : <path d={vac} fill={lk.vac} />}
      <path d={walls} fill="none" stroke={lk.wall} strokeWidth={sw} />
      {detail && <path d={nuc} fill={plasmo ? '#b8a2b6' : lk.nucleus} stroke={plasmo ? '#8b6f88' : 'none'} strokeWidth={0.8} />}
    </g>
  );
}

function cheek(v: BioMicroscopeVariant, medium: MicroMedium | null, R: number, px: number) {
  const Rmax = ((v.fov[4] * 1000) / 2) * 1.02;
  const r = labRandom(v.seed, 'web-cheek');
  const lk = look(v, medium);
  const o = v.object;
  const cx = o.x0 + o.length / 2;
  const cell = (x: number, y: number, a: number, b: number, rot: number, exact: boolean) => {
    const n = 10;
    const pts = Array.from({ length: n }, (_, k) => {
      const t = (k / n) * Math.PI * 2;
      const f = exact && (k === 0 || k === n / 2) ? 1 : labBetween(r, 0.86, 0.99, 3);
      const px = Math.cos(t) * a * f;
      const py = Math.sin(t) * b * f;
      return { x: x + px * Math.cos(rot) - py * Math.sin(rot), y: y + px * Math.sin(rot) + py * Math.cos(rot) };
    });
    return `M${pts.map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L')}Z`;
  };
  let cells = '';
  let nuc = '';
  const count = Math.round((4 * Rmax * Rmax) / (115 * 115));
  for (let k = 0; k < count; k++) {
    const rk = labRandom(v.seed, `web-cheek-${k}`);
    const x = labBetween(rk, -Rmax, Rmax, 1);
    const y = labBetween(rk, -Rmax, Rmax, 1);
    const d = labBetween(rk, 45, 80, 1);
    if (Math.hypot(x - cx, y) < o.length * 0.95 + d / 2 || Math.abs(x) > R + d || Math.abs(y) > R + d) continue;
    cells += cell(x, y, d / 2, (d / 2) * labBetween(rk, 0.7, 0.95, 2), rk() * Math.PI, false);
    nuc += ell(x + labBetween(rk, -4, 4, 1), y + labBetween(rk, -4, 4, 1), d * 0.11, d * 0.09);
  }
  const target = cell(cx, 0, o.length / 2, o.width / 2, 0, true);
  return (
    <g>
      <rect x={-R} y={-R} width={2 * R} height={2 * R} fill="#f7f8f4" />
      <path d={cells} fill={lk.cyto} fillOpacity={0.85} stroke={lk.wall} strokeWidth={Math.max(1.2, 0.7 * px)} strokeLinejoin="round" />
      <path d={target} fill={lk.cyto} stroke={lk.wall} strokeWidth={Math.max(1.2, 0.7 * px)} strokeLinejoin="round" />
      <path d={nuc} fill={lk.nucleus} />
      <path d={ell(v.nucleus.x, v.nucleus.y, o.length * 0.11, o.length * 0.09)} fill={lk.nucleus} />
    </g>
  );
}

function pond(v: BioMicroscopeVariant, medium: MicroMedium | null, R: number) {
  const r = labRandom(v.seed, 'web-pond');
  const o = v.object;
  const L = o.length;
  const W = o.width;
  const cx = o.x0 + L / 2;
  const P = (fx: number, fy: number) => ({ x: cx + fx * L, y: fy * W });
  const dead = medium === 'IODINE' || medium === 'METHYLENE_BLUE';
  let debris = '';
  const Rmax = ((v.fov[4] * 1000) / 2) * 1.02;
  const rd = labRandom(v.seed, 'web-pond-debris');
  const R10 = (v.fov[10] * 1000) / 2;
  const R40 = (v.fov[40] * 1000) / 2;
  // Spread evenly, with a little extra near the centre so every objective shows some.
  for (let k = 0; k < 860; k++) {
    const lim = k < 700 ? Rmax : k < 820 ? R10 : R40 * 1.2;
    const rr = lim * Math.sqrt(rd());
    const a = rd() * Math.PI * 2;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    const sz = (k < 700 ? 6 : k < 820 ? 3 : 1.5) + rd() * (k < 700 ? 14 : 5);
    if (Math.abs(x) > R || Math.abs(y) > R || (Math.abs(y) < W * 1.2 && x > o.x0 - L * 0.3 && x < o.x0 + L * 1.5)) continue;
    debris += ell(x, y, sz, sz * 0.7);
  }
  let body: React.ReactNode = null;
  if (v.organism === 'AMOEBA') {
    const n = 14;
    const raw = Array.from({ length: n }, (_, k) => {
      const t = (k / n) * Math.PI * 2;
      const lobe = 1 + 0.35 * Math.max(0, Math.cos(t * 3 + 0.4)) + labBetween(r, -0.08, 0.08, 3);
      return { x: Math.cos(t) * (L / 2) * lobe, y: Math.sin(t) * (W / 2) * (0.8 + 0.4 * r()) };
    });
    const maxX = Math.max(...raw.map((p) => p.x));
    const minX = Math.min(...raw.map((p) => p.x));
    const pts = raw.map((p) => ({ x: cx + (p.x > 0 ? (p.x * L) / 2 / maxX : (p.x * L) / 2 / -minX), y: p.y }));
    const nu = P(-0.06, 0.05);
    const fv = P(0.16, 0.16);
    const cv = P(-0.3, -0.14);
    let gran = '';
    for (let k = 0; k < 40; k++) gran += ell(cx + labBetween(r, -0.35, 0.35, 3) * L, labBetween(r, -0.3, 0.3, 3) * W, 1.2, 1.2);
    body = (
      <g>
        <path d={smooth(pts)} fill="#e7ebe1" fillOpacity={0.9} stroke="#8e988b" strokeWidth={1.6} />
        <path d={gran} fill="#a9b2a2" />
        <path d={ell(nu.x, nu.y, L * 0.07, L * 0.055)} fill="#bfc6b8" stroke="#7d877a" strokeWidth={1} />
        <path d={ell(fv.x, fv.y, L * 0.045, L * 0.045)} fill="#d8cfa8" stroke="#a39566" strokeWidth={0.8} />
        <path d={ell(cv.x, cv.y, L * 0.05, L * 0.05)} fill="#f7faf6" stroke="#9aa597" strokeWidth={0.8} />
      </g>
    );
  } else if (v.organism === 'PARAMECIUM') {
    const top = `M${f1(cx - L / 2)} 0C${f1(cx - L * 0.45)} ${f1(-W * 0.55)} ${f1(cx + L * 0.4)} ${f1(-W * 0.62)} ${f1(cx + L / 2)} ${f1(-W * 0.05)}`;
    const bottom = `C${f1(cx + L * 0.45)} ${f1(W * 0.45)} ${f1(cx + L * 0.2)} ${f1(W * 0.42)} ${f1(cx + L * 0.08)} ${f1(W * 0.3)}C${f1(cx - L * 0.05)} ${f1(W * 0.25)} ${f1(cx - L * 0.15)} ${f1(W * 0.55)} ${f1(cx - L * 0.4)} ${f1(W * 0.4)}C${f1(cx - L * 0.47)} ${f1(W * 0.3)} ${f1(cx - L * 0.5)} ${f1(W * 0.15)} ${f1(cx - L / 2)} 0Z`;
    let cilia = '';
    for (let k = 0; k < 46; k++) {
      const t = (k / 46) * Math.PI * 2;
      const x = cx + Math.cos(t) * L * 0.5;
      const y = Math.sin(t) * W * (Math.sin(t) < 0 ? 0.5 : 0.42);
      cilia += `M${f1(x)} ${f1(y)}l${f1(Math.cos(t) * W * 0.09)} ${f1(Math.sin(t) * W * 0.11)}`;
    }
    const mn = P(0, -0.02);
    body = (
      <g>
        <path d={cilia} stroke="#97a094" strokeWidth={0.8} />
        <path d={top + bottom} fill="#eceee6" stroke="#848d82" strokeWidth={1.4} />
        <path d={ell(mn.x, mn.y, L * 0.1, W * 0.16)} fill="#c2c7bc" stroke="#7d857a" strokeWidth={0.9} />
        {[-0.3, 0.3].map((fx) => {
          const p = P(fx, -0.18);
          return <path key={fx} d={`${ell(p.x, p.y, W * 0.08, W * 0.08)}M${f1(p.x - W * 0.16)} ${f1(p.y)}H${f1(p.x + W * 0.16)}M${f1(p.x)} ${f1(p.y - W * 0.16)}V${f1(p.y + W * 0.16)}`} fill="#fbfcfa" stroke="#9aa397" strokeWidth={0.7} />;
        })}
        <path d={`M${f1(cx + L * 0.3)} ${f1(W * 0.22)}Q${f1(cx + L * 0.12)} ${f1(W * 0.36)} ${f1(cx - L * 0.02)} ${f1(W * 0.27)}`} fill="none" stroke="#6f786d" strokeWidth={1.2} />
      </g>
    );
  } else if (v.organism === 'EUGLENA') {
    const d = `M${f1(cx - L / 2)} 0C${f1(cx - L * 0.3)} ${f1(-W * 0.45)} ${f1(cx + L * 0.3)} ${f1(-W * 0.6)} ${f1(cx + L / 2)} ${f1(-W * 0.1)}C${f1(cx + L * 0.52)} ${f1(W * 0.2)} ${f1(cx + L * 0.25)} ${f1(W * 0.55)} ${f1(cx - L / 2)} 0Z`;
    let chl = '';
    for (let k = 0; k < 9; k++) chl += ell(cx + (-0.32 + k * 0.075) * L, (k % 2 ? 0.18 : -0.16) * W, L * 0.04, W * 0.09);
    const es = P(0.34, -0.12);
    const nu = P(-0.16, 0);
    body = (
      <g>
        <path d={`M${f1(cx + L * 0.49)} ${f1(-W * 0.12)}C${f1(cx + L * 0.58)} ${f1(-W * 0.4)} ${f1(cx + L * 0.64)} ${f1(W * 0.15)} ${f1(cx + L * 0.74)} ${f1(-W * 0.25)}`} fill="none" stroke="#6e8a62" strokeWidth={0.9} />
        <path d={d} fill="#d7eac8" stroke="#5f8a50" strokeWidth={1.2} />
        <path d={chl} fill="#4f9a3a" />
        <path d={ell(nu.x, nu.y, L * 0.07, W * 0.2)} fill="#c5cdbd" stroke="#7b8676" strokeWidth={0.7} />
        <path d={ell(es.x, es.y, L * 0.03, W * 0.08)} fill="#d6403a" />
      </g>
    );
  } else {
    // Spirogyra: a filament across the whole field; cells of length L from o.x0.
    const k0 = Math.floor((-R - o.x0) / L) - 1;
    const k1 = Math.ceil((R - o.x0) / L) + 1;
    let walls = '';
    let bands = '';
    let pyr = '';
    let nuc = '';
    for (let k = k0; k <= k1; k++) {
      const c = o.x0 + k * L + L / 2;
      walls += `M${f1(c - L / 2)} ${f1(-W / 2)}V${f1(W / 2)}`;
      for (let b = 0; b < 3; b++) {
        const xs = -0.425 + b * 0.33;
        const tMax = Math.min(1, (0.48 - xs) / 0.35);
        const p = (t: number) => `${f1(c + (xs + t * 0.35) * L)} ${f1((-0.5 + t) * W)}`;
        bands += `M${p(0)}L${p(tMax)}`;
        for (const t of [0.2, 0.5, 0.8]) if (t <= tMax) pyr += ell(c + (xs + t * 0.35) * L, (-0.5 + t) * W, W * 0.045, W * 0.045);
      }
      pyr += ell(c + 0.445 * L, 0.2 * W, W * 0.05, W * 0.05);
      bands += `M${f1(c + 0.4 * L)} ${f1(0.08 * W)}L${f1(c + 0.48 * L)} ${f1(0.32 * W)}`;
      nuc += ell(c, 0, W * 0.09, W * 0.07);
    }
    body = (
      <g>
        <rect x={-R} y={-W / 2} width={2 * R} height={W} fill="#e4f1db" stroke="#6d8f5f" strokeWidth={1.4} />
        <path d={bands} stroke="#3f8a2e" strokeWidth={W * 0.11} strokeLinecap="round" fill="none" />
        <path d={pyr} fill="#2d6a21" />
        <path d={walls} stroke="#6d8f5f" strokeWidth={1.4} />
        <path d={nuc} fill="#c9d3c0" stroke="#7c8c72" strokeWidth={0.7} />
      </g>
    );
  }
  return (
    <g opacity={dead ? 0.85 : 1}>
      <rect x={-R} y={-R} width={2 * R} height={2 * R} fill="#f3f6ef" />
      <path d={debris} fill="#b7c2ad" />
      {body}
    </g>
  );
}

function stem(v: BioMicroscopeVariant, medium: MicroMedium | null, R: number, pid: string, px: number) {
  const o = v.object;
  const cx = o.x0 + o.length / 2;
  const Rs = o.length / 2;
  const stained = medium === 'SAFRANIN' || medium === 'IODINE';
  const red = medium === 'SAFRANIN' ? '#c2334d' : medium === 'IODINE' ? '#a07b2c' : '#c9c4c0';
  const green = medium === 'SAFRANIN' ? '#9fbf9b' : medium === 'IODINE' ? '#e3d49a' : '#dcdcd6';
  const ground = stained ? '#f5ebee' : '#f1f1ee';
  const ring = (a: number, b: number) => `${ell(cx, 0, Rs * b, Rs * b)}${ell(cx, 0, Rs * a, Rs * a)}`;
  return (
    <g>
      <defs>
        <pattern id={`${pid}-cells`} width={42} height={36} patternUnits="userSpaceOnUse">
          <rect width={42} height={36} fill={ground} />
          <path d={`${ell(10, 9, 9, 8)}${ell(31, 9, 9, 8)}${ell(21, 27, 9, 8)}${ell(0, 27, 9, 8)}${ell(42, 27, 9, 8)}`} fill="none" stroke={stained ? '#d7b9c1' : '#d3d3cf'} strokeWidth={Math.min(4, Math.max(1.4, 0.5 * px))} />
        </pattern>
      </defs>
      <rect x={-R} y={-R} width={2 * R} height={2 * R} fill="#f6f6f2" />
      <circle cx={cx} cy={0} r={Rs} fill={`url(#${pid}-cells)`} />
      <path d={ring(0.97, 1)} fill={stained ? '#d98a9b' : '#cfcac6'} fillRule="evenodd" />
      {v.stemType === 'DICOT' ? (
        <path d={ring(0.9, 0.97)} fill={stained ? '#ebc7cf' : '#dedbd8'} fillRule="evenodd" />
      ) : (
        <path d={ring(0.92, 0.97)} fill={red} fillOpacity={0.75} fillRule="evenodd" />
      )}
      {v.bundles.map((b, i) => {
        const a = Math.atan2(b.y, b.x - cx);
        const out = { x: Math.cos(a), y: Math.sin(a) };
        if (v.stemType === 'DICOT') {
          // Phloem outside, xylem towards the centre, cambium between.
          return (
            <g key={i}>
              <path d={ell(b.x + out.x * b.r * 0.35, b.y + out.y * b.r * 0.35, b.r * 0.75, b.r * 0.75)} fill={green} />
              <path d={ell(b.x - out.x * b.r * 0.3, b.y - out.y * b.r * 0.3, b.r * 0.72, b.r * 0.72)} fill={red} />
              <line x1={b.x - out.y * b.r * 0.8} y1={b.y + out.x * b.r * 0.8} x2={b.x + out.y * b.r * 0.8} y2={b.y - out.x * b.r * 0.8} stroke={stained ? '#6b8c63' : '#bbb'} strokeWidth={Math.max(6, b.r * 0.08)} />
            </g>
          );
        }
        return (
          <g key={i}>
            <path d={ell(b.x, b.y, b.r, b.r * 0.85)} fill={green} stroke={red} strokeWidth={b.r * 0.28} />
            <path d={`${ell(b.x - b.r * 0.35, b.y - out.y * 0, b.r * 0.2, b.r * 0.2)}${ell(b.x + b.r * 0.35, b.y, b.r * 0.2, b.r * 0.2)}`} fill={red} />
          </g>
        );
      })}
      {v.stemType === 'DICOT' && <circle cx={cx} cy={0} r={Rs * 0.52} fill={stained ? '#fbf3f5' : '#f7f7f4'} fillOpacity={0.55} />}
    </g>
  );
}

function leaf(v: BioMicroscopeVariant, R: number, detail: boolean, px: number) {
  const r = labRandom(v.seed, 'web-leaf');
  const Rmax = ((v.fov[4] * 1000) / 2) * 1.02;
  const h = 38;
  let mesh = '';
  const rows = Math.ceil(Rmax / h) + 1;
  const wav = (x0: number, y0: number, x1: number, y1: number, amp: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = detail ? Math.max(2, Math.round(len / 8)) : 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    let d = `M${f1(x0)} ${f1(y0)}`;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const w = detail && i < n ? Math.sin(t * Math.PI * (n / 2)) * amp : 0;
      d += `L${f1(x0 + (x1 - x0) * t + nx * w)} ${f1(y0 + (y1 - y0) * t + ny * w)}`;
    }
    return d;
  };
  const ys = Array.from({ length: rows * 2 + 1 }, (_, k) => (k - rows) * h + labBetween(r, -6, 6, 1));
  for (let k = 0; k < ys.length; k++) {
    const y = ys[k]!;
    const vis = Math.abs(y) < R + h;
    if (vis) mesh += wav(-R, y, R, y, 3);
    if (k + 1 < ys.length) {
      let x = -Rmax + labBetween(r, 0, 40, 1);
      while (x < Rmax) {
        const dx = labBetween(r, -8, 8, 1);
        if (vis && Math.abs(x) < R) mesh += wav(x, y, x + dx, ys[k + 1]!, 3);
        x += labBetween(r, 38, 62, 1);
      }
    }
  }
  // Stomata: the hidden ones near the centre; more at the same density further out (visual only).
  const all = [...v.stomata];
  const R40 = (v.fov[40] * 1000) / 2;
  const R10 = ((v.fov[10] * 1000) / 2) * 1.02;
  const density = v.trueSize / 1e6;
  const ring = (salt: string, r0: number, r1: number, cap: number) => {
    const rs = labRandom(v.seed, salt);
    const want = Math.min(cap, Math.round(density * Math.PI * (r1 * r1 - r0 * r0)));
    const out: { x: number; y: number; angle: number }[] = [];
    for (let k = 0; k < want; k++) {
      const rr = Math.sqrt(r0 * r0 + rs() * (r1 * r1 - r0 * r0));
      const a = rs() * Math.PI * 2;
      out.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, angle: labBetween(rs, -0.6, 0.6, 3) + (rs() < 0.5 ? 0 : Math.PI / 2) });
    }
    return out;
  };
  if (R > R40 * 1.25) all.push(...ring('web-leaf-st10', R40 * 1.25, R10, 700));
  if (R > R10) all.push(...ring('web-leaf-st4', R10, Rmax, 900));
  const sl = v.stomaLength;
  let clear = '';
  let guard = '';
  let pore = '';
  let chl = '';
  for (const s of all) {
    if (Math.abs(s.x) > R + sl || Math.abs(s.y) > R + sl) continue;
    const u = { x: Math.cos(s.angle), y: Math.sin(s.angle) };
    const n = { x: -u.y, y: u.x };
    const g = sl * 0.22;
    clear += ell(s.x, s.y, sl * 0.62, sl * 0.62);
    for (const side of [-1, 1]) {
      const c = { x: s.x + n.x * g * side, y: s.y + n.y * g * side };
      // A guard cell: an ellipse along the pore's axis.
      const a1 = { x: c.x - u.x * sl * 0.5, y: c.y - u.y * sl * 0.5 };
      const a2 = { x: c.x + u.x * sl * 0.5, y: c.y + u.y * sl * 0.5 };
      const bulge = { x: c.x + n.x * g * side * 1.1, y: c.y + n.y * g * side * 1.1 };
      guard += `M${f1(a1.x)} ${f1(a1.y)}Q${f1(bulge.x * 2 - c.x)} ${f1(bulge.y * 2 - c.y)} ${f1(a2.x)} ${f1(a2.y)}Q${f1(s.x)} ${f1(s.y)} ${f1(a1.x)} ${f1(a1.y)}Z`;
      for (const t of [-0.22, 0, 0.2]) chl += ell(c.x + u.x * sl * t + n.x * g * 0.35 * side, c.y + u.y * sl * t + n.y * g * 0.35 * side, sl * 0.05, sl * 0.05);
    }
    pore += `M${f1(s.x - u.x * sl * 0.32)} ${f1(s.y - u.y * sl * 0.32)}Q${f1(s.x + n.x * sl * 0.08)} ${f1(s.y + n.y * sl * 0.08)} ${f1(s.x + u.x * sl * 0.32)} ${f1(s.y + u.y * sl * 0.32)}Q${f1(s.x - n.x * sl * 0.08)} ${f1(s.y - n.y * sl * 0.08)} ${f1(s.x - u.x * sl * 0.32)} ${f1(s.y - u.y * sl * 0.32)}Z`;
  }
  return (
    <g>
      <rect x={-R} y={-R} width={2 * R} height={2 * R} fill="#f3f5ef" />
      <path d={mesh} fill="none" stroke="#a6ad9f" strokeWidth={Math.max(1.3, 0.7 * px)} />
      <path d={clear} fill="#f3f5ef" />
      <path d={guard} fill="#dbe8cf" stroke="#7f9070" strokeWidth={1} />
      <path d={chl} fill="#5c9a45" />
      <path d={pore} fill="#3e4a38" />
    </g>
  );
}

function bubbles(v: BioMicroscopeVariant, R: number) {
  const r = labRandom(v.seed, 'web-bubbles');
  const R40 = (v.fov[40] * 1000) / 2;
  const list = [{ x: R40 * 0.55, y: -R40 * 0.35, rad: R40 * 0.32 }, ...Array.from({ length: 6 }, () => ({ x: labBetween(r, -1800, 1800, 0), y: labBetween(r, -1800, 1800, 0), rad: labBetween(r, 60, 260, 0) }))];
  return (
    <g>
      {list
        .filter((b) => Math.hypot(b.x, b.y) - b.rad < R * 1.05)
        .map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.rad} fill="#fbfbfa" stroke="#20221f" strokeWidth={b.rad * 0.16} />
        ))}
    </g>
  );
}

const Specimen = memo(function Specimen({ v, medium, coverslip, objective, pid }: { v: BioMicroscopeVariant; medium: MicroMedium | null; coverslip: 'ANGLE' | 'DROP' | null; objective: MicroObjective; pid: string }) {
  const R = ((v.fov[objective] * 1000) / 2) * 1.02;
  const detail = objective !== 4;
  const px = 1 / viewScale(v, objective);
  return (
    <g>
      {v.slide === 'ONION' || v.slide === 'PLASMOLYSIS' ? onionLike(v, medium, R, detail, px) : v.slide === 'CHEEK' ? cheek(v, medium, R, px) : v.slide === 'POND' ? pond(v, medium, R) : v.slide === 'STEM' ? stem(v, medium, R, pid, px) : leaf(v, R, detail, px)}
      {coverslip === 'DROP' && bubbles(v, R)}
    </g>
  );
});

export interface FieldProps {
  v: BioMicroscopeVariant;
  scope: MicroScope;
  medium: MicroMedium | null;
  coverslip: 'ANGLE' | 'DROP' | null;
  placed: boolean;
  crashed: boolean;
  graticule: boolean;
  pointer: boolean;
}

/** The field-of-view content, for use inside an SVG with viewBox −150 … 150. */
export function FieldContent({ v, scope, medium, coverslip, placed, crashed, graticule, pointer }: FieldProps) {
  const id = useId().replace(/:/g, '');
  const o = scope.objective;
  const s = viewScale(v, o);
  const dz = scope.coarse + scope.fine - v.focus[o];
  const blur = Math.min(14, Math.max(0, (Math.abs(dz) / MICRO_FOCUS_TOL[o] - 0.55) * 1.6));
  const fade = Math.max(0, 1 - Math.max(0, Math.abs(dz) - 2) / 6);
  const b = microBrightness(scope.lamp, scope.diaphragm, o);
  const contrast = microIsStained(v.slide, medium) || scope.diaphragm <= 60 ? 1 : 0.25 + 0.75 * ((100 - scope.diaphragm) / 40);
  const dark = b < MICRO_BRIGHT_RANGE[0] ? Math.min(0.94, ((MICRO_BRIGHT_RANGE[0] - b) / MICRO_BRIGHT_RANGE[0]) * 1.1) : 0;
  const wash = b > MICRO_BRIGHT_RANGE[1] ? Math.min(0.85, (b - MICRO_BRIGHT_RANGE[1]) * 1.6) : 0;
  const cal = v.calibration[o];
  return (
    <g>
      <defs>
        <clipPath id={`${id}-fov`}>
          <circle cx={0} cy={0} r={VIEW_R} />
        </clipPath>
        <filter id={`${id}-blur`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={blur} />
        </filter>
      </defs>
      <circle cx={0} cy={0} r={VIEW_R + 6} fill="#111" />
      <g clipPath={`url(#${id}-fov)`}>
        <rect x={-VIEW_R} y={-VIEW_R} width={VIEW_R * 2} height={VIEW_R * 2} fill="#f8f6ee" />
        {placed && (
          <g filter={blur > 0.05 ? `url(#${id}-blur)` : undefined} opacity={fade * contrast}>
            <g transform={`scale(${s})`}>
              <Specimen v={v} medium={medium} coverslip={coverslip} objective={o} pid={id} />
            </g>
          </g>
        )}
        {crashed && <path d="M-150 -40L-60 -10L-10 -60L40 10L150 -20M-10 -60L20 -150M40 10L70 150" fill="none" stroke="#333" strokeWidth={1.6} opacity={0.7} />}
        {dark > 0 && <rect x={-VIEW_R} y={-VIEW_R} width={VIEW_R * 2} height={VIEW_R * 2} fill="#000" opacity={dark} />}
        {wash > 0 && <rect x={-VIEW_R} y={-VIEW_R} width={VIEW_R * 2} height={VIEW_R * 2} fill="#fff" opacity={wash} />}
        {pointer && <line x1={-VIEW_R} x2={VIEW_R} y1={0} y2={0} stroke="#111" strokeWidth={1} opacity={0.75} />}
        {graticule && (
          <g opacity={0.9}>
            <line x1={-50 * cal * s} x2={50 * cal * s} y1={0} y2={0} stroke="#111" strokeWidth={0.7} />
            {Array.from({ length: 101 }, (_, u) => {
              const x = (u - 50) * cal * s;
              const big = u % 10 === 0;
              const mid = u % 5 === 0;
              return (
                <g key={u}>
                  <line x1={x} x2={x} y1={0} y2={big ? -9 : mid ? -6 : -3.5} stroke="#111" strokeWidth={big ? 0.8 : 0.45} />
                  {big && (
                    <text x={x} y={-12} fontSize={7} textAnchor="middle" fill="#111">
                      {u}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </g>
      <circle cx={0} cy={0} r={VIEW_R} fill="none" stroke="#111" strokeWidth={3} />
    </g>
  );
}

/** Field of view as its own SVG. */
export function FieldView(props: FieldProps & { label: string; className?: string }) {
  const { label, className, ...rest } = props;
  const inFocus = Math.abs(rest.scope.coarse + rest.scope.fine - rest.v.focus[rest.scope.objective]) <= MICRO_FOCUS_TOL[rest.scope.objective];
  return (
    <svg viewBox="-158 -158 316 316" className={className} role="img" aria-label={`${label}: ×${rest.scope.objective} objective, ${rest.placed ? (inFocus ? 'in focus' : 'out of focus') : 'no slide on the stage'}`}>
      <FieldContent {...rest} />
    </svg>
  );
}

export const useVariantMemo = <T,>(fn: () => T, deps: unknown[]) => useMemo(fn, deps); // eslint-disable-line react-hooks/exhaustive-deps
