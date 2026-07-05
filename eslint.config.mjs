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
      'mofacts/public/h5p-standalone/**',
      'mofacts/public/vendor/**',
      'deploy/local-data/**',
      'deploy/local-dev/**',
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
