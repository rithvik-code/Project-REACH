import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Laptop, RotateCcw, Smartphone } from 'lucide-react';
import clsx from 'clsx';
import { useReach } from '../lib/store';
import type { PreviewDevice } from '../lib/types';

const SIZES: Record<Exclude<PreviewDevice, 'desktop'>, { w: number; h: number; label: string }> = {
  'phone-portrait': { w: 390, h: 844, label: 'Phone · portrait' },
  'phone-landscape': { w: 844, h: 390, label: 'Phone · landscape' },
};

/**
 * Renders the live app inside a phone-sized iframe so the responsive layout is
 * genuinely exercised (media queries resolve against the iframe viewport).
 * Inside the frame we render normally and hide the switcher, which also stops
 * the frame from nesting into itself.
 */
export function DevicePreviewFrame({ children }: { children: ReactNode }) {
  const device = useReach((s) => s.previewDevice);
  const setDevice = useReach((s) => s.setPreviewDevice);
  const [scale, setScale] = useState(1);

  const inFrame = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('preview') === 'phone';
  }, []);

  useEffect(() => {
    if (inFrame) setDevice('desktop');
  }, [inFrame, setDevice]);

  const frameSrc = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('preview', 'phone');
    return url.toString();
  }, []);

  useEffect(() => {
    if (device === 'desktop') return;
    const resize = () => {
      const { h } = SIZES[device];
      const available = window.innerHeight - 140;
      setScale(Math.min(1, Math.max(0.38, available / h)));
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [device]);

  // Inside the frame, or in desktop mode, just render the app.
  if (inFrame || device === 'desktop') {
    return (
      <>
        {children}
        {inFrame ? null : <Switcher device={device} setDevice={setDevice} />}
      </>
    );
  }

  const { w, h, label } = SIZES[device];

  return (
    <>
      <Switcher device={device} setDevice={setDevice} />
      <div className="fixed inset-0 z-[900] flex flex-col items-center justify-center gap-3 bg-base-950">
        <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
          <Smartphone size={13} className="text-threat-info" />
          <span className="font-medium text-ink">{label}</span>
          <span className="text-ink-faint">— live app at {w}×{h}, scaled {Math.round(scale * 100)}%</span>
        </div>

        <div
          className="rounded-[42px] border border-base-600/80 bg-base-900 p-3 shadow-panel"
          style={{ width: w * scale + 24, height: h * scale + 24 }}
        >
          <iframe
            title="REACH phone preview"
            src={frameSrc}
            style={{
              width: w,
              height: h,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 'none',
              borderRadius: 30,
              background: '#05070c',
            }}
          />
        </div>

        <p className="max-w-md text-center text-[10.5px] leading-relaxed text-ink-faint">
          This is the full REACH app running at phone width, so the navigation collapses to a drawer and every panel
          reflows. Interact with it exactly as you would on a handset.
        </p>
      </div>
    </>
  );
}

function Switcher({
  device,
  setDevice,
}: {
  device: PreviewDevice;
  setDevice: (d: PreviewDevice) => void;
}) {
  const options: { value: PreviewDevice; label: string; hint: string; icon: ReactNode }[] = [
    { value: 'desktop', label: 'Desktop', hint: 'Full desktop layout', icon: <Laptop size={14} /> },
    { value: 'phone-portrait', label: 'Portrait', hint: 'Phone preview · portrait 390×844', icon: <Smartphone size={14} /> },
    { value: 'phone-landscape', label: 'Landscape', hint: 'Phone preview · landscape 844×390', icon: <RotateCcw size={14} /> },
  ];
  return (
    <div className="fixed bottom-24 right-2.5 z-[950] flex flex-col gap-0.5 rounded-full border border-base-800 bg-base-900/90 p-1 backdrop-blur lg:bottom-2.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setDevice(o.value)}
          title={o.hint}
          aria-label={o.hint}
          className={clsx(
            'grid h-8 w-8 place-items-center rounded-full transition',
            device === o.value ? 'bg-threat-info/15 text-threat-info' : 'text-ink-faint hover:bg-base-850 hover:text-ink',
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
