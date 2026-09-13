'use client'

import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {PageHeader} from '@/components/shared/page'
import {EmptyState, ErrorState, TableSkeleton} from '@/components/shared/states'
import type {LogEntry} from '@/lib/api'
import {formatTime} from '@/lib/format'
import {useApi} from '@/lib/use-api'
import {cn} from '@/lib/utils'

const LEVEL_CLASS: Record<string, string> = {
  info: 'text-status-info',
  warning: 'text-status-degraded',
  error: 'text-status-down',
}

export default function LogsPage() {
  const [level, setLevel] = useState('all')
  const [query, setQuery] = useState('')

  const params = new URLSearchParams({limit: '300'})
  if (level !== 'all') params.set('level', level)
  if (query.trim()) params.set('q', query.trim())
  const logs = useApi<{entries: LogEntry[]; source: string}>(`/admin/logs?${params}`, {pollMs: 20000})

  return (
    <div className="space-y-5">
      <PageHeader title="Logs" description="Operational events recorded by the control plane." />

      <Alert>
        <AlertTitle>What this is</AlertTitle>
        <AlertDescription>
          The audit and security event stream — sign-ins, suspensions, gateway operations, terminal
          activity. It is not application stdout: those go to your platform&apos;s log sink, and a
          viewer that quietly missed them would be worse than none.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter events"
          className="max-w-xs"
        />
        <Tabs value={level} onValueChange={setLevel}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="warning">Warning</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={logs.refresh} className="ml-auto">
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        {logs.loading ? (
          <TableSkeleton columns={4} />
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={logs.refresh} />
        ) : logs.data!.entries.length === 0 ? (
          <EmptyState title="No events match" body="Try a wider level filter or a different search." />
        ) : (
          <div className="max-h-[640px] overflow-auto font-mono text-2xs">
            {logs.data!.entries.map((entry, index) => (
              <div
                key={index}
                className="flex gap-3 border-b px-3 py-1.5 last:border-0 hover:bg-muted/40">
                <span className="shrink-0 text-muted-foreground">{formatTime(entry.timestamp)}</span>
                <span className={cn('w-16 shrink-0 uppercase', LEVEL_CLASS[entry.level])}>
                  {entry.level}
                </span>
                <span className="w-24 shrink-0 text-muted-foreground">{entry.service}</span>
                <span className="min-w-0 flex-1 break-all">
                  {entry.event}
                  {entry.target ? ` target=${entry.target}` : ''}
                  {entry.metadata?.reason ? ` reason="${String(entry.metadata.reason)}"` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
