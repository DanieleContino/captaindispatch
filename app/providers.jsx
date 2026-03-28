'use client'

/**
 * Client-side providers wrapper.
 * Used in app/layout.tsx (Server Component) to wrap children
 * with React Context providers that require 'use client'.
 *
 * Registra anche il Service Worker per Web Push (S11 TASK 1).
 */

import { useEffect } from 'react'
import { LanguageProvider } from '../lib/i18n'

export function Providers({ children }) {
  // Registrazione Service Worker per Web Push PWA
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[SW] Registrato con scope:', reg.scope)
        })
        .catch((err) => {
          console.warn('[SW] Registrazione fallita:', err)
        })
    }
  }, [])

  return (
    <LanguageProvider>
      {children}
    </LanguageProvider>
  )
}
