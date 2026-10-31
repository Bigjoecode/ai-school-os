import type { BioOsmosisVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioOsmosisVariant }) {
  if (v.task === 'PLASMOLYSIS')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a red onion (or Rhoeo leaf), distilled water, 1.0 mol/dm³ sucrose solution, concentrated salt solution, filter paper and a microscope.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Peel a thin strip of the coloured epidermis and mount it in a drop of distilled water under a cover slip. Observe it under low power, then high power, and record what you see.</li>
          <li>Place a drop of the strong solution at one edge of the cover slip and draw it under with filter paper at the opposite edge. After 5–10 minutes, record what you see.</li>
          <li>Count the cells in the high-power field (only those with their centre inside it) and those that are plasmolysed. Work out the percentage plasmolysed.</li>
          <li>Draw water under the cover slip in the same way; after 10 minutes record what you see.</li>
          <li>Label the drawing of a plasmolysed cell, state two precautions and explain your observations.</li>
        </ol>
        <p className="text-muted-foreground">Slides, cover slips and blades are sharp when broken: broken glass goes in the sharps jar.</p>
      </div>
    );
  if (v.task === 'AGAR')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a block of agar containing phenolphthalein and a little sodium hydroxide (pink), dilute hydrochloric acid (0.1 mol/dm³), a scalpel, a tile, a ruler and a stopwatch.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Cut cubes with sides 1 cm, 2 cm and 3 cm (and a spare cube). Measure each side and work out its surface area, volume and surface area : volume ratio.</li>
          <li>Put all the cubes into the acid at the same time, fully covered, and start the stopwatch.</li>
          <li>Record the time each cube takes to become completely colourless.</li>
          <li>After about 5 minutes take out the spare cube, cut it in half and measure the depth of the colourless zone. Work out the rate of diffusion and the percentage of that cube that was colourless.</li>
          <li>State which cube became colourless first, your conclusion, two precautions and an explanation.</li>
        </ol>
        <p className="text-muted-foreground">Wear goggles: acid and alkali harm the eyes. Cut on the tile, away from your fingers.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with an Irish potato, a cork borer, a scalpel and tile, a ruler (mm), a balance (0.01 g), filter paper, and sucrose solutions of 0.1 to 1.0 mol/dm³ with distilled water.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Bore cylinders from the same tuber and trim each to 50 mm. Blot each dry, measure its length and weigh it.</li>
        <li>Put one cylinder into distilled water and one into each of at least four sucrose solutions, all at the same time. Leave them at least 30 minutes (better an hour).</li>
        <li>Remove them, blot gently, measure and weigh each again and note whether it is firm or soft.</li>
        <li>Work out the % change in length and in mass. Plot % change in mass against concentration and draw the best line.</li>
        <li>From your graph read the isotonic concentration (the concentration of the cell sap). State two precautions and explain your results.</li>
      </ol>
      <p className="text-muted-foreground">Push the cork borer into the potato on the tile, away from your hand; cut on the tile, never on your palm.</p>
    </div>
  );
}
