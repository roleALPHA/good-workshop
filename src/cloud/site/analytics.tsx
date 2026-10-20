/**
 * Reach measurement on the public website, with Umami: page views, the
 * conversions (see ./track.ts), and -- through the recorder -- session replays
 * and heatmaps.
 *
 * Four decisions are in this file, and each is the reason it is this small:
 *
 * The **public pages only**. The workspace is where people's work is: which
 * workshop somebody opened, when, and how often is not a number we need, and
 * collecting it would make every page view a processing of their content. What
 * is measured is the shop window -- which pages a visitor reads before
 * registering, and where on them they get stuck.
 *
 * **Only when configured.** Without GW_ANALYTICS_SCRIPT_URL nothing is loaded
 * and the content security policy stays strict (see src/middleware.ts). A
 * self-hosted installation never renders this at all: the site is cloud-only.
 *
 * **Nothing that identifies anybody.** Umami sets no cookie and stores no IP
 * address; it counts against a hash that changes daily. The recorder masks
 * every input field (the masking level and the sampling rate are set in the
 * Umami dashboard, not here), and the registration pages carry `rr-block`, so
 * a replay shows an empty box where the form is -- also when the visitor got
 * there by a client-side navigation and the recorder was already running.
 * That is what makes this measurement lawful without asking for consent, and
 * the privacy policy says so. The moment any of it changes, the banner
 * question has to be asked again.
 *
 * **The recorder rides on the counter.** It waits for the counter's session
 * before it records anything, so both come from the same server and the
 * recorder's address is derived from the counter's rather than configured.
 */
export function Analytics() {
  const src = process.env.GW_ANALYTICS_SCRIPT_URL
  const websiteId = process.env.GW_ANALYTICS_WEBSITE_ID
  if (!src || !websiteId) return null

  // Plain elements, not next/script: two tags need no loading strategy, and
  // this way the markup is what the test reads and what the browser gets.
  return (
    <>
      <script src={src} data-website-id={websiteId} defer async />
      <script src={new URL('recorder.js', src).href} data-website-id={websiteId} defer async />
    </>
  )
}
