'use client'

/**
 * Client-side providers wrapper.
 * Used in app/layout.tsx (Server Component) to wrap children
 * with React Context providers that require 'use client'.
 */

import { LanguageProvider } from '../lib/i18n'

export function Providers({ children }) {
  return (
    <LanguageProvider>
      {children}
    </LanguageProvider>
  )
}
