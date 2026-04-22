import globals from 'globals';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      '.vscode/**',
      '.meteor/**',
      'node_modules/**',
      '_build/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,

        // Meteor globals
        Meteor: 'readonly',
        Session: 'readonly',
        Template: 'readonly',
        Tracker: 'readonly',
        Blaze: 'readonly',
        ReactiveVar: 'readonly',
        ReactiveDict: 'readonly',
        Router: 'readonly',
        FlowRouter: 'readonly',
        BlazeLayout: 'readonly',
        Match: 'readonly',
        check: 'readonly',
        EJSON: 'readonly',
        DDP: 'readonly',
        Accounts: 'readonly',
        Random: 'readonly',
        OAuth: 'readonly',
        HTTP: 'readonly',
        Package: 'readonly',
        Assets: 'readonly',
        Npm: 'readonly',
        Microsoft: 'writable',
        ServiceConfiguration: 'readonly',

        // Collections (defined in common/Collections.js)
        Tdfs: 'readonly',
        Stims: 'readonly',
        Histories: 'readonly',
        UserTimesLog: 'readonly',
        DynamicAssets: 'readonly',
        GlobalExperimentStates: 'readonly',
        Courses: 'readonly',
        Sections: 'readonly',
        SectionUserMap: 'readonly',
        Assignments: 'readonly',
        UserMetrics: 'readonly',
        DynamicSettings: 'readonly',
        DynamicConfig: 'readonly',
        ErrorReports: 'readonly',
        UserUploadQuota: 'readonly',
        UserDashboardCache: 'readonly',
        ScheduledTurkMessages: 'readonly',
        AuditLog: 'readonly',
        PasswordResetTokens: 'readonly',
        ClozeEditHistory: 'readonly',
        itemSourceSentences: 'readonly',

        // jQuery
        $: 'readonly',
        jQuery: 'readonly',
        bootstrap: 'readonly',

        // Underscore/Lodash
        _: 'readonly',

        // Browser APIs
        Audio: 'readonly',
        MediaRecorder: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        JSONEditor: 'readonly',
        SyncedCron: 'readonly',
        Email: 'readonly',
        Papa: 'readonly',

        // Test globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      // Core rules for state management refactor
      'no-undef': 'warn',
      'no-implicit-globals': 'warn',

      // Helpful rules (warnings to not block build)
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-redeclare': 'warn',

      // Disabled rules (too noisy for legacy code)
      'no-console': 'off',
      'semi': 'off',
      'quotes': 'off',
      'indent': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TS has its own symbol resolution.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
  {
    files: ['client/views/experiment/svelte/**/*.ts'],
    rules: {
      // Staged hardening: start by surfacing explicit any usage in the Svelte card flow.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
