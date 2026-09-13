import type {Metadata} from 'next'
import './globals.css'
import {AppShell} from '@/components/layout/shell'

export const metadata: Metadata = {
  title: 'Aurora — VPN Infrastructure',
  description: 'Operations console for the Aurora VPN control plane',
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  // Dark by default: this console is read in a NOC and at 3am.
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
