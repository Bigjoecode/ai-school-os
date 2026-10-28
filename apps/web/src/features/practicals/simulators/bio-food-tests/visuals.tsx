import { AMY_BATH_SHORT, AMY_SPOT_HEX, AMY_SPOT_NAME, FOOD_COL, amySpots, type BioFoodState, type BioFoodVariant, type FoodVisual } from '@aischool/shared';
import { useId } from 'react';

/** The 2D drawings: a test tube (in the water bath when heated), the grease-spot paper, and the spotting tile. */

export function TubeSvg({ vis, inBath, label }: { vis: FoodVisual; inBath: boolean; label: string }) {
  const id = useId().replace(/:/g, '');
  if (vis.paper)
    return (
      <svg viewBox="0 0 90 150" className="h-[150px] w-[90px] shrink-0" role="img" aria-label={`Filter paper: ${vis.paper === 'translucent' ? 'a translucent spot' : vis.paper === 'wet' ? 'a wet mark' : 'dry, no spot'}`}>
        <circle cx="45" cy="70" r="38" fill="#fbfaf5" stroke="#cfcac0" />
        {vis.paper !== 'dry' && <ellipse cx="45" cy="70" rx="14" ry="11" fill={vis.paper === 'translucent' ? '#e9e2c2' : '#dfe5ea'} opacity={vis.paper === 'translucent' ? 0.95 : 0.7} />}
        {vis.paper === 'translucent' && <ellipse cx="41" cy="66" rx="5" ry="3" fill="#fffef6" opacity="0.8" />}
        <text x="45" y="128" textAnchor="middle" fontSize="9" className="fill-muted-foreground">
          {vis.paper === 'translucent' ? 'held to the light' : vis.paper === 'wet' ? 'wet' : 'dried'}
        </text>
      </svg>
    );
  const top = 64;
  return (
    <svg viewBox="0 0 90 150" className="h-[150px] w-[90px] shrink-0" role="img" aria-label={label}>
      {inBath && (
        <g>
          <rect x="8" y="78" width="74" height="62" rx="4" fill="#d6e8f5" opacity="0.65" stroke="#9fb7c9" />
          {[0, 1, 2, 3, 4].map((k) => (
            <circle key={k} cx={16 + k * 14} cy={128 - (k % 2) * 18} r="2" fill="none" stroke="#7f9bb0" strokeWidth="0.8" />
          ))}
        </g>
      )}
      <defs>
        <clipPath id={`ft-${id}`}>
          <path d="M31 14 L59 14 L59 114 A14 14 0 0 1 31 114 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#ft-${id})`}>
        <rect x="31" y={top} width="28" height="72" fill={vis.liquid} style={{ transition: 'fill 400ms ease' }} />
        {vis.emulsion && [0, 1, 2, 3, 4, 5, 6].map((k) => <circle key={k} cx={35 + ((k * 7) % 20)} cy={top + 8 + ((k * 9) % 40)} r="2.4" fill="#ffffff" opacity="0.8" />)}
        {vis.ppt && <rect x="31" y="104" width="28" height="30" fill={vis.ppt} />}
        {vis.layer && <rect x="31" y={top} width="28" height="9" fill={vis.layer} opacity="0.95" />}
        {vis.bubbles && [0, 1, 2, 3, 4].map((k) => <circle key={k} cx={35 + ((k * 7) % 20)} cy={top + 10 + ((k * 11) % 36)} r={1.4 + (k % 2)} fill="none" stroke="#7a8794" strokeWidth="0.8" />)}
      </g>
      <path d="M31 14 L59 14 L59 114 A14 14 0 0 1 31 114 Z" fill="none" className="stroke-muted-foreground/70" strokeWidth="1.4" />
    </svg>
  );
}

/** The spotting tile: one row of wells per tube, one well per drop tested (yellow-brown iodine until a drop of starch turns it blue-black). */
export function SpotTileSvg({ v, state, max = 16 }: { v: BioFoodVariant; state: BioFoodState; max?: number }) {
  const rows = state.tubes.length || 3;
  const times = [...new Set(state.spots.map((x) => x.t))].sort((a, b) => a - b).slice(-max);
  const cols = Math.max(8, Math.min(max, times.length + 1));
  const w = 64 + cols * 22;
  const h = 26 + rows * 22;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[520px] rounded-xl border border-border bg-card" role="img" aria-label="Spotting tile with iodine">
      <rect x="58" y="4" width={cols * 22 + 4} height={rows * 22 + 6} rx="6" fill="#fbfbf8" stroke="#d6d3cc" />
      {times.map((t, c) => (
        <text key={t} x={71 + c * 22} y={h - 6} textAnchor="middle" fontSize="7.5" className="fill-muted-foreground">
          {t}
        </text>
      ))}
      {Array.from({ length: rows }, (_, r) => {
        const tube = state.tubes[r];
        const sp = tube ? amySpots(v, state, r) : [];
        return (
          <g key={r}>
            <text x="54" y={20 + r * 22} textAnchor="end" fontSize="8" className="fill-foreground">
              {tube ? `${r + 1}. ${tube.boiled ? 'boiled' : AMY_BATH_SHORT[tube.bath]}` : `—`}
            </text>
            {Array.from({ length: cols }, (_, c) => {
              const t = times[c];
              const got = t === undefined ? undefined : sp.find((x) => x.t === t);
              const fill = !state.tile ? '#f4f3ef' : got ? AMY_SPOT_HEX[got.stage]! : FOOD_COL.iodine;
              return (
                <circle key={c} cx={71 + c * 22} cy={17 + r * 22} r="7.5" fill={fill} stroke="#cbc6bd" strokeWidth="0.8">
                  {got && <title>{`${t} s: ${AMY_SPOT_NAME[got.stage]}`}</title>}
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
