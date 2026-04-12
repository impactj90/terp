'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useEmployeeCompanyCars,
  useCreateEmployeeCompanyCar,
  useDeleteEmployeeCompanyCar,
  useEmployeeJobBikes,
  useCreateEmployeeJobBike,
  useDeleteEmployeeJobBike,
  useEmployeeMealAllowances,
  useCreateEmployeeMealAllowance,
  useDeleteEmployeeMealAllowance,
  useEmployeeVouchers,
  useCreateEmployeeVoucher,
  useDeleteEmployeeVoucher,
  useEmployeeJobTickets,
  useCreateEmployeeJobTicket,
  useDeleteEmployeeJobTicket,
  useEmployeePensions,
  useCreateEmployeePension,
  useDeleteEmployeePension,
  useEmployeeSavings,
  useCreateEmployeeSaving,
  useDeleteEmployeeSaving,
} from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

interface BenefitsTabProps {
  employeeId: string
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '---'
  return format(new Date(value), 'dd.MM.yyyy')
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return '---'
  return `${Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`
}

// ── Company Cars ─────────────────────────────────────────────────

function CompanyCarsSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeCompanyCars(employeeId)
  const createCar = useCreateEmployeeCompanyCar()
  const deleteCar = useDeleteEmployeeCompanyCar()
  const cars = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    listPrice: '', propulsionType: 'combustion', distanceToWorkKm: '',
    usageType: 'privateUse', licensePlate: '', makeModel: '', startDate: '', endDate: '',
  })

  function openCreate() {
    setForm({ listPrice: '', propulsionType: 'combustion', distanceToWorkKm: '', usageType: 'privateUse', licensePlate: '', makeModel: '', startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createCar.mutateAsync({
      employeeId,
      listPrice: parseFloat(form.listPrice) || 0,
      propulsionType: form.propulsionType,
      distanceToWorkKm: parseFloat(form.distanceToWorkKm) || 0,
      usageType: form.usageType,
      licensePlate: form.licensePlate || undefined,
      makeModel: form.makeModel || undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteCar.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('companyCar.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('companyCar.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : cars.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('companyCar.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('companyCar.makeModel')}</th>
                  <th className="pb-2 font-medium">{t('companyCar.licensePlate')}</th>
                  <th className="pb-2 font-medium">{t('companyCar.listPrice')}</th>
                  <th className="pb-2 font-medium">{t('companyCar.propulsionType')}</th>
                  <th className="pb-2 font-medium">{t('companyCar.startDate')}</th>
                  <th className="pb-2 font-medium">{t('companyCar.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {cars.map((car: AnyRecord) => (
                  <tr key={car.id} className="border-b last:border-0">
                    <td className="py-2">{car.makeModel ?? '---'}</td>
                    <td className="py-2">{car.licensePlate ?? '---'}</td>
                    <td className="py-2">{formatCurrency(car.listPrice)}</td>
                    <td className="py-2">
                      {car.propulsionType === 'combustion' ? t('companyCar.combustion')
                        : car.propulsionType === 'hybrid' ? t('companyCar.hybrid')
                        : car.propulsionType === 'electric' ? t('companyCar.electric')
                        : car.propulsionType}
                    </td>
                    <td className="py-2">{formatDate(car.startDate)}</td>
                    <td className="py-2">{formatDate(car.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(car)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('companyCar.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('companyCar.makeModel')}</Label>
                <Input value={form.makeModel} onChange={(e) => setForm({ ...form, makeModel: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.licensePlate')}</Label>
                <Input value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.listPrice')}</Label>
                <Input type="number" step="0.01" value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.propulsionType')}</Label>
                <Select value={form.propulsionType} onValueChange={(val) => setForm({ ...form, propulsionType: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combustion">{t('companyCar.combustion')}</SelectItem>
                    <SelectItem value="hybrid">{t('companyCar.hybrid')}</SelectItem>
                    <SelectItem value="electric">{t('companyCar.electric')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.distanceToWorkKm')}</Label>
                <Input type="number" step="0.1" value={form.distanceToWorkKm} onChange={(e) => setForm({ ...form, distanceToWorkKm: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.usageType')}</Label>
                <Select value={form.usageType} onValueChange={(val) => setForm({ ...form, usageType: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="privateUse">{t('companyCar.privateUse')}</SelectItem>
                    <SelectItem value="commuteOnly">{t('companyCar.commuteOnly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('companyCar.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createCar.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteCar.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Job Bikes ────────────────────────────────────────────────────

function JobBikesSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeJobBikes(employeeId)
  const createBike = useCreateEmployeeJobBike()
  const deleteBike = useDeleteEmployeeJobBike()
  const bikes = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({ listPrice: '', usageType: 'salaryConversion', startDate: '', endDate: '' })

  function openCreate() {
    setForm({ listPrice: '', usageType: 'salaryConversion', startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createBike.mutateAsync({
      employeeId,
      listPrice: parseFloat(form.listPrice) || 0,
      usageType: form.usageType,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteBike.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('jobBike.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('jobBike.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : bikes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('jobBike.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('jobBike.listPrice')}</th>
                  <th className="pb-2 font-medium">{t('jobBike.usageType')}</th>
                  <th className="pb-2 font-medium">{t('jobBike.startDate')}</th>
                  <th className="pb-2 font-medium">{t('jobBike.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {bikes.map((bike: AnyRecord) => (
                  <tr key={bike.id} className="border-b last:border-0">
                    <td className="py-2">{formatCurrency(bike.listPrice)}</td>
                    <td className="py-2">
                      {bike.usageType === 'salaryConversion' ? t('jobBike.salaryConversion') : t('jobBike.additional')}
                    </td>
                    <td className="py-2">{formatDate(bike.startDate)}</td>
                    <td className="py-2">{formatDate(bike.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(bike)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('jobBike.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('jobBike.listPrice')}</Label>
                <Input type="number" step="0.01" value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('jobBike.usageType')}</Label>
                <Select value={form.usageType} onValueChange={(val) => setForm({ ...form, usageType: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salaryConversion">{t('jobBike.salaryConversion')}</SelectItem>
                    <SelectItem value="additional">{t('jobBike.additional')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('jobBike.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('jobBike.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createBike.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteBike.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Meal Allowances ──────────────────────────────────────────────

function MealAllowancesSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeMealAllowances(employeeId)
  const createMeal = useCreateEmployeeMealAllowance()
  const deleteMeal = useDeleteEmployeeMealAllowance()
  const meals = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({ dailyAmount: '', workDaysPerMonth: '', startDate: '', endDate: '' })

  function openCreate() {
    setForm({ dailyAmount: '', workDaysPerMonth: '', startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createMeal.mutateAsync({
      employeeId,
      dailyAmount: parseFloat(form.dailyAmount) || 0,
      workDaysPerMonth: parseInt(form.workDaysPerMonth) || undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteMeal.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('mealAllowance.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('mealAllowance.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : meals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('mealAllowance.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('mealAllowance.dailyAmount')}</th>
                  <th className="pb-2 font-medium">{t('mealAllowance.workDaysPerMonth')}</th>
                  <th className="pb-2 font-medium">{t('mealAllowance.startDate')}</th>
                  <th className="pb-2 font-medium">{t('mealAllowance.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {meals.map((meal: AnyRecord) => (
                  <tr key={meal.id} className="border-b last:border-0">
                    <td className="py-2">{formatCurrency(meal.dailyAmount)}</td>
                    <td className="py-2">{meal.workDaysPerMonth ?? '---'}</td>
                    <td className="py-2">{formatDate(meal.startDate)}</td>
                    <td className="py-2">{formatDate(meal.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(meal)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('mealAllowance.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('mealAllowance.dailyAmount')}</Label>
                <Input type="number" step="0.01" value={form.dailyAmount} onChange={(e) => setForm({ ...form, dailyAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('mealAllowance.workDaysPerMonth')}</Label>
                <Input type="number" value={form.workDaysPerMonth} onChange={(e) => setForm({ ...form, workDaysPerMonth: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('mealAllowance.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('mealAllowance.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createMeal.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteMeal.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Vouchers ─────────────────────────────────────────────────────

function VouchersSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeVouchers(employeeId)
  const createVoucher = useCreateEmployeeVoucher()
  const deleteVoucher = useDeleteEmployeeVoucher()
  const vouchers = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({ monthlyAmount: '', provider: '', startDate: '', endDate: '' })

  function openCreate() {
    setForm({ monthlyAmount: '', provider: '', startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createVoucher.mutateAsync({
      employeeId,
      monthlyAmount: parseFloat(form.monthlyAmount) || 0,
      provider: form.provider || undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteVoucher.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('voucher.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('voucher.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : vouchers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('voucher.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('voucher.monthlyAmount')}</th>
                  <th className="pb-2 font-medium">{t('voucher.provider')}</th>
                  <th className="pb-2 font-medium">{t('voucher.startDate')}</th>
                  <th className="pb-2 font-medium">{t('voucher.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v: AnyRecord) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2">{formatCurrency(v.monthlyAmount)}</td>
                    <td className="py-2">{v.provider ?? '---'}</td>
                    <td className="py-2">{formatDate(v.startDate)}</td>
                    <td className="py-2">{formatDate(v.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(v)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('voucher.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('voucher.monthlyAmount')}</Label>
                <Input type="number" step="0.01" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('voucher.provider')}</Label>
                <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('voucher.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('voucher.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createVoucher.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteVoucher.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Job Tickets ──────────────────────────────────────────────────

function JobTicketsSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeJobTickets(employeeId)
  const createTicket = useCreateEmployeeJobTicket()
  const deleteTicket = useDeleteEmployeeJobTicket()
  const tickets = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({ monthlyAmount: '', provider: '', isAdditional: true, startDate: '', endDate: '' })

  function openCreate() {
    setForm({ monthlyAmount: '', provider: '', isAdditional: true, startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createTicket.mutateAsync({
      employeeId,
      monthlyAmount: parseFloat(form.monthlyAmount) || 0,
      provider: form.provider || undefined,
      isAdditional: form.isAdditional,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteTicket.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('jobTicket.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('jobTicket.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('jobTicket.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('jobTicket.monthlyAmount')}</th>
                  <th className="pb-2 font-medium">{t('jobTicket.provider')}</th>
                  <th className="pb-2 font-medium">{t('jobTicket.isAdditional')}</th>
                  <th className="pb-2 font-medium">{t('jobTicket.startDate')}</th>
                  <th className="pb-2 font-medium">{t('jobTicket.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket: AnyRecord) => (
                  <tr key={ticket.id} className="border-b last:border-0">
                    <td className="py-2">{formatCurrency(ticket.monthlyAmount)}</td>
                    <td className="py-2">{ticket.provider ?? '---'}</td>
                    <td className="py-2">
                      <Badge variant={ticket.isAdditional ? 'default' : 'secondary'}>
                        {ticket.isAdditional ? 'Ja' : 'Nein'}
                      </Badge>
                    </td>
                    <td className="py-2">{formatDate(ticket.startDate)}</td>
                    <td className="py-2">{formatDate(ticket.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(ticket)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('jobTicket.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('jobTicket.monthlyAmount')}</Label>
                <Input type="number" step="0.01" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('jobTicket.provider')}</Label>
                <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="jt-isAdditional" checked={form.isAdditional} onCheckedChange={(v) => setForm({ ...form, isAdditional: !!v })} />
                <Label htmlFor="jt-isAdditional">{t('jobTicket.isAdditional')}</Label>
              </div>
              <div className="space-y-2">
                <Label>{t('jobTicket.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('jobTicket.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createTicket.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteTicket.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Pensions ─────────────────────────────────────────────────────

function PensionsSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeePensions(employeeId)
  const createPension = useCreateEmployeePension()
  const deletePension = useDeleteEmployeePension()
  const pensions = data ?? []

  const executionTypeLabels: Record<string, string> = {
    directInsurance: t('pension.directInsurance'),
    pensionFund: t('pension.pensionFund'),
    pensionScheme: t('pension.pensionScheme'),
    directCommitment: t('pension.directCommitment'),
    supportFund: t('pension.supportFund'),
  }

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    executionType: 'directInsurance', providerName: '', contractNumber: '',
    employeeContribution: '', employerContribution: '', startDate: '', endDate: '',
  })

  function openCreate() {
    setForm({ executionType: 'directInsurance', providerName: '', contractNumber: '', employeeContribution: '', employerContribution: '', startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createPension.mutateAsync({
      employeeId,
      executionType: form.executionType,
      providerName: form.providerName,
      contractNumber: form.contractNumber || undefined,
      employeeContribution: parseFloat(form.employeeContribution) || 0,
      employerContribution: parseFloat(form.employerContribution) || 0,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deletePension.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('pension.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('pension.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : pensions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('pension.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('pension.executionType')}</th>
                  <th className="pb-2 font-medium">{t('pension.providerName')}</th>
                  <th className="pb-2 font-medium">{t('pension.employeeContribution')}</th>
                  <th className="pb-2 font-medium">{t('pension.employerContribution')}</th>
                  <th className="pb-2 font-medium">{t('pension.startDate')}</th>
                  <th className="pb-2 font-medium">{t('pension.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {pensions.map((p: AnyRecord) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{executionTypeLabels[p.executionType] ?? p.executionType}</td>
                    <td className="py-2">{p.providerName ?? '---'}</td>
                    <td className="py-2">{formatCurrency(p.employeeContribution)}</td>
                    <td className="py-2">{formatCurrency(p.employerContribution)}</td>
                    <td className="py-2">{formatDate(p.startDate)}</td>
                    <td className="py-2">{formatDate(p.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('pension.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('pension.executionType')}</Label>
                <Select value={form.executionType} onValueChange={(val) => setForm({ ...form, executionType: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(executionTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('pension.providerName')}</Label>
                <Input value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('pension.contractNumber')}</Label>
                <Input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('pension.employeeContribution')}</Label>
                <Input type="number" step="0.01" value={form.employeeContribution} onChange={(e) => setForm({ ...form, employeeContribution: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('pension.employerContribution')}</Label>
                <Input type="number" step="0.01" value={form.employerContribution} onChange={(e) => setForm({ ...form, employerContribution: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('pension.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('pension.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createPension.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deletePension.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Savings (VL) ─────────────────────────────────────────────────

function SavingsSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeSavings(employeeId)
  const createSaving = useCreateEmployeeSaving()
  const deleteSaving = useDeleteEmployeeSaving()
  const savings = data ?? []

  const investmentTypeLabels: Record<string, string> = {
    buildingSavings: t('savings.buildingSavings'),
    fundSavings: t('savings.fundSavings'),
    bankSavings: t('savings.bankSavings'),
  }

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    investmentType: 'buildingSavings', recipient: '', recipientIban: '',
    contractNumber: '', monthlyAmount: '', employerShare: '', employeeShare: '',
    startDate: '', endDate: '',
  })

  function openCreate() {
    setForm({ investmentType: 'buildingSavings', recipient: '', recipientIban: '', contractNumber: '', monthlyAmount: '', employerShare: '', employeeShare: '', startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createSaving.mutateAsync({
      employeeId,
      investmentType: form.investmentType,
      recipient: form.recipient,
      recipientIban: form.recipientIban || undefined,
      contractNumber: form.contractNumber || undefined,
      monthlyAmount: parseFloat(form.monthlyAmount) || 0,
      employerShare: parseFloat(form.employerShare) || 0,
      employeeShare: parseFloat(form.employeeShare) || 0,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteSaving.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('savings.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('savings.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : savings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('savings.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('savings.investmentType')}</th>
                  <th className="pb-2 font-medium">{t('savings.recipient')}</th>
                  <th className="pb-2 font-medium">{t('savings.monthlyAmount')}</th>
                  <th className="pb-2 font-medium">{t('savings.employerShare')}</th>
                  <th className="pb-2 font-medium">{t('savings.startDate')}</th>
                  <th className="pb-2 font-medium">{t('savings.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {savings.map((s: AnyRecord) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2">{investmentTypeLabels[s.investmentType] ?? s.investmentType}</td>
                    <td className="py-2">{s.recipient ?? '---'}</td>
                    <td className="py-2">{formatCurrency(s.monthlyAmount)}</td>
                    <td className="py-2">{formatCurrency(s.employerShare)}</td>
                    <td className="py-2">{formatDate(s.startDate)}</td>
                    <td className="py-2">{formatDate(s.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>{t('savings.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('savings.investmentType')}</Label>
                <Select value={form.investmentType} onValueChange={(val) => setForm({ ...form, investmentType: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(investmentTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('savings.recipient')}</Label>
                <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.recipientIban')}</Label>
                <Input value={form.recipientIban} onChange={(e) => setForm({ ...form, recipientIban: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.contractNumber')}</Label>
                <Input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.monthlyAmount')}</Label>
                <Input type="number" step="0.01" value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.employerShare')}</Label>
                <Input type="number" step="0.01" value={form.employerShare} onChange={(e) => setForm({ ...form, employerShare: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.employeeShare')}</Label>
                <Input type="number" step="0.01" value={form.employeeShare} onChange={(e) => setForm({ ...form, employeeShare: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('savings.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createSaving.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteSaving.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Main Benefits Tab ────────────────────────────────────────────

export function BenefitsTab({ employeeId }: BenefitsTabProps) {
  return (
    <div className="space-y-6">
      <CompanyCarsSection employeeId={employeeId} />
      <JobBikesSection employeeId={employeeId} />
      <MealAllowancesSection employeeId={employeeId} />
      <VouchersSection employeeId={employeeId} />
      <JobTicketsSection employeeId={employeeId} />
      <PensionsSection employeeId={employeeId} />
      <SavingsSection employeeId={employeeId} />
    </div>
  )
}
