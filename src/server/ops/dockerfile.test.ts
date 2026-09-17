import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { billingAdaptersPath } from '../../../scripts/edition-aliases.mjs'

/**
 * The build arguments, asserted like code -- because the edition seam is only
 * as good as the way a build picks its side of it.
 *
 * Two of them decide what ends up in an image: GW_EDITION picks community or
 * cloud, GW_BILLING_ADAPTERS picks the accounting and payment adapters. The
 * private cloud build passes the second one; every public build leaves it
 * alone and gets adapters that refuse to bill.
 */

const root = join(import.meta.dirname, '../../..')
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
const stage = (name: string) => {
  const parts = dockerfile.split(/^FROM .*AS /m)
  return parts.find((part) => part.startsWith(name)) ?? ''
}

describe('Dockerfile', () => {
  it('lets a build choose the billing adapters', () => {
    // Without this the private cloud image cannot reach its own adapters, and
    // the cloud would build with the ones that refuse every invoice.
    expect(stage('builder')).toMatch(/^ARG GW_BILLING_ADAPTERS/m)
    expect(stage('builder')).toMatch(/GW_BILLING_ADAPTERS=.*pnpm build|pnpm build/)
  })

  it('keeps both build arguments out of the runner stage', () => {
    // The choice is baked in at build time. A container that could be pointed
    // at other adapters -- or another edition -- by its environment would make
    // the whole seam a runtime switch.
    expect(stage('runner')).not.toMatch(/ARG GW_EDITION|ARG GW_BILLING_ADAPTERS/)
  })
})

describe('billingAdaptersPath', () => {
  const fallback = './src/cloud/billing/adapters/unavailable.ts'

  it('falls back when the variable is absent', () => {
    expect(billingAdaptersPath({}, fallback)).toBe(fallback)
  })

  it('falls back when the variable is empty', () => {
    // A Docker ARG that is declared but not passed arrives as an empty string,
    // not as undefined. `??` would hand esbuild an empty alias and the build
    // would fail with a path that points nowhere.
    expect(billingAdaptersPath({ GW_BILLING_ADAPTERS: '' }, fallback)).toBe(fallback)
    expect(billingAdaptersPath({ GW_BILLING_ADAPTERS: '  ' }, fallback)).toBe(fallback)
  })

  it('takes the path it is given', () => {
    expect(
      billingAdaptersPath({ GW_BILLING_ADAPTERS: './private/adapters/index.ts' }, fallback),
    ).toBe('./private/adapters/index.ts')
  })
})
