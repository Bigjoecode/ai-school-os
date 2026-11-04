import { AIR_MIN, type BioDissectionVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioDissectionVariant }) {
  if (v.task === 'RAT')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a rat killed humanely by the teacher, a dissecting board and pins, a scalpel, fine scissors, forceps, a seeker, gloves, a ruler, thread, water, cotton wool and disinfectant.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Pin the rat on its back by its four limbs. Measure its body length from the snout to the anus.</li>
          <li>Lift the skin of the lower abdomen with forceps and cut along the midline up to the jaw; make cuts sideways at each end and pin the skin back. Open the body wall in the same way.</li>
          <li>Displace the gut to one side and unravel it with a seeker without tearing the mesentery. Keep the specimen moist.</li>
          <li>Measure the small and large intestines. Work out the ratio of gut length to body length.</li>
          <li>Make a large, labelled drawing of the dissection as displayed. State whether a gall bladder is present, two precautions and explain how the gut suits the diet.</li>
        </ol>
        <p className="text-muted-foreground">Wear gloves. Cut away from the body; handle blades carefully. Disinfect the tools and the board and wash your hands at the end.</p>
      </div>
    );
  if (v.task === 'MICROBE')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with four sterile Petri dishes of nutrient agar, adhesive tape, a marker, soap, disinfectant, an incubator, bread, water, polythene bags, a hand lens and a teacher-prepared slide of bread mould.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Label the four plates on the base: control, air, unwashed finger and washed finger.</li>
          <li>Leave the air plate open for {AIR_MIN} minutes; touch the next lightly with an unwashed finger, and the last after washing your hands with soap; do not open the control.</li>
          <li>Tape the lids with two short strips, invert the plates and incubate at 25–30 °C for 2–3 days. Count the colonies without opening the plates and describe them; work out the % reduction.</li>
          <li>Expose moist bread to the air for 30 minutes and keep it in a polythene bag in a warm, dark place, beside dry bread and bread in a refrigerator, for 3–5 days. Examine the mould with a hand lens and the slide; draw and label it.</li>
          <li>State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Never open a plate after incubation. Dispose of the plates, still taped, in strong disinfectant.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with a young balsam plant with its roots, a beaker of eosin solution, a razor blade, a white tile, a ruler, a stopwatch, a hand lens and a microscope.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Wash the roots free of soil and stand them in the eosin. Leave the plant in a well-lit, airy place.</li>
        <li>At intervals, measure the height of the red colour in the stem above the dye; note when the leaf veins turn red.</li>
        <li>Cut thin transverse sections of the stem at different heights and a longitudinal section; examine them with the hand lens or the microscope. Record what each shows.</li>
        <li>Draw a transverse section and shade the stained tissue; label it.</li>
        <li>Work out the mean rate of rise in cm per minute and cm per hour. State the tissue stained, two precautions and explain your results.</li>
      </ol>
      <p className="text-muted-foreground">Eosin stains skin and clothes. Cut away from your fingers, on the tile.</p>
    </div>
  );
}
