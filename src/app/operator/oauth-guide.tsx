'use client'

import { CopyBlock } from '@/components/copy-block'
// From `src/server`, not `src/cloud`: this is the list itself, and taking it
// from the edition-only module would be a reason for the community build to
// trace a file it must not contain.
import { OPERATOR_OAUTH_SCOPES } from '@/server/operator/scopes'

/** One client per disclosure, all closed: nobody connects four of them. */
function Client({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <details className="rounded border border-[var(--border)] bg-[var(--surface-raised)]">
      <summary className="cursor-pointer px-3 py-2.5 text-[15px] font-medium">{name}</summary>
      <div className="px-3 pt-1 pb-3">{children}</div>
    </details>
  )
}

/**
 * How to point an MCP client at the console, with no token at all.
 *
 * `resource_documentation` in the protected-resource document already names
 * this page, so a client that refuses a connection sends whoever is holding it
 * here. Until now they arrived at a passkey list.
 *
 * The three facts below are the ones the flow itself will never tell anybody,
 * and each of them costs an hour to work out from the outside:
 *
 *  - The console answers the tailnet and nothing else (`deploy/Caddyfile`:
 *    everything from another address gets 403). So a connector hosted in a
 *    vendor's cloud -- claude.ai, ChatGPT -- cannot reach it however correct
 *    the URL is, and what it shows is "couldn't reach the server". Only a
 *    client running on a machine that is itself on the tailnet works.
 *  - Being signed in here does not carry over to the consent screen on the
 *    first, cross-site arrival: the cookie is `sameSite=strict`, so that screen
 *    asks for the passkey in place of its content. Expected, not a fault --
 *    without the warning it reads like the sign-in was lost.
 *  - `ops:danger` is not in what the server offers, so a client asking for
 *    "everything" does not get it. It has to be named, and that is the point.
 *
 * English and hardcoded, like `Connections` next to it.
 */
export function OAuthGuide({ endpoint }: { endpoint: string }) {
  // No token and no header: the endpoint answers 401 with a `resource_metadata`
  // pointer, and the client takes itself from there through the whole flow.
  //
  // Named `goodworkshop-ops`, not `goodworkshop`: whoever operates the cloud is
  // likely to have the customers' server connected under that name already, and
  // the second `mcp add` would quietly replace the first.
  const claudeCode = `claude mcp add --transport http goodworkshop-ops ${endpoint}`
  const gemini = `gemini mcp add --transport http goodworkshop-ops ${endpoint}`

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-6" aria-labelledby="oauth">
      <h2 id="oauth" className="text-[17px] font-medium">
        Connect a client over OAuth
      </h2>
      <p className="mt-1 max-w-2xl text-[15px] text-[var(--fg-muted)]">
        The console speaks MCP at the address below. A client that supports OAuth needs nothing else
        — no token, no header. It asks the address who is allowed to issue credentials for it, sends
        you here to approve, and holds a credential of its own afterwards.
      </p>

      <p className="mt-4 text-[13px] text-[var(--fg-muted)]">MCP endpoint</p>
      <CopyBlock value={endpoint} label="Copy the endpoint" />

      <ul className="mt-3 max-w-2xl list-disc space-y-1.5 pl-5 text-[14px] text-[var(--fg-muted)]">
        <li>
          <strong className="font-medium">The console answers the tailnet only.</strong> A connector
          that runs in a vendor&rsquo;s cloud — the one in claude.ai, the one in ChatGPT — reaches
          this name from the public internet and is refused with 403, whatever it shows you instead.
          Use a client on a machine that is on the tailnet itself.
        </li>
        <li>
          <strong className="font-medium">Expect the passkey once more on the way.</strong> You
          arrive at the approval screen from the client, which is a cross-site step, and this
          console&rsquo;s session cookie deliberately does not travel on those. The screen asks for
          your passkey and then shows the request — you have not been signed out.
        </li>
        <li>
          <strong className="font-medium">
            A client can be granted {OPERATOR_OAUTH_SCOPES.length} of the permissions
          </strong>{' '}
          — {OPERATOR_OAUTH_SCOPES.join(', ')}. Deleting a workspace (
          <code className="font-mono text-[13px]">ops:danger</code>) is not among them and is not
          granted by asking for everything; a client has to name it, and you still confirm each such
          action separately.
        </li>
      </ul>

      <div className="mt-4 max-w-2xl space-y-2">
        <Client name="Claude Code">
          <p className="text-[14px] text-[var(--fg-muted)]">
            Run this once, then <code className="font-mono text-[13px]">/mcp</code> in Claude Code
            starts the approval.
          </p>
          <CopyBlock value={claudeCode} label="Copy the Claude Code command" />
        </Client>

        <Client name="Gemini CLI">
          <p className="text-[14px] text-[var(--fg-muted)]">
            Same shape, same flow on the first call.
          </p>
          <CopyBlock value={gemini} label="Copy the Gemini CLI command" />
        </Client>

        <Client name="Anything else">
          <p className="text-[14px] text-[var(--fg-muted)]">
            Give it the endpoint above as a streamable HTTP MCP server and leave the authentication
            empty. Everything the client needs — where to register, where to send you, which
            permissions exist — it reads from{' '}
            <code className="font-mono text-[13px]">/.well-known/oauth-protected-resource</code>{' '}
            after the first 401. Clients that want a token instead can use an MCP access token from
            the list above.
          </p>
        </Client>
      </div>

      <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">
        Whatever connects this way shows up under Connected clients above, and disconnecting it
        there takes away everything it holds at once.
      </p>
    </section>
  )
}
