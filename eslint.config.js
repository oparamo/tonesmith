import { basename } from 'node:path';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';

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

// A file is named for what it holds, in the same camelCase as the names it exports, so a reader
// finding `patchService` knows the file to open. Test and config files keep the `.test` and
// `.config` suffixes Vitest and tsup look for.
const camelCaseFileName = /^[a-z][a-zA-Z0-9]*(\.test|\.config)?\.ts$/u;

const fileNameCase = {
  meta: {
    type: 'problem',
    docs: { description: 'Require camelCase file names.' },
    messages: { name: 'Name this file in camelCase, as its exports are named: "{{name}}".' },
  },
  create(context) {
    return {
      Program(node) {
        const name = basename(context.filename);
        if (!camelCaseFileName.test(name)) context.report({ node, messageId: 'name', data: { name } });
      },
    };
  },
};

// A file importing its own folder's barrel imports itself back through the re-export. no-cycle
// ignores a type-only import, since it is erased at build, so this keeps the pattern out of the
// types as well.
const ownBarrel = {
  regex: '^\\.(/index)?$',
  message: "Import the module itself: this folder's barrel re-exports this file.",
};

// Both spellings Node accepts for the fs modules, so a bare "fs" can't slip past either rule.
const fsModules = ['fs', 'node:fs'];
const allFsModules = [...fsModules, 'fs/promises', 'node:fs/promises'];

/** The patterns that match an import from any of the named folders, at any depth. */
const folderPatterns = folders => folders.flatMap(folder => [`**/${folder}`, `**/${folder}/**`]);

/**
 * One config block per layer, naming the folders its files may not import from: the layers above
 * it, which depend on it and not the other way round. Drivers additionally have no fs module at all.
 */
const layerRules = layers => layers.map(({ files, forbidden, banFs = false }) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        banFs
          ? { group: allFsModules, message: 'A driver converts bytes; file I/O belongs to core persistence.' }
          : { group: fsModules, importNamePattern: 'Sync$', message: 'Use the async version from node:fs/promises.' },
        { group: folderPatterns(forbidden), message: `This layer does not import from ${forbidden.join(', ')}.` },
        ownBarrel,
      ],
    }],
  },
}));

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
    settings: {
      // no-cycle follows each import into the file it names, so it has to parse TypeScript and
      // resolve an extensionless relative path to its .ts file.
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts'] },
      'import-x/extensions': ['.ts', '.js'],
      'import-x/resolver-next': [createNodeResolver({ extensions: ['.ts', '.js', '.json'] })],
    },
    plugins: { sonarjs, 'import-x': importX, tonesmith: { rules: { 'no-em-dash': noEmDash, 'file-name-case': fileNameCase } } },
    rules: {
      // Clean Code, enforced rather than reviewed. F1: parameter objects past three arguments.
      // Library callbacks that dictate their own arity (commander's .action) disable it inline.
      'max-params': ['error', 3],
      // G5: two functions with identical bodies are one function and a caller.
      'sonarjs/no-identical-functions': 'error',
      // Deliberately absent: 'no-duplicate-imports'. It fires on the type/value import split
      // (`import type { Patch }` beside `import { patchService }` from the same module), which is
      // the shape this codebase wants, so enabling it would trade a real convention for noise.
      'tonesmith/no-em-dash': 'error',
      'tonesmith/file-name-case': 'error',
      // An import cycle leaves some module reading another's exports before they exist, and the layer
      // rules can't see one inside a single layer.
      'import-x/no-cycle': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',
        args: 'all',
        argsIgnorePattern: '^_$',
        varsIgnorePattern: '^_$',
        caughtErrorsIgnorePattern: '^_$',
      }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'sonarjs/cognitive-complexity': ['error', 6],
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
        patterns: [
          {
            group: fsModules,
            importNamePattern: 'Sync$',
            message: 'Use the async version from node:fs/promises.',
          },
          ownBarrel,
        ],
      }],
    },
  },
  // Folders are layers, and each imports only the layers below it. A later block replaces
  // no-restricted-imports rather than adding to it, so every block restates the sync-fs ban.
  ...layerRules([
    // The shared layer knows no device: only the roster and the composition root name one, so a
    // second device never needs a shared file edited to make room for it.
    { files: ['core/src/service/**'], forbidden: ['device'] },
    { files: ['core/src/persistence/**'], forbidden: ['service', 'device'] },
    { files: ['core/src/model/**', 'core/src/common/**'], forbidden: ['service', 'persistence', 'device'] },
    // Drivers convert bytes and never touch the disk. Core owns every read and write, which is what
    // lets it lock one file's read-change-write as a unit; a driver doing its own I/O would sit
    // outside that lock and could lose a concurrent edit.
    { files: ['core/src/device/**'], forbidden: ['persistence'], banFs: true },
    { files: ['core/src/device/*/model/**'], forbidden: ['persistence', 'format', 'catalog', 'spec'], banFs: true },
    { files: ['core/src/device/*/format/**'], forbidden: ['persistence', 'catalog', 'spec'], banFs: true },
    { files: ['core/src/device/*/catalog/**'], forbidden: ['persistence', 'spec'], banFs: true },
  ]),
);
