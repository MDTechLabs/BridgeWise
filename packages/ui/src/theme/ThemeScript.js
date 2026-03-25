"use strict";
/**
 * ThemeScript Component
 * Inline script that runs before React hydration to prevent flash of wrong theme
 * This should be placed in the <head> of your document
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeScript = void 0;
const react_1 = __importDefault(require("react"));
const ThemeScript = ({ storageKey = 'bridgewise-theme-mode', attribute = 'data-theme', defaultMode = 'system', darkValue = 'dark', lightValue = 'light', }) => {
    // Inline script that runs synchronously before React hydration
    const script = `
(function() {
  try {
    var storageKey = '${storageKey}';
    var attribute = '${attribute}';
    var defaultMode = '${defaultMode}';
    var darkValue = '${darkValue}';
    var lightValue = '${lightValue}';

    var stored = localStorage.getItem(storageKey);
    var mode = stored || defaultMode;

    var resolvedMode = mode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;

    var value = resolvedMode === 'dark' ? darkValue : lightValue;

    if (attribute === 'class') {
      document.documentElement.classList.add(value);
    } else {
      document.documentElement.setAttribute(attribute, value);
    }
  } catch (e) {
    // Fail silently in case of errors
  }
})();
  `.trim();
    return (<script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning/>);
};
exports.ThemeScript = ThemeScript;
//# sourceMappingURL=ThemeScript.js.map