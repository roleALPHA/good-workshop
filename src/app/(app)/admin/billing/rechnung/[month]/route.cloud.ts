import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { readInvoiceDocument } from '@/cloud/workspace/invoice-download'

/**
 * Download of one's own invoice. A cloud route: a self-hosted installation has
 * no invoices and does not carry this file.
 *
 * Everything that decides access happens before the bytes are read: a session,
 * an admin of that workspace, and a database policy that only answers for that
 * workspace's rows. A month that belongs to somebody else is a 404, the same
 * answer as a month that does not exist -- so the response cannot be used to
 * find out whose invoices exist.
 */
export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  const session = await readSession().catch(() => null)
  if (!session) return new NextResponse(null, { status: 404 })

  const actor = {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web' as const,
  }
  const { month } = await context.params
  const document = await readInvoiceDocument(actor, month).catch(() => null)
  if (!document) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(document.content), {
    headers: {
      'Content-Type': 'application/pdf',
      // Downloaded, not opened in place: a PDF rendered inline is a document
      // from our origin in the viewer's browser.
      'Content-Disposition': `attachment; filename="${document.filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
