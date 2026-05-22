import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ASO Audit Agent',
  description: 'AI-powered App Store Optimization audits',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  )
}
