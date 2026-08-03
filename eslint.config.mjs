import appConfig from './mofacts/eslint.config.mjs';

const [, ...sharedConfig] = appConfig;

export default [
  {
    ignores: [
      '.git/**',
      '.vscode/**',
      'node_modules/**',
      'mofacts/.vscode/**',
      'mofacts/node_modules/**',
      'mofacts/.meteor/**',
      'mofacts/_build/**',
      'mofacts/coverage/**',
      'mofacts/public/vendor/**',
      // Exact pinned upstream Meteor source; validated by the CI harness.
      'mofacts/packages/rspack/**',
      'mofacts/public/build-assets/**',
      'mofacts/public/build-chunks/**',
      'mofacts/private/build-assets/**',
      'mofacts/private/build-chunks/**',
      'deploy/local-data/**',
      'deploy/local-dev/**',
      'deploy/local-hotfix/**',
      'deploy/local-build/**',
    ],
  },
  ...sharedConfig,
  {
    files: ['mofacts/client/views/experiment/svelte/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
