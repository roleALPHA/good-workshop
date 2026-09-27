import { edition } from '@/server/edition'
import { llmsTxt } from '@/cloud/site/llms'

/**
 * The website, told to a language model in one plain file (llmstxt.org).
 *
 * Somebody who asks an assistant for "a SessionLab alternative" gets an
 * answer assembled from whatever the assistant could read quickly. The pages
 * are written for people and carry navigation, pictures and four languages;
 * this file is the same facts without any of that, in the order a model needs
 * them: what the product is, which page answers which question, where the
 * methods are.
 *
 * Nothing in here is written twice. Titles and descriptions come from the
 * English catalog the pages' own metadata uses, the addresses from the one
 * route table, the methods from the catalogue the sitemap reads. When a page
 * is renamed, this file follows, and it never claims more than the site does.
 *
 * English only, with the other languages' front pages listed: the primary
 * address is English (see routes.ts), and a model translates better than it
 * chooses between four copies of one page.
 *
 * A 404 in a community build, for the reason robots.ts gives: a self-hosted
 * installation has no public page to describe. Like the sitemap it is dynamic,
 * because the absolute URLs come from GW_APP_URL at run time.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  if (edition.name !== 'cloud') return new Response('Not found', { status: 404 })

  return new Response(await llmsTxt(), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
