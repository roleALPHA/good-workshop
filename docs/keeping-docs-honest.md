# The README keeps up

The README is not an accompanying text but the only channel through which an operator learns
what to set. Wrong instructions are worse than none: they get followed.

## The chokepoint

```bash
pnpm check:docs
```

Runs in CI in the `Lint & Typecheck` job and needs no database. It does **not** check whether
sentences are true — it checks the couplings along which the documentation here has quietly
gone wrong before:

| Question                                                                       | Why it is asked                                                                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does every documented variable actually reach a container?                     | `GW_OPS_TOKEN` and `GW_COLLAB_URL` were in `.env.example` and in the README table and were never passed through. The described healthcheck was unusable. |
| Is every variable `compose.yaml` expects from the `.env` documented?           | Otherwise the stack starts with an error about a value the instructions never mentioned.                                                                 |
| Is every required variable in the table under `### Configuration`?             | What is checked is the **first column of the table**, not every mention in running text: the table is what you read to find out what exists at all.      |
| Is every `process.env.GW_*` in the code documented **or** explicitly internal? | So that "undocumented" is a decision with a reason and not an oversight.                                                                                 |
| Does every command the README prints exist?                                    | `pnpm` scripts, `cli.mjs` commands, compose services, compose profiles, `scripts/*.mjs`.                                                                 |
| The same for `docs/*.md` and the skills                                        | Much of it was once in the README. A command must not become unchecked by moving.                                                                        |
| Is a database connection or password file in `.env.example`?                   | Those belong in `compose.yaml`. Whoever redirects `DATABASE_PASSWORD_FILE` hands the web container a role it should not have.                            |

## When `check:docs` fires

The message names the place. There are exactly three right reactions — weakening the check is
not one of them:

1. **Update the documentation**, when the code is right.
2. **Fix the code**, when the documentation is right. That was the case with `GW_OPS_TOKEN`:
   the README was not lying, `compose.yaml` was not passing the value through.
3. **Record the variable as internal** — in `INTERNAL` in
   [`scripts/check-docs.mjs`](../scripts/check-docs.mjs), **with a reason on the same line**. An
   entry without a reason is exactly the oversight the list exists to prevent.

For values that never reach the Node process because Compose itself or another container
consumes them (`GW_HOSTNAME`, `GW_PORT`) there is `INFRA` — the same rule applies there, and in
addition the value has to actually appear in `compose.yaml`.

## Where what belongs

The README answers two questions: **what does this do?** and **how do I install it?** In that
order, followed by the things that trip people up.

Everything that justifies a design decision — why the visibility rule is in the SQL, why an SVG
is refused rather than cleaned, how the materialiser works, why a domain error carries a key
rather than a sentence — belongs in [`docs/architecture.md`](architecture.md). Not because it
is unimportant, but because an operator wanting to install in twenty minutes does not have to
read it.

The test for that is simple: **do you need this paragraph to get the installation running, or
to understand what the product does?** If not, it belongs in `docs/`.

## Language

The README, `docs/` and the operator-facing messages in `scripts/` are English. The interface is
not: it speaks four languages, and German is its source text. That split is deliberate and is
described in [Languages](languages.md).

A consequence worth knowing before renaming a heading: `check-docs.mjs` looks for the literal
string `### Configuration` in the README. It is the only German-or-English structural
dependency in that script, everything else keys on `compose.yaml`, `.env.example` and
`package.json`. The failure is benign — the checker stops with its own message about the
missing section — which is exactly why it should not be weakened away.

## What the checker cannot do

It does not read sentences. These places are updated by hand when they are affected:

- **Example output.** The healthcheck response in step 4 is the real answer of a running
  server. If that JSON changes, it is regenerated rather than guessed.
- **The startup order.** If the chain in `migrate` gets longer or shorter, that belongs in step
  4 and in the table under "Updating".
- **Reasons.** Why `-u postgres` is needed for `pg_dump`, why there are no passkeys without
  HTTPS — such sentences become wrong when the mechanics underneath change.
- **The symptom table.** A new error message an operator can see belongs in it. It is where
  somebody who is stuck looks things up — which also means it quotes messages verbatim, so
  translating one of those messages means updating the table in the same commit.

## Before committing

If one of the following was touched, the README comes along — the checker only catches the
mechanical half:

| Changed                                      | Update                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| added/removed a `process.env.GW_*`           | `.env.example`, the configuration table, possibly `INTERNAL`                                  |
| `compose.yaml` (service, port, profile, env) | steps 3–4, the configuration table                                                            |
| `scripts/cli.mjs`                            | step 5, every place mentioning `cli.mjs`                                                      |
| `package.json` scripts                       | the table under "Contributing"                                                                |
| a new migration                              | "Updating"; for a data precondition see [install-upgrade](installation-and-upgrade.md)        |
| database roles, secrets, volumes             | `docs/architecture.md`, the "Backing up" section, and the CI job `On-Prem stack`              |
| `/api/health`                                | the "healthcheck" section, the example output, the symptom table                              |
| an operator-visible error message            | the symptom table                                                                             |
| a message key or a new language              | nothing in the README — but `src/i18n/catalogs.test.ts` has to stay green, and it will say so |

Then:

```bash
pnpm check:docs && pnpm format:check
```
