/**
 * Dark Theme Overrides
 * Semantic token overrides specifically for dark mode
 */

import { primitiveColors } from './primitives';
import type { DeepPartial, Theme } from '../types';

export const darkTheme: DeepPartial<Theme> = {
  colors: {
    background: {
      primary: primitiveColors.slate[900],
      secondary: primitiveColors.slate[800],
      tertiary: primitiveColors.slate[700],
      inverse: primitiveColors.white,
    },
    foreground: {
      primary: primitiveColors.slate[50],
      secondary: primitiveColors.slate[400],
      tertiary: primitiveColors.slate[500],
      inverse: primitiveColors.slate[900],
      link: primitiveColors.blue[400],
    },
    border: {
      default: primitiveColors.slate[700],
      focus: primitiveColors.blue[400],
      error: primitiveColors.red[400],
    },
    status: {
      success: primitiveColors.green[400],
      error: primitiveColors.red[400],
      warning: primitiveColors.yellow[400],
      info: primitiveColors.blue[400],
      pending: primitiveColors.blue[500],
    },
    transaction: {
      background: primitiveColors.slate[800],
      border: primitiveColors.slate[700],
      progressBar: {
        success: primitiveColors.green[500],
        error: primitiveColors.red[500],
        pending: primitiveColors.blue[600],
      },
    },
  },
};
