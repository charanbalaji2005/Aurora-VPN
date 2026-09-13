import {
  Activity,
  FileClock,
  Gauge,
  Globe2,
  HeartPulse,
  LayoutGrid,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  SquareTerminal,
  Users,
} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'

export type NavItem = {href: string; label: string; icon: LucideIcon; permission: string}
export type NavGroup = {label: string | null; items: NavItem[]}

/**
 * Grouped by what an operator is doing, not by which service owns the data.
 * Each item declares the permission it needs, so the sidebar a support admin
 * sees is genuinely the set of pages they can open.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    items: [
      {href: '/', label: 'Overview', icon: Gauge, permission: 'view:dashboard'},
      {href: '/control-center', label: 'Control Center', icon: LayoutGrid, permission: 'view:gateways'},
    ],
  },
  {
    label: 'Operations',
    items: [
      {href: '/sessions', label: 'Sessions', icon: Activity, permission: 'view:sessions'},
      {href: '/users', label: 'Users', icon: Users, permission: 'view:users'},
      {href: '/devices', label: 'Devices', icon: Smartphone, permission: 'view:devices'},
    ],
  },
  {
    label: 'Network',
    items: [{href: '/gateways', label: 'Gateways', icon: Server, permission: 'view:gateways'}],
  },
  {
    label: 'Analytics',
    items: [{href: '/analytics', label: 'Traffic & usage', icon: Globe2, permission: 'view:analytics'}],
  },
  {
    label: 'Infrastructure',
    items: [
      {href: '/health', label: 'Health', icon: HeartPulse, permission: 'view:health'},
      {href: '/logs', label: 'Logs', icon: ScrollText, permission: 'view:audit'},
      {href: '/terminal', label: 'Terminal', icon: SquareTerminal, permission: 'write:terminal'},
    ],
  },
  {
    label: 'System',
    items: [
      {href: '/settings', label: 'Settings', icon: Settings, permission: 'view:dashboard'},
      {href: '/audit', label: 'Audit log', icon: FileClock, permission: 'view:audit'},
    ],
  },
]

export const BRAND_ICON = ShieldCheck

export function labelForPath(pathname: string): string[] {
  if (pathname === '/') return ['Overview']
  const segments = pathname.split('/').filter(Boolean)
  for (const group of NAVIGATION) {
    for (const item of group.items) {
      if (item.href !== '/' && pathname.startsWith(item.href)) {
        const rest = segments.slice(item.href.split('/').filter(Boolean).length)
        return [group.label, item.label, ...rest].filter(Boolean) as string[]
      }
    }
  }
  return segments
}
