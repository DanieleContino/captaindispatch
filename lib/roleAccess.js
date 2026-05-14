/**
 * roleAccess.js — Single source of truth for role-based page access (S61)
 *
 * ROLE_ACCESS maps each restricted role to an array of allowed path prefixes.
 * null means "unrestricted" (CAPTAIN, ADMIN, MANAGER, PRODUCTION).
 *
 * To expand: add/remove paths in the arrays below.
 */

export const ROLE_ACCESS = {
  TRAVEL: [
    '/dashboard/travel',
    '/dashboard/crew',
    '/dashboard/hub-coverage',
    '/dashboard/locations',
    '/dashboard/lists-v2',
  ],
  // ACCOMMODATION: [...] — to be added in a future session
}

/**
 * Returns the allowed paths array for a given role,
 * or null if the role has unrestricted access.
 */
export function getAllowedPaths(role) {
  return ROLE_ACCESS[role] ?? null
}

/**
 * Returns true if the given role can access the given pathname.
 * Roles not listed in ROLE_ACCESS are unrestricted (return true).
 */
export function canAccess(role, pathname) {
  const allowed = getAllowedPaths(role)
  if (!allowed) return true
  return allowed.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Returns the default landing page for a restricted role.
 */
export function getHomeForRole(role) {
  if (role === 'TRAVEL') return '/dashboard/travel'
  if (role === 'ACCOMMODATION') return '/dashboard/accommodation'
  return '/dashboard'
}

/**
 * NAV_ITEMS visible to each restricted role.
 * Keys match the `p` field in navbar NAV_ITEMS / NAV_SECONDARY.
 */
export const ROLE_NAV_ITEMS = {
  TRAVEL: ['/dashboard/crew', '/dashboard/hub-coverage'],
}

export const ROLE_NAV_SECONDARY = {
  TRAVEL: ['/dashboard/lists-v2', '/dashboard/locations'],
}

/**
 * Human-readable label for the home page of each restricted role.
 * Used by the navbar to always prepend a "back to home" link.
 */
export const ROLE_HOME_LABEL = {
  TRAVEL:        '✈️ Travel',
  ACCOMMODATION: '🏨 Accommodation',
}
