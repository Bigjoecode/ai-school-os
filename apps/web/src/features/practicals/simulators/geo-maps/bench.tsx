import { GEO_PANEL_LABEL, type GeoMapsState, type GeoPanel, type GeoTool } from '@aischool/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Geo } from './actions';
import { ChartBench, FlowChartPanel, FlowPanel, GlobePanel, OutlinePanel, PiePanel } from './chart-panels';
import { MapBench } from './map-bench';
import { CopyPanel, GisPanel, ScaleBarPanel, SectionPanel, SketchPanel } from './sheet-panels';

/** The desk: whichever sheet of paper the exercise needs, with tabs between them. The same in the 2D lab, in the 3D lab's close view and in the demo. */
export function GeoDesk({ g, s, readOnly, panel, tool, assist, compact }: { g: Geo; s: GeoMapsState; readOnly: boolean; panel?: GeoPanel; tool?: GeoTool; assist?: boolean; compact?: boolean }) {
  const panels = g.v.def.panels;
  const [cur, setCur] = useState<GeoPanel>(panel ?? panels[0]!);
  useEffect(() => {
    if (panel) setCur(panel);
  }, [panel]);
  const shown = panels.includes(cur) ? cur : panels[0]!;
  const p = { g, s, readOnly };
  return (
    <div className="space-y-2">
      {panels.length > 1 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sheets on the desk">
          {panels.map((x) => (
            <Button key={x} size="sm" role="tab" variant={shown === x ? 'secondary' : 'ghost'} className="h-7" aria-selected={shown === x} data-panel={x} onClick={() => setCur(x)}>
              {GEO_PANEL_LABEL[x]}
            </Button>
          ))}
        </div>
      )}
      {shown === 'map' && <MapBench g={g} s={s} readOnly={readOnly} tool={tool} assist={assist} compact={compact} />}
      {shown === 'scalebar' && <ScaleBarPanel {...p} />}
      {shown === 'copy' && <CopyPanel {...p} />}
      {shown === 'sketch' && <SketchPanel {...p} />}
      {shown === 'section' && <SectionPanel {...p} />}
      {shown === 'gis' && <GisPanel {...p} />}
      {shown === 'chart' && <ChartBench {...p} />}
      {shown === 'pie' && <PiePanel {...p} />}
      {shown === 'outline' && <OutlinePanel {...p} />}
      {shown === 'flow' && <FlowPanel {...p} />}
      {shown === 'flowchart' && <FlowChartPanel {...p} />}
      {shown === 'globe' && <GlobePanel {...p} />}
    </div>
  );
}
