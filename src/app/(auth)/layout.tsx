import { AppFooter } from '@/components/layout/app-footer'
import { BrandMark, BrandStyle } from '@/components/layout/tenant-brand'

// The sign-in page reads the tenant row for its branding, so it cannot be
// prerendered. That is the right trade: a login page that shows the default
// palette for a moment and then swaps to somebody's brand looks broken.
export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <BrandStyle />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <BrandMark className="h-8 w-auto max-w-56 object-contain" />
          </div>
          {children}
        </div>
      </main>
      <AppFooter />
    </div>
  )
}
