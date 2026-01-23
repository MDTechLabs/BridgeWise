/**
 * Custom Theme Configuration Example
 * Shows how external developers can customize the BridgeWise theme
 */

import { ThemeProvider } from '@bridgewise/ui-components/theme';
import type { Theme, DeepPartial } from '@bridgewise/ui-components';

/**
 * Example: Custom brand colors
 */
const customTheme: DeepPartial<Theme> = {
  colors: {
    background: {
      primary: '#fafafa',
      secondary: '#f4f4f5',
    },
    foreground: {
      primary: '#18181b',
      link: '#3b82f6',
    },
    transaction: {
      background: '#ffffff',
      border: '#e4e4e7',
      progressBar: {
        success: '#22c55e',
        error: '#ef4444',
        pending: '#3b82f6',
      },
    },
  },
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1.25rem',
  },
  typography: {
    fontFamily: {
      sans: 'Inter, system-ui, sans-serif',
    },
  },
};

/**
 * Example: Dark-first theme
 */
const darkFirstTheme: DeepPartial<Theme> = {
  colors: {
    background: {
      primary: '#0a0a0a',
      secondary: '#171717',
    },
    foreground: {
      primary: '#ffffff',
      secondary: '#a3a3a3',
    },
  },
};

/**
 * Usage in your app
 */
export function App() {
  return (
    <ThemeProvider theme={customTheme} defaultMode="system">
      {/* Your application components */}
    </ThemeProvider>
  );
}

/**
 * Force dark mode
 */
export function DarkApp() {
  return (
    <ThemeProvider theme={darkFirstTheme} defaultMode="dark">
      {/* Your application components */}
    </ThemeProvider>
  );
}
