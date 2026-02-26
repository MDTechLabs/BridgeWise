export class BridgeNotFoundException extends Error {
  constructor(name: string) {
    super(`Bridge adapter "${name}" not found in registry.`);
    this.name = 'BridgeNotFoundException';
  }
}

export class BridgeDuplicateException extends Error {
  constructor(name: string) {
    super(
      `Bridge adapter "${name}" is already registered. Use allowOverwrite: true to override.`,
    );
    this.name = 'BridgeDuplicateException';
  }
}

export class BridgeInitializationException extends Error {
  constructor(name: string, cause: Error) {
    super(`Bridge adapter "${name}" failed to initialize: ${cause.message}`);
    this.name = 'BridgeInitializationException';
    this.cause = cause;
  }
}

export class BridgeLoadException extends Error {
  constructor(path: string, cause: Error) {
    super(`Failed to load bridge from path "${path}": ${cause.message}`);
    this.name = 'BridgeLoadException';
    this.cause = cause;
  }
}

export class BridgeCapabilityNotFoundException extends Error {
  constructor(capability: string) {
    super(`No bridge adapter found with capability "${capability}".`);
    this.name = 'BridgeCapabilityNotFoundException';
  }
}
