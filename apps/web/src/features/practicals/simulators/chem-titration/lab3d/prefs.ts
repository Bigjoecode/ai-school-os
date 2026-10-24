/**
 * What this device remembers about the 3D labs (tour seen, sound, voice,
 * guided mode). Browser storage can be missing or blocked: every read falls
 * back to the default and every write is best-effort.
 */

export interface LabPrefs {
  /** The first-time controls tour was finished or skipped. */
  tourDone: boolean;
  /** The safety briefing at the door was completed on this device. */
  safetyDone: boolean;
  muted: boolean;
  /** The lab assistant reads her lines aloud (off by default). */
  voice: boolean;
  /** Practice mode: step checklist, beacons and corrections. */
  guided: boolean;
  /** Per practical: the Learn and demo stages finished on this device. */
  journey: Record<string, { learn?: boolean; demo?: boolean }>;
}
const KEY = 'aischool:lab3d-prefs';
const DEFAULTS: LabPrefs = { tourDone: false, safetyDone: false, muted: false, voice: false, guided: true, journey: {} };

export function loadPrefs(): LabPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LabPrefs>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
export function savePrefs(p: LabPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: remembered for this visit only */
  }
}
