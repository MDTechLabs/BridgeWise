/**
 * ThemeScript Component
 * Inline script that runs before React hydration to prevent flash of wrong theme
 * This should be placed in the <head> of your document
 */

import React from 'react';

export interface ThemeScriptProps {
  /**
   * Storage key for theme preference
   * @default 'bridgewise-theme-mode'
   */
  storageKey?: string;
  /**
   * Attribute to set on root element
   * @default 'data-theme'
   */
  attribute?: 'class' | 'data-theme';
  /**
   * Default theme mode
   * @default 'system'
   */
  defaultMode?: 'light' | 'dark' | 'system';
  /**
   * Value to use for dark mode
   * @default 'dark'
   */
  darkValue?: string;
  /**
   * Value to use for light mode
   * @default 'light'
   */
  lightValue?: string;
}

export const ThemeScript: React.FC<ThemeScriptProps> = ({
  storageKey = 'bridgewise-theme-mode',
  attribute = 'data-theme',
  defaultMode = 'system',
  darkValue = 'dark',
  lightValue = 'light',
}) => {
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

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
};
