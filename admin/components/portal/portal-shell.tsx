'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {useEffect, useState} from 'react'
import {
  Clock,
  Download,
  Globe2,
  HardDrive,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  Wrench,
  X,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {useIdentity} from '@/components/layout/identity'
import {consumerApi, QuotaSnapshot} from '@/lib/api'
import {formatDuration} from '@/lib/format'

export function PortalShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname()
  const {user, isAdmin, signOut} = useIdentity()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadQuota = async () => {
      try {
        const q = await consumerApi.quota()
        if (isMounted) setQuota(q)
      } catch {
        // Ignored in shell
      }
    }
    loadQuota()
    const timer = setInterval(loadQuota, 30000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [])

  const navItems = [
    {href: '/portal', label: 'Dashboard', icon: Globe2},
    {href: '/portal/locations', label: 'Server Locations', icon: Globe2},
    {href: '/portal/devices', label: 'My Devices & WireGuard', icon: HardDrive},
    {href: '/portal/account', label: 'Account & Security', icon: User},
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/portal" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold tracking-tight">Aurora</span>
                  <Badge variant="outline" className="px-1.5 py-0 text-3xs font-mono border-primary/30 text-primary">
                    VPN
                  </Badge>
                </div>
                <span className="text-3xs text-muted-foreground">User Portal</span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      active
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right Header Area */}
          <div className="flex items-center gap-2.5">
            {/* Live Quota Pill */}
            {quota && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs">
                <Clock className="h-3.5 w-3.5 text-status-operational" />
                <span className="text-muted-foreground">Daily Free Time:</span>
                <span className="font-mono font-medium text-foreground">
                  {quota.unlimited ? 'Unlimited' : formatDuration(quota.remaining_seconds)}
                </span>
              </div>
            )}

            {/* Admin Switcher */}
            {isAdmin && (
              <Link href="/">
                <Button variant="outline" size="sm" className="hidden sm:flex h-8 gap-1.5 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Operations Console</span>
                </Button>
              </Link>
            )}

            {/* User Pill / Sign Out */}
            <div className="flex items-center gap-2">
              <span className="hidden lg:inline text-xs text-muted-foreground max-w-[150px] truncate font-mono">
                {user?.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation">
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border/60 bg-background px-4 py-3 space-y-2">
            {quota && (
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-2.5 text-xs mb-2">
                <span className="text-muted-foreground">Daily Free Quota</span>
                <span className="font-mono font-medium text-foreground">
                  {quota.unlimited ? 'Unlimited Pro' : `${formatDuration(quota.remaining_seconds)} remaining`}
                </span>
              </div>
            )}
            {navItems.map(item => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 text-xs font-medium rounded-md ${
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                  }`}>
                  {item.label}
                </Link>
              )
            })}
            {isAdmin && (
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block pt-2">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs text-amber-400">
                  <Wrench className="h-3.5 w-3.5" />
                  Switch to Operations Console
                </Button>
              </Link>
            )}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-12 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-status-operational" />
            <span>Aurora Zero-Logs WireGuard Protocol &middot; Cryptographically Enforced</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/portal/account" className="hover:underline">Privacy Guarantee</Link>
            <span>&middot;</span>
            <Link href="/portal/devices" className="hover:underline">WireGuard Configs</Link>
            <span>&middot;</span>
            <span>FastAPI Control Plane v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
