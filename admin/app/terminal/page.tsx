'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {Loader2, Plug, PlugZap, SquareTerminal, Trash2} from 'lucide-react'
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageHeader} from '@/components/shared/page'
import {EmptyState, ErrorState} from '@/components/shared/states'
import {ApiError, api, websocketUrl} from '@/lib/api'
import type {Gateway, TerminalGrant} from '@/lib/api'
import {useApi} from '@/lib/use-api'
import {cn} from '@/lib/utils'

type Line = {kind: 'command' | 'output' | 'error' | 'note'; text: string; meta?: string}

/**
 * The gateway terminal.
 *
 * It looks like a shell and is emphatically not one. Every line typed here is
 * matched against a server-side allowlist of read-only commands, executed with
 * a fixed argv and no shell, recorded in the audit log, and returned with
 * key-shaped material redacted. Anything that changes the gateway lives on the
 * gateway page as a named operation instead.
 *
 * Opening a session needs the terminal permission and a fresh authenticator
 * code; the grant expires on its own and dies after five idle minutes.
 */
export default function TerminalPage() {
  const params = useSearchParams()
  const gateways = useApi<{gateways: Gateway[]}>('/admin/gateways')

  const [gatewayId, setGatewayId] = useState(params.get('gateway') ?? '')
  const [code, setCode] = useState('')
  const [grant, setGrant] = useState<TerminalGrant | null>(null)
  const [connected, setConnected] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [busy, setBusy] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const outputRef = useRef<HTMLDivElement | null>(null)

  const append = useCallback((line: Line) => setLines(current => [...current, line]), [])

  useEffect(() => {
    outputRef.current?.scrollTo({top: outputRef.current.scrollHeight})
  }, [lines])

  const disconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setConnected(false)
  }, [])

  useEffect(() => () => socketRef.current?.close(), [])

  const openSession = async () => {
    setOpening(true)
    setError(null)
    try {
      // Step-up first: a stolen console session alone must not reach a gateway.
      const proof = await api<{step_up_token: string}>('/auth/mfa/step-up', {
        method: 'POST',
        body: {code: code.trim()},
      })
      const opened = await api<TerminalGrant>('/admin/terminal/session', {
        method: 'POST',
        body: {gateway_id: gatewayId, step_up_token: proof.step_up_token},
      })
      setGrant(opened)
      setLines([
        {kind: 'note', text: `Connected to ${opened.gateway_name} (${opened.gateway_id}).`},
        {kind: 'note', text: `Read-only session. Type 'help' for the ${opened.commands.length} available commands.`},
      ])
      setCode('')
      connectSocket(opened)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open a terminal session.')
    } finally {
      setOpening(false)
    }
  }

  const connectSocket = (opened: TerminalGrant) => {
    const socket = new WebSocket(
      websocketUrl(`/admin/terminal/ws/${opened.terminal_session_id}?token=${encodeURIComponent(opened.token)}`),
    )
    socketRef.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => {
      setConnected(false)
      append({kind: 'note', text: 'Session closed.'})
    }
    socket.onerror = () => append({kind: 'error', text: 'The terminal connection dropped.'})
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      setBusy(false)
      if (message.type === 'output') {
        append({
          kind: message.ok ? 'output' : 'error',
          text: message.output,
          meta: `exit ${message.exit_code}${message.duration_ms ? ` · ${message.duration_ms}ms` : ''}`,
        })
      } else if (message.type === 'help') {
        append({
          kind: 'output',
          text: message.commands
            .map((c: {command: string; description: string}) => `${c.command.padEnd(34)}${c.description}`)
            .join('\n'),
        })
      } else if (message.type === 'error') {
        append({kind: 'error', text: message.message})
      }
    }
  }

  const send = (command: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      append({kind: 'error', text: 'Not connected. Open a session first.'})
      return
    }
    append({kind: 'command', text: command})
    setHistory(current => [command, ...current].slice(0, 50))
    setHistoryIndex(-1)
    setBusy(true)
    socket.send(JSON.stringify({type: 'command', command}))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && input.trim()) {
      send(input.trim())
      setInput('')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      if (next >= 0) {
        setHistoryIndex(next)
        setInput(history[next])
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = historyIndex - 1
      setHistoryIndex(next)
      setInput(next >= 0 ? history[next] : '')
    }
  }

  const quickActions = ['wg show wg0', 'ip addr', 'nft list ruleset', 'systemctl status aurora-agent', 'df -h']

  return (
    <div className="space-y-5">
      <PageHeader
        title="Terminal"
        description="Read-only diagnostics against a gateway. Every command is allowlisted server-side and recorded."
        actions={
          grant && (
            <Badge variant={connected ? 'operational' : 'down'}>
              <span
                className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-status-operational' : 'bg-status-down')}
              />
              {connected ? 'connected' : 'disconnected'}
            </Badge>
          )
        }
      />

      {!grant ? (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Open a session</CardTitle>
            <p className="text-2xs text-muted-foreground">
              Sessions last 15 minutes and close after 5 idle minutes.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {gateways.error ? (
              <ErrorState error={gateways.error} onRetry={gateways.refresh} />
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Gateway</Label>
                  <Select value={gatewayId} onValueChange={setGatewayId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a gateway" />
                    </SelectTrigger>
                    <SelectContent>
                      {(gateways.data?.gateways ?? []).map(gateway => (
                        <SelectItem key={gateway.gateway_id} value={gateway.gateway_id}>
                          {gateway.city}, {gateway.country} — {gateway.gateway_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="terminal-mfa">Authenticator code</Label>
                  <Input
                    id="terminal-mfa"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    className="font-mono tracking-widest"
                    autoComplete="one-time-code"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button onClick={openSession} disabled={!gatewayId || code.length < 6 || opening}>
                  {opening ? <Loader2 className="animate-spin" /> : <PlugZap />}
                  Open terminal
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert>
            <SquareTerminal />
            <AlertTitle>This is not a shell</AlertTitle>
            <AlertDescription>
              {grant.commands.length} read-only commands are available. Anything that changes the
              gateway — restarting WireGuard, draining, rotating a key — is a named operation on the
              gateway page, with its own confirmation and audit entry.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2">
            {quickActions.map(command => (
              <Button
                key={command}
                variant="outline"
                size="sm"
                className="font-mono text-2xs"
                disabled={!connected || busy}
                onClick={() => send(command)}>
                {command}
              </Button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setLines([])}>
                <Trash2 /> Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  disconnect()
                  setGrant(null)
                  setLines([])
                }}>
                <Plug /> End session
              </Button>
            </div>
          </div>

          <div className="terminal-surface">
            <div className="flex items-center justify-between border-b px-3 py-2 text-2xs text-muted-foreground">
              <span className="font-mono">
                ubuntu@aurora-{grant.gateway_id}:~ · {grant.gateway_name}
              </span>
              <span>{connected ? 'wss connected' : 'closed'}</span>
            </div>

            <div ref={outputRef} className="h-[420px] overflow-y-auto px-3 py-2">
              {lines.map((line, index) => (
                <div key={index} className="whitespace-pre-wrap break-words">
                  {line.kind === 'command' && (
                    <p className="text-status-operational">
                      <span className="text-muted-foreground">$ </span>
                      {line.text}
                    </p>
                  )}
                  {line.kind === 'output' && <p className="text-foreground/90">{line.text}</p>}
                  {line.kind === 'error' && <p className="text-status-down">{line.text}</p>}
                  {line.kind === 'note' && <p className="text-muted-foreground">{line.text}</p>}
                  {line.meta && <p className="text-2xs text-muted-foreground">{line.meta}</p>}
                </div>
              ))}
              {busy && <p className="text-muted-foreground">…</p>}
            </div>

            <div className="flex items-center gap-2 border-t px-3 py-2">
              <span className="text-muted-foreground">$</span>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={!connected}
                placeholder={connected ? "wg show wg0   (↑ for history, 'help' to list)" : 'Disconnected'}
                aria-label="Terminal command"
                className="flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground/60"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          <p className="text-2xs text-muted-foreground">
            Output is truncated at 64 KB and anything key-shaped is redacted before it reaches this
            page.
          </p>
        </>
      )}

      {!grant && !gateways.loading && (gateways.data?.gateways.length ?? 0) === 0 && (
        <Card>
          <EmptyState
            title="No gateways to connect to"
            body="Register a gateway first; its agent is what executes these commands."
          />
        </Card>
      )}
    </div>
  )
}
