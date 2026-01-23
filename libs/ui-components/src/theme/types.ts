/**
 * Theme Type Definitions
 * Comprehensive TypeScript types for the BridgeWise theming system
 */

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Color scale interface for primitive colors
 */
export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950?: string;
}

/**
 * Theme color tokens
 * Semantic color mappings for various UI contexts
 */
export interface ThemeColors {
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    inverse: string;
  };
  foreground: {
    primary: string;
    secondary: string;
    tertiary: string;
    inverse: string;
    link: string;
  };
  border: {
    default: string;
    focus: string;
    error: string;
  };
  status: {
    success: string;
    error: string;
    warning: string;
    info: string;
    pending: string;
  };
  transaction: {
    background: string;
    border: string;
    progressBar: {
      success: string;
      error: string;
      pending: string;
    };
  };
}

/**
 * Spacing tokens
 * Consistent spacing scale throughout the application
 */
export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  [key: string]: string;
}

/**
 * Typography tokens
 * Font families, sizes, weights, and line heights
 */
export interface ThemeTypography {
  fontFamily: {
    sans: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
    [key: string]: string;
  };
  fontWeight: {
    normal: string;
    medium: string;
    semibold: string;
    bold: string;
    [key: string]: string;
  };
  lineHeight: {
    tight: string;
    normal: string;
    relaxed: string;
    [key: string]: string;
  };
}

/**
 * Shadow tokens
 * Elevation and depth effects
 */
export interface ThemeShadows {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  [key: string]: string;
}

/**
 * Border radius tokens
 * Corner rounding values
 */
export interface ThemeRadii {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
  [key: string]: string;
}

/**
 * Transition tokens
 * Animation timing and easing
 */
export interface ThemeTransitions {
  fast: string;
  base: string;
  slow: string;
  [key: string]: string;
}

/**
 * Complete theme interface
 * All theme token categories combined
 */
export interface Theme {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  typography: ThemeTypography;
  shadows: ThemeShadows;
  radii: ThemeRadii;
  transitions: ThemeTransitions;
}

/**
 * Deep partial utility type
 * Allows partial theme customization at any depth
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : DeepPartial<T[P]>
    : T[P];
};

/**
 * Theme configuration for customization
 */
export interface ThemeConfig {
  theme?: DeepPartial<Theme>;
  extend?: DeepPartial<Theme>;
}

/**
 * Theme context value interface
 * Used by ThemeProvider context
 */
export interface ThemeContextValue {
  theme: Theme;
  mode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

/**
 * CSS variables record type
 * Generated CSS custom properties
 */
export type CSSVariables = Record<string, string>;
