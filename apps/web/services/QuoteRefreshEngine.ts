import { NormalizedQuote, QuoteRefreshConfig, RefreshState, RefreshTrigger } from '../types/quote.types';
import { EventEmitter } from 'events';

export class QuoteRefreshEngine extends EventEmitter {
  private refreshInterval: NodeJS.Timeout | null = null;
  private config: Required<QuoteRefreshConfig>;
  private state: RefreshState = {
    isRefreshing: false,
    lastRefreshed: null,
    error: null,
    retryCount: 0,
    quotes: []
  };
  
  private abortController: AbortController | null = null;
  private refreshQueue: Promise<void>[] = [];
  private lastParams: Record<string, any> = {};

  constructor(
    private fetchQuotesFn: (params: any) => Promise<NormalizedQuote[]>,
    config: QuoteRefreshConfig = {}
  ) {
    super();
    
    // Default configuration
    this.config = {
      intervalMs: 15000,
      autoRefresh: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      onRefresh: () => {},
      onError: () => {},
      onRefreshStart: () => {},
      onRefreshEnd: () => {},
      ...config
    };
  }

  /**
   * Initialize the refresh engine with parameters
   */
  public initialize(params: Record<string, any>): void {
    this.lastParams = params;
    
    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Start auto-refresh interval
   */
  public startAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(() => {
      this.refresh({
        type: 'interval',
        timestamp: Date.now()
      });
    }, this.config.intervalMs);

    // Trigger immediate first refresh
    this.refresh({
      type: 'interval',
      timestamp: Date.now()
    });
  }

  /**
   * Stop auto-refresh
   */
  public stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Manual refresh trigger
   */
  public async refresh(trigger: RefreshTrigger): Promise<NormalizedQuote[]> {
    // Debounce: if already refreshing, queue this refresh
    if (this.state.isRefreshing) {
      return new Promise((resolve) => {
        this.once('refresh-complete', (quotes: NormalizedQuote[]) => {
          resolve(quotes);
        });
      });
    }

    // Check if parameters changed significantly (avoid unnecessary refreshes)
    if (trigger.type === 'parameter-change' && !this.hasSignificantChange(trigger.params)) {
      return this.state.quotes;
    }

    this.abortController = new AbortController();

    try {
      this.setState({
        ...this.state,
        isRefreshing: true,
        error: null
      });

      this.config.onRefreshStart();
      this.emit('refresh-start');

      // Fetch quotes with retry logic
      const quotes = await this.fetchWithRetry(trigger);

      this.setState({
        ...this.state,
        isRefreshing: false,
        lastRefreshed: new Date(),
        error: null,
        retryCount: 0,
        quotes
      });

      this.config.onRefresh(quotes);
      this.emit('refresh-complete', quotes);

      return quotes;

    } catch (error) {
      this.setState({
        ...this.state,
        isRefreshing: false,
        error: error as Error
      });

      this.config.onError(error as Error);
      this.emit('refresh-error', error);

      throw error;

    } finally {
      this.config.onRefreshEnd();
      this.emit('refresh-end');
      this.abortController = null;
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(trigger: RefreshTrigger): Promise<NormalizedQuote[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Update parameters if this is a parameter change trigger
        const params = trigger.type === 'parameter-change' 
          ? { ...this.lastParams, ...trigger.params }
          : this.lastParams;

        const quotes = await this.fetchQuotesFn(params, {
          signal: this.abortController?.signal
        });

        // Validate quotes
        this.validateQuotes(quotes);

        return quotes;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          // Exponential backoff
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          this.setState({
            ...this.state,
            retryCount: attempt
          });
          
          this.emit('retry-attempt', { attempt, error });
        }
      }
    }

    throw lastError || new Error('Failed to fetch quotes after retries');
  }

  /**
   * Check if parameters changed significantly
   */
  private hasSignificantChange(newParams?: Record<string, any>): boolean {
    if (!newParams) return false;
    
    const significantParams = ['amount', 'sourceChain', 'destinationChain', 'sourceToken', 'destinationToken'];
    
    for (const param of significantParams) {
      if (this.lastParams[param] !== newParams[param]) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Validate quotes data structure
   */
  private validateQuotes(quotes: NormalizedQuote[]): void {
    quotes.forEach(quote => {
      if (!quote.id || !quote.bridgeName || !quote.outputAmount) {
        throw new Error('Invalid quote format: missing required fields');
      }
    });
  }

  /**
   * Update engine state
   */
  private setState(newState: RefreshState): void {
    this.state = newState;
    this.emit('state-change', this.state);
  }

  /**
   * Get current state
   */
  public getState(): RefreshState {
    return { ...this.state };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<QuoteRefreshConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    // Restart auto-refresh if interval changed
    if (config.intervalMs && this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopAutoRefresh();
    
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.refreshQueue = [];
    this.removeAllListeners();
  }
}