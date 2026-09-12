/**
 * Just enough ICU parsing to compare two translations of the same message.
 *
 * Written rather than regexed because the obvious regex is wrong in a way that
 * only shows up once plurals exist: in `{count, plural, one {Tag} other {Tage}}`
 * a pattern looking for `{identifier}` happily reports `Tag` and `Tage` as
 * arguments. The French version then "disagrees" about its arguments on every
 * single plural, and the check that was supposed to catch a renamed placeholder
 * becomes noise somebody switches off.
 *
 * So the structure has to be walked: inside a `plural`/`select`, a `{` opens an
 * arm body, and only inside that body does `{` mean an argument again.
 */

export type IcuShape = {
  /** Argument names, e.g. `count`, `name`. Nested arguments included. */
  args: Set<string>
  /** Declared categories per plural argument, e.g. `count` -> {one, other}. */
  plurals: Map<string, Set<string>>
}

const SUBMESSAGE_TYPES = new Set(['plural', 'select', 'selectordinal'])

export function icuShape(message: string): IcuShape {
  const shape: IcuShape = { args: new Set(), plurals: new Map() }
  parseMessage(message, 0, shape)
  return shape
}

/** Reads message text until an unmatched `}` or the end. Returns that index. */
function parseMessage(source: string, start: number, shape: IcuShape): number {
  let i = start
  while (i < source.length) {
    const char = source[i]!
    if (char === "'") {
      i = skipQuoted(source, i)
      continue
    }
    if (char === '}') return i
    if (char === '{') {
      i = parseArgument(source, i, shape)
      continue
    }
    i += 1
  }
  return i
}

function parseArgument(source: string, open: number, shape: IcuShape): number {
  let i = open + 1
  i = skipSpace(source, i)

  const nameStart = i
  while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) i += 1
  const name = source.slice(nameStart, i)
  i = skipSpace(source, i)

  // `{}` or `{ ,` -- malformed. Consume to the closing brace and move on: this
  // is a comparison tool, not a validator, and it must not throw on a catalog
  // somebody is halfway through editing.
  if (name === '') return closeOf(source, open)

  shape.args.add(name)

  if (source[i] !== ',') return i < source.length ? i + 1 : i

  i = skipSpace(source, i + 1)
  const typeStart = i
  while (i < source.length && /[a-zA-Z]/.test(source[i]!)) i += 1
  const type = source.slice(typeStart, i)

  if (!SUBMESSAGE_TYPES.has(type)) {
    // `{when, date, short}` and friends: no nested message to walk.
    return closeOf(source, open)
  }

  i = skipSpace(source, i)
  if (source[i] === ',') i += 1

  const categories = new Set<string>()
  while (i < source.length) {
    i = skipSpace(source, i)
    if (source[i] === '}') {
      i += 1
      break
    }
    // `offset:1` is a plural modifier, not an arm.
    const armStart = i
    while (i < source.length && !/[\s{}]/.test(source[i]!)) i += 1
    const arm = source.slice(armStart, i)
    if (arm === '') break
    i = skipSpace(source, i)
    if (source[i] !== '{') {
      if (arm.startsWith('offset:')) continue
      break
    }
    if (!arm.startsWith('offset:')) categories.add(arm)
    i = parseMessage(source, i + 1, shape)
    if (source[i] === '}') i += 1
  }

  if (type !== 'select') shape.plurals.set(name, categories)
  return i
}

function skipSpace(source: string, i: number): number {
  while (i < source.length && /\s/.test(source[i]!)) i += 1
  return i
}

/**
 * ICU apostrophe handling, which is narrower than it looks.
 *
 * A single quote only starts a quoted run when the next character is one ICU
 * would otherwise treat as syntax -- `{`, `}` or `#`. Everywhere else it is
 * simply an apostrophe. Getting this wrong is not academic: "L'atelier a été
 * modifié (attendu {expected})" has exactly one quote in it, and a parser that
 * treats it as an opening one swallows the rest of the sentence along with
 * every argument in it. Which is most French messages.
 */
function skipQuoted(source: string, i: number): number {
  const next = source[i + 1]
  if (next === "'") return i + 2
  if (next !== '{' && next !== '}' && next !== '#') return i + 1

  const end = source.indexOf("'", i + 1)
  return end === -1 ? source.length : end + 1
}

/** Index just past the `}` matching the `{` at `open`. */
function closeOf(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return source.length
}
