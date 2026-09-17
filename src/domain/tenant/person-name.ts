import { DomainError } from '@/domain/errors'

/**
 * A member's name, as two fields.
 *
 * Two rather than one free-text "display name" because the one field was never
 * filled in: nothing asked for it, so every screen fell back to an e-mail
 * address, and every agenda that named a colleague named them by the part of
 * their address before the @. Asking for first and last name separately is
 * what a person expects from a form, and it gives initials and sorting
 * something to work with.
 *
 * The name lives on `member`, not on the global `identity`: it is tenant data
 * that an admin may correct, and gw_app can read it without crossing into the
 * auth role.
 */
export type PersonName = { firstName: string; lastName: string }

/** Matches the check constraint on `member.first_name` / `member.last_name`. */
export const PERSON_NAME_MAX_LENGTH = 100

export class PersonNameError extends DomainError {}

/**
 * Trimmed, whitespace collapsed, invisible characters removed -- and both parts
 * present.
 *
 * Control and zero-width characters go because a name is compared by exact
 * match when a model names somebody responsible for a block; "Anna" with a
 * zero-width space in it would look identical and match nobody.
 */
export function normalisePersonName(input: {
  firstName?: unknown
  lastName?: unknown
}): PersonName {
  const firstName = clean(input.firstName)
  const lastName = clean(input.lastName)

  if (firstName === '') throw new PersonNameError('person.firstNameRequired')
  if (lastName === '') throw new PersonNameError('person.lastNameRequired')
  if (firstName.length > PERSON_NAME_MAX_LENGTH || lastName.length > PERSON_NAME_MAX_LENGTH) {
    throw new PersonNameError('person.nameTooLong', { max: PERSON_NAME_MAX_LENGTH })
  }

  return { firstName, lastName }
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\p{Cc}\p{Cf}]/gu, (char) => (/\s/.test(char) ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Vorname Nachname", or whichever half exists, or ''. */
export function fullName(name: PersonName): string {
  return [name.firstName.trim(), name.lastName.trim()].filter(Boolean).join(' ')
}

/**
 * What to call somebody on screen. Members who joined before names were asked
 * for have none yet, and their address is still the one thing that identifies
 * them.
 */
export function displayNameOf(name: PersonName, email: string): string {
  return fullName(name) || email
}
