import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Reads gate pass QR codes with the device camera using the browser's
 * built-in BarcodeDetector (Chrome and Edge on Android, Windows and
 * ChromeOS; Samsung Internet). Where it isn't available (iPhone/iPad
 * Safari, Firefox) the gate uses a USB/Bluetooth barcode scanner, which
 * types the code into the box below, or a search by name.
 */

interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export function cameraScanSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
}

/** The same code is ignored for this long (a pass held in front of the camera). */
const SAME_CODE_MS = 4000;

export function CameraScanner({ onCode, paused, className }: { onCode: (code: string) => void; paused?: boolean; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const supported = cameraScanSupported();

  const stop = useCallback(() => {
    const v = video.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setOn(false);
  }, []);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let timer = 0;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ['qr_code'] });
    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (!alive) return;
          if (!pausedRef.current && v.readyState >= 2) {
            try {
              const found = await detector.detect(v);
              const code = found[0]?.rawValue?.trim();
              if (code && !(last.current && last.current.code === code && Date.now() - last.current.at < SAME_CODE_MS)) {
                last.current = { code, at: Date.now() };
                navigator.vibrate?.(60);
                cb.current(code);
              }
            } catch {
              /* a frame that couldn't be read */
            }
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      } catch (err) {
        setError((err as Error).name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this site, or use a barcode scanner or the search.' : 'The camera could not start on this device.');
        setOn(false);
      }
    };
    void run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  useEffect(() => stop, [stop]);

  if (!supported) {
    return (
      <div className={cn('rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-[13px] text-muted-foreground', className)}>
        <p className="flex items-center gap-2 font-medium text-foreground">
          <CameraOff className="size-4" aria-hidden /> Camera scanning isn’t available in this browser
        </p>
        <p className="mt-1">Use Chrome on an Android phone or tablet for camera scanning. On an iPhone or iPad, plug in a USB or Bluetooth barcode scanner (it types into the box below), or search for the child by name.</p>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-border bg-black', className)}>
      <video ref={video} className={cn('aspect-[4/3] w-full object-cover', !on && 'hidden')} muted playsInline />
      {on ? (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="size-[58%] max-h-[70%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <Button size="sm" variant="secondary" className="absolute bottom-3 right-3" onClick={stop}>
            <CameraOff /> Stop camera
          </Button>
        </>
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center bg-muted/40 p-4 text-center">
          <div>
            <ScanLine className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-[13px] text-muted-foreground">{error ?? 'Point the camera at a gate pass or student ID card.'}</p>
            <Button className="mt-3" onClick={() => { setError(null); setOn(true); }}>
              <Camera /> Start camera
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
