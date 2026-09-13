'use client'

import {useState} from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {useIdentity} from '@/components/layout/identity'
import {consumerApi} from '@/lib/api'

export default function AccountPage() {
  const {user, signOut} = useIdentity()
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleting(true)
    setError(null)
    try {
      await consumerApi.deleteAccount(deletePassword || undefined)
      signOut()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete account.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/portal" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account &amp; Security</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your credentials, privacy settings, and active subscription.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Account Info Card */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                <User className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Profile Overview</CardTitle>
                <CardDescription className="text-xs">Your Aurora VPN subscriber details</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary uppercase">
              {user?.plan || 'Free'} Plan
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-2">
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider font-semibold">
                Email Address
              </span>
              <p className="font-mono font-medium text-foreground">{user?.email}</p>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider font-semibold">
                Account ID
              </span>
              <p className="font-mono font-medium text-foreground truncate">{user?.id}</p>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider font-semibold">
                Daily Free Allowance
              </span>
              <p className="font-mono font-medium text-foreground">3 Hours (10,800 seconds)</p>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
              <span className="text-3xs text-muted-foreground uppercase tracking-wider font-semibold">
                Member Since
              </span>
              <p className="font-mono font-medium text-foreground">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Today'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Official WireGuard Apps */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-status-operational/10 text-status-operational flex items-center justify-center border border-status-operational/20">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Official WireGuard Clients</CardTitle>
              <CardDescription className="text-xs">
                Import your downloaded Aurora .conf file into any official client:
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <a
              href="https://www.wireguard.com/install/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
              <span>Windows</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
            <a
              href="https://www.wireguard.com/install/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
              <span>macOS</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
            <a
              href="https://www.wireguard.com/install/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
              <span>Android</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
            <a
              href="https://www.wireguard.com/install/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
              <span>iOS</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Guarantee */}
      <Card className="border-border/70 border-status-operational/20 bg-status-operational/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-status-operational" />
            <CardTitle className="text-base font-semibold">Strict Zero-Logs Policy</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Aurora never records user IP destinations, browsing history, DNS queries, or session payload contents.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-operational shrink-0 mt-0.5" />
            <span>Ephemeral WireGuard Peers: Peer records exist only during an active session and are wiped upon disconnect.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-operational shrink-0 mt-0.5" />
            <span>Unbound DNS without query logging configured on every gateway node.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-operational shrink-0 mt-0.5" />
            <span>Tamper-evident SHA-256 cryptographic audit logs ensuring operational transparency.</span>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone: Account Deletion */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <CardTitle className="text-base font-semibold">Danger Zone</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Permanently delete your account, revoke all WireGuard peers, and wipe all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
            className="text-xs gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Delete My Account
          </Button>
        </CardContent>
      </Card>

      {/* Account Deletion Confirmation Dialog */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Confirm Account Deletion
            </DialogTitle>
            <DialogDescription className="text-xs">
              This action is permanent and irreversible. All registered devices, active WireGuard peers, and quota records will be immediately destroyed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDeleteAccount} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="del-password" className="text-xs">Enter your password to confirm</Label>
              <Input
                id="del-password"
                type="password"
                placeholder="••••••••"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteModalOpen(false)}
                className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={deleting}
                className="text-xs gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
