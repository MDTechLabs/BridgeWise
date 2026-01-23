/**
 * Default Theme
 * Semantic tokens that map primitive colors to meaningful contexts
 */

import { primitiveColors } from './primitives';
import type { Theme } from '../types';

export const defaultTheme: Theme = {
  colors: {
    background: {
      primary: primitiveColors.white,
      secondary: primitiveColors.slate[50],
      tertiary: primitiveColors.slate[100],
      inverse: primitiveColors.slate[900],
    },
    foreground: {
      primary: primitiveColors.slate[900],
      secondary: primitiveColors.slate[600],
      tertiary: primitiveColors.slate[400],
      inverse: primitiveColors.white,
      link: primitiveColors.blue[600],
    },
    border: {
      default: primitiveColors.slate[200],
      focus: primitiveColors.blue[500],
      error: primitiveColors.red[500],
    },
    status: {
      success: primitiveColors.green[500],
      error: primitiveColors.red[500],
      warning: primitiveColors.yellow[500],
      info: primitiveColors.blue[500],
      pending: primitiveColors.blue[600],
    },
    transaction: {
      background: primitiveColors.white,
      border: primitiveColors.slate[200],
      progressBar: {
        success: primitiveColors.green[500],
        error: primitiveColors.red[500],
        pending: primitiveColors.blue[600],
      },
    },
  },
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '1rem',       // 16px
    lg: '1.5rem',     // 24px
    xl: '2rem',       // 32px
    '2xl': '3rem',    // 48px
  },
  typography: {
    fontFamily: {
      sans: 'var(--font-geist-sans, system-ui, sans-serif)',
      mono: 'var(--font-geist-mono, ui-monospace, monospace)',
    },
    fontSize: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },
  radii: {
    none: '0',
    sm: '0.125rem',   // 2px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    full: '9999px',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
};
