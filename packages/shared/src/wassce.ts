import { z } from 'zod';

/**
 * The full mock: one subject sat the way the exam body sets it, paper by
 * paper, each on its own clock, with the real counts, times and marks from
 * the subject's syllabus ("scheme of examination").
 *
 * WASSCE (WAEC) and NECO's SSCE: Paper 1 objective, Paper 2 theory, Paper 3
 * practical, orals or a second theory paper. BECE (NECO, junior secondary): mostly two or more
 * objective papers, composite subjects drawing each paper from its own
 * component (Basic Science and Technology Paper 1 from Basic Science and PHE).
 * Papers that can only be done in person (studio, workshop, kitchen,
 * performance, keyboarding) are listed but not sat in the app; the mock grade
 * then uses the in-app papers.
 */

export type MockPaperKind = 'OBJECTIVE' | 'THEORY' | 'PRACTICAL' | 'NOT_IN_APP';
export interface MockPaper {
  /** 1, 2, 3 (BECE Basic Science and Technology has four). */
  paper: number;
  kind: MockPaperKind;
  /** e.g. "Paper 1: Objective", "Paper 3: Alternative to Practical". */
  title: string;
  /** The exam body's time for the paper. */
  minutes: number;
  /** The exam body's marks for the paper (0 when the syllabus doesn't state them; only for papers not sat in the app). */
  marks: number;
  /** OBJECTIVE: number of items. */
  questions?: number;
  /** THEORY/PRACTICAL: questions shown. */
  offered?: number;
  /** THEORY/PRACTICAL: how many the candidate must answer ("answer any N"). */
  answer?: number;
  /** Restrict the pool to these syllabus topics (and their subtopics). */
  topics?: string[];
  excludeTopics?: string[];
  /** The rubric, exam style. */
  instructions: string;
  /** e.g. why a paper isn't sat in the app. */
  note?: string;
  /** Time and count not yet checked against the exam body's own syllabus (NECO's follow its usual format until then). */
  approximate?: boolean;
}
/** The WASSCE names, kept for the code written before BECE mocks. */
export type WasscePaperKind = MockPaperKind;
export type WasscePaper = MockPaper;

const obj = (questions: number, minutes: number, marks: number, extra: Partial<WasscePaper> = {}): WasscePaper => ({
  paper: 1,
  kind: 'OBJECTIVE',
  title: 'Paper 1: Objective',
  minutes,
  marks,
  questions,
  instructions: `Answer all ${questions} questions. Each question is followed by four options lettered A to D; choose the correct one.`,
  ...extra,
});
const essay = (offered: number, answer: number, minutes: number, marks: number, instructions: string, extra: Partial<WasscePaper> = {}): WasscePaper => ({
  paper: 2,
  kind: 'THEORY',
  title: 'Paper 2: Essay',
  minutes,
  marks,
  offered,
  answer,
  instructions,
  ...extra,
});
const atp = (offered: number, answer: number, minutes: number, marks: number, instructions: string): WasscePaper => ({
  paper: 3,
  kind: 'PRACTICAL',
  title: 'Paper 3: Alternative to Practical',
  minutes,
  marks,
  offered,
  answer,
  instructions,
});
const inPerson = (title: string, minutes: number, marks: number, note: string, paper = 3): WasscePaper => ({ paper, kind: 'NOT_IN_APP', title, minutes, marks, instructions: '', note });

const WORKSHOP = 'A practical test done in the school workshop under WAEC supervision, so it isn’t sat in the app.';
const STUDIO = 'A practical project executed over five days (six hours a day) with preparatory sketches; it is done in school, so it isn’t sat in the app.';
const LANGUAGE_P2 = (lang: string) => essay(13, 6, 120, 100, `Answer six questions in ${lang}: three from Section A (Language), two from Section B (Literature) and one from Section C (Culture).`);

const ORALS = ['Oral English: Test of Orals', 'Consonants', 'Vowels', 'Stress', 'Intonation'];
const LIT_P1 = ['General Knowledge of Literature', 'Unseen Prose', 'Unseen Poetry', 'Shakespearean Text'];
const GEO_PRACTICAL = ['Map work', 'The earth as a planet', 'Rocks', 'Tectonic processes', 'Denudational processes', 'Weather', 'Climate', 'The environment', 'Field work'];

/** Every WAEC subject with a syllabus, by the app's subject name. */
export const WASSCE_PAPERS: Record<string, WasscePaper[]> = {
  'Agricultural Science': [
    obj(50, 50, 50),
    essay(6, 5, 130, 90, 'Answer five of the six questions.'),
    atp(4, 4, 90, 60, 'Answer all four questions.'),
  ],
  'Animal Husbandry': [obj(40, 40, 40), essay(6, 4, 120, 80, 'Answer four of the six questions. Each carries 20 marks.'), inPerson('Paper 3: Practical', 90, 60, 'A practical paper on specimens and farm work, done in school, so it isn’t sat in the app.')],
  'Auto Body Repairs and Spray Painting': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 190, 100, WORKSHOP)],
  'Auto Electrical Work': [obj(40, 45, 40), essay(6, 4, 60, 60, 'Answer any four of the six short-structured questions.'), inPerson('Paper 3: Practical', 120, 90, WORKSHOP)],
  'Auto Mechanics': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 120, 100, WORKSHOP)],
  'Auto Parts Merchandising': [obj(40, 50, 40), essay(7, 5, 120, 100, 'Answer five questions: two from Section A (including the compulsory question) and three from Section B.')],
  'Basic Electricity': [obj(50, 60, 50), essay(7, 5, 60, 50, 'Answer five questions: three from Section A and two from Section C.'), inPerson('Paper 3: Practical', 180, 100, 'Two experiments carried out in the school laboratory, so it isn’t sat in the app.')],
  Basketry: [obj(40, 50, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Practical project', 1800, 100, STUDIO)],
  Biology: [
    obj(50, 50, 50),
    essay(5, 3, 100, 70, 'Answer three questions: two from Section A and the compulsory short-structured questions in Section C.'),
    atp(3, 3, 120, 80, 'Answer all three questions: the two in Section A and the one in Section C.'),
  ],
  'Book Keeping': [obj(40, 50, 40), essay(9, 5, 120, 80, 'Answer five questions: two from Section A (Theory) and three from Section B (Practice).')],
  'Building Construction': [obj(40, 45, 40), essay(5, 4, 60, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Building Drawing', 150, 100, 'A drawing paper done on the drawing board in school, so it isn’t sat in the app.')],
  'Business Management': [obj(50, 60, 30), essay(8, 4, 120, 70, 'Answer four questions: the compulsory case study and any three others.')],
  'Catering Craft Practice': [obj(40, 40, 40), essay(6, 5, 50, 40, 'Answer five of the six questions.'), inPerson('Paper 3: Alternative to Practical', 40, 40, 'Short questions on kitchen practice, set with Papers 1 and 2; not in the app yet.')],
  Ceramics: [obj(40, 50, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Practical project', 1800, 100, STUDIO)],
  Chemistry: [
    obj(50, 60, 50),
    essay(14, 13, 120, 100, 'Answer all ten short questions in Section A and any three questions from Section B.'),
    atp(3, 3, 90, 50, 'Answer all three questions: quantitative analysis, qualitative analysis and practical activities.'),
  ],
  'Christian Religious Studies': [obj(50, 60, 40), essay(9, 4, 120, 60, 'Answer four questions: at least one from each section, the fourth from Section A or B.')],
  'Civic Education': [obj(50, 60, 40), essay(9, 4, 120, 60, 'Answer four questions, choosing at least one from each section.')],
  'Clerical Office Duties': [obj(50, 50, 30), essay(7, 4, 130, 70, 'Answer four questions: the compulsory case study and any three others.')],
  Commerce: [obj(50, 50, 50), essay(8, 5, 120, 100, 'Answer any five of the eight questions.')],
  'Computer Studies': [
    obj(50, 60, 25),
    essay(5, 3, 60, 30, 'Answer any three of the five questions.'),
    atp(3, 3, 120, 45, 'Answer all three questions on practical work.'),
  ],
  'Data Processing': [obj(40, 60, 40), essay(6, 5, 120, 70, 'Answer five questions: any three from Section A and both questions in Section B.')],
  Economics: [obj(50, 60, 50), essay(8, 4, 120, 80, 'Answer four questions: one from Section A and any three from Section B.')],
  Edo: [obj(60, 60, 60), LANGUAGE_P2('Edo')],
  Efik: [obj(60, 60, 60), LANGUAGE_P2('Efik')],
  'English Language': [
    obj(80, 60, 40, { excludeTopics: ORALS, instructions: 'Answer all 80 questions on lexis and structure. Choose the option that best completes or answers each one.' }),
    essay(5, 3, 120, 100, 'Answer three questions: one essay from Section A, the comprehension (Section B) and the summary (Section C).', { topics: ['Essay Writing', 'Comprehension', 'Summary'] }),
    obj(60, 45, 30, { paper: 3, title: 'Paper 3: Test of Orals', topics: ORALS, instructions: 'Answer all 60 questions on vowels, consonants, stress and intonation.' }),
  ],
  'Financial Accounting': [obj(50, 60, 25), essay(9, 5, 150, 75, 'Answer five questions: two from Section A (Theory) and three from Section B (Practice).')],
  'Foods and Nutrition': [obj(60, 60, 60), essay(6, 4, 75, 40, 'Answer four of the six questions.'), inPerson('Paper 3: Practical', 180, 100, 'A cookery practical conducted in school by a visiting examiner, so it isn’t sat in the app.')],
  Forestry: [obj(50, 60, 50), essay(6, 4, 120, 80, 'Answer four of the six questions. Each carries 20 marks.'), inPerson('Paper 3: Practical', 120, 60, 'A practical paper on specimens and field work, done in school, so it isn’t sat in the app.')],
  French: [obj(40, 60, 40), essay(6, 2, 75, 40, 'Answer two questions in French (about 100 words each): one essay from Section A and one letter from Section B.'), inPerson('Paper 3: Oral', 40, 50, 'Listening comprehension, reading aloud and conversation with an examiner, so it isn’t sat in the app.')],
  'Further Mathematics': [obj(40, 90, 40), essay(15, 12, 150, 100, 'Answer all eight questions in Section A and any four from Section B, with at least one from each part.')],
  Geography: [
    obj(50, 60, 50),
    essay(9, 4, 120, 80, 'Answer four questions: two from Section A (Economic and Human Geography) and two from Section B (Regional Geography of Nigeria).', { excludeTopics: GEO_PRACTICAL }),
    essay(8, 4, 110, 70, 'Answer four questions. Question 1 (map reading and interpretation) is compulsory.', { paper: 3, title: 'Paper 3: Practical and Physical Geography', topics: GEO_PRACTICAL }),
  ],
  Government: [obj(50, 60, 40), essay(10, 4, 120, 60, 'Answer four questions: two from Section A and two from Section B.')],
  'GSM Phone Maintenance and Repairs': [obj(40, 45, 40), essay(14, 12, 105, 100, 'Answer any ten questions from Section A and both questions in Section B.')],
  Hausa: [obj(60, 60, 60), LANGUAGE_P2('Hausa')],
  'Health Education': [obj(50, 60, 50), essay(9, 8, 60, 70, 'Answer all six questions in Section A and two from Section B.'), inPerson('Paper 3: Practical', 105, 80, 'A practical test done in school, so it isn’t sat in the app.')],
  History: [obj(50, 60, 40), essay(9, 4, 120, 60, 'Answer four questions, at least one from each section.')],
  'Home Management': [obj(50, 60, 50), essay(6, 4, 75, 50, 'Answer four of the six questions.'), inPerson('Paper 3: Practical', 180, 100, 'A practical test conducted in school by a visiting examiner, so it isn’t sat in the app.')],
  Ibibio: [obj(60, 60, 60), LANGUAGE_P2('Ibibio')],
  Igbo: [obj(60, 60, 60), LANGUAGE_P2('Igbo')],
  'Information and Communication Technology': [obj(40, 45, 20), essay(10, 6, 120, 80, 'Answer the four compulsory practical-knowledge questions and any two others.')],
  Insurance: [obj(50, 50, 50), essay(7, 5, 120, 80, 'Answer five questions: the compulsory case study question and any four from Section B.')],
  'Islamic Religious Studies': [obj(50, 50, 50), essay(6, 4, 120, 100, 'Answer four questions: the compulsory question and any three others.')],
  'Literature in English': [
    obj(50, 60, 50, { topics: LIT_P1, instructions: 'Answer all 50 questions: general knowledge of literature, the unseen prose and poem, and the Shakespeare text.' }),
    essay(4, 2, 75, 50, 'Answer two questions: one from Section A (African prose) and one from Section B (non-African prose).', { title: 'Paper 2: Prose', topics: ['African Prose', 'Non-African Prose'] }),
    essay(8, 4, 150, 50, 'Answer four questions, one from each section: African drama, non-African drama, African poetry and non-African poetry.', {
      paper: 3,
      title: 'Paper 3: Drama and Poetry',
      topics: ['African Drama', 'Non-African Drama', 'African Poetry', 'Non-African Poetry'],
    }),
  ],
  Marketing: [obj(40, 50, 40), essay(6, 4, 120, 80, 'Answer any four of the six questions.')],
  Mathematics: [obj(50, 90, 50), essay(13, 10, 150, 100, 'Answer all five questions in Section A and any five from Section B.')],
  Mining: [obj(40, 40, 40), essay(15, 13, 125, 100, 'Answer all ten short questions in Section A and any three from Section B.')],
  Music: [obj(40, 60, 40), essay(5, 3, 120, 60, 'Answer three questions: Questions 1 (theory and composition) and 2 (set works) are compulsory, plus one other.'), inPerson('Paper 3: Aural and Performance', 75, 100, 'An aural test and a performance on an instrument or voice before an examiner, so it isn’t sat in the app.')],
  'Office Practice': [obj(50, 60, 50), essay(7, 5, 130, 100, 'Answer five questions: the case study and any four others.')],
  'Painting and Decorating': [obj(40, 60, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Decorative Painting', 180, 100, 'A painting task executed in school under WAEC supervision, so it isn’t sat in the app.')],
  Physics: [
    obj(50, 75, 50),
    essay(12, 8, 90, 60, 'Answer eight questions: any five from Section A and any three from Section B.'),
    atp(3, 2, 165, 50, 'Answer any two of the three questions.'),
  ],
  'Radio, Television and Electronics Works': [obj(40, 45, 40), essay(6, 4, 60, 60, 'Answer any four of the six short-structured questions.'), inPerson('Paper 3: Practical', 120, 90, WORKSHOP)],
  'Refrigeration and Air Conditioning': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 120, 100, WORKSHOP)],
  Shorthand: [inPerson('Dictation and transcription', 73, 100, 'Passages dictated at 80 words a minute and transcribed on the typewriter, so it isn’t sat in the app.', 1)],
  'Store Management': [obj(50, 60, 50), essay(7, 5, 120, 100, 'Answer any five of the seven questions.')],
  Textiles: [obj(40, 50, 40), essay(6, 4, 120, 60, 'Answer four of the six questions.'), inPerson('Paper 3: Practical project', 1800, 100, STUDIO)],
  Tourism: [obj(40, 40, 40), essay(15, 13, 110, 100, 'Answer all ten questions in Section A and any three from Section B.')],
  Typewriting: [inPerson('Speed and production tests', 165, 100, 'A speed test and production tasks on the typewriter, so it isn’t sat in the app.', 1)],
  'Visual Art': [obj(40, 50, 40), essay(8, 4, 120, 60, 'Answer four questions: one from Section A, two from Section B and one from Section C.'), inPerson('Paper 3: Practical', 360, 100, 'Drawing and creative design done in the studio, so it isn’t sat in the app.')],
  'Welding and Fabrication': [obj(40, 60, 40), essay(5, 4, 90, 60, 'Answer any four of the five questions.'), inPerson('Paper 3: Practical', 190, 100, WORKSHOP)],
  'West African Traditional Religion': [obj(50, 50, 40), essay(9, 4, 130, 60, 'Answer four questions, at least one from each section.')],
  Woodwork: [obj(40, 40, 40), essay(5, 4, 140, 40, 'Answer the short-structured questions in Section A and the design and drawing question in Section B: four in all.', { title: 'Paper 2: Theory and Design' }), inPerson('Paper 3: Practical', 180, 100, 'A test piece made from supplied drawings in the school workshop, so it isn’t sat in the app.')],
  Yoruba: [obj(60, 60, 60), LANGUAGE_P2('Yoruba')],
};

// ============================================================ BECE

/*
 * Topic restrictions name the composite syllabus' topics (prisma/syllabi/bece/<subject>.json), so each paper draws
 * from its own component or themes; apps/api/scripts/check-mock-papers.ts checks every name exists. Language papers
 * are the L1 (first language) papers; the L2 paper isn't modelled.
 */
/** English Paper 2 (Literature): the literature topics; Paper 1 (Language) leaves them out. */
const ENG_LIT = ["Introduction to Literature", "Introduction to Folktales", "Introduction to Myths and Legends", "Prose: Types and Features", "Poetry: Types and Features", "Drama: Types and Features", "Figures of Speech: Similes and Metaphors", "Prose: Short Stories and Novelettes", "Nigerian and African Folktales", "Popular Myths and Legends", "Poetry (Written)", "Drama: Kinds and Features", "Figures of Speech: Irony and Hyperbole", "Non-African Folktales", "Lessons from Myths and Legends", "Revision: Prose", "Revision: Poetry", "Revision: Drama", "Recommended Literature Texts: Drama", "Recommended Literature Texts: Prose", "Recommended Literature Texts: Poetry"];
/** Mathematics Paper 2: Algebraic Processes and Everyday Statistics; Paper 1 (Number and Numeration, Basic Operations, Geometry and Measurement) leaves them out. */
const MATHS_P2 = ["Use of Symbols", "Simplification of Algebraic Expressions", "Simple Equations", "Algebraic Expressions", "Linear Inequalities", "Graphs", "Factorization", "Simple Equations Involving Fractions", "Simultaneous Linear Equations", "Need for Statistics", "Data Collection", "Data Presentation", "Probability", "Measures of Central Tendency", "Measures of Dispersion"];
/** Basic Science and Technology Paper 1: Basic Science with Physical and Health Education. */
const BST_P1 = ["Family Health", "Environmental Pollution", "Living and Non-Living Things", "Living Things", "Chemicals", "Family Traits", "Environmental Hazards", "Drug and Substance Abuse", "Resources from Living Things", "Resources from Non-Living Things", "Energy", "Renewable and Non-Renewable Energy", "The Solar System", "Crude Oil and Petrochemicals", "Skill Acquisition", "Ethical Issues in Science and Development", "Physical Fitness and Conditioning Programme", "Recreation, Leisure and Dance Activities", "Posture and Postural Defects", "Issues and Challenges in Physical and Health Education", "Athletics (Track and Field): Group and Combined Events", "Ball Games: Soccer and Volleyball", "Hockey", "Contact and Non-Contact Sports", "Contact Games", "Non-Contact Games", "Striking Games (Table Tennis, Tennis and Badminton)", "Personal, School and Community Health", "Nutrition and Health", "Pathogens, Diseases and Their Prevention", "Non-Communicable Diseases and Prevention", "Family Health (Physical and Health Education)", "First Aid and Safety Education", "Nigerian Sports Heroes"];
/** Paper 2: Basic Technology with Computer Studies. */
const BST_P2 = ["Understanding Technology", "Safety Guidelines", "Workshop Safety", "First Aid", "Rescue Operations", "Properties of Materials", "Building Materials", "Materials and Their Common Uses", "Processing of Timber", "Processing of Metals", "Processing of Clay and Glass", "Processing of Plastics and Rubber", "Drawing Instruments and Materials", "Board Practice", "Freehand Sketching", "Geometrical Construction", "Plane Figures", "Isometric Drawing", "Oblique Drawing", "Orthographic Projection", "One-Point Perspective Drawing", "Scales and Scale Drawing", "Drawing of Plans and Blueprints", "Woodwork Hand Tools", "Metalwork Hand Tools", "Maintenance of Tools and Machines", "Woodwork Machines", "Metalwork Machines", "Belt and Chain Drives", "Hydraulic and Pneumatic Machines", "Gears", "Woodwork Projects", "Metalwork Projects", "Soldering and Brazing", "Machine Motions: Linear Motion", "Rotary Motion", "Historical Development of Computers", "Data Processing", "Computer Ethics", "Computer Software", "Operating System", "Units of Storage in Computer", "Computer Problem-Solving Skills", "BASIC Programme", "Safety Measures", "Computer Viruses", "Computer Opportunities", "Application of IT in Everyday Life", "Information Transmission", "IT as a Transformational Tool", "IT Gadgets", "Internet", "Digital Devices", "Word Processing", "Graphic Packages", "Paint Environment", "Spreadsheet Packages", "Worksheet", "Database", "Graph"];
/** National Values Education Paper 1: Civic Education (50) and Security Education (10). */
const NVE_P1 = ["National Values: Honesty, Cooperation and Self-Reliance", "National Values: Integrity, Contentment, Discipline and Courage", "National Values: Right Attitude to Work", "Negative Behaviour", "Citizenship", "Rights and Duties of a Citizen", "Supremacy of the Constitution", "The Constitution", "Objects for National Consciousness", "Nigeria as a Federation", "Relationship Between Federal, State and Local Governments", "The Rule of Law", "Protection of Human Rights and the Rule of Law", "Consumer Rights and Responsibilities", "Democracy", "Pillars of Democracy", "Election and Voter Responsibilities", "Electoral Malpractices", "Elections and Electoral Bodies in Nigeria", "Democratic Voting", "Common Crimes, Causes and Effects", "Observing and Reporting Common Crimes", "Common Crimes and Associated Punishments", "Emergency Management", "Crimes and National Security"];
/** Paper 2: Social Studies. */
const NVE_P2 = ["History of Nigerian Social Studies Education", "General Objectives of Social Studies", "Contents of Social Studies", "Family as a Primary Group", "Consequences of Large and Small Family Sizes", "Purpose of Marriage", "Readiness in Marriage", "Positive Group Behaviours", "Human Trafficking", "Preventing Human Trafficking", "Harmful Traditional Practices", "Promoting Peaceful Living in Our Society", "Agents and Processes of Socialization", "Road Safety Club as an Agent of Socialization", "Common Social Problems in Nigeria", "Ways of Solving Social Problems in Nigeria", "Our Roles in Promoting Safety in Our Community", "Dangers of Drug Trafficking", "Preventing Drug Trafficking", "Meaning and Consequences of Drug Abuse and Harmful Substances"];
/** Pre-Vocational Studies Paper 1: Agriculture. */
const PVS_P1 = ["Importance and Forms of Agriculture", "Classes and Uses of Crops", "Classes and Uses of Farm Animals", "Methods of Weed and Pest Control", "Factors of Agricultural Production", "Farm Structures and Buildings", "Crop Propagation and Cultural Practices", "Agricultural Practices", "Animal Feeds and Feeding", "Animal Pests and Disease Control", "Fishery", "Forest and Forest Uses", "Packaging Criteria", "Pricing and Advertising", "Records and Book Keeping", "Agriculture in Stock Exchange", "Export Promotion in Agriculture"];
/** Paper 2: Home Economics. */
const PVS_P2 = ["Puberty, Adolescence, Sexually Transmitted Infections (STI) and Human Rights", "Family Needs, Goals and Standards", "Resources and Decision Making", "Consumer Challenges and Rights", "Child Development and Care", "Production of Clothing, Household Articles and Crafts", "Care of Family Clothing and Household Linen", "Basic Pattern Drafting Techniques and Fashion Designing", "Textiles: Properties, Production, Uses and Care", "Sewing Machine and Garment Construction Processes", "Production of Cleaning Agents, Deodorants and Cosmetics", "Healthy Feeding and Eating Practice", "Food Purchasing, Processing, Preservation and Safety", "Food Hygiene and Safety", "Preparation, Packaging and Marketing of Food", "Responsible Food Management"];
/** Business Studies Paper 1: Commerce (with the overview, entrepreneurship and consumer education) and Book-keeping. */
const BUS_P1 = ["Introduction to Business Studies", "Introduction to Commerce", "Division of Commerce", "Production", "Factors of Production", "Types of Occupation", "Honesty in Business", "Ethics in Sourcing Chemicals and the Need for Monitoring and Control of Chemicals", "Trade", "Market", "Distribution", "Bank Services", "Insurance", "Transportation", "Advertising", "Communication", "Entrepreneurship", "Importance of Entrepreneurship", "Forms of Business Organisation", "Personal Qualities of an Entrepreneur", "Business Opportunity", "Setting Simple Business Goals", "Simple Single Business Plan", "Consumer, Market and Society", "Consumer Rights", "Responsibilities of a Consumer", "Shopping Tips", "Consumer Protection Agencies", "How to Make Complaints", "How to Seek Redress", "Introduction to Book-keeping", "Book-keeping Ethics", "Personal Finance", "Petty Cash Book", "Cash Book", "Trial Balance", "Trading, Profit and Loss Account", "Balance Sheet"];
/** Paper 2: Office Practice and Keyboarding/Computer. */
const BUS_P2 = ["The Office", "Office Staff", "Right Attitude to Work", "The Reception Office", "Office Procedure", "Departments in an Office/Organisation", "Office Correspondence", "Office Documents", "Office Equipment", "Introduction to Keyboarding", "Parts of the Computer", "Care of the Computer", "Correct Keyboarding Techniques and Home Row Keys", "Printer Correction Signs", "Speed Development and Accuracy Skills", "Techniques Development in Keyboarding", "Business Letters", "Alphanumeric Keys", "Basic Service Keys", "Correct Spacing and Punctuation Marks", "Paragraphing", "Page Setup", "Memorandum and E-mail", "Simple Tabulation"];
/** Cultural and Creative Arts Paper 1: Arts and Crafts. */
const CCA_P1 = ["Introduction to Arts", "Elements of Design", "Principles of Design", "The Study of Colours", "Types and Features of Nigerian Traditional Arts", "Contemporary Nigerian Arts and Artists", "Crafts", "Materials, Tools and Equipment in Craft Making", "Tie and Dye", "Paper Craft", "Collage", "Modelling with Papier Mâché", "Bead Works", "Mosaics", "Painting", "Production of Patterns", "Motifs", "Lettering", "Introduction to Embroidery", "Introduction to Knitting", "Introduction to Crocheting", "Batik", "Packaging", "Exhibition and Display Techniques", "Marketing of Art Works"];
/** Paper 2: Performing Arts and Entertainment (Music, Drama and Dance). */
const CCA_P2 = ["Theory of Music", "Rudiments of Music", "Playing an Instrument: The Recorder", "Uses of Music", "Musical Practices", "Ear Training and Harmony", "Creating Music: Solfa Notation Values", "Drama and Theatre", "Functions of Drama", "Elements of Drama", "Forms of Drama", "Origin of Drama", "Playwriting", "The Director", "Costume and Make-up in Drama", "Design in the Theatre", "Rehearsal", "Drama and the Development of Rural Communities", "Opportunities for Career Dramatists", "Dance", "Introduction to Choreography", "Process of Choreography", "Contemporary Dance", "Types of Dance", "Dance as a Career", "Prospects of Studying Dance in Nigeria", "Nigerian Traditional Dances"];
/** Christian Religious Studies Paper 1: the Old Testament themes; Paper 2 (New Testament) leaves them out. */
const CRS_P1 = ["Who is God?", "God's Creation", "Human Beings Share in God's Creative Activities", "Disobedience", "Reconciliation", "Relationship in the Family", "Relationship in School", "Relationship in Community and Church", "Relationship with God", "Call to Obedience", "Call to Freedom", "Call to Service", "Call to Repentance"];
/** Islamic Religious Studies Paper 1: al-Qur'an, Fiqh and Tawhid; Paper 2 (Hadith, Sirah and Tahdhib) leaves them out. */
const IRS_P1 = ["The Revelation and Preservation of al-Qur'an", "Suratul Fatihah (Qur'an 1:1-7)", "Suratun Nas (Qur'an 114:1-6)", "Suratul Falaq (Qur'an 113:1-5)", "Suratul Ikhlas (Qur'an 112:1-4)", "Suratul Masad (Qur'an 111:1-5)", "Suratun Nasr (Qur'an 110:1-3)", "Suratul Kafirun (Qur'an 109:1-6)", "Suratul Kawthar (Qur'an 108:1-3)", "Suratul Ma'un (Qur'an 107:1-7)", "Suratu Quraysh (Qur'an 106:1-4)", "Suratul Fil (Qur'an 105:1-5)", "Suratul Humazah (Qur'an 104:1-9)", "Suratul 'Asr (Qur'an 103:1-3)", "Suratut Takathur (Qur'an 102:1-8)", "Suratul Qari'ah (Qur'an 101:1-11)", "Suratut Tin (Qur'an 95:1-8)", "Suratush Sharh (Qur'an 94:1-8)", "Suratud Duha (Qur'an 93:1-11)", "At-Taharah (Purification)", "Performance of Ablution (al-Wudu) and things that vitiate it", "At-Tayammum (Dry Ablution)", "Al-Ghusl (Ritual Bath)", "Al-Adhan and Iqamah", "As-Salah", "At-Tashahhud", "Salatul Jama'ah (Congregational Prayer)", "Kinds of Salah", "Times of Salah", "Hajjatul Wada' (Farewell Pilgrimage)", "Sujud Sahwi", "Al-Hajj", "An-Nikah (Marriage)", "Family Planning in Islam", "The Religion of Islam", "Kalimatush Shahadah", "Pillars of Islam", "The Beautiful Names of Allah (Asma'ul Husna) I", "The Beautiful Names of Allah (Asma'ul Husna) II", "The Beautiful Names of Allah (Asma'ul Husna) III", "The Beautiful Names of Allah (Asma'ul Husna) IV", "The Beautiful Names of Allah (Asma'ul Husna) V", "Prophets of Allah", "The Angels", "Al-Qada and Al-Qadar"];
/** History Paper 1: Concept of History, Geography and Environment, Geographical Environment; Paper 2 (Political Development, External Contact and Trade) leaves them out. */
const HIST_P1 = ["Meaning of History", "Sources of History", "Importance of History", "Historical Sites in Nigeria: Nok", "Historical Sites in Nigeria: Ile-Ife", "Historical Sites in Nigeria: Benin", "Historical Sites in Nigeria: Igbo-Ukwu", "Ghana Empire", "Mali Empire", "Songhai Empire"];
/** French Paper 1: Identité and Environnement immédiat; Paper 2 (Activités humaines) leaves them out. */
const FR_P1 = ["Décrire des traits physiques", "Parler des caractéristiques personnelles", "Parler des caractères des gens", "Exprimer les attitudes (jugements/appréciations)", "Parler des professions variées", "Décrire les qualités admirables", "Parler des gens que l'on admire beaucoup", "Parler du temps", "Décrire la vie rurale", "Dégager les caractéristiques de la vie rurale", "Dégager les caractéristiques de la vie urbaine", "Parler des ressemblances et différences", "Décrire les grandes fêtes de la communauté", "Identifier les choses nouvelles dans la communauté", "Identifier les étrangers", "Nommer les maladies courantes", "Discuter les causes des maladies", "Parler des populations affectées", "Dire l'importance de l'hygiène"];
/** Yoruba (L1) Paper 1: language. */
const YO_P1 = ["Iro ede (konsonanti ati faweeli)", "Akaye", "Akoto", "Aroko oniroyin", "Leta kiko", "Iseda oro oruko", "Itesiwaju iro: ami ohun", "Isori oro", "Ihun oro", "Orisirisi gbolohun", "Agbeyewo akoto siwaju sii", "Ise oro aropo oruko ninu gbolohun"];
/** Paper 2: literature, culture and tradition. */
const YO_P2 = ["Agbeyewo litireso apileko", "Sise agbeyewo litireso alohun", "Asayan iwe ayoka", "Ewi alohun aranmo", "Asayan iwe: ere onitan", "Asayan iwe: ewi", "Asayan iwe: itan aroso oloro geere", "Onka", "Isedale ati itankale Yoruba", "Awon eya Yoruba", "Igbeyawo", "Isere ajemesin ati ajemayeye/alaijemesin", "Esin ibile", "Ogun ati alaafia", "Ayeye isomoloruko", "Asa iranra-eni-lowo", "Didekun iwa ika si omonikeji", "Atunyewo esin ibile Yoruba siwaju si: ohun mimo", "Owo sise", "Itoju alaboyun", "Aroko ati ipaaroko"];
/** Igbo (L1) Paper 1: language. */
const IG_P1 = ["Aghotaazaa", "Asusu", "Udaasusu Igbo na usoro odide Igbo", "Onuogugu", "Nkebiokwu", "Nkebiahiri", "Akaraedemede", "Nkejiasusu", "Mkpuruedemede na usoro odide abidii Igbo", "Oru 'Na' na-aru", "Ntughari", "Edemede", "Edemede leta", "Ekuumekwu"];
/** Paper 2: literature, culture and tradition. */
const IG_P2 = ["Agumagu", "Atumatuokwu", "Akwukwo ogugu ndi a hoputara", "Ikowa ndi bu ndi Igbo na asusu ha", "Nrukorita oru na uru o bara", "Ikowa ufodu omenaala Igbo", "Otu nzuzo n'uloakwukwo", "Udi oru nwoke na nwaanyi na-aru ugbu a", "Ubiam na aguu", "Ahuike", "Ahuike ndi ntorobia", "Nzisaozi", "Igu oge", "Mmeputa na mbawanye akunauba n'ala anyi", "Akaoru", "Oruuru onye na-azu ahia", "Ikwado na inye nwaanyi ikike na ohere dika ndi nwoke", "Ibi n'udo", "Agwa oma na agwa ojoo", "Oke na oru umuaka", "Nrugosi", "Uloakwukwo, ezinaulo na uloogwu", "Nri na etu e si eri ya", "Uwe na etu e si eyi uwe"];
/** Hausa (L1) Paper 1: language. */
const HA_P1 = ["Jimla: tsarin sassaukar jimla", "Tsarin tsattsaurar jimla", "Rukunin kalmomi", "Ginin kalmomi", "Nau'o'in jimloli", "Furuci", "Yadda ake samar da sautin furuci", "Auna fahimta", "Fassara", "Insha'i", "Sigar insha'i", "Rubutun wasika", "Ka'idojin rubutu"];
/** Paper 2: literature, culture and tradition. */
const HA_P2 = ["Wasannin kwaikwayo", "Rubutattun wakoki", "Labarai masu tushen karin magana (zube)", "Rubutaccen adabi", "Zababbun rubutattun wasannin kwaikwayo", "Zababbun rubutattun wakoki", "Zababbun rubutattun zube", "Adabin baka", "Zababbun littattafan adabi (BECE prescribed texts)", "Ginshikin ginin al'umma: dabarun tafiyar da rayuwa", "Ginshikin ginin al'umma: sana'o'in Hausawa", "Dabi'u da al'adu: miyagun kwayoyi", "Sauye-sauyen da suka shafi al'adu", "Bukukuwan gargajiya", "Kayayyakin al'adu", "Dabi'u da al'adu: ibada", "Ginshikin ginin al'umma: shugabanci", "Hanyoyin samar da arziki", "Dabi'u da al'adu: tsaro", "Kare-saye", "Keta haddi"];
/** English Paper 3 (Essay). */
const ENG_ESSAY = ['Composition Writing', 'Letter Writing'];

/** A BECE objective paper: one mark per question. */
const bobj = (paper: number, title: string, questions: number, minutes: number, instructions: string, extra: Partial<MockPaper> = {}): MockPaper => ({
  paper,
  kind: 'OBJECTIVE',
  title,
  minutes,
  marks: questions,
  questions,
  instructions: `${instructions} Choose the correct option for each.`,
  ...extra,
});
type BecePaperArgs = [title: string, instructions: string, extra: Partial<MockPaper>];
/** The two one-hour, 60-question papers most BECE subjects have. */
const bece60 = (p1: BecePaperArgs, p2: BecePaperArgs): MockPaper[] => [bobj(1, p1[0], 60, 60, p1[1], p1[2]), bobj(2, p2[0], 60, 60, p2[1], p2[2])];
const BECE_L1_P1 = 'Answer all 60 questions: comprehension (10), composition (5), grammar (25), sound system (10), orthography (5) and translation (5).';
const BECE_L1_P2 = 'Answer all 60 questions: oral literature, prose, drama and poetry, and culture and tradition.';

/**
 * Every BECE exam subject, by the app's subject name. Where the syllabus gives no time for a 60-question paper,
 * it is the hour BECE's other 60-question papers have; Mathematics Paper 3's time and marks aren't stated, so it
 * is set like English Paper 3 (two compulsory questions, 45 minutes, 15 marks each).
 */
export const BECE_PAPERS: Record<string, MockPaper[]> = {
  'English Language': [
    bobj(1, 'Paper 1: Language', 80, 80, 'Answer all 80 questions: comprehension (Section A), vocabulary development (B), grammatical accuracy (C) and spoken English (D).', { excludeTopics: ENG_LIT }),
    bobj(2, 'Paper 2: Literature', 40, 40, 'Answer all 40 questions: five on each of the three drama and three prose texts, and ten on poetry.', { topics: ENG_LIT }),
    { paper: 3, kind: 'THEORY', title: 'Paper 3: Essay', minutes: 45, marks: 30, offered: 2, answer: 2, topics: ENG_ESSAY, instructions: 'Answer both questions. Each carries 15 marks.' },
  ],
  Mathematics: [
    ...bece60(
      ['Paper 1: Objective', 'Answer all 60 questions on Number and Numeration, Basic Operations, and Geometry and Measurement.', { excludeTopics: MATHS_P2 }],
      ['Paper 2: Objective', 'Answer all 60 questions on Algebraic Processes and Everyday Statistics.', { topics: MATHS_P2 }],
    ),
    { paper: 3, kind: 'THEORY', title: 'Paper 3: Theory', minutes: 45, marks: 30, offered: 2, answer: 2, instructions: 'Answer both questions, showing all your working. Each carries 15 marks.' },
  ],
  'Basic Science and Technology': [
    ...bece60(
      ['Paper 1: Basic Science and PHE', 'Answer all 60 questions on Basic Science and Physical and Health Education.', { topics: BST_P1 }],
      ['Paper 2: Basic Technology and Computer Studies', 'Answer all 60 questions on Basic Technology and Computer Studies.', { topics: BST_P2 }],
    ),
    // The practicals are done at a computer and a drawing board in school; the app sets their written alternative (steps, commands, formulas, expected measurements).
    { paper: 3, kind: 'THEORY', title: 'Paper 3: Computer Studies Practical (written)', minutes: 45, marks: 20, offered: 2, answer: 1, topics: ['Word Processing', 'Spreadsheet Packages', 'Worksheet', 'Graph', 'Paint Environment', 'Graphic Packages'], instructions: 'Answer one question: write the steps, commands and formulas you would use and the results you expect. In the real exam this task is done on a computer.' },
    { paper: 4, kind: 'THEORY', title: 'Paper 4: Technical Drawing (written)', minutes: 45, marks: 45, offered: 4, answer: 3, topics: ['Geometrical Construction', 'Plane Figures'], instructions: 'Answer three questions: state the construction steps in order, the instruments used and the measurements you expect. In the real exam these are drawn on the drawing board.' },
  ],
  'National Values Education': bece60(
    ['Paper 1: Civic and Security Education', 'Answer all 60 questions: 50 on Civic Education and 10 on Security Education.', { topics: NVE_P1 }],
    ['Paper 2: Social Studies', 'Answer all 60 questions on Social Studies.', { topics: NVE_P2 }],
  ),
  'Pre-Vocational Studies': bece60(['Paper 1: Agriculture', 'Answer all 60 questions on Agriculture.', { topics: PVS_P1 }], ['Paper 2: Home Economics', 'Answer all 60 questions on Home Economics.', { topics: PVS_P2 }]),
  'Business Studies': [
    ...bece60(
      ['Paper 1: Commerce and Book-keeping', 'Answer all 60 questions: 30 on Commerce and 30 on Book-keeping.', { topics: BUS_P1 }],
      ['Paper 2: Keyboarding and Office Practice', 'Answer all 60 questions: 30 on Keyboarding/Computer and 30 on Office Practice.', { topics: BUS_P2 }],
    ),
    inPerson('Paper 3: Keyboarding Practical', 20, 10, 'Five minutes of speed and accuracy typing and 15 minutes of production work on a keyboard in school, so it isn’t sat in the app.', 3),
  ],
  'Cultural and Creative Arts': [
    ...bece60(
      ['Paper 1: Arts and Crafts', 'Answer all 60 questions on Arts and Crafts.', { topics: CCA_P1 }],
      ['Paper 2: Performing Arts', 'Answer all 60 questions: 30 on Music, 20 on Drama and 10 on Dance.', { topics: CCA_P2 }],
    ),
    inPerson('Paper 3: Practical (Painting)', 60, 100, 'A painting done in school under supervision, so it isn’t sat in the app.', 3),
  ],
  'Christian Religious Studies': bece60(
    ['Paper 1: Old Testament', 'Answer all 60 questions: God and His Creation, Relationship with God and Man, and God’s Call (20 each).', { topics: CRS_P1 }],
    ['Paper 2: New Testament', 'Answer all 60 questions on the New Testament themes, from the early life of Jesus to the Church today.', { excludeTopics: CRS_P1 }],
  ),
  'Islamic Religious Studies': bece60(
    ['Paper 1: Qur’an, Fiqh and Tawhid', 'Answer all 60 questions on al-Qur’an, Fiqh and Tawhid.', { topics: IRS_P1 }],
    ['Paper 2: Hadith, Sirah and Tahdhib', 'Answer all 60 questions: Hadith (24), Sirah (24) and Tahdhib (12).', { excludeTopics: IRS_P1 }],
  ),
  History: bece60(
    ['Paper 1: Objective', 'Answer all 60 questions: Concept of History, Geography and Environment, and Geographical Environment (20 each).', { topics: HIST_P1 }],
    ['Paper 2: Objective', 'Answer all 60 questions: Political Development in Nigeria (40) and External Contact and Trade (20).', { excludeTopics: HIST_P1 }],
  ),
  French: bece60(
    ['Paper 1: Identité and Environnement immédiat', 'Answer all 60 questions: compréhension (10), composition (10) and grammaire (40).', { topics: FR_P1 }],
    ['Paper 2: Activités humaines', 'Answer all 60 questions on Activités humaines: leisure, shopping, polite requests and feelings, professions, sport, daily activities, narration and letters.', { excludeTopics: FR_P1 }],
  ),
  Yoruba: bece60(['Paper 1: Language', BECE_L1_P1, { topics: YO_P1 }], ['Paper 2: Literature and Culture', BECE_L1_P2, { topics: YO_P2 }]),
  Igbo: bece60(['Paper 1: Language', BECE_L1_P1, { topics: IG_P1 }], ['Paper 2: Literature and Culture', BECE_L1_P2, { topics: IG_P2 }]),
  Hausa: bece60(['Paper 1: Language', BECE_L1_P1, { topics: HA_P1 }], ['Paper 2: Literature and Culture', 'Answer all 60 questions: oral literature (15), written literature (25) and culture and tradition (20).', { topics: HA_P2 }]),
};

// ============================================================ NECO SSCE

/*
 * NECO sets the SSCE on the same NERDC senior curriculum as WAEC, so until NECO's own syllabus files are added
 * each subject draws on the WAEC syllabus topics and follows WAEC's paper structure (NECO's 2025 SSCE timetable
 * gives the objective and essay papers one combined time, so their separate times and counts aren't published
 * there). What differs: NECO's objective items have five options (A–E), and English Paper 1 has 80 items in 50
 * minutes from the 2026 SSCE. Papers keep the app's numbering (NECO itself calls the objective paper Paper III,
 * the essay Paper II and the practical Paper I). Every paper is marked approximate until checked against NECO's syllabus.
 */
const toNeco = (p: MockPaper): MockPaper => ({
  ...p,
  instructions: p.instructions.replace('four options lettered A to D', 'five options lettered A to E'),
  ...(p.note ? { note: p.note.replace(/WAEC/g, 'NECO') } : {}),
  approximate: true,
});
/** NECO overrides of the WAEC structure. */
const NECO_OVERRIDES: Record<string, MockPaper[]> = {
  'English Language': WASSCE_PAPERS['English Language']!.map((p) =>
    p.paper === 1 ? { ...p, questions: 80, minutes: 50, instructions: 'Answer all 80 questions: antonyms, synonyms, register, idioms and phrasal verbs, grammatical structures and cloze. Choose the option that best completes or answers each one.' } : p,
  ),
};

/** Every subject with a WAEC syllabus, set the way NECO sets the SSCE. */
export const NECO_PAPERS: Record<string, MockPaper[]> = Object.fromEntries(Object.entries(WASSCE_PAPERS).map(([subject, papers]) => [subject, (NECO_OVERRIDES[subject] ?? papers).map(toNeco)]));

/** The papers sat in the app (objective, theory and practical). */
export const inAppPapers = (papers: MockPaper[]) => papers.filter((p) => p.kind !== 'NOT_IN_APP');

/** Exams with a full, paper-by-paper mock: WAEC's WASSCE, NECO's SSCE and NECO's BECE. */
export const MOCK_EXAMS = ['WAEC', 'NECO', 'BECE'] as const;
export type MockExam = (typeof MOCK_EXAMS)[number];
export const MOCK_PAPERS: Record<MockExam, Record<string, MockPaper[]>> = { WAEC: WASSCE_PAPERS, NECO: NECO_PAPERS, BECE: BECE_PAPERS };
/** What the mock is called: "Full WASSCE mock", "Full NECO mock", "Full BECE mock". */
export const MOCK_NAME: Record<MockExam, string> = { WAEC: 'WASSCE', NECO: 'NECO', BECE: 'BECE' };
/** Shown with a mock whose paper times and counts aren't yet checked against the exam body's syllabus. */
export const MOCK_APPROXIMATE_NOTE = 'Paper times and counts follow NECO’s usual format; they’ll be checked against NECO’s syllabus.';

export const WAEC_GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'] as const;
export type WaecGrade = (typeof WAEC_GRADES)[number];

/** WAEC's nine-point grade for a percentage (A1–C6 are credits). */
export function waecGrade(percent: number): { grade: WaecGrade; remark: string } {
  const p = Math.round(percent);
  if (p >= 75) return { grade: 'A1', remark: 'Excellent' };
  if (p >= 70) return { grade: 'B2', remark: 'Very good' };
  if (p >= 65) return { grade: 'B3', remark: 'Good' };
  if (p >= 60) return { grade: 'C4', remark: 'Credit' };
  if (p >= 55) return { grade: 'C5', remark: 'Credit' };
  if (p >= 50) return { grade: 'C6', remark: 'Credit' };
  if (p >= 45) return { grade: 'D7', remark: 'Pass' };
  if (p >= 40) return { grade: 'E8', remark: 'Pass' };
  return { grade: 'F9', remark: 'Fail' };
}

export const BECE_GRADES = ['A', 'C', 'P', 'F'] as const;
export type BeceGrade = (typeof BECE_GRADES)[number];

/** BECE's grade for a percentage: A Distinction (70–100), C Credit (50–69), P Pass (40–49), F Fail (0–39). */
export function beceGrade(percent: number): { grade: BeceGrade; remark: string } {
  const p = Math.round(percent);
  if (p >= 70) return { grade: 'A', remark: 'Distinction' };
  if (p >= 50) return { grade: 'C', remark: 'Credit' };
  if (p >= 40) return { grade: 'P', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail' };
}

export type MockGrade = WaecGrade | BeceGrade;
/** The grade on the exam's own scale (WAEC and NECO A1–F9, BECE A/C/P/F). */
export const mockGrade = (exam: MockExam, percent: number): { grade: MockGrade; remark: string } => (exam === 'BECE' ? beceGrade(percent) : waecGrade(percent));
/** What the grade is called on the result: "WAEC grade", "NECO grade", "BECE grade". */
export const MOCK_GRADE_LABEL: Record<MockExam, string> = { WAEC: 'WAEC grade', NECO: 'NECO grade', BECE: 'BECE grade' };

// ============================================================ sittings

export const sittingStartSchema = z.object({ exam: z.enum(MOCK_EXAMS), subject: z.string().trim().min(2).max(60) });
/** Written answers saved as the student writes (theory and practical papers). */
export const theoryDraftSaveSchema = z.object({ answers: z.array(z.string().max(10_000)).max(20) });

export type SittingPaperStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_IN_APP';
export interface SittingPaperView extends MockPaper {
  status: SittingPaperStatus;
  attemptId: string | null;
  /** Items or questions actually set (fewer than the exam's when the bank is short). */
  set: number | null;
  /** Minutes on this paper's clock (scaled when fewer items are set). */
  clockMinutes: number;
  endsAt: string | null;
  /** The exam's marks earned on this paper, once marked. */
  earned: number | null;
  percent: number | null;
}
export interface SittingResult {
  /** Marks earned over marks available, in-app papers only. */
  earned: number;
  outOf: number;
  percent: number;
  grade: MockGrade;
  remark: string;
  /** The grading scale used (WAEC or NECO A1–F9, BECE A/C/P/F); absent on WASSCE mocks graded before BECE mocks existed. */
  scale?: MockExam;
  papers: { paper: number; title: string; earned: number; marks: number; percent: number }[];
  /** Topics with the most missed objective questions, weakest first. */
  topicsMissed: { topic: string; correct: number; total: number }[];
  summary: string;
  /** Papers listed but not sat in the app (the grade leaves them out). */
  leftOut: string[];
}
export interface ExamSittingView {
  id: string;
  exam: MockExam;
  subject: string;
  startedAt: string;
  finishedAt: string | null;
  papers: SittingPaperView[];
  result: SittingResult | null;
  notes: string[];
}
export interface ExamSittingRow {
  id: string;
  exam: MockExam;
  subject: string;
  startedAt: string;
  finishedAt: string | null;
  papersDone: number;
  papersInApp: number;
  percent: number | null;
  grade: MockGrade | null;
}
