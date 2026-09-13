'use client'

import {useState} from 'react'
import {useRouter} from 'next/navigation'
import {CheckCircle2, Clock, Globe2, Loader2, ShieldCheck} from 'lucide-react'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {ApiError, UserAccount, api, session} from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const tokens = await api<{access_token: string; refresh_token: string}>('/auth/login', {
        method: 'POST',
        body: {email, password},
      })
      session.set(tokens.access_token, tokens.refresh_token)

      // Fetch user profile to route appropriately
      const user = await api<UserAccount>('/auth/me')
      if (user.is_admin) {
        router.replace('/')
      } else {
        router.replace('/portal')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const tokens = await api<{access_token: string; refresh_token: string}>('/auth/register', {
        method: 'POST',
        body: {email, password},
      })
      session.set(tokens.access_token, tokens.refresh_token)
      setSuccess('Account created! Welcome to Aurora VPN.')
      setTimeout(() => {
        router.replace('/portal')
      }, 500)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create account.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-sm mb-3">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Aurora VPN</h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          High-performance, zero-logs WireGuard VPN with 3 hours of free daily protected browsing.
        </p>
      </div>

      <Card className="w-full max-w-md border-border/70 shadow-lg">
        <Tabs value={tab} onValueChange={v => { setTab(v as 'signin' | 'signup'); setError(null); }} className="w-full">
          <CardHeader className="pb-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-4 border-status-operational/40 bg-status-operational/10 text-status-operational">
                <AlertDescription className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {success}
                </AlertDescription>
              </Alert>
            )}

            <TabsContent value="signin" className="m-0 space-y-4">
              <CardDescription className="text-xs">
                Sign in to your Aurora account or administrator operations console.
              </CardDescription>

              <form onSubmit={handleSignIn} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="m-0 space-y-4">
              <CardDescription className="text-xs">
                Create a free account. No credit card required.
              </CardDescription>

              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get Started Free'}
                </Button>
              </form>
            </TabsContent>

            {/* Consumer Features Highlight */}
            <div className="mt-5 border-t border-border/40 pt-4">
              <div className="grid grid-cols-2 gap-2 text-2xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>3h free time daily</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-primary" />
                  <span>Global WireGuard fleet</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-status-operational" />
                  <span>Verified zero-logs</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-operational" />
                  <span>Instant .conf generator</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
