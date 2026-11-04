import { amRun, dsRun, dsThermometer, prepTubeParts, prepTubes, prepTubeText, stdMeniscusMm, stdRun, type ChemPrepState, type ChemPrepVariant, type StdFlask } from '@aischool/shared';

/**
 * What the bench shows right now, in words: the balance display, the
 * meniscus, the thermometer, the dish, the receiver, the gas jar, the tube in
 * use. The 2D lab lists it; the 3D lab shows the same on the apparatus.
 */

export function meniscusText(f: StdFlask, eye: boolean): string {
  if (!f.started) return 'empty';
  if (!f.filled) return `about ${Math.round(f.vol)} cm³ of solution, well below the mark`;
  const mm = stdMeniscusMm(f);
  if (!eye) return Math.abs(mm) < 3 ? 'the meniscus looks close to the mark (check it at eye level)' : mm > 0 ? 'the liquid is clearly above the mark!' : 'the meniscus is a little below the mark';
  if (Math.abs(f.vol - 250) <= 0.03) return 'at eye level: the bottom of the meniscus sits exactly on the mark';
  return mm > 0 ? `at eye level: the meniscus is ${mm.toFixed(1)} mm ABOVE the mark (overshot)` : `at eye level: the meniscus is ${(-mm).toFixed(1)} mm below the mark`;
}

export function prepReadout(v: ChemPrepVariant, s: ChemPrepState, tube: number): string[] {
  const ev = s.events;
  switch (v.task) {
    case 'STANDARD': {
      const r = stdRun(v, ev);
      return [
        `Balance: ${r.balance === null ? '0.00' : r.balance.toFixed(2)} g`,
        r.tipped ? `Weighing bottle: a trace of powder left (${r.m2 === null ? 'not reweighed' : 'reweighed'})` : `Weighing bottle: ${r.inBottle > 0 ? `white powder in it${r.m1 !== null && r.m1Fresh ? ' (weighed)' : ''}` : 'empty'}`,
        `Beaker: ${!r.tipped || r.where !== 'BEAKER' ? 'empty' : r.poured ? `rinsed ${r.rinses}×` : r.dissolved ? 'a clear, colourless solution' : r.water ? 'white solid in water: stir it' : 'white solid'}`,
        `Flask 1: ${meniscusText(r.f1, r.f1.eye)}${r.f1.mixed ? `; inverted ${r.f1.mixed}×` : ''}`,
        `Pipette: ${r.pipetted ? 'used' : r.pip === 'SOL' ? 'rinsed with the solution' : r.pip === 'WATER' ? 'rinsed with water' : 'clean, dry'}`,
        `Flask 2: ${meniscusText(r.f2, r.f2.eye)}${r.f2.mixed ? `; inverted ${r.f2.mixed}×` : ''}`,
      ];
    }
    case 'DISTIL': {
      const r = dsRun(v, ev);
      const dish = !r.measured ? 'empty' : r.water > 4 ? `${r.water.toFixed(0)} cm³ of sea water` : r.water > 0 ? `nearly dry (${r.water.toFixed(1)} cm³ left)` : `white salt crystals${r.wet > 0.02 ? ', still slightly damp' : ''}`;
      return [
        `Balance: ${r.balance === null ? '0.00' : r.balance.toFixed(2)} g`,
        `Dish: ${dish}${r.hot ? ' (hot)' : ''}${r.spat ? ` — it spat ${r.spat}×` : ''}`,
        `Distillation flask: ${!r.filled ? 'empty' : `${r.liquidVol.toFixed(0)} cm³ at ${r.liquidT.toFixed(0)} °C${r.heating ? (r.boilMin ? ', boiling' : ', heating') : ''}`}${r.chips ? ', granules in' : ''}${r.bumps ? ' — bumping!' : ''}`,
        `Thermometer: ${r.thermo ? `${dsThermometer(v, r).toFixed(1)} °C (${r.thermo === 'SIDEARM' ? 'bulb at the side arm' : r.thermo === 'LIQUID' ? 'bulb in the liquid' : 'bulb above the side arm'})` : 'not fitted'}`,
        `Condenser: ${!r.condenser ? 'not connected' : `water in at the ${r.condenser.toLowerCase()}${r.waterOn ? ', running' : ', tap off'}`}`,
        `Receiver: ${r.receiver === 'STOPPERED' ? (r.blown ? 'the bung blew out!' : 'stoppered') : r.receiver === 'OPEN' ? 'open' : 'not placed'}; ${r.distillate.toFixed(0)} cm³ of colourless distillate`,
      ];
    }
    case 'AMMONIA': {
      const r = amRun(v, ev);
      return [
        `Balance: ${r.balance === null ? '0.00' : r.balance.toFixed(2)} g`,
        `Tube: ${!r.loaded ? 'empty' : r.cracked ? 'CRACKED — water ran back on to the hot glass' : `NH₄Cl + Ca(OH)₂${r.clamp ? `, clamped mouth ${r.clamp === 'DOWN' ? 'sloping down' : 'up'}` : ''}${r.heatSec ? `, heated ${r.heatSec / 60} min (droplets of water near the mouth)` : ''}`}`,
        `Drying: ${r.dryer === 'CAO' ? 'quicklime tower' : r.dryer === 'H2SO4' ? 'conc. H₂SO₄ (it absorbs the ammonia!)' : r.dryer === 'CACL2' ? 'CaCl₂ (it absorbs the ammonia!)' : 'none'}`,
        `Gas jar: ${!r.collect ? 'not set up' : r.collect === 'WATER' ? 'over water — the gas dissolves, nothing collects' : `${r.collect === 'UPWARD' ? 'inverted' : 'upright'}, ${r.jar >= 0.8 ? 'full of ammonia' : r.jar > 0.3 ? 'filling' : r.heatSec ? 'mostly air' : 'air'}`}`,
      ];
    }
    case 'LECHAT':
    case 'HALOGEN': {
      const tubes = prepTubes(v.task, ev);
      const t = tubes[tube];
      const out = [`${tubes.length} tube${tubes.length === 1 ? '' : 's'} in the rack`];
      if (t) out.push(`Tube ${tube + 1}: ${prepTubeText(v.task, t)}`, `You see: ${prepTubeParts(v, ev, tube).map((p) => p.text).join('; ')}`);
      return out;
    }
  }
}
