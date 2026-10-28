import type { BioFoodVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioFoodVariant }) {
  if (v.task === 'AMYLASE')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a 1% starch solution, a saliva solution, iodine solution, Benedict’s solution and water baths.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Put drops of iodine in the wells of a spotting tile.</li>
          <li>Stand tubes of starch and of saliva in an ice bath, at 37 °C and in a boiling bath (and room temperature or 45 °C if you wish) for 5 minutes. Set up a control with boiled saliva.</li>
          <li>Mix each saliva with its starch and start the stopwatch. Every 30 s, put a drop of each mixture on a fresh iodine well.</li>
          <li>Record the time when the iodine no longer turns blue-black (the end point), and the rate 1000 ÷ t. Test the 37 °C mixture with Benedict’s at the end.</li>
          <li>Name the optimum temperature, state two precautions and explain your results.</li>
        </ol>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with food samples P, Q and R. {v.samples.map((s) => `${s.letter} is ${s.food.describe}`).join('; ')}.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Test each sample for starch, reducing sugar, protein and fat (oil); where the Benedict’s test is negative, test for a non-reducing sugar.</li>
        <li>Record each test, its observation and the inference in a table.</li>
        <li>Name the food substances present in P, Q and R.</li>
        <li>State two precautions and answer the question on the non-reducing sugar test.</li>
      </ol>
      <p className="text-muted-foreground">Heat tubes only in the boiling water bath, held with a test-tube holder and pointed away from people. NaOH and acid are corrosive; ethanol and Sudan III are flammable — keep them away from the flame.</p>
    </div>
  );
}
