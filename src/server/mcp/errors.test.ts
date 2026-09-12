import { describe, expect, it } from 'vitest'
import { UnknownModuleTypeError, VersionConflictError } from '@/domain/agenda/access'
import { publicToolError } from './errors'

/**
 * What an MCP client is told when something breaks.
 *
 * `fail(error.message)` hands the raw text through: Postgres names its
 * constraints, columns and tables in its messages, and the collaboration client
 * names the internal host and port it could not reach. A token holder is not
 * the public, so this is not severe -- but a token is a credential a person
 * hands to a third-party LLM client, and a schema dump is a schema dump.
 *
 * The operator still needs the real text. It goes to the log with an id, and
 * the id goes to the client, so the two can be put back together by somebody
 * entitled to do it.
 */
describe('publicToolError', () => {
  it.each([
    {
      name: 'a constraint violation',
      error: Object.assign(
        new Error('duplicate key value violates unique constraint "module_pkey"'),
        {
          code: '23505',
        },
      ),
      leaks: /module_pkey|23505/,
    },
    {
      name: 'an unreachable collaboration service',
      error: new Error('connect ECONNREFUSED 172.18.0.4:3001'),
      leaks: /172\.18\.0\.4|3001/,
    },
    {
      name: 'a missing relation',
      error: new Error('relation "workshop_day" does not exist'),
      leaks: /workshop_day/,
    },
  ])('does not pass on the internals of $name', ({ error, leaks }) => {
    expect(publicToolError(error).message).not.toMatch(leaks)
  })

  it('gives the caller something to quote to the operator', () => {
    const { message, correlationId } = publicToolError(new Error('boom'))
    expect(correlationId).toMatch(/^[0-9a-z]{8,}$/i)
    expect(message).toContain(correlationId)
  })

  it('keeps errors that were written for the caller intact', () => {
    // Not everything is an internal failure. An unknown block type and a
    // version conflict are answers to the request, and flattening them into
    // "something went wrong" would make the tool unusable for a model that has
    // to decide what to do next.
    //
    // This used to be the theory and not the behaviour: publicToolError looked
    // for `expose === true` and nothing in the tree ever set it, so every one
    // of these was flattened. DomainError sets it on the base class.
    const known = new UnknownModuleTypeError('kaffeepause', ['break', 'check_in'])
    const { message } = publicToolError(known)
    expect(message).toContain('kaffeepause')
    expect(message).toContain('break, check_in')
  })

  it('answers in English, whatever the caller reads', () => {
    // The audience is a model, and the text is prompt material it decides its
    // next call from. See the note in errors.ts.
    const { message } = publicToolError(new VersionConflictError(7n, 9n))
    expect(message).toContain('has changed in the meantime')
    expect(message).toContain('7')
    expect(message).toContain('9')
  })
})
