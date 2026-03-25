"use strict";
/**
 * Theme System Exports
 * Main entry point for BridgeWise theming
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCSSVariables = exports.mergeTheme = exports.primitiveColors = exports.darkTheme = exports.defaultTheme = exports.ThemeScript = exports.BridgeWiseProvider = exports.useTheme = exports.ThemeProvider = void 0;
var ThemeProvider_1 = require("./ThemeProvider");
Object.defineProperty(exports, "ThemeProvider", { enumerable: true, get: function () { return ThemeProvider_1.ThemeProvider; } });
Object.defineProperty(exports, "useTheme", { enumerable: true, get: function () { return ThemeProvider_1.useTheme; } });
var BridgeWiseProvider_1 = require("./BridgeWiseProvider");
Object.defineProperty(exports, "BridgeWiseProvider", { enumerable: true, get: function () { return BridgeWiseProvider_1.BridgeWiseProvider; } });
var ThemeScript_1 = require("./ThemeScript");
Object.defineProperty(exports, "ThemeScript", { enumerable: true, get: function () { return ThemeScript_1.ThemeScript; } });
var tokens_1 = require("./tokens");
Object.defineProperty(exports, "defaultTheme", { enumerable: true, get: function () { return tokens_1.defaultTheme; } });
Object.defineProperty(exports, "darkTheme", { enumerable: true, get: function () { return tokens_1.darkTheme; } });
Object.defineProperty(exports, "primitiveColors", { enumerable: true, get: function () { return tokens_1.primitiveColors; } });
var utils_1 = require("./utils");
Object.defineProperty(exports, "mergeTheme", { enumerable: true, get: function () { return utils_1.mergeTheme; } });
Object.defineProperty(exports, "generateCSSVariables", { enumerable: true, get: function () { return utils_1.generateCSSVariables; } });
//# sourceMappingURL=index.js.map