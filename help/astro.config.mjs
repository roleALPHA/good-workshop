// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLinksValidator from 'starlight-links-validator'
import starlightLlmsTxt from 'starlight-llms-txt'

/**
 * The help pages at doc.goodworkshop.org.
 *
 * Four languages, each under its own prefix and with the same slugs, so the
 * language picker lands on the same page. German is the source, as in the app.
 * The sidebar groups follow the product from the first workshop to running it
 * yourself; each group lists its directory, ordered by `sidebar.order`.
 */
const group = (directory, de, en, fr, es) => ({
  label: de,
  translations: { en, fr, es },
  items: [{ autogenerate: { directory } }],
})

export default defineConfig({
  site: 'https://doc.goodworkshop.org',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: {
        de: 'GoodWorkshop Hilfe',
        en: 'GoodWorkshop Help',
        fr: 'Aide GoodWorkshop',
        es: 'Ayuda de GoodWorkshop',
      },
      description: 'Workshops planen mit GoodWorkshop: Anleitungen, Referenz und Fehlerbehebung.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      favicon: '/favicon.svg',
      defaultLocale: 'de',
      locales: {
        de: { label: 'Deutsch', lang: 'de' },
        en: { label: 'English', lang: 'en' },
        fr: { label: 'Français', lang: 'fr' },
        es: { label: 'Español', lang: 'es' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/roleALPHA/good-workshop' },
      ],
      editLink: {
        baseUrl: 'https://github.com/roleALPHA/good-workshop/edit/main/help/',
      },
      customCss: ['./src/styles/theme.css'],
      lastUpdated: true,
      sidebar: [
        group('start', 'Erste Schritte', 'Getting started', 'Premiers pas', 'Primeros pasos'),
        group('library', 'Bibliothek', 'Library', 'Bibliothèque', 'Biblioteca'),
        group(
          'agenda',
          'Agenda planen',
          'Planning the agenda',
          'Planifier l’agenda',
          'Planificar la agenda',
        ),
        group(
          'sharing',
          'Teilen und ausgeben',
          'Sharing and output',
          'Partager et exporter',
          'Compartir y exportar',
        ),
        group(
          'ai',
          'KI-Assistent (MCP)',
          'AI assistant (MCP)',
          'Assistant IA (MCP)',
          'Asistente de IA (MCP)',
        ),
        group(
          'account',
          'Konto und Verwaltung',
          'Account and administration',
          'Compte et administration',
          'Cuenta y administración',
        ),
        group(
          'cloud',
          'GoodWorkshop Cloud',
          'GoodWorkshop Cloud',
          'GoodWorkshop Cloud',
          'GoodWorkshop Cloud',
        ),
        group(
          'self-hosting',
          'Selbst betreiben',
          'Self-hosting',
          'Auto-hébergement',
          'Alojamiento propio',
        ),
        group(
          'troubleshooting',
          'Fehlerbehebung',
          'Troubleshooting',
          'Dépannage',
          'Solución de problemas',
        ),
      ],
      plugins: [starlightLinksValidator(), starlightLlmsTxt({ projectName: 'GoodWorkshop' })],
    }),
  ],
})
