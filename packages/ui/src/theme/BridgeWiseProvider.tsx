'use client';

import React from 'react';
import { ThemeProvider, ThemeProviderProps } from './ThemeProvider';
import type { BridgeWiseTheme, DeepPartial, Theme } from './types';

function normalizeBridgeWiseTheme(theme: BridgeWiseTheme): DeepPartial<Theme> {
  const normalized: DeepPartial<Theme> = {};

  if (theme.backgroundColor || theme.secondaryColor) {
    normalized.colors = {
      ...normalized.colors,
      background: {
        primary: theme.backgroundColor,
        secondary: theme.secondaryColor,
      },
    } as any;
  }

  if (theme.textColor || theme.primaryColor) {
    normalized.colors = {
      ...normalized.colors,
      foreground: {
        primary: theme.textColor,
        link: theme.primaryColor,
      },
    } as any;
  }

  if (theme.primaryColor || theme.secondaryColor) {
    normalized.colors = {
      ...normalized.colors,
      status: {
        pending: theme.primaryColor,
        success: theme.primaryColor,
      },
      transaction: {
        progressBar: {
          pending: theme.primaryColor,
        },
      },
    } as any;
  }

  if (theme.borderRadius) {
    normalized.radii = {
      lg: theme.borderRadius,
      md: theme.borderRadius,
      xl: theme.borderRadius,
    };
  }

  if (theme.fontFamily) {
    normalized.typography = {
      fontFamily: {
        sans: theme.fontFamily,
      },
    } as any;
  }

  if (theme.spacingUnit) {
    normalized.spacing = {
      xs: theme.spacingUnit,
      sm: theme.spacingUnit,
      md: theme.spacingUnit,
      lg: theme.spacingUnit,
      xl: theme.spacingUnit,
      '2xl': theme.spacingUnit,
    };
  }

  return normalized;
}

export interface BridgeWiseProviderProps extends Omit<ThemeProviderProps, 'theme'> {
  theme?: BridgeWiseTheme | DeepPartial<Theme>;
}

export const BridgeWiseProvider: React.FC<BridgeWiseProviderProps> = ({
  theme,
  ...rest
}) => {
  let normalizedTheme: DeepPartial<Theme> | undefined;

  if (theme) {
    const maybeTheme = theme as BridgeWiseTheme;
    if (
      'primaryColor' in maybeTheme ||
      'secondaryColor' in maybeTheme ||
      'backgroundColor' in maybeTheme ||
      'textColor' in maybeTheme ||
      'borderRadius' in maybeTheme ||
      'fontFamily' in maybeTheme ||
      'spacingUnit' in maybeTheme
    ) {
      normalizedTheme = normalizeBridgeWiseTheme(maybeTheme);
    } else {
      normalizedTheme = theme as DeepPartial<Theme>;
    }
  }

  return <ThemeProvider theme={normalizedTheme} {...rest} />;
};

