import 'server-only'
import { withTenant, type Tx } from '@/server/db'
import { edition } from '@/server/edition'
import { hashSecret, parseOAuthToken } from '@/server/auth/tokens'
import {
  findClient,
  issueTokens,
  redeemAuthorizationCode,
  redeemRefreshToken,
  registerClient,
  revokeToken,
} from '@/domain/oauth/repo'
import type { OAuthStore } from '@/domain/oauth/store'
import type { Field, OpenStore, Purpose } from './endpoints'

/**
 * The customers' authorization server, as an OAuthStore.
 *
 * Every method is the repository function that was already here, bound to a
 * transaction. Nothing about the flow moved: what moved is who calls it, so
 * that the console's server can reuse the endpoints without reusing the
 * tables. `memberId` is this server's subject; the port calls it `subjectId`
 * because the other one's is an operator.
 */
export function tenantStore(tx: Tx): OAuthStore {
  return {
    registerClient: (input) => registerClient(tx, input),
    findClient: (clientKey) => findClient(tx, clientKey),

    async redeemAuthorizationCode(code) {
      const grant = await redeemAuthorizationCode(tx, code)
      return grant && { ...grant, subjectId: grant.memberId }
    },

    issueTokens: (input) => issueTokens(tx, { ...input, memberId: input.subjectId }),

    async redeemRefreshToken(tokenKey, secret) {
      const previous = await redeemRefreshToken(tx, tokenKey, hashSecret(secret))
      return previous && { ...previous, subjectId: previous.memberId }
    },

    revoke: (tokenKey, secret) => revokeToken(tx, tokenKey, hashSecret(secret)),

    parseToken: parseOAuthToken,
  }
}

/**
 * Which tenant's rows this request touches, and a transaction around them.
 *
 * The tenant is read off the grant itself -- the code, or the refresh token --
 * because the client is not authenticated yet and no session is involved. A
 * code or token that names no tenant fails the same way an unknown one does.
 */
export const openTenantStore: OpenStore = async (purpose, field) => {
  const tenantId = await tenantFor(purpose, field)
  if (!tenantId) return null

  const actor = {
    tenantId,
    memberId: null,
    tenantRole: 'member' as const,
    source: 'mcp' as const,
  }
  return (use) => withTenant(actor, (tx) => use(tenantStore(tx)))
}

async function tenantFor(purpose: Purpose, field: Field): Promise<string | null> {
  if (purpose === 'register') return edition.tenantForClientRegistration()

  if (purpose === 'revoke') {
    // No fallback here, unlike below: a token that names no tenant is simply
    // not ours, and RFC 7009 wants a 200 either way. Opening a transaction to
    // look for it would be work in aid of an answer we already have.
    const parsed = parseOAuthToken(field('token') ?? '')
    return parsed ? edition.tenantForOAuthToken(parsed.tokenKey) : null
  }

  const code = field('grant_type') === 'authorization_code' ? field('code') : null
  if (code) return edition.tenantForAuthorizationCode(hashSecret(code))

  const refresh =
    field('grant_type') === 'refresh_token' ? parseOAuthToken(field('refresh_token') ?? '') : null
  if (refresh) return edition.tenantForOAuthToken(refresh.tokenKey)

  // Nothing that names a tenant: a missing code, a malformed token, a grant type
  // nobody supports. Answered further down with the same error as always, from
  // inside the tenant clients register in.
  return edition.tenantForClientRegistration()
}
