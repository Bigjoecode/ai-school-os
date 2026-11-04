import { prepCalcQuestion, type ChemPrepVariant } from '@aischool/shared';

const TEXT: Record<ChemPrepVariant['task'], { intro: string; steps: string[]; safety: string }> = {
  STANDARD: {
    intro: 'You are provided with anhydrous sodium trioxocarbonate(IV), Na₂CO₃ (M = 106), distilled water, two 250 cm³ volumetric flasks and a 25.0 cm³ pipette with a filler.',
    steps: [
      'Calculate the mass of Na₂CO₃ needed to make 250 cm³ of 0.100 mol dm⁻³ solution.',
      'Weigh about that mass accurately by difference: the weighing bottle with the solid, then the bottle after tipping it into a beaker.',
      'Dissolve in about 100 cm³ of distilled water, transfer through a funnel into the flask with rinsings, make up to the mark (dropwise, eye level) and invert many times.',
      'Pipette 25.0 cm³ of it into the second flask, make up to the mark and mix.',
      'Record your weighings and observations, answer the questions and do the calculations.',
    ],
    safety: 'Wear goggles. Always use a pipette filler.',
  },
  LECHAT: {
    intro: 'You are provided with dilute FeCl₃, dilute KSCN, solid NH₄Cl, K₂CrO₄ solution, dilute HCl and NaOH, and beakers of hot and of iced water.',
    steps: [
      'Mix a few drops of FeCl₃ and KSCN with about 20 cm³ of water to give a pale red solution. Pour some into each of several test tubes.',
      'Keep one as a control. Add more FeCl₃ to a second, more KSCN to a third and solid NH₄Cl to a fourth. Stand a fifth in hot water and a sixth in iced water. Compare each with the control against a white tile.',
      'Add dilute acid to yellow chromate(VI) solution, then add alkali.',
      'Record each observation and say which way each equilibrium shifted; answer the questions.',
    ],
    safety: 'Chromate(VI) compounds are toxic: avoid skin contact and put the waste in the residue bottle.',
  },
  DISTIL: {
    intro: 'You are provided with sea water, filter paper, an evaporating dish, a water bath, a distillation flask, a Liebig condenser, a thermometer, anti-bumping granules and a balance.',
    steps: [
      'Filter the sea water. Weigh an evaporating dish, add 50.0 cm³ of filtrate and evaporate it, finishing on a water bath. Cool and weigh to constant mass.',
      'Set up the distillation: sea water and anti-bumping granules in the flask, the thermometer bulb level with the side arm, condenser water in at the bottom, receiver open.',
      'Heat gently, collect the distillate and record the thermometer reading. Turn off the heat before the flask boils dry.',
      'Test the distillate. Record your observations and readings and do the calculation.',
    ],
    safety: 'Never heat a closed apparatus. Turn off the heat before the flask boils dry. Hot dishes burn.',
  },
  HALOGEN: {
    intro: 'You are provided with fresh chlorine water, bromine water, iodine solution, KCl, KBr and KI solutions, hexane and starch solution. (An old bottle of chlorine water is also on the shelf.)',
    steps: [
      'To 2 cm³ of each halide add a few drops of each of the other halogens in turn (six tubes). Observe.',
      'Add 1 cm³ of hexane to each tube, shake, and note the colour of the upper (organic) layer. Shake bromine water and iodine solution with water and hexane as controls.',
      'Confirm iodine with starch.',
      'Tabulate which halogens displace which halides, deduce the order of reactivity and answer the questions.',
    ],
    safety: 'Chlorine and bromine are toxic: use dilute solutions in a well-ventilated room. Hexane is flammable: no flames.',
  },
  AMMONIA: {
    intro: 'You are provided with ammonium chloride, calcium hydroxide, a hard-glass test tube with delivery tube, drying agents, gas jars, red litmus paper, concentrated HCl and a fountain flask with a trough of water containing phenolphthalein.',
    steps: [
      'Weigh about 5 g of NH₄Cl and 4 g of Ca(OH)₂, mix them and put them in the hard-glass tube.',
      'Clamp the tube, connect a suitable drying agent and collect the gas in a suitable way. Heat gently.',
      'Test the gas: smell (waft), damp red litmus, a rod dipped in concentrated HCl. Perform the fountain experiment.',
      'Record your observations and inferences, answer the questions and do the calculation.',
    ],
    safety: 'Ammonia irritates the eyes and lungs: work near an open window or in the fume cupboard. Conc. HCl is corrosive.',
  },
};

/** The task card's text. */
export function TaskText({ v }: { v: ChemPrepVariant }) {
  const t = TEXT[v.task];
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>{t.intro}</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        {t.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p>
        <span className="font-semibold">Calculation: </span>
        {prepCalcQuestion(v)}
      </p>
      <p className="text-muted-foreground">{t.safety}</p>
    </div>
  );
}
