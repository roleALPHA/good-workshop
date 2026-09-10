import Link from 'next/link'
import { Folder as FolderIcon } from 'lucide-react'
import { loadLibrary } from '@/server/actions/workshop'
import { CreateWorkshop } from './create-workshop'
import { CreateFolder } from './create-folder'
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

  if (!result.ok) {
    return <p className="text-[var(--danger-fg)]">{result.message}</p>
  }

  const { folders, tags, workshops, nextCursor } = result.data
  const filtered = Boolean(folder || tag || q)

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Ordner und Tags" className="hidden md:block">
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
            <li key={node.id} style={{ paddingLeft: node.depth * 12 }}>
              <Link
                href={`/library?folder=${node.id}`}
                className={`${navClass(folder === node.id)} inline-flex items-center gap-1.5`}
              >
                <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                {node.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <CreateFolder parentId={folder ?? null} />
        </div>

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
