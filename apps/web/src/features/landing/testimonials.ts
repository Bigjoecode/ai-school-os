/**
 * Testimonials on the landing page.
 *
 * EMPTY ON PURPOSE: add only real quotes from real schools, with their written permission.
 * While this list is empty the testimonials section is not shown at all (and nothing links to it).
 *
 * Example entry (do not publish this example):
 *   { quote: 'What the school said, word for word.', name: 'Full name', role: 'Principal', school: 'School name, City' }
 */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  school: string;
}

export const TESTIMONIALS: Testimonial[] = [];
