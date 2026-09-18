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
 * The licence links to the LICENSE file. Under AGPL it pointed at the source,
 * because AGPL section 13 is about the code being reachable over the network;
 * Apache 2.0 with the Commons Clause asks for something else -- whoever
 * receives the software gets the terms. The label names both halves because
 * the Clause's own last sentence requires any licence notice to mention it, and
 * "Apache-2.0" on its own would describe rights this project does not grant.
 */

export const ROLEALPHA_URL = 'https://rolealpha.com'
/** Where the source is, for anybody who would rather run it themselves. */
export const SOURCE_URL = 'https://github.com/roleALPHA/good-workshop'
export const LICENSE_URL = 'https://github.com/roleALPHA/good-workshop/blob/main/LICENSE'
export const LICENSE = 'Apache-2.0 + Commons Clause'

/** What a URL looks like when it is not clickable. */
const bare = (url: string) => url.replace(/^https:\/\//, '')

/** Plain text: the mail signatures and the print view, where a link is dead. */
export const ATTRIBUTION_TEXT =
  `GoodWorkshop · powered by roleALPHA (${bare(ROLEALPHA_URL)})` +
  ` · ${LICENSE} (${bare(LICENSE_URL)})`

/** Markdown: the export, which is a document somebody pastes somewhere. */
export const ATTRIBUTION_MARKDOWN =
  `GoodWorkshop · powered by [roleALPHA](${ROLEALPHA_URL})` + ` · [${LICENSE}](${LICENSE_URL})`
