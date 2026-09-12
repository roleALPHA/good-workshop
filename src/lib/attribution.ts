/**
 * The attribution line, in the three shapes its surfaces need.
 *
 * It was five hardcoded copies of one sentence -- footer, print view, two mail
 * signatures and the Markdown export. That held while the sentence was four
 * words; it stops holding the moment the sentence carries a URL, because the
 * copy nobody remembers is the one that keeps pointing at nothing.
 *
 * Still deliberately outside `src/messages`: docs/languages.md says this line
 * is the same in every language and is never interpolated from tenant data, so
 * no catalog and no branding setting can quietly replace it. A constant is not
 * a translation.
 *
 * The licence links to the SOURCE rather than to the licence text. That is what
 * AGPL section 13 actually asks of a network service: somebody using this over
 * the network has to be able to get at the code, and a copy of the licence is
 * not the code.
 */

export const ROLEALPHA_URL = 'https://rolealpha.com'
export const SOURCE_URL = 'https://github.com/roleALPHA/good-workshop'
export const LICENSE = 'AGPL-3.0'

/** What a URL looks like when it is not clickable. */
const bare = (url: string) => url.replace(/^https:\/\//, '')

/** Plain text: the mail signatures and the print view, where a link is dead. */
export const ATTRIBUTION_TEXT =
  `GoodWorkshop · powered by roleALPHA (${bare(ROLEALPHA_URL)})` +
  ` · ${LICENSE} (${bare(SOURCE_URL)})`

/** Markdown: the export, which is a document somebody pastes somewhere. */
export const ATTRIBUTION_MARKDOWN =
  `GoodWorkshop · powered by [roleALPHA](${ROLEALPHA_URL})` + ` · [${LICENSE}](${SOURCE_URL})`
