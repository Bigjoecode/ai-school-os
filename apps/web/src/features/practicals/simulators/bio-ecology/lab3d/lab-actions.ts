import { CAP_EFFORTS, CAP_MARK_LABEL, CAP_RELEASES, CAP_RELEASE_LABEL, CAP_WAITS, FAC_DAYS, FAC_INSTS, FAC_INST_LABEL, QUAD_MAX, SOIL_LABEL, SOIL_TYPES, type BioEcologyState, type FacPlace, type SoilType } from '@aischool/shared';
import type { LabAction, ObjectPanel } from '../../../lab3d-kit/hud';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioRoomPanel } from '../../bio-common/lab3d/common';
import { clockText, type Ecology } from '../actions';
import { ECO_VIEWS, useEcoBench } from './bench';
import { ECO_APPARATUS, ECO_APPARATUS_LABEL, neededFor, type EcoApparatusId, type EcoScene } from './scene-state';

/**
 * What can be done with each thing in the field. Every action is a button;
 * a blocked one says why. Marked changes go through the shared actions (the
 * same as the 2D lab); the close-ups (the quadrat, the tray, the instruments,
 * the cylinders and the balance) open in the reading view.
 */

export interface EcoCtx {
  o: Ecology;
  s: BioEcologyState;
  scene: EcoScene;
  open: (what: 'notebook' | 'task' | 'cupboard') => void;
}
const view = () => useLabView.getState();
const need = (ctx: EcoCtx, id: EcoApparatusId) => (ctx.scene.collected.has(id) ? undefined : `Get the ${ECO_APPARATUS_LABEL[id].toLowerCase()} from the equipment shed first.`);
const firstBlock = (...xs: (string | undefined)[]) => xs.find(Boolean);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
/** Opens the close-up (reading) view. */
export const readNow = () => view().set({ mode: 'read', selected: null });
/** Moves the camera to one of the field's views. */
export const goView = (id: string) => view().set({ mode: 'bench', focus: id, spot: null, selected: null });
const PLACE_VIEW: Record<FacPlace, string> = { STATION: 'station', OPEN: 'open', SHADE: 'shade', POND: 'pond' };

// ------------------------------------------------------------------ quadrats
export const quadActs = {
  random(ctx: EcoCtx) {
    const i = ctx.o.quad.placeRandom();
    if (i < 0) return notify('No more quadrats.', 'warning');
    const q = ctx.o.ref.current.quad.quads[i]!;
    useEcoBench.setState({ sel: i });
    play('tick');
    notify(`Random pair → (${q.x}, ${q.y}): quadrat ${i + 1} laid there.`, 'success', 2400);
  },
  look(ctx: EcoCtx, i: number) {
    ctx.o.quad.look(i);
    useEcoBench.setState({ sel: i });
    play('tick');
    readNow();
  },
};
function quadPanel(id: string, ctx: EcoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.quad;
  const place: LabAction = { key: 'rand', label: 'Next random pair → lay a quadrat there', tone: 'brand', blocked: firstBlock(need(ctx, 'quadrat'), need(ctx, 'randtable'), !w.pegged ? 'Peg out the plot first.' : undefined, w.quads.length >= QUAD_MAX ? 'That is plenty.' : undefined), run: () => quadActs.random(ctx) };
  if (id.startsWith('quad:')) {
    const i = Number(id.slice(5));
    const q = w.quads[i];
    if (!q) return null;
    return { title: `Quadrat ${i + 1} at (${q.x}, ${q.y})`, info: q.how === 'CHOSEN' ? 'Placed where you chose — not random.' : 'Placed from the random-number table.', actions: [{ key: 'look', label: w.looked.includes(i) ? 'Look at it again' : 'Kneel and examine it', tone: 'brand', run: () => quadActs.look(ctx, i) }] };
  }
  switch (id) {
    case 'plot':
      return {
        title: 'The study plot (20 m × 20 m)',
        info: `${w.quads.length} quadrat${w.quads.length === 1 ? '' : 's'} placed.`,
        actions: [
          { key: 'peg', label: 'Peg out the plot with the tapes on two edges', tone: 'brand', blocked: firstBlock(need(ctx, 'pegs'), need(ctx, 'tapes'), w.pegged ? 'Done.' : undefined), run: () => (o.quad.peg(), play('creak')) },
          place,
          { key: 'chosen', label: 'Put a quadrat where I choose (on the map)', blocked: firstBlock(need(ctx, 'quadrat'), !w.pegged ? 'Peg out the plot first.' : undefined), run: readNow },
          { key: 'map', label: 'Open the plot map and the close-ups', run: readNow },
        ],
      };
    case 'quadrat':
    case 'randtable':
      return { title: id === 'quadrat' ? '1 m quadrat with string grid' : 'Random-number table', info: 'Read two numbers from 00 to 19 (skip the larger ones): x along the bottom tape, then y up the side tape.', actions: [place] };
    case 'tapes':
    case 'pegs':
      return { title: ECO_APPARATUS_LABEL[id], info: 'Run the two tapes along two edges of the plot as the axes.', actions: [{ key: 'peg', label: 'Peg out the plot', tone: 'brand', blocked: w.pegged ? 'Done.' : undefined, run: () => (o.quad.peg(), play('creak'), goView('plot')) }] };
    case 'guide':
      return { title: 'Identification guide', info: 'Tridax: a hairy rosette with daisy-like heads on long stalks. Sida: a stiff shrublet with toothed leaves and small yellow flowers. Euphorbia hirta: small reddish leaves in pairs, milky sap.', actions: [] };
  }
  return null;
}

// ------------------------------------------------------------------ capture
function capPanel(id: string, ctx: EcoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.cap;
  switch (id) {
    case 'net':
    case 'plot':
      return {
        title: 'Sweep net',
        info: w.first ? (w.second ? 'Both samples are caught.' : `First sample: ${w.first.effort} min of sweeping. ${w.release ? `Released ${w.clock} h ago.` : ''}`) : 'Sweep through the grass of the plot with long, even strokes for a fixed time.',
        actions: !w.first
          ? CAP_EFFORTS.map((e): LabAction => ({ key: `s1-${e}`, label: `Sweep the plot for ${e} minutes (first sample)`, tone: e === 10 ? 'brand' : undefined, blocked: firstBlock(need(ctx, 'net'), need(ctx, 'box'), need(ctx, 'watch')), run: () => (o.cap.sweep1(e), play('creak'), notify('The catch is in the collecting box. Tip it onto the tray to count.', 'success', 2400)) }))
          : CAP_EFFORTS.map((e): LabAction => ({ key: `s2-${e}`, label: `Sweep again for ${e} minutes (second sample)`, blocked: !w.release ? 'Mark and release the first sample first.' : w.second ? 'Done.' : w.clock <= 0 ? 'Give them time to mix first (the stopwatch).' : undefined, run: () => (o.cap.sweep2(e), play('creak'), readNow()) })),
      };
    case 'box':
    case 'tray':
      return {
        title: id === 'box' ? 'Collecting box' : 'White tray',
        info: w.second ? `Second catch on the tray.${w.examined ? ' Examined for marks.' : ''}` : w.counted1 ? 'First catch on the tray.' : w.first ? 'The catch is in the box.' : 'Empty.',
        actions: [
          { key: 'tip', label: 'Tip the catch onto the tray and count it', tone: 'brand', blocked: firstBlock(need(ctx, 'tray'), !w.first ? 'Catch some first.' : undefined, w.counted1 ? 'Done.' : undefined), run: () => (o.cap.count1(), play('clink'), readNow()) },
          { key: 'look', label: 'Look closely at the tray (count)', run: readNow },
          { key: 'exam', label: 'Turn each one over to look for the mark', blocked: !w.second ? 'Catch the second sample first.' : w.examined ? 'Done.' : undefined, run: () => (o.cap.examine(), readNow()) },
          { key: 'free', label: 'Release them where they were caught', blocked: !w.second ? 'Not yet.' : w.freed ? 'Done.' : undefined, run: () => (o.cap.free(), notify('Released gently into the grass.', 'success')) },
        ],
      };
    case 'paint':
    case 'redpaint':
    case 'scissors': {
      const m = id === 'paint' ? 'DOT' : id === 'redpaint' ? 'BRIGHT' : 'CLIP';
      return { title: ECO_APPARATUS_LABEL[id], info: CAP_MARK_LABEL[m], actions: [{ key: 'mark', label: `Mark every grasshopper: ${lc(CAP_MARK_LABEL[m])}`, tone: id === 'paint' ? 'brand' : undefined, blocked: !w.counted1 ? 'Count the first catch on the tray first.' : w.mark ? 'They are marked.' : undefined, run: () => (o.cap.mark(m), play('tick')) }, ...(w.mark && !w.release ? CAP_RELEASES.map((r): LabAction => ({ key: r, label: CAP_RELEASE_LABEL[r], run: () => (o.cap.release(r), play('success')) })) : [])] };
    }
    case 'watch':
      return {
        title: w.release ? `Since the release: ${w.clock} h` : 'Stopwatch',
        info: 'Time the sweeps, and the wait before the second sample.',
        actions: [
          ...(w.mark && !w.release ? CAP_RELEASES.map((r): LabAction => ({ key: r, label: CAP_RELEASE_LABEL[r], run: () => (o.cap.release(r), play('success')) })) : []),
          ...CAP_WAITS.map((h): LabAction => ({ key: `w${h}`, label: `Wait ${h >= 24 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} h`} (time-lapse)`, blocked: !w.release ? 'Release the marked grasshoppers first.' : w.second ? 'The second sample is caught.' : undefined, run: () => (o.cap.wait(h), play('tick')) })),
        ],
      };
  }
  return null;
}

// ------------------------------------------------------------------ factors
export const facActs = {
  go(ctx: EcoCtx, p: FacPlace) {
    ctx.o.fac.go(p);
    goView(PLACE_VIEW[p]);
    play('tick');
  },
};
function facPanel(id: string, ctx: EcoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.fac;
  const instFor: Partial<Record<string, (typeof FAC_INSTS)[number]>> = { thermo: 'AIR', soilthermo: 'SOIL', hygro: 'HYGRO', lightmeter: 'LIGHT', anemo: 'WIND', phkit: 'PH' };
  const readAct = (inst: (typeof FAC_INSTS)[number], shaded = true): LabAction => ({
    key: `r-${inst}-${shaded}`,
    label: `${FAC_INST_LABEL[inst]}${inst === 'AIR' || inst === 'HYGRO' ? (shaded ? ', shaded' : ', in the sun') : ''}`,
    tone: shaded ? 'brand' : undefined,
    blocked: w.at !== 'OPEN' && w.at !== 'SHADE' ? 'Go to the open field or the canopy site first.' : undefined,
    run: () => (o.fac.read(inst, shaded), play('tick'), readNow()),
  });
  const nextDay: LabAction = { key: 'next', label: `Go on to the next day (day ${Math.min(FAC_DAYS, w.day + 1)}, 9 am)`, blocked: w.day >= FAC_DAYS ? 'This is the last day.' : undefined, run: () => (o.fac.nextDay(), goView('station'), play('tick')) };
  const wait: LabAction = { key: 'wait', label: 'Wait 30 minutes', run: () => o.fac.wait(30) };
  if (id.startsWith('site:')) {
    const site = id.slice(5) as 'OPEN' | 'SHADE';
    return { title: site === 'OPEN' ? 'Open-field site' : 'Canopy site', info: `Day ${w.day}, ${clockText(w.h)}.`, actions: [...(w.at === site ? FAC_INSTS.map((i) => readAct(i)) : [{ key: 'go', label: `Walk to the ${site === 'OPEN' ? 'open field' : 'canopy'}`, tone: 'brand' as const, run: () => facActs.go(ctx, site) }]), ...(w.at === site ? [readAct('AIR', false)] : []), wait, nextDay] };
  }
  if (instFor[id]) {
    const inst = instFor[id]!;
    return { title: ECO_APPARATUS_LABEL[id as EcoApparatusId], info: inst === 'AIR' ? 'Hold it 1 m up with the bulb shaded by the card, and wait a minute before reading.' : inst === 'SOIL' ? 'Push it into the soil to 10 cm.' : inst === 'HYGRO' ? 'Shaded, the wet bulb’s wick wet: read both.' : inst === 'LIGHT' ? 'At ground level, sensor facing up.' : inst === 'WIND' ? 'Hold it up, facing into the wind.' : 'Shake soil with distilled water, add indicator, match the colour.', actions: [readAct(inst, true), ...(inst === 'AIR' || inst === 'HYGRO' ? [readAct(inst, false)] : [])] };
  }
  switch (id) {
    case 'screen':
    case 'raingauge':
    case 'vane':
      return {
        title: id === 'screen' ? 'Stevenson screen' : id === 'raingauge' ? 'Rain gauge' : 'Wind vane and anemometer',
        info: `Day ${w.day} of ${FAC_DAYS}, ${clockText(w.h)}.`,
        actions: [...(w.at !== 'STATION'
          ? [{ key: 'go', label: 'Walk to the weather station', tone: 'brand', run: () => facActs.go(ctx, 'STATION') }]
          : id === 'screen'
            ? [
                { key: 'six', label: 'Read the Six’s thermometer', tone: 'brand', run: () => (o.fac.station('SIX'), readNow()) },
                { key: 'reset', label: 'Reset the indices with the magnet', blocked: w.resets.includes(w.day) ? 'Done today.' : undefined, run: () => (o.fac.reset(), play('clink')) },
              ]
            : id === 'raingauge'
              ? [
                  { key: 'rain', label: 'Read the rain gauge', tone: 'brand', run: () => (o.fac.station('RAIN'), readNow()) },
                  { key: 'empty', label: 'Empty the rain gauge', blocked: w.empties.includes(w.day) ? 'Done today.' : undefined, run: () => (o.fac.empty(), play('drip')) },
                ]
              : [{ key: 'vane', label: 'Note the wind direction', tone: 'brand' as const, run: () => (o.fac.station('VANE'), readNow()) }]) as LabAction[], nextDay],
      };
    case 'pond':
    case 'secchi':
      return { title: id === 'pond' ? 'The pond' : 'Secchi disc', info: 'Keep back from the edge; work in pairs. Lower the disc until it just disappears, raise it until it reappears: the mean depth.', actions: w.at === 'POND' ? [{ key: 'secchi', label: 'Lower the Secchi disc', tone: 'brand', blocked: firstBlock(need(ctx, 'secchi'), w.secchiRead ? 'Done.' : undefined), run: () => (o.fac.secchi(), play('drip'), readNow()) }] : [{ key: 'go', label: 'Walk to the pond edge', tone: 'brand', run: () => facActs.go(ctx, 'POND') }] };
    case 'tree':
      return { title: 'The shade tree', info: 'Under its canopy it is shadier, cooler and more humid.', actions: [{ key: 'go', label: 'Walk to the canopy site', tone: 'brand', run: () => facActs.go(ctx, 'SHADE') }] };
    case 'plot':
      return { title: 'The open field', info: 'Full sun and wind.', actions: [{ key: 'go', label: 'Walk to the open-field site', tone: 'brand', run: () => facActs.go(ctx, 'OPEN') }] };
  }
  return null;
}

// ------------------------------------------------------------------ soil
function soilPanel(id: string, ctx: EcoCtx): ObjectPanel | null {
  const { o, s } = ctx;
  const w = s.soil;
  const left = (list: { soil: SoilType }[]) => SOIL_TYPES.filter((t) => !list.some((x) => x.soil === t));
  if (id.startsWith('bag:')) {
    const t = id.slice(4) as SoilType;
    return {
      title: SOIL_LABEL[t],
      info: 'Oven-dried soil, and a little damp soil straight from the pit.',
      actions: [
        { key: 'jar', label: 'Put some in a jar with water', blocked: firstBlock(need(ctx, 'jars'), w.jars.some((j) => j.soil === t) ? 'There is a jar of it.' : undefined), run: () => o.soil.jar(t) },
        { key: 'f100', label: 'Weigh 100 g into a funnel (cotton-wool plug)', tone: 'brand', blocked: firstBlock(need(ctx, 'funnels'), need(ctx, 'balance'), w.pouredAt !== null ? 'The water has been poured.' : undefined, w.funnels.some((f) => f.soil === t) ? 'It has a funnel.' : undefined), run: () => o.soil.funnel(t, 100, true) },
        { key: 'f50', label: 'Weigh 50 g into a funnel', blocked: firstBlock(need(ctx, 'funnels'), w.pouredAt !== null || w.funnels.some((f) => f.soil === t) ? 'Not now.' : undefined), run: () => o.soil.funnel(t, 50, true) },
        { key: 'fnc', label: 'Into a funnel with no cotton wool', blocked: firstBlock(need(ctx, 'funnels'), w.pouredAt !== null || w.funnels.some((f) => f.soil === t) ? 'Not now.' : undefined), run: () => o.soil.funnel(t, 100, false) },
        { key: 'air', label: 'A cylinder of 50 cm³ water for its air test', blocked: firstBlock(need(ctx, 'cylinders'), w.airs.some((a) => a.soil === t) ? 'Done.' : undefined), run: () => o.soil.air(t) },
        { key: 'cd', label: 'Oven-dried sample for a crucible', blocked: firstBlock(need(ctx, 'crucibles'), w.crucibles.some((c) => c.soil === t) ? 'Done.' : undefined), run: () => o.soil.crucible(t, true) },
        { key: 'cw', label: 'Damp sample (from the pit) for a crucible', blocked: firstBlock(need(ctx, 'crucibles'), w.crucibles.some((c) => c.soil === t) ? 'Done.' : undefined), run: () => o.soil.crucible(t, false) },
      ],
    };
  }
  const idx = (p: string) => (id.startsWith(p) ? Number(id.slice(p.length)) : -1);
  const j = idx('jar:');
  if (j >= 0) {
    const jar = w.jars[j];
    if (!jar) return null;
    return { title: `Jar ${j + 1}: ${SOIL_LABEL[jar.soil].toLowerCase()}`, info: jar.shakenAt === null ? 'Not shaken yet.' : `Settling for ${Math.round((w.hours - jar.shakenAt) * 10) / 10} h.`, actions: [
      { key: 'shake', label: 'Shake it hard for a minute', tone: 'brand', blocked: jar.shakenAt !== null ? 'Done.' : undefined, run: () => (o.soil.shake(j), play('clink')) },
      { key: 'w1', label: 'Wait 1 h (time-lapse)', blocked: jar.shakenAt === null ? 'Shake it first.' : undefined, run: () => o.soil.waitJar(1) },
      { key: 'w24', label: 'Leave it overnight (24 h)', blocked: jar.shakenAt === null ? 'Shake it first.' : undefined, run: () => o.soil.waitJar(24) },
      { key: 'm', label: 'Measure the layers with the ruler', blocked: firstBlock(need(ctx, 'ruler'), jar.shakenAt === null ? 'Shake it first.' : undefined), run: () => (o.soil.measureJar(j), readNow()) },
    ] };
  }
  const f = idx('funnel:');
  if (f >= 0 || id === 'funnels') {
    return {
      title: 'Funnels over measuring cylinders',
      info: w.pouredAt === null ? `${w.funnels.length} set up.` : `${w.dclock} min since the water was poured.`,
      actions: [
        ...(w.pouredAt === null ? left(w.funnels).map((t): LabAction => ({ key: t, label: `Funnel of 100 g ${SOIL_LABEL[t].toLowerCase()}, cotton-wool plug`, blocked: firstBlock(need(ctx, 'funnels'), need(ctx, 'balance')), run: () => o.soil.funnel(t, 100, true) })) : []),
        { key: 'pour', label: 'Pour 100 cm³ of water onto each at once; start the stopwatch', tone: 'brand', blocked: firstBlock(need(ctx, 'watch'), !w.funnels.length ? 'Set up the funnels first.' : w.pouredAt !== null ? 'Poured.' : undefined), run: () => (o.soil.pour(), play('drip')) },
        { key: 'read', label: 'Read the cylinders now', blocked: w.pouredAt === null ? 'Pour the water first.' : undefined, run: () => (o.soil.readAllDrain(), readNow()) },
        { key: 'wait', label: 'Wait to the next reading time', blocked: w.pouredAt === null ? 'Pour the water first.' : undefined, run: () => (o.soil.waitDrain(), play('tick')) },
      ],
    };
  }
  const a = idx('aircyl:');
  if (a >= 0) {
    const x = w.airs[a];
    if (!x) return null;
    return { title: `Air test: ${SOIL_LABEL[x.soil].toLowerCase()}`, info: !x.added ? '50 cm³ of water.' : x.stirred ? 'Stirred; the bubbles have stopped.' : 'Bubbles are rising.', actions: [
      { key: 'add', label: 'Add 50 cm³ of the dry soil', blocked: x.added ? 'Done.' : undefined, run: () => (o.soil.addSoil(a), play('drip')) },
      { key: 'stir', label: 'Stir with the glass rod until no more bubbles', tone: 'brand', blocked: firstBlock(need(ctx, 'rod'), !x.added ? 'Add the soil first.' : x.stirred ? 'Done.' : undefined), run: () => (o.soil.stir(a), play('tick')) },
      { key: 'read', label: 'Read the volume', blocked: !x.added ? 'Add the soil first.' : undefined, run: () => (o.soil.readAir(a), readNow()) },
    ] };
  }
  const c = idx('crucible:');
  if (c >= 0 || id === 'burner' || id === 'balance' || id === 'desiccator' || id === 'tongs') {
    const cr = c >= 0 ? w.crucibles[c] : undefined;
    return {
      title: cr ? `Crucible ${c + 1}: ${SOIL_LABEL[cr.soil].toLowerCase()}` : id === 'balance' ? 'Electronic balance (0.01 g)' : id === 'desiccator' ? 'Desiccator' : 'Burner, tripod and crucibles',
      info: 'Goggles on. Handle hot crucibles only with tongs; cool them in the desiccator before weighing.',
      actions: [
        ...w.crucibles.map((x, k): LabAction => ({ key: `wg${k}`, label: `Weigh crucible ${k + 1} (${SOIL_LABEL[x.soil].toLowerCase()})`, blocked: need(ctx, 'balance'), run: () => (o.soil.weigh(k), play('clink'), readNow()) })),
        ...w.crucibles.filter((x) => !x.soilIn).map((x): LabAction => ({ key: `add${x.soil}`, label: `Add the ${SOIL_LABEL[x.soil].toLowerCase()} sample`, run: () => o.soil.addSample(w.crucibles.indexOf(x)) })),
        { key: 'heat', label: 'Heat strongly for 20 minutes', tone: 'brand', blocked: firstBlock(need(ctx, 'burner'), !w.crucibles.some((x) => x.soilIn) ? 'Put soil in a crucible first.' : undefined), run: () => (o.soil.heatAll(), play('creak')) },
        { key: 'cool', label: 'Move them to the desiccator to cool (tongs)', blocked: firstBlock(need(ctx, 'tongs'), need(ctx, 'desiccator'), !w.crucibles.some((x) => x.hot) ? 'Nothing is hot.' : undefined), run: () => (o.soil.coolAll(), play('clink')) },
      ],
    };
  }
  switch (id) {
    case 'jars':
      return { title: 'Screw-top jars', info: 'A third full of soil, nearly full of water.', actions: left(w.jars).map((t): LabAction => ({ key: t, label: `A jar of ${SOIL_LABEL[t].toLowerCase()} and water`, run: () => o.soil.jar(t) })) };
    case 'cylinders':
      return { title: 'Measuring cylinders', info: '50 cm³ of water in each for the air test.', actions: left(w.airs).map((t): LabAction => ({ key: t, label: `50 cm³ of water for ${SOIL_LABEL[t].toLowerCase()}`, run: () => o.soil.air(t) })) };
    case 'pit':
      return { title: 'Soil pit', info: 'The profile: dark topsoil rich in humus over paler subsoil and weathered rock. The damp samples come from here.', actions: [] };
  }
  return null;
}

// ------------------------------------------------------------------ all objects

export function ecoObjectPanel(id: string, ctx: EcoCtx): ObjectPanel | null {
  const { o, s, scene } = ctx;
  const task = s.task ?? 'QUADRAT';
  if (id.startsWith('cup:')) {
    const a = id.slice(4) as EcoApparatusId;
    return { title: ECO_APPARATUS_LABEL[a], info: 'In the equipment shed.', actions: [{ key: 'take', label: 'Take it to my table', tone: 'brand', run: () => (o.note(`collect:${a}`), play('clink'), view().set({ selected: null }), notify(`${ECO_APPARATUS_LABEL[a]} is on your table.`, 'success', 1500)) }] };
  }
  const room = bioRoomPanel(id, {
    coat: scene.coat,
    goggles: scene.goggles,
    note: o.note,
    open: ctx.open,
    benchInfo: task === 'SOIL' ? 'Your field table: the soils, jars, funnels and crucibles, the task card and your notebook.' : 'Your field table: the apparatus, the task card and your field notebook.',
    whiteboard: '',
  });
  if (id === 'cupboard') return { title: 'Field equipment shed', info: 'Take the apparatus you need.', actions: [{ key: 'list', label: 'Choose apparatus…', tone: 'brand', run: () => ctx.open('cupboard') }] };
  if (id === 'goggles' && room) return { ...room, info: task === 'SOIL' ? 'Wear them for heating the soil.' : 'Wear them when anything could splash.' };
  if (id === 'handwash' && room) return { ...room, title: 'Outside tap and soap', info: 'Wash your hands after handling soil, animals or pond water.' };
  if (room && id !== 'whiteboard') return room;
  const p = task === 'QUADRAT' ? quadPanel(id, ctx) : task === 'CAPTURE' ? capPanel(id, ctx) : task === 'FACTORS' ? facPanel(id, ctx) : soilPanel(id, ctx);
  if (p) return p;
  switch (id) {
    case 'card':
      return { title: 'Task card', actions: [{ key: 'read', label: 'Read the task card', tone: 'brand', run: () => ctx.open('task') }] };
    case 'book':
      return { title: 'Field notebook', info: 'Your tables, chart or drawing and answers — this is what is marked.', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => ctx.open('notebook') }] };
    case 'pond':
      return { title: 'The pond', info: 'Deep water: keep back from the edge.', actions: [] };
    case 'pit':
      return { title: 'Soil pit', info: 'Dark topsoil over paler subsoil.', actions: [] };
    case 'tree':
      return { title: 'Shade tree', info: 'Its canopy shades the ground beneath.', actions: [] };
    case 'plot':
      return { title: 'The study plot', info: 'Grassland with Tridax, Sida and Euphorbia hirta.', actions: [{ key: 'look', label: 'Look at the plot', run: () => goView('plot') }] };
    case 'screen':
    case 'raingauge':
    case 'vane':
      return { title: 'Weather station', info: 'The school’s Stevenson screen, rain gauge and wind vane.', actions: [] };
  }
  const extra = ECO_APPARATUS.find((a) => a.id === id);
  if (extra) return { title: extra.label, info: extra.for.includes(task) ? undefined : 'Not needed for this investigation.', actions: [{ key: 'return', label: 'Put it back in the shed', run: () => (o.note(`return:${extra.id}`), view().set({ selected: null })) }] };
  return null;
}

/** The hint for practice mode with guided mode off. */
export function ecoHint3d(ctx: EcoCtx, plain: string): string {
  const { scene, s } = ctx;
  const task = s.task ?? 'QUADRAT';
  if (!scene.coat) return 'Put on your lab coat: it hangs on the hooks by the door.';
  if (task === 'SOIL' && !scene.goggles) return 'Put on goggles for the heating.';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  if (missing.length) return `Collect from the equipment shed: ${missing.map((a) => lc(a.label)).join(', ')}.`;
  return plain;
}
export { ECO_VIEWS };
