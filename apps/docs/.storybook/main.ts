// import type { StorybookConfig } from '@storybook/react-vite';

// const config: StorybookConfig = {
//   "stories": [
//     "../src/**/*.mdx",
//     "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
//   ],
//   "addons": [
//     "@chromatic-com/storybook",
//     "@storybook/addon-vitest",
//     "@storybook/addon-a11y",
//     "@storybook/addon-docs",
//     "@storybook/addon-onboarding"
//   ],
//   "framework": "@storybook/react-vite"
// };
// export default config;
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons:  [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
    // REMOVED:  "@storybook/addon-essentials" - already included in other addons
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // REMOVED: docs config - not needed, autodocs work via tags in stories
};

export default config;