import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, DoubleSide, type Material } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { assistantProfile, setAssistant } from '../../../lab3d-kit/assistant-profile';
import { Interactive } from '../../../lab3d-kit/interact';
import { CUPBOARD } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { defaultTourSteps, type TourOptions, type TourStep } from '../../../lab3d-kit/tour';
import { phyBookTexture, phyTaskCardTexture, protractorTexture, ruleTexture } from './tex';

/** Shared pieces of the three physics labs: the assistant, the tour, the cupboard, the bench's book and card, rules and protractors. */

/** Mr Bayo, the physics lab assistant. */
export function setPhysicsAssistant() {
  setAssistant({ name: 'Mr Bayo', role: 'physics lab assistant', look: 'bayo', pronoun: 'his' });
}
/**
 * Mr Bayo while a physics lab is open; whoever was the assistant before (e.g.
 * Mrs Ada, set once when a chemistry lab's module loads) is back when it closes.
 */
export function usePhysicsAssistant() {
  const [before] = useState(() => {
    const b = { ...assistantProfile };
    setPhysicsAssistant();
    return b;
  });
  useEffect(() => {
    setPhysicsAssistant();
    return () => setAssistant(before);
  }, [before]);
}

/** The kit's controls tour with the physics lab's welcome. */
export function physicsTour(o: TourOptions & { taskText?: string }): TourStep[] {
  return defaultTourSteps(o).map((s) =>
    s.id === 'welcome'
      ? { ...s, title: 'Welcome to the physics lab', body: () => 'This is a real school physics laboratory in 3D. A one-minute tour shows you how to move and work. You can skip it and replay it any time from Help.' }
      : s.id === 'task' && o.taskText
        ? { ...s, body: () => o.taskText! }
        : s,
  );
}

/** What the 3D lab records beyond the marked state: apparatus collected, coat on. Read back from the attempt's action log (no marks). */
export function collectedFromLog(log: { a: string }[]): { collected: Set<string>; coat: boolean } {
  const collected = new Set<string>();
  let coat = false;
  for (const { a } of log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'collect' && arg) collected.add(arg);
    else if (verb === 'return' && arg) collected.delete(arg);
    else if (verb === 'safety' && arg === 'coat') coat = true;
    else if (verb === 'safety-off' && arg === 'coat') coat = false;
  }
  return { collected, coat };
}
/** True when the attempt's log has 2D work in it and nothing collected in 3D first: the 3D bench is then set up already. */
export function startedIn2d(log: { a: string }[], workVerbs: RegExp): boolean {
  const firstCollect = log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = log.findIndex((e) => workVerbs.test(e.a));
  return first2d >= 0 && (firstCollect < 0 || first2d < firstCollect);
}

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 16);

/** A shelf slot in the apparatus cupboard (cupboard-local: x across, y shelf height, z depth). */
export interface CupboardSlot {
  id: string;
  label: string;
  shelf: 0 | 1 | 2;
  x: number;
  z?: number;
  /** Invisible grip box (size, centre) for small or thin things. */
  grip?: [V3, V3];
  model: ReactNode;
}
/** The apparatus still in the cupboard: each one can be carried to the bench (the kit's carry drag) or selected. */
export function CupboardItems({ slots, collected }: { slots: CupboardSlot[]; collected: Set<string> }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {slots
        .filter((s) => !collected.has(s.id))
        .map((s) => (
          <Interactive key={s.id} id={`cup:${s.id}`} label={s.label} labelY={0.3} position={[s.x, CUPBOARD_SHELVES[s.shelf]!, s.z ?? 0.02]} drag={carry}>
            {(active) => (
              <group>
                {s.model}
                {s.grip && (
                  <mesh position={s.grip[1]}>
                    <boxGeometry args={s.grip[0]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                )}
                {active && <GlowRing r={0.09} />}
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

/** A metre rule (or a shorter rule): `cm` long, lying along +x (zero at the origin), the scale on its top face; `vertical` hangs it down −y with the scale facing +z. */
export function Rule({ cm = 100, vertical = false, width = 0.028, glow }: { cm?: number; vertical?: boolean; width?: number; glow?: boolean }) {
  const tex = useMemo(() => ruleTexture(cm, vertical), [cm, vertical]);
  const L = cm / 100;
  if (vertical)
    return (
      <group>
        <mesh geometry={box} material={mat.wood()} position={[width / 2, -L / 2, -0.003]} scale={[width, L + 0.01, 0.006]} />
        <mesh position={[width / 2, -L / 2, 0.0002]}>
          <planeGeometry args={[width, L]} />
          <meshStandardMaterial map={tex} roughness={0.6} />
        </mesh>
        {glow && (
          <mesh position={[width / 2, -L / 2, 0.002]} material={mat.highlight()}>
            <planeGeometry args={[width + 0.02, L + 0.02]} />
          </mesh>
        )}
      </group>
    );
  return (
    <group>
      <mesh geometry={box} material={mat.wood()} position={[L / 2, 0.003, 0]} scale={[L + 0.01, 0.006, width]} />
      <mesh position={[L / 2, 0.0062, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[L, width]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
      <BlobShadow r={Math.min(0.5, L / 2)} y={0.0006} opacity={0.5} />
      {glow && <GlowRing r={Math.max(0.08, L / 2)} />}
    </group>
  );
}

/** A transparent plastic protractor: radius `r`, its straight edge along x through the origin; `down` = the arc below (−y in its own plane). Lies in the x–y plane facing +z. */
export function Protractor({ r = 0.06, down = true, glow }: { r?: number; down?: boolean; glow?: boolean }) {
  const tex = useMemo(() => protractorTexture(down), [down]);
  return (
    <group>
      <mesh>
        <planeGeometry args={[2 * r, 2 * r]} />
        <meshBasicMaterial map={tex} transparent side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      {glow && (
        <mesh position={[0, down ? -r / 2 : r / 2, 0.001]} material={mat.highlight()}>
          <planeGeometry args={[2 * r + 0.01, r + 0.01]} />
        </mesh>
      )}
    </group>
  );
}

/** A labelled cardboard box (apparatus in the cupboard). */
export function LabelledBox({ s, m = mat.cabinet() }: { s: V3; m?: Material }) {
  return <mesh geometry={box} material={m} position={[0, s[1] / 2, 0]} scale={s} />;
}

/** The task card and the open notebook on the bench, both selectable. */
export function CardAndBook({ cardAt, bookAt, title, lines, bookTitle, heads }: { cardAt: V3; bookAt: V3; title: string; lines: string[]; bookTitle: string; heads: string[] }) {
  const card = useMemo(() => phyTaskCardTexture(title, lines), [title, lines]);
  const book = useMemo(() => phyBookTexture(bookTitle, heads), [bookTitle, heads]);
  return (
    <>
      <Interactive id="card" label="Task card" bench position={cardAt} rotation={[0, 0.25, 0]}>
        {(active) => (
          <group>
            <mesh rotation={[-Math.PI / 2 + 0.08, 0, 0]} position={[0, 0.003, 0]}>
              <planeGeometry args={[0.22, 0.155]} />
              <meshStandardMaterial map={card} roughness={0.7} />
            </mesh>
            {active && <GlowRing r={0.14} />}
          </group>
        )}
      </Interactive>
      <Interactive id="book" label="Practical notebook" bench position={bookAt} rotation={[0, -0.2, 0]}>
        {(active) => (
          <group>
            <mesh geometry={box} material={mat.white()} position={[0, 0.006, 0]} scale={[0.34, 0.012, 0.23]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0125, 0]}>
              <planeGeometry args={[0.33, 0.22]} />
              <meshStandardMaterial map={book} roughness={0.8} />
            </mesh>
            <mesh geometry={cyl} material={mat.black()} position={[0.1, 0.016, 0.07]} rotation={[0, 0.5, Math.PI / 2]} scale={[0.004, 0.13, 0.004]} />
            <BlobShadow r={0.22} />
            {active && <GlowRing r={0.2} />}
          </group>
        )}
      </Interactive>
    </>
  );
}

/** Glass-style classes for the docks over the 3D view. */
export const dockClass = 'pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-white/15 bg-black/55 p-2 text-white shadow-xl backdrop-blur';
export const dockButton = 'border-white/20 bg-white/10 text-white hover:bg-white/20';
