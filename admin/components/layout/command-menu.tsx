'use client'

import {useEffect, useState} from 'react'
import {useRouter} from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {NAVIGATION} from './nav'
import {useIdentity} from './identity'

/**
 * ⌘K. Navigation only.
 *
 * It deliberately cannot *do* anything -- no "disconnect session", no "drain
 * gateway". Destructive work lives behind a typed confirmation and an MFA
 * code; a fuzzy-matched command palette is the wrong place for it.
 */
export function CommandMenu({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const router = useRouter()
  const {can} = useIdentity()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        {NAVIGATION.map(group => {
          const items = group.items.filter(item => can(item.permission))
          if (!items.length) return null
          return (
            <CommandGroup key={group.label ?? 'root'} heading={group.label ?? 'Dashboard'}>
              {items.map(item => (
                <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                  <item.icon />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

export function useCommandMenu() {
  const [open, setOpen] = useState(false)
  return {open, setOpen}
}
