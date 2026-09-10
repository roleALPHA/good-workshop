import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PatActor } from './auth'
import { registerTools } from './tools'

/**
 * A fresh server per request.
 *
 * Stateless on purpose: no session store, no sticky sessions, and the tool list
 * can differ per token because it is built after the token is known. The cost
 * is rebuilding a small object per call; the benefit is that two containers
 * behind a load balancer need no coordination at all.
 */
export function buildMcpServer(actor: PatActor): McpServer {
  const server = new McpServer(
    { name: 'goodworkshop', version: process.env.GW_VERSION ?? 'dev' },
    {
      instructions: [
        'GoodWorkshop plant Workshop-Abläufe.',
        '',
        'Vorgehen:',
        '1. list_module_types aufrufen, um die verfügbaren Blocktypen und ihre Felder zu kennen.',
        '2. create_workshop legt Workshop und ersten Tag an.',
        '3. apply_agenda schreibt den ganzen Tagesablauf in einem Zug.',
        '',
        'Startzeiten werden aus Tagesbeginn und Dauern berechnet und nie gesetzt.',
        'Ein Block kann mit pinnedStartMinute auf eine feste Uhrzeit genagelt werden.',
        '',
        'Jede Änderung nimmt optional expectedVersion. Schicke die contentVersion mit,',
        'die du zuletzt gelesen hast — sonst kann eine gleichzeitige Bearbeitung',
        'überschrieben werden.',
      ].join('\n'),
    },
  )

  registerTools(server, { actor })
  return server
}
