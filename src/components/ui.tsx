import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

export type Tone =
  | 'critical'
  | 'high'
  | 'elevated'
  | 'moderate'
  | 'low'
  | 'info'
  | 'neutral'
  | 'accent';

export const TONE_HEX: Record<Tone, string> = {
  critical: '#ff3b47',
  high: '#ff7a29',
  elevated: '#ffb020',
  moderate: '#ffd84d',
  low: '#22d38b',
  info: '#38bdf8',
  neutral: '#7c8aa5',
  accent: '#a78bfa',
};

export function toneFromLevel(level: string): Tone {
  if (level === 'critical' || level === 'high' || level === 'elevated' || level === 'moderate' || level === 'low') {
    return level;
  }
  return 'neutral';
}

/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={clsx('panel', className)}>{children}</section>;
}

export function PanelHead({
  title,
  subtitle,
  icon,
  right,
  tone = 'info',
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <header
      className={clsx(
        'flex items-start justify-between gap-3 border-b border-base-700/60 px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border"
            style={{
              color: TONE_HEX[tone],
              borderColor: `${TONE_HEX[tone]}44`,
              background: `${TONE_HEX[tone]}18`,
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-snug text-ink-muted">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  className,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const hex = TONE_HEX[tone];
  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-base-700/70 bg-base-850/70 p-3.5',
        onClick && 'cursor-pointer transition hover:border-base-600 hover:bg-base-800/80',
        className,
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${hex}, transparent 85%)` }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="hud-text">{label}</span>
        {icon ? <span style={{ color: hex }}>{icon}</span> : null}
      </div>
      <div className="mt-2 font-mono text-2xl leading-none text-ink" style={{ color: hex }}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[11px] leading-snug text-ink-muted">{sub}</div> : null}
    </div>
  );
}

export function LevelPill({
  level,
  children,
  className,
  showDot = true,
}: {
  level: string;
  children?: ReactNode;
  className?: string;
  showDot?: boolean;
}) {
  const tone = toneFromLevel(level);
  const hex = TONE_HEX[tone];
  return (
    <span
      className={clsx('chip', className)}
      style={{ color: hex, borderColor: `${hex}55`, background: `${hex}18` }}
    >
      {showDot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} /> : null}
      {children ?? level.toUpperCase()}
    </span>
  );
}

export function Bar({
  value,
  tone = 'info',
  className,
  height = 6,
  track = 'rgba(255,255,255,0.07)',
}: {
  value: number;
  tone?: Tone;
  className?: string;
  height?: number;
  track?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={clsx('w-full overflow-hidden rounded-full', className)} style={{ height, background: track }}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${TONE_HEX[tone]}aa, ${TONE_HEX[tone]})`,
          boxShadow: `0 0 12px ${TONE_HEX[tone]}66`,
        }}
      />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  tone = 'info',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const hex = TONE_HEX[tone];
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-base-800/60"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className={clsx('block text-[13px] leading-tight', checked ? 'text-ink' : 'text-ink-muted')}>
          {label}
        </span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{hint}</span> : null}
      </span>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full border transition"
        style={{
          borderColor: checked ? `${hex}77` : '#2a3348',
          background: checked ? `${hex}33` : '#141a27',
        }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all duration-200"
          style={{
            left: checked ? 18 : 3,
            background: checked ? hex : '#4b5a75',
            boxShadow: checked ? `0 0 10px ${hex}` : 'none',
          }}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={clsx(
        'inline-flex flex-wrap items-center gap-1 rounded-xl border border-base-700/70 bg-base-900/70 p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'bg-base-700 text-ink shadow-panel' : 'text-ink-muted hover:bg-base-800/70 hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-2xl',
  tone = 'info',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  tone?: Tone;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-6">
      <div
        className={clsx(
          'panel max-h-[92vh] w-full overflow-hidden rounded-b-none rounded-t-2xl animate-riseIn sm:rounded-2xl',
          width,
        )}
      >
        <PanelHead
          title={title}
          subtitle={subtitle}
          tone={tone}
          right={
            <button type="button" onClick={onClose} className="btn btn-ghost !px-2 !py-1.5" aria-label="Close">
              <X size={16} />
            </button>
          }
        />
        <div className="max-h-[68vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-base-700/60 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-base-600/70 px-4 py-8 text-center">
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <p className="text-sm text-ink-muted">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function KeyValue({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-base-700/40 py-1.5 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className="text-right text-[12px] text-ink" style={tone ? { color: TONE_HEX[tone] } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const hex = TONE_HEX[tone];
  return (
    <div
      className={clsx('flex items-start gap-3 rounded-xl border px-3.5 py-3', className)}
      style={{ borderColor: `${hex}44`, background: `${hex}12` }}
    >
      {icon ? <span className="mt-0.5" style={{ color: hex }}>{icon}</span> : null}
      <div className="min-w-0 text-xs leading-relaxed">
        {title ? <div className="mb-0.5 font-semibold" style={{ color: hex }}>{title}</div> : null}
        <div className="text-ink-muted">{children}</div>
      </div>
    </div>
  );
}

export function DistBar({
  segments,
}: {
  segments: { label: string; value: number; tone: Tone }[];
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
      {segments.map((s) => (
        <div
          key={s.label}
          title={`${s.label}: ${Math.round(s.value)}`}
          style={{ width: `${(s.value / total) * 100}%`, background: TONE_HEX[s.tone] }}
        />
      ))}
    </div>
  );
}
