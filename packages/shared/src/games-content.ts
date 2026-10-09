import {
  CROSSWORD_ROUND,
  EARLY_ROUND,
  MATHS_SPRINT,
  MIN_ANSWER_MS,
  mathsRound,
  normaliseWord,
  preferYear,
  seededRandom,
  TF_BLITZ,
  WORD_ROUND,
  WORD_SEARCH_ROUND,
  YOUNG_ROUND,
  type GameLevel,
  type LocalScoreInput,
} from './games';
import { earlyRound } from './games-early';
import { ALL_PACK_FACTS, ALL_PACK_MATCH_PACKS, ALL_PACK_QUESTIONS, ALL_PACK_WORDS } from './games-packs';
import { buildCrossword, buildWordSearch, DIRS_ALL, DIRS_PRIMARY, DIRS_YOUNG, lineLetters, puzzleForm, type CrosswordPuzzle, type PuzzleWord, type WordSearchPuzzle } from './games-puzzles';

/**
 * Curated EduGames content: match packs, true-or-false facts, quiz questions
 * and spelling lists, written for Nigerian primary and secondary students
 * (British spelling, as WAEC, NECO and BECE use). Everything here is checked
 * fact by fact; ids are stable so scores sent later (offline) still mark.
 *
 * Quiz questions list the right answer first (`a`) and three wrong ones (`w`);
 * the server mixes the options before a student sees them.
 */

// ------------------------------------------------------------ match packs

export interface MatchPack {
  id: string;
  title: string;
  subject: string;
  levels: GameLevel[];
  leftLabel: string;
  rightLabel: string;
  pairs: [string, string][];
  /** School years within the stage this suits (e.g. [1, 2, 3] = Primary 1–3); empty or missing = the whole stage. */
  years?: number[];
}

const BASE_MATCH_PACKS: MatchPack[] = [
  {
    id: 'ng-states',
    title: 'Nigerian states and capitals',
    subject: 'Social Studies',
    levels: ['PRIMARY', 'JUNIOR', 'SENIOR'],
    leftLabel: 'State',
    rightLabel: 'Capital',
    // All 36 states and the FCT.
    pairs: [
      ['Abia', 'Umuahia'],
      ['Adamawa', 'Yola'],
      ['Akwa Ibom', 'Uyo'],
      ['Anambra', 'Awka'],
      ['Bauchi', 'Bauchi'],
      ['Bayelsa', 'Yenagoa'],
      ['Benue', 'Makurdi'],
      ['Borno', 'Maiduguri'],
      ['Cross River', 'Calabar'],
      ['Delta', 'Asaba'],
      ['Ebonyi', 'Abakaliki'],
      ['Edo', 'Benin City'],
      ['Ekiti', 'Ado-Ekiti'],
      ['Enugu', 'Enugu'],
      ['Gombe', 'Gombe'],
      ['Imo', 'Owerri'],
      ['Jigawa', 'Dutse'],
      ['Kaduna', 'Kaduna'],
      ['Kano', 'Kano'],
      ['Katsina', 'Katsina'],
      ['Kebbi', 'Birnin Kebbi'],
      ['Kogi', 'Lokoja'],
      ['Kwara', 'Ilorin'],
      ['Lagos', 'Ikeja'],
      ['Nasarawa', 'Lafia'],
      ['Niger', 'Minna'],
      ['Ogun', 'Abeokuta'],
      ['Ondo', 'Akure'],
      ['Osun', 'Osogbo'],
      ['Oyo', 'Ibadan'],
      ['Plateau', 'Jos'],
      ['Rivers', 'Port Harcourt'],
      ['Sokoto', 'Sokoto'],
      ['Taraba', 'Jalingo'],
      ['Yobe', 'Damaturu'],
      ['Zamfara', 'Gusau'],
      ['Federal Capital Territory', 'Abuja'],
    ],
  },
  {
    id: 'elements-20',
    title: 'First 20 elements and their symbols',
    subject: 'Chemistry',
    levels: ['JUNIOR', 'SENIOR'],
    leftLabel: 'Element',
    rightLabel: 'Symbol',
    pairs: [
      ['Hydrogen', 'H'],
      ['Helium', 'He'],
      ['Lithium', 'Li'],
      ['Beryllium', 'Be'],
      ['Boron', 'B'],
      ['Carbon', 'C'],
      ['Nitrogen', 'N'],
      ['Oxygen', 'O'],
      ['Fluorine', 'F'],
      ['Neon', 'Ne'],
      ['Sodium', 'Na'],
      ['Magnesium', 'Mg'],
      ['Aluminium', 'Al'],
      ['Silicon', 'Si'],
      ['Phosphorus', 'P'],
      ['Sulphur', 'S'],
      ['Chlorine', 'Cl'],
      ['Argon', 'Ar'],
      ['Potassium', 'K'],
      ['Calcium', 'Ca'],
    ],
  },
  {
    id: 'science-terms',
    title: 'Basic science terms',
    subject: 'Basic Science',
    levels: ['PRIMARY', 'JUNIOR'],
    leftLabel: 'Term',
    rightLabel: 'Meaning',
    pairs: [
      ['Photosynthesis', 'How green plants make food using sunlight'],
      ['Evaporation', 'A liquid changing into vapour'],
      ['Condensation', 'Vapour cooling to form a liquid'],
      ['Melting', 'A solid changing to a liquid when heated'],
      ['Freezing', 'A liquid changing to a solid when cooled'],
      ['Sublimation', 'A solid changing straight into a gas'],
      ['Respiration', 'Releasing energy from food in living cells'],
      ['Excretion', 'Removing waste made by the body'],
      ['Mass', 'The quantity of matter in a body'],
      ['Force', 'A push or a pull'],
      ['Habitat', 'The natural home of a living thing'],
      ['Germination', 'A seed starting to grow'],
      ['Pollination', 'Pollen moving from anther to stigma'],
      ['Conductor', 'Lets heat or electricity pass through easily'],
      ['Insulator', 'Does not let heat or electricity pass easily'],
    ],
  },
  {
    id: 'si-units',
    title: 'Quantities and their SI units',
    subject: 'Physics',
    levels: ['JUNIOR', 'SENIOR'],
    leftLabel: 'Quantity',
    rightLabel: 'SI unit',
    pairs: [
      ['Mass', 'kilogram (kg)'],
      ['Length', 'metre (m)'],
      ['Time', 'second (s)'],
      ['Electric current', 'ampere (A)'],
      ['Temperature', 'kelvin (K)'],
      ['Amount of substance', 'mole (mol)'],
      ['Force', 'newton (N)'],
      ['Energy', 'joule (J)'],
      ['Power', 'watt (W)'],
      ['Pressure', 'pascal (Pa)'],
      ['Frequency', 'hertz (Hz)'],
      ['Electric charge', 'coulomb (C)'],
    ],
  },
  {
    id: 'synonyms',
    title: 'Synonyms (words with the same meaning)',
    subject: 'English Language',
    levels: ['JUNIOR', 'SENIOR'],
    leftLabel: 'Word',
    rightLabel: 'Same meaning',
    pairs: [
      ['Begin', 'Commence'],
      ['Brave', 'Courageous'],
      ['Buy', 'Purchase'],
      ['Help', 'Assist'],
      ['Rich', 'Wealthy'],
      ['Tired', 'Weary'],
      ['Hide', 'Conceal'],
      ['Famous', 'Renowned'],
      ['Enough', 'Sufficient'],
      ['Diligent', 'Hardworking'],
      ['Obstinate', 'Stubborn'],
      ['Candid', 'Frank'],
      ['Meagre', 'Scanty'],
      ['Abandon', 'Forsake'],
    ],
  },
  {
    id: 'antonyms',
    title: 'Antonyms (opposite meanings)',
    subject: 'English Language',
    levels: ['JUNIOR', 'SENIOR'],
    leftLabel: 'Word',
    rightLabel: 'Opposite',
    pairs: [
      ['Ancient', 'Modern'],
      ['Increase', 'Decrease'],
      ['Victory', 'Defeat'],
      ['Accept', 'Reject'],
      ['Arrival', 'Departure'],
      ['Optimistic', 'Pessimistic'],
      ['Scarce', 'Abundant'],
      ['Temporary', 'Permanent'],
      ['Interior', 'Exterior'],
      ['Maximum', 'Minimum'],
      ['Superior', 'Inferior'],
      ['Guilty', 'Innocent'],
      ['Shallow', 'Deep'],
      ['Rigid', 'Flexible'],
    ],
  },
  {
    id: 'opposites-primary',
    title: 'Opposites',
    subject: 'English Language',
    levels: ['PRIMARY'],
    years: [1, 2, 3],
    leftLabel: 'Word',
    rightLabel: 'Opposite',
    pairs: [
      ['Hot', 'Cold'],
      ['Up', 'Down'],
      ['Day', 'Night'],
      ['Fast', 'Slow'],
      ['Wet', 'Dry'],
      ['Full', 'Empty'],
      ['Happy', 'Sad'],
      ['Young', 'Old'],
      ['Push', 'Pull'],
      ['Inside', 'Outside'],
      ['Early', 'Late'],
      ['Open', 'Shut'],
    ],
  },
  {
    id: 'animal-young',
    title: 'Animals and their young',
    subject: 'Basic Science',
    levels: ['PRIMARY', 'JUNIOR'],
    // Primary 1–3; within JSS, 1–3 is the whole stage.
    years: [1, 2, 3],
    leftLabel: 'Animal',
    rightLabel: 'Young one',
    pairs: [
      ['Cow', 'Calf'],
      ['Dog', 'Puppy'],
      ['Cat', 'Kitten'],
      ['Goat', 'Kid'],
      ['Sheep', 'Lamb'],
      ['Hen', 'Chick'],
      ['Horse', 'Foal'],
      ['Duck', 'Duckling'],
      ['Lion', 'Cub'],
      ['Pig', 'Piglet'],
      ['Frog', 'Tadpole'],
      ['Goose', 'Gosling'],
    ],
  },
  {
    id: 'ng-milestones',
    title: 'Nigeria: dates to remember',
    subject: 'Civic Education',
    levels: ['JUNIOR', 'SENIOR'],
    leftLabel: 'Event',
    rightLabel: 'Date',
    pairs: [
      ['Amalgamation of the Northern and Southern Protectorates', '1914'],
      ['Independence', '1 October 1960'],
      ['Nigeria becomes a republic', '1 October 1963'],
      ['The naira replaces the pound', '1 January 1973'],
      ['Seat of government moves to Abuja', '12 December 1991'],
      ['Return to civilian rule (Fourth Republic)', '29 May 1999'],
    ],
  },
  {
    id: 'cell-organelles',
    title: 'Parts of the cell and their jobs',
    subject: 'Biology',
    levels: ['SENIOR'],
    leftLabel: 'Organelle',
    rightLabel: 'Function',
    pairs: [
      ['Nucleus', 'Controls the activities of the cell'],
      ['Mitochondrion', 'Releases energy (aerobic respiration)'],
      ['Chloroplast', 'Site of photosynthesis'],
      ['Ribosome', 'Site of protein synthesis'],
      ['Cell membrane', 'Controls what enters and leaves the cell'],
      ['Cell wall', 'Gives a plant cell shape and support'],
      ['Vacuole', 'Stores cell sap'],
      ['Golgi body', 'Packages and secretes substances'],
    ],
  },
  {
    id: 'physics-formulae',
    title: 'Physics formulae',
    subject: 'Physics',
    levels: ['SENIOR'],
    leftLabel: 'Quantity',
    rightLabel: 'Formula',
    pairs: [
      ['Speed', 'distance ÷ time'],
      ['Density', 'mass ÷ volume'],
      ['Pressure', 'force ÷ area'],
      ['Work done', 'force × distance'],
      ['Power', 'work done ÷ time'],
      ['Momentum', 'mass × velocity'],
      ['Weight', 'mass × g'],
      ['Voltage (Ohm’s law)', 'current × resistance'],
      ['Kinetic energy', '½mv²'],
      ['Potential energy', 'mgh'],
    ],
  },
  {
    id: 'chem-formulae',
    title: 'Common chemicals and their formulae',
    subject: 'Chemistry',
    levels: ['SENIOR'],
    leftLabel: 'Substance',
    rightLabel: 'Formula',
    pairs: [
      ['Water', 'H₂O'],
      ['Common salt', 'NaCl'],
      ['Carbon dioxide', 'CO₂'],
      ['Ammonia', 'NH₃'],
      ['Methane', 'CH₄'],
      ['Sulphuric acid', 'H₂SO₄'],
      ['Hydrochloric acid', 'HCl'],
      ['Nitric acid', 'HNO₃'],
      ['Calcium carbonate', 'CaCO₃'],
      ['Sodium hydroxide', 'NaOH'],
      ['Glucose', 'C₆H₁₂O₆'],
      ['Ozone', 'O₃'],
    ],
  },
  {
    id: 'govt-terms',
    title: 'Government terms',
    subject: 'Government',
    levels: ['SENIOR'],
    leftLabel: 'Term',
    rightLabel: 'Meaning',
    pairs: [
      ['Legislature', 'The arm of government that makes laws'],
      ['Executive', 'The arm of government that carries out laws'],
      ['Judiciary', 'The arm of government that interprets laws'],
      ['Franchise', 'The right to vote'],
      ['Constitution', 'The body of rules by which a country is governed'],
      ['Sovereignty', 'Supreme power of a state over its affairs'],
      ['Federalism', 'Power shared between central and state governments'],
      ['Bicameral legislature', 'A law-making body with two chambers'],
    ],
  },
  {
    id: 'econ-terms',
    title: 'Economics terms',
    subject: 'Economics',
    levels: ['SENIOR'],
    leftLabel: 'Term',
    rightLabel: 'Meaning',
    pairs: [
      ['Scarcity', 'Limited resources against unlimited wants'],
      ['Opportunity cost', 'The alternative forgone'],
      ['Inflation', 'A persistent rise in the general price level'],
      ['Demand', 'What buyers are willing and able to buy at a price'],
      ['Wages', 'The reward for labour'],
      ['Rent', 'The reward for land'],
      ['Interest', 'The reward for capital'],
      ['Profit', 'The reward for the entrepreneur'],
    ],
  },
];

/** The packs written for each year group (games-packs/) join the ones above. */
export const MATCH_PACKS: MatchPack[] = [...BASE_MATCH_PACKS, ...ALL_PACK_MATCH_PACKS];

/** "Kano State ↔ Kano" teaches nothing in a memory game: such pairs are skipped when cards are dealt. */
export const isTrivialPair = ([l, r]: [string, string]) => normaliseWord(l) === normaliseWord(r);

/** Match packs for a level, the ones written for the student's year first (the whole stage if fewer than three suit it). */
export const matchPacksFor = (level: GameLevel, year?: number | null) =>
  preferYear(
    MATCH_PACKS.filter((p) => p.levels.includes(level)),
    year,
    3,
  );

// ------------------------------------------------------------ true or false facts

export interface TrueFalseFact {
  id: string;
  level: GameLevel;
  subject: string;
  topic: string | null;
  statement: string;
  answer: boolean;
  explain: string;
  /** School years within the stage this suits (e.g. [1, 2, 3] = Primary 1–3); empty or missing = the whole stage. */
  years?: number[];
}

/** Rows: statement, answer, explanation, then optionally the topic and the school years it suits. */
const tf = (level: GameLevel, prefix: string, subject: string, rows: [string, boolean, string, (string | null)?, number[]?][]): TrueFalseFact[] =>
  rows.map(([statement, answer, explain, topic, years], i) => ({ id: `${prefix}${i + 1}`, level, subject, topic: topic ?? null, statement, answer, explain, ...(years ? { years } : {}) }));

const BASE_FACTS: TrueFalseFact[] = [
  // Primary
  ...tf('PRIMARY', 'pS', 'Basic Science', [
    ['The sun rises in the east.', true, 'The sun rises in the east and sets in the west.', null, [3, 4, 5, 6]],
    ['A spider is an insect.', false, 'Spiders have eight legs: they are arachnids. Insects have six legs.', null, [3, 4, 5, 6]],
    ['Water boils at 100 °C at sea level.', true, 'Pure water boils at 100 °C at normal (sea-level) pressure.', null, [4, 5, 6]],
    ['Plants need sunlight to make their food.', true, 'Green plants make food by photosynthesis, using sunlight.', null, [3, 4, 5, 6]],
    ['Fish breathe with lungs.', false, 'Fish breathe with gills.', null, [3, 4, 5, 6]],
    ['A bat is a bird.', false, 'A bat is a mammal: it feeds its young with milk.', null, [3, 4, 5, 6]],
    ['Ice is water in solid form.', true, 'Water freezes into ice at 0 °C.', null, [3, 4, 5, 6]],
    ['Malaria is spread by houseflies.', false, 'Malaria is spread by the female Anopheles mosquito.', null, [3, 4, 5, 6]],
    ['Washing hands with soap helps to prevent disease.', true, 'Soap and water remove germs from our hands.', null, [1, 2, 3, 4, 5, 6]],
    ['The moon makes its own light.', false, 'The moon reflects light from the sun.', null, [3, 4, 5, 6]],
    ['Snakes are reptiles.', true, 'Snakes, lizards, crocodiles and tortoises are reptiles.', null, [3, 4, 5, 6]],
    ['The heart pumps blood round the body.', true, 'The heart is a muscle that pumps blood.', null, [3, 4, 5, 6]],
  ]),
  ...tf('PRIMARY', 'pM', 'Mathematics', [
    ['A triangle has four sides.', false, 'A triangle has three sides.', null, [1, 2, 3]],
    ['7 × 8 = 56', true, '7 × 8 = 56.', null, [3, 4, 5, 6]],
    ['Half of 50 is 20.', false, 'Half of 50 is 25.', null, [2, 3, 4]],
    ['There are 7 days in a week.', true, 'Monday to Sunday: 7 days.', null, [1, 2, 3]],
    ['1 metre is 100 centimetres.', true, '100 cm = 1 m.', null, [3, 4, 5]],
    ['A square has four equal sides.', true, 'All four sides of a square are equal.', null, [1, 2, 3]],
    ['0.5 is the same as one half.', true, '0.5 = 5/10 = 1/2.', null, [4, 5, 6]],
    ['A leap year has 366 days.', true, 'A leap year has 29 February, so 366 days.', null, [3, 4, 5, 6]],
    ['100 kobo make one naira.', true, '₦1 = 100 kobo.', null, [2, 3, 4]],
  ]),
  ...tf('PRIMARY', 'pX', 'Social Studies', [
    ['Abuja is the capital of Nigeria.', true, 'Abuja has been the capital since 12 December 1991.', null, [2, 3, 4, 5, 6]],
    ['Lagos is the capital of Nigeria.', false, 'Lagos was the capital until 1991; now it is Abuja.', null, [3, 4, 5, 6]],
    ['Nigeria has 36 states and the Federal Capital Territory.', true, '36 states and the FCT, Abuja.', null, [4, 5, 6]],
    ['Nigeria became independent in 1960.', true, 'Nigeria became independent on 1 October 1960.', null, [3, 4, 5, 6]],
    ['The rivers Niger and Benue meet at Lokoja.', true, 'Their confluence is at Lokoja, Kogi State.', null, [4, 5, 6]],
    ['The naira is Nigeria’s money.', true, 'Nigeria’s currency is the naira (₦).', null, [1, 2, 3, 4, 5, 6]],
  ]),
  // Junior secondary
  ...tf('JUNIOR', 'jS', 'Basic Science', [
    ['The SI unit of force is the newton.', true, 'Force is measured in newtons (N).', 'Energy'],
    ['Sound travels faster than light.', false, 'Light is far faster: about 300,000 km every second; sound is about 340 m/s in air.', 'Energy'],
    ['Photosynthesis takes place mainly in the leaves.', true, 'Leaves contain most of the chlorophyll.', 'Living things'],
    ['Water is a compound of hydrogen and oxygen.', true, 'Water is H₂O.', 'Matter'],
    ['All metals are attracted by a magnet.', false, 'Only a few, such as iron, nickel and cobalt, are magnetic.', 'Energy'],
    ['Red blood cells carry oxygen round the body.', true, 'Haemoglobin in red blood cells carries oxygen.', 'Human body'],
    ['Kwashiorkor is caused by too little protein in the diet.', true, 'Kwashiorkor is a protein deficiency disease.', 'Nutrition'],
    ['Rusting needs both air and water.', true, 'Iron rusts when oxygen and water are both present.', 'Matter'],
    ['Coal, crude oil and natural gas are renewable sources of energy.', false, 'They are fossil fuels: once used, they are gone.', 'Energy'],
    ['Oil spillage pollutes water and soil.', true, 'Oil spills harm rivers, farmland and the creatures living there.', 'Environmental Pollution'],
  ]),
  ...tf('JUNIOR', 'jM', 'Mathematics', [
    ['The smallest prime number is 1.', false, '1 is not prime. The smallest prime number is 2.', 'Whole numbers', [1]],
    ['−3 is greater than −1.', false, '−1 is greater: it is nearer zero on the number line.', 'Directed numbers', [1]],
    ['The angles in a triangle add up to 180°.', true, 'Angles in any triangle sum to 180°.', 'Angles', [1]],
    ['25% of 80 is 20.', true, '25% is a quarter; a quarter of 80 is 20.', 'Percentages', [1]],
    ['The binary number 101 is 5 in base ten.', true, '1×4 + 0×2 + 1×1 = 5.', 'Counting in Base Two', [1]],
    ['The HCF of 12 and 18 is 6.', true, '6 is the largest number that divides both.', 'Highest Common Factor (HCF)', [1]],
    ['The LCM of 4 and 6 is 24.', false, 'The LCM is 12, the smallest number both divide.', 'Lowest Common Multiple (LCM)', [1]],
  ]),
  ...tf('JUNIOR', 'jE', 'English Language', [
    ['A noun is a word that names a person, place, thing or idea.', true, 'For example: Ada, Kano, table, honesty.'],
    ['“Their”, “there” and “they’re” mean the same thing.', false, 'They sound alike but mean different things.'],
    ['The plural of “child” is “childs”.', false, 'The plural is “children”.'],
    ['The past tense of “go” is “went”.', true, 'Go, went, gone.'],
  ]),
  ...tf('JUNIOR', 'jC', 'Civic Education', [
    ['Nigeria’s first President was Nnamdi Azikiwe.', true, 'Azikiwe became President when Nigeria became a republic in 1963.'],
    ['The Constitution is the highest law in Nigeria.', true, 'Any law that conflicts with the Constitution is void.'],
    ['The voting age in Nigeria is 16.', false, 'Nigerians can vote from 18.'],
    ['Crude oil was first found in commercial quantity in Nigeria at Oloibiri in 1956.', true, 'Oloibiri is in present-day Bayelsa State.'],
    ['The ECOWAS Commission has its headquarters in Abuja.', true, 'ECOWAS is the Economic Community of West African States.'],
  ]),
  ...tf('JUNIOR', 'jK', 'Computer Studies', [
    ['A mouse is an input device.', true, 'It sends your movements and clicks into the computer.'],
    ['The CPU is an output device.', false, 'The CPU processes data; monitors and printers are output devices.'],
  ]),
  // Senior secondary
  ...tf('SENIOR', 'sC', 'Chemistry', [
    ['The chemical symbol for sodium is Na.', true, 'From its Latin name, natrium.', 'Atomic structure'],
    ['An acid turns blue litmus paper red.', true, 'Acids turn blue litmus red; alkalis turn red litmus blue.', 'Acids, bases and salts'],
    ['The pH of pure water at 25 °C is 7.', true, 'Pure water is neutral: pH 7.', 'Acids, bases and salts'],
    ['Isotopes of an element have the same number of neutrons.', false, 'Isotopes have the same number of protons but different numbers of neutrons.', 'Atomic structure'],
    ['Alkanes have the general formula CₙH₂ₙ.', false, 'Alkanes are CₙH₂ₙ₊₂; CₙH₂ₙ is the alkenes.', 'Organic chemistry'],
    ['Electrolysis of brine produces chlorine gas.', true, 'Chlorine is given off at the anode.'],
  ]),
  ...tf('SENIOR', 'sB', 'Biology', [
    ['Mitochondria are the site of photosynthesis.', false, 'Photosynthesis happens in chloroplasts; mitochondria release energy.', 'Cell biology'],
    ['Most of a cell’s DNA is found in the nucleus.', true, 'Chromosomes in the nucleus carry the DNA.', 'Cell biology'],
    ['Enzymes are proteins that speed up chemical reactions in living things.', true, 'Enzymes are biological catalysts.', 'Nutrition'],
    ['Diffusion needs energy from the cell.', false, 'Diffusion is passive. Active transport needs energy.', 'The Cell and its Environment'],
  ]),
  ...tf('SENIOR', 'sP', 'Physics', [
    ['Speed is a vector quantity.', false, 'Speed is a scalar; velocity (speed with direction) is a vector.'],
    ['The acceleration due to gravity near the Earth’s surface is about 9.8 m/s².', true, 'Often rounded to 10 m/s² in calculations.'],
    ['Light travels at about 3 × 10⁸ m/s in a vacuum.', true, 'That is about 300,000 km every second.'],
    ['Momentum is mass × velocity.', true, 'p = mv.'],
  ]),
  ...tf('SENIOR', 'sM', 'Mathematics', [
    ['log₁₀ 1000 = 3', true, '10³ = 1000.', 'Logarithms'],
    ['2⁰ = 0', false, 'Any non-zero number to the power 0 is 1.', 'Indices'],
    ['The roots of x² − 5x + 6 = 0 are 2 and 3.', true, '(x − 2)(x − 3) = 0.', 'Quadratic equations'],
    ['The interior angles of a hexagon add up to 720°.', true, '(6 − 2) × 180° = 720°.'],
  ]),
  ...tf('SENIOR', 'sE', 'Economics', [
    ['Inflation is a persistent rise in the general price level.', true, 'Money buys less as prices keep rising.', 'Money and Inflation'],
    ['Opportunity cost is the money spent on a good.', false, 'It is the next best alternative given up.', 'Definition and Scope of Economics'],
  ]),
  ...tf('SENIOR', 'sG', 'Government', [
    ['Nigeria practises a presidential system of government.', true, 'The President is head of state and of government.'],
    ['The Nigerian Senate has 109 members.', true, 'Three senators for each of the 36 states and one for the FCT.'],
    ['The House of Representatives has 360 members.', true, 'Members represent federal constituencies.'],
    ['Nigeria became a republic in 1963.', true, 'On 1 October 1963.'],
  ]),
  ...tf('SENIOR', 'sL', 'English Language', [
    ['The plural of “criterion” is “criterions”.', false, 'The plural is “criteria”.', 'Lexis and structure'],
    ['“Affect” is usually a verb and “effect” usually a noun.', true, 'Noise affects learning; it has a bad effect.', 'Lexis and structure'],
  ]),
];

export const TRUE_FALSE_FACTS: TrueFalseFact[] = [...BASE_FACTS, ...ALL_PACK_FACTS];

/** True-or-false facts for a level and year (topped up from the rest of the stage for a full round). */
export const factsFor = (level: GameLevel, year?: number | null) =>
  preferYear(
    TRUE_FALSE_FACTS.filter((f) => f.level === level),
    year,
    TF_BLITZ.statements,
  );

// ------------------------------------------------------------ quiz questions (multiple choice)

export interface CuratedQuestion {
  id: string;
  level: GameLevel;
  subject: string;
  topic: string | null;
  q: string;
  /** The right answer. */
  a: string;
  /** Three wrong answers. */
  w: [string, string, string];
  explain?: string;
  /** School years within the stage this suits (e.g. [1, 2, 3] = Primary 1–3); empty or missing = the whole stage. */
  years?: number[];
}

/** Rows: question, right answer, three wrong ones, then optionally the topic, an explanation and the school years it suits. */
const mcq = (level: GameLevel, prefix: string, subject: string, rows: [string, string, [string, string, string], (string | null)?, (string | null)?, number[]?][]): CuratedQuestion[] =>
  rows.map(([q, a, w, topic, explain, years], i) => ({ id: `${prefix}${i + 1}`, level, subject, topic: topic ?? null, q, a, w, explain: explain ?? undefined, ...(years ? { years } : {}) }));

const BASE_QUESTIONS: CuratedQuestion[] = [
  // ---------------- Primary
  ...mcq('PRIMARY', 'PM', 'Mathematics', [
    ['What is 9 × 7?', '63', ['56', '72', '64'], null, null, [3, 4, 5, 6]],
    ['What is 144 ÷ 12?', '12', ['11', '14', '10'], null, null, [4, 5, 6]],
    ['What is the value of the 5 in 352?', '50', ['5', '500', '352'], null, null, [2, 3, 4]],
    ['Which fraction is the same as one half?', '4/8', ['3/8', '2/5', '3/4'], null, null, [3, 4, 5]],
    ['How many minutes are there in 2 hours?', '120', ['100', '60', '200'], null, null, [3, 4, 5]],
    ['A pen costs ₦50. How much do 6 pens cost?', '₦300', ['₦250', '₦350', '₦56'], null, null, [3, 4, 5, 6]],
    ['What is the perimeter of a square with sides of 5 cm?', '20 cm', ['25 cm', '10 cm', '15 cm'], null, null, [4, 5, 6]],
    ['Round 467 to the nearest hundred.', '500', ['400', '470', '460'], null, null, [3, 4]],
    ['Which of these numbers is even?', '34', ['27', '15', '51'], null, null, [2, 3, 4]],
    ['What is ¼ of 20?', '5', ['4', '10', '80'], null, null, [3, 4, 5]],
    ['Chika had ₦500 and spent ₦230. How much is left?', '₦270', ['₦330', '₦370', '₦230'], null, null, [3, 4, 5]],
    ['How many sides does a hexagon have?', '6', ['5', '7', '8'], null, null, [3, 4, 5, 6]],
  ]),
  ...mcq('PRIMARY', 'PE', 'English Language', [
    ['Choose the correct spelling.', 'beautiful', ['beautifull', 'beatiful', 'beutiful'], null, null, [3, 4, 5, 6]],
    ['The plural of “man” is…', 'men', ['mans', 'mens', 'manes'], null, null, [2, 3, 4]],
    ['Which word is a verb?', 'write', ['desk', 'green', 'quickly'], null, null, [3, 4, 5, 6]],
    ['The opposite of “big” is…', 'small', ['large', 'huge', 'tall'], null, null, [1, 2, 3]],
    ['Choose the correct sentence.', 'She goes to school every day.', ['She go to school every day.', 'She going to school every day.', 'She gone to school every day.'], null, null, [3, 4, 5, 6]],
    ['Which word is a noun?', 'Lagos', ['quickly', 'sing', 'beautiful'], null, null, [3, 4, 5, 6]],
    ['Emeka and Bola ___ friends.', 'are', ['is', 'am', 'was'], null, null, [2, 3, 4]],
    ['The past tense of “eat” is…', 'ate', ['eated', 'eaten', 'eats'], null, null, [3, 4, 5, 6]],
    ['Which letter is a vowel?', 'E', ['B', 'K', 'T'], null, null, [1, 2, 3]],
    ['In “Tolu ran quickly”, the word “quickly” is…', 'an adverb', ['a noun', 'a verb', 'an adjective'], null, null, [4, 5, 6]],
  ]),
  ...mcq('PRIMARY', 'PS', 'Basic Science', [
    ['Which part of a plant takes in water from the soil?', 'The roots', ['The leaves', 'The flowers', 'The fruits'], null, null, [2, 3, 4, 5]],
    ['Which of these is a living thing?', 'A goat', ['A stone', 'A chair', 'Water'], null, null, [1, 2, 3]],
    ['When water freezes it becomes…', 'ice', ['steam', 'smoke', 'sand'], null, null, [2, 3, 4]],
    ['Which sense organ do we use to smell?', 'The nose', ['The ear', 'The eye', 'The tongue'], null, null, [1, 2, 3]],
    ['Which of these gives out its own light?', 'The sun', ['The moon', 'A mirror', 'A stone'], null, null, [3, 4, 5, 6]],
    ['Mosquitoes spread which disease?', 'Malaria', ['Measles', 'Cholera', 'Ringworm'], null, null, [3, 4, 5, 6]],
    ['Which food group mainly gives us energy?', 'Carbohydrates', ['Vitamins', 'Water', 'Minerals'], null, null, [4, 5, 6]],
    ['How many legs does an insect have?', '6', ['8', '4', '10'], null, null, [3, 4, 5, 6]],
  ]),
  ...mcq('PRIMARY', 'PX', 'Social Studies', [
    ['What is the capital of Nigeria?', 'Abuja', ['Lagos', 'Kano', 'Ibadan'], null, null, [2, 3, 4, 5, 6]],
    ['In which year did Nigeria become independent?', '1960', ['1914', '1963', '1999'], null, null, [3, 4, 5, 6]],
    ['What colours are on the Nigerian flag?', 'Green and white', ['Red and white', 'Green and yellow', 'Blue and white'], null, null, [1, 2, 3]],
    ['The Argungu Fishing Festival takes place in which state?', 'Kebbi', ['Kano', 'Lagos', 'Enugu'], null, null, [4, 5, 6]],
    ['Who heads a state government in Nigeria?', 'The governor', ['The president', 'A senator', 'The chairman'], null, null, [4, 5, 6]],
    ['How many states does Nigeria have?', '36', ['37', '30', '19'], null, null, [4, 5, 6]],
    ['The longest river in Nigeria is the River…', 'Niger', ['Benue', 'Ogun', 'Kaduna'], null, null, [4, 5, 6]],
    ['Who heads a local government council?', 'The chairman', ['The governor', 'The president', 'A minister'], null, null, [4, 5, 6]],
  ]),
  // ---------------- Junior secondary
  ...mcq('JUNIOR', 'JM', 'Mathematics', [
    ['Find the LCM of 4 and 6.', '12', ['24', '2', '10'], 'Lowest Common Multiple (LCM)', null, [1]],
    ['Find the HCF of 18 and 24.', '6', ['3', '12', '72'], 'Highest Common Factor (HCF)', null, [1]],
    ['Convert 1011 (base two) to base ten.', '11', ['9', '13', '1011'], 'Counting in Base Two', '1×8 + 0×4 + 1×2 + 1×1 = 11.', [1]],
    ['Solve: 2x + 7 = 19', 'x = 6', ['x = 13', 'x = 5', 'x = 12'], 'Simple Equations', '2x = 12, so x = 6.', [1]],
    ['What is (−8) + 5?', '−3', ['3', '−13', '13'], 'Directed numbers', null, [1]],
    ['What is (−4) × (−6)?', '24', ['−24', '−10', '10'], 'Multiplication and Division of Directed Numbers', 'Negative × negative = positive.', [1]],
    ['Express 3/5 as a percentage.', '60%', ['35%', '53%', '30%'], 'Fractions', '3/5 × 100% = 60%.', [1]],
    ['Find the area of a rectangle 8 cm long and 5 cm wide.', '40 cm²', ['26 cm²', '13 cm²', '45 cm²'], 'Area of Plane Figures', null, [1]],
    ['Angles on a straight line add up to…', '180°', ['90°', '360°', '270°'], 'Angles', null, [1]],
    ['Find the mean of 4, 6, 8 and 10.', '7', ['6', '8', '28'], 'Measures of Central Tendency', '(4 + 6 + 8 + 10) ÷ 4 = 7.', [2]],
    ['Round 3.476 to 2 decimal places.', '3.48', ['3.47', '3.5', '3.40'], 'Approximation', null, [1, 2]],
    ['A fair die is thrown once. What is the probability of a 6?', '1/6', ['1/2', '6', '1/3'], 'Probability', null, [2]],
    ['Simplify 3a + 5a − 2a.', '6a', ['10a', '8a', '6'], 'Simplification of Algebraic Expressions', null, [1]],
    ['A trader buys a phone for ₦40,000 and sells it for ₦46,000. What is the profit percent?', '15%', ['6%', '14%', '60%'], 'Transactions in the Homes and Offices', 'Profit ₦6,000 ÷ ₦40,000 × 100% = 15%.', [1, 2]],
    ['Each angle of an equilateral triangle is…', '60°', ['90°', '45°', '180°'], 'Angles', null, [1]],
  ]),
  ...mcq('JUNIOR', 'JE', 'English Language', [
    ['Choose the correctly spelt word.', 'accommodation', ['acommodation', 'accomodation', 'acomodation']],
    ['Choose the word nearest in meaning to “diligent”.', 'hardworking', ['lazy', 'careless', 'quiet']],
    ['Choose the word opposite in meaning to “generous”.', 'stingy', ['kind', 'wealthy', 'cheerful']],
    ['Neither the teacher nor the students ___ in the hall.', 'are', ['is', 'has', 'be'], null, 'With “neither … nor”, the verb agrees with the nearer subject: “students are”.'],
    ['In “The book is on the table”, the word “on” is a…', 'preposition', ['conjunction', 'pronoun', 'adverb']],
    ['Which sentence is in the passive voice?', 'The ball was kicked by Musa.', ['Musa kicked the ball.', 'Musa is kicking the ball.', 'Musa will kick the ball.']],
    ['He has been living in Kano ___ 2015.', 'since', ['for', 'from', 'by']],
    ['The plural of “mouse” (the animal) is…', 'mice', ['mouses', 'mices', 'mousen']],
    ['In “Ada was tired but she finished her homework”, the conjunction is…', 'but', ['tired', 'she', 'finished']],
    ['Choose the right question tag: “You are a student, ___?”', 'aren’t you', ['isn’t it', 'are you', 'don’t you']],
    ['In “Ngozi sings beautifully”, the word “beautifully” is…', 'an adverb', ['an adjective', 'a noun', 'a verb']],
    ['Choose the correctly spelt word.', 'necessary', ['neccessary', 'necesary', 'neccesary']],
  ]),
  ...mcq('JUNIOR', 'JS', 'Basic Science', [
    ['The SI unit of mass is the…', 'kilogram', ['newton', 'metre', 'litre'], 'Matter'],
    ['Which of these is NOT a state of matter?', 'Energy', ['Solid', 'Liquid', 'Gas'], 'Matter'],
    ['The process by which green plants make their food is…', 'photosynthesis', ['respiration', 'transpiration', 'digestion'], 'Living things'],
    ['Which organ pumps blood round the body?', 'The heart', ['The lungs', 'The liver', 'The kidney'], 'Human body'],
    ['A liquid changing into a gas is called…', 'evaporation', ['condensation', 'melting', 'freezing'], 'Matter'],
    ['Which of these is a renewable source of energy?', 'Solar energy', ['Coal', 'Crude oil', 'Natural gas'], 'Energy'],
    ['Malaria is spread by the female ___ mosquito.', 'Anopheles', ['Aedes', 'Culex', 'tsetse'], 'Family Health'],
    ['Which nutrient helps the body to grow and repair tissues?', 'Protein', ['Carbohydrate', 'Fat', 'Water'], 'Nutrition'],
    ['A magnet attracts…', 'iron', ['copper', 'wood', 'plastic'], 'Energy'],
    ['Which gas do plants take in for photosynthesis?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Hydrogen'], 'Living things'],
    ['Which of these pollutes water?', 'Oil spillage', ['Planting trees', 'Using a refuse bin', 'Boiling water'], 'Environmental Pollution'],
    ['Drug abuse means…', 'using drugs wrongly or without a doctor’s advice', ['taking drugs a doctor prescribed', 'eating a balanced diet', 'exercising every day'], 'Drug and substance abuse in the family'],
  ]),
  ...mcq('JUNIOR', 'JC', 'Civic Education', [
    ['The highest law in Nigeria is the…', 'Constitution', ['Criminal Code', 'bye-law', 'edict']],
    ['The voting age in Nigeria is…', '18 years', ['16 years', '21 years', '25 years']],
    ['Which arm of government makes laws?', 'The legislature', ['The executive', 'The judiciary', 'The police']],
    ['Nigeria’s national motto is…', 'Unity and Faith, Peace and Progress', ['Peace and Unity', 'Faith and Hope', 'One Nigeria']],
    ['Who is the head of the Federal Government of Nigeria?', 'The President', ['The Senate President', 'The Chief Justice', 'The Speaker']],
    ['Which of these is a right of a citizen?', 'The right to life', ['Paying tax', 'Obeying traffic rules', 'Keeping the environment clean']],
    ['The Independent National Electoral Commission (INEC) conducts…', 'elections', ['the census', 'school exams', 'the budget']],
    ['How many chambers does the National Assembly have?', 'Two', ['One', 'Three', 'Four']],
  ]),
  ...mcq('JUNIOR', 'JK', 'Computer Studies', [
    ['Which of these is an input device?', 'Keyboard', ['Monitor', 'Printer', 'Speaker']],
    ['CPU stands for…', 'Central Processing Unit', ['Computer Personal Unit', 'Central Program Utility', 'Control Processing Unit']],
    ['Which of these is software?', 'A word processor', ['A mouse', 'A scanner', 'A hard disk']],
    ['The “brain” of the computer is the…', 'CPU', ['monitor', 'keyboard', 'mouse']],
    ['1 byte is equal to…', '8 bits', ['4 bits', '16 bits', '1,024 bits']],
    ['Which of these is an output device?', 'Printer', ['Keyboard', 'Mouse', 'Scanner']],
  ]),
  ...mcq('JUNIOR', 'JA', 'Agricultural Science', [
    ['Which of these is grown mainly as a cash crop in Nigeria?', 'Cocoa', ['Yam', 'Maize', 'Cassava']],
    ['Which of these animals is a ruminant?', 'Cow', ['Pig', 'Chicken', 'Rabbit']],
    ['Growing crops and rearing animals on the same farm is called…', 'mixed farming', ['shifting cultivation', 'mono-cropping', 'bush fallowing']],
    ['Which soil holds the most water?', 'Clay soil', ['Sandy soil', 'Gravel', 'Stony soil']],
  ]),
  // ---------------- Senior secondary
  ...mcq('SENIOR', 'SM', 'Mathematics', [
    ['Simplify 2⁵ × 2³.', '2⁸', ['2¹⁵', '4⁸', '2²'], 'Indices', 'Add the powers: 5 + 3 = 8.'],
    ['Evaluate log₁₀ 1000.', '3', ['2', '100', '30'], 'Logarithms'],
    ['Solve x² − 7x + 12 = 0.', 'x = 3 or x = 4', ['x = −3 or x = −4', 'x = 2 or x = 6', 'x = 1 or x = 12'], 'Quadratic equations', '(x − 3)(x − 4) = 0.'],
    ['Find the 10th term of the A.P. 3, 7, 11, …', '39', ['43', '40', '35'], 'Sequence and Series', 'a + 9d = 3 + 36 = 39.'],
    ['Make x the subject of y = 3x − 6.', 'x = (y + 6)/3', ['x = (y − 6)/3', 'x = 3y + 6', 'x = y/3 − 6']],
    ['Convert 25 (base ten) to base two.', '11001', ['10011', '11010', '10101'], 'Number Bases', '16 + 8 + 1 = 25.'],
    ['The interior angles of a pentagon add up to…', '540°', ['360°', '720°', '450°'], null, '(5 − 2) × 180° = 540°.'],
    ['sin 30° = ?', '1/2', ['√3/2', '1', '1/√2'], 'Trigonometry'],
    ['Find the simple interest on ₦20,000 at 5% a year for 3 years.', '₦3,000', ['₦1,000', '₦300', '₦6,000'], null, '20,000 × 5 × 3 ÷ 100 = 3,000.'],
    ['Evaluate 8^(2/3).', '4', ['2', '16', '6'], 'Indices', 'The cube root of 8 is 2, and 2² = 4.'],
    ['If P = {2, 4, 6, 8} and Q = {4, 8, 12}, find P ∩ Q.', '{4, 8}', ['{2, 4, 6, 8, 12}', '{2, 6}', '{12}'], 'Sets'],
    ['The gradient of the line y = 4x − 3 is…', '4', ['−3', '3', '−4'], 'Coordinate Geometry'],
    ['Find the median of 3, 9, 4, 7, 5.', '5', ['4', '7', '9'], 'Statistics', 'In order: 3, 4, 5, 7, 9; the middle one is 5.'],
  ]),
  ...mcq('SENIOR', 'SE', 'English Language', [
    ['Choose the word nearest in meaning to “candid”.', 'frank', ['secretive', 'cunning', 'timid'], 'Synonyms and antonyms'],
    ['Choose the word opposite in meaning to “ephemeral”.', 'permanent', ['brief', 'fleeting', 'temporary'], 'Synonyms and antonyms'],
    ['Choose the correctly spelt word.', 'conscientious', ['conscientous', 'consciencious', 'concientious'], 'Lexis and structure'],
    ['Had I known, I ___ have come.', 'would', ['will', 'shall', 'can'], 'Lexis and structure'],
    ['“The wind whispered through the trees” is an example of…', 'personification', ['simile', 'hyperbole', 'metaphor'], 'Figurative Usage'],
    ['“He is as brave as a lion” contains a…', 'simile', ['metaphor', 'personification', 'pun'], 'Figurative Usage'],
    ['Each of the boys ___ given a book.', 'was', ['were', 'are', 'have'], 'Concord'],
    ['The principal, together with the teachers, ___ arrived.', 'has', ['have', 'are', 'were'], 'Concord'],
    ['The plural of “criterion” is…', 'criteria', ['criterions', 'criterias', 'criterion'], 'Lexis and structure'],
    ['To “bury the hatchet” means to…', 'make peace', ['dig a hole', 'hide a weapon', 'start a fight'], 'Idioms and Collocations'],
  ]),
  ...mcq('SENIOR', 'SB', 'Biology', [
    ['Which organelle releases energy in a cell?', 'Mitochondrion', ['Nucleus', 'Ribosome', 'Chloroplast'], 'Cell biology'],
    ['Which blood cells fight infection?', 'White blood cells', ['Red blood cells', 'Platelets', 'Plasma'], 'Transport in organisms'],
    ['Proteins are made in the cell at the…', 'ribosomes', ['nucleus', 'lysosomes', 'vacuole'], 'Cell biology'],
    ['Sleeping sickness is spread by the…', 'tsetse fly', ['Anopheles mosquito', 'housefly', 'blackfly'], 'Microorganisms: Man and Health'],
    ['The basic unit of heredity is the…', 'gene', ['chromosome', 'cell', 'nucleus'], 'Genetics'],
    ['Photosynthesis produces glucose and…', 'oxygen', ['carbon dioxide', 'nitrogen', 'ammonia'], 'Nutrition'],
    ['An organism that makes its own food is…', 'an autotroph', ['a heterotroph', 'a parasite', 'a saprophyte'], 'Nutrition'],
    ['Which part of the brain controls balance?', 'Cerebellum', ['Cerebrum', 'Medulla oblongata', 'Hypothalamus'], 'Nervous Coordination'],
  ]),
  ...mcq('SENIOR', 'SC', 'Chemistry', [
    ['The atomic number of an element is the number of ___ in its nucleus.', 'protons', ['neutrons', 'electrons', 'nucleons'], 'Atomic structure'],
    ['Which of these is a noble gas?', 'Argon', ['Nitrogen', 'Chlorine', 'Oxygen'], 'Periodic Chemistry'],
    ['The pH of a neutral solution is…', '7', ['0', '14', '1'], 'Acids, bases and salts'],
    ['The formula of sulphuric acid is…', 'H₂SO₄', ['HCl', 'HNO₃', 'H₂SO₃'], 'Acids, bases and salts'],
    ['Zinc reacts with dilute hydrochloric acid to give off…', 'hydrogen', ['oxygen', 'chlorine', 'carbon dioxide'], 'Acids, bases and salts'],
    ['The general formula of the alkanes is…', 'CₙH₂ₙ₊₂', ['CₙH₂ₙ', 'CₙH₂ₙ₋₂', 'CₙHₙ'], 'Organic chemistry'],
    ['Crude oil is separated into fractions by…', 'fractional distillation', ['filtration', 'evaporation', 'chromatography'], 'Organic chemistry'],
    ['Electrons carry a ___ charge.', 'negative', ['positive', 'neutral', 'double positive'], 'Atomic structure'],
  ]),
  ...mcq('SENIOR', 'SP', 'Physics', [
    ['The SI unit of power is the…', 'watt', ['joule', 'newton', 'pascal']],
    ['Which of these is a vector quantity?', 'Velocity', ['Speed', 'Mass', 'Time']],
    ['A car travels 120 m in 6 s. Its average speed is…', '20 m/s', ['720 m/s', '126 m/s', '0.05 m/s']],
    ['By Ohm’s law, V = …', 'IR', ['I/R', 'R/I', 'I + R']],
    ['The image in a plane mirror is…', 'virtual and upright', ['real and inverted', 'real and upright', 'virtual and inverted']],
    ['Which colour of visible light has the longest wavelength?', 'Red', ['Violet', 'Blue', 'Green']],
    ['The force that opposes motion between surfaces in contact is…', 'friction', ['gravity', 'tension', 'upthrust']],
    ['Work done = force × …', 'distance moved in the direction of the force', ['time taken', 'mass', 'speed']],
  ]),
  ...mcq('SENIOR', 'SX', 'Economics', [
    ['The reward for labour is…', 'wages', ['rent', 'interest', 'profit'], 'Factors of Production'],
    ['Opportunity cost is…', 'the alternative forgone', ['the money price', 'the total cost', 'the cost of production'], 'Definition and Scope of Economics'],
    ['A persistent rise in the general price level is…', 'inflation', ['deflation', 'recession', 'devaluation'], 'Money and Inflation'],
    ['Which institution is Nigeria’s central bank?', 'Central Bank of Nigeria (CBN)', ['NDIC', 'NNPC', 'FIRS'], 'Financial Institutions'],
    ['When the price of a good falls, the quantity demanded usually…', 'rises', ['falls', 'stays the same', 'becomes zero'], 'Demand'],
    ['Which of these is a factor of production?', 'Land', ['Profit', 'Wages', 'Interest'], 'Factors of Production'],
  ]),
  ...mcq('SENIOR', 'SG', 'Government', [
    ['The theory of separation of powers is linked with…', 'Montesquieu', ['Karl Marx', 'Thomas Hobbes', 'A. V. Dicey'], 'Basic Principles of Government'],
    ['The rule of law was popularised by…', 'A. V. Dicey', ['Montesquieu', 'Karl Marx', 'Jean Bodin'], 'Basic Principles of Government'],
    ['How many members does the Nigerian Senate have?', '109', ['360', '36', '108'], 'Arms of Government'],
    ['Which arm of government interprets laws?', 'The judiciary', ['The legislature', 'The executive', 'The civil service'], 'Arms of Government'],
    ['A system where power is shared between a central government and states is…', 'federalism', ['a unitary system', 'a monarchy', 'an oligarchy'], 'Federal System of Government in Nigeria'],
    ['Nigeria returned to civilian rule on 29 May…', '1999', ['1979', '1993', '2007'], 'Military Rule in Nigeria'],
  ]),
];

export const CURATED_QUESTIONS: CuratedQuestion[] = [...BASE_QUESTIONS, ...ALL_PACK_QUESTIONS];

// ------------------------------------------------------------ spelling and word lists

export interface GameWord {
  word: string;
  level: GameLevel;
  /** A short meaning, shown as a clue. */
  meaning: string;
  /** Read aloud after the word; the word is hidden when shown as text. */
  sentence: string;
  /** Subject vocabulary ("Basic Science"); empty for common spelling-error words. */
  subject?: string;
  /** School years within the stage this suits (e.g. [1, 2, 3] = Primary 1–3); empty or missing = the whole stage. */
  years?: number[];
}

/** Rows: word, meaning, sentence, then optionally the subject and the school years it suits. */
const words = (level: GameLevel, rows: [string, string, string, (string | null)?, number[]?][]): GameWord[] =>
  rows.map(([word, meaning, sentence, subject, years]) => ({ word, level, meaning, sentence, subject: subject ?? undefined, ...(years ? { years } : {}) }));

/** Words students often misspell (BECE and WAEC examiners’ reports), and subject vocabulary. British spelling. */
const BASE_WORDS: GameWord[] = [
  ...words('PRIMARY', [
    ['because', 'for the reason that', 'We stayed inside because it was raining.', null, [2, 3, 4]],
    ['friend', 'someone you like and trust', 'Bola is my best friend.', null, [2, 3]],
    ['beautiful', 'very pretty', 'The Obudu hills are beautiful.', null, [3, 4, 5, 6]],
    ['school', 'a place where children learn', 'Our school starts at eight o’clock.', null, [1, 2, 3]],
    ['Wednesday', 'the day after Tuesday', 'We have sports on Wednesday.', null, [3, 4, 5]],
    ['February', 'the second month of the year', 'February is a short month.', null, [3, 4, 5]],
    ['people', 'men, women and children', 'Many people live in Lagos.', null, [2, 3, 4]],
    ['which', 'what one', 'Which book is yours?', null, [2, 3]],
    ['tomorrow', 'the day after today', 'We will visit Grandma tomorrow.', null, [3, 4, 5]],
    ['family', 'parents and their children', 'My family eats together on Sunday.', null, [1, 2, 3]],
    ['library', 'a room full of books to read', 'We borrowed books from the library.', null, [3, 4, 5]],
    ['answer', 'a reply to a question', 'Write the answer in your book.', null, [3, 4, 5]],
    ['island', 'land with water all round it', 'Lagos Island is busy.', null, [4, 5, 6]],
    ['neighbour', 'a person who lives next door', 'Our neighbour gave us oranges.', null, [4, 5, 6]],
    ['colour', 'red, blue and green are these', 'Green is a colour on our flag.', null, [2, 3, 4]],
    ['favourite', 'liked best', 'Jollof rice is my favourite food.', null, [4, 5, 6]],
    ['different', 'not the same', 'The twins wear different shoes.', null, [3, 4, 5]],
    ['enough', 'as much as is needed', 'Do we have enough chairs?', null, [3, 4, 5]],
    ['minute', 'sixty seconds', 'Wait a minute, please.', null, [3, 4, 5]],
    ['busy', 'having a lot to do', 'The market is busy on Saturday.', null, [2, 3, 4]],
    ['animal', 'a living creature that moves', 'The goat is a farm animal.', 'Basic Science', [1, 2, 3]],
    ['vegetable', 'a plant eaten as food', 'Ugwu is a green vegetable.', 'Basic Science', [2, 3, 4]],
  ]),
  ...words('JUNIOR', [
    ['accommodation', 'a place to live or stay', 'The school has accommodation for boarders.'],
    ['separate', 'apart; not together', 'Keep the two groups separate.'],
    ['necessary', 'needed', 'It is necessary to revise before an exam.'],
    ['embarrass', 'to make someone feel shy or ashamed', 'Please do not embarrass your friend.'],
    ['government', 'the people who run a country or state', 'The government built a new road.'],
    ['environment', 'the surroundings we live in', 'Keep your environment clean.'],
    ['definitely', 'certainly; without doubt', 'I will definitely come to the match.'],
    ['occasion', 'a special event', 'Independence Day is a happy occasion.'],
    ['receive', 'to get something given', 'You will receive your result on Friday.'],
    ['believe', 'to think something is true', 'I believe we can win.'],
    ['achieve', 'to succeed in doing something', 'Work hard to achieve your goals.'],
    ['privilege', 'a special right or advantage', 'It is a privilege to be head girl.'],
    ['beginning', 'the start', 'Listen from the beginning of the story.'],
    ['business', 'buying and selling to make money', 'Her mother runs a business in Onitsha.'],
    ['committee', 'a group chosen to do a job', 'The sports committee met today.'],
    ['conscience', 'the sense of right and wrong', 'His conscience told him to return the money.'],
    ['independence', 'freedom from control by others', 'Nigeria gained independence in 1960.'],
    ['rhythm', 'a regular beat in music', 'Clap to the rhythm of the drum.'],
    ['argument', 'a disagreement', 'They had an argument about football.'],
    ['discipline', 'training to obey rules', 'Good discipline helps a school run well.'],
    ['exaggerate', 'to make something seem bigger than it is', 'Do not exaggerate the story.'],
    ['immediately', 'at once', 'Come to the office immediately.'],
    ['knowledge', 'what you know and understand', 'Reading increases your knowledge.'],
    ['successful', 'having achieved what you wanted', 'The inter-house sports was successful.'],
    ['photosynthesis', 'how green plants make food using light', 'Photosynthesis happens in the leaves.', 'Basic Science'],
    ['evaporation', 'a liquid turning into vapour', 'Evaporation dries the wet clothes.', 'Basic Science'],
    ['denominator', 'the bottom number of a fraction', 'In three-quarters, the denominator is four.', 'Mathematics'],
    ['perimeter', 'the distance round a shape', 'Find the perimeter of the football field.', 'Mathematics'],
    ['constitution', 'the highest set of laws of a country', 'The constitution protects our rights.', 'Civic Education'],
    ['keyboard', 'the keys used to type into a computer', 'Type your name with the keyboard.', 'Computer Studies'],
  ]),
  ...words('SENIOR', [
    ['acquaintance', 'a person you know slightly', 'He is an acquaintance from church.'],
    ['acknowledgement', 'a statement that something was received', 'Write an acknowledgement of the letter.'],
    ['anonymous', 'with no name given', 'The school received an anonymous gift.'],
    ['bureaucracy', 'a system of many offices and rules', 'Bureaucracy can slow things down.'],
    ['conscientious', 'careful and hardworking', 'She is a conscientious prefect.'],
    ['consensus', 'general agreement', 'The class reached a consensus.'],
    ['correspondence', 'letters or messages exchanged', 'Keep all official correspondence.'],
    ['entrepreneur', 'a person who starts a business', 'The young entrepreneur sells solar lamps.'],
    ['existence', 'the state of being real', 'Scientists study the existence of life on Mars.'],
    ['fulfil', 'to carry out a promise or duty', 'Leaders must fulfil their promises.'],
    ['gauge', 'to measure or judge', 'Use the test to gauge your progress.'],
    ['hierarchy', 'a ranking from top to bottom', 'The army has a strict hierarchy.'],
    ['irresistible', 'too strong to refuse', 'The smell of suya was irresistible.'],
    ['liaison', 'a link between groups', 'The PTA liaison spoke to the principal.'],
    ['manoeuvre', 'a skilful movement', 'The driver made a careful manoeuvre.'],
    ['occurrence', 'something that happens', 'Flooding is a common occurrence in the rainy season.'],
    ['perseverance', 'continuing despite difficulty', 'Perseverance leads to success.'],
    ['pronunciation', 'the way a word is spoken', 'Practise the pronunciation of new words.'],
    ['supersede', 'to replace something older', 'The new law will supersede the old one.'],
    ['threshold', 'the point where something begins', 'She stood at the threshold of the hall.'],
    ['unnecessary', 'not needed', 'Avoid unnecessary noise in the library.'],
    ['withhold', 'to refuse to give', 'Do not withhold important information.'],
    ['chlorophyll', 'the green pigment in plants', 'Chlorophyll absorbs light energy.', 'Biology'],
    ['mitochondrion', 'the part of a cell that releases energy', 'Each mitochondrion releases energy for the cell.', 'Biology'],
    ['hypotenuse', 'the longest side of a right-angled triangle', 'The hypotenuse is opposite the right angle.', 'Mathematics'],
    ['parallelogram', 'a four-sided shape with opposite sides parallel', 'A rectangle is a special parallelogram.', 'Mathematics'],
    ['legislature', 'the law-making arm of government', 'The legislature passed the budget.', 'Government'],
    ['equilibrium', 'a state of balance', 'Price is set where demand and supply are in equilibrium.', 'Economics'],
  ]),
];

/** One entry per word in each level (the first kept): a word written into two packs isn't dealt twice. */
function dedupeWords(list: GameWord[]): GameWord[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const key = `${w.level}|${normaliseWord(w.word)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const GAME_WORDS: GameWord[] = dedupeWords([...BASE_WORDS, ...ALL_PACK_WORDS]);

/** Words of a level for a round, the ones for the student's year first (topped up from the stage when there are few). */
export const wordsFor = (level: GameLevel, year?: number | null) =>
  preferYear(
    GAME_WORDS.filter((w) => w.level === level),
    year,
    WORD_ROUND.words * 2,
  );
export const wordById = (id: string) => GAME_WORDS.find((w) => normaliseWord(w.word) === normaliseWord(id)) ?? null;

/** The sentence with the word blanked out (for students who can't hear it). */
export const blankedSentence = (w: GameWord) => w.sentence.replace(new RegExp(w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_'.repeat(Math.min(w.word.length, 12)));

/** Quiz questions for a level and year (topped up from the stage). */
export const questionsFor = (level: GameLevel, year?: number | null) =>
  preferYear(
    CURATED_QUESTIONS.filter((q) => q.level === level),
    year,
    20,
  );

// ------------------------------------------------------------ checks (dev and test)

/**
 * Problems in the curated content: ids used twice (offline scores are marked
 * by id, so a clash would mark against the wrong item), quiz questions whose
 * right answer is also among the wrong ones, empty match packs. Empty when all
 * is well; the content test fails on any, and in development a warning is logged.
 */
export function gamesContentIssues(): string[] {
  const out: string[] = [];
  const dupes = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) out.push(`${what} id used twice: ${id}`);
      seen.add(id);
    }
  };
  dupes('Match pack', MATCH_PACKS.map((p) => p.id));
  dupes('True-or-false fact', TRUE_FALSE_FACTS.map((f) => f.id));
  dupes('Quiz question', CURATED_QUESTIONS.map((q) => q.id));
  for (const q of CURATED_QUESTIONS) {
    const opts = [q.a, ...q.w].map(normaliseWord);
    if (q.w.length !== 3 || new Set(opts).size !== 4) out.push(`Quiz question ${q.id} needs a right answer and three different wrong ones`);
  }
  for (const p of MATCH_PACKS) if (p.pairs.length < 2 || !p.levels.length) out.push(`Match pack ${p.id} needs at least two pairs and a level`);
  for (const x of [...MATCH_PACKS, ...TRUE_FALSE_FACTS, ...CURATED_QUESTIONS, ...GAME_WORDS]) {
    if (x.years?.some((y) => !Number.isInteger(y) || y < 1 || y > 6)) out.push(`Years must be 1–6: ${'id' in x ? x.id : x.word}`);
  }
  return out;
}

{
  const env = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
  if (env && env !== 'production') {
    const issues = gamesContentIssues();
    if (issues.length) console.warn(`EduGames content: ${issues.length} problem(s)\n  ${issues.slice(0, 20).join('\n  ')}`);
  }
}

// ------------------------------------------------------------ word puzzles (Word Search, Crossword)

/** A theme of words for a puzzle: a match pack, a subject's vocabulary, or a mix. */
export interface PuzzleTheme {
  title: string;
  words: PuzzleWord[];
}

/** The clue must not give the word away. */
const clueGivesAway = (clue: string, word: string) => clue.toUpperCase().replace(/[^A-Z]/g, ' ').split(/\s+/).some((t) => t && (t === word || (word.length >= 4 && t.includes(word))));

/**
 * The words a level and year can be given in puzzles, grouped into themes
 * (stable order, so the device and the server pick the same one from a seed).
 * Spelling and subject words come with their meaning as the clue; match packs
 * give "Abia: its capital" → UMUAHIA.
 */
export function puzzleThemes(level: GameLevel, year: number, maxLen: number, min: number): PuzzleTheme[] {
  const seen = new Set<string>();
  const all: (PuzzleWord & { theme: string })[] = [];
  const add = (word: string, clue: string, subject: string | null, theme: string) => {
    const w = puzzleForm(word);
    if (!w || w.length < 3 || w.length > maxLen || !clue.trim() || clueGivesAway(clue, w)) return;
    const key = `${theme}|${w}`;
    if (seen.has(key)) return;
    seen.add(key);
    all.push({ word: w, clue: clue.trim(), subject, theme });
  };
  // A bigger pool than a spelling round (puzzles need words that fit together), still the student's year first.
  for (const w of preferYear(GAME_WORDS.filter((x) => x.level === level), year, 60)) add(w.word, w.meaning, w.subject ?? null, w.subject ? `${w.subject} words` : 'Tricky spellings');
  for (const p of matchPacksFor(level, year)) for (const [l, r] of p.pairs) if (!isTrivialPair([l, r])) add(r, `${l}: its ${/^(English|French|Arabic|Yoruba|Igbo|Hausa|Latin)/.test(p.rightLabel) ? p.rightLabel : p.rightLabel.toLowerCase()}`, p.subject, p.title);
  const groups = new Map<string, PuzzleWord[]>();
  for (const w of all) groups.set(w.theme, [...(groups.get(w.theme) ?? []), { word: w.word, clue: w.clue, subject: w.subject }]);
  const themes: PuzzleTheme[] = [...groups].filter(([, ws]) => ws.length >= min).map(([title, words]) => ({ title, words }));
  // Always a mixed theme too (each word once).
  const mixed = new Map<string, PuzzleWord>();
  for (const w of all) if (!mixed.has(w.word)) mixed.set(w.word, { word: w.word, clue: w.clue, subject: w.subject });
  themes.push({ title: 'Words from your lessons', words: [...mixed.values()] });
  return themes;
}

/** Word Search size and directions by age: 6 × 6 across and down for the youngest, 8 × 8 with diagonals for older primary, 10 × 10 every way for secondary. */
export function wordSearchShape(level: GameLevel, young: boolean) {
  if (young) return { ...WORD_SEARCH_ROUND.young, dirs: DIRS_YOUNG };
  if (level === 'PRIMARY') return { ...WORD_SEARCH_ROUND.primary, dirs: DIRS_PRIMARY };
  return { ...WORD_SEARCH_ROUND.secondary, dirs: DIRS_ALL };
}

/** The Word Search for a seed (the same on the device and the server). */
export function wordSearchFor(seed: number, level: GameLevel, year: number, young: boolean): WordSearchPuzzle {
  const shape = wordSearchShape(level, young);
  const themes = puzzleThemes(level, year, shape.size, shape.words + 3);
  const r = seededRandom(seed);
  const theme = themes[Math.floor(r() * themes.length)]!;
  return buildWordSearch((seed ^ 0x5bd1e995) >>> 0, theme.words, { size: shape.size, count: shape.words, dirs: shape.dirs, title: theme.title });
}

/** Crossword size by age: 5–6 short words for the youngest, up to 8 for older students. */
export function crosswordShape(young: boolean) {
  return young ? { min: CROSSWORD_ROUND.min, max: 6, maxLen: 7, maxSize: 9 } : { min: CROSSWORD_ROUND.min, max: CROSSWORD_ROUND.max, maxLen: 10, maxSize: 13 };
}

/** The Crossword for a seed (the same on the device and the server). Themes with plenty of words, else a mix. */
export function crosswordFor(seed: number, level: GameLevel, year: number, young: boolean): CrosswordPuzzle {
  const shape = crosswordShape(young);
  const themes = puzzleThemes(level, year, shape.maxLen, 24);
  const r = seededRandom(seed);
  const theme = themes[Math.floor(r() * themes.length)]!;
  return buildCrossword((seed ^ 0x27d4eb2f) >>> 0, theme.words, { ...shape, title: theme.title });
}

// ------------------------------------------------------------ marking a local round

export interface LocalMark {
  correct: number;
  total: number;
  /** The round can't have been played by a person (too fast, more answers than time…). */
  implausible: string | null;
  /** Correct answers by subject (for the subject-master badge). */
  subjects: Record<string, number>;
  /** Best run of right answers in a row. */
  bestRun: number;
}

function run(results: boolean[]) {
  let best = 0;
  let cur = 0;
  for (const r of results) {
    cur = r ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

/**
 * Marks a round played on the device: Maths Sprint by replaying the seed,
 * word games and offline True or False against the lists above, Match Up
 * against its pack. The server uses this to decide the score (and XP); the
 * device uses it to show the result straight away, even offline.
 * Syllabus match packs ("syl:…") are checked by the server, not here.
 */
export function markLocalRound(input: LocalScoreInput): LocalMark {
  const tooFast = (ms: number[], min: number) => {
    if (!ms.length) return null;
    const fast = ms.filter((m) => m < min).length;
    if (ms.some((m) => m < min / 3)) return 'Some answers came faster than anyone can read them.';
    if (fast / ms.length > 0.3) return 'Too many answers came faster than anyone can read them.';
    return null;
  };
  const sumMs = (ms: number[]) => ms.reduce((a, b) => a + b, 0);
  // A round sent at the 10-minute cap (a slow young child) can't be checked against the sum.
  const capped = input.durationMs >= 10 * 60_000 - 1000;
  const timing = (ms: number[], min: number) =>
    tooFast(ms, min) ?? (!capped && sumMs(ms) > input.durationMs + 2000 ? 'The answer times don’t add up to the round’s length.' : null);

  switch (input.game) {
    case 'MATHS_SPRINT': {
      const qs = mathsRound(input.seed, input.level, input.year, input.answers.length);
      const results = input.answers.map((a, i) => a.choice === qs[i]!.answer);
      const correct = results.filter(Boolean).length;
      let implausible = timing(
        input.answers.map((a) => a.ms),
        MIN_ANSWER_MS.MATHS_SPRINT,
      );
      // Young mode: ten questions with no clock (however long they take).
      if (!implausible && input.young && input.answers.length > YOUNG_ROUND.mathsQuestions) implausible = 'More questions than a young Maths Sprint has.';
      if (!implausible && !input.young && input.durationMs > (MATHS_SPRINT.seconds + 5) * 1000) implausible = 'The round ran longer than a Maths Sprint can.';
      return { correct, total: input.answers.length, implausible, subjects: correct ? { Mathematics: correct } : {}, bestRun: run(results) };
    }
    case 'SPELLING_BEE':
    case 'WORD_SCRAMBLE': {
      const subjects: Record<string, number> = {};
      let unknown = 0;
      const results = input.words.map((w) => {
        const word = wordById(w.id);
        if (!word) {
          unknown++;
          return false;
        }
        const ok = normaliseWord(w.typed) === normaliseWord(word.word);
        if (ok) {
          const s = word.subject ?? 'English Language';
          subjects[s] = (subjects[s] ?? 0) + 1;
        }
        return ok;
      });
      const ids = new Set(input.words.map((w) => normaliseWord(w.id)));
      let implausible = unknown ? 'Some of these words aren’t in the word lists.' : ids.size < input.words.length ? 'The same word was sent twice.' : null;
      // Skipped words ("I don't know") can be quick; only typed answers are timed.
      implausible ??= timing(
        input.words.filter((w) => w.typed.trim()).map((w) => w.ms),
        MIN_ANSWER_MS[input.game],
      );
      return { correct: results.filter(Boolean).length, total: input.words.length, implausible, subjects, bestRun: run(results) };
    }
    case 'MATCH_UP': {
      if (input.packId.startsWith('syl:')) return { correct: input.matched, total: input.pairs.length, implausible: null, subjects: {}, bestRun: input.matched };
      const pack = MATCH_PACKS.find((p) => p.id === input.packId);
      let implausible: string | null = null;
      if (!pack) implausible = 'Unknown match pack.';
      else if (input.pairs.some((i) => i >= pack.pairs.length) || new Set(input.pairs).size < input.pairs.length) implausible = 'Those pairs aren’t in the pack.';
      else if (input.matched > input.pairs.length) implausible = 'More pairs matched than were dealt.';
      else if (input.matched > 0 && input.durationMs < input.matched * 2 * MIN_ANSWER_MS.MATCH_UP) implausible = 'Matched faster than cards can be turned.';
      const subject = pack?.subject ?? 'General';
      return { correct: input.matched, total: input.pairs.length, implausible, subjects: input.matched ? { [subject]: input.matched } : {}, bestRun: input.matched };
    }
    case 'COUNT_TAP':
    case 'SHAPES':
    case 'LETTER_SOUNDS':
    case 'TELL_TIME':
    case 'NAIRA_SHOP': {
      const qs = earlyRound(input.game, input.seed, input.year, input.answers.length, !!input.early);
      const results = input.answers.map((a, i) => a.choice === qs[i]!.answer);
      const correct = results.filter(Boolean).length;
      let implausible: string | null = input.answers.length > EARLY_ROUND.questions ? 'More answers than the round has.' : null;
      // Only impossibly quick taps are refused: young children are slow, and that's fine.
      implausible ??= timing(
        input.answers.map((a) => a.ms),
        MIN_ANSWER_MS[input.game],
      );
      const subject = input.game === 'LETTER_SOUNDS' ? 'English Language' : 'Mathematics';
      return { correct, total: input.answers.length, implausible, subjects: correct ? { [subject]: correct } : {}, bestRun: run(results) };
    }
    case 'WORD_SEARCH': {
      const pz = wordSearchFor(input.seed, input.level, input.year, input.young);
      const found = new Set<string>();
      const subjects: Record<string, number> = {};
      let implausible: string | null = null;
      for (const f of input.found) {
        const line = lineLetters(pz.grid, f.r0, f.c0, f.r1, f.c1);
        const back = line ? [...line].reverse().join('') : null;
        const w = pz.words.find((x) => x.word === line || x.word === back);
        if (!w) implausible ??= 'Some of those lines aren’t words in the puzzle.';
        else if (found.has(w.word)) implausible ??= 'The same word was sent twice.';
        else {
          found.add(w.word);
          const s = w.subject ?? 'English Language';
          subjects[s] = (subjects[s] ?? 0) + 1;
        }
      }
      implausible ??= timing(
        input.found.map((f) => f.ms),
        MIN_ANSWER_MS.WORD_SEARCH,
      );
      if (!implausible && input.durationMs < found.size * MIN_ANSWER_MS.WORD_SEARCH) implausible = 'Found faster than anyone can spot the words.';
      return { correct: found.size, total: pz.words.length, implausible, subjects, bestRun: found.size };
    }
    case 'CROSSWORD': {
      const pz = crosswordFor(input.seed, input.level, input.year, input.young);
      let implausible: string | null = input.entries.length !== pz.entries.length ? 'That isn’t the crossword for this round.' : null;
      const subjects: Record<string, number> = {};
      const results = pz.entries.map((e, i) => normaliseWord(input.entries[i] ?? '').toUpperCase() === e.answer);
      const correct = results.filter(Boolean).length;
      if (correct) subjects['English Language'] = correct;
      if (!implausible && input.durationMs < correct * MIN_ANSWER_MS.CROSSWORD) implausible = 'Solved faster than anyone can read the clues.';
      return { correct: implausible ? 0 : correct, total: pz.entries.length, implausible, subjects, bestRun: run(results) };
    }
    case 'TF_BLITZ': {
      const subjects: Record<string, number> = {};
      let unknown = 0;
      const results = input.items.map((it) => {
        const fact = TRUE_FALSE_FACTS.find((f) => f.id === it.id);
        if (!fact) {
          unknown++;
          return false;
        }
        const ok = it.answer === fact.answer;
        if (ok) subjects[fact.subject] = (subjects[fact.subject] ?? 0) + 1;
        return ok;
      });
      const ids = new Set(input.items.map((i) => i.id));
      let implausible = unknown ? 'Some of these statements aren’t in the packs.' : ids.size < input.items.length ? 'The same statement was sent twice.' : null;
      implausible ??= timing(
        input.items.map((i) => i.ms),
        MIN_ANSWER_MS.TF_BLITZ,
      );
      return { correct: results.filter(Boolean).length, total: input.items.length, implausible, subjects, bestRun: run(results) };
    }
  }
}
