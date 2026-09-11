#!/usr/bin/env node
/**
 * Proves that the README still describes THIS repository.
 *
 * Documentation does not rot loudly. It rots by staying plausible: a variable
 * that quietly stopped reaching the container, a flag renamed in compose, a
 * `pnpm` script that moved. Every one of those was already in this repository
 * at least once --
 *
 *   - GW_OPS_TOKEN was documented in .env.example and in the README table and
 *     was never passed to the app container, so the detailed healthcheck it
 *     describes could not work for anybody who followed the instructions.
 *   - GW_COLLAB_URL and GW_COLLAB_INTERNAL_URL had the same defect.
 *   - The README said `console` was the default mail transport after the
 *     default had been deliberately removed.
 *   - `pg_dump` was documented without `-u postgres` after the database moved
 *     to peer authentication, so the documented backup command failed.
 *
 * Each was found by a person re-reading prose. This script asks the questions
 * that a person has to remember to ask, on every push:
 *
 *   1. Does every variable the operator is told to set actually arrive
 *      somewhere?
 *   2. Is every variable compose expects from the .env documented?
 *   3. Is every GW_/SMTP_ variable the code reads either documented or
 *      declared internal on purpose?
 *   4. Does every command the README prints actually exist?
 *
 * It cannot check whether a sentence is true. It checks the couplings, which is
 * where the lies came from.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/**
 * Variables the code reads that an operator is deliberately NOT told about.
 *
 * The list exists so that "undocumented" is a decision with a reason next to
 * it rather than an oversight nobody noticed. Adding a name here is allowed;
 * adding it without the reason is what this file is against.
 */
const INTERNAL = {
  GW_EDITION: 'community | cloud. Set by the distribution, not by the operator.',
  GW_ALLOW_OPS: 'Test seam. Opens the ops endpoints without a token -- never in production.',
  GW_COLLAB_PATH:
    'Path of the collaboration socket. Also hard-coded in the Caddyfile; two places that ' +
    'can drift apart are worse than one fixed value.',
  GW_DB_SECRETS_DIR:
    'Where db-secrets.mjs writes the role passwords. Fixed by compose; a seam for running the ' +
    'script outside a container.',
  GW_RP_NAME: 'Display name in the passkey prompt. Follows the branding, not the .env.',
  GW_SESSION_TTL_DAYS: 'Absolute session lifetime. Tuning knob, not an install decision.',
  GW_MAGIC_LINK_TTL_MINUTES: 'Login-link lifetime. Tuning knob.',
  GW_DB_POOL_MAX: 'Connection pool size. Tuning knob.',
  GW_COLLAB_GRACE_MS: 'Collaboration server timing. Tuning knob.',
  GW_COLLAB_MATERIALIZE_MS: 'Collaboration server timing. Tuning knob.',
  GW_COLLAB_PERSIST_MS: 'Collaboration server timing. Tuning knob.',
}

/**
 * Documented variables that never enter the Node process, because something
 * else consumes them: compose itself, or a container that is not the app.
 *
 * They still have to appear somewhere in compose.yaml -- a value the operator
 * is told to set and that nothing reads at all is the same broken promise,
 * only quieter.
 */
const INFRA = {
  GW_HOSTNAME: 'Goes to the Caddy container, which substitutes it inside the Caddyfile.',
  GW_PORT: 'Host side of the port mapping. Compose reads it; the container never sees it.',
  GW_VERSION: 'Selects the image tag. Also passed to app so /api/health can report it.',
}

const VALUE_FLAGS = new Set([
  '-f',
  '--file',
  '-p',
  '--project-name',
  '--profile',
  '-u',
  '--user',
  '-e',
  '--env',
  '-w',
  '--workdir',
  '-l',
  '--label',
  '--scale',
  '--index',
  '--env-file',
  '-n',
  '--tail',
])

/**
 * Connection details that come from compose and never from the operator's .env.
 *
 * The password files especially: each points into a volume that only certain
 * services mount, and an operator who redirects one has quietly handed the web
 * container a role it is not supposed to have.
 */
const DB_URLS = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'ADMIN_DATABASE_URL',
  'OPS_DATABASE_URL',
  'DATABASE_PASSWORD_FILE',
  'MIGRATION_DATABASE_PASSWORD_FILE',
  'ADMIN_DATABASE_PASSWORD_FILE',
  'OPS_DATABASE_PASSWORD_FILE',
]

const problems = []
const read = (path) => readFileSync(path, 'utf8')

const readme = read('README.md')

/**
 * The other prose that names commands: docs/ and the two skills. Most of it was
 * carved out of the README, which means every command in it was once checked
 * here and would otherwise stop being checked the moment it moved.
 */
const otherDocs = readdirSync('docs')
  .filter((name) => name.endsWith('.md'))
  .map((name) => `docs/${name}`)
const compose = read('compose.yaml')
const envExample = read('.env.example')
const pkg = JSON.parse(read('package.json'))

// ── 1. The environment variables ────────────────────────────────────────────

/** Everything compose takes from the operator's .env, wherever it appears --
 *  `environment:` blocks, the `ports:` mapping, the image tag. */
const fromEnvFile = new Set(
  [...compose.matchAll(/\$\{(GW_[A-Z0-9_]+|SMTP_[A-Z0-9_]+)[:?}-]/g)].map((m) => m[1]),
)

/** Everything compose hands to a container as an environment variable. */
const reachesContainer = new Set(
  [...compose.matchAll(/^\s{6}(GW_[A-Z0-9_]+|SMTP_[A-Z0-9_]+):/gm)].map((m) => m[1]),
)

const documented = new Set(
  [...envExample.matchAll(/^(GW_[A-Z0-9_]+|SMTP_[A-Z0-9_]+)=/gm)].map((m) => m[1]),
)

/**
 * The names in the FIRST COLUMN of the configuration table -- not every mention
 * anywhere in the README.
 *
 * The difference matters: almost every variable is also named in running text,
 * so a check that accepts any mention passes even when the table has lost the
 * row. The table is what an operator reads to find out what exists; a variable
 * missing from it is invisible no matter how often the prose says its name.
 */
const configTable = section(readme, '### Konfiguration')
const inReadmeTable = new Set(
  [...configTable.matchAll(/^\|([^|]+)\|/gm)].flatMap((m) =>
    [...m[1].matchAll(/`(GW_[A-Z0-9_]+|SMTP_[A-Z0-9_]+)`/g)].map((c) => c[1]),
  ),
)
if (inReadmeTable.size === 0) {
  problems.push(
    'Die README hat keinen Abschnitt `### Konfiguration` mit einer Variablentabelle mehr.',
    '  Ohne sie prüft dieses Skript die Hälfte seiner Fragen gegen nichts.',
  )
}

const readByCode = new Set(
  [
    ...execFileSync(
      'git',
      [
        'grep',
        // --untracked: eine gerade erst geschriebene Datei ist genau die, deren
        // neue Variable noch niemand entschieden hat. Ohne das sähe dieses
        // Skript sie erst nach dem Commit -- einen Schritt zu spät.
        '--untracked',
        '-hoE',
        'process\\.env\\.[A-Z][A-Z0-9_]+',
        '--',
        'src',
        'scripts',
        'next.config.ts',
      ],
      {
        encoding: 'utf8',
      },
    ).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g),
  ].map((m) => m[1]),
)

for (const name of fromEnvFile) {
  if (name in INTERNAL) continue
  if (!documented.has(name)) {
    problems.push(
      `${name}: compose erwartet den Wert aus der .env, aber .env.example kennt ihn nicht.`,
      `  Wer nach der Anleitung vorgeht, setzt ihn nie.`,
    )
  }
  if (!inReadmeTable.has(name)) {
    problems.push(
      `${name}: compose erwartet ihn, aber die Konfigurationstabelle der README nennt ihn nicht.`,
    )
  }
}

for (const name of documented) {
  if (name in INFRA) {
    // Consumed outside the Node process -- but it must still be consumed.
    if (!fromEnvFile.has(name)) {
      problems.push(
        `${name}: als Infrastruktur-Wert geführt, kommt in compose.yaml aber nicht vor.`,
        `  Dann liest ihn niemand, und die .env verspricht eine Wirkung, die es nicht gibt.`,
      )
    }
    continue
  }
  if (!reachesContainer.has(name)) {
    problems.push(
      `${name}: steht in .env.example, wird aber von compose an keinen Container übergeben.`,
      `  Genau der Fehler, den GW_OPS_TOKEN und GW_COLLAB_URL hatten: dokumentiert, wirkungslos.`,
    )
  }
  if (!readByCode.has(name)) {
    problems.push(
      `${name}: steht in .env.example, wird aber nirgends im Code gelesen.`,
      `  Entweder ist der Code weg oder die Zeile ist ein Überbleibsel.`,
    )
  }
}

for (const name of Object.keys(INFRA)) {
  if (name in INTERNAL) {
    problems.push(`${name}: steht in INFRA und in INTERNAL. Eins von beidem stimmt nicht.`)
  }
}

for (const name of readByCode) {
  if (!/^(GW_|SMTP_)/.test(name)) continue
  if (documented.has(name) || name in INTERNAL) continue
  problems.push(
    `${name}: wird im Code gelesen, ist aber weder in .env.example dokumentiert noch in`,
    `  check-docs.mjs als bewusst intern eingetragen. Eins von beidem entscheiden.`,
  )
}

for (const name of Object.keys(INTERNAL)) {
  if (!readByCode.has(name)) {
    problems.push(`${name}: als intern geführt, wird aber nicht mehr gelesen. Eintrag entfernen.`)
  }
  if (documented.has(name)) {
    problems.push(
      `${name}: steht in .env.example UND in der INTERNAL-Liste. Eins von beidem stimmt nicht.`,
    )
  }
}

for (const name of DB_URLS) {
  if (documented.has(name)) {
    problems.push(
      `${name}: gehört nicht in .env.example -- die Verbindungen stehen in compose.yaml.`,
      `  Ein Betreiber, der sie überschreibt, hebelt die Rollentrennung aus.`,
    )
  }
}

// ── 2. The commands the README prints ───────────────────────────────────────

/**
 * The shell the README actually tells the operator to run: fenced bash blocks
 * with trailing `# ...` comments removed. Without that removal a line like
 * `docker compose up -d   # ohne --profile tls` parses as a service named
 * "ohne", and the check starts inventing work.
 */
const shellLines = [...readme.matchAll(/```(?:bash|sh|console)\n([\s\S]*?)```/g)]
  .flatMap((m) => m[1].split('\n'))
  .map((line) => line.replace(/\s+#.*$/, '').trim())
  .filter(Boolean)

const cliCommands = new Set(
  [...read('scripts/cli.mjs').matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]),
)
const services = collectServices(compose)
const profiles = new Set(
  [...compose.matchAll(/profiles:\s*\[([^\]]+)\]/g)].flatMap((m) =>
    m[1].split(',').map((s) => s.trim()),
  ),
)

/**
 * pnpm scripts are named in two places: the shell blocks, and the table of
 * commands under "Arbeitsweisen" -- which is inline code, not a fenced block.
 * Checking only the fences would leave the table free to name a script that was
 * renamed years ago.
 */
const pnpmMentions = [
  ...shellLines,
  ...[...readme.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]),
  ...otherDocs.flatMap((file) => [...read(file).matchAll(/`([^`\n]+)`/g)].map((m) => m[1])),
  ...otherDocs.flatMap((file) =>
    [...read(file).matchAll(/```(?:bash|sh|console)\n([\s\S]*?)```/g)].flatMap((m) =>
      m[1].split('\n'),
    ),
  ),
]

for (const mention of pnpmMentions) {
  for (const [, script] of mention.matchAll(/\bpnpm (?:run )?([\w][\w:.-]*)/g)) {
    if (['install', 'dev', 'exec', 'add', 'approve-builds'].includes(script)) continue
    if (!(script in pkg.scripts)) {
      problems.push(`README nennt \`pnpm ${script}\` -- package.json kennt dieses Script nicht.`)
    }
  }
}

for (const line of shellLines) {
  for (const [, profile] of line.matchAll(/--profile\s+([a-z]+)/g)) {
    if (!profiles.has(profile)) {
      problems.push(
        `README benutzt \`--profile ${profile}\` -- compose.yaml kennt dieses Profil nicht.`,
      )
    }
  }

  for (const [, script] of line.matchAll(/node (scripts\/[a-z-]+\.mjs)/g)) {
    if (!exists(script)) {
      problems.push(`README ruft \`node ${script}\` auf -- die Datei gibt es nicht.`)
    }
  }

  for (const [, command] of line.matchAll(/scripts\/cli\.mjs\s+([a-z-]+)/g)) {
    if (!cliCommands.has(command)) {
      problems.push(`README ruft \`cli.mjs ${command}\` auf -- die CLI kennt diesen Befehl nicht.`)
    }
  }

  const service = serviceArgument(line.split(/\s+/))
  if (service && !services.has(service)) {
    problems.push(
      `README spricht den Compose-Dienst \`${service}\` an -- compose.yaml kennt ihn nicht.`,
    )
  }
}

// ── Ergebnis ────────────────────────────────────────────────────────────────

if (problems.length === 0) {
  console.log('README, .env.example und compose.yaml stimmen mit dem Code überein.')
  process.exit(0)
}

console.error('')
console.error('  DIE DOKUMENTATION IST DEM CODE DAVONGELAUFEN')
console.error('')
for (const line of problems) console.error(`  ${line}`)
console.error('')
console.error('  Jeder Punkt ist eine Stelle, an der die Anleitung etwas verspricht, das die')
console.error('  Installation nicht einlöst. Siehe docs/doku-mitziehen.md.')
console.error('')
process.exit(1)

/** The body of one `###` section, up to the next heading of the same level. */
function section(markdown, heading) {
  const start = markdown.indexOf(heading)
  if (start === -1) return ''
  const rest = markdown.slice(start + heading.length)
  const end = rest.search(/^#{1,3} /m)
  return end === -1 ? rest : rest.slice(0, end)
}

/** Top-level service names, without pulling in a YAML parser for eight lines. */
function collectServices(yaml) {
  const body = (yaml.split(/^services:\s*$/m)[1] ?? '').split(/^volumes:\s*$/m)[0]
  return new Set([...body.matchAll(/^ {2}([a-z][a-z0-9_-]*):\s*$/gm)].map((m) => m[1]))
}

/**
 * The service name in a `docker compose` line, or null.
 *
 * Parsed positionally: the subcommand, the flags it carries, then -- for the
 * subcommands that take one -- the service. Anything after that is the command
 * being run INSIDE the container and is none of this check's business.
 *
 * Only flags KNOWN to take a value swallow the next word. The reverse rule --
 * a list of flags that stand alone -- read `run --rm migrate node ...` as a
 * service called "node", because --rm was not on the list. Flags that take
 * values are few and stable; switches are not.
 */
function serviceArgument(words) {
  const at = words.indexOf('compose')
  if (at < 1 || words[at - 1] !== 'docker') return null

  const takesService = new Set(['exec', 'logs', 'run', 'restart', 'stop', 'start'])
  const skipFlags = (i) => {
    while (i < words.length && words[i].startsWith('-')) {
      i += VALUE_FLAGS.has(words[i]) ? 2 : 1
    }
    return i
  }

  let i = skipFlags(at + 1)
  if (!takesService.has(words[i])) return null
  return words[skipFlags(i + 1)] ?? null
}

function exists(path) {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}
