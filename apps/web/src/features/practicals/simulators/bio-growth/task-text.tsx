import { GERM_SOWN, type BioGrowthVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioGrowthVariant }) {
  if (v.task === 'SEEDLING')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with cowpea and maize seeds, a box of sawdust, a gas jar lined with blotting paper (a seed jar), water, a ruler and a hand lens.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Soak the seeds overnight. Sow some in the moist sawdust and place others between the blotting paper and the wall of the seed jar.</li>
          <li>Observe every day for up to 10 days, keeping the medium moist. Record the part that appears first and where the cotyledons stay.</li>
          <li>Measure the length of the cowpea and maize shoots each day, from the same point each time; plot length against time.</li>
          <li>Draw the seedlings at day 3 and day 7 and label them.</li>
          <li>Work out the growth rate of each between day 4 and day 8; compare the two in a table; state two precautions and explain the difference.</li>
        </ol>
        <p className="text-muted-foreground">Wash your hands after handling the sawdust.</p>
      </div>
    );
  if (v.task === 'RESP')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with soaked cowpea seeds, two vacuum (thermos) flasks in clamps, two thermometers, cotton wool, dilute disinfectant, a conical flask with a stopper and delivery tube, test tubes, lime water and hydrogencarbonate indicator.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Boil half of the soaked seeds for 10 minutes and cool them. Rinse both batches in dilute disinfectant.</li>
          <li>Fill flask A with the germinating seeds and flask B with the same amount of boiled seeds. Insert a thermometer into each, plug loosely with cotton wool and invert the flasks.</li>
          <li>Read both thermometers at the start and once a day for three days.</li>
          <li>In a separate set-up, pass air from a flask of germinating seeds into lime water (and from boiled seeds as a control). Record what you see.</li>
          <li>Work out the rise in each flask, the mean rise per day and the difference due to respiration. Write the word equation, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Handle hot seeds and disinfectant with care. Do not knock the thermos flasks: the glass breaks.</p>
      </div>
    );
  if (v.task === 'TROPISM')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with two pots of maize seedlings, a light-proof box with a slit in one side, a bench lamp, tape, a clinostat, soaked bean seedlings, pins, a cork in a gas jar, cotton wool, water and a protractor.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Phototropism: put one pot in the box with its slit facing the lamp; make the box light-proof. Put the control pot on the rotating clinostat (or in uniform light).</li>
          <li>Geotropism: pin bean seedlings to the moist cork with their radicles pointing in different directions; fix a similar set on the rotating clinostat.</li>
          <li>Leave for 3–5 days, keeping the seedlings moist. Each day measure the angle of curvature of a test shoot and a control shoot with the protractor.</li>
          <li>Count the radicles on the cork growing downwards and work out the percentage; work out the mean rate of curvature; sketch both sets.</li>
          <li>Name the responses, state two precautions and explain your results using auxin.</li>
        </ol>
        <p className="text-muted-foreground">Keep the clinostat and the lamp away from water. Handle the pins carefully.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with cowpea seeds, four test tubes with stoppers in a rack, cotton wool, water, boiled and cooled water, oil, labels and the use of a refrigerator.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Choose seeds of the same kind, size and age. Set up tube A: seeds on moist cotton wool at room temperature (the control); tube B: dry cotton wool; tube C: boiled, cooled water covered with a layer of oil; tube D: moist cotton wool in the refrigerator.</li>
        <li>Use {GERM_SOWN} seeds in each tube and label the tubes.</li>
        <li>Inspect the tubes every day for 4–5 days and count the seeds that have germinated (radicle visible).</li>
        <li>Calculate the percentage germination in each tube and state the condition missing from each.</li>
        <li>State your conclusions, two precautions and explain why each condition is needed.</li>
      </ol>
      <p className="text-muted-foreground">Label every tube. Alkaline pyrogallol, if used to absorb oxygen, is handled only by the teacher.</p>
    </div>
  );
}
