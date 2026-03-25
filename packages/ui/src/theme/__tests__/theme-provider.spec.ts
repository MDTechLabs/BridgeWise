import { mergeTheme, generateCSSVariables } from '../utils';
import { defaultTheme, darkTheme } from '../tokens';
import type { DeepPartial, Theme } from '../types';

describe('BridgeWise theme utilities', () => {
  it('merges custom theme overrides with defaults', () => {
    const override: DeepPartial<Theme> = {
      colors: {
        background: {
          primary: '#000000',
        },
      },
    };

    const merged = mergeTheme(defaultTheme, override);

    expect(merged.colors.background.primary).toBe('#000000');
    expect(merged.colors.background.secondary).toBe(defaultTheme.colors.background.secondary);
  });

  it('generates CSS variables from a theme object', () => {
    const cssVars = generateCSSVariables(defaultTheme);

    expect(cssVars['--bw-colors-background-primary']).toBe(defaultTheme.colors.background.primary);
    expect(cssVars['--bw-typography-font-size-base']).toBe(defaultTheme.typography.fontSize.base);
  });

  it('applies dark theme overrides on top of defaults', () => {
    const merged = mergeTheme(defaultTheme, darkTheme);

    expect(merged.colors.background.primary).toBe(darkTheme.colors?.background?.primary);
    expect(merged.colors.foreground.primary).toBe(darkTheme.colors?.foreground?.primary);
  });
});

