import 'server-only'
import { cookies, headers } from 'next/headers'
import { authConfig } from '@/server/auth/config'
import { clientAddress } from '@/server/auth/client-address'
import { operatorConsoleEnabled, operatorDb } from './db'
import {
  OPERATOR_COOKIE,
  OPERATOR_COOKIE_PLAIN,
  createOperatorSession,
  revokeOperatorSession,
  verifyOperatorSession,
  type Operator,
} from './auth'

const secure = () => new URL(process.env.GW_OPERATOR_URL ?? authConfig.appUrl).protocol === 'https:'
const cookieName = () => (secure() ? OPERATOR_COOKIE : OPERATOR_COOKIE_PLAIN)

/** The operator behind this request, or null -- also when the console is not enabled here. */
export async function currentOperator(): Promise<Operator | null> {
  if (!operatorConsoleEnabled()) return null
  const value = (await cookies()).get(cookieName())?.value
  return value ? verifyOperatorSession(operatorDb(), value) : null
}

export async function startOperatorSession(operatorId: string): Promise<void> {
  const ip = clientAddress(await headers())
  const session = await createOperatorSession(operatorDb(), operatorId, ip)
  ;(await cookies()).set(cookieName(), session.value, {
    httpOnly: true,
    secure: secure(),
    // Strict, not lax: nothing ever links into the console from elsewhere, so
    // no request from another site needs to carry this cookie.
    sameSite: 'strict',
    path: '/',
    expires: session.expiresAt,
  })
}

export async function endOperatorSession(): Promise<void> {
  const store = await cookies()
  const value = store.get(cookieName())?.value
  if (value) await revokeOperatorSession(operatorDb(), value)
  store.delete(cookieName())
}
