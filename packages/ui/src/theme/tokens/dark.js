"use strict";
/**
 * Dark Theme Overrides
 * Semantic token overrides specifically for dark mode
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.darkTheme = void 0;
const primitives_1 = require("./primitives");
exports.darkTheme = {
    colors: {
        background: {
            primary: primitives_1.primitiveColors.slate[900],
            secondary: primitives_1.primitiveColors.slate[800],
            tertiary: primitives_1.primitiveColors.slate[700],
            inverse: primitives_1.primitiveColors.white,
        },
        foreground: {
            primary: primitives_1.primitiveColors.slate[50],
            secondary: primitives_1.primitiveColors.slate[400],
            tertiary: primitives_1.primitiveColors.slate[500],
            inverse: primitives_1.primitiveColors.slate[900],
            link: primitives_1.primitiveColors.blue[400],
        },
        border: {
            default: primitives_1.primitiveColors.slate[700],
            focus: primitives_1.primitiveColors.blue[400],
            error: primitives_1.primitiveColors.red[400],
        },
        status: {
            success: primitives_1.primitiveColors.green[400],
            error: primitives_1.primitiveColors.red[400],
            warning: primitives_1.primitiveColors.yellow[400],
            info: primitives_1.primitiveColors.blue[400],
            pending: primitives_1.primitiveColors.blue[500],
        },
        transaction: {
            background: primitives_1.primitiveColors.slate[800],
            border: primitives_1.primitiveColors.slate[700],
            progressBar: {
                success: primitives_1.primitiveColors.green[500],
                error: primitives_1.primitiveColors.red[500],
                pending: primitives_1.primitiveColors.blue[600],
            },
        },
    },
};
//# sourceMappingURL=dark.js.map