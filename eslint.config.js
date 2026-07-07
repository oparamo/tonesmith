import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { sonarjs },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',
        args: 'all',
        argsIgnorePattern: '^_$',
        varsIgnorePattern: '^_$',
        caughtErrorsIgnorePattern: '^_$',
      }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'sonarjs/cognitive-complexity': ['error', 10],
      'no-nested-ternary': 'error',
      'max-depth': ['error', 4],
    },
  },
);
