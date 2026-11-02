import {
  GERM_TUBES,
  TROP_N,
  germSeeds,
  phyFit,
  respCo2,
  respFlaskT,
  respShown,
  seedStage,
  seedUp,
  tropCtrlAngle,
  tropKlinoDown,
  tropTestAngle,
  tropTurn,
  type BioGrowthState,
  type BioGrowthVariant,
  type GermTube,
  type SeedCurve,
  type SeedKind,
  type TropSketch,
} from '@aischool/shared';
import { cn } from '@/lib/utils';

/**
 * The 2D drawings, shared by the 2D lab and the 3D lab's close-up views: the
 * four germination tubes seed by seed, the seed jar and the sawdust box with
 * a ruler, the inverted vacuum flasks with their thermometers and the CO₂
 * test, the light-proof box with a protractor and the cork of pinned
 * radicles; the growth graph, the seedling drawing to label and the sketches.
 * Everything is drawn from the shared maths.
 */

const SVG = 'w-full rounded-xl border border-border bg-card';
const mix = (a: string, b: string, f: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  const k = Math.max(0, Math.min(1, f));
  return `#${x.map((c, i) => Math.round(c + (y[i]! - c) * k).toString(16).padStart(2, '0')).join('')}`;
};

// ------------------------------------------------------------------ germination

/** One tube, its contents and its seeds on day d. */
function GermTubeG({ v, w, t, k, d, x, big = false }: { v: BioGrowthVariant; w: BioGrowthState['germ']; t: GermTube; k: number; d: number; x: number; big?: boolean }) {
  const seeds = germSeeds(v.germ, w, t, k);
  const R = big ? 22 : 14;
  const top = 22;
  const bottom = 178;
  const cottonTop = big ? 96 : 128;
  const waterTop = big ? 60 : 70;
  return (
    <g transform={`translate(${x} 0)`}>
      {t.fridge && <rect x={-R - 16} y={8} width={2 * R + 32} height={186} rx={6} fill="#dceefc" stroke="#7fb0d8" strokeDasharray="4 3" />}
      {t.water && <rect x={-R + 1} y={waterTop} width={2 * R - 2} height={bottom - waterTop} fill="#cfe6f6" opacity={0.85} />}
      {t.water && t.oil && <rect x={-R + 1} y={waterTop - 6} width={2 * R - 2} height={7} fill="#e8c95a" opacity={0.9} />}
      {t.cotton && <path d={`M${-R + 1} ${cottonTop} q${R / 2} -8 ${R - 1} -2 q${R / 2} -7 ${R - 1} 2 V${bottom} H${-R + 1} Z`} fill={t.cotton === 'MOIST' ? '#e7ecef' : '#fbfbf7'} stroke="#c9d2d8" />}
      {seeds.map((s, j) => {
        const col = big ? j % 2 : j % 3;
        const row = Math.floor(j / (big ? 2 : 3));
        const sx = big ? -9 + col * 18 : -8 + col * 8;
        const sy = big ? bottom - 8 - row * 15 : t.water ? bottom - 8 - row * 6 : cottonTop - 2 - row * 5;
        const swollen = s.swell !== null && s.swell <= d;
        const germ = s.tg !== null && s.tg <= d + 1e-9;
        const len = germ ? Math.min(big ? 11 : 26, 4 + (d - s.tg!) * (big ? 4 : 9)) : 0;
        const out = big ? (col ? 1 : -1) : j % 2 ? 1 : -1;
        const sc = big ? 1.5 : 1;
        return (
          <g key={j}>
            {germ && <path d={`M${sx + out * 2} ${sy + 2} q${out * 5} ${len / 2} ${out * 3} ${len}`} fill="none" stroke="#fffbea" strokeWidth={big ? 2 : 1.6} />}
            {germ && d - s.tg! > 1.5 && <path d={`M${sx} ${sy - 2} q2 -4 0 -${Math.min(big ? 7 : 10, (d - s.tg! - 1.5) * 6)}`} fill="none" stroke="#7cb342" strokeWidth={1.4} />}
            <ellipse cx={sx} cy={sy} rx={(swollen ? 3.6 : 2.8) * sc} ry={(swollen ? 2.6 : 2) * sc} fill={s.tg === null && swollen && d > 3 ? '#a98a5c' : '#c9a86a'} stroke="#7a5a2a" strokeWidth={0.5} />
          </g>
        );
      })}
      <path d={`M${-R} ${top} V${bottom} a${R} ${R} 0 0 0 ${2 * R} 0 V${top}`} fill="none" stroke="#8aa4b4" strokeWidth={1.4} />
      <rect x={-R - 2} y={top - 8} width={2 * R + 4} height={10} rx={2} fill="#9e7b54" />
      {t.label && (
        <g>
          <rect x={-9} y={32} width={18} height={14} rx={2} fill="#fff" stroke="#999" />
          <text x={0} y={43} fontSize={10} textAnchor="middle" fontWeight={700} fill="#333">
            {GERM_TUBES[k]}
          </text>
        </g>
      )}
      <text x={0} y={208} fontSize={8.5} textAnchor="middle" fill="#555">
        {t.seeds ? `${t.seeds} seeds` : 'empty'}
        {t.fridge ? ' · fridge' : ''}
      </text>
    </g>
  );
}

/** The four germination tubes on day d (seed by seed: swollen, radicle, plumule). */
export function GermTubesSvg({ v, w, className, label }: { v: BioGrowthVariant; w: BioGrowthState['germ']; className?: string; label: string }) {
  return (
    <svg viewBox="0 0 400 220" className={cn(SVG, className)} role="img" aria-label={label}>
      <rect x={20} y={150} width={360} height={8} rx={2} fill="#b98a55" />
      {w.tubes.map((t, k) => (
        <GermTubeG key={k} v={v} w={w} t={t} k={k} d={w.day} x={65 + k * 90} />
      ))}
      <text x={392} y={16} fontSize={10} textAnchor="end" fill="#333" fontWeight={600}>
        Day {w.day}
      </text>
    </svg>
  );
}

/** A close-up of one tube for counting (seeds numbered; a radicle means germinated). */
export function GermTubeCloseUp({ v, w, k, className }: { v: BioGrowthVariant; w: BioGrowthState['germ']; k: number; className?: string }) {
  const t = w.tubes[k]!;
  return (
    <svg viewBox="-42 0 84 215" className={cn(SVG, className)} role="img" aria-label={`Tube ${GERM_TUBES[k]} on day ${w.day}`}>
      <GermTubeG v={v} w={w} t={t} k={k} d={w.day} x={0} big />
    </svg>
  );
}

// ------------------------------------------------------------------ seedlings

const PXMM = 1.05;
/** One seedling drawn from its seed point (x, y): cowpea (epigeal) or maize (hypogeal), at true length. */
function SeedlingG({ v, w, kind, d, x, y, soil }: { v: BioGrowthVariant; w: BioGrowthState['seedling']; kind: SeedKind; d: number; x: number; y: number; soil?: number }) {
  const st = seedStage(v.seedling, w, kind, d);
  const L = st.L * PXMM;
  const rad = st.radicle ? Math.min(48, 6 + L * 0.55) : 0;
  const green = '#5c9b36';
  const pale = '#e9e4b8';
  if (kind === 'COWPEA') {
    const hookTop = y - L;
    const arched = st.hook && !st.cotAbove;
    const cotCol = st.green ? green : '#d9c27e';
    return (
      <g>
        {rad > 0 && <path d={`M${x} ${y + 3} q3 ${rad / 2} -1 ${rad}`} fill="none" stroke="#efe9d3" strokeWidth={2.2} />}
        {rad > 10 && [0.4, 0.6, 0.8].map((f) => <path key={f} d={`M${x + 1} ${y + 3 + rad * f} l${f * 6} 4`} stroke="#efe9d3" strokeWidth={1} />)}
        {L > 2 && (arched ? <path d={`M${x} ${y} V${hookTop + 6} q0 -6 -6 -6 q-6 0 -6 8`} fill="none" stroke={pale} strokeWidth={2.6} /> : <line x1={x} y1={y} x2={x} y2={hookTop} stroke={st.green ? '#8bb859' : pale} strokeWidth={2.6} />)}
        {arched ? (
          <ellipse cx={x - 12} cy={hookTop + 10} rx={4} ry={6} fill={cotCol} stroke="#7a5a2a" strokeWidth={0.5} />
        ) : st.hook ? (
          <g>
            <ellipse cx={x - 6} cy={hookTop + 2} rx={6} ry={4} fill={cotCol} stroke="#5d4a2a" strokeWidth={0.5} />
            <ellipse cx={x + 6} cy={hookTop + 2} rx={6} ry={4} fill={cotCol} stroke="#5d4a2a" strokeWidth={0.5} />
            {st.leaves && (
              <g>
                <path d={`M${x} ${hookTop} q-10 -12 -16 -4 q8 6 16 4`} fill={green} />
                <path d={`M${x} ${hookTop} q10 -12 16 -4 q-8 6 -16 4`} fill={green} />
              </g>
            )}
          </g>
        ) : (
          <ellipse cx={x} cy={y} rx={7} ry={5} fill="#c9a86a" stroke="#7a5a2a" strokeWidth={0.6} />
        )}
        {st.hook && <path d={`M${x - 5} ${y + 1} q5 4 10 0`} fill="none" stroke="#9c7a48" strokeWidth={1} />}
        {soil !== undefined && null}
      </g>
    );
  }
  return (
    <g>
      {rad > 0 && <path d={`M${x} ${y + 4} q-3 ${rad / 2} 1 ${rad}`} fill="none" stroke="#efe9d3" strokeWidth={2} />}
      {rad > 14 && <path d={`M${x - 3} ${y + 4} q-8 ${rad / 3} -10 ${rad * 0.6} M${x + 3} ${y + 4} q8 ${rad / 3} 9 ${rad * 0.5}`} fill="none" stroke="#efe9d3" strokeWidth={1.2} />}
      {L > 1 && <line x1={x} y1={y - 3} x2={x} y2={y - L} stroke={st.green ? '#a9c77a' : pale} strokeWidth={3} strokeLinecap="round" />}
      {st.leaves && <path d={`M${x} ${y - L + 4} q6 -18 2 -${Math.min(40, 8 + (st.L - v.seedling.depth - 16) * 0.8)}`} fill="none" stroke={green} strokeWidth={3} strokeLinecap="round" />}
      <ellipse cx={x} cy={y} rx={5.5} ry={7} fill="#f2c94c" stroke="#a7851f" strokeWidth={0.6} />
    </g>
  );
}

/** A vertical mm ruler with its zero at y0 (going up). */
function RulerG({ x, y0, mm = 140 }: { x: number; y0: number; mm?: number }) {
  return (
    <g>
      <rect x={x} y={y0 - mm * PXMM - 4} width={14} height={mm * PXMM + 8} fill="#f4e7b8" stroke="#c7b27a" />
      {Array.from({ length: mm + 1 }, (_, k) => (
        <line key={k} x1={x} x2={x + (k % 10 === 0 ? 8 : k % 5 === 0 ? 6 : 3.5)} y1={y0 - k * PXMM} y2={y0 - k * PXMM} stroke="#3b3320" strokeWidth={k % 10 === 0 ? 0.8 : 0.4} />
      ))}
      {Array.from({ length: Math.floor(mm / 10) + 1 }, (_, k) => (
        <text key={k} x={x + 13} y={y0 - k * 10 * PXMM + 2.5} fontSize={5.5} textAnchor="end" fill="#3b3320">
          {k * 10}
        </text>
      ))}
    </g>
  );
}

/** The seed jar (seedlings against the blotting paper, a ruler beside each) and the box of sawdust (what has come up), on day d. */
export function SeedlingSvg({ v, w, className, label, ruler = true }: { v: BioGrowthVariant; w: BioGrowthState['seedling']; className?: string; label: string; ruler?: boolean }) {
  const d = w.day;
  const y0 = 182;
  const soilY = 168;
  const depthPx = v.seedling.depth * PXMM;
  const moist = w.waters.includes(d) || (w.waters.length > 0 && d - Math.max(...w.waters.filter((x) => x <= d)) < 2);
  return (
    <svg viewBox="0 0 420 250" className={cn(SVG, className)} role="img" aria-label={label}>
      {/* the seed jar */}
      <g>
        <rect x={12} y={20} width={190} height={210} rx={10} fill="#eef6fa" stroke="#8aa4b4" strokeWidth={1.4} />
        <rect x={18} y={26} width={178} height={198} rx={6} fill={moist ? '#e9e2d0' : '#f6f1e4'} />
        <text x={107} y={16} fontSize={9} textAnchor="middle" fill="#555">
          Seed jar (blotting paper{moist ? ', moist' : ', drying'})
        </text>
        {w.jar && (
          <>
            <SeedlingG v={v} w={w} kind="COWPEA" d={d} x={62} y={y0} />
            <SeedlingG v={v} w={w} kind="MAIZE" d={d} x={150} y={y0} />
            <line x1={50} x2={74} y1={y0} y2={y0} stroke="#c62828" strokeWidth={0.8} strokeDasharray="2 2" />
            <line x1={138} x2={162} y1={y0} y2={y0} stroke="#c62828" strokeWidth={0.8} strokeDasharray="2 2" />
            {ruler && <RulerG x={78} y0={y0} />}
            {ruler && <RulerG x={166} y0={y0} />}
            <text x={62} y={244} fontSize={8.5} textAnchor="middle" fill="#333">
              Cowpea
            </text>
            <text x={150} y={244} fontSize={8.5} textAnchor="middle" fill="#333">
              Maize
            </text>
          </>
        )}
      </g>
      {/* the box of sawdust */}
      <g>
        <rect x={222} y={soilY} width={186} height={62} fill={moist ? '#a8865a' : '#c9ab7f'} stroke="#7a5a2a" />
        <text x={315} y={244} fontSize={8.5} textAnchor="middle" fill="#333">
          Box of sawdust (seeds {v.seedling.depth} mm deep)
        </text>
        {w.box &&
          (['COWPEA', 'MAIZE'] as SeedKind[]).map((kind, ki) => {
            const up = seedUp(v.seedling, w, kind, d);
            return Array.from({ length: 10 }, (_, j) => {
              const x = 232 + ki * 92 + j * 8.6;
              const sy = soilY + depthPx;
              return (
                <g key={`${kind}${j}`}>
                  <clipPath id={`clip-above-${kind}-${j}`}>
                    <rect x={x - 20} y={0} width={40} height={soilY} />
                  </clipPath>
                  {j < up && (
                    <g clipPath={`url(#clip-above-${kind}-${j})`} transform={`translate(${x} ${sy}) scale(0.6) translate(${-x} ${-sy})`}>
                      <SeedlingG v={v} w={w} kind={kind} d={d} x={x} y={sy} />
                    </g>
                  )}
                </g>
              );
            });
          })}
        <text x={268} y={soilY + 54} fontSize={7.5} textAnchor="middle" fill="#fff">
          cowpea
        </text>
        <text x={360} y={soilY + 54} fontSize={7.5} textAnchor="middle" fill="#fff">
          maize
        </text>
      </g>
      <text x={412} y={14} fontSize={10} textAnchor="end" fontWeight={600} fill="#333">
        Day {d}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ respiration

/** A mercury thermometer's scale (20–40 °C) round the reading, readable to 0.5 °C. */
function ThermoScaleG({ x, y, T, name }: { x: number; y: number; T: number; name: string }) {
  const lo = 24;
  const hi = 38;
  const px = 9;
  const yy = (t: number) => y + 150 - (t - lo) * px;
  return (
    <g>
      <rect x={x - 9} y={y - 6} width={36} height={170} rx={4} fill="#fbfbf8" stroke="#bbb" />
      <rect x={x - 2} y={y} width={4} height={150} rx={2} fill="#eef2f4" stroke="#b0bcc4" strokeWidth={0.5} />
      <rect x={x - 1.2} y={yy(Math.min(hi, T))} width={2.4} height={y + 150 - yy(Math.min(hi, T))} fill="#c62828" />
      <circle cx={x} cy={y + 156} r={4} fill="#c62828" />
      {Array.from({ length: (hi - lo) * 2 + 1 }, (_, k) => lo + k / 2).map((t) => (
        <g key={t}>
          <line x1={x + 3} x2={x + (t % 1 === 0 ? 10 : 7)} y1={yy(t)} y2={yy(t)} stroke="#333" strokeWidth={t % 1 === 0 ? 0.7 : 0.4} />
          {t % 2 === 0 && (
            <text x={x + 24} y={yy(t) + 2.5} fontSize={7} textAnchor="end" fill="#333">
              {t}
            </text>
          )}
        </g>
      ))}
      <text x={x + 9} y={y + 176} fontSize={9} textAnchor="middle" fontWeight={700} fill="#333">
        {name}
      </text>
    </g>
  );
}

/** The temperature a flask's thermometer shows now: the reading just taken, otherwise the true value (to 0.1 °C). */
export function respNow(v: BioGrowthVariant, w: BioGrowthState['resp'], which: 'A' | 'B'): number {
  const n = w.reads.length - 1;
  if (n >= 0 && w.reads[n] === w.clock) return respShown(v.resp, w, which, w[which], w.clock, n, v.seed);
  return Math.round(respFlaskT(v.resp, w, w[which], w.clock) * 10) / 10;
}

/** The two inverted vacuum flasks, their thermometers and, beside them, the CO₂ test. */
export function FlasksSvg({ v, w, className, label }: { v: BioGrowthVariant; w: BioGrowthState['resp']; className?: string; label: string }) {
  const c = respCo2(v.resp, w, w.clock);
  const liquid = (x: number) => (w.co2.ind === 'BICARB' ? (x < 0.5 ? mix('#d8343f', '#ef8a2c', x * 2) : mix('#ef8a2c', '#e8d23c', (x - 0.5) * 2)) : mix('#bfe0f5', '#fbfaf2', x));
  const flask = (f: 'A' | 'B', x: number) => {
    const fl = w[f];
    return (
      <g>
        <rect x={x - 26} y={30} width={52} height={120} rx={10} fill="#c9ced3" stroke="#8b939a" />
        <rect x={x - 22} y={34} width={44} height={112} rx={8} fill="#e1e5e8" />
        {fl.seeds && <rect x={x - 20} y={fl.inverted ? 50 : fl.fill === 'HALF' ? 92 : 50} width={40} height={fl.fill === 'HALF' ? 52 : 94} rx={6} fill={fl.seeds === 'LIVE' ? '#d8bd7a' : '#b9a27a'} />}
        {fl.seeds && Array.from({ length: 18 }, (_, k) => <ellipse key={k} cx={x - 14 + (k % 6) * 5.6} cy={(fl.inverted ? 56 : fl.fill === 'HALF' ? 98 : 56) + Math.floor(k / 6) * 9} rx={2.4} ry={1.8} fill="#a8854c" />)}
        {fl.plug && <rect x={x - 10} y={fl.inverted ? 150 : 22} width={20} height={9} rx={3} fill={fl.plug === 'COTTON' ? '#fafafa' : '#3b3b3b'} stroke="#bbb" />}
        {fl.thermo && <line x1={x + 4} x2={x + 4} y1={fl.inverted ? 60 : 10} y2={fl.inverted ? 176 : 120} stroke="#b8c4cc" strokeWidth={2.4} />}
        <text x={x} y={20} fontSize={10} fontWeight={700} textAnchor="middle" fill="#333">
          {f} {fl.seeds === 'LIVE' ? '(germinating)' : fl.seeds === 'BOILED' ? '(boiled)' : ''}
        </text>
        <text x={x} y={192} fontSize={7.5} textAnchor="middle" fill="#555">
          {fl.inverted ? 'inverted' : 'upright'}
        </text>
        <text x={x} y={202} fontSize={7.5} textAnchor="middle" fill="#555">
          {fl.plug ? (fl.plug === 'COTTON' ? 'cotton wool' : 'rubber bung') : ''}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 440 210" className={cn(SVG, className)} role="img" aria-label={label}>
      {flask('A', 50)}
      {flask('B', 130)}
      {w.A.thermo && <ThermoScaleG x={196} y={20} T={respNow(v, w, 'A')} name="A" />}
      {w.B.thermo && <ThermoScaleG x={250} y={20} T={respNow(v, w, 'B')} name="B" />}
      {/* the CO₂ test */}
      {w.co2.ind && (
        <g>
          {[0, 1].map((i) => {
            const on = i === 0 || w.co2.ctrl;
            if (!on) return null;
            const x = 312 + i * 62;
            const val = c ? (i === 0 ? c.live : c.ctrl) : 0;
            return (
              <g key={i}>
                <path d={`M${x - 10} 70 l-12 40 h24 Z`} fill="#eef6fa" stroke="#8aa4b4" transform={`translate(0 60)`} />
                <path d={`M${x - 10} 130 h-2 v-14 h4`} fill="none" stroke="#8aa4b4" />
                <path d={`M${x - 10} 126 V108 H${x + 14} V160`} fill="none" stroke="#8aa4b4" strokeWidth={1.4} />
                <rect x={x + 8} y={140} width={12} height={40} rx={5} fill={liquid(val)} stroke="#8aa4b4" />
                {w.co2.ind === 'LIME' && val > 0.3 && Array.from({ length: 10 }, (_, q) => <circle key={q} cx={x + 10 + ((q * 7) % 9)} cy={146 + ((q * 13) % 30)} r={0.9} fill="#e0ddd0" />)}
                {val > 0.05 && i === 0 && [0, 1, 2].map((b) => <circle key={b} cx={x + 14} cy={172 - ((w.clock * 7 + b * 11) % 28)} r={1.3} fill="#fff" stroke="#9ab" strokeWidth={0.4} />)}
                <text x={x + 2} y={196} fontSize={7.5} textAnchor="middle" fill="#555">
                  {i === 0 ? 'germinating' : 'boiled (control)'}
                </text>
              </g>
            );
          })}
          <text x={370} y={98} fontSize={8} textAnchor="middle" fill="#333">
            {w.co2.ind === 'LIME' ? 'Lime water' : 'Hydrogencarbonate indicator'}
          </text>
        </g>
      )}
      <text x={436} y={14} fontSize={10} textAnchor="end" fontWeight={600} fill="#333">
        {w.startAt === null ? `${Math.round(w.clock)} h` : `${Math.round(w.clock - w.startAt)} h since set up`}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ tropisms

/** A curved shoot from (x, y) bending by `deg` towards +x. */
const shootPath = (x: number, y: number, len: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  const tipX = x + len * Math.sin(a) * 0.75;
  const tipY = y - len * Math.cos(a * 0.6);
  return { d: `M${x} ${y} Q${x} ${y - len * 0.55} ${tipX} ${tipY}`, tipX, tipY };
};

/** The light-proof box with its slit and lamp (and the test pot), the control pot, a protractor on the tagged shoots; the cork and the clinostat set. */
export function TropSvg({ v, w, className, label, protractor = true }: { v: BioGrowthVariant; w: BioGrowthState['trop']; className?: string; label: string; protractor?: boolean }) {
  const d = w.day;
  const th = tropTestAngle(v.trop, w, d);
  const tc = tropCtrlAngle(v.trop, w, d);
  const turn = tropTurn(v.trop, w, d);
  const toward = w.slit === 'AWAY' ? -1 : 1;
  const pot = (x: number, deg: number, tag: boolean) => (
    <g>
      <path d={`M${x - 22} 150 h44 l-5 24 h-34 Z`} fill="#b5653a" />
      {[-12, -4, 4, 12].map((dx, k) => {
        const p = shootPath(x + dx, 150, 62 + k * 3, deg * (0.9 + k * 0.05));
        return (
          <g key={k}>
            <path d={p.d} fill="none" stroke="#6aa84f" strokeWidth={2.2} />
            <ellipse cx={p.tipX} cy={p.tipY} rx={4} ry={2} fill="#6aa84f" />
          </g>
        );
      })}
      {tag && protractor && (
        <g opacity={0.9}>
          <path d={`M${x - 40} 150 A40 40 0 0 1 ${x + 40} 150`} fill="#fffde7" fillOpacity={0.55} stroke="#9e9e9e" strokeWidth={0.6} />
          {Array.from({ length: 19 }, (_, k) => k * 10 - 90).map((a) => {
            const r = (a * Math.PI) / 180;
            return <line key={a} x1={x + 34 * Math.sin(r)} y1={150 - 34 * Math.cos(r)} x2={x + 40 * Math.sin(r)} y2={150 - 40 * Math.cos(r)} stroke="#555" strokeWidth={0.6} />;
          })}
          {[-60, -30, 0, 30, 60].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <text key={a} x={x + 28 * Math.sin(r)} y={152 - 28 * Math.cos(r)} fontSize={5.5} textAnchor="middle" fill="#555">
                {Math.abs(a)}
              </text>
            );
          })}
        </g>
      )}
    </g>
  );
  const radicle = (cx: number, cy: number, dir: number, i: number, mode: 'cork' | 'klino') => {
    const damaged = v.trop.damaged.includes(i);
    const a0 = (dir * Math.PI) / 180;
    const sx = cx + 26 * Math.sin(a0);
    const sy = cy + 26 * Math.cos(a0);
    const grow = Math.min(1, (d + 0.3) / 2.5) * (damaged ? 0.1 : 1);
    const f = mode === 'cork' && !damaged ? turn : 0;
    let x = sx;
    let y = sy;
    let a = dir > 180 ? dir - 360 : dir;
    let path = `M${x} ${y}`;
    for (let k = 0; k < 8; k++) {
      const seg = 4.6 * grow + 0.4;
      const cur = a * (1 - f * Math.min(1, (k + 1) / 4));
      x += seg * Math.sin((cur * Math.PI) / 180);
      y += seg * Math.cos((cur * Math.PI) / 180);
      path += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    a = 0;
    return (
      <g key={i}>
        <path d={path} fill="none" stroke={damaged ? '#a1887f' : '#f3ecd2'} strokeWidth={1.8} strokeLinecap="round" />
        <ellipse cx={sx} cy={sy} rx={4} ry={3} fill="#c9a86a" stroke="#7a5a2a" strokeWidth={0.5} />
        <circle cx={sx} cy={sy} r={0.9} fill="#888" />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 440 250" className={cn(SVG, className)} role="img" aria-label={label}>
      {/* phototropism */}
      <g>
        {w.box ? (
          <g>
            <rect x={12} y={60} width={118} height={120} fill="#2b2b2b" opacity={0.92} />
            {!w.taped && <rect x={12} y={60} width={4} height={30} fill="#ffe082" opacity={0.7} />}
            {w.slit && <rect x={w.slit === 'LAMP' ? 126 : 12} y={96} width={4} height={26} fill="#fff59d" />}
            {pot(70, th * toward, true)}
          </g>
        ) : (
          <text x={70} y={120} fontSize={9} textAnchor="middle" fill="#777">
            No pot in the box yet
          </text>
        )}
        {w.lamp && (
          <g>
            <path d="M148 98 l16 -8 v40 l-16 -8 Z" fill="#f2c94c" />
            <path d="M146 110 h-14 M146 104 l-14 -4 M146 116 l-14 4" stroke="#f2c94c" strokeWidth={1.2} strokeDasharray="3 2" />
          </g>
        )}
        {w.ctrl && (
          <g>
            {w.ctrl === 'KLINO' && <rect x={196} y={174} width={58} height={10} rx={2} fill="#78909c" />}
            {w.ctrl === 'KLINO' && w.klinoOn && <path d="M206 192 a20 6 0 1 0 38 0" fill="none" stroke="#455a64" strokeWidth={1} markerEnd="" />}
            {pot(225, tc, true)}
            <text x={225} y={206} fontSize={8} textAnchor="middle" fill="#555">
              Control ({w.ctrl === 'KLINO' ? (w.klinoOn ? 'clinostat turning' : 'clinostat stopped') : 'uniform light'})
            </text>
          </g>
        )}
        <text x={70} y={206} fontSize={8} textAnchor="middle" fill="#555">
          Test: one-sided light
        </text>
      </g>
      {/* geotropism */}
      <g>
        {w.pinned && (
          <g>
            <circle cx={340} cy={80} r={54} fill="#eef6fa" stroke="#8aa4b4" />
            <circle cx={340} cy={80} r={22} fill="#c7a36b" stroke="#8a6a3a" />
            {v.trop.dirs.map((dir, i) => radicle(340, 80, dir, i, 'cork'))}
            <text x={340} y={146} fontSize={8} textAnchor="middle" fill="#555">
              Cork in a gas jar ({w.moist ? 'moist' : 'dry'}) — stationary
            </text>
          </g>
        )}
        {w.klinoSet && (
          <g>
            <circle cx={340} cy={196} r={36} fill="#eceff1" stroke="#90a4ae" />
            <circle cx={340} cy={196} r={14} fill="#c7a36b" stroke="#8a6a3a" />
            <g transform={`translate(340 196) scale(0.62) translate(-340 -196)`}>{v.trop.dirs.map((dir, i) => (tropKlinoDown(v.trop, w, d) > 0 ? radicle(340, 196, dir, i, 'cork') : radicle(340, 196, dir, i, 'klino')))}</g>
            <text x={340} y={244} fontSize={8} textAnchor="middle" fill="#555">
              On the clinostat ({w.klinoOn ? 'turning' : 'stopped'})
            </text>
          </g>
        )}
        <text x={392} y={20} fontSize={7} textAnchor="middle" fill="#888">
          ↓ gravity
        </text>
      </g>
      <text x={436} y={12} fontSize={10} textAnchor="end" fontWeight={600} fill="#333">
        Day {d}
      </text>
      <text x={8} y={12} fontSize={7.5} fill="#888">
        {TROP_N} radicles pinned
      </text>
    </svg>
  );
}

/** A sketch choice: radicles on a cork after a few days. */
export function TropSketchSvg({ kind, className }: { kind: TropSketch; className?: string }) {
  const dirs = [0, 60, 120, 180, 240, 300];
  return (
    <svg viewBox="0 0 80 80" className={cn('h-16 w-16 rounded-lg border border-border bg-card', className)} aria-hidden>
      <circle cx={40} cy={36} r={10} fill="#c7a36b" />
      {dirs.map((d) => {
        const a = (d * Math.PI) / 180;
        const sx = 40 + 12 * Math.sin(a);
        const sy = 36 + 12 * Math.cos(a);
        const ex = kind === 'STRAIGHT' ? sx + 14 * Math.sin(a) : sx + 6 * Math.sin(a);
        const ey = kind === 'STRAIGHT' ? sy + 14 * Math.cos(a) : sy + 6 * Math.cos(a);
        const fy = kind === 'DOWN' ? ey + 14 : kind === 'UP' ? ey - 14 : ey;
        return <path key={d} d={`M${sx} ${sy} Q${ex} ${ey} ${kind === 'STRAIGHT' ? ex : ex} ${fy}`} fill="none" stroke="#a1887f" strokeWidth={1.6} />;
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ charts and drawings

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Shoot length against time for both seedlings, with the line the student chose. */
export function LengthGraph({ series, curve, className }: { series: { name: string; colour: string; pts: { x: number; y: number }[] }[]; curve: SeedCurve | null; className?: string }) {
  const W = 360;
  const H = 230;
  const M = { l: 38, r: 12, t: 12, b: 36 };
  const all = series.flatMap((s) => s.pts);
  const xMax = Math.max(10, ...all.map((p) => p.x));
  const yMax = Math.max(40, ...all.map((p) => p.y)) * 1.1;
  const yStep = yMax > 100 ? 20 : 10;
  const px = (x: number) => M.l + (x / xMax) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - (y / yMax) * (H - M.t - M.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn(SVG, className)} role="img" aria-label={`Graph of shoot length against time: ${all.length} points${curve ? `, ${curve.toLowerCase()} line` : ''}`}>
      {Array.from({ length: xMax + 1 }, (_, x) => (
        <g key={`x${x}`}>
          <line x1={px(x)} x2={px(x)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth={0.6} />
          <text x={px(x)} y={H - M.b + 12} fontSize={9} textAnchor="middle" className="fill-muted-foreground">
            {x}
          </text>
        </g>
      ))}
      {Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, k) => k * yStep).map((y) => (
        <g key={`y${y}`}>
          <line x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} className="stroke-border" strokeWidth={0.6} />
          <text x={M.l - 4} y={py(y) + 3} fontSize={9} textAnchor="end" className="fill-muted-foreground">
            {y}
          </text>
        </g>
      ))}
      <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} className="stroke-foreground/70" />
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} className="stroke-foreground/70" />
      {series.map((s) => {
        const pts = [...s.pts].sort((a, b) => a.x - b.x);
        const sp = pts.map((p) => ({ x: px(p.x), y: py(p.y) }));
        const fit = phyFit(pts);
        return (
          <g key={s.name} stroke={s.colour}>
            {curve === 'SMOOTH' && sp.length >= 2 && <path d={smoothPath(sp)} fill="none" strokeWidth={1.4} />}
            {curve === 'DOT' && sp.length >= 2 && <polyline points={sp.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={1.2} />}
            {curve === 'STRAIGHT' && fit && <line x1={px(pts[0]!.x)} y1={py(fit.intercept + fit.slope * pts[0]!.x)} x2={px(pts.at(-1)!.x)} y2={py(fit.intercept + fit.slope * pts.at(-1)!.x)} strokeWidth={1.3} />}
            {sp.map((p, i) => (
              <g key={i} strokeWidth={1.4}>
                <line x1={p.x - 3.5} x2={p.x + 3.5} y1={p.y - 3.5} y2={p.y + 3.5} />
                <line x1={p.x - 3.5} x2={p.x + 3.5} y1={p.y + 3.5} y2={p.y - 3.5} />
              </g>
            ))}
          </g>
        );
      })}
      {series.map((s, i) => (
        <g key={`k${s.name}`}>
          <rect x={M.l + 8} y={M.t + 4 + i * 12} width={9} height={3} fill={s.colour} />
          <text x={M.l + 21} y={M.t + 8 + i * 12} fontSize={9} className="fill-foreground">
            {s.name}
          </text>
        </g>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize={10} textAnchor="middle" className="fill-foreground">
        Time / days
      </text>
      <text x={11} y={(M.t + H - M.b) / 2} fontSize={10} textAnchor="middle" className="fill-foreground" transform={`rotate(-90 11 ${(M.t + H - M.b) / 2})`}>
        Shoot length / mm
      </text>
      {!all.length && (
        <text x={W / 2} y={H / 2} fontSize={10} textAnchor="middle" className="fill-muted-foreground">
          Your points appear as you fill in the table.
        </text>
      )}
    </svg>
  );
}

/** The two seedlings at day 7, to label (0–240 × 0–150; targets SEED_DRAWING_TARGETS). */
export function SeedDrawing() {
  return (
    <g fill="none" stroke="#333" strokeWidth={1}>
      <line x1={8} x2={232} y1={96} y2={96} strokeDasharray="4 3" stroke="#a07850" />
      {/* cowpea */}
      <path d="M58 104 q4 14 0 32 M58 116 l-8 6 M58 124 l7 6" />
      <path d="M58 104 V40" strokeWidth={1.6} />
      <ellipse cx={50} cy={42} rx={8} ry={5} />
      <ellipse cx={66} cy={42} rx={8} ry={5} />
      <path d="M58 38 q-12 -16 -20 -6 q10 8 20 6 M58 38 q12 -16 20 -6 q-10 8 -20 6" />
      <path d="M52 104 q6 5 12 0" />
      {/* maize */}
      <ellipse cx={176} cy={104} rx={7} ry={9} />
      <path d="M176 113 q-4 12 0 24 M172 112 q-10 8 -12 20 M180 112 q10 8 10 20" />
      <path d="M176 95 V44" strokeWidth={2.4} />
      <path d="M176 46 q8 -16 3 -36" strokeWidth={1.4} />
      <text x={58} y={148} fontSize={7} textAnchor="middle" fill="#555" stroke="none">
        Cowpea, day 7
      </text>
      <text x={176} y={148} fontSize={7} textAnchor="middle" fill="#555" stroke="none">
        Maize, day 7
      </text>
      <text x={228} y={93} fontSize={6} textAnchor="end" fill="#a07850" stroke="none">
        soil level
      </text>
    </g>
  );
}
