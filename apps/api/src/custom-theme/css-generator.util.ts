import { ThemeConfig } from './theme-config.types';

/**
 * Converts a camelCase key to a CSS custom property name.
 * e.g. "primaryHover" → "--color-primary-hover"
 */
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function sectionPrefix(section: string): string {
  const map: Record<string, string> = {
    colors: '--color',
    typography: '--font',
    spacing: '--spacing',
    borderRadius: '--radius',
    shadows: '--shadow',
    transitions: '--transition',
    breakpoints: '--bp',
    zIndex: '--z',
  };
  return map[section] ?? `--${camelToKebab(section)}`;
}

export function generateCssVariables(
  config: ThemeConfig,
): Record<string, string> {
  const vars: Record<string, string> = {};

  const sections: Array<keyof ThemeConfig> = [
    'colors',
    'typography',
    'spacing',
    'borderRadius',
    'shadows',
    'transitions',
    'breakpoints',
    'zIndex',
  ];

  for (const section of sections) {
    const sectionData = config[section] as Record<string, unknown>;
    if (!sectionData || typeof sectionData !== 'object') continue;

    const prefix = sectionPrefix(section);

    for (const [key, value] of Object.entries(sectionData)) {
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const varName = `${prefix}-${camelToKebab(key)}`;
      vars[varName] = String(value);
    }
  }

  // Custom CSS variables pass-through
  if (config.customCssVariables) {
    for (const [key, value] of Object.entries(config.customCssVariables)) {
      const cssKey = key.startsWith('--')
        ? key
        : `--custom-${camelToKebab(key)}`;
      vars[cssKey] = value;
    }
  }

  return vars;
}

export function generateDarkModeVariables(
  config: ThemeConfig,
): Record<string, string> | undefined {
  if (!config.darkModeEnabled || !config.darkModeColors) return undefined;

  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.darkModeColors)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    vars[`--color-${camelToKebab(key)}`] = String(value);
  }
  return vars;
}

export function variablesToCssString(
  vars: Record<string, string>,
  selector = ':root',
): string {
  const declarations = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selector} {\n${declarations}\n}`;
}

export function generateFullCssBundle(config: ThemeConfig): string {
  const rootVars = generateCssVariables(config);
  const rootCss = variablesToCssString(rootVars, ':root');

  const darkVars = generateDarkModeVariables(config);
  const darkCss = darkVars
    ? `\n\n@media (prefers-color-scheme: dark) {\n${variablesToCssString(darkVars, '  :root')}\n}`
    : '';

  return rootCss + darkCss;
}
