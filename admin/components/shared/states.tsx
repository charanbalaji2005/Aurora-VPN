'use client'

import type {LucideIcon} from 'lucide-react'
import {AlertTriangle, Inbox, RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Skeleton} from '@/components/ui/skeleton'
import type {ApiError} from '@/lib/api'

/**
 * The three states that are not "data".
 *
 * Each one says what happened and what to do next. "No gateways registered
 * yet." is a dead end; "no gateways yet, here is how one appears" is not.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  icon?: LucideIcon
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-lg border bg-muted/40 p-2.5">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  )
}

export function ErrorState({error, onRetry}: {error: ApiError; onRetry?: () => void}) {
  const permission = error.code === 'permission_denied'
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
        <AlertTriangle className="h-5 w-5 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {permission ? 'Your role cannot view this' : 'Could not load this'}
        </p>
        {/* The server's message, not a stack trace. */}
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">{error.message}</p>
      </div>
      {onRetry && !permission && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  )
}

export function TableSkeleton({rows = 6, columns = 5}: {rows?: number; columns?: number}) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({length: rows}).map((_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({length: columns}).map((__, column) => (
            <Skeleton key={column} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardsSkeleton({count = 4}: {count?: number}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({length: count}).map((_, index) => (
        <Card key={index} className="p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </Card>
      ))}
    </div>
  )
}
