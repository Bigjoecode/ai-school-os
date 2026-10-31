import type { CameraPresets } from '../../../lab3d-kit/controls';
import { DEFAULT_ROOM, type RoomConfig } from '../../../lab3d-kit/room';
import type { RedoxTask } from '@aischool/shared';
import { SPOT } from './spots';

/** The redox lab's camera presets at the bench. */
export const REDOX_VIEWS: CameraPresets = {
  bench: { target: [0.12, 0.1, 0.02], dist: 1.55, pitch: 0.68 },
  burette: { target: [SPOT.buretteAxis[0], 0.42, SPOT.buretteAxis[2]], dist: 0.85, pitch: 0.1 },
  flask: { target: [SPOT.buretteAxis[0], 0.13, SPOT.buretteAxis[2]], dist: 0.42, pitch: 0.38 },
  pipetting: { target: [SPOT.flaskHome[0], 0.22, SPOT.flaskHome[2]], dist: 0.75, pitch: 0.3 },
  tripod: { target: [SPOT.tripod[0], 0.2, SPOT.tripod[2]], dist: 0.6, pitch: 0.3 },
};
export const viewButtons = (task: RedoxTask) => [
  { id: 'bench', label: 'Whole bench' },
  { id: 'burette', label: 'Burette' },
  { id: 'flask', label: 'Flask' },
  ...(task === 'OX' ? [{ id: 'tripod', label: 'Tripod' }] : []),
];
/** The chemistry room with the board and poster for redox titrations. */
export function redoxRoom(task: RedoxTask): RoomConfig {
  return {
    ...DEFAULT_ROOM,
    whiteboard:
      task === 'IOD'
        ? ['Chemistry — SS3 Practical', 'Redox titration: iodine / thiosulphate', 'Brown → pale straw → add starch', 'Blue-black → colourless = end point']
        : task === 'OX'
          ? ['Chemistry — SS3 Practical', 'Redox: KMnO₄ / ethanedioic acid', 'Acidify with dil. H₂SO₄, warm to 60–70 °C', 'End point: first permanent pink']
          : ['Chemistry — SS3 Practical', 'Redox: KMnO₄ / iron(II)', 'Acidify with dil. H₂SO₄ — no indicator', 'Read the TOP of the meniscus'],
    whiteboardNote: task === 'IOD' ? 'Starch near the end only!' : 'Never acidify with HCl!',
    frontPoster: { title: task === 'IOD' ? 'Iodometry' : 'KMnO₄ titrations', band: task === 'IOD' ? '#7a4a12' : '#6a1b6e', lines: task === 'IOD' ? ['I₂ + 2S₂O₃²⁻ → 2I⁻ + S₄O₆²⁻', 'I₂ : S₂O₃²⁻ = 1 : 2', 'Starch: blue-black with I₂'] : ['MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O', 'MnO₄⁻ : Fe²⁺ = 1 : 5', 'MnO₄⁻ : C₂O₄²⁻ = 2 : 5'] },
  };
}
