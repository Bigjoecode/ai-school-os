import { CanvasTexture, ClampToEdgeWrapping, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';

/**
 * The biology room's canvas textures (no image files): the wall charts (cells,
 * a food chain, classification), signs, specimen-jar labels and letter cards.
 * Each is drawn once and cached for the page's life.
 */

const cache = new Map<string, Texture>();
export function bioCanvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function title(g: CanvasRenderingContext2D, w: number, text: string, band: string, h = 76) {
  g.fillStyle = '#fdfcf6';
  g.fillRect(0, 0, w, g.canvas.height);
  g.fillStyle = band;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.round(h * 0.42)}px ${FONT}`;
  g.fillText(text, w / 2, h / 2 + 2);
}
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, tx: number, ty: number, align: CanvasTextAlign) {
  g.strokeStyle = '#2b2b28';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(tx, ty);
  g.stroke();
  g.fillStyle = '#1c1f22';
  g.font = `600 22px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, tx + (align === 'left' ? 6 : -6), ty);
}

/** "Plant and animal cells" (landscape 2:1), where the chemistry room has its periodic table. */
export const cellChartTexture = () =>
  bioCanvas('bio-cells', 1024, 512, (g, w, h) => {
    title(g, w, 'PLANT AND ANIMAL CELLS', '#2e7d32');
    // plant cell: brick-shaped wall, membrane, large vacuole, nucleus, chloroplasts
    const px = 150;
    const py = 130;
    g.fillStyle = '#b8d99a';
    g.strokeStyle = '#2f5d1e';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(px, py, 280, 300, 18);
    g.fill();
    g.stroke();
    g.fillStyle = '#e7f3d4';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(px + 14, py + 14, 252, 272, 12);
    g.fill();
    g.stroke();
    g.fillStyle = '#d6ecf7';
    g.beginPath();
    g.roundRect(px + 60, py + 50, 170, 200, 40);
    g.fill();
    g.stroke();
    g.fillStyle = '#7b4a8c';
    g.beginPath();
    g.ellipse(px + 40, py + 70, 22, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3b8a2e';
    for (const [x, y] of [[px + 30, py + 150], [px + 36, py + 230], [px + 250, py + 120], [px + 246, py + 220], [px + 140, py + 268], [px + 100, py + 30]]) {
      g.beginPath();
      g.ellipse(x!, y!, 14, 8, 0.5, 0, Math.PI * 2);
      g.fill();
    }
    label(g, 'Cell wall', px, py + 20, px - 18, py - 10, 'right');
    label(g, 'Nucleus', px + 40, py + 70, px - 18, py + 70, 'right');
    label(g, 'Chloroplast', px + 30, py + 150, px - 18, py + 160, 'right');
    label(g, 'Vacuole', px + 150, py + 160, px - 18, py + 250, 'right');
    label(g, 'Cytoplasm', px + 20, py + 280, px - 18, py + 320, 'right');
    // animal cell: irregular outline, membrane only, nucleus, no wall
    const ax = 740;
    const ay = 290;
    g.fillStyle = '#f6d6d0';
    g.strokeStyle = '#8b3a2e';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 130 + Math.sin(a * 3) * 12 + Math.cos(a * 5) * 7;
      if (i === 0) g.moveTo(ax + Math.cos(a) * r, ay + Math.sin(a) * r * 0.82);
      else g.lineTo(ax + Math.cos(a) * r, ay + Math.sin(a) * r * 0.82);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#6b3c8c';
    g.beginPath();
    g.ellipse(ax + 6, ay - 4, 36, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c97a5a';
    for (const [x, y] of [[ax - 70, ay + 40], [ax + 70, ay + 50], [ax + 60, ay - 60]]) {
      g.beginPath();
      g.ellipse(x!, y!, 16, 7, 0.8, 0, Math.PI * 2);
      g.fill();
    }
    label(g, 'Nucleus', ax + 6, ay - 4, ax + 160, ay - 120, 'left');
    label(g, 'Cell membrane', ax + 120, ay + 40, ax + 160, ay + 40, 'left');
    label(g, 'Cytoplasm', ax + 40, ay + 70, ax + 160, ay + 140, 'left');
    label(g, 'Mitochondrion', ax + 70, ay + 50, ax + 160, ay + 190, 'left');
    g.fillStyle = '#1c1f22';
    g.font = `700 24px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('Plant cell', px + 140, h - 32);
    g.fillText('Animal cell', ax, h - 32);
  });

/** A food chain from the savanna: sun → grass → grasshopper → lizard → hawk (portrait 3:4). */
export const foodChainTexture = () =>
  bioCanvas('bio-foodchain', 384, 512, (g, w) => {
    title(g, w, 'FOOD CHAIN', '#ef6c00', 64);
    const steps: [string, string, string][] = [
      ['Sun', 'energy source', '#fbc02d'],
      ['Grass', 'producer', '#7cb342'],
      ['Grasshopper', 'primary consumer', '#9ccc65'],
      ['Lizard (agama)', 'secondary consumer', '#ff8a65'],
      ['Hawk', 'tertiary consumer', '#8d6e63'],
    ];
    steps.forEach(([n, role, c], i) => {
      const y = 92 + i * 82;
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(46, y, w - 92, 54, 12);
      g.fill();
      g.fillStyle = '#16202a';
      g.textAlign = 'center';
      g.font = `700 22px ${FONT}`;
      g.fillText(n, w / 2, y + 22);
      g.font = `500 15px ${FONT}`;
      g.fillText(role, w / 2, y + 42);
      if (i < steps.length - 1) {
        g.strokeStyle = '#16202a';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(w / 2, y + 56);
        g.lineTo(w / 2, y + 80);
        g.moveTo(w / 2 - 8, y + 70);
        g.lineTo(w / 2, y + 80);
        g.lineTo(w / 2 + 8, y + 70);
        g.stroke();
      }
    });
    g.fillStyle = '#37474f';
    g.font = `500 15px ${FONT}`;
    g.fillText('Arrows show the flow of energy', w / 2, 500);
  });

/** The ranks of classification and the five kingdoms (portrait 3:4). */
export const classificationTexture = () =>
  bioCanvas('bio-classification', 384, 512, (g, w) => {
    title(g, w, 'CLASSIFICATION', '#1565c0', 64);
    const ranks = ['Kingdom', 'Phylum / Division', 'Class', 'Order', 'Family', 'Genus', 'Species'];
    ranks.forEach((r, i) => {
      const inset = i * 16;
      const y = 84 + i * 40;
      g.fillStyle = `hsl(210 70% ${88 - i * 6}%)`;
      g.fillRect(30 + inset, y, w - 60 - inset * 2, 32);
      g.fillStyle = '#0d2238';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `600 18px ${FONT}`;
      g.fillText(r, w / 2, y + 17);
    });
    g.font = `700 18px ${FONT}`;
    g.fillStyle = '#16202a';
    g.fillText('The five kingdoms', w / 2, 384);
    g.font = `500 16px ${FONT}`;
    ['Monera (bacteria)', 'Protoctista (Amoeba, algae)', 'Fungi (mushroom, mould)', 'Plantae (moss, fern, flowering)', 'Animalia (worm, insect, toad)'].forEach((k, i) => g.fillText(k, w / 2, 412 + i * 21));
  });

/** A sign: white text on a coloured plate (2:1). */
export const bioSignTexture = (text: string, bg: string, sub = '') =>
  bioCanvas(`bio-sign-${text}-${bg}-${sub}`, 512, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${text.length > 16 ? 48 : 60}px ${FONT}`;
    g.fillText(text, w / 2, sub ? h / 2 - 26 : h / 2);
    if (sub) {
      g.font = `500 30px ${FONT}`;
      g.fillText(sub, w / 2, h / 2 + 40);
    }
  });

/** A small paper label (specimen jars, slide boxes): text on cream, optional coloured band. */
export const jarLabelTexture = (text: string, band = '#6d4c41') =>
  bioCanvas(`bio-label-${text}-${band}`, 256, 128, (g, w, h) => {
    g.fillStyle = '#f7f1dc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = band;
    g.fillRect(0, 0, w, 22);
    g.fillStyle = '#2b2620';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${text.length > 14 ? 26 : 34}px ${FONT}`;
    g.fillText(text, w / 2, (h + 22) / 2);
  });

/** A white letter card for a specimen (A, B, C …), standing folded in front of its tray. */
export const letterCardTexture = (letter: string) =>
  bioCanvas(`bio-letter-${letter}`, 128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1c1f22';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#1c1f22';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 84px ${FONT}`;
    g.fillText(letter, w / 2, h / 2 + 4);
  });

/** The little sign on a display stand: a small specimen is shown enlarged on the bench (the lens and ruler show it at its true size). */
export const displayCardTexture = (mag: number) =>
  bioCanvas(`bio-display-${mag}`, 256, 96, (g, w, h) => {
    g.fillStyle = '#fffbe8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6d1c';
    g.lineWidth = 5;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#1c1f22';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 40px ${FONT}`;
    g.fillText(`shown ×${mag}`, w / 2, h / 2 - 12);
    g.font = `600 19px ${FONT}`;
    g.fillText('measure with the ruler', w / 2, h / 2 + 24);
  });

/** A ruler's face: centimetre and millimetre marks (length in cm). */
export const rulerTexture = (cm: number) =>
  bioCanvas(`bio-ruler-${cm}`, 64 * cm, 64, (g, w, h) => {
    g.fillStyle = '#f3e3a8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3b3a36';
    g.fillStyle = '#3b3a36';
    g.textAlign = 'center';
    g.font = `600 18px ${FONT}`;
    const pad = 10;
    const per = (w - pad * 2) / cm;
    for (let mm = 0; mm <= cm * 10; mm++) {
      const x = pad + (mm / 10) * per;
      const big = mm % 10 === 0;
      g.lineWidth = big ? 2 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, big ? 26 : mm % 5 === 0 ? 18 : 11);
      g.stroke();
      if (big) g.fillText(String(mm / 10), x, 46);
    }
  });

/** The open practical notebook / answer sheet on the bench: a ruled page with a drawing box. */
export const bioBookTexture = (title: string) =>
  bioCanvas(`bio-book-${title}`, 512, 336, (g, w, h) => {
    g.fillStyle = '#fbf8ee';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9c2ae';
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.strokeStyle = '#b8cbe0';
    g.lineWidth = 1.5;
    for (let y = 60; y < h; y += 22) {
      g.beginPath();
      g.moveTo(w / 2 + 14, y);
      g.lineTo(w - 14, y);
      g.stroke();
    }
    g.fillStyle = '#1c1f22';
    g.font = `700 22px ${FONT}`;
    g.fillText(title, 18, 34);
    g.strokeStyle = '#555';
    g.lineWidth = 2;
    g.strokeRect(24, 56, w / 2 - 48, h - 90);
    g.beginPath();
    g.ellipse(w / 4, h / 2 + 10, 60, 44, 0, 0, Math.PI * 2);
    g.stroke();
    for (const [x1, y1, x2] of [[w / 4 + 40, h / 2 - 10, w / 2 - 30], [w / 4 - 30, h / 2 + 30, 36]] as const) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y1);
      g.stroke();
    }
  });

/** The task card standing on the bench. */
export const bioTaskCardTexture = (title: string, lines: string[]) =>
  bioCanvas(`bio-task-${title}-${lines.join('|')}`, 512, 352, (g, w, h) => {
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2e7d32';
    g.fillRect(0, 0, w, 64);
    g.fillStyle = '#fff';
    g.font = `800 30px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(`TASK CARD — ${title}`, 20, 34);
    g.fillStyle = '#1c1f22';
    g.font = `500 25px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, 22, 104 + i * 44, w - 40));
    g.strokeStyle = '#2e7d32';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
