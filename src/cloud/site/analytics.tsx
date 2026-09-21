/**
 * Reach measurement on the public website, with Umami.
 *
 * Three decisions are in this file, and each is the reason it is this small:
 *
 * The **public pages only**. The workspace is where people's work is: which
 * workshop somebody opened, when, and how often is not a number we need, and
 * collecting it would make every page view a processing of their content. What
 * is measured is the shop window -- which pages a visitor reads before
 * registering.
 *
 * **Only when configured.** Without GW_ANALYTICS_SCRIPT_URL nothing is loaded
 * and the content security policy stays strict (see src/middleware.ts). A
 * self-hosted installation never renders this at all: the site is cloud-only.
 *
 * **Nothing that identifies anybody.** Umami sets no cookie and stores no IP
 * address; it counts page views against a hash that changes daily. That is what
 * makes this measurement lawful without asking for consent -- and the moment
 * that changes, the banner question has to be asked again.
 */
export function Analytics() {
  const src = process.env.GW_ANALYTICS_SCRIPT_URL
  const websiteId = process.env.GW_ANALYTICS_WEBSITE_ID
  if (!src || !websiteId) return null

  // A plain element, not next/script: one counter needs no loading strategy,
  // and this way the markup is what the test reads and what the browser gets.
  return <script src={src} data-website-id={websiteId} defer async />
}
