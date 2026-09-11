import Link from 'next/link'
import { readSession } from '@/server/auth/session'
import { loadLibrary } from '@/server/actions/workshop'
import { CreateWorkshop } from './create-workshop'
import { CreateFolder } from './create-folder'
import { FolderRow } from './folder-row'
import { FolderPanel } from './folder-panel'
import { SearchBox } from './search-box'
import { WorkshopList } from './workshop-list'

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
  const isAdmin = (await readSession())?.tenantRole === 'admin'

  if (!result.ok) {
    return <p className="text-[var(--danger-fg)]">{result.message}</p>
  }

  const { folders, tags, workshops, nextCursor } = result.data
  const filtered = Boolean(folder || tag || q)

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      {/*
        Shown on a phone as well, above the list rather than beside it.
        It used to be `hidden md:block`, which left the phone with no folders at
        all: no way to see the structure, no way to move between branches, and
        every folder's workshops in one undifferentiated list. A facilitator
        looks things up on a phone -- that is the screen the reading view exists
        for -- and the library is where they start.
      */}
      <nav aria-label="Ordner und Tags" className="min-w-0">
        <FolderPanel current={folders.find((node) => node.id === folder)?.name ?? null}>
          <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
            Ordner
          </h2>
          <ul className="space-y-0.5">
            <li>
              <Link href="/library" className={navClass(!folder && !tag)}>
                Alle Workshops
              </Link>
            </li>
            {folders.map((node) => (
              <FolderRow
                key={node.id}
                id={node.id}
                name={node.name}
                depth={node.depth}
                active={folder === node.id}
                canManage={isAdmin}
                // Its own subtree is left out: moving a folder into itself or
                // below itself would detach the branch from the root. The domain
                // refuses it too -- this just keeps it off the menu.
                targets={folders.filter(
                  (other) => other.id !== node.id && !other.ancestorIds.includes(node.id),
                )}
              />
            ))}
          </ul>
          <div className="mt-2">
            <CreateFolder parentId={folder ?? null} />
          </div>

          <Link
            href="/library/trash"
            className="mt-3 inline-block px-2 text-[14px] text-[var(--fg-muted)] hover:underline"
          >
            Papierkorb
          </Link>

          {tags.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                Tags
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

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Workshops</h1>
          <div className="flex items-center gap-2">
            <SearchBox />
            <CreateWorkshop folderId={folder ?? null} />
          </div>
        </div>

        <WorkshopList
          // The key is the filter: React would otherwise reuse the component
          // and keep the previous page's rows in state while the props change.
          key={`${folder ?? ''}|${tag ?? ''}|${q ?? ''}`}
          initial={workshops}
          initialCursor={nextCursor}
          query={{ folderId: folder ?? null, tagId: tag, search: q }}
          filtered={filtered}
        />
      </section>
    </div>
  )
}

const navClass = (active: boolean) =>
  `block rounded px-2 py-1 text-[15px] ${
    active
      ? 'bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]'
      : 'hover:bg-[var(--surface-raised)]'
  }`
