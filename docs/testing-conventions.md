# Test strategy

Binding when tests are written or changed, when test gaps are assessed, or when a new domain
table or pure function appears.

## A test pyramid, broad at the bottom

Guide values, not dogma — but **inverting the proportions blocks review**.

| Level                   | Share | Tool                                                 | What belongs here                                                                                                                                                                                  |
| ----------------------- | ----- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                    | ~70 % | Vitest                                               | Pure functions: `computeSchedule`, `getProjection`, `flatten`, `applyOp`/`invertOp`, `parseDuration`, the Markdown serialiser, Ajv validation, fractional keys, locale resolution and the catalogs |
| Integration / component | ~25 % | Vitest + Testing Library, Postgres service container | Components with real user events; repository functions against a real database including RLS and composite FKs                                                                                     |
| E2E                     | ~5 %  | Playwright                                           | Critical paths only — nothing already covered a level below                                                                                                                                        |

## Rules

### Pure functions get test tables, not individual cases

`computeSchedule`, `getProjection` and `parseDuration` each have an exhaustive `it.each` table.
Those three tables are written **before** the implementation they cover.

**`computeSchedule`:** empty day · pins only · pin before the cursor (overlap) · pin after the
cursor (gap) · cluster pin · overnight session (`end > 1440`) · zero-duration blocks.

**`getProjection`:** into a cluster · out of a cluster · between clusters · reordering clusters
· empty cluster · collapsed cluster · first row · last row · cluster onto itself · depth clamp.

**`parseDuration`:** `45`, `45m`, `1h`, `1:30`, `1h30`, `90` — plus garbage, negatives and
overflow. Per language on top of that, including the cross-language negative: `'1 Stunde'` under
English must be `null`, or the four vocabularies silently merge into one permissive blob.

### Every domain table needs a cross-tenant test

Before it may reach `main`: write in tenant A, expect zero rows as tenant B; and an insert with
a foreign `tenant_id` must fail on the `WITH CHECK`. The RLS metadata test (every table has
`relrowsecurity`, `relforcerowsecurity` and a policy) runs as its own CI job and is a **hard
fail**.

A new table without RLS is a silent, total data leak with no symptom. This is the most
important test in the project.

### Component tests drive real `userEvent`

Never direct state manipulation. What is tested is what the user sees — **roles and accessible
names**, no `data-testid` chains, no snapshot tests of whole trees.

Components that render translated text go through `renderWithIntl()` from `src/test/intl`. Not
a mock: a stub would make the assertions statements about the stub. German is the source text,
so a test rendered that way asserts exactly the strings it asserted before the catalogs
existed.

### Assertions name keys, not sentences

A domain error is asserted as `toThrow('tags.tooMany')` and its arguments as `params`, not as a
German sentence. That is the stronger claim — it pins _which_ rule fired, where a regex over
words passed just as happily when a different rule caught the same input first — and it
survives the sentence being rephrased in four languages.

### The catalogs are checked, not trusted

`src/i18n/catalogs.test.ts` asserts more than key parity, because key parity alone misses the
two faults that survive review: a placeholder renamed during translation, and a plural missing
the category its language actually needs. Both render without an error — the first prints
`{count}` at a facilitator, the second silently picks the wrong form.

It also walks `DOMAIN_ERROR_KEYS`, `FIELD_ERROR_KEYS`, `SCOPES` and `WORKSHOP_STATUSES` against
all four catalogs. Those are `as const` arrays rather than bare TypeScript unions for exactly
that reason: a union cannot be iterated, and a check nobody can run is not a check.

### E2E runs against the standalone artifact, not `next dev`

`pnpm test:e2e` builds and starts `scripts/start-standalone.mjs` — byte for byte what the
Docker image serves. `next start` does not work with `output: 'standalone'` at all (it warns
and serves something else). Anybody changing the copy steps in `start-standalone.mjs` has to
carry them into the `Dockerfile`: a divergence there means green tests with a broken image.

### The E2E suite runs Chromium, and Chromium is not a phone

`devices['Pixel 5']` gives a viewport, touch events and `pointer: coarse`. It does **not** give
WebKit's behaviour, and two bugs have now reached a real phone through a green pipeline:

- a control hidden behind `group-hover` — Playwright counts an `opacity: 0` element as visible
  and taps it happily;
- a popover that closed on an unattributable focus-out — Chromium focuses a button when it is
  tapped, so `relatedTarget` was the option and the list stayed open. iOS Safari does not focus
  buttons on tap, so the same tap closed the list before the click.

Both were found by a person holding a phone, not by the suite. So: **a touch interaction whose
correctness depends on focus or on what is visible belongs in a component test that states the
engine behaviour outright** — `fireEvent.focusOut(option, { relatedTarget: null })` is a claim
about WebKit that a Chromium run can neither confirm nor refute. Playwright's own WebKit is not
the answer either: it is an engine, not a device, and on macOS it currently cannot even load the
app's assets.

### The E2E suite is pinned to German

`playwright.config.ts` sets `locale: 'de-DE'`, and that is load-bearing rather than tidy.
Chromium otherwise sends the host's locale — in a CI container, `en-US` — and since the
application resolves its language from `Accept-Language` when there is no session, every German
accessible name in `e2e/` would stop matching at once, with a failure that looks like broken
markup rather than a language switch. German is the source text; the suite asserts against it.

English is covered deliberately, by `e2e/locale.spec.ts` in a project that sets its own locale
and carries no session — the only combination that exercises the `Accept-Language` leg at all.

Note the shape of that config: `locale` and not an explicit `Accept-Language` header. Playwright
derives the header from `locale`, and a header set at the top level would silently override the
locale a project sets for itself.

### Elements are found by role and accessible name

Concretely in the agenda: a block is `getByRole('article', { name: <title> })`, a cluster
`getByRole('group', { name: <title> })`, the agenda itself
`getByRole('region', { name: /^Agenda/ })`.

**Not** `getByRole('listitem')` — the `<li>` elements inside descriptions carry the same role,
and a query that hits both is not merely a test problem: it shows that the markup does not
express the structure. When a test struggles here, it is usually the semantics that need
fixing, not the selector.

### E2E covers exactly these flows — no more

1. Magic-link login
2. Creating a workshop and filling a day
3. Drag and drop with the mouse **and** with the keyboard, each asserting the recomputed times
4. Setting a pin and checking that the rest moves
5. Markdown export
6. A 409 conflict across two browser contexts
7. Mobile viewport: reading view with no horizontal scroll, body text ≥ 16 px, cards instead of
   a table, sticky cluster headers
8. Language: a signed-out visitor gets their browser's language, and the switcher survives a
   reload
9. Guest access: a member invites an address, a browser with no session is refused the wrong
   address and admitted with the right one, cannot reach the library, and loses access the
   moment the invitation is withdrawn

Flows whose feature does not exist yet are **not** anticipated as `test.fixme` stubs — they sit
as a list in the header comment of `e2e/agenda.spec.ts` and arrive with their feature.

Two projects, `desktop` and `mobile` (Pixel 5); tests that apply to only one exclude the other
via `test.skip(({ isMobile }) => …)`. In CI the suite runs on two shards.

### No flakes

A flaky test is **fixed or deleted immediately**. `test.skip` with a link to an issue is the
only permitted intermediate state. No `waitForTimeout` — web-first assertions only.

### Fixtures rather than factories

The `seed:demo` fixture is the one shared data set for export snapshots, performance
measurement and E2E. It builds its block types through the same `localiseModuleType` the
application uses, so it cannot drift from what `loadDay` produces.

### Performance is a test

INP < 200 ms on drag start against the 150-row fixture runs in CI, not as a manual exercise.

### Coverage

80 % on `src/domain/**`, `src/features/agenda/**` and `src/i18n/**` — the zones where a bug is
silent. Locale resolution belongs in that list: every wrong answer renders a perfectly readable
page in the wrong language, with no error and no failed request to notice it by.

**No global coverage target**; that only breeds alibi tests.
