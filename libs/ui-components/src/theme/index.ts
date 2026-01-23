/**
 * Theme System Exports
 * Main entry point for BridgeWise theming
 */

export { ThemeProvider, useTheme } from './ThemeProvider';
export { ThemeScript } from './ThemeScript';
export { defaultTheme, darkTheme, primitiveColors } from './tokens';
export { mergeTheme, generateCSSVariables } from './utils';
export type {
  Theme,
  ThemeMode,
  ThemeColors,
  ThemeSpacing,
  ThemeTypography,
  ThemeShadows,
  ThemeRadii,
  ThemeTransitions,
  ThemeContextValue,
  DeepPartial,
  ThemeConfig,
  CSSVariables,
} from './types';
