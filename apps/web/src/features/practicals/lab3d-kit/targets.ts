import { Vector3, type Object3D } from 'three';

/**
 * Where each selectable object is in the scene, so the guide's beacon, the
 * floor path and the debrief camera can find it by id.
 */
const objects = new Map<string, Object3D>();

export function registerObject(id: string, o: Object3D | null) {
  if (o) objects.set(id, o);
  else if (objects.get(id)?.parent == null) objects.delete(id);
}

/** World position of an object (its origin), or null if it is not in the scene now. */
export function objectPosition(id: string, out = new Vector3()): Vector3 | null {
  const o = objects.get(id);
  if (!o || !o.parent) return null;
  return o.getWorldPosition(out);
}
