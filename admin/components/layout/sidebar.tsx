'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {ChevronsLeft, LogOut} from 'lucide-react'
import {useState} from 'react'
import {BRAND_ICON, NAVIGATION} from './nav'
import {useIdentity} from './identity'
import {Button} from '@/components/ui/button'
import {Separator} from '@/components/ui/separator'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {cn} from '@/lib/utils'

/**
 * Fixed 240px rail, one hairline border, no floating card.
 *
 * Collapsed it keeps icons and moves the labels into tooltips, which is the
 * only reason the tooltip primitive exists in this project.
 */
export function Sidebar({onNavigate}: {onNavigate?: () => void}) {
  const pathname = usePathname()
  const {identity, can, signOut} = useIdentity()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-card/40 transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[240px]',
      )}>
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <BRAND_ICON className="h-5 w-5 shrink-0 text-status-operational" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-none">Aurora</p>
            <p className="truncate text-2xs text-muted-foreground">VPN Infrastructure</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {NAVIGATION.map(group => {
          const items = group.items.filter(item => can(item.permission))
          if (items.length === 0) return null
          return (
            <div key={group.label ?? 'root'} className="space-y-0.5">
              {group.label && !collapsed && (
                <p className="px-2 pb-1 pt-2 text-2xs uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
              )}
              {items.map(item => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      collapsed && 'justify-center px-0',
                    )}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
                return collapsed ? (
                  <Tooltip key={item.href} delayDuration={0}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )
              })}
            </div>
          )
        })}
      </nav>

      <Separator />
      <div className={cn('space-y-2 p-2', collapsed && 'flex flex-col items-center')}>
        {!collapsed && identity && (
          <div className="rounded-md px-2 py-1.5">
            <p className="truncate text-xs">{identity.email}</p>
            <p className="truncate text-2xs text-muted-foreground">
              {identity.role?.replace(/_/g, ' ').toLowerCase() ?? 'no role'}
              {identity.mfa_enabled ? ' · MFA on' : ' · MFA off'}
            </p>
          </div>
        )}
        <div className={cn('flex gap-1', collapsed && 'flex-col')}>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(v => !v)} aria-label="Toggle sidebar">
            <ChevronsLeft className={cn('transition-transform', collapsed && 'rotate-180')} />
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  )
}
