/**
 * The shape of an agenda a model may write, and the walk over it.
 *
 * A breakout is a THIRD item shape, not a recursion. A self-referential Zod
 * schema does not throw -- it comes out of the SDK's conversion as
 * `{"$ref": "#/definitions/__schema0"}`, a generated name with none of the
 * describe() text the inner level carries, and it advertises unlimited nesting
 * where the domain has exactly two levels. Spelling all three variants out
 * costs a few lines and gives the model something it can read.
 */
import { z } from 'zod'
import { CATEGORY_COLORS } from '@/lib/category-colors'
import { Minute } from './day-write'

export type PersonRef = { name?: string; memberId?: string }

export type BlockShape = {
  typeKey: string
  title?: string
  durationMinutes?: number
  pinnedStartMinute?: number | null
  parked?: boolean
  desc?: Record<string, unknown>
  responsible?: PersonRef[]
}

export type StrandShape = { title: string; color?: string; children?: BlockShape[] }

export type AgendaItem =
  | { kind: 'cluster'; children?: BlockShape[] }
  | { kind: 'breakout'; children: StrandShape[] }
  | ({ kind: 'module' } & BlockShape)

/**
 * Every block in an agenda, with the path a model can fix it by.
 *
 * One walker, three callers: the type check, the desc validation and the
 * people lookup all have to name the SAME place, and three loops each building
 * their own path is three chances for an error to point somewhere the input is
 * not. The recursion lives here and nowhere else.
 */
export function* agendaBlocks<T extends AgendaItem>(
  items: T[],
): Generator<{ at: string; block: BlockShape }> {
  for (const [i, item] of items.entries()) {
    const at = `items[${i}]`
    if (item.kind === 'module') {
      yield { at, block: item }
    } else if (item.kind === 'cluster') {
      for (const [j, child] of (item.children ?? []).entries()) {
        yield { at: `${at}.children[${j}]`, block: child }
      }
    } else {
      for (const [j, strand] of item.children.entries()) {
        for (const [k, child] of (strand.children ?? []).entries()) {
          yield { at: `${at}.children[${j}].children[${k}]`, block: child }
        }
      }
    }
  }
}

/** Builds the `items` schema. Takes the block fields so the tool keeps owning them. */
export function agendaItemsSchema<T extends z.ZodRawShape>(blockFields: T) {
  const BlockItem = z.object(blockFields)

  /** One strand of a breakout: its own little agenda, in its own room. */
  const StrandItem = z.object({
    title: z
      .string()
      .min(1)
      .describe('What this strand is called -- the group, the room, the topic.'),
    color: z.enum(CATEGORY_COLORS).optional(),
    children: z
      .array(BlockItem)
      .optional()
      .describe('The blocks of THIS strand, in order. They run one after another inside it.'),
  })

  return z.array(
    // discriminatedUnion rather than union: the generated JSON Schema gets
    // `oneOf` with a const discriminator instead of an untagged `anyOf`, and a
    // Zod error names the one variant that was meant instead of complaining
    // about three at once.
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('cluster'),
        title: z.string().min(1),
        color: z.enum(CATEGORY_COLORS).optional(),
        pinnedStartMinute: Minute.nullable().optional(),
        children: z.array(BlockItem).optional(),
      }),
      z.object({
        kind: z.literal('breakout'),
        title: z.string().min(1),
        color: z.enum(CATEGORY_COLORS).optional(),
        pinnedStartMinute: Minute.nullable().optional(),
        children: z
          .array(StrandItem)
          .min(1)
          .describe(
            'The strands, which all run AT THE SAME TIME -- parallel small groups in separate ' +
              'rooms. Every strand starts when the breakout starts; the breakout ends when the ' +
              'longest strand does. Two or more is the point of a breakout. A strand holds ' +
              'blocks, never another breakout.',
          ),
      }),
      z.object({ kind: z.literal('module'), ...blockFields }),
    ]),
  )
}
