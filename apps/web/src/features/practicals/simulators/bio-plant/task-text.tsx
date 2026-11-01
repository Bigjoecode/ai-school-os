import { POTO_DIST, type BioPlantVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioPlantVariant }) {
  if (v.task === 'OXYGEN')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a freshly cut piece of pondweed (Elodea), a large beaker of water, sodium hydrogencarbonate, a glass funnel, a test tube, a bench lamp, a metre rule, a water trough, a thermometer, a stopwatch and a splint.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Set up the plant under the inverted funnel in water with a pinch of sodium hydrogencarbonate, with a test tube full of water over the funnel stem.</li>
          <li>Place the lamp 10 cm from the beaker, with the water trough between them. Allow 5 minutes, then count the bubbles released in one minute three times.</li>
          <li>Repeat with the lamp at 20, 30, 40 and 50 cm and further, until the bubbling stops. Keep the temperature constant.</li>
          <li>Work out the mean rate and the light intensity (10 000 ÷ d²) for each distance; plot the mean rate against light intensity.</li>
          <li>Test the gas collected with a glowing splint. State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Keep the lamp and its lead away from the water. The lamp gets hot.</p>
      </div>
    );
  if (v.task === 'STARCH')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a potted variegated plant that has been kept in the dark for 48 hours, aluminium foil, a flask with potassium hydroxide, a water bath on a tripod with a Bunsen burner, boiling tubes, ethanol, iodine solution, forceps, a white tile and 1 cm² grid paper.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Fix a strip of foil across both sides of one leaf and seal another leaf in the flask with potassium hydroxide. Put the plant in bright light for 4–6 hours.</li>
          <li>Pick the foil-strip leaf, a variegated leaf, the leaf from the flask and a green leaf. Draw the pattern of the variegated leaf.</li>
          <li>Boil each leaf in water for one minute. Turn off the flame, then put the leaf in a boiling tube of ethanol standing in the hot water until it is decolourised.</li>
          <li>Dip it in warm water, spread it on the white tile and cover it with iodine solution. Record what you see and your inference for each leaf.</li>
          <li>Lay the foil-strip leaf on the grid and count the squares it covers and the blue-black squares; work out the percentage that made starch.</li>
        </ol>
        <p className="text-muted-foreground">Ethanol is highly flammable: never heat it over a flame — turn the flame off first. Handle hot leaves with forceps.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with a leafy shoot, a bubble potometer (capillary radius {v.poto.r} mm, with a mm scale and a reservoir), a bowl of water, Vaseline, a fan, a lamp, a black bag, a clear polythene bag and a stopwatch.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Cut the shoot under water, fit it into the potometer under water and seal the joint with Vaseline. Let one air bubble into the capillary.</li>
        <li>In still air, allow the shoot 5 minutes to adjust. Reset the bubble to the zero mark and time it over {POTO_DIST} mm. Do this three times.</li>
        <li>Repeat with the fan blowing on the shoot, in bright light, in the dark and in humid air (at least two of these), allowing 5 minutes each time.</li>
        <li>Work out the mean time, the rate of movement (mm/min) and the volume of water taken up per minute (rate × πr²). Draw a bar chart of the rates.</li>
        <li>State which condition gave the fastest uptake, your conclusions, two precautions and explain your results.</li>
      </ol>
      <p className="text-muted-foreground">Keep the fan and electrical leads away from the water. Handle the glass capillary with care.</p>
    </div>
  );
}
