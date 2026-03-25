"use strict";
/**
 * CSS Variables Generator
 * Converts theme tokens to CSS custom properties
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCSSVariables = generateCSSVariables;
/**
 * Converts camelCase to kebab-case
 * @param str - String in camelCase
 * @returns String in kebab-case
 */
function camelToKebab(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}
/**
 * Recursively flatten nested object into CSS variables
 * @param obj - Object to flatten
 * @param prefix - Current key prefix
 * @param result - Accumulated result object
 */
function flattenObject(obj, prefix = '', result = {}) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const cssKey = prefix ? `${prefix}-${key}` : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively flatten nested objects
                flattenObject(value, cssKey, result);
            }
            else {
                // Convert to kebab-case and add --bw- prefix
                const kebabKey = camelToKebab(cssKey);
                result[`--bw-${kebabKey}`] = String(value);
            }
        }
    }
    return result;
}
/**
 * Generate CSS custom properties from theme object
 * @param theme - Theme configuration
 * @returns Object of CSS variable names and values
 * @example
 * generateCSSVariables(theme)
 * // Returns: {
 * //   '--bw-colors-background-primary': '#ffffff',
 * //   '--bw-colors-foreground-primary': '#171717',
 * //   '--bw-spacing-md': '1rem',
 * //   ...
 * // }
 */
function generateCSSVariables(theme) {
    return flattenObject(theme);
}
//# sourceMappingURL=css-vars.js.map