'use client'

import {usePathname} from 'next/navigation'
import {Menu, Search} from 'lucide-react'
import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Sheet, SheetContent, SheetTrigger} from '@/components/ui/sheet'
import {TooltipProvider} from '@/components/ui/tooltip'
import {Skeleton} from '@/components/ui/skeleton'
import {CommandMenu, useCommandMenu} from './command-menu'
import {IdentityProvider, useIdentity} from './identity'
import {Sidebar} from './sidebar'
import {labelForPath} from './nav'

import {PortalShell} from '@/components/portal/portal-shell'
import Link from 'next/link'
import {User} from 'lucide-react'

export function AppShell({children}: {children: React.ReactNode}) {
  return (
    <IdentityProvider>
      <TooltipProvider>
        <ShellBody>{children}</ShellBody>
      </TooltipProvider>
    </IdentityProvider>
  )
}

function ShellBody({children}: {children: React.ReactNode}) {
  const pathname = usePathname()
  const {identity, isAdmin, loading} = useIdentity()
  const {open, setOpen} = useCommandMenu()
  const [mobileOpen, setMobileOpen] = useState(false)

  // The login page draws itself.
  if (pathname === '/login') return <>{children}</>

  // The Consumer User Portal has its own dedicated consumer shell
  if (pathname.startsWith('/portal')) {
    return <PortalShell>{children}</PortalShell>
  }

  if (loading || !identity) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-[240px] shrink-0 border-r p-3 lg:block">
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="flex-1 space-y-3 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const crumbs = labelForPath(pathname)

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0 sm:max-w-[240px]">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {crumbs.map((crumb, index) => (
                <li key={`${crumb}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && <span aria-hidden>/</span>}
                  <span className={index === crumbs.length - 1 ? 'truncate text-foreground' : 'truncate'}>
                    {crumb}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          <Link href="/portal">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10">
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">User Portal</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="gap-2 text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="ml-1 hidden rounded border bg-muted px-1 font-mono text-2xs sm:inline">⌘K</kbd>
          </Button>
        </header>

        <main className="flex-1 space-y-6 p-4 lg:p-6">{children}</main>
      </div>

      <CommandMenu open={open} onOpenChange={setOpen} />
    </div>
  )
}
