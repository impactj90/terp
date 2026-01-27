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
  formatMinutes,
  formatDisplayDate,
  getMonthDates,
} from '@/lib/time-utils'
import type { MonthSummary, DailyValue } from '@/hooks/api'

interface MonthlyExportButtonsProps {
  monthlyValue?: MonthSummary | null
  dailyValues: DailyValue[]
  year: number
  month: number
  employeeName?: string
}

export function MonthlyExportButtons({
  monthlyValue,
  dailyValues,
  year,
  month,
  employeeName,
}: MonthlyExportButtonsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const monthDates = getMonthDates(new Date(year, month - 1, 1))
  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  // Create lookup map
  const dailyValuesByDate = new Map<string, DailyValue>()
  for (const dv of dailyValues) {
    dailyValuesByDate.set(dv.value_date, dv)
  }

  // Helper to compute balance from overtime/undertime
  const getBalance = (dv: DailyValue | undefined) => {
    if (!dv) return 0
    return (dv.overtime ?? 0) - (dv.undertime ?? 0)
  }

  const generateCSV = () => {
    const headers = ['Date', 'Day', 'Target', 'Gross', 'Breaks', 'Net', 'Balance', 'Errors']

    const rows = monthDates.map((date) => {
      const dateString = formatDate(date)
      const dv = dailyValuesByDate.get(dateString)
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })

      return [
        formatDisplayDate(date, 'short'),
        dayName,
        formatMinutes(dv?.target_time ?? 0),
        formatMinutes(dv?.gross_time ?? 0),
        formatMinutes(dv?.break_time ?? 0),
        formatMinutes(dv?.net_time ?? 0),
        formatMinutes(getBalance(dv)),
        dv?.has_error ? 'Yes' : '',
      ].join(',')
    })

    // Add summary row
    if (monthlyValue) {
      const totalBalance = monthlyValue.total_overtime - monthlyValue.total_undertime
      rows.push('')
      rows.push('Summary')
      rows.push(`Total Target,${formatMinutes(monthlyValue.total_target_time)}`)
      rows.push(`Total Net,${formatMinutes(monthlyValue.total_net_time)}`)
      rows.push(`Balance,${formatMinutes(totalBalance)}`)
      rows.push(`Work Days,${monthlyValue.work_days}`)
      rows.push(`Vacation,${monthlyValue.vacation_taken}`)
      rows.push(`Sick Days,${monthlyValue.sick_days}`)
      rows.push(`Status,${monthlyValue.is_closed ? 'closed' : 'open'}`)
    }

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(
      csv,
      `monthly-evaluation-${year}-${String(month).padStart(2, '0')}.csv`,
      'text/csv'
    )
  }

  const generatePDF = () => {
    const totalBalance = monthlyValue ? monthlyValue.total_overtime - monthlyValue.total_undertime : 0

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Monthly Evaluation - ${monthLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .subtitle { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; }
          th { background: #f5f5f5; text-align: left; font-weight: 600; }
          td { text-align: right; }
          td:first-child, td:nth-child(2) { text-align: left; }
          .weekend { background: #f9f9f9; color: #888; }
          .error { background: #fff0f0; }
          .summary { margin-top: 20px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .summary-item { padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .summary-label { font-size: 10px; color: #666; }
          .summary-value { font-size: 16px; font-weight: 600; }
          .footer { margin-top: 20px; font-size: 10px; color: #666; }
        </style>
      </head>
      <body>
        <h1>Monthly Evaluation: ${monthLabel}</h1>
        ${employeeName ? `<div class="subtitle">Employee: ${employeeName}</div>` : ''}

        ${monthlyValue ? `
        <div class="summary">
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Target Time</div>
              <div class="summary-value">${formatMinutes(monthlyValue.total_target_time)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Net Time</div>
              <div class="summary-value">${formatMinutes(monthlyValue.total_net_time)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Balance</div>
              <div class="summary-value">${formatMinutes(totalBalance)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Status</div>
              <div class="summary-value">${monthlyValue.is_closed ? 'Closed' : 'Open'}</div>
            </div>
          </div>
        </div>
        ` : ''}

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Target</th>
              <th>Gross</th>
              <th>Breaks</th>
              <th>Net</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${monthDates.map((date) => {
              const dateString = formatDate(date)
              const dv = dailyValuesByDate.get(dateString)
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              const hasError = dv?.has_error

              return `
                <tr class="${isWeekend ? 'weekend' : ''} ${hasError ? 'error' : ''}">
                  <td>${formatDisplayDate(date, 'short')}</td>
                  <td>${dayName}</td>
                  <td>${formatMinutes(dv?.target_time ?? 0)}</td>
                  <td>${formatMinutes(dv?.gross_time ?? 0)}</td>
                  <td>${formatMinutes(dv?.break_time ?? 0)}</td>
                  <td>${formatMinutes(dv?.net_time ?? 0)}</td>
                  <td>${formatMinutes(getBalance(dv))}</td>
                  <td style="text-align: left">${hasError ? 'Error' : dv ? 'OK' : ''}</td>
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
        generatePDF()
      }
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting || dailyValues.length === 0}>
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
