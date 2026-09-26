import { FlagManager, HistoryEvent, HistoryTracker, ScoreCalculator } from "src/providers/stellar";


// Define a generic interface for any bridge provider's trust components
export interface IBridgeTrustProvider {
  addEvent(providerName: string, event: HistoryEvent): void;
  getTrustScore(providerName: string): number;
  isProviderFlagged(providerName: string): boolean;
}

// Implement the Stellar-specific trust provider
export class StellarTrustProvider implements IBridgeTrustProvider {
  private historyTracker: HistoryTracker;
  private scoreCalculator: ScoreCalculator;
  private flagManager: FlagManager;

  constructor() {
    this.historyTracker = new HistoryTracker();
    this.scoreCalculator = new ScoreCalculator();
    this.flagManager = new FlagManager();
  }

  addEvent(providerName: string, event: HistoryEvent): void {
    this.historyTracker.addEvent(providerName, event);
  }

  getTrustScore(providerName: string): number {
    const history = this.historyTracker.getHistory(providerName);
    return history ? this.scoreCalculator.calculateScore(history) : 0;
  }

  isProviderFlagged(providerName: string): boolean {
    const history = this.historyTracker.getHistory(providerName);
    return history ? this.flagManager.isProviderFlagged(history) : false;
  }
}

// The main TrustManager to handle multiple bridge providers
export class TrustManager {
  private providers: Map<string, IBridgeTrustProvider> = new Map();

  registerProvider(type: string, provider: IBridgeTrustProvider): void {
    this.providers.set(type, provider);
  }

  getProvider(type: string): IBridgeTrustProvider | undefined {
    return this.providers.get(type);
  }

  // Example usage:
  // const stellarTrust = new StellarTrustProvider();
  // trustManager.registerProvider('stellar', stellarTrust);
  // trustManager.getProvider('stellar')?.addEvent('providerA', { timestamp: Date.now(), type: 'success' });
}