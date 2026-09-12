import { SCOPES } from '@/domain/tenant/tokens'
import { getTranslations } from 'next-intl/server'
import { loadTokens } from '@/server/actions/tokens'
import { TokenList } from './token-list'

export const dynamic = 'force-dynamic'

/**
 * Personal access tokens, for connecting an LLM client over MCP.
 *
 * Personal, not administrative: a token acts as the person who made it, so it
 * lives in their own settings. Minting a credential that acts as a colleague
 * is not a power a tenant admin needs, so there is no screen for it.
 */
export default async function TokensPage() {
  const [result, t] = await Promise.all([loadTokens(), getTranslations('settings.tokens')])

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {result.ok ? (
        <TokenList initial={result.data} scopes={[...SCOPES]} />
      ) : (
        <p role="alert" className="text-[15px] text-[var(--danger-fg)]">
          {result.message}
        </p>
      )}
    </div>
  )
}
