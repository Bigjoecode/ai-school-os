/** Roadmap copy for modules that aren't live yet. Keyed by route path. */
export interface UpcomingModule {
  name: string;
  phase: number;
  summary: string;
  features: string[];
}

export const UPCOMING_MODULES: Record<string, UpcomingModule> = {
};
