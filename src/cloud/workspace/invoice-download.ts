import { sql } from 'drizzle-orm'
import { withTenant, type Actor } from '@/server/db'
import { assertTenantAdmin } from '@/domain/tenant/members'
/**
 * A workspace's own invoice, as it was sent.
 *
 * Whose invoice this is, is not decided here: the query runs in the tenant's
 * own transaction, and the row level security policy on invoice_document
 * answers only for rows carrying that tenant's id. A month belonging to
 * somebody else comes back as nothing -- there is no query this function could
 * be talked into that returns another workspace's document.
 *
 * Admins only, because an invoice is commercial rather than workshop content.
 */
export async function readInvoiceDocument(
  actor: Actor,
  month: string,
): Promise<{ filename: string; content: Buffer } | null> {
  assertTenantAdmin(actor)
  // A month, and nothing else: the value goes into a date comparison, and a
  // clear refusal beats a database error.
  if (!/^\d{4}-\d{2}$/.test(month)) return null

  return withTenant(actor, async (tx) => {
    const result = (await tx.execute(
      sql`select filename, content from invoice_document where month = ${`${month}-01`}::date`,
    )) as unknown as { rows: { filename: string; content: Buffer }[] }
    const row = result.rows[0]
    return row ? { filename: row.filename, content: row.content } : null
  })
}
