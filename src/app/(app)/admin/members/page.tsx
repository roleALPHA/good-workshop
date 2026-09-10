import { loadMembers } from '@/server/actions/members'
import { MembersTable } from './members-table'
import { InviteMember } from './invite-member'

export const dynamic = 'force-dynamic'

/**
 * Who is in this tenant.
 *
 * Until now this existed only as a CLI on the server, which meant that adding
 * a colleague to a self-hosted install required shell access -- and live
 * collaboration is worth very little if there is nobody to collaborate with.
 */
export default async function MembersPage() {
  const result = await loadMembers()

  if (!result.ok) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">Mitglieder</h1>
        <p role="alert" className="text-[15px] text-[var(--fg-muted)]">
          {result.message}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Mitglieder</h1>
        <InviteMember />
      </div>
      <MembersTable members={result.data} />
    </div>
  )
}
