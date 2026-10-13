import { Logger } from '@nestjs/common';

/**
 * Things other modules do when a class register is saved (e.g. the gate
 * module counts "present" as the child's arrival and alerts parents),
 * without the attendance module depending on them. A failing hook never
 * stops the register from saving.
 */
export interface RegisterSaved {
  tenantId: string;
  classArmId: string;
  /** YYYY-MM-DD */
  date: string;
  marks: { studentId: string; status: string }[];
}

type Hook = (e: RegisterSaved) => Promise<void>;

const hooks = new Map<string, Hook>();
const logger = new Logger('RegisterHooks');

export function onRegisterSaved(name: string, hook: Hook) {
  hooks.set(name, hook);
}

export async function registerSaved(e: RegisterSaved): Promise<void> {
  for (const [name, hook] of hooks) {
    try {
      await hook(e);
    } catch (err) {
      logger.error(`${name} failed: ${(err as Error).message}`);
    }
  }
}
