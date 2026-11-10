import type { RouteStop } from '@aischool/shared';
import { Crosshair, Loader2, MapPin, X } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useSaveStopLocations } from './api';
import { SlippyMap } from './slippy-map';
import { stopMarkers } from './ui';

type Draft = { name: string; lat: string; lng: string };

const num = (s: string) => (s.trim() === '' ? null : Number(s.trim()));

/**
 * Where each stop is, for live tracking: type the coordinates (from a maps app),
 * paste "6.4281, 3.4219" into either box, or stand at the stop and use this
 * phone's location.
 */
export function StopLocationsDialog({ open, onOpenChange, routeId, routeName, stops }: { open: boolean; onOpenChange: (o: boolean) => void; routeId: string; routeName: string; stops: RouteStop[] }) {
  const save = useSaveStopLocations(routeId);
  const [rows, setRows] = useState<Draft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setRows(stops.map((s) => ({ name: s.name, lat: s.lat != null ? String(s.lat) : '', lng: s.lng != null ? String(s.lng) : '' })));
  }, [open, stops]);

  const patch = (name: string, p: Partial<Draft>) => setRows((all) => all.map((r) => (r.name === name ? { ...r, ...p } : r)));

  /** "6.4281, 3.4219" pasted into either box fills both. */
  const typed = (name: string, field: 'lat' | 'lng', value: string) => {
    const pair = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (pair) patch(name, { lat: pair[1]!, lng: pair[2]! });
    else patch(name, { [field]: value.replace(/[^\d.\-]/g, '') });
  };

  const here = (name: string) => {
    if (!('geolocation' in navigator)) {
      setErrors((e) => ({ ...e, [name]: 'This browser can’t read your location' }));
      return;
    }
    setLocating(name);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(null);
        patch(name, { lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) });
        setErrors((e) => ({ ...e, [name]: p.coords.accuracy > 100 ? `Only accurate to about ${Math.round(p.coords.accuracy)} m — try again outdoors` : '' }));
      },
      (err) => {
        setLocating(null);
        setErrors((e) => ({ ...e, [name]: err.code === err.PERMISSION_DENIED ? 'Location permission is off for this site. Allow it in the browser’s site settings.' : 'Couldn’t get a GPS fix. Turn on location and try again outdoors.' }));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  const submit = (e?: BaseSyntheticEvent) => {
    e?.preventDefault();
    const next: Record<string, string> = {};
    const out = rows.map((r) => {
      const lat = num(r.lat);
      const lng = num(r.lng);
      if ((lat == null) !== (lng == null)) next[r.name] = 'Give both latitude and longitude, or neither';
      else if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) next[r.name] = 'Latitude is between -90 and 90';
      else if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) next[r.name] = 'Longitude is between -180 and 180';
      return { name: r.name, lat, lng };
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ stops: out }, { onSuccess: () => onOpenChange(false), onError: (err) => setErrors({ form: errorMessage(err) }) });
  };

  const preview = stopMarkers(
    rows.map((r) => ({ name: r.name, lat: num(r.lat), lng: num(r.lng) })).filter((r) => r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng)),
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Stop locations · ${routeName}`}
      description="Parents get “the bus is near your stop” and an arrival estimate only for stops placed here. Copy coordinates from a maps app, or stand at the stop and use your location."
      icon={<MapPin />}
      submitLabel="Save locations"
      pending={save.isPending}
      onSubmit={submit}
      size="lg"
    >
      <div className="grid gap-3">
        <ol className="grid gap-3">
          {rows.map((r, i) => (
            <li key={r.name} className="rounded-xl border border-border p-3">
              <p className="mb-2 flex items-center gap-2 text-[13px] font-medium">
                <span className="grid size-5 place-items-center rounded-full bg-muted text-[10px] tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {(r.lat || r.lng) && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Clear the location of ${r.name}`} onClick={() => patch(r.name, { lat: '', lng: '' })}>
                    <X />
                  </Button>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input aria-label={`${r.name} latitude`} inputMode="decimal" placeholder="Latitude, e.g. 6.4281" value={r.lat} onChange={(e) => typed(r.name, 'lat', e.target.value)} className="h-9 tabular" invalid={!!errors[r.name]} />
                <Input aria-label={`${r.name} longitude`} inputMode="decimal" placeholder="Longitude, e.g. 3.4219" value={r.lng} onChange={(e) => typed(r.name, 'lng', e.target.value)} className="h-9 tabular" invalid={!!errors[r.name]} />
                <Button type="button" variant="outline" size="sm" className="col-span-2 h-9 sm:col-span-1" onClick={() => here(r.name)} disabled={locating !== null}>
                  {locating === r.name ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my current location
                </Button>
              </div>
              {errors[r.name] && <p className="mt-1.5 text-[12px] font-medium text-danger">{errors[r.name]}</p>}
            </li>
          ))}
        </ol>
        {preview.length > 0 && <SlippyMap markers={preview} label={`Map of the stops on ${routeName}`} className="h-56" />}
        {errors.form && <p className="text-[12.5px] font-medium text-danger">{errors.form}</p>}
      </div>
    </FormDialog>
  );
}
