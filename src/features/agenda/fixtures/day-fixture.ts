import type { ClusterDto, DayDoc, ModuleDto } from '@/domain/agenda/types'
import { MODULE_TYPES_BY_ID, MODULE_TYPES_BY_KEY } from './module-types'

/**
 * Deterministic fixtures. Both the perf budget (INP < 200 ms on drag start with
 * 150 rows) and the export snapshots read from here, so they must not drift
 * between runs -- hence a seeded PRNG rather than Math.random.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const H = (h: number, m = 0) => h * 60 + m

const richText = (paragraphs: string[], bullets: string[] = []) => ({
  format: 'tiptap-doc-v1' as const,
  doc: {
    type: 'doc',
    content: [
      ...paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
      ...(bullets.length
        ? [
            {
              type: 'bulletList',
              content: bullets.map((text) => ({
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
              })),
            },
          ]
        : []),
    ],
  },
  text: [...paragraphs, ...bullets].join(' '),
})

/**
 * A realistic single day, in the spirit of the reference agenda: a pinned
 * start, two sections, a pinned lunch that later blocks have to work around,
 * and descriptions of very different lengths so row heights vary the way they
 * do in practice.
 */
export function createDemoDay(): DayDoc {
  const clusters: ClusterDto[] = [
    {
      id: 'cl-1',
      title: 'Ankommen & Rahmen',
      color: 'rose',
      pinnedStartMinute: null,
      collapsed: false,
      targetDurationMinutes: 60,
      order: 0,
    },
    {
      id: 'cl-2',
      title: 'Zielbild erarbeiten',
      color: 'emerald',
      pinnedStartMinute: null,
      collapsed: false,
      targetDurationMinutes: 180,
      order: 2,
    },
  ]

  const modules: ModuleDto[] = [
    {
      id: 'm-1',
      clusterId: 'cl-1',
      moduleTypeId: 'mt-check-in',
      title: 'Check-in & Start',
      durationMinutes: 15,
      pinnedStartMinute: H(13),
      order: 0,
      desc: {
        description: richText(['Kurze Vorstellungsrunde, ein Satz pro Person.']),
        participation: 'plenary',
      },
    },
    {
      id: 'm-2',
      clusterId: 'cl-1',
      moduleTypeId: 'mt-admin',
      title: 'Agenda & Spielregeln',
      durationMinutes: 10,
      pinnedStartMinute: null,
      order: 1,
      desc: { description: richText(['Ablauf des Tages, Pausen, Umgang mit Handys.']) },
    },
    {
      id: 'm-3',
      clusterId: 'cl-1',
      moduleTypeId: 'mt-energizer',
      title: 'Energizer: Zwei Wahrheiten',
      durationMinutes: 10,
      pinnedStartMinute: null,
      order: 2,
      desc: {
        description: richText(['Auflockerung vor dem inhaltlichen Einstieg.']),
        materials: ['Moderationskarten'],
      },
    },
    {
      id: 'm-4',
      clusterId: null,
      moduleTypeId: 'mt-presentation',
      title: 'Druckpunkte',
      durationMinutes: 45,
      pinnedStartMinute: null,
      order: 1,
      desc: {
        description: richText(
          ['Die drei Zielbilder und ihre jeweiligen Druckpunkte gegenüberstellen.'],
          [
            'Zielbilder und entsprechende Druckpunkte gegenüberstellen',
            'Aggregierte Version vorstellen – Konsent einholen',
            'Welche Mechaniken sind im aggregierten Zielbild aufgelöst?',
          ],
        ),
        facilitator_notes: richText([
          'Vorher mit der Auftraggeberin die Vorgehensweise abstimmen.',
        ]),
        materials: ['Alle Zielbilder ausgedruckt', 'Klebepunkte'],
        participation: 'plenary',
      },
    },
    {
      id: 'm-5',
      clusterId: 'cl-2',
      moduleTypeId: 'mt-group-work',
      title: 'Spannungsfelder sammeln',
      durationMinutes: 30,
      pinnedStartMinute: null,
      order: 0,
      desc: {
        description: richText([
          'Spannungsfelder sichtbar machen und einordnen: zentral vs. dezentral, stabil vs. fluide.',
        ]),
        group_size: 4,
        deliverable: 'Ein Flipchart je Gruppe',
        participation: 'small_groups',
      },
    },
    {
      id: 'm-6',
      clusterId: 'cl-2',
      moduleTypeId: 'mt-decision',
      title: 'Einwandintegration',
      durationMinutes: 10,
      pinnedStartMinute: null,
      order: 1,
      desc: {
        description: richText(['Konsolidierte Version per Konsent-Verfahren integrieren.']),
        method: 'consent',
      },
    },
    {
      id: 'm-7',
      clusterId: null,
      moduleTypeId: 'mt-lunch',
      title: 'Mittagessen',
      durationMinutes: 60,
      pinnedStartMinute: H(14, 30),
      order: 3,
      desc: { catering_note: 'Vegetarische Option ist bestellt.' },
    },
    {
      id: 'm-8',
      clusterId: null,
      moduleTypeId: 'mt-group-work',
      title: 'IT-Management verorten',
      durationMinutes: 45,
      pinnedStartMinute: null,
      order: 4,
      desc: {
        description: richText(['Wo auf dem Zielbild ist das IT-Management zu verorten?']),
        participation: 'small_groups',
      },
    },
    {
      id: 'm-9',
      clusterId: null,
      moduleTypeId: 'mt-break',
      title: 'Kaffeepause',
      durationMinutes: 15,
      pinnedStartMinute: null,
      order: 5,
      desc: {},
    },
    {
      id: 'm-10',
      clusterId: null,
      moduleTypeId: 'mt-discussion',
      title: 'Was sind die nächsten großen Fragen?',
      durationMinutes: 30,
      pinnedStartMinute: null,
      order: 6,
      desc: {
        description: richText(
          ['Wie kommen wir von einem High-Level-Zielbild zu einem differenzierten Zielbild?'],
          [
            'Zusammenarbeit der Schnittstellen',
            'Teamlogiken und Kompetenzen',
            'Etappenziele und Transition',
            'Projektlogik',
            'Governance',
          ],
        ),
      },
    },
    {
      id: 'm-11',
      clusterId: null,
      moduleTypeId: 'mt-next-steps',
      title: 'Nächste Schritte',
      durationMinutes: 15,
      pinnedStartMinute: null,
      order: 7,
      desc: { description: richText(['Wer macht was bis wann?']) },
    },
    {
      id: 'm-12',
      clusterId: null,
      moduleTypeId: 'mt-check-out',
      title: 'Check-out',
      durationMinutes: 15,
      pinnedStartMinute: null,
      order: 8,
      desc: { description: richText(['Ein Wort zum Tag, Blitzlichtrunde.']), format: 'round' },
    },
  ]

  return {
    id: 'day-1',
    workshopId: 'ws-1',
    title: 'Tag 1',
    date: '2026-09-15',
    startMinute: H(13),
    targetEndMinute: H(17),
    clusters,
    modules,
    moduleTypes: MODULE_TYPES_BY_ID,
  }
}

const STRESS_TITLES = [
  'Kontextlandkarte',
  'Stakeholder-Mapping',
  'Hypothesen schärfen',
  'Prototyp bauen',
  'Feedback einholen',
  'Risiken bewerten',
  'Rollen klären',
  'Metriken definieren',
  'Schnittstellen prüfen',
  'Roadmap skizzieren',
  'Annahmen testen',
  'Retro',
]

/**
 * The perf fixture: a day large enough that any O(n^2) mistake in flatten,
 * projection or the schedule walk becomes visible, with description lengths
 * varying the way real content does.
 */
export function createStressDay(rowCount = 150, seed = 42): DayDoc {
  const rand = mulberry32(seed)
  const typeKeys = Object.keys(MODULE_TYPES_BY_KEY).filter((k) => k !== 'note')

  const clusters: ClusterDto[] = []
  const modules: ModuleDto[] = []

  let dayOrder = 0
  let currentCluster: ClusterDto | null = null
  let clusterChildOrder = 0

  for (let i = 0; modules.length + clusters.length < rowCount; i++) {
    // Roughly every seventh row opens a new section.
    if (i % 7 === 0) {
      currentCluster = {
        id: `s-cl-${clusters.length}`,
        title: `Block ${clusters.length + 1}: ${STRESS_TITLES[clusters.length % STRESS_TITLES.length]}`,
        color: null,
        pinnedStartMinute: null,
        collapsed: false,
        targetDurationMinutes: null,
        order: dayOrder++,
      }
      clusters.push(currentCluster)
      clusterChildOrder = 0
      continue
    }

    const typeKey = typeKeys[Math.floor(rand() * typeKeys.length)]!
    const type = MODULE_TYPES_BY_KEY[typeKey]!
    const paragraphs = Math.floor(rand() * 3)
    const bullets = Math.floor(rand() * 4)
    const inCluster = currentCluster !== null && rand() > 0.25

    modules.push({
      id: `s-m-${modules.length}`,
      clusterId: inCluster ? currentCluster!.id : null,
      moduleTypeId: type.id,
      title: `${type.name} ${modules.length + 1}`,
      durationMinutes: type.defaultDurationMinutes,
      // One in twenty blocks is pinned, so overlap and gap paths get exercised.
      pinnedStartMinute: null,
      order: inCluster ? clusterChildOrder++ : dayOrder++,
      desc: {
        description: richText(
          Array.from(
            { length: paragraphs },
            (_, p) => `Beschreibungsabsatz ${p + 1} für diesen Block.`,
          ),
          Array.from({ length: bullets }, (_, b) => `Stichpunkt ${b + 1}`),
        ),
      },
    })
  }

  return {
    id: 'day-stress',
    workshopId: 'ws-stress',
    title: 'Lasttest-Tag',
    date: null,
    startMinute: H(9),
    targetEndMinute: null,
    clusters,
    modules,
    moduleTypes: MODULE_TYPES_BY_ID,
  }
}
