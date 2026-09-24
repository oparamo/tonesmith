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

// Both spellings Node accepts for the fs modules, so a bare "fs" can't slip past either rule.
const fsModules = ['fs', 'node:fs'];
const allFsModules = [...fsModules, 'fs/promises', 'node:fs/promises'];

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
      // Deliberately absent: 'no-duplicate-imports'. It fires on the type/value import split
      // (`import type { Patch }` beside `import { patchUtils }` from the same module), which is
      // the shape this codebase wants, so enabling it would trade a real convention for noise.
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
      // Every file operation awaits. A sync call blocks the MCP server's one thread, so every other
      // agent call waits behind a single read, and async is what lets calls on different files
      // overlap. CPU-bound work with no async counterpart isn't file I/O and isn't touched by this.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: fsModules,
          importNamePattern: 'Sync$',
          message: 'Use the async version from node:fs/promises.',
        }],
      }],
    },
  },
  {
    // Drivers convert bytes and never touch the disk. Core owns every read and write, which is what
    // lets it lock one file's read-change-write as a unit; a driver doing its own I/O would sit
    // outside that lock and could lose a concurrent edit. This replaces the rule above for these
    // files rather than adding to it, which is safe only because banning the modules outright
    // covers the Sync names too.
    files: ['core/src/devices/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: allFsModules,
          message: 'A driver converts bytes; file I/O belongs to core patchUtils.',
        }],
      }],
    },
  },
);
