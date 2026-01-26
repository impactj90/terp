'use client'

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  formatDate,
  formatDisplayDate,
  formatMinutes,
} from '@/lib/time-utils'

interface ExportButtonsProps {
  viewMode: 'day' | 'week' | 'month'
  periodStart: Date
  periodEnd: Date
  employeeId?: string
  employeeName?: string
  data?: {
    dates: Date[]
    dailyValues: Map<string, {
      target_minutes?: number | null
      gross_minutes?: number | null
      break_minutes?: number | null
      net_minutes?: number | null
      balance_minutes?: number | null
    }>
  }
}

export function ExportButtons({
  viewMode,
  periodStart,
  periodEnd,
  employeeName,
  data,
}: ExportButtonsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const generateCSV = () => {
    if (!data) return

    const headers = ['Date', 'Target', 'Gross', 'Breaks', 'Net', 'Balance']
    const rows = data.dates.map((date) => {
      const dateString = formatDate(date)
      const dv = data.dailyValues.get(dateString)
      return [
        formatDisplayDate(date, 'short'),
        formatMinutes(dv?.target_minutes ?? 0),
        formatMinutes(dv?.gross_minutes ?? 0),
        formatMinutes(dv?.break_minutes ?? 0),
        formatMinutes(dv?.net_minutes ?? 0),
        formatMinutes(dv?.balance_minutes ?? 0),
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(csv, `timesheet-${formatDate(periodStart)}.csv`, 'text/csv')
  }

  const generatePDF = async () => {
    // For now, generate a simple HTML-based printable view
    // In production, you might want to use a PDF library like jsPDF or server-side generation
    if (!data) return

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Timesheet Export</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f5f5f5; text-align: left; }
          td:first-child { text-align: left; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <h1>Timesheet: ${formatDisplayDate(periodStart, 'short')} - ${formatDisplayDate(periodEnd, 'short')}</h1>
        ${employeeName ? `<p>Employee: ${employeeName}</p>` : ''}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Target</th>
              <th>Gross</th>
              <th>Breaks</th>
              <th>Net</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${data.dates.map((date) => {
              const dateString = formatDate(date)
              const dv = data.dailyValues.get(dateString)
              return `
                <tr>
                  <td>${formatDisplayDate(date, 'short')}</td>
                  <td>${formatMinutes(dv?.target_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.gross_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.break_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.net_minutes ?? 0)}</td>
                  <td>${formatMinutes(dv?.balance_minutes ?? 0)}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
        <div class="footer">
          Generated: ${new Date().toLocaleString('de-DE')}
        </div>
      </body>
      </html>
    `

    // Open print dialog
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExport = async (format: 'csv' | 'pdf') => {
    setIsExporting(true)
    try {
      if (format === 'csv') {
        generateCSV()
      } else {
        await generatePDF()
      }
    } finally {
      setIsExporting(false)
    }
  }

  // Don't show export for day view
  if (viewMode === 'day') {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting || !data}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')}>
          <FileText className="h-4 w-4 mr-2" />
          Print / PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
