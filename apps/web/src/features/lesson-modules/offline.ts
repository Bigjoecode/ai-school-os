import { fetchFileBlob } from '../live/files';
import { stepFileUrl } from './api';

/**
 * Saving a lesson to read offline: the lesson itself is kept by the service
 * worker (it saves /api/my-lessons responses as they load); pictures are put
 * in the Cache API here, on demand. Videos are not saved (too big for most
 * phones' data plans).
 */
const CACHE = 'ais-lessons-v1';
const key = (moduleId: string, stepId: string) => `/__ais/lessons/${moduleId}/${stepId}`;
const flag = (moduleId: string) => `lesson.saved.${moduleId}`;

export const offlineSupported = () => typeof caches !== 'undefined';

export function isSaved(moduleId: string): boolean {
  try {
    return !!localStorage.getItem(flag(moduleId));
  } catch {
    return false;
  }
}

/** Saves each picture step; returns how many were saved. */
export async function saveLesson(moduleId: string, imageStepIds: string[]): Promise<number> {
  let n = 0;
  if (offlineSupported()) {
    const cache = await caches.open(CACHE);
    for (const stepId of imageStepIds) {
      try {
        const blob = await fetchFileBlob(stepFileUrl(moduleId, stepId));
        await cache.put(key(moduleId, stepId), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } }));
        n++;
      } catch {
        // Skip a picture that won't load; the rest are still saved.
      }
    }
  }
  try {
    localStorage.setItem(flag(moduleId), new Date().toISOString());
  } catch {
    /* private mode */
  }
  return n;
}

export async function forgetLesson(moduleId: string) {
  try {
    localStorage.removeItem(flag(moduleId));
  } catch {
    /* ignore */
  }
  if (!offlineSupported()) return;
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith(`/__ais/lessons/${moduleId}/`)) await cache.delete(req);
}

/** A saved picture, when the network can't give it. */
export async function savedPicture(moduleId: string, stepId: string): Promise<Blob | null> {
  if (!offlineSupported()) return null;
  try {
    const hit = await caches.match(key(moduleId, stepId), { cacheName: CACHE });
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}
