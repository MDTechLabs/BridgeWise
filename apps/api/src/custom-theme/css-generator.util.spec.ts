import {
  generateCssVariables,
  generateDarkModeVariables,
  generateFullCssBundle,
  variablesToCssString,
} from './css-generator.util';
import { DEFAULT_THEME_CONFIG, ThemeConfig } from './theme-config.types';

describe('CssGeneratorUtil', () => {
  describe('generateCssVariables', () => {
    it('should generate CSS variables from the default config', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);

      expect(vars).toBeDefined();
      expect(typeof vars).toBe('object');
    });

    it('should map primary color to --color-primary', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      expect(vars['--color-primary']).toBe('#6366F1');
    });

    it('should map font family to --font-font-family-heading', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      expect(vars['--font-font-family-heading']).toContain('Inter');
    });

    it('should map spacing unit to --spacing-unit', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      expect(vars['--spacing-unit']).toBe('4');
    });

    it('should map border radius to --radius-base', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      expect(vars['--radius-base']).toBe('4px');
    });

    it('should map shadow to --shadow-base', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      expect(vars['--shadow-base']).toBeDefined();
    });

    it('should prefix custom CSS variables with --custom-', () => {
      const config: ThemeConfig = {
        ...DEFAULT_THEME_CONFIG,
        customCssVariables: { ribbonColor: '#FF0000' },
      };
      const vars = generateCssVariables(config);
      expect(vars['--custom-ribbon-color']).toBe('#FF0000');
    });

    it('should preserve custom variables that already start with --', () => {
      const config: ThemeConfig = {
        ...DEFAULT_THEME_CONFIG,
        customCssVariables: { '--my-var': 'blue' },
      };
      const vars = generateCssVariables(config);
      expect(vars['--my-var']).toBe('blue');
    });

    it('should produce all keys as strings starting with --', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      for (const key of Object.keys(vars)) {
        expect(key.startsWith('--')).toBe(true);
      }
    });

    it('should not include null/undefined values', () => {
      const vars = generateCssVariables(DEFAULT_THEME_CONFIG);
      for (const val of Object.values(vars)) {
        expect(val).not.toBeNull();
        expect(val).not.toBeUndefined();
        expect(val).not.toBe('null');
        expect(val).not.toBe('undefined');
      }
    });
  });

  describe('generateDarkModeVariables', () => {
    it('should return undefined when dark mode is disabled', () => {
      const result = generateDarkModeVariables({
        ...DEFAULT_THEME_CONFIG,
        darkModeEnabled: false,
      });
      expect(result).toBeUndefined();
    });

    it('should return undefined when no darkModeColors provided', () => {
      const result = generateDarkModeVariables({
        ...DEFAULT_THEME_CONFIG,
        darkModeEnabled: true,
        darkModeColors: undefined,
      });
      expect(result).toBeUndefined();
    });

    it('should generate dark mode variables when enabled and colors provided', () => {
      const config: ThemeConfig = {
        ...DEFAULT_THEME_CONFIG,
        darkModeEnabled: true,
        darkModeColors: {
          background: '#1A1A2E',
          surface: '#16213E',
          textPrimary: '#E0E0E0',
        },
      };
      const vars = generateDarkModeVariables(config);

      expect(vars).toBeDefined();
      expect(vars!['--color-background']).toBe('#1A1A2E');
      expect(vars!['--color-surface']).toBe('#16213E');
      expect(vars!['--color-text-primary']).toBe('#E0E0E0');
    });

    it('should skip undefined values in darkModeColors', () => {
      const config: ThemeConfig = {
        ...DEFAULT_THEME_CONFIG,
        darkModeEnabled: true,
        darkModeColors: { background: '#000', primary: undefined as any },
      };
      const vars = generateDarkModeVariables(config);
      expect(vars!['--color-background']).toBe('#000');
      expect(vars!['--color-primary']).toBeUndefined();
    });
  });

  describe('variablesToCssString', () => {
    it('should wrap variables in :root by default', () => {
      const css = variablesToCssString({ '--color-primary': '#6366F1' });
      expect(css).toContain(':root {');
      expect(css).toContain('--color-primary: #6366F1;');
      expect(css).toContain('}');
    });

    it('should use custom selector when provided', () => {
      const css = variablesToCssString({ '--x': 'y' }, '.my-scope');
      expect(css).toContain('.my-scope {');
    });

    it('should produce one declaration per variable', () => {
      const vars = { '--a': '1', '--b': '2', '--c': '3' };
      const css = variablesToCssString(vars);
      expect((css.match(/;/g) ?? []).length).toBe(3);
    });
  });

  describe('generateFullCssBundle', () => {
    it('should return a non-empty string', () => {
      const css = generateFullCssBundle(DEFAULT_THEME_CONFIG);
      expect(typeof css).toBe('string');
      expect(css.length).toBeGreaterThan(0);
    });

    it('should contain :root block', () => {
      const css = generateFullCssBundle(DEFAULT_THEME_CONFIG);
      expect(css).toContain(':root {');
    });

    it('should not include dark mode block when disabled', () => {
      const css = generateFullCssBundle({
        ...DEFAULT_THEME_CONFIG,
        darkModeEnabled: false,
      });
      expect(css).not.toContain('@media (prefers-color-scheme: dark)');
    });

    it('should include dark mode media query when enabled', () => {
      const css = generateFullCssBundle({
        ...DEFAULT_THEME_CONFIG,
        darkModeEnabled: true,
        darkModeColors: { background: '#000' },
      });
      expect(css).toContain('@media (prefers-color-scheme: dark)');
    });
  });
});
