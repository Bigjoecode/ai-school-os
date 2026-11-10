import { coAddr, coEvalAll, coShown, coTaskTitle, type CoApp, type CompOfficeState, type CompOfficeVariant } from '@aischool/shared';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { CameraPresets } from '../../../lab3d-kit/controls';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, BENCHES, MY_BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import type { RoomConfig } from '../../../lab3d-kit/room';
import { KitScene } from '../../../lab3d-kit/scene';

/**
 * The computer room on the kit's room: benches with a PC at each place, no
 * sinks or chemical shelves. The student's monitor shows the live work on a
 * canvas texture; using the computer opens the real application over the view.
 */

const plastic = new MeshStandardMaterial({ color: '#2b2f36', roughness: 0.55 });
const beige = new MeshStandardMaterial({ color: '#dcdad2', roughness: 0.6 });
const keyMat = new MeshStandardMaterial({ color: '#3b4048', roughness: 0.7 });
const glow = new MeshBasicMaterial({ color: '#22c55e' });
const off = new MeshBasicMaterial({ color: '#4b5563' });
const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const G = { base: box(0.22, 0.014, 0.16), neck: box(0.04, 0.13, 0.03), frame: box(0.58, 0.36, 0.03), kb: box(0.42, 0.018, 0.14), key: box(0.39, 0.006, 0.115), mouse: box(0.05, 0.022, 0.085), tower: box(0.16, 0.36, 0.34), ups: box(0.13, 0.17, 0.26), printer: box(0.36, 0.17, 0.3), tray: box(0.22, 0.012, 0.12), lamp: box(0.012, 0.012, 0.004), flash: box(0.05, 0.012, 0.018), paper: box(0.21, 0.03, 0.297) };
export const SPOT = { monitor: [0, 0, -0.2] as const, keyboard: [0, 0, 0.14] as const, mouse: [0.3, 0, 0.14] as const, tower: [-0.5, 0, -0.14] as const, ups: [0.5, 0, -0.26] as const, printer: [0.92, 0, -0.14] as const, flash: [-0.5, 0, 0.2] as const, paper: [-0.92, 0, 0.1] as const };

/** A PC on another bench (static). */
function OtherPc({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, BENCH.h, z]}>
      <mesh geometry={G.base} material={plastic} position={[0, 0.007, -0.2]} />
      <mesh geometry={G.neck} material={plastic} position={[0, 0.07, -0.2]} />
      <mesh geometry={G.frame} material={plastic} position={[0, 0.3, -0.2]} />
      <mesh position={[0, 0.3, -0.184]}>
        <planeGeometry args={[0.54, 0.32]} />
        <meshBasicMaterial color="#0f2a43" />
      </mesh>
      <mesh geometry={G.kb} material={plastic} position={[0, 0.01, 0.14]} />
      <mesh geometry={G.tower} material={beige} position={[-0.5, 0.18, -0.14]} />
    </group>
  );
}
const others = BENCHES.flatMap(([x, z]) => [-0.8, 0.8].map((dx) => ({ x: x + dx, z }))).filter((p) => !(Math.abs(p.z - MY_BENCH[1]) < 0.01 && Math.abs(p.x - MY_BENCH[0]) < 1));
export const OFFICE_ROOM: RoomConfig = {
  whiteboard: ['Computer Studies — SS3 Practical', 'Application packages', 'Save early, save often', 'Preview before you print'],
  whiteboardNote: 'Save your work!',
  frontPoster: { title: 'Good habits', band: '#0f3d8c', lines: ['Sit up straight', 'Eyes level with the screen', 'Keep food and drink away', 'Log off when you finish'] },
  doorPoster: { title: 'Computer room', band: '#14532d', lines: ['No food or drink', 'Report faults', 'Never share your password'] },
  shelfBottles: [],
  fumeBottle: null,
  sinks: false,
  benchRacks: false,
  reagentShelf: false,
  fumeCupboard: false,
  periodicTable: false,
  extras: (
    <group>
      {others.map((p) => <OtherPc key={`${p.x},${p.z}`} x={p.x} z={p.z} />)}
    </group>
  ),
};
export const OFFICE_VIEWS: CameraPresets = {
  screen: { target: [0, 0.3, -0.2], dist: 0.85, pitch: 0.06 },
  keyboard: { target: [0.1, 0.02, 0.12], dist: 0.6, pitch: 0.7 },
  printer: { target: [0.92, 0.1, -0.14], dist: 0.8, pitch: 0.35 },
};
export const VIEW_BUTTONS = [
  { id: 'bench', label: 'Whole bench' },
  { id: 'screen', label: 'Screen' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'printer', label: 'Printer' },
];

const W = 640;
const H = 400;
function lines(ctx: CanvasRenderingContext2D, x: number, y: number, list: string[], size = 15, step = 22) {
  ctx.fillStyle = '#0f172a';
  ctx.font = `${size}px Arial`;
  list.forEach((t, i) => ctx.fillText(t.slice(0, 70), x, y + i * step));
}
function drawSheet(ctx: CanvasRenderingContext2D, s: CompOfficeState) {
  const vals = coEvalAll(s.sheet.cells);
  ctx.font = '13px Arial';
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 8; c++) {
      const x = 30 + c * 76;
      const y = 44 + r * 22;
      const a = coAddr(c, r);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(x, y, 76, 22);
      ctx.fillStyle = s.sheet.cells[a]?.b ? '#1e3a8a' : '#0f172a';
      ctx.fillText(coShown(s.sheet, a, vals[a] ?? null).slice(0, 10), x + 3, y + 16);
    }
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 44, 28, 330);
}
/** What the monitor shows. */
function drawScreen(ctx: CanvasRenderingContext2D, s: CompOfficeState, v: CompOfficeVariant, app: CoApp, on: boolean) {
  ctx.fillStyle = on ? '#ffffff' : '#05070a';
  ctx.fillRect(0, 0, W, H);
  if (!on) return;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(0, 0, W, 32);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(coTaskTitle(v.task).slice(0, 48), 12, 22);
  if (app === 'sheet') drawSheet(ctx, s);
  else if (app === 'doc') lines(ctx, 40, 62, s.doc.paras.slice(0, 14).map((p) => p.text));
  else if (app === 'db') lines(ctx, 24, 62, [`Database: ${s.db.file || '(new)'}`, ...s.db.tables.map((t) => `Table ${t.name}: ${t.rows.length} records`), ...s.db.queries.map((q) => `Query ${q.name}`), ...s.db.reports.map((r) => `Report ${r.name}`)]);
  else if (app === 'deck') {
    const f = s.deck.slides[0];
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(40, 56, 560, 310);
    lines(ctx, 70, 110, [f?.title ?? '', '', ...(s.deck.slides.slice(1, 8).map((x, i) => `Slide ${i + 2}: ${x.title}`))], 18, 28);
  } else if (app === 'files') lines(ctx, 24, 62, s.fs.nodes.filter((n) => n.parent !== 'BIN').slice(0, 14).map((n) => `${n.kind === 'FILE' ? '   ' : ''}${n.name}`));
  else if (app === 'browser') lines(ctx, 24, 62, ['Offline practice browser', ...s.web.opened.slice(-8), ...s.web.searches.slice(-3).map((q) => `Search: ${q.q}`)]);
  else if (app === 'mail') lines(ctx, 24, 62, ['Inbox', ...s.mail.inbox.map((m) => m.subject), '', 'Sent', ...s.mail.sent.map((m) => m.subject)]);
  else lines(ctx, 24, 62, ['Cloud folder', ...s.cloud.uploads, ...s.cloud.shares.map((x) => `Shared with ${x.to}`)]);
}

function Monitor({ s, v, on }: { s: CompOfficeState; v: CompOfficeVariant; on: boolean }) {
  const { tex, ctx } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return { tex: t, ctx: canvas.getContext('2d')! };
  }, []);
  useEffect(() => {
    drawScreen(ctx, s, v, v.apps[0]!, on);
    tex.needsUpdate = true;
  }, [ctx, tex, s, v, on]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <>
      <mesh geometry={G.base} material={plastic} position={[0, 0.007, 0]} />
      <mesh geometry={G.neck} material={plastic} position={[0, 0.07, 0]} />
      <mesh geometry={G.frame} material={plastic} position={[0, 0.3, 0]} />
      <mesh position={[0, 0.3, 0.0165]}>
        <planeGeometry args={[0.54, 0.32]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </>
  );
}

export function OfficeScene({ s, v, on, collected, guided, onSlow }: { s: CompOfficeState; v: CompOfficeVariant; on: boolean; collected: Set<string>; guided: boolean; onSlow: () => void }) {
  return (
    <KitScene room={OFFICE_ROOM} coatOn gogglesOn presets={OFFICE_VIEWS} read={[STATION[0], STATION[1] + 0.3, STATION[2] - 0.18]} guided={guided} onSlow={onSlow} assistantSpot={[1.3, -1.25]}>
      <group position={STATION}>
        <Interactive id="monitor" label="Monitor" bench position={[...SPOT.monitor]} labelY={0.56}>
          <Monitor s={s} v={v} on={on} />
        </Interactive>
        <Interactive id="keyboard" label="Keyboard" bench position={[...SPOT.keyboard]}>
          <mesh geometry={G.kb} material={plastic} position={[0, 0.01, 0]} />
          <mesh geometry={G.key} material={keyMat} position={[0, 0.021, 0]} />
        </Interactive>
        <Interactive id="mouse" label="Mouse" bench position={[...SPOT.mouse]}>
          <mesh geometry={G.mouse} material={beige} position={[0, 0.012, 0]} />
        </Interactive>
        <Interactive id="tower" label="System unit" bench position={[...SPOT.tower]} labelY={0.42}>
          <mesh geometry={G.tower} material={beige} position={[0, 0.18, 0]} />
          <mesh geometry={G.lamp} material={on ? glow : off} position={[0, 0.31, 0.172]} />
        </Interactive>
        <Interactive id="ups" label="UPS" bench position={[...SPOT.ups]} labelY={0.24}>
          <mesh geometry={G.ups} material={plastic} position={[0, 0.085, 0]} />
          <mesh geometry={G.lamp} material={on ? glow : off} position={[0, 0.14, 0.132]} />
        </Interactive>
        <Interactive id="printer" label="Printer" bench position={[...SPOT.printer]} labelY={0.26}>
          <mesh geometry={G.printer} material={beige} position={[0, 0.085, 0]} />
          <mesh geometry={G.tray} material={mat.white()} position={[0, 0.176, -0.04]} />
        </Interactive>
        {collected.has('flash') && (
          <Interactive id="flash" label="Flash drive" bench position={[...SPOT.flash]}>
            <mesh geometry={G.flash} material={mat.red()} position={[0, 0.007, 0]} />
          </Interactive>
        )}
        {collected.has('paper') && (
          <Interactive id="paper" label="A4 paper" bench position={[...SPOT.paper]}>
            <mesh geometry={G.paper} material={mat.white()} position={[0, 0.016, 0]} />
          </Interactive>
        )}
      </group>
    </KitScene>
  );
}
