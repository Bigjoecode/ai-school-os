import { SPRING_CARD, SPRING_MEAN_ZONE, SPRING_SMALL_AMP, springMassesFly, springOverLimit, springPeriod, type PhySpringState, type PhySpringVariant } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { loadName, type Motion, type Watch } from '../actions';
import { APPARATUS_LABEL, NEEDED, PLACE_LABEL, type ApparatusId, type SceneState } from './scene-state';

/**
 * Guided mode (practice only): the spring as a checklist — collect, set up,
 * then Hooke's law: R₀, each load on the card (steady, read at eye level),
 * unloading; or the oscillations: each mass on the card timed twice from the
 * fiducial mark — with gentle corrections and the reason. Worked out from the
 * recorded state only: the guide never says what the pointer reads.
 */

const upLoads = (s: PhySpringState) => new Set(s.readings.filter((r) => r.load > 0 && r.peak <= r.load).map((r) => r.load));
const downLoads = (s: PhySpringState) => new Set(s.readings.filter((r) => r.load > 0 && r.peak > r.load).map((r) => r.load));

export function guideSteps(s: PhySpringState, scene: SceneState, mode: CameraMode, motion: Motion | null, watch: Watch): GuideStep[] {
  const task = s.task ?? 'HOOKE';
  const osc = task === 'OSC';
  const steps: GuideStep[] = [
    { id: 'collect', label: `Collect your apparatus${scene.missing.length ? ` (${scene.missing.length} to go)` : ''}`, target: 'cupboard', why: osc ? 'A retort stand and clamp, the spring, the mass hanger and slotted masses, a stopwatch and a fiducial pointer.' : 'A retort stand and clamps, the spring, a metre rule, a pointer, the mass hanger and slotted masses.', done: scene.ready },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front: the spring hangs over the front edge.', done: mode !== 'walk' || scene.placed.size > 0 },
  ];
  for (const id of osc ? (['stand', 'spring', 'fiducial'] as ApparatusId[]) : (['stand', 'spring', 'rule', 'pointer'] as ApparatusId[]))
    steps.push({
      id: `place-${id}`,
      label: PLACE_LABEL[id]!,
      target: id,
      why:
        id === 'stand'
          ? 'Near the edge, clamped firmly, so the load hangs clear of the bench and the stand cannot topple.'
          : id === 'spring'
            ? 'From the clamp’s hook, hanging freely.'
            : id === 'rule'
              ? 'Vertical and close to the spring, 0 at the top: the pointer moves down the scale as the spring stretches.'
              : id === 'pointer'
                ? 'A pin fixed with plasticine at the bottom of the spring, its tip just in front of the scale.'
                : 'Its tip level with the bottom of the hanger at rest: the mark you time from.',
      done: scene.placed.has(id),
      group: 'Set up',
    });
  if (!osc) {
    const ups = upLoads(s);
    const downs = downLoads(s);
    const hasR0 = s.readings.some((r) => r.load === 0 && r.peak === 0);
    steps.push(
      { id: 'r0', label: 'Read the pointer with no load (R₀) and take the reading', target: 'pointer', why: 'Every extension is measured from R₀. Eye level with the pointer, to 0.1 cm.', done: hasR0, group: 'No load' },
      { id: 'r0-note', label: 'Write R₀ in your notebook', target: 'book', why: 'With its unit: cm.', done: !!s.answers.r0.value.trim(), group: 'No load' },
    );
    const next = SPRING_CARD.HOOKE.find((L) => !ups.has(L)) ?? null;
    if (next !== null && s.peak <= Math.max(...SPRING_CARD.HOOKE)) {
      const group = `Load ${SPRING_CARD.HOOKE.indexOf(next) + 1}: ${next} g`;
      steps.push(
        { id: 'load', label: next === 50 ? 'Hang the 50 g mass hanger on the spring' : `Add a 50 g mass (total ${next} g)`, target: next === 50 ? 'hanger-bench' : 'masses', why: 'Lower it gently by hand: equal steps of load should give equal steps of extension.', done: s.load === next, group },
        { id: 'still', label: 'Steady the hanger and let the pointer come to rest', target: 'hanger', why: 'A bouncing pointer gives a false reading.', done: s.load === next && !motion, group },
        { id: 'read', label: 'Read the pointer at eye level, take the reading and write it in the table', target: 'pointer', why: 'Eye level with the pointer: above or below it, the reading is off (parallax).', done: false, group },
      );
    } else if (s.load > 50 || (s.load === 50 && !downs.has(50))) {
      const L = s.load;
      steps.push(
        { id: 'unload', label: downs.has(L) ? `Take a 50 g mass off (total ${L - 50} g)` : `Unloading: read the pointer at ${L} g`, target: downs.has(L) ? 'masses' : 'pointer', why: 'The readings on unloading should agree with those on loading: the spring is still within its elastic limit. Write them in the unloading column.', done: false, group: 'Unloading' },
      );
    }
    steps.push({ id: 'rows', label: 'Fill in m, W = mg and e = (mean R) − R₀ for every load', target: 'book', why: 'W in newtons: m in kg × 10 m s⁻². e from the mean of the loading and unloading readings.', done: s.hooke.length >= 5 && s.hooke.every((r) => r.m.trim() && r.W.trim() && r.Rl.trim() && r.e.trim()) });
    steps.push(
      { id: 'graph', label: 'Plot e against W and draw your best line', target: 'book', why: 'Within the elastic limit e = W/k: a straight line through the origin.', done: !!s.line },
      { id: 'slope', label: 'Find the slope and k = 1/slope', target: 'book', why: 'Slope in cm N⁻¹ → divide by 100 for m N⁻¹, then k = 1/slope in N m⁻¹.', done: !!s.answers.slope.value.trim() && !!s.answers.k.value.trim() },
    );
  } else {
    const timed = (L: number) => s.runs.filter((r) => r.load === L).length;
    const next = SPRING_CARD.OSC.find((L) => timed(L) < 2) ?? null;
    if (next !== null) {
      const group = `Mass ${SPRING_CARD.OSC.indexOf(next) + 1}: ${(next / 1000).toFixed(3)} kg (timing ${timed(next) + 1} of 2)`;
      const swingOk = !!motion?.released && motion.load === next;
      steps.push(
        { id: 'load', label: `Make the load ${next} g (hanger + ${next - 50} g)`, target: s.load === 0 ? 'hanger-bench' : 'masses', why: 'The hanger is the first 50 g; add or take off slotted masses.', done: s.load === next, group },
        { id: 'release', label: `Pull the hanger down a little (${s.amp <= SPRING_SMALL_AMP ? s.amp : 1.5} cm) and release it`, target: 'hanger', why: 'A small displacement: the motion is simple harmonic, the masses stay on, and it oscillates straight up and down.', done: swingOk, group },
        { id: 'start', label: 'Start the stopwatch as the hanger passes the fiducial mark', target: 'stopwatch', why: 'It moves fastest at the rest position, so the instant is sharp. Count "0".', done: swingOk && watch.start !== null, group },
        { id: 'stop', label: `Stop it after ${s.n} complete oscillations`, target: 'stopwatch', why: 'Each time it passes the mark going the same way is one oscillation.', done: swingOk && watch.stop !== null, group },
        { id: 'record', label: 'Record the timing and copy it into your table', target: 'stopwatch', why: 't₁ and t₂ to 0.01 s, then the mean t, T = t/n and T².', done: false, group },
      );
    }
    steps.push({ id: 'rows', label: 'Fill in m (kg), t₁, t₂, t, T and T² for every mass', target: 'book', why: 'm in kg; t = (t₁ + t₂)/2; T = t/n; T² = T × T.', done: s.osc.length >= 5 && s.osc.every((r) => r.m.trim() && r.t1.trim() && r.t2.trim() && r.t.trim() && r.T.trim() && r.T2.trim()) });
    steps.push(
      { id: 'graph', label: 'Plot T² against m and draw your best line', target: 'book', why: 'T² = (4π²/k) m (+ a small intercept from the spring’s own mass): a straight line.', done: !!s.line },
      { id: 'slope', label: 'Find the slope s and k = 4π²/s', target: 'book', why: 'Slope in s² kg⁻¹; k = 39.5 ÷ s in N m⁻¹.', done: !!s.answers.slope.value.trim() && !!s.answers.k.value.trim() },
    );
  }
  steps.push(
    { id: 'written', label: 'Write two precautions', target: 'book', why: osc ? 'E.g. small vertical oscillations; timed many oscillations and repeated; timed from the fiducial mark.' : 'E.g. eye level with the pointer (no parallax); the spring at rest before each reading; readings checked on unloading.', done: !!s.written.precautions.trim() },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  );
  return steps;
}

/** A gentle correction for a step just recorded (null: nothing wrong). */
export function correctionFor(a: string, s: PhySpringState, v: PhySpringVariant): Correction | null {
  const [verb, arg, extra] = a.split(':') as [string, string | undefined, string | undefined];
  const task = s.task ?? 'HOOKE';
  if (verb === 'collect' && arg && !NEEDED[task].includes(arg as ApparatusId) && APPARATUS_LABEL[arg as ApparatusId])
    return { title: `The ${APPARATUS_LABEL[arg as ApparatusId].toLowerCase()} is not needed here.`, why: `This practical needs ${NEEDED[task].map((id) => APPARATUS_LABEL[id].toLowerCase()).join(', ')}. You can put it back from your bench or the cupboard list.` };
  if (verb === 'load' && arg) {
    const L = Number(arg);
    if (task === 'HOOKE' && L > 0 && !s.readings.some((r) => r.load === 0)) return { title: 'Read R₀ first.', why: 'Take the pointer reading with no load before you hang anything: every extension is measured from it. Take the hanger off, read, then start again.', focus: 'pointer' };
    if (springOverLimit(v, L)) return { title: 'That is past the spring’s elastic limit.', why: `With ${loadName(L)} the spring stretches more than in proportion and will not return to its old length. Take the masses off: in this lab the spring now keeps a small permanent stretch.`, focus: 'spring' };
  }
  if (verb === 'reading') {
    if (extra === 'moving') return { title: 'The pointer was still moving.', why: 'Steady the hanger and wait until the pointer is still, then read it. Delete this row (×) if it has the bad reading, and take it again.', focus: 'hanger' };
  }
  if (verb === 'fly' && arg) return { title: 'Too big a displacement.', why: `With only ${loadName(Number(arg))} the slotted masses would jump off the hanger at the top. Pull it down just 1–2 cm.`, focus: 'hanger' };
  if (verb === 'release' && arg && extra && Number(extra) > SPRING_SMALL_AMP) return { title: 'A small displacement is better.', why: 'The lesson says 1–2 cm: then the motion is simple harmonic and the hanger does not swing sideways. Stop it (steady) and release it again from 1.5 cm.', focus: 'hanger' };
  if (verb === 'record') {
    const r = s.runs[s.runs.length - 1];
    if (!r) return null;
    const T = springPeriod(v, r.load, s.runs.length - 1);
    if (Math.abs(r.elapsed / T - r.n) > 0.25) return { title: `That was not ${r.n} oscillations.`, why: `You timed about ${(r.elapsed / T).toFixed(1)}. Count "0" as you start at the mark, then 1, 2, 3… each time the hanger passes it going the same way. Delete this timing (×) and time it again.`, focus: 'stopwatch' };
    if (r.startPhase > SPRING_MEAN_ZONE) return { title: 'Start at the fiducial mark.', why: 'You started the watch near the top or bottom of the swing, where the hanger is almost still and the instant is hard to judge. Start as it passes the fiducial mark.', focus: 'fiducial' };
    if (springMassesFly(v, r.load, r.amp)) return { title: 'The masses were bouncing on the hanger.', why: 'Use a smaller displacement.' };
  }
  return null;
}
