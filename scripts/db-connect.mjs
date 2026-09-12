/**
 * Builds pg client options from a connection URL plus an optional password file.
 *
 * The password is read from the FILE at connect time and never placed in an
 * environment variable. `docker inspect` prints a container's environment, and
 * so does anything that reads /proc/<pid>/environ -- which is the argument
 * compose.yaml already makes for SMTP_URL_FILE over SMTP_URL.
 *
 * It goes INTO THE URL rather than into pg's `password` option, which would be
 * the nicer shape. node-postgres cannot take both: ConnectionParameters does
 *
 *   config = Object.assign({}, config, parse(config.connectionString))
 *
 * so the URL's own (absent) password overwrites whatever was passed alongside
 * it, and the connection fails at SASL with "client password must be a string".
 * Passing the parts separately instead would mean parsing the URL by hand and
 * losing its query parameters.
 *
 * Consequence to know: the secret is read once per client, so a rotated
 * password takes effect on the next restart, not the next connection.
 *
 * With no password file the URL is returned untouched: local development and CI
 * run against a Postgres that trusts the local connection, and that path does
 * not change.
 */
import { readFileSync } from 'node:fs'

export function dbOptions(connectionString, passwordFile) {
  if (!passwordFile) return { connectionString }

  const secret = readFileSync(passwordFile, 'utf8').trim()
  if (!secret) {
    throw new Error(
      `${passwordFile} ist leer. Die Datei wird von scripts/db-secrets.mjs erzeugt; ` +
        `ohne sie kann sich dieser Container nicht anmelden.`,
    )
  }

  const url = new URL(connectionString)
  url.password = secret
  return { connectionString: url.toString() }
}
