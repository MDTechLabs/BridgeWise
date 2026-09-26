
import { TimeRange, ProviderAvailability } from './types';

const PROVIDERS = ['AllBridge', 'Squid', 'Stargate'];

function makeSlots(days: number, baseAvail: number, outageDays: number[]): any[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const outage = outageDays.includes(i);
    const availability = outage ? Math.random() * 0.4 : baseAvail - Math.random() * 0.02;
    return { label, availability: Math.max(0, Math.min(1, availability)), outage };
  });
}

export const DATA: Record<TimeRange, ProviderAvailability[]> = {
  '7d': [
    { provider: 'AllBridge', slots: makeSlots(7, 0.998, []), overallAvailability: 0.998 },
    { provider: 'Squid',     slots: makeSlots(7, 0.991, [4]), overallAvailability: 0.987 },
    { provider: 'Stargate',  slots: makeSlots(7, 0.999, []), overallAvailability: 0.999 },
  ],
  '30d': [
    { provider: 'AllBridge', slots: makeSlots(30, 0.997, [7, 21]), overallAvailability: 0.994 },
    { provider: 'Squid',     slots: makeSlots(30, 0.988, [3, 14, 26]), overallAvailability: 0.981 },
    { provider: 'Stargate',  slots: makeSlots(30, 0.999, [19]), overallAvailability: 0.996 },
  ],
  '90d': [
    { provider: 'AllBridge', slots: makeSlots(90, 0.996, [12, 34, 67]), overallAvailability: 0.993 },
    { provider: 'Squid',     slots: makeSlots(90, 0.985, [5, 22, 41, 78]), overallAvailability: 0.977 },
    { provider: 'Stargate',  slots: makeSlots(90, 0.998, [55]), overallAvailability: 0.996 },
  ],
};