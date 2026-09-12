'use client'

import { useTranslations } from 'next-intl'
import { CopyBlock } from '@/components/copy-block'

/** What stands in for the secret once it can no longer be shown. */
const PLACEHOLDER = 'gwp_dein_token'

/**
 * Ready-made connection instructions, one disclosure per client.
 *
 * The screen used to hand somebody a secret and a sentence about a header.
 * Everything a client actually needs -- the host, the transport, the exact
 * shape of the header -- was left as an exercise, and the token is gone the
 * moment the panel is dismissed. So the commands are rendered filled in:
 * real origin, real token, one tap to copy.
 *
 * `token === null` is the version that lives on the page permanently, with a
 * placeholder where the secret was. It is worth having: the steps are what
 * somebody comes back for, and coming back should not mean minting a second
 * credential.
 *
 * All four are closed by default. A facilitator on a phone uses one client,
 * not four, and four open blocks is a wall.
 */
export function ConnectGuide({ origin, token }: { origin: string; token: string | null }) {
  const t = useTranslations('settings.tokens.connect')
  const endpoint = `${origin}/api/mcp`
  const secret = token ?? PLACEHOLDER

  const claudeCode = `claude mcp add --transport http goodworkshop ${endpoint} --header "Authorization: Bearer ${secret}"`

  const gemini = `gemini mcp add --transport http --header "Authorization: Bearer ${secret}" goodworkshop ${endpoint}`

  // The header goes in through `env` and the argument carries no space after
  // the colon. Claude Desktop splits `args` on whitespace, so the readable
  // `"Authorization: Bearer …"` arrives at mcp-remote as two arguments and the
  // header is dropped -- with no error, just a server that refuses every call.
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        goodworkshop: {
          command: 'npx',
          args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:${GW_TOKEN}'],
          env: { GW_TOKEN: `Bearer ${secret}` },
        },
      },
    },
    null,
    2,
  )

  return (
    <section className="mt-6">
      <h2 className="text-[15px] font-medium">{t('title')}</h2>
      <p className="mt-0.5 mb-2 text-[14px] text-[var(--fg-muted)]">
        {token ? t('freshNote') : t('placeholderNote')}
      </p>

      <div className="space-y-2">
        <Client name={t('claudeCode')}>
          <p className="text-[14px] text-[var(--fg-muted)]">{t('claudeCodeStep')}</p>
          <CopyBlock value={claudeCode} label={t('copyCommand')} />
        </Client>

        <Client name={t('claudeDesktop')}>
          <p className="text-[14px] text-[var(--fg-muted)]">{t('claudeDesktopStep')}</p>
          <p className="mt-1 font-mono text-[13px] break-all text-[var(--fg-subtle)]">
            {t('claudeDesktopPath')}
          </p>
          <CopyBlock value={claudeDesktop} label={t('copyConfig')} />
        </Client>

        <Client name={t('gemini')}>
          <p className="text-[14px] text-[var(--fg-muted)]">{t('geminiStep')}</p>
          <CopyBlock value={gemini} label={t('copyGemini')} />
        </Client>

        <Client name={t('langdock')}>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-[var(--fg-muted)]">
            <li>{t('langdockStep1')}</li>
            <li>
              {t('langdockStep2')}
              <CopyBlock value={endpoint} label={t('copyEndpoint')} />
            </li>
            <li>{t('langdockStep3')}</li>
            <li>
              {t('langdockStep4')}
              <CopyBlock value={secret} label={t('copyToken')} />
            </li>
            <li>{t('langdockStep5')}</li>
          </ol>
        </Client>
      </div>
    </section>
  )
}

/** The project's disclosure: a native `details`, not a hand-rolled one. */
function Client({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <details className="rounded border border-[var(--border)] bg-[var(--surface-raised)]">
      <summary className="cursor-pointer px-3 py-2.5 text-[15px] font-medium">{name}</summary>
      <div className="px-3 pt-1 pb-3">{children}</div>
    </details>
  )
}
