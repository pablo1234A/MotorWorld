// Reglas de lint del monorepo (ESLint 10, configuración plana). `npm run lint` las aplica en la
// CI. Se usan los conjuntos recomendados sin desactivarlos en bloque: las excepciones van en la
// propia línea, con su motivo.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/test-results/**', '**/e2e/.output/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Variables sin usar: error, salvo las que empiezan por «_» (parámetros obligatorios de una firma).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Pruebas: se permite `any` para leer respuestas JSON sin tipar cada una.
    files: ['**/test/**/*.{ts,tsx}', '**/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
