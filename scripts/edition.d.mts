export type EditionName = 'community' | 'cloud'
export const EDITIONS: readonly EditionName[]
export function requestedEdition(): EditionName
export function builtEdition(): EditionName
export function writeEdition(edition?: EditionName): EditionName
