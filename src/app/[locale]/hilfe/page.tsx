import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import { HilfePage } from '@/components/hilfe/hilfe-page'

export const metadata: Metadata = {
  title: 'Terp — Hilfe',
  description: 'Terp Benutzerhandbuch',
}

export default function HilfeRoute() {
  const filePath = path.join(process.cwd(), 'docs', 'TERP_HANDBUCH.md')
  const content = fs.readFileSync(filePath, 'utf-8')

  return <HilfePage content={content} />
}
