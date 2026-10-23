/**
 * Can this device run a 3D lab, and how well? Used by the lab host to pick the
 * 3D or the 2D view by default, and by the 3D lab to pick its quality tier.
 * Never throws: anything unexpected counts as "no 3D".
 */

export type GpuTier = 'none' | 'low' | 'medium' | 'high';

let probed: { webgl2: boolean; renderer: string } | null = null;
function probe() {
  if (probed) return probed;
  probed = { webgl2: false, renderer: '' };
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) {
      probed.webgl2 = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      probed.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no WebGL */
  }
  return probed;
}

export const isTouchDevice = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Software renderers and old mobile GPUs that cannot hold 30 fps in a lit 3D room. */
const WEAK_GPU = /swiftshader|llvmpipe|softpipe|mali-[t4]|mali-g(31|51|52)|adreno \(tm\) [1-5]\d\d|powervr|sgx|videocore/i;

export function gpuTier(): GpuTier {
  const { webgl2, renderer } = probe();
  if (!webgl2) return 'none';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  if (WEAK_GPU.test(renderer) || memory <= 2 || cores <= 2) return 'low';
  if (isTouchDevice() || memory <= 4) return 'medium';
  return 'high';
}

const VIEW_KEY = 'aischool:lab-view';
/** The 3D/2D choice this device remembers (null: never chosen). */
export function savedLabView(): '3d' | '2d' | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === '3d' || v === '2d' ? v : null;
  } catch {
    return null;
  }
}
export function saveLabView(v: '3d' | '2d') {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private mode: the choice lasts this visit only */
  }
}
/** The view to open with: the remembered choice, else 3D on a capable device. */
export function defaultLabView(): '3d' | '2d' {
  const tier = gpuTier();
  if (tier === 'none') return '2d';
  return savedLabView() ?? (tier === 'low' ? '2d' : '3d');
}
