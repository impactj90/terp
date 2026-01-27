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
import { formatMinutes } from '@/lib/time-utils'

// Month names for display
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface MonthlyValueData {
  id: string
  month?: number | null
  net_minutes?: number | null
  target_minutes?: number | null
  balance_minutes?: number | null
  working_days?: number | null
  worked_days?: number | null
  status?: string | null
}

interface YearExportButtonsProps {
  year: number
  employeeName?: string
  monthlyValues: MonthlyValueData[]
}

function downloadFile(content: string, filename: string, mimeType: string) {
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

function calculateTotals(monthlyValues: MonthlyValueData[]) {
  return monthlyValues.reduce(
    (acc, mv) => ({
      targetMinutes: acc.targetMinutes + (mv.target_minutes ?? 0),
      netMinutes: acc.netMinutes + (mv.net_minutes ?? 0),
      balanceMinutes: acc.balanceMinutes + (mv.balance_minutes ?? 0),
      workingDays: acc.workingDays + (mv.working_days ?? 0),
      workedDays: acc.workedDays + (mv.worked_days ?? 0),
    }),
    {
      targetMinutes: 0,
      netMinutes: 0,
      balanceMinutes: 0,
      workingDays: 0,
      workedDays: 0,
    }
  )
}

export function YearExportButtons({
  year,
  employeeName,
  monthlyValues,
}: YearExportButtonsProps) {
  const [isExporting, setIsExporting] = useState(false)

  const monthDataMap = new Map(monthlyValues.map((mv) => [mv.month, mv]))

  const generateCSV = () => {
    const headers = [
      'Month',
      'Working Days',
      'Worked Days',
      'Target Hours',
      'Worked Hours',
      'Balance',
      'Status',
    ]

    const rows = MONTH_NAMES.map((monthName, index) => {
      const mv = monthDataMap.get(index + 1)
      return [
        monthName,
        mv?.working_days ?? 0,
        mv?.worked_days ?? 0,
        formatMinutes(mv?.target_minutes ?? 0),
        formatMinutes(mv?.net_minutes ?? 0),
        formatMinutes(mv?.balance_minutes ?? 0),
        mv?.status ?? 'No data',
      ].join(',')
    })

    // Add totals row
    const totals = calculateTotals(monthlyValues)
    rows.push(
      [
        'TOTAL',
        totals.workingDays,
        totals.workedDays,
        formatMinutes(totals.targetMinutes),
        formatMinutes(totals.netMinutes),
        formatMinutes(totals.balanceMinutes),
        '',
      ].join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    downloadFile(csv, `year-overview-${year}.csv`, 'text/csv')
  }

  const generatePDF = () => {
    const totals = calculateTotals(monthlyValues)

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Year Overview ${year}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
          th { background: #f5f5f5; text-align: left; }
          td:first-child { text-align: left; }
          .footer-row { font-weight: bold; background: #f9f9f9; }
          .status-open { color: #666; }
          .status-calculated { color: #0066cc; }
          .status-closed { color: #228b22; }
          .status-exported { color: #0066cc; }
          .no-data { color: #999; font-style: italic; }
          .positive { color: #228b22; }
          .negative { color: #cc0000; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <h1>Year Overview: ${year}</h1>
        ${employeeName ? `<div class="subtitle">Employee: ${employeeName}</div>` : ''}
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Working Days</th>
              <th>Worked Days</th>
              <th>Target</th>
              <th>Worked</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${MONTH_NAMES.map((monthName, index) => {
              const mv = monthDataMap.get(index + 1)
              const balance = mv?.balance_minutes ?? 0
              const balanceClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : ''
              const statusClass = mv?.status ? `status-${mv.status}` : 'no-data'

              return `
                <tr${!mv ? ' class="no-data"' : ''}>
                  <td>${monthName}</td>
                  <td>${mv ? mv.working_days ?? 0 : '-'}</td>
                  <td>${mv ? mv.worked_days ?? 0 : '-'}</td>
                  <td>${mv ? formatMinutes(mv.target_minutes ?? 0) : '-'}</td>
                  <td>${mv ? formatMinutes(mv.net_minutes ?? 0) : '-'}</td>
                  <td class="${balanceClass}">${mv ? formatMinutes(balance) : '-'}</td>
                  <td class="${statusClass}">${mv?.status ?? 'No data'}</td>
                </tr>
              `
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="footer-row">
              <td>Total</td>
              <td>${totals.workingDays}</td>
              <td>${totals.workedDays}</td>
              <td>${formatMinutes(totals.targetMinutes)}</td>
              <td>${formatMinutes(totals.netMinutes)}</td>
              <td class="${totals.balanceMinutes >= 0 ? 'positive' : 'negative'}">${formatMinutes(totals.balanceMinutes)}</td>
              <td></td>
            </tr>
          </tfoot>
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
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting || monthlyValues.length === 0}
        >
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
