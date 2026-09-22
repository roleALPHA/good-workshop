/**
 * The front page is the one route the two editions answer differently: a
 * self-hosted installation sends you in (./components/home/community-home.tsx),
 * the cloud shows its website (src/cloud/site/home.tsx). Which one is decided
 * at build time through the `@gw/home` alias -- see next.config.ts.
 */
export const dynamic = 'force-dynamic'

export { default, generateMetadata } from '@gw/home'
