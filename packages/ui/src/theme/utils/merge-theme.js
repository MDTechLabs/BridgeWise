"use strict";
/**
 * Theme Merging Utility
 * Deep merge function for combining custom themes with defaults
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeTheme = mergeTheme;
/**
 * Deep merge two objects
 * Later object properties override earlier ones
 */
function deepMerge(target, source) {
    const output = { ...target };
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = output[key];
            if (sourceValue &&
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                targetValue &&
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue)) {
                output[key] = deepMerge(targetValue, sourceValue);
            }
            else if (sourceValue !== undefined) {
                output[key] = sourceValue;
            }
        }
    }
    return output;
}
/**
 * Merge custom theme configuration with base theme
 * @param base - Base theme to start with
 * @param custom - Custom theme overrides
 * @returns Merged theme object
 */
function mergeTheme(base, custom) {
    return deepMerge(base, custom);
}
//# sourceMappingURL=merge-theme.js.map