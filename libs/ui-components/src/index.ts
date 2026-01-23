/**
 * BridgeWise UI Components
 * Main entry point for the component library
 */

// Theme System
export {
  ThemeProvider,
  useTheme,
  ThemeScript,
  defaultTheme,
  darkTheme,
  primitiveColors,
  mergeTheme,
  generateCSSVariables,
} from './theme';

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
} from './theme';

// Components
export {
  TransactionHeartbeat,
  TransactionProvider,
  useTransaction,
} from './components/TransactionHeartbeat';

export type {
  TransactionState,
} from './components/TransactionHeartbeat';
