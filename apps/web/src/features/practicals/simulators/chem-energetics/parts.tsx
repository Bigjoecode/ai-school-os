import { EN_SPEEDS } from '@aischool/shared';
import { cn } from '@/lib/utils';

/** Small pictures shared by the 2D lab and the 3D lab's panels: the thermometer close-up, the cup, the boiling tube, the time-lapse picker. */

/** A close-up of the thermometer column: 1 °C divisions, read to the nearest 0.5 °C at eye level. */
export function ThermoLoupe({ temp: raw, caption, className }: { temp: number; caption?: string; className?: string }) {
  const temp = Number.isFinite(raw) ? Math.max(-10, Math.min(110, raw)) : 25;
  const Hh = 200;
  const k = 14; // px per °C
  const Y = (c: number) => Hh / 2 - (c - temp) * k;
  const ticks: number[] = [];
  for (let c = Math.floor(temp) - 8; c <= Math.ceil(temp) + 8; c++) if (c >= -10 && c <= 110) ticks.push(c);
  return (
    <figure className={cn('space-y-1', className)}>
      <svg viewBox={`0 0 84 ${Hh}`} className="h-[200px] w-[84px] rounded-lg border border-border bg-[#fbfbf7]" role="img" aria-label="Close-up of the thermometer">
        <rect x={28} y={0} width={10} height={Hh} fill="#eef0f2" stroke="#b9bfc5" />
        <rect x={31} y={Y(temp)} width={4} height={Hh - Y(temp)} fill="#c62828" />
        {ticks.map((c) => (
          <g key={c}>
            <line x1={38} x2={c % 5 === 0 ? 54 : 47} y1={Y(c)} y2={Y(c)} stroke="#111" strokeWidth={c % 5 === 0 ? 1.3 : 0.8} />
            <line x1={38} x2={42} y1={Y(c + 0.5)} y2={Y(c + 0.5)} stroke="#555" strokeWidth={0.5} />
            {c % 5 === 0 && (
              <text x={57} y={Y(c) + 4} fontSize="11" fontWeight="700" fill="#111">
                {c}
              </text>
            )}
            {c % 5 !== 0 && (
              <text x={50} y={Y(c) + 3} fontSize="7" fill="#666">
                {c}
              </text>
            )}
          </g>
        ))}
        <line x1={20} x2={64} y1={Hh / 2} y2={Hh / 2} stroke="#2563eb" strokeWidth={0.6} strokeDasharray="2 2" />
      </svg>
      <figcaption className="max-w-[120px] text-[11px] leading-tight text-muted-foreground">{caption ?? '°C — eye level with the top of the column; to the nearest 0.5 °C.'}</figcaption>
    </figure>
  );
}

/**
 * The polystyrene cup (or a glass beaker) standing in a beaker, the lid, the
 * thermometer, the liquid (paler where the solid is still dissolving) and, for
 * a salt, the undissolved crystals at the bottom.
 */
export function CupSvg({ vessel, supported, liquid, lid, solid, undissolved, steam, thermo, warm }: { vessel: 'CUP' | 'BEAKER' | null; supported: boolean; liquid: number; lid: boolean; solid: 'SALT' | 'NAOH' | null; undissolved: number; steam?: boolean; thermo: boolean; warm: number }) {
  // warm: −1 (cold, bluish) … +1 (warm, faint orange)
  const tint = warm > 0 ? `rgba(255, 170, 120, ${Math.min(0.35, warm * 0.35)})` : `rgba(120, 170, 255, ${Math.min(0.35, -warm * 0.35)})`;
  const level = 150 - Math.min(1, liquid / 100) * 75;
  return (
    <svg viewBox="0 0 220 200" className="mx-auto h-[200px] w-full max-w-[280px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`${vessel === 'BEAKER' ? 'Glass beaker' : vessel === 'CUP' ? 'Polystyrene cup' : 'No cup chosen'}${supported ? ' standing in a beaker' : ''}${liquid ? ` with ${liquid} cm³ of liquid` : ''}${lid ? ', covered' : ''}`}>
      <rect x={0} y={186} width={220} height={14} className="fill-slate-300 dark:fill-slate-700" />
      {supported && <path d="M52 92 L52 186 L168 186 L168 92" fill="rgba(210,230,240,0.35)" stroke="#8aa0ad" strokeWidth={2} />}
      {vessel && (
        <>
          {liquid > 0 && <path d={`M${66 + (level - 75) * 0.08} ${level} L${154 - (level - 75) * 0.08} ${level} L148 182 L72 182 Z`} fill="#dcecf7" />}
          {liquid > 0 && <path d={`M${66 + (level - 75) * 0.08} ${level} L${154 - (level - 75) * 0.08} ${level} L148 182 L72 182 Z`} fill={tint} />}
          {solid && undissolved > 0.002 && Array.from({ length: Math.max(1, Math.round(undissolved * 22)) }, (_, i) => <circle key={i} cx={80 + ((i * 37) % 60)} cy={178 - ((i * 13) % 6)} r={solid === 'NAOH' ? 3.2 : 1.8} fill={solid === 'NAOH' ? '#f4f4f0' : '#fafafa'} stroke="#9aa" strokeWidth={0.5} />)}
          <path d="M60 70 L160 70 L148 184 L72 184 Z" fill="none" stroke={vessel === 'CUP' ? '#d8d2c4' : '#7d8f9c'} strokeWidth={vessel === 'CUP' ? 6 : 2} />
          {lid && <rect x={54} y={62} width={112} height={8} rx={2} fill="#ece6d6" stroke="#bfb7a3" />}
        </>
      )}
      {thermo && (
        <g>
          <rect x={113} y={14} width={6} height={162} rx={3} fill="#eef3f6" stroke="#9fb0bb" />
          <circle cx={116} cy={176} r={5} fill="#c62828" />
        </g>
      )}
      {steam && <path d="M90 50 q6 -8 0 -16 M110 48 q6 -8 0 -16" stroke="#cbd5dc" strokeWidth={2} fill="none" />}
    </svg>
  );
}

/** The boiling tube in the water bath (or the rack), clear or with crystals, the thermometer standing in it. */
export function TubeSvg({ inBath, flame, solid, mass, water, stirring }: { inBath: boolean; flame: boolean; solid: number; mass: number; water: number; stirring: boolean }) {
  const liquidTop = 150 - Math.min(14, water) * 6;
  const crystals = mass > 0 ? Math.min(40, Math.round((solid / Math.max(0.1, mass)) * 40)) : 0;
  return (
    <svg viewBox="0 0 200 200" className="mx-auto h-[200px] w-full max-w-[260px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Boiling tube ${inBath ? (flame ? 'over a flame' : 'in the hot water bath') : 'cooling in air'}${water ? `, ${water} cm³ of water` : ''}${crystals ? ', crystals visible' : water ? ', clear solution' : ''}`}>
      {inBath && !flame && (
        <>
          <rect x={40} y={110} width={120} height={70} fill="rgba(140,190,225,0.45)" stroke="#7d8f9c" strokeWidth={2} />
          <path d="M60 104 q5 -7 0 -12 M140 104 q5 -7 0 -12" stroke="#cbd5dc" strokeWidth={2} fill="none" />
        </>
      )}
      {flame && <path d="M100 196 q-12 -18 0 -38 q12 20 0 38 Z" fill="#4f7cff" opacity={0.8} />}
      <path d="M88 30 L88 162 Q100 176 112 162 L112 30" fill="none" stroke="#7d8f9c" strokeWidth={2} />
      {mass > 0 && water > 0 && <path d={`M89 ${liquidTop} L111 ${liquidTop} L111 162 Q100 175 89 162 Z`} fill="#bcd8ee" stroke="#8fb4d1" strokeWidth={0.6} />}
      {Array.from({ length: crystals }, (_, i) => (
        <rect key={i} x={91 + ((i * 7) % 18)} y={(water > 0 ? 166 : 160) - ((i * 11) % Math.max(4, 166 - liquidTop - 6)) * (i % 3 === 0 ? 1 : 0.3)} width={2.4} height={1.6} fill="#ffffff" stroke="#9aa" strokeWidth={0.4} transform={`rotate(${(i * 47) % 90} ${92 + ((i * 7) % 18)} 160)`} />
      ))}
      <rect x={98} y={8} width={5} height={160} rx={2.5} fill="#eef3f6" stroke="#9fb0bb" transform={stirring ? `rotate(${Math.sin(performance.now() / 120) * 3} 100 30)` : undefined} />
      <circle cx={100.5} cy={166} r={3.5} fill="#c62828" />
    </svg>
  );
}

/** Time-lapse: the lab clock runs faster; it slows to real time when something is about to happen. */
export function SpeedPicker({ speed, onSpeed, dark = false }: { speed: number; onSpeed: (x: number) => void; dark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-1 text-[12px]', dark ? 'text-white/80' : 'text-muted-foreground')} role="radiogroup" aria-label="Time-lapse">
      <span>Time-lapse</span>
      {EN_SPEEDS.map((x) => (
        <button
          key={x}
          type="button"
          role="radio"
          aria-checked={speed === x}
          onClick={() => onSpeed(x)}
          className={cn('rounded-md px-2 py-0.5 font-medium', speed === x ? (dark ? 'bg-white text-slate-900' : 'bg-foreground text-background') : dark ? 'bg-white/10' : 'border border-border')}
        >
          {x}×
        </button>
      ))}
    </div>
  );
}

/** Seconds as m:ss. */
export const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
