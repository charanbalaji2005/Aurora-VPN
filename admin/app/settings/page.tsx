'use client'

import {useEffect, useState} from 'react'
import {Loader2, ShieldCheck} from 'lucide-react'
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {PageHeader} from '@/components/shared/page'
import {ErrorState, TableSkeleton} from '@/components/shared/states'
import {useIdentity} from '@/components/layout/identity'
import {ApiError, api} from '@/lib/api'
import {formatDuration} from '@/lib/format'
import {useApi} from '@/lib/use-api'

type Settings = {
  free_daily_seconds: number
  session_heartbeat_seconds: number
  session_stale_after_seconds: number
  max_concurrent_sessions: number
  max_devices_per_free_user: number
  quota_reset_timezone: string
  environment: string
  editable: string[]
}

export default function SettingsPage() {
  const {identity, can} = useIdentity()
  const settings = useApi<Settings>('/admin/settings')
  const [seconds, setSeconds] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (settings.data) setSeconds(settings.data.free_daily_seconds)
  }, [settings.data])

  const save = async () => {
    if (seconds === null) return
    setSaving(true)
    setMessage(null)
    try {
      await api('/admin/settings/quota', {method: 'PUT', body: {free_daily_seconds: seconds}})
      setMessage('Saved. It applies at the next quota check.')
      settings.refresh()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Runtime configuration and your own security." />

      <Tabs defaultValue="vpn">
        <TabsList>
          <TabsTrigger value="vpn">VPN</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="vpn" className="space-y-4">
          {settings.loading ? (
            <TableSkeleton rows={4} columns={2} />
          ) : settings.error ? (
            <Card>
              <ErrorState error={settings.error} onRetry={settings.refresh} />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Free daily allowance</CardTitle>
                  <p className="text-2xs text-muted-foreground">
                    Applies from the next quota check. Running sessions are measured against the new
                    figure at their next heartbeat rather than being cut off mid-connection.
                  </p>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="allowance">Seconds</Label>
                    <Input
                      id="allowance"
                      type="number"
                      min={60}
                      max={86400}
                      step={60}
                      value={seconds ?? ''}
                      onChange={e => setSeconds(Number(e.target.value))}
                      className="tabular w-36"
                      disabled={!can('write:settings')}
                    />
                  </div>
                  <span className="pb-2 text-xs text-muted-foreground">
                    {seconds ? formatDuration(seconds) : ''}
                  </span>
                  <Button onClick={save} disabled={saving || !can('write:settings')}>
                    {saving && <Loader2 className="animate-spin" />}
                    Save
                  </Button>
                  {message && <span className="pb-2 text-xs text-muted-foreground">{message}</span>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Deployment configuration</CardTitle>
                  <p className="text-2xs text-muted-foreground">
                    Read-only here on purpose: these come from the environment and changing them
                    needs a restart and a review, not a text box.
                  </p>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-xs">
                    {[
                      ['Environment', settings.data!.environment],
                      ['Heartbeat interval', `${settings.data!.session_heartbeat_seconds}s`],
                      ['Session considered stale after', `${settings.data!.session_stale_after_seconds}s`],
                      ['Concurrent sessions per account', String(settings.data!.max_concurrent_sessions)],
                      ['Devices per free account', String(settings.data!.max_devices_per_free_user)],
                      ['Quota reset timezone', settings.data!.quota_reset_timezone],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between border-b pb-1.5">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="security">
          <MfaCard enabled={!!identity?.mfa_enabled} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * MFA enrolment. The secret and the recovery codes are shown exactly once,
 * because after confirmation the server keeps only hashes.
 */
function MfaCard({enabled}: {enabled: boolean}) {
  const [secret, setSecret] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const begin = async () => {
    setBusy(true)
    setError(null)
    try {
      const started = await api<{secret: string; otpauth_url: string}>('/auth/mfa/enrol', {method: 'POST'})
      setSecret(started.secret)
      setUri(started.otpauth_url)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start enrolment.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const done = await api<{recovery_codes: string[]}>('/auth/mfa/confirm', {
        method: 'POST',
        body: {code: code.trim()},
      })
      setRecovery(done.recovery_codes)
      setSecret(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That code was not accepted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Two-factor authentication
        </CardTitle>
        <p className="text-2xs text-muted-foreground">
          Required before opening a gateway terminal or running a destructive operation. A stolen
          console session is not enough on its own.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {enabled && !recovery && !secret && (
          <Alert>
            <AlertTitle>Enabled on this account</AlertTitle>
            <AlertDescription>
              You will be asked for a code when you open a terminal or confirm an operation.
            </AlertDescription>
          </Alert>
        )}

        {!enabled && !secret && !recovery && (
          <Button onClick={begin} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Set up authenticator
          </Button>
        )}

        {secret && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Add this secret to your authenticator</Label>
              <p className="rounded border bg-muted/40 p-2 font-mono text-xs break-all">{secret}</p>
              {uri && <p className="break-all text-2xs text-muted-foreground">{uri}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-confirm">Enter the six digits it shows</Label>
              <Input
                id="mfa-confirm"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-40 font-mono tracking-widest"
                inputMode="numeric"
              />
            </div>
            <Button onClick={confirm} disabled={busy || code.length < 6}>
              Confirm
            </Button>
          </div>
        )}

        {recovery && (
          <Alert variant="warning">
            <AlertTitle>Save these recovery codes now</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                Each works once. They are stored only as hashes, so this is the only time they are
                shown.
              </p>
              <div className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-4">
                {recovery.map(item => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
