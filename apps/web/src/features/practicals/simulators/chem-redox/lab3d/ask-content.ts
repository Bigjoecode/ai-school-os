import type { RedoxTask } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';

/** Suggested questions for Mrs Ada in the redox lab. */
export function askSuggestions(task: RedoxTask): AskSuggestions {
  if (task === 'IOD')
    return {
      LEARN: ['Why is starch added only near the end point?', 'What does pale straw colour mean?', 'Why is the ratio I₂ : S₂O₃²⁻ 1 : 2?', 'Why must the starch be fresh?'],
      DEMO: ['Why did the brown colour fade?', 'Why does starch turn blue-black?', 'Why add the thiosulphate dropwise at the end?', 'Is pale yellow the end point?'],
      TRY: ['When should I add the starch?', 'How do I know I have reached the end point?', 'How do I find the moles of iodine?', 'Why read the bottom of the meniscus?'],
      SANDBOX: ['What if the iodine is more concentrated?', 'What happens if I add starch at the start?', 'Why does the mole ratio matter?', 'Why do titres need to be concordant?'],
    };
  return {
    LEARN: ['Why is no indicator needed with KMnO₄?', 'Why read the top of the meniscus?', 'Why acidify with H₂SO₄ and not HCl?', task === 'OX' ? 'Why warm the ethanedioic acid?' : 'Why is the ratio MnO₄⁻ : Fe²⁺ 1 : 5?'],
    DEMO: ['Why does the purple colour disappear?', task === 'OX' ? 'Why is it slow at first and then fast?' : 'What colour is the end point?', 'Why add KMnO₄ drop by drop near the end?', 'What happens without enough acid?'],
    TRY: ['How do I know I have reached the end point?', 'Why read the top of the meniscus?', task === 'OX' ? 'What temperature should the flask be?' : 'How much acid do I add?', 'How do I use the mole ratio?'],
    SANDBOX: ['What if the KMnO₄ is more concentrated?', 'What happens if I use HCl instead?', 'Why does the mole ratio matter?', 'Why do titres need to be concordant?'],
  };
}
