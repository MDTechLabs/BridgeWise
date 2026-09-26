
export type TimeRange = '7d' | '30d' | '90d';

export interface AvailabilitySlot {
  label: string;
  availability: number; // 0–1
  outage: boolean;
}

export interface ProviderAvailability {
  provider: string;
  slots: AvailabilitySlot[];
  overallAvailability: number;
}