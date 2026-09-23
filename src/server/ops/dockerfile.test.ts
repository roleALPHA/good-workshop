import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { billingAdaptersPath, catalogPath } from '../../../scripts/edition-aliases.mjs'

/**
 * The build arguments, asserted like code -- because the edition seam is only
 * as good as the way a build picks its side of it.
 *
 * Three of them decide what ends up in an image: GW_EDITION picks community or
 * cloud, GW_BILLING_ADAPTERS picks the accounting and payment adapters, and
 * GW_CATALOG picks the Discover catalogue. The private cloud build passes the
 * last two; every public build leaves them alone and gets adapters that refuse
 * to bill and a catalogue with nothing in it.
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

  it('lets a build choose the catalogue', () => {
    // Without this the private cloud image builds with an empty Discover
    // library -- which looks exactly like a working one, and is the reason
    // this is asserted rather than noticed.
    expect(stage('builder')).toMatch(/^ARG GW_CATALOG/m)
    expect(stage('builder')).toMatch(/GW_CATALOG=\$\{GW_CATALOG\}/)
  })

  it('keeps every build argument out of the runner stage', () => {
    // The choice is baked in at build time. A container that could be pointed
    // at other adapters -- or another edition, or another catalogue -- by its
    // environment would make the whole seam a runtime switch.
    expect(stage('runner')).not.toMatch(/ARG GW_EDITION|ARG GW_BILLING_ADAPTERS|ARG GW_CATALOG/)
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

describe('catalogPath', () => {
  const fallback = './src/cloud/catalog/unavailable.ts'

  it('falls back when the variable is absent or empty', () => {
    // The same empty-string trap as above: a declared-but-unpassed ARG arrives
    // as '', and an empty alias points the bundler at nothing.
    expect(catalogPath({}, fallback)).toBe(fallback)
    expect(catalogPath({ GW_CATALOG: '' }, fallback)).toBe(fallback)
    expect(catalogPath({ GW_CATALOG: '  ' }, fallback)).toBe(fallback)
  })

  it('takes the path it is given', () => {
    expect(catalogPath({ GW_CATALOG: './private/catalog/index.ts' }, fallback)).toBe(
      './private/catalog/index.ts',
    )
  })
})
