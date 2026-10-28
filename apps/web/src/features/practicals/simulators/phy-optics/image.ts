import { OPTICS_OBJECT_R, opticsBlur, opticsV, opticsWindowBlur, type OpticsTask, type PhyOpticsVariant } from '@aischool/shared';

/**
 * What the white screen shows, drawn on a canvas (the 2D lab's screen view
 * and the 3D screen's live texture use the same picture). The light from each
 * point of the object lands as a blur disc of diameter D·|s/v − 1| on a screen
 * s from the lens or mirror, centred where the ray through the lens's centre
 * (or the mirror's centre of curvature) meets it: so the image is inverted,
 * s/u times the object's size, sharp only near the true image and smoothly
 * blurred either side of it. Pure physics from the shared module; no hints.
 */

/** The screen card (cm). */
export const SCREEN_CM = { w: 12, h: 10 };
/** The window used for the rough focus (cm): width, height. */
const WINDOW_CM = { w: 120, h: 150 };

export interface ScreenView {
  kind: 'object' | 'window';
  /** Blur-disc diameter on the screen (cm). */
  blur: number;
  /** Size of the image ÷ size of the object (it is inverted). */
  mag: number;
  /** How far (cm) the image's centre is above the screen's centre (centres not lined up). */
  offset: number;
  /** 0 … 1: how bright the image is. */
  bright: number;
}

/** The screen with the illuminated cross-wire as the object, the bench set at u and the screen at its mark. */
export function objectView(v: PhyOpticsVariant, task: OpticsTask, u: number, screen: number, aligned: boolean): ScreenView {
  const s = Math.max(0.5, opticsV(task, u, screen));
  const mag = s / u;
  return { kind: 'object', blur: opticsBlur(v, task, u, s), mag, offset: aligned ? 0 : v.misalign * (1 + mag), bright: Math.max(0.35, Math.min(1, 1.1 / (0.5 + 0.5 * mag))) };
}
/** The hand-held screen s cm from the lens (or in front of the mirror), facing a distant window. */
export function windowView(v: PhyOpticsVariant, task: OpticsTask, s: number): ScreenView {
  return { kind: 'window', blur: opticsWindowBlur(v, task, s), mag: s / v.window, offset: 0, bright: 0.85 };
}

let layer: HTMLCanvasElement | null = null;
let filterOk: boolean | null = null;
function canFilter(g: CanvasRenderingContext2D) {
  if (filterOk === null) {
    try {
      g.save();
      g.filter = 'blur(2px)';
      filterOk = g.filter === 'blur(2px)';
      g.restore();
    } catch {
      filterOk = false;
    }
  }
  return filterOk;
}

/** Draws the sharp light pattern (black = no light) centred at (cx, cy), `k` px per cm on the screen. */
function drawPattern(g: CanvasRenderingContext2D, view: ScreenView, cx: number, cy: number, k: number) {
  g.save();
  g.translate(cx, cy);
  // Inverted: the object's top lands at the bottom of the screen.
  g.scale(-view.mag * k, -view.mag * k);
  // Image light added to the room-lit card: bright enough to stand out, not so bright that it washes out.
  const b = Math.round((view.kind === 'object' ? 100 : 105) * view.bright);
  if (view.kind === 'object') {
    const R = OPTICS_OBJECT_R;
    g.fillStyle = `rgb(${b}, ${Math.round(b * 0.93)}, ${Math.round(b * 0.74)})`;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    // A small tab at the top of the hole shows which way up the image is (object coordinates: y down).
    g.beginPath();
    g.moveTo(-0.32, -R + 0.05);
    g.lineTo(0.32, -R + 0.05);
    g.lineTo(0, -R - 0.42);
    g.closePath();
    g.fill();
    // The cross-wire.
    g.strokeStyle = '#000';
    g.lineWidth = 0.07;
    g.beginPath();
    g.moveTo(-R, 0);
    g.lineTo(R, 0);
    g.moveTo(0, -R);
    g.lineTo(0, R);
    g.stroke();
  } else {
    const W = WINDOW_CM.w / 2;
    const H = WINDOW_CM.h / 2;
    const sky = g.createLinearGradient(0, -H, 0, H);
    sky.addColorStop(0, `rgb(${Math.round(b * 0.78)}, ${Math.round(b * 0.88)}, ${b})`);
    sky.addColorStop(1, `rgb(${Math.round(b * 0.95)}, ${Math.round(b * 0.97)}, ${b})`);
    g.fillStyle = sky;
    g.fillRect(-W, -H, 2 * W, 2 * H);
    // A tree and a wall outside, at the bottom of the window (so at the top of the image).
    g.fillStyle = `rgb(${Math.round(b * 0.18)}, ${Math.round(b * 0.42)}, ${Math.round(b * 0.16)})`;
    g.beginPath();
    g.ellipse(-22, H - 38, 30, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgb(${Math.round(b * 0.55)}, ${Math.round(b * 0.42)}, ${Math.round(b * 0.32)})`;
    g.fillRect(-W, H - 24, 2 * W, 24);
    // The window frame and its bars.
    g.fillStyle = '#000';
    g.fillRect(-4, -H, 8, 2 * H);
    g.fillRect(-W, -6, 2 * W, 8);
  }
  g.restore();
}

/**
 * The screen as seen: room-lit white card plus the image light. `w`×`h` px for
 * SCREEN_CM; the image is blurred by its blur disc (a canvas blur filter where
 * the browser has one, else many offset copies).
 */
export function drawScreen(g: CanvasRenderingContext2D, w: number, h: number, view: ScreenView | null) {
  const k = w / SCREEN_CM.w;
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.fillStyle = '#9d9a90';
  g.fillRect(0, 0, w, h);
  // faint card texture
  g.fillStyle = 'rgba(0,0,0,0.035)';
  for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % h, 2, 2);
  if (view) {
    if (!layer) layer = document.createElement('canvas');
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
    const lg = layer.getContext('2d')!;
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = '#000';
    lg.fillRect(0, 0, w, h);
    drawPattern(lg, view, w / 2, h / 2 - view.offset * k, k);
    const bpx = Math.min(w * 1.5, view.blur * k);
    g.globalCompositeOperation = 'lighter';
    if (bpx < 0.6) g.drawImage(layer, 0, 0);
    else if (canFilter(g)) {
      g.filter = `blur(${(0.36 * bpx).toFixed(2)}px)`;
      g.drawImage(layer, 0, 0);
      g.filter = 'none';
    } else {
      // Vogel spiral samples over the blur disc.
      const n = Math.min(48, Math.round(8 + bpx * 1.2));
      g.globalAlpha = 1 / n;
      for (let i = 0; i < n; i++) {
        const r = (bpx / 2) * Math.sqrt((i + 0.5) / n);
        const a = i * 2.39996;
        g.drawImage(layer, r * Math.cos(a), r * Math.sin(a));
      }
      g.globalAlpha = 1;
    }
  }
  g.restore();
  // The card's edge.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
}
