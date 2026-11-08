import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { dashboardService } from '@/services/dashboardService'

export function useDashboard() {
  const metrics = useQuery({
    queryKey: queryKeys.dashboardMetrics,
    queryFn: () => dashboardService.metrics(),
  })

  const revenue = useQuery({
    queryKey: queryKeys.monthlyRevenue,
    queryFn: () => dashboardService.monthlyRevenue(),
  })

  const recent = useQuery({
    queryKey: queryKeys.dashboardRecent,
    queryFn: () => dashboardService.recentInvoices(6),
  })

  const overdue = useQuery({
    queryKey: queryKeys.dashboardOverdue,
    queryFn: () => dashboardService.overdueInvoices(5),
  })

  const upcoming = useQuery({
    queryKey: queryKeys.dashboardUpcoming,
    queryFn: () => dashboardService.upcomingInvoices(7, 5),
  })

  return { metrics, revenue, recent, overdue, upcoming }
}
