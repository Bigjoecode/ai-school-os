import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';

/** The circuit lab's "What is this?" cards. */
const E: Record<string, Explainer> = {
  cells: { name: 'Battery (two 1.5 V cells)', purpose: 'Supplies the e.m.f. (3.0 V) that drives the current round the circuit.', how: 'Join its + terminal (red) towards the + terminals of the meters.', mistake: 'Joining + straight to − with a wire: a short circuit.', keys: ['cell', 'battery', 'supply'] },
  key: { name: 'Plug key (switch)', purpose: 'Switches the current on and off.', how: 'Push the plug in only while you read the meters, then pull it out.', mistake: 'Leaving it closed between readings: the wire heats up and its resistance rises.', keys: ['key', 'switch'] },
  rheostat: { name: 'Rheostat (variable resistor, 0–20 Ω)', purpose: 'Changes the current in the circuit so you can take readings at different currents.', how: 'Wire one end terminal and the slider terminal in series. Slide the contact to change the resistance in use.', mistake: 'Using both end terminals: then the slider does nothing.', keys: ['rheostat'] },
  ammeter: { name: 'Ammeter (0–1 A)', purpose: 'Measures the current through the resistor or wire.', how: 'In series, with its + terminal towards the + of the battery. Read the pointer from directly in front, to half a division.', mistake: 'Connecting it across something — it has almost no resistance, so it shorts it out.', keys: ['ammeter', 'series', 'parallax', 'zero'] },
  voltmeter: { name: 'Voltmeter (0–3 V)', purpose: 'Measures the potential difference across the resistor or the length of wire.', how: 'In parallel, across the test element only, + towards the + of the battery.', mistake: 'Connecting it across the resistor and the ammeter together.', keys: ['voltmeter', 'parallel', 'parallax'] },
  resistor: { name: 'Standard resistor R', purpose: 'The conductor whose resistance you find, and which obeys Ohm’s law.', how: 'In series with the ammeter; the voltmeter across its two terminals.', mistake: 'Letting it heat up by leaving the key closed.', keys: ['resistor', 'heating'] },
  wireRule: { name: 'Resistance wire on a metre rule, with jockey', purpose: 'A uniform wire: the length L in the circuit is set by where the jockey touches it.', how: 'Join the 0 cm end and the jockey into the circuit. Press the jockey down at each length; do not slide it along the wire.', mistake: 'Measuring L from the wrong end, or scraping the jockey along the wire.', keys: ['wire', 'jockey', 'length', 'constantan'] },
  wires: { name: 'Connecting wires', purpose: 'Join the terminals of the apparatus.', how: 'Clean ends, screwed down tightly on the terminals.', mistake: 'Loose or dirty connections add resistance and make the readings jump.', keys: ['connection', 'terminal', 'clean', 'tight'] },
  terminal: { name: 'Terminal post', purpose: 'Where a connecting wire is screwed on.', how: 'Drag from one terminal to another to join them; red caps are + terminals.', mistake: 'A loose connection.', keys: ['terminal', 'connection'] },
  board: { name: 'Circuit board', purpose: 'Holds the apparatus so the circuit can be laid out neatly.', how: 'Lay the circuit out like the circuit diagram, then join the wires.', mistake: 'A tangle of wires that is hard to check.', keys: [] },
  micrometer: { name: 'Micrometer screw gauge', purpose: 'Measures the wire’s diameter d to 0.01 mm.', how: 'Measure d at several places along the wire and take the mean; correct any zero error. A = πd²/4.', mistake: 'Using the diameter as the radius, or forgetting to convert mm to m.', keys: ['micrometer', 'diameter'] },
  galvanometer: { name: 'Galvanometer', purpose: 'Detects very small currents (e.g. in a metre bridge).', how: 'Not needed here: the ammeter measures the current.', mistake: 'Putting it in this circuit — the current is far too big for it.', keys: [] },
  bulb: { name: 'Torch bulb', purpose: 'A filament lamp: it does NOT obey Ohm’s law (it heats up).', how: 'Not used in this experiment.', mistake: 'Using it instead of the standard resistor.', keys: [] },
  springBalance: { name: 'Spring balance', purpose: 'Measures force (newtons).', how: 'Not needed in an electricity practical.', mistake: 'Cluttering the bench.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your table, graph, calculations and answers — this is what is marked.', how: 'Write each reading as you take it, I and V to 2 decimal places.', mistake: 'Plotting I against V and calling the slope R (it would be 1/R).', keys: ['record', 'decimal', 'plot'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it before you wire the circuit.', mistake: 'Missing what to plot.', keys: [] },
  coat: { name: 'Lab coat', purpose: 'Keeps your clothes clean.', how: 'Optional in the physics lab.', mistake: '', keys: [] },
  goggles: { name: 'Safety goggles', purpose: 'Eye protection.', how: 'Not needed for low-voltage circuits.', mistake: '', keys: [] },
  co2: { name: 'CO₂ fire extinguisher', purpose: 'Puts out electrical fires without conducting electricity.', how: 'Switch off first; aim at the base of the fire. Tell the teacher.', mistake: 'Using water on an electrical fire.', keys: ['fire'] },
  blanket: { name: 'Fire blanket', purpose: 'Smothers a small fire or wraps a person whose clothes are burning.', how: 'Pull the tapes down sharply and lay it over the fire.', mistake: 'Not knowing where it is.', keys: [] },
  extinguisher: { name: 'Fire extinguisher', purpose: 'Puts out small fires.', how: 'Tell the teacher; aim at the base of the fire.', mistake: '', keys: [] },
  firstaid: { name: 'First-aid box', purpose: 'Plasters and dressings for small injuries.', how: 'Tell the teacher about every burn or cut.', mistake: '', keys: [] },
  eyewash: { name: 'Eye-wash station', purpose: 'Rinses dust or chemicals out of the eyes.', how: 'Rinse with plenty of water and tell the teacher.', mistake: '', keys: [] },
  shelf: { name: 'Physics equipment shelf', purpose: 'Spare meters, power packs, magnets, lenses, springs and masses.', how: 'Your apparatus is in the cupboard; ask before taking anything here.', mistake: '', keys: [] },
  vdg: { name: 'Van de Graaff generator', purpose: 'Builds up a very high voltage for electrostatics demonstrations.', how: 'Only the teacher uses it.', mistake: 'Touching the dome.', keys: [] },
  notice: { name: 'Notice board', purpose: 'Timetables, rules and tips from the physics department.', how: 'Read the WAEC tips!', mistake: '', keys: [] },
  'poster-si': { name: 'SI base units', purpose: 'The seven base units, and derived ones such as the ohm (Ω = V A⁻¹).', how: 'Every answer needs its unit.', mistake: '', keys: [] },
  'poster-electric': { name: 'Electrical safety', purpose: 'The rules for working with circuits.', how: 'Low voltage only; open the key between readings.', mistake: '', keys: ['mains', 'key'] },
  'poster-light': { name: 'Refraction of light', purpose: 'Snell’s law for a glass block.', how: 'For another practical.', mistake: '', keys: [] },
  whiteboard: { name: 'Whiteboard', purpose: 'Today’s practical.', how: '', mistake: '', keys: [] },
  desk: { name: 'Teacher’s desk', purpose: 'Where the teacher checks your circuit before you switch on.', how: '', mistake: '', keys: [] },
};
export const explainer = makeExplainer(E, { 'term:': 'terminal', 'wire:': 'wires' });

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why is the ammeter in series?', 'Why is the voltmeter in parallel?', 'What does the rheostat do?', 'Why open the key between readings?'],
  DEMO: ['Why do you open the key after each reading?', 'How do you read the meter without parallax?', 'Why is the slope of V against I the resistance?', 'What if a meter is connected the wrong way round?'],
  TRY: ['Where does the voltmeter go?', 'My ammeter reads zero — why?', 'How many decimal places for I and V?', 'How do I find the slope?'],
  SANDBOX: ['What happens with a bigger resistor?', 'Why does a nichrome wire have more resistance?', 'What if the wire were thicker?', 'Does a bulb obey Ohm’s law?'],
};
