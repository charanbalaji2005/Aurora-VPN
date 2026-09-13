'use client'

import {createContext, useContext, useEffect, useState} from 'react'
import {usePathname, useRouter} from 'next/navigation'
import {ApiError, Identity, UserAccount, api, session} from '@/lib/api'

type IdentityState = {
  identity: Identity | null
  user: UserAccount | null
  isAdmin: boolean
  loading: boolean
  can: (permission: string) => boolean
  signOut: () => void
}

const Context = createContext<IdentityState>({
  identity: null,
  user: null,
  isAdmin: false,
  loading: true,
  can: () => false,
  signOut: () => {},
})

/**
 * Role-based identity provider.
 *
 * Checks /auth/me for user role. If is_admin, loads operator permissions from
 * /admin/me. If a standard consumer user, routes to /portal.
 */
export function IdentityProvider({children}: {children: React.ReactNode}) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [user, setUser] = useState<UserAccount | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/login') {
      setLoading(false)
      return
    }
    if (!session.token()) {
      router.replace('/login')
      return
    }

    let isMounted = true

    async function loadIdentity() {
      try {
        const userSummary = await api<UserAccount>('/auth/me')
        if (!isMounted) return
        setUser(userSummary)

        if (userSummary.is_admin) {
          setIsAdmin(true)
          try {
            const adminIdentity = await api<Identity>('/admin/me')
            if (isMounted) setIdentity(adminIdentity)
          } catch {
            if (isMounted) {
              setIdentity({
                id: userSummary.id,
                email: userSummary.email,
                role: 'admin',
                permissions: ['operator'],
                mfa_enabled: false,
              })
            }
          }
        } else {
          setIsAdmin(false)
          setIdentity({
            id: userSummary.id,
            email: userSummary.email,
            role: 'consumer',
            permissions: [],
            mfa_enabled: false,
          })
          // If a consumer visits an operator-only path, redirect them to the User Portal
          if (!pathname.startsWith('/portal')) {
            router.replace('/portal')
          }
        }
      } catch (error) {
        if (!isMounted) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          session.clear()
          router.replace('/login')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadIdentity()

    return () => {
      isMounted = false
    }
  }, [pathname, router])

  const value: IdentityState = {
    identity,
    user,
    isAdmin,
    loading,
    can: permission => identity?.permissions.includes(permission) ?? false,
    signOut: () => {
      session.clear()
      router.replace('/login')
    },
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useIdentity = () => useContext(Context)

