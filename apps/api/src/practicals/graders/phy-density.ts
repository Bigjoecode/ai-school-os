import {
  PHY_DENSITY,
  ballVolume,
  bottleMass,
  bottleTrueRD,
  calIndicated,
  calTrueMean,
  floatLine,
  floatReading,
  phyDensityVariant,
  sbReading,
  stoneRD,
  stoneWeight,
  densityUpthrust,
  type BottleSnap,
  type CalReading,
  type CriterionScore,
  type PhyAnswer,
  type PhyDensityState,
  type PhyDensityVariant,
  type SbRead,
} from '@aischool/shared';
import { decimalPlaces, parseNumber, score, sf, withinAbs, withinRel } from './helpers';
import { gradeGraph, phyUnit, slopeAccepted, type XY } from './phy-common';
import type { AiItem, GraderOutput, SimulatorGrader } from './types';

/** Reading tolerances: vernier (cm), micrometer (mm), spring balance (N), beam balance (g), depth (cm). */
const TOL = { V: 0.011, M: 0.011, N: 0.05, g: 0.05, h: 0.15 };
const BALANCED = 0.15;
const crit = (id: string) => PHY_DENSITY.rubric.find((c) => c.id === id)!;
const num = (raw: string | undefined) => parseNumber(raw);
const cell = (s: PhyDensityState, id: string) => s.cells[id] ?? '';
const filled = (raw: string | undefined) => !!raw && raw.trim().length > 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The units this lab's answers use (cm³, mm³, g cm⁻³, kg m⁻³, cm g⁻¹ …), then the physics table. */
export function densityUnit(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .replace(/[³]/g, '3')
    .replace(/[²]/g, '2')
    .replace(/[⁻−–—]/g, '-')
    .replace(/[¹]/g, '1')
    .toLowerCase()
    .replace(/\^/g, '')
    .replace(/[\s·.*×]/g, '')
    .replace(/[()]/g, '');
  const table: [RegExp, string][] = [
    [/^(cm3|cc|ml|cubiccm)$/, 'cm3'],
    [/^mm3$/, 'mm3'],
    [/^m3$/, 'm3'],
    [/^mm$/, 'mm'],
    [/^(g\/cm3|gcm-3|gpercm3|g\/ml|gml-1|g\/cc)$/, 'g/cm3'],
    [/^(kg\/m3|kgm-3|kgperm3)$/, 'kg/m3'],
    [/^(cm\/g|cmg-1|cmperg)$/, 'cm/g'],
    [/^(m\/kg|mkg-1)$/, 'm/kg'],
    [/^(°c|oc|degc|c|degreescelsius|celsius)$/, 'C'],
  ];
  for (const [re, u] of table) if (re.test(s)) return u;
  return phyUnit(raw);
}
/** A length answer → cm (written in cm or mm; a bare number is taken in `dflt`). */
const toCm = (a: PhyAnswer, dflt: 'cm' | 'mm') => {
  const x = num(a.value);
  if (x === null) return null;
  const u = densityUnit(a.unit);
  return (u === 'mm' || (u === '' && dflt === 'mm') ? x / 10 : u === 'm' ? x * 100 : x) as number;
};
/** A density answer → g cm⁻³ (kg m⁻³ by unit, or by size when the unit is missing). */
const toGcm3 = (a: PhyAnswer) => {
  const x = num(a.value);
  if (x === null) return null;
  const u = densityUnit(a.unit);
  return u === 'kg/m3' || (u !== 'g/cm3' && x > 50) ? x / 1000 : x;
};
const noUnit = (a: PhyAnswer) => ['', 'none'].includes(densityUnit(a.unit));
const gOk = (w: number | null, kg: number) => w !== null && [9.8, 9.81, 10].some((g) => withinAbs(w, kg * g, 0.011 + 0.002 * kg * g));

export const phyDensityGrader: SimulatorGrader<'phy-density'> = {
  id: 'phy-density',
  grade(state: PhyDensityState, seed: number): GraderOutput {
    const v = phyDensityVariant(seed);
    switch (state.task) {
      case 'ARCH':
        return gradeArch(state, v);
      case 'FLOAT':
        return gradeFloat(state, v);
      case 'BOTTLE':
        return gradeBottle(state, v);
      default:
        return gradeCal(state, v);
    }
  },
};

const ind = (v: PhyDensityVariant, r: CalReading) => calIndicated(v, r.tool, r.obj, r.pos, r.forced, r.inside);
/** The readings a written value matches (within tol). */
const matching = (x: number | null, vals: number[], tol: number) => x !== null && vals.some((y) => withinAbs(x, y, tol));

// ------------------------------------------------------------------ CAL

function gradeCal(s: PhyDensityState, v: PhyDensityVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const vZero = s.cal.filter((r) => r.tool === 'V' && !r.obj);
  const mZero = s.cal.filter((r) => r.tool === 'M' && !r.obj);
  const vCyl = s.cal.filter((r) => r.tool === 'V' && r.obj === 'cyl' && !r.inside);
  const mBall = s.cal.filter((r) => r.tool === 'M' && r.obj === 'ball');
  const C = ['c1', 'c2', 'c3'].map((id) => num(cell(s, id)));
  const B = ['b1', 'b2', 'b3'].map((id) => num(cell(s, id)));
  const zv = num(cell(s, 'zv'));
  const zm = num(cell(s, 'zm'));

  // care (2)
  {
    const n: string[] = [];
    let k = 0;
    const mObj = s.cal.filter((r) => r.tool === 'M' && r.obj);
    if (mObj.length && !mObj.some((r) => r.forced)) k++;
    else n.push(mObj.length ? `${plural(mObj.filter((r) => r.forced).length, 'micrometer reading was', 'micrometer readings were')} taken after screwing the thimble hard: close the micrometer with the ratchet until it clicks, so the object is not squeezed and the screw is not strained.` : 'No micrometer readings were taken.');
    if (s.cal.length && s.cal.every((r) => r.eyeOk)) k++;
    else n.push(s.cal.length ? 'Some scales were read with your eye to one side: look square on to the vernier and the thimble, or the line you choose shifts (parallax).' : 'No readings were taken.');
    auto.push(score(crit('care'), k, n));
  }
  // procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (vZero.length) k++;
    else n.push('Close the vernier’s jaws on nothing first and read its zero error.');
    const cp = new Set(vCyl.map((r) => r.pos)).size;
    if (cp >= 3) k++;
    else n.push(`Measure the cylinder’s diameter at three or more places (turn it or move along it); you used ${cp}.`);
    if (mZero.length) k++;
    else n.push('Close the micrometer on nothing (with the ratchet) and read its zero error before measuring.');
    const bp = new Set(mBall.map((r) => r.pos)).size;
    if (bp >= 3) k++;
    else n.push(`Measure the ball bearing in three or more orientations; you used ${bp}.`);
    auto.push(score(crit('procedure'), k, n));
  }
  const vVals = vCyl.map((r) => ind(v, r));
  const mVals = mBall.map((r) => ind(v, r));
  // readings (5)
  {
    const n: string[] = [];
    let k = 0;
    if (C.every((x) => matching(x, vVals, TOL.V))) k++;
    else n.push('Your three vernier readings of the cylinder should match the scale (main scale + the coinciding vernier division × 0.01 cm).');
    if (B.every((x) => matching(x, mVals, TOL.M))) k++;
    else n.push('Your micrometer readings should match the instrument: sleeve (whole and half millimetres) + thimble division × 0.01 mm. Don’t forget the half-millimetre mark.');
    // different places: each written value matches a reading at a different place
    const distinct = (xs: (number | null)[], rs: CalReading[], tol: number) => {
      const used = new Set<number>();
      return xs.every((x) => {
        const r = rs.find((q) => !used.has(q.pos) && x !== null && withinAbs(x, ind(v, q), tol));
        if (r) used.add(r.pos);
        return !!r;
      });
    };
    if (distinct(C, vCyl, TOL.V) && distinct(B, mBall, TOL.M)) k++;
    else n.push('Each of the three readings should come from a different place (cylinder) or orientation (ball bearing).');
    const cells = ['zv', 'c1', 'c2', 'c3', 'zm', 'b1', 'b2', 'b3'].map((id) => cell(s, id)).filter(filled);
    if (cells.length === 8 && cells.every((c) => decimalPlaces(c) === 2)) k++;
    else n.push('Record every reading to 2 decimal places: the vernier to 0.01 cm (e.g. 2.37 cm), the micrometer to 0.01 mm (e.g. 5.78 mm).');
    if (matching(zv, vZero.map((r) => ind(v, r)), TOL.V) && matching(zm, mZero.map((r) => ind(v, r)), TOL.M)) k++;
    else n.push(`Record each zero error with its sign: + if the instrument reads above zero when closed, − if below (vernier ${v.zv >= 0 ? '+' : ''}${v.zv.toFixed(2)} cm, micrometer ${v.zm >= 0 ? '+' : ''}${v.zm.toFixed(2)} mm).`);
    auto.push(score(crit('readings'), k, n));
  }
  const cm = num(cell(s, 'cm'));
  const bm = num(cell(s, 'bm'));
  const dcyl = toCm(s.answers.dcyl, 'cm');
  const dballCm = toCm(s.answers.dball, 'mm');
  const dball = dballCm === null ? null : dballCm * 10;
  const avg = (xs: (number | null)[]) => (xs.every((x) => x !== null) ? (xs as number[]).reduce((t, x) => t + x, 0) / xs.length : null);
  // analysis (2)
  {
    const n: string[] = [];
    let k = 0;
    const mc = avg(C);
    const mb = avg(B);
    if (mc !== null && mb !== null && withinAbs(cm, mc, 0.006) && withinAbs(bm, mb, 0.006)) k++;
    else n.push('Work out the mean of each set of three readings.');
    if (cm !== null && bm !== null && zv !== null && zm !== null && withinAbs(dcyl, cm - zv, 0.006) && withinAbs(dball, bm - zm, 0.006)) k++;
    else n.push('Corrected reading = mean − zero error (subtract a positive zero error, add a negative one).');
    auto.push(score(crit('analysis'), k, n));
  }
  const cylTrue = vCyl.length ? calTrueMean(v, 'V', 'cyl', [...new Set(vCyl.map((r) => r.pos))]) : calTrueMean(v, 'V', 'cyl', [0, 1, 2, 3, 4, 5]);
  const ballTrue = mBall.length ? calTrueMean(v, 'M', 'ball', [...new Set(mBall.map((r) => r.pos))]) : calTrueMean(v, 'M', 'ball', [0, 1, 2, 3, 4, 5]);
  const Vtrue = ballVolume(ballTrue);
  const volU = densityUnit(s.answers.vol.unit);
  const volRaw = num(s.answers.vol.value);
  const vol = volRaw === null ? null : volU === 'mm3' || (volU === '' && volRaw > 20) ? volRaw / 1000 : volRaw;
  // calculations (4)
  {
    const n: string[] = [];
    let k = 0;
    if (withinAbs(dcyl, cylTrue, 0.02)) k++;
    else n.push(`The cylinder’s corrected diameter should be about ${cylTrue.toFixed(2)} cm.`);
    if (withinAbs(dball, ballTrue, 0.01)) k++;
    else n.push(`The ball bearing’s corrected diameter should be about ${ballTrue.toFixed(2)} mm.`);
    if (dball !== null && withinRel(vol, ballVolume(dball), 0.01)) k++;
    else n.push('V = (4/3)πr³ with r = d/2 from your corrected diameter (5.76 mm → r = 0.288 cm → V = 0.100 cm³).');
    if (withinRel(vol, Vtrue, 0.02)) k++;
    else n.push(`The ball bearing’s volume is about ${sf(Vtrue, 3)} cm³.`);
    auto.push(score(crit('calculations'), k, n));
  }
  // units (1)
  {
    const ok = ['cm', 'mm'].includes(densityUnit(s.answers.dcyl.unit)) && ['cm', 'mm'].includes(densityUnit(s.answers.dball.unit)) && ['cm3', 'mm3'].includes(volU);
    auto.push(score(crit('units'), ok ? 1 : 0, ok ? [] : ['Give every answer its unit: diameters in cm or mm, the volume in cm³ (or mm³).']));
  }
  const solution = [
    `Zero errors: vernier ${v.zv >= 0 ? '+' : ''}${v.zv.toFixed(2)} cm; micrometer ${v.zm >= 0 ? '+' : ''}${v.zm.toFixed(2)} mm.`,
    `Cylinder: readings ${v.cyl.slice(0, 3).map((d) => (d + v.zv).toFixed(2)).join(', ')} cm → corrected diameter ≈ ${cylTrue.toFixed(2)} cm.`,
    `Ball bearing: readings ${v.ball.slice(0, 3).map((d) => (d + v.zm).toFixed(2)).join(', ')} mm → corrected d ≈ ${ballTrue.toFixed(2)} mm; r = ${(ballTrue / 20).toFixed(3)} cm; V = (4/3)πr³ = ${sf(Vtrue, 3)} cm³.`,
  ];
  const facts = [`Task: vernier and micrometer; ${s.cal.length} readings (${s.cal.filter((r) => r.forced).length} forced, ${s.cal.filter((r) => !r.eyeOk).length} with parallax).`, `Student: d(cyl) ${s.answers.dcyl.value || '—'} ${s.answers.dcyl.unit}; d(ball) ${s.answers.dball.value || '—'} ${s.answers.dball.unit}; V ${s.answers.vol.value || '—'} ${s.answers.vol.unit}.`];
  return { auto, ai: precautions(s, 'measuring with the vernier calipers and the micrometer screw gauge'), solution, facts };
}

// ------------------------------------------------------------------ ARCH

const sbInd = (v: PhyDensityVariant, r: SbRead) => sbReading(v, r);
function gradeArch(s: PhyDensityState, v: PhyDensityVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const air = s.sb.filter((r) => r.where === 'air');
  const water = s.sb.filter((r) => r.where === 'water' && r.depth !== 'part');
  const salt = s.sb.filter((r) => r.where === 'salt' && r.depth !== 'part');
  const immersed = s.sb.filter((r) => r.where !== 'air');
  const W = ['w1', 'w2', 'w3'].map((id) => num(cell(s, id)));
  const beakers = s.weighs.filter((w) => w.item === 'beaker');
  // care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (immersed.length && immersed.every((r) => r.depth !== 'touch' && !r.bubbles)) k++;
    else if (!immersed.length) n.push('The stone was never weighed in a liquid.');
    else {
      if (immersed.some((r) => r.depth === 'touch')) n.push('The stone rested on (or touched) the can: then the can holds up part of its weight and the balance reads too little. Hang it fully immersed and free.');
      if (immersed.some((r) => r.bubbles)) n.push('Air bubbles clung to the stone when you read the balance: they add upthrust. Shake or tap the stone gently to free them first.');
    }
    if (s.sb.length && s.sb.every((r) => r.eyeOk) && !salt.some((r) => r.wet)) k++;
    else if (salt.some((r) => r.wet)) n.push('Dry the stone with tissue before putting it in the salt solution: water carried on it dilutes the solution.');
    else n.push('Read the spring balance with your eye level with the pointer (no parallax).');
    auto.push(score(crit('care'), k, n));
  }
  // procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (s.sb.length && s.sb.every((r) => r.zeroed)) k++;
    else n.push(`Check the spring balance’s zero with nothing hanging and adjust it before weighing (this one read ${v.sbZero > 0 ? '+' : ''}${v.sbZero.toFixed(2)} N with nothing on).`);
    if (air.length && water.length && salt.length) k++;
    else n.push('Take all three weighings: W₁ in air, W₂ fully immersed in water, W₃ fully immersed in the salt solution.');
    const caught = Math.max(0, ...beakers.map((b) => b.water));
    if (beakers.length && Math.abs(caught - v.stoneV) <= 1.5) k++;
    else if (beakers.length && caught < v.stoneV - 1.5) n.push(`Only ${caught.toFixed(0)} cm³ of the ${v.stoneV.toFixed(0)} cm³ displaced reached your beaker: fill the eureka can until water runs from the spout and wait for it to stop dripping before you lower the stone (and lower it fully).`);
    else if (beakers.length) n.push('Your beaker caught more than the displaced water: put it under the spout only after the can has stopped dripping.');
    else n.push('Catch the displaced water from the eureka can’s spout in a beaker and weigh it.');
    if (beakers.some((b) => b.water === 0) && beakers.some((b) => b.water > 0)) k++;
    else n.push('Weigh the catch beaker empty (and dry) first, then with the displaced water.');
    auto.push(score(crit('procedure'), k, n));
  }
  // readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const ok = [matching(W[0]!, air.map((r) => sbInd(v, r)), TOL.N), matching(W[1]!, water.map((r) => sbInd(v, r)), TOL.N), matching(W[2]!, salt.map((r) => sbInd(v, r)), TOL.N)];
    const good = ok.filter(Boolean).length;
    k += good === 3 ? 2 : good === 2 ? 1 : 0;
    if (good < 3) n.push(`${plural(3 - good, 'weight does', 'weights do')} not match the spring balance: read the pointer against the scale (0.1 N divisions) to the nearest 0.05 N.`);
    const mb = num(cell(s, 'mb'));
    const mbw = num(cell(s, 'mbw'));
    const emptyB = beakers.filter((b) => b.water === 0);
    const fullB = beakers.filter((b) => b.water > 0);
    if (matching(mb, emptyB.map((b) => b.riders), TOL.g) && matching(mbw, fullB.map((b) => b.riders), TOL.g)) k++;
    else n.push('Write the beaker’s masses exactly as the balance’s riders read (hundreds + tens + front beam, to 0.1 g).');
    const cells = ['w1', 'w2', 'w3', 'mb', 'mbw'].map((id) => cell(s, id)).filter(filled);
    if (cells.length === 5 && cells.every((c) => decimalPlaces(c) >= 1)) k++;
    else n.push('Weights to at least 0.1 N (better 0.05 N, two decimal places); masses to 0.1 g.');
    const balanced = beakers.length >= 2 && beakers.every((b) => Math.abs(b.riders - (v.beakerG + (b.water * v.rhoW) / 1000)) <= BALANCED);
    if (balanced) k++;
    else n.push('Slide the riders until the pointer rests on zero before you record a weighing.');
    auto.push(score(crit('readings'), k, n));
  }
  const up = num(s.answers.up.value);
  const wdisp = num(s.answers.wdisp.value);
  const [w1, w2, w3] = W;
  // analysis (2)
  {
    const n: string[] = [];
    let k = 0;
    if (w1 !== null && w2 !== null && withinAbs(up, w1 - w2, 0.011)) k++;
    else n.push('Upthrust = W₁ − W₂ from your readings.');
    const mb = num(cell(s, 'mb'));
    const mbw = num(cell(s, 'mbw'));
    if (mb !== null && mbw !== null && up !== null && gOk(wdisp, (mbw - mb) / 1000) && withinAbs(wdisp, up, Math.max(0.05, 0.03 * up))) k++;
    else if (mb !== null && mbw !== null && gOk(wdisp, (mbw - mb) / 1000)) n.push('The weight of water displaced should equal the upthrust (Archimedes’ principle). If they differ, check that the stone hung free, the can was filled to the spout and no bubbles clung to it.');
    else n.push('Weight of water displaced = (m₂ − m₁) in kg × g (g = 9.8 or 10 m s⁻²).');
    auto.push(score(crit('analysis'), k, n));
  }
  const rds = num(s.answers.rds.value);
  const rdl = num(s.answers.rdl.value);
  // calculations (4)
  {
    const n: string[] = [];
    let k = 0;
    if (w1 !== null && w2 !== null && w1 > w2 && withinRel(rds, w1 / (w1 - w2), 0.01)) k++;
    else n.push('RD of the stone = W₁ ÷ (W₁ − W₂): its weight divided by its loss in weight in water (not by W₂).');
    if (withinRel(rds, stoneRD(v), 0.04)) k++;
    else n.push(`The stone’s relative density is about ${stoneRD(v).toFixed(2)}.`);
    if (w1 !== null && w2 !== null && w3 !== null && w1 > w2 && withinRel(rdl, (w1 - w3) / (w1 - w2), 0.01)) k++;
    else n.push('RD of the liquid = (W₁ − W₃) ÷ (W₁ − W₂): loss in the liquid ÷ loss in water.');
    if (withinRel(rdl, v.saltRD, 0.04)) k++;
    else n.push(`The salt solution’s relative density is about ${v.saltRD.toFixed(2)}.`);
    auto.push(score(crit('calculations'), k, n));
  }
  // units (1)
  {
    const ok = densityUnit(s.answers.up.unit) === 'N' && densityUnit(s.answers.wdisp.unit) === 'N' && filled(s.answers.rds.value) && noUnit(s.answers.rds) && noUnit(s.answers.rdl);
    auto.push(score(crit('units'), ok ? 1 : 0, ok ? [] : ['Upthrust and weight in N; relative density is a ratio of weights and has no unit.']));
  }
  const W1 = stoneWeight(v);
  const solution = [
    `W₁ = ${W1.toFixed(2)} N; W₂ = ${(W1 - densityUpthrust(v, 'water')).toFixed(2)} N; W₃ = ${(W1 - densityUpthrust(v, 'salt')).toFixed(2)} N (room ${v.tempC} °C, water ${v.rhoW.toFixed(1)} kg m⁻³).`,
    `Upthrust in water = ${densityUpthrust(v, 'water').toFixed(2)} N = weight of ${v.stoneV.toFixed(0)} cm³ of water displaced.`,
    `RD of the stone = ${W1.toFixed(2)} ÷ ${densityUpthrust(v, 'water').toFixed(2)} = ${stoneRD(v).toFixed(2)}; RD of the salt solution = ${densityUpthrust(v, 'salt').toFixed(2)} ÷ ${densityUpthrust(v, 'water').toFixed(2)} = ${v.saltRD.toFixed(2)}.`,
  ];
  const facts = [`Task: Archimedes; ${s.sb.length} balance readings (${s.sb.filter((r) => r.bubbles).length} with bubbles, ${s.sb.filter((r) => r.depth === 'touch').length} touching, zeroed ${s.zeroed}); ${beakers.length} beaker weighings.`, `Student: W ${W.map((x) => x ?? '—').join(', ')} N; upthrust ${s.answers.up.value || '—'}; RD stone ${s.answers.rds.value || '—'}; RD liquid ${s.answers.rdl.value || '—'}.`];
  return { auto, ai: precautions(s, 'verifying Archimedes’ principle and finding relative densities with a spring balance'), solution, facts };
}

// ------------------------------------------------------------------ FLOAT

function gradeFloat(s: PhyDensityState, v: PhyDensityVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const ext = s.cal.filter((r) => r.tool === 'V' && r.obj === 'tube' && !r.inside);
  const tubes = s.weighs.filter((w) => w.item === 'tube');
  const sank = s.log.some((e) => e.a === 'float:sunk');
  const rows = s.rows.map((load, i) => ({ load, row: s.float[i], m: num(s.float[i]?.m), h: num(s.float[i]?.h), reads: s.depths.filter((d) => d.load === load) }));
  // care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (s.depths.length && s.depths.every((d) => !d.touching && d.load >= 1) && !sank) k++;
    else if (sank) n.push('The tube was overloaded and sank: add the lead shot in 10 g steps and stop well before the water reaches the top of the tube.');
    else if (s.depths.some((d) => d.touching)) n.push('Some depths were read with the tube touching the side of the cylinder, where friction holds it: free it so it floats in the middle before reading.');
    else n.push('Read the depth only when the tube floats upright (load it with some lead shot first).');
    if (s.depths.length && s.depths.every((d) => d.eyeOk)) k++;
    else n.push('Read h with your eye level with the flat water surface (the bottom of the meniscus), not from above or below.');
    auto.push(score(crit('care'), k, n));
  }
  const loads = [...new Set(rows.filter((r) => r.h !== null && r.reads.length).map((r) => r.load))];
  // procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (ext.length) k++;
    else n.push('Measure the tube’s external diameter with the vernier (outside jaws) to find A.');
    if (tubes.length) k++;
    else n.push('Weigh the empty tube (with its paper scale) on the balance.');
    if (loads.length >= 5) k++;
    else n.push(`Take at least five loads (you have ${loads.length}).`);
    if (loads.length && Math.min(...loads) <= 1 && Math.max(...loads) >= 5) k++;
    else n.push('Go from 10 g up to at least 50 g of lead shot in 10 g steps.');
    auto.push(score(crit('procedure'), k, n));
  }
  const D = num(cell(s, 'D'));
  const mt = num(cell(s, 'mt'));
  // readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const exts = ext.map((r) => ind(v, r));
    if (matching(D, [...exts, ...exts.map((x) => x - v.zv)], TOL.V)) k++;
    else n.push('Your diameter should match the vernier reading of the tube’s outside (corrected for the zero error).');
    if (matching(mt, tubes.map((t) => t.riders), TOL.g) && tubes.some((t) => Math.abs(t.riders - v.tubeM) <= BALANCED)) k++;
    else n.push('The empty tube’s mass: balance the beam (pointer on zero) and write what the riders read, to 0.1 g.');
    const withH = rows.filter((r) => r.h !== null);
    if (withH.length && withH.every((r) => r.reads.some((d) => withinAbs(r.h, floatReading(v, d.load, d.touching), TOL.h)))) k++;
    else n.push('Each depth should be read on the paper scale at the flat water surface (not the top of the meniscus that climbs the glass), to 0.1 cm.');
    const cells = rows.map((r) => r.row?.h ?? '').filter(filled);
    if (cells.length && cells.every((c) => decimalPlaces(c) === 1) && decimalPlaces(cell(s, 'D')) === 2) k++;
    else n.push('h to 0.1 cm (1 decimal place); the diameter to 0.01 cm.');
    if (rows.length && rows.every((r) => withinAbs(r.m, r.load * 10, 0.5))) k++;
    else n.push('m is the lead shot added: 10 g, 20 g, 30 g …');
    auto.push(score(crit('readings'), k, n));
  }
  // analysis (2): h (up) against m (along)
  const points: XY[] = rows.map((r) => ({ x: r.m, y: r.h })).filter((p): p is XY => p.x !== null && p.y !== null);
  const graph = gradeGraph(points, s.line, 'h against m');
  auto.push(score(crit('analysis'), graph.marks, graph.notes));
  const L = floatLine(v);
  const area = num(s.answers.area.value);
  const slope = num(s.answers.slope.value);
  const rho = toGcm3(s.answers.rho);
  const mtube = num(s.answers.mtube.value);
  // calculations (4)
  {
    const n: string[] = [];
    let k = 0;
    if (D !== null && withinRel(area, (Math.PI * v.tubeD ** 2) / 4, 0.015)) k++;
    else n.push(`A = πD²/4 with the external diameter, corrected for the zero error (D ≈ ${v.tubeD.toFixed(2)} cm, A ≈ ${((Math.PI * v.tubeD ** 2) / 4).toFixed(2)} cm²) — not the internal diameter.`);
    const sOk = slopeAccepted(slope, graph.fit?.slope ?? null, s.line, graph.lineOk);
    if (sOk && area !== null && slope !== null && withinRel(rho, 1 / (area * slope), 0.02)) k++;
    else n.push('Slope from your graph (cm g⁻¹), then ρ = 1/(A × slope) in g cm⁻³.');
    if (withinRel(rho, v.rhoW / 1000, 0.05)) k++;
    else n.push(`Water at ${v.tempC} °C has density ${(v.rhoW / 1000).toFixed(3)} g cm⁻³ (${v.rhoW.toFixed(0)} kg m⁻³).`);
    if (withinRel(mtube, v.tubeM, 0.1)) k++;
    else n.push(`The intercept on the h-axis × ρA gives the tube’s own mass (about ${v.tubeM.toFixed(1)} g).`);
    auto.push(score(crit('calculations'), k, n));
  }
  // units (1)
  {
    const ok = densityUnit(s.answers.area.unit) === 'cm2' && densityUnit(s.answers.slope.unit) === 'cm/g' && ['g/cm3', 'kg/m3'].includes(densityUnit(s.answers.rho.unit)) && densityUnit(s.answers.mtube.unit) === 'g';
    auto.push(score(crit('units'), ok ? 1 : 0, ok ? [] : ['A in cm², the slope in cm g⁻¹, ρ in g cm⁻³ (or kg m⁻³), the tube’s mass in g.']));
  }
  const solution = [
    `External diameter ${v.tubeD.toFixed(2)} cm (vernier zero error ${v.zv.toFixed(2)} cm): A = ${((Math.PI * v.tubeD ** 2) / 4).toFixed(2)} cm². Empty tube ${v.tubeM.toFixed(1)} g.`,
    `h against m: slope = 1/(ρA) = ${L.slope.toFixed(4)} cm g⁻¹, intercept = M/(ρA) = ${L.intercept.toFixed(2)} cm.`,
    `ρ = 1/(A × slope) = ${(v.rhoW / 1000).toFixed(3)} g cm⁻³ (water at ${v.tempC} °C); tube mass = ρA × intercept = ${v.tubeM.toFixed(1)} g.`,
  ];
  const facts = [`Task: flotation; ${s.depths.length} depths (${s.depths.filter((d) => d.touching).length} touching, ${s.depths.filter((d) => !d.eyeOk).length} parallax), sank ${sank}; rows ${rows.length}.`, `Student: A ${s.answers.area.value || '—'}; slope ${s.answers.slope.value || '—'}; rho ${s.answers.rho.value || '—'} ${s.answers.rho.unit}; tube ${s.answers.mtube.value || '—'} g.`];
  return { auto, ai: precautions(s, 'verifying the law of flotation with a loaded test tube'), solution, facts };
}

// ------------------------------------------------------------------ BOTTLE

const isEmpty = (b: BottleSnap) => b.sand === 0 && b.fill === 'none';
function gradeBottle(s: PhyDensityState, v: PhyDensityVariant): GraderOutput {
  const auto: CriterionScore[] = [];
  const grains = s.sample === 'grains';
  const bw = s.weighs.filter((w) => w.item === 'bottle' && w.bottle) as { riders: number; bottle: BottleSnap; water: number; item: 'bottle' }[];
  const kinds = grains
    ? { m1: (b: BottleSnap) => isEmpty(b), m2: (b: BottleSnap) => b.sand > 0 && b.fill === 'none', m3: (b: BottleSnap) => b.sand > 0 && b.fill === 'water', m4: (b: BottleSnap) => b.sand === 0 && b.fill === 'water' }
    : { m1: (b: BottleSnap) => isEmpty(b), m2: (b: BottleSnap) => b.sand === 0 && b.fill === 'water', m3: (b: BottleSnap) => b.sand === 0 && b.fill === 'liquid' };
  const ids = Object.keys(kinds) as ('m1' | 'm2' | 'm3' | 'm4')[];
  const of = (id: keyof typeof kinds) => bw.filter((w) => kinds[id]!(w.bottle));
  const full = bw.filter((w) => w.bottle.fill !== 'none');
  // care (2)
  {
    const n: string[] = [];
    let k = 0;
    if (bw.length && bw.every((w) => w.bottle.film === 'none' || w.bottle.film === w.bottle.fill)) k++;
    else n.push(bw.length ? 'The bottle was still wet inside with the last liquid: dry it thoroughly (or rinse it with a little of the next liquid) before each filling — and the “empty” bottle must be dry.' : 'Nothing was weighed.');
    if (full.length && full.every((w) => w.bottle.toCap && !w.bottle.bubble && !w.bottle.outsideWet)) k++;
    else if (full.some((w) => !w.bottle.toCap)) n.push('Fill the bottle to the brim and push the stopper in so the excess rises out through the capillary: then it holds exactly the same volume every time.');
    else if (full.some((w) => w.bottle.bubble)) n.push('An air bubble was trapped in the bottle: tap it (or stir the grains) to let it out and top up before stoppering.');
    else n.push(full.length ? 'Wipe the outside of the bottle dry after stoppering: drops on the outside add to its mass.' : 'The bottle was never weighed full.');
    auto.push(score(crit('care'), k, n));
  }
  // procedure (4)
  {
    const n: string[] = [];
    let k = 0;
    if (of('m1').length) k++;
    else n.push('Weigh the clean, dry, empty bottle with its stopper (m₁).');
    if (of('m2').length) k++;
    else n.push(grains ? 'Weigh the bottle with the sand in it (m₂).' : 'Weigh the bottle full of water (m₂).');
    if (grains ? of('m3').length && of('m4').length : of('m3').length) k++;
    else n.push(grains ? 'Weigh the bottle with the sand topped up with water (m₃), and full of water alone (m₄).' : `Weigh the bottle full of ${v.liquid} (m₃).`);
    if (s.tempRead) k++;
    else n.push('Read the room (water) temperature: the density of water depends on it.');
    auto.push(score(crit('procedure'), k, n));
  }
  const m = Object.fromEntries(ids.map((id) => [id, num(cell(s, id))])) as Record<string, number | null>;
  // readings (5)
  {
    const n: string[] = [];
    let k = 0;
    const good = ids.filter((id) => matching(m[id]!, of(id).map((w) => w.riders), TOL.g)).length;
    k += good === ids.length ? 2 : good >= ids.length / 2 ? 1 : 0;
    if (good < ids.length) n.push(`${plural(ids.length - good, 'mass does', 'masses do')} not match a weighing of the bottle in that state: write the riders’ total exactly, to 0.1 g.`);
    if (bw.length && bw.every((w) => Math.abs(w.riders - bottleMass(v, w.bottle)) <= BALANCED)) k++;
    else n.push('Slide the riders until the pointer rests on zero before recording each weighing.');
    const cells = ids.map((id) => cell(s, id)).filter(filled);
    if (cells.length === ids.length && cells.every((c) => decimalPlaces(c) >= 1)) k++;
    else n.push('Record every mass to 0.1 g (the front beam’s smallest division).');
    if (withinAbs(num(cell(s, 'T')), v.tempC, 0.5)) k++;
    else n.push(`Record the thermometer’s reading of the room temperature (${v.tempC.toFixed(1)} °C).`);
    auto.push(score(crit('readings'), k, n));
  }
  const mw = num(s.answers.mw.value);
  const ml = num(s.answers.ml.value);
  const rd = num(s.answers.rd.value);
  const { m1, m2, m3, m4 } = m;
  const expMw = grains ? (m1 !== null && m2 !== null && m3 !== null && m4 != null ? m4 - m1 - (m3 - m2) : null) : m1 !== null && m2 !== null ? m2 - m1 : null;
  const expMl = grains ? (m1 !== null && m2 !== null ? m2 - m1 : null) : m1 !== null && m3 !== null ? m3 - m1 : null;
  // analysis (2)
  {
    const n: string[] = [];
    let k = 0;
    if (expMw !== null && expMl !== null && withinAbs(mw, expMw, 0.06) && withinAbs(ml, expMl, 0.06)) k++;
    else n.push(grains ? 'Mass of sand = m₂ − m₁; mass of an equal volume of water = (m₄ − m₁) − (m₃ − m₂).' : 'Mass of water = m₂ − m₁ and mass of liquid = m₃ − m₁: subtract the empty bottle.');
    if (mw !== null && ml !== null && mw > 0 && withinRel(rd, ml / mw, 0.005)) k++;
    else n.push(grains ? 'RD = mass of sand ÷ mass of an equal volume of water.' : 'RD = mass of liquid ÷ mass of an equal volume of water = (m₃ − m₁)/(m₂ − m₁).');
    auto.push(score(crit('analysis'), k, n));
  }
  const trueRD = bottleTrueRD(v, s.sample);
  const rho = toGcm3(s.answers.rho);
  // calculations (4)
  {
    const n: string[] = [];
    let k = 0;
    const waterTrue = grains ? (v.sand.slice(0, Math.max(1, ...of('m2').map((w) => w.bottle.sand))).reduce((t, x) => t + x, 0) / v.sandRD) : (v.bottleV * v.rhoW) / 1000;
    if (withinRel(mw, waterTrue, grains ? 0.03 : 0.005)) k++;
    else n.push(grains ? `The sand displaces about ${waterTrue.toFixed(1)} g of water.` : `The bottle holds about ${waterTrue.toFixed(1)} g of water at ${v.tempC} °C: fill it to the capillary and weigh it wiped dry.`);
    if (withinRel(rd, trueRD, grains ? 0.03 : 0.015)) k++;
    else n.push(`The relative density is about ${trueRD.toFixed(3)}.`);
    if (rd !== null && (withinRel(rho, rd, 0.005) || withinRel(rho, (rd * v.rhoW) / 1000, 0.005))) k++;
    else n.push('Density = RD × density of water (1000 kg m⁻³, or more exactly its value at the room temperature).');
    if (withinRel(rho, (trueRD * v.rhoW) / 1000, 0.02)) k++;
    else n.push(`The density is about ${((trueRD * v.rhoW) / 1000).toFixed(3)} g cm⁻³ (${(trueRD * v.rhoW).toFixed(0)} kg m⁻³).`);
    auto.push(score(crit('calculations'), k, n));
  }
  // units (1)
  {
    const ok = densityUnit(s.answers.mw.unit) === 'g' && densityUnit(s.answers.ml.unit) === 'g' && filled(s.answers.rd.value) && noUnit(s.answers.rd) && ['kg/m3', 'g/cm3'].includes(densityUnit(s.answers.rho.unit));
    auto.push(score(crit('units'), ok ? 1 : 0, ok ? [] : ['Masses in g; relative density has no unit; density in kg m⁻³ (or g cm⁻³).']));
  }
  const water = (v.bottleV * v.rhoW) / 1000;
  const solution = grains
    ? [`Sand RD ${v.sandRD.toFixed(3)}: m₂ − m₁ = mass of sand; (m₄ − m₁) − (m₃ − m₂) = mass of water it displaces; RD = their ratio.`, `Density = ${v.sandRD.toFixed(3)} × ${v.rhoW.toFixed(1)} = ${(v.sandRD * v.rhoW).toFixed(0)} kg m⁻³ (water at ${v.tempC} °C).`]
    : [
        `m₁ = ${v.bottleM.toFixed(1)} g; m₂ = ${(v.bottleM + water).toFixed(1)} g; m₃ = ${(v.bottleM + water * v.liquidRD).toFixed(1)} g.`,
        `RD = (m₃ − m₁)/(m₂ − m₁) = ${(water * v.liquidRD).toFixed(1)} / ${water.toFixed(1)} = ${v.liquidRD.toFixed(3)} (${v.liquid}).`,
        `Density = RD × ${v.rhoW.toFixed(1)} kg m⁻³ (water at ${v.tempC} °C) = ${(v.liquidRD * v.rhoW).toFixed(0)} kg m⁻³.`,
      ];
  const facts = [`Task: density bottle (${grains ? 'sand grains' : v.liquid}); ${bw.length} weighings (${full.filter((w) => !w.bottle.toCap).length} not to the capillary, ${full.filter((w) => w.bottle.outsideWet).length} wet outside, ${bw.filter((w) => w.bottle.film !== 'none' && w.bottle.film !== w.bottle.fill).length} wet inside, ${full.filter((w) => w.bottle.bubble).length} with a bubble); temperature read ${s.tempRead}.`, `Student: mw ${s.answers.mw.value || '—'}; ml ${s.answers.ml.value || '—'}; RD ${s.answers.rd.value || '—'}; density ${s.answers.rho.value || '—'} ${s.answers.rho.unit}.`];
  return { auto, ai: precautions(s, grains ? 'finding the relative density of sand with a density bottle' : `finding the relative density of ${v.liquid} with a density bottle`), solution, facts };
}

function precautions(s: PhyDensityState, what: string): AiItem[] {
  return [
    {
      criterionId: 'precautions',
      question: `State two precautions taken to obtain accurate results when ${what}.`,
      answer: s.written.precautions.trim(),
      guide: `2 marks: one for each of two correct precautions relevant to this experiment. ${crit('precautions').guide}`,
      keywords: [
        ['zero error', 'zero'],
        ['ratchet', 'not squeeze', 'not over-tighten', 'gently'],
        ['parallax', 'eye level', 'perpendicular', 'eye in line'],
        ['several places', 'different places', 'orientations', 'repeat', 'average', 'mean'],
        ['not touching', 'touch the sides', 'fully immersed', 'completely immersed', 'free'],
        ['spout', 'stop dripping', 'stopped dripping'],
        ['bubble', 'bubbles'],
        ['dried', 'dry', 'wiped', 'wipe'],
        ['upright', 'vertical'],
        ['meniscus'],
        ['capillary', 'filled completely', 'brim'],
        ['temperature'],
      ],
      need: 2,
    },
  ];
}

