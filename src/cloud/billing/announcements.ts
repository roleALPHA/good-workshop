import { viennaDay } from './usage'
import { announce, localeOf, type Db, type RunOptions } from './context'

/**
 * A new version of a legal text, announced to everybody it binds.
 *
 * Started by an operator rather than by a deploy: publishing a text and putting
 * it into force are two decisions, and the second one carries a date the
 * customer can object until (AGB § 14.3 and § 14.4).
 */

/**
 * Announcements an operator has made and the run has not yet sent.
 *
 * The decision is a row in `legal_announcement`; this is the step that turns it
 * into mail. An interrupted run picks up the rest rather than starting over --
 * `legal_acknowledgement` has a unique key per workspace and version, which is
 * what makes that safe.
 *
 * It stays open until the day it applies, and that is the point rather than an
 * oversight. Marking it done after the first pass left out everybody who
 * registered between the announcement and its effective date -- they agreed to
 * the old wording, got no mail and saw no banner, and the six weeks § 4.7
 * promises were six weeks nobody told them about. Telling twice is not the
 * risk: the acknowledgement row per workspace and version prevents that.
 */
export async function pendingAnnouncements(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select id, document, version, effective_from from legal_announcement
      where completed_at is null order by created_at`,
  )
  for (const announcement of rows) {
    const told = await announceTermsChange(
      db,
      announcement.document,
      announcement.version,
      viennaDay(announcement.effective_from),
      options,
    )
    await db.query(
      `update legal_announcement
          set told = coalesce(told, 0) + $2,
              completed_at = case when effective_from <= ($3::timestamptz at time zone 'Europe/Vienna')::date
                                  then now() end
        where id = $1`,
      [announcement.id, told, options.now],
    )
    options.log('billing: terms change announced', {
      document: announcement.document,
      version: announcement.version,
      told,
    })
  }
}

export async function announceTermsChange(
  db: Db,
  document: string,
  version: string,
  effectiveFrom: string,
  options: RunOptions,
): Promise<number> {
  const { rows } = await db.query(
    `select b.tenant_id, b.billing_email, b.locale
       from billing_account b
       join tenant_lifecycle l on l.tenant_id = b.tenant_id
      where l.state not in ('deleting')
        and not exists (select 1 from legal_acknowledgement a
                         where a.tenant_id = b.tenant_id and a.document = $1 and a.version = $2)`,
    [document, version],
  )

  let told = 0
  for (const tenant of rows) {
    const marked = await db.query(
      `insert into legal_acknowledgement (tenant_id, document, version, effective_from)
       values ($1, $2, $3, $4) on conflict do nothing returning tenant_id`,
      [tenant.tenant_id, document, version, effectiveFrom],
    )
    if (!marked.rowCount) continue
    told += 1
    await announce(options, {
      kind: 'terms_change',
      to: tenant.billing_email,
      locale: localeOf(tenant.locale),
      document,
      version,
      from: effectiveFrom,
    })
  }
  return told
}
