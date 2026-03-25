/**
 * ThemeProvider Component
 * Core provider for BridgeWise theming system
 * Manages theme state, dark mode, and CSS variable injection
 */
'use client';
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTheme = exports.ThemeProvider = void 0;
const react_1 = __importStar(require("react"));
const merge_theme_1 = require("./utils/merge-theme");
const css_vars_1 = require("./utils/css-vars");
const tokens_1 = require("./tokens");
const ThemeContext = (0, react_1.createContext)(undefined);
const ThemeProvider = ({ children, theme: customTheme, defaultMode = 'system', storageKey = 'bridgewise-theme-mode', enableSystem = true, disableTransitionOnChange = true, attribute = 'data-theme', darkValue = 'dark', lightValue = 'light', }) => {
    const [mode, setModeState] = (0, react_1.useState)(defaultMode);
    const [resolvedMode, setResolvedMode] = (0, react_1.useState)('light');
    const [mounted, setMounted] = (0, react_1.useState)(false);
    // Merge custom theme with defaults
    const mergedTheme = (0, react_1.useMemo)(() => {
        const baseTheme = customTheme ? (0, merge_theme_1.mergeTheme)(tokens_1.defaultTheme, customTheme) : tokens_1.defaultTheme;
        const themeWithMode = resolvedMode === 'dark'
            ? (0, merge_theme_1.mergeTheme)(baseTheme, tokens_1.darkTheme)
            : baseTheme;
        return themeWithMode;
    }, [customTheme, resolvedMode]);
    // Initialize theme from storage/system on mount
    (0, react_1.useEffect)(() => {
        setMounted(true);
        // Load from storage
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(storageKey);
            if (stored && ['light', 'dark', 'system'].includes(stored)) {
                setModeState(stored);
            }
        }
    }, [storageKey]);
    // Handle system preference changes
    (0, react_1.useEffect)(() => {
        if (!enableSystem || !mounted)
            return;
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const updateResolvedMode = () => {
            if (mode === 'system') {
                setResolvedMode(mediaQuery.matches ? 'dark' : 'light');
            }
            else {
                setResolvedMode(mode);
            }
        };
        updateResolvedMode();
        // Listen for system changes
        mediaQuery.addEventListener('change', updateResolvedMode);
        return () => mediaQuery.removeEventListener('change', updateResolvedMode);
    }, [mode, enableSystem, mounted]);
    // Apply theme to DOM
    (0, react_1.useEffect)(() => {
        if (!mounted)
            return;
        const root = document.documentElement;
        // Disable transitions temporarily
        if (disableTransitionOnChange) {
            const css = document.createElement('style');
            css.textContent = '* { transition: none !important; }';
            document.head.appendChild(css);
            // Force reflow
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.head.removeChild(css);
                });
            });
        }
        // Set theme attribute
        if (attribute === 'class') {
            root.classList.remove(lightValue, darkValue);
            root.classList.add(resolvedMode === 'dark' ? darkValue : lightValue);
        }
        else {
            root.setAttribute(attribute, resolvedMode === 'dark' ? darkValue : lightValue);
        }
        // Generate and inject CSS variables
        const cssVars = (0, css_vars_1.generateCSSVariables)(mergedTheme);
        Object.entries(cssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }, [resolvedMode, mergedTheme, mounted, attribute, darkValue, lightValue, disableTransitionOnChange]);
    const setMode = (0, react_1.useCallback)((newMode) => {
        setModeState(newMode);
        if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, newMode);
        }
    }, [storageKey]);
    const toggleMode = (0, react_1.useCallback)(() => {
        setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'light' : 'light');
    }, [mode, setMode]);
    const value = (0, react_1.useMemo)(() => ({
        theme: mergedTheme,
        mode: resolvedMode,
        setMode,
        toggleMode,
    }), [mergedTheme, resolvedMode, setMode, toggleMode]);
    // Prevent flash on SSR
    if (!mounted) {
        return <>{children}</>;
    }
    return (<ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>);
};
exports.ThemeProvider = ThemeProvider;
/**
 * Hook to access theme context
 * @throws Error if used outside ThemeProvider
 */
const useTheme = () => {
    const context = (0, react_1.useContext)(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
exports.useTheme = useTheme;
//# sourceMappingURL=ThemeProvider.js.map