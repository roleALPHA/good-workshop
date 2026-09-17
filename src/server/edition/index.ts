import { selectedEdition } from '@gw/edition'
import type { Edition } from './types'

export type { Edition } from './types'

/**
 * The edition this build is.
 *
 * One export, imported everywhere a tenant has to be found before a credential
 * names one. Which implementation stands behind it is a build decision, not a
 * runtime switch: an environment variable an operator can set is a way to turn
 * a self-hosted installation into something it was never tested as.
 *
 * `@gw/edition` is an alias the build points at ./community.ts or ./cloud.ts
 * (next.config.ts, scripts/build-collab.mjs); a community build does not
 * contain the cloud implementation at all.
 */
export const edition: Edition = selectedEdition
