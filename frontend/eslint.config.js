import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  { files: ['vite.config.js'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by vite.config.js `define`.
        __APP_VERSION__: 'readonly',
        __APP_COMMIT__: 'readonly',
        __APP_BUILD_DATE__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // A strict React-compiler rule that flags the common "load on mount: set
      // loading state, then fetch" pattern. 13 existing pages use it and work
      // correctly; rewriting them all onto react-query is a behaviour-changing
      // refactor with no user-visible gain, so it is surfaced as a warning (still
      // listed on every lint run) instead of failing CI. New code should prefer
      // useApiQuery (src/lib/useApiQuery.js), which avoids the pattern.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
