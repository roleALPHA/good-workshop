import { redirect } from 'next/navigation'

/**
 * The address somebody types is the one they expect to get in through.
 *
 * `/library` sends anyone without a session to `/login` itself, so this stays a
 * single hop and there is no session check duplicated here. The agenda preview
 * that used to live at this address moved to `/demo`, where it is still public.
 */
export default function HomePage() {
  redirect('/library')
}
