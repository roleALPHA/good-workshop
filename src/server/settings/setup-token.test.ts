import { expect, it, vi } from 'vitest'
import { currentSetupToken, setupTokenMatches } from './setup-token'

it('shares the key across separately evaluated server bundles', async () => {
  const announced = currentSetupToken()

  vi.resetModules()
  const actionBundle = await import('./setup-token')

  expect(actionBundle.currentSetupToken()).toBe(announced)
  expect(actionBundle.setupTokenMatches(`  ${announced}  `)).toBe(true)
  expect(setupTokenMatches('another-key')).toBe(false)
})
