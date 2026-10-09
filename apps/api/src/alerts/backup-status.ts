import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from '../config/env';

/** A daily backup older than this is reported (and alerted) as stale. */
export const BACKUP_STALE_HOURS = 30;

export interface BackupStatus {
  /** ok: last run succeeded and is recent; failed: last run failed; stale: no success for BACKUP_STALE_HOURS; none: no status file (backups not scheduled). */
  state: 'ok' | 'failed' | 'stale' | 'none';
  lastBackupAt: string | null;
  lastRunAt: string | null;
  sizeMb: number | null;
  message: string | null;
}

/** Where apps/api/scripts/backup-db.sh writes its status (BACKUP_STATUS_FILE, default ~/backups/db/last-backup.json). */
export function backupStatusFile(): string {
  return env().BACKUP_STATUS_FILE || join(homedir(), 'backups', 'db', 'last-backup.json');
}

/**
 * Reads the status the backup script leaves behind. It never contains
 * secrets: times, size, file name and a short error message.
 */
export function readBackupStatus(): BackupStatus {
  const file = backupStatusFile();
  let raw: { status?: string; lastSuccessAt?: string; at?: string; sizeBytes?: number; message?: string };
  try {
    statSync(file);
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { state: 'none', lastBackupAt: null, lastRunAt: null, sizeMb: null, message: null };
  }
  const lastBackupAt = raw.lastSuccessAt && !Number.isNaN(Date.parse(raw.lastSuccessAt)) ? new Date(raw.lastSuccessAt).toISOString() : null;
  const lastRunAt = raw.at && !Number.isNaN(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : null;
  const fresh = !!lastBackupAt && Date.now() - Date.parse(lastBackupAt) < BACKUP_STALE_HOURS * 3600_000;
  const state = raw.status !== 'ok' ? 'failed' : fresh ? 'ok' : 'stale';
  return {
    state,
    lastBackupAt,
    lastRunAt,
    sizeMb: typeof raw.sizeBytes === 'number' ? Math.round((raw.sizeBytes / 1048576) * 100) / 100 : null,
    message: typeof raw.message === 'string' ? raw.message.slice(0, 300) : null,
  };
}
