import { GALVO_DIVS } from '@aischool/shared';
import { canvasTex, FONT } from '../../phy-common/lab3d/tex';

/**
 * Canvas textures of the circuits bench: the analogue meter faces (their own
 * cache keys, as the voltmeter here has finer divisions than the Ohm's-law
 * lab's), the centre-zero galvanometer, the resistance box's top and labels.
 */

function scale(g: CanvasRenderingContext2D, w: number, h: number, from: number, to: number, minor: number, major: number, label: (x: number) => string) {
  g.fillStyle = '#fbfbf6';
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h - 40;
  const R = 300;
  const ang = (x: number) => ((-50 + (100 * (x - from)) / (to - from)) * Math.PI) / 180;
  const mg = g.createLinearGradient(0, cy - R + 40, 0, cy - R + 60);
  mg.addColorStop(0, '#c9d3da');
  mg.addColorStop(0.5, '#f4f8fa');
  mg.addColorStop(1, '#aeb9c2');
  g.strokeStyle = mg;
  g.lineWidth = 16;
  g.beginPath();
  g.arc(cx, cy, R - 46, -Math.PI / 2 + ang(from), -Math.PI / 2 + ang(to));
  g.stroke();
  g.strokeStyle = '#16202a';
  g.fillStyle = '#16202a';
  const ticks = Math.round((to - from) / minor);
  for (let i = 0; i <= ticks; i++) {
    const x = from + i * minor;
    const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    const half = !isMajor && Math.abs(x / (major / 2) - Math.round(x / (major / 2))) < 1e-6;
    const a = ang(x);
    const len = isMajor ? 30 : half ? 22 : 14;
    g.lineWidth = isMajor ? 3 : 1.4;
    g.beginPath();
    g.moveTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
    g.lineTo(cx + (R - len) * Math.sin(a), cy - (R - len) * Math.cos(a));
    g.stroke();
    if (isMajor) {
      g.font = `700 24px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label(x), cx + (R + 22) * Math.sin(a), cy - (R + 22) * Math.cos(a));
    }
  }
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2 + ang(from), -Math.PI / 2 + ang(to));
  g.stroke();
}

/** An analogue meter face from 0 to `fsd` over −50° … +50°. */
export const circuitsMeterFace = (letter: 'A' | 'V', fsd: number, minor: number, major: number) =>
  canvasTex(`circ-meter-${letter}-${fsd}-${minor}`, 512, 384, (g, w, h) => {
    scale(g, w, h, 0, fsd, minor, major, (x) => String(Number(x.toFixed(2))));
    g.font = `800 64px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, w / 2, h - 160);
    g.font = `500 20px ${FONT}`;
    g.fillStyle = '#5b6672';
    g.fillText(`0 – ${fsd} ${letter}  d.c.`, w / 2, h - 110);
  });

/** The centre-zero galvanometer: −30 … 0 … +30 divisions. */
export const galvoFace = () =>
  canvasTex('circ-galvo', 512, 384, (g, w, h) => {
    scale(g, w, h, -GALVO_DIVS, GALVO_DIVS, 1, 10, (x) => String(Math.abs(Math.round(x))));
    g.font = `800 64px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('G', w / 2, h - 160);
    g.font = `500 20px ${FONT}`;
    g.fillStyle = '#5b6672';
    g.fillText('centre zero', w / 2, h - 110);
  });

/** A small printed label. */
export const plate = (text: string, bg = '#fffdf3', fg = '#16202a') =>
  canvasTex(`circ-plate-${text}-${bg}`, 256, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `700 34px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
