import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import prettier from 'eslint-config-prettier'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      // Test and build artefacts: minified vendor bundles that would otherwise
      // drown the report in thousands of irrelevant findings.
      'playwright-report/**',
      'blob-report/**',
      'test-results/**',
      // The bundled collaboration server: generated output, not source.
      'dist/**',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  prettier,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // --- goodworkshop-ui: no raw hex colours in UI code -------------------------
  // Category colours go through the .cat-* OKLCH tokens, accent colours through
  // --brand-*. A hex literal here means a colour that dark mode, the print
  // stylesheet and tenant branding will all silently disagree about.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\\b/]',
          message:
            'Keine rohen Hex-Farben in UI-Code. Kategoriefarben über die .cat-*-Tokens, Akzente über --brand-*. Siehe docs/konventionen-ui.md',
        },
      ],
    },
  },

  // --- RLS seam: the raw db handle must never escape src/server/db -----------
  // Every query has to run inside withTenant() so that app.tenant_id is set.
  // An import of the raw client anywhere else is a tenant-isolation bug.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/server/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/db/client', '@/server/db/client'],
              message:
                'Das rohe db-Handle ist modul-privat. Nutze withTenant() / withAuth() / withOps() aus @/server/db. Siehe Plan §RLS.',
            },
          ],
        },
      ],
    },
  },
]

export default config
