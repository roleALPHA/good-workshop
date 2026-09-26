import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PatActor } from './auth'
import { edition } from '@/server/edition'
import { registerCatalogTools } from './catalog-tools'
import { registerDayAgendaTools } from './day-agenda-tools'
import { registerDayBlockTools } from './day-block-tools'
import { registerDayReadTools } from './day-read-tools'
import { registerDayTools } from './day-tools'
import { registerLibraryTools } from './library-tools'
import { displayVersion } from '@/lib/version'

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
    { name: 'goodworkshop', version: displayVersion() },
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
        'The library holds folders, and folders hold workshops. A workshop has one or',
        'more days; a day holds blocks, optionally grouped into clusters.',
        '',
        'How to work:',
        '1. Call list_module_types to learn the available block types and their fields.',
        '2. create_workshop creates the workshop and its first day; create_day adds more,',
        '   move_day reorders them and delete_day removes one.',
        '3. apply_agenda writes a whole day agenda in one go.',
        '4. get_workshop reads a day with every id; update_module, move_module and',
        '   delete_module change single blocks, update_day the day itself.',
        '   update_modules changes the fields of many blocks in one call.',
        '',
        'Parking a block (update_module parked=true) takes it out of the schedule without',
        'deleting it. The parking area belongs to the whole workshop: get_workshop lists',
        'what is parked on the other days, and move_module with toDayId brings a block',
        'into another day.',
        '',
        'Start times are computed from the day start and the durations, never set.',
        'A block can be pinned to a fixed clock time with pinnedStartMinute.',
        '',
        'export_workshop returns the whole workshop as one Markdown document, every day',
        'in order. Use it to read a workshop as a text or to hand it on, rather than',
        'stitching get_workshop calls together.',
        '',
        'responsible names who answers for a block, one person or several: a member of the',
        'workspace by memberId or exact full name (first and last name), anybody else by name.',
        'get_workshop shows it.',
        '',
        'Every change optionally takes expectedVersion. Send back the contentVersion',
        'you last read -- otherwise a concurrent edit can be overwritten.',
        '',
        'Sharing workshops or folders and managing members are not available here;',
        'the person does that in the app.',
      ].join('\n'),
    },
  )

  registerLibraryTools(server, { actor, authorization })
  registerDayReadTools(server, { actor, authorization })
  registerDayTools(server, { actor, authorization })
  registerDayAgendaTools(server, { actor, authorization })
  registerDayBlockTools(server, { actor, authorization })
  // Only where there is a catalogue. A self-hosted installation would
  // otherwise be offered four tools that can only ever answer "nothing", which
  // is worse than not offering them: a model reads a tool list as a statement
  // about what this server can do.
  if (edition.hasCatalog) registerCatalogTools(server, { actor, authorization })
  return server
}
