import { BREATH_TIDAL, PULSE_BACK, REACT_MIN_DOM, REACT_MIN_OTHER, type BioHumanVariant } from '@aischool/shared';

/** The task card's text for each task. */
export function TaskText({ v }: { v: BioHumanVariant }) {
  if (v.task === 'BREATH')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with the inhaled/exhaled air apparatus (two boiling tubes, A and B, with two-holed stoppers, bent glass tubes and a mouthpiece), lime water, a mirror, cobalt chloride paper, a thermometer and a stopwatch. Work with a partner.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Fit a clean mouthpiece and pour equal volumes of lime water into A and B. Breathing in draws room air through A; breathing out passes through B.</li>
          <li>Your partner breathes gently in and out through the mouthpiece about 10 times. Which lime water turns milky first? Describe both.</li>
          <li>Wipe a mirror dry; your partner breathes on it. Test the mist with cobalt chloride paper.</li>
          <li>Record the room temperature, then the temperature when your partner breathes onto the bulb.</li>
          <li>Count your partner’s breaths at rest for one minute, three times. Find the mean and the ventilation (tidal volume {BREATH_TIDAL} cm³). Inhaled air has 0.04 % CO₂ and exhaled air about 4 %: how many times more? State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Breathe gently and never suck lime water into the mouth. Use a clean mouthpiece for each student.</p>
      </div>
    );
  if (v.task === 'REACTION')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a metre rule and a chair. Work with a partner. Time from distance: t = √(2d ÷ g), g = 9.8 m/s².</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Your partner sits with one leg crossed loosely over the other. Tap just below the kneecap gently with the side of your hand. Describe what happens.</li>
          <li>Your partner rests the forearm on the bench edge, finger and thumb apart, level with the 0 cm mark of the hanging metre rule.</li>
          <li>
            Release the rule without warning; your partner catches it. Read the distance at the top of the thumb (to 0.5 cm). Do this {REACT_MIN_DOM} times with the dominant hand and at least {REACT_MIN_OTHER} times with the other hand.
          </li>
          <li>You may repeat with your partner’s eyes closed, saying “now” as you drop it.</li>
          <li>Find each mean distance, convert it to metres and calculate the reaction time. Which hand is faster? Did practice make a difference? State whether each action is a reflex or voluntary, two precautions and explain.</li>
        </ol>
        <p className="text-muted-foreground">Tap the knee gently — never with a hard object. Keep feet clear of the falling rule.</p>
      </div>
    );
  if (v.task === 'SKIN')
    return (
      <div className="space-y-2 text-[13.5px] leading-relaxed">
        <p>You are provided with a pair of blunt points (dividers), a mm ruler, a blindfold and alcohol wipes. Work with a partner as the subject.</p>
        <ol className="list-[lower-alpha] space-y-0.5 pl-6">
          <li>Clean the points with alcohol and blindfold the subject.</li>
          <li>Touch the fingertip gently with both points together, 10 mm apart, or at random with one point only. Ask “one or two?”.</li>
          <li>Reduce the separation in 1 mm steps (larger steps on less sensitive skin) to find the smallest separation still felt as two.</li>
          <li>Repeat on the palm, the back of the hand, the forearm and the back of the neck. Record each threshold, the touches and the correct answers, and the % correct.</li>
          <li>Draw a bar chart of the thresholds, rank the areas and work out forearm ÷ fingertip. State your conclusions, two precautions and explain your results.</li>
        </ol>
        <p className="text-muted-foreground">Use blunt points and press gently: never break the skin.</p>
      </div>
    );
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed">
      <p>You are provided with a stopwatch, a step (a low box) and graph paper. Work with a partner.</p>
      <ol className="list-[lower-alpha] space-y-0.5 pl-6">
        <li>Ask your partner about asthma, heart or sickle-cell conditions: if they have one, they record and someone else exercises.</li>
        <li>Your partner sits quietly for 5 minutes. Find the radial pulse at the wrist with two fingertips (not the thumb). Count it for 15 s three times; find the mean resting rate in beats/min.</li>
        <li>Your partner does step-ups for 2 minutes. Immediately count the pulse for 15 s, then again every minute until it is back to the resting rate (within {PULSE_BACK} beats/min).</li>
        <li>Tabulate the counts and rates; plot pulse rate against time and draw a smooth curve.</li>
        <li>Calculate the % increase and state the recovery time. State your conclusions, two precautions and explain your results.</li>
      </ol>
      <p className="text-muted-foreground">Exercise on a dry, flat floor; stop at once if your partner feels dizzy.</p>
    </div>
  );
}
