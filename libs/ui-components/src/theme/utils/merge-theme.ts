/**
 * Theme Merging Utility
 * Deep merge function for combining custom themes with defaults
 */

import type { Theme, DeepPartial } from '../types';

/**
 * Deep merge two objects
 * Later object properties override earlier ones
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Record<string, any>
): T {
  const output: any = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        output[key] = sourceValue;
      }
    }
  }

  return output as T;
}

/**
 * Merge custom theme configuration with base theme
 * @param base - Base theme to start with
 * @param custom - Custom theme overrides
 * @returns Merged theme object
 */
export function mergeTheme(base: Theme, custom: DeepPartial<Theme>): Theme {
  return deepMerge(base, custom);
}
