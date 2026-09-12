import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { loadFolderSharing } from '@/server/actions/folder-sharing'
import { FolderSharingList } from './folder-sharing-list'

export const dynamic = 'force-dynamic'

/**
 * Who may open everything in this folder.
 *
 * The sibling of the workshop screen, with two differences that are the whole
 * reason it is a screen of its own:
 *
 *  - A grant here reaches the SUBTREE, and workshops other people own. The page
 *    says so rather than leaving it to be discovered.
 *  - What it offers depends on what the reader holds. A folder viewer may add
 *    viewers and nothing else, so their select has one option. Offering more and
 *    letting the server refuse would be a screen that lies.
 *
 * No guest half, unlike the workshop screen: a share link names one workshop and
 * gives a session that cannot name an identity. Handing a link-holder a subtree
 * is not a thing this product offers.
 */
export default async function FolderSharingPage({
  params,
}: {
  params: Promise<{ folderId: string }>
}) {
  const { folderId } = await params
  const result = await loadFolderSharing(folderId)
  if (!result.ok) notFound()

  const t = await getTranslations('library')
  const { name, createdBy, grantable, people } = result.data

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <Link href="/library" className="text-[13px] text-[var(--fg-muted)] hover:underline">
          ← {t('title')}
        </Link>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {t('folderAccess', { name })}
        </h1>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('folderAccessIntro')}</p>
        {grantable.length === 0 && (
          <p className="mt-2 text-[14px] text-[var(--fg-muted)]">{t('folderAccessReadOnly')}</p>
        )}
      </header>

      <FolderSharingList
        folderId={folderId}
        createdBy={createdBy}
        grantable={grantable}
        people={people}
      />
    </div>
  )
}
