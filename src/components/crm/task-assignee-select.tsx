'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { X, Users, User, Search } from 'lucide-react'
import { useEmployees, useTeams } from '@/hooks'

export interface AssigneeItem {
  employeeId?: string
  teamId?: string
  label: string
}

interface TaskAssigneeSelectProps {
  value: AssigneeItem[]
  onChange: (value: AssigneeItem[]) => void
  disabled?: boolean
}

export function TaskAssigneeSelect({ value, onChange, disabled }: TaskAssigneeSelectProps) {
  const t = useTranslations('crmTasks')
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const { data: employeeData } = useEmployees({ pageSize: 100, isActive: true, enabled: open })
  const { data: teamData } = useTeams({ pageSize: 100, isActive: true, enabled: open })

  const employees = (employeeData?.items ?? []) as Array<{ id: string; firstName: string; lastName: string }>
  const teams = (teamData?.items ?? []) as Array<{ id: string; name: string }>

  const filteredEmployees = search
    ? employees.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase())
      )
    : employees

  const filteredTeams = search
    ? teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : teams

  const isSelected = (item: { employeeId?: string; teamId?: string }) => {
    return value.some(
      (v) =>
        (item.employeeId && v.employeeId === item.employeeId) ||
        (item.teamId && v.teamId === item.teamId)
    )
  }

  const toggleItem = (item: AssigneeItem) => {
    const exists = value.some(
      (v) =>
        (item.employeeId && v.employeeId === item.employeeId) ||
        (item.teamId && v.teamId === item.teamId)
    )

    if (exists) {
      onChange(
        value.filter(
          (v) =>
            !(item.employeeId && v.employeeId === item.employeeId) &&
            !(item.teamId && v.teamId === item.teamId)
        )
      )
    } else {
      onChange([...value, item])
    }
  }

  const removeItem = (item: AssigneeItem) => {
    onChange(
      value.filter(
        (v) =>
          !(item.employeeId && v.employeeId === item.employeeId) &&
          !(item.teamId && v.teamId === item.teamId)
      )
    )
  }

  return (
    <div className="space-y-2">
      {/* Selected items */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((item, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 pr-1">
              {item.teamId ? (
                <Users className="h-3 w-3" />
              ) : (
                <User className="h-3 w-3" />
              )}
              {item.label}
              {!disabled && (
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-muted p-0.5"
                  onClick={() => removeItem(item)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className="w-full justify-start text-left font-normal"
            disabled={disabled}
          >
            {value.length === 0
              ? t('selectAssignees')
              : `${value.length} ${t('assignees').toLowerCase()}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {/* Employees */}
            {filteredEmployees.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {t('employees')}
                </div>
                {filteredEmployees.map((emp) => {
                  const label = `${emp.firstName} ${emp.lastName}`
                  const selected = isSelected({ employeeId: emp.id })
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer ${
                        selected ? 'bg-accent' : ''
                      }`}
                      onClick={() =>
                        toggleItem({ employeeId: emp.id, label })
                      }
                    >
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {label}
                      {selected && (
                        <span className="ml-auto text-primary text-xs">&#10003;</span>
                      )}
                    </button>
                  )
                })}
              </>
            )}
            {/* Teams */}
            {filteredTeams.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground mt-1">
                  {t('teams')}
                </div>
                {filteredTeams.map((team) => {
                  const selected = isSelected({ teamId: team.id })
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer ${
                        selected ? 'bg-accent' : ''
                      }`}
                      onClick={() =>
                        toggleItem({ teamId: team.id, label: team.name })
                      }
                    >
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {team.name}
                      {selected && (
                        <span className="ml-auto text-primary text-xs">&#10003;</span>
                      )}
                    </button>
                  )
                })}
              </>
            )}
            {filteredEmployees.length === 0 && filteredTeams.length === 0 && (
              <div className="px-2 py-4 text-sm text-center text-muted-foreground">
                {t('noEntries')}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
