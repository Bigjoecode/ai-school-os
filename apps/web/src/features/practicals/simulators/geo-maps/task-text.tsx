import { GEO_WRITTEN, type GeoVariant } from '@aischool/shared';

/** The exercise as printed on the question paper. */
export function TaskText({ v }: { v: GeoVariant }) {
  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed">
      {v.def.brief.map((b) => (
        <p key={b}>{b}</p>
      ))}
      {v.tables.map((t) => (
        <DataTable key={t.title} t={t} />
      ))}
      <p className="text-[12.5px] text-muted-foreground">Then answer in your notebook: {GEO_WRITTEN[v.task].explain}</p>
    </div>
  );
}

export function DataTable({ t }: { t: GeoVariant['tables'][number] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <p className="mb-1 text-[12px] font-semibold">{t.title}</p>
      <table className="w-full border-collapse text-[12px] tabular">
        <thead>
          <tr>
            {t.head.map((h, i) => (
              <th key={`${h}-${i}`} className="border border-border bg-muted/50 px-1.5 py-1 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, k) => (
                <td key={k} className="border border-border px-1.5 py-1">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
