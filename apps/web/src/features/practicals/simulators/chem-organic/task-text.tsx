import type { ChemOrganicVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: ChemOrganicVariant }) {
  const given = v.samples
    .filter((s) => s.letter !== 'H2O')
    .map((s) => `${s.letter} is ${s.def.describe}`)
    .join('; ');
  if (v.task === 'SOAP')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with palm oil, 20% sodium hydroxide solution, saturated brine, distilled water and a sample of hard water.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Measure 10 cm³ of palm oil into a 250 cm³ beaker and weigh it. Add 20 cm³ of the NaOH solution.</li>
          <li>Boil gently with continuous stirring for 15–20 minutes, adding water to replace losses. Note what you see.</li>
          <li>Add about 20 cm³ of saturated brine and stir. Cool, filter off the soap, wash it with a little cold water, press it dry and weigh it.</li>
          <li>Shake a small piece with distilled water and another with hard water. Compare the lather.</li>
          <li>Work out the theoretical mass of soap (palm oil as glyceryl tripalmitate, M = 806; sodium palmitate M = 278) and your % yield. Name the by-product.</li>
        </ol>
        <p className="text-muted-foreground">Hot NaOH is very corrosive and spits: goggles on, stir carefully and never leave it unattended.</p>
      </div>
    );
  if (v.task === 'CARBS')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>W, X, Y and Z are glucose, sucrose and starch solutions and a local food, in some order. {given}.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Test each sample with Benedict’s (or Fehling’s) solution in a boiling water bath for 5 minutes, and with iodine.</li>
          <li>Boil each sample that gives no reducing sugar with dilute HCl (test portions of a starch with iodine as it boils), neutralise with NaHCO₃, then repeat the Benedict’s test.</li>
          <li>Record TEST | OBSERVATION | INFERENCE and name the carbohydrates in each sample.</li>
          <li>Do the calculation, then state two precautions and answer the question.</li>
        </ol>
        <p className="text-muted-foreground">Heat tubes only in the water bath. Fehling’s B and NaOH are corrosive.</p>
      </div>
    );
  if (v.task === 'PROTEINS')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>P, Q and R are food extracts; distilled water is the control. {given}.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Carry out the Biuret test on each sample and on water: 2 cm³ NaOH, then 1% CuSO₄ drop by drop.</li>
          <li>Confirm with Millon’s reagent, the xanthoproteic test (conc. HNO₃, warm, cool, then NH₃) or ninhydrin. Heat each sample in the water bath: does it coagulate?</li>
          <li>Record TEST | OBSERVATION | INFERENCE and say whether each sample contains protein.</li>
          <li>Do the calculation, then state two precautions and answer the question.</li>
        </ol>
        <p className="text-muted-foreground">Millon’s reagent (mercury) and conc. HNO₃ are handled by the teacher. Ninhydrin stains skin purple.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>A, B, C and D are an alkene, an alkane, an alkanol and an alkanoic acid, in some order. {given}.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Shake each with bromine water (or acidified KMnO₄).</li>
        <li>Warm each with acidified K₂Cr₂O₇ in a water bath; the teacher adds sodium to dry samples — test any gas with a burning splint.</li>
        <li>Add NaHCO₃ to each and pass any gas into lime water.</li>
        <li>Warm the alkanol with ethanoic acid and conc. H₂SO₄ in a water bath, pour into water and waft the smell.</li>
        <li>Record TEST | OBSERVATION | INFERENCE, name the series of each liquid, do the calculation and answer the questions.</li>
      </ol>
      <p className="text-muted-foreground">Organic liquids are flammable: no flames near them — heat only in the water bath. Bromine water is toxic.</p>
    </div>
  );
}
