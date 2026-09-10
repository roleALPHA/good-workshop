import Link from 'next/link'
import { Folder as FolderIcon } from 'lucide-react'
import { loadLibrary } from '@/server/actions/workshop'
import { formatDuration } from '@/features/agenda/duration'
import { CreateWorkshop } from './create-workshop'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = {
  draft: 'Entwurf',
  ready: 'Bereit',
  delivered: 'Durchgeführt',
  archived: 'Archiviert',
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>
}) {
  const { folder } = await searchParams
  const result = await loadLibrary(folder ?? undefined)

  if (!result.ok) {
    return <p className="text-[var(--danger-fg)]">{result.message}</p>
  }

  const { folders, workshops } = result.data

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Ordner" className="hidden md:block">
        <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
          Ordner
        </h2>
        <ul className="space-y-0.5">
          <li>
            <Link href="/library" className={navClass(!folder)}>
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
      </nav>

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Workshops</h1>
          <CreateWorkshop folderId={folder ?? null} />
        </div>

        {workshops.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
            <p className="font-medium">Noch kein Workshop hier.</p>
            <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
              Leg einen an — der erste Tag ist gleich mit dabei.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
            {workshops.map((workshop) => (
              <li key={workshop.id}>
                <Link
                  href={`/w/${workshop.id}`}
                  className="flex items-baseline gap-3 px-4 py-3 hover:bg-[var(--surface-raised)]"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{workshop.title}</span>
                  <span className="tabular shrink-0 text-[14px] text-[var(--fg-muted)]">
                    {workshop.dayCount} {workshop.dayCount === 1 ? 'Tag' : 'Tage'}
                  </span>
                  <span className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]">
                    {STATUS[workshop.status] ?? workshop.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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

// Referenced so the import is not dropped when the summary line changes.
void formatDuration
