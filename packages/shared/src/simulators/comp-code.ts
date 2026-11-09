import type { SimulatorSpec } from '../practicals';

export * from './comp-code-basic';
export * from './comp-code-flow';
export * from './comp-code-html';
export * from './comp-code-data';

export const COMP_CODE: SimulatorSpec = {
  id: 'comp-code',
  subject: 'Computer Studies',
  title: 'Programming, flowcharts, web pages and computer hardware',
  topicNames: ['BASIC Programming', 'Program Development Cycle', 'Algorithm and Flowchart', 'Introduction to the Worldwide Web (W.W.W.)', 'Computer Maintenance', 'Networking'],
  minutes: 50,
  rubric: [
    {
      id: 'work',
      label: 'Working result',
      marks: 8,
      how: 'AUTO',
      guide:
        'BASIC: each program is run by the interpreter on hidden test cases; its output must carry the right values in order. Flowchart: each chart is run the same way, box by box. HTML: the page must have the title, heading, paragraph, list and hyperlink asked for, with every tag closed. Cable: both plugs correctly wired and crimped, and the tester passing all eight pins. Maintenance: every cleaning, UPS and software job done with the right tool.',
    },
    {
      id: 'method',
      label: 'Structure and method',
      marks: 3,
      how: 'AUTO',
      guide:
        'BASIC: numbered lines, REM, END, the statements the question asks for and a saved .BAS file. Flowchart: one START and one STOP, the correct symbol for each job, two labelled exits from every decision, every box connected, and a loop where one is needed. HTML: head before body, the title in the head, saved as .html. Cable: length, boots, strip and trim lengths. Maintenance: cleaned only with the power off, restarted before the software jobs, no water or spun fans.',
    },
    { id: 'record', label: 'Recorded results', marks: 3, how: 'AUTO', guide: 'The outputs copied from the run, the trace table or table of values, the URL parts, and the working of the calculation, checked against this attempt’s own numbers.' },
    { id: 'questions', label: 'Questions', marks: 2, how: 'AUTO', guide: 'The short questions on the task card.' },
    { id: 'precautions', label: 'Precautions', marks: 2, how: 'AI', guide: 'Two correct precautions for this practical. Vague statements earn nothing.' },
    { id: 'explanation', label: 'Explanation', marks: 2, how: 'AI', guide: 'The explanation asked for on the task card.' },
  ],
};
