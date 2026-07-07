import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

const ternarySelector = 'ConditionalExpression:not(VariableDeclarator > ConditionalExpression):not(AssignmentExpression > ConditionalExpression):not(ArrowFunctionExpression > ConditionalExpression)';

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
      'no-unneeded-ternary': 'error',
      'max-depth': ['error', 4],
      // Ternaries must be assigned to a variable before use — a one-line arrow function's
      // sole implicit-return expression is exempt (that IS its "assignment": the function's
      // return value). Everything else (template literals, call arguments, return statements
      // in block-bodied functions, object/array literal values) must extract to a variable first.
      'no-restricted-syntax': ['error', {
        selector: ternarySelector,
        message: 'Assign this ternary to a variable before using it.',
      }],
    },
  },
);
