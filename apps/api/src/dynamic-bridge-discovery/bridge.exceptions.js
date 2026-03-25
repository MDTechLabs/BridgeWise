"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeCapabilityNotFoundException = exports.BridgeLoadException = exports.BridgeInitializationException = exports.BridgeDuplicateException = exports.BridgeNotFoundException = void 0;
class BridgeNotFoundException extends Error {
    constructor(name) {
        super(`Bridge adapter "${name}" not found in registry.`);
        this.name = 'BridgeNotFoundException';
    }
}
exports.BridgeNotFoundException = BridgeNotFoundException;
class BridgeDuplicateException extends Error {
    constructor(name) {
        super(`Bridge adapter "${name}" is already registered. Use allowOverwrite: true to override.`);
        this.name = 'BridgeDuplicateException';
    }
}
exports.BridgeDuplicateException = BridgeDuplicateException;
class BridgeInitializationException extends Error {
    constructor(name, cause) {
        super(`Bridge adapter "${name}" failed to initialize: ${cause.message}`);
        this.name = 'BridgeInitializationException';
        this.cause = cause;
    }
}
exports.BridgeInitializationException = BridgeInitializationException;
class BridgeLoadException extends Error {
    constructor(path, cause) {
        super(`Failed to load bridge from path "${path}": ${cause.message}`);
        this.name = 'BridgeLoadException';
        this.cause = cause;
    }
}
exports.BridgeLoadException = BridgeLoadException;
class BridgeCapabilityNotFoundException extends Error {
    constructor(capability) {
        super(`No bridge adapter found with capability "${capability}".`);
        this.name = 'BridgeCapabilityNotFoundException';
    }
}
exports.BridgeCapabilityNotFoundException = BridgeCapabilityNotFoundException;
//# sourceMappingURL=bridge.exceptions.js.map