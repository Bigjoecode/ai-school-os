import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { BURETTE_CAPACITY } from '@aischool/shared';

/**
 * Every texture in the 3D lab is drawn here on a canvas: no image files, no
 * network. Each one is made once and cached for the page's life.
 */

const cache = new Map<string, Texture>();
function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: [number, number]; srgb?: boolean } = {}): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  if (opts.repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(...opts.repeat);
  } else t.wrapS = t.wrapT = ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

/** A small deterministic pseudo-random sequence (textures look the same every visit). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** Glazed cream floor tiles with grout and a slight per-tile shade (4 × 4 tiles per repeat). */
export const floorTexture = (repeat: [number, number]) =>
  canvasTexture(
    `floor-${repeat}`,
    512,
    512,
    (g, w) => {
      const r = rng(7);
      const n = 4;
      const s = w / n;
      g.fillStyle = '#b9b2a3';
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const k = (i + j) % 2 === 0;
          const base = k ? [226, 218, 200] : [214, 205, 186];
          const d = (r() - 0.5) * 10;
          g.fillStyle = `rgb(${base[0]! + d},${base[1]! + d},${base[2]! + d})`;
          g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
          // terrazzo-like flecks
          for (let f = 0; f < 70; f++) {
            g.fillStyle = `rgba(${90 + r() * 60},${80 + r() * 50},${70 + r() * 40},${0.12 + r() * 0.2})`;
            g.fillRect(i * s + 2 + r() * (s - 6), j * s + 2 + r() * (s - 6), 1 + r() * 2.5, 1 + r() * 2.5);
          }
        }
    },
    { repeat },
  );

/** Wood grain for cupboards, stools and the teacher's desk. */
export const woodTexture = () =>
  canvasTexture(
    'wood',
    256,
    256,
    (g, w, h) => {
      const r = rng(3);
      g.fillStyle = '#9a6a3f';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        const v = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
        g.fillStyle = `rgba(${70 + v * 40},${42 + v * 22},${20 + v * 10},${0.25 + r() * 0.2})`;
        g.fillRect(0, y, w, 2);
      }
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = 'rgba(60,34,16,0.35)';
        g.lineWidth = 1.2;
        g.beginPath();
        const y0 = r() * h;
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.05 + k) * 6);
        g.stroke();
      }
    },
    { repeat: [1, 1] },
  );

/** Speckled black resin bench top. */
export const benchTopTexture = () =>
  canvasTexture(
    'benchtop',
    256,
    256,
    (g, w, h) => {
      const r = rng(11);
      g.fillStyle = '#23272b';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = `rgba(255,255,255,${r() * 0.07})`;
        g.fillRect(r() * w, r() * h, 1.4, 1.4);
      }
    },
    { repeat: [3, 1] },
  );

/** Daylight through the louvre windows: sky, a far tree line and a compound wall. */
export const windowTexture = () =>
  canvasTexture('window', 256, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#9fd0f2');
    sky.addColorStop(0.6, '#dff1fb');
    sky.addColorStop(1, '#f6f2e4');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const r = rng(5);
    g.fillStyle = '#7fa66a';
    for (let x = -10; x < w + 10; x += 14) {
      g.beginPath();
      g.arc(x + r() * 6, h * 0.66, 12 + r() * 14, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5e8a4d';
    g.fillRect(0, h * 0.7, w, h * 0.06);
    g.fillStyle = '#d9cdb4';
    g.fillRect(0, h * 0.76, w, h * 0.24);
  });

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineH;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y;
}

/** A bottle label: white with a coloured band, the name and (optionally) a hazard note. */
export const labelTexture = (name: string, band: string, sub = '') =>
  canvasTexture(`label-${name}-${band}-${sub}`, 256, 160, (g, w, h) => {
    g.fillStyle = '#fbfaf5';
    g.fillRect(0, 0, w, h);
    g.fillStyle = band;
    g.fillRect(0, 0, w, 26);
    g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = name.length > 10 ? 30 : name.length > 5 ? 44 : 62;
    g.font = `700 ${size}px ${FONT}`;
    g.fillText(name, w / 2, sub ? 72 : 82);
    if (sub) {
      g.font = `500 22px ${FONT}`;
      g.fillStyle = '#333';
      g.fillText(sub, w / 2, 122);
    }
  });

/** The burette's printed numbers 0–50 (one per cm³), on a strip that wraps the tube's right-front side. */
export const buretteNumbersTexture = (pxPerCm3: number) =>
  canvasTexture(
    `burette-numbers-${pxPerCm3}`,
    64,
    Math.round((BURETTE_CAPACITY + 2) * pxPerCm3),
    (g, w) => {
      g.clearRect(0, 0, w, 99999);
      g.fillStyle = '#10151c';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = `700 ${Math.round(pxPerCm3 * 0.52)}px ${FONT}`;
      for (let n = 0; n <= BURETTE_CAPACITY; n++) g.fillText(String(n), 4, (n + 1) * pxPerCm3 - pxPerCm3 * 0.06);
    },
    { srgb: true },
  );

/** Soft round shadow for the "baked" contact shadows under furniture and glassware. */
export const blobTexture = () =>
  canvasTexture('blob', 128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });

/** Square soft shadow (benches, cupboards). */
export const boxShadowTexture = () =>
  canvasTexture('box-shadow', 128, 128, (g, w) => {
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(22, 22, w - 44, w - 44);
  });

function hazardDiamond(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, symbol: 'flame' | 'corrosive' | 'skull' | 'exclaim') {
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#fff';
  g.fillRect(-s / 2, -s / 2, s, s);
  g.lineWidth = s * 0.09;
  g.strokeStyle = '#d4202a';
  g.strokeRect(-s / 2 + g.lineWidth / 2, -s / 2 + g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth);
  g.restore();
  g.fillStyle = '#111';
  g.strokeStyle = '#111';
  const k = s * 0.32;
  if (symbol === 'flame') {
    g.beginPath();
    g.moveTo(cx, cy - k);
    g.quadraticCurveTo(cx + k * 0.9, cy, cx + k * 0.4, cy + k * 0.7);
    g.lineTo(cx - k * 0.4, cy + k * 0.7);
    g.quadraticCurveTo(cx - k * 0.9, cy, cx, cy - k);
    g.fill();
    g.fillRect(cx - k * 0.7, cy + k * 0.8, k * 1.4, k * 0.14);
  } else if (symbol === 'corrosive') {
    g.fillRect(cx - k * 0.8, cy + k * 0.45, k * 1.6, k * 0.22);
    g.beginPath();
    g.moveTo(cx - k * 0.7, cy - k * 0.6);
    g.lineTo(cx - k * 0.2, cy - k * 0.6);
    g.lineTo(cx - k * 0.45, cy + k * 0.2);
    g.fill();
    g.beginPath();
    g.arc(cx + k * 0.45, cy - k * 0.1, k * 0.2, 0, Math.PI * 2);
    g.fill();
  } else if (symbol === 'skull') {
    g.beginPath();
    g.arc(cx, cy - k * 0.15, k * 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - k * 0.3, cy + k * 0.2, k * 0.6, k * 0.3);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx - k * 0.2, cy - k * 0.2, k * 0.12, 0, Math.PI * 2);
    g.arc(cx + k * 0.2, cy - k * 0.2, k * 0.12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.lineWidth = k * 0.16;
    g.beginPath();
    g.moveTo(cx - k * 0.8, cy + k * 0.5);
    g.lineTo(cx + k * 0.8, cy + k * 0.9);
    g.moveTo(cx + k * 0.8, cy + k * 0.5);
    g.lineTo(cx - k * 0.8, cy + k * 0.9);
    g.stroke();
  } else {
    g.fillRect(cx - k * 0.12, cy - k * 0.7, k * 0.24, k * 1.0);
    g.beginPath();
    g.arc(cx, cy + k * 0.6, k * 0.14, 0, Math.PI * 2);
    g.fill();
  }
}

/** Wall posters (portrait 3:4 unless stated). */
export type PosterKind = 'goggles' | 'hazards' | 'rules' | 'titration';
export const posterTexture = (kind: PosterKind) =>
  canvasTexture(`poster-${kind}`, 384, 512, (g, w, h) => {
    g.fillStyle = kind === 'goggles' ? '#ffd23f' : '#fdfdf8';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'goggles') {
      g.fillStyle = '#0f3d8c';
      g.fillRect(0, 0, w, 92);
      g.fillStyle = '#fff';
      g.font = `800 40px ${FONT}`;
      g.fillText('SAFETY FIRST', w / 2, 48);
      // a pair of goggles
      g.fillStyle = '#0f3d8c';
      g.beginPath();
      g.arc(w / 2 - 70, 230, 70, 0, Math.PI * 2);
      g.arc(w / 2 + 70, 230, 70, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#bfe6ff';
      g.beginPath();
      g.arc(w / 2 - 70, 230, 50, 0, Math.PI * 2);
      g.arc(w / 2 + 70, 230, 50, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0f3d8c';
      g.fillRect(20, 220, w - 40, 18);
      g.font = `800 46px ${FONT}`;
      g.fillText('WEAR YOUR', w / 2, 370);
      g.fillText('GOGGLES', w / 2, 422);
      g.font = `600 22px ${FONT}`;
      g.fillText('and your lab coat at all times', w / 2, 474);
    } else if (kind === 'hazards') {
      g.fillStyle = '#111';
      g.font = `800 34px ${FONT}`;
      g.fillText('HAZARD SYMBOLS', w / 2, 44);
      const items: [number, number, 'flame' | 'corrosive' | 'skull' | 'exclaim', string][] = [
        [w * 0.28, 165, 'flame', 'Flammable'],
        [w * 0.72, 165, 'corrosive', 'Corrosive'],
        [w * 0.28, 365, 'skull', 'Toxic'],
        [w * 0.72, 365, 'exclaim', 'Harmful'],
      ];
      for (const [x, y, s, label] of items) {
        hazardDiamond(g, x, y, 110, s);
        g.fillStyle = '#111';
        g.font = `700 24px ${FONT}`;
        g.fillText(label, x, y + 100);
      }
    } else if (kind === 'rules') {
      g.fillStyle = '#1b6b3a';
      g.fillRect(0, 0, w, 80);
      g.fillStyle = '#fff';
      g.font = `800 34px ${FONT}`;
      g.fillText('LABORATORY RULES', w / 2, 42);
      g.fillStyle = '#16202a';
      g.textAlign = 'left';
      g.font = `500 21px ${FONT}`;
      const rules = ['No eating or drinking.', 'Never pipette by mouth: use a filler.', 'Read the meniscus at eye level.', 'Report every spill and breakage.', 'Wash your hands before you leave.'];
      let y = 128;
      rules.forEach((rule, i) => {
        y = wrapText(g, `${i + 1}. ${rule}`, 26, y, w - 52, 28) + 48;
      });
    } else {
      g.fillStyle = '#7a1f6b';
      g.fillRect(0, 0, w, 80);
      g.fillStyle = '#fff';
      g.font = `800 32px ${FONT}`;
      g.fillText('TITRATION', w / 2, 42);
      g.fillStyle = '#16202a';
      g.font = `600 22px ${FONT}`;
      g.fillText('End-point colours', w / 2, 116);
      const rows: [string, string, string][] = [
        ['Methyl orange', '#f2c400', '#f08a24'],
        ['Phenolphthalein', '#e04ba3', '#f5eef4'],
      ];
      rows.forEach(([name, a, b], i) => {
        const y = 180 + i * 140;
        g.font = `600 22px ${FONT}`;
        g.fillStyle = '#16202a';
        g.fillText(name, w / 2, y);
        g.fillStyle = a;
        g.beginPath();
        g.arc(w / 2 - 70, y + 60, 34, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = b;
        g.beginPath();
        g.arc(w / 2 + 70, y + 60, 34, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#999';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#16202a';
        g.font = `700 30px ${FONT}`;
        g.fillText('→', w / 2, y + 60);
      });
      g.font = `500 19px ${FONT}`;
      g.fillText('Swirl. Add dropwise near the end.', w / 2, 480);
    }
  });

const PERIODIC: string[][] = [
  ['H', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'He'],
  ['Li', 'Be', '', '', '', '', '', '', '', '', '', '', 'B', 'C', 'N', 'O', 'F', 'Ne'],
  ['Na', 'Mg', '', '', '', '', '', '', '', '', '', '', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'],
  ['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'],
  ['Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'],
  ['Cs', 'Ba', 'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'],
];
/** The periodic table poster (landscape 2:1). */
export const periodicTexture = () =>
  canvasTexture('periodic', 1024, 512, (g, w, h) => {
    g.fillStyle = '#fdfdf8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 34px ${FONT}`;
    g.fillText('THE PERIODIC TABLE OF ELEMENTS', w / 2, 36);
    const cw = (w - 40) / 18;
    const ch = (h - 90) / 6;
    PERIODIC.forEach((row, r) =>
      row.forEach((sym, c) => {
        if (!sym) return;
        const colour = c < 2 ? '#f6b26b' : c >= 17 ? '#a4c2f4' : c >= 12 ? (['B', 'Si', 'Ge', 'As', 'Sb', 'Te', 'Po', 'Al', 'Ga', 'In', 'Tl', 'Sn', 'Pb', 'Bi'].includes(sym) ? '#d9d2e9' : '#b6d7a8') : '#ffe599';
        g.fillStyle = sym === 'H' ? '#ea9999' : colour;
        const x = 20 + c * cw;
        const y = 70 + r * ch;
        g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
        g.fillStyle = '#16202a';
        g.font = `700 ${Math.round(ch * 0.4)}px ${FONT}`;
        g.fillText(sym, x + cw / 2, y + ch / 2 + 2);
      }),
    );
  });

/** A lab's own poster: a coloured title band and short lines (portrait 3:4). */
export interface PosterSpec {
  title: string;
  band: string;
  lines: string[];
}
export const customPosterTexture = (p: PosterSpec) =>
  canvasTexture(`poster-${p.title}-${p.lines.join('|')}`, 384, 512, (g, w) => {
    g.fillStyle = '#fdfdf8';
    g.fillRect(0, 0, w, 512);
    g.fillStyle = p.band;
    g.fillRect(0, 0, w, 80);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${p.title.length > 14 ? 26 : 32}px ${FONT}`;
    g.fillText(p.title.toUpperCase(), w / 2, 42);
    g.fillStyle = '#16202a';
    g.textAlign = 'left';
    g.font = `500 21px ${FONT}`;
    let y = 124;
    for (const line of p.lines) y = wrapText(g, line, 26, y, w - 52, 28) + 44;
  });

/** The whiteboard: today's practical in marker. */
export const whiteboardTexture = (lines: string[], note = 'Read at eye level!') =>
  canvasTexture(`whiteboard-${lines.join('|')}-${note}`, 1024, 448, (g, w, h) => {
    g.fillStyle = '#f7f8f9';
    g.fillRect(0, 0, w, h);
    const sheen = g.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#1c3f94';
    g.font = `700 52px "Segoe Print", "Comic Sans MS", ${FONT}`;
    g.fillText(lines[0] ?? '', 48, 86);
    g.fillStyle = '#1f2a37';
    g.font = `500 34px "Segoe Print", "Comic Sans MS", ${FONT}`;
    lines.slice(1).forEach((line, i) => g.fillText(line, 56, 160 + i * 60));
    g.fillStyle = '#c62828';
    g.font = `700 30px "Segoe Print", "Comic Sans MS", ${FONT}`;
    g.textAlign = 'right';
    g.fillText(note, w - 40, h - 40);
  });

/** Small signs: first aid, eye wash, fire extinguisher, fume cupboard. */
export const signTexture = (kind: 'firstAid' | 'eyeWash' | 'fire' | 'fume' | 'exit' | 'apparatus') =>
  canvasTexture(`sign-${kind}`, 256, 128, (g, w, h) => {
    const bg = { firstAid: '#14853b', eyeWash: '#14853b', fire: '#c62828', fume: '#0f3d8c', exit: '#14853b', apparatus: '#123b5c' }[kind];
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'firstAid') {
      g.fillRect(28, 44, 60, 20);
      g.fillRect(48, 24, 20, 60);
    }
    g.font = `800 ${kind === 'fume' || kind === 'apparatus' ? 24 : 28}px ${FONT}`;
    const text = { firstAid: 'FIRST AID', eyeWash: 'EYE WASH', fire: 'FIRE EXTINGUISHER', fume: 'FUME CUPBOARD', exit: 'EXIT', apparatus: 'APPARATUS' }[kind];
    if (kind === 'fire') {
      g.font = `800 24px ${FONT}`;
      g.fillText('FIRE', w / 2, 44);
      g.fillText('EXTINGUISHER', w / 2, 84);
    } else g.fillText(text, kind === 'firstAid' ? 168 : w / 2, h / 2 + 2);
  });

/** Gloss reflection streak for glassware (a vertical highlight). */
export const glassStreakTexture = () =>
  canvasTexture(
    'glass-streak',
    64,
    8,
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.18, 'rgba(255,255,255,0.0)');
      grad.addColorStop(0.24, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.0)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.0)');
      grad.addColorStop(0.76, 'rgba(255,255,255,0.35)');
      grad.addColorStop(0.8, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    },
    { srgb: false },
  );

/** The task card on the bench (title strip and the variant's statements). */
export const taskCardTexture = (lines: string[]) =>
  canvasTexture(`task-${lines.join('|')}`, 512, 360, (g, w, h) => {
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a1f6b';
    g.fillRect(0, 0, w, 54);
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = `800 28px ${FONT}`;
    g.fillText('TASK CARD — Titration', 20, 28);
    g.fillStyle = '#1f2a37';
    g.font = `500 21px ${FONT}`;
    let y = 90;
    for (const line of lines) y = wrapText(g, line, 20, y, w - 40, 27) + 36;
  });

/** The open exercise book on the bench: ruled pages with a table being filled in. */
export const bookTexture = () =>
  canvasTexture('book', 512, 340, (g, w, h) => {
    g.fillStyle = '#fdfcf6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a9c7e8';
    g.lineWidth = 1.5;
    for (let y = 40; y < h; y += 22) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.strokeStyle = '#e57373';
    g.beginPath();
    g.moveTo(44, 0);
    g.lineTo(44, h);
    g.moveTo(w / 2 + 44, 0);
    g.lineTo(w / 2 + 44, h);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = '#1c3f94';
    g.font = `600 20px ${FONT}`;
    g.fillText('Titration', 56, 32);
    g.font = `500 15px ${FONT}`;
    ['Burette readings / cm³', 'Final', 'Initial', 'Titre'].forEach((t, i) => g.fillText(t, 56, 80 + i * 22));
  });
