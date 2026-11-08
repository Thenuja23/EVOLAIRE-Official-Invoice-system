import { useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <EmptyState
      title="Page not found"
      description="The page you were looking for does not exist or has moved."
      icon={<Compass className="h-5 w-5" />}
      action={<Button onClick={() => navigate('/')}>Back to dashboard</Button>}
    />
  )
}
