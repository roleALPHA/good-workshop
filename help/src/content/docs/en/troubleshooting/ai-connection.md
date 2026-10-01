---
title: AI connection
description: When Claude, ChatGPT or another MCP client won't connect, reports 401 or 429, or a tool stops with an error message.
sidebar:
  order: 3
---

An AI assistant connects to GoodWorkshop over MCP, either with a token or over OAuth. You set up
both under **AI Connection** in the profile menu, see [Connect an assistant](/en/ai/connect/). The
server URL is always your installation's address followed by `/api/mcp`; the **AI Connection**
page shows it for copying.

Tool error messages are in **English**, because they go to the model, not to you. The texts below
are quoted in the original.

## The client doesn't connect at all

| What you see                                                 | Cause and solution                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (web, desktop, app) or ChatGPT can't reach the server | These clients connect from their vendors' cloud. That only works if the server URL is reachable from the internet over HTTPS. An installation on a company network can only be reached by clients on your computer, such as Claude Code or the Gemini CLI. |
| The server URL shown is wrong (self-hosted)                  | The URL is built from `GW_APP_URL`. Correct the value, see [Configuration](/en/self-hosting/configuration/).                                                                                                                                               |
| `method_not_allowed`                                         | The client addresses the server with GET. GoodWorkshop only accepts MCP via POST (“Streamable HTTP”) and doesn't send anything on its own. Choose the HTTP transport in the client; for Claude Code and Gemini CLI, `--transport http`.                    |

## HTTP 401: `invalid_token`

The server didn't accept the token. Possible reasons:

- **The token was revoked** or never copied completely. A token is only shown once in plain text,
  right after **Create a token**. If it's gone, create a new one.
- **“Bearer” twice or not at all.** The header is `Authorization: Bearer gwp_…`. Langdock adds the
  word “Bearer” itself — there you paste only the bare token.
- **Codex: the environment variable is missing.** The entry only names `GW_TOKEN`. If
  `export GW_TOKEN=…` isn't in your shell configuration, Codex only knows the token in that one
  terminal.
- **Claude Desktop: a space in the header.** Claude Desktop splits `args` at spaces.
  `"Authorization: Bearer …"` becomes two arguments, and the header silently drops out. Copy the
  configuration exactly as the **AI Connection** page shows it: the token in `env`, and
  `Authorization:${GW_TOKEN}` without a space in the argument.
- **OAuth access has expired or been disconnected.** Connect the client again.
- **The account is no longer a member** or was disabled. Its tokens disappear along with the
  membership.

## Problems with OAuth and the consent page

With OAuth, you sign in to GoodWorkshop in the browser and confirm on the **Allow access?** page
what the client may do.

:::tip[Sign in first, then connect]
Sign in to GoodWorkshop in this browser beforehand. Otherwise you land in the library after signing
in, and you have to start connecting again from the client.
:::

If the request fails, the consent page shows the reason instead of a button:

| Message                                                             | Meaning                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| “This installation does not know that client.”                      | The client didn't register, or registered with a different installation. |
| “That redirect address does not belong to this client.”             | The redirect address has to match a registered one exactly.              |
| “This request names a response type this server does not offer.”    | The client is asking for something other than the authorization code.    |
| “This request arrives without valid PKCE. This server requires it.” | The server requires PKCE with S256.                                      |
| “This access was requested for a different server.”                 | The client requested a token for a different server URL.                 |

In all cases: “Nothing was granted. Start again from the client — if it fails again, the fault is
in its configuration.”

## HTTP 429: `rate_limited`

`/api/mcp` accepts at most **60 requests per minute** per client address. An assistant that calls
a great many tools in a row can reach that. Wait a minute.

Self-hosted: if many users hit the limit at the same time, the real client address probably isn't
getting through — then everyone shares the same counter. Check whether your proxy sets
`X-Forwarded-For` and whether `GW_TRUSTED_PROXIES` matches the number of proxies, see
[HTTPS and reverse proxy](/en/self-hosting/tls/).

## A tool stops with a message

| Tool message                                                                                                                              | Meaning and solution                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `This token does not have the "workshops:write" scope. Create a token with that scope in the settings.`                                   | The token lacks a scope (here **Write workshops**). Scopes can't be changed afterwards: create a new token with the scopes you need.                                            |
| `You do not have permission for that: …`                                                                                                  | The token acts as you and can never do more than you — you lack the right to this workshop.                                                                                     |
| `The workshop has changed in the meantime (expected …, found …).`                                                                         | Someone else has changed the workshop in the meantime. The assistant should read again and try once more.                                                                       |
| `The collaboration service is unreachable. Nothing can be written without it, because that would mean two write paths onto the same day.` | Writing only works through the collaboration service. Self-hosted: check whether it's running and reachable (`GW_COLLAB_INTERNAL_URL`).                                         |
| `The call failed. The operator can find the cause in the server log under the reference …`                                                | An internal error. Whoever runs the installation finds the reason under that reference in the log. In the cloud, give the reference to [Support](/en/troubleshooting/support/). |

:::note[What an assistant may never do]
Neither a token nor OAuth access can invite members, appoint admins or manage sharing. That's
intentional and can't be unlocked.
:::

## End access

You revoke a token under **AI Connection** with **Revoke**. You end OAuth access by disconnecting
the connector in the client — GoodWorkshop itself can't revoke it yet, see
[Known issues](/en/troubleshooting/known-issues/).

## Read on

- [Connect an assistant](/en/ai/connect/)
- [Tool reference](/en/ai/tools/)
- [Overview](/en/troubleshooting/overview/)
