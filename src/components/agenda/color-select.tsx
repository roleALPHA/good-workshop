'use client'

import { useTranslations } from 'next-intl'
import { CATEGORY_COLORS, catClass, type CategoryColor } from '@/lib/category-colors'
import { cn } from '@/lib/cn'

/**
 * Picks a colour from the curated palette, by name.
 *
 * A native select rather than a third hand-rolled popover: this is a plain
 * single choice with no keyboard behaviour a `<select>` lacks, iOS operates it
 * itself, and docs/ui-conventions.md names the two popovers that exist and asks
 * for a reason before a third. What an `<option>` cannot do is carry the colour
 * portably -- which is why the swatch sits beside it and the options say the
 * colour in words. Nothing here is told by colour alone.
 */
export function ColorSelect({
  value,
  onChange,
  label,
  className,
}: {
  value: CategoryColor | null
  onChange: (color: CategoryColor | null) => void
  label: string
  className?: string
}) {
  const t = useTranslations('enums.categoryColor')
  const unset = useTranslations('agenda')

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span
        aria-hidden
        className={cn(catClass(value), 'h-3.5 w-1.5 shrink-0 rounded-full bg-[var(--cat-bar)]')}
      />
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as CategoryColor))}
        className="rounded-sm border border-transparent bg-transparent py-0.5 text-[13px] text-[var(--cat-fg)] hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:outline-none pointer-coarse:min-h-11 pointer-coarse:text-[16px]"
      >
        <option value="">{unset('section.colorUnset')}</option>
        {CATEGORY_COLORS.map((color) => (
          <option key={color} value={color}>
            {t(color)}
          </option>
        ))}
      </select>
    </span>
  )
}
