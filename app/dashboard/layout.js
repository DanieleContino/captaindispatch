'use client'
/**
 * app/dashboard/layout.js — Role-based access guard (S61) + layout strutturale
 *
 * Wraps ALL pages under /dashboard/*.
 * On every navigation, reads the user's role from user_roles and redirects
 * restricted roles (TRAVEL, ACCOMMODATION) away from pages they cannot access.
 *
 * CAPTAIN / ADMIN / MANAGER / PRODUCTION → unrestricted, no redirect.
 * TRAVEL → only /dashboard/travel, /dashboard/crew, /dashboard/hub-coverage,
 *           /dashboard/locations, /dashboard/lists-v2
 *
 * Rende anche la Navbar una sola volta a questo livello, così la scrollbar
 * del contenuto parte SOTTO la navbar (fix PWA standalone).
 */

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { getProductionId } from '../../lib/production'
import { canAccess, getHomeForRole } from '../../lib/roleAccess'
import { Navbar } from '../../lib/navbar'

export default function DashboardLayout({ children }) {
  const router   = useRouter()
  const pathname = usePathname()
  // Cache the resolved role so we don't re-query on every soft navigation
  const roleRef  = useRef(null)
  const checkedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function guard() {
      // If role already known, just check access
      if (roleRef.current !== null) {
        if (!canAccess(roleRef.current, pathname)) {
          router.replace(getHomeForRole(roleRef.current))
        }
        return
      }

      // First load: fetch role from DB
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return

      const productionId = getProductionId()
      if (!productionId) return

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('production_id', productionId)
        .maybeSingle()

      if (cancelled) return

      const role = data?.role ?? null
      roleRef.current = role

      if (role && !canAccess(role, pathname)) {
        router.replace(getHomeForRole(role))
      }
    }

    guard()
    return () => { cancelled = true }
  }, [pathname, router])

  return (
    <div className="dashboard-root" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Navbar fuori dal contenitore scrollabile: la scrollbar parte sotto di essa */}
      <Navbar currentPath={pathname} className="no-print" />
      {/* Area contenuto scrollabile — la scrollbar inizia qui, sotto la navbar */}
      <div className="dashboard-content" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}
