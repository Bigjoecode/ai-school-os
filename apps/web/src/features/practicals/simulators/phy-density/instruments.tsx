import { densityBeamTilt, densityRidersSum, type BottleSnap, type DensityRiders, type DensityWeighItem } from '@aischool/shared';
import { Eye as EyeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Eye } from './actions';

/**
 * The density labs' instruments as close-up drawings, shared by the 2D lab and
 * the 3D lab's reading panel: the vernier (main scale and vernier plate), the
 * micrometer (sleeve and thimble), the spring balance's scale, the paper scale
 * in the floating tube at the water surface (with its meniscus), the
 * triple-beam balance and the density bottle. Each takes what the instrument
 * really indicates; the student reads it. With the eye to one side the
 * vernier, thimble or pointer appears shifted (parallax).
 */

const card = 'rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900';
const INK = '#1b1d1f';

/** Where your eye is when you read: below/left, square on, above/right. */
export function EyeControl({ eye, onEye, vertical = false, compact }: { eye: Eye; onEye: (e: Eye) => void; vertical?: boolean; compact?: boolean }) {
  const names: Record<Eye, string> = vertical ? { [-1]: 'Below', 0: 'Level', 1: 'Above' } : { [-1]: 'Left', 0: 'Square on', 1: 'Right' };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]" role="radiogroup" aria-label="Your eye's position">
      <EyeIcon className="size-3.5 text-muted-foreground" aria-hidden />
      {!compact && <span className="text-muted-foreground">Eye:</span>}
      {([-1, 0, 1] as Eye[]).map((e) => (
        <Button key={e} size="sm" variant={eye === e ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => onEye(e)} aria-pressed={eye === e}>
          {names[e]}
        </Button>
      ))}
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', eye === 0 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>{eye === 0 ? 'no parallax' : 'parallax!'}</span>
    </div>
  );
}

/**
 * The vernier calipers' scales, magnified: the main scale in mm (numbered in
 * cm) and the vernier plate below it, ten divisions spanning 9 mm. `reading`
 * (cm) is where the vernier's zero is on the main scale.
 */
export function VernierSvg({ reading, eye, closed, label }: { reading: number; eye: Eye; closed: boolean; label?: string }) {
  const W = 360;
  const k = 15; // px per mm
  const z = reading * 10; // vernier zero (mm on the main scale)
  const shift = eye * 0.24; // parallax (mm)
  const lo = Math.floor(z - 7);
  const X = (mm: number) => 40 + (mm - lo) * k;
  const ticks: number[] = [];
  for (let mm = Math.max(0, lo); mm <= lo + 22; mm++) ticks.push(mm);
  const vz = X(z + shift);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} 150`} className={cn(card, 'w-full max-w-[420px] select-none')} role="img" aria-label={`Close-up of the vernier calipers: the vernier's zero is near ${Math.max(0, Math.floor(z))} mm on the main scale${label ? `, measuring the ${label}` : ''}. Find the vernier line that lines up exactly with a main-scale line.`}>
        {/* main scale (steel, the beam) */}
        <rect x={0} y={14} width={W} height={60} fill="#dfe3e6" stroke="#9aa3aa" />
        {ticks.map((mm) => (
          <g key={mm}>
            <line x1={X(mm)} x2={X(mm)} y1={74} y2={74 - (mm % 10 === 0 ? 26 : mm % 5 === 0 ? 19 : 12)} stroke={INK} strokeWidth={mm % 10 === 0 ? 1.3 : 0.8} />
            {mm % 10 === 0 && mm >= 0 && (
              <text x={X(mm)} y={38} textAnchor="middle" fontSize="13" fontWeight="700" fill={INK}>
                {mm / 10}
              </text>
            )}
          </g>
        ))}
        <text x={W - 6} y={28} textAnchor="end" fontSize="9" fill="#4b5563">
          cm
        </text>
        {/* the vernier plate (slides with the jaw) */}
        <g>
          <rect x={vz - 22} y={74} width={9 * k + 44} height={50} rx={2} fill="#c9ced2" stroke="#7b848b" />
          {Array.from({ length: 11 }, (_, i) => (
            <g key={i}>
              <line x1={vz + i * 0.9 * k} x2={vz + i * 0.9 * k} y1={74} y2={74 + (i % 5 === 0 ? 24 : 16)} stroke={INK} strokeWidth={i % 5 === 0 ? 1.2 : 0.8} />
              {i % 5 === 0 && (
                <text x={vz + i * 0.9 * k} y={112} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>
                  {i}
                </text>
              )}
            </g>
          ))}
          <text x={vz + 9 * k + 18} y={119} textAnchor="end" fontSize="7.5" fill="#374151">
            0.1 mm
          </text>
        </g>
        {!closed && (
          <text x={W / 2} y={142} textAnchor="middle" fontSize="10" fill="#b45309">
            Jaws open: close them gently first
          </text>
        )}
      </svg>
      <figcaption className="max-w-[420px] text-[11px] text-muted-foreground">Main scale (cm, mm divisions) above; vernier below (10 divisions = 9 mm). Reading = main scale before the vernier 0 + (the coinciding vernier line × 0.01 cm).</figcaption>
    </figure>
  );
}

/**
 * The micrometer's sleeve and thimble, magnified: whole millimetres above the
 * datum line, half millimetres below it, the thimble's 50 divisions (0.01 mm
 * each) turning past the datum. `reading` in mm.
 */
export function MicrometerSvg({ reading, eye, closed, label }: { reading: number; eye: Eye; closed: boolean; label?: string }) {
  const W = 360;
  const k = 22; // px per mm on the sleeve
  const edgeX = 250; // the thimble's edge
  const X = (mm: number) => edgeX - (reading - mm) * k;
  const t = ((((reading % 0.5) + 0.5) % 0.5) / 0.01 + eye * 0.7 + 50) % 50; // thimble division at the datum (with parallax)
  const dy = 12; // px per thimble division
  const datum = 75;
  const sleeveTicks: number[] = [];
  for (let h = Math.ceil((reading - 11) * 2); h / 2 <= reading + 0.001; h++) if (h >= 0) sleeveTicks.push(h);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} 150`} className={cn(card, 'w-full max-w-[420px] select-none')} role="img" aria-label={`Close-up of the micrometer screw gauge${label ? ` on the ${label}` : ''}: read the sleeve (whole and half millimetres) at the thimble's edge, then the thimble division on the datum line.`}>
        {/* sleeve */}
        <rect x={0} y={45} width={edgeX} height={60} fill="#d7dbde" stroke="#8b949b" />
        <line x1={0} x2={edgeX} y1={datum} y2={datum} stroke={INK} strokeWidth={1.2} />
        {sleeveTicks.map((h) => (
          <g key={h}>
            {h % 2 === 0 ? <line x1={X(h / 2)} x2={X(h / 2)} y1={datum} y2={datum - 14} stroke={INK} strokeWidth={1} /> : <line x1={X(h / 2)} x2={X(h / 2)} y1={datum} y2={datum + 11} stroke={INK} strokeWidth={0.9} />}
            {h % 10 === 0 && (
              <text x={X(h / 2)} y={datum - 18} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>
                {h / 2}
              </text>
            )}
          </g>
        ))}
        <text x={8} y={datum + 24} fontSize="8" fill="#4b5563">
          mm (half-mm marks below the line)
        </text>
        {/* thimble */}
        <rect x={edgeX} y={18} width={70} height={114} rx={4} fill="#c4c9cd" stroke="#7b848b" />
        <rect x={edgeX} y={18} width={6} height={114} fill="#aab1b6" />
        {Array.from({ length: 13 }, (_, i) => i - 6).map((d) => {
          const div = Math.round(t) + d;
          const y = datum - (div - t) * dy;
          const lab = ((div % 50) + 50) % 50;
          if (y < 22 || y > 128) return null;
          return (
            <g key={d}>
              <line x1={edgeX} x2={edgeX + (lab % 5 === 0 ? 22 : 13)} y1={y} y2={y} stroke={INK} strokeWidth={lab % 5 === 0 ? 1.2 : 0.8} />
              {lab % 5 === 0 && (
                <text x={edgeX + 26} y={y + 4} fontSize="11" fontWeight="700" fill={INK}>
                  {lab}
                </text>
              )}
            </g>
          );
        })}
        {!closed && (
          <text x={W / 2 - 50} y={142} textAnchor="middle" fontSize="10" fill="#b45309">
            Open: turn the ratchet until it clicks
          </text>
        )}
      </svg>
      <figcaption className="max-w-[420px] text-[11px] text-muted-foreground">Reading = sleeve (whole mm + 0.50 if a half-mm mark shows) + thimble division on the datum × 0.01 mm.</figcaption>
    </figure>
  );
}

/** The spring balance's scale around its pointer (0–10 N, 0.1 N divisions). */
export function SpringScaleSvg({ reading, eye }: { reading: number; eye: Eye }) {
  const H = 220;
  const k = 70; // px per N
  const p = reading + eye * 0.06;
  const Y = (n: number) => H / 2 + (n - p) * k;
  const ticks: number[] = [];
  for (let d = Math.floor((p - 1.7) * 10); d <= Math.ceil((p + 1.7) * 10); d++) if (d >= -2 && d <= 100) ticks.push(d);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 150 ${H}`} className={cn(card, 'h-[220px] w-[150px] select-none')} role="img" aria-label="Close-up of the spring balance scale and its pointer (0.1 N divisions)">
        <rect x={20} y={0} width={80} height={H} fill="#f7f3e6" stroke="#b9ad86" />
        {ticks.map((d) => (
          <g key={d}>
            <line x1={20} x2={20 + (d % 10 === 0 ? 34 : d % 5 === 0 ? 24 : 14)} y1={Y(d / 10)} y2={Y(d / 10)} stroke={INK} strokeWidth={d % 10 === 0 ? 1.3 : 0.7} />
            {d % 10 === 0 && d >= 0 && (
              <text x={60} y={Y(d / 10) + 5} fontSize="14" fontWeight="700" fill={INK}>
                {d / 10}
              </text>
            )}
          </g>
        ))}
        <text x={96} y={14} textAnchor="end" fontSize="9" fill="#555">
          N
        </text>
        <path d={`M100 ${H / 2} L134 ${H / 2 - 7} L134 ${H / 2 + 7} Z`} fill="#c62828" />
        <line x1={18} x2={102} y1={H / 2} y2={H / 2} stroke="#c62828" strokeWidth={1.4} />
      </svg>
      <figcaption className="max-w-[160px] text-[11px] text-muted-foreground">Read the pointer to the nearest half division (0.05 N).</figcaption>
    </figure>
  );
}

/** The paper scale inside the floating tube at the water surface: the flat surface, and the meniscus climbing the glass. */
export function DepthLoupe({ h, meniscus, eye, touching }: { h: number; meniscus: number; eye: Eye; touching: boolean }) {
  const H = 220;
  const k = 48; // px per cm
  const c = h + eye * 0.22; // parallax: the scale behind the glass appears shifted
  const Y = (cm: number) => H / 2 - (cm - c) * k;
  const ticks: number[] = [];
  for (let mm = Math.floor((c - 2.4) * 10); mm <= Math.ceil((c + 2.4) * 10); mm++) if (mm >= 0) ticks.push(mm);
  const wy = H / 2; // the water surface itself stays put; the scale behind the glass shifts
  const my = wy - meniscus * k;
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 170 ${H}`} className={cn(card, 'h-[220px] w-[170px] select-none')} role="img" aria-label={`Close-up of the tube's paper scale at the water surface${touching ? '; the tube is touching the side of the cylinder' : ''}`}>
        <rect x={30} y={0} width={110} height={H} fill="#fbfbf7" />
        {ticks.map((mm) => (
          <g key={mm}>
            <line x1={60} x2={60 + (mm % 10 === 0 ? 30 : mm % 5 === 0 ? 22 : 13)} y1={Y(mm / 10)} y2={Y(mm / 10)} stroke={INK} strokeWidth={mm % 10 === 0 ? 1.3 : 0.7} />
            {mm % 10 === 0 && (
              <text x={96} y={Y(mm / 10) + 5} fontSize="14" fontWeight="700" fill={INK}>
                {mm / 10}
              </text>
            )}
          </g>
        ))}
        {/* water: flat surface, meniscus rising up the glass at both walls */}
        <path d={`M0 ${my} Q 18 ${wy - 1} 40 ${wy} L 130 ${wy} Q 152 ${wy - 1} 170 ${my} L170 ${H} L0 ${H} Z`} fill="#5aa9e6" opacity={0.32} />
        <path d={`M0 ${my} Q 18 ${wy - 1} 40 ${wy} L 130 ${wy} Q 152 ${wy - 1} 170 ${my}`} fill="none" stroke="#1565c0" strokeWidth={1.4} />
        <rect x={0} y={0} width={10} height={H} fill="#cfe8f5" opacity={0.6} />
        <rect x={160} y={0} width={10} height={H} fill="#cfe8f5" opacity={0.6} />
        <text x={85} y={H - 6} textAnchor="middle" fontSize="8" fill="#334155">
          cm from the bottom of the tube
        </text>
      </svg>
      <figcaption className="max-w-[180px] text-[11px] text-muted-foreground">Read h where the flat water surface crosses the scale (the bottom of the meniscus), to 0.1 cm.</figcaption>
    </figure>
  );
}

const PAN_NAME: Record<DensityWeighItem, string> = { beaker: 'the catch beaker', tube: 'the empty tube', bottle: 'the density bottle' };
/** The triple-beam balance: the pan and what is on it, three beams with riders, the pointer against its zero mark. */
export function BalanceSvg({ item, mass, riders }: { item: DensityWeighItem | null; mass: number; riders: DensityRiders }) {
  const tilt = densityBeamTilt(mass, riders);
  const beam = (y: number, n: number, pos: number, label: string, step: number, fine = false) => (
    <g>
      <rect x={70} y={y} width={190} height={10} rx={2} fill="#d9dde1" stroke="#7d8790" strokeWidth="0.7" />
      {Array.from({ length: fine ? 101 : n + 1 }, (_, i) => {
        const x = 76 + (i / (fine ? 100 : n)) * 178;
        const major = fine ? i % 10 === 0 : true;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y} y2={y + (major ? 5 : fine && i % 5 === 0 ? 4 : 2.5)} stroke="#2a2f33" strokeWidth={major ? 0.8 : 0.45} />
            {major && (
              <text x={x} y={y + 18} fontSize="6.5" textAnchor="middle" fill="#2a2f33">
                {fine ? i / 10 : i * step}
              </text>
            )}
          </g>
        );
      })}
      <path d={`M${76 + pos * 178 - 4} ${y - 3} h8 l-1 14 h-6 Z`} fill="#c62828" stroke="#7f1d1d" strokeWidth="0.5" />
      <text x={64} y={y + 8} fontSize="7" textAnchor="end" fill="#475569">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 300 150" className={cn(card, 'w-full max-w-[340px]')} role="img" aria-label={`Beam balance with ${item ? PAN_NAME[item] : 'nothing'} on the pan; the riders total ${densityRidersSum(riders).toFixed(1)} g; the pointer is ${Math.abs(tilt) < 0.08 ? 'on zero' : tilt > 0 ? 'above zero' : 'below zero'}`}>
      <ellipse cx={38} cy={88} rx={28} ry={6} fill="#a7b0b8" stroke="#6b7580" />
      <rect x={34} y={92} width={8} height={30} fill="#6b7580" />
      {item === 'beaker' && <path d="M24 86 L26 58 H50 L52 86 Z" fill="#e3f2fd" stroke="#7aa6c2" />}
      {item === 'tube' && <rect x={34} y={44} width={8} height={42} rx={4} fill="#eef7fb" stroke="#7aa6c2" />}
      {item === 'bottle' && <path d="M26 86 Q24 66 34 62 L35 52 H41 L42 62 Q52 66 50 86 Z" fill="#eef7fb" stroke="#7aa6c2" />}
      {beam(36, 5, riders.h / 5, '100 g', 100)}
      {beam(64, 9, riders.t / 9, '10 g', 10)}
      {beam(92, 10, riders.f / 10, '1 g', 1, true)}
      <rect x={268} y={30} width={22} height={90} rx={3} fill="#f8fafc" stroke="#94a3b8" />
      <line x1={268} x2={290} y1={75} y2={75} stroke="#16a34a" strokeWidth="1.4" />
      <text x={279} y={128} fontSize="7" textAnchor="middle" fill="#334155">
        0
      </text>
      <path d={`M262 ${75 - tilt * 34} l26 0`} stroke="#0f172a" strokeWidth="2" />
      <rect x={0} y={128} width={300} height={22} fill="#475569" />
    </svg>
  );
}

const FILL_COLOUR = { none: 'transparent', water: '#64b5f6', liquid: '#e9c46a' } as const;
/** The density bottle from the side: its contents, sand, any trapped bubble, the stopper and its capillary, drops outside. */
export function BottleSvg({ b, brim, stoppered, liquidColour }: { b: BottleSnap; brim: boolean; stoppered: boolean; liquidColour?: string }) {
  const col = b.fill === 'liquid' ? (liquidColour ?? FILL_COLOUR.liquid) : FILL_COLOUR[b.fill];
  const level = b.fill === 'none' ? 0 : brim || b.toCap ? 1 : 0.9;
  const bodyTop = 60;
  const bodyBot = 170;
  const lvlY = b.fill === 'none' ? bodyBot : bodyTop - 16 + (1 - level) * 140;
  return (
    <svg viewBox="0 0 140 190" className={cn(card, 'h-[190px] w-[140px] select-none')} role="img" aria-label={`Density bottle: ${b.fill === 'none' ? (b.sand ? 'sand only' : 'empty') : `${b.fill === 'water' ? 'water' : 'the liquid'}${b.toCap ? ', filled to the capillary' : brim ? ', to the brim' : ', not quite full'}`}${b.bubble ? ', an air bubble trapped' : ''}${stoppered ? ', stoppered' : ''}${b.outsideWet ? ', wet outside' : ''}${b.film !== 'none' && b.fill === 'none' ? ', wet inside' : ''}`}>
      <defs>
        <clipPath id="dens-bottle">
          <path d="M58 44 L58 54 Q20 64 22 120 Q24 172 70 172 Q116 172 118 120 Q120 64 82 54 L82 44 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#dens-bottle)">
        {b.fill !== 'none' && <rect x={0} y={lvlY} width={140} height={200} fill={col} opacity={0.7} />}
        {b.sand > 0 && <path d={`M10 ${172 - b.sand * 9} Q70 ${165 - b.sand * 11} 130 ${172 - b.sand * 9} L130 180 L10 180 Z`} fill="#c8a165" />}
        {b.bubble && <circle cx={92} cy={b.sand ? 160 - b.sand * 9 : 72} r={5} fill="#fff" opacity={0.85} stroke="#90a4ae" />}
        {b.fill === 'none' && b.film !== 'none' && [40, 64, 96, 104].map((x, i) => <circle key={i} cx={x} cy={100 + i * 14} r={2} fill={FILL_COLOUR[b.film]} opacity={0.8} />)}
      </g>
      <path d="M58 44 L58 54 Q20 64 22 120 Q24 172 70 172 Q116 172 118 120 Q120 64 82 54 L82 44 Z" fill="none" stroke="#5f8aa5" strokeWidth={1.6} />
      {/* stopper with its capillary */}
      <g transform={stoppered ? 'translate(0 0)' : 'translate(34 -6) rotate(18 70 30)'}>
        <rect x={56} y={22} width={28} height={8} rx={2} fill="#d9eef8" stroke="#5f8aa5" />
        <path d="M60 30 L62 52 H78 L80 30 Z" fill="#d9eef8" stroke="#5f8aa5" />
        <rect x={68.6} y={22} width={2.8} height={30} fill={stoppered && b.toCap ? col : '#fff'} stroke="#5f8aa5" strokeWidth={0.4} />
      </g>
      {b.outsideWet && [30, 108, 50].map((x, i) => <path key={i} d={`M${x} ${110 + i * 18} q3 6 0 8 q-3 -2 0 -8`} fill={col === 'transparent' ? '#64b5f6' : col} />)}
      <text x={70} y={186} textAnchor="middle" fontSize="8" fill="#475569">
        50 cm³ density bottle
      </text>
    </svg>
  );
}
