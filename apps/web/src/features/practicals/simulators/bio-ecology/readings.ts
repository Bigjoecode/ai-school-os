import {
  FAC_DIRS,
  capFirstCatch,
  capSecondCatch,
  capTray,
  facRain,
  facShown,
  facSix,
  soilAirFinal,
  soilCrucibleMass,
  soilDrainReading,
  soilJarNow,
  soilJarReading,
  type BioEcologyState,
  type BioEcologyVariant,
  type FacInst,
  type FacSite,
} from '@aischool/shared';

/** What the field and the apparatus show now (shared by the 2D and the 3D lab), from the shared model. */

/** The first catch on the tray (marked once the mark is chosen) and the second catch (marks show once examined). */
export function capTrays(v: BioEcologyVariant, s: BioEcologyState) {
  const w = s.cap;
  const n1 = w.first ? capFirstCatch(v.cap, w.first.effort) : 0;
  const first = w.first ? capTray(v.seed, n1, w.mark ? n1 : 0, 'first') : [];
  const c = w.first && w.mark && w.release && w.second ? capSecondCatch(v.cap, { firstEffort: w.first.effort, mark: w.mark, release: w.release, effort: w.second.effort, t: w.second.at }) : null;
  const second = c ? capTray(v.seed, c.n2, c.m, 'second') : [];
  return { n1, first, second, n2: c?.n2 ?? 0, m: c?.m ?? 0 };
}

/** The latest reading today of an instrument at a site (what its display or scale shows). */
export function facLast(v: BioEcologyVariant, s: BioEcologyState, site: FacSite, inst: FacInst) {
  const w = s.fac;
  for (let k = w.reads.length - 1; k >= 0; k--) {
    const r = w.reads[k]!;
    if (r.day === w.day && r.site === site && r.inst === inst) return { read: r, k, shown: facShown(v.fac, r, k) };
  }
  return null;
}
/** The weather station this morning: the Six's thermometer, the rain gauge and the vane (null until read). */
export function facStationNow(v: BioEcologyVariant, s: BioEcologyState) {
  const w = s.fac;
  const read = (inst: string) => w.station.some((x) => x.day === w.day && x.inst === inst);
  return {
    six: read('SIX') ? facSix(v.fac, w.day, w.resets) : null,
    rain: read('RAIN') ? facRain(v.fac, w.day, w.empties) : null,
    dir: read('VANE') ? v.fac.days[w.day - 1]!.dir : null,
    dirText: read('VANE') ? FAC_DIRS[v.fac.days[w.day - 1]!.dir]! : null,
  };
}

/** A jar now: its true layers (drawn) and whether it was measured now (the ruler reading). */
export function jarNow(v: BioEcologyVariant, s: BioEcologyState, i: number) {
  const w = s.soil;
  const j = w.jars[i];
  if (!j) return null;
  const now = soilJarNow(v.soil, j, w.hours);
  const measured = w.jarReads.some((x) => x.jar === i && Math.abs(x.at - w.hours) < 1e-9);
  return { ...now, reading: soilJarReading(v.soil, j, w.hours), measured, since: j.shakenAt === null ? null : w.hours - j.shakenAt };
}
/** A drainage cylinder now (true reading), and whether it has been read at this time. */
export function drainNow(v: BioEcologyVariant, s: BioEcologyState, f: number) {
  const w = s.soil;
  const fu = w.funnels[f];
  if (!fu) return null;
  const t = w.pouredAt === null ? 0 : w.dclock;
  return { volume: w.pouredAt === null ? 0 : soilDrainReading(v.soil, fu, t), read: w.dReads.some((x) => x.f === f && Math.abs(x.t - w.dclock) < 1e-9), muddy: !fu.cotton };
}
export function airNow(v: BioEcologyVariant, s: BioEcologyState, i: number) {
  const a = s.soil.airs[i];
  if (!a) return null;
  return { final: a.added ? soilAirFinal(v.soil, a) : 50, read: s.soil.airReads.includes(i), bubbling: a.added && !a.stirred };
}
/** The balance's display after the last weighing of crucible c. */
export function crucibleShown(v: BioEcologyVariant, s: BioEcologyState, c: number) {
  const w = s.soil;
  const cr = w.crucibles[c];
  const last = [...w.weighs].reverse().find((x) => x.c === c);
  if (!cr || !last) return null;
  return soilCrucibleMass(v.soil, c, cr, last);
}
