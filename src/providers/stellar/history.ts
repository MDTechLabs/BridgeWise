export interface ProviderHistory {
  provider: string;
  events: HistoryEvent[];
}

export interface HistoryEvent {
  timestamp: number;
  type: 'success' | 'failure';
  details?: any;
}

export class HistoryTracker {
  private history: ProviderHistory[] = [];

  addEvent(provider: string, event: HistoryEvent): void {
    let providerHistory = this.history.find(h => h.provider === provider);
    if (!providerHistory) {
      providerHistory = { provider, events: [] };
      this.history.push(providerHistory);
    }
    providerHistory.events.push(event);
  }

  getHistory(provider: string): ProviderHistory | undefined {
    return this.history.find(h => h.provider === provider);
  }
}