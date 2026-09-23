import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listPasskeys } from '@/cloud/operator/auth'
import { listOperatorTokens } from '@/cloud/operator/tokens'
import { listOperatorConnections } from '@/cloud/operator/oauth'
import { OPERATOR_SCOPES } from '@/cloud/operator/scopes'
import { currentOperator } from '@/cloud/operator/session'
import { operatorProfile } from '@/server/oauth/metadata'
import { Passkeys } from '../passkeys'
import { Tokens } from '../tokens'
import { Connections } from '../connections'
import { OAuthGuide } from '../oauth-guide'

export const dynamic = 'force-dynamic'

/**
 * Where an operator manages their own passkeys.
 *
 * The first passkey used to be the only one, enrolled through a link that
 * `scripts/operator.mjs` prints on the server -- so an operator who signed in
 * by mail had no way to get back to a passkey without somebody with a shell.
 * From here they add one themselves.
 */
export default async function OperatorSecurity() {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)

  const [t, format, passkeys, tokens, connections] = await Promise.all([
    getTranslations('operator.passkeys'),
    getFormatter(),
    listPasskeys(operatorDb(), operator.id),
    listOperatorTokens(operatorDb(), operator.id),
    listOperatorConnections(operatorDb(), operator.id),
  ])
  const when = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('never')

  return (
    <div className="max-w-xl">
      <Link
        href={'/operator' as Route}
        className="text-[14px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('back')}
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
        {t('intro', { email: operator.email })}
      </p>
      <Passkeys
        passkeys={passkeys.map((passkey) => ({
          credentialId: passkey.credentialId,
          created: when(passkey.createdAt),
          lastUsed: when(passkey.lastUsedAt),
        }))}
      />

      <Tokens
        scopes={OPERATOR_SCOPES}
        tokens={tokens.map((token) => ({
          id: token.id,
          name: token.name,
          scopes: token.scopes,
          // Serialised here rather than passed as Date: this crosses to a
          // client component, and a Date would arrive as a string anyway --
          // better to say so than to type a lie.
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          revokedAt: token.revokedAt?.toISOString() ?? null,
        }))}
      />

      <Connections
        connections={connections.map((connection) => ({
          clientId: connection.clientId,
          name: connection.name,
          scopes: connection.scopes,
          // Formatted here, where the request's locale is known; the component
          // is a client one and would otherwise render the server's idea of a
          // date. The same reason the token rows are serialised above.
          connected: when(connection.connectedAt),
          lastUsed: when(connection.lastUsedAt),
        }))}
      />

      {/* The endpoint the discovery document advertises, not one assembled here
          a second time: `resource_documentation` points a refused client at this
          page, and the address it finds has to be the one it was refused at. */}
      <OAuthGuide endpoint={operatorProfile().resource} />
    </div>
  )
}
