'use client'

import { useMemo, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { PLAN_KEYS, type PlanKey } from '@/cloud/billing/plans'
import { SIGNUP_COUNTRIES, vatIdRequired, type SignupCountry } from '@/cloud/registration/rules'
import { register, type RegisterResult } from './actions'

const field =
  'mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[16px]'
const label = 'block text-[14px] font-medium'

/**
 * Registration, for businesses only -- which is the first thing the form says
 * and the first thing it asks to be confirmed, before a single field.
 *
 * Everything is checked again on the server (src/cloud/registration/rules.ts);
 * the `required` attributes here are for the person, not for security.
 */
export function RegisterForm({
  prices,
  sellable,
}: {
  prices: Record<PlanKey, number | null>
  sellable: boolean
}) {
  const t = useTranslations('site.register')
  const format = useFormatter()
  const locale = useLocale()
  // The price comes from the accounting system through the server component,
  // not from the label: a translated amount is a second place to change it.
  const euro = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'EUR' })
  const [country, setCountry] = useState<SignupCountry>('AT')
  const [plan, setPlan] = useState<PlanKey>('per_user')
  const [result, setResult] = useState<RegisterResult | null>(null)
  const [pending, setPending] = useState(false)

  const countryName = useMemo(() => new Intl.DisplayNames([locale], { type: 'region' }), [locale])
  const countries = useMemo(
    () =>
      [...SIGNUP_COUNTRIES].sort((a, b) =>
        (countryName.of(a) ?? a).localeCompare(countryName.of(b) ?? b, locale),
      ),
    [countryName, locale],
  )

  const link = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {chunks}
        </a>
      )
    }

  async function submit(formData: FormData) {
    setPending(true)
    try {
      const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
      for (const box of [
        'confirmedBusiness',
        'confirmedAuthority',
        'acceptedTerms',
        'acceptedDpa',
      ]) {
        raw[box] = formData.get(box) === 'on'
      }
      setResult(await register(raw))
    } finally {
      setPending(false)
    }
  }

  if (result?.ok) {
    return (
      <div role="status" className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="text-[17px] font-medium">{t('sentTitle')}</p>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
          {t('sentBody', { email: result.email })}
        </p>
      </div>
    )
  }

  return (
    <form action={submit} className="space-y-5">
      <section
        aria-labelledby="su-business-title"
        className="rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-4"
      >
        <h2 id="su-business-title" className="text-[16px] font-semibold">
          {t('businessOnlyTitle')}
        </h2>
        <p className="mt-1 text-[15px]">{t('businessOnlyBody')}</p>
        <label className="mt-3 flex items-start gap-2 text-[15px] font-medium">
          <input
            type="checkbox"
            name="confirmedBusiness"
            required
            className="mt-1 size-4 shrink-0"
          />
          <span>{t('confirmBusiness')}</span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-[15px] font-medium">
          <input
            type="checkbox"
            name="confirmedAuthority"
            required
            className="mt-1 size-4 shrink-0"
          />
          <span>{t('confirmAuthority')}</span>
        </label>
      </section>

      {result && !result.ok && (
        <p
          role="alert"
          className="rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[15px] text-[var(--warn-fg)]"
        >
          {result.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="su-first" className={label}>
            {t('firstName')}
          </label>
          <input
            id="su-first"
            name="firstName"
            required
            maxLength={100}
            autoComplete="given-name"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="su-last" className={label}>
            {t('lastName')}
          </label>
          <input
            id="su-last"
            name="lastName"
            required
            maxLength={100}
            autoComplete="family-name"
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="su-email" className={label}>
          {t('email')}
        </label>
        <input
          id="su-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
        />
      </div>

      {/* Hidden from people and from the accessibility tree; see register(). */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="su-company" className={label}>
          {t('companyName')}
        </label>
        <input
          id="su-company"
          name="companyName"
          required
          maxLength={200}
          autoComplete="organization"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="su-street" className={label}>
          {t('street')}
        </label>
        <input
          id="su-street"
          name="street"
          required
          maxLength={200}
          autoComplete="street-address"
          className={field}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div>
          <label htmlFor="su-zip" className={label}>
            {t('postalCode')}
          </label>
          <input
            id="su-zip"
            name="postalCode"
            required
            maxLength={20}
            autoComplete="postal-code"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="su-city" className={label}>
            {t('city')}
          </label>
          <input
            id="su-city"
            name="city"
            required
            maxLength={100}
            autoComplete="address-level2"
            className={field}
          />
        </div>
      </div>
      <div>
        <label htmlFor="su-country" className={label}>
          {t('country')}
        </label>
        <select
          id="su-country"
          name="country"
          value={country}
          onChange={(e) => setCountry(e.target.value as SignupCountry)}
          className={field}
        >
          {countries.map((code) => (
            <option key={code} value={code}>
              {countryName.of(code)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="su-vat" className={label}>
          {t('vatId')}
        </label>
        <input
          id="su-vat"
          name="vatId"
          required={vatIdRequired(country)}
          maxLength={20}
          aria-describedby="su-vat-hint"
          className={`${field} uppercase`}
        />
        <p id="su-vat-hint" className="mt-1 text-[13px] text-[var(--fg-muted)]">
          {t('vatIdHint')}
        </p>
      </div>

      <fieldset>
        <legend className={label}>{t('plan')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLAN_KEYS.map((key) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-[var(--border-strong)] px-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--surface-raised)]"
            >
              <input
                type="radio"
                name="plan"
                value={key}
                checked={plan === key}
                onChange={() => setPlan(key)}
              />
              {t(key === 'per_user' ? 'perUser' : 'perWorkshop', {
                price: prices[key] === null ? '—' : euro(prices[key]),
              })}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{t('planHint')}</p>
      </fieldset>

      <div className="space-y-3 text-[15px]">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="acceptedTerms" required className="mt-1 size-4 shrink-0" />
          <span>
            {t.rich('acceptTerms', { terms: link('/agb'), privacy: link('/datenschutz') })}
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="acceptedDpa" required className="mt-1 size-4 shrink-0" />
          <span>{t.rich('acceptDpa', { dpa: link('/avv') })}</span>
        </label>
      </div>

      {!sellable && (
        <p
          role="status"
          className="rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[15px] text-[var(--warn-fg)]"
        >
          {t('unavailable')}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !sellable}
        className="min-h-11 rounded bg-[var(--brand)] px-5 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
