'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { PLAN_KEYS, type PlanKey } from '@/cloud/billing/plans'
import {
  SIGNUP_COUNTRIES,
  vatIdRequired,
  type CustomerType,
  type SignupCountry,
} from '@/cloud/registration/rules'
import { register, type RegisterResult } from './actions'

const field =
  'mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[16px]'
const label = 'block text-[14px] font-medium'

/**
 * One form for both kinds of customer, because most of it is the same: what
 * differs -- company and VAT number for a business, the early-start request for
 * a consumer -- appears when the choice at the top is made, rather than on a
 * second page nobody expects.
 *
 * Everything is checked again on the server (src/cloud/registration/rules.ts);
 * the `required` attributes here are for the person, not for security.
 */
export function RegisterForm() {
  const t = useTranslations('site.register')
  const locale = useLocale()
  const [customerType, setCustomerType] = useState<CustomerType>('business')
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
      for (const box of ['acceptedTerms', 'acceptedDpa', 'requestedEarlyStart']) {
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

  const business = customerType === 'business'

  return (
    <form action={submit} className="space-y-5">
      {result && !result.ok && (
        <p
          role="alert"
          className="rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[15px] text-[var(--warn-fg)]"
        >
          {result.error}
        </p>
      )}

      <fieldset>
        <legend className={label}>{t('customerType')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['business', 'consumer'] as const).map((type) => (
            <label
              key={type}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-[var(--border-strong)] px-3 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--surface-raised)]"
            >
              <input
                type="radio"
                name="customerType"
                value={type}
                checked={customerType === type}
                onChange={() => setCustomerType(type)}
              />
              {t(type)}
            </label>
          ))}
        </div>
      </fieldset>

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

      {business && (
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
      )}

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

      {business && (
        <div>
          <label htmlFor="su-vat" className={label}>
            {t('vatId')}
          </label>
          <input
            id="su-vat"
            name="vatId"
            required={vatIdRequired('business', country)}
            maxLength={20}
            aria-describedby="su-vat-hint"
            className={`${field} uppercase`}
          />
          <p id="su-vat-hint" className="mt-1 text-[13px] text-[var(--fg-muted)]">
            {t('vatIdHint')}
          </p>
        </div>
      )}

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
              {t(key === 'per_user' ? 'perUser' : 'perWorkshop')}
            </label>
          ))}
        </div>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
          {t(business ? 'planHintBusiness' : 'planHintConsumer')}
        </p>
      </fieldset>

      <div className="space-y-3 text-[15px]">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="acceptedTerms" required className="mt-1 size-4 shrink-0" />
          <span>
            {t.rich('acceptTerms', { terms: link('/agb'), privacy: link('/datenschutz') })}
          </span>
        </label>
        {business ? (
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptedDpa" required className="mt-1 size-4 shrink-0" />
            <span>{t.rich('acceptDpa', { dpa: link('/avv') })}</span>
          </label>
        ) : (
          <>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="requestedEarlyStart"
                required
                className="mt-1 size-4 shrink-0"
              />
              <span>{t('earlyStart')}</span>
            </label>
            <p className="text-[14px] text-[var(--fg-muted)]">
              {t.rich('withdrawalNote', { withdrawal: link('/widerruf') })}
            </p>
          </>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded bg-[var(--brand)] px-5 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
