import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'

// Development only: the gallery is not routed or bundled in production builds.
const UiGallery = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery')) : null

export default function App() {
  return (
    <Routes>
      {UiGallery && (
        <Route
          path="/dev/ui"
          element={
            <Suspense fallback={null}>
              <UiGallery />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<main className="min-h-dvh bg-paper text-ink" />} />
    </Routes>
  )
}
