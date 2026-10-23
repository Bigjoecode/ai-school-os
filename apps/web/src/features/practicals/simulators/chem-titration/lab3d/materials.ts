import { Color, DoubleSide, MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import { benchTopTexture, woodTexture } from './textures';

/**
 * Shared materials (one instance each, so the room's many repeats share GPU
 * programs and state). Room surfaces use Lambert (cheap on phones); glass and
 * liquids use the standard / physical models (no transmission pass).
 */

const cache = new Map<string, Material>();
function once<M extends Material>(key: string, make: () => M): M {
  let m = cache.get(key) as M | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}

export const mat = {
  wall: () => once('wall', () => new MeshLambertMaterial({ color: '#f1ead8' })),
  dado: () => once('dado', () => new MeshLambertMaterial({ color: '#4f8a7a' })),
  ceiling: () => once('ceiling', () => new MeshLambertMaterial({ color: '#fbfaf6' })),
  skirting: () => once('skirting', () => new MeshLambertMaterial({ color: '#3d4a52' })),
  benchTop: () => once('benchTop', () => new MeshStandardMaterial({ map: benchTopTexture(), roughness: 0.35, metalness: 0.05 })),
  wood: () => once('wood', () => new MeshLambertMaterial({ map: woodTexture() })),
  woodDark: () => once('woodDark', () => new MeshLambertMaterial({ map: woodTexture(), color: '#8a6a52' })),
  cabinet: () => once('cabinet', () => new MeshLambertMaterial({ color: '#e9e4d6' })),
  metal: () => once('metal', () => new MeshStandardMaterial({ color: '#b9c0c7', roughness: 0.35, metalness: 0.85 })),
  darkMetal: () => once('darkMetal', () => new MeshStandardMaterial({ color: '#3a4047', roughness: 0.5, metalness: 0.6 })),
  steel: () => once('steel', () => new MeshStandardMaterial({ color: '#d7dde2', roughness: 0.22, metalness: 0.9 })),
  black: () => once('black', () => new MeshLambertMaterial({ color: '#1c1f22' })),
  white: () => once('white', () => new MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.25 })),
  tile: () => once('tile', () => new MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.12, metalness: 0 })),
  rubber: () => once('rubber', () => new MeshStandardMaterial({ color: '#b3262b', roughness: 0.6 })),
  cork: () => once('cork', () => new MeshLambertMaterial({ color: '#b48a5a' })),
  ptfe: () => once('ptfe', () => new MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.5 })),
  plastic: () => once('plastic', () => new MeshStandardMaterial({ color: '#f4f7f8', roughness: 0.45, transparent: true, opacity: 0.9 })),
  red: () => once('red', () => new MeshStandardMaterial({ color: '#c8242b', roughness: 0.35, metalness: 0.1 })),
  green: () => once('green', () => new MeshLambertMaterial({ color: '#178a43' })),
  light: () => once('light', () => new MeshBasicMaterial({ color: '#fffdf5' })),
  windowFrame: () => once('windowFrame', () => new MeshLambertMaterial({ color: '#e8e8e3' })),
  louvre: () => once('louvre', () => new MeshStandardMaterial({ color: '#cfe6ef', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false })),
  glass: () =>
    once(
      'glass',
      () =>
        new MeshPhysicalMaterial({
          color: '#ffffff',
          roughness: 0.04,
          metalness: 0,
          transparent: true,
          opacity: 0.2,
          envMapIntensity: 1.6,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          side: DoubleSide,
          depthWrite: false,
        }),
    ),
  /** The sash and doors of cupboards: flatter, less reflective. */
  pane: () => once('pane', () => new MeshStandardMaterial({ color: '#dfeef3', roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide })),
  tickBlack: () => once('tickBlack', () => new MeshBasicMaterial({ color: '#11161d', side: DoubleSide })),
  highlight: () => once('highlight', () => new MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.55, depthWrite: false })),
};

/** A liquid of a given colour (cached by colour). */
export function liquidMaterial(colour: string, opacity = 0.72) {
  return once(
    `liquid-${colour}-${opacity}`,
    () => new MeshStandardMaterial({ color: new Color(colour), roughness: 0.08, metalness: 0, transparent: true, opacity, depthWrite: false, side: DoubleSide, envMapIntensity: 0.8 }),
  );
}
export function colourMaterial(colour: string) {
  return once(`colour-${colour}`, () => new MeshStandardMaterial({ color: colour, roughness: 0.55 }));
}
