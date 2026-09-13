'use client'

import {useState} from 'react'
import {Users} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Sheet, SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Badge} from '@/components/ui/badge'
import {ConfirmDialog} from '@/components/shared/confirm-dialog'
import {PageHeader} from '@/components/shared/page'
import {StatusBadge} from '@/components/shared/status-badge'
import {EmptyState, ErrorState, TableSkeleton} from '@/components/shared/states'
import {useIdentity} from '@/components/layout/identity'
import {api} from '@/lib/api'
import type {UserRow} from '@/lib/api'
import {EM_DASH, formatBytes, formatDuration, formatRelative, formatTime} from '@/lib/format'
import {useApi} from '@/lib/use-api'

type UserDetail = {
  user: UserRow & {suspended_reason?: string}
  devices: {id: string; name: string; platform: string; last_seen_at: string | null; revoked: boolean}[]
  sessions: {id: string; gateway_id: string; started_at: string; duration_seconds: number; status: string}[]
  quota_today: {used_seconds: number} | null
  usage: {date: string; duration_seconds: number; bytes: number}[]
  signals: {sessions_24h: number; active_devices: number; used_seconds_today: number; reconnect_churn: boolean}
}

export default function UsersPage() {
  const {can} = useIdentity()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [suspending, setSuspending] = useState<UserRow | null>(null)

  const params = new URLSearchParams({limit: '100'})
  if (query.trim()) params.set('q', query.trim())
  if (status !== 'all') params.set('status', status)

  const users = useApi<{users: UserRow[]; total: number}>(`/admin/users?${params}`)
  const detail = useApi<UserDetail>(selectedId ? `/admin/users/${selectedId}` : null)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        description="Accounts, their devices and what they have used today."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by email"
          className="max-w-sm"
        />
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
          </TabsList>
        </Tabs>
        {users.data && (
          <span className="text-2xs text-muted-foreground">
            {users.data.users.length} of {users.data.total}
          </span>
        )}
      </div>

      <Card>
        {users.loading ? (
          <TableSkeleton columns={5} />
        ) : users.error ? (
          <ErrorState error={users.error} onRetry={users.refresh} />
        ) : users.data!.users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query ? 'Nothing matches that search' : 'No accounts yet'}
            body={
              query
                ? 'Try a different email fragment.'
                : 'Accounts appear here as people register in the app.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data!.users.map(user => (
                <TableRow key={user.id} className="cursor-pointer" onClick={() => setSelectedId(user.id)}>
                  <TableCell className="max-w-[240px] truncate">{user.email}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{user.plan}</TableCell>
                  <TableCell>
                    {user.role ? (
                      <Badge variant="info">{user.role.replace(/_/g, ' ').toLowerCase()}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{EM_DASH}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelative(user.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {can('write:user_status') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async event => {
                          event.stopPropagation()
                          if (user.status === 'active') {
                            setSuspending(user)
                          } else {
                            await api(`/admin/users/${user.id}/reinstate`, {method: 'POST'})
                            users.refresh()
                          }
                        }}>
                        {user.status === 'active' ? 'Suspend' : 'Reinstate'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Sheet open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{detail.data?.user.email ?? 'Account'}</SheetTitle>
            <p className="text-2xs text-muted-foreground">
              Account and operational data only. Nothing about what was accessed through the tunnel
              is stored.
            </p>
          </SheetHeader>

          <div className="space-y-5 p-5 text-xs">
            {detail.loading ? (
              <TableSkeleton rows={5} columns={2} />
            ) : detail.error ? (
              <ErrorState error={detail.error} onRetry={detail.refresh} />
            ) : detail.data ? (
              <>
                <section className="space-y-2">
                  <h3 className="text-2xs uppercase tracking-wide text-muted-foreground">Account</h3>
                  {[
                    ['Plan', detail.data.user.plan],
                    ['Status', detail.data.user.status],
                    ['Registered', formatTime(detail.data.user.created_at)],
                    ['Used today', formatDuration(detail.data.quota_today?.used_seconds ?? 0)],
                    ['Sessions (24h)', String(detail.data.signals.sessions_24h)],
                    ['Active devices', String(detail.data.signals.active_devices)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b pb-1.5">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular">{value}</span>
                    </div>
                  ))}
                  {detail.data.signals.reconnect_churn && (
                    <p className="rounded border border-status-degraded/30 bg-status-degraded/10 p-2 text-status-degraded">
                      High reconnect churn in the last 24 hours — often a sign of scripted use.
                    </p>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-2xs uppercase tracking-wide text-muted-foreground">Devices</h3>
                  {detail.data.devices.length === 0 ? (
                    <p className="text-muted-foreground">No devices registered.</p>
                  ) : (
                    detail.data.devices.map(device => (
                      <div key={device.id} className="flex items-center justify-between border-b pb-1.5">
                        <div>
                          <p>{device.name}</p>
                          <p className="text-2xs text-muted-foreground">
                            {device.platform} · seen {formatRelative(device.last_seen_at)}
                          </p>
                        </div>
                        <StatusBadge status={device.revoked ? 'revoked' : 'active'} />
                      </div>
                    ))
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-2xs uppercase tracking-wide text-muted-foreground">Recent usage</h3>
                  {detail.data.usage.length === 0 ? (
                    <p className="text-muted-foreground">No completed sessions yet.</p>
                  ) : (
                    detail.data.usage.map(day => (
                      <div key={day.date} className="flex justify-between border-b pb-1.5">
                        <span className="text-muted-foreground">{day.date}</span>
                        <span className="tabular">
                          {formatDuration(day.duration_seconds)} · {formatBytes(day.bytes)}
                        </span>
                      </div>
                    ))
                  )}
                </section>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!suspending}
        onOpenChange={open => !open && setSuspending(null)}
        title="Suspend this account?"
        description={`${suspending?.email} will be signed out, their sessions terminated and their peers removed from every gateway.`}
        actionLabel="Suspend"
        requireMfa={false}
        onConfirm={async ({reason}) => {
          await api(`/admin/users/${suspending!.id}/suspend`, {method: 'POST', body: {reason}})
          users.refresh()
        }}
      />
    </div>
  )
}
