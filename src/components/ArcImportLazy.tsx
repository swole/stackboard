import { lazy, Suspense } from 'react'

// The Arc importer (0.9.7) loads the first time its tab shows, so lib/arcImport.ts and its panel
// stay out of the new tab's main bundle, the way Settings and Clean-up do.

const ArcImport = lazy(() => import('./ArcImport').then((m) => ({ default: m.ArcImport })))

export function LazyArcImport(props: { variant: 'welcome' | 'modal'; onDone?: () => void }) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-sunken" />}>
      <ArcImport {...props} />
    </Suspense>
  )
}
