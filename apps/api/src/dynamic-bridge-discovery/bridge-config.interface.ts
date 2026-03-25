export interface BridgeModuleConfig {
  /**
   * Directory to scan for bridge adapters at runtime.
   * Relative to process.cwd() or absolute path.
   */
  bridgesDirectory?: string;

  /**
   * Explicitly listed bridges to load (name -> config).
   */
  bridges?: Record<string, BridgeAdapterConfig>;

  /**
   * Whether to enable auto-discovery from directory
   */
  autoDiscover?: boolean;

  /**
   * Whether to allow duplicate registrations (overwrite mode)
   */
  allowOverwrite?: boolean;

  /**
   * Global configuration passed to every bridge on initialization
   */
  globalConfig?: Record<string, unknown>;
}

export interface BridgeAdapterConfig {
  /**
   * Path to the adapter module (for dynamic loading)
   */
  modulePath?: string;

  /**
   * Enabled/disabled toggle
   */
  enabled?: boolean;

  /**
   * Adapter-specific configuration
   */
  options?: Record<string, unknown>;
}
