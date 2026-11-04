import { ORG_COL, type FoodVisual, type OrgVisual, type SoapRun } from '@aischool/shared';
import { TubeSvg } from '../bio-food-tests/visuals';

/** The 2D drawings: a test tube from a test's outcome (the food-tests tube), its gas test, and the soap beaker. */
export const asFood = (v: OrgVisual): FoodVisual => ({ liquid: v.liquid, ppt: v.ppt ?? v.solid ?? null, layer: v.layer, emulsion: false, bubbles: v.bubbles, paper: null, benedict: v.benedict });

export function OrgTubeSvg({ vis, inBath, label }: { vis: OrgVisual; inBath: boolean; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <TubeSvg vis={asFood(vis)} inBath={inBath} label={label} />
      {vis.probes.map((p, k) => (
        <span key={k} className="mt-0.5 rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground">
          {p.test === 'LIME_WATER' ? `lime water: ${p.text}` : `splint: ${p.text}`}
        </span>
      ))}
      {vis.poured && <span className="mt-0.5 text-[10.5px] text-muted-foreground">poured into water</span>}
    </div>
  );
}

/** The soap beaker: the mixture's level and look, the soap layer after brine. */
export function SoapBeakerSvg({ r }: { r: SoapRun }) {
  const level = Math.max(0, Math.min(1, ((r.oil ? 10 : 0) + r.water + (r.brine ? 20 : 0)) / 60));
  const top = 128 - level * 90;
  const mix = !r.naoh ? ORG_COL.palmOil : r.charred ? '#5a3a1e' : r.extent > 0.6 ? '#ead9a8' : '#e9a25a';
  return (
    <svg viewBox="0 0 120 150" className="h-[150px] w-[120px] shrink-0" role="img" aria-label={`Beaker: ${r.oil ? 'palm oil' : 'empty'}${r.naoh ? ' and NaOH' : ''}${r.boiled ? `, boiled ${Math.round(r.boiled / 60)} min` : ''}${r.separated ? ', soap layer on the brine' : ''}`}>
      <path d="M20 20 L20 130 Q20 138 28 138 L92 138 Q100 138 100 130 L100 20" fill="none" className="stroke-muted-foreground/70" strokeWidth="2" />
      {level > 0 && !r.filtered && <rect x="22" y={top} width="76" height={136 - top} fill={r.brine ? ORG_COL.brine : mix} opacity="0.9" />}
      {r.naoh && r.extent < 0.6 && !r.brine && <rect x="22" y={top} width="76" height="7" fill={ORG_COL.palmOil} opacity="0.9" />}
      {r.separated && !r.filtered && <rect x="22" y={top} width="76" height="14" fill={ORG_COL.soap} stroke="#c9b98a" />}
      {r.filtered && <rect x="40" y="112" width="40" height="18" rx="4" fill={ORG_COL.soap} stroke="#c9b98a" />}
      <text x="60" y="148" textAnchor="middle" fontSize="8" className="fill-muted-foreground">
        {r.filtered ? 'soap filtered off' : `${r.water.toFixed(0)} cm³ water`}
      </text>
    </svg>
  );
}
