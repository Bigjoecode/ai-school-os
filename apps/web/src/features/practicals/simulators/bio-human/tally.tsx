import { SKIN_AREA_LABEL, skinResponse, type BioHumanState, type BioHumanVariant, type SkinArea } from '@aischool/shared';

/** The touches on one area so far, with what the subject said (the tally sheet; the student counts the correct answers). */
export function SkinTally({ v, state, area, dark }: { v: BioHumanVariant; state: BioHumanState; area: SkinArea; dark?: boolean }) {
  const rows = state.skin.trials.map((t, n) => ({ t, n })).filter((x) => x.t.area === area);
  return (
    <div className="mt-2 text-[12px]">
      <p className={dark ? 'text-white/70' : 'text-muted-foreground'}>
        Tally for the {SKIN_AREA_LABEL[area].toLowerCase()} ({rows.length} touches). Count the correct answers yourself.
      </p>
      {rows.length > 0 && <p className="mt-1 font-mono leading-relaxed">{rows.map((x) => `${x.t.sep ? `${x.t.sep} mm` : '1 pt'}: ${skinResponse(v.skin, state.skin, x.n, v.seed) === 'TWO' ? 'two' : 'one'}`).join(' · ')}</p>}
    </div>
  );
}
