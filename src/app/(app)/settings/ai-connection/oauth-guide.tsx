'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { CopyBlock } from '@/components/copy-block'
import { Client } from './connect-guide'

/**
 * Connecting a client that signs itself in, with no token at all.
 *
 * The other half of this page. Claude's and ChatGPT's connector screens take a
 * URL and nothing else a person could paste a token into, so for them the
 * token instructions above are instructions for a door they do not have. What
 * they need is the address and three facts the flow will not tell anybody:
 *
 * - The hosted clients reach this server from their vendor's cloud. An install
 *   inside a company network is invisible to them, and the failure they show
 *   ("couldn't reach the server") says nothing about why.
 * - Signing in on the way does not bring somebody back to the consent screen
 *   (docs/architecture.md, "deliberately not built yet"), so being signed in
 *   first is the difference between one attempt and two.
 * - What such a client may do is decided by the scopes it asks for: reading
 *   and writing workshops, and reading block types. Said here as well as on the
 *   consent screen, because "can Claude build my agenda" is the question
 *   somebody arrives at this page with.
 *
 * Menu labels in the vendors' products are quoted as the vendors document
 * them and hedged once, not per step: they change, and a guide that pretends
 * they do not ages worse than one that says so.
 */
export function OAuthGuide({ origin }: { origin: string }) {
  const t = useTranslations('settings.tokens.oauth')
  const headingId = useId()
  const endpoint = `${origin}/api/mcp`

  // No header and no token: the 401 this server answers with points the client
  // at /.well-known/oauth-protected-resource, and the client takes it from there.
  const claudeCode = `claude mcp add --transport http goodworkshop ${endpoint}`
  const gemini = `gemini mcp add --transport http goodworkshop ${endpoint}`

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-6" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-[15px] font-medium">
        {t('title')}
      </h2>
      <p className="mt-0.5 mb-3 text-[14px] text-[var(--fg-muted)]">{t('intro')}</p>

      <p className="text-[13px] text-[var(--fg-muted)]">{t('endpointLabel')}</p>
      <CopyBlock value={endpoint} label={t('copyEndpoint')} />

      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-[var(--fg-muted)]">
        <li>{t('publicNote')}</li>
        <li>{t('signInFirst')}</li>
        <li>{t('permissions')}</li>
      </ul>

      <div className="mt-4 space-y-2">
        <Client name={t('claude')}>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-[var(--fg-muted)]">
            <li>{t('claudeStep1')}</li>
            <li>{t('claudeStep2')}</li>
            <li>{t('claudeStep3')}</li>
          </ol>
          <p className="mt-2 text-[13px] text-[var(--fg-subtle)]">{t('claudeTeam')}</p>
        </Client>

        <Client name={t('chatgpt')}>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-[var(--fg-muted)]">
            <li>{t('chatgptStep1')}</li>
            <li>{t('chatgptStep2')}</li>
            <li>{t('chatgptStep3')}</li>
          </ol>
        </Client>

        <Client name={t('claudeCode')}>
          <p className="text-[14px] text-[var(--fg-muted)]">{t('claudeCodeStep')}</p>
          <CopyBlock value={claudeCode} label={t('copyClaudeCode')} />
        </Client>

        <Client name={t('gemini')}>
          <p className="text-[14px] text-[var(--fg-muted)]">{t('geminiStep')}</p>
          <CopyBlock value={gemini} label={t('copyGemini')} />
        </Client>

        <Client name={t('other')}>
          <p className="text-[14px] text-[var(--fg-muted)]">{t('otherStep')}</p>
        </Client>
      </div>

      <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">{t('revoke')}</p>
      <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">{t('labelsNote')}</p>
    </section>
  )
}
