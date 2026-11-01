import {
  CAL_PLACES,
  FLOAT_CARD,
  SAND_CARD,
  calIndicated,
  floatReading,
  floatUpright,
  sbReading,
  type CalObj,
  type DensityAnswerId,
  type DensityTask,
  type PhyDensityState,
  type PhyDensityVariant,
} from '@aischool/shared';
import { Camera, Droplets, Lightbulb, Minus, Plus, Ruler, Scale, Thermometer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { canDeficit, densityHint, objName, TASK_NAME, useDensity, type Density } from './actions';
import { BalanceSvg, BottleSvg, DepthLoupe, EyeControl, MicrometerSvg, SpringScaleSvg, VernierSvg } from './instruments';

/** The question paper for each task. */
export function DensityTaskText({ task, v, sample }: { task: DensityTask | null; v: PhyDensityVariant; sample?: PhyDensityState['sample'] }) {
  if (task === 'ARCH')
    return (
      <>
        <p>You are provided with a spring balance (0–10 N), a stone tied with thread, a eureka can of water, a catch beaker, a beaker of salt solution, a beam balance and tissue paper.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Check the spring balance reads zero with nothing on it. Hang the stone from it and record its weight in air, W₁.</li>
          <li>Weigh the empty catch beaker, m₁. Fill the eureka can to the spout and let it stop dripping; put the beaker under the spout.</li>
          <li>Lower the stone until it is completely immersed, not touching the can. Record W₂. Weigh the beaker with the displaced water, m₂.</li>
          <li>Dry the stone and repeat in the salt solution: W₃.</li>
          <li>Find the upthrust W₁ − W₂ and the weight of water displaced, and compare them. Find the relative densities of the stone, W₁/(W₁ − W₂), and of the salt solution, (W₁ − W₃)/(W₁ − W₂). State two precautions.</li>
        </ol>
      </>
    );
  if (task === 'FLOAT')
    return (
      <>
        <p>You are provided with a flat-bottomed test tube with a paper scale inside, a tall cylinder of water, lead shot in 10 g scoops, vernier calipers and a beam balance.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Measure the external diameter D of the tube (correct for the zero error) and find its cross-sectional area A. Weigh the empty tube.</li>
          <li>Put 10 g of lead shot in the tube and float it upright in the water. Read the depth h immersed.</li>
          <li>Repeat with {FLOAT_CARD.slice(1).map((l) => `${l * 10}`).join(', ')} g of lead shot.</li>
          <li>Tabulate m and h. Plot h against m and find the slope and the intercept on the h-axis.</li>
          <li>Since ρA h = M + m, find ρ = 1/(A × slope) and the mass of the tube M = ρA × intercept. State two precautions.</li>
        </ol>
      </>
    );
  if (task === 'BOTTLE')
    return sample === 'grains' ? (
      <>
        <p>You are provided with a 50 cm³ density bottle with its stopper, a beam balance, water, dry sand, a dropper, tissue paper and a thermometer.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Read the room temperature. Weigh the clean, dry, empty bottle with its stopper: m₁.</li>
          <li>Put about {SAND_CARD} scoops of sand in it and weigh: m₂.</li>
          <li>Fill it up with water, tap out the air, stopper, wipe dry and weigh: m₃.</li>
          <li>Empty, rinse, fill with water only, stopper, wipe and weigh: m₄.</li>
          <li>RD of sand = (m₂ − m₁)/[(m₄ − m₁) − (m₃ − m₂)]. Find its density. State two precautions.</li>
        </ol>
      </>
    ) : (
      <>
        <p>You are provided with a 50 cm³ density bottle with its stopper, a beam balance, distilled water, {v.liquid}, a dropper, tissue paper and a thermometer.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Read the room temperature. Weigh the clean, dry, empty bottle with its stopper: m₁.</li>
          <li>Fill it completely with water, insert the stopper so the excess escapes through the capillary, wipe dry and weigh: m₂.</li>
          <li>Empty it, dry it thoroughly (or rinse it with a little {v.liquid}), fill with {v.liquid}, stopper, wipe and weigh: m₃.</li>
          <li>RD = (m₃ − m₁)/(m₂ − m₁). Find the density of the {v.liquid}. State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with vernier calipers, a micrometer screw gauge, a wooden cylinder, a ball bearing, a glass marble, a copper wire and a cloth.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Close the jaws of the vernier calipers and record its zero error, with its sign.</li>
        <li>Measure the diameter of the wooden cylinder at three different places. Find the mean and correct it for the zero error.</li>
        <li>Close the micrometer with the ratchet and record its zero error.</li>
        <li>Measure the diameter of the ball bearing in three different orientations, closing with the ratchet. Find the mean and correct it.</li>
        <li>Calculate the volume of the ball bearing, V = (4/3)πr³. State two precautions.</li>
      </ol>
    </>
  );
}

/** What the vernier or micrometer shows now (open: a few millimetres past the object). */
export function calShown(v: PhyDensityVariant, s: PhyDensityState): number | null {
  if (!s.tool) return null;
  const base = calIndicated(v, s.tool, s.held, s.pos, s.forced, s.inside);
  return s.closed ? base : base + (s.tool === 'V' ? 0.4 : 0.8);
}

const OBJECTS: Record<'CAL' | 'FLOAT', { obj: CalObj | null; inside?: boolean; label: string }[]> = {
  CAL: [
    { obj: null, label: 'Nothing (zero)' },
    { obj: 'cyl', label: 'Wooden cylinder' },
    { obj: 'ball', label: 'Ball bearing' },
    { obj: 'marble', label: 'Glass marble' },
    { obj: 'wire', label: 'Copper wire' },
  ],
  FLOAT: [
    { obj: null, label: 'Nothing (zero)' },
    { obj: 'tube', label: 'Tube (outside jaws)' },
    { obj: 'tube', inside: true, label: 'Tube (inside jaws)' },
  ],
};

/** The calipers: choose the instrument and the object, close, turn, read through the magnified scale. */
export function CalPanel({ o, s, say }: { o: Density; s: PhyDensityState; say: (m: string | null) => void }) {
  const float = s.task === 'FLOAT';
  const shown = calShown(o.v, s);
  return (
    <div className="space-y-3">
      <Step title="The instrument">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={s.tool === 'V' ? 'brand' : 'outline'} onClick={() => o.pickTool('V')} aria-pressed={s.tool === 'V'}>
            Vernier calipers
          </Button>
          {!float && (
            <Button size="sm" variant={s.tool === 'M' ? 'brand' : 'outline'} onClick={() => o.pickTool('M')} aria-pressed={s.tool === 'M'}>
              Micrometer screw gauge
            </Button>
          )}
        </div>
        {s.tool && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Between the jaws">
            {OBJECTS[float ? 'FLOAT' : 'CAL'].map((x) => (
              <Button key={x.label} size="sm" variant={s.held === x.obj && s.inside === !!x.inside ? 'brand' : 'outline'} onClick={() => say(o.hold(x.obj, x.inside))} aria-pressed={s.held === x.obj && s.inside === !!x.inside}>
                {x.label}
              </Button>
            ))}
          </div>
        )}
      </Step>
      {s.tool && shown !== null && (
        <Step title={`Reading: ${objName(s.held, s.inside)}${s.held ? ` · place ${s.pos + 1} of ${CAL_PLACES}` : ''}`}>
          <div className="flex flex-wrap gap-1.5">
            {s.tool === 'V' ? (
              <Button size="sm" variant={s.closed ? 'outline' : 'brand'} onClick={() => say(o.close('gentle'))} disabled={s.closed}>
                Close the jaws gently
              </Button>
            ) : (
              <>
                <Button size="sm" variant={s.closed && !s.forced ? 'outline' : 'brand'} onClick={() => say(o.close('ratchet'))}>
                  Turn the ratchet until it clicks
                </Button>
                <Button size="sm" variant="outline" onClick={() => say(o.close('thimble'))}>
                  Screw the thimble tight
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={o.open} disabled={!s.closed}>
              Open
            </Button>
            {s.held && (
              <Button size="sm" variant="outline" onClick={o.turn}>
                Turn it / move along
              </Button>
            )}
          </div>
          {s.tool === 'V' ? <VernierSvg reading={shown} eye={o.eye} closed={s.closed} label={s.held ? objName(s.held, s.inside) : undefined} /> : <MicrometerSvg reading={shown} eye={o.eye} closed={s.closed} label={s.held ? objName(s.held) : undefined} />}
          <EyeControl eye={o.eye} onEye={o.setEye} />
          <Button size="sm" variant="brand" onClick={() => say(o.takeCal())}>
            <Camera /> Take this reading ({s.cal.length})
          </Button>
        </Step>
      )}
    </div>
  );
}

/** Front view of the Archimedes bench: the spring balance on its stand, the stone, the eureka can with its spout and catch beaker, the salt solution. */
function ArchSvg({ s, v }: { s: PhyDensityState; v: PhyDensityVariant }) {
  const def = canDeficit(v, s);
  const inCan = s.hung && s.where === 'water';
  const inSalt = s.hung && s.where === 'salt';
  const stoneX = inSalt ? 220 : 120;
  const stoneY = !s.hung ? 0 : s.where === 'air' ? 120 : s.depth === 'part' ? 170 : s.depth === 'touch' ? 212 : 196;
  const canLevel = 168 + Math.min(30, def / 3) - (inCan ? (s.depth === 'part' ? 6 : 12) : 0);
  return (
    <svg viewBox="0 0 300 250" className="mx-auto w-full max-w-[420px] select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Spring balance ${s.hung ? `with the stone ${s.where === 'air' ? 'in air' : s.where === 'water' ? `in the eureka can (${s.depth})` : `in the salt solution (${s.depth})`}` : 'with nothing hanging'}${s.bubbles ? ', bubbles on the stone' : ''}; the eureka can ${def <= 0 ? 'full to the spout' : 'below the spout'}; the catch beaker ${s.catchUnder ? 'under the spout' : 'away'}${s.spill ? '; water spilt on the bench' : ''}`}>
      <rect x={14} y={10} width={6} height={225} fill="#94a3b8" />
      <rect x={14} y={14} width={inSalt ? 210 : 110} height={5} fill="#64748b" />
      <g transform={`translate(${stoneX - 9} 20)`}>
        <rect x={0} y={0} width={18} height={60} rx={4} fill="#e2e8f0" stroke="#64748b" />
        <line x1={9} y1={60} x2={9} y2={s.hung ? stoneY - 20 : 80} stroke="#64748b" strokeWidth={1.2} />
      </g>
      {s.hung && (
        <g>
          <line x1={stoneX} y1={100} x2={stoneX} y2={stoneY - 12} stroke="#d6c7a1" strokeWidth={1} />
          <path d={`M${stoneX - 16} ${stoneY} q4 -14 16 -13 q14 0 16 12 q-2 12 -16 12 q-14 0 -16 -11 Z`} fill="#8d8f93" stroke="#45474b" />
          {s.bubbles && [[-8, -4], [6, 2], [10, -6]].map(([dx, dy], i) => <circle key={i} cx={stoneX + dx!} cy={stoneY + dy!} r={2} fill="#fff" stroke="#90a4ae" strokeWidth={0.5} />)}
        </g>
      )}
      {/* eureka can and spout */}
      <path d="M90 140 V232 H150 V140" fill="#e3f2fd" fillOpacity={0.5} stroke="#7aa6c2" />
      <rect x={91} y={canLevel} width={58} height={231 - canLevel} fill="#4fa3d9" opacity={0.45} />
      <path d="M150 160 L178 172" stroke="#7aa6c2" strokeWidth={4} />
      {s.catchUnder && (
        <g>
          <path d="M168 186 L170 232 H198 L200 186" fill="#e3f2fd" fillOpacity={0.6} stroke="#7aa6c2" />
          {s.caught > 0 && <rect x={170} y={232 - Math.min(40, s.caught / 7)} width={28} height={Math.min(40, s.caught / 7)} fill="#4fa3d9" opacity={0.5} />}
        </g>
      )}
      {/* salt solution */}
      <path d="M196 170 V232 H248 V170" fill="#fff8e1" fillOpacity={0.5} stroke="#bca86a" />
      <rect x={197} y={inSalt ? 178 : 186} width={50} height={inSalt ? 53 : 45} fill="#d7ccc8" opacity={0.6} />
      <text x={222} y={244} textAnchor="middle" fontSize="8" fill="#555">
        salt solution
      </text>
      <text x={120} y={244} textAnchor="middle" fontSize="8" fill="#555">
        eureka can
      </text>
      {s.spill && <ellipse cx={180} cy={236} rx={26} ry={3} fill="#4fa3d9" opacity={0.6} />}
      <rect x={0} y={234} width={300} height={16} fill="#8d6e63" opacity={0.25} />
    </svg>
  );
}

/** The cylinder of water with the loaded tube floating in it (or not yet). */
function FloatSvg({ s, v }: { s: PhyDensityState; v: PhyDensityVariant }) {
  const k = 9; // px per cm
  const water = 70;
  const h = s.floating ? (s.sunk ? 21 : floatReading(v, s.load, s.touching)) : 0;
  const upright = floatUpright(s.load);
  const x = s.touching ? 118 : 135;
  return (
    <svg viewBox="0 0 270 270" className="mx-auto h-[min(270px,46vh)] w-auto select-none rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`Tall cylinder of water; the tube with ${s.load * 10} g of lead shot ${s.floating ? (s.sunk ? 'has sunk' : upright ? `floats upright${s.touching ? ', touching the side' : ''}` : 'floats on its side (it needs lead shot)') : 'is on the bench'}`}>
      <rect x={100} y={30} width={70} height={230} rx={4} fill="#e3f2fd" fillOpacity={0.45} stroke="#7aa6c2" />
      <rect x={102} y={water} width={66} height={188} fill="#4fa3d9" opacity={0.35} />
      {s.floating ? (
        s.sunk ? (
          <rect x={128} y={258 - 20 * k} width={14} height={20 * k} rx={6} fill="#f4fbff" fillOpacity={0.7} stroke="#7aa6c2" transform="rotate(8 135 240)" />
        ) : upright ? (
          <g>
            <rect x={x - 8} y={water + h * k - 20 * k} width={16} height={20 * k} rx={7} fill="#f4fbff" fillOpacity={0.8} stroke="#7aa6c2" />
            <rect x={x - 3} y={water + h * k - 19 * k} width={6} height={19 * k} fill="#fffef5" opacity={0.9} />
            {Array.from({ length: s.load }, (_, i) => <circle key={i} cx={x - 5 + (i % 4) * 3.4} cy={water + h * k - 4 - Math.floor(i / 4) * 3.2} r={1.8} fill="#455a64" />)}
          </g>
        ) : (
          <rect x={108} y={water - 8} width={20 * k * 0.3} height={14} rx={6} fill="#f4fbff" stroke="#7aa6c2" />
        )
      ) : (
        <g>
          <rect x={20} y={70} width={16} height={180} rx={7} fill="#f4fbff" fillOpacity={0.8} stroke="#7aa6c2" />
          {Array.from({ length: s.load }, (_, i) => <circle key={i} cx={23 + (i % 4) * 3.4} cy={244 - Math.floor(i / 4) * 3.2} r={1.8} fill="#455a64" />)}
        </g>
      )}
      <text x={135} y={22} textAnchor="middle" fontSize="9" fill="#334155">
        {s.load * 10} g of lead shot
      </text>
    </svg>
  );
}

/** A thermometer read at eye level: the room temperature (0.5 °C divisions). */
export function ThermoSvg({ t }: { t: number }) {
  const Y = (c: number) => 200 - (c - 20) * 12;
  return (
    <svg viewBox="0 0 90 220" className="h-[200px] w-[80px] select-none rounded-xl border border-border bg-white" role="img" aria-label="Thermometer scale from 20 to 35 °C (0.5 °C divisions)">
      <rect x={36} y={12} width={10} height={196} rx={5} fill="#f8fafc" stroke="#94a3b8" />
      <rect x={39} y={Y(t)} width={4} height={204 - Y(t)} fill="#d32f2f" />
      {Array.from({ length: 31 }, (_, i) => 20 + i * 0.5).map((c) => (
        <g key={c}>
          <line x1={46} x2={46 + (c % 1 === 0 ? (c % 5 === 0 ? 14 : 9) : 5)} y1={Y(c)} y2={Y(c)} stroke={INK2} strokeWidth={c % 5 === 0 ? 1.1 : 0.6} />
          {c % 5 === 0 && (
            <text x={64} y={Y(c) + 3} fontSize="9" fontWeight="700" fill={INK2}>
              {c}
            </text>
          )}
        </g>
      ))}
      <text x={20} y={110} fontSize="8" fill="#555" transform="rotate(-90 20 110)">
        °C
      </text>
    </svg>
  );
}
const INK2 = '#222';

/** The beam balance: pan, beams, riders and record. */
export function BalancePanel({ o, s, items, say }: { o: Density; s: PhyDensityState; items: { id: 'beaker' | 'tube' | 'bottle'; label: string }[]; say: (m: string | null) => void }) {
  const r = o.riders;
  const n = (w: 'h' | 't' | 'f', d: number, label: string) => (
    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => o.nudgeRider(w, d)} aria-label={label}>
      {d > 0 ? '+' : '−'}
      {w === 'h' ? '100' : w === 't' ? '10' : Math.abs(d)}
    </Button>
  );
  return (
    <Step title="The beam balance">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-muted-foreground">On the pan:</span>
        <Button size="sm" variant={o.pan === null ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => say(o.setPan(null))}>
          Nothing
        </Button>
        {items.map((it) => (
          <Button key={it.id} size="sm" variant={o.pan === it.id ? 'brand' : 'outline'} className="h-7 px-2" onClick={() => say(o.setPan(it.id))} aria-pressed={o.pan === it.id}>
            {it.label}
          </Button>
        ))}
      </div>
      <BalanceSvg item={o.pan} mass={o.panMass()} riders={r} />
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
        <span className="w-14 text-muted-foreground">Riders</span>
        {n('h', -1, 'Hundreds rider back one notch')}
        {n('h', 1, 'Hundreds rider on one notch')}
        {n('t', -1, 'Tens rider back one notch')}
        {n('t', 1, 'Tens rider on one notch')}
        {n('f', -1, 'Front rider back 1 g')}
        {n('f', -0.1, 'Front rider back 0.1 g')}
        {n('f', 0.1, 'Front rider on 0.1 g')}
        {n('f', 1, 'Front rider on 1 g')}
      </div>
      <input type="range" min={0} max={10} step={0.1} value={r.f} onChange={(e) => o.setRiders({ ...r, f: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" aria-label="Front rider (0 to 10 g)" />
      <Button size="sm" variant="brand" onClick={() => say(o.weigh())} disabled={!o.pan}>
        <Scale /> Record this weighing ({s.weighs.length})
      </Button>
      <p className="text-[11.5px] text-muted-foreground">Slide the riders until the pointer rests on zero, then add up the three beams (to 0.1 g) and write it in your table.</p>
    </Step>
  );
}

function ArchPanel({ o, s, say }: { o: Density; s: PhyDensityState; say: (m: string | null) => void }) {
  return (
    <div className="space-y-3">
      <ArchSvg s={s} v={o.v} />
      <Step title="1. The spring balance">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={s.zeroed ? 'outline' : 'brand'} onClick={() => say(o.zeroBalance())}>
            Check and adjust the zero
          </Button>
          {s.hung ? (
            <Button size="sm" variant="outline" onClick={() => say(o.unhang())}>
              Take the stone off
            </Button>
          ) : (
            <Button size="sm" variant="brand" onClick={o.hang}>
              Hang the stone
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SpringScaleSvg reading={s.hung ? sbReading(o.v, { where: s.where, depth: s.depth, bubbles: s.bubbles && s.where !== 'air', zeroed: s.zeroed }) : s.zeroed ? 0 : o.v.sbZero} eye={o.eye} />
          <div className="space-y-2">
            <EyeControl eye={o.eye} onEye={o.setEye} vertical />
            <Button size="sm" variant="brand" onClick={() => say(o.takeSb())}>
              <Camera /> Take this reading ({s.sb.length})
            </Button>
          </div>
        </div>
      </Step>
      <Step title="2. The eureka can and the liquids">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => say(o.fillCan())}>
            Fill the can to the spout (let it stop dripping)
          </Button>
          <Button size="sm" variant="outline" onClick={() => o.placeCatch(!s.catchUnder)}>
            {s.catchUnder ? 'Take the beaker from the spout' : 'Put the catch beaker under the spout'}
          </Button>
          <Button size="sm" variant="outline" onClick={o.emptyCatch} disabled={s.caught === 0}>
            Empty and dry the beaker
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => say(o.lower('water', 'part'))}>
            Lower half into the can
          </Button>
          <Button size="sm" variant="brand" onClick={() => say(o.lower('water', 'full'))}>
            Fully into the can, hanging free
          </Button>
          <Button size="sm" variant="outline" onClick={() => say(o.lower('water', 'touch'))}>
            Let it rest on the bottom
          </Button>
          <Button size="sm" variant="brand" onClick={() => say(o.lower('salt', 'full'))}>
            Fully into the salt solution
          </Button>
          <Button size="sm" variant="outline" onClick={() => say(o.lower('salt', 'touch'))}>
            Rest it on the beaker
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={o.raise} disabled={s.where === 'air'}>
            Raise it out
          </Button>
          <Button size="sm" variant="outline" onClick={o.shake} disabled={!s.bubbles || s.where === 'air'}>
            Shake off the bubbles
          </Button>
          <Button size="sm" variant="outline" onClick={() => say(o.dryStone())} disabled={!s.wet}>
            Dry the stone with tissue
          </Button>
          {s.spill && (
            <Button size="sm" variant="outline" onClick={o.wipeSpill}>
              Wipe up the spill
            </Button>
          )}
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          Stone: {s.hung ? (s.where === 'air' ? 'in air' : `${s.depth === 'part' ? 'half' : s.depth === 'touch' ? 'resting on the bottom' : 'fully'} in the ${s.where === 'water' ? 'can' : 'salt solution'}`) : 'not hung'}
          {s.bubbles && s.where !== 'air' ? ' · bubbles cling to it' : ''}
          {s.wet && s.where === 'air' ? ' · wet' : ''} · can {canDeficit(o.v, s) <= 0 ? 'full to the spout' : 'below the spout'}
        </p>
      </Step>
      <BalancePanel o={o} s={s} items={[{ id: 'beaker', label: 'Catch beaker' }]} say={say} />
    </div>
  );
}

function FloatPanel({ o, s, say }: { o: Density; s: PhyDensityState; say: (m: string | null) => void }) {
  const h = floatReading(o.v, s.load, s.touching);
  return (
    <div className="space-y-3">
      <CalPanel o={o} s={s} say={say} />
      <BalancePanel o={o} s={s} items={[{ id: 'tube', label: 'Empty tube' }]} say={say} />
      <Step title="The tube in the water">
        <div className="flex flex-wrap items-start justify-center gap-3">
          <FloatSvg s={s} v={o.v} />
          {s.floating && !s.sunk && floatUpright(s.load) && <DepthLoupe h={h} meniscus={o.v.meniscus} eye={o.eye} touching={s.touching} />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={o.removeShot} disabled={s.load === 0} aria-label="Take out 10 g of lead shot">
            <Minus /> 10 g
          </Button>
          <span className="min-w-[56px] text-center text-[12.5px] font-semibold tabular">{s.load * 10} g</span>
          <Button size="sm" variant="outline" onClick={() => say(o.addShot())} aria-label="Add 10 g of lead shot">
            <Plus /> 10 g
          </Button>
          {s.floating ? (
            <Button size="sm" variant="outline" onClick={o.liftTube}>
              Lift the tube out
            </Button>
          ) : (
            <Button size="sm" variant="brand" onClick={() => say(o.floatTube())}>
              Float the tube
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={o.centre} disabled={!s.touching}>
            Free it from the side
          </Button>
        </div>
        {s.floating && <EyeControl eye={o.eye} onEye={o.setEye} vertical />}
        <Button size="sm" variant="brand" onClick={() => say(o.takeDepth())}>
          <Camera /> Take this depth ({s.depths.length})
        </Button>
      </Step>
    </div>
  );
}

function BottlePanel({ o, s, say }: { o: Density; s: PhyDensityState; say: (m: string | null) => void }) {
  const b = s.bottle;
  const grains = s.sample === 'grains';
  return (
    <div className="space-y-3">
      {!s.weighs.length && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sample">
          {(['liquid', 'grains'] as const).map((x) => (
            <Button key={x} size="sm" variant={s.sample === x ? 'brand' : 'outline'} onClick={() => o.setSample(x)} aria-pressed={s.sample === x}>
              {x === 'liquid' ? `A liquid (${o.v.liquid})` : 'Solid grains (sand)'}
            </Button>
          ))}
        </div>
      )}
      <Step title="The density bottle">
        <div className="flex flex-wrap items-start gap-3">
          <BottleSvg b={b} brim={s.brim} stoppered={s.stoppered} liquidColour={o.v.liquid === 'palm oil' ? '#e76f51' : '#e9c46a'} />
          <div className="flex max-w-[260px] flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => say(o.fill('water'))}>
              <Droplets /> Fill with water
            </Button>
            {!grains && (
              <Button size="sm" variant="outline" onClick={() => say(o.fill('liquid'))}>
                Fill with {o.v.liquid}
              </Button>
            )}
            {grains && (
              <Button size="sm" variant="outline" onClick={() => say(o.addSand())}>
                Add a scoop of sand ({b.sand})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => say(o.topUp())}>
              Top up to the brim (dropper)
            </Button>
            <Button size="sm" variant="outline" onClick={o.tap} disabled={!b.bubble}>
              Tap out the air bubble
            </Button>
            {s.stoppered ? (
              <Button size="sm" variant="outline" onClick={o.unstopper}>
                Take the stopper out
              </Button>
            ) : (
              <Button size="sm" variant="brand" onClick={o.stopper}>
                Insert the stopper
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={o.wipe} disabled={!b.outsideWet}>
              Wipe the outside dry
            </Button>
            <Button size="sm" variant="outline" onClick={o.empty} disabled={b.fill === 'none' && !b.sand}>
              Empty it
            </Button>
            <Button size="sm" variant="outline" onClick={() => say(o.dry())}>
              Dry it inside
            </Button>
            {!grains && (
              <Button size="sm" variant="outline" onClick={() => say(o.rinse())}>
                Rinse with a little {o.v.liquid}
              </Button>
            )}
          </div>
        </div>
      </Step>
      <Step title="The thermometer">
        <div className="flex items-end gap-3">
          {s.tempRead ? <ThermoSvg t={o.v.tempC} /> : null}
          <Button size="sm" variant={s.tempRead ? 'outline' : 'brand'} onClick={o.readTemp}>
            <Thermometer /> {s.tempRead ? 'Read again' : 'Read the room temperature'}
          </Button>
        </div>
      </Step>
      <BalancePanel o={o} s={s} items={[{ id: 'bottle', label: 'Density bottle' }]} say={say} />
    </div>
  );
}

export default function PhyDensityLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-density'>) {
  const o = useDensity({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { task } = o;
  const [msg, setMsg] = useState<string | null>(null);
  const say = (m: string | null) => setMsg(m);
  return (
    <div className="space-y-4">
      <TaskCard icon={<Ruler className="size-4 text-muted-foreground" aria-hidden />}>
        <DensityTaskText task={state.task} v={o.v} sample={state.sample} />
        {!readOnly && state.log.filter((e) => !e.a.startsWith('task')).length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['CAL', 'ARCH', 'FLOAT', 'BOTTLE'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {TASK_NAME[t]}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Scale className="size-4 text-muted-foreground" aria-hidden /> {state.task ? TASK_NAME[task] : 'The apparatus'}
            </h3>
            {state.task === 'ARCH' && <Badge variant="outline">room {o.v.tempC.toFixed(0)} °C</Badge>}
          </div>
          {!readOnly && mode === 'LAB' && state.task && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {densityHint(state, o.pan)}
            </p>
          )}
          {!state.task ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">Choose the experiment above.</p>
          ) : readOnly ? (
            <p className="text-[13px] text-muted-foreground">The apparatus is put away: your record is on the right.</p>
          ) : task === 'CAL' ? (
            <CalPanel o={o} s={state} say={say} />
          ) : task === 'ARCH' ? (
            <ArchPanel o={o} s={state} say={say} />
          ) : task === 'FLOAT' ? (
            <FloatPanel o={o} s={state} say={say} />
          ) : (
            <BottlePanel o={o} s={state} say={say} />
          )}
          {msg && <p className="mt-2 text-[12px] text-warning">{msg}</p>}
        </Card>
        <Notebook task={task} state={state} readOnly={readOnly} o={o} />
      </div>
    </div>
  );
}

/** One row of fixed cells with headings. */
function CellRow({ ids, heads, s, readOnly, set, label }: { ids: string[]; heads: string[]; s: PhyDensityState; readOnly: boolean; set: (id: string, x: string) => void; label?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            {label !== undefined && <th className="px-1 py-1 font-medium" />}
            {heads.map((h) => (
              <th key={h} className="px-1 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            {label !== undefined && <td className="px-1 py-1.5 text-[12px] font-medium">{label}</td>}
            {ids.map((id, i) => (
              <td key={id} className="px-1 py-1.5">
                <Cell value={s.cells[id] ?? ''} onChange={(x) => set(id, x)} readOnly={readOnly} label={`${label ? `${label}: ` : ''}${heads[i]}`} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** The readings taken, without their values (the values are for you to read). */
function TakenList({ s }: { s: PhyDensityState }) {
  const items: string[] =
    s.task === 'CAL' || (s.task === 'FLOAT' && s.depths.length === 0)
      ? s.cal.map((r) => `${r.tool === 'V' ? 'vernier' : 'micrometer'}: ${objName(r.obj, r.inside)}${r.obj ? ` (place ${r.pos + 1})` : ''}`)
      : s.task === 'ARCH'
        ? s.sb.map((r) => `balance: stone in ${r.where}${r.where !== 'air' ? ` (${r.depth})` : ''}`)
        : s.task === 'FLOAT'
          ? s.depths.map((d) => `depth with ${d.load * 10} g`)
          : [];
  const w = s.weighs.map((x) => `weighed ${x.item}`);
  const all = [...items, ...w];
  if (!all.length) return null;
  return (
    <div className="mb-3 rounded-xl border border-border p-2 text-[12px]">
      <p className="mb-1 font-semibold">Readings taken ({all.length})</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        {all.slice(-14).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function Notebook({ task, state: s, readOnly, o }: { task: DensityTask; state: PhyDensityState; readOnly: boolean; o: Pick<Density, 'update' | 'removeRow' | 'setCell'> }) {
  const setAnswer = (id: DensityAnswerId, key: 'value' | 'unit', value: string) => o.update((x) => ({ ...x, answers: { ...x.answers, [id]: { ...x.answers[id], [key]: value } } }));
  const A = (id: DensityAnswerId, label: string, noUnit?: boolean) => <AnswerRow key={id} id={id} label={label} answer={s.answers[id]} onChange={(k, x) => setAnswer(id, k, x)} readOnly={readOnly} unitHint="unit" noUnit={noUnit} />;
  const set = o.setCell;
  let body: ReactNode = null;
  if (task === 'CAL')
    body = (
      <>
        <p className="mb-1 text-[12.5px] font-semibold">Vernier calipers: the wooden cylinder</p>
        <CellRow ids={['zv', 'c1', 'c2', 'c3', 'cm']} heads={['zero error / cm', 'd₁ / cm', 'd₂ / cm', 'd₃ / cm', 'mean / cm']} s={s} readOnly={readOnly} set={set} />
        <p className="mb-1 mt-3 text-[12.5px] font-semibold">Micrometer screw gauge: the ball bearing</p>
        <CellRow ids={['zm', 'b1', 'b2', 'b3', 'bm']} heads={['zero error / mm', 'd₁ / mm', 'd₂ / mm', 'd₃ / mm', 'mean / mm']} s={s} readOnly={readOnly} set={set} />
        <p className="mt-1 text-[11.5px] text-muted-foreground">Vernier to 0.01 cm; micrometer to 0.01 mm. A zero error below zero is negative (e.g. −0.03).</p>
        <div className="mt-5 space-y-3">
          <p className="text-[12.5px] font-semibold">Calculations</p>
          {A('dcyl', '(i) Corrected diameter of the cylinder (mean − zero error)')}
          {A('dball', '(ii) Corrected diameter of the ball bearing')}
          {A('vol', '(iii) Volume of the ball bearing, V = (4/3)πr³')}
        </div>
      </>
    );
  else if (task === 'ARCH')
    body = (
      <>
        <CellRow ids={['w1', 'w2', 'w3']} heads={['W₁ (air) / N', 'W₂ (water) / N', 'W₃ (salt soln) / N']} s={s} readOnly={readOnly} set={set} />
        <div className="mt-2" />
        <CellRow ids={['mb', 'mbw']} heads={['beaker m₁ / g', 'beaker + water m₂ / g']} s={s} readOnly={readOnly} set={set} />
        <div className="mt-5 space-y-3">
          <p className="text-[12.5px] font-semibold">Calculations</p>
          {A('up', '(i) Upthrust in water, W₁ − W₂')}
          {A('wdisp', '(ii) Weight of water displaced, (m₂ − m₁)g')}
          {A('rds', '(iii) Relative density of the stone, W₁/(W₁ − W₂)', true)}
          {A('rdl', '(iv) Relative density of the salt solution, (W₁ − W₃)/(W₁ − W₂)', true)}
        </div>
      </>
    );
  else if (task === 'FLOAT') {
    const points = numericPoints(s.float.map((r) => [r.m, r.h]));
    body = (
      <>
        <CellRow ids={['D', 'mt']} heads={['external D / cm', 'empty tube / g']} s={s} readOnly={readOnly} set={set} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[260px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-muted-foreground">
                <th className="px-1 py-1 font-medium">m / g</th>
                <th className="px-1 py-1 font-medium">h / cm</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-muted-foreground">
                    A row appears when you take the first depth for a load.
                  </td>
                </tr>
              )}
              {s.rows.map((load, i) => (
                <tr key={i} className="border-t border-border">
                  {(['m', 'h'] as const).map((c) => (
                    <td key={c} className="px-1 py-1.5">
                      <Cell value={s.float[i]?.[c] ?? ''} onChange={(x) => o.update((y) => ({ ...y, float: y.float.map((r, k) => (k === i ? { ...r, [c]: x } : r)) }))} readOnly={readOnly} label={`${load * 10} g load: ${c}`} />
                    </td>
                  ))}
                  <td>
                    {!readOnly && (
                      <Button size="icon-sm" variant="ghost" onClick={() => o.removeRow(i)} aria-label={`Delete row ${i + 1} and its depths`}>
                        ×
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11.5px] text-muted-foreground">h to 0.1 cm, read at the flat water surface.</p>
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold">Graph of h against m</p>
          <PhyGraph points={points} line={s.line} onLine={(line) => o.update((x) => ({ ...x, line }))} readOnly={readOnly} xLabel="m / g" yLabel="h / cm" />
        </div>
        <div className="mt-5 space-y-3">
          <p className="text-[12.5px] font-semibold">Calculations</p>
          {A('area', '(i) Cross-sectional area A = πD²/4')}
          {A('slope', '(ii) Slope of the graph of h against m')}
          {A('rho', '(iii) Density of water ρ = 1/(A × slope)')}
          {A('mtube', '(iv) Mass of the tube = ρA × intercept')}
        </div>
      </>
    );
  } else {
    const grains = s.sample === 'grains';
    body = (
      <>
        <CellRow ids={grains ? ['m1', 'm2', 'm3', 'm4'] : ['m1', 'm2', 'm3']} heads={grains ? ['m₁ empty / g', 'm₂ + sand / g', 'm₃ sand + water / g', 'm₄ water / g'] : ['m₁ empty / g', 'm₂ water / g', 'm₃ liquid / g']} s={s} readOnly={readOnly} set={set} />
        <div className="mt-2" />
        <CellRow ids={['T']} heads={['room temperature / °C']} s={s} readOnly={readOnly} set={set} />
        <div className="mt-5 space-y-3">
          <p className="text-[12.5px] font-semibold">Calculations</p>
          {A('mw', grains ? '(i) Mass of water of the same volume as the sand, (m₄ − m₁) − (m₃ − m₂)' : '(i) Mass of water, m₂ − m₁')}
          {A('ml', grains ? '(ii) Mass of sand, m₂ − m₁' : '(ii) Mass of liquid, m₃ − m₁')}
          {A('rd', '(iii) Relative density', true)}
          {A('rho', '(iv) Density')}
        </div>
      </>
    );
  }
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <TakenList s={s} />
      {body}
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="density-precautions">
          Two precautions you took
        </label>
        <Textarea id="density-precautions" value={s.written.precautions} onChange={(e) => o.update((x) => ({ ...x, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} className={cn()} />
      </div>
    </Card>
  );
}
