import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { readSessionCached } from '@/server/auth/session'
import { loadLibrary } from '@/server/actions/workshop'
import { CreateWorkshop } from './create-workshop'
import { CreateFolder } from './create-folder'
import { FolderTree } from './folder-tree'
import { navClass } from './nav-class'
import { FolderPanel } from './folder-panel'
import { LibraryDnd } from './library-dnd'
import { SearchBox } from './search-box'
import { WorkshopList } from './workshop-list'
import { edition } from '@/server/edition'

export const dynamic = 'force-dynamic'

/**
 * The library.
 *
 * A flat list works until it does not: a few hundred workshops in one column
 * is a wall you scroll past rather than a place you find something. Folders,
 * tags and a search box are three different ways in, and the list itself is
 * paged so the wall never renders in the first place.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; tag?: string; q?: string }>
}) {
  const { folder, tag, q } = await searchParams
  const result = await loadLibrary({ folderId: folder, tagId: tag, search: q })

  // Folders belong to the tenant rather than to a person, so tidying them up is
  // an admin's call -- the workshops inside may well be somebody else's.
  const session = await readSessionCached()
  const isAdmin = session?.tenantRole === 'admin'
  // A workspace that is read-only, paused or being deleted offers nothing to
  // create -- the database would refuse it, and a button that always fails is
  // worse than none. Only the cloud has such workspaces.
  const notice = session ? await edition.workspaceNotice(session.tenantId).catch(() => null) : null
  const readOnly = notice !== null && notice.state !== 'trial'

  if (!result.ok) {
    return <p className="text-[var(--danger-fg)]">{result.message}</p>
  }

  const t = await getTranslations('library')
  const { folders, tags, workshops, nextCursor } = result.data
  const filtered = Boolean(folder || tag || q)

  return (
    // One DndContext above both halves of the grid: a workshop dragged out of
    // the list has to reach a folder row in the sidebar, and they are siblings.
    // Everything inside stays server-rendered.
    <LibraryDnd folders={folders}>
      {/*
        minmax(0, 1fr), not 1fr or no template at all: a grid column's minimum
        is its content's, and a truncated workshop title is one line that may
        not wrap. The column took that line's full width, and on a phone the
        whole page grew with it -- folder button, rows, toolbar.
      */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        {/*
        Shown on a phone as well, above the list rather than beside it.
        It used to be `hidden md:block`, which left the phone with no folders at
        all: no way to see the structure, no way to move between branches, and
        every folder's workshops in one undifferentiated list. A facilitator
        looks things up on a phone -- that is the screen the reading view exists
        for -- and the library is where they start.
      */}
        <nav aria-label={t('navLabel')} className="min-w-0">
          <FolderPanel current={folders.find((node) => node.id === folder)?.name ?? null}>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
              {t('folders')}
            </h2>
            <FolderTree
              folders={folders}
              current={folder}
              tagged={Boolean(tag)}
              canManage={isAdmin}
            />
            {!readOnly && (
              <div className="mt-2">
                <CreateFolder
                  parentId={folder ?? null}
                  parentName={folders.find((node) => node.id === folder)?.name ?? null}
                />
              </div>
            )}

            <Link
              href="/library/trash"
              className="mt-3 inline-block px-2 text-[14px] text-[var(--fg-muted)] hover:underline"
            >
              {t('trash')}
            </Link>

            {tags.length > 0 && (
              <>
                <h2 className="mt-6 mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                  {t('tags')}
                </h2>
                <ul className="space-y-0.5">
                  {tags.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={`/library?tag=${entry.id}`}
                        className={`${navClass(tag === entry.id)} flex items-baseline gap-2`}
                      >
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        <span className="tabular shrink-0 text-[13px] text-[var(--fg-subtle)]">
                          {entry.count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </FolderPanel>
        </nav>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            {/* A row of its own on a phone, with the search taking what is left. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <SearchBox />
              {!readOnly && (
                <CreateWorkshop
                  folderId={folder ?? null}
                  folderName={folders.find((node) => node.id === folder)?.name ?? null}
                />
              )}
            </div>
          </div>

          <WorkshopList
            // The key is the filter: React would otherwise reuse the component
            // and keep the previous page's rows in state while the props change.
            key={`${folder ?? ''}|${tag ?? ''}|${q ?? ''}`}
            initial={workshops}
            initialCursor={nextCursor}
            // `folder` and not `folder ?? null`: null is a filter of its own on
            // the server -- "only workshops in no folder" -- so passing it for an
            // unfiltered library made the second page show nothing but the loose
            // ones.
            query={{ folderId: folder, tagId: tag, search: q }}
            filtered={filtered}
            folders={folders}
          />
        </section>
      </div>
    </LibraryDnd>
  )
}
