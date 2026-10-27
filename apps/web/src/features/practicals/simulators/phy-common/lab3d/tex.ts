import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';

/**
 * Canvas textures for the physics laboratory (posters, notice board, signs,
 * scales and dials): drawn once, cached for the page's life. No image files.
 */

const cache = new Map<string, CanvasTexture>();
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
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

/** A texture redrawn on demand (stopwatch digits, the drawing paper): call `redraw` with the new content. */
export function liveTex(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  // redrawn often: no mipmaps to rebuild on every upload
  t.generateMipmaps = false;
  t.minFilter = LinearFilter;
  return {
    texture: t,
    g: c.getContext('2d')!,
    redraw(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
      draw(c.getContext('2d')!, w, h);
      t.needsUpdate = true;
    },
  };
}

export function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y;
}

function band(g: CanvasRenderingContext2D, w: number, colour: string, title: string, h = 78) {
  g.fillStyle = '#fdfdf8';
  g.fillRect(0, 0, w, 2000);
  g.fillStyle = colour;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${title.length > 16 ? 26 : 32}px ${FONT}`;
  g.fillText(title.toUpperCase(), w / 2, h / 2 + 2);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

/** Landscape poster: the seven SI base units (takes the periodic table's place on the front wall). */
export const siPosterTexture = () =>
  canvasTex('phy-si', 1024, 512, (g, w, h) => {
    band(g, w, '#0f3d8c', 'SI base units', 84);
    const rows: [string, string, string][] = [
      ['length', 'metre', 'm'],
      ['mass', 'kilogram', 'kg'],
      ['time', 'second', 's'],
      ['electric current', 'ampere', 'A'],
      ['temperature', 'kelvin', 'K'],
      ['amount of substance', 'mole', 'mol'],
      ['luminous intensity', 'candela', 'cd'],
    ];
    g.font = `600 24px ${FONT}`;
    g.fillStyle = '#5b6672';
    g.fillText('QUANTITY', 40, 126);
    g.fillText('UNIT', 400, 126);
    g.fillText('SYMBOL', 620, 126);
    rows.forEach(([q, u, s], i) => {
      const y = 170 + i * 44;
      g.fillStyle = i % 2 ? '#eef3fb' : '#fdfdf8';
      g.fillRect(28, y - 30, 740, 44);
      g.fillStyle = '#16202a';
      g.font = `500 26px ${FONT}`;
      g.fillText(q, 40, y);
      g.fillText(u, 400, y);
      g.font = `800 28px ${FONT}`;
      g.fillStyle = '#0f3d8c';
      g.fillText(s, 620, y);
    });
    g.fillStyle = '#16202a';
    g.font = `700 24px ${FONT}`;
    g.fillText('Derived', 800, 130);
    g.font = `500 21px ${FONT}`;
    ['N = kg m s⁻²', 'J = N m', 'W = J s⁻¹', 'V = J C⁻¹', 'Ω = V A⁻¹', 'C = A s', 'Hz = s⁻¹'].forEach((l, i) => g.fillText(l, 800, 170 + i * 44));
    g.fillStyle = '#c62828';
    g.font = `700 22px ${FONT}`;
    g.fillText('Always give the unit with your answer!', 40, h - 18);
  });

/** Portrait poster: refraction of light (the ray through a glass block). */
export const refractionPosterTexture = () =>
  canvasTex('phy-refraction', 384, 512, (g, w) => {
    band(g, w, '#6a1b9a', 'Refraction of light');
    // the block and the ray
    g.fillStyle = 'rgba(120,200,220,0.35)';
    g.fillRect(70, 190, 240, 110);
    g.strokeStyle = '#334155';
    g.lineWidth = 3;
    g.strokeRect(70, 190, 240, 110);
    g.setLineDash([8, 6]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(170, 110);
    g.lineTo(170, 380);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#c62828';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(95, 110);
    g.lineTo(170, 190);
    g.lineTo(213, 300);
    g.lineTo(288, 380);
    g.stroke();
    g.fillStyle = '#16202a';
    g.font = `700 22px ${FONT}`;
    g.fillText('i', 140, 165);
    g.fillText('r', 180, 245);
    g.fillText('air', 30, 150);
    g.fillText('glass', 230, 250);
    g.font = `800 30px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('n = sin i / sin r', w / 2, 432);
    g.font = `500 19px ${FONT}`;
    g.fillText('Towards the normal into glass,', w / 2, 466);
    g.fillText('away from it coming out.', w / 2, 492);
  });

/** Portrait poster: electrical safety in the lab. */
export const electricalPosterTexture = () =>
  canvasTex('phy-electrical', 384, 512, (g, w) => {
    band(g, w, '#e0a100', 'Electrical safety');
    // warning triangle with a lightning flash
    g.save();
    g.translate(w / 2, 170);
    g.fillStyle = '#ffd400';
    g.strokeStyle = '#111';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(0, -64);
    g.lineTo(70, 56);
    g.lineTo(-70, 56);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#111';
    g.beginPath();
    g.moveTo(8, -34);
    g.lineTo(-18, 10);
    g.lineTo(0, 10);
    g.lineTo(-10, 44);
    g.lineTo(20, -2);
    g.lineTo(2, -2);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = '#16202a';
    g.font = `500 20px ${FONT}`;
    let y = 278;
    for (const l of ['Have your circuit checked before you close the key.', 'Never connect an ammeter straight across a cell.', 'Open the key between readings.', 'Dry hands only. Report damaged wires.', 'Mains sockets are for the teacher only.']) y = wrap(g, `• ${l}`, 26, y, w - 52, 25) + 34;
  });

/** Portrait poster: the simple pendulum. */
export const pendulumPosterTexture = () =>
  canvasTex('phy-pendulum-poster', 384, 512, (g, w) => {
    band(g, w, '#0b6e4f', 'Simple pendulum');
    g.strokeStyle = '#334155';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(110, 110);
    g.lineTo(270, 110);
    g.stroke();
    g.beginPath();
    g.moveTo(190, 110);
    g.lineTo(250, 300);
    g.stroke();
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(190, 110);
    g.lineTo(190, 320);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#4a5563';
    g.beginPath();
    g.arc(250, 312, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16202a';
    g.font = `700 22px ${FONT}`;
    g.fillText('l', 228, 210);
    g.fillText('θ', 196, 170);
    g.textAlign = 'center';
    g.font = `800 30px ${FONT}`;
    g.fillText('T = 2π √(l / g)', w / 2, 392);
    g.font = `500 19px ${FONT}`;
    g.fillText('Small angle (under 10°).', w / 2, 432);
    g.fillText('Time 20 oscillations', w / 2, 458);
    g.fillText('from the mean position.', w / 2, 484);
  });

/** Ohm's law poster (V = IR and the circuit). */
export const ohmPosterTexture = () =>
  canvasTex('phy-ohm-poster', 384, 512, (g, w) => {
    band(g, w, '#b23c17', "Ohm's law");
    g.strokeStyle = '#16202a';
    g.lineWidth = 3;
    g.strokeRect(70, 130, 240, 170);
    g.fillStyle = '#fdfdf8';
    g.fillRect(160, 120, 60, 22);
    g.strokeRect(160, 120, 60, 22);
    g.beginPath();
    g.arc(310, 215, 22, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(190, 300, 22, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#16202a';
    g.font = `800 22px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('A', 310, 223);
    g.fillText('V', 190, 308);
    g.fillText('R', 190, 108);
    g.font = `800 34px ${FONT}`;
    g.fillText('V = I R', w / 2, 384);
    g.font = `500 19px ${FONT}`;
    g.fillText('Ammeter in series,', w / 2, 428);
    g.fillText('voltmeter in parallel.', w / 2, 454);
    g.fillText('R = ρ l / A', w / 2, 486);
  });

/** The physics notice board: a cork board with pinned notices. */
export const noticeBoardTexture = (notices: { title: string; lines: string[]; colour: string }[]) =>
  canvasTex(`phy-notice-${notices.map((n) => n.title).join('|')}`, 1024, 640, (g, w, h) => {
    g.fillStyle = '#b8875a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 30},${30},${0.25})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = '#6d4c2e';
    g.lineWidth = 26;
    g.strokeRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    g.font = `800 40px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = '#fff6dc';
    g.fillText('PHYSICS DEPARTMENT — NOTICES', w / 2, 66);
    g.textAlign = 'left';
    const cols = 3;
    notices.slice(0, 6).forEach((n, i) => {
      const cw = (w - 80) / cols;
      const x = 40 + (i % cols) * cw + 10;
      const y = 100 + Math.floor(i / cols) * 260;
      g.save();
      g.translate(x + cw / 2, y + 120);
      g.rotate(((i * 37) % 7) / 100 - 0.03);
      g.fillStyle = n.colour;
      g.fillRect(-cw / 2 + 8, -112, cw - 36, 228);
      g.fillStyle = '#16202a';
      g.font = `800 24px ${FONT}`;
      wrap(g, n.title, -cw / 2 + 22, -78, cw - 64, 28);
      g.font = `500 19px ${FONT}`;
      let yy = -36;
      for (const l of n.lines) yy = wrap(g, l, -cw / 2 + 22, yy, cw - 64, 23) + 26;
      g.fillStyle = '#c62828';
      g.beginPath();
      g.arc(0, -104, 8, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
  });

/** Small sign: CO₂ extinguisher / fire blanket / power points. */
export const phySignTexture = (kind: 'co2' | 'blanket' | 'sockets' | 'physics') =>
  canvasTex(`phy-sign-${kind}`, 256, 128, (g, w, h) => {
    g.fillStyle = { co2: '#c62828', blanket: '#c62828', sockets: '#e0a100', physics: '#123b5c' }[kind];
    g.fillRect(0, 0, w, h);
    g.fillStyle = kind === 'sockets' ? '#111' : '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 24px ${FONT}`;
    const lines = { co2: ['CO₂ EXTINGUISHER', 'for electrical fires'], blanket: ['FIRE BLANKET', 'pull tapes down'], sockets: ['LOW-VOLTAGE ONLY', 'ask before you plug in'], physics: ['PHYSICS', 'LABORATORY'] }[kind];
    g.fillText(lines[0]!, w / 2, h / 2 - 18);
    g.font = `600 20px ${FONT}`;
    g.fillText(lines[1]!, w / 2, h / 2 + 20);
  });

/** A physics task card (title strip and the variant's statements). */
export const phyTaskCardTexture = (title: string, lines: string[]) =>
  canvasTex(`phy-task-${title}-${lines.join('|')}`, 512, 360, (g, w) => {
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, w, 360);
    g.fillStyle = '#0f3d8c';
    g.fillRect(0, 0, w, 54);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.font = `800 26px ${FONT}`;
    g.fillText(`TASK CARD — ${title}`, 20, 28);
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#1f2a37';
    g.font = `500 21px ${FONT}`;
    let y = 92;
    for (const line of lines) y = wrap(g, line, 20, y, w - 40, 27) + 34;
  });

/** The exercise book on the bench, with a physics heading. */
export const phyBookTexture = (title: string, heads: string[]) =>
  canvasTex(`phy-book-${title}`, 512, 340, (g, w, h) => {
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
    g.fillText(title, 56, 32);
    g.font = `500 15px ${FONT}`;
    heads.forEach((t, i) => g.fillText(t, 56 + i * 48, 80));
    // a little graph on the right page
    g.strokeStyle = '#1c3f94';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w / 2 + 70, 300);
    g.lineTo(w / 2 + 70, 120);
    g.moveTo(w / 2 + 70, 300);
    g.lineTo(w - 30, 300);
    g.stroke();
  });

/**
 * A metre-rule scale strip (cm and mm marks, numbers every 10 cm), `cm` long.
 * `vertical`: zero at the top (hanging rule); otherwise zero at the left.
 */
export const ruleTexture = (cm: number, vertical: boolean) =>
  canvasTex(`phy-rule-${cm}-${vertical}`, vertical ? 128 : cm * 24, vertical ? cm * 24 : 128, (g, w, h) => {
    g.fillStyle = '#f3d98f';
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, vertical ? w : 0, vertical ? 0 : h);
    grad.addColorStop(0, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(120,80,20,0.15)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b';
    g.strokeStyle = '#1b1b1b';
    const px = vertical ? h / cm : w / cm;
    for (let mm = 0; mm <= cm * 10; mm++) {
      const at = (mm / 10) * px;
      const len = mm % 10 === 0 ? 46 : mm % 5 === 0 ? 30 : 18;
      g.lineWidth = mm % 10 === 0 ? 2.4 : 1.3;
      g.beginPath();
      if (vertical) {
        g.moveTo(0, at);
        g.lineTo(len, at);
      } else {
        g.moveTo(at, 0);
        g.lineTo(at, len);
      }
      g.stroke();
      if (mm % 100 === 0 || (mm % 10 === 0 && cm <= 40)) {
        g.font = `700 ${mm % 100 === 0 ? 34 : 26}px ${FONT}`;
        const label = String(mm / 10);
        if (vertical) {
          g.textBaseline = 'middle';
          g.fillText(label, 58, Math.min(h - 14, Math.max(16, at)));
        } else {
          g.textAlign = 'center';
          g.fillText(label, Math.min(w - 22, Math.max(18, at)), 82);
        }
      }
    }
  });

/**
 * A protractor face (semicircle, 0° on the vertical through its centre, 90°
 * either side), drawn on a square canvas whose centre is the protractor's centre.
 */
export const protractorTexture = (down: boolean) =>
  canvasTex(`phy-protractor-${down}`, 512, 512, (g, w) => {
    const c = w / 2;
    const R = w / 2 - 6;
    g.clearRect(0, 0, w, w);
    g.fillStyle = 'rgba(235,245,250,0.55)';
    g.beginPath();
    if (down) g.arc(c, c, R, 0, Math.PI);
    else g.arc(c, c, R, Math.PI, 2 * Math.PI);
    g.closePath();
    g.fill();
    g.strokeStyle = '#0d2a52';
    g.fillStyle = '#0d2a52';
    for (let a = -90; a <= 90; a++) {
      const rad = (a * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = down ? Math.cos(rad) : -Math.cos(rad);
      const len = a % 10 === 0 ? 34 : a % 5 === 0 ? 24 : 14;
      g.lineWidth = a % 10 === 0 ? 2.2 : 1.1;
      g.beginPath();
      g.moveTo(c + dx * R, c + dy * R);
      g.lineTo(c + dx * (R - len), c + dy * (R - len));
      g.stroke();
      if (a % 10 === 0) {
        g.font = `700 20px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.abs(a)), c + dx * (R - 54), c + dy * (R - 54));
      }
    }
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c - R, c);
    g.lineTo(c + R, c);
    g.stroke();
    g.beginPath();
    g.arc(c, c, 6, 0, Math.PI * 2);
    g.stroke();
  });

/** An analogue meter face: an arc scale from 0 to `fsd` (-50° … +50°), the letter, the unit, a mirror strip. */
export const meterFaceTexture = (letter: string, fsd: number, minor: number, major: number) =>
  canvasTex(`phy-meter-${letter}-${fsd}`, 512, 384, (g, w, h) => {
    g.fillStyle = '#fbfbf6';
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h - 40;
    const R = 300;
    const ang = (x: number) => ((-50 + 100 * (x / fsd)) * Math.PI) / 180;
    // the anti-parallax mirror strip under the scale
    const mg = g.createLinearGradient(0, cy - R + 40, 0, cy - R + 60);
    mg.addColorStop(0, '#c9d3da');
    mg.addColorStop(0.5, '#f4f8fa');
    mg.addColorStop(1, '#aeb9c2');
    g.strokeStyle = mg;
    g.lineWidth = 16;
    g.beginPath();
    g.arc(cx, cy, R - 46, -Math.PI / 2 + ang(0), -Math.PI / 2 + ang(fsd));
    g.stroke();
    g.strokeStyle = '#16202a';
    g.fillStyle = '#16202a';
    const ticks = Math.round(fsd / minor);
    for (let i = 0; i <= ticks; i++) {
      const x = i * minor;
      const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      const half = !isMajor && Math.abs(x / (major / 2) - Math.round(x / (major / 2))) < 1e-6;
      const a = ang(x);
      const len = isMajor ? 30 : half ? 22 : 14;
      g.lineWidth = isMajor ? 3 : 1.6;
      g.beginPath();
      g.moveTo(cx + R * Math.sin(a), cy - R * Math.cos(a));
      g.lineTo(cx + (R - len) * Math.sin(a), cy - (R - len) * Math.cos(a));
      g.stroke();
      if (isMajor) {
        g.font = `700 24px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Number(x.toFixed(2))), cx + (R + 22) * Math.sin(a), cy - (R + 22) * Math.cos(a));
      }
    }
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2 + ang(0), -Math.PI / 2 + ang(fsd));
    g.stroke();
    g.font = `800 64px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, cx, cy - 120);
    g.font = `500 20px ${FONT}`;
    g.fillStyle = '#5b6672';
    g.fillText(`0 – ${fsd} ${letter === 'A' ? 'A' : 'V'}  d.c.`, cx, cy - 70);
  });
