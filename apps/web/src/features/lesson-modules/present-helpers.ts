import type { CheckInQuestion } from '@aischool/shared';

/** What the class sees on the board: the question and its options, in the teacher's order (answers hidden until revealed). */
export const forStudentView = (q: CheckInQuestion) => ({ prompt: q.prompt, options: q.type === 'SHORT' ? [] : q.options });
