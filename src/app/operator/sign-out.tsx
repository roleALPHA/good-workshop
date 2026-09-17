'use client'

import { useTranslations } from 'next-intl'
import { operatorSignOut } from './actions'

export function SignOut() {
  const t = useTranslations('operator')
  return (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={async () => {
        await operatorSignOut()
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the cookie is gone
        window.location.href = '/operator/login'
      }}
    >
      {t('signOut')}
    </button>
  )
}
