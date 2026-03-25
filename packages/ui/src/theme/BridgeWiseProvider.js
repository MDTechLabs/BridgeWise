'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeWiseProvider = void 0;
const react_1 = __importDefault(require("react"));
const ThemeProvider_1 = require("./ThemeProvider");
function normalizeBridgeWiseTheme(theme) {
    const normalized = {};
    if (theme.backgroundColor || theme.secondaryColor) {
        normalized.colors = {
            ...normalized.colors,
            background: {
                primary: theme.backgroundColor,
                secondary: theme.secondaryColor,
            },
        };
    }
    if (theme.textColor || theme.primaryColor) {
        normalized.colors = {
            ...normalized.colors,
            foreground: {
                primary: theme.textColor,
                link: theme.primaryColor,
            },
        };
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
        };
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
        };
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
const BridgeWiseProvider = ({ theme, ...rest }) => {
    let normalizedTheme;
    if (theme) {
        const maybeTheme = theme;
        if ('primaryColor' in maybeTheme ||
            'secondaryColor' in maybeTheme ||
            'backgroundColor' in maybeTheme ||
            'textColor' in maybeTheme ||
            'borderRadius' in maybeTheme ||
            'fontFamily' in maybeTheme ||
            'spacingUnit' in maybeTheme) {
            normalizedTheme = normalizeBridgeWiseTheme(maybeTheme);
        }
        else {
            normalizedTheme = theme;
        }
    }
    return <ThemeProvider_1.ThemeProvider theme={normalizedTheme} {...rest}/>;
};
exports.BridgeWiseProvider = BridgeWiseProvider;
//# sourceMappingURL=BridgeWiseProvider.js.map