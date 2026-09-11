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
export function buildMcpServer(actor: PatActor, authorization: string): McpServer {
  const server = new McpServer(
    { name: 'goodworkshop', version: process.env.GW_VERSION ?? 'dev' },
    {
      /**
       * English, always, and not from the message catalog.
       *
       * This is prompt material: a model reads it and decides what to call. The
       * other three languages exist for people, and translating a tool surface
       * into them would mean four artifacts whose correctness means "the model
       * still behaves" -- which no translator can check. See the same decision
       * in ./errors.ts.
       *
       * What a HUMAN eventually reads is treated differently: get_workshop
       * takes an explicit `locale` for the Markdown somebody will paste into a
       * document.
       */
      instructions: [
        'GoodWorkshop plans workshop agendas.',
        '',
        'How to work:',
        '1. Call list_module_types to learn the available block types and their fields.',
        '2. create_workshop creates the workshop and its first day.',
        '3. apply_agenda writes a whole day agenda in one go.',
        '',
        'Start times are computed from the day start and the durations, never set.',
        'A block can be pinned to a fixed clock time with pinnedStartMinute.',
        '',
        'Every change optionally takes expectedVersion. Send back the contentVersion',
        'you last read -- otherwise a concurrent edit can be overwritten.',
      ].join('\n'),
    },
  )

  registerTools(server, { actor, authorization })
  return server
}
