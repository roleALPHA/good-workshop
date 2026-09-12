# UI and UX conventions

Binding for every change to a React component, to Tailwind tokens, to the layout or to
colours.

## Mobile-first is not a phrase

Facilitators read their agenda **on the day, on a phone**, not on a laptop. The reading view is
the most-used screen per workshop. Phone readability is an acceptance criterion, not a
nice-to-have.

### Breakpoints

| Range                 | Behaviour                                             |
| --------------------- | ----------------------------------------------------- |
| `< 640px` — phone     | card layout, fully editable                           |
| `640–1023px` — tablet | card layout, two columns where useful, fully editable |
| `≥ 1024px` — desktop  | the `--gw-cols` table, fully editable                 |

The difference between them is **layout, not capability**. A phone is not handed a lesser
version of the agenda.

This used to say the opposite: the editor mounted only from 1024 px up, because nested drag
and drop plus rich text on a 375 px screen is the wrong tool for the screen. That reasoning
held while a row was a wall of text. It stopped holding once the row carried the three things
a facilitator changes _while standing in the room_ — the social form, the material, the clock
time a block is nailed to. All three are one tap. Showing somebody those three values and
refusing every one of them is worse than a cramped control.

What the gate protected is now protected where it belongs:

- dragging needs a **long press** (200 ms), so a swipe still scrolls the page,
- every field is **16 px on a coarse pointer**, so iOS does not zoom when one is focused,
- the first paint is still the read-only table, so the agenda is legible before any JavaScript
  has arrived — on the screen where it arrives last.

**Still no broken mini version of the editor.** If something cannot be made to work under a
thumb, it does not get a cramped variant; it waits for a bigger screen and says so.

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
  Inputs themselves are what that rule is really about: a 13 px chip field is fine under a
  mouse and must become 16 px under a finger (`pointer-coarse:`). Asserted in
  `e2e/reading-view.spec.ts`.
- Line length 45–75 characters.
- Touch targets ≥ **44 × 44 px**, spacing between tap targets ≥ 8 px. Where a control sits
  inside a dense row, spend the 44 px on coarse pointers only — a 44 px box around one line of
  13 px text is not a touch target under a mouse, it is what turns an 86 px row into a 144 px
  one and pushes the day off the screen.
- **Never scroll horizontally.** An `overflow-x` on `<body>` is a bug, not a compromise. Long
  content wraps or gets a scroll container of its own.
- `dvh` rather than `vh` for anything full-height; `env(safe-area-inset-*)` for sticky footers.

### Rich text is still not edited on a phone

Descriptions render as static HTML there. Never a TipTap `EditorView` instance below 1024 px --
this half of the old rule survives, because it is the half that was actually about the screen.
A paragraph of formatted text is not a tap, and a toolbar under a thumb is the cramped variant
the rule above forbids.

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
