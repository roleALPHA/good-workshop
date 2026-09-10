import type { ModuleTypeDto } from '@/domain/agenda/types'

/**
 * The built-in module types, as they will be seeded per tenant.
 *
 * `countsAsContent: false` on break / lunch / buffer / note is why it is a
 * first-class field and not a `desc` attribute: it drives the content-vs-breaks
 * split that facilitators check before sending an agenda out.
 */
export const BUILTIN_MODULE_TYPES: ModuleTypeDto[] = [
  {
    id: 'mt-admin',
    key: 'admin',
    name: 'Begrüßung & Organisatorisches',
    color: 'slate',
    icon: 'info',
    defaultDurationMinutes: 10,
    countsAsContent: true,
  },
  {
    id: 'mt-check-in',
    key: 'check_in',
    name: 'Check-in',
    color: 'rose',
    icon: 'hand',
    defaultDurationMinutes: 15,
    countsAsContent: true,
  },
  {
    id: 'mt-presentation',
    key: 'presentation',
    name: 'Impuls / Präsentation',
    color: 'violet',
    icon: 'presentation',
    defaultDurationMinutes: 20,
    countsAsContent: true,
  },
  {
    id: 'mt-discussion',
    key: 'discussion',
    name: 'Plenumsdiskussion',
    color: 'cyan',
    icon: 'messages-square',
    defaultDurationMinutes: 20,
    countsAsContent: true,
  },
  {
    id: 'mt-group-work',
    key: 'group_work',
    name: 'Gruppenarbeit',
    color: 'emerald',
    icon: 'users',
    defaultDurationMinutes: 45,
    countsAsContent: true,
  },
  {
    id: 'mt-exercise',
    key: 'exercise',
    name: 'Übung',
    color: 'teal',
    icon: 'activity',
    defaultDurationMinutes: 30,
    countsAsContent: true,
  },
  {
    id: 'mt-decision',
    key: 'decision',
    name: 'Entscheidung / Abstimmung',
    color: 'red',
    icon: 'check-square',
    defaultDurationMinutes: 20,
    countsAsContent: true,
  },
  {
    id: 'mt-reflection',
    key: 'reflection',
    name: 'Reflexion',
    color: 'blue',
    icon: 'lightbulb',
    defaultDurationMinutes: 15,
    countsAsContent: true,
  },
  {
    id: 'mt-energizer',
    key: 'energizer',
    name: 'Energizer',
    color: 'orange',
    icon: 'zap',
    defaultDurationMinutes: 10,
    countsAsContent: true,
  },
  {
    id: 'mt-break',
    key: 'break',
    name: 'Pause',
    color: 'slate',
    icon: 'coffee',
    defaultDurationMinutes: 15,
    countsAsContent: false,
  },
  {
    id: 'mt-lunch',
    key: 'lunch',
    name: 'Mittagessen',
    color: 'amber',
    icon: 'utensils',
    defaultDurationMinutes: 60,
    countsAsContent: false,
  },
  {
    id: 'mt-buffer',
    key: 'buffer',
    name: 'Puffer',
    color: 'slate',
    icon: 'clock',
    defaultDurationMinutes: 10,
    countsAsContent: false,
  },
  {
    id: 'mt-check-out',
    key: 'check_out',
    name: 'Check-out',
    color: 'rose',
    icon: 'door-open',
    defaultDurationMinutes: 15,
    countsAsContent: true,
  },
  {
    id: 'mt-next-steps',
    key: 'next_steps',
    name: 'Nächste Schritte',
    color: 'blue',
    icon: 'flag',
    defaultDurationMinutes: 15,
    countsAsContent: true,
  },
  {
    id: 'mt-note',
    key: 'note',
    name: 'Notiz',
    color: 'slate',
    icon: 'sticky-note',
    defaultDurationMinutes: 0,
    countsAsContent: false,
  },
]

export const MODULE_TYPES_BY_ID: Record<string, ModuleTypeDto> = Object.fromEntries(
  BUILTIN_MODULE_TYPES.map((t) => [t.id, t]),
)

export const MODULE_TYPES_BY_KEY: Record<string, ModuleTypeDto> = Object.fromEntries(
  BUILTIN_MODULE_TYPES.map((t) => [t.key, t]),
)
