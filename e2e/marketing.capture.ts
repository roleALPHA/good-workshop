import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { seedReferenceDay } from './fixtures/seed-day'

/**
 * The pictures on the website, taken from the running product, in every
 * language the website speaks.
 *
 * Against a throwaway database, so no test leftovers end up in a picture:
 *
 *   dropdb goodworkshop_shots; createdb goodworkshop_shots
 *   export DATABASE_URL=... OPS_DATABASE_URL=... MIGRATION_DATABASE_URL=... ADMIN_DATABASE_URL=...
 *   pnpm db:bootstrap && pnpm db:migrate && pnpm db:provision && pnpm capture
 *
 * Not part of the suite: it writes files, and a screenshot that changes on
 * every run would make every pull request look like a design change.
 *
 * What it captures is the seeded reference day -- the same agenda the tests
 * assert on. A marketing picture of a screen nobody tests is a picture of
 * something other than the product.
 *
 * The interface follows the language, and so does the content: an English
 * screenshot with German block titles in it advertises a translation nobody
 * finished.
 */

const OUT = join(process.cwd(), 'public', 'marketing')
const capture = Boolean(process.env.GW_CAPTURE)

type Block = { from: string; title: string; description: string; responsible: string }
type Content = {
  day: string
  folders: [string, string[]][]
  blocks: Block[]
}

/** What the pictures say, per language. `from` is the fixture's German title. */
const CONTENT: Record<string, Content> = {
  de: {
    day: 'Strategie-Workshop Q4',
    folders: [
      ['Kundenprojekte', ['Kickoff Neukunde', 'Retrospektive Q3']],
      ['Interne Formate', ['Onboarding Tag 1']],
    ],
    blocks: [
      {
        from: 'Check-in & Start',
        title: 'Check-in & Start',
        description: 'Jede Person in einem Satz: Womit komme ich heute rein?',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Agenda & Spielregeln',
        title: 'Agenda & Spielregeln',
        description: 'Ablauf, Ziel des Tages, und die drei Regeln für die Diskussion.',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Energizer: Zwei Wahrheiten',
        title: 'Energizer: Zwei Wahrheiten',
        description: 'Zwei Wahrheiten, eine Lüge. Zwei Runden, dann weiter im Programm.',
        responsible: 'Jonas Feld',
      },
    ],
  },
  en: {
    day: 'Strategy workshop Q4',
    folders: [
      ['Client projects', ['Kickoff new client', 'Retrospective Q3']],
      ['Internal formats', ['Onboarding day 1']],
    ],
    blocks: [
      {
        from: 'Check-in & Start',
        title: 'Check-in & start',
        description: 'One sentence each: what am I bringing into the room today?',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Agenda & Spielregeln',
        title: 'Agenda & ground rules',
        description: 'The plan, the goal of the day, and the three rules for the discussion.',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Energizer: Zwei Wahrheiten',
        title: 'Energizer: two truths',
        description: 'Two truths and a lie. Two rounds, then on with the programme.',
        responsible: 'Jonas Feld',
      },
    ],
  },
  es: {
    day: 'Taller de estrategia Q4',
    folders: [
      ['Proyectos de cliente', ['Kickoff cliente nuevo', 'Retrospectiva Q3']],
      ['Formatos internos', ['Onboarding día 1']],
    ],
    blocks: [
      {
        from: 'Check-in & Start',
        title: 'Check-in e inicio',
        description: 'Una frase por persona: ¿con qué llego hoy a la sala?',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Agenda & Spielregeln',
        title: 'Agenda y reglas del juego',
        description: 'El plan, el objetivo del día y las tres reglas para la discusión.',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Energizer: Zwei Wahrheiten',
        title: 'Energizer: dos verdades',
        description: 'Dos verdades y una mentira. Dos rondas y seguimos con el programa.',
        responsible: 'Jonas Feld',
      },
    ],
  },
  fr: {
    day: 'Atelier stratégie T4',
    folders: [
      ['Projets clients', ['Lancement nouveau client', 'Rétrospective T3']],
      ['Formats internes', ['Intégration jour 1']],
    ],
    blocks: [
      {
        from: 'Check-in & Start',
        title: 'Accueil et démarrage',
        description: 'Une phrase par personne : avec quoi j’arrive aujourd’hui ?',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Agenda & Spielregeln',
        title: 'Programme et règles du jeu',
        description: 'Le déroulé, l’objectif de la journée et les trois règles de discussion.',
        responsible: 'Mara Wolf',
      },
      {
        from: 'Energizer: Zwei Wahrheiten',
        title: 'Énergisant : deux vérités',
        description: 'Deux vérités, un mensonge. Deux tours, puis on enchaîne.',
        responsible: 'Jonas Feld',
      },
    ],
  },
}

type Words = {
  newFolder: string
  folderName: string
  moveTo: string
  description: string
  addResponsible: string
}

/**
 * The few interface words this file has to aim at, per language.
 *
 * "Titel" and "Dauer" are missing on purpose: those two inputs carry a
 * hard-coded German aria-label in every language (inline-inputs.tsx), so they
 * are found by the same word everywhere. That is a finding, not a convention --
 * noted here because this file is where it shows.
 */
const WORDS: Record<string, Words> = {
  de: {
    newFolder: 'Ordner',
    folderName: 'Name des Ordners',
    moveTo: 'Verschieben nach',
    description: 'Beschreibung',
    addResponsible: 'Verantwortliche Person hinzufügen',
  },
  en: {
    newFolder: 'Folder',
    folderName: 'Folder name',
    moveTo: 'Move to',
    description: 'Description',
    addResponsible: 'Add a responsible person',
  },
  es: {
    newFolder: 'Carpeta',
    folderName: 'Nombre de la carpeta',
    moveTo: 'Mover a',
    description: 'Descripción',
    addResponsible: 'Añadir una persona responsable',
  },
  fr: {
    newFolder: 'Dossier',
    folderName: 'Nom du dossier',
    moveTo: 'Déplacer vers',
    description: 'Description',
    addResponsible: 'Ajouter une personne responsable',
  },
}

/**
 * The fixture is a skeleton: real titles and times, no content. A picture of it
 * shows an empty product, which is a fair picture of an empty day and an unfair
 * one of the product -- so the day gets what a prepared day has, in the
 * language of the picture.
 */
async function furnish(page: Page, content: Content, words: Words) {
  for (const block of content.blocks) {
    const row = page.getByRole('article', { name: block.from })
    if (!(await row.count())) continue

    if (block.title !== block.from) {
      await row.getByLabel('Titel').first().fill(block.title)
      await page.keyboard.press('Tab')
    }

    const named = page.getByRole('article', { name: block.title })
    const description = named.getByLabel(words.description).first()
    if (await description.count()) {
      await description.fill(block.description)
      await page.keyboard.press('Tab')
    }

    const add = named.getByLabel(words.addResponsible).first()
    if (await add.count()) {
      await add.click()
      await page.keyboard.type(block.responsible)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Escape')
    }
  }
}

/** Nothing half-drawn, nothing focused, nothing hovered, and back at the top. */
async function settle(page: Page) {
  await page.keyboard.press('Escape')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // Away from the rows: hover and focus reveal controls that are meant for the
  // person working -- a pin, a participation form, the row's buttons. In a
  // picture they read as clutter, or worse, as a glitch.
  await page.mouse.move(0, 0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
}

/**
 * The language of the signed-in account, set directly.
 *
 * For somebody signed in, the account's own setting decides -- the cookie only
 * speaks for visitors (src/i18n/request.ts). Going through the switcher in the
 * interface turned out to be unreliable here: the form posts a server action,
 * and the next navigation raced it often enough to produce German pictures
 * under an English heading. A fixture may write what the interface writes.
 */
async function speak(locale: string) {
  const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL })
  await client.connect()
  try {
    await client.query('update identity set locale = $1', [locale])
  } finally {
    await client.end()
  }
}

/** A title inside an accessible name, as a regular expression. */
const asPattern = (value: string) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

for (const [locale, content] of Object.entries(CONTENT)) {
  test.describe(`marketing pictures (${locale})`, () => {
    test.skip(!capture, 'Runs on request: GW_CAPTURE=1 pnpm capture')
    // One language at a time: the pictures share a browser cookie.
    test.describe.configure({ mode: 'serial' })

    const words = WORDS[locale]!
    const out = join(OUT, locale)

    // The browser's language too, not only the application's: a time input is
    // rendered by the browser, and a German browser writes 13:00 under an
    // English "1:00 PM".
    test.use({ locale: { de: 'de-DE', en: 'en-US', es: 'es-ES', fr: 'fr-FR' }[locale] })

    test.beforeAll(async () => {
      await mkdir(out, { recursive: true })
    })

    test.beforeAll(async () => {
      await speak(locale)
    })

    test.beforeEach(async ({ page }) => {
      // Proof rather than assumption: the language of the account decides what
      // every page below renders, and a picture in the wrong language is the
      // one mistake this file cannot notice by itself.
      await page.goto('/library')
      await expect(
        page.getByRole('button', { name: words.newFolder, exact: true }).first(),
      ).toBeVisible()
    })

    test('a workshop day', async ({ page, request }) => {
      await seedReferenceDay(page, request, content.day)
      await page.reload()
      await furnish(page, content, words)
      await page.setViewportSize({ width: 1280, height: 860 })
      await settle(page)

      await page.screenshot({ path: join(out, 'agenda.png') })
    })

    test('the library', async ({ page, request }) => {
      for (const [folder, workshops] of content.folders) {
        await page.goto('/library')
        await page.getByRole('button', { name: words.newFolder, exact: true }).first().click()
        await page.getByLabel(words.folderName).fill(folder)
        await page.keyboard.press('Enter')
        await expect(page.getByRole('link', { name: folder, exact: true }).first()).toBeVisible()

        for (const workshop of workshops) {
          await seedReferenceDay(page, request, workshop)
          await page.goto('/library')
          // `.first()`: a database that has seen a previous run carries the
          // same names again, and the picture needs only one of each.
          await page
            .getByRole('button', { name: asPattern(workshop) })
            .first()
            .click()
          await page.getByLabel(words.moveTo).last().selectOption({ label: folder })
          await expect(page.getByText(folder).first()).toBeVisible()
        }
      }

      await page.setViewportSize({ width: 1280, height: 860 })
      await page.goto('/library')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settle(page)

      await page.screenshot({ path: join(out, 'library.png') })
    })

    test('the reading view on a phone', async ({ page, request }) => {
      // The screen a facilitator actually holds in the room. The same day as
      // the wide picture: every seed is three calls to a rate-limited endpoint,
      // and a second day would say nothing the first does not.
      await seedReferenceDay(page, request, content.day)
      await page.reload()
      await furnish(page, content, words)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.reload()
      await settle(page)
      await page.getByRole('article', { name: content.blocks[0]!.title }).scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, -80))
      await page.waitForTimeout(200)

      await page.screenshot({ path: join(out, 'phone.png') })
    })
  })
}

/**
 * The language is stored on the account, so the last picture would leave it
 * there -- and the next run's sign-in check, which looks for a German heading,
 * would fail on a French library. The run puts it back.
 */
test.describe('after the pictures', () => {
  test.skip(!capture, 'Runs on request: GW_CAPTURE=1 pnpm capture')

  test('leaves the account in German', async ({ page }) => {
    await speak('de')
    await page.goto('/library')
    await expect(page.getByRole('button', { name: 'Ordner', exact: true }).first()).toBeVisible()
  })
})
