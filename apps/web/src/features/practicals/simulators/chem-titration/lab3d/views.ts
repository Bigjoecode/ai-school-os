import type { CameraPresets } from '../../../lab3d-kit/controls';
import { DEFAULT_ROOM, type RoomConfig } from '../../../lab3d-kit/room';
import { SPOT } from './spots';

/** The titration's camera presets at the bench (the kit adds 'bench'). */
export const TITRATION_VIEWS: CameraPresets = {
  burette: { target: [SPOT.buretteAxis[0], 0.42, SPOT.buretteAxis[2]], dist: 0.85, pitch: 0.1 },
  flask: { target: [SPOT.buretteAxis[0], 0.13, SPOT.buretteAxis[2]], dist: 0.42, pitch: 0.38 },
  /** The flask on the bench while B is pipetted into it. */
  pipetting: { target: [SPOT.flaskHome[0], 0.22, SPOT.flaskHome[2]], dist: 0.75, pitch: 0.3 },
};
/** The mode bar's bench views. */
export const TITRATION_VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'burette', label: 'Burette' },
  { id: 'flask', label: 'Flask' },
];
/** The room as the titration has it (the kit's default chemistry room). */
export const TITRATION_ROOM: RoomConfig = DEFAULT_ROOM;
