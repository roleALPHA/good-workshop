import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithIntl as render } from '@/test/intl'
import { ProfileMenu } from './profile-menu'

/**
 * The account menu in the top right.
 *
 * What these hold onto: that an ordinary member never sees the administration
 * entries, that every entry has a word and not only an icon, and that the menu
 * survives a tap the way WebKit delivers one -- a focus-out with nowhere named
 * -- which Chromium in the E2E suite cannot reproduce.
 */

const open = async (isAdmin = false) => {
  const user = userEvent.setup()
  render(<ProfileMenu name="Anna Berger" email="anna@example.com" isAdmin={isAdmin} />)
  await user.click(screen.getByRole('button', { name: 'Konto' }))
  return user
}

describe('the profile menu', () => {
  it('starts closed and shows the initials', () => {
    render(<ProfileMenu name="Anna Berger" email="anna@example.com" isAdmin={false} />)
    const trigger = screen.getByRole('button', { name: 'Konto' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveTextContent('AB')
    expect(screen.queryByRole('link', { name: 'Sicherheit' })).not.toBeInTheDocument()
  })

  it('offers profile, security, AI connection and sign-out to everybody', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Konto' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Profil & Einstellungen' })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(screen.getByRole('link', { name: 'Sicherheit' })).toHaveAttribute(
      'href',
      '/settings/security',
    )
    expect(screen.getByRole('link', { name: 'KI-Verbindung' })).toHaveAttribute(
      'href',
      '/settings/ai-connection',
    )
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    expect(screen.getByText('anna@example.com')).toBeInTheDocument()
  })

  it('hides the administration from an ordinary member', async () => {
    await open(false)
    expect(screen.queryByRole('navigation', { name: 'Verwaltung' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mitglieder' })).not.toBeInTheDocument()
  })

  it('shows the administration to a tenant admin', async () => {
    await open(true)
    const admin = screen.getByRole('navigation', { name: 'Verwaltung' })
    expect(admin).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mitglieder' })).toHaveAttribute(
      'href',
      '/admin/members',
    )
    expect(screen.getByRole('link', { name: 'Branding' })).toHaveAttribute(
      'href',
      '/admin/branding',
    )
    expect(screen.getByRole('link', { name: 'Mailversand' })).toHaveAttribute('href', '/admin/mail')
  })

  it('puts the keyboard on the first entry, and Escape gives focus back', async () => {
    const user = await open()
    expect(screen.getByRole('link', { name: 'Profil & Einstellungen' })).toHaveFocus()

    await user.keyboard('{Escape}')
    const trigger = screen.getByRole('button', { name: 'Konto' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes when the pointer goes down somewhere else', async () => {
    await open()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('link', { name: 'Sicherheit' })).not.toBeInTheDocument()
  })

  it('stays open through a WebKit tap, whose focus-out names nowhere', async () => {
    await open()
    const link = screen.getByRole('link', { name: 'Sicherheit' })
    fireEvent.focusOut(screen.getByRole('link', { name: 'Profil & Einstellungen' }), {
      relatedTarget: null,
    })
    expect(link).toBeInTheDocument()
  })

  it('falls back to the address for somebody without a name', async () => {
    render(<ProfileMenu name="" email="neu@example.com" isAdmin={false} />)
    expect(screen.getByRole('button', { name: 'Konto' })).toHaveAttribute(
      'title',
      'neu@example.com',
    )
  })
})
