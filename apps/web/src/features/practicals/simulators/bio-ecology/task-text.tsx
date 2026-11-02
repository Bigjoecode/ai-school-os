import type { BioEcologyVariant } from '@aischool/shared';

/** The task card's text for each investigation. */
export function TaskText({ v }: { v: BioEcologyVariant }) {
  if (v.task === 'CAPTURE')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a sweep net, a collecting box, a white tray, non-toxic paint and a fine brush, red gloss paint, scissors and a stopwatch. Grasshoppers live in the 20 m × 20 m plot on the school field.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Sweep the plot for a fixed time. Count the grasshoppers caught (n₁).</li>
          <li>Mark each one in a way that does not harm it or make it easier for predators to see, and release them where they were caught.</li>
          <li>After a suitable time, sweep the plot again in the same way (n₂). Count the marked grasshoppers in this catch (m), then release them.</li>
          <li>Estimate the population, N = n₁ × n₂ ÷ m, the % of the second catch that was marked and the population density.</li>
          <li>State the assumptions of the method, two sources of error, two precautions and an explanation.</li>
        </ol>
        <p className="text-muted-foreground">Wear covered shoes; look out for biting ants and wasps in the long grass. Handle the grasshoppers gently and wash your hands afterwards.</p>
      </div>
    );
  if (v.task === 'FACTORS')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a thermometer, a soil thermometer, a wet-and-dry bulb hygrometer and humidity table, a light meter, an anemometer, a soil pH kit with universal indicator, a Secchi disc, and the school weather station (Six’s thermometer, rain gauge, wind vane).</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Each morning at 9 am, read the Six’s maximum and minimum thermometer and the rain gauge (then reset and empty them) and note the wind direction.</li>
          <li>At about the same time each day, read the air temperature (1 m up, shaded), soil temperature (10 cm), wet and dry bulbs, light and wind speed in the open field and under the tree canopy. Find each soil’s pH once.</li>
          <li>Repeat on three days. Work out the relative humidity from the table and the mean of each factor at each site.</li>
          <li>Work out the daily mean and range of temperature and the total and mean rainfall. Read the Secchi disc depth at the pond.</li>
          <li>Compare the two sites and relate your readings to the organisms found in each. State two precautions and explain.</li>
        </ol>
        <p className="text-muted-foreground">Keep well back from the pond edge and work in pairs. Wear a hat and drink water in the sun. A broken thermometer: tell the teacher — do not touch it.</p>
      </div>
    );
  if (v.task === 'SOIL')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with dry sandy, loamy and clay soil, a jar, three funnels with cotton wool, measuring cylinders, a glass rod, crucibles, a balance (0.01 g), a Bunsen burner, tripod and pipe-clay triangle, tongs, a desiccator and a stopwatch.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Shake some loam with water in a jar and leave it to settle. Measure the thickness of each layer, work out the % of each and label a drawing of the jar.</li>
          <li>Put 100 g of each dry soil into a funnel plugged with cotton wool. Pour 100 cm³ of water onto each together and read the volume collected at 1, 2, 5, 10, 20 and 30 minutes. Plot the results and work out the water retained.</li>
          <li>Add 50 cm³ of each dry soil to 50 cm³ of water, stir to release the air and read the final volume. Work out the % air.</li>
          <li>Weigh a crucible, then with oven-dried soil; heat strongly 20 minutes, cool and reweigh — to constant mass. Work out the % humus.</li>
          <li>State your conclusions, two precautions and an explanation.</li>
        </ol>
        <p className="text-muted-foreground">Goggles on for the heating; hot crucibles only with tongs. Wash your hands after handling soil.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with a 1 m × 1 m quadrat with a string grid, pegs, two 30 m tapes, a random-number table and an identification guide. The study plot is 20 m × 20 m of grassland on the school field.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Peg out the plot with the tapes along two edges as axes.</li>
        <li>Use pairs of random numbers (00–19) as coordinates to place at least 10 quadrats.</li>
        <li>In each quadrat count the plants of <i>Tridax procumbens</i>, <i>Sida acuta</i> and <i>Euphorbia hirta</i> (count plants on the frame on two sides only) and estimate the % cover of grass from the grid.</li>
        <li>Calculate the density, frequency and estimated population of each herb and the mean grass cover. Draw a bar chart of the densities.</li>
        <li>Name the most frequent and the most dense herb. State two precautions and explain why the quadrats are placed at random.</li>
      </ol>
      <p className="text-muted-foreground">Look out for snakes, scorpions and biting ants; wear covered shoes. Never throw a quadrat towards anyone.</p>
    </div>
  );
}
