'use client'

import {useState} from 'react'
import {AlertTriangle, Loader2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {ApiError, api} from '@/lib/api'

/**
 * Confirmation for work that cannot be undone.
 *
 * Four gates, and each one is there for a different failure:
 *   - a **typed phrase** defeats muscle memory and the wrong-tab mistake
 *   - a **written reason** makes the audit entry worth reading later
 *   - a **fresh MFA code** means a stolen session cannot drain a gateway
 *   - the server re-checks all three, because a dialog is not a control
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmation,
  actionLabel = 'Confirm',
  requireReason = true,
  requireMfa = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmation?: string
  actionLabel?: string
  requireReason?: boolean
  requireMfa?: boolean
  onConfirm: (input: {reason: string; stepUpToken?: string}) => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phraseOk = !confirmation || typed.trim().toUpperCase() === confirmation.toUpperCase()
  const reasonOk = !requireReason || reason.trim().length >= 5
  const codeOk = !requireMfa || code.trim().length >= 6

  const reset = () => {
    setTyped('')
    setReason('')
    setCode('')
    setError(null)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      let stepUpToken: string | undefined
      if (requireMfa) {
        const proof = await api<{step_up_token: string}>('/auth/mfa/step-up', {
          method: 'POST',
          body: {code: code.trim()},
        })
        stepUpToken = proof.step_up_token
      }
      await onConfirm({reason: reason.trim(), stepUpToken})
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-degraded" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {confirmation && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-phrase">
                Type <span className="font-mono text-foreground">{confirmation}</span> to continue
              </Label>
              <Input
                id="confirm-phrase"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                className="font-mono"
                autoComplete="off"
              />
            </div>
          )}

          {requireReason && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-reason">Reason (recorded in the audit log)</Label>
              <Input
                id="confirm-reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Scheduled maintenance window"
              />
            </div>
          )}

          {requireMfa && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-mfa">Authenticator code</Label>
              <Input
                id="confirm-mfa"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                className="font-mono tracking-widest"
                autoComplete="one-time-code"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy || !phraseOk || !reasonOk || !codeOk}>
            {busy && <Loader2 className="animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
