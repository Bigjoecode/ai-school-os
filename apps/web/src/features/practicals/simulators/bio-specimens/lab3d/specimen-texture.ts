import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { Drawing } from '../sheet';

/**
 * A bench specimen's look in 3D: the 2D lab's own drawing of it (the same
 * SVG, so what is on the tray is what is labelled on the answer sheet),
 * rendered once into a transparent canvas texture. The texture exists at once
 * (blank) and fills in when the drawing has been rasterised.
 */
const cache = new Map<string, Texture>();
const SIZE = 512;

function draw(id: string, canvas: HTMLCanvasElement, tex: Texture) {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 200 200', width: SIZE, height: SIZE }, createElement(Drawing, { id }))));
  const markup = host.innerHTML;
  root.unmount();
  const img = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  img.onload = () => {
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, SIZE, SIZE);
    g.drawImage(img, 0, 0, SIZE, SIZE);
    tex.needsUpdate = true;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

export function specimenTexture(id: string): Texture {
  const hit = cache.get(id);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(id, tex);
  // Not during a render: React would refuse to flush the drawing's own root.
  setTimeout(() => draw(id, canvas, tex), 0);
  return tex;
}
