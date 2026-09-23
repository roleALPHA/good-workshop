/**
 * The entry point the private cloud build names.
 *
 * It resolves `@gw/billing-conformance` to this file -- the same shape of
 * coupling as `@gw/billing-adapters`, and for the same reason: no publish step,
 * no build step, and the version of the contract that is checked is the one in
 * the checkout being built against.
 *
 * The self-test in this repository imports through the same specifier, so a
 * path that only works over there is a path that breaks over there.
 */
export { describeBillingAdapters, type ConformanceTarget } from './suite'
