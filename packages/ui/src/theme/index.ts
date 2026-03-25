/**
 * Theme System Exports
 * Main entry point for BridgeWise theming
 */

export { ThemeProvider, useTheme } from './ThemeProvider';
export { BridgeWiseProvider } from './BridgeWiseProvider';
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
  BridgeWiseTheme,
  CSSVariables,
} from './types';
