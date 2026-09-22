import { operatorConsoleEnabled, operatorDb } from '@/cloud/operator/db'
import { spendSignInLink } from '@/cloud/operator/auth'
import { startOperatorSession } from '@/cloud/operator/session'

/**
 * The link from the mail: spent here, and the session starts.
 *
 * A route handler, not a page. A page may not set a cookie while it renders --
 * Next refuses -- so the first version showed an error to whoever had just
 * asked for the link, with the link itself already spent. The session cookie
 * belongs in a handler, and this is that handler.
 *
 * The token is spent by the database in one statement, so a link opened twice
 * -- by a mail client that fetches it first and the person who then clicks it
 * -- signs in once. Everything that is not a sign-in ends on the sign-in page
 * with a sentence, rather than on an error.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const back = (where: string) => new Response(null, { status: 303, headers: { location: where } })
  if (!operatorConsoleEnabled()) return back('/operator/login')

  const { token } = await context.params
  const operator = await spendSignInLink(operatorDb(), token)
  if (!operator) return back('/operator/login?link=invalid')

  await startOperatorSession(operator.id)
  return back('/operator')
}
