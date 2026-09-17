import { communityEdition } from './community'
import type { Edition } from './types'

export type { Edition } from './types'

/**
 * The edition this build is.
 *
 * One export, imported everywhere a tenant has to be found before a credential
 * names one. Which implementation stands behind it is a build decision, not a
 * runtime switch: an environment variable an operator can set is a way to turn
 * a self-hosted installation into something it was never tested as.
 */
export const edition: Edition = communityEdition
