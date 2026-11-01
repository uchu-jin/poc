import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const htmlMsg = 'textContent を使う（docs/rules/security.md）';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['**/*.mjs', 'eslint.config.js', 'vite.config.ts', 'playwright.config.ts'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['src/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: htmlMsg },
        { property: 'outerHTML', message: htmlMsg },
        { property: 'insertAdjacentHTML', message: htmlMsg },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]',
          message: htmlMsg,
        },
        {
          selector:
            'MemberExpression[computed=true][property.value=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]',
          message: htmlMsg,
        },
      ],
    },
  },
  {
    files: ['src/core/**'],
    rules: {
      // src/core は同じ seed・同じ手入れで同じ木になること（FR-008）を守るため、乱数・時刻・DOM・Three.js に依存させない。
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'src/core では Math.random を使わない。seed から作る Rng を通す（CLAUDE.md 実装ルール、FR-008）',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'src/core では Date.now を使わない。時刻は Clock に渡す（CLAUDE.md 実装ルール、FR-008）',
        },
        { property: 'innerHTML', message: htmlMsg },
        { property: 'outerHTML', message: htmlMsg },
        { property: 'insertAdjacentHTML', message: htmlMsg },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage'].map((name) => ({
          name,
          message: `src/core では ${name} を使わない。Node の Vitest でそのまま動かすため DOM に依存させない（CLAUDE.md、docs/rules/architecture.md）`,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message:
                'src/core では three を import しない。描画は src/render に置く（CLAUDE.md、docs/rules/architecture.md）',
            },
          ],
        },
      ],
    },
  },
);
