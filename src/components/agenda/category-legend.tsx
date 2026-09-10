import type { DayDoc } from '@/domain/agenda/types'
import { catClass } from '@/lib/category-colors'

/** The colour key from the reference agenda: which band means what. */
export function CategoryLegend({ doc }: { doc: DayDoc }) {
  const used = new Map<string, string>()
  for (const mod of doc.modules) {
    const type = doc.moduleTypes[mod.moduleTypeId]
    if (type) used.set(type.id, type.name)
  }

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {[...used.keys()].map((id) => {
        const type = doc.moduleTypes[id]!
        return (
          <li key={id} className={`${catClass(type.color)} flex items-center gap-2`}>
            <span aria-hidden className="size-3 rounded-sm bg-[var(--cat-bar)]" />
            <span className="text-[14px] text-[var(--fg-muted)]">{type.name}</span>
          </li>
        )
      })}
    </ul>
  )
}
