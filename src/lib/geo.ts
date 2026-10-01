export const R_EARTH_KM = 6371;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${round(km, 1)} km`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

export function formatCompact(n: number): string {
  if (n >= 100000) return `${round(n / 100000, 1)}L`;
  if (n >= 1000) return `${round(n / 1000, 1)}k`;
  return `${Math.round(n)}`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.round((now - ts) / 1000);
  if (Math.abs(diff) < 45) return 'just now';
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (abs < 3600) return `${mins} min ${suffix}`;
  const hrs = Math.round(abs / 3600);
  if (abs < 86400) return `${hrs} hr ${suffix}`;
  return `${Math.round(abs / 86400)} d ${suffix}`;
}

/** Signed offset label for the time machine, e.g. "T+6h" / "T-3h". */
export function hourLabel(offset: number): string {
  if (offset === 0) return 'NOW';
  const sign = offset > 0 ? '+' : '−';
  return `T${sign}${Math.abs(offset)}h`;
}

export function riskColor(level: string): string {
  switch (level) {
    case 'critical':
      return '#ff3b47';
    case 'high':
      return '#ff7a29';
    case 'elevated':
      return '#ffb020';
    case 'moderate':
      return '#ffd84d';
    case 'low':
      return '#22d38b';
    default:
      return '#38bdf8';
  }
}

export function riskFromScore(score: number): 'critical' | 'high' | 'elevated' | 'moderate' | 'low' {
  if (score >= 78) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 42) return 'elevated';
  if (score >= 24) return 'moderate';
  return 'low';
}

export function riskLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
