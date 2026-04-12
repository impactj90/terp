"use client"

/**
 * Platform users — admin of platform operators.
 *
 * Lists operators, creates new ones, toggles `isActive`, resets MFA, and
 * deletes. Server-side invariants (cannot delete self, cannot delete last
 * active) are re-asserted by the UI so the error surface stays obvious.
 */
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, ShieldAlert, Trash2, KeyRound } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

export default function PlatformUsersPage() {
  const trpc = usePlatformTRPC()
  const queryClient = useQueryClient()

  const listQuery = useQuery(trpc.platformUsers.list.queryOptions())
  const meQuery = useQuery(trpc.auth.me.queryOptions())

  const [createOpen, setCreateOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newDisplayName, setNewDisplayName] = useState("")
  const [newPassword, setNewPassword] = useState("")

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.platformUsers.list.queryKey(),
    })

  const createMut = useMutation({
    ...trpc.platformUsers.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Operator angelegt")
      setCreateOpen(false)
      setNewEmail("")
      setNewDisplayName("")
      setNewPassword("")
      invalidate()
    },
    onError: (err) => toast.error(err.message ?? "Anlegen fehlgeschlagen"),
  })

  const setActiveMut = useMutation({
    ...trpc.platformUsers.setActive.mutationOptions(),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err.message ?? "Statusänderung fehlgeschlagen"),
  })

  const resetMfaMut = useMutation({
    ...trpc.platformUsers.resetMfa.mutationOptions(),
    onSuccess: () => {
      toast.success("MFA zurückgesetzt")
      invalidate()
    },
    onError: (err) => toast.error(err.message ?? "MFA-Reset fehlgeschlagen"),
  })

  const deleteMut = useMutation({
    ...trpc.platformUsers.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Operator gelöscht")
      invalidate()
    },
    onError: (err) => toast.error(err.message ?? "Löschen fehlgeschlagen"),
  })

  const meId = meQuery.data?.id
  const activeCount =
    listQuery.data?.filter((u) => u.isActive).length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform-Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plattform-Operatoren mit Zugriff auf die Admin-Konsole.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" />
          Operator anlegen
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operatoren</CardTitle>
          <CardDescription>
            Ein aktiver Operator muss jederzeit vorhanden sein.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Zuletzt angemeldet</TableHead>
                  <TableHead>Aktiv</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.data!.map((u) => {
                  const isSelf = u.id === meId
                  const isLastActive = activeCount <= 1 && u.isActive
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.displayName}
                        {isSelf && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Sie
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        {u.mfaEnrolledAt ? (
                          <Badge variant="secondary">Aktiviert</Badge>
                        ) : (
                          <Badge variant="outline">Nicht eingerichtet</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(u.lastLoginAt)}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.isActive}
                          disabled={
                            (isSelf && u.isActive) ||
                            (isLastActive && u.isActive) ||
                            setActiveMut.isPending
                          }
                          onCheckedChange={(v) =>
                            setActiveMut.mutate({
                              id: u.id,
                              isActive: v,
                            })
                          }
                          aria-label="Aktiv"
                        />
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resetMfaMut.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `MFA für ${u.displayName} zurücksetzen?`
                              )
                            ) {
                              resetMfaMut.mutate({ id: u.id })
                            }
                          }}
                        >
                          <KeyRound className="mr-1 size-3" />
                          MFA Reset
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSelf || isLastActive || deleteMut.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Operator ${u.displayName} endgültig löschen?`
                              )
                            ) {
                              deleteMut.mutate({ id: u.id })
                            }
                          }}
                        >
                          <Trash2 className="mr-1 size-3" />
                          Löschen
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {activeCount <= 1 && !listQuery.isLoading && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Es gibt nur einen aktiven Operator. Legen Sie einen weiteren
                an, bevor Sie Änderungen vornehmen.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Operator anlegen</DialogTitle>
            <DialogDescription>
              Neuer Plattform-Operator. Die MFA-Einrichtung erfolgt beim
              ersten Login.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              createMut.mutate({
                email: newEmail.trim(),
                displayName: newDisplayName.trim(),
                password: newPassword,
              })
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="new-email">
                E-Mail
              </label>
              <Input
                id="new-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="new-name">
                Anzeigename
              </label>
              <Input
                id="new-name"
                required
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="new-password">
                Initial-Passwort (min. 12 Zeichen)
              </label>
              <Input
                id="new-password"
                type="password"
                minLength={12}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                Anlegen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
