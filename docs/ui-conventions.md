# UI and UX conventions

Binding for every change to a React component, to Tailwind tokens, to the layout or to
colours.

## Mobile-first is not a phrase

Facilitators read their agenda **on the day, on a phone**, not on a laptop. The reading view is
the most-used screen per workshop. Phone readability is an acceptance criterion, not a
nice-to-have.

### Breakpoints

| Range                 | Behaviour                              |
| --------------------- | -------------------------------------- |
| `< 640px` — phone     | reading view (read-only), card layout  |
| `640–1023px` — tablet | reading view, two columns where useful |
| `≥ 1024px` — desktop  | the full editor with drag and drop     |

Below 1024 px the editor shows a friendly note plus a "view read-only" button. **No broken
mini version of the editor.**

### The agenda collapses into cards, not horizontal scroll

`--gw-cols` applies from `md` upwards. Below that every row becomes a card:

- coloured category bar on the left (4 px)
- time and duration as a bold header line
- title underneath
- description across the full width
- additional info as a collapsed disclosure

Clusters become `position: sticky` section headers with a running clock time.

### Hard minimums

- Body text **never below 16 px** — below that iOS Safari zooms in when an input is focused.
- Line length 45–75 characters.
- Touch targets ≥ **44 × 44 px**, spacing between tap targets ≥ 8 px.
- **Never scroll horizontally.** An `overflow-x` on `<body>` is a bug, not a compromise. Long
  content wraps or gets a scroll container of its own.
- `dvh` rather than `vh` for anything full-height; `env(safe-area-inset-*)` for sticky footers.

### No editor is booted on a phone

Descriptions render as static HTML there. Never a TipTap `EditorView` instance below 1024 px.

## Colours

- Category colours **only** through the `.cat-*` OKLCH tokens.
- Accent colours **only** through `--brand-*`.
- **Never raw hex values in component code.** An ESLint rule breaks on it.
- Every coloured surface meets WCAG AA (4.5:1 for text) in **both** themes.
- **No state carried by colour alone.** Pins, overlaps and conflicts always carry an icon or
  text as well.
- Presence **only** through `--peer` (`.gw-peer`, one hue per person). Never `.cat-*`: a
  category colour means "this is a break", and a person is not a category. Every presence mark
  carries the name as text — a coloured ring alone tells nobody who is writing.
- A participant who is not a human is named as such. An LLM joins the same room over MCP as a
  colleague does; it must not be taken for one.

### Tenant branding touches `--brand-*` and never `.cat-*`

Block type colours are **semantics** ("check-in is rose"), not decoration. Whether they can be
told apart depends on the OKLCH calibration. A tenant painting their corporate blue across
every block type makes the agenda unreadable. Individual block type colours are changed in
`/admin/module-types` — that is where they belong.

## Language

**Every string a person reads lives in `src/messages`.** German is the source text; English,
French and Spanish are translations of it. An ESLint rule breaks on German prose in
`src/components`, `src/features` and `src/app` — umlauts and ß are the cheap, reliable tell.
Tests and fixtures are exempt: German is the source, so the reference agenda is written in it.

Three things deliberately stay outside the catalogs, and it is worth knowing why:

- **The footer.** `<AppFooter>` says `GoodWorkshop · powered by roleALPHA` in every language.
- **MCP tool descriptions.** They are prompt material for a model, not interface text.
- **The duration input vocabulary.** `parseDuration` accepts `Stunden`, `hours`, `heures`,
  `horas` — that is parser input, and a translator editing a JSON string must not be able to
  break the most-used control in the application.

Anything a person reads and anything an operator reads part ways here: operator text — boot
warnings, script output, WebSocket close reasons — is English, hardcoded, and sits between `pg`
errors and `docker compose` output that will never be translated either.

The details are in [Languages](languages.md).

## Footer

`<AppFooter>` with `GoodWorkshop · powered by roleALPHA` is present on **every** view — app
shell, login, mobile reading view, print view. Building a new top-level view means bringing it
along. The string is not in the i18n catalogs and is not interpolated from tenant data.

## Editing happens in place, not in a dialog

**The most important interaction rule of this product.** Whoever wants to change something does
it where it stands — title, duration, description and a block's type-specific fields are edited
directly in the row they sit in.

Why this is not a matter of taste: a dialog puts a mode between the facilitator and the agenda
they are reading. That is precisely what a planning tool must not do — the point of the day
view is that the document stays visible while you work on it. A modal hides the context in
which the decision makes sense at all ("does this duration fit the rest of the morning?").

Concretely:

- **No modals for editing.** Modals remain confirmations for the irreversible (deleting) and
  real context switches.
- **No save button for field changes.** Changes are taken on blur, not on every keystroke:
  validating mid-word marks half-typed input as wrong, and persisting every character turns one
  sentence into forty writes.
- **No edit mode.** There is no switch between reading and changing. Fields are borderless
  until you touch them.
- **Invalid input returns rather than guessing.** A silently mis-guessed duration moves every
  following block and nobody notices.
- **Extra fields open in the same row**, not in a side panel. The calm of the collapsed table is
  what makes that affordable: closed, a row shows the handful a facilitator reads while running
  the day — time, duration, title, description, the participation format, the material, and the
  lock on the start time — plus whatever the type flags `x-gw.summary`. Everything else appears
  on request and folds away again.
- **What a closed row carries is a decision, not a default.** A field earns its place there by
  being consulted mid-workshop, and the list is named in `e2e/agenda.spec.ts` so that adding to
  it has to be deliberate. The schema decides which extras become chips; the table does not keep
  its own list of keys.

If a change cannot sensibly be fitted inline, the row is usually too full — the dialog is not
what is due.

## Interaction

- Inline editing with no visible input borders until hover or focus. The table reads as a
  document, not as a form.
- Typography rather than borders: a hairline between rows, no vertical grid lines.
- Every hover affordance has a `focus-within` counterpart — **there is no hover on touch**.
- Motion only where it means something, always with `prefers-reduced-motion`.
- Skeletons in grid form, no spinners.
- Optimistic with a toast only on failure, plus a quiet "all changes saved".
- `font-variant-numeric: tabular-nums` on every time and duration — otherwise the column
  shivers on every keystroke.

## Accessibility

`role="treegrid"`, rows with `aria-level` / `aria-posinset` / `aria-setsize` / `aria-expanded`,
roving `tabindex`. ↑/↓ move focus, →/← open and close clusters, Enter edits the title, ⌘⌥↑/↓
move a row. Drag announcements speak the domain, not coordinates: "Icebreaker moved to
position 3 in section Warm-up. New start time 09:15."

Those announcements are assembled from separate messages rather than from one string with a
slot — see `describeProjection`. A sentence that only works by rewriting a word of German is
not an announcement, it is an accident.

## Checklist before every UI pull request

- [ ] actually read at 375 × 667
- [ ] no horizontal scroll
- [ ] touch targets ≥ 44 px
- [ ] keyboard operation walked through
- [ ] dark mode checked
- [ ] `prefers-reduced-motion` checked
- [ ] contrast measured
- [ ] no raw hex colours
- [ ] no German strings outside `src/messages`
- [ ] `<AppFooter>` present
- [ ] no dialog for something that belongs inline
