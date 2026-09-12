import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import prettier from 'eslint-config-prettier'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const GERMAN_IN_COMPONENT =
  'German text belongs in src/messages, not in a component. ' +
  'Use useTranslations() / getTranslations(). See docs/ui-conventions.md'

const config = [
  {
    ignores: [
      // A git worktree is a checkout of its own, at its own commit, with its own
      // lint run -- and this project puts them INSIDE the repository, under
      // .claude/worktrees/. Linting one from here reports findings about code
      // that is not on this branch and cannot be fixed from this directory.
      //
      // The symptom was the build output rather than the source: once a worktree
      // had been built, `pnpm lint` in the main checkout drowned in hundreds of
      // no-require-imports errors from minified vendor chunks -- exactly what
      // the patterns below exist to prevent, walked around by one directory
      // level. CI never saw it, because CI has no worktrees.
      '.claude/worktrees/**',
      // Prefixed with **/ rather than anchored at the root: an artefact
      // directory one level down is the same artefact directory.
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'next-env.d.ts',
      // Test and build artefacts: minified vendor bundles that would otherwise
      // drown the report in thousands of irrelevant findings.
      '**/playwright-report/**',
      '**/blob-report/**',
      '**/test-results/**',
      // The bundled collaboration server: generated output, not source.
      '**/dist/**',
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

  // --- goodworkshop-ui + i18n: what may not appear in UI code ----------------
  //
  // Both guardrails live in ONE `no-restricted-syntax` entry on purpose. Flat
  // config REPLACES a rule's options when a later block matches the same file,
  // so splitting them into two blocks over the same glob silently switched the
  // first one off -- which is exactly the kind of guardrail failure that looks
  // like everything is fine.
  //
  // No raw hex colours: category colours go through the .cat-* OKLCH tokens and
  // accents through --brand-*, or dark mode, the print stylesheet and tenant
  // branding end up disagreeing about a colour.
  //
  // No German prose: umlauts and ß are the cheap, reliable tell. It will not
  // catch "Save me" -- nothing lint-shaped would -- but it does catch the
  // realistic case, which is somebody adding a German label next to fifteen
  // translated ones because that is what the file used to look like.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\\b/]',
          message:
            'No raw hex colours in UI code. Category colours go through the .cat-* tokens, accents through --brand-*. See docs/ui-conventions.md',
        },
        {
          selector: 'Literal[value=/[äöüÄÖÜß]/]',
          message: GERMAN_IN_COMPONENT,
        },
        {
          selector: 'TemplateElement[value.raw=/[äöüÄÖÜß]/]',
          message: GERMAN_IN_COMPONENT,
        },
        {
          selector: 'JSXText[value=/[äöüÄÖÜß]/]',
          message: GERMAN_IN_COMPONENT,
        },
      ],
    },
  },

  // German is the SOURCE text, so these three keep the colour rule and lose the
  // language one: the reference agenda and the assertions that read it are
  // written in German, and translating a fixture would mean the export
  // snapshots stop showing what a German facilitator actually sees. The export
  // route's umlauts ARE the characters being transliterated, not prose.
  //
  // The hex selector is restated rather than inherited -- see the note above
  // about replacement.
  {
    // Scoped to the SAME directories as the block above. Listing bare
    // `src/**/*.test.ts` here would hand the colour rule to files it never
    // applied to -- src/lib/color's own tests are full of hex values on
    // purpose, because hex is what they convert.
    files: [
      'src/components/**/*.test.{ts,tsx}',
      'src/features/**/*.test.{ts,tsx}',
      'src/app/**/*.test.{ts,tsx}',
      'src/components/**/fixtures/**/*.{ts,tsx}',
      'src/features/**/fixtures/**/*.{ts,tsx}',
      'src/app/api/w/**/export/route.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\\b/]',
          message:
            'No raw hex colours in UI code. Category colours go through the .cat-* tokens, accents through --brand-*. See docs/ui-conventions.md',
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
