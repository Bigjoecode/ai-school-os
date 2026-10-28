import { RATES_SPEEDS, RATES_SYRINGE } from '@aischool/shared';
import { cn } from '@/lib/utils';

/** Small pictures shared by the 2D lab and the 3D lab's panels: the syringe scale, the thermometer, the cross seen from above, the stopwatch. */

/** A close-up of the gas syringe's scale at the plunger's inner end (read it to the nearest 0.5 cm³). */
export function SyringeLoupe({ value, caption }: { value: number; caption?: string }) {
  const Wd = 230;
  const k = 13; // px per cm³
  const X = (cm: number) => Wd / 2 + (cm - value) * k;
  const lo = Math.max(0, Math.floor(value) - 9);
  const hi = Math.min(RATES_SYRINGE, Math.ceil(value) + 9);
  const ticks: number[] = [];
  for (let c = lo; c <= hi; c++) ticks.push(c);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${Wd} 96`} className="h-[96px] w-[230px] rounded-lg border border-border bg-[#eef6fb]" role="img" aria-label="Close-up of the gas syringe scale at the plunger">
        {/* the gas (left) and the plunger (right) */}
        <rect x={0} y={30} width={Math.max(0, X(value))} height={40} fill="#dbeaf5" />
        <rect x={X(value)} y={30} width={Wd} height={40} fill="#c9ced3" />
        <rect x={X(value)} y={30} width={5} height={40} fill="#3b3f44" />
        {ticks.map((c) => (
          <g key={c}>
            <line x1={X(c)} x2={X(c)} y1={8} y2={c % 10 === 0 ? 28 : c % 5 === 0 ? 24 : 18} stroke="#111" strokeWidth={c % 10 === 0 ? 1.4 : 0.8} />
            {c % 10 === 0 && (
              <text x={X(c)} y={86} textAnchor="middle" fontSize="12" fontWeight="700" fill="#111">
                {c}
              </text>
            )}
            {c % 5 === 0 && c % 10 !== 0 && (
              <text x={X(c)} y={86} textAnchor="middle" fontSize="9" fill="#333">
                {c}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">{caption ?? 'Read the scale at the plunger’s inner (dark) end.'}</figcaption>
    </figure>
  );
}

/** A close-up of the thermometer column (read it to 1 °C, or 0.5 °C). */
export function ThermoLoupe({ temp }: { temp: number }) {
  const Hh = 200;
  const k = 9;
  const Y = (c: number) => Hh / 2 - (c - temp) * k;
  const ticks: number[] = [];
  for (let c = Math.floor(temp) - 11; c <= Math.ceil(temp) + 11; c++) if (c >= -10 && c <= 110) ticks.push(c);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 80 ${Hh}`} className="h-[200px] w-[80px] rounded-lg border border-border bg-[#fbfbf7]" role="img" aria-label="Close-up of the thermometer">
        <rect x={30} y={0} width={8} height={Hh} fill="#eef0f2" stroke="#b9bfc5" />
        <rect x={32} y={Y(temp)} width={4} height={Hh - Y(temp)} fill="#c62828" />
        {ticks.map((c) => (
          <g key={c}>
            <line x1={38} x2={c % 5 === 0 ? 52 : 45} y1={Y(c)} y2={Y(c)} stroke="#111" strokeWidth={c % 5 === 0 ? 1.2 : 0.7} />
            {c % 5 === 0 && (
              <text x={55} y={Y(c) + 4} fontSize="11" fontWeight="700" fill="#111">
                {c}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">°C — eye level with the top of the column.</figcaption>
    </figure>
  );
}

/** Looking down through the flask at the cross (or from the side, where the cross cannot be judged). */
export function CrossView({ visible, cloud, top, empty }: { visible: number; cloud: number; top: boolean; empty: boolean }) {
  const liquid = `rgba(236, 224, 160, ${empty ? 0 : Math.min(1, 0.12 + 0.88 * cloud)})`;
  return (
    <svg viewBox="0 0 200 200" className="h-[200px] w-[200px] rounded-xl border border-border bg-white" role="img" aria-label={top ? (empty ? 'The cross on the paper' : visible > 0.02 ? 'Looking down: the cross can still be seen' : 'Looking down: the cross can no longer be seen') : 'The flask from the side'}>
      {top ? (
        <>
          <rect x={0} y={0} width={200} height={200} fill="#fafaf7" />
          <g stroke="#111" strokeWidth={14} strokeLinecap="round" opacity={empty || visible > 0 ? 1 : 0}>
            <line x1={55} y1={55} x2={145} y2={145} />
            <line x1={145} y1={55} x2={55} y2={145} />
          </g>
          <circle cx={100} cy={100} r={78} fill={liquid} stroke="#9fb3c2" strokeWidth={3} />
          <circle cx={100} cy={100} r={26} fill="none" stroke="#cfdbe3" strokeWidth={2} />
        </>
      ) : (
        <>
          <rect x={0} y={0} width={200} height={200} fill="#f3f5f7" />
          <path d="M80 20 L120 20 L120 70 L168 178 L32 178 L80 70 Z" fill="none" stroke="#7d8f9c" strokeWidth={3} />
          {!empty && <path d="M58 120 L142 120 L168 178 L32 178 Z" fill={liquid} />}
          <rect x={20} y={178} width={160} height={8} fill="#fff" stroke="#ccc" />
        </>
      )}
    </svg>
  );
}

export function Stopwatch({ seconds, running, className }: { seconds: number; running: boolean; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card px-3 py-2 text-center', className)}>
      <p className="text-[11px] text-muted-foreground">Stopwatch {running ? '● running' : ''}</p>
      <p className="font-mono text-2xl font-semibold tabular" aria-label={`Stopwatch reads ${seconds.toFixed(2)} seconds`}>
        {seconds.toFixed(2)}
      </p>
      <p className="text-[11px] text-muted-foreground">s</p>
    </div>
  );
}

/** Time-lapse: the lab clock (and stopwatch) run faster; they ease back to real time near each reading. */
export function SpeedPicker({ speed, onSpeed, dark = false }: { speed: number; onSpeed: (x: number) => void; dark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-1 text-[12px]', dark ? 'text-white/80' : 'text-muted-foreground')} role="radiogroup" aria-label="Time-lapse">
      <span>Time-lapse</span>
      {RATES_SPEEDS.map((x) => (
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
