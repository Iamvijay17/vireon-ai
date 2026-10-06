const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'remotion/', 'jobs/', 'logs/', 'scripts/'] },
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Best-effort cleanup (`try { await fs.unlink(p); } catch {}`) is deliberate.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `_`-prefixed args/vars are intentionally unused (Express error
      // handlers need all four params, destructuring drops fields, etc.).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
];
