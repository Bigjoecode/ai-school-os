/**
 * Who the lab assistant is. A lab sets it once (at module load) with
 * `setAssistant`; every speech bubble, caption and label reads it.
 */
export interface AssistantProfile {
  name: string;
  /** e.g. "lab technician", "physics lab assistant". */
  role: string;
  /** The procedural figure: 'ada' (hair in a bun, scarf) or 'bayo' (short hair, tie). */
  look: 'ada' | 'bayo';
  /** "her" / "his", for "reads her tips aloud". */
  pronoun: 'her' | 'his';
}
export const assistantProfile: AssistantProfile = { name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' };
export function setAssistant(p: Partial<AssistantProfile>) {
  Object.assign(assistantProfile, p);
}
