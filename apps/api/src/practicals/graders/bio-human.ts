import {
  BIO_HUMAN,
  BREATH_CLAIM_LABEL,
  BREATH_MIN,
  BREATH_NEED,
  BREATH_TIDAL,
  BREATH_WRONG,
  CO2_IN,
  CO2_OUT,
  PULSE_CLAIM_LABEL,
  PULSE_EX_LESSON,
  PULSE_MIN_REST,
  PULSE_NEED,
  PULSE_WRONG,
  REACT_CLAIM_LABEL,
  REACT_CONDS,
  REACT_COND_SHORT,
  REACT_MAX_PER,
  REACT_MIN_DOM,
  REACT_MIN_OTHER,
  REACT_NEED,
  REACT_WRONG,
  SKIN_AREAS,
  SKIN_AREA_LABEL,
  SKIN_CLAIM_LABEL,
  SKIN_NEED,
  SKIN_WRONG,
  bioHumanVariant,
  breathBulbShown,
  breathCountShown,
  breathModelState,
  breathRoomShown,
  breathTotal,
  kneeParts,
  limeParts,
  limeTurbidity,
  mirrorParts,
  pulseExEnd,
  pulseModelState,
  pulseRecoveryFrom,
  pulseRestSet,
  pulseSeen,
  reactModelState,
  reactSeen,
  reactTime,
  reactTrendOf,
  roundDp,
  skinModelState,
  skinSeen,
  skinStep,
  skinTol,
  type BioHumanState,
  type BioHumanVariant,
  type CriterionScore,
  type HumanTask,
  type ReactCond,
  type SkinArea,
} from '@aischool/shared';
import { observationCredit } from './chem-qualitative';
import { parseNumber, score, withinAbs, withinRel } from './helpers';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => BIO_HUMAN.rubric.find((c) => c.id === id)!;
const half = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const num = (raw: string) => parseNumber((raw ?? '').replace(/\s*(beats\/min|bpm|beats|breaths\/min|breaths|cm3\/min|cm³\/min|dm3\/min|cm3|cm³|°c|oc|c|mm|cm|m|s|min|mins|minutes|%|times|x|×)$/i, '').trim());
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const close = (x: number | null, target: number, abs: number, rel: number) => withinAbs(x, target, abs) || withinRel(x, target, rel);
/** Claims marks: `need` claims (each worth max ÷ need), less `pen` per wrong claim. */
function claimMarks<C extends string>(chosen: C[], need: C[], wrong: C[], max: number, pen: number) {
  const got = need.filter((c) => chosen.includes(c));
  const bad = chosen.filter((c) => wrong.includes(c));
  return { m: Math.max(0, half((max * got.length) / need.length) - bad.length * pen), got, bad };
}

// ------------------------------------------------------------------ AI items

const AI: Record<HumanTask, { precautions: { q: string; guide: string; kw: string[][] }; explain: { q: string; guide: string; kw: string[][] } }> = {
  PULSE: {
    precautions: {
      q: 'State two precautions you took when measuring your partner’s pulse rate before and after exercise.',
      guide: '2 marks: one for each correct precaution — the partner rested (sat quietly) for 5 minutes before the resting count; the pulse felt with two fingertips, not the thumb (which has its own pulse); the first count taken immediately after stopping; counts taken at regular one-minute intervals; the same exercise intensity and duration; counts repeated and averaged; a partner with asthma, heart or sickle-cell problems does not exercise. A source of error or a vague statement earns nothing.',
      kw: [['rest', 'sat quietly', 'sit quietly', '5 min'], ['thumb', 'fingertip', 'two fingers'], ['immediately', 'at once', 'straight after'], ['every minute', 'regular', 'interval'], ['same intensity', 'same rate', 'same exercise', 'same speed'], ['repeat', 'three', 'average', 'mean'], ['asthma', 'heart', 'sickle']],
    },
    explain: {
      q: 'Explain why the pulse rate rose during exercise and why it took several minutes to return to the resting rate.',
      guide: '2 marks: (1) active muscles respire faster, so they need more oxygen and glucose and produce more carbon dioxide; the heart beats faster to pump more blood to them (and carry the carbon dioxide away); (1) after exercise the rate falls gradually, not at once, because the muscles still need extra oxygen (the oxygen debt is repaid, lactic acid is removed) — a fitter person recovers faster. Saying the pulse rises to cool the body earns nothing for that point.',
      kw: [['oxygen'], ['glucose', 'energy', 'respir'], ['carbon dioxide', 'co2'], ['oxygen debt', 'lactic', 'gradual', 'fit']],
    },
  },
  BREATH: {
    precautions: {
      q: 'State two precautions you took when comparing inhaled and exhaled air.',
      guide: '2 marks: one for each correct precaution — breathed gently so lime water was not blown out or sucked in; equal volumes of lime water in both tubes; the same number of breaths in and out; a clean (disinfected) mouthpiece; the mirror wiped dry before breathing on it; the room temperature read before breathing on the bulb; the breaths counted for a full minute three times and averaged. A vague statement earns nothing.',
      kw: [['gently', 'gentle', 'not suck', 'not blow'], ['equal volume', 'same volume', 'equal amount', 'same amount'], ['same number'], ['clean', 'disinfect', 'mouthpiece'], ['dry', 'wipe'], ['room temperature', 'before breathing'], ['three', 'repeat', 'average', 'mean']],
    },
    explain: {
      q: 'Explain why the lime water in the exhaled-air tube turned milky first, and why exhaled air is warmer and moister than inhaled air.',
      guide: '2 marks: (1) exhaled air contains about 4 % carbon dioxide (inhaled about 0.04 %, roughly 100 times less); carbon dioxide reacts with lime water (calcium hydroxide) to form insoluble calcium carbonate, the white precipitate; (1) the extra carbon dioxide, the water vapour and the heat come from tissue respiration (glucose + oxygen → carbon dioxide + water + energy); exhaled air still contains about 16 % oxygen. Saying exhaled air has no oxygen earns nothing for that point.',
      kw: [['carbon dioxide', 'co2'], ['calcium carbonate', 'precipitate', 'calcium hydroxide'], ['respiration', 'respire'], ['water vapour', 'moist', 'heat', 'warm']],
    },
  },
  REACTION: {
    precautions: {
      q: 'State two precautions you took when measuring reaction time with the falling ruler.',
      guide: '2 marks: one for each correct precaution — the same starting position each time (fingers level with 0 cm, forearm resting on the bench edge); the ruler dropped without warning so the catcher cannot anticipate; many readings taken and averaged; the reading taken at the same part of the thumb (the top); the catcher looking at the ruler, not the dropper’s hand; distances converted from cm to m before using the formula; the knee tapped gently with the side of the hand. A vague statement earns nothing.',
      kw: [['same starting', 'same position', '0 cm', 'zero', 'bench edge', 'forearm'], ['without warning', 'no warning', 'not signal', 'anticipat'], ['average', 'mean', 'repeat', 'ten', 'many'], ['top of the thumb', 'same part', 'thumb'], ['metre', 'convert']],
    },
    explain: {
      q: 'Explain why catching the ruler is a voluntary action and the knee-jerk is a reflex, and why the catch distance became shorter with practice.',
      guide: '2 marks: (1) catching is voluntary: the eye (receptor) sends impulses along a sensory neurone to the brain, which decides, and a motor neurone carries impulses to the finger muscles — the longer pathway and decision take longer; the knee-jerk is a simple reflex: stretch receptor → sensory neurone → relay neurone in the spinal cord → motor neurone → thigh muscle (effector), with no thinking, so it is faster; (1) with practice the pathways are used more efficiently / the catcher learns the task, so the reaction time falls. Calling the catch a reflex earns nothing for that point.',
      kw: [['brain'], ['spinal cord', 'spinal'], ['sensory', 'motor', 'relay', 'neurone', 'neuron'], ['receptor', 'effector', 'muscle'], ['practice', 'learn']],
    },
  },
  SKIN: {
    precautions: {
      q: 'State two precautions you took in the two-point discrimination test.',
      guide: '2 marks: one for each correct precaution — the subject was blindfolded so they could not see the points; both points pressed at the same time with the same light pressure; random single-point touches included as checks; blunt points used gently, not breaking the skin; the points cleaned with alcohol between subjects; the separation reduced in small (1 mm) steps; each separation repeated. A vague statement earns nothing.',
      kw: [['blindfold', 'cannot see', 'not see', 'eyes closed'], ['same time', 'together', 'same pressure', 'equal pressure'], ['single', 'one point', 'random'], ['gently', 'blunt', 'not break'], ['alcohol', 'clean'], ['1 mm', 'small step'], ['repeat']],
    },
    explain: {
      q: 'Explain why two points can be felt at a much smaller separation on the fingertip than on the forearm.',
      guide: '2 marks: (1) the fingertip has many touch receptors close together (a high density per unit area), so two points close together still stimulate two different receptors and two separate impulses reach the brain; (1) on the forearm the receptors are far apart, so two close points fall within the area served by one receptor and are felt as one — the forearm does have receptors, just fewer. Saying the forearm has no receptors earns nothing for that point.',
      kw: [['receptor'], ['density', 'close together', 'closer', 'more receptors', 'many receptors', 'per unit area'], ['far apart', 'fewer', 'spread'], ['brain', 'impulse', 'nerve']],
    },
  },
};
function aiItems(task: HumanTask, s: BioHumanState): AiItem[] {
  const a = AI[task];
  return [
    { criterionId: 'precautions', question: a.precautions.q, answer: s.written.precautions.trim(), guide: a.precautions.guide, keywords: a.precautions.kw, need: 2 },
    { criterionId: 'explanation', question: a.explain.q, answer: s.written.explain.trim(), guide: a.explain.guide, keywords: a.explain.kw, need: 3 },
  ];
}

// ------------------------------------------------------------------ PULSE

function gradePulse(s: BioHumanState, v: BioHumanVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.pulse;
  const seen = pulseSeen(v.pulse, w, v.seed);
  const rest = seen.filter((x) => x.rest);
  const settledRest = rest.filter((x) => x.settled);
  const rec = seen.filter((x) => x.after !== null).sort((a, b) => a.after! - b.after!);
  const row = (n: number) => w.rows[n] ?? { beats: '', bpm: '' };
  const end = pulseExEnd(w);
  const trueRest = mean(pulseRestSet(seen).map((x) => x.bpm));

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.screened) m += 0.5;
    else notes.push('Before the exercise, ask your partner whether they have asthma, a heart problem or sickle-cell disease: if so they record rather than exercise.');
    if (rest.length && settledRest.length === rest.length) m += 0.5;
    else if (rest.length) notes.push(`Let your partner sit quietly for ${PULSE_MIN_REST} minutes before the resting counts: just after walking in the pulse is still raised.`);
    if (w.counts.length && !w.counts.some((c) => c.thumb)) m += 1;
    else if (w.counts.some((c) => c.thumb)) notes.push('Feel the pulse with two fingertips, never the thumb: the thumb has its own pulse, which confuses the count.');
    if (settledRest.length >= 3) m += 0.5;
    else notes.push('Count the resting pulse three times and take the mean.');
    if (w.exercise && w.exercise.min >= PULSE_EX_LESSON) m += 0.5;
    else if (w.exercise) notes.push(`Exercise for ${PULSE_EX_LESSON} minutes, as the task says.`);
    else notes.push('Your partner did not exercise.');
    if (end !== null && rec.length) {
      const first = rec[0]!.after!;
      const gaps = rec.slice(1).every((x, i) => x.after! - rec[i]!.after! <= 1.1 + 1e-9);
      const back = pulseRecoveryFrom(rec.map((x) => ({ after: x.after!, bpm: x.bpm })), trueRest) !== null;
      if (first <= 0.05 && gaps && back) m += 1;
      else {
        if (first > 0.05) notes.push('Count immediately the exercise stops: the pulse starts falling at once (a delay is a source of error).');
        if (!gaps) notes.push('Count every minute after the exercise, without gaps.');
        if (!back) notes.push('Keep counting every minute until the pulse is back to the resting rate.');
      }
    } else if (end !== null) notes.push('Count the pulse immediately after the exercise and every minute after that.');
    if (!w.counts.length) notes.splice(0, notes.length, 'No pulse counts were taken.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    const okOf = (xs: typeof seen) => xs.filter((x) => num(row(x.n).beats) === x.beats).length;
    const rOk = okOf(rest);
    const cOk = okOf(rec);
    const m = half((1.5 * rOk) / Math.max(3, rest.length) + (2.5 * cOk) / Math.max(5, rec.length));
    const bad = seen.filter((x) => row(x.n).beats.trim() && num(row(x.n).beats) !== x.beats).length;
    if (bad) notes.push(`${bad} count${bad === 1 ? ' is' : 's are'} not as you counted ${bad === 1 ? 'it' : 'them'}.`);
    if (rest.length < 3) notes.push('Resting counts are marked out of three.');
    if (rec.length < 5) notes.push('Recovery counts are marked out of at least five (immediately and every minute).');
    if (rOk + cOk < seen.length && !bad) notes.push('Write down every count.');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const bpmOk = seen.filter((x) => {
      const b = num(row(x.n).beats);
      return b !== null && close(num(row(x.n).bpm), b * (60 / x.c.dur), 0.05, 0.005);
    }).length;
    m += half(bpmOk / Math.max(5, seen.length));
    if (bpmOk < seen.length) notes.push('Beats per minute = beats counted × 60 ÷ seconds counted (× 4 for a 15-second count).');
    const pts = rec.filter((x) => num(row(x.n).bpm) !== null).length;
    if (w.axis === 'TIME_X') m += 1;
    else if (w.axis === 'TIME_Y') notes.push('Time is the independent variable: put it on the x-axis.');
    else notes.push('Plot the pulse rate against time.');
    if (w.curve === 'SMOOTH' && pts >= 5) m += 1;
    else if (w.curve === 'RULED') notes.push('The pulse changes smoothly: draw a smooth curve through the points, as the question asks, not ruled lines.');
    else notes.push('Draw a smooth curve through at least five points of the recovery.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const own = (xs: typeof seen) => xs.map((x) => num(row(x.n).bpm)).filter((x): x is number => x !== null);
    const sets = [own(settledRest), own(rest)].filter((x) => x.length).map(mean);
    const rm = num(w.restMean);
    if (rm !== null && sets.some((x) => close(rm, x, 1, 0.01))) m += 1;
    else notes.push('Mean resting rate = the mean of your resting beats/min.');
    const peak = rec[0] && rec[0].after! <= 0.3 ? num(row(rec[0].n).bpm) : null;
    const inc = num(w.increase);
    if (rm && peak !== null && close(inc, ((peak - rm) / rm) * 100, 0.6, 0.01)) m += 1;
    else notes.push('% increase = (rate just after exercise − resting rate) ÷ resting rate × 100, from your own values.');
    const ownPts = rec.map((x) => ({ after: x.after!, bpm: num(row(x.n).bpm) })).filter((p): p is { after: number; bpm: number } => p.bpm !== null);
    const recT = rm !== null ? pulseRecoveryFrom(ownPts, rm) : null;
    const said = num(w.recovery);
    if (recT !== null && said !== null && Math.abs(said - recT) <= 1 + 1e-9) m += 1;
    else if (recT !== null) notes.push(`On your own readings the pulse was back to the resting rate (within 4 beats/min) about ${roundDp(recT, 1)} minutes after stopping.`);
    else notes.push('Keep counting until the pulse is back to the resting rate, then state the recovery time.');
    const c = claimMarks(w.claims, PULSE_NEED, PULSE_WRONG, 2, 0.5);
    m += c.m;
    if (c.got.length < PULSE_NEED.length) notes.push('Conclude: the pulse rose sharply, then fell gradually back; the muscles needed more oxygen and glucose.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${PULSE_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = pulseModelState(v);
  const ms = pulseSeen(v.pulse, model.pulse, v.seed);
  const solution = [
    `Your partner’s resting pulse was about ${roundDp(v.pulse.rest, 0)} beats/min; just after walking in it was about ${roundDp(v.pulse.rest + v.pulse.walkIn, 0)}, which is why you rest 5 minutes first.`,
    `Resting counts in 15 s: ${ms.filter((x) => x.rest).map((x) => x.beats).join(', ')} → × 4 → mean ${model.pulse.restMean} beats/min.`,
    `After 2 minutes of step-ups: ${ms.filter((x) => x.after !== null).map((x) => `${roundDp(x.after!, 0)} min ${x.bpm}`).join(', ')} beats/min.`,
    `Increase = (peak − rest) ÷ rest × 100 = ${model.pulse.increase} %; back to rest after about ${model.pulse.recovery || '—'} minutes. A smooth curve with time on the x-axis.`,
    'The muscles respire faster and need more oxygen and glucose, and must lose carbon dioxide: the heart beats faster. Afterwards the rate falls gradually as the oxygen debt is repaid.',
  ];
  const facts = [`Screened ${w.screened ? 'yes' : 'no'}; ${rest.length} resting counts (${settledRest.length} after 5 min); exercise ${w.exercise ? `${w.exercise.min} min` : 'none'}; ${rec.length} recovery counts; thumb used ${w.counts.some((c) => c.thumb) ? 'yes' : 'no'}.`, `Recovery said ${w.recovery || '—'} min.`];
  return { auto, ai: aiItems('PULSE', s), solution, facts };
}

// ------------------------------------------------------------------ BREATH

function gradeBreath(s: BioHumanState, v: BioHumanVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.breath;
  const bv = v.breath;
  const total = breathTotal(w);
  const hard = w.breaths.some((b) => b.hard);
  const shownCounts = Array.from({ length: w.counts }, (_, n) => breathCountShown(bv, n, v.seed));

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.mouthpiece) m += 0.5;
    else notes.push('Fit a clean (disinfected) mouthpiece before breathing through the apparatus.');
    if (w.lime === 'EQUAL') m += 0.5;
    else if (w.lime) notes.push('Put equal volumes of lime water in both tubes so the comparison is fair.');
    else notes.push('Put lime water in both tubes.');
    if (total >= BREATH_MIN && !hard) m += 1;
    else if (hard) notes.push('Breathe gently: blowing or sucking hard blows lime water out or draws it into the mouth.');
    else notes.push(`Breathe gently in and out through the mouthpiece about 10 times (at least ${BREATH_MIN}).`);
    if (w.breathed && w.wipedFirst && w.cobalt) m += 1;
    else if (w.breathed && !w.wipedFirst) notes.push('Wipe the mirror dry before breathing on it: moisture already on it is a source of error.');
    else notes.push('Breathe on a dry mirror and test the mist with cobalt chloride paper.');
    if (w.troom === 'BEFORE' && w.tbreath) m += 0.5;
    else if (w.troom === 'AFTER') notes.push('Read the room temperature first: straight after breathing on it the bulb is still warm.');
    else notes.push('Record the room temperature, then breathe on the bulb and record it again.');
    if (w.counts >= 3) m += 0.5;
    else notes.push('Count your partner’s breaths for a minute, three times.');
    if (!w.lime && !w.counts && !w.breathed) notes.splice(0, notes.length, 'The apparatus was not used.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let m = 0;
    const room = breathRoomShown(bv, w);
    const bulb = breathBulbShown(bv, w);
    if (room !== null && withinAbs(num(w.roomT), room, 0.26)) m += 1;
    else notes.push(room === null ? 'Read the thermometer in the room air.' : 'The room temperature is not as the thermometer showed it.');
    if (bulb !== null && withinAbs(num(w.breathT), bulb, 0.26)) m += 1;
    else notes.push(bulb === null ? 'Breathe on the thermometer bulb and read it.' : 'The temperature of the breath is not as the thermometer showed it.');
    const pool = [...shownCounts];
    let ok = 0;
    for (const raw of w.rows.slice(0, 3)) {
      const k = pool.indexOf(num(raw) ?? -1);
      if (k >= 0) {
        ok++;
        pool.splice(k, 1);
      }
    }
    m += half((2 * ok) / 3);
    if (ok < 3) notes.push('Record three one-minute breathing counts as you counted them.');
    auto.push(score(crit('readings'), m, notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const own = w.rows.slice(0, 3).map(num).filter((x): x is number => x !== null);
    const mr = num(w.meanRate);
    if (own.length && close(mr, mean(own), 0.06, 0.005)) m += 1;
    else notes.push('Mean breathing rate = (r₁ + r₂ + r₃) ÷ 3.');
    if (mr !== null && close(num(w.vent), mr * BREATH_TIDAL, 1, 0.01)) m += 1;
    else notes.push(`Ventilation = breathing rate × tidal volume (${BREATH_TIDAL} cm³) per minute.`);
    const rt = num(w.roomT);
    const bt = num(w.breathT);
    if (rt !== null && bt !== null && withinAbs(num(w.rise), bt - rt, 0.06)) m += 0.5;
    else notes.push('Temperature rise = breath temperature − room temperature.');
    if (withinRel(num(w.ratio), CO2_OUT / CO2_IN, 0.01)) m += 0.5;
    else notes.push(`Exhaled air has ${CO2_OUT} ÷ ${CO2_IN} = ${CO2_OUT / CO2_IN} times as much carbon dioxide.`);
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const tA = limeTurbidity(bv, w, 'A');
    const tB = limeTurbidity(bv, w, 'B');
    if (tB >= 0.5 && w.firstMilky === 'B') m += 1;
    else if (tB >= 0.5) notes.push('The lime water in tube B (exhaled air) turned milky first.');
    else notes.push('Breathe through the apparatus until one lime water turns milky.');
    let o = 0;
    if (w.lime) {
      o += observationCredit(w.obsA, limeParts(bv, w, 'A')).credit / 2;
      o += observationCredit(w.obsB, limeParts(bv, w, 'B')).credit / 2;
    }
    m += half(o);
    if (o < 1 && w.lime) notes.push(`Tube A: ${limeParts(bv, w, 'A')[0]!.text}; tube B: ${limeParts(bv, w, 'B')[0]!.text}.`);
    const mp = mirrorParts(bv, w);
    const mo = mp.length >= 2 ? observationCredit(w.mirrorObs, mp).credit : 0;
    m += mo;
    if (mo < 1) notes.push(mp.length ? `The mirror: ${mp.map((p) => p.text).join('; ')}.` : 'Breathe on a mirror and test it with cobalt chloride paper.');
    const c = claimMarks(w.claims, BREATH_NEED, BREATH_WRONG, 2, 0.5);
    m += c.m;
    if (c.got.length < BREATH_NEED.length) notes.push('Conclude: exhaled air has more carbon dioxide and water vapour, is warmer, and still has oxygen.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${BREATH_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
    void tA;
  }

  const model = breathModelState(v).breath;
  const solution = [
    `Lime water B (exhaled air) turned milky after about ${Math.round(bv.kB)} breaths; lime water A (inhaled air) needs about ${Math.round(bv.kA)} — it stays clear over 10 breaths. Carbon dioxide forms insoluble calcium carbonate.`,
    'Breath on a dry mirror mists it; cobalt chloride paper turns from blue to pink: water vapour.',
    `Room ${model.roomT} °C; breath on the bulb ${model.breathT} °C; rise ${model.rise} °C.`,
    `Breathing counts ${model.rows.join(', ')} → mean ${model.meanRate} breaths/min; ventilation = ${model.meanRate} × ${BREATH_TIDAL} = ${model.vent} cm³/min.`,
    `CO₂: ${CO2_IN} % in, about ${CO2_OUT} % out — ${CO2_OUT / CO2_IN} times as much, from tissue respiration. Exhaled air still has about 16 % oxygen.`,
  ];
  const facts = [`Mouthpiece ${w.mouthpiece ? 'clean' : 'not fitted'}, lime ${w.lime ?? '—'}, ${total} breaths${hard ? ' (some hard)' : ''}; mirror wiped first ${w.wipedFirst ? 'yes' : 'no'}; room read ${w.troom ?? '—'}.`, `First milky said ${w.firstMilky ?? '—'}.`];
  return { auto, ai: aiItems('BREATH', s), solution, facts };
}

// ------------------------------------------------------------------ REACTION

function gradeReact(s: BioHumanState, v: BioHumanVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.react;
  const seen = reactSeen(v.react, w, v.seed);
  const rowOf = (c: ReactCond) => w.rows[REACT_CONDS.indexOf(c)] ?? { ds: [], mean: '', m: '', t: '' };
  const used = REACT_CONDS.filter((c) => seen[c].length);
  const fair = (c: ReactCond) => w.drops.filter((d) => d.cond === c && !d.warn).length;

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    if (w.knee === 'HAND') m += 1;
    else if (w.knee === 'HARD') notes.push('Tap just below the kneecap gently with the side of your hand, never a hard object.');
    else notes.push('Demonstrate the knee-jerk: tap just below the kneecap of the crossed leg.');
    if (w.arm) m += 0.5;
    else if (w.drops.length) notes.push('The catcher rests the forearm on the bench edge so the hand cannot move down to meet the ruler.');
    if (w.zero) m += 0.5;
    else if (w.drops.length) notes.push('Line the top of the thumb up with the 0 cm mark before each drop: keep the starting position constant.');
    if (fair('DOM') >= REACT_MIN_DOM) m += 0.5;
    else notes.push(`Drop the ruler ${REACT_MIN_DOM} times for the dominant hand.`);
    if (w.drops.length && !w.drops.some((d) => d.warn)) m += 0.5;
    else if (w.drops.some((d) => d.warn)) notes.push('Release the ruler without warning: when you signal, the catcher anticipates the drop.');
    if (fair('NONDOM') >= REACT_MIN_OTHER) m += 1;
    else notes.push(`Repeat at least ${REACT_MIN_OTHER} times with the non-dominant hand.`);
    if (!w.knee && !w.drops.length) notes.splice(0, notes.length, 'Nothing was tested.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let ok = 0;
    let n = 0;
    const bad: string[] = [];
    for (const c of used) {
      const shown = seen[c].slice(0, REACT_MAX_PER);
      n += shown.length;
      shown.forEach((d, k) => {
        const raw = rowOf(c).ds[k] ?? '';
        if (withinAbs(num(raw), d, 0.26)) ok++;
        else if (raw.trim()) bad.push(REACT_COND_SHORT[c]);
      });
    }
    if (bad.length) notes.push(`Distances not as the rule showed them (top of the thumb, to 0.5 cm): ${list([...new Set(bad)])}.`);
    if (ok < n && !bad.length) notes.push('Record every distance.');
    if (n < REACT_MIN_DOM + REACT_MIN_OTHER) notes.push(`Readings are marked out of at least ${REACT_MIN_DOM + REACT_MIN_OTHER} drops.`);
    auto.push(score(crit('readings'), half((4 * ok) / Math.max(REACT_MIN_DOM + REACT_MIN_OTHER, n)), notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let meanOk = 0;
    let tOk = 0;
    for (const c of used) {
      const r = rowOf(c);
      const ds = r.ds.map(num).filter((x): x is number => x !== null);
      const mn = num(r.mean);
      if (ds.length && close(mn, mean(ds), 0.06, 0.003)) meanOk++;
      const mm = num(r.m);
      if (mn !== null && close(mm, mn / 100, 0.0006, 0.005) && close(num(r.t), reactTime(mn), 0.0015, 0.02)) tOk++;
    }
    const d = Math.max(2, used.length);
    if (meanOk < used.length) notes.push('Mean distance = the sum of the distances ÷ the number of drops.');
    if (tOk < used.length) notes.push('Convert the mean distance to metres (÷ 100), then t = √(2d ÷ g) with g = 9.8 m/s².');
    auto.push(score(crit('presentation'), half(meanOk / d) + half((2 * tOk) / d), notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const kp = kneeParts(w);
    const ko = kp.length ? observationCredit(w.kneeObs, kp).credit : 0;
    m += ko;
    if (ko < 1) notes.push(kp.length ? `The knee-jerk: ${kp.map((p) => p.text).join(', ')}.` : 'Demonstrate the knee-jerk and describe what happens.');
    const tOf = (c: ReactCond) => num(rowOf(c).t);
    const td = tOf('DOM');
    const tn = tOf('NONDOM');
    if (td !== null && tn !== null && seen.DOM.length && seen.NONDOM.length) {
      const want = Math.abs(td - tn) < 0.003 ? ['SAME', td < tn ? 'DOM' : 'NONDOM'] : [td < tn ? 'DOM' : 'NONDOM'];
      if (w.faster && want.includes(w.faster)) m += 1;
      else notes.push(`On your own times the ${want[0] === 'DOM' ? 'dominant' : want[0] === 'NONDOM' ? 'non-dominant' : 'two'} hand${want[0] === 'SAME' ? 's were about the same' : ' was faster'}.`);
    } else notes.push('Compare the reaction times of your two hands.');
    const own = rowOf('DOM').ds.map(num).filter((x): x is number => x !== null);
    const trend = reactTrendOf(own);
    if (trend && w.trend === trend) m += 1;
    else if (trend) notes.push(`On your own dominant-hand distances (first three against last three) the catch distance got ${trend === 'SAME' ? 'neither shorter nor longer' : trend.toLowerCase()} with practice.`);
    else notes.push('Compare your first and last dominant-hand catches to see the effect of practice.');
    const c = claimMarks(w.claims, REACT_NEED, REACT_WRONG, 2, 1);
    m += c.m;
    if (c.got.length < REACT_NEED.length) notes.push('Catching is voluntary (the brain); the knee-jerk is a spinal reflex.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${REACT_CLAIM_LABEL[x]}”`))}.`);
    if (seen.EYES.length && w.eyes) {
      const te = tOf('EYES');
      if (te !== null && td !== null && w.eyes !== (Math.abs(te - td) < 0.003 ? 'SAME' : te > td ? 'SLOWER' : 'FASTER')) notes.push('Check the eyes-closed comparison against your own times.');
    }
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = reactModelState(v).react;
  const solution = [
    'Knee-jerk: tapping just below the kneecap stretches the tendon; the lower leg kicks forward at once — a spinal reflex (receptor → sensory → relay → motor neurone → thigh muscle).',
    ...REACT_CONDS.map((c) => {
      const r = model.rows[REACT_CONDS.indexOf(c)]!;
      return `${REACT_COND_SHORT[c]}: ${r.ds.join(', ')} cm → mean ${r.mean} cm = ${r.m} m → t = √(2 × ${r.m} ÷ 9.8) = ${r.t} s.`;
    }),
    `This partner’s dominant hand reacts in about ${roundDp(v.react.tDom, 2)} s at first, ${roundDp(v.react.tDom * (1 - v.react.practice), 2)} s with practice; the other hand is about ${roundDp(v.react.nondomExtra, 2)} s slower.`,
    'Catching is voluntary: eye → sensory neurone → brain → motor neurone → finger muscles. It takes longer than a reflex.',
  ];
  const facts = [`Knee ${w.knee ?? '—'}; arm ${w.arm ? 'on bench' : 'free'}, zero ${w.zero ? 'yes' : 'no'}; drops ${used.map((c) => `${REACT_COND_SHORT[c]} ×${seen[c].length}`).join(', ')}${w.drops.some((d) => d.warn) ? ' (some signalled)' : ''}.`, `Faster ${w.faster ?? '—'}, trend ${w.trend ?? '—'}.`];
  return { auto, ai: aiItems('REACTION', s), solution, facts };
}

// ------------------------------------------------------------------ SKIN

function gradeSkin(s: BioHumanState, v: BioHumanVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const w = s.skin;
  const seen = skinSeen(v.skin, w, v.seed);
  const tested = SKIN_AREAS.filter((a) => seen[a].n > 0);
  const rowOf = (a: SkinArea) => w.rows[SKIN_AREAS.indexOf(a)] ?? { thr: '', n: '', ok: '', pct: '' };

  // ---- procedure (4)
  {
    const notes: string[] = [];
    let m = 0;
    const peek = w.trials.some((t) => !t.blind);
    const stag = w.trials.some((t) => t.stag);
    if (w.trials.length && !peek && !stag) m += 1;
    else if (peek) notes.push('Blindfold the subject before touching: if they can see the points they are not reporting what they feel.');
    else if (stag) notes.push('Press both points at the same moment with the same pressure: one point after the other is felt as two.');
    const noSingle = tested.filter((a) => seen[a].singles < 1);
    if (tested.length && !noSingle.length) m += 1;
    else if (tested.length) notes.push(`Include random single-point touches on every area as checks (missing: ${list(noSingle.map((a) => SKIN_AREA_LABEL[a].toLowerCase()))}).`);
    if (tested.length >= 5) m += 1;
    else if (tested.length >= 4) {
      m += 0.5;
      notes.push('Test all five areas: fingertip, palm, back of the hand, forearm and back of the neck.');
    } else notes.push('Test the fingertip, palm, back of the hand, forearm and back of the neck.');
    const bracketed = tested.filter((a) => {
      const e = seen[a];
      if (e.thr === null) return false;
      if (e.thr <= 1) return true; // nothing smaller to try
      const below = e.seps.filter((x) => x.sep < e.thr! && x.two * 2 < x.all).map((x) => x.sep);
      return below.length > 0 && e.thr - Math.max(...below) <= skinStep(e.thr) + 1e-9;
    });
    m += half(bracketed.length / Math.max(5, tested.length));
    if (bracketed.length < tested.length) notes.push('Narrow each threshold down: reduce the separation in small steps (1 mm on the fingertip) until only one point is felt.');
    if (!w.trials.length) notes.splice(0, notes.length, 'No touches were made.');
    auto.push(score(crit('procedure'), half(m), notes));
  }

  // ---- readings (4)
  {
    const notes: string[] = [];
    let thrOk = 0;
    let cntOk = 0;
    const bad: string[] = [];
    for (const a of tested) {
      const e = seen[a];
      const r = rowOf(a);
      if (e.thr !== null && withinAbs(num(r.thr), e.thr, skinTol(e.thr))) thrOk++;
      else if (r.thr.trim()) bad.push(SKIN_AREA_LABEL[a].toLowerCase());
      if (num(r.n) === e.n && num(r.ok) === e.ok) cntOk++;
    }
    const d = Math.max(5, tested.length);
    if (bad.length) notes.push(`Thresholds that do not follow from your own trials: ${list(bad)} (the smallest separation from which every larger one was felt as two).`);
    if (thrOk < tested.length && !bad.length) notes.push('Record the smallest separation felt as two for each area.');
    if (cntOk < tested.length) notes.push('Count every touch on each area (single and double) and how many the subject got right.');
    auto.push(score(crit('readings'), half((2.5 * thrOk) / d + (1.5 * cntOk) / d), notes));
  }

  // ---- presentation (3)
  {
    const notes: string[] = [];
    let m = 0;
    const pctOk = tested.filter((a) => {
      const r = rowOf(a);
      const n = num(r.n);
      const ok = num(r.ok);
      return n && ok !== null && close(num(r.pct), (ok / n) * 100, 0.06, 0.005);
    }).length;
    m += half(pctOk / Math.max(4, tested.length));
    if (pctOk < tested.length) notes.push('% correct = correct answers ÷ touches × 100.');
    const own = (a: SkinArea) => num(rowOf(a).thr);
    const plotted = w.bars.filter((a) => own(a) !== null);
    if (plotted.length >= 4) m += 1;
    else notes.push('Draw a bar chart of the threshold of each area.');
    const withThr = SKIN_AREAS.filter((a) => own(a) !== null);
    const okRank = withThr.length >= 4 && w.rank.length === withThr.length && w.rank.every((a, i) => i === 0 || own(a)! >= own(w.rank[i - 1]!)! - 1e-9);
    if (okRank) m += 1;
    else notes.push('Rank the areas from the most sensitive (smallest threshold) to the least, from your own table.');
    auto.push(score(crit('presentation'), m, notes));
  }

  // ---- results (5)
  {
    const notes: string[] = [];
    let m = 0;
    const ft = num(rowOf('FINGERTIP').thr);
    const fa = num(rowOf('FOREARM').thr);
    if (ft && fa !== null && close(num(w.ratio), fa / ft, 0.06, 0.02)) m += 1;
    else notes.push('Forearm threshold ÷ fingertip threshold: how many times more sensitive the fingertip is, from your own values.');
    const withThr = SKIN_AREAS.filter((a) => num(rowOf(a).thr) !== null);
    const best = withThr.length ? Math.min(...withThr.map((a) => num(rowOf(a).thr)!)) : null;
    if (w.most && best !== null && num(rowOf(w.most).thr) === best) m += 1;
    else notes.push('Name the most sensitive area (the smallest threshold).');
    const c = claimMarks(w.claims, SKIN_NEED, SKIN_WRONG, 3, 1);
    m += c.m;
    if (c.got.length < SKIN_NEED.length) notes.push('Conclude about receptor density, that the forearm still has receptors, and what the single-point touches are for.');
    if (c.bad.length) notes.push(`Not true: ${list(c.bad.map((x) => `“${SKIN_CLAIM_LABEL[x]}”`))}.`);
    auto.push(score(crit('results'), Math.min(5, m), notes));
  }

  const model = skinModelState(v).skin;
  const solution = [
    `This subject’s thresholds: ${SKIN_AREAS.map((a) => `${SKIN_AREA_LABEL[a].toLowerCase()} about ${roundDp(v.skin.thr[a], 0)} mm`).join(', ')}.`,
    `A careful descending series gives ${SKIN_AREAS.map((a) => `${SKIN_AREA_LABEL[a].toLowerCase()} ${model.rows[SKIN_AREAS.indexOf(a)]!.thr} mm`).join(', ')}; forearm ÷ fingertip = ${model.ratio}.`,
    'Smaller separation = touch receptors closer together (more per unit area). The forearm has receptors too, just far apart.',
    `Single-point touches check for guessing: this subject says “two” to a single point about ${Math.round(v.skin.guess * 100)} % of the time.`,
  ];
  const facts = [`${w.trials.length} touches over ${tested.length} areas; blindfold ${w.trials.every((t) => t.blind) ? 'always' : 'not always'}; singles ${tested.map((a) => seen[a].singles).join('/')}.`, `Thresholds said ${SKIN_AREAS.map((a) => rowOf(a).thr || '—').join('/')}.`];
  return { auto, ai: aiItems('SKIN', s), solution, facts };
}

/**
 * Marks the human physiology lab the way a WAEC biology scheme does. PULSE:
 * screening, rest, fingertips, the counts as counted, ×4, the graph, the
 * % increase and recovery from the student's own readings. BREATH: mouthpiece,
 * equal lime water, gentle breaths, the dry mirror and cobalt chloride, the
 * temperatures and breathing counts, ventilation and the conclusions.
 * REACTION: the knee-jerk, the starting position, unsignalled drops, the
 * distances as read, t = √(2d/g), and reflex against voluntary. SKIN: the
 * blindfold, single-point controls, the thresholds and counts from the
 * student's own trials, ranking, the ratio and receptor density.
 * Precautions and the explanation go to AI.
 */
export const bioHumanGrader: SimulatorGrader<'bio-human'> = {
  id: 'bio-human',
  grade(state: BioHumanState, seed: number): GraderOutput {
    const task = state.task ?? 'PULSE';
    const v = bioHumanVariant(seed, task);
    return task === 'BREATH' ? gradeBreath(state, v) : task === 'REACTION' ? gradeReact(state, v) : task === 'SKIN' ? gradeSkin(state, v) : gradePulse(state, v);
  },
};
