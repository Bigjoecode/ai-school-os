import { CROSS_N, DISC_TRIES, FOOD_SPOTS, type BioGeneticsVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioGeneticsVariant }) {
  if (v.task === 'DISCRETE')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a mirror, a class survey sheet and the school health cards of your {v.disc.n} classmates (blood groups recorded with consent). No blood is taken in class.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Record the survey anonymously, by number.</li>
          <li>Ask each classmate to roll the tongue into a U-shape (a mirror helps). Anyone who cannot at first tries again — up to {DISC_TRIES} attempts. Record R (roller) or N (non-roller).</li>
          <li>Record each classmate’s ABO blood group from the health card.</li>
          <li>Tally the results. Calculate the percentage of rollers and non-rollers and their pie-chart angles; draw a pie chart for tongue rolling.</li>
          <li>Calculate the percentage of each blood group and draw a bar chart (with gaps). Which group is the most common? State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Respect privacy: record by number, never by name.</p>
      </div>
    );
  if (v.task === 'CROSS')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with two beakers, 100 red beads (dominant allele T, tall) and 100 white beads (recessive allele t, short), all the same size, and a tally sheet.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Put 50 red and 50 white beads in each beaker: the gametes of two heterozygous (Tt) parents.</li>
          <li>Without looking, pick one bead from each beaker and record the pair (TT, Tt or tt). Return the beads and shake the beakers.</li>
          <li>Repeat {CROSS_N} times, recording each batch of ten.</li>
          <li>Count the genotypes and phenotypes; work out the ratio of dominant to recessive as x : 1 and the expected numbers. What is the probability of tt?</li>
          <li>Combine your result with the class results. Which is closer to 3 : 1? State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Keep the beads off the floor.</p>
      </div>
    );
  if (v.task === 'FOOD')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with field notes from {FOOD_SPOTS.length} spots on the school field (a sweep net, pooters and a hand lens were used), an identification chart, a data card and graph paper.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Wear covered shoes and gloves. Survey each spot: record the organisms, how many there are, and what each was seen feeding on.</li>
          <li>Write at least three food chains, with arrows from the food to the feeder.</li>
          <li>Combine them into a food web, and assign each organism to a trophic level.</li>
          <li>Draw a pyramid of numbers for grass → grasshopper → lizard → hawk, and a pyramid of energy from the data card, both to a stated scale.</li>
          <li>Calculate the efficiency of transfer from producers to primary consumers. Which pyramid can be inverted? State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Avoid stinging insects; wash your hands after field work.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with a height board (metre rule against the wall), a set square, a ruler, graph paper and a class record sheet. Your class has {v.height.n} students.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Measure the height of each student to the nearest cm — shoes off, standing straight against the board, a set square flat on the head, read at eye level. Anyone may decline to be measured.</li>
        <li>Measure each student’s hand span (thumb tip to little-finger tip, fingers spread) to the nearest 0.5 cm.</li>
        <li>Group the heights into classes of equal width (e.g. 150–154, 155–159 cm) and count the frequency of each.</li>
        <li>Draw a histogram of frequency against height class.</li>
        <li>Calculate the mean height, state the modal class and the range; find the mean and range of the hand spans. State your conclusions, two precautions and explain your results.</li>
      </ol>
      <p className="text-muted-foreground">Measure respectfully; stand on a flat floor without shoes.</p>
    </div>
  );
}
