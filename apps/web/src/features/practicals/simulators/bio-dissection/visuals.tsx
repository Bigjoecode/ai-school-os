import {
  EOSIN_DRAWING_BUNDLES,
  PLATE_LABEL,
  PLATES,
  eosinCutAt,
  eosinFront,
  eosinSectionSeen,
  eosinVeinsAt,
  mouldCover,
  plateDots,
  ratTorn,
  type BioDissectionState,
  type BioDissectionVariant,
  type EosinSeen,
  type EosinShade,
} from '@aischool/shared';
import { useMemo } from 'react';

/**
 * The dissection lab's drawings, shared by the 2D lab, the 3D close-ups and
 * the notebook: the balsam plant in eosin with its ruler and a magnified
 * ruler at the red front; transverse and longitudinal sections as seen; the
 * rat on its board at each stage (schematic and respectful: no blood); the
 * agar plates with their colonies; the bread slices; and the line drawings
 * students label (stem section, the displayed dissection, Rhizopus).
 */

const RED = '#c2185b';
const PALE = '#eef2dc';
const INK = '#2d3436';
const W = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------------ the plant in eosin

const PX = 8; // px per cm
const DYE_Y = 250;
/** The balsam plant standing in the eosin beside its ruler; the red line at time t. */
export function PlantSvg({ v, w, label, t }: { v: BioDissectionVariant; w: BioDissectionState['eosin']; label: string; t?: number }) {
  const time = t ?? w.clock;
  const cut = eosinCutAt(w);
  const h = eosinFront(v.eosin, w, cut ?? time);
  const veins = w.dye && (cut ?? time) >= eosinVeinsAt(v.eosin, w);
  const top = DYE_Y - v.eosin.stemH * PX;
  const leaves = [] as number[];
  for (let y = v.eosin.leafH; y < v.eosin.stemH - 1; y += 4.5) leaves.push(y);
  return (
    <svg viewBox="0 0 220 300" className="mx-auto block h-auto w-full max-w-[260px]" role="img" aria-label={label}>
      <rect x="0" y="0" width="220" height="300" fill="#f7f5ef" rx="10" />
      {/* beaker */}
      <path d="M60 230 L60 292 Q60 296 64 296 L156 296 Q160 296 160 292 L160 230" fill="none" stroke="#9fb3bf" strokeWidth="2" />
      {w.dye && <rect x="61" y={DYE_Y} width="98" height="45" fill={RED} opacity="0.55" />}
      {!w.dye && <rect x="61" y={DYE_Y} width="98" height="45" fill="#d7ecf5" opacity="0.6" />}
      {/* roots */}
      {[-18, -8, 0, 9, 17].map((dx, i) => (
        <path key={i} d={`M110 ${DYE_Y - 4} q ${dx} 18 ${dx * 1.6} 38`} fill="none" stroke={w.wash ? '#e8dcc0' : '#8d6e63'} strokeWidth="1.6" />
      ))}
      {/* stem */}
      <rect x="107" y={top} width="6" height={DYE_Y - top} fill="#d9ebb8" stroke="#a5c27a" strokeWidth="0.8" rx="2" />
      {w.dye && h > 0 && (
        <>
          <rect x="108.6" y={DYE_Y - h * PX} width="1.1" height={h * PX} fill={RED} />
          <rect x="110.4" y={DYE_Y - h * PX} width="1.1" height={h * PX} fill={RED} opacity="0.85" />
          {w.wash === 'ROUGH' && <rect x="107.4" y={DYE_Y - h * PX * 0.6} width="5.2" height={h * PX * 0.6} fill={RED} opacity="0.35" />}
        </>
      )}
      {leaves.map((y, i) => {
        const yy = DYE_Y - y * PX;
        const s = i % 2 ? 1 : -1;
        return (
          <g key={i}>
            <path d={`M110 ${yy} q ${s * 22} -14 ${s * 40} -6 q ${s * -18} 12 ${s * -40} 6`} fill="#8bc34a" stroke="#558b2f" strokeWidth="0.8" />
            <path d={`M110 ${yy} q ${s * 20} -8 ${s * 38} -6`} fill="none" stroke={veins && y <= h + 0.1 ? RED : '#4f7d22'} strokeWidth={veins && y <= h + 0.1 ? 1.2 : 0.7} />
          </g>
        );
      })}
      {/* ruler, 0 at the dye surface */}
      <rect x="132" y={DYE_Y - 30 * PX} width="14" height={30 * PX} fill="#fff8e1" stroke="#c9b37a" strokeWidth="0.8" />
      {Array.from({ length: 31 }, (_, cm) => (
        <g key={cm}>
          <line x1="132" x2={cm % 5 ? 137 : 140} y1={DYE_Y - cm * PX} y2={DYE_Y - cm * PX} stroke={INK} strokeWidth="0.6" />
          {cm % 5 === 0 && (
            <text x="141" y={DYE_Y - cm * PX + 2.5} fontSize="6.5" fill={INK}>
              {cm}
            </text>
          )}
        </g>
      ))}
      <text x="12" y="20" fontSize="10" fill={INK}>
        {w.dye ? `${Math.round(time)} min${cut !== null ? ' — stem cut' : ''}` : 'Not in the dye yet'}
      </text>
      {w.place && (
        <text x="12" y="33" fontSize="8.5" fill="#6b7280">
          {w.place === 'BRIGHT' ? 'Bright, airy place' : 'Dark cupboard'}
        </text>
      )}
    </svg>
  );
}

/** The ruler magnified at the top of the red line as you read it (to 0.1 cm). */
export function RulerZoom({ reading, label }: { reading: number; label: string }) {
  const from = Math.max(0, Math.floor(reading) - 1);
  const S = 46; // px per cm
  const y = (cm: number) => 150 - (cm - from) * S;
  return (
    <svg viewBox="0 0 220 160" className="mx-auto block h-auto w-full max-w-[300px]" role="img" aria-label={label}>
      <rect x="0" y="0" width="220" height="160" rx="10" fill="#1f2933" />
      <rect x="70" y="0" width="22" height="160" fill="#d9ebb8" />
      <rect x="77" y={y(reading)} width="7" height={160 - y(reading)} fill={RED} />
      <rect x="77" y={y(reading) - 2} width="7" height="3" fill={RED} opacity="0.45" />
      <rect x="100" y="0" width="60" height="160" fill="#fff8e1" />
      {Array.from({ length: 31 }, (_, i) => {
        const cm = from + i / 10;
        if (cm > from + 3.2) return null;
        const major = i % 10 === 0;
        return (
          <g key={i}>
            <line x1="100" x2={major ? 126 : i % 5 === 0 ? 118 : 112} y1={y(cm)} y2={y(cm)} stroke={INK} strokeWidth={major ? 1.2 : 0.7} />
            {major && (
              <text x="130" y={y(cm) + 4} fontSize="12" fill={INK}>
                {Math.round(cm)}
              </text>
            )}
          </g>
        );
      })}
      <line x1="60" x2="104" y1={y(reading)} y2={y(reading)} stroke="#facc15" strokeWidth="0.8" strokeDasharray="3 2" />
      <text x="190" y="16" textAnchor="middle" fontSize="9" fill="#e5e7eb">
        ×5 at the
      </text>
      <text x="190" y="28" textAnchor="middle" fontSize="9" fill="#e5e7eb">
        red line
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ sections

const bundlePath = (cx: number, cy: number, deg: number, r0: number, r1: number, half: number) => {
  const a = (deg * Math.PI) / 180;
  const p = (r: number, da: number) => [cx + r * Math.cos(a + da), cy + r * Math.sin(a + da)].map(W).join(' ');
  return `M${p(r0, -half * 0.7)} L${p(r1, -half)} A ${r1} ${r1} 0 0 1 ${p(r1, half)} L${p(r0, half * 0.7)} Z`;
};
/** A section as seen with the hand lens or the microscope. */
export function SectionSvg({ kind, seen, thin, tool, bundles, label }: { kind: 'TS' | 'LS'; seen: EosinSeen; thin: boolean; tool: 'LENS' | 'MICRO'; bundles: number; label: string }) {
  const xylem = seen === 'NONE' ? '#e6e1c4' : RED;
  const all = seen === 'ALL';
  const blur = !thin ? 'url(#thick)' : undefined;
  return (
    <svg viewBox="0 0 200 200" className="mx-auto block h-auto w-full max-w-[280px]" role="img" aria-label={label}>
      <defs>
        <filter id="thick">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <clipPath id="field">
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="98" fill="#111" />
      <g clipPath="url(#field)" filter={blur}>
        <rect x="0" y="0" width="200" height="200" fill={tool === 'MICRO' ? '#fbf8ef' : '#f3efe2'} />
        {kind === 'TS' ? (
          <g transform={tool === 'MICRO' ? 'translate(-40 -40) scale(1.4)' : undefined}>
            <circle cx="100" cy="100" r="86" fill={all ? '#f3c2d5' : PALE} stroke="#7c8b57" strokeWidth="2.4" />
            <circle cx="100" cy="100" r="44" fill={all ? '#f6d6e2' : '#f8f6ea'} stroke="#d8d3b8" strokeWidth="0.6" />
            {Array.from({ length: bundles }, (_, i) => {
              const deg = (360 * i) / bundles + 9;
              return (
                <g key={i}>
                  <path d={bundlePath(100, 100, deg, 58, 67, 0.16)} fill="#dfe8c6" stroke="#8ea36b" strokeWidth="0.6" />
                  <path d={bundlePath(100, 100, deg, 47, 57, 0.15)} fill={xylem} stroke="#8e3a5a" strokeWidth={seen === 'NONE' ? 0.4 : 0.7} />
                  {tool === 'MICRO' &&
                    [0, 1, 2].map((j) => {
                      const a = ((deg + (j - 1) * 4.5) * Math.PI) / 180;
                      return <circle key={j} cx={W(100 + 52 * Math.cos(a))} cy={W(100 + 52 * Math.sin(a))} r="1.6" fill="none" stroke="#5b1630" strokeWidth="0.5" />;
                    })}
                </g>
              );
            })}
            <circle cx="100" cy="100" r="57.5" fill="none" stroke="#6d7f45" strokeWidth="0.5" strokeDasharray="2 2" />
          </g>
        ) : (
          <g>
            {[
              [6, '#c7d39b'],
              [26, all ? '#f3c2d5' : PALE],
              [62, '#dfe8c6'],
              [78, seen === 'NONE' ? '#e6e1c4' : '#f2b8cd'],
              [94, all ? '#f6d6e2' : '#f8f6ea'],
              [106, seen === 'NONE' ? '#e6e1c4' : '#f2b8cd'],
              [122, '#dfe8c6'],
              [138, all ? '#f3c2d5' : PALE],
              [174, '#c7d39b'],
            ].map(([x, c], i, arr) => (
              <rect key={i} x={x as number} y="0" width={((arr[i + 1]?.[0] as number) ?? 194) - (x as number)} height="200" fill={c as string} />
            ))}
            {[82, 88, 110, 116].map((x) => (
              <path key={x} d={Array.from({ length: 26 }, (_, k) => `${k ? 'L' : 'M'}${x + (k % 2 ? 3 : -3)} ${k * 8}`).join(' ')} fill="none" stroke={seen === 'NONE' ? '#a09a7a' : RED} strokeWidth="1.3" />
            ))}
          </g>
        )}
      </g>
      {!thin && <circle cx="100" cy="100" r="96" fill="#000" opacity="0.38" />}
      <text x="100" y="194" textAnchor="middle" fontSize="8" fill="#e5e7eb">
        {kind === 'TS' ? 'Transverse section' : 'Longitudinal section'} · {tool === 'MICRO' ? 'microscope (low power)' : 'hand lens'}
      </text>
    </svg>
  );
}
export function sectionSeenOf(v: BioDissectionVariant, w: BioDissectionState['eosin'], n: number) {
  return eosinSectionSeen(v.eosin, w, n);
}

/** The student's drawing of a transverse section of the stem (line drawing, with their shading). */
export function StemDrawing({ shade }: { shade: EosinShade | null }) {
  return (
    <g fill="none" stroke={INK} strokeWidth="1">
      <circle cx="100" cy="100" r="86" />
      <circle cx="100" cy="100" r="82" strokeWidth="0.6" />
      {EOSIN_DRAWING_BUNDLES.map((deg) => (
        <g key={deg}>
          <path d={bundlePath(100, 100, deg, 58, 66, 0.16)} fill={shade === 'BUNDLES' ? 'url(#hatch)' : 'none'} />
          <path d={bundlePath(100, 100, deg, 50, 58, 0.15)} fill={shade === 'XYLEM' || shade === 'BUNDLES' ? 'url(#hatch)' : 'none'} />
        </g>
      ))}
      <circle cx="100" cy="100" r="58" strokeWidth="0.6" strokeDasharray="3 2" />
      {shade === 'WHOLE' && <circle cx="100" cy="100" r="86" fill="url(#hatch)" stroke="none" />}
      <defs>
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke={INK} strokeWidth="0.8" />
        </pattern>
      </defs>
    </g>
  );
}

// ------------------------------------------------------------------ the rat (schematic)

/** Organ outlines in the 0–200 × 0–240 frame of the opened body (head up). The rat's left is on the right. */
export const ORGANS = {
  oesophagus: 'M100 0 L100 62 Q104 70 112 70',
  liver: 'M44 58 Q60 40 100 46 Q140 40 158 56 Q150 72 128 66 Q112 84 96 72 Q80 84 64 74 Q48 76 44 58 Z',
  stomach: 'M112 64 Q140 54 152 74 Q156 96 132 96 Q116 94 108 84 Q104 72 112 64 Z',
  duodenum: 'M108 86 Q92 92 86 106 Q84 122 100 124 Q110 124 114 116',
  pancreas: 'M90 104 Q100 98 104 108 Q102 118 92 116 Q84 112 90 104 Z',
  ileum: 'M114 116 Q140 112 144 128 Q146 144 122 142 Q100 140 106 154 Q112 168 136 160 Q150 150 152 138 M120 128 Q132 124 134 132 Q132 140 118 136',
  caecum: 'M52 146 Q46 166 60 178 Q78 184 82 166 Q84 150 70 144 Q58 140 52 146 Z',
  colon: 'M80 166 Q98 188 128 186 Q150 184 152 170 Q152 190 128 198 Q110 204 104 196',
  rectum: 'M104 196 L102 236',
};
export const ORGAN_FILL: Record<keyof typeof ORGANS, string> = { oesophagus: 'none', liver: '#8e5450', stomach: '#ead1c4', duodenum: 'none', pancreas: '#f2d9d4', ileum: 'none', caecum: '#d8b994', colon: 'none', rectum: 'none' };
export const TUBE: Partial<Record<keyof typeof ORGANS, string>> = { oesophagus: '#e3bfae', duodenum: '#f0caa9', ileum: '#f0caa9', colon: '#dcb38d', rectum: '#cfa27c' };

function Organs({ shift = 0, line = false, unravel = false }: { shift?: number; line?: boolean; unravel?: boolean }) {
  return (
    <g>
      {(Object.keys(ORGANS) as (keyof typeof ORGANS)[]).map((k) => {
        const gut = k === 'ileum' || k === 'caecum' || k === 'colon';
        const tr = gut && shift ? `translate(${shift} ${unravel ? 8 : 0})` : undefined;
        if (line) return <path key={k} d={ORGANS[k]} fill="none" stroke={INK} strokeWidth={TUBE[k] ? 1.4 : 1} transform={tr} />;
        return TUBE[k] ? (
          <g key={k} transform={tr}>
            <path d={ORGANS[k]} fill="none" stroke="#a7826b" strokeWidth="7.5" strokeLinecap="round" />
            <path d={ORGANS[k]} fill="none" stroke={TUBE[k]} strokeWidth="6" strokeLinecap="round" />
          </g>
        ) : (
          <path key={k} d={ORGANS[k]} fill={ORGAN_FILL[k]} stroke="#7c5a4a" strokeWidth="0.8" transform={tr} />
        );
      })}
      {!line && unravel && <path d="M150 150 Q176 160 170 186" fill="none" stroke="#f0caa9" strokeWidth="5" strokeLinecap="round" />}
    </g>
  );
}

/** The rat on its board, at the stage the state has reached (schematic). */
export function RatSvg({ w, label }: { w: BioDissectionState['rat']; label: string }) {
  const pinned = w.pinned;
  const ventral = pinned !== 'DORSAL';
  const fur = ventral ? '#d8cfc4' : '#8c7f72';
  const open = !!w.wall;
  const shift = w.display ? 22 : 0;
  return (
    <svg viewBox="0 0 220 330" className="mx-auto block h-auto w-full max-w-[280px]" role="img" aria-label={label}>
      <rect x="4" y="4" width="212" height="322" rx="8" fill="#b88a5e" stroke="#7a5a3c" strokeWidth="2" />
      <rect x="10" y="10" width="200" height="310" rx="6" fill="#c79a6c" />
      {/* tail */}
      <path d="M110 300 Q114 318 140 322" fill="none" stroke="#c9a7a0" strokeWidth="4" strokeLinecap="round" />
      {/* limbs, spread and pinned */}
      {[
        [62, 92, 40, 70],
        [158, 92, 180, 70],
        [64, 262, 42, 290],
        [156, 262, 178, 290],
      ].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={fur} strokeWidth="9" strokeLinecap="round" />
          {pinned && (
            <g>
              <line x1={x2! - 3} y1={y2! - 6} x2={x2! + 3} y2={y2! + 6} stroke="#9e9e9e" strokeWidth="1.6" />
              <circle cx={x2! - 3} cy={y2! - 6} r="3" fill="#e53935" />
            </g>
          )}
        </g>
      ))}
      {/* head and body */}
      <ellipse cx="110" cy="44" rx="20" ry="30" fill={fur} />
      <circle cx="96" cy="28" r="5" fill={ventral ? '#c4b9ad' : '#6f6257'} />
      <circle cx="124" cy="28" r="5" fill={ventral ? '#c4b9ad' : '#6f6257'} />
      <ellipse cx="110" cy="180" rx="56" ry="122" fill={fur} />
      {w.skin && (
        <g>
          {w.skinPinned ? (
            <>
              <path d="M66 82 L54 76 L50 290 L66 296 Z" fill="#cfc4b8" stroke="#a89c8f" />
              <path d="M154 82 L166 76 L170 290 L154 296 Z" fill="#cfc4b8" stroke="#a89c8f" />
              <rect x="66" y="78" width="88" height="216" rx="20" fill="#e5b7a8" />
              {[56, 168].map((x) => [90, 180, 280].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="#e53935" />))}
            </>
          ) : (
            <line x1="110" y1="70" x2="110" y2="290" stroke="#7a6a5c" strokeWidth="1.4" />
          )}
        </g>
      )}
      {open && (
        <g transform="translate(10 68)">
          <rect x="62" y="0" width="76" height="12" rx="4" fill={w.ribs ? '#e9cfc8' : '#d8a99a'} />
          {w.ribs && (
            <g>
              <ellipse cx="88" cy="-12" rx="12" ry="16" fill="#e8b4b4" />
              <ellipse cx="112" cy="-12" rx="12" ry="16" fill="#e8b4b4" />
              <path d="M100 -24 Q110 -10 100 2 Q90 -10 100 -24 Z" fill="#b97c7c" />
            </g>
          )}
          <g transform="translate(0 14) scale(1 0.88)">
            <Organs shift={shift} unravel={w.unravelled} />
          </g>
          {ratTorn(w) && (
            <g>
              <circle cx="128" cy="138" r="7" fill="none" stroke="#546e7a" strokeWidth="1.6" strokeDasharray="2 2" />
              <text x="140" y="130" fontSize="7" fill="#37474f">
                torn
              </text>
            </g>
          )}
          {w.moist && <rect x="56" y="0" width="88" height="226" rx="16" fill="#cfe8f3" opacity="0.18" />}
        </g>
      )}
      {!pinned && (
        <text x="110" y="316" textAnchor="middle" fontSize="9" fill="#3e2a1a">
          Not pinned yet
        </text>
      )}
    </svg>
  );
}
/** The student's drawing of the displayed dissection (line drawing for labelling). */
export function RatDrawing() {
  return (
    <g>
      <path d="M40 30 Q30 120 44 236 L160 236 Q172 120 162 30" fill="none" stroke="#9aa0a6" strokeWidth="0.8" strokeDasharray="3 3" />
      <Organs line />
    </g>
  );
}

// ------------------------------------------------------------------ plates and bread

/** An agar plate seen from above through its lid, after `days` of incubation. */
export function PlateSvg({ v, w, k, days, seed, label, big }: { v: BioDissectionVariant; w: BioDissectionState['micro']; k: number; days: number | null; seed: number; label: string; big?: boolean }) {
  const dots = useMemo(() => plateDots(v.micro, w, k, seed), [v, w, k, seed]);
  const shown = days === null ? [] : dots.filter((d) => d.t <= days + 1e-9);
  const p = w.plates[k]!;
  const R = 80;
  return (
    <svg viewBox="0 0 200 200" className={big ? 'mx-auto block h-auto w-full max-w-[340px]' : 'mx-auto block h-auto w-full max-w-[150px]'} role="img" aria-label={label}>
      <circle cx="100" cy="100" r="96" fill="#e8eef0" stroke="#9fb3bf" strokeWidth="2" />
      <circle cx="100" cy="100" r={R + 6} fill="#f2e3a6" />
      {big && (
        <g stroke="#9c8a4a" strokeWidth="0.7" strokeDasharray="4 3">
          <line x1="100" y1="14" x2="100" y2="186" />
          <line x1="14" y1="100" x2="186" y2="100" />
        </g>
      )}
      {shown.map((d, i) => {
        const grow = days === null ? 1 : Math.min(1, 0.55 + (days - d.t) * 0.35);
        const cx = 100 + d.x * R;
        const cy = 100 + d.y * R;
        const r = d.r * R * grow;
        return d.fungus ? (
          <g key={i}>
            <circle cx={W(cx)} cy={W(cy)} r={W(r * 1.15)} fill="#ffffff" opacity="0.85" />
            <circle cx={W(cx)} cy={W(cy)} r={W(r)} fill="#f5f5f5" stroke="#bdbdbd" strokeWidth="0.6" strokeDasharray="1 1" />
            <circle cx={W(cx)} cy={W(cy)} r={W(r * 0.3)} fill="#9e9e9e" />
          </g>
        ) : (
          <circle key={i} cx={W(cx)} cy={W(cy)} r={W(r)} fill="#f7ecc7" stroke="#c7a24a" strokeWidth="0.7" />
        );
      })}
      {p.tape && (
        <g fill="#f5f0dc" opacity="0.85">
          {p.tape === 'SEALED' ? <circle cx="100" cy="100" r="95" fill="none" stroke="#e9e1c2" strokeWidth="6" /> : [<rect key="a" x="92" y="0" width="16" height="22" />, <rect key="b" x="92" y="178" width="16" height="22" />]}
        </g>
      )}
      {p.label && (
        <text x="100" y={p.label === 'BASE' ? 150 : 40} textAnchor="middle" fontSize={big ? 11 : 13} fill={p.label === 'BASE' ? '#1e3a8a' : '#7f1d1d'} opacity={p.label === 'BASE' ? 0.55 : 0.9} fontStyle="italic">
          {PLATE_LABEL[PLATES[k]!]}
        </text>
      )}
    </svg>
  );
}

/** A slice of bread on clock day d (its mould cover from the shared maths). */
export function BreadSvg({ v, w, k, d, label }: { v: BioDissectionVariant; w: BioDissectionState['micro']; k: number; d: number; label: string }) {
  const cover = mouldCover(v.micro, w, k, d);
  const sl = w.slices[k]!;
  const blobs = Math.round(cover / 4);
  const r = (i: number, s: number) => ((Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1 + 1) % 1;
  return (
    <svg viewBox="0 0 160 150" className="mx-auto block h-auto w-full max-w-[150px]" role="img" aria-label={label}>
      <path d="M20 60 Q18 14 80 14 Q142 14 140 60 L140 136 L20 136 Z" fill="#c58a4a" />
      <path d="M28 62 Q28 24 80 24 Q132 24 132 62 L132 128 L28 128 Z" fill={sl.moist ? '#efdcae' : '#f6e8c4'} />
      {Array.from({ length: blobs }, (_, i) => {
        const x = 34 + r(i, k + 1) * 92;
        const y = 34 + r(i, k + 7) * 88;
        return (
          <g key={i}>
            <circle cx={W(x)} cy={W(y)} r={W(6 + r(i, 3) * 6)} fill="#ffffff" opacity="0.9" />
            {cover > 18 && <circle cx={W(x + 2)} cy={W(y - 1)} r="1.6" fill="#212121" />}
            {cover > 40 && <circle cx={W(x - 3)} cy={W(y + 3)} r="1.3" fill="#212121" />}
          </g>
        );
      })}
      <text x="80" y="147" textAnchor="middle" fontSize="9" fill={INK}>
        {`Slice ${['A', 'B', 'C'][k]}: ${sl.moist === null ? '—' : sl.moist ? 'moist' : 'dry'}, ${sl.place === 'COLD' ? 'cold' : sl.place === 'WARM' ? 'warm' : '—'}`}
      </text>
    </svg>
  );
}

/** The teacher's slide of Rhizopus under the microscope (low power). */
export function MouldSlide({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 200 200" className="mx-auto block h-auto w-full max-w-[260px]" role="img" aria-label={label}>
      <circle cx="100" cy="100" r="98" fill="#111" />
      <circle cx="100" cy="100" r="94" fill="#eef3f6" />
      <g transform="translate(0 20)">
        <path d="M10 128 Q60 118 108 126 Q150 132 192 120" fill="none" stroke="#9aa5ab" strokeWidth="2.4" />
        <path d="M60 126 L60 42 M146 126 L146 40 M104 126 L104 70" stroke="#9aa5ab" strokeWidth="2" />
        {[
          [60, 32],
          [146, 30],
          [104, 62],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="12" fill="#263238" />
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <circle key={j} cx={x! + 7 * Math.cos(j)} cy={y! + 7 * Math.sin(j)} r="1.5" fill="#90a4ae" />
            ))}
          </g>
        ))}
        {[44, 52, 60, 68, 134, 146, 158].map((x) => (
          <path key={x} d={`M${x < 100 ? 60 : 146} 128 Q${x} 140 ${x + (x < 100 ? -6 : 2)} 152`} fill="none" stroke="#b0bec5" strokeWidth="1.2" />
        ))}
      </g>
      <text x="100" y="190" textAnchor="middle" fontSize="8" fill="#37474f">
        Rhizopus, low power (teacher’s slide)
      </text>
    </svg>
  );
}

/** The student's drawing of Rhizopus from the teacher's slide (line drawing for labelling). */
export function MouldDrawing() {
  return (
    <g fill="none" stroke={INK} strokeWidth="1">
      <path d="M20 128 Q60 118 108 126 Q150 132 190 120" strokeWidth="1.4" />
      <path d="M60 126 L60 42" strokeWidth="1.3" />
      <circle cx="60" cy="32" r="12" fill="#cfd8dc" />
      <path d="M60 42 Q52 34 60 26 Q68 34 60 42" />
      <path d="M146 126 L146 40" strokeWidth="1.3" />
      <path d="M134 34 Q146 18 158 34" />
      {[
        [138, 20],
        [150, 14],
        [160, 22],
        [130, 26],
        [156, 30],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill={INK} />
      ))}
      <path d="M150 100 Q170 96 188 100 M156 110 Q172 116 186 112" />
      {[36, 44, 52, 60, 68].map((x) => (
        <path key={x} d={`M60 128 Q${x} 140 ${x - 6} 152`} strokeWidth="0.8" />
      ))}
      {[136, 146, 156].map((x) => (
        <path key={x} d={`M146 128 Q${x} 140 ${x + 2} 150`} strokeWidth="0.8" />
      ))}
    </g>
  );
}
