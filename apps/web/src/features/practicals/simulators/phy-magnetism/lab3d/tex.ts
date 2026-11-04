import { canvasTex, FONT } from '../../phy-common/lab3d/tex';

/** Canvas textures of the magnetism bench: analogue meter faces (from `from` to `to`), labels and the coil's winding. */

function scale(g: CanvasRenderingContext2D, w: number, h: number, from: number, to: number, minor: number, major: number) {
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
      g.fillText(String(Number(Math.abs(x).toFixed(2))), cx + (R + 22) * Math.sin(a), cy - (R + 22) * Math.cos(a));
    }
  }
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cy, R, -Math.PI / 2 + ang(from), -Math.PI / 2 + ang(to));
  g.stroke();
}

export const magMeterFace = (letter: string, sub: string, from: number, to: number, minor: number, major: number) =>
  canvasTex(`mag-meter-${letter}-${from}-${to}-${minor}`, 512, 384, (g, w, h) => {
    scale(g, w, h, from, to, minor, major);
    g.font = `800 64px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#16202a';
    g.fillText(letter, w / 2, h - 160);
    g.font = `500 20px ${FONT}`;
    g.fillStyle = '#5b6672';
    g.fillText(sub, w / 2, h - 110);
  });

export const magLabel = (text: string, bg = '#fffdf3', fg = '#16202a') =>
  canvasTex(`mag-label-${text}-${bg}`, 256, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });

export const windingTex = () =>
  canvasTex('mag-winding', 512, 64, (g, w, h) => {
    g.fillStyle = '#8a4b1d';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 5) {
      g.fillStyle = '#d0843f';
      g.fillRect(x, 0, 3, h);
    }
  });
