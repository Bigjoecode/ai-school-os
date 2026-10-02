/**
 * Platform content every installation needs, installed on boot if missing
 * (never overwriting what the console has changed): the parent product
 * catalogue, the syllabus topic graph, and a starter bank of original,
 * hand-checked Exam Academy questions to build on.
 */
import type { PrismaClient } from '../generated/prisma/client';

type Level = 'PRIMARY' | 'JUNIOR' | 'SENIOR';

export const PRODUCTS = [
  {
    code: 'AI_PLUS',
    name: 'AI Student Plus',
    tagline: "Your child's personal AI tutor, study coach and exam companion.",
    description: 'Generous everyday tutoring with study plans, flashcards, photo questions, mastery tracking and deeper explanations when needed.',
    kind: 'AI',
    entitlements: ['STUDENT_AI_PLUS'],
    priceKobo: 12_500_00,
    schoolPriceKobo: 9_000_00,
    period: 'TERM',
    periodMonths: 4,
    maxChildren: 1,
    aiSessions: 300,
    features: ['300 tutor sessions a term', 'Personal study plans', 'Flashcards with spaced repetition', 'Photo questions', 'Topic mastery map', 'Deeper explanations on demand'],
    sortOrder: 1,
  },
  {
    code: 'AI_FAMILY',
    name: 'AI Family',
    tagline: 'AI Student Plus for up to three children, managed from one account.',
    description: 'Each child gets their own tutor, history, mastery map and study plans.',
    kind: 'AI',
    entitlements: ['STUDENT_AI_PLUS'],
    priceKobo: 30_000_00,
    schoolPriceKobo: null,
    period: 'TERM',
    periodMonths: 4,
    maxChildren: 3,
    aiSessions: 300,
    features: ['AI Student Plus for 3 children', 'One payment, one renewal date', 'Separate progress for each child'],
    sortOrder: 2,
  },
  {
    code: 'AI_PRO',
    name: 'AI Student Pro',
    tagline: 'For serious exam candidates: the highest allowance and deep reasoning by default.',
    description: 'Everything in Plus, with deep explanations on every question and the largest allowance.',
    kind: 'AI',
    entitlements: ['STUDENT_AI_PRO'],
    priceKobo: 25_000_00,
    schoolPriceKobo: 18_000_00,
    period: 'TERM',
    periodMonths: 4,
    maxChildren: 1,
    aiSessions: 800,
    features: ['800 tutor sessions a term', 'Deep reasoning by default', 'Everything in Plus'],
    sortOrder: 3,
  },
  ...(
    [
      ['BECE', 'BECE Prep', 7_500_00, 5_000_00],
      ['WAEC', 'WAEC Prep', 10_000_00, 7_000_00],
      ['NECO', 'NECO Prep', 8_000_00, 5_500_00],
      ['JAMB', 'JAMB Prep', 10_000_00, 7_000_00],
    ] as const
  ).map(([exam, name, price, school], i) => ({
    code: `EXAM_${exam}_PREP`,
    name,
    tagline: `${name.replace(' Prep', '')} practice, timed mock exams and revision plans.`,
    description: `Unlimited ${exam} practice from the reviewed question bank, timed CBT-style mocks, marked results with explanations, and an AI review after every attempt.`,
    kind: 'EXAM',
    entitlements: [`EXAM_${exam}`],
    priceKobo: price,
    schoolPriceKobo: school,
    period: 'ONE_OFF',
    periodMonths: 12,
    maxChildren: 1,
    aiSessions: null,
    features: ['Unlimited practice', 'Timed mock exams', 'Answers explained', 'Topic-by-topic results', 'Valid for 12 months'],
    sortOrder: 10 + i,
  })),
];

const TOPICS: Record<string, Partial<Record<Level, string[]>>> = {
  Mathematics: {
    JUNIOR: ['Whole numbers', 'Fractions and decimals', 'Algebraic expressions', 'Linear equations', 'Angles and polygons', 'Area and perimeter', 'Statistics'],
    SENIOR: ['Number bases', 'Indices and logarithms', 'Algebraic expressions', 'Quadratic equations', 'Simultaneous equations', 'Sets and Venn diagrams', 'Variation', 'Sequences and series', 'Coordinate geometry', 'Geometry and angles', 'Mensuration', 'Trigonometry', 'Statistics', 'Probability', 'Commercial arithmetic'],
  },
  'English Language': {
    JUNIOR: ['Comprehension', 'Grammar', 'Vocabulary', 'Spelling'],
    SENIOR: ['Comprehension', 'Summary', 'Lexis and structure', 'Concord', 'Synonyms and antonyms', 'Oral English', 'Essay writing'],
  },
  'Basic Science': { JUNIOR: ['Living things', 'Matter', 'Energy', 'Environment', 'Human body'] },
  Biology: { SENIOR: ['Cell biology', 'Nutrition', 'Transport in organisms', 'Reproduction', 'Ecology', 'Genetics'] },
  Physics: { SENIOR: ['Motion', 'Forces and Newton\'s laws', 'Work, energy and power', 'Heat', 'Waves', 'Electricity'] },
  Chemistry: { SENIOR: ['Atomic structure', 'Chemical bonding', 'Mole concept', 'Acids, bases and salts', 'Non-metals and their compounds', 'Electrolysis', 'Organic chemistry'] },
  Economics: { SENIOR: ['Demand and supply', 'Elasticity', 'Production', 'Money and banking', 'National income', 'Market structures'] },
};

type Q = [exams: string[], subject: string, topic: string, stem: string, options: string[], answer: number, explanation: string];
const SENIOR = ['WAEC', 'NECO', 'JAMB'];
const QUESTIONS: Q[] = [
  // Mathematics (senior)
  [SENIOR, 'Mathematics', 'Number bases', 'Convert 1011 (base two) to base ten.', ['9', '11', '13', '10'], 1, '1×8 + 0×4 + 1×2 + 1×1 = 11.'],
  [SENIOR, 'Mathematics', 'Indices and logarithms', 'Simplify log₁₀ 8 + log₁₀ 125.', ['2', '3', '133', '1000'], 1, 'log 8 + log 125 = log (8 × 125) = log 1000 = 3.'],
  [SENIOR, 'Mathematics', 'Indices and logarithms', 'Evaluate 2⁻³.', ['−8', '−6', '1/8', '1/6'], 2, 'A negative index means a reciprocal: 2⁻³ = 1/2³ = 1/8.'],
  [SENIOR, 'Mathematics', 'Quadratic equations', 'Solve x² − 5x + 6 = 0.', ['x = 2 or x = 3', 'x = −2 or x = −3', 'x = 1 or x = 6', 'x = −1 or x = 6'], 0, 'x² − 5x + 6 = (x − 2)(x − 3) = 0, so x = 2 or x = 3.'],
  [SENIOR, 'Mathematics', 'Algebraic expressions', 'Simplify (x² − 9)/(x − 3).', ['x − 3', 'x + 3', 'x² − 3', 'x + 9'], 1, 'x² − 9 = (x − 3)(x + 3); cancelling (x − 3) leaves x + 3.'],
  [SENIOR, 'Mathematics', 'Simultaneous equations', 'Solve x + y = 7 and x − y = 1.', ['x = 4, y = 3', 'x = 3, y = 4', 'x = 5, y = 2', 'x = 6, y = 1'], 0, 'Adding the equations gives 2x = 8, so x = 4 and y = 3.'],
  [SENIOR, 'Mathematics', 'Sets and Venn diagrams', 'If P = {2, 4, 6, 8} and Q = {4, 8, 12}, find P ∩ Q.', ['{4, 8}', '{2, 4, 6, 8, 12}', '{2, 6}', '{12}'], 0, 'The intersection contains the elements in both sets: 4 and 8.'],
  [SENIOR, 'Mathematics', 'Statistics', 'Find the mean of 3, 5, 7, 9 and 11.', ['5', '7', '9', '35'], 1, 'The sum is 35 and there are 5 numbers: 35 ÷ 5 = 7.'],
  [SENIOR, 'Mathematics', 'Probability', 'A fair die is thrown once. What is the probability of getting an even number?', ['1/6', '1/3', '1/2', '2/3'], 2, 'Three of the six faces (2, 4, 6) are even: 3/6 = 1/2.'],
  [SENIOR, 'Mathematics', 'Trigonometry', 'What is the value of sin 30°?', ['1/2', '√3/2', '1', '√2/2'], 0, 'sin 30° = 1/2 (from the 30°–60°–90° triangle).'],
  [SENIOR, 'Mathematics', 'Mensuration', 'Find the area of a circle of radius 7 cm. (Take π = 22/7.)', ['44 cm²', '154 cm²', '49 cm²', '308 cm²'], 1, 'Area = πr² = 22/7 × 7 × 7 = 154 cm².'],
  [SENIOR, 'Mathematics', 'Variation', 'y varies directly as x, and y = 12 when x = 4. Find y when x = 10.', ['30', '40', '22', '48'], 0, 'y = kx with k = 12 ÷ 4 = 3, so y = 3 × 10 = 30.'],
  [SENIOR, 'Mathematics', 'Sequences and series', 'What is the next term of the sequence 5, 9, 13, …?', ['15', '17', '18', '21'], 1, 'The common difference is 4, so the next term is 13 + 4 = 17.'],
  [SENIOR, 'Mathematics', 'Coordinate geometry', 'Find the gradient of the line through (1, 2) and (3, 8).', ['2', '3', '4', '6'], 1, 'Gradient = (8 − 2) ÷ (3 − 1) = 6 ÷ 2 = 3.'],
  [SENIOR, 'Mathematics', 'Geometry and angles', 'What is the sum of the interior angles of a hexagon?', ['540°', '720°', '900°', '1080°'], 1, '(n − 2) × 180° = 4 × 180° = 720°.'],
  [SENIOR, 'Mathematics', 'Commercial arithmetic', 'Find the simple interest on ₦20,000 at 5% per annum for 3 years.', ['₦1,000', '₦3,000', '₦23,000', '₦30,000'], 1, 'I = PRT/100 = 20,000 × 5 × 3 ÷ 100 = ₦3,000.'],
  // English (senior)
  [SENIOR, 'English Language', 'Synonyms and antonyms', 'Choose the word nearest in meaning to the word in capitals: The manager was CANDID about the losses.', ['frank', 'angry', 'worried', 'secretive'], 0, 'Candid means open and honest, i.e. frank.'],
  [SENIOR, 'English Language', 'Synonyms and antonyms', 'Choose the word opposite in meaning to the word in capitals: The new recruit was TIMID.', ['cowardly', 'bold', 'tired', 'quiet'], 1, 'Timid means shy or lacking courage; its opposite is bold.'],
  [SENIOR, 'English Language', 'Concord', 'Neither the teacher nor the students ___ in the hall.', ['is', 'are', 'was', 'has been'], 1, 'With "neither … nor", the verb agrees with the nearer subject, "students", which is plural.'],
  [SENIOR, 'English Language', 'Concord', 'Each of the boys ___ a book.', ['have', 'has', 'are having', 'were having'], 1, '"Each" is singular, so it takes the singular verb "has".'],
  [SENIOR, 'English Language', 'Lexis and structure', 'Choose the correctly spelt word.', ['accomodation', 'accommodation', 'acommodation', 'accomodasion'], 1, 'Accommodation has a double c and a double m.'],
  [SENIOR, 'English Language', 'Lexis and structure', 'He is very good ___ mathematics.', ['in', 'at', 'on', 'with'], 1, 'The fixed expression is "good at" a subject or skill.'],
  [SENIOR, 'English Language', 'Lexis and structure', 'She can swim, ___?', ['can she', "can't she", "doesn't she", "isn't it"], 1, 'A positive statement with "can" takes the negative tag "can\'t she?".'],
  [SENIOR, 'English Language', 'Lexis and structure', 'The thief TOOK TO HIS HEELS when he saw the police. This means he', ['ran away', 'was arrested', 'hurt his feet', 'hid in a house'], 0, '"To take to one\'s heels" is an idiom meaning to run away.'],
  [SENIOR, 'English Language', 'Oral English', 'Which word has the same vowel sound as "seat"?', ['sit', 'set', 'feet', 'sate'], 2, '"Seat" and "feet" both have the long /iː/ sound.'],
  [SENIOR, 'English Language', 'Oral English', 'Which word is stressed on the second syllable?', ['water', 'begin', 'table', 'happy'], 1, 'be-GIN is stressed on the second syllable; the others on the first.'],
  // Biology
  [SENIOR, 'Biology', 'Cell biology', 'Which organelle is known as the powerhouse of the cell?', ['Nucleus', 'Ribosome', 'Mitochondrion', 'Vacuole'], 2, 'Mitochondria release energy from food in aerobic respiration.'],
  [SENIOR, 'Biology', 'Cell biology', 'Which structure is found in plant cells but not in animal cells?', ['Nucleus', 'Chloroplast', 'Cell membrane', 'Mitochondrion'], 1, 'Chloroplasts (for photosynthesis) occur in plant cells only.'],
  [SENIOR, 'Biology', 'Nutrition', 'Iodine solution turns blue-black in the presence of', ['protein', 'starch', 'fat', 'glucose'], 1, 'Iodine is the standard food test for starch.'],
  [SENIOR, 'Biology', 'Nutrition', 'The enzyme in human saliva acts on', ['proteins', 'fats', 'starch', 'vitamins'], 2, 'Salivary amylase begins the digestion of starch in the mouth.'],
  [SENIOR, 'Biology', 'Ecology', 'In a food chain, green plants are', ['producers', 'primary consumers', 'decomposers', 'secondary consumers'], 0, 'Green plants make their own food by photosynthesis, so they are producers.'],
  [SENIOR, 'Biology', 'Genetics', 'Tallness (T) is dominant over shortness (t). What fraction of the offspring of Tt × tt will be tall?', ['25%', '50%', '75%', '100%'], 1, 'The offspring are Tt, Tt, tt, tt: half are tall.'],
  [SENIOR, 'Biology', 'Transport in organisms', 'Which blood vessel carries blood away from the heart?', ['Vein', 'Artery', 'Capillary', 'Venule'], 1, 'Arteries carry blood away from the heart.'],
  [SENIOR, 'Biology', 'Reproduction', 'In humans, fertilisation normally takes place in the', ['uterus', 'ovary', 'oviduct', 'vagina'], 2, 'The egg is fertilised in the oviduct (fallopian tube).'],
  // Physics
  [SENIOR, 'Physics', "Forces and Newton's laws", 'What is the SI unit of force?', ['joule', 'newton', 'watt', 'pascal'], 1, 'Force is measured in newtons (N).'],
  [SENIOR, 'Physics', 'Motion', 'A car starts from rest and accelerates uniformly at 2 m/s² for 5 s. What is its final velocity?', ['2.5 m/s', '7 m/s', '10 m/s', '25 m/s'], 2, 'v = u + at = 0 + 2 × 5 = 10 m/s.'],
  [SENIOR, 'Physics', 'Work, energy and power', 'How much work is done in lifting a 10 kg load through 2 m? (g = 10 m/s²)', ['20 J', '100 J', '200 J', '2000 J'], 2, 'W = mgh = 10 × 10 × 2 = 200 J.'],
  [SENIOR, 'Physics', 'Work, energy and power', 'A machine does 600 J of work in 30 s. What is its power?', ['18000 W', '20 W', '570 W', '630 W'], 1, 'P = W/t = 600 ÷ 30 = 20 W.'],
  [SENIOR, 'Physics', 'Waves', 'A wave has a frequency of 50 Hz and a wavelength of 4 m. What is its speed?', ['12.5 m/s', '54 m/s', '200 m/s', '46 m/s'], 2, 'v = fλ = 50 × 4 = 200 m/s.'],
  [SENIOR, 'Physics', 'Electricity', 'A p.d. of 12 V drives a current of 3 A through a conductor. What is its resistance?', ['36 Ω', '4 Ω', '0.25 Ω', '15 Ω'], 1, 'R = V/I = 12 ÷ 3 = 4 Ω.'],
  [SENIOR, 'Physics', 'Electricity', 'What is the combined resistance of two 6 Ω resistors in parallel?', ['12 Ω', '6 Ω', '3 Ω', '1.5 Ω'], 2, '1/R = 1/6 + 1/6 = 1/3, so R = 3 Ω.'],
  [SENIOR, 'Physics', 'Heat', 'Heat travels through a vacuum by', ['conduction', 'convection', 'radiation', 'evaporation'], 2, 'Only radiation needs no medium.'],
  // Chemistry
  [SENIOR, 'Chemistry', 'Atomic structure', 'The atomic number of an element is the number of', ['neutrons', 'protons', 'nucleons', 'electrons and neutrons'], 1, 'Atomic number = number of protons in the nucleus.'],
  [SENIOR, 'Chemistry', 'Atomic structure', 'How many electrons are in the outermost shell of chlorine (atomic number 17)?', ['1', '5', '7', '8'], 2, 'The configuration is 2, 8, 7.'],
  [SENIOR, 'Chemistry', 'Chemical bonding', 'The bond in sodium chloride is', ['covalent', 'ionic', 'metallic', 'hydrogen'], 1, 'Sodium transfers an electron to chlorine, forming an ionic (electrovalent) bond.'],
  [SENIOR, 'Chemistry', 'Mole concept', 'How many moles are in 22 g of carbon(IV) oxide? (C = 12, O = 16)', ['0.5', '1', '2', '22'], 0, 'Molar mass of CO₂ = 44 g/mol; 22 ÷ 44 = 0.5 mol.'],
  [SENIOR, 'Chemistry', 'Acids, bases and salts', 'What is the pH of a neutral solution at 25 °C?', ['0', '1', '7', '14'], 2, 'Neutral solutions have pH 7.'],
  [SENIOR, 'Chemistry', 'Organic chemistry', 'What is the general formula of the alkanes?', ['CₙH₂ₙ', 'CₙH₂ₙ₊₂', 'CₙH₂ₙ₋₂', 'CₙHₙ'], 1, 'Alkanes are saturated hydrocarbons: CₙH₂ₙ₊₂.'],
  [SENIOR, 'Chemistry', 'Electrolysis', 'During electrolysis, oxidation takes place at the', ['cathode', 'anode', 'both electrodes', 'neither electrode'], 1, 'Anions lose electrons (are oxidised) at the anode.'],
  [SENIOR, 'Chemistry', 'Non-metals and their compounds', 'Which gas turns limewater milky?', ['Oxygen', 'Hydrogen', 'Carbon(IV) oxide', 'Nitrogen'], 2, 'CO₂ reacts with limewater to form insoluble calcium carbonate.'],
  // Economics
  [SENIOR, 'Economics', 'Demand and supply', 'When the price of a good rises, other things being equal, the quantity demanded falls. This is the', ['law of supply', 'law of demand', 'law of diminishing returns', "Engel's law"], 1, 'The law of demand states the inverse relationship between price and quantity demanded.'],
  [SENIOR, 'Economics', 'Elasticity', 'If the price elasticity of demand for a good is 2, demand is', ['inelastic', 'unitary', 'elastic', 'perfectly inelastic'], 2, 'An elasticity greater than 1 means demand is elastic.'],
  [SENIOR, 'Economics', 'Production', 'The reward for land as a factor of production is', ['wages', 'interest', 'rent', 'profit'], 2, 'Land earns rent; labour wages, capital interest, the entrepreneur profit.'],
  [SENIOR, 'Economics', 'Money and banking', 'Which of these is a function of the Central Bank of Nigeria?', ['Accepting deposits from the public', 'Issuing the national currency', 'Granting loans to traders', 'Selling insurance policies'], 1, 'The central bank issues currency; commercial banks serve the public.'],
  [SENIOR, 'Economics', 'National income', 'Gross Domestic Product is the total value of', ['final goods and services produced within a country in a year', 'all goods imported in a year', 'government spending in a year', 'money in circulation'], 0, 'GDP measures final output produced within the country over a period.'],
  [SENIOR, 'Economics', 'Market structures', 'A market with only one seller is called', ['oligopoly', 'monopoly', 'perfect competition', 'duopoly'], 1, 'A monopoly has a single seller.'],
  // BECE (junior)
  [['BECE'], 'Mathematics', 'Fractions and decimals', 'Simplify 3/4 + 1/8.', ['4/12', '7/8', '1', '3/32'], 1, '3/4 = 6/8, and 6/8 + 1/8 = 7/8.'],
  [['BECE'], 'Mathematics', 'Fractions and decimals', 'Express 0.25 as a percentage.', ['2.5%', '25%', '250%', '0.25%'], 1, '0.25 × 100 = 25%.'],
  [['BECE'], 'Mathematics', 'Algebraic expressions', 'Simplify 3a + 5a − 2a.', ['6a', '10a', '8a', '6'], 0, '3 + 5 − 2 = 6, so 6a.'],
  [['BECE'], 'Mathematics', 'Linear equations', 'Solve 2x + 5 = 17.', ['x = 6', 'x = 11', 'x = 8.5', 'x = 12'], 0, '2x = 12, so x = 6.'],
  [['BECE'], 'Mathematics', 'Angles and polygons', 'The angles in a triangle add up to', ['90°', '180°', '270°', '360°'], 1, 'The interior angles of any triangle sum to 180°.'],
  [['BECE'], 'Mathematics', 'Area and perimeter', 'Find the perimeter of a rectangle 8 cm long and 5 cm wide.', ['13 cm', '26 cm', '40 cm', '80 cm'], 1, 'Perimeter = 2 × (8 + 5) = 26 cm.'],
  [['BECE'], 'Mathematics', 'Statistics', 'Find the mode of 2, 3, 3, 5, 7, 3, 8.', ['2', '3', '5', '7'], 1, '3 occurs most often (three times).'],
  [['BECE'], 'Mathematics', 'Whole numbers', 'What is the LCM of 4 and 6?', ['2', '12', '24', '10'], 1, 'The smallest number divisible by both 4 and 6 is 12.'],
  [['BECE'], 'English Language', 'Grammar', 'I have ___ my homework.', ['did', 'done', 'do', 'doing'], 1, '"Have" takes the past participle: "have done".'],
  [['BECE'], 'English Language', 'Grammar', 'She ___ to school every day.', ['go', 'goes', 'going', 'gone'], 1, 'Third person singular, present simple: "she goes".'],
  [['BECE'], 'English Language', 'Grammar', 'What is the plural of "child"?', ['childs', 'children', 'childrens', 'childes'], 1, '"Child" has the irregular plural "children".'],
  [['BECE'], 'English Language', 'Vocabulary', 'Choose the word nearest in meaning to BIG.', ['small', 'large', 'thin', 'short'], 1, 'Big and large mean the same.'],
  [['BECE'], 'English Language', 'Spelling', 'Choose the correctly spelt word.', ['recieve', 'receive', 'receeve', 'riceive'], 1, '"i before e except after c": receive.'],
  [['BECE'], 'Basic Science', 'Living things', 'Green plants make their own food by', ['respiration', 'photosynthesis', 'transpiration', 'digestion'], 1, 'Photosynthesis uses light, water and carbon dioxide to make food.'],
  [['BECE'], 'Basic Science', 'Living things', 'Which gas do green plants take in for photosynthesis?', ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], 1, 'Plants take in carbon dioxide and give out oxygen in photosynthesis.'],
  [['BECE'], 'Basic Science', 'Matter', 'Water changing into water vapour is called', ['condensation', 'evaporation', 'freezing', 'melting'], 1, 'A liquid becoming a gas is evaporation.'],
  [['BECE'], 'Basic Science', 'Matter', 'Which list gives the three states of matter?', ['solid, liquid, gas', 'hot, warm, cold', 'heavy, light, empty', 'wood, metal, plastic'], 0, 'Matter exists as solid, liquid or gas.'],
  [['BECE'], 'Basic Science', 'Energy', 'Energy from the sun is called', ['wind energy', 'solar energy', 'chemical energy', 'sound energy'], 1, 'Solar energy comes from the sun.'],
  [['BECE'], 'Basic Science', 'Human body', 'Which organ pumps blood round the body?', ['Lungs', 'Heart', 'Liver', 'Kidney'], 1, 'The heart pumps blood through the blood vessels.'],
];

export async function ensurePlatformContent(prisma: PrismaClient): Promise<string> {
  let created = 0;
  for (const p of PRODUCTS) {
    const exists = await prisma.product.findUnique({ where: { code: p.code }, select: { id: true } });
    if (!exists) {
      await prisma.product.create({ data: p });
      created++;
    }
  }
  const topicRows = Object.entries(TOPICS).flatMap(([subject, levels]) =>
    Object.entries(levels).flatMap(([level, names]) => names!.map((name, order) => ({ subject, level, name, order }))),
  );
  const t = await prisma.syllabusTopic.createMany({ data: topicRows, skipDuplicates: true });
  let questions = 0;
  if ((await prisma.examQuestion.count()) === 0) {
    const topics = await prisma.syllabusTopic.findMany();
    const topicId = (subject: string, name: string, exam: string) => topics.find((x) => x.subject === subject && x.name === name && x.level === (exam === 'BECE' ? 'JUNIOR' : 'SENIOR'))?.id ?? null;
    const rows = QUESTIONS.flatMap(([exams, subject, topic, stem, options, answer, explanation]) =>
      exams.map((exam) => ({ exam, subject, topicId: topicId(subject, topic, exam), stem, options, answer, explanation, difficulty: 'MEDIUM', source: 'AUTHORED', status: 'PUBLISHED' })),
    );
    questions = (await prisma.examQuestion.createMany({ data: rows })).count;
  }
  return `${created} products, ${t.count} topics, ${questions} exam questions`;
}
