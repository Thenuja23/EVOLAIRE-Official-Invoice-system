import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Form'
import { Menu } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/Modal'
import { CustomerDialog } from '@/components/customers/CustomerDialog'
import { useCustomers } from '@/hooks/useCustomers'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDeleteCustomer } from '@/hooks/useMutations'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, initials } from '@/lib/format'
import type { Customer } from '@/types/models'

export function CustomersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const customers = useCustomers(debouncedSearch)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const deleteCustomer = useDeleteCustomer()

  useEffect(() => {
    setEditing(null)
  }, [debouncedSearch])

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (customer: Customer) => {
    setEditing(customer)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteCustomer.mutateAsync(deleteTarget.id)
      toast.success(`${deleteTarget.name} moved to the trash`)
      setDeleteTarget(null)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const menuItems = (customer: Customer) => [
    {
      label: 'View customer',
      icon: <Eye className="h-4 w-4" />,
      onSelect: () => navigate(`/customers/${customer.id}`),
    },
    {
      label: 'Edit',
      icon: <Pencil className="h-4 w-4" />,
      onSelect: () => openEdit(customer),
    },
    {
      label: 'Move to trash',
      icon: <Trash2 className="h-4 w-4" />,
      tone: 'danger' as const,
      separatorBefore: true,
      onSelect: () => setDeleteTarget(customer),
    },
  ]

  const rows = customers.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="The people and businesses you invoice. Their history stays linked to every invoice."
        actions={
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={openNew}>
            New customer
          </Button>
        }
      />

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customers by name"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
      </Card>

      {customers.isError ? (
        <ErrorState
          title="Customers could not load"
          description={getErrorMessage(customers.error)}
          action={
            <Button variant="secondary" onClick={() => void customers.refetch()}>
              Try again
            </Button>
          }
        />
      ) : customers.isLoading ? (
        <Card className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title={debouncedSearch ? 'No customers match that search' : 'No customers yet'}
          description={
            debouncedSearch
              ? 'Try a different name or clear the search.'
              : 'Add a customer once, then link them to invoices and keep their history in one place.'
          }
          icon={<Users className="h-5 w-5" />}
          action={
            debouncedSearch ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={openNew}>
                New customer
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {rows.map((customer) => (
              <div
                key={customer.id}
                className="flex items-start gap-3 p-4 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-800/30"
              >
                <Link
                  to={`/customers/${customer.id}`}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-100"
                  aria-label={`Open ${customer.name}`}
                >
                  {initials(customer.name)}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/customers/${customer.id}`}
                    className="block truncate text-sm font-semibold text-ink-900 hover:underline dark:text-white"
                  >
                    {customer.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
                    {customer.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {customer.phone}
                      </span>
                    ) : null}
                    {customer.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {customer.email}
                      </span>
                    ) : null}
                    {!customer.phone && !customer.email ? <span>No contact details</span> : null}
                    <span className="text-ink-400 dark:text-ink-500">
                      Added {formatDate(customer.created_at)}
                    </span>
                  </div>
                </div>
                <Menu items={menuItems(customer)} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <CustomerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        customer={editing}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Move customer to trash?"
        description={
          deleteTarget
            ? `${deleteTarget.name} will be hidden from your customer list. Existing invoices stay exactly as they are and keep their printed customer name.`
            : undefined
        }
        confirmLabel="Move to trash"
        destructive
        loading={deleteCustomer.isPending}
      />
    </div>
  )
}
