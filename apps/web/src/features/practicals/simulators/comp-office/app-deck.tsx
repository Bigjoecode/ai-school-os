import { CO_ANIMS, CO_THEMES, CO_TRANSITIONS, coAddSlide, coApplyAll, coEditSlide, coPrintHandouts, coRunShow, type CoDeck, type CoSlide } from '@aischool/shared';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { Lbl, Modal, Pri, Sec, Tabs, Tb, Tools, inputCls } from './ui';

/** A slide editor: thumbnails, layouts, objects, themes, transitions with timings, animation, the slide master, a working slide show and handouts. */

type Tab = 'home' | 'insert' | 'design' | 'show' | 'file';
const THEME: Record<string, { bg: string; ink: string; band: string }> = { Plain: { bg: '#ffffff', ink: '#111827', band: '#e5e7eb' }, Ocean: { bg: '#e0f2fe', ink: '#0c4a6e', band: '#0284c7' }, Forest: { bg: '#ecfccb', ink: '#14532d', band: '#16a34a' }, Sunset: { bg: '#ffedd5', ink: '#7c2d12', band: '#ea580c' } };

function SlideFace({ s, d, n, big, reveal = 99 }: { s: CoSlide; d: CoDeck; n: number; big?: boolean; reveal?: number }) {
  const t = THEME[d.theme] ?? THEME.Plain!;
  const lines = s.body.split('\n').filter(Boolean);
  return (
    <div className="relative flex aspect-[4/3] w-full flex-col overflow-hidden rounded-sm" style={{ background: t.bg, color: t.ink, fontSize: big ? 'clamp(12px,2.6vw,20px)' : 6 }}>
      <div className="h-[4%]" style={{ background: t.band }} />
      <div className={cn('min-h-0 flex-1 p-[5%]', s.layout === 'TITLE' && 'flex flex-col items-center justify-center text-center')}>
        <p className="font-bold leading-tight" style={{ fontFamily: d.master.titleFont, color: d.master.used ? d.master.titleColor : t.ink, fontSize: s.layout === 'TITLE' ? '1.9em' : '1.4em' }}>{s.title || (big ? '' : ' ')}</p>
        {s.layout === 'TITLE' ? (
          <p className="mt-[3%]">{s.body}</p>
        ) : (
          <ul className="mt-[3%] list-disc space-y-[1%] pl-[6%]">
            {lines.slice(0, s.anim === 'NONE' ? 99 : reveal).map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        <div className="mt-[3%] flex flex-wrap items-end gap-[3%]">
          {s.pic && <div role="img" aria-label="Picture" className="aspect-[4/3] w-[32%] rounded bg-sky-300" style={{ background: 'linear-gradient(#7dd3fc 60%, #65a30d 60%)' }} />}
          {s.chart && (
            <div role="img" aria-label="Chart" className="flex aspect-[4/3] w-[36%] items-end gap-[6%] rounded border border-black/20 bg-white/70 p-[2%]">
              {[40, 70, 55, 90].map((h) => <span key={h} className="flex-1" style={{ height: `${h}%`, background: t.band }} />)}
            </div>
          )}
          {s.table && <div role="img" aria-label="Table" className="grid aspect-[4/3] w-[32%] grid-cols-3 border border-black/40 bg-white/70 [&>i]:border [&>i]:border-black/20">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>}
          {s.shape && <div role="img" aria-label="Shape" className="flex w-[34%] items-center gap-[4%]">{[0, 1, 2].map((i) => <span key={i} className="aspect-square flex-1 rounded-full" style={{ background: t.band }} />)}</div>}
        </div>
      </div>
      {d.master.logo && <div className="absolute bottom-[3%] right-[3%] grid aspect-square w-[9%] place-items-center rounded-full bg-blue-700 text-white" style={{ fontSize: '0.5em' }}>Logo</div>}
      {d.master.footer && <p className="absolute bottom-[3%] left-[4%]" style={{ fontSize: '0.55em' }}>{d.master.footer}</p>}
      {!big && <span className="absolute left-0.5 top-0.5 text-[7px] text-black/60">{n}</span>}
    </div>
  );
}

export function DeckApp({ o }: { o: Office }) {
  const d = o.s.deck;
  const ro = o.readOnly;
  const set = (fn: (x: CoDeck) => CoDeck, log?: string) => o.set('deck', fn, log);
  const [tab, setTab] = useState<Tab>('home');
  const [at, setAt] = useState(0);
  const [show, setShow] = useState<{ i: number; reveal: number; fromStart: boolean } | null>(null);
  const [dialog, setDialog] = useState<null | 'save' | 'hand' | 'master'>(null);
  const [name, setName] = useState(d.saved || 'Presentation1.pptx');
  const [hand, setHand] = useState(3);
  const [seen, setSeen] = useState(1);
  const cur = d.slides[Math.min(at, d.slides.length - 1)];
  const i = Math.min(at, d.slides.length - 1);
  const edit = (patch: Partial<CoSlide>, log?: string) => set((x) => coEditSlide(x, i, patch), log);
  const outline = o.v.outline ?? [];
  const nextOutline = outline.find((x) => !d.slides.some((s) => s.title.toLowerCase() === x.title.toLowerCase()));
  useEffect(() => {
    if (!show) return;
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') endShow(true);
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') step();
      else if (e.key === 'ArrowLeft') setShow((x) => x && { ...x, i: Math.max(0, x.i - 1), reveal: 1 });
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  const step = () =>
    setShow((x) => {
      if (!x) return x;
      const s = d.slides[x.i];
      const n = s && s.anim !== 'NONE' ? s.body.split('\n').filter(Boolean).length : 0;
      if (s && x.reveal < n) return { ...x, reveal: x.reveal + 1 };
      if (x.i + 1 >= d.slides.length) return x;
      setSeen((k) => Math.max(k, x.i + 2));
      return { ...x, i: x.i + 1, reveal: 1 };
    });
  // A timed slide advances by itself (speeded up here so the rehearsal doesn't take minutes).
  useEffect(() => {
    if (!show) return;
    const adv = d.slides[show.i]?.advance ?? 0;
    if (!adv) return;
    const t = setTimeout(step, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.i, show?.reveal]);
  const startShow = (fromStart: boolean) => {
    setSeen(fromStart ? 1 : i + 1);
    setShow({ i: fromStart ? 0 : i, reveal: 1, fromStart });
  };
  function endShow(escaped: boolean) {
    const s = show;
    setShow(null);
    if (s) set((x) => coRunShow(x, s.fromStart ? seen : 0, escaped, s.fromStart), 'deck:show');
  }
  if (d.closed)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-slate-800">
        <p className="text-[13px]">Recent: {d.saved}</p>
        <Pri aria-label="Open presentation" disabled={ro} onClick={() => set((x) => ({ ...x, closed: false, reopened: x.reopened + 1 }), 'deck:reopen')}>Open</Pri>
      </div>
    );
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-slate-900" onKeyDown={(e) => e.stopPropagation()}>
      {!ro && <Tabs<Tab> tabs={[{ id: 'home', label: 'Home' }, { id: 'insert', label: 'Insert' }, { id: 'design', label: 'Design' }, { id: 'show', label: 'Transitions and show' }, { id: 'file', label: 'File' }]} value={tab} onChange={setTab} />}
      {!ro && tab === 'home' && (
        <Tools>
          <Tb aria-label="New slide" onClick={() => (set((x) => coAddSlide(x), 'deck:new'), setAt(d.slides.length))}>New Slide</Tb>
          {outline.length > 0 && <Tb aria-label="Paste from outline" disabled={!nextOutline} onClick={() => { if (nextOutline) { set((x) => coAddSlide(x, nextOutline.title, nextOutline.body), 'deck:outline'); setAt(d.slides.length); } }}>Paste from outline{nextOutline ? `: ${nextOutline.title}` : ''}</Tb>}
          <select aria-label="Slide layout" className="h-8 rounded border border-slate-200 text-[12px]" value={cur?.layout} onChange={(e) => edit({ layout: e.target.value as CoSlide['layout'] }, 'deck:layout')}>
            <option value="TITLE">Title Slide</option><option value="CONTENT">Title and Content</option>
          </select>
          <Tb aria-label="Delete slide" disabled={d.slides.length < 2} onClick={() => (set((x) => ({ ...x, slides: x.slides.filter((_, k) => k !== i) }), 'deck:del'), setAt(Math.max(0, i - 1)))}>Delete slide</Tb>
        </Tools>
      )}
      {!ro && tab === 'insert' && (
        <Tools>
          {(['pic', 'chart', 'table', 'shape'] as const).map((k) => (
            <Tb key={k} aria-label={`Insert ${k}`} on={!!cur?.[k]} onClick={() => edit({ [k]: !cur?.[k] }, `deck:${k}`)}>{k === 'pic' ? 'Picture' : k === 'chart' ? 'Chart' : k === 'table' ? 'Table' : 'Shape diagram'}</Tb>
          ))}
        </Tools>
      )}
      {!ro && tab === 'design' && (
        <Tools>
          {CO_THEMES.map((t) => <Tb key={t} aria-label={`Theme ${t}`} on={d.theme === t} onClick={() => set((x) => ({ ...x, theme: t }), 'deck:theme')}>{t}</Tb>)}
          <Tb aria-label="Slide Master" onClick={() => setDialog('master')}>Slide Master</Tb>
        </Tools>
      )}
      {!ro && tab === 'show' && (
        <Tools>
          <select aria-label="Transition" className="h-8 rounded border border-slate-200 text-[12px]" value={cur?.transition} onChange={(e) => edit({ transition: e.target.value as CoSlide['transition'] }, 'deck:trans')}>
            {CO_TRANSITIONS.map((t) => <option key={t} value={t}>{t === 'NONE' ? 'No transition' : t}</option>)}
          </select>
          <label className="flex shrink-0 items-center gap-1 text-[12px]">After (s)<input aria-label="Advance after seconds" type="number" min={0} max={600} className="h-8 w-14 rounded border border-slate-200 px-1" value={cur?.advance ?? 0} onChange={(e) => edit({ advance: Math.max(0, Math.min(600, Number(e.target.value) || 0)) }, 'deck:adv')} /></label>
          <Tb aria-label="Apply To All" onClick={() => cur && set((x) => coApplyAll(x, { transition: cur.transition, advance: cur.advance }), 'deck:all')}>Apply To All</Tb>
          <select aria-label="Animation" className="h-8 rounded border border-slate-200 text-[12px]" value={cur?.anim} onChange={(e) => edit({ anim: e.target.value as CoSlide['anim'] }, 'deck:anim')}>
            {CO_ANIMS.map((t) => <option key={t} value={t}>{t === 'NONE' ? 'No animation' : t.replace('_', ' ')}</option>)}
          </select>
          <Tb aria-label="From Beginning" onClick={() => startShow(true)}>From Beginning (F5)</Tb>
          <Tb aria-label="Handouts" onClick={() => setDialog('hand')}>Print Handouts</Tb>
        </Tools>
      )}
      {!ro && tab === 'file' && (
        <Tools>
          <Tb aria-label="Save as" onClick={() => setDialog('save')}>Save As</Tb>
          <Tb aria-label="Close presentation" disabled={!d.saved} onClick={() => set((x) => ({ ...x, closed: true }), 'deck:close')}>Close</Tb>
          <span className="truncate px-1 text-[12px] text-slate-500">{d.saved || 'Not saved yet'}</span>
        </Tools>
      )}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div aria-label="Slides" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-300 bg-slate-200 p-1 sm:w-28 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
          {d.slides.map((s, k) => (
            <button key={s.id + k} type="button" aria-label={`Slide ${k + 1}`} aria-pressed={k === i} onClick={() => setAt(k)} className={cn('w-20 shrink-0 rounded border-2', k === i ? 'border-blue-600' : 'border-transparent')}>
              <SlideFace s={s} d={d} n={k + 1} />
            </button>
          ))}
        </div>
        <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-auto bg-slate-100 p-2">
          {cur && (
            <>
              <div className="mx-auto max-w-[520px] shadow"><SlideFace s={cur} d={d} n={i + 1} big /></div>
              {!ro && (
                <div className="mx-auto max-w-[520px] space-y-1">
                  <input aria-label="Slide title" className={inputCls} placeholder="Click to add title" value={cur.title} onChange={(e) => edit({ title: e.target.value.slice(0, 120) })} />
                  <textarea aria-label="Slide text" rows={3} className="w-full rounded border border-slate-300 p-2 text-[13px]" placeholder={cur.layout === 'TITLE' ? 'Click to add subtitle (your name)' : 'Click to add text: one bullet point on each line'} value={cur.body} onChange={(e) => edit({ body: e.target.value.slice(0, 1200) })} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {dialog === 'save' && (
        <Modal title="Save As" onClose={() => setDialog(null)}>
          <Lbl text="File name"><input aria-label="File name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Lbl>
          <Pri aria-label="Save" disabled={!name.trim()} onClick={() => (set((x) => ({ ...x, saved: name.trim() }), `deck:save:${name}`), setDialog(null))}>Save</Pri>
        </Modal>
      )}
      {dialog === 'hand' && (
        <Modal title="Print Handouts" onClose={() => setDialog(null)}>
          <Lbl text="Slides per page">
            <select aria-label="Slides per page" className={inputCls} value={hand} onChange={(e) => setHand(Number(e.target.value))}>{[1, 2, 3, 4, 6, 9].map((n) => <option key={n}>{n}</option>)}</select>
          </Lbl>
          <p>{Math.ceil(d.slides.length / hand)} page(s) for {d.slides.length} slides.</p>
          <Pri aria-label="Print handouts" onClick={() => (set((x) => coPrintHandouts(x, hand), 'deck:handouts'), setDialog(null))}>Print</Pri>
        </Modal>
      )}
      {dialog === 'master' && (
        <Modal title="Slide Master" onClose={() => setDialog(null)}>
          <p className="text-[12px] text-slate-600">What you set here shows on every slide.</p>
          <Lbl text="Title font"><select aria-label="Master title font" className={inputCls} value={d.master.titleFont} onChange={(e) => set((x) => ({ ...x, master: { ...x.master, titleFont: e.target.value, used: true } }), 'deck:masterfont')}>{['Calibri', 'Arial', 'Cambria', 'Times New Roman'].map((f) => <option key={f}>{f}</option>)}</select></Lbl>
          <Lbl text="Title colour"><select aria-label="Master title colour" className={inputCls} value={d.master.titleColor} onChange={(e) => set((x) => ({ ...x, master: { ...x.master, titleColor: e.target.value, used: true } }), 'deck:mastercolor')}>{[['#111827', 'Black'], ['#0f3d8c', 'Navy'], ['#b91c1c', 'Red'], ['#15803d', 'Green']].map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Lbl>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Insert logo on master" checked={d.master.logo} onChange={(e) => set((x) => ({ ...x, master: { ...x.master, logo: e.target.checked, used: true } }), 'deck:masterlogo')} /> School logo at the bottom right</label>
          <Lbl text="Footer"><input aria-label="Master footer" className={inputCls} value={d.master.footer} onChange={(e) => set((x) => ({ ...x, master: { ...x.master, footer: e.target.value.slice(0, 80), used: true } }))} /></Lbl>
          <Sec aria-label="Close Master View" onClick={() => setDialog(null)}>Close Master View</Sec>
        </Modal>
      )}
      {show && d.slides[show.i] && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black" role="dialog" aria-label="Slide show" onClick={step}>
          <div className="w-full max-w-[640px]"><SlideFace s={d.slides[show.i]!} d={d} n={show.i + 1} big reveal={show.reveal} /></div>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-white/80">
            <span>Slide {show.i + 1} of {d.slides.length}. Click or press an arrow key to go on.</span>
            <button type="button" aria-label="End show (Esc)" className="rounded border border-white/40 px-2 py-1" onClick={(e) => (e.stopPropagation(), endShow(true))}>Esc</button>
          </div>
        </div>
      )}
    </div>
  );
}
