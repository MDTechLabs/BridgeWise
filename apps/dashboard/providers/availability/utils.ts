
export function cellColor(availability: number): string {
  if (availability >= 0.999) return '#16a34a';
  if (availability >= 0.995) return '#4ade80';
  if (availability >= 0.98)  return '#fbbf24';
  if (availability >= 0.95)  return '#f97316';
  return '#ef4444';
}