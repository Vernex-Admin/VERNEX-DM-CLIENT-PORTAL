import babelParser from '@babel/eslint-parser'
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// typescript-eslint does not support TypeScript 7 yet, so files are parsed with Babel's
// TypeScript preset. Type checking and unused locals are tsc's job (npm run build).
const languageOptions = (plugins) => ({
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    babelOptions: { presets: ['@babel/preset-typescript'], plugins },
  },
  globals: { ...globals.browser, ...globals.node },
})

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  { files: ['**/*.ts'], languageOptions: languageOptions([]) },
  { files: ['**/*.tsx'], languageOptions: languageOptions(['@babel/plugin-syntax-jsx']) },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off', // tsc
      'no-unused-vars': 'off', // tsc (noUnusedLocals)
    },
  },
  {
    // Screens and components get data only through src/lib/queries, never from src/data.
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)data(/|$)',
              message: 'Import data through src/lib/queries. Only src/lib/queries may import src/data.',
            },
          ],
        },
      ],
    },
  },
]
