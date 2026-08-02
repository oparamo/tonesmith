import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

const ternarySelector = 'ConditionalExpression:not(VariableDeclarator > ConditionalExpression):not(AssignmentExpression > ConditionalExpression):not(ArrowFunctionExpression > ConditionalExpression)';

// Em dash and Unicode minus. The en dash (U+2013) stays legal: it belongs in numeric ranges
// like "0–100", which the param catalog is full of.
const bannedDash = /[—−]/u;

// Nothing built in checks comment text, and an em dash in a comment is the same tell as one in a
// shipped string, so this walks both plus template chunks.
const noEmDash = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban em dashes and Unicode minus signs in code, strings, and comments.' },
    messages: {
      found: 'Remove "{{char}}". Restructure with a comma, colon, semicolon, parentheses, or a full stop.',
    },
  },
  create(context) {
    const check = (text, loc) => {
      const match = bannedDash.exec(text);
      if (match) context.report({ loc, messageId: 'found', data: { char: match[0] } });
    };
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          check(comment.value, comment.loc);
        }
      },
      Literal(node) {
        if (typeof node.value === 'string') check(node.value, node.loc);
      },
      TemplateElement(node) {
        check(node.value.raw, node.loc);
      },
    };
  },
};

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
    plugins: { sonarjs, tonesmith: { rules: { 'no-em-dash': noEmDash } } },
    rules: {
      // Clean Code, enforced rather than reviewed. F1: parameter objects past three arguments.
      // Library callbacks that dictate their own arity (commander's .action) disable it inline.
      'max-params': ['error', 3],
      // G5: two functions with identical bodies are one function and a caller.
      'sonarjs/no-identical-functions': 'error',
      'tonesmith/no-em-dash': 'error',
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
      // Ternaries must be assigned to a variable before use. A one-line arrow function's sole
      // implicit-return expression is exempt, since that IS its "assignment": the function's
      // return value. Everything else (template literals, call arguments, return statements
      // in block-bodied functions, object/array literal values) must extract to a variable first.
      'no-restricted-syntax': ['error', {
        selector: ternarySelector,
        message: 'Assign this ternary to a variable before using it.',
      }],
    },
  },
);
