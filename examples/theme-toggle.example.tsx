/**
 * Theme Toggle Examples
 * Shows how to build theme switching controls
 */

'use client';

import { useTheme } from '@bridgewise/ui-components/theme';

/**
 * Example 1: Simple toggle button
 */
export function SimpleThemeToggle() {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      onClick={toggleMode}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
      aria-label="Toggle theme"
    >
      {mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
    </button>
  );
}

/**
 * Example 2: Three-way toggle (Light / System / Dark)
 */
export function AdvancedThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700">
      {(['light', 'system', 'dark'] as const).map((themeMode) => (
        <button
          key={themeMode}
          onClick={() => setMode(themeMode)}
          className={`px-4 py-2 text-sm font-medium transition ${
            mode === themeMode
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          } ${
            themeMode === 'light' ? 'rounded-l-lg' : themeMode === 'dark' ? 'rounded-r-lg' : ''
          }`}
        >
          {themeMode === 'light' && '☀️'}
          {themeMode === 'system' && '💻'}
          {themeMode === 'dark' && '🌙'}
          <span className="ml-1 capitalize">{themeMode}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Example 3: Dropdown menu
 */
export function ThemeDropdown() {
  const { mode, setMode } = useTheme();

  return (
    <div className="relative inline-block">
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as any)}
        className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="light">☀️ Light</option>
        <option value="system">💻 System</option>
        <option value="dark">🌙 Dark</option>
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Example 4: Icon-only toggle with animation
 */
export function AnimatedThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === 'dark';

  return (
    <button
      onClick={toggleMode}
      className="relative w-14 h-8 rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-300"
      aria-label="Toggle theme"
    >
      <div
        className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white dark:bg-yellow-400 shadow-md transform transition-transform duration-300 flex items-center justify-center ${
          isDark ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        {isDark ? '🌙' : '☀️'}
      </div>
    </button>
  );
}

/**
 * Example 5: With current theme display
 */
export function ThemeToggleWithInfo() {
  const { theme, mode, toggleMode } = useTheme();

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={toggleMode}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
      >
        Toggle Theme
      </button>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        <div>Mode: <span className="font-semibold capitalize">{mode}</span></div>
        <div>Background: <span className="font-mono text-xs">{theme.colors.background.primary}</span></div>
      </div>
    </div>
  );
}
