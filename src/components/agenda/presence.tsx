'use client'

import { Bot } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Peer } from '@/features/agenda/document'
import { cn } from '@/lib/cn'

/**
 * Who else is on this day, and where they are.
 *
 * Two rules run through this file. Presence never uses the category palette --
 * a colour there means "this is a break", and a person is not a category. And
 * nothing is signalled by colour alone: every mark carries a name, because a
 * ring in someone's colour tells a colour-blind reader, or anyone who has not
 * memorised the palette, precisely nothing.
 */

const hueStyle = (hue: number) => ({ '--peer-hue': String(hue) }) as CSSProperties

/** What to call this participant, honestly, including when it is not a person. */
function describe(peer: Peer): string {
  return peer.kind === 'model' ? `${peer.name} (KI)` : peer.name
}

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]![0]!
  const second = parts.length > 1 ? parts[parts.length - 1]![0]! : ''
  return (first + second).toUpperCase()
}

export function PresenceBar({ peers }: { peers: Peer[] }) {
  // Nobody else here: no badge, no empty row. A permanent "1 person" chip is
  // the kind of chrome people stop seeing.
  if (peers.length === 0) return null

  return (
    <ul
      aria-label="Weitere Personen an diesem Tag"
      className="flex flex-wrap items-center gap-1.5 px-4 py-2 md:px-2"
    >
      {peers.map((peer) => (
        <li key={peer.clientId} className="gw-peer" style={hueStyle(peer.hue)}>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1',
              'bg-[var(--peer-soft)] text-[13px] text-[var(--fg)]',
            )}
          >
            <span
              aria-hidden
              className="grid size-5 place-items-center rounded-full bg-[var(--peer)] text-[10px] font-semibold text-white"
            >
              {peer.kind === 'model' ? <Bot className="size-3" /> : initials(peer.name)}
            </span>
            {describe(peer)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The mark on a row somebody else is editing.
 *
 * A ring plus a named chip. The ring alone would be prettier and would fail
 * the moment two people picked adjacent hues -- or the reader could not tell
 * them apart at all.
 */
export function PeerMarks({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) return null
  const [first] = peers as [Peer, ...Peer[]]

  return (
    <>
      <span
        aria-hidden
        className="gw-peer pointer-events-none absolute inset-0 ring-2 ring-[var(--peer)] ring-inset"
        style={hueStyle(first.hue)}
      />
      <span
        className={cn(
          'gw-peer pointer-events-none absolute -top-2 right-2 z-10 rounded-full px-1.5 py-0.5',
          'bg-[var(--peer)] text-[11px] leading-tight font-medium text-white',
        )}
        style={hueStyle(first.hue)}
      >
        {peers.length === 1 ? describe(first) : `${describe(first)} +${peers.length - 1}`}
        <span className="sr-only"> bearbeitet diesen Block gerade</span>
      </span>
    </>
  )
}
